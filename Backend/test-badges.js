import mongoose from 'mongoose';
import { getSidebarBadges } from './src/modules/food/admin/services/admin.service.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const b = await getSidebarBadges();
        console.log(JSON.stringify(b, null, 2));
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
});
