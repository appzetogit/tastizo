/**
 * Firebase Realtime Database service for live tracking.
 * Writes: active_orders, delivery_boys. Uses route_cache key format for consistency.
 */

import { getDb, isFirebaseRealtimeAvailable } from "../config/firebaseRealtime.js";

/**
 * Upsert active_orders/<orderId> with route polyline and initial positions.
 * Call after assigning order to delivery boy.
 */
export async function upsertActiveOrder(payload) {
  if (!isFirebaseRealtimeAvailable()) return;
  try {
    const db = getDb();
    const {
      orderId,
      boy_id,
      boy_lat,
      boy_lng,
      restaurant_lat,
      restaurant_lng,
      customer_lat,
      customer_lng,
      polyline,
      distance,
      duration,
      status = "assigned",
    } = payload;
    const now = Date.now();
    await db.ref("active_orders").child(orderId).set({
      boy_id: boy_id || null,
      boy_lat: boy_lat ?? restaurant_lat,
      boy_lng: boy_lng ?? restaurant_lng,
      restaurant_lat,
      restaurant_lng,
      customer_lat,
      customer_lng,
      polyline: polyline || "",
      distance: distance ?? 0,
      duration: duration ?? 0,
      status,
      created_at: now,
      last_updated: now,
    });
  } catch (err) {
    console.warn("Firebase upsertActiveOrder failed:", err.message);
  }
}

/**
 * Update only rider position for an active order.
 */
export async function updateActiveOrderLocation(orderId, boy_lat, boy_lng) {
  if (!isFirebaseRealtimeAvailable()) return;
  try {
    const db = getDb();
    await db.ref("active_orders").child(orderId).update({
      boy_lat,
      boy_lng,
      last_updated: Date.now(),
    });
  } catch (err) {
    console.warn("Firebase updateActiveOrderLocation failed:", err.message);
  }
}

/**
 * Set or update delivery_boys/<boyId> (online status and location).
 */
export async function setDeliveryBoyStatus(boyId, { lat, lng, status = "online" }) {
  if (!isFirebaseRealtimeAvailable()) return;
  try {
    const db = getDb();
    const updates = {
      last_updated: Date.now(),
      status: status === false ? "offline" : (status || "online"),
    };
    if (typeof lat === "number" && typeof lng === "number") {
      updates.lat = lat;
      updates.lng = lng;
    }
    await db.ref("delivery_boys").child(boyId).update(updates);
  } catch (err) {
    console.warn("Firebase setDeliveryBoyStatus failed:", err.message);
  }
}

/**
 * Update delivery boy location (and optionally active order rider position).
 */
export async function updateDeliveryBoyLocation(boyId, lat, lng, orderId = null) {
  if (!isFirebaseRealtimeAvailable()) return;
  try {
    const db = getDb();
    const now = Date.now();
    await db.ref("delivery_boys").child(boyId).update({
      lat,
      lng,
      status: "online",
      last_updated: now,
    });
    if (orderId) {
      await db.ref("active_orders").child(orderId).update({
        boy_lat: lat,
        boy_lng: lng,
        last_updated: now,
      });
    }
  } catch (err) {
    console.warn("Firebase updateDeliveryBoyLocation failed:", err.message);
  }
}

/**
 * Remove order from active_orders when delivered/cancelled (optional).
 */
export async function removeActiveOrder(orderId) {
  if (!isFirebaseRealtimeAvailable()) return;
  try {
    const db = getDb();
    await db.ref("active_orders").child(orderId).remove();
  } catch (err) {
    console.warn("Firebase removeActiveOrder failed:", err.message);
  }
}
