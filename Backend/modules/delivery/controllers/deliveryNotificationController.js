import DeliveryNotification from "../models/DeliveryNotification.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";

function serialize(notification) {
  return {
    id: notification._id?.toString(),
    deliveryBoyId: notification.deliveryBoyId?.toString(),
    orderId: notification.orderId?.toString(),
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

export async function getDeliveryNotifications(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
    const skip = (page - 1) * limit;
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const baseQuery = {
      deliveryBoyId: req.delivery._id,
      createdAt: { $gte: cutoffDate },
    };

    const [notifications, total, unreadCount] = await Promise.all([
      DeliveryNotification.find(baseQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DeliveryNotification.countDocuments(baseQuery),
      DeliveryNotification.countDocuments({
        ...baseQuery,
        isRead: false,
      }),
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

export async function getDeliveryUnreadNotificationCount(req, res) {
  try {
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const unreadCount = await DeliveryNotification.countDocuments({
      deliveryBoyId: req.delivery._id,
      createdAt: { $gte: cutoffDate },
      isRead: false,
    });

    return successResponse(res, 200, "Unread count fetched successfully", {
      unreadCount,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || "Failed to fetch unread count");
  }
}

export async function markDeliveryNotificationRead(req, res) {
  try {
    const notification = await DeliveryNotification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        deliveryBoyId: req.delivery._id,
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

export async function markAllDeliveryNotificationsRead(req, res) {
  try {
    const result = await DeliveryNotification.updateMany(
      {
        deliveryBoyId: req.delivery._id,
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
