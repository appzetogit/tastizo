import mongoose from 'mongoose';
import { FoodDiningRestaurant } from './src/modules/food/dining/models/diningRestaurant.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkDining() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const dining = await FoodDiningRestaurant.find({}).lean();
        console.log('Total dining restaurants:', dining.length);
        console.log(JSON.stringify(dining, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkDining();
