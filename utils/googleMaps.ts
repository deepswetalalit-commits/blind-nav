import { NavigationStep, RouteData } from "../types";

declare var google: any;

let isLoaded = false;

export const loadGoogleMaps = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (isLoaded) {
      resolve();
      return;
    }

    if ((window as any).google && (window as any).google.maps) {
      isLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    // NOTE: This assumes the API_KEY supports Google Maps JavaScript API.
    // If using an AI Studio key, this might fail or require a specific Maps key.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      isLoaded = true;
      resolve();
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

export const getWalkingRoute = async (destination: string): Promise<RouteData> => {
  await loadGoogleMaps();

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
      const origin = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
      const directionsService = new google.maps.DirectionsService();

      directionsService.route(
        {
          origin: origin,
          destination: destination,
          travelMode: google.maps.TravelMode.WALKING,
        },
        (result: any, status: any) => {
          if (status === google.maps.DirectionsStatus.OK && result && result.routes[0] && result.routes[0].legs[0]) {
            const leg = result.routes[0].legs[0];
            
            // Clean up HTML instructions to be safer/cleaner text
            const steps: NavigationStep[] = leg.steps.map((step: any) => ({
              instruction: step.instructions.replace(/<[^>]*>?/gm, ''), // Strip HTML tags for speech
              distance: step.distance?.text || '',
              maneuver: step.maneuver
            }));

            resolve({
              summary: result.routes[0].summary,
              distance: leg.distance?.text || '',
              duration: leg.duration?.text || '',
              steps: steps
            });
          } else {
            reject(new Error(`Directions request failed: ${status}`));
          }
        }
      );
    }, (error) => {
      reject(new Error("Could not get current location"));
    });
  });
};