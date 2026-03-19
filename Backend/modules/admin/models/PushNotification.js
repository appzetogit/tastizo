import mongoose from "mongoose"

const PushNotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    // "Customer" | "Delivery Man" | "Restaurant"
    target: { type: String, required: true, trim: true },
    zone: { type: String, default: "All", trim: true },
    // Optional image URL or DataURL
    image: { type: String, default: "" },
    // Admin can toggle active/inactive (UI uses this)
    status: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export default mongoose.model(
  "PushNotification",
  PushNotificationSchema,
)

