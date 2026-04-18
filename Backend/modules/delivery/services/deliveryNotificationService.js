import mongoose from "mongoose";
import Delivery from "../models/Delivery.js";
import DeliveryNotification from "../models/DeliveryNotification.js";
import Order from "../../order/models/Order.js";
import {
  DELIVERY_NOTIFICATION_COPY,
  DELIVERY_NOTIFICATION_EVENTS,
} from "../constants/deliveryNotificationEvents.js";
import { sendPushToTokens } from "../../../shared/services/fcmPushService.js";

const NEAR_CUSTOMER_DISTANCE_METERS = 500;
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

function buildOrderRedirectUrl(order) {
  const displayId = getOrderDisplayId(order);
  return displayId ? `/delivery/orders/${displayId}` : "/delivery";
}

function buildEventKey(type, order, deliveryBoyId, suffix = "") {
  const orderId = order?._id?.toString?.() || String(order?._id || "general");
  return [type, orderId, deliveryBoyId?.toString?.() || deliveryBoyId, suffix]
    .filter(Boolean)
    .join(":");
}

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

async function emitSocketNotification(deliveryBoyId, payload) {
  const io = await getIOInstance();
  if (!io) return false;

  const namespace = io.of("/delivery");
  const room = `delivery:${deliveryBoyId}`;
  namespace.to(room).emit("delivery_notification", payload);
  namespace.to(room).emit("delivery_notification_count_increment", {
    deliveryBoyId,
    notificationId: payload.id,
    type: payload.type,
  });
  return true;
}

async function sendPushNotification(delivery, payload) {
  const tokens = [
    delivery?.fcmTokenWeb,
    delivery?.fcmTokenAndroid,
    delivery?.fcmTokenIos,
  ].filter(Boolean);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, total: 0, errors: [] };
  }

  return sendPushToTokens(tokens, {
    title: payload.title,
    body: payload.message,
    link: payload.redirectUrl || "/delivery/notifications",
    data: {
      notificationId: payload.id,
      type: payload.type,
      eventKey: payload.eventKey,
      redirectUrl: payload.redirectUrl,
      deliveryBoyId: payload.deliveryBoyId,
      orderId: payload.orderId,
      orderDisplayId: payload.metadata?.orderDisplayId,
    },
  });
}

export async function sendNotificationToDeliveryBoy({
  deliveryBoyId,
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
  if (!type || !Object.values(DELIVERY_NOTIFICATION_EVENTS).includes(type)) {
    console.warn("[DeliveryNotification] Unsupported type", { type, source });
    return { success: false, skipped: true, reason: "unsupported_type" };
  }

  const normalizedDeliveryBoyId = normalizeObjectId(deliveryBoyId);
  if (!normalizedDeliveryBoyId) {
    return { success: false, skipped: true, reason: "invalid_delivery_id" };
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

  const normalizedOrderId = normalizeObjectId(resolvedOrder?._id);
  const copy = DELIVERY_NOTIFICATION_COPY[type];
  const orderDisplayId = resolvedOrder ? getOrderDisplayId(resolvedOrder) : null;
  const finalEventKey =
    eventKey ||
    (resolvedOrder
      ? buildEventKey(type, resolvedOrder, normalizedDeliveryBoyId)
      : `${type}:${normalizedDeliveryBoyId.toString()}`);
  const finalRedirectUrl =
    redirectUrl ||
    (resolvedOrder ? buildOrderRedirectUrl(resolvedOrder) : "/delivery/notifications");
  const debugMetadata = {
    ...metadata,
    ...(resolvedOrder
      ? {
          orderDisplayId,
          status: resolvedOrder.status,
        }
      : {}),
    triggerSource: source,
  };

  try {
    const notification = await DeliveryNotification.create({
      deliveryBoyId: normalizedDeliveryBoyId,
      orderId: normalizedOrderId,
      title: buildNotificationTitle(title || copy.title, orderDisplayId),
      message: buildNotificationMessage(message || copy.message, orderDisplayId),
      type,
      eventKey: finalEventKey,
      redirectUrl: finalRedirectUrl,
      metadata: debugMetadata,
      sentVia: ["db"],
    });

    const payload = serialize(notification);
    const sentVia = new Set(notification.sentVia);

    try {
      const socketSent = await emitSocketNotification(
        normalizedDeliveryBoyId.toString(),
        payload,
      );
      if (socketSent) sentVia.add("socket");
    } catch (socketError) {
      console.warn("[DeliveryNotification] Socket emit failed", {
        eventKey: finalEventKey,
        source,
        error: socketError.message,
      });
    }

    try {
      const delivery = await Delivery.findById(normalizedDeliveryBoyId)
        .select("fcmTokenWeb fcmTokenAndroid fcmTokenIos")
        .lean();
      const pushResult = await sendPushNotification(delivery, payload);
      if (pushResult.sent > 0) sentVia.add("push");
    } catch (pushError) {
      console.warn("[DeliveryNotification] Push send failed", {
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

    console.info("[DeliveryNotification] Created", {
      eventKey: finalEventKey,
      type,
      deliveryBoyId: normalizedDeliveryBoyId.toString(),
      orderId: normalizedOrderId?.toString(),
      source,
      sentVia: updatedSentVia,
    });

    return { success: true, duplicate: false, notification: payload };
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await DeliveryNotification.findOne({
        deliveryBoyId: normalizedDeliveryBoyId,
        eventKey: finalEventKey,
      }).lean();

      return {
        success: true,
        duplicate: true,
        notification: existing ? serialize(existing) : null,
      };
    }

    console.error("[DeliveryNotification] Create failed", {
      eventKey: finalEventKey,
      type,
      deliveryBoyId: normalizedDeliveryBoyId.toString(),
      source,
      error: error.message,
    });
    return { success: false, reason: "create_failed", error: error.message };
  }
}

export async function notifyDeliveryOrderEvent({
  order,
  orderId,
  deliveryBoyId,
  type,
  suffix = "",
  metadata = {},
  source = "unknown",
}) {
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
    return { success: false, skipped: true, reason: "order_not_found" };
  }

  const resolvedDeliveryId =
    deliveryBoyId ||
    resolvedOrder.deliveryPartnerId ||
    resolvedOrder.assignmentInfo?.deliveryPartnerId;

  if (!resolvedDeliveryId) {
    return { success: false, skipped: true, reason: "delivery_not_assigned" };
  }

  return sendNotificationToDeliveryBoy({
    deliveryBoyId: resolvedDeliveryId,
    order: resolvedOrder,
    type,
    eventKey: buildEventKey(type, resolvedOrder, resolvedDeliveryId, suffix),
    metadata,
    source,
  });
}

export async function maybeNotifyDeliveryNearCustomer({
  orderId,
  deliveryLat,
  deliveryLng,
  deliveryBoyId,
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

  const resolvedDeliveryId =
    deliveryBoyId || order.deliveryPartnerId || order.assignmentInfo?.deliveryPartnerId;
  if (!resolvedDeliveryId) {
    return { success: false, skipped: true, reason: "delivery_not_assigned" };
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

  if (distanceMeters > NEAR_CUSTOMER_DISTANCE_METERS) {
    return {
      success: false,
      skipped: true,
      reason: "outside_near_customer_threshold",
      distanceMeters,
    };
  }

  return notifyDeliveryOrderEvent({
    order,
    deliveryBoyId: resolvedDeliveryId,
    type: DELIVERY_NOTIFICATION_EVENTS.NEAR_CUSTOMER,
    metadata: {
      distanceMeters: Math.round(distanceMeters),
      thresholdMeters: NEAR_CUSTOMER_DISTANCE_METERS,
      deliveryLat,
      deliveryLng,
    },
    source,
  });
}

export { DELIVERY_NOTIFICATION_EVENTS };
