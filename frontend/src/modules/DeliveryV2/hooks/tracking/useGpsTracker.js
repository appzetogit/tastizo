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

  useEffect(() => {
    if (!isOnline) {
      resetGpsFilter();
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
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

      // Reject low accuracy immediately to avoid jumping
      if (accuracy > 50) return;

      const filterResult = filterGpsSignal(lat, lng, accuracy, timestamp);
      
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
      clearInterval(watchdog);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOnline, isSimMode, setRiderLocation, syncUsingFallbackLocation]);
};
