"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, AlertCircle, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { ProgressIndicator, calculateProgress, getProgressVariant } from './ProgressIndicator';
import { EntityStatus } from './StatusUpdateControls';

interface CompletionStatusIndicatorProps {
  status: EntityStatus;
  completedItems?: number;
  totalItems?: number;
  showProgress?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Component for displaying completion status with optional progress indicator
 */
export const CompletionStatusIndicator: React.FC<CompletionStatusIndicatorProps> = ({
  status,
  completedItems,
  totalItems,
  showProgress = true,
  size = 'md',
  className,
}) => {
  // Determine icon and color based on status
  const { icon, color, label } = getStatusConfig(status);
  
  // Calculate progress if completedItems and totalItems are provided
  const progress = completedItems !== undefined && totalItems !== undefined
    ? calculateProgress(completedItems, totalItems)
    : status === 'COMPLETED' ? 100 : 0;
  
  // Determine icon size based on size prop
  const iconSize = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }[size];
  
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center justify-center', iconSize, color)}>
              {icon}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
            {completedItems !== undefined && totalItems !== undefined && (
              <p className="text-xs text-muted-foreground">
                {completedItems} of {totalItems} items completed ({progress}%)
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      {showProgress && completedItems !== undefined && totalItems !== undefined && (
        <ProgressIndicator 
          progress={progress} 
          size={size} 
          variant={getProgressVariant(progress)}
          showLabel={false}
          className="w-full"
        />
      )}
    </div>
  );
};

/**
 * Get status configuration based on status
 * @param status Entity status
 * @returns Status configuration with icon, color, and label
 */
function getStatusConfig(status: EntityStatus): { 
  icon: React.ReactNode; 
  color: string; 
  label: string;
} {
  switch (status) {
    case 'COMPLETED':
      return {
        icon: <CheckCircle2 />,
        color: 'text-green-500',
        label: 'Completed',
      };
    case 'IN_PROGRESS':
    case 'ACTIVE':
      return {
        icon: <Clock />,
        color: 'text-blue-500',
        label: 'In Progress',
      };
    case 'BLOCKED':
      return {
        icon: <XCircle />,
        color: 'text-red-500',
        label: 'Blocked',
      };
    case 'PLANNING':
    case 'PENDING':
    case 'OPEN':
    default:
      return {
        icon: <Clock />,
        color: 'text-muted-foreground',
        label: 'Not Started',
      };
  }
}

/**
 * Calculate completion status based on task statuses
 * @param statuses Array of task statuses
 * @returns Object with completed count, total count, and completion percentage
 */
export function calculateCompletionStatus(statuses: EntityStatus[]): {
  completed: number;
  total: number;
  percentage: number;
} {
  const total = statuses.length;
  const completed = statuses.filter(status => status === 'COMPLETED').length;
  const percentage = calculateProgress(completed, total);
  
  return { completed, total, percentage };
}

/**
 * Determine overall status based on task statuses
 * @param statuses Array of task statuses
 * @returns Overall status
 */
export function determineOverallStatus(statuses: EntityStatus[]): EntityStatus {
  if (statuses.length === 0) return 'PENDING';
  
  const { completed, total, percentage } = calculateCompletionStatus(statuses);
  
  if (percentage === 100) return 'COMPLETED';
  if (statuses.some(status => status === 'BLOCKED')) return 'BLOCKED';
  if (statuses.some(status => status === 'IN_PROGRESS' || status === 'ACTIVE')) return 'IN_PROGRESS';
  
  return 'PENDING';
}
