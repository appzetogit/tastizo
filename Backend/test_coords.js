import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.MONGODB_URI;

async function run() {
  const client = new mongoose.mongo.MongoClient(url);
  try {
    await client.connect();
    const db = client.db();
    
    const partners = await db.collection('food_delivery_partners').find({ currentZoneId: new mongoose.mongo.ObjectId('69ef3b0175e5541b2af8702a') }).toArray();
    for (const p of partners) {
      console.log(`- Rider: ${p.name}`);
      console.log(`  currentLat: ${p.currentLat}`);
      console.log(`  currentLng: ${p.currentLng}`);
      console.log(`  lastLocationUpdatedAt: ${p.lastLocationUpdatedAt}`);
      const isStale = !p.lastLocationUpdatedAt || (Date.now() - new Date(p.lastLocationUpdatedAt).getTime()) > 5 * 60 * 1000;
      console.log(`  isStale (>5m): ${isStale}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

run();
