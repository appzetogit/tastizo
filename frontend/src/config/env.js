import { resolveApiBaseUrl } from "../services/api/runtime";

export const ENV = {
  NODE_ENV: import.meta.env.MODE,
  API_BASE_URL: resolveApiBaseUrl(),
  FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  // Add other env vars here
};
