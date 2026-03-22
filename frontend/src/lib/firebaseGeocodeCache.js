/**
 * Optional Firebase Realtime Database mirror for geocode cache (logged-in users).
 * Rules example:
 *   "user_geocode_cache": {
 *     "$uid": { ".read": "auth.uid == $uid", ".write": "auth.uid == $uid" }
 *   }
 */
import { getDatabase, ref, get, set } from "firebase/database"
import { ensureFirebaseInitialized, firebaseAuth, getFirebaseApp, getFirebaseDatabaseURL } from "./firebase.js"

const RT_PATH = "user_geocode_cache"

export async function loadFirebaseGeocodeCacheEntry() {
  await ensureFirebaseInitialized()
  const uid = firebaseAuth?.currentUser?.uid
  if (!uid) return null
  const app = getFirebaseApp()
  if (!app) return null
  if (!getFirebaseDatabaseURL()) return null
  try {
    const db = getDatabase(app)
    const snap = await get(ref(db, `${RT_PATH}/${uid}`))
    if (!snap.exists()) return null
    const v = snap.val()
    if (typeof v?.lat !== "number" || typeof v?.lng !== "number" || !v?.parsed) return null
    return {
      lat: v.lat,
      lng: v.lng,
      parsed: v.parsed,
      updatedAt: v.updatedAt || 0,
    }
  } catch (e) {
    console.warn("RTDB geocode cache read skipped:", e?.message)
    return null
  }
}

export async function saveFirebaseGeocodeCacheEntry(entry) {
  await ensureFirebaseInitialized()
  const uid = firebaseAuth?.currentUser?.uid
  if (!uid) return
  const app = getFirebaseApp()
  if (!app) return
  if (!getFirebaseDatabaseURL()) return
  try {
    const db = getDatabase(app)
    await set(ref(db, `${RT_PATH}/${uid}`), {
      lat: entry.lat,
      lng: entry.lng,
      parsed: entry.parsed,
      updatedAt: entry.updatedAt || Date.now(),
    })
  } catch (e) {
    console.warn("RTDB geocode cache write skipped:", e?.message)
  }
}
