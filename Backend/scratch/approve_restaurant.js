import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('C:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/.env') });

async function approveRestaurant() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const FoodRestaurant = mongoose.model('FoodRestaurant', new mongoose.Schema({}, { strict: false, collection: 'food_restaurants' }));

    const result = await FoodRestaurant.updateOne(
      { restaurantNameNormalized: 'atha bakes' },
      { $set: { status: 'approved', approvedAt: new Date() } }
    );

    if (result.modifiedCount > 0) {
      console.log('Successfully approved Atha Bakes.');
    } else {
      console.log('Atha Bakes not found or already approved.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

approveRestaurant();
