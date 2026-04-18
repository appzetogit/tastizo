import DiningRestaurant from "../models/DiningRestaurant.js";
import DiningCategory from "../models/DiningCategory.js";
import DiningLimelight from "../models/DiningLimelight.js";
import DiningBankOffer from "../models/DiningBankOffer.js";
import DiningMustTry from "../models/DiningMustTry.js";
import DiningOfferBanner from "../models/DiningOfferBanner.js";
import DiningStory from "../models/DiningStory.js";
import TableBooking from "../models/TableBooking.js";
import DiningReview from "../models/DiningReview.js";
import DiningCoupon from "../models/DiningCoupon.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import RestaurantDiningOffer from "../../restaurant/models/RestaurantDiningOffer.js";
import RestaurantWallet from "../../restaurant/models/RestaurantWallet.js";
import Zone from "../../admin/models/Zone.js";
import mongoose from "mongoose";
import emailService from "../../auth/services/emailService.js";
import {
  createOrder as createRazorpayOrder,
  verifyPayment as verifyRazorpayPayment,
} from "../../payment/services/razorpayService.js";
import { getRazorpayCredentials } from "../../../shared/utils/envService.js";
import {
  RESTAURANT_NOTIFICATION_EVENTS,
  sendNotificationToRestaurant,
} from "../../restaurant/services/restaurantNotificationService.js";

const MAX_BOOKINGS_PER_SLOT = 4;
const MAX_GUESTS_PER_BOOKING = 4;
const BLOCKING_SLOT_STATUSES = [
  "pending",
  "confirmed",
  "checked-in",
  "completed",
  "dining_completed",
];

function getDayRange(dateInput) {
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return null;

  const dayStart = new Date(parsed);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(parsed);
  dayEnd.setHours(23, 59, 59, 999);

  return { dayStart, dayEnd };
}

function isPointInZone(lat, lng, zoneCoordinates = []) {
  if (!zoneCoordinates || zoneCoordinates.length < 3) return false;

  let inside = false;
  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const coordI = zoneCoordinates[i];
    const coordJ = zoneCoordinates[j];
    const xi = typeof coordI === "object" ? coordI.latitude || coordI.lat : null;
    const yi = typeof coordI === "object" ? coordI.longitude || coordI.lng : null;
    const xj = typeof coordJ === "object" ? coordJ.latitude || coordJ.lat : null;
    const yj = typeof coordJ === "object" ? coordJ.longitude || coordJ.lng : null;

    if (xi === null || yi === null || xj === null || yj === null) continue;

    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function getDiningCoordinates(restaurant) {
  const lat = Number(
    restaurant?.coordinates?.latitude ??
      restaurant?.location?.latitude ??
      restaurant?.location?.coordinates?.[1],
  );
  const lng = Number(
    restaurant?.coordinates?.longitude ??
      restaurant?.location?.longitude ??
      restaurant?.location?.coordinates?.[0],
  );

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
}

async function getValidatedUserZone(zoneId) {
  if (!zoneId) return null;

  const userZone = await Zone.findById(zoneId).lean();
  if (!userZone || !userZone.isActive) {
    return undefined;
  }

  return userZone;
}

function isDiningRestaurantAccessibleInZone(restaurant, userZone) {
  if (!userZone) return true;

  const coords = getDiningCoordinates(restaurant);
  if (!coords) return false;

  return isPointInZone(coords.lat, coords.lng, userZone.coordinates || []);
}

// Get all dining restaurants (with filtering)
export const getRestaurants = async (req, res) => {
  try {
    const { city, zoneId } = req.query;
    let query = {};

    // Simple filter support
    if (city) {
      query.location = { $regex: city, $options: "i" };
    }

    const userZone = await getValidatedUserZone(zoneId);
    if (zoneId && !userZone) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive zone. Please select your address again.",
      });
    }

    let restaurants = await DiningRestaurant.find(query).lean();

    if (userZone) {
      restaurants = restaurants.filter((restaurant) => {
        const coords = getDiningCoordinates(restaurant);
        if (!coords) return false;
        return isPointInZone(coords.lat, coords.lng, userZone.coordinates || []);
      });
    }

    res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get single restaurant by slug
export const getRestaurantBySlug = async (req, res) => {
  try {
    const { zoneId } = req.query;
    const userZone = await getValidatedUserZone(zoneId);

    if (zoneId && !userZone) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive zone. Please select your address again.",
      });
    }

    const restaurant = await DiningRestaurant.findOne({
      slug: req.params.slug,
    });

    // If not found in DiningRestaurant, check regular Restaurant
    let actualRestaurant = restaurant;
    if (!actualRestaurant) {
      actualRestaurant = await Restaurant.findOne({ slug: req.params.slug });
    }

    // Failsafe: if slug is an ObjectId, try finding by ID
    if (!actualRestaurant && req.params.slug.match(/^[0-9a-fA-F]{24}$/)) {
      actualRestaurant = await DiningRestaurant.findById(req.params.slug);
      if (!actualRestaurant) {
        actualRestaurant = await Restaurant.findById(req.params.slug);
      }
    }

    if (!actualRestaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    if (!isDiningRestaurantAccessibleInZone(actualRestaurant, userZone)) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not available in your current zone",
      });
    }

    res.status(200).json({
      success: true,
      data: actualRestaurant,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get dining categories
export const getCategories = async (req, res) => {
  try {
    const categories = await DiningCategory.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get limelight features
export const getLimelight = async (req, res) => {
  try {
    const limelights = await DiningLimelight.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: limelights.length,
      data: limelights,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get bank offers
export const getBankOffers = async (req, res) => {
  try {
    const offers = await DiningBankOffer.find({ isActive: true });
    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get must tries
export const getMustTries = async (req, res) => {
  try {
    const mustTries = await DiningMustTry.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: mustTries.length,
      data: mustTries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get offer banners
export const getOfferBanners = async (req, res) => {
  try {
    const banners = await DiningOfferBanner.find({ isActive: true })
      .populate("restaurant", "name slug")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get dining stories
export const getStories = async (req, res) => {
  try {
    const stories = await DiningStory.find({ isActive: true }).sort({
      createdAt: -1,
    });
    res.status(200).json({
      success: true,
      count: stories.length,
      data: stories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Create a new table booking
export const createBooking = async (req, res) => {
  try {
    const { restaurant, guests, date, timeSlot, specialRequest } = req.body;
    const userId = req.user._id;

    if (!restaurant || !guests || !date || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Restaurant, guests, date and time slot are required",
      });
    }

    if (!Number.isInteger(Number(guests)) || Number(guests) < 1 || Number(guests) > MAX_GUESTS_PER_BOOKING) {
      return res.status(400).json({
        success: false,
        message: `A dining slot can be booked for 1 to ${MAX_GUESTS_PER_BOOKING} guests only`,
      });
    }

    const dayRange = getDayRange(date);
    if (!dayRange) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking date",
      });
    }

    const slotCount = await TableBooking.countDocuments({
      restaurant,
      timeSlot,
      date: {
        $gte: dayRange.dayStart,
        $lte: dayRange.dayEnd,
      },
      status: { $in: BLOCKING_SLOT_STATUSES },
    });

    if (slotCount >= MAX_BOOKINGS_PER_SLOT) {
      return res.status(409).json({
        success: false,
        message: "This time slot is fully booked. Please choose another slot.",
      });
    }

    const booking = await TableBooking.create({
      restaurant,
      user: userId,
      guests,
      date,
      timeSlot,
      specialRequest,
      status: "confirmed",
    });

    // Populate restaurant data for the success page
    let populatedBooking = await TableBooking.findById(booking._id).populate(
      "restaurant",
      "name location image",
    );
    let bookingObj = populatedBooking.toObject();

    // Check if restaurant population failed (might be in DiningRestaurant collection)
    if (!bookingObj.restaurant || typeof bookingObj.restaurant === "string") {
      const diningRes = await DiningRestaurant.findById(
        booking.restaurant,
      ).select("name location image");
      if (diningRes) {
        bookingObj.restaurant = diningRes;
      }
    }

    res.status(201).json({
      success: true,
      message: "Booking confirmed successfully",
      data: bookingObj,
    });

    sendNotificationToRestaurant({
      restaurantId: booking.restaurant,
      type: RESTAURANT_NOTIFICATION_EVENTS.NEW_DINING_BOOKING,
      bookingId: booking._id,
      eventKey: `${RESTAURANT_NOTIFICATION_EVENTS.NEW_DINING_BOOKING}:${booking._id}`,
      redirectUrl: "/restaurant/reservations",
      metadata: {
        guests,
        date,
        timeSlot,
      },
      source: "diningController.createBooking",
    }).catch((err) => {
      console.error("Failed to create restaurant dining booking notification:", err);
    });

    // Send confirmation email asynchronously if user has email
    if (req.user.email) {
      emailService
        .sendBookingConfirmation(req.user.email, bookingObj)
        .catch((err) => {
          console.error("Failed to send booking confirmation email:", err);
        });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
};

// Get booked counts for restaurant slots on a specific date
export const getSlotAvailability = async (req, res) => {
  try {
    const { restaurantId, date } = req.query;

    if (!restaurantId || !date) {
      return res.status(400).json({
        success: false,
        message: "restaurantId and date are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid restaurantId",
      });
    }

    const dayRange = getDayRange(date);
    if (!dayRange) {
      return res.status(400).json({
        success: false,
        message: "Invalid date",
      });
    }

    const rows = await TableBooking.aggregate([
      {
        $match: {
          restaurant: new mongoose.Types.ObjectId(restaurantId),
          date: { $gte: dayRange.dayStart, $lte: dayRange.dayEnd },
          status: { $in: BLOCKING_SLOT_STATUSES },
        },
      },
      {
        $group: {
          _id: "$timeSlot",
          count: { $sum: 1 },
        },
      },
    ]);

    const availability = {};
    for (const row of rows) {
      const count = row?.count || 0;
      availability[row._id] = {
        bookedCount: count,
        remaining: Math.max(MAX_BOOKINGS_PER_SLOT - count, 0),
        isBooked: count >= MAX_BOOKINGS_PER_SLOT,
      };
    }

    res.status(200).json({
      success: true,
      data: {
        date,
        restaurantId,
        maxGuestsPerBooking: MAX_GUESTS_PER_BOOKING,
        maxBookingsPerSlot: MAX_BOOKINGS_PER_SLOT,
        availability,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch slot availability",
      error: error.message,
    });
  }
};

// Get current user's bookings
export const getUserBookings = async (req, res) => {
  try {
    const bookings = await TableBooking.find({ user: req.user._id })
      .populate("restaurant", "name location image")
      .sort({ createdAt: -1 });

    // Manually handle population if the restaurant wasn't found in "Restaurant" collection
    // (it might be in "DiningRestaurant" collection)
    const processedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const bookingObj = booking.toObject();

        if (
          !bookingObj.restaurant ||
          typeof bookingObj.restaurant === "string"
        ) {
          // Try finding in DiningRestaurant
          const diningRes = await DiningRestaurant.findById(
            booking.restaurant,
          ).select("name location image");
          if (diningRes) {
            bookingObj.restaurant = diningRes;
          }
        }
        return bookingObj;
      }),
    );

    res.status(200).json({
      success: true,
      count: processedBookings.length,
      data: processedBookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
};

// Get bookings for a specific restaurant (for owners)
export const getRestaurantBookings = async (req, res) => {
  try {
    const restaurantId = req.restaurant ? req.restaurant._id : req.params.restaurantId;
    if (req.restaurant && req.params.restaurantId && req.params.restaurantId !== restaurantId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to view this restaurant's bookings" });
    }

    const bookings = await TableBooking.find({ restaurant: restaurantId })
      .populate("user", "name phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch restaurant bookings",
      error: error.message,
    });
  }
};

// Update booking status (for restaurant owners)
export const updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    const updateData = { status };
    if (status === "checked-in") {
      updateData.checkInTime = new Date();
    } else if (status === "completed" || status === "dining_completed") {
      updateData.checkOutTime = new Date();
    }

    const existingBooking = await TableBooking.findById(bookingId).lean();
    const booking = await TableBooking.findByIdAndUpdate(
      bookingId,
      updateData,
      { new: true },
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status}`,
      data: booking,
    });

    if (status === "cancelled" && existingBooking?.status !== "cancelled") {
      sendNotificationToRestaurant({
        restaurantId: booking.restaurant,
        type: RESTAURANT_NOTIFICATION_EVENTS.DINING_BOOKING_CANCELLED,
        bookingId: booking._id,
        eventKey: `${RESTAURANT_NOTIFICATION_EVENTS.DINING_BOOKING_CANCELLED}:${booking._id}`,
        redirectUrl: "/restaurant/reservations",
        metadata: {
          previousStatus: existingBooking?.status,
          status,
        },
        source: "diningController.updateBookingStatus",
      }).catch((err) => {
        console.error("Failed to create dining cancellation notification:", err);
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update booking status",
      error: error.message,
    });
  }
};

// Create a review for a completed booking
export const createDiningReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const userId = req.user._id;

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to review this booking",
      });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "You can only review completed bookings",
      });
    }

    const review = await DiningReview.create({
      booking: bookingId,
      user: userId,
      restaurant: booking.restaurant,
      rating,
      comment,
    });

    res.status(201).json({
      success: true,
      data: review,
    });

    sendNotificationToRestaurant({
      restaurantId: booking.restaurant,
      type: RESTAURANT_NOTIFICATION_EVENTS.NEW_REVIEW_RECEIVED,
      bookingId: booking._id,
      reviewId: review._id,
      eventKey: `${RESTAURANT_NOTIFICATION_EVENTS.NEW_REVIEW_RECEIVED}:dining:${review._id}`,
      redirectUrl: "/restaurant/reviews",
      metadata: {
        bookingId: booking._id,
        rating,
      },
      source: "diningController.createDiningReview",
    }).catch((err) => {
      console.error("Failed to create dining review notification:", err);
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create review",
      error: error.message,
    });
  }
};

/**
 * Send bill for a table booking (restaurant only).
 * Allowed only when status = dining_completed and bill not yet sent/paid.
 */
export const sendBill = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { billAmount, note } = req.body;
    const restaurantId = req.restaurant._id;

    if (!billAmount || typeof billAmount !== "number" || billAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid bill amount is required",
      });
    }

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.restaurant.toString() !== restaurantId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }
    if (booking.status !== "dining_completed") {
      return res.status(400).json({
        success: false,
        message: "Bill can only be sent when booking status is Dining Completed",
      });
    }
    if (booking.billStatus !== "not_sent") {
      return res.status(400).json({
        success: false,
        message: booking.paymentStatus === "paid" ? "Bill already paid" : "Bill already sent",
      });
    }

    booking.billAmount = billAmount;
    booking.discountAmount = 0;
    booking.finalAmount = billAmount;
    booking.billStatus = "pending";
    booking.billSentAt = new Date();
    if (note != null) booking.billNote = String(note).trim();
    await booking.save();

    res.status(200).json({
      success: true,
      message: "Bill sent successfully",
      data: booking,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send bill",
      error: error.message,
    });
  }
};

/**
 * Apply coupon to a pending dining bill (user).
 */
export const applyCoupon = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { code } = req.body;
    const userId = req.user._id || req.user.id;

    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    const booking = await TableBooking.findById(bookingId).populate("appliedCoupon");
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }
    if (booking.billStatus !== "pending" || booking.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "Coupon can only be applied to a pending, unpaid bill",
      });
    }

    const coupon = await DiningCoupon.findOne({ code: String(code).trim().toUpperCase() });
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Invalid coupon code" });
    }
    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: "This coupon is not active" });
    }
    if (coupon.expiryDate < new Date()) {
      return res.status(400).json({ success: false, message: "This coupon has expired" });
    }
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }
    if (booking.billAmount < (coupon.minBillAmount || 0)) {
      return res.status(400).json({
        success: false,
        message: `Minimum bill amount for this coupon is ₹${coupon.minBillAmount}`,
      });
    }

    let discount = 0;
    if (coupon.discountType === "percentage") {
      discount = (booking.billAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = Math.min(coupon.discountValue, booking.billAmount);
    }
    const finalAmount = Math.max(0, booking.billAmount - discount);

    const wasAlreadyApplied = booking.appliedCoupon && booking.appliedCoupon.toString() === coupon._id.toString();
    booking.appliedCoupon = coupon._id;
    booking.discountAmount = discount;
    booking.finalAmount = finalAmount;
    await booking.save();

    if (!wasAlreadyApplied) {
      coupon.usedCount += 1;
      await coupon.save();
    }

    res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: {
        discountAmount: discount,
        finalAmount,
        billAmount: booking.billAmount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to apply coupon",
      error: error.message,
    });
  }
};

/**
 * Create Razorpay order for dining bill payment (user).
 */
export const createDiningPaymentOrder = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user._id || req.user.id;

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }
    if (booking.billStatus !== "pending" || booking.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "No pending bill to pay for this booking",
      });
    }
    const amountToPay = booking.finalAmount;
    if (!amountToPay || amountToPay <= 0) {
      return res.status(400).json({ success: false, message: "Invalid payable amount" });
    }

    const amountInPaise = Math.round(amountToPay * 100);
    // Razorpay receipt must be <= 40 characters. Use a compact, deterministic format.
    let receipt = `dining_${booking._id.toString().slice(-8)}_${Date.now()
      .toString()
      .slice(-6)}`;
    if (receipt.length > 40) {
      receipt = receipt.slice(0, 40);
    }
    const razorpayOrder = await createRazorpayOrder({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: { bookingId: booking._id.toString(), type: "dining" },
    });

    booking.razorpayOrderId = razorpayOrder.id;
    await booking.save();

    const credentials = await getRazorpayCredentials();
    const keyId = credentials?.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;

    res.status(200).json({
      success: true,
      data: {
        orderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: "INR",
        key_id: keyId,
        finalAmount: amountToPay,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: error.message,
    });
  }
};

/**
 * Verify dining payment and update booking + commission (user).
 */
export const verifyDiningPayment = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user._id || req.user.id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are required",
      });
    }

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }
    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "Bill already paid" });
    }
    if (booking.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: "Payment order mismatch" });
    }

    const isValid = await verifyRazorpayPayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const restaurant = await Restaurant.findById(booking.restaurant)
      .select("diningCommissionPercentage")
      .lean();
    const commissionPercentage = restaurant?.diningCommissionPercentage ?? 0;
    const finalAmount = booking.finalAmount;
    const commissionAmount = (finalAmount * commissionPercentage) / 100;
    const restaurantEarning = finalAmount - commissionAmount;
    const adminEarning = commissionAmount;

    booking.paymentStatus = "paid";
    booking.billStatus = "completed";
    booking.paidAt = new Date();
    booking.razorpayOrderId = undefined;
    booking.commissionAmount = commissionAmount;
    booking.restaurantEarning = restaurantEarning;
    booking.adminEarning = adminEarning;
    await booking.save();

    // Credit restaurant wallet with dining earning so it can be withdrawn
    const wallet = await RestaurantWallet.findOrCreateByRestaurantId(booking.restaurant);
    wallet.addTransaction({
      amount: restaurantEarning,
      type: "payment",
      status: "Completed",
      description: `Dining bill #${booking.bookingId || booking._id}`,
    });
    await wallet.save();

    res.status(200).json({
      success: true,
      message: "Payment successful",
      data: {
        paymentStatus: "paid",
        paidAt: booking.paidAt,
        finalAmount,
        commissionAmount,
        restaurantEarning,
        adminEarning,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      error: error.message,
    });
  }
};

/**
 * Get dining offers (pre-book & walk-in) for a restaurant by slug (public)
 * GET /dining/restaurants/:slug/offers
 */
export const getDiningOffersBySlug = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug })
      .select("_id")
      .lean();
    if (!restaurant) {
      return res
        .status(404)
        .json({ success: false, message: "Restaurant not found" });
    }
    const offers = await RestaurantDiningOffer.find({
      restaurant: restaurant._id,
      isActive: true,
    })
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: offers });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};
