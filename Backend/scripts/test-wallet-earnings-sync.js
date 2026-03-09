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
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');

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
      console.log('⚠️ No delivered orders with deliveryPartnerId found in DB. Create one order and complete delivery first.');
      return;
    }

    const deliveryId = deliveredOrder.deliveryPartnerId;
    const deliveryIdStr = deliveryId?.toString?.() || String(deliveryId);
    console.log('📦 Found delivered order:', deliveredOrder.orderId || deliveredOrder._id, '| deliveryPartnerId:', deliveryIdStr);

    const deliveredCount = await Order.countDocuments({
      deliveryPartnerId: deliveryId,
      status: 'delivered'
    });
    console.log('📊 Delivered orders for this partner:', deliveredCount);

    // 2) Run sync (same as GET /api/delivery/wallet)
    console.log('\n🔄 Running syncMissingEarningsForDelivery...');
    await syncMissingEarningsForDelivery(deliveryId);
    console.log('✅ Sync completed\n');

    // 3) Fetch wallet and compute weekly stats (same logic as getWallet)
    let wallet = await DeliveryWallet.findOne({ deliveryId }).lean();
    if (!wallet) {
      wallet = await DeliveryWallet.findOne({ deliveryId: deliveryIdStr }).lean();
    }
    if (!wallet) {
      console.log('⚠️ No wallet found after sync (findOrCreate may use different id type)');
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

    console.log('💰 Wallet after sync:');
    console.log('   totalBalance:', wallet.totalBalance);
    console.log('   totalEarned:', wallet.totalEarned);
    console.log('   payment transactions (Completed):', paymentTx.length);
    console.log('   This week (Sun–now): earnings ₹' + weeklyEarnings.toFixed(2) + ', orders ' + weeklyOrders);
    console.log('   Last 7 days: earnings ₹' + last7Earnings.toFixed(2) + ', orders ' + last7Orders);

    if (deliveredCount > 0 && paymentTx.length === 0) {
      console.log('\n❌ FAIL: There are delivered orders but no payment transactions (sync may have failed).');
      process.exitCode = 1;
    } else if (deliveredCount > 0 && paymentTx.length === deliveredCount) {
      console.log('\n✅ PASS: Sync OK. Every delivered order has a Completed payment transaction.');
      console.log('   Pocket balance (total) will show ₹' + (wallet.totalBalance || 0) + '.');
      if (weeklyOrders === 0 && last7Orders === 0) {
        console.log('   Weekly/Last7 show 0 because these deliveries are older than current week (expected).');
      }
    } else if (deliveredCount > 0) {
      console.log('\n⚠️ WARN: Only ' + paymentTx.length + '/' + deliveredCount + ' payment transactions (some orders may have been skipped).');
    }
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected.');
  }
}

run().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
