import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { useTrackingStore } from '@/modules/DeliveryV2/hooks/tracking/useTrackingStore';
import { useProximityCheck } from '@/modules/DeliveryV2/hooks/useProximityCheck';
import { useOrderManager } from '@/modules/DeliveryV2/hooks/useOrderManager';
import { useDeliveryNotifications } from '@food/hooks/useDeliveryNotifications';
import { writeOrderTracking } from '@food/realtimeTracking';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';

import { useGpsTracker } from '@/modules/DeliveryV2/hooks/tracking/useGpsTracker';
import { useRealtimeSync } from '@/modules/DeliveryV2/hooks/tracking/useRealtimeSync';
import { useRouteManager } from '@/modules/DeliveryV2/hooks/tracking/useRouteManager';

// Components
import LiveMap from '@/modules/DeliveryV2/components/map/LiveMap';
import { NewOrderModal } from '@/modules/DeliveryV2/components/modals/NewOrderModal';
import { PickupActionModal } from '@/modules/DeliveryV2/components/modals/PickupActionModal';
import { DeliveryVerificationModal } from '@/modules/DeliveryV2/components/modals/DeliveryVerificationModal';
import { OrderSummaryModal } from '@/modules/DeliveryV2/components/modals/OrderSummaryModal';
import ActionSlider from '@/modules/DeliveryV2/components/ui/ActionSlider';

// Sub Pages
import PocketV2 from '@/modules/DeliveryV2/pages/PocketV2';
import HistoryV2 from '@/modules/DeliveryV2/pages/HistoryV2';
import ProfileV2 from '@/modules/DeliveryV2/pages/ProfileV2';

// Icons
import { 
  Bell, HelpCircle, AlertTriangle, 
  Wallet, History, User as UserIcon, LayoutGrid,
  Plus, Minus, Navigation2, Target, CheckCircle2, Clock, ChevronDown,
  Contact, Package, MapPin, Phone
} from 'lucide-react';

import { getHaversineDistance, calculateETA, calculateHeading } from '@/modules/DeliveryV2/utils/geo';
import { useCompanyName } from "@food/hooks/useCompanyName";
import { useLocation, useNavigate } from 'react-router-dom';
import useNotificationInbox from "@food/hooks/useNotificationInbox";

const INCOMING_ORDER_STORAGE_KEY = 'delivery_v2_incoming_order';
const DELIVERY_PENDING_POPUP_ORDER_ID_KEY = 'delivery_pending_popup_order_id';
const OFFER_TTL_SECONDS = 60;
const DELIVERY_LAST_LOCATION_STORAGE_KEY = 'deliveryBoyLastLocation';

const safeReadJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getIncomingOrderIdentity = (order) =>
  String(order?.orderId || order?._id || order?.orderMongoId || '').trim();

const isMongoObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || '').trim());

const getOrderReferenceKeys = (order) => {
  if (!order) return [];
  return [
    order?._id,
    order?.orderMongoId,
    order?.orderId,
    order?.order_id,
    order?.orderNumber,
    order?.orderCode,
    order?.displayOrderId,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
};

const resolveDeliveryPartnerIdFromClient = () => {
  try {
    const storedUser =
      safeReadJson('delivery_user') ||
      safeReadJson('deliveryUser') ||
      safeReadJson('user');

    const candidate =
      storedUser?.id ||
      storedUser?._id ||
      storedUser?.userId ||
      storedUser?.deliveryId ||
      storedUser?.deliveryPartnerId ||
      storedUser?.user?.id ||
      storedUser?.user?._id ||
      storedUser?.deliveryPartner?.id ||
      storedUser?.deliveryPartner?._id;

    return candidate ? String(candidate) : '';
  } catch {
    return '';
  }
};

const getOfferForPartner = (order, partnerId) => {
  if (!partnerId || !Array.isArray(order?.dispatch?.offeredTo)) return null;
  return [...order.dispatch.offeredTo]
    .reverse()
    .find((entry) => String(entry?.partnerId || '') === String(partnerId));
};

const getIncomingOrderRemainingSeconds = (order, partnerId) => {
  if (!order) return 0;

  let startTime = order.offeredAt || order.createdAt;
  const myOffer = getOfferForPartner(order, partnerId);
  if (myOffer?.at) startTime = myOffer.at;

  const startMs = new Date(startTime).getTime();
  if (!Number.isFinite(startMs)) return OFFER_TTL_SECONDS;

  const elapsedSeconds = Math.floor((Date.now() - startMs) / 1000);
  return Math.max(0, OFFER_TTL_SECONDS - elapsedSeconds);
};

const getIncomingOrderRejectionReason = (order, partnerId) => {
  if (!order) return 'missing_order';

  const orderStatus = String(order?.orderStatus || order?.status || '').toLowerCase();
  const dispatchStatus = String(order?.dispatch?.status || '').toLowerCase();
  const myOffer = getOfferForPartner(order, partnerId);
  const wasOfferedToMe = !partnerId || Boolean(myOffer);
  const remaining = getIncomingOrderRemainingSeconds(order, partnerId);
  const acceptedBySomeone = Boolean(order?.dispatch?.acceptedAt);

  if (acceptedBySomeone) return 'already_accepted';
  if (remaining <= 0) return 'offer_expired';
  if (!wasOfferedToMe) return 'not_offered_to_partner';
  if (
    dispatchStatus &&
    !['unassigned', 'assigned', 'offered', 'offer_sent', 'pending'].includes(dispatchStatus)
  ) {
    return `dispatch_status_${dispatchStatus || 'unknown'}`;
  }
  if (
    orderStatus &&
    !['confirmed', 'preparing', 'ready_for_pickup', 'ready'].includes(orderStatus)
  ) {
    return `order_status_${orderStatus || 'unknown'}`;
  }

  return '';
};

const shouldKeepIncomingOrder = (order, partnerId) => {
  return !getIncomingOrderRejectionReason(order, partnerId);
};

const extractAvailableOrders = (response) => {
  const payload = response?.data?.data ?? response?.data ?? {};
  if (Array.isArray(payload?.docs)) return payload.docs;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return [];
};

const persistIncomingOrder = (order) => {
  try {
    localStorage.setItem(INCOMING_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Ignore storage failures and fall back to in-memory behavior.
  }
};

const clearPersistedIncomingOrder = () => {
  try {
    localStorage.removeItem(INCOMING_ORDER_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};

const readStoredDeliveryLocation = () => {
  try {
    const raw = localStorage.getItem(DELIVERY_LAST_LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 2) return null;
    const lat = Number(parsed[0]);
    const lng = Number(parsed[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
};

const persistDeliveryLocation = (lat, lng) => {
  try {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    localStorage.setItem(
      DELIVERY_LAST_LOCATION_STORAGE_KEY,
      JSON.stringify([Number(lat), Number(lng)]),
    );
  } catch {
    // Ignore storage failures and keep in-memory flow alive.
  }
};

const formatEmergencyPopupCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Rs 0';
  return `Rs ${amount.toFixed(0)}`;
};

const shouldLogDeliveryWebView = () => {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem('delivery_webview_debug') === '1' ||
      window.location.search.includes('delivery_webview_debug=1')
    );
  } catch {
    return false;
  }
};

const debugDeliveryWebView = (...args) => {
  if (shouldLogDeliveryWebView()) {
    console.log(...args);
  }
};

/** Minimal bottom-sheet popup (Restored from legacy FeedNavbar) */
function BottomPopup({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[600] flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative w-full bg-white rounded-t-3xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
             <AlertTriangle className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

/**
 * DeliveryHomeV2 - Premium 1:1 Match with Original App UI.
 * Featuring logical tab switching for Feed, Pocket, History, and Profile.
 */
export default function DeliveryHomeV2({ tab = 'feed' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOnline, toggleOnline, activeOrder, tripStatus, setActiveOrder, updateTripStatus, clearActiveOrder } = useDeliveryStore();
  const riderLocation = useTrackingStore(state => state.riderLocation);
  const setRiderLocation = useTrackingStore(state => state.setRiderLocation);
  const { isWithinRange, distanceToTarget } = useProximityCheck();
  const { acceptOrder, reachPickup, verifyPickupOtp, pickUpOrder, reachDrop, completeDelivery, resetTrip } = useOrderManager();
  const { newOrder, clearNewOrder, orderStatusUpdate, clearOrderStatusUpdate, claimedOrderId, clearClaimedOrderId, adminNotification, clearAdminNotification, isConnected: isSocketConnected, currentZoneId: socketCurrentZoneId, emitLocation } = useDeliveryNotifications();
  const companyName = useCompanyName();
  const { items: broadcastItems, unreadCount: notificationUnreadCount, markAsRead: markBroadcastAsRead, dismissAll: dismissAllBroadcast } = useNotificationInbox("delivery", { limit: 20 });

  const [incomingOrder, setIncomingOrder] = useState(null);
  const [stickyIncomingOrder, setStickyIncomingOrder] = useState(null);
  const [forcedPopupOrder, setForcedPopupOrder] = useState(null);
  const [hardPopupOrder, setHardPopupOrder] = useState(null);
  const [hardPopupTimeLeft, setHardPopupTimeLeft] = useState(OFFER_TTL_SECONDS);
  const [cashLimitNotice, setCashLimitNotice] = useState(null);
  const [isDashboardBootstrapping, setIsDashboardBootstrapping] = useState(true);
  const [currentZoneId, setCurrentZoneId] = useState(() => {
    try {
      return localStorage.getItem('deliveryCurrentZoneId') || null;
    } catch {
      return null;
    }
  });
  const [deliveryZone, setDeliveryZone] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showEmergencyPopup, setShowEmergencyPopup] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [emergencyNumbers, setEmergencyNumbers] = useState({
    medicalEmergency: "",
    accidentHelpline: "",
    contactPolice: "",
    insurance: "",
  });
  
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const eta = useTrackingStore(state => state.eta);
  const setEta = useTrackingStore(state => state.setEta);
  const lastLocationSentAt = useRef(0);
  const lastCoordRef = useRef(null);
  const rollingSpeedRef = useRef([]);
  const lastAutoArrivalRef = useRef({ PICKING_UP: false, PICKED_UP: false });
  const gpsErrorToastShownRef = useRef(false);

  const [zoom, setZoom] = useState(14);
  const [isSimMode, setIsSimMode] = useState(false);
  const [simPath, setSimPath] = useState([]);
  const [simIndex, setSimIndex] = useState(0);
  const [simProgress, setSimProgress] = useState(0); // 0 to 1 between points
  const activePolyline = useTrackingStore(state => state.activePolyline);
  const setActivePolyline = useTrackingStore(state => state.setActivePolyline);
  const mapRef = useRef(null);
  const simInitializedRef = useRef(false);
  const deliveryPartnerIdRef = useRef('');
  const incomingOrderHydratedRef = useRef(false);
  const availableOrdersRef = useRef([]);
  const pendingExternalOrderIdRef = useRef('');
  const lastOpenedExternalOrderIdRef = useRef('');
  const externalOrderFetchInFlightRef = useRef(false);
  const externalPopupLockRef = useRef(false);
  const hardPopupExpiryHandledRef = useRef(false);
  const visibleIncomingOrder = hardPopupOrder || forcedPopupOrder || incomingOrder || stickyIncomingOrder;
  const shouldRenderStickyIncomingPopup =
    Boolean(visibleIncomingOrder) && (!isModalMinimized || externalPopupLockRef.current);

  const isLoggingOut = useRef(false);
  const handleLogout = useCallback(() => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;
    
    // 1. Clear tokens and state
    localStorage.removeItem('delivery_accessToken');
    localStorage.removeItem('delivery_refreshToken');
    localStorage.removeItem('delivery_authenticated');
    localStorage.removeItem('delivery_user');
    
    // 2. Alert user and redirect
    toast.error("Session Expired", { description: "Please log in again." });
    navigate("/food/delivery/login", { replace: true });

    // Optional: Full refresh after delay ONLY if we're not already on login
    setTimeout(() => {
       if (!window.location.pathname.includes('/login')) {
          window.location.reload();
       }
    }, 1500);
  }, [navigate]);

  useEffect(() => {
    const onAuthFailure = (e) => {
      if (e.detail?.module === 'delivery') {
        handleLogout();
      }
    };
    window.addEventListener('authRefreshFailed', onAuthFailure);
    return () => window.removeEventListener('authRefreshFailed', onAuthFailure);
  }, [handleLogout]);

  // One-time location ping on app open to update current zone
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        // Ping availability endpoint with just coordinates to update the zone
        // (the backend will preserve the online/offline status)
        deliveryAPI.updateLocationOnly(latitude, longitude).catch(() => {});
      }, () => {
        // Silently ignore errors for background ping
      }, { maximumAge: 60000, timeout: 10000 });
    }
  }, []);

  const handleAcceptOrder = useCallback(async (o) => {
    try {
      await acceptOrder(o);
      setIncomingOrder(null);
      setStickyIncomingOrder(null);
      setForcedPopupOrder(null);
      setHardPopupOrder(null);
      externalPopupLockRef.current = false;
      clearNewOrder();
      clearPersistedIncomingOrder();
    } catch (err) {
      const msg = String(err?.response?.data?.message || err?.message || '');
      const isTaken = msg.toLowerCase().includes('already accepted') || 
                      msg.toLowerCase().includes('another partner') ||
                      (err?.response?.status === 403);
      if (isTaken) {
        setIncomingOrder(null);
        setStickyIncomingOrder(null);
        setForcedPopupOrder(null);
        setHardPopupOrder(null);
        externalPopupLockRef.current = false;
        clearNewOrder();
        clearPersistedIncomingOrder();
      }
    }
  }, [acceptOrder]);

  const handleRejectOrder = useCallback(() => {
    setIncomingOrder(null);
    setStickyIncomingOrder(null);
    setForcedPopupOrder(null);
    setHardPopupOrder(null);
    externalPopupLockRef.current = false;
    clearNewOrder();
    clearPersistedIncomingOrder();
  }, []);

  useEffect(() => {
    hardPopupExpiryHandledRef.current = false;
  }, [hardPopupOrder]);

  useEffect(() => {
    if (!hardPopupOrder) {
      setHardPopupTimeLeft(OFFER_TTL_SECONDS);
      return undefined;
    }

    const syncRemainingTime = () => {
      const partnerId = deliveryPartnerIdRef.current || resolveDeliveryPartnerIdFromClient();
      setHardPopupTimeLeft(getIncomingOrderRemainingSeconds(hardPopupOrder, partnerId));
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
  }, [hardPopupOrder]);

  useEffect(() => {
    if (!hardPopupOrder || hardPopupTimeLeft > 0 || hardPopupExpiryHandledRef.current) return;
    hardPopupExpiryHandledRef.current = true;
    handleRejectOrder();
  }, [hardPopupOrder, hardPopupTimeLeft, handleRejectOrder]);

  const persistPendingPopupOrderId = useCallback((orderId) => {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) return;
    pendingExternalOrderIdRef.current = normalizedOrderId;
    try {
      localStorage.setItem(DELIVERY_PENDING_POPUP_ORDER_ID_KEY, normalizedOrderId);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const clearPendingPopupOrderId = useCallback(() => {
    pendingExternalOrderIdRef.current = '';
    try {
      localStorage.removeItem(DELIVERY_PENDING_POPUP_ORDER_ID_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const readPendingPopupOrderId = useCallback(() => {
    if (pendingExternalOrderIdRef.current) return pendingExternalOrderIdRef.current;
    try {
      return String(localStorage.getItem(DELIVERY_PENDING_POPUP_ORDER_ID_KEY) || '').trim();
    } catch {
      return '';
    }
  }, []);

  const hydrateAvailableOrder = useCallback(
    async (cancelled = false) => {
      const currentActiveOrder = useDeliveryStore.getState().activeOrder;
      const currentTripStatus = useDeliveryStore.getState().tripStatus;
      
      try {
        const currentResponse = await deliveryAPI.getCurrentDelivery();
        const currentPayload =
          currentResponse?.data?.data?.activeOrder ||
          currentResponse?.data?.data ||
          null;

        if (!cancelled && currentPayload && (currentPayload._id || currentPayload.orderId)) {
          // Robust location mapping
          const getLoc = (ref, keysLat, keysLng) => {
            if (!ref) return null;
            if (ref.location) {
              if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
                return { lat: ref.location.coordinates[1], lng: ref.location.coordinates[0] };
              }
              return { lat: ref.location.latitude || ref.location.lat, lng: ref.location.longitude || ref.location.lng };
            }
            for (const k of keysLat) { if (ref[k] != null) return { lat: ref[k], lng: ref[keysLng[keysLat.indexOf(k)]] }; }
            return null;
          };

          const resLoc = getLoc(currentPayload.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) || 
                         getLoc(currentPayload, ['restaurant_lat', 'restaurantLat', 'latitude'], ['restaurant_lng', 'restaurantLng', 'longitude']);
          const cusLoc = getLoc(currentPayload.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) || 
                         getLoc(currentPayload, ['customer_lat', 'customerLat', 'latitude'], ['customer_lng', 'customerLng', 'longitude']);

          setActiveOrder({
            ...currentPayload,
            _id: currentPayload._id,
            orderId: currentPayload.orderId || currentPayload.order_id || currentPayload._id,
            restaurantLocation: resLoc,
            customerLocation: cusLoc
          });

          // Sync status with server
          const backendStatus = String(currentPayload.deliveryStatus || currentPayload.orderState?.status || currentPayload.orderStatus || currentPayload.status || "").toLowerCase();
          const currentPhase = currentPayload.deliveryState?.currentPhase;

          if (['delivered', 'completed'].includes(backendStatus)) {
            updateTripStatus('COMPLETED');
          } else if (currentPhase === 'at_drop' || backendStatus === 'reached_drop') {
            updateTripStatus('REACHED_DROP');
          } else if (['picked_up', 'delivering'].includes(backendStatus)) {
            updateTripStatus('PICKED_UP');
          } else if (currentPhase === 'at_pickup' || backendStatus === 'reached_pickup') {
            updateTripStatus('REACHED_PICKUP');
          } else if (['confirmed', 'preparing', 'ready_for_pickup'].includes(backendStatus)) {
             // Only set to PICKING_UP if we aren't already further ahead
             if (currentTripStatus === 'IDLE') updateTripStatus('PICKING_UP');
          }
          return;
        }

        const availableResponse = await deliveryAPI.getOrders({ limit: 20, page: 1 });
        const availablePayload =
          availableResponse?.data?.data ||
          availableResponse?.data ||
          {};
        const availableOrders = Array.isArray(availablePayload?.docs)
          ? availablePayload.docs
          : Array.isArray(availablePayload?.items)
            ? availablePayload.items
            : Array.isArray(availablePayload)
              ? availablePayload
              : [];
        availableOrdersRef.current = availableOrders;

        const nextCashLimitNotice =
          availablePayload?.cashLimit?.blocked ? availablePayload.cashLimit : null;
        if (!cancelled) setCashLimitNotice(nextCashLimitNotice);

        const nextIncomingOrder = availableOrders.find((order) => {
          const dispatchStatus = String(order?.dispatch?.status || '').toLowerCase();
          const orderStatus = String(order?.orderStatus || order?.status || '').toLowerCase();
          const hasAcceptedStatus = ['confirmed', 'preparing', 'ready_for_pickup', 'ready'].includes(orderStatus);
          const isDispatchEligible =
            !dispatchStatus ||
            ['unassigned', 'assigned', 'offered', 'offer_sent', 'pending'].includes(dispatchStatus);

          const partnerIdStr = deliveryPartnerIdRef.current || resolveDeliveryPartnerIdFromClient();
          const myOffer = getOfferForPartner(order, partnerIdStr);
          const isOfferedToMe = Boolean(myOffer && myOffer.action === 'offered');

          return hasAcceptedStatus && isDispatchEligible && shouldKeepIncomingOrder(order, partnerIdStr) && isOfferedToMe;
        });

        if (!cancelled && nextIncomingOrder) {
          setCashLimitNotice(null);
          setIncomingOrder((prev) => {
            const prevId = getIncomingOrderIdentity(prev);
            const nextId = getIncomingOrderIdentity(nextIncomingOrder);
            return prevId === nextId && prev ? prev : nextIncomingOrder;
          });
        }
        // Removed the automatic clearing to null here.
        // incomingOrder is cleared by onAccept/onReject/socket(order_claimed)
      } catch (error) {
        console.warn('[DeliveryHomeV2] Available order fallback sync failed:', error?.message || error);
      }
    }, [setActiveOrder, updateTripStatus, setCashLimitNotice, setIncomingOrder]);

  const openOrderPopupById = useCallback(async (orderId, source = 'external') => {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) {
      console.error('[DeliveryWebView] error if order not found', 'Missing orderId');
      return;
    }

    const activeToken =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('delivery_accessToken') || localStorage.getItem('accessToken')
        : '';

    if (!activeToken) {
      debugDeliveryWebView('[DeliveryWebView] delivery boy not logged in, storing orderId temporarily', normalizedOrderId);
      persistPendingPopupOrderId(normalizedOrderId);
      return;
    }

    if (isDashboardBootstrapping) {
      debugDeliveryWebView('[DeliveryWebView] dashboard still loading, waiting before popup open', normalizedOrderId);
      persistPendingPopupOrderId(normalizedOrderId);
      return;
    }

    const partnerId = deliveryPartnerIdRef.current || resolveDeliveryPartnerIdFromClient();
    if (!partnerId) {
      debugDeliveryWebView('[DeliveryWebView] delivery partner id not ready yet, waiting before popup open', normalizedOrderId);
      persistPendingPopupOrderId(normalizedOrderId);
      return;
    }

    const idType = isMongoObjectId(normalizedOrderId) ? 'mongo' : 'public';
    debugDeliveryWebView('[DeliveryWebView] detected id type', {
      source,
      orderId: normalizedOrderId,
      idType,
    });

    const loadedOrders = [
      incomingOrder,
      newOrder,
      activeOrder,
      ...availableOrdersRef.current,
      safeReadJson(INCOMING_ORDER_STORAGE_KEY),
    ].filter(Boolean);
    debugDeliveryWebView('[DeliveryWebView] searching loaded orders', {
      source,
      orderId: normalizedOrderId,
      loadedCount: loadedOrders.length,
    });

    const matchedLoadedOrder = loadedOrders.find((order) =>
      getOrderReferenceKeys(order).includes(normalizedOrderId),
    );

    const currentIncomingId = getIncomingOrderIdentity(incomingOrder);
    if (
      normalizedOrderId === currentIncomingId ||
      normalizedOrderId === lastOpenedExternalOrderIdRef.current
    ) {
      debugDeliveryWebView('[DeliveryWebView] duplicate popup skipped for orderId', normalizedOrderId);
      if (tab !== 'feed') {
        navigate('/food/delivery/feed');
      }
      setIsModalMinimized(false);
      clearPendingPopupOrderId();
      return;
    }

    if (matchedLoadedOrder) {
      if (!shouldKeepIncomingOrder(matchedLoadedOrder, partnerId)) {
        debugDeliveryWebView('[DeliveryWebView] stale loaded order ignored, fetching fresh order by ref', {
          source,
          orderId: normalizedOrderId,
        });
      } else {
      debugDeliveryWebView('[DeliveryWebView] order found', {
        source,
        orderId: normalizedOrderId,
        resolvedFrom: 'loaded-orders',
      });
      if (tab !== 'feed') {
        navigate('/food/delivery/feed');
      }
      setIsModalMinimized(false);
      externalPopupLockRef.current = true;
      setIncomingOrder(matchedLoadedOrder);
      setStickyIncomingOrder(matchedLoadedOrder);
      setForcedPopupOrder(matchedLoadedOrder);
      setHardPopupOrder(matchedLoadedOrder);
      lastOpenedExternalOrderIdRef.current = normalizedOrderId;
      persistIncomingOrder(matchedLoadedOrder);
      clearPendingPopupOrderId();
      debugDeliveryWebView('[DeliveryWebView] modal opened', {
        source,
        orderId: normalizedOrderId,
      });
      return;
      }
    }

    if (externalOrderFetchInFlightRef.current) {
      persistPendingPopupOrderId(normalizedOrderId);
      return;
    }

    const buildDeliveryPopupDebug = (error, extra = {}) => ({
      orderId: normalizedOrderId,
      source,
      status: error?.response?.status || null,
      message: error?.response?.data?.message || error?.message || error,
      payload: error?.response?.data || null,
      ...extra,
    });

    const applyPopupOrder = (resolvedOrder, resolvedFrom = 'unknown') => {
      if (!resolvedOrder || !(resolvedOrder._id || resolvedOrder.orderId)) {
        return false;
      }

      if (!shouldKeepIncomingOrder(resolvedOrder, partnerId)) {
        const rejectionReason = getIncomingOrderRejectionReason(resolvedOrder, partnerId);
        console.error('[DeliveryWebView] error if order not found', {
          ...buildDeliveryPopupDebug(null, {
            reason: rejectionReason || 'Order is stale, expired, or not eligible for this partner.',
            orderStatus: resolvedOrder?.orderStatus || resolvedOrder?.status || '',
            dispatchStatus: resolvedOrder?.dispatch?.status || '',
            remainingSeconds: getIncomingOrderRemainingSeconds(resolvedOrder, partnerId),
            hasAcceptedAt: Boolean(resolvedOrder?.dispatch?.acceptedAt),
            partnerId: partnerId || '',
            resolvedFrom,
          }),
        });
        return false;
      }

      if (tab !== 'feed') {
        navigate('/food/delivery/feed');
      }

      setIsModalMinimized(false);
      externalPopupLockRef.current = true;
      setIncomingOrder(resolvedOrder);
      setStickyIncomingOrder(resolvedOrder);
      setForcedPopupOrder(resolvedOrder);
      setHardPopupOrder(resolvedOrder);
      lastOpenedExternalOrderIdRef.current = normalizedOrderId;
      persistIncomingOrder(resolvedOrder);
      clearPendingPopupOrderId();
      debugDeliveryWebView('[DeliveryWebView] modal opened', {
        source,
        orderId: normalizedOrderId,
        resolvedFrom,
      });
      return true;
    };

    externalOrderFetchInFlightRef.current = true;
    try {
      debugDeliveryWebView('[DeliveryWebView] fetching order by ref', {
        source,
        orderId: normalizedOrderId,
      });
      const response = await deliveryAPI.getOrderDetails(normalizedOrderId);
      const fetchedOrder =
        response?.data?.data?.order ||
        response?.data?.order ||
        response?.data?.data ||
        null;

      debugDeliveryWebView('[DeliveryWebView] order found', {
        source,
        orderId: normalizedOrderId,
        fetched: Boolean(fetchedOrder),
      });

      if (applyPopupOrder(fetchedOrder, 'by-ref')) {
        return;
      }

      debugDeliveryWebView('[DeliveryWebView] by-ref lookup missed, trying available orders fallback', {
        source,
        orderId: normalizedOrderId,
      });

      const availableResponse = await deliveryAPI.getOrders({ limit: 50, page: 1, _ts: Date.now() });
      const fallbackOrder = extractAvailableOrders(availableResponse).find((order) =>
        getOrderReferenceKeys(order).includes(normalizedOrderId),
      );

      if (applyPopupOrder(fallbackOrder, 'available-orders')) {
        return;
      }

      console.error('[DeliveryWebView] error if order not found', buildDeliveryPopupDebug(null));
    } catch (error) {
      try {
        debugDeliveryWebView('[DeliveryWebView] by-ref request failed, trying available orders fallback', {
          source,
          orderId: normalizedOrderId,
          message: error?.response?.data?.message || error?.message || error,
        });

        const availableResponse = await deliveryAPI.getOrders({ limit: 50, page: 1, _ts: Date.now() });
        const fallbackOrder = extractAvailableOrders(availableResponse).find((order) =>
          getOrderReferenceKeys(order).includes(normalizedOrderId),
        );

        if (applyPopupOrder(fallbackOrder, 'available-orders-after-error')) {
          return;
        }
      } catch (fallbackError) {
        debugDeliveryWebView('[DeliveryWebView] available orders fallback failed', {
          source,
          orderId: normalizedOrderId,
          message: fallbackError?.response?.data?.message || fallbackError?.message || fallbackError,
        });
      }

      console.error('[DeliveryWebView] error if order not found', buildDeliveryPopupDebug(error));
    } finally {
      externalOrderFetchInFlightRef.current = false;
    }
  }, [
    activeOrder,
    clearPendingPopupOrderId,
    incomingOrder,
    isDashboardBootstrapping,
    navigate,
    newOrder,
    persistPendingPopupOrderId,
    tab,
  ]);

  const syncDeliveryZoneState = useCallback(async (latitude, longitude, onlineStatus, extras = {}) => {
    const response = await deliveryAPI.updateLocation(latitude, longitude, onlineStatus, extras);
    const payload =
      response?.data?.data ||
      response?.data ||
      {};
    const nextZoneId = payload?.currentZoneId ? String(payload.currentZoneId) : null;
    setDeliveryZone(payload?.matchedZone || null);

    setCurrentZoneId((previousZoneId) => {
      const previousNormalized = previousZoneId ? String(previousZoneId) : null;
      if (nextZoneId !== previousNormalized) {
        debugDeliveryWebView('[DeliveryZone] Zone changed', {
          oldZoneId: previousNormalized,
          updatedZoneId: nextZoneId,
          latitude,
          longitude,
        });
        void hydrateAvailableOrder();
      }
      return nextZoneId;
    });

    try {
      if (nextZoneId) localStorage.setItem('deliveryCurrentZoneId', nextZoneId);
      else localStorage.removeItem('deliveryCurrentZoneId');
    } catch {
      // Ignore local storage failures.
    }

    return payload;
  }, [hydrateAvailableOrder]);

  const syncUsingFallbackLocation = useCallback((reason = 'gps_fallback') => {
    const currentRiderLocation = useTrackingStore.getState().riderLocation;
    let fallbackLocation =
      lastCoordRef.current ||
      readStoredDeliveryLocation() ||
      (currentRiderLocation?.lat != null && currentRiderLocation?.lng != null
        ? { lat: Number(currentRiderLocation.lat), lng: Number(currentRiderLocation.lng) }
        : null);

    const activeOrderState = useDeliveryStore.getState().activeOrder;
    const tripStatusState = useDeliveryStore.getState().tripStatus;

    // Determine target location for checking distance or snapping fallback
    let targetLocation = null;
    if (activeOrderState) {
      let rawLoc = null;
      if (['PICKING_UP', 'REACHED_PICKUP'].includes(tripStatusState)) {
        rawLoc = activeOrderState.restaurantLocation || activeOrderState.restaurant_location;
      } else if (['PICKED_UP', 'REACHED_DROP'].includes(tripStatusState)) {
        rawLoc = activeOrderState.customerLocation || activeOrderState.customer_location;
      }
      if (!rawLoc) {
        rawLoc = activeOrderState.restaurantLocation || activeOrderState.customerLocation;
      }
      if (rawLoc) {
        const lat = parseFloat(rawLoc.lat ?? rawLoc.latitude ?? (Array.isArray(rawLoc.coordinates) ? rawLoc.coordinates[1] : null));
        const lng = parseFloat(rawLoc.lng ?? rawLoc.longitude ?? (Array.isArray(rawLoc.coordinates) ? rawLoc.coordinates[0] : null));
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          targetLocation = { lat, lng };
        }
      }
    }

    // Check if the current fallback location is too far (> 10km) from active target location
    let isTooFar = false;
    if (fallbackLocation && targetLocation) {
      const distance = getHaversineDistance(
        fallbackLocation.lat,
        fallbackLocation.lng,
        targetLocation.lat,
        targetLocation.lng
      );
      if (Number.isFinite(distance) && distance > 10000) {
        isTooFar = true;
        console.log(`[GPS Fallback] Current location is too far (${(distance / 1000).toFixed(1)}km > 10km) from active target. Triggering snap.`);
      }
    }

    // Dynamic fallback when GPS and storage are both empty/blocked or too far
    if ((!fallbackLocation || isTooFar) && targetLocation) {
      fallbackLocation = { lat: targetLocation.lat + 0.0012, lng: targetLocation.lng + 0.0012 };
      console.log(`[GPS Fallback] Using active order location offset for rider:`, fallbackLocation);
    }

    // Final global fallback if everything else is null
    if (!fallbackLocation) {
      fallbackLocation = { lat: 22.7196, lng: 75.8577 }; // Indore center
      console.log(`[GPS Fallback] Using default Indore center for rider:`, fallbackLocation);
    }

    const lat = Number(fallbackLocation.lat);
    const lng = Number(fallbackLocation.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return false;
    }

    lastCoordRef.current = { lat, lng };
    const previousHeading = Number(currentRiderLocation?.heading || 0);
    setRiderLocation({
      ...(currentRiderLocation || {}),
      lat,
      lng,
      heading: previousHeading,
    });

    syncDeliveryZoneState(lat, lng, true, {
      heading: 0,
      speed: 0,
      accuracy: null,
      source: reason,
    }).catch(() => {});

    return true;
  }, [setRiderLocation, syncDeliveryZoneState]);

  useEffect(() => {
    deliveryPartnerIdRef.current = resolveDeliveryPartnerIdFromClient();
  }, []);

  useEffect(() => {
    if (isDashboardBootstrapping) return;
    const pendingOrderId = readPendingPopupOrderId();
    if (!pendingOrderId) return;
    void openOrderPopupById(pendingOrderId, 'pending-storage');
  }, [isDashboardBootstrapping, openOrderPopupById, readPendingPopupOrderId]);

  useEffect(() => {
    if (isDashboardBootstrapping) return;
    const partnerId = deliveryPartnerIdRef.current || resolveDeliveryPartnerIdFromClient();
    if (!partnerId) return;
    const pendingOrderId = readPendingPopupOrderId();
    if (!pendingOrderId) return;
    debugDeliveryWebView('[DeliveryWebView] partner ready, retrying pending popup open', pendingOrderId);
    void openOrderPopupById(pendingOrderId, 'partner-ready-retry');
  }, [isDashboardBootstrapping, openOrderPopupById, readPendingPopupOrderId, location.pathname]);

  useEffect(() => {
    const handleOpenOrderPopupEvent = (event) => {
      debugDeliveryWebView('[DeliveryWebView] OPEN_ORDER_POPUP event received', event);
      const externalOrderId = String(event?.detail?.orderId || '').trim();
      debugDeliveryWebView('[DeliveryWebView] orderId received', externalOrderId);
      if (!externalOrderId) {
        console.error('[DeliveryWebView] error if order not found', 'No orderId received in OPEN_ORDER_POPUP event');
        return;
      }
      void openOrderPopupById(externalOrderId, 'OPEN_ORDER_POPUP');
    };

    window.addEventListener('OPEN_ORDER_POPUP', handleOpenOrderPopupEvent);
    return () => {
      window.removeEventListener('OPEN_ORDER_POPUP', handleOpenOrderPopupEvent);
    };
  }, [openOrderPopupById]);

  useEffect(() => {
    const queryOrderId = String(new URLSearchParams(location.search || '').get('orderId') || '').trim();
    if (!queryOrderId) return;
    debugDeliveryWebView('[DeliveryWebView] query orderId received', queryOrderId);
    void openOrderPopupById(queryOrderId, 'url-query');
  }, [location.search, openOrderPopupById]);

  useEffect(() => {
    if (socketCurrentZoneId === undefined) return;
    setCurrentZoneId(socketCurrentZoneId || null);
    try {
      if (socketCurrentZoneId) localStorage.setItem('deliveryCurrentZoneId', socketCurrentZoneId);
      else localStorage.removeItem('deliveryCurrentZoneId');
    } catch {
      // Ignore local storage failures.
    }
  }, [socketCurrentZoneId]);

  useEffect(() => {
    if (activeOrder) return;

    const partnerId = deliveryPartnerIdRef.current || resolveDeliveryPartnerIdFromClient();
    const persistedOrder = safeReadJson(INCOMING_ORDER_STORAGE_KEY);

    if (shouldKeepIncomingOrder(persistedOrder, partnerId)) {
      setIncomingOrder((prev) => prev || persistedOrder);
    } else {
      clearPersistedIncomingOrder();
    }

    incomingOrderHydratedRef.current = true;
  }, [activeOrder]);

  useEffect(() => {
    if (!incomingOrderHydratedRef.current) return;

    if (activeOrder) {
      if (externalPopupLockRef.current) {
        debugDeliveryWebView('[DeliveryWebView] keeping persisted popup because external popup lock is active');
        return;
      }
      clearPersistedIncomingOrder();
      return;
    }

    const partnerId = deliveryPartnerIdRef.current || resolveDeliveryPartnerIdFromClient();
    if (incomingOrder && shouldKeepIncomingOrder(incomingOrder, partnerId)) {
      persistIncomingOrder(incomingOrder);
      return;
    }

    if (externalPopupLockRef.current && stickyIncomingOrder) {
      persistIncomingOrder(stickyIncomingOrder);
      return;
    }

    clearPersistedIncomingOrder();
  }, [incomingOrder, activeOrder, stickyIncomingOrder]);

  // 0. Auto-Simulation Effect (High-Precision Smooth Glide)
  const lastSimUpdateSentAt = useRef(0);
  useEffect(() => {
    let interval;
    if (isSimMode && simPath.length > 1 && simIndex < simPath.length - 1) {
      debugDeliveryWebView('[SimAuto] Glide Active âˆš');
      
      interval = setInterval(() => {
        setSimProgress(prev => {
          const nextProgress = prev + 0.08; // 8% movement per tick
          
          if (nextProgress >= 1) {
            setSimIndex(idx => idx + 1);
            return 0; // Move to next segment
          }

          const currentPoint = simPath[simIndex];
          const nextPoint = simPath[simIndex + 1];

          if (currentPoint && nextPoint) {
            // Linear Interpolation (LERP)
            const lat = currentPoint.lat + (nextPoint.lat - currentPoint.lat) * nextProgress;
            const lng = currentPoint.lng + (nextPoint.lng - currentPoint.lng) * nextProgress;
            const heading = calculateHeading(currentPoint.lat, currentPoint.lng, nextPoint.lat, nextPoint.lng);

            setRiderLocation({ lat, lng, heading });

            if (mapRef.current) {
              mapRef.current.panTo({ lat, lng });
            }

            // Sync with backend every 2.5 seconds during simulation so customer sees it
            const now = Date.now();
            if (now - lastSimUpdateSentAt.current >= 2000) { // Reduced to 2s to match backend throttle
              lastSimUpdateSentAt.current = now;
              const payload = { 
                lat, 
                lng, 
                heading, 
                orderId: activeOrder?.orderId || activeOrder?._id,
                status: 'on_the_way',
                polyline: activePolyline // Include polyline in every stream update for resilience
              };
              // A. HTTP Backup
              syncDeliveryZoneState(lat, lng, true, { heading }).catch(() => {});
              
              // B. SOCKET LIVE (SILKY SMOOTH)
              if (payload.orderId) emitLocation(payload);

              // C. FIREBASE REALTIME DB (Persistent Route for Customer Map)
              if (payload.orderId) {
                writeOrderTracking(payload.orderId, { 
                  lat, 
                  lng, 
                  heading, 
                  polyline: activePolyline,
                  status: tripStatus,
                  eta: eta // Publish live ETA to Firebase
                }).catch(() => {});
              }
            }
          }
          return nextProgress;
        });
      }, 50); // 20 FPS movement
    }
    return () => clearInterval(interval);
  }, [activeOrder, activePolyline, emitLocation, eta, isSimMode, simIndex, simPath, syncDeliveryZoneState, tripStatus]);

  // Fetch Emergency numbers and Profile (Restored logic)
  useEffect(() => {
    (async () => {
      try {
        const [emergencyRes, profileRes] = await Promise.all([
          deliveryAPI.getEmergencyHelp(),
          deliveryAPI.getProfile()
        ]);
        if (emergencyRes?.data?.success && emergencyRes.data.data) {
          setEmergencyNumbers(emergencyRes.data.data);
        }
        if (profileRes?.data?.success && profileRes.data.data?.profile) {
          const profile = profileRes.data.data.profile;
          setProfileImage(profile.profileImage?.url || profile.documents?.photo || null);
        }
      } catch (err) { console.warn('Navbar Data Fetch Error:', err); }
    })();
  }, []);

  const emergencyOptions = [
    { title: "Medical Emergency", subtitle: "Call an ambulance", icon: <AlertTriangle className="text-red-600" />, phone: emergencyNumbers.medicalEmergency },
    { title: "Accident Helpline", subtitle: "Report an accident", icon: <AlertTriangle className="text-orange-600" />, phone: emergencyNumbers.accidentHelpline },
    { title: "Contact Police", subtitle: "Nearest police support", icon: <AlertTriangle className="text-blue-600" />, phone: emergencyNumbers.contactPolice },
    { title: "Insurance", subtitle: "Policy & claim help", icon: <AlertTriangle className="text-green-600" />, phone: emergencyNumbers.insurance },
  ];

  // Reset simulation when trip phase/order/mode changes.
  // Do not reset on each route refresh, otherwise marker appears frozen.
  useEffect(() => {
    if (isSimMode) {
      debugDeliveryWebView('[SimAuto] Resetting simulation playhead...');
      setSimIndex(0);
      setSimProgress(0);
      simInitializedRef.current = false;
    } else {
      simInitializedRef.current = false;
    }
  }, [tripStatus, isSimMode, activeOrder?._id]);

  useEffect(() => {
    const routeVisible = Boolean(activeOrder) && ['PICKING_UP', 'REACHED_PICKUP', 'PICKED_UP', 'REACHED_DROP'].includes(tripStatus);
    if (!routeVisible) {
      setSimPath([]);
      setSimIndex(0);
      setSimProgress(0);
      setActivePolyline(null);
    }
  }, [activeOrder, tripStatus]);

  // Ensure simulation starts from the first route point once route is ready.
  useEffect(() => {
    if (!isSimMode || simInitializedRef.current || simPath.length < 2) return;
    const start = simPath[0];
    if (
      start &&
      Number.isFinite(Number(start.lat)) &&
      Number.isFinite(Number(start.lng))
    ) {
      setRiderLocation({ lat: Number(start.lat), lng: Number(start.lng), heading: 0 });
      simInitializedRef.current = true;
    }
  }, [isSimMode, simPath, setRiderLocation]);

  // Fallback path for simulation when Directions API doesn't return a usable path.
  useEffect(() => {
    if (!isSimMode || simPath.length > 1 || !activeOrder) return;

    const parsePoint = (raw) => {
      if (!raw) return null;
      const lat = Number(raw.lat ?? raw.latitude);
      const lng = Number(raw.lng ?? raw.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    };

    const rider = useDeliveryStore.getState().riderLocation;
    const riderPoint = parsePoint(rider);
    const targetPoint =
      tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP'
        ? parsePoint(activeOrder.customerLocation)
        : parsePoint(activeOrder.restaurantLocation);

    if (!riderPoint || !targetPoint) return;

    const distance = getHaversineDistance(
      riderPoint.lat,
      riderPoint.lng,
      targetPoint.lat,
      targetPoint.lng,
    );
    if (!Number.isFinite(distance) || distance < 10) return;

    const steps = 60;
    const fallbackPath = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return {
        lat: riderPoint.lat + (targetPoint.lat - riderPoint.lat) * t,
        lng: riderPoint.lng + (targetPoint.lng - riderPoint.lng) * t,
      };
    });

    setSimPath(fallbackPath);
  }, [isSimMode, simPath, activeOrder, tripStatus]);

  // Auto-restore modal when status or content changes

  // Auto-restore modal when status or content changes
  useEffect(() => {
    setIsModalMinimized(false);
  }, [tripStatus, showVerification, incomingOrder]);

  // 1. Initial Sync (Force sync with server to avoid 'stuck' persistent state)
  useEffect(() => {
    const syncWithServer = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        const rawData = response?.data?.data?.activeOrder || response?.data?.data;
        const serverData = (rawData && (rawData._id || rawData.orderId)) ? rawData : null;
        
        if (serverData) {
          // Robust location mapping (Same as acceptOrder logic)
          const getLoc = (ref, keysLat, keysLng) => {
            if (!ref) return null;
            if (ref.location) {
              if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
                return {
                  lat: ref.location.coordinates[1],
                  lng: ref.location.coordinates[0]
                };
              }
              return {
                lat: ref.location.latitude || ref.location.lat,
                lng: ref.location.longitude || ref.location.lng
              };
            }
            for (const k of keysLat) { if (ref[k] != null) return { lat: ref[k], lng: ref[keysLng[keysLat.indexOf(k)]] }; }
            return null;
          };

          const resLoc = getLoc(serverData.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) || 
                         getLoc(serverData, ['restaurant_lat', 'restaurantLat', 'latitude'], ['restaurant_lng', 'restaurantLng', 'longitude']);
                         
          const cusLoc = getLoc(serverData.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) || 
                         getLoc(serverData, ['customer_lat', 'customerLat', 'latitude'], ['customer_lng', 'customerLng', 'longitude']);

          const syncedOrder = {
            ...serverData,
            _id: serverData._id,
            orderId: serverData.orderId || serverData.order_id || serverData._id,
            restaurantLocation: resLoc,
            customerLocation: cusLoc
          };

          setActiveOrder(syncedOrder);
          
          const backendStatus = serverData.deliveryStatus || serverData.orderState?.status || serverData.orderStatus || serverData.status;
          const currentPhase = serverData.deliveryState?.currentPhase;

          if (['delivered', 'completed', 'DELIVERED'].includes(backendStatus)) {
            updateTripStatus('COMPLETED');
          } else if (currentPhase === 'at_drop' || ['reached_drop', 'REACHED_DROP'].includes(backendStatus)) {
            updateTripStatus('REACHED_DROP');
          } else if (['picked_up', 'PICKED_UP', 'delivering'].includes(backendStatus)) {
            updateTripStatus('PICKED_UP');
          } else if (currentPhase === 'at_pickup' || ['reached_pickup', 'REACHED_PICKUP'].includes(backendStatus)) {
            updateTripStatus('REACHED_PICKUP');
          } else if (['confirmed', 'preparing', 'ready_for_pickup'].includes(backendStatus)) {
            updateTripStatus('PICKING_UP');
          }
        } else {
          clearActiveOrder();
        }
      } catch (err) { 
        console.error('Order Sync Failed:', err); 
        clearActiveOrder();
      } finally {
        setIsDashboardBootstrapping(false);
      }
    };
    syncWithServer();
  }, []); // Only on mount to stabilize state
  
  // 1.5 Professional Unified ETA Calculation Hook
  useEffect(() => {
    // If we have distance, calculate ETA. Fallback to 8m/s (28km/h) avg if GPS speed is unknown.
    if (distanceToTarget != null && distanceToTarget !== Infinity) {
      const avgSpeed = rollingSpeedRef.current.length > 0 
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length 
        : 8;
      
      setEta(calculateETA(distanceToTarget, avgSpeed));
    } else {
      setEta(null);
    }
  }, [distanceToTarget]);

  // 2. Online/Offline Status Sync (Low Frequency)
  useEffect(() => {
    if (!isOnline) {
      deliveryAPI.updateOnlineStatus(false).catch(() => {});
      return;
    }

    if (lastCoordRef.current) {
      syncDeliveryZoneState(lastCoordRef.current.lat, lastCoordRef.current.lng, true).catch(() => {});
    }
  }, [isOnline, syncDeliveryZoneState]);


  useGpsTracker({ isOnline, isSimMode, syncUsingFallbackLocation });
  useRouteManager();
  useRealtimeSync({ isOnline, syncDeliveryZoneState, emitLocation });

  // 3.5. Background Ping / Heartbeat
  // If watchPosition stops firing (e.g. app in background or device stationary),
  // this ensures we ping the backend periodically. This keeps the token fresh (via 401 interceptor)
  // and keeps the Delivery Partner "online" in the backend.
  useEffect(() => {
    if (!isOnline) return;
    
    const pingInterval = setInterval(() => {
      const now = Date.now();
      // If no natural GPS update happened in the last 15 seconds, force a ping
      if (now - lastLocationSentAt.current >= 15000 && lastCoordRef.current) {
        lastLocationSentAt.current = now;
        syncDeliveryZoneState(
          lastCoordRef.current.lat, 
          lastCoordRef.current.lng, 
          true, 
          { heading: 0, speed: 0, accuracy: null }
        ).catch(() => {});
      }
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(pingInterval);
  }, [isOnline, syncDeliveryZoneState]);

  useEffect(() => { 
    const partnerId = deliveryPartnerIdRef.current || resolveDeliveryPartnerIdFromClient();
    if (shouldKeepIncomingOrder(newOrder, partnerId)) {
      setIncomingOrder(newOrder);
    }
  }, [newOrder]);

  useEffect(() => {
    const partnerId = deliveryPartnerIdRef.current || resolveDeliveryPartnerIdFromClient();
    if (shouldKeepIncomingOrder(incomingOrder, partnerId)) {
      setStickyIncomingOrder(incomingOrder);
      debugDeliveryWebView('[DeliveryWebView] sticky popup order updated', {
        orderId: getIncomingOrderIdentity(incomingOrder),
      });
    }
  }, [incomingOrder]);

  useEffect(() => {
    if (activeOrder && incomingOrder) {
      const activeOrderId = getIncomingOrderIdentity(activeOrder);
      const incomingOrderId = getIncomingOrderIdentity(incomingOrder);

      if (activeOrderId && incomingOrderId && activeOrderId === incomingOrderId) {
        debugDeliveryWebView('[DeliveryWebView] clearing popup because order is now active', {
          activeOrderId,
        });
        setIncomingOrder(null);
        setStickyIncomingOrder(null);
        setForcedPopupOrder(null);
        setHardPopupOrder(null);
        externalPopupLockRef.current = false;
      }
    }
  }, [activeOrder, incomingOrder]);

  // When another delivery partner claims the incoming order (via socket 'order_claimed'),
  // dismiss the NewOrderModal and inform this delivery boy.
  useEffect(() => {
    if (!claimedOrderId) return;
    const incomingId = incomingOrder?.orderId || incomingOrder?._id || incomingOrder?.orderMongoId;
    if (incomingId && String(incomingId) === String(claimedOrderId)) {
      toast.info('Order was taken by another delivery partner.', { duration: 4000 });
      setIncomingOrder(null);
      setStickyIncomingOrder(null);
      setForcedPopupOrder(null);
      setHardPopupOrder(null);
      externalPopupLockRef.current = false;
      clearNewOrder();
      clearPersistedIncomingOrder();
    }
    clearClaimedOrderId();
  }, [claimedOrderId]);




  useEffect(() => {
    const shouldPollAvailableOrder =
      Boolean(useDeliveryStore.getState().activeOrder) || (isOnline && tab === 'feed');

    if (!shouldPollAvailableOrder) return undefined;

    void hydrateAvailableOrder();

    const poller = window.setInterval(() => {
      if (document.hidden) return;

      const hasActiveOrder = Boolean(useDeliveryStore.getState().activeOrder);
      const canPollFeed = isOnline && tab === 'feed';

      if (!hasActiveOrder && !canPollFeed) return;

      void hydrateAvailableOrder();
    }, isSocketConnected ? 12000 : 5000);

    return () => {
      window.clearInterval(poller);
    };
  }, [tab, isOnline, isSocketConnected, hydrateAvailableOrder]);

  useEffect(() => {
    if (orderStatusUpdate) {
      if (orderStatusUpdate.status === 'cancelled') {
        toast.error('Order cancelled');
        resetTrip();
      }
      clearOrderStatusUpdate();
    }
  }, [orderStatusUpdate, resetTrip, clearOrderStatusUpdate]);

  // Handle Real-time Admin Notifications
  useEffect(() => {
    if (adminNotification) {
      toast.info(adminNotification.title || "New Notification", {
        description: adminNotification.message || adminNotification.body || "",
        duration: 8000,
        action: {
          label: "View",
          onClick: () => setShowNotifications(true)
        }
      });
      clearAdminNotification();
    }
  }, [adminNotification, clearAdminNotification]);


  const handleCenterMap = () => {
    if (mapRef.current && useDeliveryStore.getState().riderLocation) {
      mapRef.current.userHasInteracted = false;
      const loc = useDeliveryStore.getState().riderLocation;
      mapRef.current.panTo({ 
        lat: parseFloat(loc.lat || loc.latitude), 
        lng: parseFloat(loc.lng || loc.longitude) 
      });
    }
  };

  const handleMapClick = (lat, lng) => {
    if (activeOrder || incomingOrder || showVerification) {
      setIsModalMinimized(true);
    }
  };

  return (
    <div className="relative h-screen w-full bg-white text-gray-900 overflow-hidden flex flex-col">
      {/* ─── 1. TOP HEADER (Premium Dark Gray) ─── */}
      {tab !== 'history' && (
      <div className="absolute top-0 inset-x-0 bg-[#121212]/95 backdrop-blur-2xl shadow-2xl z-[200] safe-top pb-2 border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-4">
             <div 
                onClick={() => navigate('/food/delivery/profile')}
                className="w-10 h-10 rounded-full border border-white/20 p-1 shadow-xl overflow-hidden bg-white/10 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
             >
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <UserIcon className="w-6 h-6 text-white/80" />
                )}
             </div>
              <button 
                onClick={async () => {
                  const nextState = !isOnline;
                  toggleOnline(); // Store action
                  if (nextState) {
                     // Try to get location and sync immediately so we are visible for dispatch right away
                     navigator.geolocation.getCurrentPosition((pos) => {
                         syncDeliveryZoneState(pos.coords.latitude, pos.coords.longitude, true).catch(() => {});
                     }, (err) => console.warn('Online sync position failed:', err), { enableHighAccuracy: true });
                  } else {
                     deliveryAPI.updateOnlineStatus(false).catch(() => {});
                  }
                }}
                className={`delivery-online-toggle relative w-[92px] h-8 rounded-full p-1 transition-all duration-500 flex items-center ${isOnline ? 'is-online bg-green-500 shadow-lg shadow-green-500/20' : 'is-offline bg-green-400 shadow-lg shadow-green-400/20'}`}
              >
                <div className={`flex items-center justify-between w-full px-2 text-[8.5px] font-black uppercase tracking-widest text-white`}>
                  <span>{isOnline ? 'Online' : ''}</span>
                  <span>{!isOnline ? 'Offline' : ''}</span>
                </div>
                <motion.div animate={{ x: isOnline ? 59 : 0 }} className="absolute left-1 w-6 h-6 bg-white rounded-full shadow-sm" />
              </button>

           </div>
          <div className="flex items-center gap-3">
             <button onClick={() => setShowEmergencyPopup(true)} className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 active:scale-95 transition-all shadow-lg"><AlertTriangle className="w-4 h-4" /></button>
             <button onClick={() => navigate('/food/delivery/help/id-card')} className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20 active:scale-95 transition-all shadow-lg"><Contact className="w-4 h-4" /></button>
             <button onClick={() => setShowNotifications(true)} className="relative w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10 active:scale-95 transition-all shadow-lg"><Bell className="w-4 h-4" />{notificationUnreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-400 border border-[#1f1f1f]" />}</button>
          </div>
        </div>

        {/* ─── LIVE STATUS / PROGRESS BADGE (MATCHED PRO) ─── */}
        <AnimatePresence>
          {tab === 'feed' && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="px-4 mt-1"
            >
              {activeOrder ? (
                <div className="grid grid-cols-2 gap-3 w-full">
                  {/* LEFT: DISTANCE (Vibrant Orange Card) */}
                  <div className="bg-[#ff8100] rounded-2xl p-3.5 shadow-xl shadow-orange-500/20 border border-orange-400/50 flex items-center justify-between overflow-hidden relative">
                    <div className="flex flex-col z-10">
                      <span className="text-[9px] text-white/70 font-black uppercase tracking-[0.15em] mb-1">Distance</span>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-white leading-none tracking-tighter">
                          {distanceToTarget && distanceToTarget !== Infinity ? (distanceToTarget / 1000).toFixed(1) : '--'}
                        </span>
                        <span className="text-[11px] text-white/80 font-bold mb-0.5">KM</span>
                      </div>
                    </div>
                    <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center z-10 shadow-lg">
                      <Navigation2 className="w-4 h-4 text-[#ff8100] rotate-45" />
                    </div>
                  </div>

                  {/* RIGHT: TIME (Emerald PRO Content) */}
                  <div className="bg-[#10B981] rounded-2xl p-3.5 shadow-xl shadow-green-500/20 border border-green-400/50 flex items-center justify-between relative overflow-hidden group">
                    <div className="flex flex-col z-10">
                      <span className="text-[9px] text-white/70 font-black uppercase tracking-[0.15em] mb-1">Arrival</span>
                      <div className="flex items-end gap-1">
                        <span className="text-2xl font-black text-white leading-none tracking-tighter">
                          {eta ? String(eta) : '--'}
                        </span>
                        <span className="text-[11px] text-white/80 font-bold mb-0.5">MIN</span>
                      </div>
                    </div>
                    <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center z-10 shadow-lg">
                       <Clock className="w-4 h-4 text-[#10B981]" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 rounded-2xl p-4 flex items-center border border-white/5 shadow-sm backdrop-blur-md">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                      <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-white font-black text-[11px] uppercase tracking-widest leading-none mb-1">
                        {isOnline ? 'System Online' : 'System Offline'} 
                        {isOnline && deliveryZone?.name && (
                          <span className="ml-2 text-green-400">• {deliveryZone.name}</span>
                        )}
                      </h3>
                      <p className="text-gray-400 text-[10px] font-bold uppercase tracking-tight">
                        {isOnline 
                          ? (currentZoneId ? 'Receiving orders in your zone' : 'Outside service area') 
                          : 'Go online to receive jobs'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!activeOrder && cashLimitNotice?.blocked && (
                <div className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
                    Cash Limit Alert
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-amber-100">
                    {cashLimitNotice?.message || 'Please deposit your amount to get orders.'}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* ─── 2. MAIN CONTENT ─── */}
      <div className={`flex-1 relative overflow-y-auto ${tab === 'history' ? 'pt-0' : 'pt-[120px]'} no-scrollbar`}>
         {tab === 'feed' ? (
           <div className="absolute inset-0 top-[-120px]">
             <LiveMap 
               onMapLoad={useCallback((m) => { mapRef.current = m; }, [])}
               onMapClick={handleMapClick}
               onPathReceived={setSimPath}
               onPolylineReceived={useCallback((poly) => {
                 setActivePolyline(poly);
                 const orderId = activeOrder?.orderId || activeOrder?._id;
                 if (orderId && poly) {
                   writeOrderTracking(orderId, { polyline: poly, status: tripStatus, eta: eta }).catch(() => {});
                 }
               }, [activeOrder, tripStatus, eta])}
               zoom={zoom}
             />
             
             <div className="absolute right-4 bottom-28 md:bottom-32 flex flex-col gap-4 z-[120]">
                <div className="flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                   <button onClick={() => setZoom(z => Math.min(22, z + 1))} className="p-3 hover:bg-gray-50 border-b border-gray-100 text-gray-900 active:scale-90 transition-all" aria-label="Zoom in"><Plus className="w-5 h-5 stroke-[2.75]" /></button>
                   <button onClick={() => setZoom(z => Math.max(8, z - 1))} className="p-3 hover:bg-gray-50 text-gray-900 active:scale-90 transition-all" aria-label="Zoom out"><Minus className="w-5 h-5 stroke-[2.75]" /></button>
                </div>
                <button 
                   onClick={() => mapRef.current?.setOptions({ gestureHandling: 'greedy' })} 
                   className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center text-blue-600 border border-gray-100 active:scale-90 transition-all"
                >
                  <div className="w-8 h-8 rounded-full border-2 border-blue-600 flex items-center justify-center"><Navigation2 className="w-4 h-4" /></div>
                </button>
                <button 
                  onClick={handleCenterMap}
                  className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center text-gray-900 border border-gray-100 group active:scale-90 transition-all"
                >
                  <Target className="w-7 h-7" />
                </button>
             </div>
           </div>
         ) : tab === 'pocket' ? (
           <PocketV2 />
         ) : tab === 'history' ? (
           <HistoryV2 />
         ) : (
           <ProfileV2 />
         )}

         {/* OVERLAYS (Persistent if active) */}
      </div>

      {/* OVERLAYS (Persistent if active) - Outside flex container to avoid clipping and z-index issues */}
      {(tab === 'feed' || activeOrder || visibleIncomingOrder) && (
        <AnimatePresence>
          {shouldRenderStickyIncomingPopup && !activeOrder && !hardPopupOrder && (
            <NewOrderModal
              order={visibleIncomingOrder}
              onAccept={handleAcceptOrder}
              onReject={handleRejectOrder}
              onMinimize={() => setIsModalMinimized(true)}
            />
          )}
          {!isModalMinimized && !hardPopupOrder && (
            <motion.div
              key="modal-container"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 top-0 bottom-[92px] z-[1200] pointer-events-none flex items-end"
            >
              <div className="w-full pointer-events-auto relative">
                {(tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') && (
                  <PickupActionModal 
                    order={activeOrder} 
                    status={tripStatus} 
                    isWithinRange={isWithinRange} 
                    distanceToTarget={distanceToTarget}
                    eta={eta}
                    onReachedPickup={reachPickup} 
                    onVerifyPickupOtp={verifyPickupOtp}
                    onPickedUp={(billImageUrl) => pickUpOrder(billImageUrl)} 
                    onMinimize={() => setIsModalMinimized(true)}
                  />
                )}
                {(tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP') && (
                  <div className="absolute inset-x-0 z-[120] px-4" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    {tripStatus === 'PICKED_UP' ? (
                      <div className="bg-white rounded-[3rem] p-8 shadow-[0_-20px_80px_rgba(0,0,0,0.4)] border border-gray-100 flex flex-col items-center">
                        {/* Handle / Minimize */}
                        <div className="w-full flex justify-center pb-4 pt-0 -mt-2">
                          <button onClick={() => setIsModalMinimized(true)} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
                             <ChevronDown className="w-6 h-6 text-gray-400 stroke-[3]" />
                          </button>
                        </div>
                        <div className="flex justify-between w-full items-center mb-10 px-2 text-left">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                               <img 
                                 src={activeOrder?.user?.logo || activeOrder?.user?.profileImage || 'https://cdn-icons-png.flaticon.com/512/1275/1275302.png'} 
                                 className="w-full h-full object-cover" 
                                 alt="User"
                               />
                            </div>
                            <div>
                               <h3 className="text-gray-950 text-2xl font-bold uppercase">Handover Drop</h3>
                               <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1.5 ${isWithinRange ? 'text-green-600' : 'text-orange-500'}`}>
                                 {isWithinRange ? 'Ready - Swipe to Arrive' : `${(distanceToTarget / 1000).toFixed(1)} km • ${eta || '--'} min Arrival`}
                               </p>
                            </div>
                          </div>
                          {(() => {
                            const cPhone = activeOrder?.userPhone || activeOrder?.customerPhone || activeOrder?.deliveryAddress?.phone || activeOrder?.userId?.phone || '';
                            if (!cPhone) return null;
                            return (
                              <button
                                onClick={(e) => {
                                  if (e && e.stopPropagation) e.stopPropagation();
                                  const cleanPhone = String(cPhone).replace(/[^\d+]/g, '');
                                  try {
                                    const link = document.createElement('a');
                                    link.href = `tel:${cleanPhone}`;
                                    link.setAttribute('target', '_self');
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  } catch (err) {
                                    window.location.href = `tel:${cleanPhone}`;
                                  }
                                }}
                                className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600 border border-green-100 active:scale-95 transition-all shadow-md shrink-0"
                              >
                                <Phone className="w-5 h-5" />
                              </button>
                            );
                          })()}
                        </div>

                        {/* Customer Instructions Panel */}
                        {activeOrder?.note && (
                          <div className="w-full bg-orange-50 border border-orange-100 rounded-3xl p-5 mb-8 flex gap-4 items-start shadow-sm mx-2">
                             <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-orange-500 shadow-sm shrink-0 border border-orange-50">
                                <Package className="w-5 h-5" />
                             </div>
                             <div className="flex-1">
                                <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em] mb-1.5 opacity-80">Drop Message</p>
                                <p className="text-sm font-bold text-gray-950 leading-relaxed capitalize">"{activeOrder.note}"</p>
                             </div>
                          </div>
                        )}
                        <ActionSlider label="Slide to Arrive" successLabel="Arrived âœ“" disabled={!isWithinRange} onConfirm={reachDrop} color="bg-blue-600" />
                      </div>
                    ) : (
                      <button 
                        onClick={() => setShowVerification(true)} 
                        className="w-full text-white rounded-2xl py-4 sm:py-5 px-4 font-bold text-xs sm:text-sm tracking-[0.14em] transform transition-all active:scale-95 flex items-center justify-center gap-2.5 sm:gap-3 border border-white/20"
                        style={{
                          background: 'linear-gradient(33deg, #15498b 0%, #000000 100%)',
                          boxShadow: '0 14px 34px rgba(21, 73, 139, 0.42)',
                        }}
                      >
                        <CheckCircle2 className="w-6 h-6" /> VERIFY & COMPLETE
                      </button>
                    )}
                  </div>
                )}
                {showVerification && tripStatus !== 'COMPLETED' && (
                  <DeliveryVerificationModal 
                    order={activeOrder} 
                    onComplete={async (otp, paymentOverride) => {
                      const res = await completeDelivery(otp, paymentOverride);
                      setShowVerification(false);
                      return res;
                    }}
                    onClose={() => setShowVerification(false)}
                  />
                )}
                {tripStatus === 'COMPLETED' && <OrderSummaryModal order={activeOrder} onDone={resetTrip} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ─── MODALS RESTORED FROM OLD UI ─── */}
      <BottomPopup isOpen={showEmergencyPopup} title="Emergency Help" onClose={() => setShowEmergencyPopup(false)}>
         <div className="grid gap-4 py-2">
           {emergencyOptions.map((opt, i) => (
             <button 
               key={i} 
               onClick={(e) => {
                 if (e && e.stopPropagation) e.stopPropagation();
                 const num = opt.phone?.replace(/\D/g, '');
                 if (num) {
                   try {
                     const link = document.createElement('a');
                     link.href = `tel:${num}`;
                     link.setAttribute('target', '_self');
                     document.body.appendChild(link);
                     link.click();
                     document.body.removeChild(link);
                   } catch (err) {
                     window.location.href = `tel:${num}`;
                   }
                 } else {
                   toast.error('Number not configured');
                 }
               }}
               className="flex items-center gap-5 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 active:scale-95 transition-all text-left"
             >
               <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-xl">{opt.icon}</div>
               <div>
                 <h4 className="font-bold text-gray-900">{opt.title}</h4>
                 <p className="text-xs text-gray-500 font-medium">{opt.subtitle}</p>
               </div>
             </button>
           ))}
         </div>
      </BottomPopup>

      <BottomPopup 
        isOpen={showNotifications} 
        title="Notifications" 
        onClose={() => {
           setShowNotifications(false);
           // Optional: refresh count if needed
        }}
      >
         <div className="flex flex-col gap-3 -mt-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
            {broadcastItems && broadcastItems.length > 0 ? (
               <>
                  <div className="flex justify-end mb-1">
                     <button 
                        onClick={() => {
                           dismissAllBroadcast();
                           toast.success("All notifications cleared");
                        }}
                        className="text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-50 px-3 py-1.5 rounded-full"
                     >
                        Clear All
                     </button>
                  </div>
                  <div className="grid gap-2.5">
                     {broadcastItems.map((item) => (
                        <div 
                           key={item.id} 
                           onClick={() => {
                              markBroadcastAsRead(item.id);
                              if (item.link) {
                                 // Handle link if present
                                 const path = item.link.startsWith('/') ? item.link : `/${item.link}`;
                                 navigate(path);
                                 setShowNotifications(false);
                              }
                           }}
                           className={`p-4 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer ${item.read ? 'bg-gray-50 border-gray-100' : 'bg-orange-50 border-orange-100 shadow-sm shadow-orange-500/5'}`}
                        >
                           <div className="flex gap-3 items-start">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.read ? 'bg-gray-200 text-gray-500' : 'bg-[#EB590E] text-white shadow-lg'}`}>
                                 <Bell className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                 <div className="flex justify-between items-start gap-2">
                                    <h4 className={`text-sm font-bold truncate ${item.read ? 'text-gray-600' : 'text-gray-950'}`}>
                                       {item.title}
                                    </h4>
                                    <span className="text-[9px] font-black uppercase text-gray-400 shrink-0 whitespace-nowrap pt-0.5">
                                       {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                 </div>
                                 <p className={`text-[12px] leading-relaxed mt-0.5 break-words ${item.read ? 'text-gray-500 line-clamp-2' : 'text-gray-700'}`}>
                                    {item.message}
                                 </p>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </>
            ) : (
               <div className="py-20 flex flex-col items-center justify-center text-center px-10">
                  <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-4 border border-gray-100/50">
                     <Bell className="w-7 h-7 text-gray-300" />
                  </div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest leading-none mb-2">No Notifications</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-tight leading-relaxed">System notifications for order requests and updates will appear here.</p>
               </div>
            )}
         </div>
         <div className="mt-8 mb-2">
            <button 
               onClick={() => {
                  setShowNotifications(false);
                  navigate('/food/delivery/notifications');
               }}
               className="w-full py-4 rounded-2xl bg-gray-950 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-gray-950/20 active:scale-95 transition-all"
            >
               View Notification History
            </button>
         </div>
      </BottomPopup>

      {/* Floating Minimize/Restore Toggle - Above navbar */}
      {isModalMinimized && !externalPopupLockRef.current && !hardPopupOrder && (activeOrder || incomingOrder || showVerification) && (
        <motion.div 
           initial={{ y: 100, opacity: 0 }}
           animate={{ y: 0, opacity: 1 }}
           className="fixed bottom-[100px] inset-x-0 z-[300] px-6"
        >
           <button 
             onClick={() => setIsModalMinimized(false)}
             className="w-full bg-gray-900/90 text-white rounded-2xl py-4 flex items-center justify-between px-6 shadow-2xl backdrop-blur-md border border-white/10"
           >
              <div className="flex flex-col items-start gap-0.5">
                 <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Order Action Pending</span>
                 <span className="text-xs font-bold uppercase tracking-wider">Tap to open delivery panel</span>
              </div>
              <div className="bg-orange-500 p-2 rounded-xl text-white">
                 <Plus className="w-5 h-5" />
              </div>
           </button>
        </motion.div>
      )}

      {typeof document !== 'undefined' && hardPopupOrder && createPortal(
        <div
          className="fixed inset-0 z-[1000] bg-black/60 flex items-end justify-center p-0 pointer-events-auto"
          data-delivery-emergency-popup="true"
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
            {(() => {
              const orderId = hardPopupOrder?.orderId || hardPopupOrder?._id || 'N/A';
              const earningAmount =
                hardPopupOrder?.earnings ??
                hardPopupOrder?.riderEarning ??
                hardPopupOrder?.deliveryEarning ??
                hardPopupOrder?.earningAmount ??
                hardPopupOrder?.amount ??
                hardPopupOrder?.deliveryFee ??
                hardPopupOrder?.pricing?.deliveryFee ??
                0;
              const timeText = `${hardPopupTimeLeft}s`;

              // Helper methods copied from NewOrderModal
              const toFiniteNumber = (value) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
              };

              const resolveCoords = (...candidates) => {
                for (const candidate of candidates) {
                  if (!candidate) continue;
                  if (Array.isArray(candidate) && candidate.length >= 2) {
                    const lng = toFiniteNumber(candidate[0]);
                    const lat = toFiniteNumber(candidate[1]);
                    if (lat !== null && lng !== null) return { lat, lng };
                    continue;
                  }
                  const lat = toFiniteNumber(candidate.lat ?? candidate.latitude ?? candidate.coordinates?.[1]);
                  const lng = toFiniteNumber(candidate.lng ?? candidate.longitude ?? candidate.coordinates?.[0]);
                  if (lat !== null && lng !== null) return { lat, lng };
                }
                return null;
              };

              const formatDistanceLabel = (distanceKm) => {
                if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
                if (distanceKm >= 1) return `${distanceKm.toFixed(1)} km`;
                return `${Math.round(distanceKm * 1000)} m`;
              };

              const restaurantCoords = resolveCoords(
                hardPopupOrder?.restaurantLocation,
                hardPopupOrder?.restaurantId?.location,
                {
                  lat: hardPopupOrder?.restaurant_lat ?? hardPopupOrder?.restaurantLat,
                  lng: hardPopupOrder?.restaurant_lng ?? hardPopupOrder?.restaurantLng,
                },
              );

              const deliveryGeoCoords =
                Array.isArray(hardPopupOrder?.deliveryAddress?.location?.coordinates) &&
                hardPopupOrder.deliveryAddress.location.coordinates.length >= 2
                  ? {
                      lng: hardPopupOrder.deliveryAddress.location.coordinates[0],
                      lat: hardPopupOrder.deliveryAddress.location.coordinates[1],
                    }
                  : null;

              const customerCoords = resolveCoords(
                hardPopupOrder?.customerLocation,
                hardPopupOrder?.deliveryLocation,
                hardPopupOrder?.deliveryAddress?.location,
                deliveryGeoCoords,
                {
                  lat: hardPopupOrder?.customer_lat ?? hardPopupOrder?.customerLat,
                  lng: hardPopupOrder?.customer_lng ?? hardPopupOrder?.customerLng,
                },
              );

              const restaurantToCustomerDistanceKm =
                restaurantCoords && customerCoords
                  ? getHaversineDistance(
                      restaurantCoords.lat,
                      restaurantCoords.lng,
                      customerCoords.lat,
                      customerCoords.lng,
                    ) / 1000
                  : null;

              const rawDist = hardPopupOrder?.pickupDistanceKm || hardPopupOrder?.distanceKm;
              const rawEta = hardPopupOrder?.estimatedTime || hardPopupOrder?.duration || hardPopupOrder?.eta;
              
              let pickupDistanceKm = '??';
              let etaMins = hardPopupOrder?.prepTime || 15;
              let restaurantToCustomerDistanceLabel = formatDistanceLabel(restaurantToCustomerDistanceKm);

              if (rawDist != null) {
                pickupDistanceKm = Number(rawDist).toFixed(1);
                etaMins = rawEta && rawEta > 0 ? Math.ceil(rawEta) : Math.ceil((rawDist * 1000) / 416) + 5;
              } else if (useTrackingStore.getState().riderLocation && restaurantCoords) {
                const rLoc = useTrackingStore.getState().riderLocation;
                const distM = getHaversineDistance(rLoc.lat, rLoc.lng, restaurantCoords.lat, restaurantCoords.lng);
                pickupDistanceKm = (distM / 1000).toFixed(1);
                etaMins = Math.ceil(distM / 416) + (hardPopupOrder?.prepTime || 5);
              }

              const restaurantName = hardPopupOrder?.restaurantName || hardPopupOrder?.restaurant_name || (hardPopupOrder?.restaurantId?.name) || 'Restaurant';
              const restaurantAddress = hardPopupOrder?.restaurantAddress || hardPopupOrder?.restaurant_address || (hardPopupOrder?.restaurantId?.location?.address) || 'Address not available';
              const deliveryAddressObj = hardPopupOrder?.deliveryAddress || {};
              const addressPartsFromSchema = [
                deliveryAddressObj.street,
                deliveryAddressObj.additionalDetails,
                deliveryAddressObj.city,
                deliveryAddressObj.state,
                deliveryAddressObj.zipCode,
              ].map((v) => String(v || '').trim()).filter(Boolean);

              const customerAddress =
                hardPopupOrder?.customerAddress ||
                hardPopupOrder?.customer_address ||
                (addressPartsFromSchema.length ? addressPartsFromSchema.join(', ') : '') ||
                (customerCoords?.lat != null && customerCoords?.lng != null
                  ? `Lat ${Number(customerCoords.lat).toFixed(5)}, Lng ${Number(customerCoords.lng).toFixed(5)}`
                  : 'Location not available');

              const mapsLink =
                customerCoords?.lat != null && customerCoords?.lng != null
                  ? `https://www.google.com/maps?q=${encodeURIComponent(`${customerCoords.lat},${customerCoords.lng}`)}`
                  : null;

              return (
                <>
        <div className="w-full flex justify-center pb-1.5 pt-1 bg-white relative z-10 rounded-t-3xl sm:rounded-t-[3rem] -mb-1">
          <button onClick={() => setIsModalMinimized(true)} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
             <ChevronDown className="w-6 h-6 text-gray-400 stroke-[3]" />
          </button>
        </div>

        {/* Header Ribbon (Old Green Style) */}
        <div 
          className="p-4 sm:p-8 flex justify-between items-center text-white border-b border-white/10"
          style={{ background: 'linear-gradient(33deg, #15498b 0%, #000000 100%)' }}
        >
          <div>
            <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-1">
              Incoming Request {orderId !== 'N/A' && `• #${orderId}`}
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tighter">
                {typeof formatEmergencyPopupCurrency === 'function' ? formatEmergencyPopupCurrency(earningAmount) : `₹${earningAmount}`}
            </h2>
          </div>
          <div className="min-w-[72px] sm:min-w-[92px] min-h-[56px] sm:min-h-[68px] bg-white/20 border border-white/30 rounded-2xl sm:rounded-3xl px-3 sm:px-6 py-2 sm:py-3 text-white font-bold text-lg sm:text-2xl shadow-inner tabular-nums flex items-center justify-center leading-none text-center">
            <span className="block leading-none">{timeText}</span>
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
                  <Contact className="w-4 h-4" />
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
                {restaurantToCustomerDistanceLabel && (
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                    Restaurant to customer: {restaurantToCustomerDistanceLabel}
                  </p>
                )}
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
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Pickup</span>
                  <span className="text-sm font-bold text-gray-900">
                    {pickupDistanceKm === '??' ? pickupDistanceKm : `${pickupDistanceKm} KM`}
                  </span>
               </div>
             </div>
          </div>

        {/* Action Area */}
          <div className="space-y-4 sm:space-y-6 pt-1 sm:pt-2">
            <ActionSlider 
              label="Slide to Accept" 
              onConfirm={() => handleAcceptOrder(hardPopupOrder)} 
              color="bg-black"
              successLabel="Order Accepted"
            />

            <button 
              onClick={handleRejectOrder}
              className="w-full text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-500 transition-colors py-2 active:scale-95"
            >
              Pass this task
            </button>
          </div>
        </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ─── 3. BOTTOM NAV (Fixed - Compact Pro) ─── */}
      <div className="bg-white border-t border-gray-100 px-8 py-3 pb-6 flex justify-between items-center z-[200] shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
         <button onClick={() => navigate('/food/delivery/feed')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'feed' ? 'text-gray-950 scale-110' : 'text-gray-400 opacity-70'}`}>
            <LayoutGrid className="w-6 h-6" /><span className="text-[11px] font-medium font-sans">Feed</span>
         </button>
         <button onClick={() => navigate('/food/delivery/pocket')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'pocket' ? 'text-gray-950 scale-110' : 'text-gray-400 opacity-70'}`}>
            <Wallet className="w-6 h-6" /><span className="text-[11px] font-medium font-sans">Pocket</span>
         </button>
         <button onClick={() => navigate('/food/delivery/history')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'history' ? 'text-gray-950 scale-110' : 'text-gray-400 opacity-70'}`}>
            <History className="w-6 h-6" /><span className="text-[11px] font-medium font-sans">Trip History</span>
         </button>
         <button onClick={() => navigate('/food/delivery/profile')} className={`flex flex-col items-center gap-1 transition-all ${tab === 'profile' ? 'text-gray-950 scale-110' : 'text-gray-400 opacity-70'}`}>
            <UserIcon className="w-6 h-6" /><span className="text-[11px] font-medium font-sans">Profile</span>
         </button>
      </div>
    </div>
  );
}
