import UserNotification from "../models/UserNotification.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";

function serialize(notification) {
  return {
    id: notification._id?.toString(),
    userId: notification.userId?.toString(),
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

export async function getUserNotifications(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      UserNotification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserNotification.countDocuments({ userId: req.user._id }),
      UserNotification.countDocuments({ userId: req.user._id, isRead: false }),
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

export async function getUserUnreadNotificationCount(req, res) {
  try {
    const unreadCount = await UserNotification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    return successResponse(res, 200, "Unread count fetched successfully", {
      unreadCount,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || "Failed to fetch unread count");
  }
}

export async function markUserNotificationRead(req, res) {
  try {
    const notification = await UserNotification.findOneAndUpdate(
      {
        _id: req.params.notificationId,
        userId: req.user._id,
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

export async function markAllUserNotificationsRead(req, res) {
  try {
    const result = await UserNotification.updateMany(
      {
        userId: req.user._id,
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

export async function deleteAllUserNotifications(req, res) {
  try {
    const result = await UserNotification.deleteMany({
      userId: req.user._id,
    });

    return successResponse(res, 200, "All notifications deleted successfully", {
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || "Failed to delete notifications");
  }
}
