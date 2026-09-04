"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/DropdownMenu';
import { Check, ChevronDown, Clock, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

// Status types for different entities
export type PhaseStatus = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
export type StageStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'BLOCKED';
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';

// Generic status type
export type EntityStatus = PhaseStatus | StageStatus | TaskStatus;

// Status option interface
interface StatusOption {
  value: EntityStatus;
  label: string;
  icon: React.ReactNode;
  variant: 'default' | 'outline' | 'secondary' | 'destructive' | 'success';
}

// Status options for phases
export const phaseStatusOptions: StatusOption[] = [
  { 
    value: 'PLANNING', 
    label: 'Planning', 
    icon: <Clock className="h-4 w-4 mr-2" />, 
    variant: 'outline' 
  },
  { 
    value: 'IN_PROGRESS', 
    label: 'In Progress', 
    icon: <Clock className="h-4 w-4 mr-2" />, 
    variant: 'default' 
  },
  { 
    value: 'COMPLETED', 
    label: 'Completed', 
    icon: <Check className="h-4 w-4 mr-2" />, 
    variant: 'success' 
  },
  { 
    value: 'BLOCKED', 
    label: 'Blocked', 
    icon: <AlertCircle className="h-4 w-4 mr-2" />, 
    variant: 'destructive' 
  },
];

// Status options for stages
export const stageStatusOptions: StatusOption[] = [
  { 
    value: 'PENDING', 
    label: 'Pending', 
    icon: <Clock className="h-4 w-4 mr-2" />, 
    variant: 'outline' 
  },
  { 
    value: 'ACTIVE', 
    label: 'Active', 
    icon: <Clock className="h-4 w-4 mr-2" />, 
    variant: 'default' 
  },
  { 
    value: 'COMPLETED', 
    label: 'Completed', 
    icon: <CheckCircle2 className="h-4 w-4 mr-2" />, 
    variant: 'success' 
  },
  { 
    value: 'BLOCKED', 
    label: 'Blocked', 
    icon: <XCircle className="h-4 w-4 mr-2" />, 
    variant: 'destructive' 
  },
];

// Status options for tasks
export const taskStatusOptions: StatusOption[] = [
  { 
    value: 'OPEN', 
    label: 'Open', 
    icon: <Clock className="h-4 w-4 mr-2" />, 
    variant: 'outline' 
  },
  { 
    value: 'IN_PROGRESS', 
    label: 'In Progress', 
    icon: <Clock className="h-4 w-4 mr-2" />, 
    variant: 'default' 
  },
  { 
    value: 'COMPLETED', 
    label: 'Completed', 
    icon: <CheckCircle2 className="h-4 w-4 mr-2" />, 
    variant: 'success' 
  },
  { 
    value: 'BLOCKED', 
    label: 'Blocked', 
    icon: <XCircle className="h-4 w-4 mr-2" />, 
    variant: 'destructive' 
  },
];

// Get status options based on entity type
export function getStatusOptions(entityType: 'phase' | 'stage' | 'task'): StatusOption[] {
  switch (entityType) {
    case 'phase':
      return phaseStatusOptions;
    case 'stage':
      return stageStatusOptions;
    case 'task':
      return taskStatusOptions;
    default:
      return [];
  }
}

// Get status option by value
export function getStatusOption(
  entityType: 'phase' | 'stage' | 'task', 
  value: EntityStatus
): StatusOption | undefined {
  return getStatusOptions(entityType).find(option => option.value === value);
}

// Status badge component
export const StatusBadge: React.FC<{
  status: EntityStatus;
  entityType: 'phase' | 'stage' | 'task';
  className?: string;
}> = ({ status, entityType, className }) => {
  const option = getStatusOption(entityType, status);
  
  if (!option) return null;
  
  return (
    <Badge 
      variant={option.variant as any} 
      className={cn('flex items-center', className)}
    >
      {option.icon}
      {option.label}
    </Badge>
  );
};

// Status update controls component
interface StatusUpdateControlsProps {
  status: EntityStatus;
  entityType: 'phase' | 'stage' | 'task';
  onStatusChange: (status: EntityStatus) => void;
  disabled?: boolean;
  className?: string;
}

export const StatusUpdateControls: React.FC<StatusUpdateControlsProps> = ({
  status,
  entityType,
  onStatusChange,
  disabled = false,
  className,
}) => {
  const statusOptions = getStatusOptions(entityType);
  const currentOption = statusOptions.find(option => option.value === status) || statusOptions[0];
  
  return (
    <div className={cn('flex items-center', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex items-center gap-2"
          >
            <StatusBadge status={status} entityType={entityType} />
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {statusOptions.map(option => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onStatusChange(option.value)}
              className="flex items-center gap-2"
            >
              <Badge variant={option.variant as any} className="flex items-center">
                {option.icon}
                {option.label}
              </Badge>
              {option.value === status && (
                <Check className="h-4 w-4 ml-auto" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
