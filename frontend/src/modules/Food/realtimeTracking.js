import { onValue, ref, set, update, get } from 'firebase/database';
import { firebaseRealtimeDb, ensureFirebaseInitialized } from '@food/firebase';

function sanitizeRealtimeKey(value) {
  return String(value || '').trim().replace(/[.#$/[\]]/g, '_');
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDeliveryLocationPath(deliveryId) {
  return `delivery_boys/${sanitizeRealtimeKey(deliveryId)}`;
}

function getRestaurantLocationPath(restaurantId) {
  return `restaurant/${sanitizeRealtimeKey(restaurantId)}/location`;
}

function getOrderTrackingPath(orderId) {
  return `active_orders/${sanitizeRealtimeKey(orderId)}`;
}

export function subscribeOrderTracking(orderId, onChange, onError) {
  if (!orderId || typeof onChange !== 'function') return () => {};
  // Keep auth disabled on tracking pages to avoid identitytoolkit
  // getProjectConfig calls that can fail for API-key-restricted setups.
  ensureFirebaseInitialized({ enableAuth: false, enableRealtimeDb: true });
  const path = getOrderTrackingPath(orderId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export function subscribeDeliveryLocation(deliveryId, onChange, onError) {
  if (!deliveryId || typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized({ enableAuth: false, enableRealtimeDb: true });
  const path = getDeliveryLocationPath(deliveryId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export function subscribeAllDeliveryLocations(onChange, onError) {
  if (typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized({ enableAuth: false, enableRealtimeDb: true });
  const path = 'delivery';
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      onChange(snapshot.val() || {}, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export function subscribeRestaurantLocation(restaurantId, onChange, onError) {
  if (!restaurantId || typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized({ enableAuth: false, enableRealtimeDb: true });
  const path = getRestaurantLocationPath(restaurantId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export async function writeDeliveryLocation({
  deliveryId,
  lat,
  lng,
  heading = 0,
  speed = 0,
  isOnline = true,
  activeOrderId = null,
  accuracy = null,
  timestamp = Date.now(),
}) {
  if (!deliveryId) return false;
  ensureFirebaseInitialized({ enableAuth: false, enableRealtimeDb: true });
  
  const locRef = ref(firebaseRealtimeDb, getDeliveryLocationPath(deliveryId));
  const incomingTimestamp = toFiniteNumber(timestamp) || Date.now();

  try {
    const snapshot = await get(locRef);
    const currentData = snapshot.val();
    if (currentData && currentData.timestamp && incomingTimestamp < currentData.timestamp) {
      return false; // Reject stale packet
    }
  } catch (e) {
    // Ignore read errors and proceed to write
  }

  const payload = {
    lat: toFiniteNumber(lat),
    lng: toFiniteNumber(lng),
    heading: toFiniteNumber(heading) || 0,
    speed: toFiniteNumber(speed) || 0,
    accuracy: toFiniteNumber(accuracy),
    timestamp: incomingTimestamp,
    last_updated: Date.now(),
    isOnline: Boolean(isOnline),
    activeOrderId: activeOrderId ? String(activeOrderId) : null,
  };
  await set(locRef, payload);
  return true;
}

/**
 * Write order tracking data to Firebase at orders/{orderId}/tracking.
 * Used by the delivery app to publish rider location; user tracking page reads from the same path.
 * Payload should include: lat, lng, heading (or bearing), and optionally speed, polyline, route_coordinates.
 */
export async function writeOrderTracking(orderId, payload = {}) {
  if (!orderId) return false;
  ensureFirebaseInitialized({ enableAuth: false, enableRealtimeDb: true });
  
  const orderRef = ref(firebaseRealtimeDb, getOrderTrackingPath(orderId));
  const incomingTimestamp = toFiniteNumber(payload.timestamp) || Date.now();

  try {
    const snapshot = await get(orderRef);
    const currentData = snapshot.val();
    if (currentData && currentData.timestamp && incomingTimestamp < currentData.timestamp) {
      return false; // Reject stale packet
    }
  } catch (e) {
    // Proceed if read fails
  }

  const toWrite = {
    ...payload,
    lat: toFiniteNumber(payload.lat),
    lng: toFiniteNumber(payload.lng),
    heading: toFiniteNumber(payload.heading ?? payload.bearing) || 0,
    timestamp: incomingTimestamp,
    last_updated: Date.now(),
  };
  await update(orderRef, toWrite);
  return true;
}
