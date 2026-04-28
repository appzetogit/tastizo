import mongoose from 'mongoose';
import { FoodZone } from '../admin/models/zone.model.js';

const toFinite = (value) => {
    const numeric = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(numeric) ? numeric : null;
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
        .select('_id name zoneName serviceLocation coordinates isActive')
        .lean();

    for (const zone of zones) {
        const coordinates = Array.isArray(zone?.coordinates) ? zone.coordinates : [];
        if (coordinates.length < 3) continue;
        if (isPointInPolygon(lat, lng, coordinates)) {
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
    const coordinates = Array.isArray(zone?.coordinates) ? zone.coordinates : [];
    if (coordinates.length < 3) return false;
    return isPointInPolygon(point.lat, point.lng, coordinates);
};
