import { useEffect, useRef } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { RouteData } from '../types';

export default function RouteDisplay({
  route,
  onRouteComputed
}: {
  route: RouteData | undefined;
  onRouteComputed?: (info: { distance: string; duration: string }) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !route || !route.origin || !route.destination) {
      // Clear previous routes if route data is removed
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
      return;
    }

    // Clear previous route
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const origin = typeof route.origin === 'string' 
      ? route.origin 
      : new google.maps.LatLng(route.origin.lat, route.origin.lng);

    const destination = typeof route.destination === 'string'
      ? route.destination
      : new google.maps.LatLng(route.destination.lat, route.destination.lng);

    routesLib.Route.computeRoutes({
      origin,
      destination,
      travelMode: route.travelMode || 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    })
    .then(({ routes }) => {
      if (routes?.[0]) {
        const primaryRoute = routes[0];
        
        // Render polylines
        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach(polyline => {
          polyline.setOptions({
            strokeColor: '#3b82f6', // Premium blue polyline
            strokeOpacity: 0.8,
            strokeWeight: 6,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        // Auto-fit bounds
        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        // Send statistics back to chat ui
        if (onRouteComputed) {
          const meters = primaryRoute.distanceMeters || 0;
          const miles = (meters * 0.000621371).toFixed(1);
          const kilometers = (meters / 1000).toFixed(1);
          
          const millis = primaryRoute.durationMillis 
            ? parseInt(primaryRoute.durationMillis as unknown as string, 10) 
            : 0;
          const mins = Math.ceil(millis / 60000);
          const durationStr = mins >= 60 
            ? `${Math.floor(mins / 60)}h ${mins % 60}m` 
            : `${mins} mins`;

          onRouteComputed({
            distance: `${kilometers} km (${miles} miles)`,
            duration: durationStr,
          });
        }
      }
    })
    .catch(err => {
      console.error("Error computing route via google.maps.routes:", err);
    });

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
    };
  }, [routesLib, map, route, onRouteComputed]);

  return null;
}
