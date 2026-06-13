import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

import { FoodDeliveryPartner } from './src/modules/food/delivery/models/deliveryPartner.model.js';

async function run() {
  const url = process.env.MONGODB_URI;
  await mongoose.connect(url);
  
  try {
    const partner = await FoodDeliveryPartner.findById('69ede66f5a71d40fb051cb2d');
    console.log('Partner Document:', JSON.stringify({
      id: partner._id,
      fullName: partner.fullName,
      fcmTokens: partner.fcmTokens,
      fcmTokenMobile: partner.fcmTokenMobile
    }, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
