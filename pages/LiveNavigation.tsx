
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { analyzeSafety, queryVisualScene } from '../services/geminiService';
import { speak, vibrate } from '../utils/accessibility';
import { HazardAnalysis, HAPTIC_PATTERNS, RouteData } from '../types';
import { getSettings } from '../utils/settingsManager';

interface LiveNavigationProps {
  onExit: () => void;
  route?: RouteData;
}

const LiveNavigation: React.FC<LiveNavigationProps> = ({ onExit, route }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<HazardAnalysis | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnsweringQuery, setIsAnsweringQuery] = useState(false);
  const [queryText, setQueryText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const processingTimeoutRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  
  // Debouncing & Gyroscope refs
  const lastSpokenRef = useRef<{ hazard: string, urgency: string, time: number, orientation: {alpha: number, beta: number, gamma: number} | null }>({ hazard: '', urgency: 'safe', time: 0, orientation: null });
  const currentOrientationRef = useRef<{alpha: number, beta: number, gamma: number} | null>(null);
  
  // Error handling refs
  const failureCountRef = useRef(0);
  const backoffMultiplierRef = useRef(1); // Adaptive speed control
  const MAX_FAILURES_BEFORE_ALERT = 3;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Connectivity Listeners
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      speak("Internet connection lost. Hazard detection paused. Please stop.", true);
      vibrate(HAPTIC_PATTERNS.DANGER_ALARM);
    };

    const handleOnline = () => {
      setIsOffline(false);
      speak("Connection restored. Resuming navigation.", true);
      vibrate(HAPTIC_PATTERNS.TAP);
      backoffMultiplierRef.current = 1; // Reset speed
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

    // Request permission for iOS 13+
    const requestAccess = async () => {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          // Note: This usually requires a user click, so it might fail on auto-load.
          // We assume standard mobile browser behavior or prior permission.
          const permission = await (DeviceOrientationEvent as any).requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        } catch (e) {
          console.warn("Gyroscope permission denied or error", e);
        }
      } else {
        // Android / Non-iOS
        window.addEventListener('deviceorientation', handleOrientation);
      }
    };

    requestAccess();

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  // Voice Command Listener (Continuous)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.interimResults = false;
    recognition.lang = getSettings().language || 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = async (event: any) => {
      const resultsLength = event.results.length;
      const transcript = event.results[resultsLength - 1][0].transcript.trim();
      
      const match = transcript.match(/^(nav|navigation|now)\s+(.*)/i);
      if (match && match[2]) {
        const userQuery = match[2];
        handleVisualQuery(userQuery);
      }
    };

    recognition.onerror = (event: any) => {
      // Ignore errors to keep alive
    };

    recognition.onend = () => {
      if (videoRef.current) {
        try { recognition.start(); } catch (e) {}
      }
    };

    try { recognition.start(); } catch (e) {}

    return () => { recognition.stop(); };
  }, []);

  const handleVisualQuery = async (query: string) => {
    if (isAnsweringQuery || !videoRef.current || !canvasRef.current) return;

    setIsAnsweringQuery(true);
    setQueryText(query);
    vibrate(HAPTIC_PATTERNS.TAP);
    
    try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const MAX_WIDTH = 500; 
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
            setQueryText(null);
        }, 2000);
    }
  };

  // Initial Startup
  useEffect(() => {
    let intro = "Starting Safe Walk. I will warn you of obstacles.";
    if (route) {
      intro = `Navigation started. ${route.steps[0].instruction}.`;
    }
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
    };
  }, [route]);

  // Analysis Loop
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    if (isAnsweringQuery) {
        processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 500);
        return;
    }

    if (isOffline || !navigator.onLine) {
      if (!isOffline) setIsOffline(true);
      processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 2000);
      return;
    }

    setIsProcessing(true);
    let nextDelay = 500 * backoffMultiplierRef.current; // Adaptive delay

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      const MAX_WIDTH = 320;
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 0.5 Quality for speed
        const base64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        
        const result = await analyzeSafety(base64Image);
        
        if (result.detected_hazard === "Connection Error") {
           throw new Error("Service connection error");
        }

        // Success: Decrease backoff (speed up) if we were slowed down
        if (backoffMultiplierRef.current > 1) {
            backoffMultiplierRef.current = Math.max(1, backoffMultiplierRef.current - 0.2);
        }
        failureCountRef.current = 0;
        
        setAnalysis(result);
        handleFeedback(result);
      }
    } catch (err) {
      console.error("Analysis error", err);
      failureCountRef.current += 1;
      
      // Increase backoff (slow down) to allow connection to recover
      backoffMultiplierRef.current = Math.min(5, backoffMultiplierRef.current + 0.5);
      
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
  }, [isProcessing, isOffline, isAnsweringQuery]);

  useEffect(() => {
    const handleVideoPlay = () => { captureAndAnalyze(); };
    const videoEl = videoRef.current;
    if (videoEl) videoEl.addEventListener('play', handleVideoPlay);
    return () => { if (videoEl) videoEl.removeEventListener('play', handleVideoPlay); };
  }, [captureAndAnalyze]);

  const handleFeedback = (result: HazardAnalysis) => {
    if (isAnsweringQuery) return;

    const now = Date.now();
    const last = lastSpokenRef.current;
    const currentOrientation = currentOrientationRef.current;

    // 1. Calculate Rotation Delta (Did the user move their head?)
    let rotationDelta = 0;
    if (last.orientation && currentOrientation) {
        rotationDelta = Math.abs(currentOrientation.alpha - last.orientation.alpha) + 
                        Math.abs(currentOrientation.beta - last.orientation.beta) +
                        Math.abs(currentOrientation.gamma - last.orientation.gamma);
    }
    // Threshold: ~15 degrees total change implies looking at something else
    const hasMovedSignificantly = rotationDelta > 15;

    // 2. Logic: Should we speak?
    const isSameHazard = result.detected_hazard.toLowerCase() === last.hazard.toLowerCase();
    const isSameUrgency = result.urgency === last.urgency;
    const isProximityDanger = result.instruction.includes("Too close");

    let shouldSpeak = false;

    // IMMEDIATE OVERRIDE: Proximity Danger
    if (isProximityDanger) {
        shouldSpeak = true;
    } 
    // New Hazard or Urgency Change
    else if (!isSameHazard || !isSameUrgency) {
        shouldSpeak = true;
        // Anti-spam for safe->safe transitions
        if (result.urgency === 'safe' && last.urgency === 'safe') shouldSpeak = false;
    } 
    // Same Hazard: Only repeat if...
    else {
        if (result.urgency === 'danger') {
            // Repeat danger every 3s OR if user moved significantly (new angle on danger)
            if ((now - last.time > 3000) || hasMovedSignificantly) shouldSpeak = true;
        } else if (result.urgency === 'caution') {
            // Repeat caution only if user moved significantly (looking around) 
            // OR very long timeout (10s)
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
        if (result.position === 'left') directionText = "on your left";
        if (result.position === 'right') directionText = "on your right";
        if (result.position === 'center') directionText = "ahead";

        speak(`${result.detected_hazard} ${directionText}.`, true);
        
        lastSpokenRef.current = { hazard: result.detected_hazard, urgency: result.urgency, time: now, orientation: currentOrientation };
      
      } else if (result.urgency === 'safe' && last.urgency !== 'safe') {
        speak("Path clear.", true);
        lastSpokenRef.current = { hazard: result.detected_hazard, urgency: result.urgency, time: now, orientation: currentOrientation };
      }
    }
  };

  const nextStep = () => {
    if (!route) return;
    const nextIdx = currentStepIndex + 1;
    if (nextIdx < route.steps.length) {
      setCurrentStepIndex(nextIdx);
      const step = route.steps[nextIdx];
      speak(`Next. ${step.instruction}. For ${step.distance}.`, true);
      vibrate(HAPTIC_PATTERNS.TAP);
    } else {
      speak("You have arrived.", true);
      onExit();
    }
  };

  const getStatusColor = () => {
    if (isOffline) return 'bg-gray-900/90';
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
        {route && (
          <div className="bg-yellow-400/90 p-4 pb-6 shadow-lg backdrop-blur-sm transition-all">
            <p className="text-black text-sm font-bold uppercase tracking-wider mb-1">
              Navigation • Step {currentStepIndex + 1} of {route.steps.length}
            </p>
            <p className="text-black text-2xl font-black leading-tight">
              {route.steps[currentStepIndex].instruction}
            </p>
             <p className="text-black text-lg font-bold mt-1 opacity-75">
              {route.steps[currentStepIndex].distance}
            </p>
          </div>
        )}

        {isOffline && (
          <div className="bg-red-600 p-3 z-20 animate-pulse">
             <p className="text-white text-center font-bold text-lg uppercase tracking-widest">OFFLINE</p>
          </div>
        )}

        <div className={`flex-1 flex flex-col items-center justify-center p-6 transition-colors duration-500 ${getStatusColor()} backdrop-blur-sm`}>
          <div className="text-center mb-8">
            <h2 className="text-white text-lg uppercase tracking-widest font-semibold mb-2 drop-shadow-md">
                {isAnsweringQuery ? "ASSISTANT" : "Status"}
            </h2>
            <div className="inline-block bg-white/90 px-6 py-4 rounded-lg shadow-xl backdrop-blur-md">
                <p className="text-black text-4xl font-black uppercase">
                {isOffline ? "OFFLINE" : isAnsweringQuery ? "ANALYZING..." : (analysis?.urgency || "SCANNING...")}
                </p>
            </div>
          </div>

          <div className="text-center px-4">
            <p className="text-white text-3xl font-bold leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
               {isAnsweringQuery 
                  ? `Checking: "${queryText}"`
                  : isOffline 
                    ? "Connection Lost. Stop." 
                    : (analysis?.instruction || "Scanning path...")}
            </p>
            {!isAnsweringQuery && analysis?.detected_hazard && analysis.detected_hazard !== "Clear Path" && (
                <p className="text-gray-200 text-xl mt-4 font-medium drop-shadow-md">
                    Detected: {analysis.detected_hazard} ({analysis.position})
                </p>
            )}
          </div>
        </div>

        <div className="bg-black/80 p-4 border-t-4 border-gray-800/50 flex gap-4 backdrop-blur-md">
          <button
            onClick={() => { speak("Ending navigation"); onExit(); }}
            className="flex-1 bg-gray-800/80 text-white border-2 border-gray-600 rounded-xl h-24 text-xl font-bold uppercase tracking-wider active:bg-red-900 transition-colors"
          >
            Stop
          </button>
          
          {route && (
            <button
              onClick={nextStep}
              className="flex-[2] bg-yellow-400 text-black border-2 border-yellow-500 rounded-xl h-24 text-2xl font-black uppercase tracking-wider active:translate-y-1 shadow-[0_4px_0_rgb(202,138,4)] transition-all"
            >
              Next Step
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveNavigation;
