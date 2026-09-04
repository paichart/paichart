"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressIndicatorProps {
  progress: number; // 0 to 100
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
  className?: string;
}

/**
 * Progress indicator component for showing completion status
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress,
  size = 'md',
  variant = 'default',
  showLabel = false,
  className,
}) => {
  // Ensure progress is between 0 and 100
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  
  // Determine size class
  const sizeClass = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }[size];
  
  // Determine variant class
  const variantClass = {
    default: 'bg-primary',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    danger: 'bg-red-500',
  }[variant];
  
  // Determine label size
  const labelSize = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }[size];
  
  return (
    <div className={cn('w-full space-y-1', className)}>
      <div className="w-full bg-muted rounded-full overflow-hidden">
        <div 
          className={cn('rounded-full transition-all duration-300', sizeClass, variantClass)}
          style={{ width: `${normalizedProgress}%` }}
        />
      </div>
      
      {showLabel && (
        <div className={cn('text-right text-muted-foreground', labelSize)}>
          {normalizedProgress}%
        </div>
      )}
    </div>
  );
};

/**
 * Calculate progress based on completed items
 * @param completed Number of completed items
 * @param total Total number of items
 * @returns Progress percentage (0-100)
 */
export function calculateProgress(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Determine variant based on progress
 * @param progress Progress percentage (0-100)
 * @returns Variant ('default', 'success', 'warning', 'danger')
 */
export function getProgressVariant(progress: number): 'default' | 'success' | 'warning' | 'danger' {
  if (progress >= 100) return 'success';
  if (progress >= 75) return 'default';
  if (progress >= 50) return 'warning';
  return 'danger';
}
