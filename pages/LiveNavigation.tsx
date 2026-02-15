
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { analyzeSafety, queryVisualScene } from '../services/geminiService';
import { speak, vibrate } from '../utils/accessibility';
import { HazardAnalysis, HAPTIC_PATTERNS } from '../types';
import { getSettings } from '../utils/settingsManager';

interface LiveNavigationProps {
  onExit: () => void;
}

const LiveNavigation: React.FC<LiveNavigationProps> = ({ onExit }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<HazardAnalysis | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Voice Interaction States
  const [isListening, setIsListening] = useState(false);
  const [isAnsweringQuery, setIsAnsweringQuery] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const processingTimeoutRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // Debouncing & Gyroscope refs
  const lastSpokenRef = useRef<{ hazard: string, urgency: string, time: number, orientation: {alpha: number, beta: number, gamma: number} | null }>({ hazard: '', urgency: 'safe', time: 0, orientation: null });
  const currentOrientationRef = useRef<{alpha: number, beta: number, gamma: number} | null>(null);
  
  // Error handling refs
  const failureCountRef = useRef(0);
  const backoffMultiplierRef = useRef(1); 
  const MAX_FAILURES_BEFORE_ALERT = 3;

  // Connectivity Listeners
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      speak("Connection lost. Pausing.", true);
      vibrate(HAPTIC_PATTERNS.DANGER_ALARM);
    };

    const handleOnline = () => {
      setIsOffline(false);
      speak("Online.", true);
      vibrate(HAPTIC_PATTERNS.TAP);
      backoffMultiplierRef.current = 1; 
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Gyroscope / Orientation Listener
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      currentOrientationRef.current = {
        alpha: event.alpha || 0,
        beta: event.beta || 0,
        gamma: event.gamma || 0
      };
    };

    const requestAccess = async () => {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const permission = await (DeviceOrientationEvent as any).requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        } catch (e) {
          console.warn("Gyroscope permission denied or error", e);
        }
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    };

    requestAccess();

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const triggerEmergency = () => {
    const settings = getSettings();
    if (settings.emergencyContact) {
      speak("Calling Emergency Contact.", true);
      vibrate(HAPTIC_PATTERNS.DANGER_ALARM);
      window.open(`tel:${settings.emergencyContact}`, '_self');
    } else {
      speak("No emergency contact set.");
    }
  };

  // Manual Voice Command Logic (Touch to Speak)
  const startListening = useCallback(() => {
    if (isListening || isAnsweringQuery) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speak("Voice not supported.");
      return;
    }

    // Stop current speech
    window.speechSynthesis.cancel();
    vibrate(HAPTIC_PATTERNS.TAP);

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = getSettings().language || 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false; // Single shot

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        console.log("Live Command:", transcript);

        if (transcript.includes("emergency") || transcript.includes("help")) {
            triggerEmergency();
        } else if (transcript.includes("settings") || transcript.includes("exit") || transcript.includes("stop")) {
            speak("Exiting Safe Walk.");
            onExit();
        } else if (transcript.includes("safe") || transcript.includes("walk")) {
            speak("Safe Walk is active.");
        } else {
            // Fallback: Treat as a brief visual query ONLY if it's not a navigation command
            // But user requested "Command only...", so we'll be strict or provide minimal feedback
            handleVisualQuery(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Mic error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error("Mic start failed", e);
      setIsListening(false);
    }
  }, [isListening, isAnsweringQuery, onExit]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const handleScreenTap = () => {
    if (isListening) {
      stopListening();
    } else {
      speak("Listening", true); // Auditory cue
      startListening();
    }
  };

  const handleVisualQuery = async (query: string) => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsAnsweringQuery(true);
    speak("Scanning...", true);
    
    try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const MAX_WIDTH = 400; 
        const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
            const answer = await queryVisualScene(base64Image, query);
            speak(answer, true); 
        }
    } catch (e) {
        speak("I couldn't help with that.");
    } finally {
        setTimeout(() => {
            setIsAnsweringQuery(false);
        }, 3000); 
    }
  };

  // Initial Startup
  useEffect(() => {
    const intro = "Safe Walk Active.";
    speak(intro, true);
    
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: "environment" } }, 
          audio: false
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) videoRef.current.srcObject = fallbackStream;
        } catch (fatalErr) {
          setError("Camera access denied.");
          speak("Camera error. Cannot navigate.");
        }
      }
    };

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  // Analysis Loop
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    // Pause safety loop while user is interacting with voice or getting an answer
    if (isListening || isAnsweringQuery) {
        processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 1000);
        return;
    }

    if (isOffline || !navigator.onLine) {
      if (!isOffline) setIsOffline(true);
      processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 5000);
      return;
    }

    setIsProcessing(true);
    
    let nextDelay = 2000 * backoffMultiplierRef.current; 

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      const MAX_WIDTH = 250; 
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
        
        const result = await analyzeSafety(base64Image);
        
        if (result.detected_hazard === "Connection Error") {
           throw new Error("Service connection error");
        }

        if (backoffMultiplierRef.current > 1) {
            backoffMultiplierRef.current = Math.max(1, backoffMultiplierRef.current - 0.5);
        }
        failureCountRef.current = 0;
        
        setAnalysis(result);
        handleFeedback(result);
      }
    } catch (err) {
      console.error("Analysis error", err);
      failureCountRef.current += 1;
      backoffMultiplierRef.current = Math.min(5, backoffMultiplierRef.current + 1);
      
      if (failureCountRef.current > MAX_FAILURES_BEFORE_ALERT) {
         setAnalysis({
            detected_hazard: "Connection Unstable",
            urgency: "caution",
            position: "center",
            instruction: "Pausing..."
         });
      }
    } finally {
      setIsProcessing(false);
      processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, nextDelay);
    }
  }, [isProcessing, isOffline, isListening, isAnsweringQuery]);

  useEffect(() => {
    const handleVideoPlay = () => { captureAndAnalyze(); };
    const videoEl = videoRef.current;
    if (videoEl) videoEl.addEventListener('play', handleVideoPlay);
    return () => { if (videoEl) videoEl.removeEventListener('play', handleVideoPlay); };
  }, [captureAndAnalyze]);

  const handleFeedback = (result: HazardAnalysis) => {
    if (isListening || isAnsweringQuery) return;

    const now = Date.now();
    const last = lastSpokenRef.current;
    const currentOrientation = currentOrientationRef.current;

    // Gyroscope Delta
    let rotationDelta = 0;
    if (last.orientation && currentOrientation) {
        rotationDelta = Math.abs(currentOrientation.alpha - last.orientation.alpha) + 
                        Math.abs(currentOrientation.beta - last.orientation.beta) +
                        Math.abs(currentOrientation.gamma - last.orientation.gamma);
    }
    const hasMovedSignificantly = rotationDelta > 15;

    const isSameHazard = result.detected_hazard.toLowerCase() === last.hazard.toLowerCase();
    const isSameUrgency = result.urgency === last.urgency;
    const isProximityDanger = result.instruction.includes("Too close");

    let shouldSpeak = false;

    if (isProximityDanger) {
        shouldSpeak = true;
    } else if (!isSameHazard || !isSameUrgency) {
        shouldSpeak = true;
        if (result.urgency === 'safe' && last.urgency === 'safe') shouldSpeak = false;
    } else {
        if (result.urgency === 'danger') {
            if ((now - last.time > 3000) || hasMovedSignificantly) shouldSpeak = true;
        } else if (result.urgency === 'caution') {
            if (hasMovedSignificantly || (now - last.time > 10000)) shouldSpeak = true;
        }
    }

    if (shouldSpeak) {
      if (result.urgency === 'danger') {
        vibrate(HAPTIC_PATTERNS.DANGER_ALARM);
        speak(`${result.detected_hazard}. ${result.instruction}`, true);
        lastSpokenRef.current = { hazard: result.detected_hazard, urgency: result.urgency, time: now, orientation: currentOrientation };
      } else if (result.urgency === 'caution') {
        vibrate(HAPTIC_PATTERNS.LONG_BUZZ);
        let directionText = "";
        if (result.position === 'left') directionText = "left";
        if (result.position === 'right') directionText = "right";
        if (result.position === 'center') directionText = "ahead";
        speak(`${result.detected_hazard} ${directionText}.`, true);
        lastSpokenRef.current = { hazard: result.detected_hazard, urgency: result.urgency, time: now, orientation: currentOrientation };
      } else if (result.urgency === 'safe' && last.urgency !== 'safe') {
        speak("Path clear.", true);
        lastSpokenRef.current = { hazard: result.detected_hazard, urgency: result.urgency, time: now, orientation: currentOrientation };
      }
    }
  };

  const getStatusColor = () => {
    if (isOffline) return 'bg-gray-900/90';
    if (isListening) return 'bg-purple-900/80';
    if (isAnsweringQuery) return 'bg-blue-900/80'; 
    if (analysis?.detected_hazard === "Connection Unstable") return 'bg-gray-800/80';

    switch (analysis?.urgency) {
      case 'danger': return 'bg-red-900/80 animate-pulse';
      case 'caution': return 'bg-orange-800/60';
      case 'safe': return 'bg-green-900/40';
      default: return 'bg-black/60';
    }
  };

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 bg-black">
        <h1 className="text-red-500 text-3xl font-bold mb-4">Error</h1>
        <p className="text-white text-xl text-center mb-8">{error}</p>
        <button 
          onClick={onExit}
          className="bg-yellow-400 text-black text-2xl font-bold py-6 px-12 rounded-xl"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-black">
      {/* Camera Feed */}
      <video 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-cover z-0" 
        autoPlay 
        playsInline 
        muted 
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col">
        
        {isOffline && (
          <div className="bg-red-600 p-3 z-20 animate-pulse pointer-events-none">
             <p className="text-white text-center font-bold text-lg uppercase tracking-widest">OFFLINE</p>
          </div>
        )}

        {/* Main Status Area - TAPPABLE for Mic */}
        <button 
            onClick={handleScreenTap}
            className={`flex-1 flex flex-col items-center justify-center p-6 transition-colors duration-500 ${getStatusColor()} backdrop-blur-sm active:opacity-80`}
            aria-label="Tap to give command"
        >
          <div className="text-center mb-8 pointer-events-none">
            <h2 className="text-white text-lg uppercase tracking-widest font-semibold mb-2 drop-shadow-md">
                {isListening ? "Listening..." : isAnsweringQuery ? "Processing" : "Status"}
            </h2>
            <div className="inline-block bg-white/90 px-6 py-4 rounded-lg shadow-xl backdrop-blur-md">
                <p className="text-black text-4xl font-black uppercase">
                {isListening ? "🎙️" : isOffline ? "OFFLINE" : isAnsweringQuery ? "..." : (analysis?.urgency || "SCANNING")}
                </p>
            </div>
          </div>

          <div className="text-center px-4 pointer-events-none">
            <p className="text-white text-3xl font-bold leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
               {isListening
                 ? "Say Command..."
                 : isAnsweringQuery 
                    ? `Checking...`
                    : isOffline 
                        ? "Connection Lost. Stop." 
                        : (analysis?.instruction || "Scanning path...")}
            </p>
            {!isListening && !isAnsweringQuery && analysis?.detected_hazard && analysis.detected_hazard !== "Clear Path" && (
                <p className="text-gray-200 text-xl mt-4 font-medium drop-shadow-md">
                    Detected: {analysis.detected_hazard}
                </p>
            )}
          </div>
          
          {!isListening && !isAnsweringQuery && (
              <div className="absolute bottom-32 opacity-50 animate-bounce">
                  <p className="text-white text-sm uppercase tracking-widest">Tap to Command</p>
              </div>
          )}
        </button>

        {/* Controls */}
        <div className="bg-black/80 p-4 border-t-4 border-gray-800/50 flex gap-4 backdrop-blur-md">
          <button
            onClick={(e) => { e.stopPropagation(); speak("Ending"); onExit(); }}
            className="flex-1 bg-gray-800/80 text-white border-2 border-gray-600 rounded-xl h-24 text-xl font-bold uppercase tracking-wider active:bg-red-900 transition-colors"
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveNavigation;
