import { TemplateType, TemplateEditorState, Phase, Stage, Task } from './TemplateEditorState';
import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';

/**
 * Template editor action types
 */
export type TemplateAction = 
  // Field management
  | { type: 'SET_FIELD'; path: string[]; value: any }
  | { type: 'UPDATE_FIELD'; fieldId: string; field: Partial<FieldDefinition> }
  | { type: 'ADD_FIELD'; fieldId: string; field: FieldDefinition }
  | { type: 'REMOVE_FIELD'; fieldId: string }
  
  // Section management
  | { type: 'UPDATE_SECTION'; sectionIndex: number; section: Partial<SectionDefinition> }
  | { type: 'ADD_SECTION'; section: SectionDefinition }
  | { type: 'REMOVE_SECTION'; sectionIndex: number }
  | { type: 'REORDER_SECTIONS'; fromIndex: number; toIndex: number }
  
  // Phase template entity management
  | { type: 'ADD_PHASE'; phase: Phase }
  | { type: 'UPDATE_PHASE'; phaseId: string; updates: Partial<Phase> }
  | { type: 'REMOVE_PHASE'; phaseId: string }
  | { type: 'REORDER_PHASES'; phaseIds: string[] }
  
  | { type: 'ADD_STAGE'; stage: Stage }
  | { type: 'UPDATE_STAGE'; stageId: string; updates: Partial<Stage> }
  | { type: 'REMOVE_STAGE'; stageId: string }
  | { type: 'REORDER_STAGES'; phaseId: string; stageIds: string[] }
  
  | { type: 'ADD_TASK'; task: Task }
  | { type: 'UPDATE_TASK'; taskId: string; updates: Partial<Task> }
  | { type: 'REMOVE_TASK'; taskId: string }
  | { type: 'REORDER_TASKS'; stageId: string; taskIds: string[] }
  
  // UI state management
  | { type: 'SET_ACTIVE_TAB'; tab: string }
  | { type: 'SET_SELECTED_PHASE'; phaseId: string | null }
  | { type: 'SET_SELECTED_STAGE'; stageId: string | null }
  | { type: 'SET_SELECTED_TASK'; taskId: string | null }
  | { type: 'SET_PREVIEW_MODE'; showPreview: boolean }
  | { type: 'SET_DESIGN_MODE'; designMode: 'visual' | 'code' }
  
  // Validation and error management
  | { type: 'SET_VALIDATION_ERRORS'; errors: Record<string, string[]> }
  | { type: 'CLEAR_VALIDATION_ERRORS' }
  | { type: 'ADD_VALIDATION_ERROR'; field: string; error: string }
  | { type: 'REMOVE_VALIDATION_ERROR'; field: string }
  
  // State management
  | { type: 'MARK_DIRTY'; fieldPaths?: string[] }
  | { type: 'MARK_CLEAN' }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_VALID'; isValid: boolean }
  
  // Template lifecycle
  | { type: 'INITIALIZE_TEMPLATE'; template: Partial<TemplateEditorState> }
  | { type: 'RESET_TEMPLATE' }
  | { type: 'DUPLICATE_TEMPLATE'; sourceTemplate: TemplateEditorState }
  
  // Bulk operations
  | { type: 'BULK_UPDATE_FIELDS'; fields: Record<string, FieldDefinition> }
  | { type: 'BULK_UPDATE_SECTIONS'; sections: SectionDefinition[] }
  | { type: 'BULK_UPDATE_PHASES'; phases: Record<string, Phase> }
  
  // Import/Export operations
  | { type: 'IMPORT_TEMPLATE_DATA'; data: any }
  | { type: 'EXPORT_TEMPLATE_DATA' }
  
  // Undo/Redo (future enhancement)
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_CHECKPOINT'; checkpoint: TemplateEditorState };

/**
 * Action creator types for better type safety
 */
export interface TemplateActionCreators {
  // Field operations
  setField: (path: string[], value: any) => void;
  updateField: (fieldId: string, field: Partial<FieldDefinition>) => void;
  addField: (fieldId: string, field: FieldDefinition) => void;
  removeField: (fieldId: string) => void;
  
  // Section operations
  updateSection: (sectionIndex: number, section: Partial<SectionDefinition>) => void;
  addSection: (section: SectionDefinition) => void;
  removeSection: (sectionIndex: number) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;
  
  // Phase operations
  addPhase: (phase: Phase) => void;
  updatePhase: (phaseId: string, updates: Partial<Phase>) => void;
  removePhase: (phaseId: string) => void;
  reorderPhases: (phaseIds: string[]) => void;
  
  // Stage operations
  addStage: (stage: Stage) => void;
  updateStage: (stageId: string, updates: Partial<Stage>) => void;
  removeStage: (stageId: string) => void;
  reorderStages: (phaseId: string, stageIds: string[]) => void;
  
  // Task operations
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string) => void;
  reorderTasks: (stageId: string, taskIds: string[]) => void;
  
  // UI operations
  setActiveTab: (tab: string) => void;
  setSelectedPhase: (phaseId: string | null) => void;
  setSelectedStage: (stageId: string | null) => void;
  setSelectedTask: (taskId: string | null) => void;
  setPreviewMode: (showPreview: boolean) => void;
  setDesignMode: (designMode: 'visual' | 'code') => void;
  
  // Validation operations
  setValidationErrors: (errors: Record<string, string[]>) => void;
  clearValidationErrors: () => void;
  addValidationError: (field: string, error: string) => void;
  removeValidationError: (field: string) => void;
  
  // State operations
  markDirty: (fieldPaths?: string[]) => void;
  markClean: () => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setValid: (isValid: boolean) => void;
  
  // Template lifecycle
  initializeTemplate: (template: Partial<TemplateEditorState>) => void;
  resetTemplate: () => void;
  duplicateTemplate: (sourceTemplate: TemplateEditorState) => void;
  
  // Bulk operations
  bulkUpdateFields: (fields: Record<string, FieldDefinition>) => void;
  bulkUpdateSections: (sections: SectionDefinition[]) => void;
  bulkUpdatePhases: (phases: Record<string, Phase>) => void;
  
  // Import/Export
  importTemplateData: (data: any) => void;
  exportTemplateData: () => void;
}

/**
 * Helper type for action payloads
 */
export type ActionPayload<T extends TemplateAction['type']> = Extract<TemplateAction, { type: T }>;

/**
 * Template action context type
 */
export interface TemplateActionContext {
  state: TemplateEditorState;
  dispatch: (action: TemplateAction) => void;
  actions: TemplateActionCreators;
}
