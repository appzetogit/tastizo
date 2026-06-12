import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';

describe('Restaurant API', () => {
  let restaurantId;

  beforeAll(async () => {
    // Create a mock zone
    const mockZone = await FoodZone.create({
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
    const restaurant = await FoodRestaurant.create({
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

  describe('GET /api/v1/food/restaurant/restaurants', () => {
    it('should fetch nearby restaurants successfully', async () => {
      const res = await request(app)
        .get('/api/v1/food/restaurant/restaurants')
        .query({ lat: 22.75, lng: 75.85 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.restaurants)).toBe(true);
      expect(res.body.data.restaurants.length).toBeGreaterThan(0);
      expect(res.body.data.restaurants[0].restaurantName).toBe('Test Automation Cafe');
    });

    it('should return empty list if coordinates are out of zone', async () => {
      const res = await request(app)
        .get('/api/v1/food/restaurant/restaurants')
        .query({ lat: 10.0, lng: 10.0 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.restaurants)).toBe(true);
      expect(res.body.data.restaurants.length).toBe(0);
    });
  });
});
