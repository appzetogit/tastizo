import mongoose from 'mongoose';
import { FoodRestaurant } from './src/modules/food/restaurant/models/restaurant.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkRestaurants() {
    try {
        console.log('Connecting to:', process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const restaurants = await FoodRestaurant.find({}, 'restaurantName restaurantNameNormalized status').lean();
        console.log('Total restaurants:', restaurants.length);
        console.log(JSON.stringify(restaurants, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkRestaurants();
