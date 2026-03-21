import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import Restaurant from "../models/Restaurant.js";

/**
 * Register or refresh FCM device token for the currently authenticated restaurant
 * POST /api/restaurant/auth/fcm-token
 * Body: { platform: 'web' | 'android' | 'ios', fcmToken }
 */
export const registerRestaurantFcmToken = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id;
  const {
    platform,
    fcmToken,
    token,
    deviceType,
    appType,
    os,
  } = req.body;
  const resolvedToken = fcmToken || token;
  const resolvedDeviceType = (deviceType || appType || os || "android").toLowerCase();

  if (!platform || !resolvedToken) {
    return errorResponse(res, 400, "platform and token are required");
  }

  const validPlatforms = ["web", "app", "android", "ios"];
  if (!validPlatforms.includes(platform)) {
    return errorResponse(
      res,
      400,
      "Invalid platform. Allowed values: web, app, android, ios",
    );
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return errorResponse(res, 404, "Restaurant not found");
  }

  if (platform === "web") {
    restaurant.fcmTokenWeb = resolvedToken;
  } else if (platform === "android") {
    restaurant.fcmTokenAndroid = resolvedToken;
  } else if (platform === "ios") {
    restaurant.fcmTokenIos = resolvedToken;
  } else if (platform === "app") {
    if (resolvedDeviceType === "ios") {
      restaurant.fcmTokenIos = resolvedToken;
    } else {
      restaurant.fcmTokenAndroid = resolvedToken;
    }
  }

  await restaurant.save();
  return successResponse(res, 200, "FCM token registered successfully", {
    fcmTokenWeb: restaurant.fcmTokenWeb,
    fcmTokenAndroid: restaurant.fcmTokenAndroid,
    fcmTokenIos: restaurant.fcmTokenIos,
  });
});

/**
 * Remove FCM token for the current restaurant device on logout
 * DELETE /api/restaurant/auth/fcm-token
 * Body: { platform: 'web' | 'android' | 'ios' }
 */
export const removeRestaurantFcmToken = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id;
  const { platform, deviceType, appType, os } = req.body;
  const resolvedDeviceType = (deviceType || appType || os || "android").toLowerCase();

  if (!platform) {
    return errorResponse(res, 400, "platform is required");
  }

  const validPlatforms = ["web", "app", "android", "ios"];
  if (!validPlatforms.includes(platform)) {
    return errorResponse(
      res,
      400,
      "Invalid platform. Allowed values: web, app, android, ios",
    );
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return errorResponse(res, 404, "Restaurant not found");
  }

  if (platform === "web") {
    restaurant.fcmTokenWeb = null;
  } else if (platform === "android") {
    restaurant.fcmTokenAndroid = null;
  } else if (platform === "ios") {
    restaurant.fcmTokenIos = null;
  } else if (platform === "app") {
    if (resolvedDeviceType === "ios") {
      restaurant.fcmTokenIos = null;
    } else {
      restaurant.fcmTokenAndroid = null;
    }
  }

  await restaurant.save();

  return successResponse(res, 200, "FCM token removed successfully");
});

