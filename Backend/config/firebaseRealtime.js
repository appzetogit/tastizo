/**
 * Firebase Realtime Database (Backend)
 * Used for: active_orders, delivery_boys, route_cache, live tracking.
 * Must be initialized after DB connection (credentials loaded from Admin env vars).
 *
 * Setup: Add Firebase config in Admin Panel → System → Environment Variables
 * Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL
 */

import admin from "firebase-admin";

const DEFAULT_DATABASE_URL =
  "https://tastizoo-default-rtdb.asia-southeast1.firebasedatabase.app";

let db = null;
let initialized = false;

/**
 * Initialize Firebase Realtime Database.
 * Loads credentials from DB (Admin env vars). Call after connectDB().
 * @returns {Promise<object|null>} Firebase Realtime DB instance or null
 */
export async function initializeFirebaseRealtime() {
  if (initialized && db) {
    return db;
  }

  try {
    const { getFirebaseCredentials } = await import("../shared/utils/envService.js");
    const creds = await getFirebaseCredentials();

    let projectId = creds.projectId;
    let clientEmail = creds.clientEmail;
    let privateKey = creds.privateKey;

    if (privateKey && privateKey.includes("\\n")) {
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

    if (!projectId || !clientEmail || !privateKey) {
      console.warn(
        "⚠️ Firebase Realtime Database not initialized: missing credentials. " +
          "Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in Admin → Environment Variables."
      );
      return null;
    }

    const databaseURL = creds.databaseURL || DEFAULT_DATABASE_URL;

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        databaseURL,
      });
    }
    const app = admin.app();
    db = app.database(databaseURL);
    initialized = true;
    return db;
  } catch (error) {
    if (error?.code === "app/duplicate-app") {
      const app = admin.app();
      db = app.database();
      initialized = true;
      return db;
    }
    console.error("❌ Firebase Realtime Database init failed:", error.message);
    return null;
  }
}

/**
 * Get the Firebase Realtime Database instance.
 * Throws if initializeFirebaseRealtime() was not called or failed.
 */
export function getDb() {
  if (!db || !initialized) {
    console.warn(
      "⚠️ Firebase Realtime Database not initialized. Call initializeFirebaseRealtime() first."
    );
    throw new Error(
      "Firebase Realtime Database not available. Call initializeFirebaseRealtime() first."
    );
  }
  return db;
}

/**
 * Check if Firebase Realtime Database is available (for optional features).
 */
export function isFirebaseRealtimeAvailable() {
  return initialized && db !== null;
}
