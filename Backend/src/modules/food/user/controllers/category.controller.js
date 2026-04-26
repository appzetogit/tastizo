import { FoodCategory } from '../../admin/models/category.model.js';
import { sendResponse } from '../../../../utils/response.js';

/**
 * Get all active categories for users
 * Only returns approved, active categories that are not bound to a specific restaurant
 */
export const getCategoriesController = async (req, res, next) => {
    try {
        console.log('📋 Fetching categories for users');
        
        // Query for public/global categories that users can see
        const query = {
            isActive: true,
            isApproved: true,
            // Only show global categories (not bound to specific restaurant)
            restaurantId: { $exists: false },
            // Exclude categories bound to specific restaurants
            createdByRestaurantId: { $exists: false }
        };

        const categories = await FoodCategory.find(query)
            .sort({ sortOrder: 1, name: 1 })
            .select('name image type foodTypeScope sortOrder')
            .lean();

        console.log(`📊 Found ${categories.length} categories for users`);

        return sendResponse(res, 200, 'Categories fetched successfully', { categories });
    } catch (error) {
        console.error('❌ Error fetching categories for users:', error);
        next(error);
    }
};

/**
 * Get category by ID for users
 */
export const getCategoryByIdController = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return sendResponse(res, 400, 'Category ID is required');
        }

        const query = {
            _id: id,
            isActive: true,
            isApproved: true,
            restaurantId: { $exists: false },
            createdByRestaurantId: { $exists: false }
        };

        const category = await FoodCategory.findOne(query)
            .select('name image type foodTypeScope sortOrder')
            .lean();

        if (!category) {
            return sendResponse(res, 404, 'Category not found');
        }

        return sendResponse(res, 200, 'Category fetched successfully', { category });
    } catch (error) {
        console.error('❌ Error fetching category by ID:', error);
        next(error);
    }
};
