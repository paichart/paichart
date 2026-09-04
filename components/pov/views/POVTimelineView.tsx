"use client";

import React, { useMemo, useState } from 'react';
import { ExtendedPoVDetails } from '@/lib/pov/hooks/usePOVList';
import { fromLocalYmd } from '@/lib/utils/local-date';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { POVBloombergView } from './POVBloombergView';
import { getStatusSymbol } from '@/lib/constants/bloomberg-styles';

interface POVTimelineViewProps {
  povs: ExtendedPoVDetails[];
  onPovDeleted?: () => void;
}

// Get quarter string from date
function getQuarter(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${date.getFullYear()}`;
}

// Get quarter index for positioning (0-based from earliest quarter)
function getQuarterIndex(date: Date, startYear: number, startQuarter: number): number {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return ((year - startYear) * 4) + (quarter - startQuarter);
}

// Format currency
function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value}`;
}

// Get status color - now using shared bloomberg-styles
function getStatusColor(status: string): string {
  const statusInfo = getStatusSymbol(status);
  // Convert bg-xxx-500/10 to bg-xxx-500/20 and border-xxx-500 format for timeline cards
  const bgClass = statusInfo.bg.replace('/10', '/20');
  const borderClass = statusInfo.color.replace('text-', 'border-');
  return `${bgClass} ${borderClass} ${statusInfo.color}`;
}

// Get progress bar width
function getProgressWidth(progress: number | undefined | null, status: string): number {
  // Calculate based on phases completed or use explicit progress
  if (progress !== undefined && progress !== null) {
    return Math.min(100, Math.max(0, progress));
  }
  // Default based on status
  switch (status) {
    case 'WON': return 100;
    case 'LOST': return 100;
    case 'IN_PROGRESS': return 60;
    case 'VALIDATION': return 40;
    case 'PROJECTED': return 10;
    case 'STALLED': return 30;
    default: return 0;
  }
}

export function POVTimelineView({ povs, onPovDeleted }: POVTimelineViewProps) {
  const router = useRouter();
  const [hoveredPov, setHoveredPov] = useState<string | null>(null);

  // Calculate timeline bounds
  const { quarters, maxRevenue, minYear, minQuarter } = useMemo(() => {
    if (povs.length === 0) {
      const now = new Date();
      const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
      return {
        quarters: [`Q${currentQuarter} ${now.getFullYear()}`],
        maxRevenue: 1000000,
        minYear: now.getFullYear(),
        minQuarter: currentQuarter
      };
    }

    // Find date range from POVs
    let minDate = new Date();
    let maxDate = new Date();
    let maxRev = 0;

    povs.forEach(pov => {
      const forecastDate = pov.forecastDate ? new Date(pov.forecastDate) : new Date(pov.endDate);
      const startDate = new Date(pov.startDate);

      if (startDate < minDate) minDate = startDate;
      if (forecastDate > maxDate) maxDate = forecastDate;

      const revenue = pov.revenue ? parseFloat(pov.revenue.toString()) : 0;
      if (revenue > maxRev) maxRev = revenue;
    });

    // Expand range slightly
    minDate.setMonth(minDate.getMonth() - 1);
    maxDate.setMonth(maxDate.getMonth() + 2);

    // Generate quarters
    const startQuarter = Math.floor(minDate.getMonth() / 3) + 1;
    const startYear = minDate.getFullYear();
    const endQuarter = Math.floor(maxDate.getMonth() / 3) + 1;
    const endYear = maxDate.getFullYear();

    const quarterList: string[] = [];
    let y = startYear;
    let q = startQuarter;

    while (y < endYear || (y === endYear && q <= endQuarter)) {
      quarterList.push(`Q${q} ${y}`);
      q++;
      if (q > 4) {
        q = 1;
        y++;
      }
    }

    return {
      quarters: quarterList,
      maxRevenue: Math.max(maxRev, 1000000),
      minYear: startYear,
      minQuarter: startQuarter
    };
  }, [povs]);

  // Revenue scale (Y-axis ticks)
  const revenueScale = useMemo(() => {
    const ticks = [];
    const step = maxRevenue / 5;
    for (let i = 5; i >= 0; i--) {
      ticks.push(Math.round(step * i));
    }
    return ticks;
  }, [maxRevenue]);

  // Position POVs on the canvas
  const positionedPovs = useMemo(() => {
    return povs.map(pov => {
      const endDate = new Date(pov.endDate);
      const forecastDate = pov.forecastDate ? new Date(pov.forecastDate) : null;
      const revenueNum = pov.revenue ? parseFloat(pov.revenue.toString()) : 0;

      // X position based on END DATE (when POV/trial ends)
      const quarterIdx = getQuarterIndex(endDate, minYear, minQuarter);
      const xPercent = Math.min(95, Math.max(5, (quarterIdx / Math.max(quarters.length - 1, 1)) * 90 + 5));

      // Y position (revenue-based, inverted because CSS y increases downward)
      const yPercent = Math.min(85, Math.max(10, 90 - (revenueNum / maxRevenue) * 80));

      // Calculate forecast date X position for warning line (if forecast is before end date = risk)
      let forecastXPercent: number | null = null;
      let isAtRisk = false;
      if (forecastDate) {
        const forecastQuarterIdx = getQuarterIndex(forecastDate, minYear, minQuarter);
        forecastXPercent = Math.min(95, Math.max(5, (forecastQuarterIdx / Math.max(quarters.length - 1, 1)) * 90 + 5));
        // Risk: trying to close deal before POV trial ends
        isAtRisk = forecastDate < endDate;
      }

      return {
        pov,
        xPercent,
        yPercent,
        revenueNum,
        forecastXPercent,
        isAtRisk
      };
    });
  }, [povs, quarters, maxRevenue, minYear, minQuarter]);

  if (povs.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        No POVs to display on timeline
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="relative bg-card rounded-lg border overflow-hidden">
        {/* Header - Bloomberg style */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 font-mono text-xs">
          <div className="flex items-center gap-4">
            <span className="text-amber-400 font-bold">PIPELINE</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">{povs.length} POV{povs.length !== 1 ? 's' : ''}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-green-400">{formatCurrency(povs.reduce((sum, p) => sum + (p.revenue ? parseFloat(p.revenue.toString()) : 0), 0))}</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="text-blue-400">○</span><span>PRJ</span>
            <span className="text-amber-400">◐</span><span>VAL</span>
            <span className="text-emerald-400">●</span><span>ACT</span>
            <span className="text-green-400">✓</span><span>WON</span>
            <span className="text-red-400">✗</span><span>LST</span>
          </div>
        </div>

        {/* Canvas */}
        <div className="relative" style={{ height: '500px' }}>
          {/* Y-axis (Revenue) */}
          <div className="absolute left-0 top-0 bottom-8 w-16 flex flex-col justify-between py-4 text-xs text-muted-foreground font-mono border-r bg-muted/20">
            {revenueScale.map((tick, i) => (
              <div key={i} className="px-2 text-right">
                {formatCurrency(tick)}
              </div>
            ))}
          </div>

          {/* Grid lines */}
          <div className="absolute left-16 right-0 top-0 bottom-8">
            {/* Horizontal grid lines */}
            {revenueScale.map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/20"
                style={{ top: `${(i / (revenueScale.length - 1)) * 100}%` }}
              />
            ))}
            {/* Vertical grid lines (quarters) */}
            {quarters.map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute top-0 bottom-0 border-l border-dashed border-muted-foreground/20"
                style={{ left: `${(i / Math.max(quarters.length - 1, 1)) * 100}%` }}
              />
            ))}
          </div>

          {/* POV Cards */}
          <div className="absolute left-16 right-0 top-0 bottom-8">
            {/* Warning lines for at-risk POVs - rendered at canvas level */}
            {positionedPovs.map(({ pov, forecastXPercent, isAtRisk }) => (
              hoveredPov === pov.id && isAtRisk && forecastXPercent !== null && (
                <div
                  key={`warning-${pov.id}`}
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-5 animate-pulse"
                  style={{ left: `${forecastXPercent}%` }}
                >
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                    Forecast: {pov.forecastDate ? fromLocalYmd(pov.forecastDate).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
              )
            ))}

            {positionedPovs.map(({ pov, xPercent, yPercent, revenueNum, forecastXPercent, isAtRisk }) => (
              <Tooltip key={pov.id}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "absolute cursor-pointer transition-all duration-200 z-10",
                      hoveredPov === pov.id ? "z-20 scale-105" : ""
                    )}
                    style={{
                      left: `${xPercent}%`,
                      top: `${yPercent}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 'clamp(160px, 15%, 220px)',
                    }}
                    onClick={() => router.push(`/pov/view/${pov.id}`)}
                    onMouseEnter={() => setHoveredPov(pov.id)}
                    onMouseLeave={() => setHoveredPov(null)}
                  >
                    <div className={cn(
                      "rounded-lg border-2 p-3 shadow-lg backdrop-blur-sm",
                      getStatusColor(pov.status)
                    )}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-semibold text-sm leading-tight line-clamp-2 text-foreground">
                          {pov.title}
                        </h4>
                        <span className="font-mono text-sm font-bold whitespace-nowrap text-foreground">
                          {formatCurrency(revenueNum)}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1.5 bg-black/20 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-current rounded-full transition-all"
                          style={{ width: `${getProgressWidth(pov.progress, pov.status)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs opacity-80">
                        <span>{pov.owner?.name?.split(' ')[0] || 'Unassigned'}</span>
                        <span>{pov.salesTheatre || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-semibold">{pov.title}</p>
                    <p className="text-xs text-muted-foreground">{pov.customerName}</p>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline" className="text-xs">{pov.status}</Badge>
                      <span>{formatCurrency(revenueNum)}</span>
                    </div>
                    <div className="text-xs space-y-0.5">
                      <p className="text-muted-foreground">
                        POV: {pov.startDate ? fromLocalYmd(pov.startDate).toLocaleDateString() : 'N/A'} → {pov.endDate ? fromLocalYmd(pov.endDate).toLocaleDateString() : 'N/A'}
                      </p>
                      <p className={isAtRisk ? "text-red-400 font-medium" : "text-muted-foreground"}>
                        Forecast Close: {pov.forecastDate ? fromLocalYmd(pov.forecastDate).toLocaleDateString() : 'N/A'}
                        {isAtRisk && " ⚠️ Before POV ends"}
                      </p>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* X-axis (Quarters) */}
          <div className="absolute left-16 right-0 bottom-0 h-10 flex border-t bg-muted/20">
            {quarters.map((quarter, i) => (
              <div
                key={quarter}
                className="flex-1 flex items-start justify-center pt-2 text-xs text-muted-foreground font-mono"
              >
                {quarter}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bloomberg Dense Table Below */}
      <div className="mt-6">
        <POVBloombergView povs={povs} onPovDeleted={onPovDeleted} />
      </div>
    </TooltipProvider>
  );
}

export default POVTimelineView;
