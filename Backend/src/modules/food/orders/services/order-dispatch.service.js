import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodDeliveryCashDeposit } from '../../delivery/models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryCashLimit } from '../../admin/models/deliveryCashLimit.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { config } from '../../../../config/env.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { addOrderJob } from '../../../../queues/producers/order.producer.js';
import {
  buildDeliverySocketPayload,
  buildOrderIdentityFilter,
  haversineKm,
  notifyOwnerSafely,
  notifyOwnersSafely,
} from './order.helpers.js';
import { resolveZoneFromAddressLike } from '../../shared/zoneResolver.js';

async function filterPartnersByCashLimit(partners = [], options = {}) {
  if (!Array.isArray(partners) || partners.length === 0) return [];
  const requiredAmount = Math.max(0, Number(options.requiredAmount || 0));
  const allowOverLimitFallback = options.allowOverLimitFallback !== false;

  const limitDoc = await FoodDeliveryCashLimit.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  const totalCashLimit = Number(limitDoc?.deliveryCashLimit || 0);

  // Treat missing/non-positive setting as "no cap" to avoid blocking all dispatch.
  if (!Number.isFinite(totalCashLimit) || totalCashLimit <= 0) {
    return partners.map((p) => ({
      ...p,
      availableCashLimit: Number.MAX_SAFE_INTEGER,
      allowOverLimit: false,
      requiredCashForOrder: requiredAmount,
    }));
  }

  const partnerIds = partners
    .map((p) => p?.partnerId || p?._id)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  if (partnerIds.length === 0) return [];

  const [cashAgg, depositsAgg] = await Promise.all([
    FoodOrder.aggregate([
      {
        $match: {
          'dispatch.deliveryPartnerId': { $in: partnerIds },
          orderStatus: 'delivered',
          'payment.method': 'cash',
        },
      },
      {
        $group: {
          _id: '$dispatch.deliveryPartnerId',
          grossCashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } },
        },
      },
    ]),
    FoodDeliveryCashDeposit.aggregate([
      {
        $match: {
          deliveryPartnerId: { $in: partnerIds },
          status: 'Completed',
        },
      },
      {
        $group: {
          _id: '$deliveryPartnerId',
          depositedCash: { $sum: { $ifNull: ['$amount', 0] } },
        },
      },
    ]),
  ]);

  const grossCashByPartner = new Map(
    (cashAgg || []).map((row) => [String(row._id), Number(row.grossCashCollected || 0)]),
  );
  const depositedByPartner = new Map(
    (depositsAgg || []).map((row) => [String(row._id), Number(row.depositedCash || 0)]),
  );

  const withCapacity = partners.map((p) => {
    const partnerId = String(p?.partnerId || p?._id || '');
    if (!partnerId) return null;
    const grossCash = grossCashByPartner.get(partnerId) || 0;
    const depositedCash = depositedByPartner.get(partnerId) || 0;
    const cashInHand = Math.max(0, grossCash - depositedCash);
    const availableCashLimit = Math.max(0, totalCashLimit - cashInHand);
    return {
      ...p,
      availableCashLimit,
      allowOverLimit: false,
      requiredCashForOrder: requiredAmount,
    };
  }).filter(Boolean);

  // Base block: riders with zero available limit should not receive fresh offers.
  const baseEligible = withCapacity.filter((p) => Number(p.availableCashLimit || 0) >= 0);
  if (baseEligible.length === 0) return [];

  if (requiredAmount <= 0) return baseEligible;

  const sufficient = baseEligible.filter(
    (p) => Number(p.availableCashLimit || 0) >= requiredAmount,
  );
  if (sufficient.length > 0) return sufficient;

  if (!allowOverLimitFallback) return [];

  // Fallback: keep order moving by offering to highest available-limit riders.
  return baseEligible
    .slice()
    .sort((a, b) => Number(b.availableCashLimit || 0) - Number(a.availableCashLimit || 0))
    .map((p) => ({
      ...p,
      allowOverLimit: true,
    }));
}

async function listNearbyOnlineDeliveryPartners(
  restaurantId,
  { maxKm = 15, limit = 25, requiredAmount = 0, allowOverLimitFallback = true, zoneId = null } = {},
) {
  const rId = (restaurantId?._id || restaurantId).toString();
  const restaurant = await FoodRestaurant.findById(rId)
    .select("location zoneId")
    .lean();

  const effectiveZoneId = String(zoneId || restaurant?.zoneId || '').trim();
  if (!effectiveZoneId || !mongoose.Types.ObjectId.isValid(effectiveZoneId)) {
    return { restaurant: restaurant || null, partners: [] };
  }

  if (!restaurant?.location?.coordinates?.length) {
    const busyPartnerIds = await FoodOrder.distinct('dispatch.deliveryPartnerId', {
      'dispatch.deliveryPartnerId': { $ne: null },
      'dispatch.status': 'accepted',
      orderStatus: {
        $nin: ['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'],
      },
    });

    const query = {
      status: "approved",
      availabilityStatus: "online",
      _id: { $nin: busyPartnerIds },
      $or: [
        { currentZoneId: new mongoose.Types.ObjectId(effectiveZoneId) },
        { zoneId: new mongoose.Types.ObjectId(effectiveZoneId), currentZoneId: { $in: [null, undefined] } }
      ]
    };

    const partners = await FoodDeliveryPartner.find(query)
      .select("_id status name")
      .limit(Math.max(1, limit))
      .lean();

    const cashEligiblePartners = await filterPartnersByCashLimit(
      partners.map((p) => ({ partnerId: p._id, ...p })),
      { requiredAmount, allowOverLimitFallback },
    );

    return {
      restaurant: null,
      partners: cashEligiblePartners.map((p) => ({ partnerId: p.partnerId || p._id, distanceKm: null })),
    };
  }

  const [rLng, rLat] = restaurant.location.coordinates;
  const busyPartnerIds = await FoodOrder.distinct('dispatch.deliveryPartnerId', {
    'dispatch.deliveryPartnerId': { $ne: null },
    'dispatch.status': 'accepted',
    orderStatus: {
      $nin: ['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'],
    },
  });

  const allOnline = await FoodDeliveryPartner.find({
    status: "approved",
    availabilityStatus: "online",
    _id: { $nin: busyPartnerIds },
    $or: [
      { currentZoneId: new mongoose.Types.ObjectId(effectiveZoneId) },
      { zoneId: new mongoose.Types.ObjectId(effectiveZoneId), currentZoneId: { $in: [null, undefined] } }
    ]
  })
    .select("_id status currentLat currentLng lastLocationUpdatedAt name")
    .lean();

  const scored = [];
  const STALE_GPS_MS = 15 * 60 * 1000; // Relaxed to 15 mins for better production resilience

  for (const p of allOnline) {
    const isStale = !p.lastLocationUpdatedAt || (Date.now() - new Date(p.lastLocationUpdatedAt).getTime()) > STALE_GPS_MS;
    if (p.currentLat == null || p.currentLng == null || isStale) {
      scored.push({ partnerId: p._id, distanceKm: 999, status: p.status });
      continue;
    }

    const d = haversineKm(rLat, rLng, p.currentLat, p.currentLng);
    if (Number.isFinite(d) && d <= maxKm) {
      scored.push({ partnerId: p._id, distanceKm: d, status: p.status });
    }
  }

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  const picked = scored.slice(0, Math.max(1, limit));

  if (picked.length === 0) {
    const anyOnline = await FoodDeliveryPartner.find({
      status: 'approved',
      availabilityStatus: "online",
      _id: { $nin: busyPartnerIds },
      $or: [
        { currentZoneId: new mongoose.Types.ObjectId(effectiveZoneId) },
        { zoneId: new mongoose.Types.ObjectId(effectiveZoneId), currentZoneId: { $in: [null, undefined] } }
      ]
    })
      .select("_id status name")
      .limit(Math.max(1, limit))
      .lean();

    return {
      partners: anyOnline.map((p) => ({
        partnerId: p._id,
        distanceKm: null,
        status: p.status,
      })),
    };
  }

  const cashEligibleFinal = await filterPartnersByCashLimit(picked, {
    requiredAmount,
    allowOverLimitFallback,
  });

  return { partners: cashEligibleFinal };
}

export async function getDispatchSettings() {
  return { dispatchMode: "auto" };
}

export async function updateDispatchSettings(dispatchMode, adminId) {
  // Always set to auto
  await FoodSettings.findOneAndUpdate(
    { key: "dispatch" },
    {
      $set: {
        dispatchMode: "auto",
        updatedBy: { role: "ADMIN", adminId, at: new Date() },
      },
    },
    { upsert: true, new: true },
  );
  return getDispatchSettings();
}

export async function tryAutoAssign(orderId, options = {}) {
  const attempt = options.attempt || 1;
  const lockTimeout = 55000; // 55 seconds lock interval

  const dispatchableStatuses = new Set([
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'ready',
    'picked_up',
  ]);

  const order = await FoodOrder.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(orderId),
      orderStatus: { $in: Array.from(dispatchableStatuses) },
      $or: [
        { 'dispatch.status': 'unassigned' },
        {
          'dispatch.status': 'assigned',
          'dispatch.acceptedAt': { $exists: false },
          'dispatch.assignedAt': { $lt: new Date(Date.now() - lockTimeout) }
        }
      ],
      'dispatch.dispatchingAt': { $exists: false }
    },
    {
      $set: { 'dispatch.dispatchingAt': new Date() }
    },
    { new: true }
  ).populate(['restaurantId', 'userId']);

  if (!order) {
    logger.info(`tryAutoAssign: Skip for ${orderId} (not dispatchable, already dispatching, accepted, or multi-attempt lock active).`);
    return null;
  }

  try {
    if (!order.zoneId) {
      const fallbackZone = await resolveZoneFromAddressLike(order.deliveryAddress);
      if (fallbackZone?._id) {
        order.zoneId = new mongoose.Types.ObjectId(String(fallbackZone._id));
        await order.save();
        logger.info('[Dispatch] Backfilled missing order zoneId', {
          orderId: String(order._id),
          orderZoneId: String(fallbackZone._id),
        });
      }
    }

    if (!order.zoneId) {
      logger.warn(`[Dispatch] Order ${order._id} has no zoneId and could not be resolved. Keeping pending.`);
      await addOrderJob({
        action: 'DISPATCH_TIMEOUT_CHECK',
        orderMongoId: order._id.toString(),
        orderId: order._id.toString(),
        attempt: attempt + 1
      }, { delay: 30000 });
      return order;
    }

    const offeredIds = (order.dispatch?.offeredTo || []).map(o => o.partnerId.toString());
    const paymentMethod = String(order.payment?.method || 'cash').toLowerCase();
    const isCashOrder = paymentMethod === 'cash';
    const requiredAmount = isCashOrder ? Number(order?.pricing?.total || 0) : 0;
    
    // RADIUS EXPANSION LOGIC
    // Attempt 1: 15km, Attempt 2: 25km, Attempt 3: 40km, Attempt 4+: 60km
    let maxKm = 15;
    if (attempt === 2) maxKm = 25;
    if (attempt === 3) maxKm = 40;
    if (attempt >= 4) maxKm = 60;

    const searchOptions = {
      maxKm,
      limit: 15,
      requiredAmount,
      allowOverLimitFallback: true,
    };
    const { partners } = await listNearbyOnlineDeliveryPartners(order.restaurantId, {
      ...searchOptions,
      zoneId: order.zoneId,
    });
    
    // Escalate only to admin after repeated same-zone sequential attempts.
    const isPhase3 = attempt >= 6; // ~3 minutes at 30s intervals

    if (isPhase3) {
      logger.error(`[CRITICAL] Order ${order._id} unassigned for ${attempt} mins. Triggering Admin Alert (Phase 3).`);
      // Notify Admin via Push (Web/Mobile)
      try {
        await notifyOwnersSafely(
          [{ ownerType: 'ADMIN', ownerId: 'GLOBAL' }], // Use GLOBAL or specific admin group if defined
          {
            title: 'Unassigned Order Crisis!',
            body: `Order #${order.order_id || order._id} has not been picked up for 5+ minutes. Manual intervention required!`,
            data: { type: 'admin_alert_unassigned', orderId: order._id.toString() }
          }
        );
      } catch (err) {
        logger.warn(`Admin notification failed: ${err.message}`);
      }
    }

    const eligible = partners.filter(p => !offeredIds.includes(p.partnerId.toString()));
    logger.info('[Dispatch] Eligible delivery boys for order', {
      orderId: String(order._id),
      orderZoneId: String(order.zoneId || ''),
      eligibleCount: eligible.length,
      assignedDeliveryBoyList: eligible.map((p) => ({
        partnerId: String(p.partnerId),
        distance: p.distanceKm,
        isOverLimit: p.allowOverLimit
      })),
      attempt,
    });

    if (eligible.length === 0) {
      logger.info(`tryAutoAssign: No NEW eligible partners in same zone for order ${order._id}. Restarting hunt...`);

      // Re-queue itself to keep trying
      await addOrderJob({
        action: 'DISPATCH_TIMEOUT_CHECK',
        orderMongoId: order._id.toString(),
        orderId: order._id.toString(),
        attempt: attempt + 1
      }, { delay: 30000 }); // Retry faster (30s) if no one found

      return order;
    }
    const io = getIO();
    const offeredAt = new Date();
    const offeredToEntries = eligible.map((partner) => ({
      partnerId: partner.partnerId,
      at: offeredAt,
      action: 'offered',
      allowOverLimit: Boolean(partner.allowOverLimit),
      requiredCashForOrder: Number(partner.requiredCashForOrder || requiredAmount || 0),
      distanceKm: Number.isFinite(Number(partner.distanceKm)) ? Number(partner.distanceKm) : null,
    }));

    if (eligible.length > 0) {
      logger.info(`[Dispatch] Offering order ${order._id} to zone ${String(order.zoneId || '')}`, {
        orderZoneId: String(order.zoneId || ''),
        assignedDeliveryBoyList: eligible.map((partner) => String(partner.partnerId)),
      });

      const payload = buildDeliverySocketPayload(order, order.restaurantId);
      const roomName = rooms.deliveryZone(String(order.zoneId));
      if (io) {
        const eventPayload = { 
          ...payload, 
          offeredAt: offeredAt, // Crucial for frontend timer
          eligibleDeliveryPartnerIds: eligible.map((partner) => String(partner.partnerId)),
          orderZoneId: String(order.zoneId || ''),
          dispatch: {
            ...order.dispatch,
            status: 'offered',
            offeredTo: [
              ...(order.dispatch?.offeredTo || []),
              ...offeredToEntries
            ]
          }
        };
        io.to(roomName).emit('new_order', eventPayload);
        io.to(roomName).emit('new_order_available', eventPayload);
      }
      await Promise.all(
        eligible.map(async (partner) => {
          try {
            await notifyOwnerSafely(
              { ownerType: 'DELIVERY_PARTNER', ownerId: partner.partnerId },
              {
                title: 'New order assigned!',
                body: `You have 30 seconds to accept Order #${order.order_id || order._id}.`,
                data: { type: 'new_order', orderId: order._id.toString(), orderZoneId: String(order.zoneId || '') },
              },
            );
          } catch (err) {
            logger.warn(`Push notification failed for partner ${partner.partnerId}: ${err.message}`);
          }
        }),
      );
    }

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    if (offeredToEntries.length > 0) {
      order.dispatch.offeredTo.push(...offeredToEntries);
    }
    await order.save();

    // Re-check in 30s
    await addOrderJob({
      action: 'DISPATCH_TIMEOUT_CHECK',
      orderMongoId: order._id.toString(),
      orderId: order._id.toString(),
      attempt: attempt + 1
    }, { delay: 30000 });

    return order;
  } finally {
    await FoodOrder.findByIdAndUpdate(orderId, {
      $unset: { 'dispatch.dispatchingAt': '' },
    });
  }
}


export async function processDispatchTimeout(orderId, partnerId) {
  const order = await FoodOrder.findById(orderId);
  if (!order) return;

  const stillAssigned = order.dispatch?.status === 'assigned' &&
    String(order.dispatch?.deliveryPartnerId) === String(partnerId) &&
    !order.dispatch?.acceptedAt;

  if (stillAssigned) {
    logger.info(`Dispatch timeout for partner ${partnerId} on order ${orderId}. Re-trying hunt...`);
    const offer = order.dispatch.offeredTo.find(
      o => String(o.partnerId) === String(partnerId) && o.action === 'offered'
    );
    if (offer) offer.action = 'timeout';

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    await order.save();
    
    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(orderId, { attempt });
  } else if (order.dispatch?.status === 'unassigned') {
    // If it's already unassigned (e.g. from a previous timeout), just keep hunting
    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(orderId, { attempt });
  }
}


export async function resendDeliveryNotificationRestaurant(orderId, restaurantId) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne({
    ...identity,
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });

  if (!order) throw new NotFoundError('Order not found');

  const activeStatuses = ['confirmed', 'preparing', 'ready_for_pickup', 'ready'];
  if (!activeStatuses.includes(order.orderStatus)) {
    throw new ValidationError(`Cannot resend notification for order in status: ${order.orderStatus}`);
  }

  if (order.dispatch?.status === 'accepted') {
    throw new ValidationError('A delivery partner has already accepted this order.');
  }

  const paymentMethod = String(order.payment?.method || 'cash').toLowerCase();
  const requiredAmount = paymentMethod === 'cash' ? Number(order?.pricing?.total || 0) : 0;
  const preview = await listNearbyOnlineDeliveryPartners(order.restaurantId, {
    maxKm: 15,
    limit: 15,
    requiredAmount,
    allowOverLimitFallback: true,
    zoneId: order.zoneId,
  });
  const shortlistedCount = Array.isArray(preview?.partners) ? preview.partners.length : 0;

  order.dispatch.status = 'unassigned';
  order.dispatch.deliveryPartnerId = null;
  order.dispatch.offeredTo = [];
  await order.save();

  await tryAutoAssign(order._id);

  const refreshed = await FoodOrder.findById(order._id)
    .select('dispatch.offeredTo dispatch.status dispatch.deliveryPartnerId')
    .lean();
  const notifiedCount = Array.isArray(refreshed?.dispatch?.offeredTo)
    ? refreshed.dispatch.offeredTo.filter((entry) => entry?.action === 'offered').length
    : 0;
  const notifiedPartnerIds = Array.isArray(refreshed?.dispatch?.offeredTo)
    ? refreshed.dispatch.offeredTo
        .filter((entry) => entry?.action === 'offered' && entry?.partnerId)
        .map((entry) => String(entry.partnerId))
    : [];
  const io = getIO();
  const connectedSocketCount = io
    ? notifiedPartnerIds.reduce((count, pid) => {
        const roomName = rooms.delivery(pid);
        const roomSize = io?.sockets?.adapter?.rooms?.get(roomName)?.size || 0;
        return count + roomSize;
      }, 0)
    : 0;

  return {
    success: true,
    notifiedCount,
    shortlistedCount,
    requiredAmount,
    connectedSocketCount,
    dispatchStatus: refreshed?.dispatch?.status || 'unassigned',
  };
}
