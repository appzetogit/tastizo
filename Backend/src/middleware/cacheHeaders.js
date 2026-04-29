const IMMUTABLE_ASSET_REGEX = /\.(?:js|mjs|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$/i;

export const apiCacheHeaders = (req, res, next) => {
  if (req.method !== "GET") return next();

  const path = String(req.originalUrl || req.url || "");
  if (
    path.includes("/auth/") ||
    path.includes("/orders") ||
    path.includes("/payments") ||
    path.includes("/notifications") ||
    path.includes("/fcm-tokens")
  ) {
    res.setHeader("Cache-Control", "private, no-store");
    return next();
  }

  if (
    path.includes("/health") ||
    path.includes("/ready") ||
    path.includes("/public") ||
    path.includes("/hero-banners") ||
    path.includes("/business-settings/public") ||
    path.includes("/dining/categories/public") ||
    path.includes("/dining/restaurants/public")
  ) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return next();
  }

  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
  next();
};

export const staticAssetCacheHeaders = (req, res, next) => {
  if (req.method !== "GET") return next();

  const path = String(req.originalUrl || req.url || "");
  if (IMMUTABLE_ASSET_REGEX.test(path)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }

  next();
};
