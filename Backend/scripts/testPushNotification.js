/**
 * Test script for Push Notification API
 * Run: node scripts/testPushNotification.js
 * Set ADMIN_EMAIL and ADMIN_PASSWORD in .env or pass as env vars
 */

import "dotenv/config";

const API_BASE = process.env.API_BASE_URL || "http://localhost:5000/api";

async function testPushNotification() {
  const email = process.env.ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD || process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "❌ Set ADMIN_EMAIL and ADMIN_PASSWORD (or TEST_ADMIN_*) in .env to run this test"
    );
    process.exit(1);
  }

  try {
    // 1. Login as admin
    const loginRes = await fetch(`${API_BASE}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json();

    if (!loginData.success || !loginData.data?.accessToken) {
      console.error("❌ Admin login failed:", loginData.message || loginData);
      process.exit(1);
    }

    const token = loginData.data.accessToken;
    // 2. Send push notification
    const pushRes = await fetch(`${API_BASE}/admin/push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Test Notification",
        description: "This is a test push notification from the admin panel.",
        sendTo: "Customer",
        zone: "All",
      }),
    });

    const pushData = await pushRes.json();

    if (pushRes.ok && pushData.success) {
      const { sent, failed, total } = pushData.data || {};
      if (pushData.data?.errors?.length) {
      }
    } else {
      console.error("❌ Push notification failed:", pushData.message || pushData);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Test error:", err.message);
    if (err.cause) console.error(err.cause);
    process.exit(1);
  }
}

testPushNotification();
