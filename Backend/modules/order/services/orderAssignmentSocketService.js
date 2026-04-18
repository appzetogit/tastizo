import OrderAssignmentHistory from '../models/OrderAssignmentHistory.js';
import Order from '../models/Order.js';
import {
  DELIVERY_NOTIFICATION_EVENTS,
  notifyDeliveryOrderEvent,
} from '../../delivery/services/deliveryNotificationService.js';

/**
 * Order Assignment Socket Service
 * Handles real-time order assignment notifications via Socket.IO
 */
class OrderAssignmentSocketService {
  /**
   * Get Socket.IO instance
   */
  async getIOInstance() {
    let getIO;
    try {
      const serverModule = await import('../../../server.js');
      getIO = serverModule.getIO;
    } catch (error) {
      console.error('Error getting IO instance:', error);
    }
    return getIO ? getIO() : null;
  }

  /**
   * Emit new order assignment to specific delivery boy
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   * @param {Object} assignmentData - Assignment details
   */
  async emitOrderAssignment(orderId, deliveryPartnerId, assignmentData = {}) {
    try {
      const io = await this.getIOInstance();
      if (!io) {
        console.warn('Socket.IO not initialized, skipping order assignment');
        return;
      }

      const order = await Order.findById(orderId)
        .populate('restaurantId', 'name address location phone')
        .populate('userId', 'name phone')
        .lean();

      if (!order) {
        console.error('Order not found for assignment:', orderId);
        return;
      }

      // Prepare assignment payload
      const assignmentPayload = {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        deliveryPartnerId: deliveryPartnerId.toString(),
        restaurant: {
          id: order.restaurantId._id,
          name: order.restaurantId.name,
          address: order.restaurantId.address,
          phone: order.restaurantId.phone,
          location: order.restaurantId.location
        },
        customer: {
          name: order.userId.name,
          phone: order.userId.phone
        },
        deliveryAddress: order.address,
        items: order.items,
        pricing: order.pricing,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        assignedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 1000), // 1 minute from now
        totalAmount: order.pricing.total,
        distance: assignmentData.distance || 0,
        assignmentMethod: assignmentData.assignmentMethod || 'nearest_available',
        attemptNumber: assignmentData.attemptNumber || 1,
        totalAttempts: assignmentData.totalAttempts || 1,
        // Countdown timer info
        countdownSeconds: 60,
        message: `New order assigned! Accept within 60 seconds.`
      };

      // Emit to specific delivery partner room
      io.of('/delivery')
        .to(`delivery:${deliveryPartnerId}`)
        .emit('NEW_ORDER_ASSIGNMENT', assignmentPayload);

      notifyDeliveryOrderEvent({
        order,
        deliveryBoyId: deliveryPartnerId,
        type: DELIVERY_NOTIFICATION_EVENTS.NEW_DELIVERY_REQUEST,
        metadata: {
          distance: assignmentData.distance || 0,
          attemptNumber: assignmentData.attemptNumber || 1,
          expiresInSeconds: 60,
        },
        source: "orderAssignmentSocketService.emitOrderAssignment",
      }).catch((notifyError) => {
        console.warn("Delivery assignment notification failed:", notifyError.message);
      });

      console.log(`Order assignment sent to delivery partner ${deliveryPartnerId} for order ${order.orderId}`);

      return assignmentPayload;
    } catch (error) {
      console.error('Error emitting order assignment:', error);
      throw error;
    }
  }

  /**
   * Emit order assignment cancellation/expiration to delivery boy
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   * @param {String} reason - Reason for cancellation (expired, rejected, reassigned)
   */
  async emitOrderAssignmentCancelled(orderId, deliveryPartnerId, reason = 'expired') {
    try {
      const io = await this.getIOInstance();
      if (!io) return;

      const order = await Order.findById(orderId).lean();
      if (!order) return;

      const cancellationPayload = {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        deliveryPartnerId: deliveryPartnerId.toString(),
        reason: reason,
        cancelledAt: new Date(),
        message: this.getCancellationMessage(reason)
      };

      // Emit to specific delivery partner room
      io.of('/delivery')
        .to(`delivery:${deliveryPartnerId}`)
        .emit('ORDER_ASSIGNMENT_CANCELLED', cancellationPayload);

      notifyDeliveryOrderEvent({
        order,
        deliveryBoyId,
        type: DELIVERY_NOTIFICATION_EVENTS.DELIVERY_CANCELLED,
        suffix: reason,
        metadata: {
          reason,
        },
        source: "orderAssignmentSocketService.emitOrderAssignmentCancelled",
      }).catch((notifyError) => {
        console.warn("Delivery cancellation notification failed:", notifyError.message);
      });

      console.log(`Order assignment cancelled for delivery partner ${deliveryPartnerId}, order ${order.orderId}, reason: ${reason}`);
    } catch (error) {
      console.error('Error emitting order assignment cancellation:', error);
    }
  }

  /**
   * Emit order accepted event to all delivery boys (so they can remove from their list)
   * @param {String} orderId - Order ID
   * @param {String} acceptedBy - Delivery partner ID who accepted
   */
  async emitOrderAccepted(orderId, acceptedBy) {
    try {
      const io = await this.getIOInstance();
      if (!io) return;

      const order = await Order.findById(orderId).lean();
      if (!order) return;

      const acceptancePayload = {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        acceptedBy: acceptedBy.toString(),
        acceptedAt: new Date(),
        message: 'Order has been accepted by another delivery partner'
      };

      // Emit to all delivery partners
      io.of('/delivery').emit('ORDER_ACCEPTED_BY_OTHER', acceptancePayload);

      console.log(`Order acceptance broadcast for order ${order.orderId}, accepted by ${acceptedBy}`);
    } catch (error) {
      console.error('Error emitting order accepted:', error);
    }
  }

  /**
   * Emit order reassignment notification
   * @param {String} orderId - Order ID
   * @param {String} newDeliveryPartnerId - New delivery partner ID
   * @param {Object} assignmentData - Assignment details
   */
  async emitOrderReassignment(orderId, newDeliveryPartnerId, assignmentData = {}) {
    try {
      const io = await this.getIOInstance();
      if (!io) return;

      // First, notify the previous delivery boy (if any) about reassignment
      const previousAssignment = await OrderAssignmentHistory.getActiveAssignment(orderId);
      if (previousAssignment && previousAssignment.deliveryPartnerId._id.toString() !== newDeliveryPartnerId.toString()) {
        await this.emitOrderAssignmentCancelled(orderId, previousAssignment.deliveryPartnerId._id, 'reassigned');
      }

      // Then, assign to the new delivery boy
      await this.emitOrderAssignment(orderId, newDeliveryPartnerId, assignmentData);
    } catch (error) {
      console.error('Error emitting order reassignment:', error);
    }
  }

  /**
   * Start countdown timer for order assignment
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   * @param {Number} seconds - Countdown seconds (default: 60)
   */
  startAssignmentCountdown(orderId, deliveryPartnerId, seconds = 60) {
    let remainingSeconds = seconds;
    
    const countdownInterval = setInterval(async () => {
      try {
        const io = await this.getIOInstance();
        if (!io) {
          clearInterval(countdownInterval);
          return;
        }

        // Check if assignment is still active
        const activeAssignment = await OrderAssignmentHistory.getActiveAssignment(orderId);
        if (!activeAssignment || activeAssignment.deliveryPartnerId._id.toString() !== deliveryPartnerId.toString()) {
          clearInterval(countdownInterval);
          return;
        }

        // Send countdown update
        const countdownPayload = {
          orderId,
          deliveryPartnerId,
          remainingSeconds,
          isExpiring: remainingSeconds <= 10,
          message: remainingSeconds <= 10 ? `Order expires in ${remainingSeconds} seconds!` : `Time remaining: ${remainingSeconds} seconds`
        };

        io.of('/delivery')
          .to(`delivery:${deliveryPartnerId}`)
          .emit('ASSIGNMENT_COUNTDOWN', countdownPayload);

        if (remainingSeconds === 10) {
          notifyDeliveryOrderEvent({
            orderId,
            deliveryBoyId,
            type: DELIVERY_NOTIFICATION_EVENTS.DELIVERY_REQUEST_EXPIRING_SOON,
            metadata: {
              remainingSeconds,
            },
            source: "orderAssignmentSocketService.startAssignmentCountdown",
          }).catch((notifyError) => {
            console.warn("Delivery expiring notification failed:", notifyError.message);
          });
        }

        remainingSeconds--;

        // If countdown reaches 0, handle expiration
        if (remainingSeconds < 0) {
          clearInterval(countdownInterval);
          await this.handleAssignmentExpiration(orderId, deliveryPartnerId);
        }
      } catch (error) {
        console.error('Error in assignment countdown:', error);
        clearInterval(countdownInterval);
      }
    }, 1000); // Update every second

    // Store interval reference for cleanup
    if (!this.countdownIntervals) {
      this.countdownIntervals = new Map();
    }
    this.countdownIntervals.set(`${orderId}-${deliveryPartnerId}`, countdownInterval);

    return countdownInterval;
  }

  /**
   * Handle assignment expiration
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   */
  async handleAssignmentExpiration(orderId, deliveryPartnerId) {
    try {
      console.log(`Handling assignment expiration for order ${orderId}, delivery partner ${deliveryPartnerId}`);

      // Mark assignment as expired
      const assignment = await OrderAssignmentHistory.findOne({
        orderId,
        deliveryPartnerId,
        assignmentStatus: 'pending'
      });

      if (assignment) {
        await assignment.expireAssignment('timeout');
      }

      // Notify delivery boy about expiration
      await this.emitOrderAssignmentCancelled(orderId, deliveryPartnerId, 'expired');

      // Trigger reassignment logic
      const { default: orderAssignmentController } = await import('./orderAssignmentController.js');
      await orderAssignmentController.reassignOrder(orderId, deliveryPartnerId, 'timeout');
    } catch (error) {
      console.error('Error handling assignment expiration:', error);
    }
  }

  /**
   * Stop countdown timer for assignment
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   */
  stopAssignmentCountdown(orderId, deliveryPartnerId) {
    const key = `${orderId}-${deliveryPartnerId}`;
    if (this.countdownIntervals && this.countdownIntervals.has(key)) {
      clearInterval(this.countdownIntervals.get(key));
      this.countdownIntervals.delete(key);
    }
  }

  /**
   * Get cancellation message based on reason
   * @param {String} reason - Cancellation reason
   */
  getCancellationMessage(reason) {
    const messages = {
      'expired': 'Order assignment expired due to timeout',
      'rejected': 'Order was rejected',
      'reassigned': 'Order has been reassigned to another delivery partner',
      'order_cancelled': 'Order was cancelled by customer or restaurant'
    };
    return messages[reason] || 'Order assignment cancelled';
  }

  /**
   * Clean up expired assignments (run periodically)
   */
  async cleanupExpiredAssignments() {
    try {
      const expiredCount = await OrderAssignmentHistory.markExpiredAssignments();
      if (expiredCount > 0) {
        console.log(`Cleaned up ${expiredCount} expired assignments`);
      }
    } catch (error) {
      console.error('Error cleaning up expired assignments:', error);
    }
  }
}

export default new OrderAssignmentSocketService();
