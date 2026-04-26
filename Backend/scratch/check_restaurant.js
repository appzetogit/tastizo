import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from Backend/.env
dotenv.config({ path: path.resolve('C:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/.env') });

async function checkRestaurant() {
  try {
    console.log('Connecting to MongoDB...', process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const FoodRestaurant = mongoose.model('FoodRestaurant', new mongoose.Schema({}, { strict: false, collection: 'food_restaurants' }));

    const restaurants = await FoodRestaurant.find({}).lean();
    console.log('Total restaurants:', restaurants.length);

    restaurants.forEach(r => {
      console.log(`- ID: ${r._id}, Name: ${r.restaurantName}, Normalized: ${r.restaurantNameNormalized}, Status: ${r.status}`);
    });

    const athaBakes = await FoodRestaurant.findOne({ 
      $or: [
        { restaurantNameNormalized: 'atha bakes' },
        { restaurantNameNormalized: 'atha-bakes' },
        { restaurantName: /atha/i }
      ]
    }).lean();

    if (athaBakes) {
      console.log('\nFound Atha Bakes:');
      console.log(JSON.stringify(athaBakes, null, 2));
    } else {
      console.log('\nAtha Bakes not found with given criteria.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkRestaurant();
