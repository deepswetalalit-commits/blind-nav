
import React, { useState, useEffect, useRef } from 'react';
import LiveNavigation from './pages/LiveNavigation';
import Settings from './pages/Settings';
import { NavigationMode, HAPTIC_PATTERNS } from './types';
import { speak, vibrate } from './utils/accessibility';
import { getSettings } from './utils/settingsManager';

function App() {
  const [mode, setMode] = useState<NavigationMode>(NavigationMode.IDLE);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Intro & Setup
  useEffect(() => {
    if (mode === NavigationMode.IDLE) {
      const intro = "Welcome to Blind Nav. Tap screen and say Safe Walk, Emergency, or Settings.";
      speak(intro);
    }
  }, [mode]);

  const triggerEmergency = () => {
    const settings = getSettings();
    if (settings.emergencyContact) {
      speak("Calling Emergency Contact.", true);
      vibrate(HAPTIC_PATTERNS.DANGER_ALARM);
      window.open(`tel:${settings.emergencyContact}`, '_self');
    } else {
      speak("No emergency contact set. Please go to settings.");
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speak("Voice control not supported. Please tap buttons.");
      return;
    }

    if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
        return;
    }

    vibrate(HAPTIC_PATTERNS.TAP);
    speak("Listening...", true);
    setIsListening(true);

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const command = event.results[0][0].transcript.toLowerCase();
      console.log("Heard:", command);

      if (command.includes('safe') || command.includes('walk') || command.includes('start')) {
        speak("Starting Safe Walk.");
        setMode(NavigationMode.SAFE_WALK);
      } else if (command.includes('setting') || command.includes('config')) {
        speak("Opening Settings.");
        setMode(NavigationMode.SETTINGS);
      } else if (command.includes('emergency') || command.includes('help')) {
        triggerEmergency();
      } else {
        speak("Command not recognized. Say Safe Walk, Settings, or Emergency.");
      }
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
      speak("I didn't catch that.");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleOpenSettings = () => {
    setMode(NavigationMode.SETTINGS);
  };

  const handleExit = () => {
    setMode(NavigationMode.IDLE);
  };

  if (mode === NavigationMode.IDLE) {
    return (
      <div 
        onClick={startListening}
        className={`h-screen w-screen bg-black flex flex-col items-center justify-center p-8 cursor-pointer touch-manipulation transition-colors ${isListening ? 'bg-gray-900' : ''}`}
      >
        <h1 className="text-6xl font-black text-yellow-400 mb-8 text-center tracking-tighter">BlindNav</h1>
        
        <div className={`flex flex-col items-center space-y-6 ${isListening ? 'scale-110 transition-transform' : ''}`}>
          <div className={`w-24 h-24 rounded-full border-4 ${isListening ? 'border-red-500 animate-pulse bg-red-900/20' : 'border-yellow-400'} flex items-center justify-center`}>
             <div className={`w-4 h-4 rounded-full ${isListening ? 'bg-red-500' : 'bg-yellow-400'}`} />
          </div>
          
          <div className="text-center space-y-2">
             <p className="text-2xl text-white font-bold">{isListening ? "Listening..." : "Tap & Say"}</p>
             <div className="flex flex-col gap-2 text-gray-400 font-mono text-sm uppercase tracking-widest mt-4">
                <span>"Safe Walk"</span>
                <span>"Emergency"</span>
                <span>"Settings"</span>
             </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === NavigationMode.SETTINGS) {
    return <Settings onBack={handleExit} />;
  }

  if (mode === NavigationMode.SAFE_WALK) {
    return <LiveNavigation onExit={handleExit} />;
  }

  return null;
}

export default App;
