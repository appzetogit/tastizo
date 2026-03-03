import { getDatabase, onValue, ref as dbRef } from "firebase/database"
import { ensureFirebaseInitialized } from "./firebase"

let dbInstance = null

async function getRealtimeDb() {
  if (dbInstance) return dbInstance

  const app = await ensureFirebaseInitialized()
  if (!app) {
    console.warn("⚠️ Firebase app not initialized, realtime DB unavailable.")
    return null
  }

  dbInstance = getDatabase(app)
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

