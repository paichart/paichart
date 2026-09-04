/**
 * Template Editor Data Normalizer
 * Provides data transformation utilities between API and UI formats
 */

import { TemplateType, TemplateEditorState } from '../types/TemplateEditorState';
import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';

/**
 * Normalize API response to template editor state
 */
export function normalizeApiToEditorState(
  apiData: any, 
  templateType: TemplateType,
  templateId?: string
): TemplateEditorState {
  const baseState: TemplateEditorState = {
    data: {
      id: templateId || apiData.id,
      name: apiData.name || '',
      description: apiData.description || '',
      type: templateType,
      tags: apiData.tags || apiData.metadata?.tags || [],
      version: apiData.version || '1.0.0',
      createdAt: apiData.createdAt,
      updatedAt: apiData.updatedAt,
    },
    ui: {
      activeTab: 'basic-info',
      templateType,
      dirtyFields: [],
      validationErrors: {},
      isSubmitting: false,
      showPreview: false,
      designMode: 'visual',
    },
    meta: {
      lastSaved: apiData.updatedAt || null,
      isDirty: false,
      isValid: true,
      saveCount: 0,
    },
  };

  // Type-specific normalization
  if (templateType === 'pov') {
    baseState.data.fields = normalizePovFields(apiData.fields || {});
    baseState.data.sections = normalizePovSections(apiData.sections || []);
    // Map metadata.phaseTemplates to phaseTemplateIds for editor state
    baseState.data.phaseTemplateIds = apiData.metadata?.phaseTemplates || [];
  } else if (templateType === 'phase') {
    const normalizedPhaseData = normalizePhaseTemplate(apiData);
    baseState.data.phases = normalizedPhaseData.phases;
    baseState.data.stages = normalizedPhaseData.stages;
    baseState.data.tasks = normalizedPhaseData.tasks;
    baseState.data.workflow = normalizedPhaseData.workflow;
    baseState.relationships = normalizedPhaseData.relationships;
  } else if (templateType === 'agent') {
    // Store agent template data at root level
    Object.assign(baseState.data, {
      defaultRole: apiData.defaultRole,
      category: apiData.category,
      priority: apiData.priority,
      capabilities: apiData.capabilities,
      constraints: apiData.constraints,
      timeout: apiData.timeout,
      maxRetries: apiData.maxRetries,
      tags: apiData.tags,
      promptTemplate: apiData.promptTemplate,
      metadata: apiData.metadata
    });
  }

  return baseState;
}

/**
 * Normalize template editor state to API format
 */
export function normalizeEditorStateToApi(
  state: TemplateEditorState
): any {
  const baseData = {
    id: state.data.id,
    name: state.data.name,
    description: state.data.description,
    type: state.data.type,
    tags: state.data.tags,
    version: state.data.version,
    metadata: {
      tags: state.data.tags,
    },
  };

  // Type-specific normalization
  if (state.data.type === 'pov') {
    return {
      ...baseData,
      fields: state.data.fields || {},
      sections: state.data.sections || [],
    };
  } else if (state.data.type === 'phase') {
    return {
      ...baseData,
      stages: normalizePhaseDataToApi(state),
      workflow: state.data.workflow,
    };
  }

  return baseData;
}

/**
 * Normalize POV fields from API format
 */
function normalizePovFields(apiFields: any): Record<string, FieldDefinition> {
  if (!apiFields || typeof apiFields !== 'object') {
    return {};
  }

  // If it's already in the correct format, return as-is
  if (typeof apiFields === 'object' && !Array.isArray(apiFields)) {
    return apiFields;
  }

  // If it's an array, convert to object with field IDs as keys
  if (Array.isArray(apiFields)) {
    const fieldsObject: Record<string, FieldDefinition> = {};
    apiFields.forEach((field, index) => {
      const fieldId = field.id || `field_${index}`;
      fieldsObject[fieldId] = {
        type: field.type || 'text',
        label: field.label || field.name || '',
        description: field.description,
        placeholder: field.placeholder,
        required: field.required || false,
        validation: field.validation,
        conditional: field.conditional,
        ui: field.ui,
      };
    });
    return fieldsObject;
  }

  return {};
}

/**
 * Normalize POV sections from API format
 */
function normalizePovSections(apiSections: any): SectionDefinition[] {
  if (!Array.isArray(apiSections)) {
    return [];
  }

  return apiSections.map((section, index) => ({
    id: section.id || `section_${index}`,
    title: section.title || section.name || '',
    description: section.description,
    fields: Array.isArray(section.fields) ? section.fields : (section.fieldIds || []),
    conditional: section.conditional,
    ui: section.ui,
  }));
}

/**
 * Normalize phase template from API format
 */
function normalizePhaseTemplate(apiData: any): {
  phases: Record<string, any>;
  stages: Record<string, any>;
  tasks: Record<string, any>;
  workflow: any;
  relationships: any;
} {
  const phases: Record<string, any> = {};
  const stages: Record<string, any> = {};
  const tasks: Record<string, any> = {};
  const phaseOrder: string[] = [];
  const phaseToStages: Record<string, string[]> = {};
  const stageToTasks: Record<string, string[]> = {};

  // Handle different API response formats
  let stagesData = apiData.stages || [];
  
  // If workflow exists and has stages, use that
  if (apiData.workflow && apiData.workflow.stages) {
    stagesData = apiData.workflow.stages;
  }

  // If stages is a string (JSON), parse it
  if (typeof stagesData === 'string') {
    try {
      stagesData = JSON.parse(stagesData);
    } catch {
      // Could not parse stages data
      stagesData = [];
    }
  }

  // Create a default phase if none exists
  const defaultPhaseId = 'phase_1';
  phases[defaultPhaseId] = {
    id: defaultPhaseId,
    name: apiData.name || 'Default Phase',
    description: apiData.description || '',
    type: apiData.type || 'PLANNING',
    order: 0,
  };
  phaseOrder.push(defaultPhaseId);
  phaseToStages[defaultPhaseId] = [];

  // Process stages
  if (Array.isArray(stagesData)) {
    stagesData.forEach((stageData, stageIndex) => {
      const stageId = stageData.id || `stage_${stageIndex}`;
      
      stages[stageId] = {
        id: stageId,
        name: stageData.name || `Stage ${stageIndex + 1}`,
        description: stageData.description || '',
        order: stageData.order !== undefined ? stageData.order : stageIndex,
        phaseId: defaultPhaseId,
        status: stageData.status || 'PENDING',
        metadata: stageData.metadata,
      };

      phaseToStages[defaultPhaseId].push(stageId);
      stageToTasks[stageId] = [];

      // Process tasks
      if (Array.isArray(stageData.tasks)) {
        stageData.tasks.forEach((taskData: any, taskIndex: number) => {
          const taskId = taskData.id || `task_${stageIndex}_${taskIndex}`;
          
          tasks[taskId] = {
            id: taskId,
            title: taskData.title || taskData.name || `Task ${taskIndex + 1}`,
            description: taskData.description || '',
            priority: taskData.priority || 'MEDIUM',
            type: taskData.type || 'ACTION',
            stageId: stageId,
            metadata: {
              dependencies: taskData.dependencies || [],
              ...taskData.metadata,
            },
          };

          stageToTasks[stageId].push(taskId);
        });
      }
    });
  }

  return {
    phases,
    stages,
    tasks,
    workflow: {
      stages: stagesData,
    },
    relationships: {
      phaseOrder,
      phaseToStages,
      stageToTasks,
    },
  };
}

// REMOVED: normalizeAgentTemplate function is no longer needed
// Agent template data is now stored directly at root level without transformation

/**
 * Normalize phase data back to API format
 */
function normalizePhaseDataToApi(state: TemplateEditorState): any[] {
  const stages: any[] = [];
  
  if (!state.relationships || !state.data.stages || !state.data.tasks) {
    return stages;
  }

  // Get stages in order
  const phaseIds = state.relationships.phaseOrder || [];
  
  phaseIds.forEach(phaseId => {
    const stageIds = state.relationships?.phaseToStages[phaseId] || [];
    
    stageIds.forEach(stageId => {
      const stage = state.data.stages![stageId];
      if (!stage) return;

      const taskIds = state.relationships?.stageToTasks[stageId] || [];
      const tasks = taskIds.map(taskId => {
        const task = state.data.tasks![taskId];
        if (!task) return null;

        return {
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          type: task.type,
          dependencies: task.metadata?.dependencies || [],
          metadata: task.metadata,
        };
      }).filter(Boolean);

      stages.push({
        id: stage.id,
        name: stage.name,
        description: stage.description,
        order: stage.order,
        status: stage.status,
        metadata: stage.metadata,
        tasks,
      });
    });
  });

  return stages;
}

/**
 * Normalize template list from API
 */
export function normalizeTemplateList(apiTemplates: any[], templateType: TemplateType): any[] {
  if (!Array.isArray(apiTemplates)) {
    return [];
  }

  return apiTemplates.map(template => ({
    id: template.id,
    name: template.name,
    description: template.description,
    type: templateType,
    tags: template.tags || template.metadata?.tags || [],
    version: template.version || '1.0.0',
    isDefault: template.isDefault || false,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    // Type-specific fields
    ...(templateType === 'pov' && {
      fieldCount: template.fields ? Object.keys(template.fields).length : 0,
      sectionCount: template.sections ? template.sections.length : 0,
    }),
    ...(templateType === 'phase' && {
      stageCount: template.stages ? template.stages.length : 0,
      taskCount: template.stages ? 
        template.stages.reduce((total: number, stage: any) => 
          total + (stage.tasks ? stage.tasks.length : 0), 0) : 0,
    }),
  }));
}

/**
 * Create empty template data for new templates
 */
export function createEmptyTemplateData(templateType: TemplateType): any {
  const baseData = {
    name: '',
    description: '',
    type: templateType,
    tags: [],
    version: '1.0.0',
  };

  if (templateType === 'pov') {
    return {
      ...baseData,
      fields: {},
      sections: [],
    };
  } else if (templateType === 'phase') {
    return {
      ...baseData,
      stages: [],
      workflow: { stages: [] },
    };
  }

  return baseData;
}

/**
 * Deep clone template data
 */
export function cloneTemplateData(templateData: any): any {
  return JSON.parse(JSON.stringify(templateData));
}

/**
 * Merge template data updates
 */
export function mergeTemplateData(existing: any, updates: any): any {
  return {
    ...existing,
    ...updates,
    // Preserve nested objects
    metadata: {
      ...existing.metadata,
      ...updates.metadata,
    },
  };
}

/**
 * Extract template metadata for display
 */
export function extractTemplateMetadata(templateData: any, templateType: TemplateType): {
  summary: string;
  stats: Record<string, number>;
  lastModified: string | null;
} {
  const stats: Record<string, number> = {};
  
  if (templateType === 'pov') {
    stats.fields = templateData.fields ? Object.keys(templateData.fields).length : 0;
    stats.sections = templateData.sections ? templateData.sections.length : 0;
  } else if (templateType === 'phase') {
    stats.stages = templateData.stages ? templateData.stages.length : 0;
    stats.tasks = templateData.stages ? 
      templateData.stages.reduce((total: number, stage: any) => 
        total + (stage.tasks ? stage.tasks.length : 0), 0) : 0;
  }

  const summary = templateType === 'pov' 
    ? `${stats.fields} fields in ${stats.sections} sections`
    : `${stats.stages} stages with ${stats.tasks} tasks`;

  return {
    summary,
    stats,
    lastModified: templateData.updatedAt || null,
  };
}
