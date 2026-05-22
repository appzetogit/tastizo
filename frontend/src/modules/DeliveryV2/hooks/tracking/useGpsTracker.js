import { useEffect, useRef, useState } from 'react';
import { useTrackingStore } from './useTrackingStore';
import { filterGpsSignal, resetGpsFilter } from '../../utils/gpsFiltering';
import { toast } from 'sonner';

/**
 * Core Web GPS watching & filtering hook.
 * Handles geolocation, kalman filtering, and outlier rejection.
 */
export const useGpsTracker = ({ isOnline, isSimMode, syncUsingFallbackLocation }) => {
  const setRiderLocation = useTrackingStore(state => state.setRiderLocation);
  const gpsErrorToastShownRef = useRef(false);
  const rollingSpeedRef = useRef([]);

  const [isVisible, setIsVisible] = useState(typeof document !== 'undefined' ? !document.hidden : true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isOnline) {
      resetGpsFilter();
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
      if (isSimMode) return; // Disable real GPS if in sim mode

      const { latitude: lat, longitude: lng, heading, speed, accuracy } = pos.coords;
      const timestamp = pos.timestamp || Date.now();

      // GPS Filtering
      const filterResult = filterGpsSignal(lat, lng, accuracy, timestamp);
      
      if (!filterResult.valid) {
        if (filterResult.reason !== 'micro_movement_ignored') {
          console.warn(`[GPS] Point rejected: ${filterResult.reason}`);
        }
        return;
      }

      gpsErrorToastShownRef.current = false;
      const validLocation = filterResult.location;
      
      // Keep running average for speed
      if (speed && speed > 0) {
        rollingSpeedRef.current = [...rollingSpeedRef.current.slice(-4), speed];
      }
      const avgSpeed = rollingSpeedRef.current.length > 0 
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length 
        : speed || 0;

      const updatedLocation = {
        ...validLocation,
        heading: heading || 0,
        speed: avgSpeed,
        accuracy
      };

      setRiderLocation(updatedLocation);
    };

    // Fast initial fix
    navigator.geolocation.getCurrentPosition(
      handlePositionUpdate,
      () => {
        if (typeof syncUsingFallbackLocation === 'function') {
           syncUsingFallbackLocation('gps_initial_timeout');
        }
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 5000 }
    );

    // Continuous watch with battery/visibility optimization
    const options = isVisible 
      ? { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 } // Hardware ping
      : { enableHighAccuracy: false, maximumAge: 10000, timeout: 10000 }; // Battery saver

    const watchId = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      (error) => {
        console.warn('Geolocation watch failed', error);
        if (gpsErrorToastShownRef.current) return;
        
        gpsErrorToastShownRef.current = true;
        const errorDescription = error?.code === error?.PERMISSION_DENIED
          ? 'Location permission is blocked. Please allow GPS access to continue.'
          : 'We could not read your live location. Please check GPS and try again.';
          
        if (typeof syncUsingFallbackLocation === 'function') {
           syncUsingFallbackLocation(`gps_watch_error_${error?.code || 'unknown'}`);
        }
        toast.error('GPS Unavailable', { description: errorDescription });
      },
      options
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isOnline, isSimMode, isVisible, setRiderLocation, syncUsingFallbackLocation]);
};
