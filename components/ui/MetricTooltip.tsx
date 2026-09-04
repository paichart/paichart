"use client"

import * as React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { BLOOMBERG_TOOLTIP } from '@/lib/constants/bloomberg-styles';
import { cn } from '@/lib/utils';

interface MetricTooltipProps {
  /** Explainer text. When absent, children render as a plain span (no tooltip). */
  explainer?: React.ReactNode;
  /** Classes for the trigger span (color, sizing — same place title= sat). */
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

/**
 * Accessible metric explainer for Bloomberg surfaces (see BLOOMBERG_TOOLTIP
 * in lib/constants/bloomberg-styles.ts for the rule this implements).
 * Trigger is keyboard-focusable (tabIndex=0) and works on touch, unlike
 * the raw title= attrs it replaces.
 */
export function MetricTooltip({ explainer, className, side = 'top', children }: MetricTooltipProps) {
  if (!explainer) {
    return <span className={className}>{children}</span>;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              BLOOMBERG_TOOLTIP.trigger,
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm',
              className
            )}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className={BLOOMBERG_TOOLTIP.content}>
          {explainer}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
