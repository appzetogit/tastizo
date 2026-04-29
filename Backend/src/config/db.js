import mongoose from 'mongoose';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.mongodbUri);
        const { ensureFoodUserIndexes } = await import('../core/users/user.model.js');
        const { FoodOtp } = await import('../core/otp/otp.model.js');
        const { FoodRefreshToken } = await import('../core/refreshTokens/refreshToken.model.js');
        const { Payment } = await import('../core/payments/models/payment.model.js');
        const { FoodRestaurant } = await import('../modules/food/restaurant/models/restaurant.model.js');
        const { FoodOrder } = await import('../modules/food/orders/models/order.model.js');
        await ensureFoodUserIndexes();
        await Promise.allSettled([
            FoodOtp.createIndexes(),
            FoodRefreshToken.createIndexes(),
            Payment.createIndexes(),
            FoodRestaurant.createIndexes(),
            FoodOrder.createIndexes()
        ]);
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
};

/**
 * Close MongoDB connection (e.g. graceful shutdown).
 * @returns {Promise<void>}
 */
export const disconnectDB = async () => {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
};
