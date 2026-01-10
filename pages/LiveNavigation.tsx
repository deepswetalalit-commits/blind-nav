
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { analyzeSafety } from '../services/geminiService';
import { speak, vibrate } from '../utils/accessibility';
import { HazardAnalysis, HAPTIC_PATTERNS, RouteData } from '../types';

interface LiveNavigationProps {
  onExit: () => void;
  route?: RouteData;
}

const LiveNavigation: React.FC<LiveNavigationProps> = ({ onExit, route }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analysis, setAnalysis] = useState<HazardAnalysis | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const processingTimeoutRef = useRef<number | null>(null);
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

  // Initial Startup
  useEffect(() => {
    let intro = "Starting Safe Walk Mode. Hold camera at chest level facing forward.";
    if (route) {
      intro = `Navigation started. ${route.steps[0].instruction}. Then, ${route.steps[1]?.instruction || "you will arrive"}.`;
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

  // Analysis Loop
  const captureAndAnalyze = useCallback(async () => {
    // 1. Safety Checks
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    // 2. Offline Check - Pause Loop if Offline
    if (isOffline || !navigator.onLine) {
      if (!isOffline) setIsOffline(true);
      // Check again slowly
      processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 5000);
      return;
    }

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // 3. Ultra-Light Optimization: Resize to Max Width 320px
      const MAX_WIDTH = 320;
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 4. Low Quality JPEG (0.5) for bandwidth saving
        const base64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        
        const result = await analyzeSafety(base64Image);
        setAnalysis(result);
        handleFeedback(result);
      }
    } catch (err) {
      console.error("Analysis loop error", err);
    } finally {
      setIsProcessing(false);
      // 2.5s interval is balanced for battery/data
      processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 2500);
    }
  }, [isProcessing, isOffline]);

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
    // Priority: Danger > Navigation > Caution > Safe
    if (result.urgency === 'danger') {
      vibrate(HAPTIC_PATTERNS.DANGER_ALARM);
      speak(`STOP. ${result.detected_hazard}. ${result.instruction}`, true);
    } else if (result.urgency === 'caution') {
      vibrate(HAPTIC_PATTERNS.LONG_BUZZ);
      
      let directionText = "";
      if (result.position === 'left') directionText = "on your left";
      if (result.position === 'right') directionText = "on your right";
      if (result.position === 'center') directionText = "ahead";

      speak(`${result.detected_hazard} ${directionText}.`, true);
    } else {
      // If safe, silence is golden.
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
            <h2 className="text-white text-lg uppercase tracking-widest font-semibold mb-2 drop-shadow-md">Safety Status</h2>
            <div className="inline-block bg-white/90 px-6 py-4 rounded-lg shadow-xl backdrop-blur-md">
                <p className="text-black text-4xl font-black uppercase">
                {isOffline ? "OFFLINE" : (analysis?.urgency || "SCANNING...")}
                </p>
            </div>
          </div>

          <div className="text-center px-4">
            <p className="text-white text-3xl font-bold leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
               {isOffline 
                 ? "Connection Lost. Stop." 
                 : (analysis?.instruction || "Scanning path...")}
            </p>
            {analysis?.detected_hazard && analysis.detected_hazard !== "Clear Path" && (
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
