export interface WorkflowTask {
  id: string;
  key?: string; // Keep for backward compatibility
  label: string;
  required: boolean;
  completed: boolean;
  dependencies?: string[];
  notes?: string;
  metadata?: Record<string, any>;
}

export interface WorkflowSubItem {
  id: string;
  key?: string; // Keep for backward compatibility
  label: string;
  required: boolean;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface WorkflowStage {
  name: string;
  subItems: WorkflowSubItem[];
}

export interface PhaseDetails {
  tasks: WorkflowTask[];
  metadata?: Record<string, any>;
}

export interface TaskUpdate {
  id: string;
  key?: string; // Keep for backward compatibility
  completed: boolean;
  notes?: string;
}

export interface PhaseProgress {
  completed: number;
  total: number;
  requiredCompleted: number;
  requiredTotal: number;
}

export interface PhaseValidation {
  valid: boolean;
  errors: string[];
  progress: PhaseProgress;
}
