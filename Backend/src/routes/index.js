import express from 'express';
import authRoutes from '../core/auth/auth.routes.js';
import deliveryRoutes from '../modules/food/delivery/routes/delivery.routes.js';
import restaurantRoutes from '../modules/food/restaurant/routes/restaurant.routes.js';
import landingRoutes from '../modules/food/landing/routes/landing.routes.js';
import { getPublicDiningCategories, getPublicDiningRestaurants } from '../modules/food/dining/controllers/diningPublic.controller.js';
import uploadRoutes from '../modules/uploads/routes/upload.routes.js';
import restaurantAdminRoutes from '../modules/food/admin/routes/admin.routes.js';
import userRoutes from '../modules/food/user/routes/user.routes.js';
import orderUserRoutes from '../modules/food/orders/routes/order.routes.user.js';
import paymentRoutes from '../core/payments/payment.routes.js';
import fcmRoutes from '../core/notifications/fcm.routes.js';
import notificationRoutes from '../core/notifications/notification.routes.js';
import { authMiddleware } from '../core/auth/auth.middleware.js';
import * as businessSettingsController from '../modules/food/admin/controllers/businessSettings.controller.js';
import { requireRoles } from '../core/roles/role.middleware.js';
import { getQueuesController } from '../controllers/admin.controller.js';
import webhookRoutes from '../core/payments/routes/webhook.routes.js';
import searchRoutes from '../modules/food/search/routes/search.routes.js';
import locationRoutes from '../modules/location/routes/location.routes.js';

const router = express.Router();

const mountFoodRoutes = (basePath) => {
    router.use(`${basePath}/food/auth`, authRoutes);
    router.use(`${basePath}/food/delivery`, deliveryRoutes);
    router.use(`${basePath}/food/restaurant`, restaurantRoutes);
    router.use(`${basePath}/food`, landingRoutes);
    router.use(`${basePath}/food/search`, searchRoutes);
    router.use(`${basePath}/food/location`, locationRoutes);
    router.get(`${basePath}/food/dining/categories/public`, getPublicDiningCategories);
    router.get(`${basePath}/food/dining/restaurants/public`, getPublicDiningRestaurants);
    router.get(`${basePath}/food/admin/business-settings/public`, businessSettingsController.getBusinessSettings);
    router.use(`${basePath}/food/admin`, authMiddleware, requireRoles('ADMIN'), restaurantAdminRoutes);
    router.use(`${basePath}/food/user`, authMiddleware, requireRoles('USER'), userRoutes);
    router.use(
        `${basePath}/food/notifications`,
        authMiddleware,
        requireRoles('USER', 'RESTAURANT', 'DELIVERY_PARTNER'),
        notificationRoutes
    );
    router.use(`${basePath}/food/orders`, authMiddleware, requireRoles('USER'), orderUserRoutes);
    router.use(`${basePath}/food/payments`, authMiddleware, paymentRoutes);
};

router.get('/v1/health', (_req, res) => {
    res.status(200).json({ status: 'UP', message: 'Server is healthy' });
});

router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'UP', message: 'Server is healthy' });
});

router.use('/v1/auth', authRoutes);
router.use('/auth', authRoutes);
router.use('/v1/uploads', uploadRoutes);
router.use('/uploads', uploadRoutes);

mountFoodRoutes('/v1');
mountFoodRoutes('');

router.use('/v1/payments/webhook', webhookRoutes);
router.use('/payments/webhook', webhookRoutes);
router.use('/v1/fcm-tokens', fcmRoutes);
router.use('/fcm-tokens', fcmRoutes);

router.get('/v1/admin/queues', authMiddleware, requireRoles('ADMIN'), getQueuesController);
router.get('/admin/queues', authMiddleware, requireRoles('ADMIN'), getQueuesController);

export default router;
