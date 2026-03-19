/* eslint-env serviceworker */
/* global firebase, importScripts */
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function loadConfigFromApi() {
  try {
    const response = await fetch("/api/env/public", { cache: "no-store" });
    if (!response.ok) return false;
    const json = await response.json();
    const cfg = json?.data || {};

    firebaseConfig.apiKey = cfg.FIREBASE_API_KEY || "";
    firebaseConfig.authDomain = cfg.FIREBASE_AUTH_DOMAIN || "";
    firebaseConfig.projectId = cfg.FIREBASE_PROJECT_ID || "";
    firebaseConfig.storageBucket = cfg.FIREBASE_STORAGE_BUCKET || "";
    firebaseConfig.messagingSenderId = cfg.FIREBASE_MESSAGING_SENDER_ID || "";
    firebaseConfig.appId = cfg.FIREBASE_APP_ID || "";
    return true;
  } catch {
    return false;
  }
}

async function loadConfigFromStaticFile() {
  try {
    const response = await fetch("/firebase-config.json", { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();

    firebaseConfig.apiKey = data.apiKey || firebaseConfig.apiKey;
    firebaseConfig.authDomain = data.authDomain || firebaseConfig.authDomain;
    firebaseConfig.projectId = data.projectId || firebaseConfig.projectId;
    firebaseConfig.storageBucket = data.storageBucket || firebaseConfig.storageBucket;
    firebaseConfig.messagingSenderId = data.messagingSenderId || firebaseConfig.messagingSenderId;
    firebaseConfig.appId = data.appId || firebaseConfig.appId;
    return true;
  } catch {
    return false;
  }
}

function isConfigReady() {
  return !!(firebaseConfig.projectId && firebaseConfig.appId && firebaseConfig.messagingSenderId);
}

function showNotificationFromPayload(payload) {
  const title = payload?.notification?.title || payload?.data?.title || "Tastizo";
  const body = payload?.notification?.body || payload?.data?.body || "";
  const icon = payload?.notification?.icon || payload?.data?.icon || "/favicon.ico";
  const tag = payload?.data?.tag || payload?.data?.orderId || "tastizo-notification";

  return self.registration.showNotification(title, {
    body,
    icon,
    badge: "/favicon.ico",
    tag,
    data: payload?.data || {},
    requireInteraction: false,
    vibrate: [200, 100, 200],
  });
}

async function initFirebaseMessaging() {
  await loadConfigFromApi();
  if (!isConfigReady()) {
    await loadConfigFromStaticFile();
  }
  if (!isConfigReady()) return;

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => showNotificationFromPayload(payload));
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.link || data.click_action || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "FCM_NOTIFICATION_CLICK", data });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});

initFirebaseMessaging();
