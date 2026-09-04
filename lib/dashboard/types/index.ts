import { RiskOverviewData, RiskOverviewPoV } from './risk';

export interface ActivePoVStats {
  total: number;
  active: number;
  completed: number;
  pending: number;
  byStatus: Record<string, number>;
}

export interface TeamMember {
  userId: string;
  userName: string;
  activityCount: number;
  lastActive: Date;
  currentTasks: number;
  completedTasks: number;
}

export interface TeamActivity {
  id: string;
  type: 'USER_ROLE' | 'PoV_ACTION';
  action: string;
  userId: string;
  userName: string;
  timestamp: Date;
  details: string;
  role: string;
  poVName: string;
}

export interface TeamStatusData {
  members: TeamMember[];
  recentActivities: TeamActivity[];
}

export interface Milestone {
  id: string;
  povId: string;
  title: string;
  dueDate: Date;
  status: 'COMPLETED' | 'OVERDUE' | 'IN_PROGRESS' | 'PENDING';
  progress: number;
  assignees: Array<{
    id: string;
    name: string;
  }>;
}

export interface ResourceAllocation {
  resourceType: string;
  allocated: number;
  available: number;
  total: number;
}

export interface ResourceUsageData {
  team: ResourceAllocation;
  tasks: ResourceAllocation;
  timeline: ResourceAllocation;
}

export interface SuccessRateData {
  current: number;
  historical: Array<{
    period: string;
    rate: number;
    total: number;
    successful: number;
    factors: string[];
  }>;
  byCategory: Record<string, number>;
}

// Re-export types
export type { RiskOverviewData, RiskOverviewPoV };
