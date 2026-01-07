
import { HapticPattern } from "../types";
import { getSettings } from "./settingsManager";

// Cache the voice to ensure consistency
let cachedVoice: SpeechSynthesisVoice | null = null;
let cachedLang: string | null = null;

const findBestVoice = (voices: SpeechSynthesisVoice[], langCode: string) => {
  // Filter by language first
  const langVoices = voices.filter(v => v.lang.startsWith(langCode.split('-')[0]));
  
  if (langVoices.length === 0) return voices[0];

  // Priority list for smoother/better voices
  // 1. Specific high-quality Google voices (Android/Chrome)
  // 2. Samantha (iOS/macOS high quality)
  // 3. Microsoft Zira (Windows)
  // 4. Any female voice
  return langVoices.find(v => v.name.includes('Google US English')) ||
         langVoices.find(v => v.name.includes('Samantha')) ||
         langVoices.find(v => v.name.includes('Google') && v.name.includes('Female')) ||
         langVoices.find(v => v.name.includes('Zira')) ||
         langVoices.find(v => v.name.includes('Female')) ||
         langVoices.find(v => v.name.includes('Google')) ||
         langVoices[0];
};

// Text to Speech
export const speak = (text: string, interrupt: boolean = false, onEnd?: () => void) => {
  if (!window.speechSynthesis) return;

  if (interrupt) {
    window.speechSynthesis.cancel();
  }

  const settings = getSettings();
  const targetLang = settings.language || 'en-US';

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Voice Quality Settings
  utterance.rate = 0.9;  // Slightly slower for better clarity
  utterance.pitch = 0.9; // Slightly lower pitch to reduce shrillness
  utterance.volume = 1.0;
  utterance.lang = targetLang;
  
  if (onEnd) {
    utterance.onend = onEnd;
  }
  
  const voices = window.speechSynthesis.getVoices();
  
  // Invalidate cache if language changed
  if (cachedLang !== targetLang) {
    cachedVoice = null;
    cachedLang = targetLang;
  }
  
  if (!cachedVoice && voices.length > 0) {
    cachedVoice = findBestVoice(voices, targetLang);
  }

  if (cachedVoice) {
    utterance.voice = cachedVoice;
  }

  window.speechSynthesis.speak(utterance);
};

// Initialize voices
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    const voices = window.speechSynthesis.getVoices();
    const settings = getSettings();
    cachedVoice = findBestVoice(voices, settings.language);
  };
}

// Haptics
export const vibrate = (pattern: HapticPattern) => {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};
