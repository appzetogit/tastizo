import mongoose from "mongoose";
import { RESTAURANT_NOTIFICATION_EVENTS } from "../constants/restaurantNotificationEvents.js";

const restaurantNotificationSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TableBooking",
      default: null,
      index: true,
    },
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderReview",
      default: null,
      index: true,
    },
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
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
      enum: Object.values(RESTAURANT_NOTIFICATION_EVENTS),
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

restaurantNotificationSchema.index(
  { restaurantId: 1, eventKey: 1 },
  { unique: true },
);
restaurantNotificationSchema.index({ restaurantId: 1, createdAt: -1 });

const RestaurantNotification = mongoose.model(
  "RestaurantNotification",
  restaurantNotificationSchema,
);

export default RestaurantNotification;
