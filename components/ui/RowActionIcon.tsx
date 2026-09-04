"use client";

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

export type RowActionVariant = 'default' | 'danger' | 'run';

/**
 * Shared table row-action icon button (icon + tooltip + stopPropagation).
 * Extracted from AgentTemplateBloombergView's repeated button blocks. The handlers stay per-page;
 * only the button chrome is shared. `run` (emerald) is just another variant — no special-casing.
 * Must wrap in a <TooltipProvider> (the table does).
 */
export function RowActionIcon({
  icon: Icon,
  tooltip,
  onClick,
  variant = 'default',
  disabled,
}: {
  icon: LucideIcon;
  tooltip: string;
  onClick: () => void;
  variant?: RowActionVariant;
  disabled?: boolean;
}) {
  const hover =
    variant === 'danger'
      ? 'hover:bg-red-500/20 hover:text-red-400'
      : variant === 'run'
        ? 'hover:bg-emerald-500/20 hover:text-emerald-400'
        : 'hover:bg-muted hover:text-foreground';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            'p-1 rounded transition-colors text-muted-foreground',
            hover,
            disabled && 'opacity-50 pointer-events-none'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
