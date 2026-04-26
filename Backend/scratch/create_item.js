import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('C:/Users/Shailendra Rajpoot/Desktop/company-projects/New folder/tastizo/Backend/.env') });

async function createItem() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const FoodItem = mongoose.model('FoodItem', new mongoose.Schema({}, { strict: false, collection: 'food_items' }));
    const FoodRestaurant = mongoose.model('FoodRestaurant', new mongoose.Schema({}, { strict: false, collection: 'food_restaurants' }));

    const restaurant = await FoodRestaurant.findOne({ restaurantNameNormalized: 'atha bakes' });
    if (!restaurant) {
      console.log('Restaurant not found');
      return;
    }

    const newItem = new FoodItem({
      name: 'Test Burger',
      description: 'A delicious test burger',
      price: 100,
      restaurantId: restaurant._id,
      category: 'Main Course',
      foodType: 'Veg',
      isAvailable: true,
      isRecommended: true,
      image: 'https://res.cloudinary.com/dciu4uawr/image/upload/v1777200147/food/restaurants/menu/xxpqsjxklstudfbp2er8.png',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newItem.save();
    console.log('Successfully created test item.');

    // Also update restaurant menu sections if needed
    // The frontend seems to rely on restaurant.menu.sections or fetching food_items directly.
    // Let's check how menu is fetched.
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createItem();
