
import { UserSettings } from "../types";

const KEY = 'blindnav_settings';

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
