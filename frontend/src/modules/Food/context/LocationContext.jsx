import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Loader } from "@googlemaps/js-api-loader"
import { locationAPI, userAPI } from "@food/api"
import { useProfile } from "@food/context/ProfileContext"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
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
let googleMapsNamespacePromise = null

const debugError = (..._args) => {}
const cleanLocationDisplayLine = (value) => String(value || "").replace(/,\s*India\s*$/i, "").trim()

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

const shouldPreserveSavedSelection = () => {
  try {
    const mode = localStorage.getItem(DELIVERY_MODE_STORAGE_KEY) || "saved"
    const selectedAddressId = localStorage.getItem(SELECTED_ADDRESS_ID_STORAGE_KEY) || null
    return mode === "saved" && Boolean(selectedAddressId)
  } catch {
    return false
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

const getPositionFast = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"))
      return
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 300000, // 5 minutes cached
      }
    )
  })

const getPositionHighAccuracy = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"))
      return
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
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

const geometryPrecisionRank = (result) => {
  const type = result?.geometry?.location_type || result?.geometry?.locationType
  const order = {
    ROOFTOP: 0,
    RANGE_INTERPOLATED: 1,
    GEOMETRIC_CENTER: 2,
    APPROXIMATE: 3,
  }
  return order[type] ?? 4
}

const pickBestGoogleGeocodeResult = (results) => {
  if (!results?.length) return null

  const typeRank = (result) => {
    const types = result?.types || []
    if (types.includes("street_address")) return 0
    if (types.includes("premise")) return 1
    if (types.includes("point_of_interest") || types.includes("establishment")) return 2
    if (types.includes("subpremise")) return 3
    if (types.includes("route")) return 4
    if (types.some((type) => type.startsWith("sublocality"))) return 5
    if (types.includes("locality")) return 6
    return 10
  }

  let best = results[0]
  let bestGeometryRank = geometryPrecisionRank(best)
  let bestTypeRank = typeRank(best)

  for (const result of results.slice(1, 15)) {
    const nextGeometryRank = geometryPrecisionRank(result)
    const nextTypeRank = typeRank(result)
    if (
      nextGeometryRank < bestGeometryRank ||
      (nextGeometryRank === bestGeometryRank && nextTypeRank < bestTypeRank)
    ) {
      best = result
      bestGeometryRank = nextGeometryRank
      bestTypeRank = nextTypeRank
    }
  }

  return best
}

const parseGoogleGeocodeResult = (bestResult) => {
  if (!bestResult) {
    return {
      formattedAddress: "",
      city: "",
      state: "",
      area: "",
      street: "",
      streetNumber: "",
      postalCode: "",
      pointOfInterest: "",
      premise: "",
    }
  }

  let city = ""
  let state = ""
  let area = ""
  let street = ""
  let streetNumber = ""
  let postalCode = ""
  let pointOfInterest = ""
  let premise = ""
  let areaGranularity = -1

  const considerArea = (types, name) => {
    const normalized = String(name || "").trim()
    if (!normalized) return

    let score = -1
    if (types.includes("sublocality_level_3")) score = 6
    else if (types.includes("sublocality_level_2")) score = 5
    else if (types.includes("neighborhood")) score = 4
    else if (types.includes("sublocality_level_1")) score = 3
    else if (types.includes("sublocality")) score = 2
    else if (types.includes("colloquial_area")) score = 2

    if (score > areaGranularity) {
      areaGranularity = score
      area = normalized
    }
  }

  for (const component of bestResult.address_components || []) {
    const types = component.types || []
    if (types.includes("point_of_interest") && !pointOfInterest) pointOfInterest = component.long_name
    if (types.includes("premise") && !premise) premise = component.long_name
    if (types.includes("street_number") && !streetNumber) streetNumber = component.long_name
    if (types.includes("route") && !street) street = component.long_name
    if (types.includes("locality") && !city) city = component.long_name
    if (types.includes("administrative_area_level_1") && !state) state = component.long_name
    if (types.includes("postal_code") && !postalCode) postalCode = component.long_name
    considerArea(types, component.long_name)
  }

  return {
    formattedAddress: cleanLocationDisplayLine(bestResult.formatted_address || ""),
    city,
    state,
    area,
    street,
    streetNumber,
    postalCode,
    pointOfInterest,
    premise,
  }
}

const loadGoogleMapsNamespace = async () => {
  if (typeof window !== "undefined" && window.google?.maps?.Geocoder) {
    return window.google
  }

  if (!googleMapsNamespacePromise) {
    googleMapsNamespacePromise = (async () => {
      const apiKey = await getGoogleMapsApiKey()
      if (!apiKey) {
        throw new Error("Google Maps API key unavailable")
      }
      const loader = new Loader({ apiKey, version: "weekly" })
      return loader.load()
    })().catch((error) => {
      googleMapsNamespacePromise = null
      throw error
    })
  }

  return googleMapsNamespacePromise
}

const reverseGeocodeWithGoogleMaps = async (latitude, longitude) => {
  const googleNs = await loadGoogleMapsNamespace()
  return new Promise((resolve, reject) => {
    if (!googleNs?.maps?.Geocoder) {
      reject(new Error("Google geocoder unavailable"))
      return
    }

    const geocoder = new googleNs.maps.Geocoder()
    geocoder.geocode({ location: { lat: latitude, lng: longitude }, region: "in" }, (results, status) => {
      if (status === "OK" && results?.length) {
        resolve(parseGoogleGeocodeResult(pickBestGoogleGeocodeResult(results)))
        return
      }
      reject(new Error(`Google geocoder failed: ${status}`))
    })
  })
}

const reverseGeocode = async (latitude, longitude, sourceType = "gps") => {
  // Primary: Google geocoder for map-grade locality/street precision.
  try {
    const parsed = await reverseGeocodeWithGoogleMaps(latitude, longitude)
    const streetLine = [parsed.streetNumber, parsed.street].filter(Boolean).join(" ").trim()
    const pointOfInterest = parsed.pointOfInterest || parsed.premise || ""
    const displayName =
      parsed.formattedAddress ||
      [
        pointOfInterest,
        streetLine,
        parsed.area,
        parsed.city,
        parsed.state,
        parsed.postalCode,
      ]
        .filter(Boolean)
        .join(", ")

    const built = buildRichLocation({
      latitude,
      longitude,
      payload: {
        display_name: displayName,
        city: parsed.city,
        state: parsed.state,
        zipCode: parsed.postalCode,
        area: parsed.area,
        street: streetLine || parsed.street,
        additionalDetails: pointOfInterest,
        formattedAddress: displayName,
      },
      sourceType,
    })

    if (displayName) {
      built.formattedAddress = displayName
      built.address = displayName
      built.additionalDetails = displayName
    }

    if (built.formattedAddress) return built
  } catch {}

  // Fallback 1: backend reverse geocode (Nominatim via server-side proxy)
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

  // Fallback 2: Nominatim directly from the client (if backend is unreachable)
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
  const [locationStatus, setLocationStatus] = useState("idle") // idle, fetching, retrying, success, error
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
      const {
        skipDatabaseUpdate = false,
        allowStoredFallback = true,
        background = false,
      } = options
      const hasLockedSavedSelection = shouldPreserveSavedSelection()

      if (!background) setLoading(true)
      setError(null)
      if (!background) setLocationStatus("fetching")

      if (background && hasLockedSavedSelection) {
        const preservedLocation = readStoredLocation()
        if (preservedLocation) {
          return preservedLocation
        }
      }

      try {
        let position
        try {
          // Stage 1: Fast Location
          position = await getPositionFast()
        } catch (fastErr) {
          debugError("Fast location failed, trying high accuracy...", fastErr)
          setLocationStatus("retrying")
          // Stage 2: High Accuracy Retry
          position = await getPositionHighAccuracy()
        }

        const latitude = Number(position.coords.latitude)
        const longitude = Number(position.coords.longitude)
        const accuracy = Number(position.coords.accuracy)

        // Resolve coordinates immediately to unblock restaurant fetching
        const basicLocation = buildPreciseGpsFallbackLocation({
          latitude,
          longitude,
          accuracy,
          sourceType: "gps",
        })

        // Apply coordinates immediately
        await applyLocation(basicLocation, {
          mode: "current",
          selectedAddress: null,
          syncBackend: false, // Don't sync yet, wait for geocode if possible
        })

        if (!background) {
          setLocationStatus("success")
          setLoading(false) // Unblock UI loading state
        }

        // Background Reverse Geocoding - do not await
        reverseGeocode(latitude, longitude, "gps").then(async (refinedLocation) => {
          if (shouldPreserveSavedSelection()) {
            return
          }
          if (refinedLocation) {
            if (Number.isFinite(accuracy)) {
              refinedLocation.accuracy = accuracy
            }
            await applyLocation(refinedLocation, {
              mode: "current",
              selectedAddress: null,
              syncBackend: !skipDatabaseUpdate,
            })
          }
        }).catch((err) => {
          debugError("Background geocode failed:", err)
        })

        return basicLocation
      } catch (err) {
        if (!background) {
          setLocationStatus("error")
          let errorMsg = "Unable to fetch location. Please select location manually."
          if (err?.code === 1) errorMsg = "Location permission denied. Please select location manually."
          else if (err?.code === 3) errorMsg = "Location request timed out. Please select location manually."

          if (!allowStoredFallback) {
            setError(errorMsg)
            setLoading(false)
            throw new Error(errorMsg)
          }

          const fallbackLocation = readStoredLocation()
          if (fallbackLocation?.latitude && fallbackLocation?.longitude) {
            await applyLocation(fallbackLocation, {
              mode: getStoredMode(),
              selectedAddress: addresses.find(
                (item) => String(getAddressId(item)) === String(getStoredSelectedAddressId()),
              ),
              syncBackend: false,
            })
            setLoading(false)
            return fallbackLocation
          }

          setError(errorMsg)
          setLoading(false)
          throw new Error(errorMsg)
        }
      } finally {
        if (!background) setLoading(false)
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
    const preserveSavedSelection = shouldPreserveSavedSelection()
    const storedLocation = readStoredLocation()
    if (!forceFreshLocation && storedLocation?.latitude && storedLocation?.longitude) {
      setLocation(storedLocation)
      setPermissionGranted(true)
      setLoading(false)
      if (!preserveSavedSelection) {
        // Refresh in background only when current GPS mode is active.
        requestLocation({ background: true }).catch(() => {})
      }
    }
    if (forceFreshLocation && isAuthenticated() && !preserveSavedSelection) {
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
      const preserveSavedSelection = shouldPreserveSavedSelection()
      wasAuthenticatedRef.current = authenticatedNow

      if (authenticatedNow && !wasAuthenticated && !preserveSavedSelection) {
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
      locationStatus,
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
      locationStatus,
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
