/**
 * Google Maps API Key Utility
 * Fetches API key from backend database instead of .env file
 */

let cachedApiKey = null;
let apiKeyPromise = null;

function getEnvGoogleMapsKey() {
  try {
    return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  } catch {
    return "";
  }
}

/**
 * Get Google Maps API Key from backend
 * Uses caching to avoid multiple requests
 * @returns {Promise<string>} Google Maps API Key
 */
export async function getGoogleMapsApiKey() {
  const envFallback = getEnvGoogleMapsKey();

  if (cachedApiKey) {
    return cachedApiKey;
  }

  if (apiKeyPromise) {
    return apiKeyPromise;
  }

  apiKeyPromise = (async () => {
    try {
      const { adminAPI } = await import('../api/index.js');
      const response = await adminAPI.getPublicEnvVariables();

      if (response.data.success && response.data.data?.VITE_GOOGLE_MAPS_API_KEY) {
        cachedApiKey = response.data.data.VITE_GOOGLE_MAPS_API_KEY;
        return cachedApiKey;
      }

      if (envFallback) {
        console.warn(
          'Google Maps API key not in database; using VITE_GOOGLE_MAPS_API_KEY from build env',
        );
        cachedApiKey = envFallback;
        return cachedApiKey;
      }

      console.warn(
        'Google Maps API key not found in database. Set Admin → System → Environment Variables or VITE_GOOGLE_MAPS_API_KEY in .env',
      );
      return '';
    } catch (error) {
      console.warn('Failed to fetch Google Maps API key from backend:', error.message);
      if (envFallback) {
        console.warn('Using VITE_GOOGLE_MAPS_API_KEY from build env as fallback');
        cachedApiKey = envFallback;
        return cachedApiKey;
      }
      return '';
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
