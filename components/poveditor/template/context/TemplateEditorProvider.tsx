'use client';

import React, { useReducer, useCallback, useMemo, useEffect } from 'react';
import { TemplateEditorContext, TemplateEditorContextValue } from './TemplateEditorContext';
import { templateEditorReducer } from './reducer/templateEditorReducer';
import { initialTemplateState, createInitialStateForType, createStateFromTemplate } from './reducer/initialState';
import { TemplateActionCreators, TemplateAction } from './types/TemplateActions';
import { TemplateType, TemplateEditorState, Phase, Stage, Task } from './types/TemplateEditorState';
import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';

/**
 * Template Editor Provider Props
 */
interface TemplateEditorProviderProps {
  children: React.ReactNode;
  templateId?: string;
  initialTemplateType: TemplateType; // Now required, no default
  onSave?: (templateData: any) => Promise<boolean>;
  onValidate?: (templateData: any) => Promise<{ isValid: boolean; errors: Record<string, string[]> }>;
}

/**
 * Template Editor Provider Component
 */
export function TemplateEditorProvider({
  children,
  templateId,
  initialTemplateType,
  onSave,
  onValidate,
}: TemplateEditorProviderProps) {
  // Initialize state
  const [state, dispatch] = useReducer(
    templateEditorReducer,
    createInitialStateForType(initialTemplateType)
  );

  // API Functions
  const loadTemplate = useCallback(async (id: string) => {
    try {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

      // Determine API endpoint based on initial template type (more reliable than state)
      let endpoint: string;
      if (initialTemplateType === 'phase') {
        endpoint = `/api/phase-templates/${id}`;
      } else if (initialTemplateType === 'agent') {
        endpoint = `/api/agent-templates/${id}`;
      } else {
        endpoint = `/api/pov-templates/${id}`;
      }

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to load template: ${response.statusText}`);
      }

      const responseData = await response.json();

      // Handle different response formats:
      // - Agent templates: { success: true, data: {...} }
      // - POV/Phase templates: { template: {...} } or direct data
      const templateData = responseData.data || responseData.template || responseData;

      // Create state from template data and ensure template type is set correctly
      const newState = createStateFromTemplate(templateData);

      // Force the template type to match the initial type to prevent mismatches
      newState.ui.templateType = initialTemplateType;
      newState.data.type = initialTemplateType;

      dispatch({ type: 'INITIALIZE_TEMPLATE', template: newState });
    } catch {
      dispatch({
        type: 'ADD_VALIDATION_ERROR',
        field: 'general',
        error: 'Failed to load template'
      });
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }, [initialTemplateType]); // Remove state dependency

  // Load template data on mount if templateId is provided
  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId);
    }
  }, [templateId, loadTemplate]); // Include loadTemplate but it's now stable

  const saveTemplate = useCallback(async (): Promise<boolean> => {
    try {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });
      
      // Use custom save handler if provided
      if (onSave) {
        const success = await onSave(state.data);
        if (success) {
          dispatch({ type: 'MARK_CLEAN' });
        }
        return success;
      }
      
      // Default save logic
      let endpoint: string;
      if (state.data.id) {
        // Update existing template
        if (state.ui.templateType === 'phase') {
          endpoint = `/api/phase-templates/${state.data.id}`;
        } else if (state.ui.templateType === 'agent') {
          endpoint = `/api/agent-templates/${state.data.id}`;
        } else {
          endpoint = `/api/pov-templates/${state.data.id}`;
        }
      } else {
        // Create new template
        if (state.ui.templateType === 'phase') {
          endpoint = '/api/phase-templates';
        } else if (state.ui.templateType === 'agent') {
          endpoint = '/api/agent-templates';
        } else {
          endpoint = '/api/pov-templates';
        }
      }
      
      const method = state.data.id ? 'PUT' : 'POST';
      
      // Transform data structure for different template types
      let dataToSend: any = state.data;
      if (state.ui.templateType === 'pov') {
        // Convert template editor structure to POV template structure
        dataToSend = {
          id: state.data.id,
          name: state.data.name,
          description: state.data.description,
          version: state.data.version,
          status: 'draft',
          fields: state.data.fields || {},
          sections: state.data.sections || [],
          metadata: {
            phaseTemplates: state.data.phaseTemplateIds || [], // Map phaseTemplateIds to metadata.phaseTemplates
            tags: state.data.tags || []
          }
        };
      } else if (state.ui.templateType === 'agent') {
        // Send agent template data directly without transformation
        const agentData = state.data as any;
        
        dataToSend = {
          id: agentData.id,
          name: agentData.name,
          description: agentData.description,
          version: agentData.version || '1.0.0',
          status: 'ACTIVE',
          category: agentData.category || 'GENERAL',
          defaultRole: agentData.defaultRole || '',
          promptTemplate: agentData.promptTemplate || '',
          capabilities: agentData.capabilities || {},
          constraints: agentData.constraints || {},
          timeout: agentData.timeout || 300,
          maxRetries: agentData.maxRetries || 3,
          priority: agentData.priority || 'MEDIUM',
          tags: agentData.tags || [],
          metadata: agentData.metadata || {}
        };
      }
      
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save template: ${response.statusText}`);
      }
      
      const savedTemplate = await response.json();
      
      // Update state with saved template data
      if (savedTemplate.id) {
        dispatch({ 
          type: 'SET_FIELD', 
          path: ['id'], 
          value: savedTemplate.id 
        });
      }
      dispatch({ type: 'MARK_CLEAN' });
      
      return true;
    } catch {
      dispatch({
        type: 'ADD_VALIDATION_ERROR',
        field: 'general',
        error: 'Failed to save template'
      });
      return false;
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }, [state.data, state.ui.templateType, onSave]);

  const validateTemplate = useCallback(async (): Promise<boolean> => {
    try {
      // Use custom validation handler if provided
      if (onValidate) {
        const result = await onValidate(state.data);
        dispatch({ type: 'SET_VALIDATION_ERRORS', errors: result.errors });
        return result.isValid;
      }
      
      // Default validation logic
      const errors: Record<string, string[]> = {};
      
      // Basic validation
      if (!state.data.name.trim()) {
        errors.name = ['Template name is required'];
      }
      
      if (!state.data.description.trim()) {
        errors.description = ['Template description is required'];
      }
      
      // Template type specific validation
      if (state.ui.templateType === 'pov') {
        if (!state.data.fields || Object.keys(state.data.fields).length === 0) {
          errors.fields = ['At least one field is required for POV templates'];
        }
      } else if (state.ui.templateType === 'phase') {
        if (!state.data.phases || Object.keys(state.data.phases).length === 0) {
          errors.phases = ['At least one phase is required for phase templates'];
        }
      } else if (state.ui.templateType === 'agent') {
        // Validate required fields for agent templates
        const data = state.data as any;
        
        if (!data.defaultRole) {
          errors.defaultRole = ['Default role is required'];
        }
        
        if (!data.promptTemplate) {
          errors.promptTemplate = ['Prompt template is required'];
        }
      }
      
      dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
      return Object.keys(errors).length === 0;
    } catch {
      dispatch({
        type: 'ADD_VALIDATION_ERROR',
        field: 'general',
        error: 'Validation failed'
      });
      return false;
    }
  }, [state.data, state.ui.templateType, onValidate]);

  // Action Creators
  const actions: TemplateActionCreators = useMemo(() => ({
    // Field operations
    setField: (path: string[], value: any) => {
      dispatch({ type: 'SET_FIELD', path, value });
    },
    updateField: (fieldId: string, field: Partial<FieldDefinition>) => {
      dispatch({ type: 'UPDATE_FIELD', fieldId, field });
    },
    addField: (fieldId: string, field: FieldDefinition) => {
      dispatch({ type: 'ADD_FIELD', fieldId, field });
    },
    removeField: (fieldId: string) => {
      dispatch({ type: 'REMOVE_FIELD', fieldId });
    },
    
    // Section operations
    updateSection: (sectionIndex: number, section: Partial<SectionDefinition>) => {
      dispatch({ type: 'UPDATE_SECTION', sectionIndex, section });
    },
    addSection: (section: SectionDefinition) => {
      dispatch({ type: 'ADD_SECTION', section });
    },
    removeSection: (sectionIndex: number) => {
      dispatch({ type: 'REMOVE_SECTION', sectionIndex });
    },
    reorderSections: (fromIndex: number, toIndex: number) => {
      dispatch({ type: 'REORDER_SECTIONS', fromIndex, toIndex });
    },
    
    // Phase operations
    addPhase: (phase: Phase) => {
      dispatch({ type: 'ADD_PHASE', phase });
    },
    updatePhase: (phaseId: string, updates: Partial<Phase>) => {
      dispatch({ type: 'UPDATE_PHASE', phaseId, updates });
    },
    removePhase: (phaseId: string) => {
      dispatch({ type: 'REMOVE_PHASE', phaseId });
    },
    reorderPhases: (phaseIds: string[]) => {
      dispatch({ type: 'REORDER_PHASES', phaseIds });
    },
    
    // Stage operations
    addStage: (stage: Stage) => {
      dispatch({ type: 'ADD_STAGE', stage });
    },
    updateStage: (stageId: string, updates: Partial<Stage>) => {
      dispatch({ type: 'UPDATE_STAGE', stageId, updates });
    },
    removeStage: (stageId: string) => {
      dispatch({ type: 'REMOVE_STAGE', stageId });
    },
    reorderStages: (phaseId: string, stageIds: string[]) => {
      dispatch({ type: 'REORDER_STAGES', phaseId, stageIds });
    },
    
    // Task operations
    addTask: (task: Task) => {
      dispatch({ type: 'ADD_TASK', task });
    },
    updateTask: (taskId: string, updates: Partial<Task>) => {
      dispatch({ type: 'UPDATE_TASK', taskId, updates });
    },
    removeTask: (taskId: string) => {
      dispatch({ type: 'REMOVE_TASK', taskId });
    },
    reorderTasks: (stageId: string, taskIds: string[]) => {
      dispatch({ type: 'REORDER_TASKS', stageId, taskIds });
    },
    
    // UI operations
    setActiveTab: (tab: string) => {
      dispatch({ type: 'SET_ACTIVE_TAB', tab });
    },
    setSelectedPhase: (phaseId: string | null) => {
      dispatch({ type: 'SET_SELECTED_PHASE', phaseId });
    },
    setSelectedStage: (stageId: string | null) => {
      dispatch({ type: 'SET_SELECTED_STAGE', stageId });
    },
    setSelectedTask: (taskId: string | null) => {
      dispatch({ type: 'SET_SELECTED_TASK', taskId });
    },
    setPreviewMode: (showPreview: boolean) => {
      dispatch({ type: 'SET_PREVIEW_MODE', showPreview });
    },
    setDesignMode: (designMode: 'visual' | 'code') => {
      dispatch({ type: 'SET_DESIGN_MODE', designMode });
    },
    
    // Validation operations
    setValidationErrors: (errors: Record<string, string[]>) => {
      dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
    },
    clearValidationErrors: () => {
      dispatch({ type: 'CLEAR_VALIDATION_ERRORS' });
    },
    addValidationError: (field: string, error: string) => {
      dispatch({ type: 'ADD_VALIDATION_ERROR', field, error });
    },
    removeValidationError: (field: string) => {
      dispatch({ type: 'REMOVE_VALIDATION_ERROR', field });
    },
    
    // State operations
    markDirty: (fieldPaths?: string[]) => {
      dispatch({ type: 'MARK_DIRTY', fieldPaths });
    },
    markClean: () => {
      dispatch({ type: 'MARK_CLEAN' });
    },
    setSubmitting: (isSubmitting: boolean) => {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting });
    },
    setValid: (isValid: boolean) => {
      dispatch({ type: 'SET_VALID', isValid });
    },
    
    // Template lifecycle
    initializeTemplate: (template: Partial<TemplateEditorState>) => {
      dispatch({ type: 'INITIALIZE_TEMPLATE', template });
    },
    resetTemplate: () => {
      dispatch({ type: 'RESET_TEMPLATE' });
    },
    duplicateTemplate: (sourceTemplate: TemplateEditorState) => {
      dispatch({ type: 'DUPLICATE_TEMPLATE', sourceTemplate });
    },
    
    // Bulk operations
    bulkUpdateFields: (fields: Record<string, FieldDefinition>) => {
      dispatch({ type: 'BULK_UPDATE_FIELDS', fields });
    },
    bulkUpdateSections: (sections: SectionDefinition[]) => {
      dispatch({ type: 'BULK_UPDATE_SECTIONS', sections });
    },
    bulkUpdatePhases: (phases: Record<string, Phase>) => {
      dispatch({ type: 'BULK_UPDATE_PHASES', phases });
    },
    
    // Import/Export
    importTemplateData: (data: any) => {
      dispatch({ type: 'IMPORT_TEMPLATE_DATA', data });
    },
    exportTemplateData: () => {
      dispatch({ type: 'EXPORT_TEMPLATE_DATA' });
    },
  }), []);

  // Utility functions
  const getFieldValue = useCallback((path: string[]): any => {
    let current: any = state.data;
    for (const key of path) {
      if (current && typeof current === 'object') {
        current = current[key];
      } else {
        return undefined;
      }
    }
    return current;
  }, [state.data]);

  const setFieldValue = useCallback((path: string[], value: any) => {
    dispatch({ type: 'SET_FIELD', path, value });
  }, []);

  const resetTemplate = useCallback(() => {
    dispatch({ type: 'RESET_TEMPLATE' });
  }, []);

  // Computed values
  const isLoading = state.ui.isSubmitting;
  const hasUnsavedChanges = state.meta.isDirty;
  const canSave = state.meta.isValid && !state.ui.isSubmitting && state.meta.isDirty;

  // Context value
  const contextValue: TemplateEditorContextValue = useMemo(() => ({
    state,
    actions,
    isLoading,
    hasUnsavedChanges,
    canSave,
    getFieldValue,
    setFieldValue,
    validateTemplate,
    saveTemplate,
    resetTemplate,
  }), [
    state,
    actions,
    isLoading,
    hasUnsavedChanges,
    canSave,
    getFieldValue,
    setFieldValue,
    validateTemplate,
    saveTemplate,
    resetTemplate,
  ]);

  return (
    <TemplateEditorContext.Provider value={contextValue}>
      {children}
    </TemplateEditorContext.Provider>
  );
}
