/* eslint-env serviceworker */
/* global firebase, importScripts */
// FCM service worker - must stay in public/ and use importScripts (no ES modules)
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

async function initFirebase() {
  try {
    const res = await fetch("/firebase-config.json");
    if (res.ok) {
      const data = await res.json();
      firebaseConfig.apiKey = data.apiKey || "";
      firebaseConfig.authDomain = data.authDomain || "";
      firebaseConfig.projectId = data.projectId || "";
      firebaseConfig.storageBucket = data.storageBucket || "";
      firebaseConfig.messagingSenderId = data.messagingSenderId || "";
      firebaseConfig.appId = data.appId || "";
    }
  } catch {
    // Ignore config fetch failure
  }
  if (firebaseConfig.projectId && firebaseConfig.appId) {
    firebase.initializeApp(firebaseConfig);
    firebase.messaging().setBackgroundMessageHandler((payload) => {
      const title = payload.notification?.title || "Notification";
      const options = {
        body: payload.notification?.body || "",
        icon: payload.notification?.icon || "/favicon.ico",
      };
      return self.registration.showNotification(title, options);
    });
  }
}

initFirebase();
