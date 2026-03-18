# Firebase Realtime Database Setup (Live Location Tracking)

Firebase credentials are stored in **Admin Panel → System Addons** (Environment Variables). No `.env` or JSON files needed.

## Required Variables for Live Location Tracking

Add these in **Admin Panel** → **System Addons** → **Firebase Configuration**:

| Variable | Where to get it |
|----------|-----------------|
| **FIREBASE_PROJECT_ID** | Firebase Console → Project Settings → General → Your project ID (e.g. `tastizoo`) |
| **FIREBASE_CLIENT_EMAIL** | Firebase Console → Project Settings → Service Accounts → Generate new key → JSON file → `client_email` |
| **FIREBASE_PRIVATE_KEY** | Same JSON file → `private_key` (paste the full key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`) |
| **FIREBASE_DATABASE_URL** | Firebase Console → Build → Realtime Database → Copy the URL (e.g. `https://tastizoo-default-rtdb.asia-southeast1.firebasedatabase.app`) |

## Additional Variables (for Auth & Frontend)

| Variable | Where to get it |
|----------|-----------------|
| FIREBASE_API_KEY | Firebase Console → Project Settings → General → Web API Key |
| FIREBASE_AUTH_DOMAIN | `your-project.firebaseapp.com` |
| FIREBASE_STORAGE_BUCKET | `your-project.firebasestorage.app` |
| FIREBASE_MESSAGING_SENDER_ID | Project Settings → General |
| FIREBASE_APP_ID | Project Settings → General → Your apps |

## Steps

1. Go to [Firebase Console](https://console.firebase.google.com) → your project.
2. **Realtime Database URL**: Build → Realtime Database → Create database (if not exists) → Copy URL.
3. **Service Account**: Project Settings → Service Accounts → Generate new private key → Download JSON.
4. From the JSON file, copy:
   - `project_id` → FIREBASE_PROJECT_ID
   - `client_email` → FIREBASE_CLIENT_EMAIL
   - `private_key` → FIREBASE_PRIVATE_KEY (entire key with newlines)
5. In your app: **Admin** → **System Addons** → fill all Firebase fields → **Save**.
6. Restart the backend server.

## Firebase Realtime Database Structure

```
active_orders/
  <orderId>/
    boy_id, boy_lat, boy_lng, restaurant_lat, restaurant_lng
    customer_lat, customer_lng, polyline, distance, duration
    status, created_at, last_updated

delivery_boys/
  <boyId>/
    lat, lng, status (online/offline), last_updated

route_cache/
  <cacheKey>/   (e.g. "22_7118_75_9_22_7111_75_9002")
    polyline, distance, duration, cached_at, expires_at
```

- **active_orders**: Live order tracking. Polyline fetched once via Directions API, then stored. User app reads from Firebase (no repeated API calls).
- **delivery_boys**: Delivery partner online/offline status and current location. Used for "nearest boy" assignment (Haversine, no Distance Matrix).
- **route_cache**: Cached polylines to avoid repeated Directions API calls for same origin/destination.

## Verify

After restart, you should see in backend logs:
- `✅ Firebase Realtime Database initialized` (or a warning if credentials are missing)
- `🚀 Server running on port 5000`

**Important**: The server starts only after MongoDB + Firebase init complete. This prevents "Firebase Realtime Database not initialized" errors when requests arrive before Firebase is ready.

Live delivery tracking will work once these are set.
