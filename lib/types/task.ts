/**
 * Basic Task interface for API responses and dashboard views
 * 
 * This file provides lightweight Data Transfer Objects (DTOs) optimized for:
 * - API responses and external consumption
 * - Dashboard components and simple UI views
 * - Avoiding circular dependencies with POV/Phase types
 * 
 * For comprehensive task operations with AI features, use:
 * @see lib/tasks/types/index.ts
 */

import { ApiResponse, User } from '@/lib/types/auth';
import { Team } from '@/lib/types/team';
import { PoV } from '@/lib/types/pov';
import { Phase } from '@/lib/types/phase';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';

// Re-export Prisma types
export { TaskPriority, TaskStatus, TaskType };

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assignee?: {
    id: string;
    name: string;
    email: string;
  } | null;
  teamId: string | null;
  team?: Team;
  povId: string | null;
  pov?: PoV;
  phaseId: string | null;
  phase?: Phase;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  type: TaskType;  // Add the TaskType field
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskResponse extends ApiResponse<Task> {}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  text: string;
  createdAt: string;
  user?: User;
}

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  fileSize: number;
  fileType: string;
  storageUrl: string;
  createdAt: string;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  userId: string;
  action: string;
  timestamp: string;
  user?: User;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnId: string;
  createdAt: string;
  task?: Task;
  dependsOn?: Task;
}

export interface CommentListResponse extends ApiResponse<Comment[]> {}
export interface AttachmentListResponse extends ApiResponse<Attachment[]> {}
export interface TaskActivityListResponse extends ApiResponse<TaskActivity[]> {}
