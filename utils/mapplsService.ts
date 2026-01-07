
import { NavigationStep, RouteData } from "../types";

// Mappls REST API Base URL
const BASE_URL = "https://apis.mappls.com/advancedmaps/v1";

export const getWalkingRoute = async (destinationQuery: string): Promise<RouteData> => {
  // Access key lazily to prevent crash on module load if undefined
  const MAPPLS_API_KEY = process.env.MAPPLS_API_KEY || process.env.API_KEY; 

  if (!MAPPLS_API_KEY) {
    throw new Error("Mappls API Key is missing. Set MAPPLS_API_KEY or API_KEY.");
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
  // https://apis.mappls.com/advancedmaps/v1/<key>/geo_code?addr=<address>
  const geoUrl = `${BASE_URL}/${MAPPLS_API_KEY}/geo_code?addr=${encodeURIComponent(destinationQuery)}`;
  
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) {
    throw new Error("Failed to connect to Mappls Geocoding service");
  }
  
  const geoData = await geoRes.json();
  
  // Mappls response handling for 'copResults'
  // Sometimes it returns an array 'results', or object 'copResults' depending on API version/license.
  // Standard v1 REST API usually returns copResults as an object for the best match.
  
  let location: { latitude: number, longitude: number, formattedAddress?: string, poi?: string } | null = null;

  if (geoData.copResults && typeof geoData.copResults.latitude !== 'undefined') {
    location = geoData.copResults;
  } else if (Array.isArray(geoData.results) && geoData.results.length > 0) {
    location = geoData.results[0];
  }

  if (!location) {
    throw new Error(`Could not find location: "${destinationQuery}"`);
  }

  const endLat = location.latitude;
  const endLng = location.longitude;
  const destinationName = location.formattedAddress || location.poi || destinationQuery;

  // 3. Get Route (Walking)
  // https://apis.mappls.com/advancedmaps/v1/<key>/route_adv/walking/<start_lon>,<start_lat>;<end_lon>,<end_lat>
  const routeUrl = `${BASE_URL}/${MAPPLS_API_KEY}/route_adv/walking/${startLng},${startLat};${endLng},${endLat}?steps=true&alternatives=false`;
  
  const routeRes = await fetch(routeUrl);
  if (!routeRes.ok) {
    throw new Error("Failed to fetch route from Mappls");
  }
  
  const routeData = await routeRes.json();

  if (!routeData.routes || routeData.routes.length === 0) {
    throw new Error("No route found");
  }

  const route = routeData.routes[0];
  const leg = route.legs[0];

  // Map Mappls steps to NavigationStep
  const steps: NavigationStep[] = leg.steps.map((step: any) => {
    // Instruction text fallback
    let instruction = step.maneuver?.instruction || step.instruction || "Continue";
    
    // Clean HTML tags if present
    instruction = instruction.replace(/<[^>]*>?/gm, '');

    return {
      instruction: instruction,
      distance: `${Math.round(step.distance)}m`,
      maneuver: step.maneuver?.type
    };
  });

  // Calculate duration/distance strings
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
