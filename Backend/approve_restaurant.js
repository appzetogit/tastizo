import mongoose from 'mongoose';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function approveRestaurant() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const result = await FoodRestaurant.updateOne(
            { restaurantNameNormalized: 'atha bakes' },
            { $set: { status: 'approved' } }
        );

        console.log('Update result:', result);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

approveRestaurant();
