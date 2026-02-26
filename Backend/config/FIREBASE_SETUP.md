# Firebase Realtime Database Setup

1. Open [Firebase Console](https://console.firebase.google.com) → your project (e.g. **tastizo**).
2. Go to **Project settings** (gear) → **Service accounts**.
3. Click **Generate new private key** and download the JSON file.
4. Save it in this folder as **`serviceAccountKey.json`** (do not commit this file; it is in `.gitignore`).
5. Restart the backend. You should see: `✅ Firebase Realtime Database initialized`.

Optional: In project root `.env` you can set:
- `FIREBASE_DATABASE_URL=https://tastizoo-default-rtdb.asia-southeast1.firebasedatabase.app`
- Or set the same in Admin Panel → System → Environment Variables.

The frontend will receive the database URL from the backend public env API; no extra step needed.
