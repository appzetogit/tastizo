import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.MONGODB_URI;
await mongoose.connect(url);

const FoodRestaurant = mongoose.model('FoodRestaurant', new mongoose.Schema({}, { collection: 'food_restaurants', strict: false }));
const FoodDeliveryPartner = mongoose.model('FoodDeliveryPartner', new mongoose.Schema({}, { collection: 'food_delivery_partners', strict: false }));
const FoodZone = mongoose.model('FoodZone', new mongoose.Schema({}, { collection: 'food_zones', strict: false }));

async function run() {
  try {
    const zones = await FoodZone.find({}).lean();
    console.log(`Found ${zones.length} zones.`);

    const rest = await FoodRestaurant.find({}).lean();
    console.log(`\nFound ${rest.length} restaurants:`);
    for (const r of rest) {
      console.log(`- ${r.restaurantName} (ID: ${r._id}, Zone: ${r.zoneId})`);
    }

    const partners = await FoodDeliveryPartner.find({}).lean();
    console.log(`\nFound ${partners.length} partners:`);
    for (const p of partners) {
        console.log(`- Rider: ${p.name || p.fullName} (Status: ${p.status}, Availability: ${p.availabilityStatus}, zoneId: ${p.zoneId}, currentZoneId: ${p.currentZoneId})`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
}

run();
