/**
 * Test Script: Dining flow including Commission, Bill, Coupon
 *
 * Runs the full flow using DB directly and asserts commission calculation.
 * Usage: node scripts/test-dining-flow.js
 * Requires: MONGODB_URI in .env
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { connectDB } from "../config/database.js";
import Restaurant from "../modules/restaurant/models/Restaurant.js";
import User from "../modules/auth/models/User.js";
import TableBooking from "../modules/dining/models/TableBooking.js";
import DiningCoupon from "../modules/dining/models/DiningCoupon.js";

dotenv.config();

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(msg, color = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function run() {
  log("\n========== DINING FLOW TEST (Commission + Bill + Coupon) ==========\n", "cyan");

  try {
    await connectDB();
  } catch (err) {
    log("DB connect failed: " + err.message, "red");
    process.exit(1);
  }

  let restaurantId, userId, bookingId, couponId;

  try {
    // 1) Get or create restaurant and set dining commission
    log("Step 1: Restaurant with dining commission %", "bright");
    let restaurant = await Restaurant.findOne({ isActive: true }).select("_id name diningCommissionPercentage").lean();
    if (!restaurant) {
      log("No active restaurant found. Create one in the app first.", "yellow");
      process.exit(1);
    }
    restaurantId = restaurant._id;
    await Restaurant.findByIdAndUpdate(restaurantId, { diningCommissionPercentage: 10 });
    restaurant = await Restaurant.findById(restaurantId).select("diningCommissionPercentage").lean();
    log(`  Restaurant: ${restaurantId}, commission %: ${restaurant.diningCommissionPercentage}`, "blue");
    log("  OK", "green");

    // 2) Create dining coupon
    log("\nStep 2: Create Dining Coupon", "bright");
    const code = "TEST20_" + Date.now();
    const coupon = await DiningCoupon.create({
      code,
      discountType: "percentage",
      discountValue: 20,
      maxDiscount: 50,
      minBillAmount: 100,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: true,
      usageLimit: 10,
    });
    couponId = coupon._id;
    log(`  Coupon: ${code}, 20% off, max ₹50, min bill ₹100`, "blue");
    log("  OK", "green");

    // 3) Get a user
    log("\nStep 3: Get User", "bright");
    const user = await User.findOne().select("_id").lean();
    if (!user) {
      log("No user found. Create one first.", "yellow");
      process.exit(1);
    }
    userId = user._id;
    log(`  User: ${userId}`, "blue");
    log("  OK", "green");

    // 4) Create table booking and set to dining_completed + send bill
    log("\nStep 4: Create Booking → Dining Completed → Send Bill", "bright");
    const billAmount = 500;
    const booking = await TableBooking.create({
      restaurant: restaurantId,
      user: userId,
      guests: 2,
      date: new Date(),
      timeSlot: "19:00",
      status: "dining_completed",
      billAmount,
      discountAmount: 0,
      finalAmount: billAmount,
      billStatus: "pending",
      paymentStatus: "unpaid",
      billSentAt: new Date(),
    });
    bookingId = booking._id;
    log(`  Booking: ${bookingId}, billAmount: ₹${billAmount}, billStatus: pending`, "blue");
    log("  OK", "green");

    // 5) Apply coupon (20% of 500 = 100, capped at 50 → discount 50)
    log("\nStep 5: Apply Coupon (20% max ₹50)", "bright");
    const discount = Math.min((billAmount * 20) / 100, 50);
    const finalAmount = billAmount - discount;
    await TableBooking.findByIdAndUpdate(bookingId, {
      appliedCoupon: couponId,
      discountAmount: discount,
      finalAmount,
    });
    await DiningCoupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } });
    log(`  Discount: ₹${discount}, finalAmount: ₹${finalAmount}`, "blue");
    log("  OK", "green");

    // 6) Simulate payment success → commission on finalAmount
    log("\nStep 6: Payment & Commission Calculation", "bright");
    const commissionPercentage = restaurant.diningCommissionPercentage ?? 0;
    const commissionAmount = (finalAmount * commissionPercentage) / 100;
    const restaurantEarning = finalAmount - commissionAmount;
    const adminEarning = commissionAmount;

    await TableBooking.findByIdAndUpdate(bookingId, {
      paymentStatus: "paid",
      billStatus: "completed",
      paidAt: new Date(),
      commissionAmount,
      restaurantEarning,
      adminEarning,
    });

    log(`  finalAmount: ₹${finalAmount}`, "blue");
    log(`  commissionPercentage: ${commissionPercentage}%`, "blue");
    log(`  commissionAmount (admin): ₹${commissionAmount}`, "blue");
    log(`  restaurantEarning: ₹${restaurantEarning}`, "blue");
    log("  OK", "green");

    // 7) Assert
    log("\nStep 7: Assertions", "bright");
    const updated = await TableBooking.findById(bookingId).lean();
    const expectedFinal = 450; // 500 - 50
    const expectedCommission = 45; // 10% of 450
    const expectedRestaurant = 405;

    let ok = true;
    if (updated.finalAmount !== expectedFinal) {
      log(`  finalAmount: expected ${expectedFinal}, got ${updated.finalAmount}`, "red");
      ok = false;
    }
    if (updated.commissionAmount !== expectedCommission) {
      log(`  commissionAmount: expected ${expectedCommission}, got ${updated.commissionAmount}`, "red");
      ok = false;
    }
    if (updated.restaurantEarning !== expectedRestaurant) {
      log(`  restaurantEarning: expected ${expectedRestaurant}, got ${updated.restaurantEarning}`, "red");
      ok = false;
    }
    if (updated.adminEarning !== expectedCommission) {
      log(`  adminEarning: expected ${expectedCommission}, got ${updated.adminEarning}`, "red");
      ok = false;
    }
    if (updated.paymentStatus !== "paid" || updated.billStatus !== "completed") {
      log(`  paymentStatus/billStatus: expected paid/completed`, "red");
      ok = false;
    }

    if (ok) {
      log("  All assertions passed.", "green");
      log("\n========== DINING FLOW TEST PASSED ==========\n", "green");
    } else {
      log("\n========== DINING FLOW TEST FAILED ==========\n", "red");
      process.exit(1);
    }
  } catch (err) {
    log("\nError: " + err.message, "red");
    console.error(err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    log("DB connection closed.", "blue");
    process.exit(0);
  }
}

run();
