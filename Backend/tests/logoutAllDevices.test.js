import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodRefreshToken } from '../src/core/refreshTokens/refreshToken.model.js';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';

describe('Restaurant Logout From All Devices API', () => {
  let restaurant;
  let zone;
  const testPhone = '8299727770'; // Defined as default OTP phone in otp.service.js

  beforeAll(async () => {
    // 1. Create a zone
    zone = await FoodZone.create({
      name: 'Logout Test Zone',
      zoneName: 'Logout Test Zone',
      country: 'India',
      isActive: true,
      coordinates: [
        { latitude: 20.0, longitude: 70.0 },
        { latitude: 20.0, longitude: 71.0 },
        { latitude: 21.0, longitude: 71.0 },
        { latitude: 21.0, longitude: 70.0 }
      ]
    });

    // 2. Create an approved restaurant using default OTP phone
    restaurant = await FoodRestaurant.create({
      restaurantName: 'Session Test Cafe',
      ownerName: 'Session Owner',
      ownerPhone: testPhone,
      status: 'approved',
      isAdminApproved: true,
      isAcceptingOrders: true,
      zoneId: zone._id,
      location: {
        type: 'Point',
        coordinates: [70.5, 20.5]
      }
    });
  });

  afterAll(async () => {
    // Clean up
    if (restaurant) {
      await FoodRestaurant.deleteOne({ _id: restaurant._id });
    }
    if (zone) {
      await FoodZone.deleteOne({ _id: zone._id });
    }
    await FoodRefreshToken.deleteMany({ userId: restaurant?._id });
  });

  it('should invalidate Device A session when Device B logs in, and support logout from all devices', async () => {
    // ---- 1. Login on Device A ----
    const loginARes = await request(app)
      .post('/api/v1/food/auth/restaurant/verify-otp')
      .send({ phone: testPhone, otp: '1234' });

    expect(loginARes.status).toBe(200);
    expect(loginARes.body.success).toBe(true);
    const tokenA = loginARes.body.data.accessToken;
    expect(tokenA).toBeDefined();

    // Verify Device A can access profile
    const profileARes = await request(app)
      .get('/api/v1/food/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(profileARes.status).toBe(200);

    // ---- 2. Login on Device B ----
    const loginBRes = await request(app)
      .post('/api/v1/food/auth/restaurant/verify-otp')
      .send({ phone: testPhone, otp: '1234' });

    expect(loginBRes.status).toBe(200);
    expect(loginBRes.body.success).toBe(true);
    const tokenB = loginBRes.body.data.accessToken;
    expect(tokenB).toBeDefined();

    // ---- 3. Device A should now be rejected (Single session enforcement) ----
    const profileARejectedRes = await request(app)
      .get('/api/v1/food/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(profileARejectedRes.status).toBe(401);
    expect(profileARejectedRes.body.message).toContain('Session expired. Logged in from another device.');

    // ---- 4. Device B can access profile ----
    const profileBRes = await request(app)
      .get('/api/v1/food/auth/me')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(profileBRes.status).toBe(200);

    // ---- 5. Device B logs out from all devices ----
    const logoutAllRes = await request(app)
      .post('/api/v1/food/auth/logout-all-devices')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({});
    expect(logoutAllRes.status).toBe(200);
    expect(logoutAllRes.body.success).toBe(true);

    // ---- 6. Device B should now be rejected as well ----
    const profileBRejectedRes = await request(app)
      .get('/api/v1/food/auth/me')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(profileBRejectedRes.status).toBe(401);
  });
});
