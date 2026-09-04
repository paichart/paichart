"use client";

import React from 'react';
import { CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react';

interface ServerStatusIndicatorProps {
  status: 'connected' | 'disconnected' | 'error' | 'testing';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ServerStatusIndicator({ 
  status, 
  size = 'md', 
  showLabel = false 
}: ServerStatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return { 
          color: 'bg-green-500', 
          label: 'Connected', 
          icon: CheckCircle,
          textColor: 'text-green-400'
        };
      case 'disconnected':
        return { 
          color: 'bg-gray-400', 
          label: 'Disconnected', 
          icon: Circle,
          textColor: 'text-gray-600'
        };
      case 'error':
        return { 
          color: 'bg-red-500', 
          label: 'Error', 
          icon: AlertCircle,
          textColor: 'text-red-400'
        };
      case 'testing':
        return { 
          color: 'bg-yellow-500', 
          label: 'Testing', 
          icon: Loader2,
          textColor: 'text-yellow-400'
        };
      default:
        return { 
          color: 'bg-gray-400', 
          label: 'Unknown', 
          icon: Circle,
          textColor: 'text-gray-600'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`${sizeClasses[size]} rounded-full ${config.color} ${status === 'testing' ? 'animate-pulse' : ''}`} />
      {showLabel && (
        <div className="flex items-center space-x-1">
          <Icon className={`${iconSizeClasses[size]} ${config.textColor} ${status === 'testing' ? 'animate-spin' : ''}`} />
          <span className={`text-sm ${config.textColor}`}>{config.label}</span>
        </div>
      )}
    </div>
  );
}
