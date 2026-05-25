import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.MONGODB_URI;
await mongoose.connect(url);

// Since we are running in the context of the backend, we can just import the actual service
import { listNearbyOnlineDeliveryPartners } from './src/modules/food/orders/services/order-dispatch.service.js';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';

async function run() {
  try {
    const rest = await FoodRestaurant.findOne({ restaurantName: { $regex: /color roll/i } }).lean();
    if (!rest) {
      console.log('Restaurant not found');
      return;
    }
    console.log(`Checking partners for ${rest.restaurantName} (zone: ${rest.zoneId})`);
    
    // We pass the required maxKm and limit which are now huge in actual code
    const result = await listNearbyOnlineDeliveryPartners(rest, {
      maxKm: 9999,
      limit: 5000,
      requiredAmount: 0,
      allowOverLimitFallback: true,
      zoneId: rest.zoneId
    });

    console.log('Eligible partners:');
    console.log(JSON.stringify(result.partners, null, 2));
    
    console.log('\nDebug info:');
    console.log(JSON.stringify(result.debug, null, 2));
    
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
}

run();
