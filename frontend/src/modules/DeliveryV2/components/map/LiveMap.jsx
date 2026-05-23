import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  GoogleMap, 
  Marker, 
  DirectionsService, 
  Polygon,
  Polyline,
  useJsApiLoader,
  OverlayView
} from '@react-google-maps/api';
import { getHaversineDistance } from '../../utils/geo';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { useTrackingStore } from '@/modules/DeliveryV2/hooks/tracking/useTrackingStore';
import { zoneAPI } from '@food/api';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  position: 'absolute',
  inset: 0
};

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  mapTypeControl: false,
  scaleControl: false,
  streetViewControl: false,
  rotateControl: false,
  fullscreenControl: false,
  gestureHandling: "greedy",
  styles: [
    { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
    { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] }
  ]
};
const LIBRARIES = ['places', 'geometry'];

// Atomic component to prevent GoogleMap from re-rendering at 60fps
const AnimatedRiderOverlay = React.memo(({ targetLocation, iconUrl }) => {
  const [animatedLoc, setAnimatedLoc] = useState(targetLocation);
  const animRef = useRef(null);
  const lastTargetRef = useRef(targetLocation);
  const lastGpsTimeRef = useRef(performance.now());
  const animatedLocRef = useRef(targetLocation);

  useEffect(() => {
    if (!targetLocation) return;
    if (targetLocation.lat === lastTargetRef.current?.lat && targetLocation.lng === lastTargetRef.current?.lng) {
      setAnimatedLoc(prev => prev ? { ...prev, heading: targetLocation.heading } : targetLocation);
      return;
    }

    const startLoc = animatedLocRef.current || targetLocation;
    const endLoc = targetLocation;

    const now = performance.now();
    const timeSinceLastUpdate = now - lastGpsTimeRef.current;
    lastGpsTimeRef.current = now;

    const toRad = x => x * Math.PI / 180;
    const R = 6371e3;
    const dLat = toRad(endLoc.lat - startLoc.lat);
    const dLng = toRad(endLoc.lng - startLoc.lng);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(startLoc.lat)) * Math.cos(toRad(endLoc.lat)) * Math.sin(dLng/2) * Math.sin(dLng/2);
    const distGap = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    if (distGap > 100) {
      setAnimatedLoc(endLoc);
      animatedLocRef.current = endLoc;
      lastTargetRef.current = endLoc;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    // Match animation duration dynamically up to 5000ms (max expected sync interval)
    let duration = Math.max(500, Math.min(timeSinceLastUpdate, 5000));
    if (distGap > 15) duration *= 0.6; // catch-up

    const startTime = performance.now();
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const raw = Math.min(elapsed / duration, 1);
      const progress = raw * raw * (3 - 2 * raw); // easeInOut
      
      const lat = startLoc.lat + (endLoc.lat - startLoc.lat) * progress;
      const lng = startLoc.lng + (endLoc.lng - startLoc.lng) * progress;
      
      let lastHead = startLoc.heading || 0;
      let nextHead = endLoc.heading || 0;
      if (Math.abs(nextHead - lastHead) > 180) {
        if (nextHead > lastHead) lastHead += 360;
        else nextHead += 360;
      }
      const heading = lastHead + (nextHead - lastHead) * progress;

      const nextPos = { lat, lng, heading: heading % 360 };
      animatedLocRef.current = nextPos;
      
      // Throttle React set state to ~30fps to keep CPU usage low while keeping visual smooth via css transition
      if (currentTime % 33 < 16 || raw === 1) {
          setAnimatedLoc(nextPos);
      }

      if (progress < 1) animRef.current = requestAnimationFrame(animate);
      else { lastTargetRef.current = endLoc; animRef.current = null; }
    };
    animRef.current = requestAnimationFrame(animate);
    lastTargetRef.current = endLoc;

    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [targetLocation]);

  if (!animatedLoc) return null;

  return (
    <OverlayView position={animatedLoc} mapPaneName={OverlayView.MARKER_LAYER}>
      <div style={{ transform: `translate(-50%, -50%) rotate(${animatedLoc.heading || 0}deg)`, transition: 'transform 0.1s linear' }} className="relative w-[72px] h-[72px]">
        <img src={iconUrl} alt="Rider" className="w-full h-full object-contain" onError={(e) => { e.target.src = "/MapRider.png"; }} />
      </div>
    </OverlayView>
  );
});

export const LiveMap = ({ onMapClick, onMapLoad, onPathReceived, onPolylineReceived, zoom = 12 }) => {
  const { activeOrder, tripStatus } = useDeliveryStore();
  const riderLocation = useTrackingStore(state => state.riderLocation);
  
  const isRouteActive = Boolean(activeOrder) && ['PICKING_UP', 'REACHED_PICKUP', 'PICKED_UP', 'REACHED_DROP'].includes(tripStatus);
  
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES
  });

  const [directions, setDirections] = useState(null);
  const [map, setMapInternal] = useState(null);
  const [zones, setZones] = useState([]);
  const [lastDirectionsAt, setLastDirectionsAt] = useState(0);

  const handleMapLoad = (mapInstance) => {
    mapInstance.setOptions({
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      scaleControl: false,
      streetViewControl: false,
      rotateControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy"
    });

    let isProgrammaticChange = false;
    mapInstance._setProgrammaticChange = (val) => { isProgrammaticChange = val; };
    mapInstance.userHasInteracted = false;

    const trackInteraction = () => {
      if (!isProgrammaticChange) {
        mapInstance.userHasInteracted = true;
      }
    };

    mapInstance.addListener('dragstart', trackInteraction);
    mapInstance.addListener('zoom_changed', () => {
      // Limit interaction tracking to zoom_changed if not programmatic
      if (!isProgrammaticChange) {
        // Small timeout to allow programmatic zoom to finish
        setTimeout(() => {
          if (!isProgrammaticChange) trackInteraction();
        }, 100);
      }
    });

    setMapInternal(mapInstance);
    if (onMapLoad) onMapLoad(mapInstance);
  };

  useEffect(() => {
    setLastDirectionsAt(0);
    setDirections(null);
  }, [tripStatus, activeOrder?._id]);

  // Ensure we don't keep old directions if target is lost or trip is complete/idle
  useEffect(() => {
    if (!isRouteActive) {
      setDirections(null);
      // Use refs or stable callbacks to avoid loop
      if (typeof onPathReceived === 'function') onPathReceived([]);
      if (typeof onPolylineReceived === 'function') onPolylineReceived(null);
    }
  // Only depend on isRouteActive to avoid loop when callbacks are unstable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteActive]);

  const parsePoint = useCallback((raw) => {
    if (!raw) return null;
    const lat = parseFloat(raw.lat ?? raw.latitude);
    const lng = parseFloat(raw.lng ?? raw.longitude);
    return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;
  }, []);

  const restaurantPoint = useMemo(() => parsePoint(activeOrder?.restaurantLocation), [activeOrder?.restaurantLocation, parsePoint]);
  const customerPoint = useMemo(() => parsePoint(activeOrder?.customerLocation), [activeOrder?.customerLocation, parsePoint]);

  const targetLocation = useMemo(() => {
    if (!isRouteActive || !activeOrder) return null;
    let rawLoc = null;
    if (tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') {
      rawLoc = activeOrder.restaurantLocation;
    } else if (tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP') {
      rawLoc = activeOrder.customerLocation;
    }
    if (!rawLoc) return null;
    return parsePoint(rawLoc);
  }, [activeOrder, tripStatus, parsePoint, isRouteActive]);

  const parsedRiderLocation = useMemo(() => {
    if (!riderLocation) return null;
    const lat = parseFloat(riderLocation.lat || riderLocation.latitude);
    const lng = parseFloat(riderLocation.lng || riderLocation.longitude);
    return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng, heading: parseFloat(riderLocation.heading || 0) } : null;
  }, [riderLocation]);

  // (Old local animation state removed to use AnimatedRiderOverlay)

  useEffect(() => { if (map) map.setZoom(zoom); }, [zoom, map]);

  const shouldUpdateRoute = useMemo(() => {
    const now = Date.now();
    if (!directions) return true;
    let throttleMs = 60000; // Default: Recalculate only every 1 min
    if (parsedRiderLocation && targetLocation && window.google) {
      try {
        const p1 = new window.google.maps.LatLng(parsedRiderLocation.lat, parsedRiderLocation.lng);
        const p2 = new window.google.maps.LatLng(targetLocation.lat, targetLocation.lng);
        const distToTarget = window.google.maps.geometry.spherical.computeDistanceBetween(p1, p2);

        let isOnRoute = true;
        if (directions.routes && directions.routes[0]) {
          const poly = new window.google.maps.Polyline({ path: directions.routes[0].overview_path });
          // Tolerance: ~50m deviation (0.0005 degrees)
          isOnRoute = window.google.maps.geometry.poly.isLocationOnEdge(p1, poly, 0.0005);
        }

        if (!isOnRoute) {
          throttleMs = 5000; // Deviated! Recalculate quickly.
        } else if (distToTarget < 500) {
          throttleMs = 20000; // Nearing target, more frequent updates to be precise
        }
      } catch (e) {
        console.warn('Geometry calculation failed', e);
      }
    }
    return (now - lastDirectionsAt) >= throttleMs;
  }, [lastDirectionsAt, directions, parsedRiderLocation, targetLocation]);

  useEffect(() => {
    if (directions && onPathReceived) {
      const path = directions.routes[0]?.overview_path;
      if (path) {
        const simplePath = path.map(p => ({
          lat: typeof p.lat === 'function' ? p.lat() : (p.lat || p.latitude),
          lng: typeof p.lng === 'function' ? p.lng() : (p.lng || p.longitude)
        }));
        onPathReceived(simplePath);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directions]);

  const directionsCallback = useCallback((result, status) => {
    if (!isRouteActive) return;
    if (status === 'OK' && result) {
      setDirections(result);
      setLastDirectionsAt(Date.now());
      const encodedPolyline = result.routes[0]?.overview_polyline;
      if (encodedPolyline && onPolylineReceived) onPolylineReceived(encodedPolyline);
    }
  }, [onPolylineReceived, isRouteActive]);

  useEffect(() => {
    (async () => {
      try {
        const response = await zoneAPI.getPublicZones();
        if (response?.data?.success && response.data.data?.zones) {
          const formattedZones = response.data.data.zones.map(zone => ({
            ...zone,
            paths: (zone.coordinates || []).map(coord => ({ lat: coord.latitude, lng: coord.longitude }))
          })).filter(z => z.paths.length >= 3);
          setZones(formattedZones);
        }
      } catch (err) {}
    })();
  }, []);

  const restaurantMarkerUrl = useMemo(() => {
    if (!activeOrder) return 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';
    return activeOrder.restaurantImage || activeOrder.restaurant?.logo || activeOrder.restaurant?.profileImage || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';
  }, [activeOrder]);

  const customerMarkerUrl = useMemo(() => {
    if (!activeOrder) return 'https://cdn-icons-png.flaticon.com/512/1275/1275302.png';
    return activeOrder.customerImage || activeOrder.user?.logo || activeOrder.user?.profileImage || 'https://cdn-icons-png.flaticon.com/512/1275/1275302.png';
  }, [activeOrder]);

  const lastCenteredPosRef = useRef(null);
  const lastBoundsUpdateRef = useRef(0);
  const hasInitialBoundsFitted = useRef(false);

  useEffect(() => {
    if (!map || !window.google?.maps) return;

    const hasAnchors = restaurantPoint || customerPoint;
    if (!hasAnchors && !parsedRiderLocation) return;

    if (map.userHasInteracted) return;

    const now = Date.now();
    
    if (!hasInitialBoundsFitted.current) {
      if (map._setProgrammaticChange) map._setProgrammaticChange(true);
      const bounds = new window.google.maps.LatLngBounds();
      if (restaurantPoint) bounds.extend(restaurantPoint);
      if (customerPoint) bounds.extend(customerPoint);
      if (parsedRiderLocation) bounds.extend(parsedRiderLocation);

      map.fitBounds(bounds, { top: 70, right: 70, bottom: 120, left: 70 });
      hasInitialBoundsFitted.current = true;
      lastBoundsUpdateRef.current = now;
      
      setTimeout(() => {
        if (map._setProgrammaticChange) map._setProgrammaticChange(false);
      }, 500);
      return;
    }

    if (now - lastBoundsUpdateRef.current < 12000) return;
    lastBoundsUpdateRef.current = now;

    if (parsedRiderLocation) {
      if (map._setProgrammaticChange) map._setProgrammaticChange(true);
      map.panTo(parsedRiderLocation);
      setTimeout(() => {
        if (map._setProgrammaticChange) map._setProgrammaticChange(false);
      }, 500);
      lastCenteredPosRef.current = parsedRiderLocation;
    }
  }, [map, parsedRiderLocation, restaurantPoint, customerPoint]);

  const remainingPath = useMemo(() => {
    if (!directions || !parsedRiderLocation) return [];
    const fullPath = directions.routes[0].overview_path;
    let closestIndex = 0;
    let minDist = Infinity;
    const rPos = new window.google.maps.LatLng(parsedRiderLocation.lat, parsedRiderLocation.lng);
    for (let i = 0; i < fullPath.length; i++) {
       const d = window.google.maps.geometry.spherical.computeDistanceBetween(rPos, fullPath[i]);
       if (d < minDist) { minDist = d; closestIndex = i; }
    }
    return [{ lat: parsedRiderLocation.lat, lng: parsedRiderLocation.lng }, ...fullPath.slice(closestIndex + 1)];
  }, [directions, parsedRiderLocation]);

  if (loadError) return <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-red-500 font-bold">Map Load Error</div>;
  if (!isLoaded) return <div className="absolute inset-0 flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" /></div>;

  const directionsServiceOptions = (isRouteActive && parsedRiderLocation && targetLocation) ? {
    origin: parsedRiderLocation,
    destination: targetLocation,
    travelMode: 'DRIVING',
  } : null;

  const defaultCenter = (() => {
    try {
      const raw = localStorage.getItem('deliveryBoyLastLocation');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          const lat = Number(parsed[0]);
          const lng = Number(parsed[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
          }
        }
      }
    } catch {
      // Ignore storage read failures and use final fallback below.
    }
    return { lat: 25.3176, lng: 82.9739 }; // Varanasi fallback
  })();

  return (
    <div className="absolute inset-0 z-0 text-gray-900 overflow-hidden flex flex-col">
      <GoogleMap
        onLoad={handleMapLoad}
        mapContainerStyle={mapContainerStyle}
        center={parsedRiderLocation || targetLocation || defaultCenter}
        zoom={zoom}
        onClick={(e) => onMapClick?.(e.latLng.lat(), e.latLng.lng())}
        options={mapOptions}
      >
        {directionsServiceOptions && shouldUpdateRoute && (
          <DirectionsService options={directionsServiceOptions} callback={directionsCallback} />
        )}

        {directionsServiceOptions && remainingPath.length > 0 && (
          <Polyline path={remainingPath} options={{ strokeColor: '#22c55e', strokeOpacity: 0.98, strokeWeight: 7, zIndex: 12 }} />
        )}

        {parsedRiderLocation && (
          <AnimatedRiderOverlay 
            targetLocation={parsedRiderLocation} 
            iconUrl="/tastizo_rider.png" 
          />
        )}

        {(() => {
          const isOrderPickedUp = ['PICKED_UP', 'REACHED_DROP', 'DELIVERED'].includes(tripStatus?.toUpperCase?.());
          return !isOrderPickedUp && restaurantPoint && (
            <Marker
              position={restaurantPoint}
              icon={{
                url: restaurantMarkerUrl,
                scaledSize: new window.google.maps.Size(44, 44),
                anchor: new window.google.maps.Point(22, 22)
              }}
            />
          );
        })()}

        {customerPoint && (
          <Marker
            position={customerPoint}
            icon={{
              url: customerMarkerUrl,
              scaledSize: new window.google.maps.Size(44, 44),
              anchor: new window.google.maps.Point(22, 22)
            }}
          />
        )}

        {zones.map((zone) => (
          <Polygon key={zone._id} paths={zone.paths} options={{ fillColor: "#22c55e", fillOpacity: 0.1, strokeColor: "#22c55e", strokeOpacity: 0.4, strokeWeight: 2, zIndex: 1 }} />
        ))}
      </GoogleMap>
    </div>
  );
};

export default LiveMap;
