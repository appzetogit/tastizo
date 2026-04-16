import OrderAssignmentHistory from '../models/OrderAssignmentHistory.js';
import Order from '../models/Order.js';
import orderAssignmentSocketService from './orderAssignmentSocketService.js';

/**
 * Assignment Cleanup Service
 * Handles periodic cleanup of expired assignments and maintenance tasks
 */
class AssignmentCleanupService {
  /**
   * Clean up expired assignments and trigger reassignments
   */
  async cleanupExpiredAssignments() {
    try {
      console.log('Starting cleanup of expired assignments...');
      
      const now = new Date();
      
      // Find expired assignments that are still marked as pending
      const expiredAssignments = await OrderAssignmentHistory.find({
        assignmentStatus: 'pending',
        expiresAt: { $lte: now }
      })
      .populate('orderId', 'orderId status')
      .populate('deliveryPartnerId', 'name phone')
      .lean();

      if (expiredAssignments.length === 0) {
        console.log('No expired assignments to clean up');
        return { cleaned: 0, reassigned: 0 };
      }

      console.log(`Found ${expiredAssignments.length} expired assignments to clean up`);

      let cleanedCount = 0;
      let reassignedCount = 0;

      for (const assignment of expiredAssignments) {
        try {
          // Mark assignment as expired
          await OrderAssignmentHistory.findByIdAndUpdate(assignment._id, {
            $set: {
              assignmentStatus: 'expired',
              respondedAt: now,
              reason: 'timeout'
            }
          });

          // Update order to remove current assignment
          await Order.findByIdAndUpdate(assignment.orderId._id, {
            $set: {
              assignmentStatus: 'expired',
              deliveryPartnerId: null
            }
          });

          // Notify delivery boy about expiration
          await orderAssignmentSocketService.emitOrderAssignmentCancelled(
            assignment.orderId._id.toString(),
            assignment.deliveryPartnerId._id.toString(),
            'expired'
          );

          // Stop countdown timer if running
          orderAssignmentSocketService.stopAssignmentCountdown(
            assignment.orderId._id.toString(),
            assignment.deliveryPartnerId._id.toString()
          );

          // Trigger reassignment for the order
          const { default: orderAssignmentController } = await import('./orderAssignmentController.js');
          const reassignResult = await orderAssignmentController.reassignOrder(
            assignment.orderId._id.toString(),
            assignment.deliveryPartnerId._id.toString(),
            'timeout'
          );

          if (reassignResult && reassignResult.success) {
            reassignedCount++;
            console.log(`Successfully reassigned order ${assignment.orderId.orderId} to new delivery partner`);
          } else {
            console.log(`Could not reassign order ${assignment.orderId.orderId} - no available delivery partners`);
          }

          cleanedCount++;
        } catch (error) {
          console.error(`Error cleaning up assignment ${assignment._id}:`, error);
        }
      }

      console.log(`Cleanup completed: ${cleanedCount} cleaned, ${reassignedCount} reassigned`);
      
      return { cleaned: cleanedCount, reassigned: reassignedCount };
    } catch (error) {
      console.error('Error in cleanupExpiredAssignments:', error);
      throw error;
    }
  }

  /**
   * Clean up orphaned assignments (assignments without valid orders)
   */
  async cleanupOrphanedAssignments() {
    try {
      console.log('Starting cleanup of orphaned assignments...');

      // Find assignments where the order no longer exists or is in a terminal state
      const orphanedAssignments = await OrderAssignmentHistory.find({
        assignmentStatus: 'pending'
      })
      .populate('orderId', 'status cancelled deliveredAt')
      .lean();

      let cleanedCount = 0;

      for (const assignment of orphanedAssignments) {
        try {
          const shouldCleanup = 
            !assignment.orderId || // Order doesn't exist
            assignment.orderId.status === 'cancelled' || // Order was cancelled
            assignment.orderId.status === 'delivered' || // Order was delivered
            (assignment.orderId.deliveredAt && assignment.orderId.deliveredAt < new Date()); // Order is completed

          if (shouldCleanup) {
            await OrderAssignmentHistory.findByIdAndUpdate(assignment._id, {
              $set: {
                assignmentStatus: 'reassigned',
                reason: assignment.orderId?.status === 'cancelled' ? 'order_cancelled' : 'order_completed',
                respondedAt: new Date()
              }
            });

            // Stop countdown timer if running
            if (assignment.orderId) {
              orderAssignmentSocketService.stopAssignmentCountdown(
                assignment.orderId._id.toString(),
                assignment.deliveryPartnerId.toString()
              );
            }

            cleanedCount++;
          }
        } catch (error) {
          console.error(`Error cleaning up orphaned assignment ${assignment._id}:`, error);
        }
      }

      console.log(`Orphaned assignment cleanup completed: ${cleanedCount} cleaned`);
      return cleanedCount;
    } catch (error) {
      console.error('Error in cleanupOrphanedAssignments:', error);
      throw error;
    }
  }

  /**
   * Clean up expired assignment locks
   */
  async cleanupExpiredLocks() {
    try {
      console.log('Starting cleanup of expired assignment locks...');

      const now = new Date();
      
      // Find orders with expired locks
      const result = await Order.updateMany(
        {
          'assignmentLock.isLocked': true,
          'assignmentLock.lockExpiresAt': { $lte: now }
        },
        {
          $set: {
            'assignmentLock.isLocked': false,
            'assignmentLock.lockedBy': null,
            'assignmentLock.lockedAt': null,
            'assignmentLock.lockExpiresAt': null
          }
        }
      );

      console.log(`Lock cleanup completed: ${result.modifiedCount} locks removed`);
      return result.modifiedCount;
    } catch (error) {
      console.error('Error in cleanupExpiredLocks:', error);
      throw error;
    }
  }

  /**
   * Run full cleanup cycle
   */
  async runFullCleanup() {
    try {
      console.log('Starting full assignment cleanup cycle...');
      
      const results = {
        expiredAssignments: await this.cleanupExpiredAssignments(),
        orphanedAssignments: await this.cleanupOrphanedAssignments(),
        expiredLocks: await this.cleanupExpiredLocks()
      };

      console.log('Full cleanup cycle completed:', results);
      return results;
    } catch (error) {
      console.error('Error in runFullCleanup:', error);
      throw error;
    }
  }

  /**
   * Start periodic cleanup service
   * Runs every 30 seconds
   */
  startPeriodicCleanup() {
    console.log('Starting periodic assignment cleanup service...');
    
    const intervalId = setInterval(async () => {
      try {
        await this.runFullCleanup();
      } catch (error) {
        console.error('Error in periodic cleanup:', error);
      }
    }, 30000); // Every 30 seconds

    // Store interval ID for cleanup
    if (!this.intervalIds) {
      this.intervalIds = new Map();
    }
    this.intervalIds.set('periodic_cleanup', intervalId);

    return intervalId;
  }

  /**
   * Stop periodic cleanup service
   */
  stopPeriodicCleanup() {
    if (this.intervalIds && this.intervalIds.has('periodic_cleanup')) {
      clearInterval(this.intervalIds.get('periodic_cleanup'));
      this.intervalIds.delete('periodic_cleanup');
      console.log('Stopped periodic assignment cleanup service');
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStatistics() {
    try {
      const stats = {
        pendingAssignments: await OrderAssignmentHistory.countDocuments({ assignmentStatus: 'pending' }),
        expiredAssignments: await OrderAssignmentHistory.countDocuments({ assignmentStatus: 'expired' }),
        rejectedAssignments: await OrderAssignmentHistory.countDocuments({ assignmentStatus: 'rejected' }),
        acceptedAssignments: await OrderAssignmentHistory.countDocuments({ assignmentStatus: 'accepted' }),
        reassignedAssignments: await OrderAssignmentHistory.countDocuments({ assignmentStatus: 'reassigned' }),
        lockedOrders: await Order.countDocuments({ 'assignmentLock.isLocked': true })
      };

      return stats;
    } catch (error) {
      console.error('Error getting cleanup statistics:', error);
      throw error;
    }
  }
}

export default new AssignmentCleanupService();
