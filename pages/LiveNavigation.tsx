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
  const processingTimeoutRef = useRef<number | null>(null);
  
  // Navigation State
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

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
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth / 4; 
      canvas.height = video.videoHeight / 4;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        
        const result = await analyzeSafety(base64Image);
        setAnalysis(result);
        handleFeedback(result);
      }
    } catch (err) {
      console.error("Analysis loop error", err);
    } finally {
      setIsProcessing(false);
      // Fast loop for responsiveness
      processingTimeoutRef.current = window.setTimeout(captureAndAnalyze, 2500);
    }
  }, [isProcessing]);

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
      // If safe, we can occasionally remind of navigation instruction if active
      // But don't spam
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

  const getStatusColor = (urgency?: string) => {
    switch (urgency) {
      case 'danger': return 'bg-red-600 animate-pulse';
      case 'caution': return 'bg-orange-500';
      case 'safe': return 'bg-green-600';
      default: return 'bg-gray-800';
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
    <div className="h-screen flex flex-col bg-black relative overflow-hidden">
      <video ref={videoRef} className="absolute opacity-0 pointer-events-none" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      {/* Navigation Header */}
      {route && (
        <div className="bg-yellow-400 p-4 pb-6 z-10 shadow-lg">
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

      {/* Main Status Area */}
      <div className={`flex-1 flex flex-col items-center justify-center p-6 transition-colors duration-500 ${getStatusColor(analysis?.urgency)}`}>
        <div className="text-center mb-8">
          <h2 className="text-white text-lg uppercase tracking-widest font-semibold mb-2">Safety Status</h2>
          <p className="text-black bg-white px-6 py-4 rounded-lg text-4xl font-black uppercase shadow-xl">
            {analysis?.urgency || "SCANNING..."}
          </p>
        </div>

        <div className="text-center">
          <p className="text-white text-3xl font-bold leading-tight drop-shadow-md">
            {analysis?.instruction || "Scanning path..."}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black p-4 border-t-4 border-gray-800 flex gap-4">
        <button
          onClick={() => {
            speak("Ending navigation");
            onExit();
          }}
          className="flex-1 bg-gray-900 text-white border-2 border-gray-700 rounded-xl h-24 text-xl font-bold uppercase tracking-wider active:bg-red-900 transition-colors"
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
  );
};

export default LiveNavigation;