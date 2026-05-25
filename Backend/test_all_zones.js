import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.MONGODB_URI;

// We need the actual function from the code base
import { listNearbyOnlineDeliveryPartners } from './src/modules/food/orders/services/order-dispatch.service.js';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';
import { FoodZone } from './src/modules/food/admin/models/zone.model.js';
import { FoodDeliveryPartner } from './src/modules/food/delivery/models/deliveryPartner.model.js';

async function run() {
  try {
    await mongoose.connect(url);
    console.log('Connected to DB');

    const zones = await FoodZone.find({ isActive: true }).lean();
    console.log(`Found ${zones.length} active zones.`);

    for (const zone of zones) {
      console.log(`\n=== Testing Zone: ${zone.name || zone.zoneName} (${zone._id}) ===`);
      
      const rest = await FoodRestaurant.findOne({ zoneId: zone._id, isAcceptingOrders: true }).lean();
      if (!rest) {
        console.log(`No active restaurant found in zone ${zone.name}`);
        continue;
      }
      console.log(`Using Restaurant: ${rest.restaurantName} (${rest._id})`);

      // Mock options as used in tryAutoAssign
      const searchOptions = {
        maxKm: 9999,
        limit: 5000,
        requiredAmount: 0,
        allowOverLimitFallback: true,
        zoneId: zone._id
      };

      const result = await listNearbyOnlineDeliveryPartners(rest._id, searchOptions);
      
      console.log(`-> listNearbyOnlineDeliveryPartners returned ${result.partners.length} eligible partners`);
      
      // Let's also check how many are actually online in this zone
      const onlineInZone = await FoodDeliveryPartner.countDocuments({
        status: "approved",
        availabilityStatus: "online",
        $or: [
          { currentZoneId: zone._id },
          { zoneId: zone._id, currentZoneId: { $in: [null, undefined] } }
        ]
      });
      console.log(`-> Actual online approved riders in zone DB: ${onlineInZone}`);
      
      if (result.partners.length !== onlineInZone) {
        console.log('MISMATCH! Riders were filtered out.');
        console.log('Debug info:', JSON.stringify(result.debug, null, 2));
      } else {
        console.log('MATCH: All riders in zone received the order eligibility.');
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
}

run();
