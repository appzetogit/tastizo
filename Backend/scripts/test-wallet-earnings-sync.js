/**
 * Test script: wallet earnings sync and weekly stats
 * Run from Backend: node scripts/test-wallet-earnings-sync.js
 * Requires: MONGODB_URI in .env
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  try {
    const Order = (await import('../modules/order/models/Order.js')).default;
    const DeliveryWallet = (await import('../modules/delivery/models/DeliveryWallet.js')).default;
    const { syncMissingEarningsForDelivery } = await import('../modules/delivery/controllers/deliveryWalletController.js');

    // 1) Find a delivery partner who has at least one delivered order
    const deliveredOrder = await Order.findOne(
      { status: 'delivered', deliveryPartnerId: { $exists: true, $ne: null } },
      'deliveryPartnerId orderId deliveredAt'
    ).lean();

    if (!deliveredOrder?.deliveryPartnerId) {
      return;
    }

    const deliveryId = deliveredOrder.deliveryPartnerId;
    const deliveryIdStr = deliveryId?.toString?.() || String(deliveryId);
    const deliveredCount = await Order.countDocuments({
      deliveryPartnerId: deliveryId,
      status: 'delivered'
    });
    // 2) Run sync (same as GET /api/delivery/wallet)
    await syncMissingEarningsForDelivery(deliveryId);
    // 3) Fetch wallet and compute weekly stats (same logic as getWallet)
    let wallet = await DeliveryWallet.findOne({ deliveryId }).lean();
    if (!wallet) {
      wallet = await DeliveryWallet.findOne({ deliveryId: deliveryIdStr }).lean();
    }
    if (!wallet) {
      const created = await DeliveryWallet.findOrCreateByDeliveryId(deliveryId);
      wallet = created.toObject ? created.toObject() : created;
    }

    const txList = wallet.transactions || [];
    const paymentTx = txList.filter(t => t.type === 'payment' && t.status === 'Completed');
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const inWeek = paymentTx.filter(t => {
      const d = t.createdAt || t.date;
      if (!d) return false;
      const txDate = new Date(d);
      return txDate >= startOfWeek && txDate <= now;
    });
    const inLast7 = paymentTx.filter(t => {
      const d = t.createdAt || t.date;
      if (!d) return false;
      const txDate = new Date(d);
      return txDate >= sevenDaysAgo && txDate <= now;
    });

    const weeklyEarnings = inWeek.reduce((s, t) => s + (t.amount || 0), 0);
    const weeklyOrders = inWeek.length;
    const last7Earnings = inLast7.reduce((s, t) => s + (t.amount || 0), 0);
    const last7Orders = inLast7.length;
    if (deliveredCount > 0 && paymentTx.length === 0) {
      process.exitCode = 1;
    } else if (deliveredCount > 0 && paymentTx.length === deliveredCount) {
      if (weeklyOrders === 0 && last7Orders === 0) {
      }
    } else if (deliveredCount > 0) {
    }
  } finally {
    await mongoose.connection.close();
  }
}

run().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
