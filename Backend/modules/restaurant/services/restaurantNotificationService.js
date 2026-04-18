import mongoose from "mongoose";
import Restaurant from "../models/Restaurant.js";
import RestaurantNotification from "../models/RestaurantNotification.js";
import {
  RESTAURANT_NOTIFICATION_COPY,
  RESTAURANT_NOTIFICATION_EVENTS,
} from "../constants/restaurantNotificationEvents.js";
import { sendPushToTokens } from "../../../shared/services/fcmPushService.js";

let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import("../../../server.js");
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

function normalizeObjectId(value) {
  if (!value) return null;
  const id = value?._id || value;
  return mongoose.Types.ObjectId.isValid(String(id))
    ? new mongoose.Types.ObjectId(String(id))
    : null;
}

function buildEventKey(type, ids = {}) {
  const resourceId =
    ids.orderId ||
    ids.bookingId ||
    ids.reviewId ||
    ids.payoutId ||
    ids.itemId ||
    ids.resourceId ||
    "global";
  return `${type}:${String(resourceId)}`;
}

function buildRedirectUrl(type, ids = {}) {
  const orderId = ids.orderDisplayId || ids.orderId;

  switch (type) {
    case RESTAURANT_NOTIFICATION_EVENTS.NEW_ORDER_RECEIVED:
    case RESTAURANT_NOTIFICATION_EVENTS.ORDER_CANCELLED_BY_USER:
    case RESTAURANT_NOTIFICATION_EVENTS.DELIVERY_PARTNER_ASSIGNED:
    case RESTAURANT_NOTIFICATION_EVENTS.DELIVERY_PARTNER_REACHED:
    case RESTAURANT_NOTIFICATION_EVENTS.DELIVERY_PARTNER_DELAYED:
    case RESTAURANT_NOTIFICATION_EVENTS.ORDER_PICKED_UP:
      return orderId ? `/restaurant/orders/${orderId}` : "/restaurant/orders";
    case RESTAURANT_NOTIFICATION_EVENTS.NEW_DINING_BOOKING:
    case RESTAURANT_NOTIFICATION_EVENTS.DINING_BOOKING_CANCELLED:
      return "/restaurant/reservations";
    case RESTAURANT_NOTIFICATION_EVENTS.REFUND_INITIATED:
    case RESTAURANT_NOTIFICATION_EVENTS.REFUND_COMPLETED:
      return "/restaurant/hub-finance?tab=refunds";
    case RESTAURANT_NOTIFICATION_EVENTS.MENU_ITEM_APPROVED:
    case RESTAURANT_NOTIFICATION_EVENTS.MENU_ITEM_REJECTED:
      return "/restaurant/hub-menu";
    case RESTAURANT_NOTIFICATION_EVENTS.PAYOUT_UPDATED:
      return "/restaurant/hub-finance";
    case RESTAURANT_NOTIFICATION_EVENTS.NEW_REVIEW_RECEIVED:
      return "/restaurant/reviews";
    default:
      return "/restaurant/notifications";
  }
}

function toClientPayload(notification) {
  return {
    id: notification._id.toString(),
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

async function emitSocketNotification(restaurantId, payload) {
  const io = await getIOInstance();
  if (!io) return false;

  const restaurantNamespace = io.of("/restaurant");
  const room = `restaurant:${restaurantId}`;
  restaurantNamespace.to(room).emit("restaurant_notification", payload);
  restaurantNamespace.to(room).emit("restaurant_notification_count_increment", {
    restaurantId,
    notificationId: payload.id,
    type: payload.type,
  });
  restaurantNamespace.to(room).emit("play_notification_sound", {
    type: payload.type,
    notificationId: payload.id,
    message: payload.message,
  });
  return true;
}

async function sendPushNotification(restaurant, payload) {
  const tokens = [
    restaurant?.fcmTokenWeb,
    restaurant?.fcmTokenAndroid,
    restaurant?.fcmTokenIos,
  ].filter(Boolean);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, total: 0, errors: [] };
  }

  return sendPushToTokens(tokens, {
    title: payload.title,
    body: payload.message,
    link: payload.redirectUrl || "/restaurant/notifications",
    data: {
      notificationId: payload.id,
      type: payload.type,
      eventKey: payload.eventKey,
      redirectUrl: payload.redirectUrl,
      restaurantId: payload.restaurantId,
      orderId: payload.orderId,
      bookingId: payload.bookingId,
      reviewId: payload.reviewId,
      payoutId: payload.payoutId,
    },
  });
}

export async function sendNotificationToRestaurant({
  restaurantId,
  type,
  orderId,
  bookingId,
  reviewId,
  payoutId,
  title,
  message,
  eventKey,
  redirectUrl,
  metadata = {},
  source = "unknown",
}) {
  if (!restaurantId || !type) {
    console.warn("[RestaurantNotification] Missing restaurantId/type", {
      restaurantId,
      type,
      source,
    });
    return { success: false, skipped: true, reason: "missing_required_fields" };
  }

  if (!Object.values(RESTAURANT_NOTIFICATION_EVENTS).includes(type)) {
    console.warn("[RestaurantNotification] Unsupported type", { type, source });
    return { success: false, skipped: true, reason: "unsupported_type" };
  }

  const normalizedRestaurantId = normalizeObjectId(restaurantId);
  if (!normalizedRestaurantId) {
    console.warn("[RestaurantNotification] Invalid restaurantId", {
      restaurantId,
      type,
      source,
    });
    return { success: false, skipped: true, reason: "invalid_restaurant_id" };
  }

  const copy = RESTAURANT_NOTIFICATION_COPY[type];
  const ids = { orderId, bookingId, reviewId, payoutId, ...metadata };
  const finalEventKey = eventKey || buildEventKey(type, ids);
  const finalRedirectUrl = redirectUrl || buildRedirectUrl(type, ids);
  const debugMetadata = {
    ...metadata,
    triggerSource: source,
  };

  try {
    const notification = await RestaurantNotification.create({
      restaurantId: normalizedRestaurantId,
      orderId: normalizeObjectId(orderId),
      bookingId: normalizeObjectId(bookingId),
      reviewId: normalizeObjectId(reviewId),
      payoutId: normalizeObjectId(payoutId),
      title: title || copy.title,
      message: message || copy.message,
      type,
      eventKey: finalEventKey,
      redirectUrl: finalRedirectUrl,
      metadata: debugMetadata,
      sentVia: ["db"],
    });

    const payload = toClientPayload(notification);
    const sentVia = new Set(notification.sentVia);

    try {
      const socketSent = await emitSocketNotification(
        normalizedRestaurantId.toString(),
        payload,
      );
      if (socketSent) sentVia.add("socket");
    } catch (socketError) {
      console.warn("[RestaurantNotification] Socket emit failed", {
        eventKey: finalEventKey,
        source,
        error: socketError.message,
      });
    }

    try {
      const restaurant = await Restaurant.findById(normalizedRestaurantId)
        .select("fcmTokenWeb fcmTokenAndroid fcmTokenIos")
        .lean();
      const pushResult = await sendPushNotification(restaurant, payload);
      if (pushResult.sent > 0) sentVia.add("push");
    } catch (pushError) {
      console.warn("[RestaurantNotification] Push send failed", {
        eventKey: finalEventKey,
        source,
        error: pushError.message,
      });
    }

    const updatedSentVia = [...sentVia];
    if (updatedSentVia.length !== notification.sentVia.length) {
      notification.sentVia = updatedSentVia;
      await notification.save();
      payload.sentVia = updatedSentVia;
    }

    console.info("[RestaurantNotification] Created", {
      eventKey: finalEventKey,
      type,
      restaurantId: normalizedRestaurantId.toString(),
      source,
      sentVia: updatedSentVia,
    });

    return { success: true, notification: payload, duplicate: false };
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await RestaurantNotification.findOne({
        restaurantId: normalizedRestaurantId,
        eventKey: finalEventKey,
      }).lean();

      return {
        success: true,
        duplicate: true,
        notification: existing ? toClientPayload(existing) : null,
      };
    }

    console.error("[RestaurantNotification] Create failed", {
      eventKey: finalEventKey,
      type,
      restaurantId: normalizedRestaurantId.toString(),
      source,
      error: error.message,
    });
    return {
      success: false,
      skipped: false,
      reason: "create_failed",
      error: error.message,
    };
  }
}

export { RESTAURANT_NOTIFICATION_EVENTS };
