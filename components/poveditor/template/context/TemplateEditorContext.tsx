'use client';

import { createContext, useContext } from 'react';
import { TemplateEditorState } from './types/TemplateEditorState';
import { TemplateActionCreators } from './types/TemplateActions';

/**
 * Template editor context interface
 */
export interface TemplateEditorContextValue {
  state: TemplateEditorState;
  actions: TemplateActionCreators;
  
  // Computed values
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  canSave: boolean;
  
  // Utility functions
  getFieldValue: (path: string[]) => any;
  setFieldValue: (path: string[], value: any) => void;
  validateTemplate: () => Promise<boolean>;
  saveTemplate: () => Promise<boolean>;
  resetTemplate: () => void;
}

/**
 * Template editor context
 */
export const TemplateEditorContext = createContext<TemplateEditorContextValue | null>(null);

/**
 * Hook to use template editor context
 */
export function useTemplateEditor(): TemplateEditorContextValue {
  const context = useContext(TemplateEditorContext);
  
  if (!context) {
    throw new Error('useTemplateEditor must be used within a TemplateEditorProvider');
  }
  
  return context;
}

/**
 * Hook to get template editor state
 */
export function useTemplateEditorState(): TemplateEditorState {
  const { state } = useTemplateEditor();
  return state;
}

/**
 * Hook to get template editor actions
 */
export function useTemplateEditorActions(): TemplateActionCreators {
  const { actions } = useTemplateEditor();
  return actions;
}

/**
 * Hook to get specific template data
 */
export function useTemplateData() {
  const { state } = useTemplateEditor();
  return state.data;
}

/**
 * Hook to get template UI state
 */
export function useTemplateUI() {
  const { state } = useTemplateEditor();
  return state.ui;
}

/**
 * Hook to get template metadata
 */
export function useTemplateMeta() {
  const { state } = useTemplateEditor();
  return state.meta;
}

/**
 * Hook to get template relationships (for phase templates)
 */
export function useTemplateRelationships() {
  const { state } = useTemplateEditor();
  return state.relationships;
}

/**
 * Hook for template type-specific operations
 */
export function useTemplateTypeOperations() {
  const { state } = useTemplateEditor();
  
  return {
    templateType: state.ui.templateType,
    isPovTemplate: state.ui.templateType === 'pov',
    isPhaseTemplate: state.ui.templateType === 'phase',
    isAgentTemplate: state.ui.templateType === 'agent',
  };
}

/**
 * Hook for POV template operations
 */
export function usePovTemplateOperations() {
  const { state, actions } = useTemplateEditor();
  
  if (state.ui.templateType !== 'pov') {
    throw new Error('usePovTemplateOperations can only be used with POV templates');
  }
  
  return {
    fields: state.data.fields || {},
    sections: state.data.sections || [],
    addField: actions.addField,
    updateField: actions.updateField,
    removeField: actions.removeField,
    addSection: actions.addSection,
    updateSection: actions.updateSection,
    removeSection: actions.removeSection,
    reorderSections: actions.reorderSections,
  };
}

/**
 * Hook for phase template operations
 */
export function usePhaseTemplateOperations() {
  const { state, actions } = useTemplateEditor();
  
  if (state.ui.templateType !== 'phase') {
    throw new Error('usePhaseTemplateOperations can only be used with phase templates');
  }
  
  return {
    phases: state.data.phases || {},
    stages: state.data.stages || {},
    tasks: state.data.tasks || {},
    relationships: state.relationships,
    
    // Phase operations
    addPhase: actions.addPhase,
    updatePhase: actions.updatePhase,
    removePhase: actions.removePhase,
    reorderPhases: actions.reorderPhases,
    
    // Stage operations
    addStage: actions.addStage,
    updateStage: actions.updateStage,
    removeStage: actions.removeStage,
    reorderStages: actions.reorderStages,
    
    // Task operations
    addTask: actions.addTask,
    updateTask: actions.updateTask,
    removeTask: actions.removeTask,
    reorderTasks: actions.reorderTasks,
    
    // Selection operations
    selectedPhaseId: state.ui.selectedPhaseId,
    selectedStageId: state.ui.selectedStageId,
    selectedTaskId: state.ui.selectedTaskId,
    setSelectedPhase: actions.setSelectedPhase,
    setSelectedStage: actions.setSelectedStage,
    setSelectedTask: actions.setSelectedTask,
  };
}

/**
 * Hook for template validation operations
 */
export function useTemplateValidation() {
  const { state, actions, validateTemplate } = useTemplateEditor();
  
  return {
    validationErrors: state.ui.validationErrors,
    isValid: state.meta.isValid,
    hasErrors: Object.keys(state.ui.validationErrors).length > 0,
    
    // Validation actions
    validateTemplate,
    setValidationErrors: actions.setValidationErrors,
    clearValidationErrors: actions.clearValidationErrors,
    addValidationError: actions.addValidationError,
    removeValidationError: actions.removeValidationError,
    
    // Field-specific validation
    getFieldErrors: (fieldName: string) => state.ui.validationErrors[fieldName] || [],
    hasFieldError: (fieldName: string) => Boolean(state.ui.validationErrors[fieldName]?.length),
  };
}

/**
 * Hook for template save operations
 */
export function useTemplateSave() {
  const { state, saveTemplate, hasUnsavedChanges, canSave } = useTemplateEditor();
  
  return {
    isSubmitting: state.ui.isSubmitting,
    isDirty: state.meta.isDirty,
    hasUnsavedChanges,
    canSave,
    lastSaved: state.meta.lastSaved,
    saveCount: state.meta.saveCount,
    
    // Save operations
    saveTemplate,
  };
}

/**
 * Hook for template preview operations
 */
export function useTemplatePreview() {
  const { state, actions } = useTemplateEditor();
  
  return {
    showPreview: state.ui.showPreview,
    designMode: state.ui.designMode,
    setPreviewMode: actions.setPreviewMode,
    setDesignMode: actions.setDesignMode,
    togglePreview: () => actions.setPreviewMode(!state.ui.showPreview),
  };
}
