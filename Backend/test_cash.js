import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.MONGODB_URI;
await mongoose.connect(url);

const FoodOrder = mongoose.model('FoodOrder', new mongoose.Schema({}, { collection: 'food_orders', strict: false }));
const FoodDeliveryCashDeposit = mongoose.model('FoodDeliveryCashDeposit', new mongoose.Schema({}, { collection: 'food_delivery_cash_deposits', strict: false }));
const FoodDeliveryCashLimit = mongoose.model('FoodDeliveryCashLimit', new mongoose.Schema({}, { collection: 'delivery_cash_limits', strict: false }));
const FoodDeliveryPartner = mongoose.model('FoodDeliveryPartner', new mongoose.Schema({}, { collection: 'food_delivery_partners', strict: false }));

async function run() {
  try {
    const partners = await FoodDeliveryPartner.find({ currentZoneId: new mongoose.Types.ObjectId('69ef3b0175e5541b2af8702a') }).lean();
    console.log(`Checking ${partners.length} riders in Varanasi:`);
    
    const limitDoc = await FoodDeliveryCashLimit.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    const totalCashLimit = Number(limitDoc?.deliveryCashLimit || 0);
    console.log(`Global Cash Limit: ${totalCashLimit}`);
    
    const partnerIds = partners.map(p => p._id);
    
    const cashAgg = await FoodOrder.aggregate([
      {
        $match: {
          'dispatch.deliveryPartnerId': { $in: partnerIds },
          orderStatus: 'delivered',
          'payment.method': 'cash',
        },
      },
      {
        $group: {
          _id: '$dispatch.deliveryPartnerId',
          grossCashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } },
        },
      },
    ]);
    
    const depositsAgg = await FoodDeliveryCashDeposit.aggregate([
      {
        $match: {
          deliveryPartnerId: { $in: partnerIds },
          status: 'Completed',
        },
      },
      {
        $group: {
          _id: '$deliveryPartnerId',
          depositedCash: { $sum: { $ifNull: ['$amount', 0] } },
        },
      },
    ]);
    
    const grossCashByPartner = new Map(cashAgg.map((row) => [String(row._id), Number(row.grossCashCollected || 0)]));
    const depositedByPartner = new Map(depositsAgg.map((row) => [String(row._id), Number(row.depositedCash || 0)]));
    
    for (const p of partners) {
      const grossCash = grossCashByPartner.get(String(p._id)) || 0;
      const depositedCash = depositedByPartner.get(String(p._id)) || 0;
      const cashInHand = Math.max(0, grossCash - depositedCash);
      const availableCashLimit = Math.max(0, totalCashLimit - cashInHand);
      console.log(`- Rider: ${p.name || p.fullName} (Gross: ${grossCash}, Deposited: ${depositedCash}, Cash in hand: ${cashInHand}, Available Limit: ${availableCashLimit})`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
}

run();
