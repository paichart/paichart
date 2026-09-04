import { POVStatus, TaskStatus, PhaseType, Priority } from '@prisma/client';
import { Task } from '@/lib/types/task';
import { Phase } from '@/lib/types/phase';

// Re-export Prisma types
export { POVStatus, TaskStatus, PhaseType, Priority };

export interface PhaseWithStats extends Phase {
  status: 'COMPLETED' | 'OVERDUE' | 'IN_PROGRESS' | 'PENDING';
  progress: number;
}

export interface PoV {
  id: string;
  title: string;
  status: POVStatus;
  priority: Priority;
  phases: Phase[];
  team?: {
    members: Array<{
      user: {
        id: string;
        name: string;
        assignedTasks?: Array<{
          id: string;
          status: TaskStatus;
        }>;
      };
    }>;
  };
  createdAt: Date;
}

export interface CategoryStats {
  total: number;
  completed: number;
}

export type CategoryMap = Record<PhaseType, CategoryStats>;
