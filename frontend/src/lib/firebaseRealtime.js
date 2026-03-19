import { get, getDatabase, onValue, ref as dbRef } from "firebase/database"
import { ensureFirebaseInitialized, getFirebaseDatabaseURL } from "./firebase"

let dbInstance = null

async function getRealtimeDb() {
  if (dbInstance) return dbInstance

  const app = await ensureFirebaseInitialized()
  if (!app) {
    console.warn("⚠️ Firebase app not initialized, realtime DB unavailable.")
    return null
  }

  const databaseURL = getFirebaseDatabaseURL()
  if (databaseURL) {
    dbInstance = getDatabase(app, databaseURL)
  } else {
    dbInstance = getDatabase(app)
  }
  return dbInstance
}

/**
 * Subscribe to Firebase Realtime Database active_orders/<orderId>
 * and invoke callback whenever delivery boy location changes.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToActiveOrderLocation(orderId, callback) {
  if (!orderId) {
    console.warn("subscribeToActiveOrderLocation: orderId is required")
    return () => {}
  }

  let unsub = null
  let cancelled = false

  getRealtimeDb().then((db) => {
    if (!db || cancelled) return

    const orderRef = dbRef(db, `active_orders/${orderId}`)
    unsub = onValue(orderRef, (snapshot) => {
      if (!snapshot.exists()) return
      const data = snapshot.val() || {}

      // Prefer explicit boy_lat/boy_lng; fall back to generic lat/lng
      const rawLat = data.boy_lat ?? data.lat
      const rawLng = data.boy_lng ?? data.lng

      const lat = typeof rawLat === "string" ? parseFloat(rawLat) : rawLat
      const lng = typeof rawLng === "string" ? parseFloat(rawLng) : rawLng

      if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return
      }

      callback({
        lat,
        lng,
        polyline: data.polyline || null,
        status: data.status || null,
        restaurantLat: data.restaurant_lat,
        restaurantLng: data.restaurant_lng,
        customerLat: data.customer_lat,
        customerLng: data.customer_lng,
        updatedAt: data.last_updated || Date.now(),
        raw: data,
      })
    })
  })

  return () => {
    cancelled = true
    if (unsub) unsub()
  }
}

/**
 * Fetch user location once from Firebase Realtime Database users/<userId>.
 * Used for fast splash-screen location without triggering geolocation/reverse-geocode.
 *
 * Returns null if not available.
 */
export async function getUserLocationOnce(userId) {
  if (!userId) return null
  const db = await getRealtimeDb()
  if (!db) return null

  try {
    const snap = await get(dbRef(db, `users/${userId}`))
    if (!snap.exists()) return null
    const data = snap.val() || {}

    const lat = typeof data.lat === "string" ? parseFloat(data.lat) : data.lat
    const lng = typeof data.lng === "string" ? parseFloat(data.lng) : data.lng
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null
    }

    return {
      lat,
      lng,
      area: data.area || "",
      city: data.city || "",
      state: data.state || "",
      address: data.address || "",
      formattedAddress: data.formatted_address || data.formattedAddress || data.formatted_address || "",
      updatedAt: data.last_updated || Date.now(),
      raw: data,
    }
  } catch {
    return null
  }
}

