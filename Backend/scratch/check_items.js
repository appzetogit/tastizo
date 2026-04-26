import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('C:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/.env') });

async function checkItems() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const FoodItem = mongoose.model('FoodItem', new mongoose.Schema({}, { strict: false, collection: 'food_items' }));

    const items = await FoodItem.find({ restaurantId: '69edec2622bce67ccf21242e' }).lean();
    console.log('Total items for Atha Bakes:', items.length);

    items.forEach(i => {
      console.log(`- ID: ${i._id}, Name: ${i.name}, Price: ${i.price}, Available: ${i.isAvailable}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkItems();
