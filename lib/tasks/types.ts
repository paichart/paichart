import { User } from '@/lib/types/auth';
import { Team } from '@/lib/types/team';
import { PoV } from '@/lib/types/pov';
import { Phase } from '@/lib/types/phase';
import { TaskPriority, TaskStatus } from '@prisma/client';

// Re-export Prisma types
export { TaskPriority, TaskStatus };

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  teamId: string | null;
  povId: string | null;
  phaseId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  assignee?: User;
  team?: Team;
  pov?: PoV;
  phase?: Phase;
}

export interface TaskResponse {
  data: Task;
}

export interface CreateTaskData {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  teamId?: string | null;
  povId?: string | null;
  phaseId?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
}
