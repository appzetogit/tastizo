import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/appzeto-food';

async function fixRestaurantEmailIndex() {
  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('restaurants');
    const indexes = await collection.indexes();
    // Drop old email index if it exists (might not be sparse)
    try {
      await collection.dropIndex('email_1');
    } catch (err) {
      if (err.code === 27) {
      } else {
      }
    }

    // Create new sparse unique index for email
    // Sparse index only indexes documents where email exists and is not null
    try {
      await collection.createIndex(
        { email: 1 },
        { 
          unique: true, 
          sparse: true,
          name: 'email_1'
        }
      );
    } catch (err) {
      if (err.code === 85) {
        try {
          await collection.dropIndex('email_1');
          await collection.createIndex(
            { email: 1 },
            { 
              unique: true, 
              sparse: true,
              name: 'email_1'
            }
          );
        } catch (recreateErr) {
        }
      } else {
      }
    }

    // Also ensure phone index is sparse
    try {
      await collection.dropIndex('phone_1');
    } catch (err) {
      if (err.code === 27) {
      } else {
      }
    }

    try {
      await collection.createIndex(
        { phone: 1 },
        { 
          unique: true, 
          sparse: true,
          name: 'phone_1'
        }
      );
    } catch (err) {
      if (err.code === 85) {
      } else {
      }
    }
  } catch (error) {
    console.error('❌ Error fixing restaurant email index:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

fixRestaurantEmailIndex();

