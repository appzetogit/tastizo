const mongoose = require('mongoose');
const { FoodDeliveryPartner } = require('../Backend/src/modules/food/delivery/models/deliveryPartner.model.js');
const { FoodZone } = require('../Backend/src/modules/food/admin/models/zone.model.js');

async function checkRiders() {
    try {
        await mongoose.connect('mongodb+srv://tastizo:SoMOaXSvqEzUiznT@xd0dtfw.mongodb.net/Tastizo?retryWrites=true&w=majority&authSource=admin');
        console.log('Connected to DB');

        const riders = await FoodDeliveryPartner.find({
            name: { $in: ['Abhishek', 'Abhi'] }
        }).select('name zoneId currentZoneId availabilityStatus status').lean();

        console.log('Riders Data:');
        console.log(JSON.stringify(riders, null, 2));

        for (const r of riders) {
            if (r.zoneId) {
                const zone = await FoodZone.findById(r.zoneId).lean();
                console.log(`Zone for ${r.name}: ${zone ? zone.name : 'NOT FOUND'}`);
            } else {
                console.log(`Zone for ${r.name}: NULL (Rider not assigned to any zone)`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkRiders();
