import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('Auth API', () => {
  describe('POST /api/v1/food/auth/user/request-otp', () => {
    it('should fail if phone number is missing', async () => {
      const res = await request(app)
        .post('/api/v1/food/auth/user/request-otp')
        .send({ role: 'user' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail if role is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/food/auth/user/request-otp')
        .send({ phone: '9999999999', role: 'invalid_role' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
