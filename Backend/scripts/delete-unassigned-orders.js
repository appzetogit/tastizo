import dotenv from "dotenv";
import mongoose from "mongoose";
import Order from "../modules/order/models/Order.js";

dotenv.config();

const shouldExecute = process.argv.includes("--execute");
const deleteAssigned = process.argv.includes("--assigned");

const unassignedOrderQuery = {
  $and: [
    {
      $or: [
        { deliveryPartnerId: { $exists: false } },
        { deliveryPartnerId: null },
      ],
    },
    {
      $or: [
        { "assignmentInfo.deliveryPartnerId": { $exists: false } },
        { "assignmentInfo.deliveryPartnerId": null },
        { "assignmentInfo.deliveryPartnerId": "" },
      ],
    },
  ],
};

const assignedOrderQuery = {
  $or: [
    {
      deliveryPartnerId: {
        $exists: true,
        $ne: null,
      },
    },
    {
      "assignmentInfo.deliveryPartnerId": {
        $exists: true,
        $nin: [null, ""],
      },
    },
  ],
};

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set in the backend environment");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const targetQuery = deleteAssigned ? assignedOrderQuery : unassignedOrderQuery;
  const label = deleteAssigned ? "assigned" : "unassigned";

  const count = await Order.countDocuments(targetQuery);
  const sampleOrders = await Order.find(targetQuery)
    .sort({ createdAt: -1 })
    .limit(10)
    .select(
      "orderId status assignmentStatus deliveryPartnerId assignmentInfo.deliveryPartnerId createdAt",
    )
    .lean();

  console.log(`Found ${count} ${label} order(s).`);
  console.log("Sample matches:");
  console.log(JSON.stringify(sampleOrders, null, 2));

  if (!shouldExecute) {
    console.log(
      `Dry run only. Re-run with ${deleteAssigned ? "--assigned " : ""}--execute to delete these ${label} orders.`,
    );
    return;
  }

  const result = await Order.deleteMany(targetQuery);
  console.log(`Deleted ${result.deletedCount || 0} ${label} order(s).`);
}

main()
  .catch((error) => {
    console.error("Failed to delete unassigned orders:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
