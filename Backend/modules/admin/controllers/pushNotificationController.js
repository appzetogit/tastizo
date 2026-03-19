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
import PushNotification from "../models/PushNotification.js";

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

  // Save notification in DB so admin can resend later from list
  let savedNotification = null;
  try {
    savedNotification = await PushNotification.create({
      title,
      description,
      target: sendTo,
      zone: zone || "All",
      image: image || "",
      status: true,
    });
  } catch (dbErr) {
    // Non-fatal: push can still succeed even if DB save fails
    console.warn("Failed to save push notification record:", dbErr.message);
  }

  return successResponse(res, 200, "Push notification sent", {
    sent: result.sent,
    failed: result.failed,
    total: result.total,
    errors: result.errors,
    notification: savedNotification,
  });
});

/**
 * Get all push notifications sent by admin
 * GET /api/admin/push-notifications
 */
export const getPushNotificationsAdmin = asyncHandler(async (req, res) => {
  const notifications = await PushNotification.find({})
    .sort({ createdAt: -1 })
    .lean();

  return successResponse(res, 200, "Push notifications fetched", {
    notifications,
  });
});
