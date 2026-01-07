
import React, { useState, useEffect, useRef } from 'react';
import { speak, vibrate } from '../utils/accessibility';
import { HAPTIC_PATTERNS } from '../types';
import { getSettings, saveSettings } from '../utils/settingsManager';

interface SettingsProps {
  onBack: () => void;
}

type SettingsState = 'IDLE' | 'LISTENING' | 'LANGUAGE_INPUT' | 'CONTACT_INPUT';

const SUPPORTED_LANGUAGES: {[key: string]: string} = {
  'english': 'en-US',
  'spanish': 'es-ES',
  'hindi': 'hi-IN',
  'french': 'fr-FR',
  'japanese': 'ja-JP'
};

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [state, setState] = useState<SettingsState>('IDLE');
  const [status, setStatus] = useState("Settings");
  const recognitionRef = useRef<any>(null);
  const currentLangRef = useRef(getSettings().language);

  const startListening = (continuous = false) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      if (recognitionRef.current) recognitionRef.current.stop();
      
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = currentLangRef.current; // Listen in current language
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setState(prev => {
          // Preserve sub-states like LANGUAGE_INPUT
          if (prev === 'IDLE') return 'LISTENING';
          return prev;
        });
        vibrate(HAPTIC_PATTERNS.TAP);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        handleCommand(transcript);
      };

      recognition.onerror = (e: any) => {
        console.log("Settings recognition error", e.error);
        if (e.error === 'no-speech') {
           // silently fail or restart if we want continuous, but here we expect tap-to-talk mostly or directed flow
        }
        setState(prev => prev === 'LISTENING' ? 'IDLE' : prev);
      };

      recognition.onend = () => {
        if (state === 'LISTENING') setState('IDLE');
      };

      recognition.start();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    speak("Settings Menu. Tap to speak. Say Language to change language. Say Contact to add emergency contact. Say Back to exit.");
  }, []);

  const handleCommand = (cmd: string) => {
    console.log("Command:", cmd, "State:", state);

    if (state === 'LANGUAGE_INPUT') {
      // Check if cmd matches a language
      const langCode = SUPPORTED_LANGUAGES[cmd] || Object.values(SUPPORTED_LANGUAGES).find(v => v === cmd);
      
      if (langCode) {
        saveSettings({ language: langCode as string });
        currentLangRef.current = langCode as string;
        speak(`Language changed to ${cmd}.`);
        setStatus(`Language: ${cmd}`);
        setState('IDLE');
      } else {
        speak("I didn't catch that. Please say English, Spanish, Hindi, or French.");
      }
      return;
    }

    if (state === 'CONTACT_INPUT') {
      // Extract digits
      const digits = cmd.replace(/\D/g, '');
      if (digits.length > 3) {
        saveSettings({ emergencyContact: digits });
        speak(`Emergency contact saved. Number ending in ${digits.slice(-4)}.`);
        setStatus("Contact Saved");
        setState('IDLE');
      } else {
        speak("I didn't hear a valid number. Please say the digits clearly.");
      }
      return;
    }

    // Main Menu Commands
    if (cmd.includes('language')) {
      setState('LANGUAGE_INPUT');
      setStatus("Which Language?");
      speak("Which language? I support English, Spanish, Hindi, and French.");
      setTimeout(startListening, 2000); // Auto restart listening for input
    } else if (cmd.includes('contact')) {
      setState('CONTACT_INPUT');
      setStatus("Say Phone Number");
      speak("Please say the phone number for your emergency contact.");
      setTimeout(startListening, 2000);
    } else if (cmd.includes('back') || cmd.includes('exit')) {
      onBack();
    } else {
      speak("Sorry, say Language, Contact, or Back.");
    }
  };

  const handleTap = () => {
    if (state === 'IDLE') {
      startListening();
    }
  };

  return (
    <div 
      className="h-screen w-screen bg-neutral-900 flex flex-col items-center justify-center p-6 cursor-pointer"
      onClick={handleTap}
    >
      <h1 className="text-4xl font-bold text-yellow-400 mb-8">Settings</h1>
      
      <div className="w-full max-w-sm bg-gray-800 p-6 rounded-2xl mb-8">
        <p className="text-2xl text-white text-center font-medium mb-2">{status}</p>
        {state === 'LISTENING' && <p className="text-red-400 text-center animate-pulse">Listening...</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
          <p className="text-gray-400 text-sm uppercase">Current Language</p>
          <p className="text-xl text-white">{Object.keys(SUPPORTED_LANGUAGES).find(k => SUPPORTED_LANGUAGES[k] === getSettings().language) || getSettings().language}</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
          <p className="text-gray-400 text-sm uppercase">Emergency Contact</p>
          <p className="text-xl text-white">{getSettings().emergencyContact || "Not Set"}</p>
        </div>
      </div>
      
      <p className="mt-12 text-gray-500">Tap to speak</p>
    </div>
  );
};

export default Settings;
