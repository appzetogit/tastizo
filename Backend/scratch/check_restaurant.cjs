
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGO_URI = 'mongodb+srv://tastizo:SoMOaXSvqEzUiznT@xd0dtfw.mongodb.net/Tastizo?retryWrites=true&w=majority&authSource=admin';

async function checkRestaurant() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const FoodRestaurant = mongoose.model('FoodRestaurant', new mongoose.Schema({}, { strict: false }), 'food_restaurants');
    const FoodZone = mongoose.model('FoodZone', new mongoose.Schema({}, { strict: false }), 'food_zones');

    const restaurant = await FoodRestaurant.findOne({ _id: '69edec2622bce67ccf21242e' });
    console.log('atha bakes city:', restaurant?.city);

    const indiaZone = await FoodZone.findOne({ _id: '69ede9fb22bce67ccf212230' });
    if (indiaZone) {
      console.log('india Zone Coordinates:', JSON.stringify(indiaZone.coordinates, null, 2));
    } else {
      console.log('india Zone NOT found');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkRestaurant();
