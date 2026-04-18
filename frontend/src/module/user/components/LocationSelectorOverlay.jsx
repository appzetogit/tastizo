import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, Search, ChevronRight, Plus, MapPin, MoreHorizontal, Navigation, Home, Building2, Briefcase, Phone, X, Crosshair } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useLocation as useGeoLocation } from "../hooks/useLocation"
import { useProfile } from "../context/ProfileContext"
import { useCart } from "../context/CartContext"
import { toast } from "sonner"
import { locationAPI, userAPI, zoneAPI } from "@/lib/api"
import {
  isUnpersistableLocation,
  dedupeFormattedAddressLine,
  stripLeadingPlusCodeFromFormatted,
  isLikelyPlusCodeOnlySegment,
} from "@/lib/userLocationDisplay"
import { Loader } from '@googlemaps/js-api-loader'
import ReplaceCartModal from "./ReplaceCartModal"

function cleanLocationDisplayLine(str) {
  if (!str || typeof str !== "string") return ""
  const t = str.trim().replace(/,\s*India\s*$/i, "")
  if (!t) return ""
  if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(t)) return t
  return dedupeFormattedAddressLine(stripLeadingPlusCodeFromFormatted(t))
}

// Google Maps implementation - Leaflet components removed

// Google Maps implementation - removed Leaflet components

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

function stripTrailingIndia(s) {
  if (!s || typeof s !== "string") return ""
  return s.replace(/,\s*India\s*$/i, "").trim()
}

function getStoredUserZoneId() {
  if (typeof window === "undefined") return null
  return window.localStorage?.getItem("userZoneId") || null
}

function getZoneDisplayName(zone) {
  return zone?.name || zone?.zoneName || zone?.area || "Selected location"
}

/** Build one-line summary from backend reverse-geocode result (same shape as useLocation). */
function formattedLineFromReverseResult(result) {
  if (!result) return ""
  const raw = (result.formatted_address || "").trim()
  if (raw) return stripTrailingIndia(raw)
  const ac = result.address_components || {}
  const parts = [
    ac.building,
    ac.road,
    ac.area || ac.neighbourhood || ac.suburb,
    ac.city,
    ac.state,
    ac.postcode,
  ]
    .map((p) => (p || "").trim())
    .filter(Boolean)
  return parts.join(", ")
}

/** Google Geocoder: prefer rooftop / interpolated over approximate centroid (more exact pin). */
function geometryPrecisionRank(r) {
  const t = r?.geometry?.location_type || r?.geometry?.locationType
  const order = {
    ROOFTOP: 0,
    RANGE_INTERPOLATED: 1,
    GEOMETRIC_CENTER: 2,
    APPROXIMATE: 3,
  }
  return order[t] ?? 4
}

function pickBestGoogleGeocodeResult(results) {
  if (!results?.length) return null
  const typeRank = (r) => {
    const types = r.types || []
    if (types.includes("street_address")) return 0
    if (types.includes("premise")) return 1
    if (types.includes("point_of_interest") || types.includes("establishment")) return 2
    if (types.includes("subpremise")) return 3
    if (types.includes("route")) return 4
    if (types.some((t) => t.startsWith("sublocality"))) return 5
    if (types.includes("locality")) return 6
    return 10
  }
  let best = results[0]
  let bestGeo = geometryPrecisionRank(best)
  let bestType = typeRank(best)
  for (const r of results.slice(0, 15)) {
    const g = geometryPrecisionRank(r)
    const t = typeRank(r)
    if (g < bestGeo || (g === bestGeo && t < bestType)) {
      best = r
      bestGeo = g
      bestType = t
    }
  }
  return best
}

function parseGoogleGeocodeResult(bestResult) {
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
    const n = (name || "").trim()
    if (!n) return
    let sc = -1
    if (types.includes("sublocality_level_3")) sc = 6
    else if (types.includes("sublocality_level_2")) sc = 5
    else if (types.includes("neighborhood")) sc = 4
    else if (types.includes("sublocality_level_1")) sc = 3
    else if (types.includes("sublocality")) sc = 2
    else if (types.includes("colloquial_area")) sc = 2
    if (sc > areaGranularity) {
      areaGranularity = sc
      area = n
    }
  }
  for (const component of bestResult.address_components || []) {
    const types = component.types || []
    if (types.includes("point_of_interest") && !pointOfInterest) pointOfInterest = component.long_name
    if (types.includes("premise") && !premise) premise = component.long_name
    if (types.includes("street_number") && !streetNumber) streetNumber = component.long_name
    if (types.includes("route") && !street) street = component.long_name
    considerArea(types, component.long_name)
    if (types.includes("locality") && !city) city = component.long_name
    if (types.includes("administrative_area_level_1") && !state) state = component.long_name
    if (types.includes("postal_code") && !postalCode) postalCode = component.long_name
  }
  const rawFormatted = (bestResult.formatted_address || "").trim()
  return {
    formattedAddress: cleanLocationDisplayLine(rawFormatted),
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

function raceWithTimeout(promise, ms, errorTag = "TIMEOUT") {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(errorTag)), ms)
    promise
      .then((v) => {
        clearTimeout(tid)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(tid)
        reject(e)
      })
  })
}

function geocodeLatLngWithGoogleMaps(googleNs, lat, lng) {
  const inner = new Promise((resolve, reject) => {
    if (!googleNs?.maps?.Geocoder) {
      reject(new Error("Geocoder unavailable"))
      return
    }
    const geocoder = new googleNs.maps.Geocoder()
    geocoder.geocode({ location: { lat, lng }, region: "in" }, (results, status) => {
      if (status === "OK" && results?.length) {
        const best = pickBestGoogleGeocodeResult(results)
        resolve(parseGoogleGeocodeResult(best))
      } else {
        reject(new Error(`Geocoder: ${status}`))
      }
    })
  })
  return raceWithTimeout(inner, 12000, "GEOCODE_JS_TIMEOUT")
}

async function geocodeLatLngGoogleRest(lat, lng, apiKey) {
  if (!apiKey) throw new Error("Missing Google Maps API key")
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}&language=en&region=in`
  const controller = new AbortController()
  const geocodeResponse = await raceWithTimeout(
    fetch(url, { signal: controller.signal }),
    10000,
    "GEOCODE_REST_TIMEOUT",
  ).catch((e) => {
    controller.abort()
    throw e
  })
  const geocodeData = await geocodeResponse.json()
  if (geocodeData.status !== "OK" || !geocodeData.results?.length) {
    throw new Error(geocodeData.error_message || geocodeData.status || "Geocode failed")
  }
  const best = pickBestGoogleGeocodeResult(geocodeData.results)
  return parseGoogleGeocodeResult(best)
}

/** Prefer Maps JS → Geocoding REST (same key as map) → caller may fall back to backend. */
async function reverseGeocodeWithGoogleMapsPrefer(lat, lng, googleMapsApiKeyState) {
  const g =
    typeof window !== "undefined" && window.google?.maps?.Geocoder ? window.google : null
  if (g) {
    return geocodeLatLngWithGoogleMaps(g, lat, lng)
  }
  let key = googleMapsApiKeyState
  if (!key) {
    const mod = await import("@/lib/utils/googleMapsApiKey.js")
    key = await mod.getGoogleMapsApiKey()
  }
  if (key) {
    return geocodeLatLngGoogleRest(lat, lng, key)
  }
  throw new Error("No Google Maps API key")
}

function lineFromGoogleParsed(p) {
  const s = stripTrailingIndia((p.formattedAddress || "").trim())
  if (s) return s
  const parts = [
    p.pointOfInterest,
    p.premise,
    p.streetNumber && p.street ? `${p.streetNumber} ${p.street}` : p.street,
    p.area,
    p.city,
    p.state,
    p.postalCode,
  ].filter(Boolean)
  return parts.join(", ")
}

export default function LocationSelectorOverlay({ isOpen, onClose }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const addressFormSearchRef = useRef(null) // Search input in "Select delivery location" form - for focus and Places Autocomplete
  const [searchValue, setSearchValue] = useState("")
  const { location, loading, requestLocation } = useGeoLocation()
  const { addresses = [], addAddress, setDefaultAddress, userProfile } = useProfile()
  const { cart, itemCount, clearCart } = useCart()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
    phone: "",
  })
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  const greenMarkerRef = useRef(null) // Green marker for address selection
  const placesAutocompleteRef = useRef(null)
  const googleMapsApiRef = useRef(null)
  const autocompleteServiceRef = useRef(null)
  const placesServiceRef = useRef(null)
  const placePredictionsDebounceRef = useRef(null)
  const [placeSuggestions, setPlaceSuggestions] = useState([])
  const [placeSuggestionsLoading, setPlaceSuggestionsLoading] = useState(false)
  const blueDotCircleRef = useRef(null) // Blue dot circle for Google Maps
  const userLocationMarkerRef = useRef(null) // Blue dot marker for user location
  const userLocationAccuracyCircleRef = useRef(null) // Accuracy circle for MapLibre/Mapbox
  const watchPositionIdRef = useRef(null) // Geolocation watchPosition ID
  const lastUserLocationRef = useRef(null) // Last user location for tracking
  const locationUpdateTimeoutRef = useRef(null) // Timeout for location updates
  const [currentAddress, setCurrentAddress] = useState("")
  const [selectedPlaceAddress, setSelectedPlaceAddress] = useState("") // Full address from dropdown selection (shown in Delivery details)
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  const [googleMapsAuthFailed, setGoogleMapsAuthFailed] = useState(false)
  const [pendingLocationChange, setPendingLocationChange] = useState(null)
  const pendingLocationApplyRef = useRef(null)
  /** Live GPS line for "Use current location" subtitle (not DB/saved Home). */
  const [gpsLiveLine, setGpsLiveLine] = useState("")
  /** idle = show saved/context address; no auto GPS on open (avoids "Detecting…" every time). */
  const [gpsLiveStatus, setGpsLiveStatus] = useState("idle") // idle | loading | ok | denied | error | unsupported

  // Decide where to send user after closing this overlay.
  // If a page (like Cart) stored a custom return path in localStorage,
  // prefer that; otherwise, default to home ("/").
  const navigateAfterClose = (fallbackPath = "/") => {
    let targetPath = fallbackPath
    try {
      const stored = localStorage.getItem("locationReturnPath")
      if (stored && typeof stored === "string" && stored.trim() !== "") {
        targetPath = stored
      }
      // Clear once used so it doesn't affect future opens
      localStorage.removeItem("locationReturnPath")
    } catch {
      // ignore storage errors
    }
    navigate(targetPath)
  }

  const clearPendingLocationChange = useCallback(() => {
    pendingLocationApplyRef.current = null
    setPendingLocationChange(null)
  }, [])

  const maybeConfirmLocationChange = useCallback(
    async ({ locationData, latitude, longitude, applyChange }) => {
      const nextLat = Number(latitude)
      const nextLng = Number(longitude)
      const currentZoneId = getStoredUserZoneId()
      const hasCartItems = cart.length > 0 && itemCount > 0

      if (!hasCartItems || !currentZoneId || !Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
        await applyChange()
        return true
      }

      try {
        const response = await zoneAPI.detectZone(nextLat, nextLng)
        const data = response?.data?.data || {}
        const nextZoneId = data?.zoneId || null
        const nextZone =
          data?.status === "IN_SERVICE" && nextZoneId
            ? { ...(data.zone || {}), _id: nextZoneId }
            : null

        if (nextZoneId && nextZoneId !== currentZoneId) {
          pendingLocationApplyRef.current = applyChange
          setPendingLocationChange({
            cartRestaurantName: cart[0]?.restaurant || "Restaurant",
            itemCount,
            currentZoneName: getZoneDisplayName(nextZone),
            currentAddress:
              locationData?.formattedAddress ||
              locationData?.address ||
              currentAddress ||
              "Selected location",
          })
          return false
        }
      } catch (error) {
        console.warn("Failed to detect zone before applying location change:", error)
      }

      await applyChange()
      return true
    },
    [cart, currentAddress, itemCount],
  )

  const handleConfirmPendingLocationChange = useCallback(async () => {
    const applyChange = pendingLocationApplyRef.current
    clearPendingLocationChange()
    clearCart()
    if (applyChange) {
      await applyChange()
    }
  }, [clearCart, clearPendingLocationChange])

  const handleCancelPendingLocationChange = useCallback(() => {
    clearPendingLocationChange()
  }, [clearPendingLocationChange])

  // When opened from cart with a preferred label (Home/Office/Other),
  // initialize the address form with that label if present.
  useEffect(() => {
    if (!isOpen) return
    try {
      const preferredLabel = localStorage.getItem("preferredAddressLabel")
      if (preferredLabel) {
        setAddressFormData((prev) => ({
          ...prev,
          label: preferredLabel,
        }))
        // Clear after using once
        localStorage.removeItem("preferredAddressLabel")
      }
    } catch {
      // ignore storage errors
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) return
    clearPendingLocationChange()
  }, [clearPendingLocationChange, isOpen])

  // Load Google Maps API key from backend
  useEffect(() => {
    import('@/lib/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])

  // Detect Google Maps auth failures (invalid key, billing disabled, referrer restrictions)
  useEffect(() => {
    const sync = () => {
      setGoogleMapsAuthFailed(!!window.__googleMapsAuthFailed)
    }
    sync()
    const onFail = () => sync()
    window.addEventListener("googleMapsAuthFailure", onFail)
    return () => window.removeEventListener("googleMapsAuthFailure", onFail)
  }, [])
  const reverseGeocodeTimeoutRef = useRef(null) // Debounce timeout for reverse geocoding
  const lastReverseGeocodeCoordsRef = useRef(null) // Track last coordinates to avoid duplicate calls

  const teardownAddressMap = useCallback(() => {
    try {
      if (watchPositionIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current)
      }
    } catch {
      // ignore
    }
    watchPositionIdRef.current = null

    try {
      if (googleMapsApiRef.current?.maps?.event) {
        if (greenMarkerRef.current) googleMapsApiRef.current.maps.event.clearInstanceListeners(greenMarkerRef.current)
        if (googleMapRef.current) googleMapsApiRef.current.maps.event.clearInstanceListeners(googleMapRef.current)
      }
    } catch {
      // ignore
    }

    try {
      if (greenMarkerRef.current?.setMap) greenMarkerRef.current.setMap(null)
    } catch {
      // ignore
    }
    try {
      if (userLocationMarkerRef.current?.setMap) userLocationMarkerRef.current.setMap(null)
    } catch {
      // ignore
    }
    try {
      if (blueDotCircleRef.current?.setMap) blueDotCircleRef.current.setMap(null)
    } catch {
      // ignore
    }
    try {
      if (userLocationAccuracyCircleRef.current?.setMap) userLocationAccuracyCircleRef.current.setMap(null)
    } catch {
      // ignore
    }

    greenMarkerRef.current = null
    userLocationMarkerRef.current = null
    blueDotCircleRef.current = null
    userLocationAccuracyCircleRef.current = null
    googleMapRef.current = null

    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = ""
    }
  }, [])

  // Debug: Log API key status (only first few characters for security)
  useEffect(() => {
    if (GOOGLE_MAPS_API_KEY) {
      console.log("✅ Google Maps API Key loaded:", GOOGLE_MAPS_API_KEY.substring(0, 10) + "...")
    } else {
      console.warn("⚠️ Google Maps API Key NOT found! Please set it in ENV Setup.")
    }
  }, [GOOGLE_MAPS_API_KEY])

  // Current location display - Show complete formatted address (SAVED ADDRESSES FORMAT)
  // Format should match saved addresses: "B2/4, Gandhi Park Colony, Anand Nagar, Indore, Madhya Pradesh, 452001"
  // Show ALL parts of formattedAddress (like saved addresses show all parts)
  const currentLocationText = (() => {
    const partCnt = (s) =>
      (s || "").split(",").map((x) => x.trim()).filter(Boolean).length

    // Fresh "Use current location" line — beats hook/localStorage heuristics so UI updates immediately
    if (
      gpsLiveLine &&
      (gpsLiveStatus === "ok" || gpsLiveStatus === "loading")
    ) {
      return cleanLocationDisplayLine(gpsLiveLine)
    }

    // Priority 0: Use currentAddress from map (most up-to-date when user selects location on map)
    // This is updated when map moves or "Use current location" is clicked
    if (currentAddress &&
      currentAddress !== "Select location" &&
      !currentAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      // Remove "India" from the end if present
      let fullAddress = currentAddress
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      return cleanLocationDisplayLine(fullAddress)
    }

    // Priority 1: Use addressFormData.additionalDetails (updated when map moves)
    // This contains the full formatted address from Google Maps Places API
    if (addressFormData.additionalDetails &&
      addressFormData.additionalDetails !== "Select location" &&
      addressFormData.additionalDetails.trim() !== "") {
      let fullAddress = addressFormData.additionalDetails
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      const faNorm = fullAddress.toLowerCase()
      const extras = []
      const pushIfMissing = (s) => {
        const t = (s || "").trim()
        if (!t) return
        if (faNorm.includes(t.toLowerCase())) return
        extras.push(t)
      }
      pushIfMissing(addressFormData.city)
      if (addressFormData.state && addressFormData.zipCode) {
        const st = `${addressFormData.state} ${addressFormData.zipCode}`
        if (!faNorm.includes(addressFormData.state.toLowerCase()) || !faNorm.includes(String(addressFormData.zipCode))) {
          extras.push(st)
        }
      } else {
        pushIfMissing(addressFormData.state)
        pushIfMissing(addressFormData.zipCode)
      }
      return cleanLocationDisplayLine(
        extras.length ? `${fullAddress}, ${extras.join(", ")}` : fullAddress,
      )
    }

    // Prefer device-stored line from map / last save over stale useLocation() (fixes list vs "final extracted" mismatch)
    let storedFormatted = ""
    try {
      const raw = localStorage.getItem("userLocation")
      if (raw) {
        const p = JSON.parse(raw)
        const f = (p?.formattedAddress || "").trim()
        if (f && f !== "Select location" && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(f)) {
          storedFormatted = cleanLocationDisplayLine(f)
        }
      }
    } catch {
      /* ignore */
    }

    const hookClean = cleanLocationDisplayLine(location?.formattedAddress || "")

    if (storedFormatted) {
      const sc = partCnt(storedFormatted)
      const hc = partCnt(hookClean)
      if (
        sc >= 4 &&
        (sc > hc ||
          (sc === hc && storedFormatted.length >= hookClean.length) ||
          !hookClean)
      ) {
        return storedFormatted
      }
      if (!hookClean && sc >= 3) return storedFormatted
    }

    // Priority 2: Use formattedAddress from location hook (complete detailed address) - SAVED ADDRESSES FORMAT
    // Show full address with all parts (street, area, city, state, pincode) - just like saved addresses
    if (location?.formattedAddress &&
      location.formattedAddress !== "Select location" &&
      !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      // Remove "India" from the end if present (saved addresses don't show country)
      let fullAddress = location.formattedAddress
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }

      return cleanLocationDisplayLine(fullAddress)
    }

    // Priority 3: Build address from components (SAVED ADDRESSES FORMAT)
    // Format: "street/area, city, state, pincode" (matching saved addresses)
    if (location?.address || location?.area || location?.street) {
      const addressParts = []

      // Add street/address/area (like saved addresses' additionalDetails + street)
      if (location.address && location.address !== "Select location") {
        addressParts.push(location.address)
      } else if (location.area) {
        addressParts.push(location.area)
      } else if (location.street) {
        addressParts.push(location.street)
      }

      // Add city
      if (location.city) {
        addressParts.push(location.city)
      }

      // Add state
      if (location.state) {
        addressParts.push(location.state)
      }

      // Add pincode (like saved addresses show zipCode)
      if (location.postalCode) {
        addressParts.push(location.postalCode)
      }

      if (addressParts.length > 0) {
        return dedupeFormattedAddressLine(addressParts.join(", "))
      }
    }

    // Priority 3: Use area + city + state + pincode
    if (location?.area && location?.city && location?.state) {
      const parts = [location.area, location.city, location.state]
      if (location.postalCode) {
        parts.push(location.postalCode)
      }
      return dedupeFormattedAddressLine(parts.join(", "))
    }

    // Priority 4: Fallback to city + state + pincode
    if (location?.city && location?.state) {
      const parts = [location.city, location.state]
      if (location.postalCode) {
        parts.push(location.postalCode)
      }
      return dedupeFormattedAddressLine(parts.join(", "))
    }

    // Final fallback
    return location?.city || location?.area || "Detecting location..."
  })()

  // On open: reset to idle and show saved/context address — do not auto-call GPS (battery + avoids perpetual "Detecting…").
  useEffect(() => {
    if (!isOpen) return
    if (!navigator.geolocation) {
      setGpsLiveStatus("unsupported")
      return
    }
    setGpsLiveStatus("idle")
    setGpsLiveLine("")
  }, [isOpen])

  useEffect(() => {
    const onUserLocationUpdated = (e) => {
      const d = e.detail
      if (!d) return
      const line = cleanLocationDisplayLine(d.formattedAddress || d.address || "")
      if (!line) return
      setCurrentAddress(line)
      setAddressFormData((prev) => ({
        ...prev,
        city: d.city || prev.city,
        state: d.state || prev.state,
        zipCode: d.postalCode || prev.zipCode,
        additionalDetails: line || prev.additionalDetails,
      }))
    }
    window.addEventListener("userLocationUpdated", onUserLocationUpdated)
    return () =>
      window.removeEventListener("userLocationUpdated", onUserLocationUpdated)
  }, [])

  const useCurrentLocationSubtitle = (() => {
    const hasContextLocation =
      Boolean(location?.latitude) ||
      Boolean(location?.city) ||
      Boolean(location?.formattedAddress) ||
      Boolean(
        currentLocationText &&
          currentLocationText !== "Detecting location...",
      )

    if (loading && !hasContextLocation) return "Getting location..."

    if (gpsLiveStatus === "denied") {
      return "Turn on location access to see where you are right now"
    }
    if (gpsLiveStatus === "error") {
      return "Could not read GPS — tap below to try again"
    }
    if (gpsLiveStatus === "unsupported") return currentLocationText

    if (gpsLiveStatus === "ok" && gpsLiveLine) return gpsLiveLine

    if (gpsLiveStatus === "loading") {
      return hasContextLocation ? currentLocationText : "Updating your location…"
    }

    return currentLocationText
  })()

  // Global error suppression for Ola Maps SDK errors (runs on component mount)
  useEffect(() => {
    // Suppress console errors for non-critical Ola Maps SDK errors
    const originalConsoleError = console.error
    const errorSuppressor = (...args) => {
      const errorStr = args.join(' ')
      // Suppress AbortError and sprite file errors from Ola Maps SDK
      if (errorStr.includes('AbortError') ||
        errorStr.includes('user aborted') ||
        errorStr.includes('sprite@2x.json') ||
        errorStr.includes('3d_model') ||
        (errorStr.includes('Source layer') && errorStr.includes('does not exist')) ||
        (errorStr.includes('AJAXError') && errorStr.includes('sprite')) ||
        (errorStr.includes('AJAXError') && errorStr.includes('olamaps.io'))) {
        // Silently ignore these non-critical errors
        return
      }
      // Log other errors normally
      originalConsoleError.apply(console, args)
    }

    // Replace console.error globally
    console.error = errorSuppressor

    // Handle unhandled promise rejections
    const unhandledRejectionHandler = (event) => {
      const error = event.reason || event
      const errorMsg = error?.message || String(error) || ''
      const errorName = error?.name || ''
      const errorStack = error?.stack || ''

      // Suppress non-critical errors from Ola Maps SDK
      if (errorName === 'AbortError' ||
        errorMsg.includes('AbortError') ||
        errorMsg.includes('user aborted') ||
        errorMsg.includes('3d_model') ||
        (errorMsg.includes('Source layer') && errorMsg.includes('does not exist')) ||
        (errorMsg.includes('AJAXError') && (errorMsg.includes('sprite') || errorMsg.includes('olamaps.io'))) ||
        errorStack.includes('olamaps-web-sdk')) {
        event.preventDefault() // Prevent error from showing in console
        return
      }
    }

    window.addEventListener('unhandledrejection', unhandledRejectionHandler)

    // Cleanup
    return () => {
      // Restore original console.error
      console.error = originalConsoleError
      // Remove event listener
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler)
    }
  }, []) // Run once on mount

  // Initialize map position from current location and update blue dot
  useEffect(() => {
    if (location?.latitude && location?.longitude && googleMapRef.current && window.google && window.google.maps) {
      const userPos = {
        lat: location.latitude,
        lng: location.longitude
      }

      const accuracyRadius = Math.max(location.accuracy || 50, 20)

      console.log("🔵 Updating blue dot from location hook:", {
        position: userPos,
        accuracy: location.accuracy,
        radius: accuracyRadius
      })

      // Update or create blue dot marker
      if (userLocationMarkerRef.current) {
        try {
          if (userLocationMarkerRef.current.setPosition) {
            userLocationMarkerRef.current.setPosition(userPos)
          }
          // Ensure marker is visible and on map
          const currentMap = userLocationMarkerRef.current.getMap()
          if (currentMap !== googleMapRef.current) {
            userLocationMarkerRef.current.setMap(googleMapRef.current)
          }
          userLocationMarkerRef.current.setVisible(true)
          console.log("✅ Updated existing blue dot marker")
        } catch (e) {
          console.error("Error updating blue dot marker:", e)
          // Recreate if update fails
          userLocationMarkerRef.current = null
        }
      }

      if (!userLocationMarkerRef.current) {
        // Create blue dot marker if it doesn't exist
        try {
          const blueDotMarker = new window.google.maps.Marker({
            position: userPos,
            map: googleMapRef.current,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#4285F4",
              fillOpacity: 1,
              strokeColor: "#FFFFFF",
              strokeWeight: 3,
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 1,
            optimized: false,
            visible: true,
            title: "Your location"
          })
          userLocationMarkerRef.current = blueDotMarker
          console.log("✅ Created blue dot marker from location hook")
        } catch (e) {
          console.error("Error creating blue dot marker:", e)
        }
      }

      // Update or create accuracy circle
      if (blueDotCircleRef.current) {
        try {
          blueDotCircleRef.current.setCenter(userPos)
          blueDotCircleRef.current.setRadius(accuracyRadius)
          // Ensure circle is visible and on map
          const currentMap = blueDotCircleRef.current.getMap()
          if (currentMap !== googleMapRef.current) {
            blueDotCircleRef.current.setMap(googleMapRef.current)
          }
          blueDotCircleRef.current.setVisible(true)
          console.log("✅ Updated existing accuracy circle")
        } catch (e) {
          console.error("Error updating accuracy circle:", e)
          // Recreate if update fails
          blueDotCircleRef.current = null
        }
      }

      if (!blueDotCircleRef.current) {
        // Create accuracy circle if it doesn't exist
        try {
          const blueDot = new window.google.maps.Circle({
            strokeColor: "#4285F4",
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: "#4285F4",
            fillOpacity: 0.15,
            map: googleMapRef.current,
            center: userPos,
            radius: accuracyRadius,
            zIndex: window.google.maps.Marker.MAX_ZINDEX,
            visible: true
          })
          blueDotCircleRef.current = blueDot
          console.log("✅ Created accuracy circle from location hook")
        } catch (e) {
          console.error("Error creating accuracy circle:", e)
        }
      }

      // Final verification
      setTimeout(() => {
        const markerVisible = userLocationMarkerRef.current?.getVisible()
        const circleVisible = blueDotCircleRef.current?.getVisible()
        const markerOnMap = userLocationMarkerRef.current?.getMap() === googleMapRef.current
        const circleOnMap = blueDotCircleRef.current?.getMap() === googleMapRef.current

        console.log("🔍 Final Blue Dot Status:", {
          markerExists: !!userLocationMarkerRef.current,
          circleExists: !!blueDotCircleRef.current,
          markerVisible,
          circleVisible,
          markerOnMap,
          circleOnMap
        })
      }, 500)
    }
  }, [
    location?.latitude ?? null,
    location?.longitude ?? null,
    location?.accuracy ?? null
  ])

  // Initialize Google Maps with Loader (ZOMATO-STYLE)
  useEffect(() => {
    if (!showAddressForm || !mapContainerRef.current || !GOOGLE_MAPS_API_KEY) {
      return
    }

    let isMounted = true
    let mapClickListener = null
    setMapLoading(true)

    const initializeGoogleMap = async () => {
      try {
        const loader = new Loader({
          apiKey: GOOGLE_MAPS_API_KEY,
          version: "weekly",
          libraries: ["places", "geocoding"]
        })

        const google = await loader.load()
        googleMapsApiRef.current = google

        if (!isMounted || !mapContainerRef.current) return

        // Initial location (Indore center or current location)
        const initialLocation = location?.latitude && location?.longitude
          ? { lat: location.latitude, lng: location.longitude }
          : { lat: 22.7196, lng: 75.8577 }

        // Create map
        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialLocation,
          zoom: 15,
          disableDefaultUI: true, // Zomato-style clean look
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        })

        googleMapRef.current = map

        // AutocompleteService + PlacesService removed — using free Photon API instead

        // Create Green Marker (draggable for address selection)
        const greenMarker = new google.maps.Marker({
          position: initialLocation,
          map: map,
          icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 40)
          },
          draggable: true,
          title: "Drag to select location"
        })

        greenMarkerRef.current = greenMarker

        // Handle marker drag - update address
        google.maps.event.addListener(greenMarker, 'dragend', function () {
          const newPos = greenMarker.getPosition()
          const newLat = newPos.lat()
          const newLng = newPos.lng()
          setSelectedPlaceAddress('')
          setMapPosition([newLat, newLng])
          handleMapMoveEnd(newLat, newLng)
        })

        // Allow users to pin exact location by tapping on map (mobile-friendly).
        mapClickListener = map.addListener('click', (e) => {
          const clickedLat = e?.latLng?.lat?.()
          const clickedLng = e?.latLng?.lng?.()
          if (typeof clickedLat !== "number" || typeof clickedLng !== "number") return
          if (greenMarkerRef.current) {
            greenMarkerRef.current.setPosition({ lat: clickedLat, lng: clickedLng })
          }
          setSelectedPlaceAddress('')
          setMapPosition([clickedLat, clickedLng])
          handleMapMoveEnd(clickedLat, clickedLng, { force: true })
        })

        // Function to create/update blue dot and accuracy circle
        const createBlueDotWithCircle = (position, accuracyValue) => {
          if (!isMounted || !map) return

          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }

          const accuracyRadius = Math.max(accuracyValue || 50, 20) // Minimum 20m

          console.log("🔵 Creating/updating blue dot:", {
            position: userPos,
            accuracy: accuracyValue,
            radius: accuracyRadius
          })

          // Remove existing blue dot and circle if any
          if (userLocationMarkerRef.current) {
            try {
              userLocationMarkerRef.current.setMap(null)
            } catch (e) {
              console.warn("Error removing old marker:", e)
            }
          }
          if (blueDotCircleRef.current) {
            try {
              blueDotCircleRef.current.setMap(null)
            } catch (e) {
              console.warn("Error removing old circle:", e)
            }
          }

          // Create Blue Dot Marker (Google Maps native style)
          const blueDotMarker = new google.maps.Marker({
            position: userPos,
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10, // Blue dot size
              fillColor: "#4285F4", // Google blue
              fillOpacity: 1,
              strokeColor: "#FFFFFF", // White border
              strokeWeight: 3,
            },
            zIndex: google.maps.Marker.MAX_ZINDEX + 1,
            optimized: false,
            visible: true,
            title: "Your location"
          })

          // Create Accuracy Circle (Light blue zone around blue dot)
          const accuracyCircle = new google.maps.Circle({
            strokeColor: "#4285F4",
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: "#4285F4",
            fillOpacity: 0.15, // Light transparent blue
            map: map,
            center: userPos,
            radius: accuracyRadius, // Meters
            zIndex: google.maps.Marker.MAX_ZINDEX,
            visible: true
          })

          blueDotCircleRef.current = accuracyCircle
          userLocationMarkerRef.current = blueDotMarker

          console.log("✅✅✅ Blue dot and accuracy circle created successfully:", {
            marker: blueDotMarker,
            circle: accuracyCircle,
            radius: accuracyRadius,
            markerOnMap: blueDotMarker.getMap() === map,
            circleOnMap: accuracyCircle.getMap() === map
          })

          // Force visibility check (silent fix - no error logging)
          setTimeout(() => {
            if (!isMounted || !map) return

            const markerVisible = userLocationMarkerRef.current?.getVisible()
            const circleVisible = blueDotCircleRef.current?.getVisible()
            const markerOnMap = userLocationMarkerRef.current?.getMap() === map
            const circleOnMap = blueDotCircleRef.current?.getMap() === map

            // Silently fix marker visibility if needed
            if (userLocationMarkerRef.current && (!markerOnMap || !markerVisible)) {
              try {
                userLocationMarkerRef.current.setMap(map)
                userLocationMarkerRef.current.setVisible(true)
                console.log("✅ Blue dot marker visibility fixed")
              } catch (e) {
                // Silently handle - marker might not be ready yet
              }
            }

            // Silently fix circle visibility if needed
            if (blueDotCircleRef.current && (!circleOnMap || !circleVisible)) {
              try {
                blueDotCircleRef.current.setMap(map)
                blueDotCircleRef.current.setVisible(true)
                console.log("✅ Accuracy circle visibility fixed")
              } catch (e) {
                // Silently handle - circle might not be ready yet
              }
            }
          }, 1000)
        }

        // Wait for map to be fully ready before getting location
        google.maps.event.addListenerOnce(map, 'idle', () => {
          console.log("🗺️ Map is ready, requesting user location...")

          // Get user's current location and show Blue Dot
          if (navigator.geolocation) {
            // First, get current position immediately
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (!isMounted) return
                createBlueDotWithCircle(position, position.coords.accuracy)
                handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
              },
              (error) => {
                console.warn("Geolocation getCurrentPosition error:", error)
                handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              }
            )

            // Then, watch for position updates (live tracking) — single watch; avoid stacking callbacks
            if (watchPositionIdRef.current !== null) {
              navigator.geolocation.clearWatch(watchPositionIdRef.current)
              watchPositionIdRef.current = null
            }
            const watchId = navigator.geolocation.watchPosition(
              (position) => {
                if (!isMounted) return
                console.log("📍 Live location update:", {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  accuracy: position.coords.accuracy
                })
                createBlueDotWithCircle(position, position.coords.accuracy)
              },
              (error) => {
                // Suppress timeout errors - they're non-critical
                if (error.code !== 3) {
                  console.warn("Geolocation watchPosition error:", error)
                }
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000 // Allow 5 second old cached location
              }
            )

            // Store watch ID for cleanup
            watchPositionIdRef.current = watchId
          } else {
            console.warn("Geolocation not supported")
            handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
          }
        })

        setMapLoading(false)
      } catch (error) {
        console.error("Error initializing Google Maps:", error)
        setMapLoading(false)
        toast.error("Failed to load map. Please refresh the page.")
      }
    }

    initializeGoogleMap()

    return () => {
      isMounted = false
      teardownAddressMap()
      if (placesAutocompleteRef.current && googleMapsApiRef.current?.maps?.event) {
        try {
          googleMapsApiRef.current.maps.event.clearInstanceListeners(placesAutocompleteRef.current)
        } catch (e) {
          console.warn("Error cleaning up Places Autocomplete:", e)
        }
        placesAutocompleteRef.current = null
      }
      if (mapClickListener) {
        try {
          mapClickListener.remove()
        } catch (e) {
          console.warn("Error cleaning up map click listener:", e)
        }
      }
    }
  }, [showAddressForm, GOOGLE_MAPS_API_KEY, location?.latitude, location?.longitude, teardownAddressMap])

  // Fetch up to 4 place suggestions when user types in address-form search
  useEffect(() => {
    if (!showAddressForm) {
      setPlaceSuggestions([])
      return
    }
    const query = (searchValue || '').trim()
    if (query.length < 2) {
      setPlaceSuggestions([])
      setPlaceSuggestionsLoading(false)
      if (placePredictionsDebounceRef.current) {
        clearTimeout(placePredictionsDebounceRef.current)
        placePredictionsDebounceRef.current = null
      }
      return
    }
    if (placePredictionsDebounceRef.current) clearTimeout(placePredictionsDebounceRef.current)
    placePredictionsDebounceRef.current = setTimeout(async () => {
      setPlaceSuggestionsLoading(true)
      try {
        // Free Photon API (OpenStreetMap) — zero Google Maps cost
        const userLat = location?.latitude || mapPosition?.[0] || 22.7196
        const userLng = location?.longitude || mapPosition?.[1] || 75.8577
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${userLat}&lon=${userLng}&limit=4&lang=en`
        const resp = await fetch(url)
        const data = await resp.json()
        if (data.features && data.features.length > 0) {
          setPlaceSuggestions(
            data.features.slice(0, 4).map((f) => ({
              place_id: `photon_${f.properties.osm_id || Math.random()}`,
              description: [
                f.properties.name,
                f.properties.street,
                f.properties.city || f.properties.town || f.properties.village,
                f.properties.state,
              ].filter(Boolean).join(', '),
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
            }))
          )
        } else {
          setPlaceSuggestions([])
        }
      } catch {
        setPlaceSuggestions([])
      }
      setPlaceSuggestionsLoading(false)
    }, 300)
    return () => {
      if (placePredictionsDebounceRef.current) clearTimeout(placePredictionsDebounceRef.current)
    }
  }, [showAddressForm, searchValue])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Lock body scroll when overlay is open; restore cleanly on close to avoid right-side glitch
  const restoreBodyScroll = () => {
    document.body.style.removeProperty("overflow")
    document.body.style.removeProperty("position")
    // Force reflow so browser repaints and any scrollbar gutter is cleared
    void document.body.offsetHeight
  }

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      // Defer restore so overlay DOM is gone first; avoids right-side bar glitch
      requestAnimationFrame(() => {
        restoreBodyScroll()
      })
    }
  }, [isOpen, onClose])

  // Ensure body scroll is restored when overlay unmounts (e.g. navigate away)
  useEffect(() => {
    return () => {
      requestAnimationFrame(() => {
        restoreBodyScroll()
      })
    }
  }, [])

  /** PUT /user/location using localStorage after Google/refined geocode (avoids saving coarse backend-only row first). */
  const persistRefinedLocationToBackend = async (coordsSource) => {
    if (!coordsSource?.latitude || !coordsSource?.longitude) return
    try {
      let storedParsed = null
      try {
        const raw = localStorage.getItem("userLocation")
        if (raw) storedParsed = JSON.parse(raw)
      } catch {
        /* ignore */
      }
      const fmt =
        cleanLocationDisplayLine(storedParsed?.formattedAddress || "") ||
        storedParsed?.formattedAddress ||
        coordsSource.formattedAddress ||
        ""
      await userAPI.updateLocation({
        latitude: coordsSource.latitude,
        longitude: coordsSource.longitude,
        address: storedParsed?.address || coordsSource.address || "",
        city: storedParsed?.city || coordsSource.city || "",
        state: storedParsed?.state || coordsSource.state || "",
        area: storedParsed?.area || coordsSource.area || "",
        formattedAddress: fmt || coordsSource.formattedAddress || coordsSource.address || "",
        accuracy: storedParsed?.accuracy ?? coordsSource.accuracy,
        postalCode: storedParsed?.postalCode || coordsSource.postalCode,
        street: storedParsed?.street || coordsSource.street,
        streetNumber: storedParsed?.streetNumber || coordsSource.streetNumber,
      })
      console.log("✅ Location saved to backend (matches refined localStorage)")
    } catch (backendError) {
      if (backendError.code !== "ERR_NETWORK" && backendError.message !== "Network Error") {
        console.error("Error saving location to backend:", backendError)
      }
    }
  }

  const handleUseCurrentLocation = async () => {
    try {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        toast.error("Location services are not supported in your browser", {
          duration: 3000,
        })
        return
      }

      // Show loading toast
      toast.loading("Fetching your current location...", {
        id: "location-request",
      })
      setGpsLiveStatus("loading")

      // Request location - this will automatically prompt for permission if needed
      // Clear any cached location first to ensure fresh coordinates
      console.log("🔄 Requesting fresh location (clearing cache and forcing fresh GPS)...")

      // Increase timeout to 15 seconds to allow GPS to get accurate fix
      // The getLocation function already has a 15-second timeout, so we match it
      console.log("📍 Using fresh GPS location — overlay will not prefer stale cache for this action")
      const locationPromise = requestLocation({ skipDatabaseUpdate: true })
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Location request is taking longer than expected. Please check your GPS settings."
              ),
            ),
          25000,
        )
      )

      let locationData
      try {
        locationData = await Promise.race([locationPromise, timeoutPromise])

        // Check if we got valid location data
        if (!locationData || (!locationData.latitude || !locationData.longitude)) {
          throw new Error("Invalid location data received")
        }
      } catch (raceError) {
        console.warn("⚠️ Location request failed or timed out:", raceError.message)

        // If timeout or error, try to use cached location as fallback
        const stored = localStorage.getItem("userLocation")
        if (stored) {
          try {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              console.log("📍 Using cached location as fallback:", cachedLocation)
              locationData = cachedLocation

              // Show info toast that we're using cached location
              toast.info("Using your last known location", {
                id: "location-request",
                duration: 2000,
              })
            } else {
              throw new Error("Invalid cached location")
            }
          } catch (cacheErr) {
            console.error("❌ Failed to parse cached location:", cacheErr)
            // Determine specific error message
            let errorMessage = "Could not get location. Please try again."
            if (raceError.message.includes("permission") || raceError.message.includes("denied")) {
              errorMessage = "Location permission denied. Please enable location access in your browser settings."
            } else if (raceError.message.includes("timeout") || raceError.message.includes("longer")) {
              errorMessage = "Location request timed out. Please check your GPS settings and try again."
            } else if (raceError.message.includes("unavailable")) {
              errorMessage = "Location information is unavailable. Please check your device settings."
            }

            toast.error(errorMessage, {
              id: "location-request",
              duration: 5000,
            })
            setGpsLiveStatus(
              errorMessage.includes("permission") || errorMessage.includes("denied")
                ? "denied"
                : "error",
            )
            return
          }
        } else {
          // No cached location available
          let errorMessage = "Could not get location. Please try again."
          if (raceError.message.includes("permission") || raceError.message.includes("denied")) {
            errorMessage = "Location permission denied. Please enable location access in your browser settings."
          } else if (raceError.message.includes("timeout") || raceError.message.includes("longer")) {
            errorMessage = "Location request timed out. Please check your GPS settings and try again."
          } else if (raceError.message.includes("unavailable")) {
            errorMessage = "Location information is unavailable. Please check your device settings."
          }

          toast.error(errorMessage, {
            id: "location-request",
            duration: 5000,
          })
          setGpsLiveStatus(
            errorMessage.includes("permission") || errorMessage.includes("denied")
              ? "denied"
              : "error",
          )
          return
        }
      }

      // Validate location data
      if (!locationData) {
        toast.error("Could not get location. Please try again.", { id: "location-request" })
        setGpsLiveStatus("error")
        return
      }

      if (!locationData.latitude || !locationData.longitude) {
        toast.error("Invalid location data received. Please try again.", { id: "location-request" })
        setGpsLiveStatus("error")
        return
      }

      console.log("✅ Fresh location received:", {
        formattedAddress: locationData?.formattedAddress,
        address: locationData?.address,
        city: locationData?.city,
        state: locationData?.state,
        area: locationData?.area,
        coordinates: locationData?.latitude && locationData?.longitude ?
          `${locationData.latitude.toFixed(8)}, ${locationData.longitude.toFixed(8)}` : "N/A",
        hasCompleteAddress: locationData?.formattedAddress &&
          locationData.formattedAddress.split(',').length >= 4
      })

      // Verify we got complete address (but don't fail if incomplete - still use the location)
      if (!locationData?.formattedAddress ||
        locationData.formattedAddress === "Select location" ||
        locationData.formattedAddress.split(',').length < 4) {
        console.warn("⚠️ Location received but address is incomplete. Will try to get better address from map...")
        // Don't retry immediately - let the map handle address fetching
        // The address will be fetched when map moves to the location
      }

      // CRITICAL: Ensure location state is updated in the hook
      // The requestLocation function already updates the state, but we verify here
      console.log("✅✅✅ Final location data to be saved:", {
        formattedAddress: locationData?.formattedAddress,
        address: locationData?.address,
        mainTitle: locationData?.mainTitle,
        hasCompleteAddress: locationData?.formattedAddress &&
          locationData.formattedAddress.split(',').length >= 4
      })

      // Backend PUT runs after handleMapMoveEnd (below) so DB gets Google/refined line, not coarse backend geocode.

      // Update map + run same rich geocode path as the live subtitle (Google-first), then persist.
      // requestLocation({ skipDatabaseUpdate: true }) avoids writing coarse backend row before this pass.
      if (locationData?.latitude && locationData?.longitude) {
        setMapPosition([locationData.latitude, locationData.longitude])

        if (locationData.formattedAddress) {
          setCurrentAddress(
            cleanLocationDisplayLine(locationData.formattedAddress || "") ||
              locationData.formattedAddress ||
              "",
          )
          setAddressFormData(prev => ({
            ...prev,
            street: locationData.street || locationData.area || prev.street,
            city: locationData.city || prev.city,
            state: locationData.state || prev.state,
            zipCode: locationData.postalCode || prev.zipCode,
            additionalDetails: locationData.formattedAddress || prev.additionalDetails,
          }))
        }

        try {
          if (googleMapRef.current && window.google && window.google.maps) {
            googleMapRef.current.panTo({ lat: locationData.latitude, lng: locationData.longitude })
            googleMapRef.current.setZoom(17)
            if (greenMarkerRef.current) {
              greenMarkerRef.current.setPosition({ lat: locationData.latitude, lng: locationData.longitude })
            }
          }
        } catch (mapError) {
          console.error("Error updating map:", mapError)
        }

        try {
          await raceWithTimeout(
            handleMapMoveEnd(locationData.latitude, locationData.longitude, { force: true }),
            16000,
            "USE_LOCATION_MAP_TIMEOUT",
          )
        } catch (mapEndErr) {
          console.warn(
            "handleMapMoveEnd skipped or timed out after use current location:",
            mapEndErr?.message || mapEndErr,
          )
        }

        await persistRefinedLocationToBackend(locationData)
      }

      // Navbar / other tabs: broadcast what is actually in storage after rich geocode
      try {
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem("userLocation")
          if (raw) {
            const payload = JSON.parse(raw)
            window.dispatchEvent(new CustomEvent("userLocationUpdated", { detail: payload }))
          }
        }
      } catch {
        // ignore cross-window errors
      }

      try {
        const raw = localStorage.getItem("userLocation")
        if (raw) {
          const p = JSON.parse(raw)
          const line =
            cleanLocationDisplayLine(p.formattedAddress || p.address || "") ||
            String(p.formattedAddress || p.address || "").trim()
          if (line && line !== "Select location") {
            console.log("✅ UI updated with new location (overlay sync from localStorage)")
            setGpsLiveLine(line)
            setCurrentAddress(line)
            setAddressFormData((prev) => ({
              ...prev,
              city: p.city || prev.city,
              state: p.state || prev.state,
              zipCode: p.postalCode || prev.zipCode,
              additionalDetails: line || prev.additionalDetails,
            }))
            setGpsLiveStatus("ok")
          }
        }
      } catch {
        /* ignore */
      }

      const storedPreview = (() => {
        try {
          const raw = localStorage.getItem("userLocation")
          if (!raw) return locationData?.formattedAddress || locationData?.address || "Location updated"
          const p = JSON.parse(raw)
          return p?.formattedAddress || p?.address || "Location updated"
        } catch {
          return locationData?.formattedAddress || locationData?.address || "Location updated"
        }
      })()
      const previewLine = String(storedPreview).split(",").slice(0, 2).join(", ")
      toast.success(`Location updated: ${previewLine}`, {
        id: "location-request",
        duration: 2000,
      })

      setTimeout(() => {
        onClose()
        navigateAfterClose("/")
      }, 600)
    } catch (error) {
      // Handle permission denied or other errors
      if (error.code === 1 || error.message?.includes("denied") || error.message?.includes("permission")) {
        toast.error("Location permission denied. Please enable location access in your browser settings.", {
          id: "location-request",
          duration: 4000,
        })
        setGpsLiveStatus("denied")
      } else if (error.code === 2 || error.message?.includes("unavailable")) {
        toast.error("Location unavailable. Please check your GPS settings.", {
          id: "location-request",
          duration: 3000,
        })
        setGpsLiveStatus("error")
      } else if (error.code === 3 || error.message?.includes("timeout")) {
        toast.error("Location request timed out. Please try again.", {
          id: "location-request",
          duration: 3000,
        })
        setGpsLiveStatus("error")
      } else {
        toast.error("Failed to get location. Please try again.", {
          id: "location-request",
          duration: 3000,
        })
        setGpsLiveStatus("error")
      }
      // Don't close the selector if there's an error, so user can try other options
    }
  }

  const handleAddAddress = () => {
    setShowAddressForm(true)
    // Initialize form with current location data
    if (location?.latitude && location?.longitude) {
      setMapPosition([location.latitude, location.longitude])
      setAddressFormData(prev => ({
        ...prev,
        city: location.city || "",
        state: location.state || "",
        street: location.address || location.area || "",
        phone: userProfile?.phone || "",
      }))
    }
  }

  const handleAddressFormChange = (e) => {
    setAddressFormData({
      ...addressFormData,
      [e.target.name]: e.target.value,
    })
  }

  // Google Maps loading is handled by the Loader in the initialization useEffect above

  // OLD OLA MAPS INITIALIZATION - REMOVED (Replaced with Google Maps Loader above)
  // All old Ola Maps/Leaflet code has been removed and replaced with Google Maps Loader implementation

  // Removed old useEffect that initialized Ola Maps - now using Google Maps Loader above
  // All old Ola Maps initialization code has been removed

  // Resize Google Map when container dimensions change
  useEffect(() => {
    if (googleMapRef.current && showAddressForm) {
      const resizeMap = () => {
        try {
          if (googleMapRef.current && typeof window.google !== 'undefined' && window.google.maps) {
            window.google.maps.event.trigger(googleMapRef.current, 'resize');
            console.log("✅ Google Map resized (container change)");
          }
        } catch (error) {
          console.warn("⚠️ Error resizing map:", error);
        }
      };

      const timer = setTimeout(() => {
        resizeMap();
      }, 300);

      window.addEventListener('resize', resizeMap);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', resizeMap);
      }
    }
  }, [showAddressForm])

  // Track user's live location with blue dot indicator
  const trackUserLocation = (mapInstance, sdkInstance) => {
    if (!navigator.geolocation) {
      console.warn("⚠️ Geolocation is not supported by this browser")
      return
    }

    console.log("🔵🔵🔵 STARTING USER LOCATION TRACKING...")
    console.log("🔵 Map instance:", mapInstance)
    console.log("🔵 SDK instance:", sdkInstance)
    console.log("🔵 SDK instance type:", typeof sdkInstance)
    console.log("🔵 SDK instance keys:", sdkInstance ? Object.keys(sdkInstance).slice(0, 20) : 'null')
    console.log("🔵 Has addMarker:", !!(sdkInstance && sdkInstance.addMarker))
    console.log("🔵 Has Marker:", !!(sdkInstance && sdkInstance.Marker))

    // Clear any existing watchPosition
    if (watchPositionIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchPositionIdRef.current)
      watchPositionIdRef.current = null
    }

    // Helper function to calculate distance between two coordinates (in meters)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371e3 // Earth's radius in meters
      const φ1 = lat1 * Math.PI / 180
      const φ2 = lat2 * Math.PI / 180
      const Δφ = (lat2 - lat1) * Math.PI / 180
      const Δλ = (lon2 - lon1) * Math.PI / 180

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

      return R * c // Distance in meters
    }

    // Helper function to create/update marker (with throttling)
    const createOrUpdateMarker = (latitude, longitude, heading, accuracy = null) => {
      // Check if location changed significantly (at least 10 meters)
      if (lastUserLocationRef.current) {
        const distance = calculateDistance(
          lastUserLocationRef.current.latitude,
          lastUserLocationRef.current.longitude,
          latitude,
          longitude
        )

        // If distance is less than 10 meters, skip update (unless it's the first time)
        if (distance < 10) {
          // Only log occasionally to avoid console spam
          if (Math.random() < 0.1) { // Log 10% of skipped updates
            console.log(`⏭️ Skipping location update - only moved ${distance.toFixed(2)}m (threshold: 10m)`)
          }
          return
        }

        console.log(`📍 Location changed by ${distance.toFixed(2)}m - updating marker`)
      }

      // Update last location
      lastUserLocationRef.current = { latitude, longitude, heading }

      // 1. Custom Blue Dot Element Banana
      let el = null
      if (userLocationMarkerRef.current) {
        // If marker exists, get its element
        el = userLocationMarkerRef.current.getElement?.() ||
          userLocationMarkerRef.current._element ||
          document.querySelector('.user-location-marker')
      }

      if (!el) {
        el = document.createElement('div')
        el.className = 'user-location-marker'
        // Ensure element is visible with inline styles (same pattern as green pin)
        el.style.cssText = `
          width: 20px;
          height: 20px;
          background-color: #4285F4;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(0,0,0,0.3);
          position: relative;
          z-index: 1001;
          display: block;
          visibility: visible;
          opacity: 1;
          cursor: default;
        `
        console.log("✅ Created blue dot element with styles")
      } else {
        // Ensure existing element styles are correct
        el.style.display = 'block'
        el.style.visibility = 'visible'
        el.style.opacity = '1'
        el.style.zIndex = '1001'
      }

      // 2. Update accuracy circle if it exists
      if (userLocationAccuracyCircleRef.current) {
        try {
          if (userLocationAccuracyCircleRef.current.update) {
            userLocationAccuracyCircleRef.current.update(latitude, longitude, accuracy)
            console.log("✅ Updated accuracy circle position and radius")
          }
        } catch (circleError) {
          console.warn("⚠️ Error updating accuracy circle:", circleError.message)
        }
      }

      // 3. Agar marker pehle se hai to update karein, nahi to naya banayein
      if (userLocationMarkerRef.current) {
        try {
          if (userLocationMarkerRef.current.setLngLat) {
            userLocationMarkerRef.current.setLngLat([longitude, latitude])
            console.log("✅ Updated existing marker position")
          } else if (userLocationMarkerRef.current.setPosition) {
            userLocationMarkerRef.current.setPosition([longitude, latitude])
            console.log("✅ Updated existing marker position (setPosition)")
          } else {
            console.warn("⚠️ Marker exists but no update method found")
          }
        } catch (error) {
          console.error("❌ Error updating user location marker:", error)
        }
      } else {
        try {
          // Try different marker creation methods - EXACT SAME PATTERN AS GREEN PIN
          let newMarker = null

          console.log("🔵 Creating blue dot marker with:", {
            hasSdkInstance: !!sdkInstance,
            hasMapInstance: !!mapInstance,
            sdkAddMarker: !!(sdkInstance && sdkInstance.addMarker),
            sdkMarker: !!(sdkInstance && sdkInstance.Marker),
            element: !!el
          })

          // Method 1: Try SDK's addMarker method (EXACT SAME AS GREEN PIN)
          if (sdkInstance && sdkInstance.addMarker) {
            console.log("🔵 Method 1: Using sdkInstance.addMarker (same as green pin)")
            try {
              newMarker = sdkInstance.addMarker({
                element: el,
                anchor: 'center',
                draggable: false
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
              console.log("✅✅✅ Blue dot created using addMarker method:", newMarker)
            } catch (err) {
              console.error("❌ Error in addMarker:", err)
            }
          }
          // Method 2: Try SDK's Marker class (EXACT SAME AS GREEN PIN)
          else if (sdkInstance && sdkInstance.Marker) {
            console.log("🔵 Method 2: Using sdkInstance.Marker (same as green pin)")
            try {
              newMarker = new sdkInstance.Marker({
                element: el,
                anchor: 'center',
                draggable: false
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
              console.log("✅✅✅ Blue dot created using Marker class:", newMarker)
            } catch (err) {
              console.error("❌ Error in Marker constructor:", err)
            }
          }
          // Method 3: Try using MapLibre Marker (fallback - same as green pin)
          else if (window.maplibregl && window.maplibregl.Marker) {
            console.log("🔵 Method 3: Using maplibregl.Marker (fallback)")
            try {
              newMarker = new window.maplibregl.Marker({
                element: el,
                anchor: 'center'
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
              console.log("✅ Blue dot created using maplibregl.Marker")
            } catch (err) {
              console.error("❌ Error in maplibregl.Marker:", err)
            }
          }
          else {
            console.error("❌❌❌ NO MARKER API FOUND for blue dot. Available:", {
              sdkInstance: !!sdkInstance,
              sdkAddMarker: !!(sdkInstance && sdkInstance.addMarker),
              sdkMarker: !!(sdkInstance && sdkInstance.Marker),
              maplibregl: !!window.maplibregl,
              mapInstance: !!mapInstance,
              elementCreated: !!el
            })
          }

          if (newMarker) {
            userLocationMarkerRef.current = newMarker
            console.log("✅ User location marker (blue dot) added successfully:", newMarker)

            // Verify blue dot is visible (same pattern as green pin)
            setTimeout(() => {
              const markerEl = newMarker.getElement?.() || newMarker._element
              if (markerEl) {
                console.log("✅ Blue dot element found on map:", markerEl)
                // Ensure element is visible (same as green pin)
                markerEl.style.display = 'block'
                markerEl.style.visibility = 'visible'
                markerEl.style.opacity = '1'
                markerEl.style.zIndex = '1001'
                console.log("✅ Blue dot visibility ensured")

                // Also check the inner element (the actual blue dot div)
                const innerEl = markerEl.querySelector('.user-location-marker') || markerEl
                if (innerEl) {
                  innerEl.style.display = 'block'
                  innerEl.style.visibility = 'visible'
                  innerEl.style.opacity = '1'
                  console.log("✅ Blue dot inner element styles ensured")
                }
              } else {
                console.warn("⚠️ Blue dot element not found in DOM")
              }
            }, 500)

            // Additional check after 1 second
            setTimeout(() => {
              const markerEl = newMarker.getElement?.() || newMarker._element
              if (markerEl) {
                const computedStyle = window.getComputedStyle(markerEl)
                console.log("🔍 Blue dot computed styles:", {
                  display: computedStyle.display,
                  visibility: computedStyle.visibility,
                  opacity: computedStyle.opacity,
                  zIndex: computedStyle.zIndex
                })
              }
            }, 1000)

            // Create accuracy circle around blue dot (like Google Maps)
            const accuracyRadius = accuracy || 50 // Default to 50m if accuracy not available
            try {
              // Remove existing circle if any
              if (userLocationAccuracyCircleRef.current) {
                if (userLocationAccuracyCircleRef.current.remove) {
                  userLocationAccuracyCircleRef.current.remove()
                } else if (mapInstance.removeLayer) {
                  mapInstance.removeLayer(userLocationAccuracyCircleRef.current)
                }
              }

              // Try to create circle using MapLibre/Mapbox API
              if (mapInstance.addSource && mapInstance.addLayer) {
                const circleId = 'user-location-accuracy-circle'
                const sourceId = 'user-location-accuracy-circle-source'

                // Remove existing source/layer if present
                if (mapInstance.getLayer(circleId)) {
                  mapInstance.removeLayer(circleId)
                }
                if (mapInstance.getSource(sourceId)) {
                  mapInstance.removeSource(sourceId)
                }

                // Add circle source
                mapInstance.addSource(sourceId, {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    geometry: {
                      type: 'Point',
                      coordinates: [longitude, latitude]
                    },
                    properties: {
                      radius: accuracyRadius
                    }
                  }
                })

                // Add circle layer
                // Convert meters to pixels: use zoom-based scaling
                // At zoom 15: ~1.2 meters per pixel, at zoom 18: ~0.15 meters per pixel
                mapInstance.addLayer({
                  id: circleId,
                  type: 'circle',
                  source: sourceId,
                  paint: {
                    'circle-radius': [
                      'interpolate',
                      ['exponential', 2],
                      ['zoom'],
                      10, ['/', accuracyRadius, 2],
                      15, ['/', accuracyRadius, 1.2],
                      18, ['/', accuracyRadius, 0.15],
                      20, ['/', accuracyRadius, 0.04]
                    ],
                    'circle-color': '#4285F4',
                    'circle-opacity': 0.15,
                    'circle-stroke-color': '#4285F4',
                    'circle-stroke-opacity': 0.4,
                    'circle-stroke-width': 1
                  }
                })

                userLocationAccuracyCircleRef.current = {
                  sourceId,
                  layerId: circleId,
                  update: (newLat, newLng, newAccuracy) => {
                    if (mapInstance.getSource(sourceId)) {
                      mapInstance.getSource(sourceId).setData({
                        type: 'Feature',
                        geometry: {
                          type: 'Point',
                          coordinates: [newLng, newLat]
                        },
                        properties: {
                          radius: newAccuracy || accuracyRadius
                        }
                      })
                    }
                  },
                  remove: () => {
                    if (mapInstance.getLayer(circleId)) {
                      mapInstance.removeLayer(circleId)
                    }
                    if (mapInstance.getSource(sourceId)) {
                      mapInstance.removeSource(sourceId)
                    }
                  }
                }

                console.log("✅ Accuracy circle created around blue dot:", { radius: accuracyRadius })
              }
            } catch (circleError) {
              console.warn("⚠️ Could not create accuracy circle (non-critical):", circleError.message)
            }

            // Don't auto-fly to user location - let green pin stay at center
            // User can use "Use current location" button if needed
          } else {
            console.error("❌ Failed to create blue dot marker - all methods failed")
            console.error("🔍 Debug info:", {
              sdkInstance: !!sdkInstance,
              mapInstance: !!mapInstance,
              element: !!el,
              sdkAddMarker: !!(sdkInstance && sdkInstance.addMarker),
              sdkMarker: !!(sdkInstance && sdkInstance.Marker)
            })
          }
        } catch (markerError) {
          console.error("❌ Could not create user location marker:", markerError)
          console.error("Error details:", {
            message: markerError.message,
            stack: markerError.stack,
            name: markerError.name
          })
        }
      }

      // 3. Arrow Direction (Heading) agar available ho
      // Heading is in degrees (0-360), where 0 is North
      if (heading !== null && heading !== undefined && !isNaN(heading)) {
        el.style.transform = `rotate(${heading}deg)`
      } else {
        // Reset transform if no heading
        el.style.transform = 'rotate(0deg)'
      }
    }

    // First, try to get current position immediately
    // Use a small delay to ensure map is fully ready
    console.log("🔵 About to request geolocation...")
    setTimeout(() => {
      console.log("🔵 Requesting geolocation with getCurrentPosition...")
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, heading } = position.coords
          console.log("📍📍📍 Initial location received:", { latitude, longitude, heading })
          console.log("🔵 Calling createOrUpdateMarker with:", { latitude, longitude, heading })
          createOrUpdateMarker(latitude, longitude, heading, position.coords.accuracy)

          // Then start watching for updates (with throttling)
          watchPositionIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, heading, accuracy } = position.coords

              // Clear any pending update
              if (locationUpdateTimeoutRef.current) {
                clearTimeout(locationUpdateTimeoutRef.current)
              }

              // Throttle updates - only process after 2 seconds of no new updates
              locationUpdateTimeoutRef.current = setTimeout(() => {
                // Only log significant updates to avoid console spam
                if (!lastUserLocationRef.current ||
                  calculateDistance(
                    lastUserLocationRef.current.latitude,
                    lastUserLocationRef.current.longitude,
                    latitude,
                    longitude
                  ) >= 10) {
                  console.log("📍 Location update (throttled):", { latitude, longitude, heading })
                }
                createOrUpdateMarker(latitude, longitude, heading, accuracy)
              }, 2000) // Wait 2 seconds before processing update
            },
            (error) => {
              // Suppress timeout errors - they're non-critical and will retry
              if (error.code === 3) {
                // Timeout - silently ignore, will retry automatically
                return
              } else if (error.code === 1) {
                console.warn("⚠️ Location permission denied by user")
              } else if (error.code === 2) {
                console.warn("⚠️ Location unavailable")
              }
              // Don't log timeout errors repeatedly
            },
            {
              enableHighAccuracy: false, // Less strict for better compatibility
              timeout: 30000, // Longer timeout (30 seconds)
              maximumAge: 60000 // Allow cached location up to 1 minute old
            }
          )
          console.log("✅ watchPosition started, ID:", watchPositionIdRef.current)
        },
        (error) => {
          // Suppress timeout errors - they're non-critical
          if (error.code === 3) {
            // Timeout - try to use cached location or continue without location
            console.warn("⚠️ Location request timeout - will retry or use cached location")

            // Try to get cached location from localStorage
            try {
              const cachedLocation = localStorage.getItem("userLocation")
              if (cachedLocation) {
                const location = JSON.parse(cachedLocation)
                if (location.latitude && location.longitude) {
                  console.log("📍 Using cached location due to timeout:", location)
                  createOrUpdateMarker(location.latitude, location.longitude, null, location.accuracy)
                }
              }
            } catch (cacheError) {
              // Ignore cache errors
            }
          } else if (error.code === 1) {
            console.warn("⚠️ Location permission denied")
          } else if (error.code === 2) {
            console.warn("⚠️ Location unavailable")
          } else {
            // Only log non-timeout errors
            console.warn("⚠️ Location error (code:", error.code + "):", error.message)
          }

          // Even if initial location fails, try watchPosition with less strict options
          watchPositionIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, heading, accuracy } = position.coords

              // Clear any pending update
              if (locationUpdateTimeoutRef.current) {
                clearTimeout(locationUpdateTimeoutRef.current)
              }

              // Throttle updates - only process after 2 seconds of no new updates
              locationUpdateTimeoutRef.current = setTimeout(() => {
                // Only log significant updates to avoid console spam
                if (!lastUserLocationRef.current ||
                  calculateDistance(
                    lastUserLocationRef.current.latitude,
                    lastUserLocationRef.current.longitude,
                    latitude,
                    longitude
                  ) >= 10) {
                  console.log("📍 Location update (after initial error, throttled):", { latitude, longitude, heading })
                }
                createOrUpdateMarker(latitude, longitude, heading, accuracy)
              }, 2000) // Wait 2 seconds before processing update
            },
            (error) => {
              // Suppress timeout errors in watchPosition too
              if (error.code === 3) {
                // Timeout - silently ignore, will retry
                return
              } else if (error.code === 1) {
                console.warn("⚠️ Please enable location permission in browser settings")
              }
              // Don't log other errors repeatedly
            },
            {
              enableHighAccuracy: false, // Less strict for better compatibility
              timeout: 30000, // Longer timeout
              maximumAge: 60000 // Allow cached location up to 1 minute old
            }
          )
          console.log("✅ watchPosition started (fallback), ID:", watchPositionIdRef.current)
        },
        {
          enableHighAccuracy: false, // Less strict for better compatibility
          timeout: 30000, // Longer timeout (30 seconds)
          maximumAge: 60000 // Allow cached location up to 1 minute old
        }
      )
    }, 500) // Small delay to ensure map is ready

    console.log("✅ watchPosition started, ID:", watchPositionIdRef.current)
  }

  const handleMapMoveEnd = async (lat, lng, options = {}) => {
    const { force = false, suppressPersist = false } = options
    const roundedLat = parseFloat(Number(lat).toFixed(6))
    const roundedLng = parseFloat(Number(lng).toFixed(6))

    // Same coords as last map geocode — skip (saves API). "Use current location" passes force:true
    // because subtitle used live Google geocode while requestLocation() may have saved city-only backend data.
    if (
      !force &&
      lastReverseGeocodeCoordsRef.current
    ) {
      const lastLat = parseFloat(lastReverseGeocodeCoordsRef.current.lat.toFixed(6))
      const lastLng = parseFloat(lastReverseGeocodeCoordsRef.current.lng.toFixed(6))
      if (lastLat === roundedLat && lastLng === roundedLng) {
        console.log("⏭️ Skipping reverse geocode - same coordinates as last call")
        return undefined
      }
    }

    if (reverseGeocodeTimeoutRef.current) {
      clearTimeout(reverseGeocodeTimeoutRef.current)
    }

    const debounceMs = force ? 0 : 300

    return new Promise((resolve) => {
      reverseGeocodeTimeoutRef.current = setTimeout(async () => {
        lastReverseGeocodeCoordsRef.current = { lat: roundedLat, lng: roundedLng }

        setLoadingAddress(true)
        try {
        console.log("🔍 Reverse geocoding for coordinates:", { lat: roundedLat, lng: roundedLng })
        console.log("🔍 Coordinates precision:", {
          lat: roundedLat.toFixed(8),
          lng: roundedLng.toFixed(8)
        })

        let formattedAddress = ""
        let city = ""
        let state = ""
        let area = ""
        let street = ""
        let streetNumber = ""
        let postalCode = ""
        let pointOfInterest = ""
        let premise = ""

        const applyGoogleParsed = (p) => {
          formattedAddress = p.formattedAddress || ""
          city = p.city || ""
          state = p.state || ""
          area = p.area || ""
          street = p.street || ""
          streetNumber = p.streetNumber || ""
          postalCode = p.postalCode || ""
          pointOfInterest = p.pointOfInterest || ""
          premise = p.premise || ""
        }

        try {
          const parsed = await raceWithTimeout(
            reverseGeocodeWithGoogleMapsPrefer(
              roundedLat,
              roundedLng,
              GOOGLE_MAPS_API_KEY,
            ),
            12000,
            "MAP_REVERSE_TIMEOUT",
          )
          applyGoogleParsed(parsed)
        } catch (googleErr) {
          console.warn("Google Maps geocode failed, using backend:", googleErr?.message)
          try {
            const response = await raceWithTimeout(
              locationAPI.reverseGeocode(roundedLat, roundedLng, { force: true }),
              12000,
              "MAP_BACKEND_TIMEOUT",
            )
            const backendData = response?.data?.data
            const result = backendData?.results?.[0] || backendData?.result?.[0] || null

            if (result) {
              const addressComponents = result.address_components || {}
              city = addressComponents.city || ""
              state = addressComponents.state || ""
              area = addressComponents.area || ""

              const road = addressComponents.road || ""
              const houseNumber = addressComponents.house_number || ""
              const building = addressComponents.building || ""
              const postcode = addressComponents.postcode || ""

              const neighbourhood = addressComponents.neighbourhood || ""
              const suburb = addressComponents.suburb || ""
              const residential = addressComponents.residential || ""
              const quarter = addressComponents.quarter || ""
              const cityDistrict = addressComponents.city_district || ""

              street = road || ""
              streetNumber = houseNumber || ""
              pointOfInterest = building || ""

              const houseRoad = [houseNumber, road].filter(Boolean).join(" ").trim()
              const localityPrimary =
                building || houseRoad || road || area || city || "Location Found"

              const secondaryCandidate = [quarter, neighbourhood, suburb, residential, cityDistrict]
                .map((x) => (x || "").trim())
                .filter(Boolean)
                .find((x) => {
                  const c = (city || "").trim().toLowerCase()
                  return x.toLowerCase() !== c && x.toLowerCase() !== localityPrimary.toLowerCase()
                })

              formattedAddress = [
                localityPrimary,
                secondaryCandidate,
                city,
                state,
                postcode ? String(postcode) : "",
              ]
                .filter((x) => x && String(x).trim().length > 0)
                .join(", ") || ""
            }
          } catch (backendError) {
            console.error("❌ Backend reverse geocode failed:", backendError)
          }
        }

        if (formattedAddress || city || state) {
          // Build complete address if we have components
          if (!formattedAddress || formattedAddress.split(',').length < 3) {
            // Build from components
            const addressParts = []
            if (pointOfInterest) addressParts.push(pointOfInterest)
            if (premise && premise !== pointOfInterest) addressParts.push(premise)
            if (streetNumber && street) addressParts.push(`${streetNumber} ${street}`)
            else if (street) addressParts.push(street)
            else if (area) addressParts.push(area)
            if (city) addressParts.push(city)
            if (state) {
              if (postalCode) addressParts.push(`${state} ${postalCode}`)
              else addressParts.push(state)
            }
            formattedAddress = addressParts.join(', ')
          }

          // Remove "India", leading plus codes, dupes — before inferring street from segments
          if (formattedAddress && formattedAddress.endsWith(', India')) {
            formattedAddress = formattedAddress.replace(', India', '').trim()
          }
          if (formattedAddress) {
            formattedAddress = dedupeFormattedAddressLine(
              stripLeadingPlusCodeFromFormatted(formattedAddress),
            )
          }

          // Set street from formatted address if route component was missing (never use plus-code segment)
          if (!street && formattedAddress) {
            const parts = formattedAddress
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p.length > 0)
            const firstReal = parts.find((p) => !isLikelyPlusCodeOnlySegment(p))
            if (firstReal) street = firstReal
          }

          // Set area if not set
          if (!area) {
            area = pointOfInterest || premise || street || ""
          }

          console.log("✅ Final extracted address components:", {
            formattedAddress,
            street,
            city,
            state,
            area,
            postalCode,
            pointOfInterest,
            premise
          })

          // Update current address display
          setCurrentAddress(formattedAddress || `${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`)

          // Update form data
          // Store FULL formatted address in additionalDetails (Address details field) - this is what user sees
          // This should be the complete address with all parts: POI, Building, Floor, Area, City, State, Pincode
          const fullAddressForField = formattedAddress ||
            (pointOfInterest && city && state ? `${pointOfInterest}, ${city}, ${state}` : '') ||
            (premise && city && state ? `${premise}, ${city}, ${state}` : '') ||
            (street && city && state ? `${street}, ${city}, ${state}` : '') ||
            (area && city && state ? `${area}, ${city}, ${state}` : '') ||
            (city && state ? `${city}, ${state}` : '') ||
            ''
          const isGenericAddress = !fullAddressForField || /^current location(\s|,|$)/i.test(fullAddressForField.trim())
          const detailsLine = fullAddressForField
            ? cleanLocationDisplayLine(fullAddressForField)
            : ""
          setAddressFormData(prev => ({
            ...prev,
            street: street || prev.street,
            city: city || prev.city,
            state: state || prev.state,
            zipCode: postalCode || prev.zipCode,
            additionalDetails: isGenericAddress
              ? prev.additionalDetails
              : detailsLine || prev.additionalDetails,
          }))

          // requestLocation() often persists a shorter backend geocode first; this map pass has the richer line.
          // When coords match stored user (~25m), upgrade localStorage + broadcast so Home / navbar match the overlay.
          const partCount = (s) =>
            (s || "")
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean).length
          const displayAddressForStore =
            [streetNumber, street].filter(Boolean).join(" ").trim() ||
            street ||
            area ||
            (formattedAddress ? formattedAddress.split(",")[0].trim() : "")
          try {
            const prevRaw = localStorage.getItem("userLocation")
            let prev = {}
            if (prevRaw) {
              try {
                prev = JSON.parse(prevRaw) || {}
              } catch {
                prev = {}
              }
            }
            const newParts = partCount(formattedAddress)
            const oldParts = partCount(prev.formattedAddress)
            const richer =
              formattedAddress &&
              newParts >= 4 &&
              (newParts > oldParts || oldParts < 4)

            const writeMerged = (merged) => {
              if (isUnpersistableLocation(merged)) return
              if (suppressPersist) return
              localStorage.setItem("userLocation", JSON.stringify(merged))
              window.dispatchEvent(new CustomEvent("userLocationUpdated", { detail: merged }))
            }

            const mergePayload = {
              ...prev,
              latitude: roundedLat,
              longitude: roundedLng,
              city: city || prev.city || "",
              state: state || prev.state || "",
              country: prev.country || "",
              area: area || prev.area || "",
              address: displayAddressForStore,
              formattedAddress: stripTrailingIndia(formattedAddress),
              street: street || prev.street || "",
              streetNumber: streetNumber || prev.streetNumber || "",
              postalCode: postalCode || prev.postalCode || "",
              selectionSource: force ? "gps" : prev.selectionSource,
            }

            // "Use current location" passes force:true — always persist + broadcast so UI (single context) updates
            if (force && formattedAddress && newParts >= 3 && !isUnpersistableLocation(mergePayload)) {
              console.log("📍 Persisting map geocode (force) — skipping richer/sameSpot gate")
              writeMerged(mergePayload)
            } else if (prev.latitude == null || prev.longitude == null) {
              if (formattedAddress && newParts >= 4) {
                writeMerged({
                  latitude: roundedLat,
                  longitude: roundedLng,
                  city: city || "",
                  state: state || "",
                  country: prev.country || "",
                  area: area || "",
                  address: displayAddressForStore,
                  formattedAddress: stripTrailingIndia(formattedAddress),
                  street: street || "",
                  streetNumber: streetNumber || "",
                  postalCode: postalCode || "",
                  selectionSource: force ? "gps" : undefined,
                })
              }
            } else {
              const latPrev = Number(prev.latitude)
              const lngPrev = Number(prev.longitude)
              const sameSpot =
                Number.isFinite(latPrev) &&
                Number.isFinite(lngPrev) &&
                Math.abs(latPrev - roundedLat) < 0.00025 &&
                Math.abs(lngPrev - roundedLng) < 0.00025
              if (sameSpot && richer) {
                writeMerged({
                  ...prev,
                  latitude: roundedLat,
                  longitude: roundedLng,
                  city: city || prev.city || "",
                  state: state || prev.state || "",
                  country: prev.country || "",
                  area: area || prev.area || "",
                  address: displayAddressForStore,
                  formattedAddress: stripTrailingIndia(formattedAddress),
                  street: street || prev.street || "",
                  streetNumber: streetNumber || prev.streetNumber || "",
                  postalCode: postalCode || prev.postalCode || "",
                  selectionSource: force ? "gps" : prev.selectionSource,
                })
              }
            }
          } catch {
            /* ignore */
          }

          resolve({
            latitude: roundedLat,
            longitude: roundedLng,
            city: city || "",
            state: state || "",
            area: area || "",
            address: displayAddressForStore || formattedAddress || "",
            formattedAddress: stripTrailingIndia(formattedAddress),
            street: street || "",
            streetNumber: streetNumber || "",
            postalCode: postalCode || "",
            pointOfInterest: pointOfInterest || "",
            premise: premise || "",
          })
        } else {
          console.warn("⚠️ No address data found from Google Maps or backend")
          const fallbackAddress = `${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`
          setCurrentAddress(fallbackAddress)
          resolve({
            latitude: roundedLat,
            longitude: roundedLng,
            city: "",
            state: "",
            area: "",
            address: fallbackAddress,
            formattedAddress: fallbackAddress,
            street: "",
            streetNumber: "",
            postalCode: "",
            pointOfInterest: "",
            premise: "",
          })
        }
      } catch (error) {
        console.error("❌ Error reverse geocoding:", error)
        console.error("Error details:", {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        })
        const fallbackAddress = `${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`
        setCurrentAddress(fallbackAddress)
        resolve({
          latitude: roundedLat,
          longitude: roundedLng,
          city: "",
          state: "",
          area: "",
          address: fallbackAddress,
          formattedAddress: fallbackAddress,
          street: "",
          streetNumber: "",
          postalCode: "",
          pointOfInterest: "",
          premise: "",
        })
        // Don't show error toast, just use coordinates
      } finally {
        setLoadingAddress(false)
      }
      }, debounceMs)
    })
  }

  const handleSelectPlaceSuggestion = (placeId, description, lat, lng) => {
    setPlaceSuggestions([])
    setSearchValue(description || '')
    if (lat && lng) {
      setSelectedPlaceAddress(description || '')
      setMapPosition([lat, lng])
      if (greenMarkerRef.current) greenMarkerRef.current.setPosition({ lat, lng })
      if (googleMapRef.current) {
        googleMapRef.current.panTo({ lat, lng })
        googleMapRef.current.setZoom(17)
      }
      setSearchValue(description || '')
      handleMapMoveEnd(lat, lng)
    }
  }

  const applyCurrentLocationSelection = useCallback(
    async (baseLocationData, resolvedLocationData) => {
      const nextLocationData = {
        ...baseLocationData,
        ...resolvedLocationData,
        latitude: resolvedLocationData?.latitude ?? baseLocationData?.latitude,
        longitude: resolvedLocationData?.longitude ?? baseLocationData?.longitude,
        formattedAddress:
          resolvedLocationData?.formattedAddress ||
          baseLocationData?.formattedAddress ||
          resolvedLocationData?.address ||
          baseLocationData?.address ||
          "",
        address:
          resolvedLocationData?.address ||
          baseLocationData?.address ||
          resolvedLocationData?.formattedAddress ||
          baseLocationData?.formattedAddress ||
          "",
      }

      await persistRefinedLocationToBackend(nextLocationData)
      toast.success("Location updated!", { id: "current-location" })
    },
    [],
  )

  const handleUseCurrentLocationForAddress = async () => {
    setSelectedPlaceAddress('')
    try {
      if (!navigator.geolocation) {
        toast.error("Location services are not supported")
        return
      }

      toast.loading("Getting your fresh location...", { id: "current-location" })

      // Request fresh GPS location (can take a few seconds on real devices)
      // Use a longer timeout to avoid false failures.
      const locationPromise = requestLocation({ skipDatabaseUpdate: true }) // from useLocation hook
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Location timeout")), 25000),
      )

      let locationData
      try {
        locationData = await Promise.race([locationPromise, timeoutPromise])
      } catch (raceError) {
        // If timeout/failure, try to use cached location immediately
        const stored = localStorage.getItem("userLocation")
        if (stored) {
          try {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              console.log("📍 Using cached location (timeout):", cachedLocation)
              locationData = cachedLocation
            } else {
              throw new Error("Invalid cached location")
            }
          } catch {
            toast.error("Could not get location. Please try again.", { id: "current-location" })
            return
          }
        } else {
          toast.error("Could not get location. Please try again.", { id: "current-location" })
          return
        }
      }

      console.log("📍 Current location data received:", locationData)

      if (!locationData?.latitude || !locationData?.longitude) {
        toast.error("Could not get your location. Please try again.", { id: "current-location" })
        return
      }

      const lat = parseFloat(locationData.latitude)
      const lng = parseFloat(locationData.longitude)

      if (isNaN(lat) || isNaN(lng)) {
        toast.error("Invalid location coordinates", { id: "current-location" })
        return
      }

      console.log("📍 Setting map position to:", [lat, lng])
      console.log("📍 Location accuracy:", locationData.accuracy ? `${locationData.accuracy}m` : "unknown")
      console.log("📍 Location timestamp:", locationData.timestamp || new Date().toISOString())
      setMapPosition([lat, lng])

      // Update Google Maps to new location (if available)
      if (!googleMapsAuthFailed && googleMapRef.current && window.google && window.google.maps) {
        try {
          console.log("🗺️ Updating Google Map to:", { lat, lng })

          // Pan to current location
          googleMapRef.current.panTo({ lat, lng })
          googleMapRef.current.setZoom(17)

          // Update green marker position
          if (greenMarkerRef.current) {
            greenMarkerRef.current.setPosition({ lat, lng })
            console.log("✅ Updated green marker position")
          }

          // Update blue dot marker position
          if (userLocationMarkerRef.current) {
            if (userLocationMarkerRef.current.setPosition) {
              userLocationMarkerRef.current.setPosition({ lat, lng })
              console.log("✅ Updated blue dot marker position")
            } else if (userLocationMarkerRef.current.setMap) {
              // Marker exists but might not be on map, ensure it's visible
              userLocationMarkerRef.current.setMap(googleMapRef.current)
              if (userLocationMarkerRef.current.setPosition) {
                userLocationMarkerRef.current.setPosition({ lat, lng })
              }
            }
          } else if (googleMapRef.current && window.google) {
            // Create blue dot if it doesn't exist
            const blueDotMarker = new window.google.maps.Marker({
              position: { lat, lng },
              map: googleMapRef.current,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: "#4285F4",
                fillOpacity: 1,
                strokeColor: "#FFFFFF",
                strokeWeight: 4,
              },
              zIndex: window.google.maps.Marker.MAX_ZINDEX + 1,
              optimized: false,
              visible: true
            })
            userLocationMarkerRef.current = blueDotMarker
            console.log("✅ Created blue dot marker")
          }

          // Update blue dot accuracy circle position
          if (blueDotCircleRef.current) {
            blueDotCircleRef.current.setCenter({ lat, lng })
            // Update radius if accuracy is available
            const accuracyRadius = Math.max(locationData?.accuracy || 50, 20)
            blueDotCircleRef.current.setRadius(accuracyRadius)
            console.log("✅ Updated blue dot accuracy circle position and radius:", accuracyRadius)
          } else if (googleMapRef.current && window.google) {
            // Create accuracy circle if it doesn't exist
            const accuracyRadius = Math.max(locationData?.accuracy || 50, 20)
            const blueDot = new window.google.maps.Circle({
              strokeColor: "#4285F4",
              strokeOpacity: 0.5,
              strokeWeight: 2,
              fillColor: "#4285F4",
              fillOpacity: 0.2,
              map: googleMapRef.current,
              center: { lat, lng },
              radius: accuracyRadius,
              zIndex: window.google.maps.Marker.MAX_ZINDEX,
              visible: true
            })
            blueDotCircleRef.current = blueDot
            console.log("✅ Created blue dot accuracy circle")
          }

          // Wait for map to finish moving, preview the address, then only commit after confirmation.
          setTimeout(async () => {
            const resolvedLocationData = await handleMapMoveEnd(lat, lng, {
              force: true,
              suppressPersist: true,
            })
            await maybeConfirmLocationChange({
              locationData: { ...locationData, ...resolvedLocationData },
              latitude: lat,
              longitude: lng,
              applyChange: () =>
                applyCurrentLocationSelection(locationData, resolvedLocationData),
            })
          }, 200)

        } catch (mapError) {
          console.error("❌ Error updating map location:", mapError)
          toast.error("Failed to update map location", { id: "current-location" })
        }
      } else {
        // Map not initialized yet, just preview the new location and ask before applying it.
        setTimeout(async () => {
          const resolvedLocationData = await handleMapMoveEnd(lat, lng, {
            force: true,
            suppressPersist: true,
          })
          await maybeConfirmLocationChange({
            locationData: { ...locationData, ...resolvedLocationData },
            latitude: lat,
            longitude: lng,
            applyChange: () =>
              applyCurrentLocationSelection(locationData, resolvedLocationData),
          })
        }, 200)
      }
    } catch (error) {
      console.error("❌ Error getting current location:", error)

      // Check if it's a timeout error
      if (error.message && (error.message.includes("timeout") || error.message.includes("Timeout"))) {
        // Try to use cached location from localStorage
        try {
          const stored = localStorage.getItem("userLocation")
          if (stored) {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              console.log("📍 Using cached location due to timeout:", cachedLocation)
              setMapPosition([cachedLocation.latitude, cachedLocation.longitude])

              // Update Google Maps with cached location
              if (googleMapRef.current && window.google && window.google.maps) {
                try {
                  googleMapRef.current.panTo({ lat: cachedLocation.latitude, lng: cachedLocation.longitude });
                  googleMapRef.current.setZoom(17);

                  // Update markers
                  if (greenMarkerRef.current) {
                    greenMarkerRef.current.setPosition({ lat: cachedLocation.latitude, lng: cachedLocation.longitude });
                  }
                  if (blueDotCircleRef.current) {
                    blueDotCircleRef.current.setCenter({ lat: cachedLocation.latitude, lng: cachedLocation.longitude });
                  }

                  setTimeout(async () => {
                    await handleMapMoveEnd(cachedLocation.latitude, cachedLocation.longitude, { force: true });
                    await persistRefinedLocationToBackend(cachedLocation);
                    toast.success("Using cached location", { id: "current-location" });
                  }, 500);
                } catch (mapErr) {
                  console.error("Error updating map with cached location:", mapErr);
                  toast.warning("Location request timed out. Please try again.", { id: "current-location" });
                }
              } else {
                setTimeout(async () => {
                  await handleMapMoveEnd(cachedLocation.latitude, cachedLocation.longitude, { force: true })
                  await persistRefinedLocationToBackend(cachedLocation)
                  toast.success("Using cached location", { id: "current-location" })
                }, 300)
              }
              return
            }
          }
        } catch (cacheErr) {
          console.warn("Failed to use cached location:", cacheErr)
        }

        toast.warning("Location request timed out. Please try again or check your GPS settings.", { id: "current-location" })
      } else {
        toast.error("Failed to get current location: " + (error.message || "Unknown error"), { id: "current-location" })
      }
    }
  }

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()

    const trimmedAddressDetails = (addressFormData.additionalDetails || '').trim()
    if (!trimmedAddressDetails) {
      toast.error("Please enter address details (e.g. floor, house no.) to save the address")
      return
    }

    // Validate required fields (zipCode is optional)
    if (!addressFormData.street || !addressFormData.city || !addressFormData.state) {
      toast.error("Please fill in all required fields (Street, City, State)")
      return
    }

    // Validate that we have coordinates
    if (!mapPosition || mapPosition.length !== 2 || !mapPosition[0] || !mapPosition[1]) {
      toast.error("Please select a location on the map")
      return
    }

    setLoadingAddress(true)
    try {
      // Prepare address data matching backend format
      // Backend expects: label, street, additionalDetails, city, state, zipCode, latitude, longitude
      // Backend label enum: ['Home', 'Office', 'Other'] - not 'Work'
      // mapPosition is [latitude, longitude]

      // Validate and normalize label to match backend enum
      let normalizedLabel = addressFormData.label || "Home"
      if (normalizedLabel === "Work") {
        normalizedLabel = "Office" // Convert Work to Office to match backend enum
      }
      if (!["Home", "Office", "Other"].includes(normalizedLabel)) {
        normalizedLabel = "Other" // Fallback to Other if invalid
      }

      // Validate that trimmed fields are not empty
      const trimmedStreet = addressFormData.street.trim()
      const trimmedCity = addressFormData.city.trim()
      const trimmedState = addressFormData.state.trim()

      if (!trimmedStreet || !trimmedCity || !trimmedState) {
        toast.error("Street, City, and State cannot be empty")
        setLoadingAddress(false)
        return
      }

      const addressToSave = {
        label: normalizedLabel,
        street: trimmedStreet,
        additionalDetails: (addressFormData.additionalDetails || "").trim(),
        city: trimmedCity,
        state: trimmedState,
        zipCode: (addressFormData.zipCode || "").trim(),
        latitude: mapPosition[0], // latitude from mapPosition[0]
        longitude: mapPosition[1], // longitude from mapPosition[1]
        isDefault: true,
      }

      const savedAddress = await addAddress(addressToSave)
      if (savedAddress) {
        await handleSelectSavedAddress(savedAddress, { closeAfterSelect: false, showToast: false })
      }
      toast.success(`Address saved as ${normalizedLabel}!`)

      // Reset form
      setAddressFormData({
        street: "",
        city: "",
        state: "",
        zipCode: "",
        additionalDetails: "",
        label: "Home",
        phone: "",
      })
      setShowAddressForm(false)
      setLoadingAddress(false)

      // Close overlay and redirect back to caller (cart/home/etc.)
      onClose()
      navigateAfterClose("/")
      return

      // Check if an address with the same label already exists
      const existingAddressWithSameLabel = addresses.find(addr => addr.label === normalizedLabel)

      if (existingAddressWithSameLabel) {
        // Update existing address instead of creating a new one
        console.log("🔄 Updating existing address with label:", normalizedLabel)
        await updateAddress(existingAddressWithSameLabel.id, addressToSave)
        toast.success(`Address updated for ${normalizedLabel}!`)
      } else {
        // Create new address
        console.log("💾 Saving new address:", addressToSave)
        await addAddress(addressToSave)
        toast.success(`Address saved as ${normalizedLabel}!`)
      }

      // Reset form
      setAddressFormData({
        street: "",
        city: "",
        state: "",
        zipCode: "",
        additionalDetails: "",
        label: "Home",
        phone: "",
      })
      setShowAddressForm(false)
      setLoadingAddress(false)

      // Close overlay and redirect back to caller (cart/home/etc.)
      onClose()
      navigateAfterClose("/")
    } catch (error) {
      console.error("❌ Error saving address:", error)
      console.error("❌ Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        addressData: addressToSave
      })

      // Show more detailed error message
      let errorMessage = "Failed to add address. Please try again."
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.status === 400) {
        errorMessage = "Invalid address data. Please check all fields."
      } else if (error.response?.status === 500) {
        errorMessage = "Server error. Please try again later."
      }

      toast.error(errorMessage)
      setLoadingAddress(false)
    }
  }

  const handleCancelAddressForm = () => {
    teardownAddressMap()
    setShowAddressForm(false)
    setAddressFormData({
      street: "",
      city: "",
      state: "",
      zipCode: "",
      additionalDetails: "",
      label: "Home",
      phone: "",
    })
    navigateAfterClose("/")
  }

  const buildLocationDataFromAddress = (address) => {
    const coordinates = address?.location?.coordinates || []
    const longitude = coordinates[0] ?? address?.longitude ?? null
    const latitude = coordinates[1] ?? address?.latitude ?? null
    const formattedAddress = cleanLocationDisplayLine(
      [
        address?.additionalDetails,
        address?.street,
        address?.city,
        address?.state,
        address?.zipCode,
      ].filter(Boolean).join(", "),
    )
    const mainLine = cleanLocationDisplayLine(
      address?.additionalDetails ||
        [address?.street, address?.city].filter(Boolean).join(", "),
    )

    return {
      city: address?.city || "",
      state: address?.state || "",
      address: mainLine || cleanLocationDisplayLine(
        [address?.street, address?.city].filter(Boolean).join(", "),
      ),
      area: cleanLocationDisplayLine(address?.additionalDetails || "") || address?.street || "",
      zipCode: address?.zipCode || "",
      latitude,
      longitude,
      formattedAddress,
      street: address?.street || "",
      postalCode: address?.zipCode || "",
      mainTitle: mainLine.split(",")[0]?.trim() || address?.street || address?.city || "",
      selectionSource: "manual",
    }
  }

  const applySavedAddressSelection = async (address, options = {}) => {
    const { closeAfterSelect = true, showToast = true } = options
    try {
      const locationData = buildLocationDataFromAddress(address)
      const { longitude, latitude } = locationData

      if (address?.id) {
        await setDefaultAddress(address.id)
        localStorage.setItem("selectedUserAddressId", address.id)
      }

      localStorage.setItem("userLocationMode", "manual")

      if (latitude && longitude) {
        // Update location in backend
        await userAPI.updateLocation({
          latitude,
          longitude,
          address: locationData.address,
          city: locationData.city,
          state: locationData.state,
          area: locationData.area,
          postalCode: locationData.zipCode,
          street: locationData.street,
          formattedAddress: locationData.formattedAddress
        })
      }

      // Update the location in localStorage with this address
      localStorage.setItem("userLocation", JSON.stringify(locationData))
      setCurrentAddress(locationData.formattedAddress || locationData.address || "")

      // Broadcast updated location so Navbar and other components update immediately
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("userLocationUpdated", { detail: locationData }))
        }
      } catch {
        // ignore cross-window errors
      }

      // Update map position to show selected address
      setMapPosition([latitude, longitude])

      // Update address form data with selected address
      setAddressFormData({
        street: address.street || "",
        city: address.city || "",
        state: address.state || "",
        zipCode: address.zipCode || "",
        additionalDetails: address.additionalDetails || "",
        label: address.label || "Home",
        phone: address.phone || "",
      })

      // Update Google Maps to show selected address, but do not re-persist from reverse geocode here.
      // The selected saved address is the source of truth and should never be downgraded to city-level.
      if (googleMapRef.current && window.google && window.google.maps) {
        try {
          googleMapRef.current.panTo({ lat: latitude, lng: longitude })
          googleMapRef.current.setZoom(17)

          // Update green marker position
          if (greenMarkerRef.current) {
            greenMarkerRef.current.setPosition({ lat: latitude, lng: longitude })
          }

          if (showToast) {
            toast.success("Location updated!", { id: "saved-address" })
          }
        } catch (mapError) {
          console.error("Error updating map:", mapError)
          if (showToast) {
            toast.success("Location updated!", { id: "saved-address" })
          }
        }
      } else {
        if (showToast) {
          toast.success("Location updated!", { id: "saved-address" })
        }
      }

      if (closeAfterSelect) {
        onClose()
        navigateAfterClose("/")
      }
    } catch (error) {
      console.error("Error selecting saved address:", error)
      toast.error("Failed to update location. Please try again.")
    }
  }

  const handleSelectSavedAddress = async (address, options = {}) => {
    const locationData = buildLocationDataFromAddress(address)

    await maybeConfirmLocationChange({
      locationData,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      applyChange: () => applySavedAddressSelection(address, options),
    })
  }

  // Calculate distance for saved addresses
  const getAddressDistance = (address) => {
    if (!location?.latitude || !location?.longitude) return "0 m"

    const coordinates = address.location?.coordinates || []
    const addressLng = coordinates[0]
    const addressLat = coordinates[1]

    if (!addressLat || !addressLng) return "0 m"

    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      addressLat,
      addressLng
    )

    return distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`
  }

  const handleEditAddress = (addressId) => {
    // Edit address functionality removed - user can delete and add new address instead
    toast.info("To edit address, please delete and add a new one")
  }

  if (!isOpen) return null

  // If showing address form, render full-screen address form
  if (showAddressForm) {
    return (
      <div className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex flex-col h-screen max-h-screen overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCancelAddressForm}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            </Button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Select delivery location</h1>
          </div>
        </div>

        {/* Search Bar + up to 4 location suggestions dropdown */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-green-600 z-10" />
            <Input
              ref={addressFormSearchRef}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search for area, street name..."
              className="pl-12 pr-4 h-12 w-full bg-gray-50 dark:bg-[#2a2a2a] border-gray-200 dark:border-gray-700 focus:border-green-600 dark:focus:border-green-600 rounded-xl"
            />
            {(placeSuggestionsLoading || placeSuggestions.length > 0) && (
              <div className="absolute left-0 right-0 top-full mt-1 z-[100] bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
                {placeSuggestionsLoading ? (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    Searching...
                  </div>
                ) : (
                  placeSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.place_id}
                      type="button"
                      onClick={() => handleSelectPlaceSuggestion(suggestion.place_id, suggestion.description, suggestion.lat, suggestion.lng)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] border-b border-gray-100 dark:border-gray-800 last:border-b-0 transition-colors"
                    >
                      <MapPin className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-gray-900 dark:text-white">{suggestion.description}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Map Section - Google Maps (graceful fallback if blocked) */}
        <div className="flex-shrink-0 relative" style={{ height: '40vh', minHeight: '300px' }}>
          {/* Google Maps Container */}
          <div
            ref={mapContainerRef}
            className="w-full h-full bg-gray-200 dark:bg-gray-800"
            style={{
              width: '100%',
              height: '100%',
              minHeight: '300px',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 1
            }}
          />

          {/* Loading State */}
          {mapLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900 bg-opacity-75 z-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading map...</p>
              </div>
            </div>
          )}

          {/* Google Maps Auth Failure */}
          {googleMapsAuthFailed && !mapLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900 z-20">
              <div className="text-center p-4 max-w-[85%]">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Map unavailable
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Google Maps is blocked (API key / billing / domain restriction). You can still use
                  “Use current location” and save the address.
                </p>
              </div>
            </div>
          )}

          {/* API Key Missing Error */}
          {!GOOGLE_MAPS_API_KEY && !mapLoading && !googleMapsAuthFailed && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900 z-20">
              <div className="text-center p-4">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Google Maps API key not found</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Please set Google Maps key in Admin → Environment Variables</p>
              </div>
            </div>
          )}

          {/* Use Current Location Button */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
            <Button
              onClick={handleUseCurrentLocationForAddress}
              disabled={mapLoading}
              className="bg-white dark:bg-[#1a1a1a] border-2 border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 shadow-lg disabled:opacity-50 flex items-center gap-2 px-4 py-2"
            >
              <Crosshair className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" strokeWidth={2.5} />
              <span className="text-green-600 dark:text-green-400 font-medium">Use current location</span>
            </Button>
          </div>
        </div>

        {/* Form Section - Scrollable */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0a0a0a] min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="px-4 py-4 space-y-4 pb-32">
            {/* Delivery Details */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Delivery details
              </Label>
              <button
                type="button"
                onClick={() => {
                  addressFormSearchRef.current?.focus?.()
                  addressFormSearchRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
                }}
                className="w-full text-left bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center gap-3 hover:border-green-600 dark:hover:border-green-500 transition-colors"
              >
                <MapPin className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {loadingAddress ? "Locating..." : (() => {
                      const fromPlace = (selectedPlaceAddress || '').trim()
                      if (fromPlace) return fromPlace
                      const city = (addressFormData.city || '').trim()
                      const state = (addressFormData.state || '').trim()
                      const isGenericCity = /^current location$/i.test(city)
                      const selectedAddress = (currentAddress || '').trim()
                      const hasRealAddress = selectedAddress && selectedAddress !== "Select location" && !selectedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) && !/^current location(\s|,|$)/i.test(selectedAddress)
                      const fullFromForm = (addressFormData.additionalDetails || '').trim()
                      const hasFullFromForm = fullFromForm && !/^current location(\s|,|$)/i.test(fullFromForm)
                      if (hasRealAddress) return selectedAddress
                      if (hasFullFromForm) return fullFromForm
                      if (city && state && !isGenericCity) return `${city}, ${state}`
                      if (city && !isGenericCity) return city
                      if (state && !/^current location$/i.test(state)) return state
                      return "Select location on map"
                    })()}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </button>
            </div>

            {/* Address Details */}
            <div>
              <Label htmlFor="additionalDetails" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Address details*
              </Label>
              <Input
                id="additionalDetails"
                name="additionalDetails"
                placeholder="E.g. Floor, House no."
                value={addressFormData.additionalDetails}
                onChange={handleAddressFormChange}
                className="bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
              />
            </div>

            {/* Receiver Details */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Receiver details for this address
              </Label>
              <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {userProfile?.name || "User"}, {addressFormData.phone || userProfile?.phone || "Add phone"}
                  </p>
                  <Input
                    type="tel"
                    name="phone"
                    value={addressFormData.phone || ""}
                    onChange={(e) =>
                      setAddressFormData((prev) => ({
                        ...prev,
                        phone: String(e.target.value || "").replace(/\D/g, "").slice(0, 10),
                      }))
                    }
                    placeholder="Receiver phone number"
                    inputMode="numeric"
                    maxLength={10}
                    className="mt-2 bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
                  />
                </div>
              </div>
            </div>

            {/* Save Address As */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Save address as
              </Label>
              <div className="flex gap-2">
                {["Home", "Office", "Other"].map((label) => (
                  <Button
                    key={label}
                    type="button"
                    onClick={() => setAddressFormData(prev => ({ ...prev, label }))}
                    variant={addressFormData.label === label ? "default" : "outline"}
                    className={`flex-1 ${addressFormData.label === label
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-white dark:bg-[#1a1a1a]"
                      }`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Hidden required fields for form validation */}
            <div className="hidden">
              <Input
                name="street"
                value={addressFormData.street}
                onChange={handleAddressFormChange}
                required
              />
              <Input
                name="city"
                value={addressFormData.city}
                onChange={handleAddressFormChange}
                required
              />
              <Input
                name="state"
                value={addressFormData.state}
                onChange={handleAddressFormChange}
                required
              />
              {/* zipCode is optional, not required */}
              <Input
                name="zipCode"
                value={addressFormData.zipCode || ""}
                onChange={handleAddressFormChange}
              />
            </div>
          </div>
        </div>

        {/* Save Address Button */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 px-4 py-4">
          <form onSubmit={handleAddressFormSubmit}>
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
              disabled={loadingAddress}
            >
              {loadingAddress ? "Loading..." : "Save address"}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]"
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                onClose()
                navigateAfterClose("/")
              }}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 -ml-2"
            >
              <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            </Button>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Select a location</h1>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] px-4 sm:px-6 lg:px-8 py-3 max-w-7xl mx-auto w-full">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary-orange z-10" />
          <Input
            ref={inputRef}
            value={searchValue}
            onClick={handleAddAddress}
            readOnly
            placeholder="Search for area, street name..."
            className="pl-12 pr-4 h-12 w-full bg-gray-50 dark:bg-[#2a2a2a] border-gray-200 dark:border-gray-700 focus:border-primary-orange dark:focus:border-primary-orange rounded-xl text-base dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
        <div className="max-w-7xl mx-auto w-full pb-6">
          {/* Use Current Location */}
          <div
            className="px-4 sm:px-6 lg:px-8 py-2 bg-white dark:bg-[#1a1a1a]"
            style={{ animation: 'slideDown 0.3s ease-out 0.1s both' }}
          >
            <button
              onClick={handleUseCurrentLocation}
              disabled={loading}
              className="w-full flex items-center justify-between py-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
                  <Crosshair className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" strokeWidth={2.5} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-green-700 dark:text-green-400">Use current location</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {useCurrentLocationSubtitle}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </button>

            {/* Add Address */}
            <button
              onClick={handleAddAddress}
              className="w-full flex items-center justify-between py-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors group border-t border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
                  <Plus className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="font-semibold text-green-700 dark:text-green-400">Add Address</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </button>
          </div>

          {/* Saved Addresses Section */}
          {addresses.length > 0 && (
            <div
              className="mt-2"
              style={{ animation: 'slideDown 0.3s ease-out 0.2s both' }}
            >
              <div className="px-4 sm:px-6 lg:px-8 py-3">
                <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">
                  Saved Addresses
                </h2>
              </div>
              <div className="bg-white dark:bg-[#1a1a1a]">
                {addresses
                  .map((address, index) => {
                    const IconComponent = getAddressIcon(address)
                    return (
                      <div
                        key={address.id}
                        className="px-4 sm:px-6 lg:px-8"
                        style={{ animation: `slideUp 0.3s ease-out ${0.25 + index * 0.05}s both` }}
                      >
                        <div
                          className={`py-4 ${index !== 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}
                        >
                          <button
                            onClick={() => handleSelectSavedAddress(address)}
                            className="w-full flex items-start gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors p-2 -m-2"
                          >
                            <div className="flex flex-col items-center">
                              <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <IconComponent className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {address.label || address.additionalDetails || "Home"}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {cleanLocationDisplayLine(
                                  [
                                    address.additionalDetails,
                                    address.street,
                                    address.city,
                                    address.state,
                                    address.zipCode,
                                  ]
                                    .filter(Boolean)
                                    .join(", "),
                                )}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Phone number: {address.phone || userProfile?.phone || "Not provided"}
                              </p>
                            </div>
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      <ReplaceCartModal
        isOpen={!!pendingLocationChange}
        mode="location"
        cartRestaurantName={pendingLocationChange?.cartRestaurantName}
        itemCount={pendingLocationChange?.itemCount || 0}
        currentZoneName={pendingLocationChange?.currentZoneName}
        currentAddress={pendingLocationChange?.currentAddress}
        onReplace={handleConfirmPendingLocationChange}
        onCancel={handleCancelPendingLocationChange}
      />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        /* Blue Dot Indicator for Live Location */
        .user-location-marker {
          width: 20px !important;
          height: 20px !important;
          background-color: #4285F4 !important; /* Google Blue */
          border: 3px solid white !important;
          border-radius: 50% !important;
          box-shadow: 0 0 10px rgba(0,0,0,0.3) !important;
          position: relative !important;
          transition: transform 0.3s ease;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 1001 !important;
          pointer-events: none;
        }
        
        /* Ensure marker container is also visible */
        .mapboxgl-marker.user-location-marker,
        .maplibregl-marker.user-location-marker {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 1001 !important;
        }
        
        /* Arrow indicator pointing in direction of movement */
        .user-location-marker::before {
          content: "";
          position: absolute;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-bottom: 8px solid #4285F4;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
        }
        
        /* Pulsing Aura Effect */
        .user-location-marker::after {
          content: "";
          position: absolute;
          width: 40px;
          height: 40px;
          top: -13px;
          left: -13px;
          background-color: rgba(66, 133, 244, 0.2);
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
