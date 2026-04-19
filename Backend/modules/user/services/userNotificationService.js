import mongoose from "mongoose";
import User from "../../auth/models/User.js";
import Order from "../../order/models/Order.js";
import UserNotification from "../models/UserNotification.js";
import {
  ORDER_STATUS_TO_USER_NOTIFICATION,
  USER_NOTIFICATION_COPY,
  USER_NOTIFICATION_EVENTS,
} from "../constants/userNotificationEvents.js";
import { sendPushToTokens } from "../../../shared/services/fcmPushService.js";

const NEARBY_DISTANCE_METERS = 500;
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

function toClientPayload(notification) {
  return {
    id: notification._id.toString(),
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

function getOrderDisplayId(order) {
  return order?.orderId || order?._id?.toString();
}

function isOrderAwareText(value = "") {
  return /order\s*(id|#)/i.test(String(value));
}

function buildNotificationTitle(baseTitle, orderDisplayId) {
  if (!orderDisplayId || !baseTitle) return baseTitle;
  return isOrderAwareText(baseTitle) ? baseTitle : `${baseTitle} - ${orderDisplayId}`;
}

function buildNotificationMessage(baseMessage, orderDisplayId) {
  if (!orderDisplayId || !baseMessage) return baseMessage;
  return isOrderAwareText(baseMessage)
    ? baseMessage
    : `${baseMessage} Order ID: ${orderDisplayId}`;
}

function buildRedirectUrl(order) {
  const orderDisplayId = getOrderDisplayId(order);
  return orderDisplayId ? `/user/orders/${orderDisplayId}` : "/user/orders";
}

function buildEventKey(type, order) {
  return `${type}:${order._id.toString()}`;
}

function hasValidCoordinate(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadiusMeters = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

async function emitSocketNotification(userId, payload) {
  const io = await getIOInstance();
  if (!io) return false;

  const room = `user:${userId}`;
  io.to(room).emit("user_notification", payload);
  io.to(room).emit("user_notification_count_increment", {
    userId,
    notificationId: payload.id,
    type: payload.type,
  });
  return true;
}

async function sendPushNotification(user, payload) {
  const tokens = [
    user?.fcmTokenWeb,
    user?.fcmTokenAndroid,
    user?.fcmTokenIos,
  ].filter(Boolean);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, total: 0, errors: [] };
  }

  return sendPushToTokens(tokens, {
    title: payload.title,
    body: payload.message,
    link: payload.redirectUrl || "/user/orders",
    data: {
      notificationId: payload.id,
      type: payload.type,
      eventKey: payload.eventKey,
      redirectUrl: payload.redirectUrl,
      userId: payload.userId,
      orderId: payload.orderId,
      orderDisplayId: payload.metadata?.orderDisplayId,
      deliveryOtp: payload.metadata?.deliveryOtp,
    },
  });
}

export async function sendNotificationToUser({
  userId,
  order,
  orderId,
  type,
  title,
  message,
  eventKey,
  redirectUrl,
  metadata = {},
  source = "unknown",
}) {
  if (!type || !Object.values(USER_NOTIFICATION_EVENTS).includes(type)) {
    console.warn("[UserNotification] Unsupported type", { type, source });
    return { success: false, skipped: true, reason: "unsupported_type" };
  }

  const resolvedOrder =
    order ||
    (orderId
      ? await Order.findOne({
          $or: [
            { _id: normalizeObjectId(orderId) },
            { orderId: String(orderId) },
          ].filter((condition) => Object.values(condition)[0]),
        }).lean()
      : null);

  if (!resolvedOrder) {
    console.warn("[UserNotification] Order not found", { orderId, type, source });
    return { success: false, skipped: true, reason: "order_not_found" };
  }

  const normalizedOrderId = normalizeObjectId(resolvedOrder._id);
  const normalizedUserId = normalizeObjectId(userId || resolvedOrder.userId);
  if (!normalizedUserId || !normalizedOrderId) {
    console.warn("[UserNotification] Missing valid user/order id", {
      userId: userId || resolvedOrder.userId,
      orderId: resolvedOrder._id,
      type,
      source,
    });
    return { success: false, skipped: true, reason: "invalid_ids" };
  }

  const copy = USER_NOTIFICATION_COPY[type];
  const orderDisplayId = getOrderDisplayId(resolvedOrder);
  const finalEventKey = eventKey || buildEventKey(type, resolvedOrder);
  const finalRedirectUrl = redirectUrl || buildRedirectUrl(resolvedOrder);
  const debugMetadata = {
    ...metadata,
    orderDisplayId,
    status: resolvedOrder.status,
    triggerSource: source,
  };

  try {
    const notification = await UserNotification.create({
      userId: normalizedUserId,
      orderId: normalizedOrderId,
      title: buildNotificationTitle(title || copy.title, orderDisplayId),
      message: buildNotificationMessage(message || copy.message, orderDisplayId),
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
        normalizedUserId.toString(),
        payload,
      );
      if (socketSent) sentVia.add("socket");
    } catch (socketError) {
      console.warn("[UserNotification] Socket emit failed", {
        eventKey: finalEventKey,
        source,
        error: socketError.message,
      });
    }

    try {
      const user = await User.findById(normalizedUserId)
        .select("fcmTokenWeb fcmTokenAndroid fcmTokenIos")
        .lean();
      const pushResult = await sendPushNotification(user, payload);
      if (pushResult.sent > 0) sentVia.add("push");
    } catch (pushError) {
      console.warn("[UserNotification] Push send failed", {
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

    console.info("[UserNotification] Created", {
      eventKey: finalEventKey,
      type,
      userId: normalizedUserId.toString(),
      orderId: normalizedOrderId.toString(),
      source,
      sentVia: updatedSentVia,
    });

    return { success: true, notification: payload, duplicate: false };
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await UserNotification.findOne({
        userId: normalizedUserId,
        eventKey: finalEventKey,
      }).lean();

      return {
        success: true,
        duplicate: true,
        notification: existing ? toClientPayload(existing) : null,
      };
    }

    console.error("[UserNotification] Create failed", {
      eventKey: finalEventKey,
      type,
      userId: normalizedUserId.toString(),
      orderId: normalizedOrderId.toString(),
      source,
      error: error.message,
    });
    return {
      success: false,
      reason: "create_failed",
      error: error.message,
    };
  }
}

export async function notifyUserOrderEvent(orderOrId, type, metadata = {}, source = "unknown") {
  const order =
    typeof orderOrId === "object" && orderOrId?._id
      ? orderOrId
      : await Order.findOne({
          $or: [
            { _id: normalizeObjectId(orderOrId) },
            { orderId: String(orderOrId) },
          ].filter((condition) => Object.values(condition)[0]),
        }).lean();

  if (!order) {
    console.warn("[UserNotification] notifyUserOrderEvent order not found", {
      orderOrId,
      type,
      source,
    });
    return { success: false, skipped: true, reason: "order_not_found" };
  }

  return sendNotificationToUser({
    userId: order.userId,
    order,
    type,
    eventKey: buildEventKey(type, order),
    metadata,
    source,
  });
}

export async function notifyUserOrderUpdate(orderId, status, metadata = {}) {
  const type = ORDER_STATUS_TO_USER_NOTIFICATION[status];
  if (!type) {
    return { success: false, skipped: true, reason: "unmapped_status" };
  }

  return notifyUserOrderEvent(
    orderId,
    type,
    metadata,
    `notifyUserOrderUpdate:${status}`,
  );
}

export async function maybeNotifyUserDeliveryNearby({
  orderId,
  deliveryLat,
  deliveryLng,
  source = "live-location",
}) {
  if (!hasValidCoordinate(deliveryLat, deliveryLng)) {
    return { success: false, skipped: true, reason: "invalid_delivery_location" };
  }

  const order = await Order.findOne({
    $or: [
      { _id: normalizeObjectId(orderId) },
      { orderId: String(orderId) },
    ].filter((condition) => Object.values(condition)[0]),
  }).lean();

  if (!order) {
    return { success: false, skipped: true, reason: "order_not_found" };
  }

  if (order.status !== "out_for_delivery") {
    return { success: false, skipped: true, reason: "order_not_out_for_delivery" };
  }

  const coords = order.address?.location?.coordinates;
  const customerLng = Array.isArray(coords) ? Number(coords[0]) : null;
  const customerLat = Array.isArray(coords) ? Number(coords[1]) : null;
  if (!hasValidCoordinate(customerLat, customerLng)) {
    return { success: false, skipped: true, reason: "invalid_customer_location" };
  }

  const distanceMeters = haversineDistanceMeters(
    deliveryLat,
    deliveryLng,
    customerLat,
    customerLng,
  );

  if (distanceMeters > NEARBY_DISTANCE_METERS) {
    return {
      success: false,
      skipped: true,
      reason: "outside_nearby_threshold",
      distanceMeters,
    };
  }

  return sendNotificationToUser({
    userId: order.userId,
    order,
    type: USER_NOTIFICATION_EVENTS.DELIVERY_PARTNER_NEARBY,
    eventKey: buildEventKey(USER_NOTIFICATION_EVENTS.DELIVERY_PARTNER_NEARBY, order),
    metadata: {
      distanceMeters: Math.round(distanceMeters),
      thresholdMeters: NEARBY_DISTANCE_METERS,
      deliveryLat,
      deliveryLng,
    },
    source,
  });
}

export { USER_NOTIFICATION_EVENTS };
