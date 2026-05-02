import mongoose from 'mongoose';
import { FoodZone } from '../admin/models/zone.model.js';

const toFinite = (value) => {
    const numeric = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(numeric) ? numeric : null;
};

const haversineKm = (lat1, lng1, lat2, lng2) => {
    const earthRadiusKm = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
};

const isPointInPolygon = (lat, lng, polygon) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = Number(polygon[i]?.longitude);
        const yi = Number(polygon[i]?.latitude);
        const xj = Number(polygon[j]?.longitude);
        const yj = Number(polygon[j]?.latitude);
        if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

        const intersects =
            yi > lat !== yj > lat &&
            lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
        if (intersects) inside = !inside;
    }

    return inside;
};

const matchesRadiusZone = (lat, lng, zone) => {
    const centerLat = toFinite(zone?.center?.latitude);
    const centerLng = toFinite(zone?.center?.longitude);
    const radius = toFinite(zone?.radius);
    if (centerLat === null || centerLng === null || radius === null || radius <= 0) return false;

    const unit = String(zone?.unit || 'kilometer').toLowerCase();
    const radiusKm = unit === 'miles' ? radius * 1.60934 : radius;
    return haversineKm(lat, lng, centerLat, centerLng) <= radiusKm;
};

const matchesPolygonZone = (lat, lng, zone) => {
    const coordinates = Array.isArray(zone?.coordinates) ? zone.coordinates : [];
    if (coordinates.length < 3) return false;
    return isPointInPolygon(lat, lng, coordinates);
};

export const zoneMatchesCoordinates = (zone, latInput, lngInput) => {
    const lat = toFinite(latInput);
    const lng = toFinite(lngInput);
    if (!zone || lat === null || lng === null) return false;

    const coverageType = String(zone?.coverageType || '').toLowerCase();
    if (coverageType === 'radius') {
        return matchesRadiusZone(lat, lng, zone);
    }

    if (matchesPolygonZone(lat, lng, zone)) return true;
    return matchesRadiusZone(lat, lng, zone);
};

export const extractLatLngFromPointLike = (pointLike) => {
    if (!pointLike || typeof pointLike !== 'object') return null;

    const coords = pointLike?.coordinates || pointLike?.location?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
        const lng = toFinite(coords[0]);
        const lat = toFinite(coords[1]);
        if (lat !== null && lng !== null) return { lat, lng };
    }

    const lat = toFinite(
        pointLike?.latitude ??
        pointLike?.lat ??
        pointLike?.location?.latitude ??
        pointLike?.location?.lat,
    );
    const lng = toFinite(
        pointLike?.longitude ??
        pointLike?.lng ??
        pointLike?.location?.longitude ??
        pointLike?.location?.lng,
    );

    if (lat !== null && lng !== null) return { lat, lng };
    return null;
};

export const resolveActiveZoneByCoordinates = async (latInput, lngInput) => {
    const lat = toFinite(latInput);
    const lng = toFinite(lngInput);
    if (lat === null || lng === null) return null;

    const zones = await FoodZone.find({ isActive: true })
        .select('_id name zoneName serviceLocation coverageType coordinates center radius unit isActive')
        .lean();

    for (const zone of zones) {
        if (zoneMatchesCoordinates(zone, lat, lng)) {
            return zone;
        }
    }

    return null;
};

export const resolveZoneFromQuery = async (query = {}) => {
    const lat = toFinite(query?.lat);
    const lng = toFinite(query?.lng);
    if (lat !== null && lng !== null) {
        return resolveActiveZoneByCoordinates(lat, lng);
    }

    const explicitZoneId = String(query?.zoneId || '').trim();
    if (explicitZoneId && mongoose.Types.ObjectId.isValid(explicitZoneId)) {
        const zone = await FoodZone.findOne({ _id: explicitZoneId, isActive: true })
            .select('_id name zoneName serviceLocation isActive')
            .lean();
        if (zone) return zone;
    }

    return null;
};

export const resolveZoneFromAddressLike = async (addressLike) => {
    const point = extractLatLngFromPointLike(addressLike);
    if (!point) return null;
    return resolveActiveZoneByCoordinates(point.lat, point.lng);
};

export const pointLikeBelongsToZone = (pointLike, zone) => {
    if (!zone || typeof zone !== 'object') return false;
    const point = extractLatLngFromPointLike(pointLike);
    if (!point) return false;
    return zoneMatchesCoordinates(zone, point.lat, point.lng);
};

export const restaurantBelongsToResolvedZone = (restaurant, zone) => {
    if (!restaurant || !zone?._id) return false;

    const restaurantZoneId =
        restaurant?.zoneId?._id ??
        restaurant?.zoneId?.id ??
        restaurant?.zoneId;

    if (restaurantZoneId && String(restaurantZoneId) === String(zone._id)) {
        return true;
    }

    return pointLikeBelongsToZone(restaurant.location, zone);
};
