import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

import { upsertFirebaseDeviceToken } from './src/core/notifications/firebase.service.js';
import { FoodDeliveryPartner } from './src/modules/food/delivery/models/deliveryPartner.model.js';

async function run() {
  const url = process.env.MONGODB_URI;
  await mongoose.connect(url);
  
  try {
    const ownerId = '6a1422f96bcb7e3137952240'; // Arun's ID
    const testToken = 'fP_rPwf4SdCnXrYF7XA9T4_TEST_OVERWRITE_TOKEN';
    
    console.log('Upserting test token...');
    await upsertFirebaseDeviceToken({
      ownerType: 'DELIVERY_PARTNER',
      ownerId,
      token: testToken,
      platform: 'mobile'
    });
    
    // Read the partner back
    const partner = await FoodDeliveryPartner.findById(ownerId).select('fcmTokenMobile');
    console.log('Updated fcmTokenMobile count:', partner.fcmTokenMobile.length);
    console.log('Tokens list:', partner.fcmTokenMobile);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
