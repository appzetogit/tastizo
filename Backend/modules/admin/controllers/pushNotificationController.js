/**
 * Admin Push Notification Controller
 * POST /api/admin/push-notification
 */

import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { sendPushNotification } from "../../../shared/services/fcmPushService.js";

/**
 * Send push notification to Customers, Delivery Man, or Restaurant
 * POST /api/admin/push-notification
 * Body: { title, description, sendTo, zone?, image? }
 */
export const sendPushNotificationAdmin = asyncHandler(async (req, res) => {
  const { title, description, sendTo, zone = "All", image } = req.body;

  if (!title || !description) {
    return errorResponse(res, 400, "title and description are required");
  }

  const validSendTo = ["Customer", "Delivery Man", "Restaurant"];
  if (!sendTo || !validSendTo.includes(sendTo)) {
    return errorResponse(
      res,
      400,
      "sendTo must be one of: Customer, Delivery Man, Restaurant"
    );
  }

  const result = await sendPushNotification({
    title,
    description,
    sendTo,
    zone: zone || "All",
    image,
  });

  return successResponse(res, 200, "Push notification sent", {
    sent: result.sent,
    failed: result.failed,
    total: result.total,
    errors: result.errors,
  });
});
