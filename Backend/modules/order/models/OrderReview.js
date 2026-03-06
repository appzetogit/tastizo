import mongoose from "mongoose";

const { Schema } = mongoose;

// Canonical order review model.
// Individual review documents are the single source of truth for
// rating and review text submitted by a user for a given order/restaurant.
const orderReviewSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// Ensure one review per order per user.
orderReviewSchema.index({ orderId: 1, userId: 1 }, { unique: true });

const OrderReview = mongoose.model("OrderReview", orderReviewSchema);

export default OrderReview;

