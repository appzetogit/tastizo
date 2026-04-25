import { logger } from "../../../utils/logger.js";

const reverseGeocodeCache = new Map();
const REVERSE_GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REVERSE_GEOCODE_MIN_INTERVAL_MS = 1200;
const lastCallByIp = new Map();

const roundCoord = (value) => Math.round(Number(value) * 10000) / 10000;
const cacheKeyFor = (lat, lng) => `${roundCoord(lat)},${roundCoord(lng)}`;

const json = (res, status, body) => res.status(status).json(body);

const buildMinimalPayload = (lat, lng, source = "coordinates_only") => ({
  success: true,
  data: {
    results: [
      {
        formatted_address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        address_components: {
          city: "",
          state: "",
          country: "",
          area: "",
          road: "",
          building: "",
          postcode: "",
        },
        geometry: {
          location: { lat, lng },
        },
      },
    ],
  },
  source,
});

const buildProcessedPayload = ({
  lat,
  lng,
  formattedAddress,
  addressComponents,
  source,
}) => ({
  success: true,
  data: {
    results: [
      {
        formatted_address: formattedAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        address_components: addressComponents || {},
        geometry: {
          location: { lat, lng },
        },
      },
    ],
  },
  source,
});

const safeFetchJson = async (url, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const reverseGeocodeWithBigDataCloud = async (lat, lng) => {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
  const data = await safeFetchJson(url, {}, 8000);

  const city = data?.city || data?.locality || data?.principalSubdivision || "";
  const state = data?.principalSubdivision || "";
  const country = data?.countryName || "";
  const area =
    data?.localityInfo?.administrative?.find((item) => Number(item?.adminLevel) >= 7)?.name ||
    data?.locality ||
    city;
  const road =
    data?.localityInfo?.informative?.find((item) =>
      String(item?.description || "").toLowerCase().includes("road"),
    )?.name || "";
  const postcode = data?.postcode || "";

  const formattedAddress =
    data?.formattedAddress ||
    [data?.locality, city, state, country].filter(Boolean).join(", ");

  return buildProcessedPayload({
    lat,
    lng,
    formattedAddress,
    addressComponents: {
      city,
      state,
      country,
      area,
      road,
      building: "",
      postcode,
    },
    source: "bigdatacloud",
  });
};

export const reverseGeocode = async (req, res) => {
  try {
    const lat = Number(req.query?.lat);
    const lng = Number(req.query?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json(res, 400, {
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json(res, 400, {
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    const forceFresh =
      String(req.query?.force || "").toLowerCase() === "true" ||
      String(req.query?.force || "") === "1";

    const now = Date.now();
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "")
      .split(",")[0]
      .trim();
    const key = cacheKeyFor(lat, lng);

    if (!forceFresh) {
      const cached = reverseGeocodeCache.get(key);
      if (cached && cached.expiresAt > now) {
        return res.json(cached.payload);
      }

      const lastCall = lastCallByIp.get(ip) || 0;
      if (ip && now - lastCall < REVERSE_GEOCODE_MIN_INTERVAL_MS) {
        return res.json(buildMinimalPayload(lat, lng, "throttled_coordinates_only"));
      }
    }

    if (ip) {
      lastCallByIp.set(ip, now);
    }

    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1&accept-language=en&zoom=18`;
      const data = await safeFetchJson(
        nominatimUrl,
        {
          headers: {
            "User-Agent": "Tastizo-App/1.0",
            Accept: "application/json",
          },
        },
        10000,
      );

      if (!data || data.error) {
        throw new Error(data?.error || "No reverse geocode result");
      }

      const address = data.address || {};
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        "";
      const state = address.state || "";
      const country = address.country || "";
      const area =
        address.neighbourhood ||
        address.suburb ||
        address.residential ||
        address.quarter ||
        address.city_district ||
        address.borough ||
        address.hamlet ||
        "";
      const road =
        address.road ||
        address.pedestrian ||
        address.footway ||
        address.path ||
        "";
      const building = address.building || address.amenity || address.shop || "";
      const postcode = address.postcode || "";

      const payload = buildProcessedPayload({
        lat,
        lng,
        formattedAddress: String(data.display_name || "").trim(),
        addressComponents: {
          city,
          state,
          country,
          area,
          road,
          building,
          postcode,
          house_number: address.house_number || "",
          suburb: address.suburb || "",
          neighbourhood: address.neighbourhood || "",
          residential: address.residential || "",
          quarter: address.quarter || "",
          city_district: address.city_district || "",
        },
        source: "nominatim",
      });

      reverseGeocodeCache.set(key, {
        expiresAt: now + REVERSE_GEOCODE_CACHE_TTL_MS,
        payload,
      });

      return res.json(payload);
    } catch (nominatimError) {
      logger.warn(`Reverse geocode fallback triggered: ${nominatimError.message}`);

      try {
        const fallbackPayload = await reverseGeocodeWithBigDataCloud(lat, lng);
        reverseGeocodeCache.set(key, {
          expiresAt: now + REVERSE_GEOCODE_CACHE_TTL_MS,
          payload: fallbackPayload,
        });
        return res.json(fallbackPayload);
      } catch (fallbackError) {
        logger.error(`Reverse geocode failed: ${fallbackError.message}`);
        return res.json(buildMinimalPayload(lat, lng));
      }
    }
  } catch (error) {
    logger.error(`Reverse geocode controller error: ${error.message}`);
    return json(res, 500, {
      success: false,
      message: "Failed to reverse geocode location",
    });
  }
};
