# Real-Time Delivery Order Assignment System

## Overview

This document describes the complete real-time delivery order assignment system that handles the entire flow from order creation to delivery partner assignment with timeout, rejection, and automatic reassignment capabilities.

## System Architecture

### Core Components

1. **OrderAssignmentHistory Model** - Tracks all assignment attempts and history
2. **OrderAssignmentController** - Main business logic for assignment operations
3. **OrderAssignmentSocketService** - Real-time Socket.IO communications
4. **OrderAssignmentTriggerService** - Initiates assignments based on order status
5. **AssignmentCleanupService** - Periodic cleanup of expired assignments
6. **OrderLockService** - Race-condition prevention and atomic operations
7. **RealTimeOrderAssignment (Frontend)** - UI component for delivery partners

### Database Schema Changes

#### Order Model Updates
```javascript
// Added fields for assignment tracking
assignmentStatus: {
  type: String,
  enum: ["pending_assignment", "assigned", "accepted", "rejected", "expired", "reassigned"],
  default: "pending_assignment"
},
assignmentTimings: {
  firstAssignedAt: Date,
  lastAssignedAt: Date,
  acceptedAt: Date,
  expiresAt: Date,
  totalAttempts: { type: Number, default: 0 },
  currentAttempt: { type: Number, default: 0 }
},
assignmentLock: {
  isLocked: { type: Boolean, default: false },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery" },
  lockedAt: Date,
  lockExpiresAt: Date
}
```

#### OrderAssignmentHistory Model
```javascript
{
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  orderNumber: { type: String, required: true },
  deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", required: true },
  assignmentStatus: {
    type: String,
    enum: ["pending", "accepted", "rejected", "expired", "reassigned"],
    required: true,
    default: "pending"
  },
  assignedAt: { type: Date, required: true, default: Date.now },
  respondedAt: { type: Date },
  expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 60 * 1000) },
  reassignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery" },
  reason: {
    type: String,
    enum: ["timeout", "rejected_by_delivery", "manual_reassign", "order_cancelled"]
  },
  metadata: {
    distance: Number,
    assignmentMethod: {
      type: String,
      enum: ["nearest_available", "zone_match", "manual", "priority_based"],
      default: "nearest_available"
    },
    previousAttempts: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 1 }
  }
}
```

## Assignment Flow

### 1. Order Creation & Status Change
- When order status changes to "preparing" or "ready", the assignment trigger is activated
- System finds the nearest available delivery boy
- Creates assignment history record
- Sends real-time notification to delivery boy

### 2. Real-Time Notification
- Socket.IO emits `NEW_ORDER_ASSIGNMENT` to specific delivery boy
- Frontend shows countdown timer (60 seconds)
- Delivery boy can accept or reject the order

### 3. Acceptance Flow
- Delivery boy accepts order via API call
- System uses atomic locks to prevent race conditions
- Updates order status to "accepted"
- Broadcasts acceptance to all delivery boys
- Removes order from other delivery boys' lists

### 4. Rejection Flow
- Delivery boy rejects order via API call
- System marks assignment as "rejected"
- Immediately triggers reassignment to next available delivery boy
- Previous delivery boy cannot see the order again

### 5. Timeout Flow
- After 60 seconds, assignment automatically expires
- System marks assignment as "expired"
- Triggers reassignment to next available delivery boy
- Previous delivery boy loses access to the order

### 6. Reassignment Logic
- System skips delivery boys who previously rejected/expired the order
- Finds next nearest available delivery boy
- Continues until order is accepted or no delivery boys available

## API Endpoints

### Delivery Partner Endpoints

#### Accept Order
```
PATCH /api/delivery/orders/:orderId/accept
Body: { currentLat, currentLng }
Response: { success: true, order, route, estimatedEarnings }
```

#### Reject Order
```
PATCH /api/delivery/orders/:orderId/reject
Body: { reason }
Response: { success: true, message }
```

### Internal Service Endpoints

#### Assign Order to Delivery Boy
```javascript
orderAssignmentController.assignOrderToDelivery(orderId, restaurantLat, restaurantLng, restaurantId)
```

#### Accept Assignment
```javascript
orderAssignmentController.acceptOrderAssignment(orderId, deliveryPartnerId)
```

#### Reject Assignment
```javascript
orderAssignmentController.rejectOrderAssignment(orderId, deliveryPartnerId, reason)
```

## Socket.IO Events

### Client-to-Server Events

#### Join Delivery Room
```javascript
socket.emit('join-delivery', deliveryPartnerId)
```

### Server-to-Client Events

#### New Order Assignment
```javascript
socket.on('NEW_ORDER_ASSIGNMENT', (data) => {
  // data: {
  //   orderId, orderMongoId, restaurant, customer,
  //   items, pricing, estimatedDeliveryTime,
  //   assignedAt, expiresAt, countdownSeconds,
  //   distance, totalAmount, message
  // }
})
```

#### Assignment Countdown
```javascript
socket.on('ASSIGNMENT_COUNTDOWN', (data) => {
  // data: { orderId, remainingSeconds, isExpiring, message }
})
```

#### Assignment Cancelled
```javascript
socket.on('ORDER_ASSIGNMENT_CANCELLED', (data) => {
  // data: { orderId, reason, cancelledAt, message }
})
```

#### Order Accepted by Other
```javascript
socket.on('ORDER_ACCEPTED_BY_OTHER', (data) => {
  // data: { orderId, acceptedBy, acceptedAt, message }
})
```

## Frontend Implementation

### Real-Time Order Assignment Component
- Shows countdown timer with visual indicators
- Displays order details (restaurant, customer, items, pricing)
- Accept/Reject buttons with loading states
- Auto-hides when order expires or is accepted by others

### Socket.IO Hook
```javascript
const { currentAssignment, isConnected } = useRealTimeOrderAssignment(deliveryPartnerId)
```

## Race Condition Prevention

### Order Lock Service
- Provides atomic operations for order assignments
- Prevents multiple delivery boys from accepting the same order
- Automatic lock expiration and cleanup
- In-memory and database lock tracking

### Lock Usage Example
```javascript
const result = await orderLockService.withLock(orderId, deliveryPartnerId, async () => {
  // Critical section - only one delivery partner can execute this at a time
  return await acceptOrderInternal(orderId, deliveryPartnerId)
})
```

## Background Services

### Assignment Cleanup Service
- Runs every 30 seconds
- Cleans up expired assignments
- Triggers reassignments for expired orders
- Removes orphaned locks

### Assignment Trigger Service
- Monitors order status changes
- Triggers assignments for "preparing" and "ready" orders
- Periodic checker for missed assignments

## Testing

### Test Script
Run comprehensive tests:
```bash
node scripts/test-delivery-assignment-flow.js
```

### Test Coverage
- Basic assignment flow
- Order acceptance
- Order rejection and reassignment
- Assignment timeout handling
- Multiple reassignments
- Cleanup service functionality

## Configuration

### Environment Variables
```env
MONGODB_URI=mongodb://localhost:27017/tastizo
SOCKET_URL=http://localhost:5000
NODE_ENV=development
```

### Socket.IO Configuration
- CORS enabled for development origins
- Supports both polling and websocket transports
- 45-second connection timeout
- Automatic reconnection with exponential backoff

## Monitoring and Debugging

### Logs
- All assignment operations are logged with timestamps
- Socket.IO connections and events logged
- Error tracking with stack traces

### Statistics
- Assignment success/failure rates
- Average assignment time
- Reassignment frequency
- Delivery boy response times

## Deployment Considerations

### Scaling
- Socket.IO can be scaled with Redis adapter
- Database indexes optimized for assignment queries
- In-memory locks need to be considered for multi-instance deployments

### Performance
- Assignment queries use geospatial indexes
- Lock operations are optimized for speed
- Cleanup services run efficiently in background

### Reliability
- Automatic reconnection for Socket.IO
- Graceful handling of database connection issues
- Fallback mechanisms for assignment failures

## Troubleshooting

### Common Issues

#### Orders Not Getting Assigned
1. Check if delivery boys are online and available
2. Verify restaurant and customer coordinates are valid
3. Check assignment trigger service is running
4. Review assignment history for errors

#### Socket.IO Connection Issues
1. Verify CORS configuration
2. Check network connectivity
3. Review Socket.IO server logs
4. Ensure delivery partner ID is valid

#### Race Condition Issues
1. Check lock service logs
2. Verify database transactions are completing
3. Review concurrent assignment attempts
4. Monitor lock expiration and cleanup

### Debug Commands
```javascript
// Check active locks
orderLockService.getLockStatistics()

// Check assignment history
OrderAssignmentHistory.getOrderAssignmentHistory(orderId)

// Force cleanup expired assignments
assignmentCleanupService.cleanupExpiredAssignments()
```

## Future Enhancements

### Potential Improvements
1. **Machine Learning Assignment**: Predict optimal delivery boy based on historical performance
2. **Batch Assignment**: Assign multiple orders to delivery boys efficiently
3. **Priority Assignment**: VIP customers or high-value orders get priority
4. **Dynamic Timeouts**: Adjust timeout based on distance or order complexity
5. **Mobile App Integration**: Push notifications for better delivery partner engagement

### Analytics Dashboard
- Real-time assignment metrics
- Delivery boy performance tracking
- Order fulfillment analytics
- System health monitoring

## Security Considerations

### Authentication
- All API endpoints require delivery partner authentication
- Socket.IO connections validated with delivery partner ID
- Order access permissions enforced

### Data Protection
- Customer location data encrypted
- Assignment history auditable
- Rate limiting on assignment endpoints

## Conclusion

This real-time delivery order assignment system provides a robust, scalable solution for managing delivery partner assignments with comprehensive error handling, race-condition prevention, and automatic reassignment capabilities. The system is designed to handle high-volume operations while maintaining data consistency and providing excellent user experience for both customers and delivery partners.
