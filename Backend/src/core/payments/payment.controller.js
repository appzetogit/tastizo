import mongoose from 'mongoose';
import { sendResponse } from '../../utils/response.js';
import { getPaymentsByOrder } from './payment.service.js';
import { getTransactionsByOrder } from './transaction.service.js';
import { getWalletBalance, getWalletWithTransactions, getUserWalletForFrontend, creditWallet } from './wallet.service.js';
import { getRefundsByOrder, listRefunds } from './refund.service.js';
import { createSettlement, processSettlement, listSettlements } from './settlement.service.js';
import { logger } from '../../utils/logger.js';

// ─── User Endpoints ───

export const getPaymentHistoryController = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const payments = await getPaymentsByOrder(orderId);
        return sendResponse(res, 200, 'Payment history fetched', { payments });
    } catch (err) {
        next(err);
    }
};

export const getOrderTransactionsController = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const transactions = await getTransactionsByOrder(orderId);
        return sendResponse(res, 200, 'Transactions fetched', { transactions });
    } catch (err) {
        next(err);
    }
};

export const getUserWalletBalanceController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const data = await getWalletBalance('user', userId);
        return sendResponse(res, 200, 'Balance fetched', data);
    } catch (err) {
        next(err);
    }
};

export const getUserWalletTransactionsController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await getWalletWithTransactions('user', userId, { page, limit });
        return sendResponse(res, 200, 'Wallet transactions fetched', data);
    } catch (err) {
        next(err);
    }
};

// ─── Restaurant Endpoints ───

export const getRestaurantWalletController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.restaurantId || req.params.restaurantId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await getWalletWithTransactions('restaurant', restaurantId, { page, limit });
        return sendResponse(res, 200, 'Restaurant wallet fetched', data);
    } catch (err) {
        next(err);
    }
};

// ─── Delivery Partner Endpoints ───

export const getDeliveryWalletController = async (req, res, next) => {
    try {
        const deliveryPartnerId = req.user?.deliveryPartnerId || req.params.deliveryPartnerId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await getWalletWithTransactions('deliveryBoy', deliveryPartnerId, { page, limit });
        return sendResponse(res, 200, 'Delivery wallet fetched', data);
    } catch (err) {
        next(err);
    }
};

// ─── Admin Endpoints ───

export const getAdminWalletController = async (req, res, next) => {
    try {
        const data = await getWalletBalance('admin', 'platform');
        return sendResponse(res, 200, 'Admin wallet fetched', data);
    } catch (err) {
        next(err);
    }
};

export const getAdminFinanceSummaryController = async (req, res, next) => {
    try {
        const { FoodAdminWallet } = await import('../../modules/food/admin/models/adminWallet.model.js');
        const adminWallet = await FoodAdminWallet.findOne({ key: 'platform' }).lean();
        const pendingSettlements = await listSettlements({ status: 'pending', limit: 100 });
        const pendingRefunds = await listRefunds({ status: 'pending', limit: 100 });

        return sendResponse(res, 200, 'Finance summary', {
            platform: {
                balance: adminWallet?.balance || 0,
                totalRevenue: adminWallet?.totalRevenue || 0,
                totalPayouts: adminWallet?.totalPayouts || 0,
                totalRefunds: adminWallet?.totalRefunds || 0
            },
            pendingSettlements: {
                count: pendingSettlements.total,
                totalAmount: pendingSettlements.settlements.reduce((s, v) => s + (v.amount || 0), 0)
            },
            pendingRefunds: {
                count: pendingRefunds.total,
                totalAmount: pendingRefunds.refunds.reduce((s, v) => s + (v.amount || 0), 0)
            }
        });
    } catch (err) {
        next(err);
    }
};

export const listSettlementsController = async (req, res, next) => {
    try {
        const { entityType, entityId, status } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await listSettlements({ entityType, entityId, status, page, limit });
        return sendResponse(res, 200, 'Settlements fetched', data);
    } catch (err) {
        next(err);
    }
};

export const createSettlementController = async (req, res, next) => {
    try {
        const { entityType, entityId, amount, notes, periodStart, periodEnd } = req.body;
        const settlement = await createSettlement({ entityType, entityId, amount, notes, periodStart, periodEnd });
        return sendResponse(res, 201, 'Settlement created', { settlement });
    } catch (err) {
        next(err);
    }
};

export const processSettlementController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const adminId = req.user?.userId;
        const { payoutRef } = req.body;
        const settlement = await processSettlement(id, { processedBy: adminId, payoutRef });
        return sendResponse(res, 200, 'Settlement processed', { settlement });
    } catch (err) {
        next(err);
    }
};

export const listRefundsController = async (req, res, next) => {
    try {
        const { status } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await listRefunds({ status, page, limit });
        return sendResponse(res, 200, 'Refunds fetched', data);
    } catch (err) {
        next(err);
    }
};

export const getRefundsByOrderController = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const refunds = await getRefundsByOrder(orderId);
        return sendResponse(res, 200, 'Refunds fetched', { refunds });
    } catch (err) {
        next(err);
    }
};

export const createDiningPaymentController = async (req, res, next) => {
    try {
        const { bookingId, restaurantId, userId, totalAmount, commissionPct, paymentMethod, couponCode } = req.body;
        
        if (!bookingId || !restaurantId || !totalAmount) {
            return res.status(400).json({ success: false, message: 'Missing required parameters' });
        }
        
        let effectiveTotal = Number(totalAmount);
        let discountAmount = 0;
        let appliedCoupon = null;

        // Apply dining coupon if provided
        if (couponCode) {
            const { FoodOffer } = await import('../../modules/food/admin/models/offer.model.js');
            const offer = await FoodOffer.findOne({ couponCode: String(couponCode).trim().toUpperCase() }).lean();
            if (offer && (offer.couponType === 'dining') && offer.status === 'active') {
                if (offer.discountType === 'percentage') {
                    discountAmount = Number((effectiveTotal * (offer.discountValue / 100)).toFixed(2));
                    if (offer.maxDiscount && discountAmount > offer.maxDiscount) {
                        discountAmount = offer.maxDiscount;
                    }
                } else {
                    discountAmount = Math.min(offer.discountValue, effectiveTotal);
                }
                effectiveTotal = Number((effectiveTotal - discountAmount).toFixed(2));
                appliedCoupon = { code: offer.couponCode, discount: discountAmount };

                // Increment usage
                await FoodOffer.updateOne({ _id: offer._id }, { $inc: { usedCount: 1 } });
            }
        }

        // --- Dining coupon: discount is borne ONLY by admin commission ---
        // Commission is calculated on the FULL bill (before discount).
        // Restaurant gets: fullBill - fullCommission (same as without coupon).
        // Admin gets: fullCommission - couponDiscount (admin bears the coupon cost).
        // Customer pays: fullBill - couponDiscount.
        const grossBill = Number(totalAmount);
        const commPct = Number(commissionPct) ?? 10;
        const fullCommission = Number((grossBill * (commPct / 100)).toFixed(2));
        const restaurantShare = Number((grossBill - fullCommission).toFixed(2));
        const customerPays = Number((grossBill - discountAmount).toFixed(2));
        const adminNetCommission = Number((fullCommission - discountAmount).toFixed(2));
        const finalUserId = userId || req.user?.userId;
        
        if (!finalUserId) {
            return res.status(400).json({ success: false, message: 'userId is required' });
        }

        const { FoodTransaction } = await import('../../modules/food/orders/models/foodTransaction.model.js');

        // Check if a transaction already exists for this bookingId to prevent duplicates
        const existingTx = await FoodTransaction.findOne({ bookingId });
        if (existingTx) {
            return res.status(200).json({ success: true, message: 'Dining payment already recorded', data: existingTx });
        }

        // Create FoodTransaction
        const tx = new FoodTransaction({
            userId: new mongoose.Types.ObjectId(finalUserId),
            restaurantId: new mongoose.Types.ObjectId(restaurantId),
            paymentMethod: paymentMethod || 'dining_bill',
            status: 'captured',
            pricing: {
                subtotal: grossBill,
                tax: 0,
                packagingFee: 0,
                deliveryFee: 0,
                platformFee: 0,
                restaurantCommission: fullCommission,
                discount: discountAmount,
                total: customerPays,
                currency: 'INR'
            },
            payment: {
                method: paymentMethod || 'dining_bill',
                status: 'paid',
                amountDue: 0
            },
            amounts: {
                totalCustomerPaid: customerPays,
                restaurantShare: restaurantShare,
                restaurantCommission: fullCommission,
                riderShare: 0,
                platformNetProfit: adminNetCommission,
                couponDiscount: discountAmount,
                taxAmount: 0
            },
            bookingId,
            orderReadableId: bookingId,
            type: 'dining',
            history: [{
                kind: 'captured',
                amount: customerPays,
                note: `Dining payment captured for booking ${bookingId}${appliedCoupon ? ` (coupon ${appliedCoupon.code}: -₹${appliedCoupon.discount} from admin commission)` : ''}`
            }]
        });

        await tx.save();

        // Credit restaurant wallet — restaurant gets FULL payout (unaffected by coupon)
        await creditWallet({
            entityType: 'restaurant',
            entityId: String(restaurantId),
            amount: restaurantShare,
            description: `Dining payout for booking ${bookingId}`,
            category: 'commission',
            metadata: { bookingId, fullCommission, adminNetCommission, restaurantShare, grossBill, discountAmount }
        });

        return res.status(201).json({ success: true, message: 'Dining payment recorded successfully', data: { ...tx.toObject(), discountAmount, adminNetCommission, restaurantShare, appliedCoupon } });
    } catch (err) {
        next(err);
    }
};

export const validateDiningCouponController = async (req, res, next) => {
    try {
        const { couponCode, billAmount, restaurantId } = req.body;

        if (!couponCode || !billAmount) {
            return res.status(400).json({ success: false, message: 'couponCode and billAmount are required' });
        }

        const { FoodOffer } = await import('../../modules/food/admin/models/offer.model.js');
        const code = String(couponCode).trim().toUpperCase();
        const offer = await FoodOffer.findOne({ couponCode: code }).lean();

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Invalid coupon code' });
        }

        if (offer.couponType !== 'dining') {
            return res.status(400).json({ success: false, message: 'This coupon is not valid for dining' });
        }

        if (offer.status !== 'active') {
            return res.status(400).json({ success: false, message: 'This coupon is no longer active' });
        }

        // Check expiry
        if (offer.endDate && new Date(offer.endDate).getTime() < Date.now()) {
            return res.status(400).json({ success: false, message: 'This coupon has expired' });
        }

        // Check start date
        if (offer.startDate && new Date(offer.startDate).getTime() > Date.now()) {
            return res.status(400).json({ success: false, message: 'This coupon is not active yet' });
        }

        // Check usage limit
        if (offer.usageLimit && (offer.usedCount || 0) >= offer.usageLimit) {
            return res.status(400).json({ success: false, message: 'This coupon has reached its usage limit' });
        }

        // Check min order value
        const amount = Number(billAmount);
        if (offer.minOrderValue && amount < offer.minOrderValue) {
            return res.status(400).json({ success: false, message: `Minimum bill amount is ₹${offer.minOrderValue}` });
        }

        // Check restaurant scope
        if (offer.restaurantScope === 'selected' && restaurantId) {
            if (String(offer.restaurantId) !== String(restaurantId)) {
                return res.status(400).json({ success: false, message: 'This coupon is not valid for this restaurant' });
            }
        }

        // Calculate discount
        let discountAmount = 0;
        if (offer.discountType === 'percentage') {
            discountAmount = Number((amount * (offer.discountValue / 100)).toFixed(2));
            if (offer.maxDiscount && discountAmount > offer.maxDiscount) {
                discountAmount = offer.maxDiscount;
            }
        } else {
            discountAmount = Math.min(offer.discountValue, amount);
        }

        const finalAmount = Number((amount - discountAmount).toFixed(2));

        return res.status(200).json({
            success: true,
            message: 'Coupon applied successfully',
            data: {
                couponCode: offer.couponCode,
                discountType: offer.discountType,
                discountValue: offer.discountValue,
                discountAmount,
                finalAmount,
                originalAmount: amount
            }
        });
    } catch (err) {
        next(err);
    }
};
