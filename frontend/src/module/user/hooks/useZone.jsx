import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { zoneAPI } from "@/lib/api"
import { clearHomeDiscoveryCache } from "@/lib/cache/userNavSessionCache"
import { useLocation } from "./useLocation"

const ZONE_STORAGE_KEY = "userZone"
const ZONE_ID_STORAGE_KEY = "userZoneId"
const LAST_FETCHED_LOCATION_KEY = "userLastFetchedLocation"
const MOVE_THRESHOLD_METERS = 100
const LOCATION_REFRESH_THROTTLE_MS = 5000
const MAX_ACCEPTABLE_ACCURACY_METERS = 250

const UserZoneContext = createContext(null)

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

function readJsonStorage(key, fallback = null) {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJsonStorage(key, value) {
  if (typeof window === "undefined") return
  try {
    if (value == null) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage failures
  }
}

function setStoredZone(zone) {
  if (typeof window === "undefined") return
  try {
    if (zone?._id) {
      localStorage.setItem(ZONE_ID_STORAGE_KEY, zone._id)
      localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(zone))
    } else {
      localStorage.removeItem(ZONE_ID_STORAGE_KEY)
      localStorage.removeItem(ZONE_STORAGE_KEY)
    }
  } catch {
    // ignore storage failures
  }
}

function getStoredZoneState() {
  const zone = readJsonStorage(ZONE_STORAGE_KEY, null)
  const zoneId =
    (typeof window !== "undefined" && localStorage.getItem(ZONE_ID_STORAGE_KEY)) ||
    zone?._id ||
    null

  return {
    zone,
    zoneId,
  }
}

function hasUsableCoords(location) {
  return (
    Number.isFinite(Number(location?.latitude)) &&
    Number.isFinite(Number(location?.longitude))
  )
}

function buildFetchedLocation(location, zoneId = null) {
  if (!hasUsableCoords(location)) return null
  return {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    accuracy: Number.isFinite(Number(location?.accuracy))
      ? Number(location.accuracy)
      : null,
    updatedAt: location?.updatedAt || Date.now(),
    zoneId: zoneId || null,
  }
}

function useUserZoneEngine() {
  const { location } = useLocation()
  const cachedZoneState = useMemo(() => getStoredZoneState(), [])

  const [zoneId, setZoneId] = useState(cachedZoneState.zoneId)
  const [zone, setZone] = useState(cachedZoneState.zone)
  const [zoneStatus, setZoneStatus] = useState(
    cachedZoneState.zoneId ? "IN_SERVICE" : "loading",
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastFetchedLocation, setLastFetchedLocation] = useState(() =>
    readJsonStorage(LAST_FETCHED_LOCATION_KEY, null),
  )
  const [locationRefreshKey, setLocationRefreshKey] = useState(0)
  const [accuracyWarning, setAccuracyWarning] = useState("")

  const lastFetchAtRef = useRef(0)
  const zoneIdRef = useRef(cachedZoneState.zoneId)
  const hasResolvedOnceRef = useRef(false)

  useEffect(() => {
    zoneIdRef.current = zoneId
  }, [zoneId])

  const commitZoneState = useCallback((nextZone, nextStatus, nextError = null) => {
    const nextZoneId = nextZone?._id || null
    setZone(nextZone)
    setZoneId(nextZoneId)
    setZoneStatus(nextStatus)
    setError(nextError)
    setStoredZone(nextZone)
  }, [])

  const dispatchLocationRefreshEvent = useCallback(
    (detail) => {
      if (typeof window === "undefined") return
      try {
        window.dispatchEvent(new CustomEvent("userLocationRefresh", { detail }))
      } catch {
        // ignore event dispatch failures
      }
    },
    [],
  )

  const dispatchZoneChangedEvent = useCallback((detail) => {
    if (typeof window === "undefined") return
    try {
      window.dispatchEvent(new CustomEvent("userZoneChanged", { detail }))
    } catch {
      // ignore event dispatch failures
    }
  }, [])

  const detectZone = useCallback(
    async (lat, lng, options = {}) => {
      const {
        force = false,
        movedDistance = null,
        source = "auto",
        accuracy = null,
      } = options

      const now = Date.now()
      if (
        !force &&
        lastFetchAtRef.current &&
        now - lastFetchAtRef.current < LOCATION_REFRESH_THROTTLE_MS
      ) {
        return null
      }

      lastFetchAtRef.current = now
      setLoading(true)
      setError(null)

      try {
        const response = await zoneAPI.detectZone(lat, lng)
        const data = response?.data?.data || {}
        const nextZone =
          data.status === "IN_SERVICE" && data.zoneId
            ? {
                ...(data.zone || {}),
                _id: data.zoneId,
              }
            : null
        const nextStatus =
          data.status === "IN_SERVICE" && nextZone ? "IN_SERVICE" : "OUT_OF_SERVICE"
        const previousZoneId = zoneIdRef.current
        const nextZoneId = nextZone?._id || null
        const zoneChanged =
          hasResolvedOnceRef.current && previousZoneId !== nextZoneId

        commitZoneState(nextZone, nextStatus, null)

        const nextFetchedLocation = {
          latitude: Number(lat),
          longitude: Number(lng),
          accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
          updatedAt: now,
          zoneId: nextZoneId,
        }
        setLastFetchedLocation(nextFetchedLocation)
        writeJsonStorage(LAST_FETCHED_LOCATION_KEY, nextFetchedLocation)

        clearHomeDiscoveryCache()
        setLocationRefreshKey((current) => current + 1)

        const refreshDetail = {
          currentLocation: buildFetchedLocation(
            { latitude: lat, longitude: lng, accuracy, updatedAt: now },
            nextZoneId,
          ),
          currentZone: nextZone,
          currentZoneId: nextZoneId,
          previousZoneId,
          movedDistance,
          zoneChanged,
          source,
          refreshedAt: now,
        }

        dispatchLocationRefreshEvent(refreshDetail)

        if (zoneChanged) {
          dispatchZoneChangedEvent({
            previousZoneId,
            currentZoneId: nextZoneId,
            previousZone: previousZoneId ? { _id: previousZoneId } : null,
            currentZone: nextZone,
            currentLocation: refreshDetail.currentLocation,
            message:
              "Your location has changed. Please add items from restaurants in your current area.",
            refreshedAt: now,
          })
        }

        hasResolvedOnceRef.current = true
        return refreshDetail
      } catch (err) {
        const message =
          err?.response?.data?.message || err?.message || "Failed to detect zone"
        setError(message)
        if (!hasResolvedOnceRef.current) {
          commitZoneState(null, "OUT_OF_SERVICE", message)
        }
        return null
      } finally {
        setLoading(false)
      }
    },
    [
      commitZoneState,
      dispatchLocationRefreshEvent,
      dispatchZoneChangedEvent,
    ],
  )

  useEffect(() => {
    if (!hasUsableCoords(location)) {
      if (!zoneIdRef.current) {
        setZoneStatus("OUT_OF_SERVICE")
      }
      return
    }

    const lat = Number(location.latitude)
    const lng = Number(location.longitude)
    const accuracy = Number.isFinite(Number(location?.accuracy))
      ? Number(location.accuracy)
      : null

    if (
      accuracy != null &&
      accuracy > MAX_ACCEPTABLE_ACCURACY_METERS &&
      hasResolvedOnceRef.current
    ) {
      setAccuracyWarning(
        "Your GPS signal is weak, so nearby restaurants may take a moment to refresh.",
      )
      return
    }

    setAccuracyWarning("")

    const previous = lastFetchedLocation
    const movedDistance =
      previous &&
      Number.isFinite(Number(previous.latitude)) &&
      Number.isFinite(Number(previous.longitude))
        ? haversineDistanceMeters(
            lat,
            lng,
            Number(previous.latitude),
            Number(previous.longitude),
          )
        : null

    const shouldRefresh =
      !previous ||
      !hasResolvedOnceRef.current ||
      (movedDistance != null && movedDistance >= MOVE_THRESHOLD_METERS)

    if (!shouldRefresh) return

    detectZone(lat, lng, {
      movedDistance,
      source: "location-change",
      accuracy,
    })
  }, [
    detectZone,
    lastFetchedLocation,
    location?.accuracy,
    location?.latitude,
    location?.longitude,
    location?.updatedAt,
  ])

  const refreshZone = useCallback(
    async (options = {}) => {
      if (!hasUsableCoords(location)) return null
      return detectZone(Number(location.latitude), Number(location.longitude), {
        ...options,
        force: true,
        source: options?.source || "manual",
        accuracy: location?.accuracy,
      })
    },
    [detectZone, location],
  )

  return useMemo(
    () => ({
      zoneId,
      zone,
      currentZone: zone,
      currentZoneId: zoneId,
      currentLocation: location,
      lastFetchedLocation,
      zoneStatus,
      loading,
      error,
      accuracyWarning,
      isInService: zoneStatus === "IN_SERVICE",
      isOutOfService: zoneStatus === "OUT_OF_SERVICE",
      locationRefreshKey,
      refreshZone,
      detectZone,
    }),
    [
      accuracyWarning,
      detectZone,
      error,
      lastFetchedLocation,
      loading,
      location,
      locationRefreshKey,
      refreshZone,
      zone,
      zoneId,
      zoneStatus,
    ],
  )
}

export function UserZoneProvider({ children }) {
  const value = useUserZoneEngine()
  return <UserZoneContext.Provider value={value}>{children}</UserZoneContext.Provider>
}

export function useZone() {
  const context = useContext(UserZoneContext)
  if (context == null) {
    throw new Error(
      "useZone must be used within <UserZoneProvider>. Wrap the user module layout with the provider.",
    )
  }
  return context
}
