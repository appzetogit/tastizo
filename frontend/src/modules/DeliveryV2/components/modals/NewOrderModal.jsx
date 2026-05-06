import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { User, MapPin, FastForward, Clock, Phone, ChefHat, ChevronDown } from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { getHaversineDistance, calculateETA } from '@/modules/DeliveryV2/utils/geo';
import { formatCurrency } from '@food/utils/currency';

const DELIVERY_OFFER_TTL_SECONDS = 30;

/**
 * NewOrderModal - Ported to Original 1:1 Theme with Slider Accept.
 * Matches the Zomato/Swiggy style Green Header + White Card.
 */
export const NewOrderModal = ({ order, onAccept, onReject, onMinimize }) => {
  const { riderLocation } = useDeliveryStore();
  const formatMoney = (value) =>
    formatCurrency(Number(value) || 0, "\u20B9").replace("\u20B9 ", "\u20B9");
  const resolveEstimatedEarning = (orderLike) =>
    Number(
      orderLike?.earnings ??
        orderLike?.riderEarning ??
        orderLike?.deliveryEarning ??
        orderLike?.earningAmount ??
        orderLike?.amount ??
        orderLike?.deliveryFee ??
        orderLike?.pricing?.deliveryFee ??
        0,
    );

  const { deliveryPartner } = useDeliveryStore();
  const partnerId = deliveryPartner?._id || deliveryPartner?.partnerId || deliveryPartner?.id;

  const [timeLeft, setTimeLeft] = useState(DELIVERY_OFFER_TTL_SECONDS);
  const expiryHandledRef = useRef(false);

  const resolveOfferStartTime = useCallback(() => {
    if (!order) return null;

    let startTime = order.offeredAt || order.createdAt;

    if (partnerId && Array.isArray(order.dispatch?.offeredTo)) {
      const myOffer = [...order.dispatch.offeredTo]
        .reverse()
        .find((o) => String(o.partnerId) === String(partnerId));
      if (myOffer?.at) startTime = myOffer.at;
    }

    const startedAt = new Date(startTime).getTime();
    return Number.isFinite(startedAt) ? startedAt : null;
  }, [order, partnerId]);

  useEffect(() => {
    expiryHandledRef.current = false;
  }, [order]);

  useEffect(() => {
    if (!order) return undefined;

    const startedAt = resolveOfferStartTime();
    const computeRemaining = () => {
      if (!startedAt) return DELIVERY_OFFER_TTL_SECONDS;
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      return Math.max(0, DELIVERY_OFFER_TTL_SECONDS - elapsedSeconds);
    };

    const syncRemainingTime = () => {
      setTimeLeft(computeRemaining());
    };

    syncRemainingTime();

    const timer = window.setInterval(syncRemainingTime, 1000);
    window.addEventListener('focus', syncRemainingTime);
    window.addEventListener('pageshow', syncRemainingTime);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', syncRemainingTime);
    }

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncRemainingTime);
      window.removeEventListener('pageshow', syncRemainingTime);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', syncRemainingTime);
      }
    };
  }, [order, resolveOfferStartTime]);

  useEffect(() => {
    if (!order || timeLeft > 0 || expiryHandledRef.current) return;
    expiryHandledRef.current = true;
    onReject();
  }, [order, timeLeft, onReject]);

  const { distanceKm, etaMins } = useMemo(() => {
    if (!order) return { distanceKm: null, etaMins: null };

    // A. Use provided data if available (Direct distance from socket)
    const rawDist = order.pickupDistanceKm || order.distanceKm;
    const rawEta = order.estimatedTime || order.duration || order.eta;
    
    if (rawDist != null) {
      return { 
        distanceKm: Number(rawDist).toFixed(1), 
        etaMins: rawEta && rawEta > 0 ? Math.ceil(rawEta) : Math.ceil((rawDist * 1000) / 416) + 5
      };
    }

    // B. Calculate from locations (Local calculation fallback)
    const rest = order.restaurantLocation || order.restaurantId?.location || {};
    const resLat = parseFloat(order.restaurant_lat || order.restaurantLat || rest.latitude || rest.lat);
    const resLng = parseFloat(order.restaurant_lng || order.restaurantLng || rest.longitude || rest.lng);

    if (riderLocation && !isNaN(resLat) && !isNaN(resLng)) {
      const distM = getHaversineDistance(
        riderLocation.lat, riderLocation.lng,
        resLat, resLng
      );
      const km = distM / 1000;
      // Assume 25km/h avg for initial estimate (roughly 416m/min)
      const mins = Math.ceil(distM / 416) + (order.prepTime || 5);
      
      return { 
        distanceKm: km.toFixed(1), 
        etaMins: mins 
      };
    }

    return { distanceKm: '??', etaMins: order.prepTime || 15 };
  }, [order, riderLocation]);

  if (!order) return null;

  const earnings = resolveEstimatedEarning(order);
  const restaurantName = order.restaurantName || order.restaurant_name || (order.restaurantId?.name) || 'Restaurant';
  const restaurantAddress = order.restaurantAddress || order.restaurant_address || (order.restaurantId?.location?.address) || 'Address not available';
  const deliveryAddress = order?.deliveryAddress || {};

  const geoCoords =
    Array.isArray(deliveryAddress?.location?.coordinates) &&
    deliveryAddress.location.coordinates.length >= 2
      ? {
          lng: deliveryAddress.location.coordinates[0],
          lat: deliveryAddress.location.coordinates[1],
        }
      : null;

  const customerLocation = order.customerLocation || order.deliveryLocation || geoCoords || null;

  const addressPartsFromSchema = [
    deliveryAddress.street,
    deliveryAddress.additionalDetails,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  const customerAddress =
    order.customerAddress ||
    order.customer_address ||
    (addressPartsFromSchema.length ? addressPartsFromSchema.join(', ') : '') ||
    (customerLocation?.lat != null && customerLocation?.lng != null
      ? `Lat ${Number(customerLocation.lat).toFixed(5)}, Lng ${Number(customerLocation.lng).toFixed(5)}`
      : 'Location not available');

  const mapsLink =
    customerLocation?.lat != null && customerLocation?.lng != null
      ? `https://www.google.com/maps?q=${encodeURIComponent(
          `${customerLocation.lat},${customerLocation.lng}`,
        )}`
      : null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[1000] bg-black/60 flex items-end justify-center p-0 pointer-events-auto"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
        pointerEvents: 'auto',
      }}
    >
      <div 
        className="w-full max-w-md sm:max-w-lg bg-white rounded-t-3xl sm:rounded-t-[3rem] overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.5)] flex flex-col pt-1 sm:pt-2"
        style={{
          width: '100%',
          maxWidth: '32rem',
          background: '#ffffff',
          borderTopLeftRadius: '1.5rem',
          borderTopRightRadius: '1.5rem',
          overflow: 'hidden',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: '0.25rem',
        }}
      >
        {/* Handle / Minimize */}
        <div className="w-full flex justify-center pb-1.5 pt-1 bg-white relative z-10 rounded-t-3xl sm:rounded-t-[3rem] -mb-1">
          <button onClick={onMinimize} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
             <ChevronDown className="w-6 h-6 text-gray-400 stroke-3" />
          </button>
        </div>

        {/* Header Ribbon (Old Green Style) */}
        <div 
          className="p-4 sm:p-8 flex justify-between items-center text-white border-b border-white/10"
          style={{ background: 'linear-gradient(33deg, #15498b 0%, #000000 100%)' }}
        >
          <div>
            <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-1">Incoming Request</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tighter">{formatMoney(earnings)}</h2>
          </div>
          <div className="min-w-[72px] sm:min-w-[92px] min-h-[56px] sm:min-h-[68px] bg-white/20 border border-white/30 rounded-2xl sm:rounded-3xl px-3 sm:px-6 py-2 sm:py-3 text-white font-bold text-lg sm:text-2xl shadow-inner tabular-nums flex items-center justify-center leading-none text-center">
            <span className="block leading-none">{timeLeft}s</span>
          </div>
        </div>

        {/* Info Body */}
        <div className="p-4 sm:p-8 pb-6 sm:pb-12 space-y-5 sm:space-y-10 overflow-y-auto max-h-[78vh]">
          <div className="flex gap-3 sm:gap-6">
            <div className="flex flex-col items-center gap-1.5 mt-2 py-1">
              <div className="w-5 h-5 rounded-full bg-green-500 border-4 border-green-50 shadow-lg shadow-green-500/20" />
              <div className="w-0.5 h-16 bg-dashed border-l-2 border-gray-100" />
              <div className="w-5 h-5 rounded-full bg-blue-500 border-4 border-blue-50 shadow-lg shadow-blue-500/20" />
            </div>
            <div className="flex-1 space-y-5 sm:space-y-10">
              <div>
                <div className="flex items-center gap-2 mb-2 font-bold text-[10px] uppercase tracking-widest text-green-600">
                  <ChefHat className="w-4 h-4" />
                  <span>Restaurant Pickup</span>
                </div>
                <p className="text-gray-950 font-bold text-base sm:text-xl leading-tight">{restaurantName}</p>
                <p className="text-gray-500 text-sm font-medium leading-relaxed">{restaurantAddress}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2 font-bold text-[10px] uppercase tracking-widest text-blue-600">
                  <MapPin className="w-4 h-4" />
                  <span>Customer Drop</span>
                </div>
                <p className="text-gray-950 font-bold text-base sm:text-xl leading-tight">Customer Location</p>
                <p className="text-gray-500 text-sm font-medium line-clamp-2">{customerAddress}</p>
                {mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:text-blue-700"
                  >
                    Open in Google Maps
                  </a>
                )}
              </div>
            </div>
          </div>

           <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
             <div className="p-3 sm:p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-2.5 sm:gap-3">
               <Clock className="w-5 h-5 text-orange-500" />
               <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Time</span>
                  <span className="text-sm font-bold text-gray-900">{etaMins} MINS</span>
               </div>
             </div>
             <div className="p-3 sm:p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-2.5 sm:gap-3">
               <MapPin className="w-5 h-5 text-gray-400" />
               <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Distance</span>
                  <span className="text-sm font-bold text-gray-900">{distanceKm} KM</span>
               </div>
             </div>
          </div>

        {/* Action Area */}
          <div className="space-y-4 sm:space-y-6 pt-1 sm:pt-2">
            <ActionSlider 
              label="Slide to Accept" 
              onConfirm={() => onAccept(order)} 
              color="bg-black"
              successLabel="Order Accepted"
            />

            <button 
              onClick={onReject}
              className="w-full text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-500 transition-colors py-2 active:scale-95"
            >
              Pass this task
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};
