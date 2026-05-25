import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.MONGODB_URI;

async function run() {
  const client = new mongoose.mongo.MongoClient(url);
  try {
    await client.connect();
    const db = client.db();
    
    const partners = await db.collection('food_delivery_partners').find({}).toArray();
    for (const p of partners) {
      console.log(`- Rider: ${p.name}`);
      console.log(`  zoneId type: ${p.zoneId ? p.zoneId.constructor.name : typeof p.zoneId} = ${p.zoneId}`);
      console.log(`  currentZoneId type: ${p.currentZoneId ? p.currentZoneId.constructor.name : typeof p.currentZoneId} = ${p.currentZoneId}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

run();
