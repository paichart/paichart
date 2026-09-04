import { TemplateEditorState } from '../types/TemplateEditorState';
import { normalizeApiToEditorState } from '../utils/normalizer';

/**
 * Initial state for the template editor
 */
export const initialTemplateState: TemplateEditorState = {
  data: {
    name: '',
    description: '',
    type: 'pov',
    
    // POV Template fields (initialized for POV type)
    fields: {},
    sections: [],
    
    // Phase Template fields (will be initialized when switching to phase type)
    phases: undefined,
    stages: undefined,
    tasks: undefined,
    workflow: undefined,
    
    // Agent Template fields (future)
    agentConfig: undefined,
    
    // Common metadata
    tags: [],
    version: '1.0.0',
  },
  
  ui: {
    activeTab: 'basic-info',
    templateType: 'pov',
    dirtyFields: [],
    validationErrors: {},
    isSubmitting: false,
    
    // Template type specific UI state
    selectedPhaseId: null,
    selectedStageId: null,
    selectedTaskId: null,
    
    // Preview and design state
    showPreview: false,
    designMode: 'visual',
  },
  
  // Relationships (will be initialized when switching to phase type)
  relationships: undefined,
  
  meta: {
    lastSaved: null,
    isDirty: false,
    isValid: true,
    saveCount: 0,
  },
};

/**
 * Create initial state for a specific template type
 */
export function createInitialStateForType(templateType: 'pov' | 'phase' | 'agent'): TemplateEditorState {
  // Deep copy to avoid mutating the original state
  const baseState: TemplateEditorState = {
    data: {
      ...initialTemplateState.data,
      type: templateType,
    },
    ui: {
      ...initialTemplateState.ui,
      templateType: templateType,
    },
    relationships: initialTemplateState.relationships,
    meta: {
      ...initialTemplateState.meta,
    },
  };
  
  // Initialize type-specific data
  switch (templateType) {
    case 'pov':
      baseState.data.fields = {};
      baseState.data.sections = [];
      baseState.data.phases = undefined;
      baseState.data.stages = undefined;
      baseState.data.tasks = undefined;
      baseState.data.workflow = undefined;
      baseState.relationships = undefined;
      break;
      
    case 'phase':
      baseState.data.fields = undefined;
      baseState.data.sections = undefined;
      baseState.data.phases = {};
      baseState.data.stages = {};
      baseState.data.tasks = {};
      baseState.data.workflow = {};
      baseState.relationships = {
        phaseOrder: [],
        phaseToStages: {},
        stageToTasks: {},
      };
      break;
      
    case 'agent':
      // Future implementation
      baseState.data.fields = undefined;
      baseState.data.sections = undefined;
      baseState.data.phases = undefined;
      baseState.data.stages = undefined;
      baseState.data.tasks = undefined;
      baseState.data.workflow = undefined;
      baseState.data.agentConfig = {};
      baseState.relationships = undefined;
      break;
  }
  
  return baseState;
}

/**
 * Create initial state from existing template data
 */
export function createStateFromTemplate(templateData: any): TemplateEditorState {
  // Detect template type from API data structure
  let templateType: 'pov' | 'phase' | 'agent';
  
  // Agent templates have specific fields like defaultRole, category, capabilities
  if (templateData.defaultRole || templateData.category || templateData.capabilities || templateData.constraints) {
    templateType = 'agent';
  }
  // Phase templates have stages array
  else if (templateData.stages || templateData.workflow) {
    templateType = 'phase';
  }
  // POV templates have fields object
  else if (templateData.fields || templateData.sections) {
    templateType = 'pov';
  }
  // Fallback: check explicit type field
  else {
    const apiType = templateData.type || 'pov';
    switch (apiType.toLowerCase()) {
      case 'planning':
      case 'phase':
        templateType = 'phase';
        break;
      case 'agent':
        templateType = 'agent';
        break;
      case 'pov':
      default:
        templateType = 'pov';
        break;
    }
  }

  // Use the normalizer to properly transform API data to editor state
  const normalizedState = normalizeApiToEditorState(templateData, templateType, templateData.id);
  
  // Ensure the template type is correctly set after normalization
  normalizedState.ui.templateType = templateType;
  normalizedState.data.type = templateType;

  return normalizedState;
}

/**
 * Reset state to initial values while preserving template type
 */
export function resetStateForType(currentState: TemplateEditorState): TemplateEditorState {
  return createInitialStateForType(currentState.ui.templateType);
}
