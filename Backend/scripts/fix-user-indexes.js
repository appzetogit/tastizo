/**
 * Migration script to fix User model indexes
 * Allows same email/phone for different roles by using compound unique indexes
 * Uses partial indexes to prevent duplicate key errors with null emails/phones
 * 
 * Run this once: node scripts/fix-user-indexes.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/appzeto-food';

async function fixIndexes() {
  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    // Drop old compound unique indexes if they exist (sparse ones causing issues)
    try {
      await collection.dropIndex('email_1_role_1');
    } catch (err) {
      if (err.code === 27) {
      } else {
      }
    }

    try {
      await collection.dropIndex('phone_1_role_1');
    } catch (err) {
      if (err.code === 27) {
      } else {
      }
    }

    // Drop old unique email index if it exists
    try {
      await collection.dropIndex('email_1');
    } catch (err) {
      if (err.code === 27) {
      } else {
      }
    }

    // Drop old unique phone index if it exists
    try {
      await collection.dropIndex('phone_1');
    } catch (err) {
      if (err.code === 27) {
      } else {
      }
    }
    // Create compound unique index for email + role using partial index
    // This only indexes documents where email is not null, preventing duplicate key errors
    try {
      await collection.createIndex(
        { email: 1, role: 1 },
        { 
          unique: true, 
          partialFilterExpression: { email: { $exists: true, $type: 'string' } },
          name: 'email_1_role_1' 
        }
      );
    } catch (err) {
      if (err.code === 85) {
        try {
          await collection.dropIndex('email_1_role_1');
          await collection.createIndex(
            { email: 1, role: 1 },
            { 
              unique: true, 
              partialFilterExpression: { email: { $exists: true, $type: 'string' } },
              name: 'email_1_role_1' 
            }
          );
        } catch (recreateErr) {
        }
      } else {
      }
    }

    // Create compound unique index for phone + role using partial index
    // This only indexes documents where phone is not null, preventing duplicate key errors
    try {
      await collection.createIndex(
        { phone: 1, role: 1 },
        { 
          unique: true, 
          partialFilterExpression: { phone: { $exists: true, $type: 'string' } },
          name: 'phone_1_role_1' 
        }
      );
    } catch (err) {
      if (err.code === 85) {
        try {
          await collection.dropIndex('phone_1_role_1');
          await collection.createIndex(
            { phone: 1, role: 1 },
            { 
              unique: true, 
              partialFilterExpression: { phone: { $exists: true, $type: 'string' } },
              name: 'phone_1_role_1' 
            }
          );
        } catch (recreateErr) {
        }
      } else {
      }
    }

    // Create non-unique indexes for individual fields
    try {
      await collection.createIndex({ email: 1 }, { sparse: true, name: 'email_1_nonunique' });
    } catch (err) {
    }

    try {
      await collection.createIndex({ phone: 1 }, { sparse: true, name: 'phone_1_nonunique' });
    } catch (err) {
    }

    try {
      await collection.createIndex({ role: 1 }, { name: 'role_1' });
    } catch (err) {
    }
  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

fixIndexes();

