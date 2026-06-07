import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import mongoose from 'mongoose';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { createMockUserToken } from './utils/test-helpers.js';

describe('Orders API', () => {
  let userToken;
  let restaurantId;
  let restaurantPublicId;
  let mockZone;

  beforeAll(async () => {
    userToken = createMockUserToken();

    // Create a mock zone
    mockZone = await FoodZone.create({
      name: 'Test Zone',
      zoneName: 'Test Zone',
      country: 'India',
      isActive: true,
      coordinates: [
        { latitude: 22.7, longitude: 75.8 },
        { latitude: 22.7, longitude: 75.9 },
        { latitude: 22.8, longitude: 75.9 },
        { latitude: 22.8, longitude: 75.8 }
      ]
    });

    // Create a mock restaurant
    restaurantPublicId = 'TASTIZO-TEST-123';
    const restaurant = await FoodRestaurant.create({
      restaurantId: restaurantPublicId,
      restaurantName: 'Test Automation Cafe',
      ownerName: 'Test Owner',
      ownerPhone: '9876543210',
      status: 'approved',
      isAdminApproved: true,
      isAcceptingOrders: true,
      zoneId: mockZone._id,
      location: {
        type: 'Point',
        coordinates: [75.85, 22.75]
      }
    });
    restaurantId = restaurant._id.toString();
  });

  describe('POST /api/v1/food/orders/calculate', () => {
    it('should return 400 if items are missing', async () => {
      const res = await request(app)
        .post('/api/v1/food/orders/calculate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          restaurantId: restaurantId,
          deliveryAddress: {
            location: {
              type: 'Point',
              coordinates: [75.86, 22.76]
            }
          }
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should calculate pricing successfully with valid items and object ID', async () => {
      const res = await request(app)
        .post('/api/v1/food/orders/calculate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          restaurantId: restaurantId,
          items: [
            {
              itemId: 'test-item-1',
              name: 'Test Pizza',
              price: 200,
              quantity: 2
            }
          ],
          deliveryAddress: {
            location: {
              type: 'Point',
              coordinates: [75.86, 22.76]
            }
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pricing).toBeDefined();
      expect(res.body.data.pricing.subtotal).toBe(400);
    });

  });
});
