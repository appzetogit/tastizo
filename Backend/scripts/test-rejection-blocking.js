/**
 * Test script to verify that rejected orders are completely blocked for delivery boys
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';
config();

// Import models and services
import Order from '../modules/order/models/Order.js';
import Delivery from '../modules/delivery/models/Delivery.js';
import OrderAssignmentHistory from '../modules/order/models/OrderAssignmentHistory.js';
import orderAssignmentController from '../modules/order/services/orderAssignmentController.js';

const TEST_CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/tastizo-test',
  TEST_RESTAURANT: {
    name: 'Test Restaurant for Rejection',
    location: {
      type: 'Point',
      coordinates: [76.1209, 28.2849] // [lng, lat]
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
        coordinates: [76.1309, 28.2949] // [lng, lat]
      }
    }
  },
  TEST_DELIVERY_BOYS: [
    {
      name: 'Test Delivery Boy 1',
      phone: '+911111111111',
      location: {
        type: 'Point',
        coordinates: [76.1259, 28.2879] // [lng, lat]
      }
    },
    {
      name: 'Test Delivery Boy 2',
      phone: '+912222222222',
      location: {
        type: 'Point',
        coordinates: [76.1159, 28.2819] // [lng, lat]
      }
    }
  ]
};

class RejectionBlockingTest {
  constructor() {
    this.testResults = [];
    this.testDeliveryBoys = [];
    this.testOrder = null;
  }

  async setup() {
    console.log('Setting up rejection blocking test...');
    
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
      await Order.deleteMany({ orderId: { $regex: /^TEST-REJ-/ } });
      
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

  async createTestOrder() {
    console.log('Creating test order...');
    
    const order = new Order({
      orderId: `TEST-REJ-${Date.now()}`,
      userId: new mongoose.Types.ObjectId(),
      restaurantId: this.testRestaurant._id,
      restaurantName: this.testRestaurant.name,
      status: 'preparing',
      items: [
        {
          itemId: 'item1',
          name: 'Test Item',
          price: 100,
          quantity: 1,
          isVeg: true
        }
      ],
      address: TEST_CONFIG.TEST_CUSTOMER.address,
      phoneNumber: TEST_CONFIG.TEST_CUSTOMER.phone,
      contactName: TEST_CONFIG.TEST_CUSTOMER.name,
      pricing: {
        subtotal: 100,
        deliveryFee: 20,
        platformFee: 5,
        tax: 10,
        total: 135
      },
      payment: {
        method: 'cash',
        status: 'pending'
      },
      estimatedDeliveryTime: 30
    });

    await order.save();
    this.testOrder = order;
    console.log(`Created order: ${order.orderId} (${order._id})`);
    
    return order;
  }

  async testRejectionBlocking() {
    console.log('\n=== Testing Rejection Blocking ===');
    
    try {
      // Create a test order
      const order = await this.createTestOrder();
      
      // Assign to first delivery boy
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
      console.log(`Order assigned to delivery boy: ${firstDeliveryBoyId}`);

      // Reject the order
      const rejectResult = await orderAssignmentController.rejectOrderAssignment(
        order._id.toString(),
        firstDeliveryBoyId,
        'rejected_by_delivery'
      );

      if (!rejectResult?.success) {
        throw new Error('Rejection failed');
      }

      console.log('Order rejected successfully');

      // Wait a moment for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Try to assign the order again - should NOT assign to the same delivery boy
      const reassignResult = await orderAssignmentController.assignOrderToDelivery(
        order._id.toString(),
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
        this.testRestaurant._id.toString()
      );

      if (reassignResult?.success) {
        const newDeliveryBoyId = reassignResult.deliveryPartnerId;
        
        // CRITICAL: Verify it's not the same delivery boy
        if (newDeliveryBoyId === firstDeliveryBoyId) {
          console.log('REJECTION BLOCKING TEST FAILED');
          console.log('Order was reassigned to the same delivery boy who rejected it!');
          this.testResults.push({ test: 'Rejection Blocking', status: 'FAILED', error: 'Order reassigned to same delivery boy' });
          return false;
        } else {
          console.log('REJECTION BLOCKING TEST PASSED');
          console.log(`Order reassigned to different delivery boy: ${newDeliveryBoyId}`);
          this.testResults.push({ test: 'Rejection Blocking', status: 'PASSED', newDeliveryBoyId });
          return true;
        }
      } else {
        console.log('REJECTION BLOCKING TEST PASSED');
        console.log('No reassignment available (which is valid)');
        this.testResults.push({ test: 'Rejection Blocking', status: 'PASSED', result: 'No reassignment available' });
        return true;
      }
    } catch (error) {
      console.error('Rejection blocking test FAILED:', error);
      this.testResults.push({ test: 'Rejection Blocking', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testMultipleRejections() {
    console.log('\n=== Testing Multiple Rejections ===');
    
    try {
      // Create a test order
      const order = await this.createTestOrder();
      
      let rejectedDeliveryBoys = [];

      // Try to assign and reject with both delivery boys
      for (let i = 0; i < this.testDeliveryBoys.length; i++) {
        const deliveryBoy = this.testDeliveryBoys[i];
        
        const assignmentResult = await orderAssignmentController.assignOrderToDelivery(
          order._id.toString(),
          TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
          TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
          this.testRestaurant._id.toString()
        );

        if (!assignmentResult?.success) {
          console.log(`No assignment available for delivery boy ${i + 1}`);
          break;
        }

        const assignedDeliveryBoyId = assignmentResult.deliveryPartnerId;
        console.log(`Assignment ${i + 1}: ${assignedDeliveryBoyId}`);

        // Reject the order
        await orderAssignmentController.rejectOrderAssignment(
          order._id.toString(),
          assignedDeliveryBoyId,
          'rejected_by_delivery'
        );

        rejectedDeliveryBoys.push(assignedDeliveryBoyId);
        
        // Wait a moment for processing
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Try one more assignment - should fail since all delivery boys rejected
      const finalAssignmentResult = await orderAssignmentController.assignOrderToDelivery(
        order._id.toString(),
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
        TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
        this.testRestaurant._id.toString()
      );

      if (!finalAssignmentResult?.success) {
        console.log('MULTIPLE REJECTIONS TEST PASSED');
        console.log('No delivery boys available after all rejections');
        console.log(`Rejected delivery boys: ${rejectedDeliveryBoys.join(', ')}`);
        this.testResults.push({ test: 'Multiple Rejections', status: 'PASSED', rejectedCount: rejectedDeliveryBoys.length });
        return true;
      } else {
        console.log('MULTIPLE REJECTIONS TEST FAILED');
        console.log('Order was assigned despite all delivery boys rejecting it');
        this.testResults.push({ test: 'Multiple Rejections', status: 'FAILED', error: 'Assignment succeeded after all rejections' });
        return false;
      }
    } catch (error) {
      console.error('Multiple rejections test FAILED:', error);
      this.testResults.push({ test: 'Multiple Rejections', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async testAssignmentHistoryTracking() {
    console.log('\n=== Testing Assignment History Tracking ===');
    
    try {
      // Create a test order
      const order = await this.createTestOrder();
      
      // Assign and reject multiple times
      const assignmentHistory = [];
      
      for (let i = 0; i < 3; i++) {
        const assignmentResult = await orderAssignmentController.assignOrderToDelivery(
          order._id.toString(),
          TEST_CONFIG.TEST_RESTAURANT.location.coordinates[1],
          TEST_CONFIG.TEST_RESTAURANT.location.coordinates[0],
          this.testRestaurant._id.toString()
        );

        if (!assignmentResult?.success) {
          console.log(`Assignment ${i + 1} failed`);
          break;
        }

        const assignedDeliveryBoyId = assignmentResult.deliveryPartnerId;
        
        // Reject the order
        await orderAssignmentController.rejectOrderAssignment(
          order._id.toString(),
          assignedDeliveryBoyId,
          'rejected_by_delivery'
        );

        assignmentHistory.push({
          deliveryBoyId: assignedDeliveryBoyId,
          status: 'rejected'
        });
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Check assignment history
      const history = await OrderAssignmentHistory.getOrderAssignmentHistory(order._id.toString());
      
      const rejectedCount = history.filter(h => h.assignmentStatus === 'rejected').length;
      const expectedRejectedCount = assignmentHistory.length;

      if (rejectedCount === expectedRejectedCount) {
        console.log('ASSIGNMENT HISTORY TRACKING TEST PASSED');
        console.log(`Found ${rejectedCount} rejected assignments as expected`);
        this.testResults.push({ test: 'Assignment History Tracking', status: 'PASSED', rejectedCount });
        return true;
      } else {
        console.log('ASSIGNMENT HISTORY TRACKING TEST FAILED');
        console.log(`Expected ${expectedRejectedCount} rejected assignments, found ${rejectedCount}`);
        this.testResults.push({ test: 'Assignment History Tracking', status: 'FAILED', error: `Expected ${expectedRejectedCount}, found ${rejectedCount}` });
        return false;
      }
    } catch (error) {
      console.error('Assignment history tracking test FAILED:', error);
      this.testResults.push({ test: 'Assignment History Tracking', status: 'FAILED', error: error.message });
      return false;
    }
  }

  async runAllTests() {
    console.log('Starting Rejection Blocking Test Suite...\n');
    
    try {
      await this.setup();
      
      // Run all tests
      const tests = [
        () => this.testRejectionBlocking(),
        () => this.testMultipleRejections(),
        () => this.testAssignmentHistoryTracking()
      ];

      for (const test of tests) {
        await test();
        await new Promise(resolve => setTimeout(resolve, 500));
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
  const testSuite = new RejectionBlockingTest();
  testSuite.runAllTests().catch(console.error);
}

export default RejectionBlockingTest;
