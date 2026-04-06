import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, MapPin, Save, Search } from "lucide-react"
import { Loader } from "@googlemaps/js-api-loader"
import RestaurantNavbar from "../components/RestaurantNavbar"
import { restaurantAPI, zoneAPI } from "@/lib/api"
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey"

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 }

const getZoneDisplayName = (zone) =>
  zone?.zoneName || zone?.name || zone?.serviceLocation || "Assigned zone"

const getZonePath = (zone) =>
  (Array.isArray(zone?.coordinates) ? zone.coordinates : [])
    .map((coord) => {
      const lat = Number(coord?.latitude ?? coord?.lat)
      const lng = Number(coord?.longitude ?? coord?.lng)

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      return { lat, lng }
    })
    .filter(Boolean)

const isPointInPolygon = (lat, lng, points = []) => {
  if (!Array.isArray(points) || points.length < 3) return false

  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].lat
    const yi = points[i].lng
    const xj = points[j].lat
    const yj = points[j].lng

    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }

  return inside
}

const findZoneForPoint = (lat, lng, zones = []) => {
  for (const zone of zones) {
    const path = getZonePath(zone)
    if (isPointInPolygon(lat, lng, path)) {
      return {
        ...zone,
        path,
      }
    }
  }

  return null
}

const formatAddress = (location) => {
  if (!location) return ""

  if (location.formattedAddress?.trim()) return location.formattedAddress.trim()
  if (location.address?.trim()) return location.address.trim()

  const parts = [
    location.addressLine1,
    location.addressLine2,
    location.area,
    location.city,
    location.state,
    location.zipCode || location.pincode || location.postalCode,
  ]
    .filter(Boolean)
    .map((part) => part.trim())

  return parts.join(", ")
}

export default function ZoneSetup() {
  const navigate = useNavigate()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const zonePolygonsRef = useRef([])
  const searchDebounceRef = useRef(null)
  const selectedLocationRef = useRef(null)

  const [mapLoading, setMapLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [activeZones, setActiveZones] = useState([])
  const [locationSearch, setLocationSearch] = useState("")
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [selectedAddress, setSelectedAddress] = useState("")
  const [selectedZone, setSelectedZone] = useState(null)
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [feedback, setFeedback] = useState({ type: "", message: "" })

  useEffect(() => {
    selectedLocationRef.current = selectedLocation
  }, [selectedLocation])

  useEffect(() => {
    fetchRestaurantData()
    fetchActiveZones()
    loadGoogleMaps()
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return
    drawZonesOnMap()
  }, [activeZones])

  useEffect(() => {
    if (!restaurantData?.location || !mapInstanceRef.current || mapLoading) return

    const lat = Number(
      restaurantData.location?.latitude ?? restaurantData.location?.coordinates?.[1],
    )
    const lng = Number(
      restaurantData.location?.longitude ?? restaurantData.location?.coordinates?.[0],
    )

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    const address = formatAddress(restaurantData.location) || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    handleLocationSelection(lat, lng, address, { preserveViewport: false, silent: true })
  }, [restaurantData, mapLoading, activeZones])

  const fetchRestaurantData = async () => {
    try {
      const response = await restaurantAPI.getCurrentRestaurant()
      const data = response?.data?.data?.restaurant || response?.data?.restaurant
      if (data) {
        setRestaurantData(data)
        if (data.zone) {
          setSelectedZone(data.zone)
        }
      }
    } catch (error) {
      console.error("Error fetching restaurant data:", error)
      setFeedback({ type: "error", message: "Unable to load restaurant details." })
    }
  }

  const fetchActiveZones = async () => {
    try {
      const response = await zoneAPI.getActiveZones()
      const zones = response?.data?.data?.zones || []
      setActiveZones(zones)

      if (!zones.length) {
        setFeedback({
          type: "error",
          message: "No active zones are available right now. Please ask admin to create or activate a zone.",
        })
      }
    } catch (error) {
      console.error("Error fetching active zones:", error)
      setFeedback({ type: "error", message: "Unable to load active zones." })
    }
  }

  const loadGoogleMaps = async () => {
    try {
      const apiKey = await getGoogleMapsApiKey()

      if (!apiKey?.trim()) {
        setMapLoading(false)
        setFeedback({ type: "error", message: "Google Maps API key is missing." })
        return
      }

      if (!window.google?.maps) {
        const loader = new Loader({
          apiKey,
          version: "weekly",
          libraries: ["places", "geometry"],
        })

        await loader.load()
      }

      initializeMap(window.google)
    } catch (error) {
      console.error("Error loading Google Maps:", error)
      setMapLoading(false)
      setFeedback({ type: "error", message: "Failed to load Google Maps." })
    }
  }

  const clearZonePolygons = () => {
    zonePolygonsRef.current.forEach((polygon) => polygon?.setMap?.(null))
    zonePolygonsRef.current = []
  }

  const drawZonesOnMap = () => {
    if (!mapInstanceRef.current || !window.google) return

    clearZonePolygons()

    const bounds = new window.google.maps.LatLngBounds()

    activeZones.forEach((zone) => {
      const path = getZonePath(zone)
      if (path.length < 3) return

      path.forEach((point) => bounds.extend(point))

      const polygon = new window.google.maps.Polygon({
        paths: path,
        strokeColor: "#ef4444",
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: "#f97316",
        fillOpacity: 0.12,
        clickable: true,
        editable: false,
        draggable: false,
        map: mapInstanceRef.current,
      })

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="padding:8px 10px;max-width:220px;">
            <strong>${getZoneDisplayName(zone)}</strong><br />
            <small>${zone.serviceLocation || zone.country || "Active zone"}</small>
          </div>
        `,
      })

      polygon.addListener("click", (event) => {
        infoWindow.setPosition(event.latLng)
        infoWindow.open(mapInstanceRef.current)
      })

      zonePolygonsRef.current.push(polygon)
    })

    if (!bounds.isEmpty() && !selectedLocationRef.current) {
      mapInstanceRef.current.fitBounds(bounds)
    }
  }

  const updateMarker = (lat, lng, address) => {
    if (!mapInstanceRef.current || !window.google) return

    if (markerRef.current) {
      markerRef.current.setMap(null)
    }

    const marker = new window.google.maps.Marker({
      position: { lat, lng },
      map: mapInstanceRef.current,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
      title: address || "Restaurant Location",
    })

    const infoWindow = new window.google.maps.InfoWindow({
      content: `
        <div style="padding:8px;max-width:250px;">
          <strong>Restaurant location</strong><br />
          <small>${address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`}</small>
        </div>
      `,
    })

    marker.addListener("click", () => {
      infoWindow.open(mapInstanceRef.current, marker)
    })

    marker.addListener("dragend", async (event) => {
      const previousLocation = selectedLocationRef.current
      const newLat = event.latLng.lat()
      const newLng = event.latLng.lng()
      let newAddress = `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`

      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&addressdetails=1&accept-language=en&zoom=18`,
          { headers: { "User-Agent": "Tastizo-App/1.0" } },
        )
        const data = await resp.json()
        if (data?.display_name) newAddress = data.display_name
      } catch {
        // Use coordinates when reverse geocoding fails.
      }

      const isValid = handleLocationSelection(newLat, newLng, newAddress, {
        preserveViewport: true,
      })

      if (!isValid && previousLocation) {
        marker.setPosition({ lat: previousLocation.lat, lng: previousLocation.lng })
        mapInstanceRef.current.panTo({ lat: previousLocation.lat, lng: previousLocation.lng })
      }
    })

    markerRef.current = marker
  }

  const handleLocationSelection = (
    lat,
    lng,
    address,
    { preserveViewport = true, silent = false } = {},
  ) => {
    const matchedZone = findZoneForPoint(lat, lng, activeZones)

    if (!matchedZone) {
      if (!silent) {
        setFeedback({
          type: "error",
          message: "Restaurant pin must stay inside one of the highlighted active zones.",
        })
      }
      return false
    }

    if (preserveViewport && mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat, lng })
      mapInstanceRef.current.setZoom(Math.max(mapInstanceRef.current.getZoom() || 0, 17))
    } else if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat, lng })
      mapInstanceRef.current.setZoom(17)
    }

    setLocationSearch(address)
    setSelectedAddress(address)
    setSelectedLocation({ lat, lng, address })
    setSelectedZone({
      _id: matchedZone._id,
      name: matchedZone.name,
      zoneName: matchedZone.zoneName,
      country: matchedZone.country,
      unit: matchedZone.unit,
    })
    setFeedback({
      type: "success",
      message: `Pin is inside ${getZoneDisplayName(matchedZone)}.`,
    })
    updateMarker(lat, lng, address)
    return true
  }

  const initializeMap = (google) => {
    if (!mapRef.current) {
      setMapLoading(false)
      setFeedback({ type: "error", message: "Map container could not be initialized." })
      return
    }

    const map = new google.maps.Map(mapRef.current, {
      center: INDIA_CENTER,
      zoom: 5,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE],
      },
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      scrollwheel: true,
      gestureHandling: "greedy",
      disableDoubleClickZoom: false,
    })

    map.addListener("click", async (event) => {
      const lat = event.latLng.lat()
      const lng = event.latLng.lng()
      let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`

      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=en&zoom=18`,
          { headers: { "User-Agent": "Tastizo-App/1.0" } },
        )
        const data = await resp.json()
        if (data?.display_name) address = data.display_name
      } catch {
        // Use coordinates when reverse geocoding fails.
      }

      handleLocationSelection(lat, lng, address)
    })

    mapInstanceRef.current = map
    setMapLoading(false)
  }

  const handleSearchInput = (value) => {
    setLocationSearch(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    if (!value || value.trim().length < 2) {
      setSearchSuggestions([])
      return
    }

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(value.trim())}&limit=5&lang=en`,
        )
        const data = await resp.json()

        setSearchSuggestions(
          (data.features || []).map((feature) => ({
            name: [
              feature.properties.name,
              feature.properties.city || feature.properties.town,
              feature.properties.state,
            ]
              .filter(Boolean)
              .join(", "),
            lat: feature.geometry.coordinates[1],
            lng: feature.geometry.coordinates[0],
          })),
        )
      } catch {
        setSearchSuggestions([])
      }
    }, 300)
  }

  const handleSelectSuggestion = (suggestion) => {
    setSearchSuggestions([])
    handleLocationSelection(suggestion.lat, suggestion.lng, suggestion.name)
  }

  const handleSaveLocation = async () => {
    if (!selectedLocation) {
      setFeedback({ type: "error", message: "Please place the restaurant pin inside a zone first." })
      return
    }

    try {
      setSaving(true)

      const { lat, lng, address } = selectedLocation
      const response = await restaurantAPI.updateProfile({
        location: {
          ...(restaurantData?.location || {}),
          latitude: lat,
          longitude: lng,
          coordinates: [lng, lat],
          formattedAddress: address,
        },
      })

      const updatedRestaurant = response?.data?.data?.restaurant
      if (!updatedRestaurant) {
        throw new Error("Failed to save location")
      }

      setRestaurantData((prev) => ({
        ...(prev || {}),
        ...updatedRestaurant,
      }))
      setSelectedZone(updatedRestaurant.zone || selectedZone)
      setFeedback({
        type: "success",
        message: `Location saved successfully${updatedRestaurant.zone ? ` in ${getZoneDisplayName(updatedRestaurant.zone)}` : ""}.`,
      })
    } catch (error) {
      console.error("Error saving location:", error)
      setFeedback({
        type: "error",
        message: error?.response?.data?.message || "Failed to save location. Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <RestaurantNavbar />
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="rounded-full p-2 transition-colors hover:bg-gray-100"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500">
              <MapPin className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Zone Setup</h1>
              <p className="text-sm text-gray-600">
                Pin your restaurant exactly inside an active delivery zone.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
              <input
                type="text"
                value={locationSearch}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="Search for your restaurant location..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {searchSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {searchSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.name}-${index}`}
                      type="button"
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full border-b border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 last:border-b-0"
                    >
                      {suggestion.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSaveLocation}
              disabled={!selectedLocation || saving}
              className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  <span>Save Location</span>
                </>
              )}
            </button>
          </div>

          {selectedLocation && (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-sm text-gray-700">
                <strong>Selected Location:</strong> {selectedAddress}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Coordinates: {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
              </p>
              {selectedZone && (
                <p className="mt-1 text-xs font-medium text-green-700">
                  Zone: {getZoneDisplayName(selectedZone)}
                </p>
              )}
            </div>
          )}
        </div>

        {feedback.message && (
          <div
            className={`mb-6 flex items-start gap-3 rounded-lg border p-4 ${
              feedback.type === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            {feedback.type === "error" ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <p className="text-sm">{feedback.message}</p>
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-blue-900">How to set your location</h3>
            <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
              <li>Search for the address or click directly on the map.</li>
              <li>Only the highlighted zone areas accept the restaurant pin.</li>
              <li>Drag the pin for exact adjustment, but it cannot leave the zone.</li>
              <li>Save after the zone name appears under the selected location.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-orange-900">Active service zones</h3>
            <p className="text-sm text-orange-800">
              {activeZones.length
                ? `${activeZones.length} active zone${activeZones.length > 1 ? "s are" : " is"} shown on the map.`
                : "No active zones are available yet."}
            </p>
            <p className="mt-2 text-sm text-orange-800">
              {selectedZone
                ? `Current restaurant zone: ${getZoneDisplayName(selectedZone)}`
                : "Select a valid point to see which zone your restaurant belongs to."}
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div ref={mapRef} className="h-[600px] w-full" style={{ minHeight: "600px" }} />
          {mapLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-red-600" />
                <p className="text-gray-600">Loading map...</p>
                <p className="mt-2 text-xs text-gray-400">Please wait while zones and map data load.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
