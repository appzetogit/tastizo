import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";
import { FoodRestaurant, getEffectiveRestaurantStatus } from "../modules/food/restaurant/models/restaurant.model.js";

async function repairRestaurantApprovalState() {
  await connectDB();

  const restaurants = await FoodRestaurant.find({})
    .select("_id restaurantName status isAdminApproved approvedAt rejectedAt rejectionReason")
    .lean();

  let scanned = 0;
  let repaired = 0;

  for (const restaurant of restaurants) {
    scanned += 1;
    const effectiveStatus = getEffectiveRestaurantStatus(restaurant);
    const nextSet = {};
    const nextUnset = {};

    if (effectiveStatus === "approved") {
      if (restaurant.status !== "approved") nextSet.status = "approved";
      if (restaurant.isAdminApproved !== true) nextSet.isAdminApproved = true;
      if (!restaurant.approvedAt) nextSet.approvedAt = new Date();
      if (restaurant.rejectedAt) nextUnset.rejectedAt = 1;
      if (restaurant.rejectionReason) nextUnset.rejectionReason = 1;
    } else if (effectiveStatus === "rejected") {
      if (restaurant.status !== "rejected") nextSet.status = "rejected";
      if (restaurant.isAdminApproved !== false) nextSet.isAdminApproved = false;
      if (!restaurant.rejectedAt) nextSet.rejectedAt = new Date();
      if (restaurant.approvedAt) nextUnset.approvedAt = 1;
    } else {
      if (restaurant.status !== "pending") nextSet.status = "pending";
      if (restaurant.isAdminApproved !== false) nextSet.isAdminApproved = false;
      if (restaurant.approvedAt) nextUnset.approvedAt = 1;
    }

    if (Object.keys(nextSet).length === 0 && Object.keys(nextUnset).length === 0) {
      continue;
    }

    await FoodRestaurant.updateOne(
      { _id: restaurant._id },
      {
        ...(Object.keys(nextSet).length ? { $set: nextSet } : {}),
        ...(Object.keys(nextUnset).length ? { $unset: nextUnset } : {}),
      },
    );

    repaired += 1;
    console.log(
      `[repair] ${restaurant._id} "${restaurant.restaurantName || "Unknown"}": ${restaurant.status || "unset"} -> ${effectiveStatus}`,
    );
  }

  console.log(JSON.stringify({ scanned, repaired }, null, 2));
}

repairRestaurantApprovalState()
  .catch((error) => {
    console.error("Failed to repair restaurant approval state:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectDB();
    }
  });
