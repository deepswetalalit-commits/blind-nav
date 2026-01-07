
import React, { useState } from 'react';
import LiveNavigation from './pages/LiveNavigation';
import NavigationEntry from './pages/NavigationEntry';
import Settings from './pages/Settings';
import { NavigationMode, RouteData } from './types';

function App() {
  const [mode, setMode] = useState<NavigationMode>(NavigationMode.IDLE);
  const [activeRoute, setActiveRoute] = useState<RouteData | undefined>(undefined);

  const startApp = () => {
    setMode(NavigationMode.NAVIGATION_ENTRY);
  };

  const handleRouteReady = (route: RouteData) => {
    setActiveRoute(route);
    setMode(NavigationMode.NAVIGATING);
  };

  const handleSafeWalkOnly = () => {
    setMode(NavigationMode.SAFE_WALK);
  };

  const handleOpenSettings = () => {
    setMode(NavigationMode.SETTINGS);
  };

  const handleExit = () => {
    setMode(NavigationMode.IDLE);
    setActiveRoute(undefined);
  };

  if (mode === NavigationMode.IDLE) {
    return (
      <div 
        onClick={startApp}
        className="h-screen w-screen bg-black flex flex-col items-center justify-center p-8 cursor-pointer touch-manipulation"
      >
        <h1 className="text-6xl font-black text-yellow-400 mb-8 text-center tracking-tighter">BlindNav</h1>
        <div className="flex flex-col items-center space-y-4">
          <div className="w-24 h-24 rounded-full border-4 border-yellow-400 animate-pulse flex items-center justify-center">
             <div className="w-4 h-4 bg-yellow-400 rounded-full" />
          </div>
          <p className="text-2xl text-white text-center font-medium">Tap screen to start</p>
        </div>
      </div>
    );
  }

  if (mode === NavigationMode.SETTINGS) {
    return <Settings onBack={startApp} />;
  }

  if (mode === NavigationMode.NAVIGATION_ENTRY) {
    return (
      <NavigationEntry 
        onRouteReady={handleRouteReady} 
        onCancel={handleSafeWalkOnly}
        onSettings={handleOpenSettings}
      />
    );
  }

  if (mode === NavigationMode.SAFE_WALK) {
    return <LiveNavigation onExit={handleExit} />;
  }

  if (mode === NavigationMode.NAVIGATING) {
    return <LiveNavigation route={activeRoute} onExit={handleExit} />;
  }

  return null;
}

export default App;
