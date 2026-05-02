const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://tastizo:SoMOaXSvqEzUiznT@xd0dtfw.mongodb.net/Tastizo?retryWrites=true&w=majority&authSource=admin';

async function checkZoneDetails() {
    try {
        await mongoose.connect(MONGODB_URI);
        const zoneSchema = new mongoose.Schema({}, { strict: false });
        const FoodZone = mongoose.model('FoodZone', zoneSchema, 'food_zones');
        
        const indoreZone = await FoodZone.findOne({ name: 'Zone-Indore' }).lean();
        console.log('Indore Zone Coordinates:');
        console.log(JSON.stringify(indoreZone.coordinates, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkZoneDetails();
