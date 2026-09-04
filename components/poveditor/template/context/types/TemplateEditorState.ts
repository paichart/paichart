import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';
import { PhaseType, StageStatus, TaskPriority, TaskType } from '@prisma/client';

/**
 * Phase template entity types
 */
export interface Phase {
  id: string;
  name: string;
  description: string;
  type: PhaseType;
  order: number;
  startDate?: string;
  endDate?: string;
}

export interface Stage {
  id: string;
  name: string;
  description: string;
  order: number;
  phaseId: string;
  status?: StageStatus;
  metadata?: any;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  type: TaskType;
  stageId: string;
  metadata?: {
    dependencies?: string[];
    [key: string]: any;
  };
}

/**
 * Template type union
 */
export type TemplateType = 'pov' | 'phase' | 'agent';

/**
 * Main interface for the template editor state
 */
export interface TemplateEditorState {
  /**
   * Main template data
   */
  data: {
    id?: string;
    name: string;
    description: string;
    type: TemplateType;
    
    // POV Template fields
    fields?: Record<string, FieldDefinition>;
    sections?: SectionDefinition[];
    phaseTemplateIds?: string[]; // Phase templates to include when POVs are created from this template
    
    // Phase Template fields
    phases?: Record<string, Phase>;
    stages?: Record<string, Stage>;
    tasks?: Record<string, Task>;
    workflow?: any;
    
    // Agent Template fields (future)
    agentConfig?: any;
    
    // Common metadata
    tags?: string[];
    version?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  
  /**
   * UI state
   */
  ui: {
    activeTab: string;
    templateType: TemplateType;
    dirtyFields: string[];
    validationErrors: Record<string, string[]>;
    isSubmitting: boolean;
    
    // Template type specific UI state
    selectedPhaseId?: string | null;
    selectedStageId?: string | null;
    selectedTaskId?: string | null;
    
    // Preview and design state
    showPreview?: boolean;
    designMode?: 'visual' | 'code';
  };
  
  /**
   * Relationships between entities (for phase templates)
   */
  relationships?: {
    phaseOrder: string[];
    phaseToStages: Record<string, string[]>;
    stageToTasks: Record<string, string[]>;
  };
  
  /**
   * Form metadata
   */
  meta: {
    lastSaved: string | null;
    isDirty: boolean;
    isValid: boolean;
    saveCount: number;
  };
}

/**
 * Template editor mode type
 */
export type TemplateEditorMode = 'create' | 'edit' | 'view' | 'duplicate';

/**
 * Template validation result
 */
export interface TemplateValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  warnings?: Record<string, string[]>;
}

/**
 * Template save result
 */
export interface TemplateSaveResult {
  success: boolean;
  templateId?: string;
  errors?: string[];
  warnings?: string[];
}
