import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.MONGODB_URI;

async function run() {
  const client = new mongoose.mongo.MongoClient(url);
  try {
    await client.connect();
    const db = client.db();
    
    // Simulate listNearbyOnlineDeliveryPartners
    const effectiveZoneId = '69ef3b0175e5541b2af8702a';
    const allOnline = await db.collection('food_delivery_partners').find({
      status: "approved",
      availabilityStatus: "online",
      $or: [
        { currentZoneId: new mongoose.mongo.ObjectId(effectiveZoneId) },
        { zoneId: new mongoose.mongo.ObjectId(effectiveZoneId), currentZoneId: { $in: [null, undefined] } }
      ]
    }).toArray();
    
    console.log(`Found ${allOnline.length} online approved riders in zone ${effectiveZoneId}`);
    
    const STALE_GPS_MS = 15 * 60 * 1000;
    const scored = [];
    const maxKm = 9999;
    
    for (const p of allOnline) {
      const isStale = !p.lastLocationUpdatedAt || (Date.now() - new Date(p.lastLocationUpdatedAt).getTime()) > STALE_GPS_MS;
      if (p.currentLat == null || p.currentLng == null || isStale) {
        scored.push({ partnerId: p._id, distanceKm: 999, status: p.status, isStale });
        continue;
      }
      scored.push({ partnerId: p._id, distanceKm: 0, status: p.status, isStale });
    }
    
    scored.sort((a, b) => a.distanceKm - b.distanceKm);
    console.log('Scored riders:', scored);
    
    const picked = scored.slice(0, 15);
    console.log('Picked riders:', picked);
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

run();
