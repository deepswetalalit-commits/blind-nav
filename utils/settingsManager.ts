
import { UserSettings, RouteData } from "../types";

const KEY = 'blindnav_settings';
const ROUTE_KEY = 'blindnav_cached_route';

const DEFAULT_SETTINGS: UserSettings = {
  language: 'en-US',
  emergencyContact: ''
};

export const getSettings = (): UserSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const s = localStorage.getItem(KEY);
  return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
};

export const saveSettings = (settings: Partial<UserSettings>) => {
  const current = getSettings();
  const next = { ...current, ...settings };
  localStorage.setItem(KEY, JSON.stringify(next));
  
  // Dispatch event so components can react if needed
  window.dispatchEvent(new Event('settings-changed'));
  
  return next;
};

// Offline Support: Route Caching
export const saveCachedRoute = (route: RouteData) => {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify(route));
  } catch (e) {
    console.warn("Failed to cache route", e);
  }
};

export const getCachedRoute = (): RouteData | null => {
  try {
    const s = localStorage.getItem(ROUTE_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
};
