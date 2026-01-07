import React from 'react';
import { speak, vibrate } from '../utils/accessibility';
import { HAPTIC_PATTERNS } from '../types';

interface AccessibleButtonProps {
  label: string;
  subLabel?: string;
  onClick: () => void;
  variant?: 'primary' | 'danger' | 'secondary';
  fullScreen?: boolean;
}

const AccessibleButton: React.FC<AccessibleButtonProps> = ({ 
  label, 
  subLabel, 
  onClick, 
  variant = 'primary',
  fullScreen = false 
}) => {
  
  const handleFocus = () => {
    speak(label, true);
    vibrate(HAPTIC_PATTERNS.TAP);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Visual ripple effect or specific logic could go here
    vibrate(HAPTIC_PATTERNS.TAP);
    onClick();
  };

  const getColors = () => {
    switch (variant) {
      case 'danger':
        return 'bg-red-600 text-white border-red-800 hover:bg-red-700';
      case 'secondary':
        return 'bg-gray-800 text-yellow-400 border-gray-600 hover:bg-gray-700';
      case 'primary':
      default:
        return 'bg-yellow-400 text-black border-yellow-600 hover:bg-yellow-500';
    }
  };

  return (
    <button
      onClick={handleClick}
      onFocus={handleFocus}
      onTouchStart={() => handleFocus()} // Better mobile exploration support
      className={`
        ${getColors()}
        ${fullScreen ? 'h-full flex-1' : 'h-48'}
        w-full
        border-b-8 active:border-b-0 active:translate-y-2
        transition-all duration-100
        flex flex-col items-center justify-center
        p-6 rounded-xl mb-4
        focus:ring-4 focus:ring-white
      `}
      aria-label={subLabel ? `${label}, ${subLabel}` : label}
    >
      <span className="text-4xl font-black uppercase tracking-wider mb-2 text-center block">
        {label}
      </span>
      {subLabel && (
        <span className="text-xl font-medium opacity-90 text-center block">
          {subLabel}
        </span>
      )}
    </button>
  );
};

export default AccessibleButton;