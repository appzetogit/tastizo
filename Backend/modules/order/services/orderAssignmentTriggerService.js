import Order from '../models/Order.js';
import orderAssignmentController from './orderAssignmentController.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import {
  DELIVERY_NOTIFICATION_EVENTS,
  notifyDeliveryOrderEvent,
} from '../../delivery/services/deliveryNotificationService.js';

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
      console.log(`Triggering assignment for order ${orderId}, reason: ${triggerReason}`);

      const order = await Order.findById(orderId).populate('restaurantId', 'location');
      if (!order) {
        console.error(`Order ${orderId} not found for assignment trigger`);
        return null;
      }

      // Check if order is ready for assignment
      if (!this.isOrderReadyForAssignment(order)) {
        console.log(`Order ${orderId} not ready for assignment, status: ${order.status}`);
        return null;
      }

      // Check if order already has a delivery partner assigned
      if (order.deliveryPartnerId || order.assignmentStatus === 'accepted') {
        console.log(`Order ${orderId} already has delivery partner assigned`);
        return null;
      }

      // Get restaurant coordinates
      let restaurantLat, restaurantLng, restaurantId;
      
      if (order.restaurantId?.location?.coordinates) {
        [restaurantLng, restaurantLat] = order.restaurantId.location.coordinates;
        restaurantId = order.restaurantId._id.toString();
      } else {
        // Fallback: fetch restaurant separately
        const restaurant = await Restaurant.findById(order.restaurantId);
        if (restaurant?.location?.coordinates) {
          [restaurantLng, restaurantLat] = restaurant.location.coordinates;
          restaurantId = restaurant._id.toString();
        } else {
          console.error(`Restaurant coordinates not found for order ${orderId}`);
          return null;
        }
      }

      // Validate coordinates
      if (!restaurantLat || !restaurantLng || isNaN(restaurantLat) || isNaN(restaurantLng)) {
        console.error(`Invalid restaurant coordinates for order ${orderId}: lat=${restaurantLat}, lng=${restaurantLng}`);
        return null;
      }

      // Trigger assignment
      const assignmentResult = await orderAssignmentController.assignOrderToDelivery(
        orderId,
        restaurantLat,
        restaurantLng,
        restaurantId
      );

      if (assignmentResult && assignmentResult.success) {
        console.log(`Assignment triggered successfully for order ${orderId}:`, {
          deliveryPartnerId: assignmentResult.deliveryPartnerId,
          deliveryPartnerName: assignmentResult.deliveryPartnerName,
          distance: assignmentResult.distance
        });
      } else {
        console.log(`Assignment trigger failed for order ${orderId}`);
      }

      return assignmentResult;
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
    // Order is ready for assignment if:
    // 1. Status is 'preparing' or 'ready' (restaurant is preparing/ready)
    // 2. Not cancelled, delivered, or already assigned
    // 3. Has valid restaurant and customer addresses
    
    const validStatuses = ['preparing', 'ready'];
    const invalidStatuses = ['cancelled', 'delivered', 'pending'];
    
    return validStatuses.includes(order.status) && 
           !invalidStatuses.includes(order.status) &&
           order.restaurantId &&
           order.address &&
           order.address.location &&
           order.address.location.coordinates;
  }

  /**
   * Trigger assignment for multiple orders (batch processing)
   * @param {Array} orderIds - Array of order IDs
   */
  async triggerBatchAssignments(orderIds) {
    try {
      console.log(`Triggering batch assignments for ${orderIds.length} orders`);
      
      const results = [];
      for (const orderId of orderIds) {
        try {
          const result = await this.triggerAssignment(orderId, 'batch_trigger');
          results.push({
            orderId,
            success: !!result?.success,
            result: result || null
          });
        } catch (error) {
          console.error(`Error triggering assignment for order ${orderId}:`, error);
          results.push({
            orderId,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`Batch assignment completed: ${successCount}/${orderIds.length} successful`);

      return results;
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
      console.log('Finding pending orders for assignment...');

      // Find orders that are ready for assignment but not yet assigned
      const pendingOrders = await Order.find({
        status: { $in: ['preparing', 'ready'] },
        assignmentStatus: { $in: ['pending_assignment', 'expired'] },
        deliveryPartnerId: { $exists: false },
        'restaurantId.location.coordinates': { $exists: true },
        'address.location.coordinates': { $exists: true }
      })
      .populate('restaurantId', 'location')
      .limit(50) // Process in batches to avoid overwhelming
      .lean();

      if (pendingOrders.length === 0) {
        console.log('No pending orders found for assignment');
        return [];
      }

      console.log(`Found ${pendingOrders.length} pending orders for assignment`);

      const results = [];
      for (const order of pendingOrders) {
        try {
          const result = await this.triggerAssignment(order._id.toString(), 'periodic_check');
          results.push({
            orderId: order.orderId,
            success: !!result?.success,
            result: result || null
          });
        } catch (error) {
          console.error(`Error assigning pending order ${order.orderId}:`, error);
          results.push({
            orderId: order.orderId,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`Pending assignment completed: ${successCount}/${pendingOrders.length} successful`);

      return results;
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

      // Trigger assignment if order moved to 'preparing' or 'ready' status
      const assignmentTriggerStatuses = ['preparing', 'ready'];
      
      if (assignmentTriggerStatuses.includes(newStatus)) {
        // Add small delay to ensure all order data is saved
        setTimeout(async () => {
          try {
            await this.triggerAssignment(orderId, 'status_change');
          } catch (error) {
            console.error(`Error in delayed assignment trigger for order ${orderId}:`, error);
          }
        }, 1000);
      }

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
    console.log('Starting periodic assignment checker...');
    
    const intervalId = setInterval(async () => {
      try {
        await this.assignPendingOrders();
      } catch (error) {
        console.error('Error in periodic assignment checker:', error);
      }
    }, 30000); // Every 30 seconds

    // Store interval ID for cleanup
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
      clearInterval(this.intervalIds.get('periodic_checker'));
      this.intervalIds.delete('periodic_checker');
      console.log('Stopped periodic assignment checker');
    }
  }
}

export default new OrderAssignmentTriggerService();
