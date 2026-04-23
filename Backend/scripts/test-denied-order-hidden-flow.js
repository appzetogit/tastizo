import mongoose from "mongoose";
import { config } from "dotenv";

config();

import Order from "../modules/order/models/Order.js";
import Delivery from "../modules/delivery/models/Delivery.js";
import Restaurant from "../modules/restaurant/models/Restaurant.js";
import OrderAssignmentHistory from "../modules/order/models/OrderAssignmentHistory.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/tastizo-test";

async function cleanup(testId) {
  await Order.deleteMany({ orderId: { $regex: `^TEST-DENY-${testId}-` } });
  await Delivery.deleteMany({
    phone: {
      $in: [`+91111${testId}`, `+92222${testId}`],
    },
  });
  await Restaurant.deleteMany({
    $or: [
      { email: `deny-flow-${testId}@test.com` },
      { slug: `deny-flow-restaurant-${testId}` },
    ],
  });
}

async function main() {
  const testId = Date.now().toString().slice(-6);

  try {
    await mongoose.connect(MONGODB_URI);
    await cleanup(testId);

    const restaurant = await Restaurant.create({
      email: `deny-flow-${testId}@test.com`,
      ownerName: "Deny Flow Owner",
      name: "Deny Flow Restaurant",
      slug: `deny-flow-restaurant-${testId}`,
      location: {
        type: "Point",
        coordinates: [75.8577, 22.7196],
        formattedAddress: "Indore Test Address",
      },
      isActive: true,
      isAcceptingOrders: true,
    });

    const deniedRider = await Delivery.create({
      name: "Denied Rider",
      phone: `+91111${testId}`,
      email: `denied-${testId}@test.com`,
      status: "approved",
      isActive: true,
      availability: {
        isOnline: true,
        currentLocation: {
          type: "Point",
          coordinates: [75.8579, 22.7198],
        },
        lastLocationUpdate: new Date(),
      },
    });

    const otherRider = await Delivery.create({
      name: "Other Rider",
      phone: `+92222${testId}`,
      email: `other-${testId}@test.com`,
      status: "approved",
      isActive: true,
      availability: {
        isOnline: true,
        currentLocation: {
          type: "Point",
          coordinates: [75.8582, 22.7201],
        },
        lastLocationUpdate: new Date(),
      },
    });

    const order = await Order.create({
      orderId: `TEST-DENY-${testId}-1`,
      userId: new mongoose.Types.ObjectId(),
      restaurantId: restaurant._id.toString(),
      restaurantName: restaurant.name,
      status: "ready",
      items: [
        {
          itemId: "item-1",
          name: "Test Meal",
          price: 120,
          quantity: 1,
          isVeg: true,
        },
      ],
      address: {
        formattedAddress: "Customer Test Address",
        location: {
          type: "Point",
          coordinates: [75.8601, 22.7211],
        },
      },
      pricing: {
        subtotal: 120,
        deliveryFee: 20,
        platformFee: 5,
        tax: 10,
        total: 155,
      },
      payment: {
        method: "cash",
        status: "pending",
      },
      assignmentStatus: "pending_assignment",
      deliveryPartnerId: null,
    });

    await OrderAssignmentHistory.findOneAndUpdate(
      {
        orderId: order._id,
        deliveryPartnerId: deniedRider._id,
      },
      {
        $set: {
          assignmentStatus: "rejected",
          respondedAt: new Date(),
          reason: "rejected_by_delivery",
        },
        $setOnInsert: {
          orderNumber: order.orderId,
          assignedAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 1000),
          metadata: {
            assignmentMethod: "manual",
            totalAttempts: 1,
            previousAttempts: 0,
          },
        },
      },
      { upsert: true },
    );

    await Order.findByIdAndUpdate(order._id, {
      $set: {
        assignmentStatus: "pending_assignment",
        deliveryPartnerId: null,
        "assignmentInfo.deliveryPartnerId": null,
      },
    });

    const rejectedHistory = await OrderAssignmentHistory.findOne({
      orderId: order._id,
      deliveryPartnerId: deniedRider._id,
      assignmentStatus: "rejected",
    }).lean();

    if (!rejectedHistory) {
      throw new Error("Reject history was not created for denied rider");
    }

    const blockedIds = await OrderAssignmentHistory.find({
      deliveryPartnerId: deniedRider._id,
      assignmentStatus: { $in: ["rejected", "expired"] },
    }).distinct("orderId");

    const deniedRiderVisibleOrders = await Order.find({
      status: { $nin: ["pending", "delivered", "cancelled"] },
      _id: { $nin: blockedIds },
      $or: [
        { deliveryPartnerId: deniedRider._id },
        {
          $and: [
            {
              $or: [
                { deliveryPartnerId: { $exists: false } },
                { deliveryPartnerId: null },
              ],
            },
            { status: "ready" },
            { assignmentStatus: "pending_assignment" },
          ],
        },
      ],
    }).lean();

    if (deniedRiderVisibleOrders.some((visibleOrder) => visibleOrder._id.toString() === order._id.toString())) {
      throw new Error("Denied rider can still see the denied order");
    }

    const otherRiderVisibleOrders = await Order.find({
      status: { $nin: ["pending", "delivered", "cancelled"] },
      $or: [
        { deliveryPartnerId: otherRider._id },
        {
          $and: [
            {
              $or: [
                { deliveryPartnerId: { $exists: false } },
                { deliveryPartnerId: null },
              ],
            },
            { status: "ready" },
            { assignmentStatus: "pending_assignment" },
          ],
        },
      ],
    }).lean();

    if (!otherRiderVisibleOrders.some((visibleOrder) => visibleOrder._id.toString() === order._id.toString())) {
      throw new Error("Other riders lost visibility of the order after one rider denied it");
    }

    console.log("TEST PASSED: denied order is hidden permanently for the rejecting delivery rider.");
  } catch (error) {
    console.error("TEST FAILED:", error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await cleanup(testId).catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
}

main();
