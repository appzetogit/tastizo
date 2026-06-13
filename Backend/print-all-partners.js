import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

import { FoodDeliveryPartner } from './src/modules/food/delivery/models/deliveryPartner.model.js';

async function run() {
  const url = process.env.MONGODB_URI;
  await mongoose.connect(url);
  
  try {
    const partners = await FoodDeliveryPartner.find({}).lean();
    partners.forEach(partner => {
      console.log('--- PARTNER ---');
      console.log('ID:', partner._id);
      console.log('Name:', partner.fullName || partner.name || partner.firstName || 'no name');
      console.log('Phone:', partner.phone || partner.phoneNumber || partner.mobile || 'no phone');
      console.log('Email:', partner.email || 'no email');
      console.log('fcmTokenMobile count:', partner.fcmTokenMobile?.length || 0);
      console.log('Latest mobile token:', partner.fcmTokenMobile?.length ? partner.fcmTokenMobile[partner.fcmTokenMobile.length - 1] : 'none');
      console.log('Updated At:', partner.updatedAt);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();

