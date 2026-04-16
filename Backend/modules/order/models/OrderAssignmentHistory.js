import mongoose from "mongoose";

/**
 * OrderAssignmentHistory Model
 * Tracks all assignment attempts for orders to delivery boys
 * Prevents showing expired/rejected requests to same delivery boy again
 */
const orderAssignmentHistorySchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      index: true,
    },
    assignmentStatus: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired", "reassigned"],
      required: true,
      default: "pending",
    },
    assignedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    respondedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
      // Default: 1 minute from assignment
      default: () => new Date(Date.now() + 60 * 1000),
    },
    reassignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    reason: {
      type: String,
      enum: ["timeout", "rejected_by_delivery", "manual_reassign", "order_cancelled"],
    },
    metadata: {
      distance: Number, // Distance in km from restaurant to delivery boy
      assignmentMethod: {
        type: String,
        enum: ["nearest_available", "zone_match", "manual", "priority_based"],
        default: "nearest_available",
      },
      previousAttempts: {
        type: Number,
        default: 0,
      },
      totalAttempts: {
        type: Number,
        default: 1,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
orderAssignmentHistorySchema.index({ orderId: 1, deliveryPartnerId: 1 });
orderAssignmentHistorySchema.index({ deliveryPartnerId: 1, assignmentStatus: 1 });
orderAssignmentHistorySchema.index({ orderId: 1, assignmentStatus: 1 });
orderAssignmentHistorySchema.index({ expiresAt: 1, assignmentStatus: 1 });

// Static method to check if delivery boy was already assigned this order
orderAssignmentHistorySchema.statics.hasPreviousAssignment = async function(orderId, deliveryPartnerId) {
  const existingAssignment = await this.findOne({
    orderId,
    deliveryPartnerId,
    assignmentStatus: { $in: ["rejected", "expired"] }
  });
  
  return !!existingAssignment;
};

// Static method to get active assignment for order
orderAssignmentHistorySchema.statics.getActiveAssignment = async function(orderId) {
  return await this.findOne({
    orderId,
    assignmentStatus: "pending",
    expiresAt: { $gt: new Date() }
  }).populate('deliveryPartnerId', 'name phone');
};

// Static method to get assignment history for order
orderAssignmentHistorySchema.statics.getOrderAssignmentHistory = async function(orderId) {
  return await this.find({ orderId })
    .populate('deliveryPartnerId', 'name phone')
    .populate('reassignedTo', 'name phone')
    .sort({ assignedAt: -1 });
};

// Static method to mark expired assignments
orderAssignmentHistorySchema.statics.markExpiredAssignments = async function() {
  const now = new Date();
  const result = await this.updateMany(
    {
      assignmentStatus: "pending",
      expiresAt: { $lte: now }
    },
    {
      $set: {
        assignmentStatus: "expired",
        respondedAt: now,
        reason: "timeout"
      }
    }
  );
  
  return result.modifiedCount;
};

// Static method to get delivery boys who rejected/expired an order
orderAssignmentHistorySchema.statics.getExcludedDeliveryPartners = async function(orderId) {
  const assignments = await this.find({
    orderId,
    assignmentStatus: { $in: ["rejected", "expired"] }
  }).select('deliveryPartnerId');
  
  return assignments.map(a => a.deliveryPartnerId);
};

// Instance method to accept assignment
orderAssignmentHistorySchema.methods.acceptAssignment = function() {
  this.assignmentStatus = "accepted";
  this.respondedAt = new Date();
  return this.save();
};

// Instance method to reject assignment
orderAssignmentHistorySchema.methods.rejectAssignment = function(reason = "rejected_by_delivery") {
  this.assignmentStatus = "rejected";
  this.respondedAt = new Date();
  this.reason = reason;
  return this.save();
};

// Instance method to expire assignment
orderAssignmentHistorySchema.methods.expireAssignment = function(reason = "timeout") {
  this.assignmentStatus = "expired";
  this.respondedAt = new Date();
  this.reason = reason;
  return this.save();
};

// Instance method to reassign to another delivery boy
orderAssignmentHistorySchema.methods.reassignTo = function(newDeliveryPartnerId) {
  this.assignmentStatus = "reassigned";
  this.reassignedTo = newDeliveryPartnerId;
  this.respondedAt = new Date();
  this.reason = "manual_reassign";
  return this.save();
};

// Pre-save middleware to ensure expiresAt is in the future
orderAssignmentHistorySchema.pre('save', function(next) {
  if (this.isNew && this.expiresAt <= new Date()) {
    this.expiresAt = new Date(Date.now() + 60 * 1000); // Default 1 minute
  }
  next();
});

export default mongoose.model("OrderAssignmentHistory", orderAssignmentHistorySchema);
