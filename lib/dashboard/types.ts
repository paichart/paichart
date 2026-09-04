import { POVStatus, Priority, PhaseType, TaskStatus } from '@prisma/client';

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

export interface Activity {
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
  recentActivities: Activity[];
}

export interface Assignee {
  id: string;
  name: string;
}

export interface Milestone {
  id: string;
  povId: string;
  title: string;
  dueDate: Date;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  progress: number;
  assignees: Assignee[];
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

export interface RiskLevel {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  count: number;
  percentage: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
}

export interface RiskOverviewData {
  overall: RiskLevel[];
  byCategory: Record<string, RiskLevel[]>;
}

export interface SuccessRatePeriod {
  period: string;
  rate: number;
  total: number;
  successful: number;
  factors: Array<{
    name: string;
    impact: number;
  }>;
}

export interface SuccessRateData {
  current: number;
  historical: SuccessRatePeriod[];
  byCategory: Record<string, number>;
}
