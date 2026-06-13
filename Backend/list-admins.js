import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

import { FoodAdmin } from './src/core/admin/admin.model.js';

async function run() {
  const url = process.env.MONGODB_URI;
  await mongoose.connect(url);
  
  try {
    const admins = await FoodAdmin.find({}).lean();
    console.log('--- ADMIN LIST ---');
    admins.forEach(admin => {
      console.log('Name:', admin.name);
      console.log('Email:', admin.email);
      console.log('Role:', admin.role);
      console.log('------------------');
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();

