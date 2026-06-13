import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

import { FoodDeliveryPartner } from './src/modules/food/delivery/models/deliveryPartner.model.js';

async function run() {
  const url = process.env.MONGODB_URI;
  await mongoose.connect(url);
  
  try {
    const partners = await FoodDeliveryPartner.find({}).select('fullName fcmTokens fcmTokenMobile updatedAt');
    console.log('All Partners count:', partners.length);
    partners.forEach(partner => {
      console.log(`- ${partner.fullName} (${partner._id}):`);
      console.log(`  fcmTokens count:`, partner.fcmTokens?.length || 0);
      console.log(`  fcmTokenMobile count:`, partner.fcmTokenMobile?.length || 0);
      console.log(`  Latest Mobile Token:`, partner.fcmTokenMobile?.length ? partner.fcmTokenMobile[partner.fcmTokenMobile.length - 1]?.slice(0, 25) + '...' : 'none');
      console.log(`  Updated At:`, partner.updatedAt);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
