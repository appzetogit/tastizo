import jwtService from '../../auth/services/jwtService.js';
import Restaurant from '../models/Restaurant.js';
import { errorResponse } from '../../../shared/utils/response.js';

/**
 * Restaurant Authentication Middleware
 * Verifies JWT access token and attaches restaurant to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Ensure it's a restaurant token
    if (decoded.role !== 'restaurant') {
      return errorResponse(res, 403, 'Invalid token. Restaurant access required.');
    }

    // Get restaurant from database
    const restaurant = await Restaurant.findById(decoded.userId).select('-password');
    
    if (!restaurant) {
      console.error('❌ Restaurant not found in database:', {
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email,
      });
      return errorResponse(res, 401, 'Restaurant not found');
    }

    // Allow inactive restaurants to access only onboarding + verification status routes.
    // Everything else must wait until admin approval.
    const requestPath = req.originalUrl || req.url || '';
    const reqPath = req.path || '';
    const baseUrl = req.baseUrl || '';
    
    // Check for onboarding routes (can be /onboarding or /api/restaurant/onboarding)
    const isOnboardingRoute = requestPath.includes('/onboarding') || reqPath === '/onboarding' || reqPath.includes('onboarding');
    
    // Check for verification routes:
    // - /api/restaurant/auth/me
    // - /api/restaurant/auth/reverify
    // - /api/restaurant/owner/me
    const isVerificationRoute =
      requestPath.includes('/auth/me') ||
      requestPath.includes('/auth/reverify') ||
      requestPath.includes('/owner/me') ||
      reqPath === '/me' ||
      reqPath === '/reverify' ||
      reqPath === '/owner/me' ||
      (baseUrl.includes('/auth') && (reqPath === '/me' || reqPath === '/reverify'));
    
    // Debug logging for inactive restaurants
    if (!restaurant.isActive) {
    }
    
    if (!restaurant.isActive && !isOnboardingRoute && !isVerificationRoute) {
      console.error('❌ Restaurant account is inactive - access denied:', {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        isActive: restaurant.isActive,
        rejectionReason: restaurant.rejectionReason || null,
        requestPath,
        reqPath,
        baseUrl,
        originalUrl: req.originalUrl,
        url: req.url,
        routeChecks: {
          isOnboardingRoute,
          isVerificationRoute,
        }
      });
      const rejectionReason = (restaurant.rejectionReason || '').trim();
      const message = rejectionReason
        ? `Restaurant verification rejected by admin. Reason: ${rejectionReason}`
        : 'Restaurant account is under verification. Please wait for admin approval.';
      return errorResponse(res, 403, message);
    }

    // Attach restaurant to request
    req.restaurant = restaurant;
    req.token = decoded;
    
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

export default { authenticate };

