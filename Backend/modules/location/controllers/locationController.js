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

const buildMinimalGeocodeData = (latNum, lngNum) => {
  return {
    results: [
      {
        formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
        address_components: {
          city: "Current Location",
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

/**
 * Reverse geocode coordinates to address using Google Maps Geocoding API
 * (OLA Maps and BigDataCloud have been completely removed)
 */
export const reverseGeocode = async (req, res) => {
  try {
    const { lat, lng } = req.query;

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

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    // If Google key is not configured, return minimal coordinates-only data
    if (!googleApiKey) {
      logger.warn(
        "GOOGLE_MAPS_API_KEY not configured. Returning coordinates-only reverse geocode response.",
      );
      const minimalData = buildMinimalGeocodeData(latNum, lngNum);
      return res.json({
        success: true,
        data: minimalData,
        source: "coordinates_only",
      });
    }

    let data;
    try {
      const response = await axios.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        {
          params: {
            latlng: `${latNum},${lngNum}`,
            key: googleApiKey,
            language: "en",
            region: "in",
            // Prioritise exact locations (building, street address, POI etc.)
            result_type:
              "premise|street_address|establishment|point_of_interest|route|sublocality",
          },
          timeout: 10000,
        },
      );

      data = response.data;
    } catch (apiError) {
      logger.error("Google Maps reverse geocode request failed", {
        error: apiError.message,
        status: apiError.response?.status,
        data: apiError.response?.data,
      });

      // Network / HTTP level error – fall back to minimal data
      const minimalData = buildMinimalGeocodeData(latNum, lngNum);
      return res.json({
        success: true,
        data: minimalData,
        source: "coordinates_only",
      });
    }

    if (
      !data ||
      data.status !== "OK" ||
      !Array.isArray(data.results) ||
      data.results.length === 0
    ) {
      logger.warn("Google Maps reverse geocode returned no usable results", {
        status: data?.status,
        error_message: data?.error_message,
      });
      const minimalData = buildMinimalGeocodeData(latNum, lngNum);
      return res.json({
        success: true,
        data: minimalData,
        source: "coordinates_only",
      });
    }

    const firstResult = data.results[0];
    const components = firstResult.address_components || [];

    let city = "";
    let state = "";
    let country = "";
    let area = "";

    components.forEach((comp) => {
      const types = comp.types || [];
      if (types.includes("locality")) {
        city = comp.long_name || comp.short_name || city;
      } else if (types.includes("administrative_area_level_2") && !city) {
        city = comp.long_name || comp.short_name || city;
      } else if (types.includes("administrative_area_level_1")) {
        state = comp.long_name || comp.short_name || state;
      } else if (types.includes("country")) {
        country = comp.long_name || comp.short_name || country;
      } else if (
        types.includes("sublocality") ||
        types.includes("sublocality_level_1") ||
        types.includes("neighborhood")
      ) {
        if (!area) {
          area = comp.long_name || comp.short_name || area;
        }
      }
    });

    let formattedAddress = firstResult.formatted_address || "";

    // If area is still empty, try to extract it from formatted_address
    if (!area && formattedAddress) {
      const parts = formattedAddress
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (parts.length >= 3) {
        const potentialArea = parts[0];
        const cityPart = parts[1] || city;
        const statePart = parts[2] || state;

        if (
          potentialArea &&
          potentialArea.toLowerCase() !== (cityPart || "").toLowerCase() &&
          potentialArea.toLowerCase() !== (statePart || "").toLowerCase() &&
          !potentialArea.toLowerCase().includes("district") &&
          !potentialArea.toLowerCase().includes("city") &&
          potentialArea.length > 2 &&
          potentialArea.length < 80
        ) {
          area = potentialArea;
        }
      }
    }

    const processedData = {
      results: [
        {
          formatted_address:
            formattedAddress || `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
          address_components: {
            city: city || "Current Location",
            state: state || "",
            country: country || "",
            area: area || "",
          },
          geometry: firstResult.geometry || {
            location: {
              lat: latNum,
              lng: lngNum,
            },
          },
        },
      ],
    };

    return res.json({
      success: true,
      data: processedData,
      source: "google",
    });
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
 * Get nearby locations/places using Google Places Nearby Search API
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
    const radiusNum = parseFloat(radius);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!googleApiKey) {
      logger.warn(
        "GOOGLE_MAPS_API_KEY not configured. Returning empty nearby locations.",
      );
      return res.json({
        success: true,
        data: {
          locations: [],
          source: "none",
        },
      });
    }

    let response;
    try {
      response = await axios.get(
        "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
        {
          params: {
            location: `${latNum},${lngNum}`,
            radius: radiusNum,
            key: googleApiKey,
            language: "en",
            // Optional free-text filter
            keyword: query || undefined,
          },
          timeout: 8000,
        },
      );
    } catch (apiError) {
      logger.error("Google Places nearby search failed", {
        error: apiError.message,
        status: apiError.response?.status,
        data: apiError.response?.data,
      });

      return res.json({
        success: true,
        data: {
          locations: [],
          source: "none",
        },
      });
    }

    const payload = response.data;

    if (
      !payload ||
      payload.status !== "OK" ||
      !Array.isArray(payload.results)
    ) {
      logger.warn("Google Places nearby search returned no usable results", {
        status: payload?.status,
        error_message: payload?.error_message,
      });

      return res.json({
        success: true,
        data: {
          locations: [],
          source: "none",
        },
      });
    }

    const nearbyPlaces = payload.results.slice(0, 10).map((place, index) => {
      const placeLat = place.geometry?.location?.lat;
      const placeLng = place.geometry?.location?.lng;
      const distance = placeLat
        ? calculateDistance(latNum, lngNum, placeLat, placeLng)
        : 0;

      return {
        id: place.place_id || place.id || `place_${index}`,
        name: place.name || "",
        address:
          place.vicinity ||
          place.formatted_address ||
          place.plus_code?.compound_code ||
          "",
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
        source: "google",
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
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}
