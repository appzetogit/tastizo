import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

import { sendNotificationToOwner } from './src/core/notifications/firebase.service.js';

async function run() {
  const url = process.env.MONGODB_URI;
  await mongoose.connect(url);
  
  try {
    const ownerId = '6a1422f96bcb7e3137952240'; // Arun's ID
    const payload = {
      title: '🛵 Arun Live Foreground Notification Test',
      body: 'Testing notification for Arun! 🚀',
      data: {
        type: 'test',
        link: '/'
      }
    };
    
    console.log('Sending push...');
    const result = await sendNotificationToOwner({
      ownerType: 'DELIVERY_PARTNER',
      ownerId,
      payload
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
