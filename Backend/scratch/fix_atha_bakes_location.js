import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { updateRestaurantLocation } from '../src/modules/food/admin/services/admin.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const LOCATION_PRESETS = {
  varanasi: {
    latitude: 25.2796758,
    longitude: 83.00793709999999,
    formattedAddress: 'Nagwa Lanka, Varanasi, Uttar Pradesh 221005, India',
    address: 'Nagwa Lanka, Varanasi, Uttar Pradesh 221005, India',
    addressLine1: 'Nagwa Lanka',
    addressLine2: '',
    area: 'Nagwa Lanka',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    pincode: '221005',
    landmark: '',
  },
  indore: {
    latitude: 22.7195687,
    longitude: 75.8577258,
    formattedAddress: 'Rajwada, Indore, Madhya Pradesh 452002, India',
    address: 'Rajwada, Indore, Madhya Pradesh 452002, India',
    addressLine1: 'Rajwada',
    addressLine2: '',
    area: 'Rajwada',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452002',
    landmark: '',
  },
};

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing in Backend/.env');
  }

  await mongoose.connect(mongoUri);

  try {
    const restaurant = await FoodRestaurant.findOne({
      restaurantNameNormalized: 'atha bakes',
    })
      .select('_id restaurantName restaurantNameNormalized zoneId location city state')
      .lean();

    if (!restaurant?._id) {
      throw new Error('atha bakes not found');
    }

    const presetKey = String(process.argv[2] || 'varanasi').trim().toLowerCase();
    const targetLocation = LOCATION_PRESETS[presetKey];
    if (!targetLocation) {
      throw new Error(`Unknown location preset: ${presetKey}`);
    }

    console.log('Before fix:', {
      id: String(restaurant._id),
      zoneId: String(restaurant.zoneId || ''),
      city: restaurant.location?.city || restaurant.city || '',
      state: restaurant.location?.state || restaurant.state || '',
      latitude: restaurant.location?.latitude ?? restaurant.location?.coordinates?.[1] ?? null,
      longitude: restaurant.location?.longitude ?? restaurant.location?.coordinates?.[0] ?? null,
    });

    const updated = await updateRestaurantLocation(String(restaurant._id), targetLocation);

    console.log('After fix:', {
      id: String(updated?._id || ''),
      zoneId: String(updated?.zoneId?._id || updated?.zoneId || ''),
      zoneName:
        updated?.zoneId?.name ||
        updated?.zoneId?.zoneName ||
        updated?.zoneId?.serviceLocation ||
        '',
      city: updated?.location?.city || updated?.city || '',
      state: updated?.location?.state || updated?.state || '',
      latitude: updated?.location?.latitude ?? updated?.location?.coordinates?.[1] ?? null,
      longitude: updated?.location?.longitude ?? updated?.location?.coordinates?.[0] ?? null,
      formattedAddress: updated?.location?.formattedAddress || '',
    });
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('atha bakes fix failed:', error.message);
  process.exit(1);
});
