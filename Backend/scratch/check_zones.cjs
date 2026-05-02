const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://tastizo:SoMOaXSvqEzUiznT@xd0dtfw.mongodb.net/Tastizo?retryWrites=true&w=majority&authSource=admin';

async function checkZones() {
    try {
        await mongoose.connect(MONGODB_URI);
        const zoneSchema = new mongoose.Schema({}, { strict: false });
        const FoodZone = mongoose.model('FoodZone', zoneSchema, 'food_zones');
        
        const zones = await FoodZone.find({ isActive: true }).lean();
        console.log(`Found ${zones.length} active zones:`);
        zones.forEach(z => {
            console.log(`- ID: ${z._id}, Name: ${z.name || z.zoneName}, Coverage: ${z.coverageType}`);
            if (z.coverageType === 'radius') {
                console.log(`  Center: ${JSON.stringify(z.center)}, Radius: ${z.radius} ${z.unit}`);
            } else if (z.coordinates) {
                console.log(`  Coordinates: ${JSON.stringify(z.coordinates.length)} points`);
            } else {
                console.log('  No coordinates/center found');
            }
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkZones();
