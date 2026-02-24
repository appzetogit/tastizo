import express from 'express';
import { getEarnings, getActiveEarningAddons, claimEarningAddonBonus } from '../controllers/deliveryEarningsController.js';
import { authenticate } from '../middleware/deliveryAuth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Earnings routes
// IMPORTANT: More specific routes must come before less specific ones
router.post('/earnings/active-offers/:offerId/claim', claimEarningAddonBonus);
router.get('/earnings/active-offers', getActiveEarningAddons);
router.get('/earnings', getEarnings);

export default router;

