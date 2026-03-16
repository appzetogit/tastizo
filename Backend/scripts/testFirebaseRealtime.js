/**
 * Test Firebase Realtime Database connection and write/read.
 * Run: node scripts/testFirebaseRealtime.js
 *
 * Requires: MongoDB connected (for env vars from DB), Firebase credentials in Admin env vars.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const TEST_ORDER_ID = "_test_firebase_realtime_" + Date.now();

async function run() {
  console.log("\n=== Firebase Realtime Database Test ===\n");

  // 1. Connect MongoDB (required for loading env vars from DB)
  console.log("1. Connecting to MongoDB...");
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("   ✅ MongoDB connected\n");
  } catch (err) {
    console.error("   ❌ MongoDB failed:", err.message);
    process.exit(1);
  }

  // 2. Initialize Firebase Realtime (loads credentials from DB)
  console.log("2. Initializing Firebase Realtime (loading credentials from DB)...");
  let db;
  try {
    const { initializeFirebaseRealtime } = await import("../config/firebaseRealtime.js");
    db = await initializeFirebaseRealtime();
    if (!db) {
      console.error("   ❌ Firebase Realtime returned null. Check Admin → System Addons → Firebase credentials.");
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log("   ✅ Firebase Realtime initialized\n");
  } catch (err) {
    console.error("   ❌ Firebase init failed:", err.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  // 3. Write test data
  console.log("3. Writing test data to active_orders/" + TEST_ORDER_ID + "...");
  try {
    await db.ref("active_orders").child(TEST_ORDER_ID).set({
      boy_id: "test-boy",
      boy_lat: 22.7196,
      boy_lng: 75.8577,
      restaurant_lat: 22.72,
      restaurant_lng: 75.86,
      customer_lat: 22.7196,
      customer_lng: 75.8577,
      status: "test",
      created_at: Date.now(),
      last_updated: Date.now(),
    });
    console.log("   ✅ Write successful\n");
  } catch (err) {
    console.error("   ❌ Write failed:", err.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  // 4. Read test data
  console.log("4. Reading test data back...");
  try {
    const snapshot = await db.ref("active_orders").child(TEST_ORDER_ID).once("value");
    const data = snapshot.val();
    if (!data) {
      console.error("   ❌ Read returned null");
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log("   ✅ Read successful:", JSON.stringify(data, null, 2).split("\n").slice(0, 3).join("\n") + "...\n");
  } catch (err) {
    console.error("   ❌ Read failed:", err.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  // 5. Cleanup - remove test data
  console.log("5. Cleaning up test data...");
  try {
    await db.ref("active_orders").child(TEST_ORDER_ID).remove();
    console.log("   ✅ Cleanup done\n");
  } catch (err) {
    console.warn("   ⚠️ Cleanup failed (non-fatal):", err.message);
  }

  console.log("=== All tests passed! Firebase Realtime is working. ===\n");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
