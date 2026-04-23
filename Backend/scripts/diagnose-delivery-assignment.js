import dotenv from "dotenv";
import mongoose from "mongoose";
import Delivery from "../modules/delivery/models/Delivery.js";
import Order from "../modules/order/models/Order.js";
import OrderAssignmentHistory from "../modules/order/models/OrderAssignmentHistory.js";
import Zone from "../modules/admin/models/Zone.js";
import Restaurant from "../modules/restaurant/models/Restaurant.js";
import { findNearestDeliveryBoy } from "../modules/order/services/deliveryAssignmentService.js";

dotenv.config();

const args = process.argv.slice(2);

function getArg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

function maskToken(value) {
  if (!value) return "missing";
  if (value.length <= 12) return "present";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function pointInPolygon(lat, lng, coordinates = []) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) return false;

  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const xi = coordinates[i].longitude ?? coordinates[i].lng;
    const yi = coordinates[i].latitude ?? coordinates[i].lat;
    const xj = coordinates[j].longitude ?? coordinates[j].lng;
    const yj = coordinates[j].latitude ?? coordinates[j].lat;

    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }
  return inside;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/diagnose-delivery-assignment.js --phone <delivery phone>
  node scripts/diagnose-delivery-assignment.js --email <delivery email>
  node scripts/diagnose-delivery-assignment.js --id <mongo id or DEL id>

Optional:
  --order <order mongo id or orderId>   Simulate assignment for that order's restaurant

Examples:
  node scripts/diagnose-delivery-assignment.js --phone 9876543210
  node scripts/diagnose-delivery-assignment.js --phone 9876543210 --order ORD123456
`);
}

async function resolveRestaurantForAssignment(restaurantId) {
  if (!restaurantId) return null;

  const rawId = restaurantId?._id?.toString?.() || restaurantId?.toString?.() || restaurantId;
  if (!rawId) return null;

  let restaurant = null;
  if (mongoose.Types.ObjectId.isValid(rawId) && rawId.length === 24) {
    restaurant = await Restaurant.findById(rawId).select("name location restaurantId slug").lean();
  }

  if (!restaurant) {
    restaurant = await Restaurant.findOne({
      $or: [{ restaurantId: rawId }, { slug: rawId }],
    }).select("name location restaurantId slug").lean();
  }

  return restaurant;
}

function getRestaurantCoordinates(restaurant) {
  const lat = restaurant?.location?.latitude ?? restaurant?.location?.coordinates?.[1];
  const lng = restaurant?.location?.longitude ?? restaurant?.location?.coordinates?.[0];
  const restaurantLat = Number(lat);
  const restaurantLng = Number(lng);

  if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) {
    return null;
  }

  return { restaurantLat, restaurantLng };
}

async function main() {
  const phone = getArg("phone");
  const email = getArg("email");
  const id = getArg("id");
  const orderInput = getArg("order");

  if (!phone && !email && !id && !orderInput) {
    printUsage();
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const query = {};
  if (phone) query.phone = phone;
  if (email) query.email = email.toLowerCase();
  if (id) {
    if (mongoose.Types.ObjectId.isValid(id)) query._id = id;
    else query.deliveryId = id;
  }

  let delivery = null;
  if (Object.keys(query).length > 0) {
    delivery = await Delivery.findOne(query).lean();
  }

  if (!delivery && phone) {
    const digits = phone.replace(/\D/g, "");
    const last10 = digits.slice(-10);
    const phonePattern = last10
      ? new RegExp(`${last10.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
      : null;
    if (phonePattern) {
      const matches = await Delivery.find({ phone: phonePattern })
        .select(
          "_id deliveryId name phone email status isActive availability fcmTokenWeb fcmTokenAndroid fcmTokenIos",
        )
        .limit(10)
        .lean();
      if (matches.length === 1) {
        delivery = matches[0];
      } else if (matches.length > 1) {
        console.log("Multiple delivery accounts matched phone last digits:");
        matches.forEach((match) => {
          console.log({
            _id: match._id.toString(),
            deliveryId: match.deliveryId,
            name: match.name,
            phone: match.phone,
            status: match.status,
            isActive: match.isActive,
            isOnline: match.availability?.isOnline,
          });
        });
        return;
      }
    }
  }

  if (!delivery) {
    console.log(
      Object.keys(query).length > 0
        ? `Delivery account not found for: ${JSON.stringify(query)}`
        : "No delivery account lookup requested.",
    );
  }

  const coords = delivery?.availability?.currentLocation?.coordinates || [];
  const lng = coords[0];
  const lat = coords[1];
  const hasValidLocation =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0);

  if (delivery) {
    console.log("\n=== Delivery Account ===");
    console.log({
      _id: delivery._id.toString(),
      deliveryId: delivery.deliveryId,
      name: delivery.name,
      phone: delivery.phone,
      email: delivery.email || null,
      status: delivery.status,
      isActive: delivery.isActive,
      isOnline: delivery.availability?.isOnline,
      coordinates: coords,
      parsedLocation: hasValidLocation ? { latitude: lat, longitude: lng } : null,
      lastLocationUpdate: delivery.availability?.lastLocationUpdate || null,
      fcmTokenWeb: maskToken(delivery.fcmTokenWeb),
      fcmTokenAndroid: maskToken(delivery.fcmTokenAndroid),
      fcmTokenIos: maskToken(delivery.fcmTokenIos),
      canBeAssigned:
        delivery.availability?.isOnline === true &&
        ["approved", "active"].includes(delivery.status) &&
        delivery.isActive === true &&
        hasValidLocation,
    });
  }

  const zones = hasValidLocation
    ? await Zone.find({ isActive: true }).select("name restaurantId coordinates").lean()
    : [];
  const matchingZones = zones.filter((zone) => pointInPolygon(lat, lng, zone.coordinates));

  if (delivery) {
    console.log("\n=== Zone Match From Current GPS ===");
    if (!hasValidLocation) {
      console.log("No valid GPS saved in DB. This delivery boy will not receive assignments.");
    } else {
      console.log({
        activeZonesChecked: zones.length,
        matchingZones: matchingZones.map((zone) => ({
          _id: zone._id.toString(),
          name: zone.name,
          restaurantId: zone.restaurantId?.toString?.() || null,
        })),
      });
    }
  }

  if (delivery) {
    const activeAssignments = await OrderAssignmentHistory.find({
      deliveryPartnerId: delivery._id,
      assignmentStatus: "pending",
      expiresAt: { $gt: new Date() },
    })
      .sort({ assignedAt: -1 })
      .limit(5)
      .lean();

    const recentHistory = await OrderAssignmentHistory.find({
      deliveryPartnerId: delivery._id,
    })
      .sort({ assignedAt: -1 })
      .limit(10)
      .lean();

    console.log("\n=== Assignment History ===");
    console.log({
      activePendingAssignments: activeAssignments.map((item) => ({
        orderId: item.orderId?.toString?.(),
        orderNumber: item.orderNumber,
        status: item.assignmentStatus,
        assignedAt: item.assignedAt,
        expiresAt: item.expiresAt,
      })),
      recent: recentHistory.map((item) => ({
        orderId: item.orderId?.toString?.(),
        orderNumber: item.orderNumber,
        status: item.assignmentStatus,
        assignedAt: item.assignedAt,
        respondedAt: item.respondedAt,
        reason: item.reason,
        distance: item.metadata?.distance,
      })),
    });
  }

  if (orderInput) {
    const orderQuery = mongoose.Types.ObjectId.isValid(orderInput)
      ? { _id: orderInput }
      : { orderId: orderInput };

    const order = await Order.findOne(orderQuery).lean();

    console.log("\n=== Order Simulation ===");
    if (!order) {
      console.log("Order not found:", orderInput);
    } else {
      const restaurant = await resolveRestaurantForAssignment(order.restaurantId);
      const coordinates = getRestaurantCoordinates(restaurant);
      const restaurantLat = coordinates?.restaurantLat;
      const restaurantLng = coordinates?.restaurantLng;
      const restaurantId = restaurant?._id?.toString();

      console.log({
        orderMongoId: order._id.toString(),
        orderId: order.orderId,
        status: order.status,
        assignmentStatus: order.assignmentStatus,
        deliveryPartnerId: order.deliveryPartnerId?.toString?.() || null,
        storedRestaurantId: order.restaurantId,
        restaurant: restaurant?.name,
        restaurantLocation: { latitude: restaurantLat, longitude: restaurantLng },
      });

      if (Number.isFinite(restaurantLat) && Number.isFinite(restaurantLng)) {
        const selected = await findNearestDeliveryBoy(
          restaurantLat,
          restaurantLng,
          restaurantId,
          50,
          [],
        );
        console.log("Nearest selected by backend logic:", selected);
        console.log(
          selected?.deliveryPartnerId === delivery._id.toString()
            ? "Result: this delivery boy SHOULD receive this order."
            : "Result: backend would choose another delivery boy or none.",
        );
      } else {
        console.log("Restaurant coordinates missing, assignment cannot run.");
      }
    }
  }
}

main()
  .catch((error) => {
    console.error("Diagnostic failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
