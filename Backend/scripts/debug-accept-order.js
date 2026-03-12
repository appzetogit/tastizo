/**
 * Quick Debug Script for Accept Order Issue
 * 
 * This script tests the accept order endpoint directly to see the exact error
 * 
 * Usage:
 * node scripts/debug-accept-order.js <orderId> <deliveryToken> <lat> <lng>
 * 
 * Example:
 * node scripts/debug-accept-order.js 697dcab27d7c272426973030 "your_token" 22.728051 75.884523
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Get arguments
const args = process.argv.slice(2);
const orderId = args[0];
const deliveryToken = args[1] || process.env.DELIVERY_TOKEN;
const lat = parseFloat(args[2]) || 22.728051;
const lng = parseFloat(args[3]) || 75.884523;

if (!orderId) {
  console.error('❌ Order ID is required');
  process.exit(1);
}

if (!deliveryToken) {
  console.error('❌ Delivery token is required');
  process.exit(1);
}
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${deliveryToken}`
  }
});

async function testAcceptOrder() {
  try {
    const response = await api.patch(`/api/delivery/orders/${orderId}/accept`, {
      currentLat: lat,
      currentLng: lng
    });
  } catch (error) {
    if (error.response) {
      // Server responded with error
      if (error.response.data?.message) {
      }
      
      if (error.response.data?.error) {
      }
    } else if (error.request) {
      // Request was made but no response
    } else {
      // Error in request setup
    }
  }
}

testAcceptOrder();
