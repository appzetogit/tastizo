import mongoose from 'mongoose';
import Order from '../models/Order.js';
import OrderAssignmentHistory from '../models/OrderAssignmentHistory.js';

/**
 * Order Lock Service
 * Provides atomic operations and race-condition prevention for order assignments
 */
class OrderLockService {
  constructor() {
    this.activeLocks = new Map(); // In-memory lock tracking
    this.lockTimeouts = new Map(); // Lock timeout tracking
  }

  /**
   * Acquire an atomic lock on an order for assignment operations
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID attempting the lock
   * @param {Number} timeoutMs - Lock timeout in milliseconds (default: 5000)
   * @returns {Promise<Object>} Lock result
   */
  async acquireAssignmentLock(orderId, deliveryPartnerId, timeoutMs = 5000) {
    try {
      const orderIdStr = orderId.toString();
      const deliveryPartnerIdStr = deliveryPartnerId.toString();
      
      // Check if there's already an active lock for this order
      const existingLock = this.activeLocks.get(orderIdStr);
      if (existingLock) {
        // If the same delivery partner already has the lock, extend it
        if (existingLock.deliveryPartnerId === deliveryPartnerIdStr) {
          this.extendLock(orderIdStr, timeoutMs);
          return {
            success: true,
            lockId: existingLock.lockId,
            message: 'Lock extended'
          };
        }
        
        // Another delivery partner has the lock
        return {
          success: false,
          error: 'Order is currently being processed by another delivery partner',
          lockedBy: existingLock.deliveryPartnerId
        };
      }

      // Attempt atomic database lock
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const now = new Date();
        const lockExpiresAt = new Date(Date.now() + timeoutMs);
        const lockId = `lock_${orderIdStr}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Try to acquire lock using atomic update
        const order = await Order.findOneAndUpdate(
          {
            _id: orderIdStr,
            'assignmentLock.isLocked': { $ne: true } // Not locked or lock doesn't exist
          },
          {
            $set: {
              'assignmentLock.isLocked': true,
              'assignmentLock.lockedBy': deliveryPartnerIdStr,
              'assignmentLock.lockedAt': now,
              'assignmentLock.lockExpiresAt': lockExpiresAt,
              'assignmentLock.lockId': lockId
            }
          },
          { 
            new: true, 
            session,
            upsert: false // Don't create if not found
          }
        );

        if (!order) {
          await session.abortTransaction();
          
          // Check if order exists and is locked by someone else
          const existingOrder = await Order.findById(orderIdStr).session(session);
          if (!existingOrder) {
            return {
              success: false,
              error: 'Order not found'
            };
          }
          
          if (existingOrder.assignmentLock?.isLocked) {
            return {
              success: false,
              error: 'Order is currently locked',
              lockedBy: existingOrder.assignmentLock.lockedBy
            };
          }
          
          return {
            success: false,
            error: 'Failed to acquire lock - unknown reason'
          };
        }

        await session.commitTransaction();

        // Add to in-memory tracking
        const lockInfo = {
          lockId,
          deliveryPartnerId: deliveryPartnerIdStr,
          lockedAt: now,
          expiresAt: lockExpiresAt
        };
        
        this.activeLocks.set(orderIdStr, lockInfo);
        this.setupLockTimeout(orderIdStr, timeoutMs);

        return {
          success: true,
          lockId,
          expiresAt: lockExpiresAt
        };
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error('Error acquiring assignment lock:', error);
      return {
        success: false,
        error: 'Failed to acquire lock: ' + error.message
      };
    }
  }

  /**
   * Release an assignment lock
   * @param {String} orderId - Order ID
   * @param {String} lockId - Lock ID to verify ownership
   * @param {String} deliveryPartnerId - Delivery partner ID releasing the lock
   * @returns {Promise<Object>} Release result
   */
  async releaseAssignmentLock(orderId, lockId, deliveryPartnerId) {
    try {
      const orderIdStr = orderId.toString();
      const deliveryPartnerIdStr = deliveryPartnerId.toString();

      // Check in-memory lock first
      const lockInfo = this.activeLocks.get(orderIdStr);
      if (!lockInfo || lockInfo.lockId !== lockId || lockInfo.deliveryPartnerId !== deliveryPartnerIdStr) {
        return {
          success: false,
          error: 'Invalid lock or lock not found'
        };
      }

      // Remove from database
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const order = await Order.findOneAndUpdate(
          {
            _id: orderIdStr,
            'assignmentLock.lockId': lockId,
            'assignmentLock.lockedBy': deliveryPartnerIdStr
          },
          {
            $set: {
              'assignmentLock.isLocked': false,
              'assignmentLock.lockedBy': null,
              'assignmentLock.lockedAt': null,
              'assignmentLock.lockExpiresAt': null,
              'assignmentLock.lockId': null
            }
          },
          { new: true, session }
        );

        if (!order) {
          await session.abortTransaction();
          return {
            success: false,
            error: 'Lock not found or invalid'
          };
        }

        await session.commitTransaction();

        // Remove from in-memory tracking
        this.removeLock(orderIdStr);

        return {
          success: true,
          message: 'Lock released successfully'
        };
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error('Error releasing assignment lock:', error);
      return {
        success: false,
        error: 'Failed to release lock: ' + error.message
      };
    }
  }

  /**
   * Check if an order is locked
   * @param {String} orderId - Order ID
   * @returns {Promise<Object>} Lock status
   */
  async checkLockStatus(orderId) {
    try {
      const orderIdStr = orderId.toString();

      // Check in-memory first
      const memoryLock = this.activeLocks.get(orderIdStr);
      if (memoryLock) {
        return {
          isLocked: true,
          lockedBy: memoryLock.deliveryPartnerId,
          lockId: memoryLock.lockId,
          expiresAt: memoryLock.expiresAt,
          source: 'memory'
        };
      }

      // Check database
      const order = await Order.findById(orderIdStr);
      if (order?.assignmentLock?.isLocked) {
        // If database lock exists but not in memory, check if it's expired
        if (order.assignmentLock.lockExpiresAt && order.assignmentLock.lockExpiresAt > new Date()) {
          return {
            isLocked: true,
            lockedBy: order.assignmentLock.lockedBy,
            lockId: order.assignmentLock.lockId,
            expiresAt: order.assignmentLock.lockExpiresAt,
            source: 'database'
          };
        } else {
          // Lock is expired, clean it up
          await this.cleanupExpiredLock(orderIdStr);
          return {
            isLocked: false,
            message: 'Lock was expired and cleaned up'
          };
        }
      }

      return {
        isLocked: false
      };
    } catch (error) {
      console.error('Error checking lock status:', error);
      return {
        isLocked: false,
        error: 'Failed to check lock status'
      };
    }
  }

  /**
   * Execute a function with automatic lock management
   * @param {String} orderId - Order ID
   * @param {String} deliveryPartnerId - Delivery partner ID
   * @param {Function} operation - Function to execute while holding lock
   * @param {Number} timeoutMs - Lock timeout
   * @returns {Promise<Object>} Operation result
   */
  async withLock(orderId, deliveryPartnerId, operation, timeoutMs = 5000) {
    const lockResult = await this.acquireAssignmentLock(orderId, deliveryPartnerId, timeoutMs);
    
    if (!lockResult.success) {
      return {
        success: false,
        error: lockResult.error,
        lockedBy: lockResult.lockedBy
      };
    }

    try {
      const result = await operation();
      
      // Release lock on successful operation
      await this.releaseAssignmentLock(orderId, lockResult.lockId, deliveryPartnerId);
      
      return {
        success: true,
        result
      };
    } catch (error) {
      // Still try to release lock even if operation failed
      await this.releaseAssignmentLock(orderId, lockResult.lockId, deliveryPartnerId);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Setup automatic lock timeout
   * @param {String} orderId - Order ID
   * @param {Number} timeoutMs - Timeout in milliseconds
   */
  setupLockTimeout(orderId, timeoutMs) {
    // Clear any existing timeout
    if (this.lockTimeouts.has(orderId)) {
      clearTimeout(this.lockTimeouts.get(orderId));
    }

    // Set new timeout
    const timeoutId = setTimeout(async () => {
      console.log(`Lock timeout for order ${orderId}`);
      await this.cleanupExpiredLock(orderId);
    }, timeoutMs);

    this.lockTimeouts.set(orderId, timeoutId);
  }

  /**
   * Extend an existing lock
   * @param {String} orderId - Order ID
   * @param {Number} timeoutMs - New timeout in milliseconds
   */
  extendLock(orderId, timeoutMs) {
    const lockInfo = this.activeLocks.get(orderId);
    if (lockInfo) {
      lockInfo.expiresAt = new Date(Date.now() + timeoutMs);
      this.setupLockTimeout(orderId, timeoutMs);
    }
  }

  /**
   * Remove lock from in-memory tracking
   * @param {String} orderId - Order ID
   */
  removeLock(orderId) {
    this.activeLocks.delete(orderId);
    
    if (this.lockTimeouts.has(orderId)) {
      clearTimeout(this.lockTimeouts.get(orderId));
      this.lockTimeouts.delete(orderId);
    }
  }

  /**
   * Clean up expired locks
   * @param {String} orderId - Order ID (optional, if not provided cleans all expired locks)
   */
  async cleanupExpiredLock(orderId = null) {
    try {
      const now = new Date();
      
      if (orderId) {
        // Clean up specific order lock
        const lockInfo = this.activeLocks.get(orderId);
        if (lockInfo && lockInfo.expiresAt <= now) {
          this.removeLock(orderId);
          
          // Also clean up database
          await Order.updateOne(
            { _id: orderId },
            {
              $set: {
                'assignmentLock.isLocked': false,
                'assignmentLock.lockedBy': null,
                'assignmentLock.lockedAt': null,
                'assignmentLock.lockExpiresAt': null,
                'assignmentLock.lockId': null
              }
            }
          );
        }
      } else {
        // Clean up all expired locks
        const expiredLocks = [];
        for (const [orderIdStr, lockInfo] of this.activeLocks.entries()) {
          if (lockInfo.expiresAt <= now) {
            expiredLocks.push(orderIdStr);
          }
        }

        for (const expiredOrderId of expiredLocks) {
          this.removeLock(expiredOrderId);
        }

        // Clean up database locks
        await Order.updateMany(
          {
            'assignmentLock.isLocked': true,
            'assignmentLock.lockExpiresAt': { $lte: now }
          },
          {
            $set: {
              'assignmentLock.isLocked': false,
              'assignmentLock.lockedBy': null,
              'assignmentLock.lockedAt': null,
              'assignmentLock.lockExpiresAt': null,
              'assignmentLock.lockId': null
            }
          }
        );

        if (expiredLocks.length > 0) {
          console.log(`Cleaned up ${expiredLocks.length} expired locks`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired locks:', error);
    }
  }

  /**
   * Get current lock statistics
   * @returns {Object} Lock statistics
   */
  getLockStatistics() {
    const now = new Date();
    const activeLocks = Array.from(this.activeLocks.entries()).map(([orderId, lockInfo]) => ({
      orderId,
      deliveryPartnerId: lockInfo.deliveryPartnerId,
      lockedAt: lockInfo.lockedAt,
      expiresAt: lockInfo.expiresAt,
      timeRemaining: Math.max(0, lockInfo.expiresAt - now),
      isExpired: lockInfo.expiresAt <= now
    }));

    return {
      totalActiveLocks: this.activeLocks.size,
      activeLocks,
      expiredLocks: activeLocks.filter(lock => lock.isExpired).length
    };
  }

  /**
   * Force release all locks (emergency use)
   */
  async releaseAllLocks() {
    try {
      console.log('Force releasing all locks...');
      
      // Clear in-memory locks
      this.activeLocks.clear();
      
      // Clear timeouts
      for (const timeoutId of this.lockTimeouts.values()) {
        clearTimeout(timeoutId);
      }
      this.lockTimeouts.clear();
      
      // Clear database locks
      await Order.updateMany(
        { 'assignmentLock.isLocked': true },
        {
          $set: {
            'assignmentLock.isLocked': false,
            'assignmentLock.lockedBy': null,
            'assignmentLock.lockedAt': null,
            'assignmentLock.lockExpiresAt': null,
            'assignmentLock.lockId': null
          }
        }
      );
      
      console.log('All locks released');
    } catch (error) {
      console.error('Error releasing all locks:', error);
    }
  }
}

export default new OrderLockService();
