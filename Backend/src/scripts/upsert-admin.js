import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { FoodAdmin } from '../core/admin/admin.model.js';

dotenv.config();

const [, , emailArg, passwordArg, nameArg] = process.argv;

const email = String(emailArg || '').trim().toLowerCase();
const password = String(passwordArg || '').trim();
const name = String(nameArg || '').trim() || 'Admin';

if (!email || !password) {
  console.error('Usage: node scripts/upsert-admin.js <email> <password> [name]');
  process.exit(1);
}

if (!process.env.MONGO_URI && !process.env.MONGODB_URI) {
  console.error('Missing MONGO_URI or MONGODB_URI in environment.');
  process.exit(1);
}

const run = async () => {
  await connectDB();

  const existingAdmin = await FoodAdmin.findOne({ email });

  if (existingAdmin) {
    existingAdmin.password = password;
    existingAdmin.name = name || existingAdmin.name || 'Admin';
    existingAdmin.isActive = true;

    if (!Array.isArray(existingAdmin.servicesAccess) || existingAdmin.servicesAccess.length === 0) {
      existingAdmin.servicesAccess = ['food'];
    }

    await existingAdmin.save();
    console.log(`Updated admin: ${email}`);
  } else {
    await FoodAdmin.create({
      email,
      password,
      name,
      role: 'ADMIN',
      isActive: true,
      servicesAccess: ['food'],
    });
    console.log(`Created admin: ${email}`);
  }
};

run()
  .catch((error) => {
    console.error('Failed to upsert admin:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectDB();
    }
  });
