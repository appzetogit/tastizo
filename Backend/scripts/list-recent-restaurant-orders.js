import dotenv from "dotenv";
import mongoose from "mongoose";
import Order from "../modules/order/models/Order.js";
import Restaurant from "../modules/restaurant/models/Restaurant.js";

dotenv.config();

const search = process.argv[2] || "Sarnath";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const restaurant = await Restaurant.findOne({
    name: new RegExp(search, "i"),
  })
    .select("_id restaurantId name location")
    .lean();

  console.log("Restaurant:", restaurant);

  const restaurantIds = [
    restaurant?._id?.toString(),
    restaurant?.restaurantId,
  ].filter(Boolean);

  const orders = await Order.find({
    $or: [
      { restaurantId: { $in: restaurantIds } },
      { restaurantName: new RegExp(search, "i") },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(15)
    .select(
      "orderId status assignmentStatus deliveryPartnerId restaurantId restaurantName address.location address.formattedAddress createdAt updatedAt",
    )
    .lean();

  console.log(JSON.stringify(orders, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to list recent orders:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
