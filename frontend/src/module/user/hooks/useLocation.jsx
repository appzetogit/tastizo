import { useState, useEffect, useRef, createContext, useContext } from "react"
import { locationAPI, userAPI } from "@/lib/api"
import {
  hasDetailedAddress,
  isAcceptableGeocodeResult,
  isUnpersistableLocation,
} from "@/lib/userLocationDisplay"

/** Haversine distance in meters (WGS84). */
function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/** Skip automatic re-geocode / DB write when GPS is within this distance of last saved location. */
const MOVE_THRESHOLD_METERS = 100
const LOCATION_MODE_KEY = "userLocationMode"
const LOCATION_MODE_MANUAL = "manual"
const LOCATION_MODE_GPS = "gps"

function isUserFacingRoute(pathname) {
  if (!pathname || pathname === "/") return true
  if (pathname.startsWith("/user") || pathname.startsWith("/usermain")) return true
  if (pathname.startsWith("/restaurants")) return true
  if (pathname.startsWith("/admin")) return false
  if (pathname.startsWith("/delivery")) return false
  if (pathname.startsWith("/restaurant")) return false
  return true
}

function getStoredLocationMode() {
  if (typeof window === "undefined") return LOCATION_MODE_GPS
  try {
    return localStorage.getItem(LOCATION_MODE_KEY) === LOCATION_MODE_MANUAL
      ? LOCATION_MODE_MANUAL
      : LOCATION_MODE_GPS
  } catch {
    return LOCATION_MODE_GPS
  }
}

function setStoredLocationMode(mode) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      LOCATION_MODE_KEY,
      mode === LOCATION_MODE_MANUAL ? LOCATION_MODE_MANUAL : LOCATION_MODE_GPS,
    )
  } catch {
    // ignore storage errors
  }
}

/** Single shared geolocation state for the whole app (navbar, Home, overlay, etc.). */
export const UserGeoLocationContext = createContext(null)

function useUserGeoLocationEngine() {
  const IS_DEV = import.meta.env.MODE === "development"
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  const watchIdRef = useRef(null)
  const updateTimerRef = useRef(null)
  const prevLocationCoordsRef = useRef({ latitude: null, longitude: null })
  const locationRef = useRef(null)
  /** Incremented on each startWatchingLocation so stale watch callbacks cannot overwrite state. */
  const watchGenerationRef = useRef(0)
  /** After "Use current location" / requestLocation(), bypass distance/coord stability so UI updates. */
  const forceExplicitRefreshRef = useRef(false)
  const forceExplicitRefreshTimerRef = useRef(null)
  const locationModeRef = useRef(getStoredLocationMode())

  const stampLocation = (loc) =>
    loc && typeof loc === "object" ? { ...loc, updatedAt: Date.now() } : loc

  const normalizeLocationPayload = (loc) => {
    if (!loc || typeof loc !== "object") return loc
    return {
      ...loc,
      city: (loc.city || "").trim(),
      state: (loc.state || "").trim(),
      area: (loc.area || "").trim(),
      address: (loc.address || "").trim(),
      formattedAddress: (loc.formattedAddress || loc.address || "").trim(),
      mainTitle: (loc.mainTitle || "").trim(),
      street: (loc.street || "").trim(),
      streetNumber: (loc.streetNumber || "").trim(),
    }
  }

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    return () => {
      if (forceExplicitRefreshTimerRef.current) {
        clearTimeout(forceExplicitRefreshTimerRef.current)
        forceExplicitRefreshTimerRef.current = null
      }
    }
  }, [])

  // Broadcast for same-tab listeners and any code that only listens to the event
  const dispatchLocationUpdated = (locationData) => {
    if (!locationData || typeof window === "undefined") return
    if (isUnpersistableLocation(locationData)) return
    try {
      const payload = {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        city: locationData.city,
        state: locationData.state,
        area: locationData.area,
        address: locationData.address,
        formattedAddress: locationData.formattedAddress || locationData.address,
        ...locationData
      }
      window.dispatchEvent(new CustomEvent("userLocationUpdated", { detail: payload }))
    } catch {
      // ignore
    }
  }

  /* ===================== DB UPDATE (LIVE LOCATION TRACKING) ===================== */
  const updateLocationInDB = async (locationData) => {
    try {
      if (isUnpersistableLocation(locationData)) {
        console.log("Skipping DB update - incomplete location payload:", {
          city: locationData?.city,
          address: locationData?.address,
          formattedAddress: locationData?.formattedAddress,
        })
        return
      }

      // Check if user is authenticated before trying to update DB
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        // User not logged in - skip DB update, just use localStorage
        console.log("â„¹ï¸ User not authenticated, skipping DB update (using localStorage only)")
        return
      }

      // Prepare complete location data for database storage
      const locationPayload = {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address || "",
        city: locationData.city || "",
        state: locationData.state || "",
        area: locationData.area || "",
        formattedAddress: locationData.formattedAddress || locationData.address || "",
      }

      // Add optional fields if available
      if (locationData.accuracy !== undefined && locationData.accuracy !== null) {
        locationPayload.accuracy = locationData.accuracy
      }
      if (locationData.postalCode) {
        locationPayload.postalCode = locationData.postalCode
      }
      if (locationData.street) {
        locationPayload.street = locationData.street
      }
      if (locationData.streetNumber) {
        locationPayload.streetNumber = locationData.streetNumber
      }

      console.log("ðŸ’¾ Updating live location in database:", {
        coordinates: `${locationPayload.latitude}, ${locationPayload.longitude}`,
        formattedAddress: locationPayload.formattedAddress,
        city: locationPayload.city,
        area: locationPayload.area,
        accuracy: locationPayload.accuracy
      })

      await userAPI.updateLocation(locationPayload)

      console.log("âœ… Live location successfully stored in database")
    } catch (err) {
      // Only log non-network and non-auth errors
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
        console.error("âŒ DB location update error:", err)
      } else if (err.response?.status === 404 || err.response?.status === 401) {
        // 404 or 401 means user not authenticated or route doesn't exist
        // Silently skip - this is expected for non-authenticated users
        console.log("â„¹ï¸ Location update skipped (user not authenticated or route not available)")
      }
    }
  }

  /* ===================== DIRECT REVERSE GEOCODE (providerâ€‘agnostic fallback, no external APIs) ===================== */
  const reverseGeocodeDirect = async (latitude, longitude) => {
    const coordsString = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    return {
      city: "Current Location",
      state: "",
      country: "",
      area: "",
      address: coordsString,
      formattedAddress: coordsString,
    }
  }

  /* ===================== GOOGLE MAPS REVERSE GEOCODE (now using Google directly on client) ===================== */
  const reverseGeocodeWithGoogleMaps = async (latitude, longitude) => {
    try {
      // Use backend reverse geocode API (free Nominatim, zero Google Maps cost)
      const res = await locationAPI.reverseGeocode(latitude, longitude, { force: true });
      const backendData = res?.data?.data || {};
      let result = null;
      if (backendData.results && Array.isArray(backendData.results) && backendData.results.length > 0) {
        result = backendData.results[0];
      } else {
        result = backendData;
      }

      if (!result) {
        throw new Error("Backend reverse geocode returned no results");
      }

      const addrComp = result.address_components || {}
      const city = (addrComp.city || "").trim()
      const state = (addrComp.state || "").trim()
      const areaCompound = (addrComp.area || "").trim()
      const road = addrComp.road || ""
      const houseNumber = addrComp.house_number || ""
      const building = addrComp.building || ""
      const postcode = addrComp.postcode || ""

      const neighbourhood = addrComp.neighbourhood || ""
      const suburb = addrComp.suburb || ""
      const residential = addrComp.residential || ""
      const quarter = addrComp.quarter || ""
      const cityDistrict = addrComp.city_district || ""

      const cityLc = city.toLowerCase()
      const isGenericCityLabel = (s) => {
        const v = (s || "").trim().toLowerCase()
        if (!v || !cityLc) return false
        return v === cityLc || v === `${cityLc} city` || v === `${cityLc} district`
      }

      const granular =
        [neighbourhood, suburb, quarter, residential, cityDistrict].find((x) => (x || "").trim()) || ""

      const sublocalForArea =
        granular || (!isGenericCityLabel(areaCompound) ? areaCompound : "")

      const houseRoad = [houseNumber, road].filter(Boolean).join(" ").trim()
      const localityPrimary =
        building ||
        houseRoad ||
        road ||
        sublocalForArea ||
        (!isGenericCityLabel(areaCompound) ? areaCompound : "") ||
        city ||
        "Location Found"

      const secondaryCandidate = [quarter, neighbourhood, suburb, residential, cityDistrict]
        .map((p) => (p || "").trim())
        .filter(Boolean)
        .find((p) => {
          return (
            p.toLowerCase() !== cityLc &&
            p.toLowerCase() !== localityPrimary.toLowerCase()
          )
        })

      const formattedParts = [
        localityPrimary,
        secondaryCandidate,
        city,
        state,
      ].filter((p) => p && String(p).trim().length > 0)
      if (postcode) formattedParts.push(postcode)

      const apiFormatted = (result.formatted_address || "").trim().replace(/,\s*India\s*$/i, "")
      const built = formattedParts.join(", ")
      let formattedAddressExact = built
      if (apiFormatted && apiFormatted.split(",").length >= 3) {
        formattedAddressExact = apiFormatted
      } else if (!formattedAddressExact) {
        formattedAddressExact = apiFormatted || `${latitude}, ${longitude}`
      }

      const displayAddress = localityPrimary
      const mainTitle =
        building ||
        granular ||
        (!isGenericCityLabel(areaCompound) ? areaCompound : "") ||
        (localityPrimary && localityPrimary !== city ? localityPrimary : null) ||
        null

      return {
        city,
        state,
        area: sublocalForArea,
        address: displayAddress,
        formattedAddress: formattedAddressExact,
        street: road,
        streetNumber: houseNumber || "",
        postalCode: postcode,
        mainTitle: mainTitle || null,
        pointOfInterest: building || null,
        premise: null,
        placeId: null,
        placeName: building || null,
        phone: null,
        website: null,
        rating: null,
        openingHours: null,
        photos: null,
        hasPlaceDetails: false,
        placeTypes: []
      };
    } catch (backendError) {
      // Do NOT call Nominatim directly from frontend (causes 429 + leaks provider usage).
      // Backend has caching + fallback providers and must be the only place doing reverse geocode.
      console.warn("Backend reverse geocode failed, using coordinates-only fallback:", backendError.message);
      return reverseGeocodeDirect(latitude, longitude);
    }
  };

  // REMOVED: ~700 lines of old Google Maps + Places API code
  // Now using free Nominatim (OpenStreetMap) via backend API

  /* ===================== OLA MAPS REVERSE GEOCODE (DEPRECATED - KEPT FOR FALLBACK) ===================== */
  const reverseGeocodeWithOLAMaps = async (latitude, longitude) => {
    try {
      console.log("ðŸ” Fetching address from OLA Maps for:", latitude, longitude)

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OLA Maps API timeout")), 10000)
      )

      const apiPromise = locationAPI.reverseGeocode(latitude, longitude)
      const res = await Promise.race([apiPromise, timeoutPromise])

      // Log full response for debugging
      console.log("ðŸ“¦ Full OLA Maps API Response:", JSON.stringify(res?.data, null, 2))

      // Check if response is valid
      if (!res || !res.data) {
        throw new Error("Invalid response from OLA Maps API")
      }

      // Check if API call was successful
      if (res.data.success === false) {
        throw new Error(res.data.message || "OLA Maps API returned error")
      }

      // Backend returns: { success: true, data: { results: [{ formatted_address, address_components: { city, state, country, area } }] } }
      const backendData = res?.data?.data || {}

      // Debug: Check backend data structure
      console.log("ðŸ” Backend data structure:", {
        hasResults: !!backendData.results,
        hasResult: !!backendData.result,
        keys: Object.keys(backendData),
        dataType: typeof backendData,
        backendData: JSON.stringify(backendData, null, 2).substring(0, 500) // First 500 chars
      })

      // Handle different OLA Maps response structures
      // Backend processes OLA Maps response and returns: { results: [{ formatted_address, address_components: { city, state, area } }] }
      let result = null;
      if (backendData.results && Array.isArray(backendData.results) && backendData.results.length > 0) {
        result = backendData.results[0];
        console.log("âœ… Using results[0] from backend")
      } else if (backendData.result && Array.isArray(backendData.result) && backendData.result.length > 0) {
        result = backendData.result[0];
        console.log("âœ… Using result[0] from backend")
      } else if (backendData.results && !Array.isArray(backendData.results)) {
        result = backendData.results;
        console.log("âœ… Using results object from backend")
      } else {
        result = backendData;
        console.log("âš ï¸ Using backendData directly (fallback)")
      }

      if (!result) {
        console.warn("âš ï¸ No result found in backend data")
        result = {};
      }

      console.log("ðŸ“¦ Parsed result:", {
        hasFormattedAddress: !!result.formatted_address,
        hasAddressComponents: !!result.address_components,
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components
      })

      // Extract address_components - handle both object and array formats
      let addressComponents = {};
      if (result.address_components) {
        if (Array.isArray(result.address_components)) {
          // Google Maps style array
          result.address_components.forEach(comp => {
            const types = comp.types || [];
            if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
              addressComponents.area = comp.long_name || comp.short_name;
            } else if (types.includes('neighborhood') && !addressComponents.area) {
              addressComponents.area = comp.long_name || comp.short_name;
            } else if (types.includes('locality')) {
              addressComponents.city = comp.long_name || comp.short_name;
            } else if (types.includes('administrative_area_level_1')) {
              addressComponents.state = comp.long_name || comp.short_name;
            } else if (types.includes('country')) {
              addressComponents.country = comp.long_name || comp.short_name;
            }
          });
        } else {
          // Object format
          addressComponents = result.address_components;
        }
      } else if (result.components) {
        addressComponents = result.components;
      }

      console.log("ðŸ“¦ Parsed result structure:", {
        result,
        addressComponents,
        hasArrayComponents: Array.isArray(result.address_components),
        hasObjectComponents: !Array.isArray(result.address_components) && !!result.address_components
      })

      // Extract address details - try multiple possible response structures
      let city = addressComponents?.city ||
        result?.city ||
        result?.locality ||
        result?.address_components?.city ||
        ""

      let state = addressComponents?.state ||
        result?.state ||
        result?.administrative_area_level_1 ||
        result?.address_components?.state ||
        ""

      let country = addressComponents?.country ||
        result?.country ||
        result?.country_name ||
        result?.address_components?.country ||
        ""

      let formattedAddress = result?.formatted_address ||
        result?.formattedAddress ||
        result?.address ||
        ""

      // PRIORITY 1: Extract area from formatted_address FIRST (most reliable for Indian addresses)
      // Indian address format: "Area, City, State" e.g., "New Palasia, Indore, Madhya Pradesh"
      // ALWAYS try formatted_address FIRST - it's the most reliable source and preserves full names like "New Palasia"
      let area = ""
      if (formattedAddress) {
        const addressParts = formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)

        console.log("ðŸ” Parsing formatted address for area:", { formattedAddress, addressParts, city, state, currentArea: area })

        // ZOMATO-STYLE: If we have 3+ parts, first part is ALWAYS the area/locality
        // Format: "New Palasia, Indore, Madhya Pradesh" -> area = "New Palasia"
        if (addressParts.length >= 3) {
          const firstPart = addressParts[0]
          const secondPart = addressParts[1] // Usually city
          const thirdPart = addressParts[2]  // Usually state

          // First part is the area (e.g., "New Palasia")
          // Second part is usually city (e.g., "Indore")
          // Third part is usually state (e.g., "Madhya Pradesh")
          if (firstPart && firstPart.length > 2 && firstPart.length < 50) {
            // Make sure first part is not the same as city or state
            const firstLower = firstPart.toLowerCase()
            const cityLower = (city || secondPart || "").toLowerCase()
            const stateLower = (state || thirdPart || "").toLowerCase()

            if (firstLower !== cityLower &&
              firstLower !== stateLower &&
              !firstPart.match(/^\d+/) && // Not a number
              !firstPart.match(/^\d+\s*(km|m|meters?)$/i) && // Not a distance
              !firstLower.includes("district") && // Not a district name
              !firstLower.includes("city")) { // Not a city name
              area = firstPart
              console.log("âœ…âœ…âœ… EXTRACTED AREA from formatted address (3+ parts):", area)

              // Also update city if second part matches better
              if (secondPart && (!city || secondPart.toLowerCase() !== city.toLowerCase())) {
                city = secondPart
              }
              // Also update state if third part matches better
              if (thirdPart && (!state || thirdPart.toLowerCase() !== state.toLowerCase())) {
                state = thirdPart
              }
            }
          }
        } else if (addressParts.length === 2 && !area) {
          // Two parts: Could be "Area, City" or "City, State"
          const firstPart = addressParts[0]
          const secondPart = addressParts[1]

          // Check if first part is city (if we already have city name)
          const isFirstCity = city && firstPart.toLowerCase() === city.toLowerCase()

          // If first part is NOT the city, it's likely the area
          if (!isFirstCity &&
            firstPart.length > 2 &&
            firstPart.length < 50 &&
            !firstPart.toLowerCase().includes("district") &&
            !firstPart.toLowerCase().includes("city") &&
            !firstPart.match(/^\d+/)) {
            area = firstPart
            console.log("âœ… Extracted area from 2 part address:", area)
            // Update city if second part exists
            if (secondPart && !city) {
              city = secondPart
            }
          } else if (isFirstCity) {
            // First part is city, second part might be state
            // No area in this case, but update state if needed
            if (secondPart && !state) {
              state = secondPart
            }
          }
        } else if (addressParts.length === 1 && !area) {
          // Single part - could be just city or area
          const singlePart = addressParts[0]
          if (singlePart && singlePart.length > 2 && singlePart.length < 50) {
            // If it doesn't match city exactly, it might be an area
            if (!city || singlePart.toLowerCase() !== city.toLowerCase()) {
              // Don't use as area if it looks like a city name (contains common city indicators)
              if (!singlePart.toLowerCase().includes("city") &&
                !singlePart.toLowerCase().includes("district")) {
                // Could be area, but be cautious - only use if we're sure
                console.log("âš ï¸ Single part address - ambiguous, not using as area:", singlePart)
              }
            }
          }
        }
      }

      // PRIORITY 2: If still no area from formatted_address, try from address_components (fallback)
      // Note: address_components might have incomplete/truncated names like "Palacia" instead of "New Palasia"
      // So we ALWAYS prefer formatted_address extraction over address_components
      if (!area && addressComponents) {
        // Try all possible area fields (but exclude state and generic names!)
        const possibleAreaFields = [
          addressComponents.sublocality,
          addressComponents.sublocality_level_1,
          addressComponents.neighborhood,
          addressComponents.sublocality_level_2,
          addressComponents.locality,
          addressComponents.area, // Check area last
        ].filter(field => {
          // Filter out invalid/generic area names
          if (!field) return false
          const fieldLower = field.toLowerCase()
          return fieldLower !== state.toLowerCase() &&
            fieldLower !== city.toLowerCase() &&
            !fieldLower.includes("district") &&
            !fieldLower.includes("city") &&
            field.length > 3 // Minimum length
        })

        if (possibleAreaFields.length > 0) {
          const fallbackArea = possibleAreaFields[0]
          // CRITICAL: If formatted_address exists and has a different area, prefer formatted_address
          // This ensures "New Palasia" from formatted_address beats "Palacia" from address_components
          if (formattedAddress && formattedAddress.toLowerCase().includes(fallbackArea.toLowerCase())) {
            // formatted_address contains the fallback area, so it's likely more complete
            // Try one more time to extract from formatted_address
            console.log("âš ï¸ address_components has area but formatted_address might have full name, re-checking formatted_address")
          } else {
            area = fallbackArea
            console.log("âœ… Extracted area from address_components (fallback):", area)
          }
        }
      }

      // Also check address_components array structure (Google Maps style)
      if (!area && result?.address_components && Array.isArray(result.address_components)) {
        const components = result.address_components
        // Find sublocality or neighborhood in the components array
        const sublocality = components.find(comp =>
          comp.types?.includes('sublocality') ||
          comp.types?.includes('sublocality_level_1') ||
          comp.types?.includes('neighborhood')
        )
        if (sublocality?.long_name || sublocality?.short_name) {
          area = sublocality.long_name || sublocality.short_name
        }
      }

      // FINAL FALLBACK: If area is still empty, force extract from formatted_address
      // This is the last resort - be very aggressive (ZOMATO-STYLE)
      // Even if formatted_address only has 2 parts (City, State), try to extract area
      if (!area && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)
        console.log("ðŸ” Final fallback: Parsing formatted_address for area", { parts, city, state })

        if (parts.length >= 2) {
          const potentialArea = parts[0]
          // Very lenient check - if it's not obviously city/state, use it as area
          const potentialAreaLower = potentialArea.toLowerCase()
          const cityLower = (city || "").toLowerCase()
          const stateLower = (state || "").toLowerCase()

          if (potentialArea &&
            potentialArea.length > 2 &&
            potentialArea.length < 50 &&
            !potentialArea.match(/^\d+/) &&
            potentialAreaLower !== cityLower &&
            potentialAreaLower !== stateLower &&
            !potentialAreaLower.includes("district") &&
            !potentialAreaLower.includes("city")) {
            area = potentialArea
            console.log("âœ…âœ…âœ… FORCE EXTRACTED area (final fallback):", area)
          }
        }
      }

      // Final validation and logging
      console.log("âœ…âœ…âœ… FINAL PARSED OLA Maps response:", {
        city,
        state,
        country,
        area,
        formattedAddress,
        hasArea: !!area,
        areaLength: area?.length || 0
      })

      // CRITICAL: If formattedAddress has only 2 parts, OLA Maps didn't provide sublocality
      // Try to get more detailed location using coordinates-based search
      if (!area && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)

        // If we have 3+ parts, extract area from first part
        if (parts.length >= 3) {
          // ZOMATO PATTERN: "New Palasia, Indore, Madhya Pradesh"
          // First part = Area, Second = City, Third = State
          const potentialArea = parts[0]
          // Validate it's not state, city, or generic names
          const potentialAreaLower = potentialArea.toLowerCase()
          if (potentialAreaLower !== state.toLowerCase() &&
            potentialAreaLower !== city.toLowerCase() &&
            !potentialAreaLower.includes("district") &&
            !potentialAreaLower.includes("city")) {
            area = potentialArea
            if (!city && parts[1]) city = parts[1]
            if (!state && parts[2]) state = parts[2]
            console.log("âœ…âœ…âœ… ZOMATO-STYLE EXTRACTION:", { area, city, state })
          }
        } else if (parts.length === 2) {
          // Only 2 parts: "Indore, Madhya Pradesh" - area is missing
          // OLA Maps API didn't provide sublocality
          console.warn("âš ï¸ Only 2 parts in address - OLA Maps didn't provide sublocality")
          // Try to extract from other fields in the response
          // Check if result has any other location fields
          if (result.locality && result.locality !== city) {
            area = result.locality
            console.log("âœ… Using locality as area:", area)
          } else if (result.neighborhood) {
            area = result.neighborhood
            console.log("âœ… Using neighborhood as area:", area)
          } else {
            // Leave area empty - will show city instead
            area = ""
          }
        }
      }

      // FINAL VALIDATION: Never use state as area!
      if (area && state && area.toLowerCase() === state.toLowerCase()) {
        console.warn("âš ï¸âš ï¸âš ï¸ REJECTING area (same as state):", area)
        area = ""
      }

      // FINAL VALIDATION: Reject district names
      if (area && area.toLowerCase().includes("district")) {
        console.warn("âš ï¸âš ï¸âš ï¸ REJECTING area (contains district):", area)
        area = ""
      }

      // If we have a valid formatted address or city, return it
      if (formattedAddress || city) {
        const finalLocation = {
          city: city || "",
          state: state || "",
          country: country || "",
          area: area || "", // Area is CRITICAL - must be extracted
          address: formattedAddress || `${city || "Current Location"}`,
          formattedAddress: formattedAddress || `${city || "Current Location"}`,
        }

        console.log("âœ…âœ…âœ… RETURNING LOCATION DATA:", finalLocation)
        return finalLocation
      }

      // If no valid data, throw to trigger fallback
      throw new Error("No valid address data from OLA Maps")
    } catch (err) {
      console.warn("âš ï¸ Google Maps failed, trying direct geocoding:", err.message)
      // Fallback to direct reverse geocoding (no Google Maps dependency)
      try {
        return await reverseGeocodeWithGoogleMaps(latitude, longitude)
      } catch (fallbackErr) {
        // If all fail, return minimal location data
        console.error("âŒ All reverse geocoding failed:", fallbackErr)
        return {
          city: "Current Location",
          address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        }
      }
    }
  }

  /* ===================== DB FETCH ===================== */
  const fetchLocationFromDB = async () => {
    try {
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        return null
      }

      const res = await userAPI.getLocation()
      const loc = res?.data?.data?.location
      if (!loc?.latitude || !loc?.longitude) {
        return null
      }

      const lat = Number(loc.latitude)
      const lng = Number(loc.longitude)
      const isInIndiaRange = lat >= 6.5 && lat <= 37.1 && lng >= 68.7 && lng <= 97.4 && lng > 0

      if (!isInIndiaRange || lng < 0) {
        console.warn("Coordinates from DB are outside India range:", { latitude: lat, longitude: lng })
        return {
          latitude: lat,
          longitude: lng,
          city: "Current Location",
          state: "",
          area: "",
          address: "Select location",
          formattedAddress: "Select location",
        }
      }

      const fa = (loc.formattedAddress || "").trim()
      const coordLike = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(fa)
      const hasSavedLine = fa && fa !== "Select location" && !coordLike

      if (hasSavedLine) {
        const mapped = {
          latitude: lat,
          longitude: lng,
          address: (loc.address || "").trim() || fa,
          city: (loc.city || "").trim(),
          state: (loc.state || "").trim(),
          area: (loc.area || "").trim(),
          formattedAddress: fa,
          postalCode: (loc.postalCode || "").trim(),
          street: (loc.street || "").trim(),
          streetNumber: (loc.streetNumber || "").trim(),
        }
        if (loc.accuracy != null && loc.accuracy !== undefined) {
          mapped.accuracy = loc.accuracy
        }
        console.log("📂 Hydrating from database saved address (matches UI after refresh)")
        return mapped
      }

      try {
        const addr = await reverseGeocodeWithGoogleMaps(lat, lng)
        return { ...addr, latitude: lat, longitude: lng }
      } catch (geocodeErr) {
        console.warn("Reverse geocoding failed in fetchLocationFromDB:", geocodeErr.message)
        return {
          latitude: lat,
          longitude: lng,
          city: (loc.city || "Current Location").trim() || "Current Location",
          area: (loc.area || "").trim(),
          state: (loc.state || "").trim(),
          address: (loc.address || "Select location").trim() || "Select location",
          formattedAddress: fa || (loc.address || "Select location").trim() || "Select location",
        }
      }
    } catch (err) {
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
        console.error("DB location fetch error:", err)
      }
    }
    return null
  }

  /* ===================== MAIN LOCATION ===================== */
  const getLocation = async (updateDB = true, forceFresh = false, showLoading = false, geoOptions = {}) => {
    const { forceBypassMoveThreshold = false } = geoOptions
    // If not forcing fresh, try DB first (faster)
    let dbLocation = !forceFresh ? await fetchLocationFromDB() : null
    if (dbLocation && !forceFresh) {
      setLocation(dbLocation)
      if (showLoading) setLoading(false)
      return dbLocation
    }

    if (!navigator.geolocation) {
      setError("Geolocation not supported")
      if (showLoading) setLoading(false)
      return dbLocation
    }

    // Helper function to get position with retry mechanism
    const getPositionWithRetry = (options, retryCount = 0) => {
      return new Promise((resolve, reject) => {
        const isRetry = retryCount > 0
        console.log(`ðŸ“ Requesting location${isRetry ? ' (retry with lower accuracy)' : ' (high accuracy)'}...`)
        console.log(`ðŸ“ Force fresh: ${forceFresh ? 'YES' : 'NO'}, maximumAge: ${options.maximumAge || (forceFresh ? 0 : 60000)}`)

        // Use cached location if available and not too old (faster response)
        // If forceFresh is true, don't use cache (maximumAge: 0)
        const cachedOptions = {
          ...options,
          maximumAge: forceFresh ? 0 : (options.maximumAge || 60000), // If forceFresh, get fresh location
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude, accuracy } = pos.coords
              const timestamp = pos.timestamp || Date.now()

              console.log(`âœ… Got location${isRetry ? ' (lower accuracy)' : ' (high accuracy)'}:`, {
                latitude,
                longitude,
                accuracy: `${accuracy}m`,
                timestamp: new Date(timestamp).toISOString(),
                coordinates: `${latitude.toFixed(8)}, ${longitude.toFixed(8)}`
              })

              if (!forceBypassMoveThreshold) {
                let baseline = locationRef.current
                if (!baseline?.latitude) {
                  try {
                    const raw = localStorage.getItem("userLocation")
                    if (raw) baseline = JSON.parse(raw)
                  } catch {
                    /* ignore */
                  }
                }
                if (
                  baseline?.latitude != null &&
                  baseline?.longitude != null &&
                  hasDetailedAddress(baseline)
                ) {
                  const moved = haversineDistanceMeters(
                    latitude,
                    longitude,
                    Number(baseline.latitude),
                    Number(baseline.longitude),
                  )
                  if (moved < MOVE_THRESHOLD_METERS) {
                    console.log(
                      `📍 GPS moved only ${moved.toFixed(1)}m (<${MOVE_THRESHOLD_METERS}m) — keeping saved address, skip geocode/DB`,
                    )
                    if (showLoading) setLoading(false)
                    setError(null)
                    resolve(baseline)
                    return
                  }
                }
              }

              // Validate coordinates are in India range BEFORE attempting geocoding
              // India: Latitude 6.5Â° to 37.1Â° N, Longitude 68.7Â° to 97.4Â° E
              const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

              // Get address from Google Maps API
              let addr
              if (!isInIndiaRange || longitude < 0) {
                // Coordinates are outside India - skip geocoding and use placeholder
                console.warn("âš ï¸ Coordinates outside India range, skipping geocoding:", { latitude, longitude })
                addr = {
                  city: "Current Location",
                  state: "",
                  country: "",
                  area: "",
                  address: "Select location",
                  formattedAddress: "Select location",
                }
              } else {
                console.log("ðŸ” Calling reverse geocode with coordinates:", { latitude, longitude })
                try {
                  // Try Google Maps first
                  addr = await reverseGeocodeWithGoogleMaps(latitude, longitude)
                  console.log("âœ… Google Maps geocoding successful:", addr)
                } catch (geocodeErr) {
                  console.warn("âš ï¸ Google Maps geocoding failed, trying fallback:", geocodeErr.message)
                  try {
                  // Fallback to direct reverse geocode (local minimal address)
                    addr = await reverseGeocodeDirect(latitude, longitude)
                    console.log("âœ… Fallback geocoding successful:", addr)

                    // Validate fallback result - if it still has placeholder values, don't use it
                    if (addr.city === "Current Location" || addr.address.includes(latitude.toFixed(4))) {
                      console.warn("âš ï¸ Fallback geocoding returned placeholder, will not save")
                      addr = {
                        city: "Current Location",
                        state: "",
                        country: "",
                        area: "",
                        address: "Select location",
                        formattedAddress: "Select location",
                      }
                    }
                  } catch (fallbackErr) {
                    console.error("âŒ All geocoding methods failed:", fallbackErr.message)
                    addr = {
                      city: "Current Location",
                      state: "",
                      country: "",
                      area: "",
                      address: "Select location",
                      formattedAddress: "Select location",
                    }
                  }
                }
              }
              console.log("âœ… Reverse geocode result:", addr)

              // Ensure we don't use coordinates as address if we have area/city
              // Keep the complete formattedAddress from Google Maps (it has all details)
              const completeFormattedAddress = addr.formattedAddress || "";
              let displayAddress = addr.address || "";

              // If address contains coordinates pattern, use area/city instead
              const isCoordinatesPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());
              if (isCoordinatesPattern) {
                if (addr.area && addr.area.trim() !== "") {
                  displayAddress = addr.area;
                } else if (addr.city && addr.city.trim() !== "" && addr.city !== "Unknown City") {
                  displayAddress = addr.city;
                }
              }

              // Build location object with ALL fields from reverse geocoding
              const finalLoc = stampLocation(normalizeLocationPayload({
                ...addr, // This includes: city, state, area, street, streetNumber, postalCode, formattedAddress
                latitude,
                longitude,
                accuracy: accuracy || null,
                address: displayAddress, // Locality parts for navbar display
                formattedAddress: completeFormattedAddress || addr.formattedAddress || displayAddress // Complete detailed address
              }))

              if (isUnpersistableLocation(finalLoc)) {
                console.warn("Skipping save - incomplete location:", finalLoc)
                // Don't save placeholder values to localStorage or DB
                // Just set in state for display but don't persist
                const coordOnlyLoc = stampLocation({
                  latitude,
                  longitude,
                  accuracy: accuracy || null,
                  city: finalLoc.city,
                  address: finalLoc.address,
                  formattedAddress: finalLoc.formattedAddress
                })
                setLocation(coordOnlyLoc)
                setPermissionGranted(true)
                if (showLoading) setLoading(false)
                setError(null)
                resolve(coordOnlyLoc)
                return
              }

              console.log("ðŸ’¾ Saving location:", finalLoc)
              prevLocationCoordsRef.current = { latitude, longitude }
              localStorage.setItem("userLocation", JSON.stringify(finalLoc))
              setLocation(finalLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              setError(null)
              dispatchLocationUpdated(finalLoc)
              console.log("✅ UI updated with new location (getCurrentPosition + geocode)")

              if (updateDB) {
                await updateLocationInDB(finalLoc).catch(err => {
                  console.warn("Failed to update location in DB:", err)
                })
              }
              resolve(finalLoc)
            } catch (err) {
              console.error("âŒ Error processing location:", err)
              // Try one more time with direct reverse geocode as last resort
              const { latitude, longitude } = pos.coords

              try {
                console.log("ðŸ”„ Last attempt: trying direct reverse geocode...")
                const lastResortAddr = await reverseGeocodeDirect(latitude, longitude)

                // Check if we got valid data (not just coordinates)
                if (lastResortAddr &&
                  lastResortAddr.city !== "Current Location" &&
                  !lastResortAddr.address.includes(latitude.toFixed(4)) &&
                  lastResortAddr.formattedAddress &&
                  !lastResortAddr.formattedAddress.includes(latitude.toFixed(4))) {
                  const lastResortLoc = stampLocation(normalizeLocationPayload({
                    ...lastResortAddr,
                    latitude,
                    longitude,
                    accuracy: pos.coords.accuracy || null
                  }))
                  console.log("âœ… Last resort geocoding succeeded:", lastResortLoc)
                  prevLocationCoordsRef.current = { latitude, longitude }
                  localStorage.setItem("userLocation", JSON.stringify(lastResortLoc))
                  setLocation(lastResortLoc)
                  setPermissionGranted(true)
                  if (showLoading) setLoading(false)
                  setError(null)
                  dispatchLocationUpdated(lastResortLoc)
                  if (updateDB) await updateLocationInDB(lastResortLoc).catch(() => { })
                  resolve(lastResortLoc)
                  return
                } else {
                  console.warn("âš ï¸ Last resort geocoding returned invalid data:", lastResortAddr)
                }
              } catch (lastErr) {
                console.error("âŒ Last resort geocoding also failed:", lastErr.message)
              }

              // If all geocoding fails, use placeholder but don't save
              const fallbackLoc = {
                latitude,
                longitude,
                city: "Current Location",
                area: "",
                state: "",
                address: "Select location", // Don't show coordinates
                formattedAddress: "Select location", // Don't show coordinates
              }
              // Don't save placeholder values to localStorage
              // Only set in state for display
              console.warn("âš ï¸ Skipping save - all geocoding failed, using placeholder")
              setLocation(fallbackLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              // Don't try to update DB with placeholder
              resolve(fallbackLoc)
            }
          },
          async (err) => {
            // If timeout and we haven't retried yet, try with lower accuracy
            if (!forceFresh && err.code === 3 && retryCount === 0 && options.enableHighAccuracy) {
              console.warn("â±ï¸ High accuracy timeout, retrying with lower accuracy...")
              // Retry with lower accuracy - faster response (uses network-based location)
              getPositionWithRetry({
                enableHighAccuracy: false,
                timeout: 5000,  // 5 seconds for lower accuracy (network-based is faster)
                maximumAge: 300000 // Allow 5 minute old cached location for instant response
              }, 1).then(resolve).catch(reject)
              return
            }

            // Don't log timeout errors as errors - they're expected in some cases
            if (err.code === 3) {
              console.warn("â±ï¸ Geolocation timeout (code 3) - using fallback location")
            } else {
              console.error("âŒ Geolocation error:", err.code, err.message)
            }
            // Try multiple fallback strategies
            try {
              // Strategy 1: Use DB location if available
              let fallback = dbLocation
              if (!fallback) {
                fallback = await fetchLocationFromDB()
              }

              // Strategy 2: Use cached location from localStorage
              if (!fallback) {
                const stored = localStorage.getItem("userLocation")
                if (stored) {
                  try {
                    fallback = JSON.parse(stored)
                    console.log("âœ… Using cached location from localStorage")
                  } catch (parseErr) {
                    console.warn("âš ï¸ Failed to parse stored location:", parseErr)
                  }
                }
              }

              if (fallback) {
                console.log("âœ… Using fallback location:", fallback)
                setLocation(fallback)
                // Don't set error for timeout when we have fallback
                if (err.code !== 3) {
                  setError(err.message)
                }
                setPermissionGranted(true) // Still grant permission if we have location
                if (showLoading) setLoading(false)
                resolve(fallback)
              } else {
                // Last resort: previous session from localStorage (keep navbar stable)
                let storedFallback = null
                try {
                  const s = localStorage.getItem("userLocation")
                  if (s) storedFallback = JSON.parse(s)
                } catch {
                  /* ignore */
                }
                const storedOk =
                  storedFallback &&
                  (storedFallback.latitude != null ||
                    (storedFallback.city &&
                      storedFallback.city !== "Select location" &&
                      storedFallback.city !== "Current Location"))
                if (storedOk) {
                  console.log("âœ… Using previous stored location after GPS failure")
                  setLocation(storedFallback)
                  if (err.code !== 3) setError(err.message)
                  setPermissionGranted(true)
                  if (showLoading) setLoading(false)
                  resolve(storedFallback)
                } else {
                  console.warn("âš ï¸ No fallback location available, setting default")
                  const defaultLocation = {
                    city: "Select location",
                    address: "Select location",
                    formattedAddress: "Select location"
                  }
                  setLocation(defaultLocation)
                  setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
                  setPermissionGranted(false)
                  if (showLoading) setLoading(false)
                  resolve(defaultLocation)
                }
              }
            } catch (fallbackErr) {
              console.warn("âš ï¸ Fallback retrieval failed:", fallbackErr)
              let prev = null
              try {
                const s = localStorage.getItem("userLocation")
                if (s) prev = JSON.parse(s)
              } catch {
                /* ignore */
              }
              if (
                prev &&
                (prev.latitude != null ||
                  (prev.city &&
                    prev.city !== "Select location" &&
                    prev.city !== "Current Location"))
              ) {
                setLocation(prev)
                setPermissionGranted(true)
                if (showLoading) setLoading(false)
                resolve(prev)
              } else {
                setLocation(null)
                setPermissionGranted(false)
                if (showLoading) setLoading(false)
                resolve(null)
              }
              setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
            }
          },
          options
        )
      })
    }

    // Try with high accuracy first
    // If forceFresh is true, don't use cached location (maximumAge: 0)
    // Otherwise, allow cached location for faster response
    return getPositionWithRetry({
      enableHighAccuracy: true, // Use GPS for exact location (highest accuracy)
      timeout: forceFresh ? 25000 : 15000, // Longer timeout for fresh GPS
      maximumAge: forceFresh ? 0 : 60000, // If forceFresh, get fresh location. Otherwise allow 1 minute cache
    })
  }

  /* ===================== WATCH LOCATION ===================== */
  const startWatchingLocation = () => {
    if (!navigator.geolocation) {
      console.warn("âš ï¸ Geolocation not supported")
      return
    }

    if (locationModeRef.current === LOCATION_MODE_MANUAL && !forceExplicitRefreshRef.current) {
      console.log("Manual location mode active - skipping background GPS watch")
      stopWatchingLocation()
      return
    }
    // Clear any existing watch
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    watchGenerationRef.current += 1
    const watchGen = watchGenerationRef.current

    console.log("ðŸ‘€ Starting to watch location for live updates...")

    let retryCount = 0
    const maxRetries = 2

    const startWatch = (options) => {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          if (watchGen !== watchGenerationRef.current) {
            return
          }
          if (locationModeRef.current === LOCATION_MODE_MANUAL && !forceExplicitRefreshRef.current) {
            console.log("Ignoring GPS watch update because manual location mode is active")
            stopWatchingLocation()
            return
          }
          try {
            const { latitude, longitude, accuracy } = pos.coords
            console.log("ðŸ”„ Location updated:", { latitude, longitude, accuracy: `${accuracy}m` })

            // Reset retry count on success
            retryCount = 0

            // Validate coordinates are in India range BEFORE attempting geocoding
            // India: Latitude 6.5Â° to 37.1Â° N, Longitude 68.7Â° to 97.4Â° E
            const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

            // Get address from Google Maps API with error handling
            let addr
            if (!isInIndiaRange || longitude < 0) {
              // Coordinates are outside India - skip geocoding and use placeholder
              console.warn("âš ï¸ Coordinates outside India range, skipping geocoding:", { latitude, longitude })
              addr = {
                city: "Current Location",
                state: "",
                country: "",
                area: "",
                address: "Select location",
                formattedAddress: "Select location",
              }
            } else {
              try {
                addr = await reverseGeocodeWithGoogleMaps(latitude, longitude)
                console.log("âœ… Reverse geocoding successful:", {
                  city: addr.city,
                  area: addr.area,
                  formattedAddress: addr.formattedAddress
                })
              } catch (geocodeErr) {
                console.error("âŒ Google Maps reverse geocoding failed:", geocodeErr.message)
                // Try fallback geocoding
                try {
                  console.log("ðŸ”„ Trying fallback geocoding...")
                  addr = await reverseGeocodeDirect(latitude, longitude)
                  console.log("âœ… Fallback geocoding successful:", {
                    city: addr.city,
                    area: addr.area
                  })
                } catch (fallbackErr) {
                  console.error("âŒ Fallback geocoding also failed:", fallbackErr.message)
                  // Don't use coordinates - use placeholder instead
                  addr = {
                    city: "Current Location",
                    state: "",
                    country: "",
                    area: "",
                    address: "Select location", // Don't show coordinates
                    formattedAddress: "Select location", // Don't show coordinates
                  }
                }
              }
            }

            // CRITICAL: Ensure formattedAddress is NEVER coordinates
            // Check if reverse geocoding returned proper address or just coordinates
            let completeFormattedAddress = addr.formattedAddress || "";
            let displayAddress = addr.address || "";

            // Check if formattedAddress is coordinates pattern
            const isFormattedAddressCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(completeFormattedAddress.trim());
            const isDisplayAddressCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());

            // If formattedAddress is coordinates, it means reverse geocoding failed
            // Build proper address from components or use fallback
            if (isFormattedAddressCoordinates || !completeFormattedAddress || completeFormattedAddress === "Select location") {
              if (IS_DEV) {
                console.warn("âš ï¸âš ï¸âš ï¸ Reverse geocoding returned coordinates or empty address!")
                console.warn("âš ï¸ Attempting to build address from components:", {
                  city: addr.city,
                  state: addr.state,
                  area: addr.area,
                  street: addr.street,
                  streetNumber: addr.streetNumber
                })
              }

              // Build address from components
              const addressParts = [];
              if (addr.area && addr.area.trim() !== "") {
                addressParts.push(addr.area);
              }
              if (addr.city && addr.city.trim() !== "") {
                addressParts.push(addr.city);
              }
              if (addr.state && addr.state.trim() !== "") {
                addressParts.push(addr.state);
              }

              if (addressParts.length > 0) {
                completeFormattedAddress = addressParts.join(', ');
                displayAddress = addr.area || addr.city || "Select location";
                if (IS_DEV) {
                  console.log("âœ… Built address from components:", completeFormattedAddress);
                }
              } else {
                // Final fallback - don't use coordinates
                completeFormattedAddress = addr.city || "Select location";
                displayAddress = addr.city || "Select location";
                if (IS_DEV) {
                  console.warn("âš ï¸ Using fallback address:", completeFormattedAddress);
                }
              }
            }

            // Also check displayAddress
            if (isDisplayAddressCoordinates) {
              displayAddress = addr.area || addr.city || "Select location";
            }

            // Build location object with ALL fields from reverse geocoding
            // NEVER include coordinates in formattedAddress or address
            const loc = stampLocation({
              ...addr, // This includes: city, state, area, street, streetNumber, postalCode
              latitude,
              longitude,
              accuracy: accuracy || null,
              address: displayAddress, // Locality parts for navbar display (NEVER coordinates)
              formattedAddress: completeFormattedAddress // Complete detailed address (NEVER coordinates)
            })

            const bypassStability = forceExplicitRefreshRef.current

            // STABILITY: Only update if location changed enough OR address improved — unless user just requested fresh GPS
            // Use ref — watch callback must not close over stale `location` from an old render.
            const currentLoc = locationRef.current
            if (!bypassStability && currentLoc && currentLoc.latitude && currentLoc.longitude) {
              const distanceMeters = haversineDistanceMeters(
                latitude,
                longitude,
                Number(currentLoc.latitude),
                Number(currentLoc.longitude),
              )

              const currentParts = (currentLoc.formattedAddress || "").split(',').filter(p => p.trim()).length
              const newParts = completeFormattedAddress.split(',').filter(p => p.trim()).length
              const addressImproved = newParts > currentParts

              if (distanceMeters < MOVE_THRESHOLD_METERS && !addressImproved) {
                console.log(
                  `ðŸ“ Location unchanged (${distanceMeters.toFixed(1)}m < ${MOVE_THRESHOLD_METERS}m), keeping stable address`,
                )
                return
              }

              console.log(`ðŸ“ Location updated: ${distanceMeters.toFixed(1)}m change, address parts: ${currentParts} â†’ ${newParts}`)
            } else if (bypassStability) {
              console.log("📍 Skipping cache / stability gate — applying live geocode (explicit GPS refresh)")
            }

            // Final validation - ensure formattedAddress is never coordinates
            if (loc.formattedAddress && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(loc.formattedAddress.trim())) {
              console.error("âŒâŒâŒ CRITICAL: formattedAddress is still coordinates! Replacing with city/area")
              loc.formattedAddress = loc.area || loc.city || "Select location";
              loc.address = loc.area || loc.city || "Select location";
            }

            if (isUnpersistableLocation(loc)) {
              console.warn("Skipping live location update - incomplete payload:", loc)
              return
            }

            const prevLat = prevLocationCoordsRef.current.latitude
            const prevLng = prevLocationCoordsRef.current.longitude
            const movedFromPrev =
              prevLat != null &&
              prevLng != null &&
              haversineDistanceMeters(loc.latitude, loc.longitude, Number(prevLat), Number(prevLng)) >=
                MOVE_THRESHOLD_METERS
            const coordsChanged =
              bypassStability ||
              prevLat == null ||
              prevLng == null ||
              movedFromPrev

            // Only update location state if coordinates changed significantly (or user requested fresh location)
            if (coordsChanged) {
              prevLocationCoordsRef.current = { latitude: loc.latitude, longitude: loc.longitude }
              console.log("ðŸ’¾ Updating live location:", loc)
              localStorage.setItem("userLocation", JSON.stringify(loc))
              setLocation(loc)
              setPermissionGranted(true)
              setError(null)
              dispatchLocationUpdated(loc)
              console.log("✅ UI updated with new location (watchPosition)")
            } else {
              // Same coordinates: do not overwrite localStorage — a new geocode at the same point
              // often returns a shorter label and replaced the user's street-level line from GPS.
              return
            }

            // Debounce DB updates - only update every 5 seconds
            clearTimeout(updateTimerRef.current)
            updateTimerRef.current = setTimeout(() => {
              updateLocationInDB(loc).catch(err => {
                console.warn("Failed to update location in DB:", err)
              })
            }, 5000)
          } catch (err) {
            console.error("âŒ Error processing live location update:", err)
            // If reverse geocoding fails, DON'T use coordinates - use placeholder
            const { latitude, longitude } = pos.coords
            const fallbackLoc = {
              latitude,
              longitude,
              city: "Current Location",
              area: "",
              state: "",
              address: "Select location", // NEVER use coordinates
              formattedAddress: "Select location", // NEVER use coordinates
            }
            console.warn("âš ï¸ Using fallback location (reverse geocoding failed):", fallbackLoc)
            // Don't save placeholder values to localStorage
            // Only set in state for display
            console.warn("âš ï¸ Skipping localStorage save - fallback location contains placeholder values")
            setLocation(fallbackLoc)
            setPermissionGranted(true)
          }
        },
        (err) => {
          // Don't log timeout errors for watchPosition (it's a background operation)
          // Only log non-timeout errors
          if (err.code !== 3) {
            console.warn("âš ï¸ Watch position error (non-timeout):", err.code, err.message)
          }

          // If timeout and we haven't exceeded max retries, retry with HIGH ACCURACY GPS
          // CRITICAL: Keep using GPS (not network-based) for accurate location
          // Network-based location won't give exact landmarks like "Mama Loca Cafe"
          if (err.code === 3 && retryCount < maxRetries) {
            retryCount++
            console.log(`â±ï¸ GPS timeout, retrying with high accuracy GPS (attempt ${retryCount}/${maxRetries})...`)

            // Clear current watch
            if (watchIdRef.current) {
              navigator.geolocation.clearWatch(watchIdRef.current)
              watchIdRef.current = null
            }

            // Retry with HIGH ACCURACY GPS (don't use network-based location)
            // Network-based location is less accurate and won't give exact landmarks
            setTimeout(() => {
              startWatch({
                enableHighAccuracy: true,   // Keep using GPS (not network-based)
                timeout: 20000,              // 20 seconds timeout (give GPS more time)
                maximumAge: 0                // Always get fresh GPS location
              })
            }, 3000) // 3 second delay before retry
            return
          }

          // If all retries failed, silently continue - don't set error state for background watch
          // The watch will keep trying in background, user won't notice
          // Only set error for non-timeout errors that are critical
          if (err.code !== 3) {
            setError(err.message)
            setPermissionGranted(false)
          }

          // Don't clear the watch - let it keep trying in background
          // The user might move to a location with better GPS signal
        },
        options
      )
    }

    // Start with HIGH ACCURACY GPS for live location tracking
    // CRITICAL: enableHighAccuracy: true forces GPS (not network-based) for accurate location
    // Network-based location won't give exact landmarks like "Mama Loca Cafe"
    startWatch({
      enableHighAccuracy: true,   // CRITICAL: Use GPS (not network-based) for accurate location
      timeout: 15000,             // 15 seconds timeout (gives GPS more time to get accurate fix)
      maximumAge: 0               // Always get fresh GPS location (no cache for live tracking)
    })

    console.log("âœ…âœ…âœ… GPS High Accuracy enabled for live location tracking")
    console.log("âœ… GPS will provide accurate coordinates for reverse geocoding")
    console.log("âœ… Network-based location disabled (less accurate)")
  }

  const stopWatchingLocation = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    clearTimeout(updateTimerRef.current)
  }

  /* ===================== INIT ===================== */
  useEffect(() => {
    let cancelled = false
    const currentPath = window.location?.pathname || "/"
    const shouldRunUserLocationEngine = isUserFacingRoute(currentPath)

    if (!shouldRunUserLocationEngine) {
      setLoading(false)
      return () => {
        cancelled = true
        stopWatchingLocation()
      }
    }

    const loadingTimeout = setTimeout(() => {
      setLoading((currentLoading) => {
        if (currentLoading) {
          console.warn("Loading timeout - setting loading to false")
          setLocation((currentLocation) => {
            if (
              !currentLocation ||
              (currentLocation.formattedAddress === "Select location" &&
                !currentLocation.latitude &&
                !currentLocation.city)
            ) {
              return {
                city: "Select location",
                address: "Select location",
                formattedAddress: "Select location",
              }
            }
            return currentLocation
          })
        }
        return false
      })
    }, 5000)

    const checkPermissionAndStart = async (shouldForceRefresh, hasInitialLocation) => {
      if (cancelled) return
      try {
        const locationMode = getStoredLocationMode()
        locationModeRef.current = locationMode
        let permissionState = "prompt"

        if (navigator.permissions && navigator.permissions.query) {
          try {
            const result = await navigator.permissions.query({ name: "geolocation" })
            permissionState = result.state
            if (result.state !== "granted") {
              console.log(`Geolocation permission is '${result.state}' - requesting current location on open`)
            }
          } catch (permErr) {
            console.warn("Permission query failed:", permErr)
          }
        } else {
          console.log("Permissions API not available - requesting current location directly")
        }

        if (permissionState === "denied") {
          setLoading(false)
          return
        }

        console.log(
          "Startup location sync:",
          shouldForceRefresh ? "refreshing detailed current location" : "watching current location",
        )

        let locSnap = null
        try {
          const raw = localStorage.getItem("userLocation")
          if (raw) locSnap = JSON.parse(raw)
        } catch {
          /* ignore */
        }
        const needsBetterAddress =
          !!locSnap &&
          !hasDetailedAddress(locSnap) &&
          (isUnpersistableLocation(locSnap) ||
            (locSnap.formattedAddress || "").trim() === "Select location" ||
            (locSnap.city || "").trim() === "Current Location" ||
            (locSnap.city || "").trim() === "Select location")

        const shouldFetch = shouldForceRefresh || !hasInitialLocation || needsBetterAddress
        const hasUsableInitialLocation =
          !!locSnap &&
          locSnap.latitude != null &&
          locSnap.longitude != null &&
          !isUnpersistableLocation(locSnap) &&
          (locSnap.formattedAddress || "").trim() !== "Select location"

        if (locationMode === LOCATION_MODE_MANUAL && hasUsableInitialLocation) {
          console.log("Manual location mode active - keeping selected place and skipping auto GPS refresh")
          setPermissionGranted(true)
          setLoading(false)
          stopWatchingLocation()
          return
        }

        if (shouldFetch) {
          console.log(
            "Background fetch — force:",
            shouldForceRefresh,
            "hasInitial:",
            hasInitialLocation,
            "needsBetter:",
            needsBetterAddress,
          )
          const forceFreshFetch = shouldForceRefresh || !hasInitialLocation || needsBetterAddress
          getLocation(true, forceFreshFetch, false, {
            forceBypassMoveThreshold: forceFreshFetch,
          })
            .then((location) => {
              if (cancelled || !location) return
              if (isAcceptableGeocodeResult(location)) {
                setLocation(stampLocation(location))
                setPermissionGranted(true)
                dispatchLocationUpdated(location)
                startWatchingLocation()
              } else {
                console.warn("Location fetch returned placeholder, retrying...")
                setTimeout(() => {
                  getLocation(true, true, false, {
                    forceBypassMoveThreshold: true,
                  })
                    .then((retryLocation) => {
                      if (cancelled || !retryLocation) return
                      if (isAcceptableGeocodeResult(retryLocation)) {
                        setLocation(stampLocation(retryLocation))
                        setPermissionGranted(true)
                        dispatchLocationUpdated(retryLocation)
                        startWatchingLocation()
                      } else {
                        startWatchingLocation()
                      }
                    })
                    .catch(() => {
                      startWatchingLocation()
                    })
                }, 2000)
              }
            })
            .catch((err) => {
              console.warn("Background location fetch failed (using cache):", err.message)
              startWatchingLocation()
            })
        } else {
          startWatchingLocation()
        }
      } catch (err) {
        console.error("Error in checkPermissionAndStart:", err)
        setLoading(false)
      }
    }

    const bootstrap = async () => {
      let shouldForceRefresh = false
      let hasInitialLocation = false

      const token =
        localStorage.getItem("user_accessToken") || localStorage.getItem("accessToken")
      const authed = token && token !== "null" && token !== "undefined"

      if (authed) {
        setLoading(true)
        const dbLoc = await fetchLocationFromDB()
        if (cancelled) return

        if (dbLoc && (dbLoc.latitude || dbLoc.city)) {
          const stamped = stampLocation(dbLoc)
          setLocation(stamped)
          try {
            localStorage.setItem("userLocation", JSON.stringify(stamped))
          } catch {
            /* ignore */
          }
          prevLocationCoordsRef.current = {
            latitude: stamped.latitude,
            longitude: stamped.longitude,
          }
          setPermissionGranted(true)
          setLoading(false)
          hasInitialLocation = true
          if (!hasDetailedAddress(dbLoc)) {
            shouldForceRefresh = true
          }
          console.log("Logged-in: hydrated from DB first (same address after refresh)")
          await checkPermissionAndStart(shouldForceRefresh, hasInitialLocation)
          return
        }
        setLoading(false)
      }

      const stored = localStorage.getItem("userLocation")
      if (stored) {
        try {
          const parsedLocation = JSON.parse(stored)
          const latOk = parsedLocation?.latitude != null && parsedLocation?.longitude != null
          const canHydrateFromCache =
            latOk &&
            !isUnpersistableLocation(parsedLocation) &&
            (parsedLocation.formattedAddress || "").trim() !== "Select location"

          if (canHydrateFromCache) {
            setLocation(stampLocation(parsedLocation))
            setPermissionGranted(true)
            setLoading(false)
            hasInitialLocation = true
            if (!hasDetailedAddress(parsedLocation)) {
              shouldForceRefresh = true
            }
          } else {
            shouldForceRefresh = true
          }
        } catch (err) {
          console.error("Failed to parse stored location:", err)
          shouldForceRefresh = true
        }
      }

      if (!hasInitialLocation) {
        const dbLoc = await fetchLocationFromDB()
        if (cancelled) return
        if (dbLoc && (dbLoc.latitude || dbLoc.city)) {
          const stamped = stampLocation(dbLoc)
          setLocation(stamped)
          try {
            localStorage.setItem("userLocation", JSON.stringify(stamped))
          } catch {
            /* ignore */
          }
          prevLocationCoordsRef.current = {
            latitude: stamped.latitude,
            longitude: stamped.longitude,
          }
          setPermissionGranted(true)
          setLoading(false)
          hasInitialLocation = true
          if (!hasDetailedAddress(dbLoc)) {
            shouldForceRefresh = true
          }
        } else {
          setLoading(false)
          shouldForceRefresh = true
        }
      }

      if (localStorage.getItem("userLocation")) {
        await checkPermissionAndStart(shouldForceRefresh, hasInitialLocation)
        return
      }

      await checkPermissionAndStart(true, hasInitialLocation)
    }

    void bootstrap()

    return () => {
      cancelled = true
      clearTimeout(loadingTimeout)
      stopWatchingLocation()
    }
  }, [])
  // Listen for address updates (from overlay, cart, or other tabs) so top nav and all consumers update instantly
  useEffect(() => {
    const onUserLocationUpdated = (e) => {
      const payload = e?.detail
      if (!payload || (payload.formattedAddress === "Select location" && payload.latitude == null)) return
      const nextMode =
        payload?.selectionSource === "manual" ? LOCATION_MODE_MANUAL : LOCATION_MODE_GPS
      locationModeRef.current = nextMode
      setStoredLocationMode(nextMode)
      if (nextMode === LOCATION_MODE_MANUAL) {
        stopWatchingLocation()
      }
      setLocation(() => {
        const next = stampLocation(normalizeLocationPayload(payload))
        try {
          if (next.latitude != null && next.longitude != null) {
            localStorage.setItem("userLocation", JSON.stringify(next))
          }
        } catch {
          // ignore
        }
        prevLocationCoordsRef.current = {
          latitude: next.latitude ?? null,
          longitude: next.longitude ?? null,
        }
        console.log("✅ UI updated with new location (userLocationUpdated)")
        return next
      })
      setPermissionGranted(true)
    }
    window.addEventListener("userLocationUpdated", onUserLocationUpdated)
    return () => window.removeEventListener("userLocationUpdated", onUserLocationUpdated)
  }, [])

  /**
   * @param {object} [options]
   * @param {boolean} [options.skipDatabaseUpdate] If true, only localStorage + in-memory state are updated here;
   *   caller must PUT /user/location after a richer client geocode (e.g. Google in LocationSelectorOverlay).
   */
  const requestLocation = async (options = {}) => {
    const { skipDatabaseUpdate = false } = options
    console.log("ðŸ“ðŸ“ðŸ“ User requested location update - fetching fresh GPS (keeping cache fallback)")
    console.log("📍 Using fresh GPS location — explicit user request (cache/stability bypass active briefly)")
    locationModeRef.current = LOCATION_MODE_GPS
    setStoredLocationMode(LOCATION_MODE_GPS)
    forceExplicitRefreshRef.current = true
    if (forceExplicitRefreshTimerRef.current) {
      clearTimeout(forceExplicitRefreshTimerRef.current)
    }
    forceExplicitRefreshTimerRef.current = setTimeout(() => {
      forceExplicitRefreshRef.current = false
      console.log("📍 Explicit GPS refresh window closed (watch uses normal stability again)")
    }, 12000)

    setLoading(true)
    setError(null)

    try {
      // Keep cached location for fallback if GPS times out.
      // We still force fresh GPS+reverse-geocode by passing forceFresh=true to getLocation().

      // Show loading, so pass showLoading = true
      // updateDB: false when overlay will persist Google-refined address after handleMapMoveEnd
      const location = await getLocation(!skipDatabaseUpdate, true, true, {
        forceBypassMoveThreshold: true,
      })

      console.log("âœ…âœ…âœ… Fresh location requested successfully:", location)
      console.log("âœ…âœ…âœ… Complete Location details:", {
        formattedAddress: location?.formattedAddress,
        address: location?.address,
        city: location?.city,
        state: location?.state,
        area: location?.area,
        pointOfInterest: location?.pointOfInterest,
        premise: location?.premise,
        coordinates: location?.latitude && location?.longitude ?
          `${location.latitude.toFixed(8)}, ${location.longitude.toFixed(8)}` : "N/A",
        hasCompleteAddress: location?.formattedAddress &&
          location.formattedAddress !== "Select location" &&
          !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
          location.formattedAddress.split(',').length >= 4
      })

      // Verify we got complete address (POI, building, floor, area, city, state, pincode)
      if (!location?.formattedAddress ||
        location.formattedAddress === "Select location" ||
        location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) ||
        location.formattedAddress.split(',').length < 4) {
        console.warn("âš ï¸âš ï¸âš ï¸ Location received but address is incomplete!")
        console.warn("âš ï¸ Address parts count:", location?.formattedAddress?.split(',').length || 0)
        console.warn("âš ï¸ This might be due to:")
        console.warn("   1. Google Maps API not enabled or billing not set up")
        console.warn("   2. Location permission not granted")
        console.warn("   3. GPS accuracy too low (try on mobile device)")
      } else {
        console.log("âœ…âœ…âœ… SUCCESS: Complete detailed address received!")
        console.log("âœ… Full address:", location.formattedAddress)
      }

      // Restart watching for live updates
      startWatchingLocation()

      return location
    } catch (err) {
      console.error("âŒ Failed to request location:", err)
      try {
        const s = localStorage.getItem("userLocation")
        if (s) {
          const prev = JSON.parse(s)
          const ok =
            prev &&
            (prev.latitude != null ||
              (prev.city &&
                prev.city !== "Select location" &&
                prev.city !== "Current Location"))
          if (ok) {
            console.warn("📍 GPS request failed — restoring last stored location from localStorage")
            setLocation(stampLocation(prev))
            setPermissionGranted(true)
          }
        }
      } catch {
        /* ignore */
      }
      setError(err.message || "Failed to get location")
      startWatchingLocation()
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    location,
    loading,
    error,
    permissionGranted,
    requestLocation,
    startWatchingLocation,
    stopWatchingLocation,
  }
}

export function UserGeoLocationProvider({ children }) {
  const value = useUserGeoLocationEngine()
  return (
    <UserGeoLocationContext.Provider value={value}>{children}</UserGeoLocationContext.Provider>
  )
}

export function useLocation() {
  const ctx = useContext(UserGeoLocationContext)
  if (ctx == null) {
    throw new Error(
      "useLocation (geolocation) must be used within <UserGeoLocationProvider>. Wrap the app Routes (see App.jsx).",
    )
  }
  return ctx
}



