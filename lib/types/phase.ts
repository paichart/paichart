import { PoV } from './pov';
import { Task } from './task';
import { ApiResponse } from './auth';
import { PhaseType } from '@prisma/client';

// Re-export Prisma type
export { PhaseType };

export interface Phase {
  id: string;
  name: string;
  description: string;
  type: PhaseType;
  startDate: string;
  endDate: string;
  order: number;
  povId: string;
  pov?: PoV;
  tasks?: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface PhaseResponse extends ApiResponse<Phase> {}

export interface PhaseListResponse extends ApiResponse<Phase[]> {
  total: number;
  page: number;
  pageSize: number;
}
