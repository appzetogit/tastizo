import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

import { sendNotificationToOwner } from './src/core/notifications/firebase.service.js';

async function run() {
  const url = process.env.MONGODB_URI;
  await mongoose.connect(url);
  
  try {
    const ownerId = '69ede66f5a71d40fb051cb2d'; // Rider ID
    const payload = {
      title: '🛵 Tastizo Live Foreground Notification Test',
      body: 'Testing heads-up sliding banner notification! 🚀',
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
