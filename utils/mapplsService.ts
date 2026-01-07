
import { NavigationStep, RouteData } from "../types";

// Mappls REST API Base URL
const BASE_URL = "https://apis.mappls.com/advancedmaps/v1";

// Helper to robustly find the API Key across different build environments
const getMapplsKey = (): string | undefined => {
  let key: string | undefined = undefined;

  // 1. Try explicit process.env replacements (Webpack, CRA, Next.js)
  // We use try-catch to prevent ReferenceError if 'process' is not defined in browser
  try {
    if (process.env.MAPPLS_API_KEY) key = process.env.MAPPLS_API_KEY;
    else if (process.env.VITE_MAPPLS_API_KEY) key = process.env.VITE_MAPPLS_API_KEY;
    else if (process.env.REACT_APP_MAPPLS_API_KEY) key = process.env.REACT_APP_MAPPLS_API_KEY;
  } catch (e) {}

  if (key) return key;

  // 2. Try import.meta.env (Vite Native)
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv) {
      key = metaEnv.MAPPLS_API_KEY || metaEnv.VITE_MAPPLS_API_KEY || metaEnv.REACT_APP_MAPPLS_API_KEY;
    }
  } catch (e) {}

  if (key) return key;

  // 3. Fallback to generic API_KEY if specific Mappls key is missing
  try {
    if (process.env.API_KEY) key = process.env.API_KEY;
    else if (process.env.VITE_API_KEY) key = process.env.VITE_API_KEY;
  } catch (e) {}
  
  return key;
};

export const getWalkingRoute = async (destinationQuery: string): Promise<RouteData> => {
  const MAPPLS_API_KEY = getMapplsKey();

  if (!MAPPLS_API_KEY) {
    throw new Error("Mappls API Key is missing. Please set MAPPLS_API_KEY or VITE_MAPPLS_API_KEY in your environment variables.");
  }

  if (!navigator.geolocation) {
    throw new Error("Geolocation not supported");
  }

  // 1. Get Current Location
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  });
  const startLat = position.coords.latitude;
  const startLng = position.coords.longitude;

  // 2. Geocode Destination (Address -> Lat/Lng)
  const geoUrl = `${BASE_URL}/${MAPPLS_API_KEY}/geo_code?addr=${encodeURIComponent(destinationQuery)}`;
  
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) {
    const errorText = await geoRes.text();
    console.error("Mappls Geocode Error:", geoRes.status, errorText);
    throw new Error(`Mappls Service Error: ${geoRes.status}`);
  }
  
  const geoData = await geoRes.json();
  
  let location: { latitude: number, longitude: number, formattedAddress?: string, poi?: string } | null = null;

  if (geoData.copResults && typeof geoData.copResults.latitude !== 'undefined') {
    location = geoData.copResults;
  } else if (Array.isArray(geoData.results) && geoData.results.length > 0) {
    location = geoData.results[0];
  }

  if (!location) {
    // Attempt fallback to Atlas Search if available (different endpoint, but sometimes mixed)
    throw new Error(`Could not find location: "${destinationQuery}"`);
  }

  const endLat = location.latitude;
  const endLng = location.longitude;
  const destinationName = location.formattedAddress || location.poi || destinationQuery;

  // 3. Get Route (Walking)
  const routeUrl = `${BASE_URL}/${MAPPLS_API_KEY}/route_adv/walking/${startLng},${startLat};${endLng},${endLat}?steps=true&alternatives=false`;
  
  const routeRes = await fetch(routeUrl);
  if (!routeRes.ok) {
     const errorText = await routeRes.text();
     console.error("Mappls Route Error:", routeRes.status, errorText);
     throw new Error("Failed to fetch route from Mappls");
  }
  
  const routeData = await routeRes.json();

  if (!routeData.routes || routeData.routes.length === 0) {
    throw new Error("No route found");
  }

  const route = routeData.routes[0];
  const leg = route.legs[0];

  const steps: NavigationStep[] = leg.steps.map((step: any) => {
    let instruction = step.maneuver?.instruction || step.instruction || "Continue";
    instruction = instruction.replace(/<[^>]*>?/gm, '');

    return {
      instruction: instruction,
      distance: `${Math.round(step.distance)}m`,
      maneuver: step.maneuver?.type
    };
  });

  const durationMin = Math.round(route.duration / 60);
  const durationStr = durationMin > 60 
    ? `${Math.floor(durationMin/60)} hr ${durationMin%60} min` 
    : `${durationMin} min`;
    
  const distanceKm = (route.distance / 1000).toFixed(2);
  const distanceStr = `${distanceKm} km`;

  return {
    summary: destinationName,
    duration: durationStr,
    distance: distanceStr,
    steps: steps
  };
};
