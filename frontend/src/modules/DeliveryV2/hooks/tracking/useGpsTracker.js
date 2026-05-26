import { useEffect, useRef } from 'react';
import { useTrackingStore } from './useTrackingStore';
import { filterGpsSignal, resetGpsFilter } from '../../utils/gpsFiltering';
import { toast } from 'sonner';

/**
 * Core Web GPS watching & filtering hook.
 * Handles geolocation, kalman filtering, and outlier rejection.
 * FIXED: Does not restart on visibility change.
 */
export const useGpsTracker = ({ isOnline, isSimMode, syncUsingFallbackLocation }) => {
  const setRiderLocation = useTrackingStore(state => state.setRiderLocation);
  const gpsErrorToastShownRef = useRef(false);
  const rollingSpeedRef = useRef([]);
  const lastUpdateRef = useRef(Date.now());
  const watchIdRef = useRef(null);
  const trackingStartTimeRef = useRef(null);

  useEffect(() => {
    if (!isOnline) {
      resetGpsFilter();
      trackingStartTimeRef.current = null;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!trackingStartTimeRef.current) {
      trackingStartTimeRef.current = Date.now();
    }

    if (!navigator.geolocation) {
      if (!gpsErrorToastShownRef.current) {
        gpsErrorToastShownRef.current = true;
        toast.error('GPS Unavailable', { description: 'This device does not support location services.' });
      }
      return;
    }

    const handlePositionUpdate = (pos) => {
      if (isSimMode) return;

      const { latitude: lat, longitude: lng, heading, speed, accuracy } = pos.coords;
      const timestamp = pos.timestamp || Date.now();
      lastUpdateRef.current = Date.now();

      // Dynamic Accuracy Threshold: 
      // First 15 seconds: Accept up to 300m for fast initial load.
      // After 15 seconds: Tighten strictly to 50m to stop jumping.
      const elapsedMs = Date.now() - (trackingStartTimeRef.current || Date.now());
      const maxAccuracy = elapsedMs < 15000 ? 300 : 50;

      // Reject if worse than dynamic threshold
      if (accuracy > maxAccuracy) return;

      const filterResult = filterGpsSignal(lat, lng, accuracy, timestamp, maxAccuracy);
      
      if (!filterResult.valid) {
        return;
      }

      gpsErrorToastShownRef.current = false;
      const validLocation = filterResult.location;
      
      if (speed && speed > 0) {
        rollingSpeedRef.current = [...rollingSpeedRef.current.slice(-4), speed];
      }
      const avgSpeed = rollingSpeedRef.current.length > 0 
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length 
        : speed || 0;

      setRiderLocation({
        ...validLocation,
        heading: heading || 0,
        speed: avgSpeed,
        accuracy,
        timestamp // Preserve exact capture time
      });
    };

    const handleError = (error) => {
      console.warn('Geolocation watch failed', error);
      if (gpsErrorToastShownRef.current) return;
      
      // Ignore timeout errors if we already have a recent location
      if (error.code === error.TIMEOUT && (Date.now() - lastUpdateRef.current < 15000)) {
        return;
      }

      gpsErrorToastShownRef.current = true;
      const errorDescription = error?.code === error?.PERMISSION_DENIED
        ? 'Location permission is blocked. Please allow GPS access.'
        : 'Could not read your live location. Please check GPS.';
        
      if (typeof syncUsingFallbackLocation === 'function') {
         syncUsingFallbackLocation(`gps_watch_error_${error?.code || 'unknown'}`);
      }
      toast.error('GPS Unavailable', { description: errorDescription });
    };

    // Watch options: High accuracy always, no visibility throttling
    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handleError,
      options
    );

    // Fast initial fallback timeout for initial connection hanging
    const initialFallbackTimeout = setTimeout(() => {
      if (Date.now() - lastUpdateRef.current > 4000) {
        console.warn('[GPS Watchdog] Initial fast fallback triggered (GPS taking too long)');
        if (typeof syncUsingFallbackLocation === 'function') {
          syncUsingFallbackLocation('gps_fast_fallback');
        }
      }
    }, 5000);

    // Watchdog to restart GPS if it completely freezes silently (browser bug)
    const watchdog = setInterval(() => {
      if (Date.now() - lastUpdateRef.current > 20000 && watchIdRef.current !== null) {
        console.warn('[GPS Watchdog] Restarting frozen GPS watcher');
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(handlePositionUpdate, handleError, options);
        lastUpdateRef.current = Date.now(); // Reset timer to give it a chance
      }
    }, 10000);

    return () => {
      clearTimeout(initialFallbackTimeout);
      clearInterval(watchdog);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOnline, isSimMode, setRiderLocation, syncUsingFallbackLocation]);
};
