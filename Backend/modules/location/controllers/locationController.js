import axios from "axios";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// In-memory cache + throttle to avoid Nominatim 429s (prod safe)
// Keyed by rounded lat/lng so small GPS jitter doesn't spam the provider.
const reverseGeocodeCache = new Map(); // key -> { expiresAt, payload }
const REVERSE_GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const reverseGeocodeLastCallByIp = new Map(); // ip -> ts
const REVERSE_GEOCODE_MIN_INTERVAL_MS = 1200; // ~1 req/sec per IP
const reverseGeocodeLastGoodByIp = new Map(); // ip -> { ts, payload, lat, lng }

// Keep cache keys accurate (~11m); stability is handled by a movement threshold (200m).
const roundCoord = (n) => Math.round(n * 10000) / 10000;
const cacheKeyFor = (latNum, lngNum) => `${roundCoord(latNum)},${roundCoord(lngNum)}`;

const AREA_STABILITY_DISTANCE_M = 100;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const buildMinimalGeocodeData = (latNum, lngNum) => {
  return {
    results: [
      {
        formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
        address_components: {
          city: "",
          state: "",
          country: "",
          area: "",
        },
        geometry: {
          location: {
            lat: latNum,
            lng: lngNum,
          },
        },
      },
    ],
  };
};

const buildProcessedPayload = ({ latNum, lngNum, formattedAddress, address_components, source }) => {
  return {
    success: true,
    data: {
      results: [
        {
          formatted_address: formattedAddress || `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
          address_components: address_components || {},
          geometry: { location: { lat: latNum, lng: lngNum } },
        },
      ],
    },
    source,
  };
};

async function reverseGeocodeWithBigDataCloud(latNum, lngNum) {
  const response = await axios.get("https://api.bigdatacloud.net/data/reverse-geocode-client", {
    params: {
      latitude: latNum,
      longitude: lngNum,
      localityLanguage: "en",
    },
    timeout: 8000,
  });

  const d = response.data || {};
  const city = d.city || d.locality || d.principalSubdivision || "";
  const state = d.principalSubdivision || "";
  const country = d.countryName || "";
  // BigDataCloud tends to be less precise than Nominatim; prefer locality/subLocality-like fields when available
  const area =
    d.localityInfo?.administrative?.find((x) => (x?.adminLevel ?? 999) >= 7)?.name ||
    d.locality ||
    d.city ||
    "";
  const road = d.localityInfo?.informative?.find((x) => x?.description?.toLowerCase?.().includes("road"))?.name || "";

  const formattedAddress =
    d.localityInfo?.administrative?.map((x) => x?.name).filter(Boolean).slice(0, 4).join(", ") ||
    [d.locality, d.city, d.principalSubdivision, d.countryName].filter(Boolean).join(", ") ||
    `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`;

  return buildProcessedPayload({
    latNum,
    lngNum,
    formattedAddress,
    address_components: { city, state, country, area, road, building: "", postcode: d.postcode || "" },
    source: "bigdatacloud",
  });
}

/**
 * Reverse geocode coordinates to address using free Nominatim (OpenStreetMap) API.
 * Zero Google Maps API cost.
 */
export const reverseGeocode = async (req, res) => {
  try {
    const { lat, lng, force } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    const forceFresh = String(force).toLowerCase() === "true" || String(force) === "1";

    //  IP to prevent provider rate limits (skip when user explicitly forces refresh)
    const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
    const now = Date.now();
    const lastCall = reverseGeocodeLastCallByIp.get(ip) || 0;
    const lastGood = ip ? reverseGeocodeLastGoodByIp.get(ip) : null;

    // If user didn't move much, keep last exact location (stable within ~200m)
    if (!forceFresh && lastGood?.payload && typeof lastGood.lat === "number" && typeof lastGood.lng === "number") {
      const dist = haversineMeters(latNum, lngNum, lastGood.lat, lastGood.lng);
      if (dist < AREA_STABILITY_DISTANCE_M) {
        return res.json({ ...lastGood.payload, source: "stable_last_good" });
      }
    }

    const key = cacheKeyFor(latNum, lngNum);
    const cached = reverseGeocodeCache.get(key);
    // If user explicitly forces refresh, bypass cache so we can return
    // the most recent precise locality (important for "exact location" UX).
    if (!forceFresh && cached && cached.expiresAt > now) {
      return res.json(cached.payload);
    }

    if (!forceFresh && ip && now - lastCall < REVERSE_GEOCODE_MIN_INTERVAL_MS) {
      // Too frequent: return last good result for this IP (stable UI), otherwise minimal.
      const lastGoodThrottled = reverseGeocodeLastGoodByIp.get(ip);
      if (lastGoodThrottled?.payload) {
        return res.json({ ...lastGoodThrottled.payload, source: "throttled_last_good" });
      }
      const minimalData = buildMinimalGeocodeData(latNum, lngNum);
      return res.json({
        success: true,
        data: minimalData,
        source: "throttled_coordinates_only",
      });
    }
    if (ip) reverseGeocodeLastCallByIp.set(ip, now);

    let data;
    try {
      const response = await axios.get(
        "https://nominatim.openstreetmap.org/reverse",
        {
          params: {
            format: "json",
            lat: latNum,
            lon: lngNum,
            addressdetails: 1,
            "accept-language": "en",
            zoom: 18,
          },
          headers: {
            "User-Agent": "Tastizo-App/1.0",
          },
          timeout: 10000,
        },
      );

      data = response.data;
    } catch (apiError) {
      logger.error("Nominatim reverse geocode request failed", {
        error: apiError.message,
        status: apiError.response?.status,
      });

      // Fallback to BigDataCloud when Nominatim rate-limits or fails
      try {
        const fallbackPayload = await reverseGeocodeWithBigDataCloud(latNum, lngNum);
        reverseGeocodeCache.set(key, { expiresAt: now + REVERSE_GEOCODE_CACHE_TTL_MS, payload: fallbackPayload });
        return res.json(fallbackPayload);
      } catch (fallbackErr) {
        logger.warn("BigDataCloud reverse geocode fallback failed", {
          error: fallbackErr.message,
        });
        const minimalData = buildMinimalGeocodeData(latNum, lngNum);
        return res.json({
          success: true,
          data: minimalData,
          source: "coordinates_only",
        });
      }
    }

    if (!data || data.error) {
      logger.warn("Nominatim reverse geocode returned no usable results", {
        error: data?.error,
      });
      const minimalData = buildMinimalGeocodeData(latNum, lngNum);
      return res.json({
        success: true,
        data: minimalData,
        source: "coordinates_only",
      });
    }

    const addr = data.address || {};

    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      "";
    const state = addr.state || "";
    const country = addr.country || "";
    // Prefer the smallest available locality label.
    // Nominatim may return these depending on the region:
    // neighbourhood/surburb/residential/city_district, etc.
    const neighbourhood = addr.neighbourhood || "";
    const suburb = addr.suburb || "";
    const residential = addr.residential || "";
    const quarter = addr.quarter || "";
    const city_district = addr.city_district || "";
    const borough = addr.borough || "";
    const hamlet = addr.hamlet || "";
    const municipality = addr.municipality || "";

    const area =
      neighbourhood ||
      suburb ||
      residential ||
      quarter ||
      city_district ||
      borough ||
      hamlet ||
      municipality ||
      "";
    const road = addr.road || "";
    const houseNumber = addr.house_number || "";
    const building = addr.building || addr.amenity || addr.shop || "";
    const postcode = addr.postcode || "";

    let formattedAddress = data.display_name || "";

    // Try to extract a more exact area from display_name when needed.
    // This helps when Nominatim returns generic area like "Indore City".
    let derivedArea = area;
    if (formattedAddress) {
      const parts = formattedAddress
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const lcCity = (city || "").toLowerCase();
      const lcState = (state || "").toLowerCase();
      const lcCountry = (country || "").toLowerCase();

      const isSkippable = (p) => {
        const v = (p || "").toLowerCase();
        if (!v) return true;
        if (lcCity && (v === lcCity || v.includes(lcCity))) return true;
        if (lcState && (v === lcState || v.includes(lcState))) return true;
        if (lcCountry && (v === lcCountry || v.includes(lcCountry))) return true;
        if (v.includes("district") || v.includes("division") || v.includes("tehsil") || v.includes("taluk")) return true;
        if (/^\d{5,6}$/.test(v.replace(/\s/g, ""))) return true; // postcode-ish
        return false;
      };

      const isGeneric = (s) => {
        const v = (s || "").trim().toLowerCase();
        if (!v) return true;
        if (lcCity && (v === lcCity || v === `${lcCity} city` || v === `${lcCity} district`)) return true;
        return false;
      };

      // If we have no area OR area looks generic, try to pick a better one from the first few parts.
      if ((!derivedArea || isGeneric(derivedArea)) && parts.length >= 2) {
        const candidate = parts.find((p) => !isSkippable(p));
        if (candidate && candidate.length > 2 && candidate.length < 80) {
          derivedArea = candidate;
        }
      }
    }

    // Prefer the most "exact" local label for UI:
    // building/POI > house+road > road > neighbourhood/suburb/city_district > city
    // Also avoid returning overly-generic "Indore City" style labels when we have something better.
    const isGenericCityLabel = (s) => {
      const v = (s || "").trim().toLowerCase();
      if (!v) return true;
      const c = (city || "").trim().toLowerCase();
      if (!c) return false;
      return v === c || v === `${c} city` || v === `${c} district`;
    };

    const houseRoad = [houseNumber, road].filter(Boolean).join(" ").trim()
    const exactAreaCandidate = derivedArea && !isGenericCityLabel(derivedArea) ? derivedArea : "";
    const exactArea = building || houseRoad || road || exactAreaCandidate || derivedArea || city || "";

    const processedData = {
      results: [
        {
          formatted_address:
            formattedAddress || `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
          address_components: {
            city: city,
            state: state,
            country: country,
            area: exactArea,
            neighbourhood: neighbourhood,
            suburb: suburb,
            residential: residential,
            quarter: quarter,
            city_district: city_district,
            borough: borough,
            hamlet: hamlet,
            road: road,
            house_number: houseNumber,
            building: building,
            postcode: postcode,
          },
          geometry: {
            location: {
              lat: latNum,
              lng: lngNum,
            },
          },
        },
      ],
    };

    const payload = { success: true, data: processedData, source: "nominatim" };
    reverseGeocodeCache.set(key, { expiresAt: now + REVERSE_GEOCODE_CACHE_TTL_MS, payload });
    if (ip) reverseGeocodeLastGoodByIp.set(ip, { ts: now, payload, lat: latNum, lng: lngNum });
    return res.json(payload);
  } catch (error) {
    logger.error("Reverse geocode error", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get nearby locations/places using free Nominatim search API.
 * Zero Google Maps API cost.
 * GET /location/nearby?lat=...&lng=...&radius=...
 */
export const getNearbyLocations = async (req, res) => {
  try {
    const { lat, lng, radius = 500, query = "" } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    // Use Nominatim search with viewbox for nearby results
    const radiusNum = parseFloat(radius) || 500;
    const degreeOffset = radiusNum / 111000; // rough meter-to-degree
    const viewbox = [
      lngNum - degreeOffset,
      latNum - degreeOffset,
      lngNum + degreeOffset,
      latNum + degreeOffset,
    ].join(",");

    let results = [];
    try {
      const response = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            format: "json",
            q: query || "*",
            viewbox: viewbox,
            bounded: 1,
            addressdetails: 1,
            limit: 10,
            "accept-language": "en",
          },
          headers: {
            "User-Agent": "Tastizo-App/1.0",
          },
          timeout: 8000,
        },
      );
      results = response.data || [];
    } catch (apiError) {
      logger.error("Nominatim nearby search failed", {
        error: apiError.message,
      });
      return res.json({
        success: true,
        data: { locations: [], source: "none" },
      });
    }

    if (!Array.isArray(results) || results.length === 0) {
      return res.json({
        success: true,
        data: { locations: [], source: "nominatim" },
      });
    }

    const nearbyPlaces = results.map((place, index) => {
      const placeLat = parseFloat(place.lat);
      const placeLng = parseFloat(place.lon);
      const distance = calculateDistance(latNum, lngNum, placeLat, placeLng);

      return {
        id: place.place_id ? String(place.place_id) : `place_${index}`,
        name: place.display_name ? place.display_name.split(",")[0] : "",
        address: place.display_name || "",
        distance:
          distance < 1000
            ? `${Math.round(distance)} m`
            : `${(distance / 1000).toFixed(2)} km`,
        distanceMeters: Math.round(distance),
        latitude: placeLat,
        longitude: placeLng,
      };
    });

    nearbyPlaces.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return res.json({
      success: true,
      data: {
        locations: nearbyPlaces,
        source: "nominatim",
      },
    });
  } catch (error) {
    logger.error("Get nearby locations error", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
