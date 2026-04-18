import mongoose from "mongoose";
import { USER_NOTIFICATION_EVENTS } from "../constants/userNotificationEvents.js";

const userNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
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
      enum: Object.values(USER_NOTIFICATION_EVENTS),
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

userNotificationSchema.index({ userId: 1, eventKey: 1 }, { unique: true });
userNotificationSchema.index({ userId: 1, createdAt: -1 });

const UserNotification = mongoose.model(
  "UserNotification",
  userNotificationSchema,
);

export default UserNotification;
