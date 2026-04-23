import dotenv from "dotenv";
import mongoose from "mongoose";
import Order from "../modules/order/models/Order.js";
import Restaurant from "../modules/restaurant/models/Restaurant.js";
import "../modules/auth/models/User.js";
import { findNearestDeliveryBoy } from "../modules/order/services/deliveryAssignmentService.js";

dotenv.config();

const args = process.argv.slice(2);
const orderInput = args[0];

if (!orderInput) {
  console.error("Usage: node scripts/dry-run-assignment-payload.js <orderId or mongoId>");
  process.exit(1);
}

async function resolveRestaurant(restaurantId) {
  const rawId = restaurantId?.toString?.() || restaurantId;
  if (!rawId) return null;

  let restaurant = null;
  if (mongoose.Types.ObjectId.isValid(rawId) && rawId.length === 24) {
    restaurant = await Restaurant.findById(rawId)
      .select("name address location phone mobile ownerPhone primaryContactNumber contactNumber")
      .lean();
  }

  if (!restaurant) {
    restaurant = await Restaurant.findOne({
      $or: [{ restaurantId: rawId }, { slug: rawId }],
    })
      .select("name address location phone mobile ownerPhone primaryContactNumber contactNumber")
      .lean();
  }

  return restaurant;
}

function restaurantLocationPayload(restaurant) {
  const latitude = restaurant?.location?.latitude ?? restaurant?.location?.coordinates?.[1];
  const longitude = restaurant?.location?.longitude ?? restaurant?.location?.coordinates?.[0];
  const address =
    restaurant?.location?.formattedAddress ||
    restaurant?.location?.address ||
    restaurant?.address ||
    [
      restaurant?.location?.addressLine1,
      restaurant?.location?.area,
      restaurant?.location?.city,
      restaurant?.location?.state,
      restaurant?.location?.pincode || restaurant?.location?.zipCode,
    ]
      .filter(Boolean)
      .join(", ");

  return {
    latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : undefined,
    longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : undefined,
    address,
    formattedAddress: restaurant?.location?.formattedAddress,
  };
}

function customerLocationPayload(order) {
  const coordinates = order?.address?.location?.coordinates || [];
  return {
    latitude: coordinates[1],
    longitude: coordinates[0],
    address: order?.address?.formattedAddress || order?.deliveryAddress,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const orderQuery = mongoose.Types.ObjectId.isValid(orderInput)
    ? { _id: orderInput }
    : { orderId: orderInput };

  const order = await Order.findOne(orderQuery).populate("userId", "name phone").lean();
  if (!order) {
    console.error("Order not found:", orderInput);
    return;
  }

  const restaurant = await resolveRestaurant(order.restaurantId);
  if (!restaurant) {
    console.error("Restaurant not found:", order.restaurantId);
    return;
  }

  const restaurantLocation = restaurantLocationPayload(restaurant);
  const nearestDeliveryBoy = await findNearestDeliveryBoy(
    restaurantLocation.latitude,
    restaurantLocation.longitude,
    restaurant._id.toString(),
  );

  const payload = {
    orderId: order.orderId,
    orderMongoId: order._id.toString(),
    deliveryPartnerId: nearestDeliveryBoy?.deliveryPartnerId,
    restaurantName: restaurant.name,
    restaurantAddress: restaurantLocation.address,
    restaurantLocation,
    restaurantPhone:
      restaurant.phone ||
      restaurant.mobile ||
      restaurant.primaryContactNumber ||
      restaurant.contactNumber ||
      restaurant.ownerPhone,
    customerName: order.userId?.name,
    customerPhone: order.userId?.phone || order.phoneNumber,
    customerLocation: customerLocationPayload(order),
    pickupDistance: nearestDeliveryBoy?.distance
      ? `${nearestDeliveryBoy.distance.toFixed(2)} km`
      : undefined,
    total: order.pricing?.total,
    itemsCount: order.items?.length || 0,
  };

  console.log({
    order: {
      orderId: order.orderId,
      status: order.status,
      assignmentStatus: order.assignmentStatus,
      deliveryPartnerId: order.deliveryPartnerId || null,
    },
    nearestDeliveryBoy,
    frontendPayloadPreview: payload,
    checks: {
      hasOrderMongoId: Boolean(payload.orderMongoId),
      hasRestaurantName: Boolean(payload.restaurantName),
      hasRestaurantCoordinates: Number.isFinite(payload.restaurantLocation.latitude) &&
        Number.isFinite(payload.restaurantLocation.longitude),
      hasDeliveryPartnerId: Boolean(payload.deliveryPartnerId),
      hasPickupDistance: Boolean(payload.pickupDistance),
    },
  });
}

main()
  .catch((error) => {
    console.error("Dry run failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
