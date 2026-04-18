import mongoose from "mongoose";
import { DELIVERY_NOTIFICATION_EVENTS } from "../constants/deliveryNotificationEvents.js";

const deliveryNotificationSchema = new mongoose.Schema(
  {
    deliveryBoyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(DELIVERY_NOTIFICATION_EVENTS),
      required: true,
      index: true,
    },
    eventKey: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    redirectUrl: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sentVia: {
      type: [String],
      enum: ["db", "socket", "push"],
      default: ["db"],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

deliveryNotificationSchema.index(
  { deliveryBoyId: 1, eventKey: 1 },
  { unique: true },
);
deliveryNotificationSchema.index({ deliveryBoyId: 1, createdAt: -1 });
deliveryNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });

const DeliveryNotification = mongoose.model(
  "DeliveryNotification",
  deliveryNotificationSchema,
);

export default DeliveryNotification;
