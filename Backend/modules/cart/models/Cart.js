import mongoose from "mongoose";

const cartAddonSchema = new mongoose.Schema(
  {
    addonId: { type: String },
    optionId: { type: String },
    name: { type: String },
    optionName: { type: String },
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false },
);

const cartItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    image: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    isVeg: {
      type: Boolean,
      default: true,
    },
    subCategory: {
      type: String,
      default: "",
    },
    restaurantId: {
      type: String,
      trim: true,
      default: "",
    },
    restaurantName: {
      type: String,
      trim: true,
      default: "",
    },
    selectedVariation: {
      variationId: { type: String, trim: true, default: "" },
      variationName: { type: String, default: "" },
      price: { type: Number, default: 0, min: 0 },
    },
    selectedAddons: {
      type: [cartAddonSchema],
      default: [],
    },
    customizations: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    specialInstructions: {
      type: String,
      default: "",
    },
    pricingSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lineKey: {
      type: String,
      required: true,
      index: true,
    },
  },
  { _id: true },
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    ownerType: {
      type: String,
      enum: ["authenticated"],
      default: "authenticated",
    },
    ownerPhone: {
      type: String,
      default: null,
    },
    restaurantId: {
      type: String,
      default: null,
    },
    restaurantName: {
      type: String,
      default: null,
    },
    zoneId: {
      type: String,
      default: null,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
    mergedGuestSessions: {
      type: [String],
      default: [],
    },
    lastMergedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

cartSchema.index({ updatedAt: -1 });

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
