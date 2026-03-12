import mongoose from "mongoose";
import TableBooking from "../../dining/models/TableBooking.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";

/**
 * Get dining earnings summary and list (admin)
 * GET /api/admin/dining-earnings
 * Query: restaurantId, startDate, endDate, page, limit
 * restaurantId can be MongoDB _id or restaurant's custom restaurantId string
 */
export const getDiningEarnings = asyncHandler(async (req, res) => {
  const { restaurantId, startDate, endDate, page = 1, limit = 20 } = req.query;
  const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, Math.min(100, parseInt(limit, 10)));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));

  const match = { paymentStatus: "paid", billStatus: "completed" };
  if (restaurantId && restaurantId.trim()) {
    const id = restaurantId.trim();
    // If valid MongoDB ObjectId, use directly
    if (mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id) {
      match.restaurant = id;
    } else {
      // Otherwise lookup by restaurant's custom restaurantId or name
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const restaurant = await Restaurant.findOne({
        $or: [
          { restaurantId: { $regex: new RegExp(`^${escaped}$`, "i") } },
          { name: { $regex: new RegExp(escaped, "i") } },
        ],
      }).select("_id").lean();
      if (restaurant) {
        match.restaurant = restaurant._id;
      } else {
        // No restaurant found - return empty by matching impossible condition
        match.restaurant = { $in: [] };
      }
    }
  }
  if (startDate || endDate) {
    match.paidAt = {};
    if (startDate) match.paidAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.paidAt.$lte = end;
    }
  }

  const [summary, list, total] = await Promise.all([
    TableBooking.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalDiningRevenue: { $sum: "$finalAmount" },
          totalDiscountGiven: { $sum: "$discountAmount" },
          totalCommissionEarned: { $sum: "$adminEarning" },
          totalRestaurantEarnings: { $sum: "$restaurantEarning" },
          count: { $sum: 1 },
        },
      },
    ]),
    TableBooking.find(match)
      .populate("restaurant", "name slug")
      .populate("user", "name phone email")
      .sort({ paidAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    TableBooking.countDocuments(match),
  ]);

  const stats = summary[0] || {
    totalDiningRevenue: 0,
    totalDiscountGiven: 0,
    totalCommissionEarned: 0,
    totalRestaurantEarnings: 0,
    count: 0,
  };

  return successResponse(res, 200, "Dining earnings fetched", {
    summary: {
      totalDiningRevenue: stats.totalDiningRevenue,
      totalDiscountGiven: stats.totalDiscountGiven,
      totalCommissionEarned: stats.totalCommissionEarned,
      totalRestaurantEarnings: stats.totalRestaurantEarnings,
      totalTransactions: stats.count,
    },
    data: list,
    pagination: {
      page: Math.max(1, parseInt(page, 10)),
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});
