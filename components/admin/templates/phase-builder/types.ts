import { TaskType } from '@prisma/client';

import { TaskType as PrismaTaskType } from '@prisma/client'; // Rename to avoid conflict
import { PhaseType, StageStatus, TaskPriority, DurationUnit, Duration, ValidationRule, TimelineRecommendation, PhaseTemplate as CorePhaseTemplate } from '@/lib/pov/phase-templates/types'; // Import types from the unified definition and rename PhaseTemplate

// Define a type for the template data managed by the builder
export interface BuilderPhaseTemplate extends Omit<CorePhaseTemplate, 'id'> {
  id?: string; // Allow id to be optional for new templates
}

// Align Task interface with the unified definition
export interface Task {
  id: string; // Unique identifier within the phase template
  title: string; // Task title
  description?: string;
  required?: boolean; // Added from unified type
  priority?: TaskPriority; // Added from unified type
  dependencies?: string[]; // Array of Task ids within the same phase template
  estimatedDuration?: Duration; // Added from unified type
  metadata?: Record<string, any>; // Flexible metadata field (Added from unified type)
  type: TaskType; // Add the type property
  // Removed assignee, dueDate, fields as they are not in the core PhaseTemplate Task definition
}

// Align Stage interface with the unified definition
export interface Stage {
  name: string;
  description?: string;
  status?: StageStatus; // Added from unified type
  order?: number; // Added from unified type
  dependencies?: string[]; // Dependencies on other stages (optional) (Added from unified type)
  tasks: Task[]; // Array of tasks within this stage
  metadata?: Record<string, any>; // Flexible metadata field (Added from unified type)
  // Removed id and color as they are not in the core PhaseTemplate Stage definition
}

// Re-export core types that are used internally but not modified
export type { PhaseType, StageStatus, TaskPriority, DurationUnit, Duration, ValidationRule, TimelineRecommendation };

export interface PhaseTemplateBuilderProps {
  initialData?: BuilderPhaseTemplate; // Use the builder-specific type
  onSave?: (template: BuilderPhaseTemplate) => void; // Use the builder-specific type
}

export interface DragItem {
  type: string;
  id: string;
  index: number;
  stageId?: string;
}
