import { Phase, PhaseTemplate, PhaseType } from '@prisma/client';

export type WorkflowStage = {
  name: string;
  description?: string;
  tasks: WorkflowTask[];
  dependencies?: string[]; // Stage names that must be completed first
  metadata?: Record<string, any>;
};

export type WorkflowTask = {
  id: string;
  key?: string; // Keep for backward compatibility
  label: string;
  description?: string;
  required: boolean;
  dependencies?: string[]; // Task ids that must be completed first
  metadata?: Record<string, any>;
};

export type PhaseTemplateCreateInput = {
  name: string;
  description?: string;
  type: PhaseType;
  isDefault?: boolean;
  workflow: {
    stages: WorkflowStage[];
    metadata?: Record<string, any>;
  };
};

export type PhaseTemplateUpdateInput = Partial<PhaseTemplateCreateInput>;

export type PhaseTask = {
  id: string;
  key?: string; // Keep for backward compatibility
  completed: boolean;
  required: boolean;
  dependencies?: string[];
  notes?: string;
  completedAt?: Date;
  completedBy?: string;
};

export type PhaseDetails = {
  tasks: PhaseTask[];
  metadata?: Record<string, any>;
};

export type PhaseWithTemplate = Phase & {
  template?: PhaseTemplate;
  details: PhaseDetails;
};

export type PhaseProgress = {
  completed: number;
  total: number;
  percentage: number;
  requiredCompleted: number;
  requiredTotal: number;
  status: 'not_started' | 'in_progress' | 'blocked' | 'completed';
};

export type PhaseValidationError = {
  type: 'missing_required' | 'dependency_not_met' | 'invalid_dates' | 'custom';
  message: string;
  field?: string;
  metadata?: Record<string, any>;
};

export type PhaseValidationResult = {
  valid: boolean;
  errors?: PhaseValidationError[];
};

export type PhaseResponse = PhaseWithTemplate & {
  progress: PhaseProgress;
  validation?: PhaseValidationResult;
};
