/**
 * Reuse last reverse-geocode result when GPS is within GEOCODE_REUSE_RADIUS_M of the cached point.
 * Saves Google Geocoding / backend calls; GPS coords still come from the device.
 *
 * - localStorage: all users
 * - Firebase RTDB (optional): logged-in users — see firebaseGeocodeCache.js + security rules
 */

export const GEOCODE_REUSE_RADIUS_M = 200

const LS_KEY = "tastizo_geocode_cache_v1"

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function readLocalGeocodeCache() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null
    if (!raw) return null
    const o = JSON.parse(raw)
    if (typeof o.lat !== "number" || typeof o.lng !== "number" || !o.parsed) return null
    return { lat: o.lat, lng: o.lng, parsed: o.parsed, updatedAt: o.updatedAt || 0 }
  } catch {
    return null
  }
}

export function writeLocalGeocodeCache(entry) {
  try {
    if (typeof localStorage === "undefined") return
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        lat: entry.lat,
        lng: entry.lng,
        parsed: entry.parsed,
        updatedAt: entry.updatedAt || Date.now(),
      }),
    )
  } catch {
    // quota / private mode
  }
}

async function readRemoteGeocodeCache() {
  try {
    const mod = await import("./firebaseGeocodeCache.js")
    return await mod.loadFirebaseGeocodeCacheEntry()
  } catch {
    return null
  }
}

async function writeRemoteGeocodeCache(entry) {
  try {
    const mod = await import("./firebaseGeocodeCache.js")
    await mod.saveFirebaseGeocodeCacheEntry(entry)
  } catch {
    // ignore
  }
}

export async function readGeocodeCacheBest() {
  const local = readLocalGeocodeCache()
  const remote = await readRemoteGeocodeCache()
  if (!remote) return local
  if (!local) return remote
  return (remote.updatedAt || 0) >= (local.updatedAt || 0) ? remote : local
}

/** Parsed address blob (Google-shaped keys used by LocationSelectorOverlay). */
export async function getCachedParsedIfWithinRadius(lat, lng, radiusM = GEOCODE_REUSE_RADIUS_M) {
  const entry = await readGeocodeCacheBest()
  if (!entry?.parsed) return null
  const d = haversineMeters(entry.lat, entry.lng, lat, lng)
  if (d <= radiusM) return entry.parsed
  return null
}

export async function saveGeocodeCacheEntry(lat, lng, parsed) {
  if (!parsed || typeof lat !== "number" || typeof lng !== "number") return
  const entry = { lat, lng, parsed, updatedAt: Date.now() }
  writeLocalGeocodeCache(entry)
  await writeRemoteGeocodeCache(entry)
}
