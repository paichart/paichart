import { Phase } from './phase';
import { Task } from './task';
import { ApiResponse } from './auth';
import { StageStatus } from '@prisma/client';

// Re-export Prisma enum
export { StageStatus };

/**
 * Stage DTO for API responses
 * Matches Prisma Stage model with JSON serialization
 */
export interface Stage {
  id: string;
  phaseId: string;
  name: string;
  description: string | null;
  status: StageStatus;
  order: number;
  metadata: Record<string, any> | null;
  createdAt: string;  // ISO 8601 string in JSON
  updatedAt: string;  // ISO 8601 string in JSON

  // Optional relations (when expanded)
  phase?: Phase;
  tasks?: Task[];
}

/**
 * Stage creation input (API request body)
 */
export interface CreateStageRequest {
  name: string;
  description?: string;
  order?: number;
  status?: StageStatus;
  metadata?: {
    color?: string;
    icon?: string;
    requiredTasks?: number;
    estimatedHours?: number;
    [key: string]: any;
  };
}

/**
 * Stage update input (API request body)
 */
export interface UpdateStageRequest extends Partial<CreateStageRequest> {}

/**
 * Stage status update input
 */
export interface UpdateStageStatusRequest {
  status: StageStatus;
  blockReason?: string;
}

/**
 * API response wrappers
 */
export interface StageResponse extends ApiResponse<Stage> {}

export interface StageListResponse extends ApiResponse<Stage[]> {
  total?: number;
  page?: number;
  pageSize?: number;
}

/**
 * Expanded stage with relations
 */
export interface ExpandedStage extends Stage {
  phase: Phase;
  tasks: Task[];
}
