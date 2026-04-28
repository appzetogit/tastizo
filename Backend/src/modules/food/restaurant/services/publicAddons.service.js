import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodAddon } from '../models/foodAddon.model.js';
import { pointLikeBelongsToZone, resolveZoneFromQuery } from '../../shared/zoneResolver.js';

const PUBLIC_VISIBLE_RESTAURANT_STATUSES = ['approved'];

const buildPublicVisibleRestaurantFilter = (extra = {}) => ({
    ...extra,
    $or: [
        { status: { $in: PUBLIC_VISIBLE_RESTAURANT_STATUSES } },
        { isAdminApproved: true }
    ]
});

const restaurantMatchesResolvedZone = (restaurant, resolvedZone) => {
    if (!restaurant || !resolvedZone?._id) return false;
    return pointLikeBelongsToZone(restaurant.location, resolvedZone);
};

export async function getPublicApprovedRestaurantAddons(restaurantIdOrSlug, zoneQuery = {}) {
    const value = String(restaurantIdOrSlug || '').trim();
    const resolvedZone = await resolveZoneFromQuery(zoneQuery || {});
    if (!value) throw new ValidationError('Restaurant id is required');
    if (!resolvedZone?._id) return null;
    let restaurant = null;
    if (/^[0-9a-fA-F]{24}$/.test(value)) {
        restaurant = await FoodRestaurant.findOne(buildPublicVisibleRestaurantFilter({ _id: value }))
            .select('_id status isAdminApproved zoneId location')
            .lean();
    } else {
        const normalized = value.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
        restaurant = await FoodRestaurant.findOne(buildPublicVisibleRestaurantFilter({ restaurantNameNormalized: normalized }))
            .select('_id status isAdminApproved zoneId location')
            .lean();
    }

    if (!restaurant?._id || !restaurantMatchesResolvedZone(restaurant, resolvedZone)) {
        return null;
    }

    const addons = await FoodAddon.find({
        restaurantId: new mongoose.Types.ObjectId(String(restaurant._id)),
        isDeleted: { $ne: true },
        approvalStatus: 'approved',
        isAvailable: true,
        published: { $ne: null }
    })
        .sort({ approvedAt: -1, updatedAt: -1 })
        .select('_id published')
        .lean();

    return (addons || [])
        .filter((a) => a && a.published)
        .map((a) => {
            const p = a.published;
            return {
                id: a._id,
                _id: a._id,
                name: p.name || '',
                description: p.description || '',
                price: Number(p.price) || 0,
                image: p.image || '',
                images: Array.isArray(p.images) ? p.images : []
            };
        });
}

