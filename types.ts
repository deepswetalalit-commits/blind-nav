
export enum NavigationMode {
  IDLE = 'IDLE',
  SAFE_WALK = 'SAFE_WALK',
  NAVIGATION_ENTRY = 'NAVIGATION_ENTRY',
  NAVIGATING = 'NAVIGATING',
  SETTINGS = 'SETTINGS'
}

export interface HazardAnalysis {
  detected_hazard: string;
  urgency: 'safe' | 'caution' | 'danger';
  position: 'left' | 'center' | 'right' | 'none';
  instruction: string;
}

export interface NavigationStep {
  instruction: string; // HTML string from Google Maps
  distance: string;
  maneuver?: string; // e.g., 'turn-left'
}

export interface RouteData {
  summary: string;
  duration: string;
  distance: string;
  steps: NavigationStep[];
}

export interface UserSettings {
  language: string; // BCP 47 tag e.g., 'en-US'
  emergencyContact: string;
}

export type HapticPattern = number | number[];

export const HAPTIC_PATTERNS = {
  TAP: 50,
  DOUBLE_TAP: [50, 50, 50],
  LONG_BUZZ: 400,
  DANGER_ALARM: [100, 50, 100, 50, 100, 50, 500]
};
