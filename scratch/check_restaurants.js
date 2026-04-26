import mongoose from 'mongoose';
import { FoodRestaurant } from './backend/src/modules/food/restaurant/models/restaurant.model.js';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

async function checkRestaurants() {
    try {
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
