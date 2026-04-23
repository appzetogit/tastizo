import Order from '../models/Order.js';
import orderAssignmentController from './orderAssignmentController.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import mongoose from 'mongoose';
import {
  DELIVERY_NOTIFICATION_EVENTS,
  notifyDeliveryOrderEvent,
} from '../../delivery/services/deliveryNotificationService.js';

async function resolveRestaurantForAssignment(restaurantId) {
  if (!restaurantId) return null;

  const rawId = restaurantId?._id?.toString?.() || restaurantId?.toString?.() || restaurantId;
  if (!rawId) return null;

  let restaurant = null;
  if (mongoose.Types.ObjectId.isValid(rawId) && rawId.length === 24) {
    restaurant = await Restaurant.findById(rawId).select('name location restaurantId slug').lean();
  }

  if (!restaurant) {
    restaurant = await Restaurant.findOne({
      $or: [{ restaurantId: rawId }, { slug: rawId }],
    }).select('name location restaurantId slug').lean();
  }

  return restaurant;
}

function getRestaurantCoordinates(restaurant) {
  const lat = restaurant?.location?.latitude ?? restaurant?.location?.coordinates?.[1];
  const lng = restaurant?.location?.longitude ?? restaurant?.location?.coordinates?.[0];
  const restaurantLat = Number(lat);
  const restaurantLng = Number(lng);

  if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) {
    return null;
  }

  return { restaurantLat, restaurantLng };
}

/**
 * Order Assignment Trigger Service
 * Triggers the delivery assignment flow when orders reach appropriate status
 */
class OrderAssignmentTriggerService {
  /**
   * Trigger assignment for an order
   * @param {String} orderId - Order ID
   * @param {String} triggerReason - Reason for triggering assignment
   */
  async triggerAssignment(orderId, triggerReason = 'status_change') {
    try {
      console.log(
        `Assignment trigger skipped for order ${orderId}, reason: ${triggerReason}. Broadcast-to-all delivery flow is active.`,
      );
      return {
        success: false,
        skipped: true,
        reason: 'broadcast_delivery_flow_active',
      };
    } catch (error) {
      console.error('Error in triggerAssignment:', error);
      throw error;
    }
  }

  /**
   * Check if order is ready for assignment
   * @param {Object} order - Order document
   */
  isOrderReadyForAssignment(order) {
    void order;
    return false;
  }

  /**
   * Trigger assignment for multiple orders (batch processing)
   * @param {Array} orderIds - Array of order IDs
   */
  async triggerBatchAssignments(orderIds) {
    try {
      console.log(
        `Batch assignment skipped for ${orderIds.length} orders. Broadcast-to-all delivery flow is active.`,
      );
      return orderIds.map((orderId) => ({
        orderId,
        success: false,
        skipped: true,
        reason: 'broadcast_delivery_flow_active',
      }));
    } catch (error) {
      console.error('Error in triggerBatchAssignments:', error);
      throw error;
    }
  }

  /**
   * Find orders ready for assignment and trigger assignment
   * This can be called periodically to assign pending orders
   */
  async assignPendingOrders() {
    try {
      console.log('Pending assignment checker skipped. Broadcast-to-all delivery flow is active.');
      return [];
    } catch (error) {
      console.error('Error in assignPendingOrders:', error);
      throw error;
    }
  }

  /**
   * Handle order status change and trigger assignment if needed
   * This should be called when an order's status changes
   * @param {String} orderId - Order ID
   * @param {String} newStatus - New order status
   * @param {String} previousStatus - Previous order status
   */
  async handleOrderStatusChange(orderId, newStatus, previousStatus = null) {
    try {
      console.log(`Handling order status change for ${orderId}: ${previousStatus} -> ${newStatus}`);

      // Handle order cancellation - stop any active assignments
      if (newStatus === 'cancelled') {
        await this.handleOrderCancellation(orderId);
      }

      return true;
    } catch (error) {
      console.error('Error in handleOrderStatusChange:', error);
      throw error;
    }
  }

  /**
   * Handle order cancellation - clean up active assignments
   * @param {String} orderId - Order ID
   */
  async handleOrderCancellation(orderId) {
    try {
      console.log(`Handling cancellation for order ${orderId}`);

      // Mark any active assignments as cancelled
      const OrderAssignmentHistory = (await import('../models/OrderAssignmentHistory.js')).default;
      
      const result = await OrderAssignmentHistory.updateMany(
        {
          orderId: orderId,
          assignmentStatus: 'pending'
        },
        {
          $set: {
            assignmentStatus: 'reassigned',
            reason: 'order_cancelled',
            respondedAt: new Date()
          }
        }
      );

      const cancelledAssignments = await OrderAssignmentHistory.find({
        orderId,
        reason: 'order_cancelled',
        respondedAt: { $gte: new Date(Date.now() - 60 * 1000) },
      }).select('deliveryPartnerId').lean();

      await Promise.all(
        cancelledAssignments.map((assignment) =>
          notifyDeliveryOrderEvent({
            orderId,
            deliveryBoyId: assignment.deliveryPartnerId,
            type: DELIVERY_NOTIFICATION_EVENTS.DELIVERY_CANCELLED,
            suffix: 'order_cancelled',
            metadata: {
              reason: 'order_cancelled',
            },
            source: 'orderAssignmentTriggerService.handleOrderCancellation',
          }),
        ),
      );

      console.log(`Cancelled ${result.modifiedCount} active assignments for order ${orderId}`);
      return result;
    } catch (error) {
      console.error('Error in handleOrderCancellation:', error);
      throw error;
    }
  }

  /**
   * Start periodic assignment checker
   * This runs every 30 seconds to check for orders that need assignment
   */
  startPeriodicAssignmentChecker() {
    console.log('Periodic assignment checker disabled. Broadcast-to-all delivery flow is active.');

    const intervalId = null;
    if (!this.intervalIds) {
      this.intervalIds = new Map();
    }
    this.intervalIds.set('periodic_checker', intervalId);

    return intervalId;
  }

  /**
   * Stop periodic assignment checker
   */
  stopPeriodicAssignmentChecker() {
    if (this.intervalIds && this.intervalIds.has('periodic_checker')) {
      const intervalId = this.intervalIds.get('periodic_checker');
      if (intervalId) {
        clearInterval(intervalId);
      }
      this.intervalIds.delete('periodic_checker');
      console.log('Stopped periodic assignment checker');
    }
  }
}

export default new OrderAssignmentTriggerService();
