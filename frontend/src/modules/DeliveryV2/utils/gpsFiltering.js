import { KalmanFilter } from './kalmanFilter';
import { getHaversineDistance } from './geo';

const MAX_SPEED_MPS = 45; // ~160 km/h, reject teleportation
const MIN_DISTANCE_M = 3; // Ignore micro-movements under 3 meters
const kalmanFilter = new KalmanFilter();

let lastValidLocation = null;

export const filterGpsSignal = (lat, lng, accuracy, timestamp, maxAccuracy = 50) => {
  if (accuracy > maxAccuracy) {
    return { valid: false, reason: 'accuracy_too_low' };
  }

  const now = timestamp || Date.now();

  if (lastValidLocation) {
    const timeDiffMs = now - lastValidLocation.timestamp;
    if (timeDiffMs > 0) {
      const dist = getHaversineDistance(lastValidLocation.lat, lastValidLocation.lng, lat, lng);
      
      if (dist < MIN_DISTANCE_M) {
        // Return valid but indicate no meaningful movement so UI doesn't rerender unnecessarily
        return { valid: false, reason: 'micro_movement_ignored' };
      }

      const speed = dist / (timeDiffMs / 1000); // meters per second

      if (speed > MAX_SPEED_MPS) {
        return { valid: false, reason: 'teleportation_detected' };
      }
    }
  }

  const smoothed = kalmanFilter.process(lat, lng, accuracy, now);
  
  lastValidLocation = {
    lat: smoothed.lat,
    lng: smoothed.lng,
    timestamp: now,
  };

  return { valid: true, location: lastValidLocation };
};

export const resetGpsFilter = () => {
  lastValidLocation = null;
  kalmanFilter.variance = -1; // Reset Kalman state
};
