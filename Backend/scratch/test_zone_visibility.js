import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { resolveActiveZoneByCoordinates } from '../src/modules/food/shared/zoneResolver.js';
import { listApprovedRestaurants } from '../src/modules/food/restaurant/services/restaurant.service.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { restaurantBelongsToResolvedZone, zoneMatchesCoordinates } from '../src/modules/food/shared/zoneResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const LOCATION_PRESETS = {
  varanasi: {
    latitude: 25.2796758,
    longitude: 83.00793709999999,
  },
  indore: {
    latitude: 22.7195687,
    longitude: 75.8577258,
  },
};

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing in Backend/.env');
  }

  await mongoose.connect(mongoUri);

  try {
    const presetKey = String(process.argv[2] || 'varanasi').trim().toLowerCase();
    const testLocation = LOCATION_PRESETS[presetKey];
    if (!testLocation) {
      throw new Error(`Unknown location preset: ${presetKey}`);
    }

    const zone = await resolveActiveZoneByCoordinates(
      testLocation.latitude,
      testLocation.longitude,
    );

    console.log('Resolved zone:', zone ? {
      _id: String(zone._id),
      name: zone.name || zone.zoneName || zone.serviceLocation || '',
    } : null);

    const activeZones = await FoodZone.find({ isActive: true })
      .select('_id name zoneName serviceLocation coverageType center radius unit coordinates')
      .lean();
    console.log('Active zones:', activeZones.map((entry) => ({
      _id: String(entry._id),
      name: entry.name || entry.zoneName || entry.serviceLocation || '',
      coverageType: entry.coverageType || 'polygon',
      containsTestCoords: zoneMatchesCoordinates(
        entry,
        testLocation.latitude,
        testLocation.longitude,
      ),
    })));

    const result = await listApprovedRestaurants({
      lat: testLocation.latitude,
      lng: testLocation.longitude,
      limit: 50,
      page: 1,
    });

    const rawRestaurants = await FoodRestaurant.find({
      $or: [{ status: 'approved' }, { isAdminApproved: true }],
    })
      .select('restaurantName zoneId location city status isAdminApproved')
      .lean();

    console.log('Raw zone checks:', rawRestaurants.map((restaurant) => ({
      name: restaurant.restaurantName,
      zoneId: String(restaurant.zoneId || ''),
      city: restaurant.location?.city || restaurant.city || '',
      latitude: restaurant.location?.latitude ?? restaurant.location?.coordinates?.[1] ?? null,
      longitude: restaurant.location?.longitude ?? restaurant.location?.coordinates?.[0] ?? null,
      inResolvedZone: restaurantBelongsToResolvedZone(restaurant, zone),
    })));

    const restaurants = result?.restaurants || [];
    console.log('Visible restaurants:', restaurants.map((restaurant) => ({
      id: String(restaurant._id || restaurant.id || restaurant.restaurantId || ''),
      name: restaurant.restaurantName || restaurant.name || '',
      zoneId: String(restaurant.zoneId?._id || restaurant.zoneId || ''),
      city: restaurant.location?.city || restaurant.city || '',
      formattedAddress: restaurant.location?.formattedAddress || '',
    })));

    const hasAthaBakes = restaurants.some((restaurant) => {
      const name = String(restaurant.restaurantName || restaurant.name || '').trim().toLowerCase();
      return name === 'atha bakes';
    });

    console.log('Contains atha bakes:', hasAthaBakes);

    if (!zone?._id) {
      process.exitCode = 2;
      throw new Error('No active zone resolved for the test coordinates');
    }

    if (!hasAthaBakes) {
      process.exitCode = 3;
      throw new Error('atha bakes is still missing from the approved restaurant list');
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('Zone visibility test failed:', error.message);
  process.exit(process.exitCode || 1);
});
