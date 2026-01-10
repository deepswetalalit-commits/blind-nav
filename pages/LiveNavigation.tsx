
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
  
  // Debouncing & Error handling refs
  const lastSpokenRef = useRef<{ hazard: string, urgency: string, time: number }>({ hazard: '', urgency: 'safe', time: 0 });
  const failureCountRef = useRef(0);
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
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Voice Command Listener (Continuous)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // Keep listening
    recognition.interimResults = false;
    recognition.lang = getSettings().language || 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = async (event: any) => {
      const resultsLength = event.results.length;
      const transcript = event.results[resultsLength - 1][0].transcript.trim();
      console.log("Heard in Safe Mode:", transcript);

      // Wake Word Logic: Check for "Nav"
      const match = transcript.match(/^(nav|navigation|now)\s+(.*)/i);
      
      if (match && match[2]) {
        const userQuery = match[2];
        handleVisualQuery(userQuery);
      }
    };

    recognition.onerror = (event: any) => {
      // Silently restart or ignore errors to keep loop alive
      if (event.error === 'not-allowed') {
        console.warn("Mic permission denied");
      }
    };

    recognition.onend = () => {
      // Auto-restart listening if component is still mounted
      if (videoRef.current) {
        try {
          recognition.start();
        } catch (e) {
          // Ignore start errors
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start voice listener", e);
    }

    return () => {
      recognition.stop();
    };
  }, []);

  const handleVisualQuery = async (query: string) => {
    if (isAnsweringQuery || !videoRef.current || !canvasRef.current) return;

    setIsAnsweringQuery(true);
    setQueryText(query);
    vibrate(HAPTIC_PATTERNS.TAP);
    // Don't speak "Searching" to keep it fluid, just the answer
    
    try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        // Use slightly higher quality for specific object detection than safety loop
        const MAX_WIDTH = 500; 
        const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
            
            const answer = await queryVisualScene(base64Image, query);
            
            speak(answer, true); // interrupt safety warnings for the answer
        }
    } catch (e) {
        console.error("Query failed", e);
        speak("I couldn't help with that.");
    } finally {
        setTimeout(() => {
            setIsAnsweringQuery(false);
            setQueryText(null);
        }, 2000); // Visual delay before clearing UI
    }
  };

  // Initial Startup
  useEffect(() => {
    let intro = "Starting Safe Walk Mode. Say 'Nav' then your question to find items.";
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
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn("Back camera failed, trying any camera", err);
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
          }
        } catch (fatalErr) {
          setError("Could not access camera.");
          speak("Camera error. Navigation cannot start.");
        }
      }
    };

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, [route]);

  // Analysis Loop (Safety)
  const captureAndAnalyze = useCallback(async () => {
    // 1. Safety Checks
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    // Pause safety checks while answering a specific query to avoid voice overlap
    if (isAnsweringQuery) {
        processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 500);
        return;
    }

    // 2. Offline Check
    if (isOffline || !navigator.onLine) {
      if (!isOffline) setIsOffline(true);
      processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 2000);
      return;
    }

    setIsProcessing(true);
    let nextDelay = 500; // Standard delay (walking speed safe)

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // 3. Ultra-Light Optimization for Safety Loop
      const MAX_WIDTH = 320;
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 4. Low Quality JPEG (0.5)
        const base64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        
        const result = await analyzeSafety(base64Image);
        
        // Check for "Connection Error" response from service
        if (result.detected_hazard === "Connection Error") {
           throw new Error("Service reported connection error");
        }

        // Success - Reset failure count
        failureCountRef.current = 0;
        setAnalysis(result);
        handleFeedback(result);
      }
    } catch (err) {
      console.error("Analysis loop error", err);
      failureCountRef.current += 1;
      nextDelay = 2000; // Backoff on error

      // Only alert user if errors persist (Strike System)
      if (failureCountRef.current > MAX_FAILURES_BEFORE_ALERT) {
         setAnalysis({
            detected_hazard: "Connection Unstable",
            urgency: "caution",
            position: "center",
            instruction: "Pausing for a moment..."
         });
      }
    } finally {
      setIsProcessing(false);
      processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, nextDelay);
    }
  }, [isProcessing, isOffline, isAnsweringQuery]);

  // Start loop once video is ready
  useEffect(() => {
    const handleVideoPlay = () => {
      captureAndAnalyze();
    };

    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.addEventListener('play', handleVideoPlay);
    }
    
    return () => {
      if (videoEl) {
        videoEl.removeEventListener('play', handleVideoPlay);
      }
    };
  }, [captureAndAnalyze]);

  const handleFeedback = (result: HazardAnalysis) => {
    // Skip feedback if we are answering a specific query
    if (isAnsweringQuery) return;

    const now = Date.now();
    const last = lastSpokenRef.current;
    
    // Logic: Has the situation changed?
    // We treat "Car" and "car" as same.
    const isSameHazard = result.detected_hazard.toLowerCase() === last.hazard.toLowerCase();
    const isSameUrgency = result.urgency === last.urgency;

    let shouldSpeak = false;

    if (!isSameHazard || !isSameUrgency) {
      // Significant change in environment
      shouldSpeak = true;

      // Anti-spam: If shifting from Safe -> Safe (e.g. "Clear Path" -> "Path Empty"), ignore
      if (result.urgency === 'safe' && last.urgency === 'safe') {
        shouldSpeak = false;
      }
    } else {
      // Same environment: only remind if critical
      if (result.urgency === 'danger' && now - last.time > 3000) {
        shouldSpeak = true; // Remind danger every 3s
      } else if (result.urgency === 'caution' && now - last.time > 8000) {
        shouldSpeak = true; // Remind caution every 8s
      }
    }

    if (shouldSpeak) {
      if (result.urgency === 'danger') {
        vibrate(HAPTIC_PATTERNS.DANGER_ALARM);
        speak(`STOP. ${result.detected_hazard}. ${result.instruction}`, true);
        
        lastSpokenRef.current = { hazard: result.detected_hazard, urgency: result.urgency, time: now };
      
      } else if (result.urgency === 'caution') {
        vibrate(HAPTIC_PATTERNS.LONG_BUZZ);
        
        let directionText = "";
        if (result.position === 'left') directionText = "on your left";
        if (result.position === 'right') directionText = "on your right";
        if (result.position === 'center') directionText = "ahead";

        speak(`${result.detected_hazard} ${directionText}.`, true);
        
        lastSpokenRef.current = { hazard: result.detected_hazard, urgency: result.urgency, time: now };
      
      } else if (result.urgency === 'safe' && last.urgency !== 'safe') {
        // Only announce safe if we were previously NOT safe
        speak("Path clear.", true);
        lastSpokenRef.current = { hazard: result.detected_hazard, urgency: result.urgency, time: now };
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
      speak("You have arrived at your destination.", true);
      onExit();
    }
  };

  const getStatusColor = () => {
    if (isOffline) return 'bg-gray-900/90';
    if (isAnsweringQuery) return 'bg-blue-900/80'; // Blue for Query Mode
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
      {/* Camera Feed - Visible Layer */}
      <video 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-cover z-0" 
        autoPlay 
        playsInline 
        muted 
      />
      
      {/* Hidden Canvas for Processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* UI Overlay - Semi-Transparent */}
      <div className="absolute inset-0 z-10 flex flex-col">
        
        {/* Navigation Header */}
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

        {/* Offline Banner */}
        {isOffline && (
          <div className="bg-red-600 p-3 z-20 animate-pulse">
             <p className="text-white text-center font-bold text-lg uppercase tracking-widest">
               OFFLINE MODE - PAUSED
             </p>
          </div>
        )}

        {/* Main Status Area - Tinted Overlay */}
        <div className={`flex-1 flex flex-col items-center justify-center p-6 transition-colors duration-500 ${getStatusColor()} backdrop-blur-sm`}>
          <div className="text-center mb-8">
            <h2 className="text-white text-lg uppercase tracking-widest font-semibold mb-2 drop-shadow-md">
                {isAnsweringQuery ? "ASSISTANT" : "Safety Status"}
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

        {/* Controls */}
        <div className="bg-black/80 p-4 border-t-4 border-gray-800/50 flex gap-4 backdrop-blur-md">
          <button
            onClick={() => {
              speak("Ending navigation");
              onExit();
            }}
            className="flex-1 bg-gray-800/80 text-white border-2 border-gray-600 rounded-xl h-24 text-xl font-bold uppercase tracking-wider active:bg-red-900 transition-colors"
          >
            Stop
          </button>
          
          {route && (
            <button
              onClick={nextStep}
              className="flex-[2] bg-yellow-400 text-black border-2 border-yellow-500 rounded-xl h-24 text-2xl font-black uppercase tracking-wider active:translate-y-1 shadow-[0_4px_0_rgb(202,138,4)] active:shadow-none transition-all"
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
