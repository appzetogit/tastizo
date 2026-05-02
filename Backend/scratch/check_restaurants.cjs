const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://tastizo:SoMOaXSvqEzUiznT@xd0dtfw.mongodb.net/Tastizo?retryWrites=true&w=majority&authSource=admin';

async function checkRestaurants() {
    try {
        await mongoose.connect(MONGODB_URI);
        const restaurantSchema = new mongoose.Schema({}, { strict: false });
        const FoodRestaurant = mongoose.model('FoodRestaurant', restaurantSchema, 'food_restaurants');
        
        const restaurants = await FoodRestaurant.find({}).lean();
        console.log(`Found ${restaurants.length} restaurants:`);
        restaurants.forEach(r => {
            console.log(`- ID: ${r._id}, Name: ${r.restaurantName}, City: ${r.city}, ZoneId: ${r.zoneId}, Status: ${r.status}, Approved: ${r.isAdminApproved}`);
            console.log(`  Location: ${JSON.stringify(r.location?.coordinates)}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkRestaurants();
