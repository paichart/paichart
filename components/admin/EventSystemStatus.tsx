"use client";

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface EventSystemStatusProps {
  system?: 'prompt-registry' | 'all';
  showLabel?: boolean;
}

/**
 * Event System Status Indicator
 * Shows real-time connection status for event-driven systems
 *
 * Green = Connected (live updates active)
 * Red = Disconnected (manual refresh needed)
 * Yellow = Checking...
 */
export function EventSystemStatus({
  system = 'prompt-registry',
  showLabel = true
}: EventSystemStatusProps) {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  useEffect(() => {
    checkStatus();

    // Check status every 30 seconds
    const interval = setInterval(checkStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/admin/event-system/status');
      const data = await response.json();

      if (data.success && data.data?.promptRegistry?.isConnected) {
        setStatus('connected');
      } else {
        setStatus('disconnected');
      }

      setLastCheck(new Date());
    } catch {
      setStatus('disconnected');
    }
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          label: 'Live Updates',
          variant: 'success' as const,
          color: 'text-green-600',
        };
      case 'disconnected':
        return {
          icon: WifiOff,
          label: 'Offline',
          variant: 'destructive' as const,
          color: 'text-red-600',
        };
      case 'checking':
        return {
          icon: RefreshCw,
          label: 'Checking...',
          variant: 'secondary' as const,
          color: 'text-yellow-600',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (!showLabel) {
    return (
      <div className="flex items-center gap-1" title={`${config.label} (Last check: ${lastCheck.toLocaleTimeString()})`}>
        <Icon className={`h-3 w-3 ${config.color} ${status === 'checking' ? 'animate-spin' : ''}`} />
      </div>
    );
  }

  return (
    <Badge variant={config.variant} className="flex items-center gap-1.5">
      <Icon className={`h-3 w-3 ${status === 'checking' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}
