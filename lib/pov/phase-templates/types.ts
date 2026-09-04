/**
 * Type definitions for Phase templates
 */

import { TaskType, PhaseType, StageStatus } from '@prisma/client';

// Re-export Prisma enums for external use
export { PhaseType, StageStatus };

export type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type DurationUnit = 'MINUTES' | 'HOURS' | 'DAYS' | 'WEEKS' | 'MONTHS';
export type ValidationRuleType = 'DEPENDENCY' | 'TIMELINE' | 'REQUIRED_TASKS' | 'CUSTOM';

export interface Duration {
  value: number;
  unit: DurationUnit;
}

export interface Task {
  id: string; // Changed from key to id
  title: string;
  description?: string;
  required?: boolean;
  priority?: TaskPriority;
  dependencies?: string[];
  estimatedDuration?: Duration;
  metadata?: Record<string, any>;
  type: TaskType; // Add the type property
}

export interface Stage {
  name: string;
  description?: string;
  status?: StageStatus;
  order?: number;
  dependencies?: string[];
  tasks: Task[];
  metadata?: Record<string, any>;
}

export interface ValidationRule {
  type: ValidationRuleType;
  condition: string;
  errorMessage?: string;
}

export interface TimelineRecommendation {
  minimumDuration?: Duration;
  maximumDuration?: Duration;
  stageDurations?: Record<string, Duration>;
}

export interface PhaseTemplate {
  id: string;
  name: string;
  description?: string;
  type: PhaseType;
  version?: string; // Template versioning
  isDefault: boolean; // Added isDefault property
  stages: Stage[];
  validationRules?: ValidationRule[];
  timelineRecommendations?: TimelineRecommendation;
  metadata?: Record<string, any>;
  createdAt?: Date; // Added createdAt property (optional based on usage)
  updatedAt?: Date; // Added updatedAt property (optional based on usage)
}

export interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

export interface FormSection {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
}

export interface POVTemplate {
  id: string;
  name: string;
  description: string;
  status?: string;
  version?: string;
  isDefault?: boolean;
  sections: FormSection[];
  fields: Record<string, any>;
  metadata?: {
    tags?: string[];
    [key: string]: any;
  };
}
