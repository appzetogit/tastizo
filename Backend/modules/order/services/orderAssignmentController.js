import Order from '../models/Order.js';
import OrderAssignmentHistory from '../models/OrderAssignmentHistory.js';
import Delivery from '../../delivery/models/Delivery.js';
import { findNearestDeliveryBoy } from './deliveryAssignmentService.js';
import orderAssignmentSocketService from './orderAssignmentSocketService.js';
import mongoose from 'mongoose';
import {
  DELIVERY_NOTIFICATION_EVENTS,
  notifyDeliveryOrderEvent,
} from '../../delivery/services/deliveryNotificationService.js';

/**
 * Order Assignment Controller
 * Handles the complete delivery order assignment flow with timeout/rejection logic
 */
class OrderAssignmentController {
  /**
   * Assign order to nearest available delivery boy
   * @param {String} orderId - Order ID
   * @param {Number} restaurantLat - Restaurant latitude
   * @param {Number} restaurantLng - Restaurant longitude
   * @param {String} restaurantId - Restaurant ID
   */
  async assignOrderToDelivery(orderId, restaurantLat, restaurantLng, restaurantId = null, previousDeliveryPartnerId = null) {
    try {
      console.log(`Starting order assignment for order ${orderId}`);
      
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Check if order is already assigned or in a state that doesn't allow assignment
      if (order.deliveryPartnerId || order.assignmentStatus === 'accepted') {
        console.log(`Order ${orderId} already assigned or accepted`);
        return null;
      }

      // Get excluded delivery partners (those who already rejected/expired this order)
      const excludedPartners = await OrderAssignmentHistory.getExcludedDeliveryPartners(orderId);
      
      // CRITICAL: Also add the current rejecting delivery partner to exclusion list
      if (previousDeliveryPartnerId) {
        const previousPartnerStr = previousDeliveryPartnerId.toString();
        if (!excludedPartners.some(id => id.toString() === previousPartnerStr)) {
          excludedPartners.push(new mongoose.Types.ObjectId(previousPartnerStr));
        }
      }
      
      console.log(`Excluded ${excludedPartners.length} delivery partners for order ${orderId}`);

      // Find nearest available delivery boy
      const nearestDeliveryBoy = await findNearestDeliveryBoy(
        restaurantLat, 
        restaurantLng, 
        restaurantId, 
        50, // max distance 50km
        excludedPartners.map(id => id.toString())
      );

      if (!nearestDeliveryBoy) {
        console.log(`No available delivery boys found for order ${orderId}`);
        await this.markOrderAsUnassigned(orderId, 'No available delivery partners');
        return null;
      }

      // CRITICAL: Double-check that the found delivery boy is not in the excluded list
      const foundPartnerId = nearestDeliveryBoy.deliveryPartnerId.toString();
      const isExcluded = excludedPartners.some(id => id.toString() === foundPartnerId);
      
      if (isExcluded) {
        console.error(`CRITICAL ERROR: Excluded delivery partner ${foundPartnerId} was selected for order ${orderId}`);
        throw new Error(`System error: Excluded delivery partner was selected for assignment`);
      }

      console.log(`Found delivery boy ${nearestDeliveryBoy.deliveryPartnerId} at distance ${nearestDeliveryBoy.distance}km`);

      // Create assignment history record
      const assignmentHistory = new OrderAssignmentHistory({
        orderId: order._id,
        orderNumber: order.orderId,
        deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
        assignmentStatus: 'pending',
        assignedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 1000), // 1 minute timeout
        metadata: {
          distance: nearestDeliveryBoy.distance,
          assignmentMethod: 'nearest_available',
          totalAttempts: excludedPartners.length + 1,
          previousAttempts: excludedPartners.length
        }
      });

      await assignmentHistory.save();

      // Update order assignment details
      await Order.findByIdAndUpdate(orderId, {
        $set: {
          assignmentStatus: 'assigned',
          deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
          assignmentTimings: {
            firstAssignedAt: order.assignmentTimings?.firstAssignedAt || new Date(),
            lastAssignedAt: new Date(),
            expiresAt: new Date(Date.now() + 60 * 1000),
            totalAttempts: excludedPartners.length + 1,
            currentAttempt: excludedPartners.length + 1
          },
          assignmentInfo: {
            ...order.assignmentInfo,
            deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
            distance: nearestDeliveryBoy.distance,
            assignedAt: new Date(),
            assignedBy: 'nearest_available'
          }
        }
      });

      // Send real-time assignment notification
      await orderAssignmentSocketService.emitOrderAssignment(
        orderId, 
        nearestDeliveryBoy.deliveryPartnerId, 
        {
          distance: nearestDeliveryBoy.distance,
          assignmentMethod: 'nearest_available',
          attemptNumber: excludedPartners.length + 1,
          totalAttempts: excludedPartners.length + 1
        }
      );

      // Start countdown timer
      orderAssignmentSocketService.startAssignmentCountdown(
        orderId, 
        nearestDeliveryBoy.deliveryPartnerId, 
        60
      );

      notifyDeliveryOrderEvent({
        orderId,
        deliveryBoyId: nearestDeliveryBoy.deliveryPartnerId,
        type: DELIVERY_NOTIFICATION_EVENTS.NEW_DELIVERY_REQUEST,
        metadata: {
          distance: nearestDeliveryBoy.distance,
          attemptNumber: excludedPartners.length + 1,
          expiresInSeconds: 60,
        },
        source: "orderAssignmentController.assignOrderToDelivery",
      }).catch((notifyError) => {
        console.warn("Delivery request notification failed:", notifyError.message);
      });

      if (order.status === "ready") {
        notifyDeliveryOrderEvent({
          orderId,
          deliveryBoyId: nearestDeliveryBoy.deliveryPartnerId,
          type: DELIVERY_NOTIFICATION_EVENTS.PICKUP_READY,
          metadata: {
            distance: nearestDeliveryBoy.distance,
          },
          source: "orderAssignmentController.assignOrderToDelivery.ready",
        }).catch((notifyError) => {
          console.warn("Pickup ready notification failed:", notifyError.message);
        });
      }

      console.log(`Order ${orderId} assigned to delivery boy ${nearestDeliveryBoy.deliveryPartnerId}`);

      return {
        success: true,
        orderId: order.orderId,
        deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
        deliveryPartnerName: nearestDeliveryBoy.name,
        distance: nearestDeliveryBoy.distance,
        expiresAt: new Date(Date.now() + 60 * 1000)
      };
    } catch (error) {
      console.error('Error in assignOrderToDelivery:', error);
      throw error;
    }
  }

  /**
   * Accept order assignment (called by delivery boy)
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   */
  async acceptOrderAssignment(orderId, deliveryPartnerId) {
    try {
      console.log(`Delivery partner ${deliveryPartnerId} accepting order ${orderId}`);

      // Import lock service
      const orderLockService = (await import('./orderLockService.js')).default;

      // Use lock service to prevent race conditions
      const lockResult = await orderLockService.withLock(
        orderId,
        deliveryPartnerId,
        async () => {
          const order = await Order.findById(orderId);
          if (!order) {
            throw new Error('Order not found');
          }

          // Check if order is still available for acceptance
          if (order.assignmentStatus !== 'assigned' || order.deliveryPartnerId.toString() !== deliveryPartnerId) {
            throw new Error('Order not available for acceptance');
          }

          // Check if assignment hasn't expired
          const activeAssignment = await OrderAssignmentHistory.getActiveAssignment(orderId);
          if (!activeAssignment || activeAssignment.deliveryPartnerId._id.toString() !== deliveryPartnerId) {
            throw new Error('Assignment not found or expired');
          }

          // Use atomic update to prevent race conditions
          const session = await mongoose.startSession();
          session.startTransaction();

          try {
            // Update order with atomic check
            const updatedOrder = await Order.findOneAndUpdate(
              {
                _id: orderId,
                deliveryPartnerId: deliveryPartnerId,
                assignmentStatus: 'assigned'
              },
              {
                $set: {
                  assignmentStatus: 'accepted',
                  'deliveryState.status': 'accepted',
                  'deliveryState.acceptedAt': new Date(),
                  'deliveryState.currentPhase': 'en_route_to_pickup',
                  'assignmentTimings.acceptedAt': new Date()
                }
              },
              { new: true, session }
            );

            if (!updatedOrder) {
              await session.abortTransaction();
              throw new Error('Order was already accepted by another delivery partner');
            }

            // Update assignment history
            await OrderAssignmentHistory.findOneAndUpdate(
              {
                orderId: orderId,
                deliveryPartnerId: deliveryPartnerId,
                assignmentStatus: 'pending'
              },
              {
                assignmentStatus: 'accepted',
                respondedAt: new Date()
              },
              { session }
            );

            await session.commitTransaction();

            // Stop countdown timer
            orderAssignmentSocketService.stopAssignmentCountdown(orderId, deliveryPartnerId);

            // Broadcast acceptance to all delivery boys
            await orderAssignmentSocketService.emitOrderAccepted(orderId, deliveryPartnerId);

            notifyDeliveryOrderEvent({
              order: updatedOrder,
              deliveryBoyId: deliveryPartnerId,
              type: DELIVERY_NOTIFICATION_EVENTS.ORDER_ASSIGNED,
              metadata: {
                acceptedAt: new Date(),
              },
              source: "orderAssignmentController.acceptOrderAssignment",
            }).catch((notifyError) => {
              console.warn("Order assigned delivery notification failed:", notifyError.message);
            });

            console.log(`Order ${orderId} accepted by delivery partner ${deliveryPartnerId}`);

            return {
              success: true,
              order: updatedOrder,
              message: 'Order accepted successfully'
            };
          } catch (error) {
            await session.abortTransaction();
            throw error;
          } finally {
            session.endSession();
          }
        },
        10000 // 10 second lock timeout
      );

      if (!lockResult.success) {
        throw new Error(lockResult.error || 'Failed to acquire lock for order acceptance');
      }

      return lockResult.result;
    } catch (error) {
      console.error('Error accepting order assignment:', error);
      throw error;
    }
  }

  /**
   * Reject order assignment (called by delivery boy)
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   * @param {String} reason - Rejection reason
   */
  async rejectOrderAssignment(orderId, deliveryPartnerId, reason = 'rejected_by_delivery') {
    try {
      console.log(`Delivery partner ${deliveryPartnerId} rejecting order ${orderId}`);

      // Update assignment history immediately to block this delivery partner
      const assignment = await OrderAssignmentHistory.findOne({
        orderId: orderId,
        deliveryPartnerId: deliveryPartnerId,
        assignmentStatus: 'pending'
      });

      if (!assignment) {
        throw new Error('Active assignment not found');
      }

      // Mark as rejected immediately to prevent reassignment to same partner
      await assignment.rejectAssignment(reason);

      // Update order to remove current assignment immediately
      await Order.findByIdAndUpdate(orderId, {
        $set: {
          assignmentStatus: 'expired',
          deliveryPartnerId: null
        }
      });

      // Stop countdown timer
      orderAssignmentSocketService.stopAssignmentCountdown(orderId, deliveryPartnerId);

      // Immediately notify delivery boy that order is cancelled for them
      await orderAssignmentSocketService.emitOrderAssignmentCancelled(orderId, deliveryPartnerId, 'rejected');

      notifyDeliveryOrderEvent({
        orderId,
        deliveryBoyId: deliveryPartnerId,
        type: DELIVERY_NOTIFICATION_EVENTS.DELIVERY_CANCELLED,
        suffix: reason || "rejected",
        metadata: {
          reason: reason || "rejected_by_delivery",
        },
        source: "orderAssignmentController.rejectOrderAssignment",
      }).catch((notifyError) => {
        console.warn("Delivery cancelled notification failed:", notifyError.message);
      });

      // CRITICAL: Add a small delay before reassignment to ensure the rejection is processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger reassignment to next available delivery partner (excluding rejected one)
      await this.reassignOrder(orderId, deliveryPartnerId, reason);

      console.log(`Order ${orderId} rejected by delivery partner ${deliveryPartnerId}, blocked from future assignments and reassigned...`);

      return {
        success: true,
        message: 'Order rejected and blocked for this delivery partner'
      };
    } catch (error) {
      console.error('Error rejecting order assignment:', error);
      throw error;
    }
  }

  /**
   * Reassign order to next available delivery boy
   * @param {String} orderId - Order ID
   * @param {String} previousDeliveryPartnerId - Previous delivery partner ID
   * @param {String} reason - Reassignment reason
   */
  async reassignOrder(orderId, previousDeliveryPartnerId, reason = 'timeout') {
    try {
      console.log(`Reassigning order ${orderId} from delivery partner ${previousDeliveryPartnerId}, reason: ${reason}`);

      const order = await Order.findById(orderId)
        .populate('restaurantId', 'name location');

      if (!order) {
        throw new Error('Order not found');
      }

      // Check if order is still in assignable state
      if (order.assignmentStatus === 'accepted' || order.deliveryPartnerId.toString() !== previousDeliveryPartnerId) {
        console.log(`Order ${orderId} already accepted or assigned to different partner, skipping reassignment`);
        return null;
      }

      // Get restaurant coordinates
      const restaurantLat = order.restaurantId?.location?.coordinates?.[1];
      const restaurantLng = order.restaurantId?.location?.coordinates?.[0];
      const restaurantId = order.restaurantId?._id?.toString();

      if (!restaurantLat || !restaurantLng) {
        console.error(`Restaurant coordinates not found for order ${orderId}`);
        return null;
      }

      // Assign to next available delivery boy
      const result = await this.assignOrderToDelivery(orderId, restaurantLat, restaurantLng, restaurantId, previousDeliveryPartnerId);

      if (result) {
        console.log(`Order ${orderId} reassigned to delivery partner ${result.deliveryPartnerId}`);
      } else {
        console.log(`No available delivery partners found for order ${orderId} during reassignment`);
        await this.markOrderAsUnassigned(orderId, 'No delivery partners available after reassignment');
      }

      return result;
    } catch (error) {
      console.error('Error reassigning order:', error);
      throw error;
    }
  }

  /**
   * Handle assignment expiration (called by timer)
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   */
  async handleAssignmentExpiration(orderId, deliveryPartnerId) {
    try {
      console.log(`Handling assignment expiration for order ${orderId}, delivery partner ${deliveryPartnerId}`);

      // Mark assignment as expired
      const assignment = await OrderAssignmentHistory.findOne({
        orderId: orderId,
        deliveryPartnerId: deliveryPartnerId,
        assignmentStatus: 'pending'
      });

      if (assignment) {
        await assignment.expireAssignment('timeout');
      }

      // Update order status
      await Order.findByIdAndUpdate(orderId, {
        $set: {
          assignmentStatus: 'expired',
          deliveryPartnerId: null
        }
      });

      // Notify delivery boy about expiration
      await orderAssignmentSocketService.emitOrderAssignmentCancelled(orderId, deliveryPartnerId, 'expired');

      notifyDeliveryOrderEvent({
        orderId,
        deliveryBoyId,
        type: DELIVERY_NOTIFICATION_EVENTS.DELIVERY_CANCELLED,
        suffix: "expired",
        metadata: {
          reason: "expired",
        },
        source: "orderAssignmentController.handleAssignmentExpiration",
      }).catch((notifyError) => {
        console.warn("Delivery expiration notification failed:", notifyError.message);
      });

      // Trigger reassignment
      await this.reassignOrder(orderId, deliveryPartnerId, 'timeout');
    } catch (error) {
      console.error('Error handling assignment expiration:', error);
    }
  }

  /**
   * Mark order as unassigned (no delivery partners available)
   * @param {String} orderId - Order ID
   * @param {String} reason - Reason for unassignment
   */
  async markOrderAsUnassigned(orderId, reason) {
    try {
      await Order.findByIdAndUpdate(orderId, {
        $set: {
          assignmentStatus: 'pending_assignment',
          deliveryPartnerId: null,
          'assignmentTimings.lastAssignedAt': new Date()
        }
      });

      console.log(`Order ${orderId} marked as unassigned: ${reason}`);
    } catch (error) {
      console.error('Error marking order as unassigned:', error);
    }
  }

  /**
   * Get active assignments for a delivery partner
   * @param {String} deliveryPartnerId - Delivery partner ID
   */
  async getActiveAssignments(deliveryPartnerId) {
    try {
      const assignments = await OrderAssignmentHistory.find({
        deliveryPartnerId: deliveryPartnerId,
        assignmentStatus: 'pending',
        expiresAt: { $gt: new Date() }
      })
      .populate('orderId', 'orderId restaurantId items pricing address estimatedDeliveryTime')
      .sort({ assignedAt: -1 });

      return assignments;
    } catch (error) {
      console.error('Error getting active assignments:', error);
      throw error;
    }
  }

  /**
   * Get assignment history for an order
   * @param {String} orderId - Order ID
   */
  async getOrderAssignmentHistory(orderId) {
    try {
      return await OrderAssignmentHistory.getOrderAssignmentHistory(orderId);
    } catch (error) {
      console.error('Error getting order assignment history:', error);
      throw error;
    }
  }
}

export default new OrderAssignmentController();
