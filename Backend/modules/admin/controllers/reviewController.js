import Order from '../../order/models/Order.js';
import OrderReview from '../../order/models/OrderReview.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import mongoose from 'mongoose';

/**
 * Get all customer reviews (Admin)
 * GET /api/admin/reviews
 */
export const getAllReviews = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 20, restaurantId, rating, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query on canonical OrderReview collection
    const reviewQuery = {};
    
    if (restaurantId) {
      reviewQuery.restaurantId = restaurantId;
    }
    
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        reviewQuery.rating = ratingNum;
      }
    }
    
    // Sort options
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions.rating = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'submittedAt') {
      sortOptions.createdAt = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions.createdAt = -1; // Default: newest first
    }
    
    // Fetch reviews with pagination
    const reviews = await OrderReview.find(reviewQuery)
      .populate('userId', 'name phone email')
      .populate('restaurantId', 'name')
      .populate('orderId', 'orderId restaurantName items deliveredAt createdAt deliveryPartnerId')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    // Get total count
    const totalReviews = await OrderReview.countDocuments(reviewQuery);
    
    // Calculate average rating
    const avgRatingResult = await OrderReview.aggregate([
      { $match: reviewQuery },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: '$rating'
          }
        }
      }
    ]);
    
    let avgRating = 0;
    let ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    
    if (avgRatingResult.length > 0) {
      avgRating = avgRatingResult[0].avgRating || 0;
      const distribution = avgRatingResult[0].ratingDistribution || [];
      distribution.forEach(rating => {
        if (rating >= 1 && rating <= 5) {
          ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
        }
      });
    }
    
    return successResponse(res, 200, 'Reviews fetched successfully', {
      reviews: reviews.map((review) => ({
        orderId: review.orderId?.orderId || review.orderId?._id || review.orderId,
        orderMongoId: review.orderId?._id || review.orderId,
        restaurantId: review.restaurantId?._id || review.restaurantId,
        restaurantName: review.orderId?.restaurantName || review.restaurantName || review.restaurantId?.name,
        customer: {
          id: review.userId?._id || review.userId,
          name: review.userId?.name,
          phone: review.userId?.phone,
          email: review.userId?.email,
        },
        // Delivery partner and items are read from the linked order, when available
        deliveryPartner:
          review.orderId?.deliveryPartnerId || review.deliveryPartnerId
            ? {
                id:
                  review.orderId?.deliveryPartnerId?._id ||
                  review.orderId?.deliveryPartnerId ||
                  review.deliveryPartnerId?._id ||
                  review.deliveryPartnerId ||
                  null,
                name:
                  review.orderId?.deliveryPartnerId?.name ||
                  review.deliveryPartnerId?.name ||
                  null,
                phone:
                  review.orderId?.deliveryPartnerId?.phone ||
                  review.deliveryPartnerId?.phone ||
                  null,
              }
            : null,
        items: review.orderId?.items || review.items || [],
        rating: review.rating,
        comment: review.reviewText,
        submittedAt: review.createdAt,
        deliveredAt: review.orderId?.deliveredAt || null,
        createdAt: review.createdAt,
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalReviews / limitNum),
        totalReviews,
        limit: limitNum
      },
      statistics: {
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews,
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return errorResponse(res, 500, `Failed to fetch reviews: ${error.message}`);
  }
});

/**
 * Get review by order ID (Admin)
 * GET /api/admin/reviews/:orderId
 */
export const getReviewByOrderId = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findOne({
      $or: [{ orderId: orderId }, { _id: orderId }],
      status: 'delivered',
    })
      .select('orderId restaurantId restaurantName userId deliveredAt createdAt')
      .lean();
    
    if (!order) {
      return errorResponse(res, 404, 'Order not found for this ID');
    }
    
    const review = await OrderReview.findOne({
      orderId: order._id,
    })
      .populate('userId', 'name phone email')
      .populate('restaurantId', 'name')
      .lean();
    
    if (!review) {
      return errorResponse(res, 404, 'Review not found for this order');
    }
    
    return successResponse(res, 200, 'Review fetched successfully', {
      orderId: order.orderId,
      orderMongoId: order._id,
      restaurantId: review.restaurantId?._id || order.restaurantId,
      restaurantName: order.restaurantName || review.restaurantId?.name,
      customer: {
        id: review.userId?._id || order.userId,
        name: review.userId?.name,
        phone: review.userId?.phone,
        email: review.userId?.email,
      },
      rating: review.rating,
      comment: review.reviewText,
      submittedAt: review.createdAt,
      deliveredAt: order.deliveredAt,
      createdAt: review.createdAt,
    });
  } catch (error) {
    console.error('Error fetching review:', error);
    return errorResponse(res, 500, `Failed to fetch review: ${error.message}`);
  }
});

/**
 * Get reviews by restaurant ID (Admin)
 * GET /api/admin/reviews/restaurant/:restaurantId
 */
export const getReviewsByRestaurant = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { page = 1, limit = 20, rating, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query on canonical OrderReview collection for this restaurant
    const reviewQuery = {
      restaurantId: restaurantId,
    };
    
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        reviewQuery.rating = ratingNum;
      }
    }
    
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions.rating = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'submittedAt') {
      sortOptions.createdAt = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions.createdAt = -1;
    }
    
    const reviews = await OrderReview.find(reviewQuery)
      .populate('userId', 'name phone email')
      .populate('restaurantId', 'name')
      .populate('orderId', 'orderId deliveredAt createdAt')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const totalReviews = await OrderReview.countDocuments(reviewQuery);
    
    const avgRatingResult = await OrderReview.aggregate([
      { $match: reviewQuery },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: '$rating'
          }
        }
      }
    ]);
    
    let avgRating = 0;
    let ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    
    if (avgRatingResult.length > 0) {
      avgRating = avgRatingResult[0].avgRating || 0;
      const distribution = avgRatingResult[0].ratingDistribution || [];
      distribution.forEach((r) => {
        if (r >= 1 && r <= 5) {
          ratingDistribution[r] = (ratingDistribution[r] || 0) + 1;
        }
      });
    }
    
    return successResponse(res, 200, 'Restaurant reviews fetched successfully', {
      reviews: reviews.map((review) => ({
        orderId: review.orderId?.orderId || review.orderId?._id || review.orderId,
        orderMongoId: review.orderId?._id || review.orderId,
        restaurantId: review.restaurantId?._id || review.restaurantId,
        restaurantName: review.orderId?.restaurantName || review.restaurantId?.name,
        customer: {
          id: review.userId?._id || review.userId,
          name: review.userId?.name,
          phone: review.userId?.phone,
          email: review.userId?.email
        },
        rating: review.rating,
        comment: review.reviewText,
        submittedAt: review.createdAt,
        deliveredAt: review.orderId?.deliveredAt || null,
        createdAt: review.createdAt
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalReviews / limitNum),
        totalReviews,
        limit: limitNum
      },
      statistics: {
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews,
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching restaurant reviews:', error);
    return errorResponse(res, 500, `Failed to fetch restaurant reviews: ${error.message}`);
  }
});

/**
 * Get all deliveryman reviews (Admin)
 * GET /api/admin/delivery-partners/reviews
 */
export const getDeliverymanReviews = asyncHandler(async (req, res) => {
  try {
    // Verify Order model is available
    if (!Order) {
      console.error('❌ Order model is not available');
      return errorResponse(res, 500, 'Order model not available');
    }
    
    const { page = 1, limit = 100, deliveryPartnerId, rating, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query - orders with deliveryPartnerId and review.rating
    const query = {
      status: 'delivered',
      deliveryPartnerId: { $exists: true, $ne: null },
      'review.rating': { $exists: true, $ne: null }
    };
    if (deliveryPartnerId) {
      // Handle both string and ObjectId formats
      if (mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        query.deliveryPartnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
      } else {
        query.deliveryPartnerId = deliveryPartnerId;
      }
    }
    
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        query['review.rating'] = ratingNum;
      }
    }
    
    // Sort options
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions['review.rating'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'submittedAt') {
      sortOptions['review.submittedAt'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions['review.submittedAt'] = -1; // Default: newest first
    }
    // Fetch reviews with pagination
    const reviews = await Order.find(query)
      .populate('deliveryPartnerId', 'name phone')
      .populate('userId', 'name phone email')
      .select('orderId deliveryPartnerId userId review deliveredAt createdAt')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    // Get total count
    const totalReviews = await Order.countDocuments(query);
    // Transform data for frontend
    const transformedReviews = reviews.map((review, index) => {
      try {
        const deliveryPartner = review.deliveryPartnerId;
        const user = review.userId;
        const reviewData = review.review || {};
        
        // Extract deliveryman ID properly
        let deliverymanIdValue = null;
        if (deliveryPartner) {
          if (typeof deliveryPartner === 'object' && deliveryPartner._id) {
            deliverymanIdValue = deliveryPartner._id.toString();
          } else if (typeof deliveryPartner === 'string') {
            deliverymanIdValue = deliveryPartner;
          } else if (deliveryPartner) {
            deliverymanIdValue = String(deliveryPartner);
          }
        }
        
        return {
          sl: skip + index + 1,
          deliveryman: (deliveryPartner && typeof deliveryPartner === 'object' ? deliveryPartner.name : null) || 'Unknown Deliveryman',
          deliverymanId: deliverymanIdValue,
          deliverymanPhone: (deliveryPartner && typeof deliveryPartner === 'object' ? deliveryPartner.phone : null) || '',
          customer: (user && typeof user === 'object' ? user.name : null) || 'Unknown Customer',
          customerId: (user && typeof user === 'object' ? user._id : user) || null,
          customerPhone: (user && typeof user === 'object' ? user.phone : null) || '',
          review: reviewData.comment || '',
          rating: reviewData.rating || 0,
          orderId: review.orderId || null,
          submittedAt: reviewData.submittedAt || review.deliveredAt || review.createdAt || new Date(),
          deliveredAt: review.deliveredAt || null
        };
      } catch (transformError) {
        console.error(`❌ Error transforming review at index ${index}:`, transformError);
        // Return a safe default object
        return {
          sl: skip + index + 1,
          deliveryman: 'Unknown Deliveryman',
          deliverymanId: null,
          deliverymanPhone: '',
          customer: 'Unknown Customer',
          customerId: null,
          customerPhone: '',
          review: '',
          rating: 0,
          orderId: review.orderId || null,
          submittedAt: review.createdAt || new Date(),
          deliveredAt: review.deliveredAt || null
        };
      }
    });
    return successResponse(res, 200, 'Deliveryman reviews fetched successfully', {
      reviews: transformedReviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalReviews,
        pages: Math.ceil(totalReviews / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching deliveryman reviews:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return errorResponse(res, 500, `Failed to fetch deliveryman reviews: ${error.message}`);
  }
});