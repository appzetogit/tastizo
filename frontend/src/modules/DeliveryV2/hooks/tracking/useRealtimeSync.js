import { useEffect, useRef, useState } from 'react';
import { useTrackingStore } from './useTrackingStore';
import { useDeliveryStore } from '../../store/useDeliveryStore';
import { writeOrderTracking } from '@food/realtimeTracking';
import { getHaversineDistance } from '../../utils/geo';
import { saveToOfflineQueue } from '../../utils/batchQueue';

const SYNC_INTERVAL_MS = 5000; // 5 seconds
const MIN_DISTANCE_SYNC_M = 20; // 20 meters

export const useRealtimeSync = ({ isOnline, syncDeliveryZoneState, emitLocation }) => {
  const riderLocation = useTrackingStore(state => state.riderLocation);
  const activePolyline = useTrackingStore(state => state.activePolyline);
  const eta = useTrackingStore(state => state.eta);
  
  const activeOrder = useDeliveryStore(state => state.activeOrder);
  const tripStatus = useDeliveryStore(state => state.tripStatus);

  const lastSyncTimeRef = useRef(0);
  const lastSyncLocationRef = useRef(null);
  
  // Ref to hold current state without triggering re-renders in the effect
  const stateRef = useRef({
    riderLocation,
    activePolyline,
    eta,
    activeOrder,
    tripStatus,
  });

  const [isVisible, setIsVisible] = useState(typeof document !== 'undefined' ? !document.hidden : true);

  useEffect(() => {
    const handleVisibilityChange = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    stateRef.current = { riderLocation, activePolyline, eta, activeOrder, tripStatus };
  }, [riderLocation, activePolyline, eta, activeOrder, tripStatus]);

  useEffect(() => {
    if (!isOnline) return;

    const syncTimer = setInterval(() => {
      const { riderLocation: loc, activeOrder: order, tripStatus: status, activePolyline: polyline, eta: currentEta } = stateRef.current;
      
      if (!loc) return;

      const now = Date.now();
      let shouldSync = false;

      // Adaptive Sync Interval Logic
      let dynamicSyncInterval = 2500; // Default: Fast sync (2.5s)
      let dynamicMinDistance = 10; // Default: 10 meters

      if (!isVisible) {
        dynamicSyncInterval = 15000; // Tab hidden: 15s
        dynamicMinDistance = 50;
      } else if (loc.speed !== undefined && loc.speed < 1) {
        dynamicSyncInterval = 10000; // Idle/Stationary: 10s
        dynamicMinDistance = 15;
      } else if (currentEta && currentEta.distanceValue > 2000) {
        dynamicSyncInterval = 5000; // Far away (>2km): 5s
        dynamicMinDistance = 20;
      }

      // Sync if time interval passed OR moved significant distance
      if (now - lastSyncTimeRef.current >= dynamicSyncInterval) {
        shouldSync = true;
      } else if (lastSyncLocationRef.current) {
        const distMoved = getHaversineDistance(
          loc.lat, loc.lng,
          lastSyncLocationRef.current.lat, lastSyncLocationRef.current.lng
        );
        if (distMoved >= dynamicMinDistance) {
          shouldSync = true;
        }
      } else {
        shouldSync = true; // First sync
      }

      if (shouldSync) {
        lastSyncTimeRef.current = now;
        lastSyncLocationRef.current = { lat: loc.lat, lng: loc.lng };

        const payload = {
          lat: loc.lat,
          lng: loc.lng,
          heading: loc.heading || 0,
          speed: loc.speed || 0,
          accuracy: loc.accuracy || null,
          orderId: order?.orderId || order?._id,
          status: status,
          polyline: polyline,
          eta: currentEta
        };

        // 1. HTTP to Backend (Background Zone Match)
        if (typeof syncDeliveryZoneState === 'function') {
           syncDeliveryZoneState(loc.lat, loc.lng, true, { 
             heading: loc.heading, speed: loc.speed, accuracy: loc.accuracy 
           }).catch(() => {});
        }

        if (navigator.onLine) {
          // 2. Sockets for Live UI Tracking
          if (payload.orderId && typeof emitLocation === 'function') {
             emitLocation(payload);
          }

          // 3. Firebase for persistence/customer watching
          if (payload.orderId) {
            writeOrderTracking(payload.orderId, payload).catch((e) => {
               saveToOfflineQueue(payload); // Fallback to queue if firebase fails
            });
          }
        } else {
          // Offline
          saveToOfflineQueue(payload);
        }
      }
    }, 1000); // Check every second if sync threshold is met

    return () => clearInterval(syncTimer);
  }, [isOnline, emitLocation, syncDeliveryZoneState]);
};
