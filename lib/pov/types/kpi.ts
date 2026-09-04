import type { JsonValue } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';

export type KPIType = 'PERCENTAGE' | 'NUMERIC' | 'BOOLEAN' | 'CUSTOM';
export type PoVStatus = 'PROJECTED' | 'IN_PROGRESS' | 'STALLED' | 'VALIDATION' | 'WON' | 'LOST';

export interface KPITemplateCreateInput {
  name: string;
  description?: string;
  type: KPIType;
  isCustom?: boolean;
  defaultTarget?: Prisma.InputJsonValue;
  calculation?: string;
  visualization?: string;
}

export interface KPITemplateUpdateInput extends Partial<KPITemplateCreateInput> {}

export interface KPIContext {
  id: string;
  status: PoVStatus;
  startDate: Date;
  endDate: Date;
}

export interface KPICalculationContext {
  pov: KPIContext;
  current: JsonValue;
  target: JsonValue;
  history: KPIHistoryEntry[];
}

export interface KPIHistoryEntry {
  value: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface KPIThreshold {
  warning: number;
  critical: number;
}

export interface KPITarget {
  value: number;
  threshold?: KPIThreshold;
}

export type SerializedKPITarget = {
  value: number;
  threshold?: {
    warning: number;
    critical: number;
  };
};

export interface KPIVisualization {
  type: 'line' | 'bar' | 'gauge';
  options?: {
    min?: number;
    max?: number;
    unit?: string;
    colors?: {
      success: string;
      warning: string;
      critical: string;
    };
  };
}

export interface KPICalculationResult {
  value: number;
  status: 'success' | 'warning' | 'critical';
  metadata: {
    calculatedAt: string;
    context: KPICalculationContext;
  };
}

export interface KPICreateInput {
  name: string;
  target: KPITarget;
  current: Prisma.InputJsonValue;
  weight?: number;
}

export interface KPIUpdateInput extends Partial<KPICreateInput> {}

export interface KPIResponse {
  id: string;
  povId: string;
  templateId: string | null;
  name: string;
  target: SerializedKPITarget;
  current: JsonValue;
  weight: number | null;
  createdAt: Date;
  updatedAt: Date;
  template: {
    id: string;
    name: string;
    type: KPIType;
    calculation: string | null;
    visualization: string | null;
  } | null;
  history?: KPIHistoryEntry[];
}
