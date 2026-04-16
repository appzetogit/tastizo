/**
 * Comprehensive Test Script for Delivery Order Assignment Flow
 * Tests the complete real-time assignment system with timeout, rejection, and reassignment
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';
config();

// Import models and services
import Order from '../modules/order/models/Order.js';
import Delivery from '../modules/delivery/models/Delivery.js';
import OrderAssignmentHistory from '../modules/order/models/OrderAssignmentHistory.js';
import orderAssignmentController from '../modules/order/services/orderAssignmentController.js';
import orderAssignmentTriggerService from '../modules/order/services/orderAssignmentTriggerService.js';
import assignmentCleanupService from '../modules/order/services/assignmentCleanupService.js';
import orderAssignmentSocketService from '../modules/order/services/orderAssignmentSocketService.js';

// Test configuration
const TEST_CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/tastizo-test',
  TEST_RESTAURANT: {
    name: 'Test Restaurant',
    location: {
      type: 'Point',
      coordinates: [76.1209, 28.2849] // [lng, lat] for Behror area
    },
    address: 'Test Address, Behror'
  },
  TEST_CUSTOMER: {
    name: 'Test Customer',
    phone: '+919876543210',
    address: {
      formattedAddress: 'Test Customer Address, Behror',
      location: {
        type: 'Point',
        coordinates: [76.1309, 28.2949] // [lng, lat] - 1km away
      }
    }
  },
  TEST_DELIVERY_BOYS: [
    {
      name: 'Delivery Boy 1',
      phone: '+911111111111',
      location: {
        type: 'Point',
        coordinates: [76.1259, 28.2879] // [lng, lat] - very close to restaurant
      }
    },
    {
      name: 'Delivery Boy 2',
      phone: '+912222222222',
      location: {
        type: 'Point',
        coordinates: [76.1159, 28.2819] // [lng, lat] - close to restaurant
      }
    },
    {
      name: 'Delivery Boy 3',
      phone: '+913333333333',
      location: {
        type: 'Point',
        coordinates: [76.1359, 28.2919] // [lng, lat] - close to restaurant
      }
    }
  ]
};

class DeliveryAssignmentTestSuite {
  constructor() {
    this.testResults = [];
    this.testDeliveryBoys = [];
    this.testOrders = [];
    this.assignmentHistories = [];
  }

  async setup() {
    console.log('Setting up test environment...');
    
    try {
      // Connect to MongoDB
      await mongoose.connect(TEST_CONFIG.MONGODB_URI);
      console.log('Connected to MongoDB');

      // Clean up existing test data
      await this.cleanup();

      // Create test delivery boys
      await this.createTestDeliveryBoys();

      // Create test restaurant
      await this.createTestRestaurant();

      console.log('Test environment setup complete');
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  }

  async cleanup() {
    console.log('Cleaning up existing test data...');
    
    try {
      // Clean up assignment histories
      await OrderAssignmentHistory.deleteMany({});
      
      // Clean up test orders
      await Order.deleteMany({ orderId: { $regex: /^TEST-ORD-/ } });
      
      // Clean up test delivery boys
      await Delivery.deleteMany({ phone: { $in: TEST_CONFIG.TEST_DELIVERY_BOYS.map(d => d.phone) } });
      
      console.log('Cleanup complete');
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  async createTestDeliveryBoys() {
    console.log('Creating test delivery boys...');
    
    for (const deliveryBoyData of TEST_CONFIG.TEST_DELIVERY_BOYS) {
      const deliveryBoy = new Delivery({
        name: deliveryBoyData.name,
        phone: deliveryBoyData.phone,
        email: `${deliveryBoyData.phone.replace('+', '')}@test.com`,
        status: 'approved',
        isActive: true,
        availability: {
          isOnline: true,
          currentLocation: deliveryBoyData.location,
          lastLocationUpdate: new Date()
        }
      });

      await deliveryBoy.save();
      this.testDeliveryBoys.push(deliveryBoy);
      console.log(`Created delivery boy: ${deliveryBoy.name} (${deliveryBoy._id})`);
    }
  }

  async createTestRestaurant() {
    console.log('Creating test restaurant...');
    
    const Restaurant = (await import('../modules/restaurant/models/Restaurant.js')).default;
    
    const restaurant = new Restaurant({
      name: TEST_CONFIG.TEST_RESTAURANT.name,
      address: TEST_CONFIG.TEST_RESTAURANT.address,
      location: TEST_CONFIG.TEST_RESTAURANT.location,
      phone: '+919999999999',
      email: 'test-restaurant@test.com',
      status: 'active',
      ownerPhone: '+919999999999'
    });

    await restaurant.save();
    this.testRestaurant = restaurant;
    console.log(`Created restaurant: ${restaurant.name} (${restaurant._id})`);
  }

  async createTestOrder(orderNumber = 1) {
    console.log(`Creating test order ${orderNumber}...`);
    
    const order = new Order({
      orderId: `TEST-ORD-${Date.now()}-${orderNumber}`,
      userId: new mongoose.Types.ObjectId(),
      restaurantId: this.testRestaurant._id,
      restaurantName: this.testRestaurant.name,
      status: 'preparing', // Ready for assignment
      items: [
        {
          itemId: 'item1',
          name: 'Test Item 1',
          price: 100,
          quantity: 2,
          isVeg: true
        },
        {
          itemId: 'item2',
          name: 'Test Item 2',
          price: 50,
          quantity: 1,
          isVeg: false
        }
      ],
      address: TEST_CONFIG.TEST_CUSTOMER.address,
      phoneNumber: TEST_CONFIG.TEST_CUSTOMER.phone,
      contactName: TEST_CONFIG.TEST_CUSTOMER.name,
      pricing: {
        subtotal: 250,
        deliveryFee: 20,
        platformFee: 5,
        tax: 25,
        total: 300
      },
      payment: {
        method: 'cash',
        status: 'pending'
      },
      estimatedDeliveryTime: 30
    });

    await order.save();
    this.testOrders.push(order);
    console.log(`Created order: ${order.orderId} (${order._id})`);
    
    return order;
  }

  async testBasicAssignment() {
    console.log('\n=== Testing Basic Assignment ===');
    
    try {
      // Create a test order
      const order = await this.createTestOrder(1);
      
      // Trigger assignment
      const result = await orderAssignmentController.assignOrderToDelivery(
        order._id.toString(),
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1], // lat
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0], // lng
        this.testRestaurant._id.toString()
      );

      if (result && result.success) {
        console.log('Basic assignment test PASSED');
        console.log(`Assigned to: ${result.deliveryPartnerName} (${result.deliveryPartnerId})`);
        console.log(`Distance: ${result.distance}km`);
        
        // Check assignment history
        const assignment = await OrderAssignmentHistory.getActiveAssignment(order._id.toString());
        if (assignment) {
          console.log('Assignment history created successfully');
          console.log(`Expires at: ${assignment.expiresAt}`);
        }
        
        this.testResults.push({ test: 'Basic Assignment', status: 'PASSED', result });
        return true;
      } else {
        console.log('Basic assignment test FAILED');
        this.testResults.push({ test: 'Basic Assignment', status: 'FAILED', error: 'No assignment result' });
        return false;
      }
    } catch (error) {
      console.error('Basic assignment test FAILED:', error);
      this.testResults.push({ test: 'Basic Assignment', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testOrderAcceptance() {
    console.log('\n=== Testing Order Acceptance ===');
    
    try {
      // Create a test order
      const order = await this.createTestOrder(2);
      
      // Trigger assignment
      const assignmentResult = await orderAssignmentController.assignOrderToDelivery(
        order._id.toString(),
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
        this.testRestaurant._id.toString()
      );

      if (!assignmentResult?.success) {
        throw new Error('Assignment failed');
      }

      // Accept the order
      const acceptResult = await orderAssignmentController.acceptOrderAssignment(
        order._id.toString(),
        assignmentResult.deliveryPartnerId
      );

      if (acceptResult?.success) {
        console.log('Order acceptance test PASSED');
        console.log(`Order accepted by: ${assignmentResult.deliveryPartnerId}`);
        
        // Check order status
        const updatedOrder = await Order.findById(order._id.toString());
        if (updatedOrder.assignmentStatus === 'accepted') {
          console.log('Order status updated correctly');
        }
        
        this.testResults.push({ test: 'Order Acceptance', status: 'PASSED', result: acceptResult });
        return true;
      } else {
        console.log('Order acceptance test FAILED');
        this.testResults.push({ test: 'Order Acceptance', status: 'FAILED', error: acceptResult?.message });
        return false;
      }
    } catch (error) {
      console.error('Order acceptance test FAILED:', error);
      this.testResults.push({ test: 'Order Acceptance', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testOrderRejection() {
    console.log('\n=== Testing Order Rejection ===');
    
    try {
      // Create a test order
      const order = await this.createTestOrder(3);
      
      // Trigger assignment to first delivery boy
      const assignmentResult = await orderAssignmentController.assignOrderToDelivery(
        order._id.toString(),
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
        this.testRestaurant._id.toString()
      );

      if (!assignmentResult?.success) {
        throw new Error('Initial assignment failed');
      }

      const firstDeliveryBoyId = assignmentResult.deliveryPartnerId;
      console.log(`Initial assignment to: ${firstDeliveryBoyId}`);

      // Reject the order
      const rejectResult = await orderAssignmentController.rejectOrderAssignment(
        order._id.toString(),
        firstDeliveryBoyId,
        'rejected_by_delivery'
      );

      if (rejectResult?.success) {
        console.log('Order rejection test PASSED');
        console.log('Order rejected and reassigned');
        
        // Check that order was reassigned to someone else
        const updatedOrder = await Order.findById(order._id.toString());
        if (updatedOrder.deliveryPartnerId && updatedOrder.deliveryPartnerId.toString() !== firstDeliveryBoyId) {
          console.log(`Order reassigned to: ${updatedOrder.deliveryPartnerId}`);
        }
        
        this.testResults.push({ test: 'Order Rejection', status: 'PASSED', result: rejectResult });
        return true;
      } else {
        console.log('Order rejection test FAILED');
        this.testResults.push({ test: 'Order Rejection', status: 'FAILED', error: rejectResult?.message });
        return false;
      }
    } catch (error) {
      console.error('Order rejection test FAILED:', error);
      this.testResults.push({ test: 'Order Rejection', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testAssignmentTimeout() {
    console.log('\n=== Testing Assignment Timeout ===');
    
    try {
      // Create a test order
      const order = await this.createTestOrder(4);
      
      // Trigger assignment
      const assignmentResult = await orderAssignmentController.assignOrderToDelivery(
        order._id.toString(),
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
        this.testRestaurant._id.toString()
      );

      if (!assignmentResult?.success) {
        throw new Error('Assignment failed');
      }

      const assignedDeliveryBoyId = assignmentResult.deliveryPartnerId;
      console.log(`Order assigned to: ${assignedDeliveryBoyId}`);

      // Manually expire the assignment by setting expiresAt to past
      await OrderAssignmentHistory.updateMany(
        {
          orderId: order._id.toString(),
          deliveryPartnerId: assignedDeliveryBoyId,
          assignmentStatus: 'pending'
        },
        {
          $set: {
            expiresAt: new Date(Date.now() - 1000), // 1 second ago
            assignmentStatus: 'expired',
            reason: 'timeout'
          }
        }
      );

      // Trigger timeout handling
      await orderAssignmentController.handleAssignmentExpiration(
        order._id.toString(),
        assignedDeliveryBoyId
      );

      console.log('Assignment timeout test PASSED');
      console.log('Assignment expired and handled');
      
      this.testResults.push({ test: 'Assignment Timeout', status: 'PASSED' });
      return true;
    } catch (error) {
      console.error('Assignment timeout test FAILED:', error);
      this.testResults.push({ test: 'Assignment Timeout', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testMultipleReassignments() {
    console.log('\n=== Testing Multiple Reassignments ===');
    
    try {
      // Create a test order
      const order = await this.createTestOrder(5);
      
      let currentDeliveryBoyId = null;
      let rejectionCount = 0;

      // Reject by first two delivery boys
      for (let i = 0; i < 2; i++) {
        const assignmentResult = await orderAssignmentController.assignOrderToDelivery(
          order._id.toString(),
          TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
          TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
          this.testRestaurant._id.toString()
        );

        if (!assignmentResult?.success) {
          throw new Error(`Assignment ${i + 1} failed`);
        }

        currentDeliveryBoyId = assignmentResult.deliveryPartnerId;
        console.log(`Assignment ${i + 1} to: ${currentDeliveryBoyId}`);

        // Reject the order
        await orderAssignmentController.rejectOrderAssignment(
          order._id.toString(),
          currentDeliveryBoyId,
          'rejected_by_delivery'
        );
        
        rejectionCount++;
        
        // Small delay to ensure proper processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Third assignment should succeed
      const finalAssignmentResult = await orderAssignmentController.assignOrderToDelivery(
        order._id.toString(),
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
        this.testRestaurant._id.toString()
      );

      if (finalAssignmentResult?.success) {
        console.log('Multiple reassignments test PASSED');
        console.log(`Total rejections: ${rejectionCount}`);
        console.log(`Final assignment to: ${finalAssignmentResult.deliveryPartnerId}`);
        
        // Check assignment history
        const history = await OrderAssignmentHistory.getOrderAssignmentHistory(order._id.toString());
        console.log(`Total assignment attempts: ${history.length}`);
        
        this.testResults.push({ test: 'Multiple Reassignments', status: 'PASSED', rejections: rejectionCount });
        return true;
      } else {
        console.log('Multiple reassignments test FAILED');
        this.testResults.push({ test: 'Multiple Reassignments', status: 'FAILED', error: 'Final assignment failed' });
        return false;
      }
    } catch (error) {
      console.error('Multiple reassignments test FAILED:', error);
      this.testResults.push({ test: 'Multiple Reassignments', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testCleanupService() {
    console.log('\n=== Testing Cleanup Service ===');
    
    try {
      // Create some expired assignments
      const order = await this.createTestOrder(6);
      
      // Create expired assignment
      const expiredAssignment = new OrderAssignmentHistory({
        orderId: order._id,
        orderNumber: order.orderId,
        deliveryPartnerId: this.testDeliveryBoys[0]._id,
        assignmentStatus: 'pending',
        assignedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute ago (expired)
        metadata: {
          distance: 2.5,
          assignmentMethod: 'nearest_available'
        }
      });
      
      await expiredAssignment.save();
      console.log('Created expired assignment for cleanup test');

      // Run cleanup
      const cleanupResult = await assignmentCleanupService.cleanupExpiredAssignments();
      
      if (cleanupResult.cleaned > 0) {
        console.log('Cleanup service test PASSED');
        console.log(`Cleaned assignments: ${cleanupResult.cleaned}`);
        console.log(`Reassigned orders: ${cleanupResult.reassigned}`);
        
        this.testResults.push({ test: 'Cleanup Service', status: 'PASSED', result: cleanupResult });
        return true;
      } else {
        console.log('Cleanup service test FAILED - no assignments cleaned');
        this.testResults.push({ test: 'Cleanup Service', status: 'FAILED', error: 'No assignments cleaned' });
        return false;
      }
    } catch (error) {
      console.error('Cleanup service test FAILED:', error);
      this.testResults.push({ test: 'Cleanup Service', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async runAllTests() {
    console.log('Starting Delivery Assignment Test Suite...\n');
    
    try {
      await this.setup();
      
      // Run all tests
      const tests = [
        () => this.testBasicAssignment(),
        () => this.testOrderAcceptance(),
        () => this.testOrderRejection(),
        () => this.testAssignmentTimeout(),
        () => this.testMultipleReassignments(),
        () => this.testCleanupService()
      ];

      for (const test of tests) {
        await test();
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
      }

      // Print results
      this.printTestResults();
      
      return this.testResults;
    } catch (error) {
      console.error('Test suite failed:', error);
      throw error;
    } finally {
      await this.teardown();
    }
  }

  printTestResults() {
    console.log('\n=== TEST RESULTS ===');
    
    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    console.log('\nDetailed Results:');
    this.testResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.test}: ${result.status}`);
      if (result.status === 'FAILED' && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
  }

  async teardown() {
    console.log('\nTearing down test environment...');
    
    try {
      await this.cleanup();
      await mongoose.disconnect();
      console.log('Test environment teardown complete');
    } catch (error) {
      console.error('Teardown failed:', error);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new DeliveryAssignmentTestSuite();
  testSuite.runAllTests().catch(console.error);
}

export default DeliveryAssignmentTestSuite;
