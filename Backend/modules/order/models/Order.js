import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    image: {
      type: String,
    },
    description: {
      type: String,
    },
    isVeg: {
      type: Boolean,
      default: true,
    },
    // Selected variant when item has variations (e.g. size, add-on)
    selectedVariation: {
      variationId: { type: String },
      variationName: { type: String },
      price: { type: Number },
    },
    selectedAddons: [
      {
        addonId: { type: String },
        optionId: { type: String },
        name: { type: String },
        optionName: { type: String },
        price: { type: Number, default: 0 },
        quantity: { type: Number, default: 1 },
      },
    ],
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
    subCategory: {
      type: String,
      default: "",
    },
  },
  { _id: true },
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      // Note: unique: true automatically creates an index, so index: true is redundant
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restaurantId: {
      type: String,
      required: true,
    },
    restaurantName: {
      type: String,
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "Order must have at least one item",
      },
    },
    deliveryInstructions: {
      type: String,
      default: "",
    },
    address: {
      label: {
        type: String,
        enum: ["Home", "Office", "Other"],
      },
      street: String,
      additionalDetails: String,
      city: String,
      state: String,
      zipCode: String,
      formattedAddress: String, // Complete formatted address from live location
      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          default: [0, 0],
        },
      },
    },
    // Snapshot fields for delivery details
    deliveryAddress: {
      type: String,
    },
    phoneNumber: {
      type: String,
    },
    /** Snapshot: delivery contact name (optional) */
    contactName: {
      type: String,
    },
    alternatePhone: {
      type: String,
    },
    deliveryInstructions: {
      type: String,
    },
    pricing: {
      subtotal: {
        type: Number,
        required: true,
        min: 0,
      },
      deliveryFee: {
        type: Number,
        default: 0,
        min: 0,
      },
      platformFee: {
        type: Number,
        default: 0,
        min: 0,
      },
      tax: {
        type: Number,
        default: 0,
        min: 0,
      },
      discount: {
        type: Number,
        default: 0,
        min: 0,
      },
      total: {
        type: Number,
        required: true,
        min: 0,
      },
      couponCode: {
        type: String,
      },
    },
    payment: {
      method: {
        type: String,
        enum: ["razorpay", "cash", "wallet", "upi", "card"],
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "processing", "completed", "failed", "refunded"],
        default: "pending",
      },
      razorpayOrderId: {
        type: String,
      },
      razorpayPaymentId: {
        type: String,
      },
      razorpaySignature: {
        type: String,
      },
      transactionId: {
        type: String,
      },
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    tracking: {
      confirmed: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
      preparing: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
      ready: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
      outForDelivery: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
      delivered: {
        status: { type: Boolean, default: false },
        timestamp: { type: Date },
      },
    },
    deliveryFleet: {
      type: String,
      enum: ["standard", "fast", "pure_veg"],
      default: "standard",
    },
    note: {
      type: String,
    },
    sendCutlery: {
      type: Boolean,
      default: true,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    estimatedDeliveryTime: {
      type: Number, // in minutes
      default: 30,
    },
    // Enhanced ETA tracking
    eta: {
      min: {
        type: Number, // minimum ETA in minutes
        default: 25,
      },
      max: {
        type: Number, // maximum ETA in minutes
        default: 30,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
      additionalTime: {
        type: Number, // Additional time added by restaurant (in minutes)
        default: 0,
      },
    },
    // Preparation time from menu items
    preparationTime: {
      type: Number, // Maximum preparation time from order items (in minutes)
      default: 0,
    },
    deliveredAt: {
      type: Date,
    },
    deliveryVerification: {
      isRequired: {
        type: Boolean,
        default: false,
      },
      otp: {
        type: String,
        trim: true,
      },
      otpHash: {
        type: String,
        trim: true,
      },
      createdAt: Date,
      expiresAt: Date,
      verified: {
        type: Boolean,
        default: false,
      },
      verifiedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Delivery",
      },
      attempts: {
        type: Number,
        default: 0,
      },
      lastSentAt: Date,
      lockedUntil: Date,
    },
    billImageUrl: {
      type: String,
      default: null,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
    cancelledBy: {
      type: String,
      enum: ["user", "restaurant", "admin"],
      default: null,
    },
    // Customer Review and Rating
    review: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
        sparse: true,
      },
      comment: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
      submittedAt: {
        type: Date,
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        sparse: true,
      },
    },
    assignmentInfo: {
      restaurantId: String,
      distance: Number, // Distance in km
      assignedBy: {
        type: String,
        enum: [
          "zone_match",
          "nearest_distance",
          "manual",
          "nearest_available",
          "delivery_accept",
        ],
      },
      zoneId: String,
      zoneName: String,
      deliveryPartnerId: String,
      assignedAt: Date,
    },
    deliveryState: {
      status: {
        type: String,
        enum: [
          "pending",
          "accepted",
          "reached_pickup",
          "order_confirmed",
          "en_route_to_delivery",
          "delivered",
        ],
        default: "pending",
      },
      currentPhase: {
        type: String,
        enum: [
          "assigned",
          "en_route_to_pickup",
          "at_pickup",
          "en_route_to_delivery",
          "at_delivery",
          "completed",
        ],
        default: "assigned",
      },
      acceptedAt: Date,
      reachedPickupAt: Date,
      orderIdConfirmedAt: Date,
      routeToPickup: {
        coordinates: [[Number]], // [[lat, lng], ...]
        distance: Number, // in km
        duration: Number, // in minutes
        calculatedAt: Date,
        method: String, // 'osrm', 'dijkstra', 'haversine_fallback'
      },
      routeToDelivery: {
        coordinates: [[Number]], // [[lat, lng], ...]
        distance: Number, // in km
        duration: Number, // in minutes
        calculatedAt: Date,
        method: String, // 'osrm', 'dijkstra', 'haversine'
      },
    },
    // Delivery assignment tracking
    assignmentStatus: {
      type: String,
      enum: ["pending_assignment", "assigned", "accepted", "rejected", "expired", "reassigned"],
      default: "pending_assignment",
    },
    assignmentTimings: {
      firstAssignedAt: Date,
      lastAssignedAt: Date,
      acceptedAt: Date,
      expiresAt: Date,
      totalAttempts: {
        type: Number,
        default: 0,
      },
      currentAttempt: {
        type: Number,
        default: 0,
      },
    },
    // Lock to prevent multiple delivery boys accepting same order
    assignmentLock: {
      isLocked: {
        type: Boolean,
        default: false,
      },
      lockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Delivery",
      },
      lockedAt: Date,
      lockExpiresAt: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "payment.razorpayOrderId": 1 });

// Generate order ID before saving (fallback if not provided)
orderSchema.pre("save", async function (next) {
  if (!this.orderId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    this.orderId = `ORD-${timestamp}-${random}`;
  }
  next();
});

// Update tracking when status changes
orderSchema.pre("save", async function (next) {
  const now = new Date();
  const previousStatus = this._originalStatus || this.status;

  if (this.isModified("status")) {
    switch (this.status) {
      case "confirmed":
        if (!this.tracking.confirmed.status) {
          this.tracking.confirmed = { status: true, timestamp: now };
        }
        break;
      case "preparing":
        if (!this.tracking.preparing.status) {
          this.tracking.preparing = { status: true, timestamp: now };
        }
        break;
      case "ready":
        if (!this.tracking.ready.status) {
          this.tracking.ready = { status: true, timestamp: now };
        }
        break;
      case "out_for_delivery":
        if (!this.tracking.outForDelivery.status) {
          this.tracking.outForDelivery = { status: true, timestamp: now };
        }
        break;
      case "delivered":
        if (!this.tracking.delivered.status) {
          this.tracking.delivered = { status: true, timestamp: now };
          this.deliveredAt = now;
        }
        break;
      case "cancelled":
        if (!this.cancelledAt) {
          this.cancelledAt = now;
        }
        break;
    }
  }

  // Store original status for next save
  this._originalStatus = this.status;

  next();
});

// Post-save middleware to trigger assignment when status changes to preparing or ready
orderSchema.post("save", async function (doc) {
  try {
    // Trigger assignment if order moved to 'preparing' or 'ready' status
    const assignmentTriggerStatuses = ['preparing', 'ready'];
    
    if (assignmentTriggerStatuses.includes(doc.status)) {
      // Import the trigger service dynamically to avoid circular dependencies
      const { default: orderAssignmentTriggerService } = await import('./services/orderAssignmentTriggerService.js');
      
      // Trigger assignment asynchronously (don't wait for it to complete)
      setImmediate(async () => {
        try {
          await orderAssignmentTriggerService.triggerAssignment(doc._id.toString(), 'status_change');
        } catch (error) {
          console.error(`Error in post-save assignment trigger for order ${doc.orderId}:`, error);
        }
      });
    }
  } catch (error) {
    console.error('Error in order post-save middleware:', error);
  }
});

export default mongoose.model("Order", orderSchema);
