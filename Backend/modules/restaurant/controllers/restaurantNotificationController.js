import RestaurantNotification from "../models/RestaurantNotification.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";

function serialize(notification) {
  return {
    id: notification._id?.toString(),
    restaurantId: notification.restaurantId?.toString(),
    orderId: notification.orderId?.toString() || null,
    bookingId: notification.bookingId?.toString() || null,
    reviewId: notification.reviewId?.toString() || null,
    payoutId: notification.payoutId?.toString() || null,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    eventKey: notification.eventKey,
    isRead: notification.isRead,
    redirectUrl: notification.redirectUrl,
    metadata: notification.metadata || {},
    sentVia: notification.sentVia || ["db"],
    createdAt: notification.createdAt,
  };
}

export async function getRestaurantNotifications(req, res) {
  try {
    const restaurantId = req.restaurant._id;
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      RestaurantNotification.find({ restaurantId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RestaurantNotification.countDocuments({ restaurantId }),
      RestaurantNotification.countDocuments({ restaurantId, isRead: false }),
    ]);

    return successResponse(res, 200, "Notifications fetched successfully", {
      notifications: notifications.map(serialize),
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || "Failed to fetch notifications");
  }
}

export async function getRestaurantUnreadNotificationCount(req, res) {
  try {
    const unreadCount = await RestaurantNotification.countDocuments({
      restaurantId: req.restaurant._id,
      isRead: false,
    });

    return successResponse(res, 200, "Unread count fetched successfully", {
      unreadCount,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || "Failed to fetch unread count");
  }
}

export async function markRestaurantNotificationRead(req, res) {
  try {
    const notification = await RestaurantNotification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        restaurantId: req.restaurant._id,
      },
      { $set: { isRead: true } },
      { new: true },
    ).lean();

    if (!notification) {
      return errorResponse(res, 404, "Notification not found");
    }

    return successResponse(res, 200, "Notification marked as read", {
      notification: serialize(notification),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || "Failed to mark notification as read");
  }
}

export async function markAllRestaurantNotificationsRead(req, res) {
  try {
    const result = await RestaurantNotification.updateMany(
      {
        restaurantId: req.restaurant._id,
        isRead: false,
      },
      { $set: { isRead: true } },
    );

    return successResponse(res, 200, "All notifications marked as read", {
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || "Failed to mark all notifications as read");
  }
}
