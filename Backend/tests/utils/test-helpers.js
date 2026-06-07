import { signAccessToken } from '../../src/core/auth/token.util.js';
import mongoose from 'mongoose';

export const generateMockToken = (role, userId) => {
  const payload = {
    userId: userId || new mongoose.Types.ObjectId().toString(),
    role: role
  };
  return signAccessToken(payload);
};

export const createMockUserToken = (userId) => generateMockToken('user', userId);
export const createMockAdminToken = (userId) => generateMockToken('admin', userId);
export const createMockRestaurantToken = (userId) => generateMockToken('restaurant_owner', userId);
export const createMockDeliveryToken = (userId) => generateMockToken('delivery_partner', userId);
