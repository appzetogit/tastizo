import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { locationAPI, userAPI } from "@food/api"
import { useProfile } from "@food/context/ProfileContext"
import {
  DELIVERY_MODE_STORAGE_KEY,
  LOCATION_STATE_EVENT,
  LOCATION_STORAGE_KEY,
  SELECTED_ADDRESS_ID_STORAGE_KEY,
  addressToLocationState,
  emitLocationStateChange,
  formatAddressLine,
  getAddressCoordinates,
  getAddressId,
  readStoredLocation,
  writeStoredLocation,
} from "@food/utils/address"

const LocationContext = createContext(null)
const FORCE_FRESH_LOCATION_SESSION_KEY = "user_force_fresh_location"

const debugError = (..._args) => {}

const isAuthenticated = () => {
  try {
    return Boolean(localStorage.getItem("user_accessToken") || localStorage.getItem("user_authenticated") === "true")
  } catch {
    return false
  }
}

const getStoredMode = () => {
  try {
    return localStorage.getItem(DELIVERY_MODE_STORAGE_KEY) || "saved"
  } catch {
    return "saved"
  }
}

const getStoredSelectedAddressId = () => {
  try {
    return localStorage.getItem(SELECTED_ADDRESS_ID_STORAGE_KEY) || null
  } catch {
    return null
  }
}

const shouldForceFreshLocationOnBoot = () => {
  try {
    return sessionStorage.getItem(FORCE_FRESH_LOCATION_SESSION_KEY) === "true"
  } catch {
    return false
  }
}

const clearFreshLocationBootFlag = () => {
  try {
    sessionStorage.removeItem(FORCE_FRESH_LOCATION_SESSION_KEY)
  } catch {
    // no-op
  }
}

const getPositionWithRetry = (forceFresh = true, options = {}, retryCount = 0) =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"))
      return
    }

    const effectiveOptions = {
      ...options,
      maximumAge: forceFresh ? 0 : (options.maximumAge || 60000),
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(position)
      },
      (error) => {
        // On timeout, retry with a longer timeout but KEEP high accuracy
        if (error?.code === 3 && retryCount === 0) {
          getPositionWithRetry(
            forceFresh,
            {
              enableHighAccuracy: true, // always keep high accuracy
              timeout: 20000,
              maximumAge: 0,
            },
            1,
          )
            .then(resolve)
            .catch(reject)
          return
        }

        reject(error)
      },
      effectiveOptions,
    )
  })

const getPreciseFreshPosition = (options = {}) =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"))
      return
    }

    const targetAccuracy = Number(options.targetAccuracy) || 20  // 20m for high-precision GPS
    const watchWindowMs = Number(options.watchWindowMs) || 15000  // 15s watch window
    const maxWaitMs = Number(options.maxWaitMs) || 40000          // 40s hard cap
    const geoOptions = {
      enableHighAccuracy: true,   // always force GPS chip
      timeout: maxWaitMs,
      maximumAge: 0,              // never use cached position
      ...options,
    }

    let settled = false
    let watchId = null
    let bestPosition = null
    let bestAccuracy = Number.POSITIVE_INFINITY
    let resolveTimer = null
    let hardTimeout = null

    const finish = (position, error = null) => {
      if (settled) return
      settled = true
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId)
      }
      if (resolveTimer) clearTimeout(resolveTimer)
      if (hardTimeout) clearTimeout(hardTimeout)

      if (position) {
        resolve(position)
        return
      }
      reject(error || new Error("Unable to fetch precise location"))
    }

    const considerPosition = (position) => {
      const accuracy = Number(position?.coords?.accuracy)
      if (!Number.isFinite(accuracy)) {
        if (!bestPosition) bestPosition = position
        return
      }

      if (!bestPosition || accuracy < bestAccuracy) {
        bestPosition = position
        bestAccuracy = accuracy
      }

      // Resolve early if we hit the target accuracy
      if (accuracy <= targetAccuracy) {
        finish(position)
      }
    }

    hardTimeout = setTimeout(() => {
      finish(bestPosition, new Error("Precise location timeout"))
    }, maxWaitMs)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        considerPosition(position)
        if (settled) return

        // Keep watching for more accurate fixes during the watch window
        resolveTimer = setTimeout(() => {
          finish(bestPosition)
        }, watchWindowMs)

        watchId = navigator.geolocation.watchPosition(
          (nextPosition) => {
            considerPosition(nextPosition)
          },
          () => {
            finish(bestPosition)
          },
          geoOptions,
        )
      },
      (error) => {
        reject(error)
      },
      geoOptions,
    )
  })

const buildRichLocation = ({ latitude, longitude, payload = {}, sourceType = "gps" }) => {
  const address = payload?.address || {}
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    payload.city ||
    ""
  const state = address.state || payload.state || ""
  const zipCode = address.postcode || payload.zipCode || ""
  const street = [
    address.house_number,
    address.road || address.pedestrian || address.footway || payload.street,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
  const locality =
    address.suburb ||
    address.neighbourhood ||
    address.residential ||
    address.quarter ||
    address.hamlet ||
    payload.area ||
    ""
  const additionalDetails = payload.additionalDetails || ""
  const formattedAddress =
    String(payload.display_name || payload.formattedAddress || "").trim() ||
    [
      additionalDetails,
      street,
      locality,
      city,
      state,
      zipCode,
    ]
      .filter(Boolean)
      .join(", ")

  return {
    label: payload.label || "",
    street,
    additionalDetails,
    area: locality || additionalDetails || street,
    city,
    state,
    zipCode,
    latitude,
    longitude,
    accuracy: Number(payload.accuracy) || null,
    address: formattedAddress,
    formattedAddress,
    sourceType,
  }
}

const buildPreciseGpsFallbackLocation = ({ latitude, longitude, accuracy = null, sourceType = "gps" }) => {
  const safeLatitude = Number(latitude)
  const safeLongitude = Number(longitude)
  const coordLabel = `${safeLatitude.toFixed(8)}, ${safeLongitude.toFixed(8)}`

  return {
    label: "",
    street: "",
    additionalDetails: coordLabel,
    area: "Current location",
    city: "",
    state: "",
    zipCode: "",
    latitude: safeLatitude,
    longitude: safeLongitude,
    accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    address: coordLabel,
    formattedAddress: coordLabel,
    sourceType,
  }
}

const reverseGeocode = async (latitude, longitude, sourceType = "gps") => {
  // Primary: backend reverse geocode (Nominatim via server-side proxy)
  try {
    const response = await locationAPI.reverseGeocode(latitude, longitude, { force: true })
    const raw = response?.data?.data
    const result = Array.isArray(raw?.results) ? raw.results[0] : raw
    const addr = result?.address_components || {}

    // Nominatim display_name is the most precise full address e.g. "26, Nagwa Lanka, Varanasi, Uttar Pradesh 221005"
    const displayName = String(result?.formatted_address || "").replace(/,\s*India\s*$/i, "").trim()

    // Extract all fine-grained Nominatim components
    const houseNumber = addr.house_number || ""
    const road       = addr.road || addr.pedestrian || addr.footway || addr.path || ""
    const building   = addr.building || addr.amenity || ""
    const area       = addr.neighbourhood || addr.suburb || addr.residential || addr.quarter || addr.city_district || ""
    const city       = addr.city || addr.town || addr.village || addr.municipality || addr.county || ""
    const state      = addr.state || ""
    const postcode   = addr.postcode || ""

    // Precise street line e.g. "26 Nagwa Lanka"
    const streetLine = [houseNumber, road].filter(Boolean).join(" ").trim()

    const built = buildRichLocation({
      latitude,
      longitude,
      payload: {
        display_name: displayName,
        address: addr,
        city,
        state,
        zipCode: postcode,
        area,
        street: streetLine || road,
        building,
        formattedAddress: displayName,
      },
      sourceType,
    })

    // Always prefer the Nominatim display_name — it's the exact street-level address
    if (displayName) {
      built.formattedAddress = displayName
      built.address          = displayName
      built.additionalDetails = displayName
    }

    if (built.formattedAddress) return built
  } catch {}

  // Fallback 1: Nominatim directly from the client (if backend is unreachable)
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&zoom=18&accept-language=en`,
      { headers: { "User-Agent": "Tastizo-App/1.0" } },
    )
    const data = await resp.json()
    if (data && !data.error) {
      const addr        = data.address || {}
      const houseNumber = addr.house_number || ""
      const road        = addr.road || addr.pedestrian || addr.footway || ""
      const area        = addr.neighbourhood || addr.suburb || addr.residential || addr.quarter || ""
      const city        = addr.city || addr.town || addr.village || addr.municipality || addr.county || ""
      const state       = addr.state || ""
      const postcode    = addr.postcode || ""
      const streetLine  = [houseNumber, road].filter(Boolean).join(" ").trim()
      const displayName = String(data.display_name || "").replace(/,\s*India\s*$/i, "").trim()

      const built = buildRichLocation({
        latitude,
        longitude,
        payload: {
          display_name: displayName,
          address: addr,
          city,
          state,
          zipCode: postcode,
          area,
          street: streetLine || road,
          formattedAddress: displayName,
        },
        sourceType,
      })
      if (displayName) {
        built.formattedAddress  = displayName
        built.address           = displayName
        built.additionalDetails = displayName
      }
      if (built.formattedAddress) return built
    }
  } catch {}

  // Fallback 2: BigDataCloud — city-level only, last resort
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
    )
    const data = await response.json()
    return buildRichLocation({
      latitude,
      longitude,
      payload: {
        display_name: data?.formattedAddress || "",
        area: data?.locality || data?.principalSubdivision || "",
        city: data?.city || data?.locality || "",
        state: data?.principalSubdivision || "",
        zipCode: data?.postcode || "",
      },
      sourceType,
    })
  } catch {
    return null
  }
}

const syncLocationStorage = (location, mode, selectedAddressId = null) => {
  writeStoredLocation(location)
  localStorage.setItem(DELIVERY_MODE_STORAGE_KEY, mode)
  if (selectedAddressId) {
    localStorage.setItem(SELECTED_ADDRESS_ID_STORAGE_KEY, String(selectedAddressId))
  } else {
    localStorage.removeItem(SELECTED_ADDRESS_ID_STORAGE_KEY)
  }
  emitLocationStateChange({ location, mode, selectedAddressId })
}

export function LocationProvider({ children }) {
  const { addresses, getDefaultAddress, setDefaultAddress, addAddress } = useProfile()
  const [location, setLocation] = useState(() => {
    if (shouldForceFreshLocationOnBoot()) return null
    return readStoredLocation()
  })
  const [loading, setLoading] = useState(() => {
    if (shouldForceFreshLocationOnBoot()) return true
    return !readStoredLocation()
  })
  const [error, setError] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(() => {
    if (shouldForceFreshLocationOnBoot()) return false
    return Boolean(readStoredLocation()?.latitude)
  })
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(getStoredMode)
  const [selectedAddressId, setSelectedAddressId] = useState(getStoredSelectedAddressId)
  const wasAuthenticatedRef = useRef(isAuthenticated())

  const hydrateBackendLocation = useCallback(async () => {
    if (!isAuthenticated()) return null
    try {
      const response = await userAPI.getLocation()
      const backendLocation = response?.data?.data?.location || response?.data?.location || null
      if (backendLocation?.latitude && backendLocation?.longitude) {
        // Only hydrate from backend when there is no valid local location yet.
        // This prevents overwriting a freshly selected address or GPS fix with
        // stale backend data (e.g. from a previous session or different device).
        setLocation((current) => {
          if (
            current &&
            Number.isFinite(current.latitude) &&
            Number.isFinite(current.longitude)
          ) {
            return current
          }
          syncLocationStorage(backendLocation, getStoredMode(), getStoredSelectedAddressId())
          return backendLocation
        })
        setPermissionGranted(true)
        return backendLocation
      }
    } catch {
      return null
    }
    return null
  }, [])

  const syncBackendLocation = useCallback(async (nextLocation) => {
    if (!nextLocation?.latitude || !nextLocation?.longitude || !isAuthenticated()) return
    try {
      await userAPI.updateLocation(nextLocation)
    } catch (err) {
      debugError("Failed to sync location", err)
    }
  }, [])

  const applyLocation = useCallback(
    async (nextLocation, { mode = "current", selectedAddress = null, syncBackend = true } = {}) => {
      if (!nextLocation) return null
      const selectedId = selectedAddress ? getAddressId(selectedAddress) : null
      setLocation(nextLocation)
      setError(null)
      setDeliveryAddressMode(mode)
      setSelectedAddressId(selectedId ? String(selectedId) : null)
      setPermissionGranted(Boolean(nextLocation.latitude && nextLocation.longitude))
      syncLocationStorage(nextLocation, mode, selectedId)
      if (syncBackend) {
        await syncBackendLocation(nextLocation)
      }
      return nextLocation
    },
    [syncBackendLocation],
  )

  const requestLocation = useCallback(
    async (options = {}) => {
      const { skipDatabaseUpdate = false } = options
      setLoading(true)
      setError(null)
      try {
        const position = await getPreciseFreshPosition({
          timeout: 40000,
          maximumAge: 0,          // never use cached GPS
          targetAccuracy: 20,     // aim for ≤20m accuracy (GPS chip level)
          watchWindowMs: 15000,   // watch for 15s to refine fix
          maxWaitMs: 40000,
        }).catch(() =>
          getPositionWithRetry(true, {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0,
          }),
        )
        const latitude = Number(position.coords.latitude)
        const longitude = Number(position.coords.longitude)
        const accuracy = Number(position.coords.accuracy)
        const geocoded = await reverseGeocode(latitude, longitude, "gps")
        const refinedLocation =
          geocoded ||
          buildPreciseGpsFallbackLocation({
            latitude,
            longitude,
            accuracy,
            sourceType: "gps",
          })

        if (Number.isFinite(accuracy)) {
          refinedLocation.accuracy = accuracy
        }

        if (!refinedLocation?.formattedAddress) {
          refinedLocation.formattedAddress = `${latitude.toFixed(8)}, ${longitude.toFixed(8)}`
          refinedLocation.address = refinedLocation.formattedAddress
          refinedLocation.additionalDetails =
            refinedLocation.additionalDetails || refinedLocation.formattedAddress
        }

        await applyLocation(refinedLocation, {
          mode: "current",
          selectedAddress: null,
          syncBackend: !skipDatabaseUpdate,
        })
        return refinedLocation
      } catch (err) {
        const fallbackLocation = readStoredLocation()
        if (fallbackLocation?.latitude && fallbackLocation?.longitude) {
          await applyLocation(fallbackLocation, {
            mode: getStoredMode(),
            selectedAddress: addresses.find(
              (item) => String(getAddressId(item)) === String(getStoredSelectedAddressId()),
            ),
            syncBackend: false,
          })
          return fallbackLocation
        }
        setError(err?.message || "Unable to fetch location")
        throw err
      } finally {
        setLoading(false)
      }
    },
    [addresses, applyLocation],
  )

  const selectSavedAddress = useCallback(
    async (addressOrId) => {
      const selected =
        typeof addressOrId === "object"
          ? addressOrId
          : addresses.find((item) => String(getAddressId(item)) === String(addressOrId))

      if (!selected) return null
      const selectedId = getAddressId(selected)
      if (selectedId) {
        await setDefaultAddress(selectedId)
      }
      const nextLocation = addressToLocationState(selected, "saved")
      if (!nextLocation) return null
      await applyLocation(nextLocation, { mode: "saved", selectedAddress: selected, syncBackend: true })
      return nextLocation
    },
    [addresses, applyLocation, setDefaultAddress],
  )

  const saveAddressFromLocation = useCallback(
    async (payload, { makeDefault = true } = {}) => {
      const createdAddress = await addAddress({
        ...payload,
        formattedAddress: formatAddressLine(payload),
      })
      if (!createdAddress) return null
      if (makeDefault) {
        await selectSavedAddress(createdAddress)
      }
      return createdAddress
    },
    [addAddress, selectSavedAddress],
  )

  useEffect(() => {
    const forceFreshLocation = shouldForceFreshLocationOnBoot()
    const storedLocation = readStoredLocation()
    if (!forceFreshLocation && storedLocation?.latitude && storedLocation?.longitude) {
      setLocation(storedLocation)
      setPermissionGranted(true)
      setLoading(false)
    }
    if (forceFreshLocation && isAuthenticated()) {
      requestLocation()
        .catch(() => hydrateBackendLocation())
        .finally(() => {
          clearFreshLocationBootFlag()
          setLoading(false)
        })
      return
    }
    hydrateBackendLocation()
      .finally(() => {
        clearFreshLocationBootFlag()
        setLoading(false)
      })
  }, [hydrateBackendLocation, requestLocation])

  useEffect(() => {
    const syncFromEvent = (event) => {
      if (event?.detail && Object.prototype.hasOwnProperty.call(event.detail, "location")) {
        setLocation(event.detail.location || null)
      } else {
        const nextLocation = readStoredLocation()
        if (nextLocation) setLocation(nextLocation)
      }
      setDeliveryAddressMode(getStoredMode())
      setSelectedAddressId(getStoredSelectedAddressId())
    }

    window.addEventListener(LOCATION_STATE_EVENT, syncFromEvent)
    const handleAuthChange = async () => {
      const authenticatedNow = isAuthenticated()
      const wasAuthenticated = wasAuthenticatedRef.current
      wasAuthenticatedRef.current = authenticatedNow

      if (authenticatedNow && !wasAuthenticated) {
        try {
          await requestLocation()
          return
        } catch {
          await hydrateBackendLocation()
          return
        }
      }

      if (!authenticatedNow) {
        setPermissionGranted(Boolean(readStoredLocation()?.latitude))
        return
      }

      await hydrateBackendLocation()
    }

    window.addEventListener("userAuthChanged", handleAuthChange)
    return () => {
      window.removeEventListener(LOCATION_STATE_EVENT, syncFromEvent)
      window.removeEventListener("userAuthChanged", handleAuthChange)
    }
  }, [hydrateBackendLocation, requestLocation])

  useEffect(() => {
    if (deliveryAddressMode !== "saved" || selectedAddressId) return
    const defaultAddress = getDefaultAddress()
    if (!defaultAddress) return
    const nextLocation = addressToLocationState(defaultAddress, "saved")
    if (!nextLocation) return
    setLocation((current) => current || nextLocation)
  }, [deliveryAddressMode, selectedAddressId, getDefaultAddress])

  const value = useMemo(
    () => ({
      location,
      loading,
      error,
      permissionGranted,
      deliveryAddressMode,
      selectedAddressId,
      requestLocation,
      selectSavedAddress,
      saveAddressFromLocation,
      setLocationState: applyLocation,
    }),
    [
      location,
      loading,
      error,
      permissionGranted,
      deliveryAddressMode,
      selectedAddressId,
      requestLocation,
      selectSavedAddress,
      saveAddressFromLocation,
      applyLocation,
    ],
  )

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useSharedLocation() {
  const context = useContext(LocationContext)
  if (!context) {
    throw new Error("useSharedLocation must be used within LocationProvider")
  }
  return context
}
