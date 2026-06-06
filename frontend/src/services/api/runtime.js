const sanitizeBaseUrl = (value) => String(value || "").trim().replace(/\/$/, "");

export const resolveApiBaseUrl = () => {
  const explicitBaseUrl =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
      ? sanitizeBaseUrl(import.meta.env.VITE_API_BASE_URL)
      : "";

  const isLocalhostExplicit = explicitBaseUrl.includes("localhost") || explicitBaseUrl.includes("127.0.0.1");

  if (explicitBaseUrl && !(import.meta.env?.PROD && isLocalhostExplicit)) {
    return explicitBaseUrl;
  }

  if (typeof window !== "undefined" && typeof window.location?.hostname === "string") {
    const hostname = window.location.hostname;
    if (hostname === "tastizo.com" || hostname === "www.tastizo.com" || hostname.endsWith(".tastizo.com")) {
      return "https://api.tastizo.com/api/v1";
    }
  }

  // In production, prefer the current origin so deployed frontend + backend on the
  // same domain still work even when VITE_API_BASE_URL is missing at build time.
  if (
    typeof window !== "undefined" &&
    typeof window.location?.origin === "string" &&
    import.meta.env?.PROD
  ) {
    return `${window.location.origin}/api/v1`;
  }

  // Keep the relative path in local/dev so the Vite proxy continues to work.
  return "/api/v1";
};

export const resolveBackendOrigin = () => {
  const apiBaseUrl = resolveApiBaseUrl();

  try {
    if (apiBaseUrl.startsWith("http")) {
      return new URL(apiBaseUrl).origin;
    }
  } catch {
    // Fall through to regex-based cleanup.
  }

  if (typeof window !== "undefined" && typeof window.location?.origin === "string") {
    return window.location.origin;
  }

  return apiBaseUrl
    .replace(/\/api\/v\d+\/?$/i, "")
    .replace(/\/api\/?$/i, "")
    .replace(/\/+$/, "");
};

