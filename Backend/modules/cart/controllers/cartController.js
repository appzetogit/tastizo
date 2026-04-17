import Cart from "../models/Cart.js";
import User from "../../auth/models/User.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import {
  buildCartResponse,
  ensureUserObjectId,
  mergeCartItems,
  normalizeCartPayload,
  sanitizeMergedGuestSessions,
} from "../services/cartService.js";

async function getValidatedUser(req) {
  const authenticatedUserId = String(req.user?._id || req.user?.id || "");
  const validatedUserId = String(req.token?.userId || "");

  if (!authenticatedUserId || !validatedUserId) {
    throw new Error("Authenticated user is missing.");
  }

  if (authenticatedUserId !== validatedUserId) {
    throw new Error("Authenticated user identity mismatch.");
  }

  const user = await User.findById(ensureUserObjectId(authenticatedUserId)).select(
    "_id phone role isActive",
  );

  if (!user || !user.isActive) {
    throw new Error("Authenticated user is not available.");
  }

  return user;
}

export const getCart = asyncHandler(async (req, res) => {
  try {
    const user = await getValidatedUser(req);
    const cartDoc = await Cart.findOne({ userId: user._id });

    return successResponse(res, 200, "Cart retrieved successfully", {
      cart: buildCartResponse(cartDoc, user),
    });
  } catch (error) {
    return errorResponse(res, 401, error.message || "Unable to validate cart owner");
  }
});

export const replaceCart = asyncHandler(async (req, res) => {
  try {
    const user = await getValidatedUser(req);
    const normalizedPayload = normalizeCartPayload(req.body || {});

    const cartDoc = await Cart.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          ownerType: "authenticated",
          ownerPhone: user.phone || null,
          restaurantId: normalizedPayload.restaurantId,
          restaurantName: normalizedPayload.restaurantName,
          zoneId: normalizedPayload.zoneId,
          items: normalizedPayload.items,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    return successResponse(res, 200, "Cart saved successfully", {
      cart: buildCartResponse(cartDoc, user),
    });
  } catch (error) {
    return errorResponse(res, 400, error.message || "Unable to save cart");
  }
});

export const mergeGuestCart = asyncHandler(async (req, res) => {
  try {
    const user = await getValidatedUser(req);
    const guestSessionId = String(req.body?.guestSessionId || "").trim();

    if (!guestSessionId) {
      return errorResponse(res, 400, "guestSessionId is required");
    }

    const normalizedGuestCart = normalizeCartPayload(req.body?.guestCart || {});
    let cartDoc = await Cart.findOne({ userId: user._id });

    if (!cartDoc) {
      cartDoc = await Cart.create({
        userId: user._id,
        ownerType: "authenticated",
        ownerPhone: user.phone || null,
        restaurantId: null,
        restaurantName: null,
        zoneId: null,
        items: [],
        mergedGuestSessions: [],
      });
    }

    const alreadyMerged = (cartDoc.mergedGuestSessions || []).includes(guestSessionId);
    if (alreadyMerged) {
      return successResponse(res, 200, "Guest cart already merged", {
        cart: buildCartResponse(cartDoc, user),
        merge: {
          merged: false,
          reason: "already_merged",
          mergedCount: 0,
          skippedCount: 0,
        },
      });
    }

    const existingRestaurantId = cartDoc.restaurantId || null;
    const existingRestaurantName = cartDoc.restaurantName || null;
    const guestRestaurantId = normalizedGuestCart.restaurantId || null;
    const guestRestaurantName = normalizedGuestCart.restaurantName || null;

    const restaurantMismatch =
      cartDoc.items.length > 0 &&
      ((existingRestaurantId &&
        guestRestaurantId &&
        String(existingRestaurantId) !== String(guestRestaurantId)) ||
        (existingRestaurantName &&
          guestRestaurantName &&
          String(existingRestaurantName).trim().toLowerCase() !==
            String(guestRestaurantName).trim().toLowerCase()));

    if (restaurantMismatch) {
      cartDoc.mergedGuestSessions = sanitizeMergedGuestSessions(
        cartDoc.mergedGuestSessions,
        guestSessionId,
      );
      cartDoc.lastMergedAt = new Date();
      await cartDoc.save();

      return successResponse(res, 200, "Guest cart merge skipped", {
        cart: buildCartResponse(cartDoc, user),
        merge: {
          merged: false,
          reason: "restaurant_mismatch",
          mergedCount: 0,
          skippedCount: normalizedGuestCart.items.length,
        },
      });
    }

    const mergedResult = mergeCartItems(cartDoc.items, normalizedGuestCart.items);
    cartDoc.ownerPhone = user.phone || cartDoc.ownerPhone || null;
    cartDoc.items = mergedResult.items;
    cartDoc.restaurantId =
      cartDoc.restaurantId ||
      normalizedGuestCart.restaurantId ||
      null;
    cartDoc.restaurantName =
      cartDoc.restaurantName ||
      normalizedGuestCart.restaurantName ||
      null;
    cartDoc.zoneId = normalizedGuestCart.zoneId || cartDoc.zoneId || null;
    cartDoc.mergedGuestSessions = sanitizeMergedGuestSessions(
      cartDoc.mergedGuestSessions,
      guestSessionId,
    );
    cartDoc.lastMergedAt = new Date();
    await cartDoc.save();

    return successResponse(res, 200, "Guest cart merged successfully", {
      cart: buildCartResponse(cartDoc, user),
      merge: {
        merged: true,
        reason: "merged",
        mergedCount: mergedResult.mergedCount,
        skippedCount: 0,
      },
    });
  } catch (error) {
    return errorResponse(res, 400, error.message || "Unable to merge guest cart");
  }
});
