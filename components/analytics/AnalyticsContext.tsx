'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

interface AnalyticsContextType {
  selectedPOVId: string | 'all';
  setSelectedPOVId: (id: string | 'all') => void;
  timeRange: string;
  setTimeRange: (range: string) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

/**
 * Analytics Context Provider
 * Phase 2 Task 2.2: Global state management for analytics dashboard
 *
 * Features:
 * - Manages selectedPOVId and timeRange state
 * - Syncs state with URL parameters (shareable links)
 * - All analytics components read from this context
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedPOVId, setSelectedPOVIdState] = useState<string | 'all'>(
    searchParams.get('povId') || 'all'
  );
  const [timeRange, setTimeRangeState] = useState<string>(
    searchParams.get('range') || '90d'
  );

  // Sync state with URL parameters
  const setSelectedPOVId = (id: string | 'all') => {
    setSelectedPOVIdState(id);
    const params = new URLSearchParams(searchParams.toString());

    if (id === 'all') {
      params.delete('povId');
    } else {
      params.set('povId', id);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const setTimeRange = (range: string) => {
    setTimeRangeState(range);
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', range);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Sync URL changes back to state (browser back/forward)
  useEffect(() => {
    const povId = searchParams.get('povId') || 'all';
    const range = searchParams.get('range') || '30d';

    setSelectedPOVIdState(povId);
    setTimeRangeState(range);
  }, [searchParams]);

  return (
    <AnalyticsContext.Provider
      value={{ selectedPOVId, setSelectedPOVId, timeRange, setTimeRange }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalyticsContext must be used within AnalyticsProvider');
  }
  return context;
}
