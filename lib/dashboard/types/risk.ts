import { Priority, PhaseType } from './enums';

export interface RiskOverviewData {
  overall: Array<{
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    count: number;
    percentage: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
  }>;
  byCategory: Record<string, Array<{
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    count: number;
    percentage: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
  }>>;
}

export interface RiskOverviewPoV {
  id: string;
  priority: Priority;
  phases: Array<{
    type: PhaseType;
  }>;
}
