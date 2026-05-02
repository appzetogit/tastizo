const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://tastizo:SoMOaXSvqEzUiznT@xd0dtfw.mongodb.net/Tastizo?retryWrites=true&w=majority&authSource=admin';

const isPointInPolygon = (lat, lng, polygon) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = Number(polygon[i]?.longitude);
        const yi = Number(polygon[i]?.latitude);
        const xj = Number(polygon[j]?.longitude);
        const yj = Number(polygon[j]?.latitude);
        const intersects = (yi > lat !== yj > lat) && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 0.000000001) + xi);
        if (intersects) inside = !inside;
    }
    return inside;
};

async function testResolution() {
    try {
        await mongoose.connect(MONGODB_URI);
        const zoneSchema = new mongoose.Schema({}, { strict: false });
        const FoodZone = mongoose.model('FoodZone', zoneSchema, 'food_zones');
        
        const indoreZone = await FoodZone.findOne({ name: 'Zone-Indore' }).lean();
        
        // Fryday House coords
        const lat = 22.7505;
        const lng = 75.8937;
        
        const isInside = isPointInPolygon(lat, lng, indoreZone.coordinates);
        console.log(`Is Fryday House (22.7505, 75.8937) inside Indore zone? ${isInside}`);
        
        // Yummy Fries Corner coords
        const lat2 = 22.7196;
        const lng2 = 75.8577;
        const isInside2 = isPointInPolygon(lat2, lng2, indoreZone.coordinates);
        console.log(`Is Yummy Fries Corner (22.7196, 75.8577) inside Indore zone? ${isInside2}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testResolution();
