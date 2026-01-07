
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getWalkingRoute } from '../utils/mapplsService';
import { speak, vibrate } from '../utils/accessibility';
import { RouteData, HAPTIC_PATTERNS } from '../types';
import { getSettings } from '../utils/settingsManager';

interface NavigationEntryProps {
  onRouteReady: (route: RouteData) => void;
  onCancel: () => void;
  onSettings: () => void;
}

type AgentState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SEARCHING' | 'ERROR';

const NavigationEntry: React.FC<NavigationEntryProps> = ({ onRouteReady, onCancel, onSettings }) => {
  const [agentState, setAgentState] = useState<AgentState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState("Initializing...");
  
  const recognitionRef = useRef<any>(null);
  const isMounted = useRef(true);
  const introSequenceActive = useRef(false);

  // Define startListening as a reusable function
  const startListening = useCallback(() => {
    if (!isMounted.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setAgentState('ERROR');
      setStatusMessage("Voice not supported");
      speak("Voice input is not supported on this device.");
      return;
    }

    try {
      // If already listening, don't restart
      if (recognitionRef.current && agentState === 'LISTENING') return;

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      
      recognition.lang = getSettings().language; 
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      // continuous false ensures we capture one command and process it
      recognition.continuous = false; 

      recognition.onstart = () => {
        if (isMounted.current) {
          setAgentState('LISTENING');
          setStatusMessage("Listening...");
          vibrate(HAPTIC_PATTERNS.TAP);
        }
      };

      recognition.onresult = (event: any) => {
        const result = event.results[0][0].transcript;
        // Keep spaces for better matching (e.g. "safe walk")
        const cleanResult = result.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,""); 
        
        if (isMounted.current) {
          setTranscript(cleanResult);
          handleCommand(cleanResult);
        }
      };

      recognition.onerror = (event: any) => {
        console.log("Recognition error", event.error);
        if (isMounted.current) {
          if (event.error === 'no-speech') {
             setAgentState('IDLE');
             setStatusMessage("Touch to speak");
          } else if (event.error !== 'aborted') {
             setAgentState('IDLE');
             setStatusMessage("Touch to try again");
             // Only speak error if it wasn't a manual abort
             speak("I didn't hear you. Tap to try again.");
          } else {
             setAgentState('IDLE');
          }
        }
      };

      recognition.onend = () => {
        if (isMounted.current && agentState === 'LISTENING') {
           setAgentState('IDLE');
        }
      };

      recognition.start();
    } catch (e) {
      console.error(e);
      setAgentState('ERROR');
    }
  }, [agentState]);

  useEffect(() => {
    isMounted.current = true;
    
    // Only run intro if we haven't already started it this session
    if (!introSequenceActive.current) {
      introSequenceActive.current = true;
      
      const timer = setTimeout(() => {
        if (!isMounted.current) return;
        
        setStatusMessage("Welcome");
        // We pass a callback to speak that runs when TTS finishes
        speak(
          "BlindNav Ready. Please state your destination, or say Safe Walk, Settings, or Help.", 
          true, 
          () => {
            // Check if still mounted and if sequence wasn't cancelled by user tap
            if (isMounted.current && introSequenceActive.current) {
              // Add small delay so mic doesn't pick up end of robot voice
              setTimeout(() => {
                 if (isMounted.current && introSequenceActive.current) {
                   startListening();
                 }
              }, 300);
            }
          }
        );
      }, 500);
      
      return () => clearTimeout(timer);
    }

    return () => {
      isMounted.current = false;
      introSequenceActive.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, [startListening]);

  const handleScreenTap = () => {
    // Cancel any auto sequence
    introSequenceActive.current = false;

    // If currently processing, ignore tap
    if (agentState === 'PROCESSING' || agentState === 'SEARCHING') return;

    // If currently listening, stop (toggle off)
    if (agentState === 'LISTENING') {
      recognitionRef.current?.stop();
      return;
    }

    // Manual start
    // Cancel existing speech immediately
    window.speechSynthesis.cancel();
    speak("Listening", true); 
    
    // Slight delay to ensure "Listening" audio clears before mic opens
    setTimeout(() => {
      if (isMounted.current) startListening();
    }, 800);
  };

  const triggerEmergencyPing = () => {
    const settings = getSettings();
    if (!settings.emergencyContact) {
      speak("No emergency contact set. Go to settings to add one.");
      return;
    }

    speak("Sending emergency ping.");
    vibrate(HAPTIC_PATTERNS.DANGER_ALARM);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
        const message = `I NEED HELP! My location: ${mapLink}`;
        
        window.open(`sms:${settings.emergencyContact}?body=${encodeURIComponent(message)}`, '_blank');
      }, (err) => {
        speak("Could not get location. Opening messaging app.");
        window.open(`sms:${settings.emergencyContact}?body=I NEED HELP!`, '_blank');
      });
    } else {
       window.open(`sms:${settings.emergencyContact}?body=I NEED HELP!`, '_blank');
    }
  };

  const handleCommand = async (command: string) => {
    const term = command.toLowerCase().trim();
    console.log("Heard command:", term);
    
    if (term.includes('help') || term.includes('emergency') || term.includes('panic')) {
      triggerEmergencyPing();
      return;
    }

    if (term.includes('setting') || term.includes('configure')) {
      onSettings();
      return;
    }

    if (['safe walk', 'just walk', 'free walk', 'cancel'].some(k => term.includes(k))) {
      speak("Starting Safe Walk mode.");
      onCancel(); 
      return;
    }

    setAgentState('SEARCHING');
    setStatusMessage(`Looking for "${term}"...`);
    speak(`Looking for ${term}.`);
    vibrate(HAPTIC_PATTERNS.TAP);

    try {
      const route = await getWalkingRoute(term);
      speak(`Found route to ${route.summary}. Starting guidance.`);
      vibrate(HAPTIC_PATTERNS.DOUBLE_TAP);
      onRouteReady(route);
    } catch (err: any) {
      console.error(err);
      setAgentState('IDLE');
      speak("I couldn't find that location. Please try again.");
      vibrate(HAPTIC_PATTERNS.LONG_BUZZ);
    }
  };

  const getVisuals = () => {
    switch (agentState) {
      case 'LISTENING':
        return { color: 'text-red-500', animation: 'animate-pulse' };
      case 'SEARCHING':
        return { color: 'text-blue-500', animation: 'animate-spin' };
      case 'ERROR':
        return { color: 'text-gray-500', animation: '' };
      default:
        return { color: 'text-yellow-400', animation: 'animate-bounce' };
    }
  };

  const visuals = getVisuals();

  return (
    <div 
      className="h-screen w-screen bg-black flex flex-col items-center justify-between cursor-pointer touch-manipulation overflow-hidden"
      onClick={handleScreenTap}
    >
      <div className="w-full pt-12 text-center pointer-events-none select-none">
        <h1 className="text-4xl font-bold text-white mb-4">Navigation Agent</h1>
        <p className="text-gray-400 text-xl">Tap anywhere to speak</p>
      </div>

      <div className={`flex-1 flex flex-col items-center justify-center w-full pointer-events-none select-none transition-colors duration-300 ${visuals.color}`}>
        <div className={`${visuals.animation} drop-shadow-[0_0_35px_rgba(255,255,255,0.2)]`}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-48 h-48">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </div>

        <div className="mt-16 text-center h-32 px-6">
          <p className="text-3xl font-bold text-white mb-4 transition-all leading-relaxed">
            {statusMessage}
          </p>
          {transcript && agentState !== 'SEARCHING' && (
            <p className="text-2xl text-gray-300 italic">"{transcript}"</p>
          )}
        </div>
      </div>

      <div className="w-full pb-8 pt-4 text-center pointer-events-none opacity-50">
        <p className="text-gray-500 text-sm">Say "Settings" to configure • Say "Help" for Emergency</p>
      </div>
    </div>
  );
};

export default NavigationEntry;
