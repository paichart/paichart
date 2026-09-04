import { z } from 'zod';
import { POVStatus, PhaseType, Priority, PoVMetadata, PoVSummary, PoVDetails, Phase, PhaseDetails } from './core';
import { SalesTheatre } from '@prisma/client';

// Request Types
export interface CreatePoVRequest {
  title: string;
  description: string;
  status: POVStatus;
  priority: Priority;
  startDate: Date;
  endDate: Date;
  forecastDate?: Date | null;
  objective?: string;
  dealId?: string;
  opportunityName?: string;
  revenue?: number;
  customerName?: string;
  customerContact?: string;
  partnerName?: string;
  partnerContact?: string;
  competitors?: string[];
  solution?: string;
  estimatedBudget?: number;
  metadata: PoVMetadata;
  teamMembers?: Array<{
    userId: string;
    role: string;
  }>;
  salesTheatre: SalesTheatre;  // Required
  countryId: string;           // Required
  regionId?: string;           // Optional
  templateId?: string;
}

export interface UpdatePoVRequest {
  title?: string;
  description?: string;
  status?: POVStatus;
  priority?: Priority;
  startDate?: Date;
  endDate?: Date;
  forecastDate?: Date | null;
  objective?: string;
  dealId?: string;
  opportunityName?: string;
  revenue?: number;
  customerName?: string;
  customerContact?: string;
  partnerName?: string;
  partnerContact?: string;
  competitors?: string[];
  solution?: string;
  estimatedBudget?: number;
  metadata?: Partial<PoVMetadata>;
  teamMembers?: Array<{
    userId: string;
    role: string;
  }>;
  salesTheatre?: SalesTheatre;
  countryId?: string;
  regionId?: string;
  templateId?: string;
}

export interface CreatePhaseRequest {
  name: string;
  description: string;
  type: PhaseType;
  startDate: Date;
  endDate: Date;
  templateId: string;
}

export interface UpdatePhaseRequest {
  name?: string;
  description?: string;
  type?: PhaseType;
  startDate?: Date;
  endDate?: Date;
  order?: number;
}

export interface ReorderPhasesRequest {
  phases: Array<{
    id: string;
    order: number;
  }>;
}

// Response Types
export interface PoVListResponse {
  data: PoVSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PoVResponseWrapper {
  data: PoVDetails;
}

export interface PhaseResponseWrapper {
  data: Phase;
}

export interface PhaseListResponseWrapper {
  data: Phase[];
}

export interface PoVMetadataResponseWrapper {
  data: PoVMetadata;
}

// Query Parameters
export interface PoVListParams {
  page?: number;
  pageSize?: number;
  status?: POVStatus;
  priority?: Priority;
  search?: string;
  ownerId?: string;
  teamId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface PhaseListParams {
  includeCompleted?: boolean;
  type?: PhaseType;
}

// Error Types
export interface PoVError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Context Types
export interface PoVContext {
  povId: string;
  userId: string;
  userRole: string;
  teamId?: string;
}

export interface PhaseContext extends PoVContext {
  phaseId: string;
}

// Validation Schemas
export const createPoVSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string(),
  status: z.nativeEnum(POVStatus),
  priority: z.nativeEnum(Priority),
  startDate: z.union([z.string(), z.date()]).transform((val) => new Date(val)),
  endDate: z.union([z.string(), z.date()]).transform((val) => new Date(val)),
  forecastDate: z.union([z.string(), z.date()]).transform((val) => new Date(val)).optional().nullable(),
  objective: z.string().optional(),
  dealId: z.string().optional(),
  opportunityName: z.string().optional(),
  revenue: z.number().optional(),
  customerName: z.string().optional(),
  customerContact: z.string().optional(),
  partnerName: z.string().optional(),
  partnerContact: z.string().optional(),
  competitors: z.array(z.string()).optional(),
  solution: z.string().optional(),
  estimatedBudget: z.number().optional(),
  metadata: z.object({
    customer: z.string(),
    teamSize: z.string(),
    successCriteria: z.string(),
    technicalRequirements: z.string(),
  }),
  teamMembers: z.array(
    z.object({
      userId: z.string(),
      role: z.string()
    })
  ).optional(),
  salesTheatre: z.nativeEnum(SalesTheatre, {
    required_error: 'Sales Theatre is required',
  }),
  countryId: z.string({
    required_error: 'Country is required',
  }),
  regionId: z.string().optional(),
  templateId: z.string().optional(),
});

export const updatePoVSchema = createPoVSchema.partial();

export const createPhaseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
  type: z.nativeEnum(PhaseType),
  startDate: z.union([z.string(), z.date()]).transform((val) => new Date(val)),
  endDate: z.union([z.string(), z.date()]).transform((val) => new Date(val)),
  templateId: z.string().optional(),
});

export const updatePhaseSchema = createPhaseSchema.extend({
  order: z.number().optional(),
}).partial();

export const reorderPhasesSchema = z.object({
  phases: z.array(
    z.object({
      id: z.string(),
      order: z.number().min(0),
    })
  ),
});
