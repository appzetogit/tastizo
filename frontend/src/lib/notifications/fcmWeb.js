import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { ensureFirebaseInitialized, getFirebaseVapidKey } from "@/lib/firebase";
import { authAPI, restaurantAPI } from "@/lib/api";

const FCM_SW_PATH = "/firebase-messaging-sw.js";
const FCM_SW_SCOPE = "/firebase-cloud-messaging-push-scope/";

// Internal helper to get a browser FCM token (shared by user + restaurant)
async function getBrowserFcmToken() {
  console.log("[FCM] Starting web FCM registration flow");

  // Ensure Firebase app is initialized
  const app = await ensureFirebaseInitialized();
  if (!app) {
    console.warn("[FCM] Firebase app not initialized, skipping FCM registration");
    return null;
  }

  // Check if Messaging is supported in this browser
  const supported = await isSupported();
  if (!supported) {
    console.warn("[FCM] Firebase messaging is not supported in this browser");
    return null;
  }

  // Request notification permission
  if (typeof Notification !== "undefined") {
    const permission = await Notification.requestPermission();
    console.log("[FCM] Notification permission:", permission);
    if (permission !== "granted") {
      return null;
    }
  } else {
    console.warn("[FCM] Notification API not available");
    return null;
  }

  const messaging = getMessaging(app);
  const vapidKey = getFirebaseVapidKey();
  if (!vapidKey) {
    console.warn(
      "[FCM] No VAPID key. Set FIREBASE_VAPID_KEY in Admin → Environment Variables, or VITE_FIREBASE_VAPID_KEY in .env",
    );
    return null;
  }

  // Register our service worker so Firebase does not try to use the non-existent default path
  const registration = await navigator.serviceWorker.register(FCM_SW_PATH, {
    scope: FCM_SW_SCOPE,
  });
  await registration.ready;

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  console.log("[FCM] getToken result length:", token?.length || 0);

  if (!token) {
    console.warn(
      "[FCM] No FCM token from getToken. Ensure notification permission is granted and VAPID key is set.",
    );
    return null;
  }

  return token;
}

export async function registerFcmTokenForLoggedInUser() {
  try {
    const token = await getBrowserFcmToken();
    if (!token) return;

    console.log("[FCM] Token to send (user):", token.substring(0, 30) + "...");
    const res = await authAPI.registerFcmToken("web", token);
    const saved =
      res?.data?.data?.fcmTokenWeb ?? res?.data?.data?.fcmtokenWeb;
    console.log(
      "[FCM] Backend saved user fcmTokenWeb:",
      saved ? saved.substring(0, 30) + "..." : "null",
    );
  } catch (error) {
    console.error(
      "[FCM] Error during user web FCM registration:",
      error?.message || error,
    );
    if (error?.code === "messaging/permission-blocked") {
      console.warn(
        "[FCM] User denied notification permission. Token will stay null until permission is granted.",
      );
    } else if (error?.code === "messaging/invalid-vapid-key") {
      console.warn("[FCM] Invalid VAPID key. Check VITE_FIREBASE_VAPID_KEY in .env.");
    }
  }
}

export async function registerFcmTokenForRestaurant() {
  try {
    const token = await getBrowserFcmToken();
    if (!token) return;

    console.log(
      "[FCM][Restaurant] Token to send:",
      token.substring(0, 30) + "...",
    );
    const res = await restaurantAPI.registerFcmToken("web", token);
    const saved =
      res?.data?.data?.fcmTokenWeb ?? res?.data?.data?.fcmtokenWeb;
    console.log(
      "[FCM][Restaurant] Backend saved fcmTokenWeb:",
      saved ? saved.substring(0, 30) + "..." : "null",
    );
  } catch (error) {
    console.error(
      "[FCM][Restaurant] Error during web FCM registration:",
      error?.message || error,
    );
  }
}

export async function removeFcmTokenForLoggedInUser() {
  try {
    await authAPI.removeFcmToken("web");
  } catch (error) {
    console.error("[FCM] Error removing FCM token for web:", error);
  }
}

export async function removeFcmTokenForRestaurant() {
  try {
    await restaurantAPI.removeFcmToken("web");
  } catch (error) {
    console.error("[FCM][Restaurant] Error removing FCM token for web:", error);
  }
}

