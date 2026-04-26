/**
 * Google Maps API Key Utility
 * Prefers build-time env and falls back to backend public env at runtime.
 */

import { API_BASE_URL } from "@food/api/config";

let cachedApiKey = null;
let apiKeyPromise = null;

function sanitizeApiKey(value) {
  if (!value) return "";
  return String(value).trim().replace(/^['"]|['"]$/g, "");
}

function resolveBackendOrigin() {
  const apiBaseUrl = sanitizeApiKey(API_BASE_URL);

  if (!apiBaseUrl && typeof window !== "undefined") {
    return window.location.origin;
  }

  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return String(apiBaseUrl || "")
      .replace(/\/api\/v\d+\/?$/i, "")
      .replace(/\/api\/?$/i, "")
      .replace(/\/+$/, "");
  }
}

/**
 * Get Google Maps API Key from frontend env.
 * Uses caching to avoid repeated fetch/sanitization.
 * @returns {Promise<string>} Google Maps API Key
 */
export async function getGoogleMapsApiKey() {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  if (apiKeyPromise) {
    return apiKeyPromise;
  }

  apiKeyPromise = (async () => {
    const envKey = sanitizeApiKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
    if (envKey) {
      cachedApiKey = envKey;
      return cachedApiKey;
    }

    const backendOrigin = resolveBackendOrigin();
    if (!backendOrigin) {
      return "";
    }

    try {
      const response = await fetch(`${backendOrigin}/api/food/public/env`, {
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      cachedApiKey = sanitizeApiKey(data?.data?.VITE_GOOGLE_MAPS_API_KEY);
      return cachedApiKey;
    } catch {
      return "";
    } finally {
      apiKeyPromise = null;
    }
  })();

  return apiKeyPromise;
}

/**
 * Clear cached API key (call after updating in admin panel)
 */
export function clearGoogleMapsApiKeyCache() {
  cachedApiKey = null;
  apiKeyPromise = null;
}

