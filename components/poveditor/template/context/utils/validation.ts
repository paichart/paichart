/**
 * Template Editor Validation Utilities
 * Provides validation functions for template data
 */

import { TemplateType, TemplateEditorState } from '../types/TemplateEditorState';
import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';

/**
 * Validation Result Types
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  warnings?: Record<string, string[]>;
}

export interface FieldValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Basic Template Validation
 */
export function validateBasicInfo(templateData: any): ValidationResult {
  const errors: Record<string, string[]> = {};

  // Name validation
  if (!templateData.name || !templateData.name.trim()) {
    errors.name = ['Template name is required'];
  } else if (templateData.name.length < 3) {
    errors.name = ['Template name must be at least 3 characters long'];
  } else if (templateData.name.length > 100) {
    errors.name = ['Template name must be less than 100 characters'];
  }

  // Description validation
  if (!templateData.description || !templateData.description.trim()) {
    errors.description = ['Template description is required'];
  } else if (templateData.description.length < 10) {
    errors.description = ['Template description must be at least 10 characters long'];
  } else if (templateData.description.length > 500) {
    errors.description = ['Template description must be less than 500 characters'];
  }

  // Version validation
  if (templateData.version && !/^\d+\.\d+\.\d+$/.test(templateData.version)) {
    errors.version = ['Version must be in format x.y.z (e.g., 1.0.0)'];
  }

  // Tags validation
  if (templateData.tags && templateData.tags.length > 10) {
    errors.tags = ['Maximum 10 tags allowed'];
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * POV Template Validation
 */
export function validatePovTemplate(templateData: any): ValidationResult {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};

  // Basic info validation
  const basicValidation = validateBasicInfo(templateData);
  Object.assign(errors, basicValidation.errors);

  // Fields validation
  if (!templateData.fields || Object.keys(templateData.fields).length === 0) {
    errors.fields = ['At least one field is required for POV templates'];
  } else {
    const fieldValidation = validatePovFields(templateData.fields);
    if (!fieldValidation.isValid) {
      Object.assign(errors, fieldValidation.errors);
    }
  }

  // Sections validation
  if (!templateData.sections || templateData.sections.length === 0) {
    warnings.sections = ['Consider organizing fields into sections for better user experience'];
  } else {
    const sectionValidation = validatePovSections(templateData.sections, templateData.fields || {});
    if (!sectionValidation.isValid) {
      Object.assign(errors, sectionValidation.errors);
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
}

/**
 * Phase Template Validation
 */
export function validatePhaseTemplate(templateData: any): ValidationResult {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};

  // Basic info validation
  const basicValidation = validateBasicInfo(templateData);
  Object.assign(errors, basicValidation.errors);

  // Phases validation (for phase templates, we expect stages array)
  if (!templateData.stages || templateData.stages.length === 0) {
    errors.phases = ['At least one stage is required for phase templates'];
  } else {
    const stageValidation = validatePhaseStages(templateData.stages);
    if (!stageValidation.isValid) {
      Object.assign(errors, stageValidation.errors);
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
}

/**
 * POV Field Validation
 */
export function validatePovFields(fields: Record<string, FieldDefinition>): ValidationResult {
  const errors: Record<string, string[]> = {};
  const fieldNames = new Set<string>();

  Object.entries(fields).forEach(([fieldId, field], index) => {
    const fieldErrors: string[] = [];

    // Required field validation
    if (!field.label || !field.label.trim()) {
      fieldErrors.push('Field label is required');
    } else if (fieldNames.has(field.label)) {
      fieldErrors.push('Field label must be unique');
    } else {
      fieldNames.add(field.label);
    }

    // Type validation
    const validTypes = ['text', 'textarea', 'number', 'date', 'boolean', 'select', 'multiselect', 'email', 'phone', 'url', 'currency'];
    if (!field.type || !validTypes.includes(field.type)) {
      fieldErrors.push(`Invalid field type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Options validation for select fields
    if (['select', 'multiselect'].includes(field.type)) {
      if (!field.validation?.options || field.validation.options.length === 0) {
        fieldErrors.push('Options are required for select fields');
      } else {
        const optionValues = new Set<string>();
        field.validation.options.forEach((option: any, optionIndex: number) => {
          if (!option.value || !option.value.trim()) {
            fieldErrors.push(`Option ${optionIndex + 1} value is required`);
          } else if (optionValues.has(option.value)) {
            fieldErrors.push(`Option values must be unique (duplicate: ${option.value})`);
          } else {
            optionValues.add(option.value);
          }

          if (!option.label || !option.label.trim()) {
            fieldErrors.push(`Option ${optionIndex + 1} label is required`);
          }
        });
      }
    }

    // Validation rules
    if (field.validation) {
      if (field.validation.min !== undefined && field.validation.min < 0) {
        fieldErrors.push('Minimum value cannot be negative');
      }
      if (field.validation.max !== undefined && field.validation.max < 0) {
        fieldErrors.push('Maximum value cannot be negative');
      }
      if (field.validation.min !== undefined && field.validation.max !== undefined && 
          field.validation.min > field.validation.max) {
        fieldErrors.push('Minimum value cannot be greater than maximum value');
      }
    }

    if (fieldErrors.length > 0) {
      errors[`field_${fieldId}`] = fieldErrors;
    }
  });

  // General validation
  const fieldCount = Object.keys(fields).length;
  if (fieldCount === 0) {
    errors.general = ['At least one field is required'];
  } else if (fieldCount > 50) {
    errors.general = ['Maximum 50 fields allowed per template'];
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * POV Section Validation
 */
export function validatePovSections(sections: SectionDefinition[], fields: Record<string, FieldDefinition>): ValidationResult {
  const errors: Record<string, string[]> = {};
  const sectionTitles = new Set<string>();
  const assignedFieldIds = new Set<string>();

  sections.forEach((section, index) => {
    const sectionErrors: string[] = [];

    // Title validation
    if (!section.title || !section.title.trim()) {
      sectionErrors.push('Section title is required');
    } else if (sectionTitles.has(section.title)) {
      sectionErrors.push('Section title must be unique');
    } else {
      sectionTitles.add(section.title);
    }

    // Field assignment validation
    if (!section.fields || section.fields.length === 0) {
      sectionErrors.push('Section must contain at least one field');
    } else {
      section.fields.forEach((fieldId: string) => {
        if (assignedFieldIds.has(fieldId)) {
          sectionErrors.push(`Field ${fieldId} is assigned to multiple sections`);
        } else {
          assignedFieldIds.add(fieldId);
        }

        // Check if field exists
        if (!fields[fieldId]) {
          sectionErrors.push(`Field ${fieldId} does not exist`);
        }
      });
    }

    if (sectionErrors.length > 0) {
      errors[`section_${index}`] = sectionErrors;
    }
  });

  // Check for unassigned fields
  const fieldIds = Object.keys(fields);
  const unassignedFields = fieldIds.filter(fieldId => !assignedFieldIds.has(fieldId));
  if (unassignedFields.length > 0) {
    errors.general = [`${unassignedFields.length} field(s) are not assigned to any section`];
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Phase Stage Validation
 */
export function validatePhaseStages(stages: any[]): ValidationResult {
  const errors: Record<string, string[]> = {};
  const stageNames = new Set<string>();

  stages.forEach((stage, index) => {
    const stageErrors: string[] = [];

    // Name validation
    if (!stage.name || !stage.name.trim()) {
      stageErrors.push('Stage name is required');
    } else if (stageNames.has(stage.name)) {
      stageErrors.push('Stage name must be unique');
    } else {
      stageNames.add(stage.name);
    }

    // Tasks validation
    if (!stage.tasks || stage.tasks.length === 0) {
      stageErrors.push('Stage must contain at least one task');
    } else {
      const taskValidation = validatePhaseTasks(stage.tasks);
      if (!taskValidation.isValid) {
        Object.assign(stageErrors, taskValidation.errors.general || []);
      }
    }

    if (stageErrors.length > 0) {
      errors[`stage_${index}`] = stageErrors;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Phase Task Validation
 */
export function validatePhaseTasks(tasks: any[]): ValidationResult {
  const errors: Record<string, string[]> = {};
  const taskTitles = new Set<string>();

  tasks.forEach((task, index) => {
    const taskErrors: string[] = [];

    // Title validation
    if (!task.title || !task.title.trim()) {
      taskErrors.push('Task title is required');
    } else if (taskTitles.has(task.title)) {
      taskErrors.push('Task title must be unique within stage');
    } else {
      taskTitles.add(task.title);
    }

    // Type validation
    const validTypes = ['ACTION', 'REVIEW', 'APPROVAL', 'MILESTONE'];
    if (!task.type || !validTypes.includes(task.type)) {
      taskErrors.push(`Invalid task type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Priority validation
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!task.priority || !validPriorities.includes(task.priority)) {
      taskErrors.push(`Invalid task priority. Must be one of: ${validPriorities.join(', ')}`);
    }

    if (taskErrors.length > 0) {
      errors[`task_${index}`] = taskErrors;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Unified Template Validation
 */
export function validateTemplate(templateData: any, templateType: TemplateType): ValidationResult {
  switch (templateType) {
    case 'pov':
      return validatePovTemplate(templateData);
    case 'phase':
      return validatePhaseTemplate(templateData);
    default:
      return {
        isValid: false,
        errors: { general: [`Unsupported template type: ${templateType}`] }
      };
  }
}

/**
 * Field Type Validation
 */
export function validateFieldType(fieldType: string, value: any): FieldValidationResult {
  const errors: string[] = [];

  switch (fieldType) {
    case 'text':
    case 'textarea':
      if (value !== undefined && typeof value !== 'string') {
        errors.push('Value must be a string');
      }
      break;

    case 'number':
      if (value !== undefined && (typeof value !== 'number' || isNaN(value))) {
        errors.push('Value must be a valid number');
      }
      break;

    case 'date':
      if (value !== undefined && !(value instanceof Date) && !Date.parse(value)) {
        errors.push('Value must be a valid date');
      }
      break;

    case 'email':
      if (value !== undefined && typeof value === 'string') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push('Value must be a valid email address');
        }
      }
      break;

    case 'url':
      if (value !== undefined && typeof value === 'string') {
        try {
          new URL(value);
        } catch {
          errors.push('Value must be a valid URL');
        }
      }
      break;

    case 'select':
      // Value should be a string that matches one of the field options
      if (value !== undefined && typeof value !== 'string') {
        errors.push('Value must be a string');
      }
      break;

    case 'multiselect':
      // Value should be an array of strings
      if (value !== undefined && (!Array.isArray(value) || !value.every(v => typeof v === 'string'))) {
        errors.push('Value must be an array of strings');
      }
      break;

    case 'boolean':
      if (value !== undefined && typeof value !== 'boolean') {
        errors.push('Value must be a boolean');
      }
      break;

    default:
      errors.push(`Unknown field type: ${fieldType}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Template Completeness Check
 */
export function checkTemplateCompleteness(templateData: any, templateType: TemplateType): {
  isComplete: boolean;
  missingRequirements: string[];
  completionPercentage: number;
} {
  const requirements: string[] = [];
  const missingRequirements: string[] = [];

  // Basic requirements
  requirements.push('name', 'description');
  if (!templateData.name?.trim()) missingRequirements.push('Template name');
  if (!templateData.description?.trim()) missingRequirements.push('Template description');

  // Type-specific requirements
  if (templateType === 'pov') {
    requirements.push('fields');
    if (!templateData.fields || Object.keys(templateData.fields).length === 0) {
      missingRequirements.push('At least one field');
    }
  } else if (templateType === 'phase') {
    requirements.push('stages');
    if (!templateData.stages || templateData.stages.length === 0) {
      missingRequirements.push('At least one stage');
    }
  }

  const completionPercentage = Math.round(
    ((requirements.length - missingRequirements.length) / requirements.length) * 100
  );

  return {
    isComplete: missingRequirements.length === 0,
    missingRequirements,
    completionPercentage
  };
}

/**
 * Validate Template Editor State
 */
export function validateTemplateEditorState(state: TemplateEditorState): ValidationResult {
  return validateTemplate(state.data, state.data.type);
}

/**
 * Enhanced Phase Hierarchy Validation
 * Validates the complete phase/stage/task hierarchy for phase templates
 */
export function validatePhaseHierarchy(phases: any, stages: any, tasks: any): ValidationResult {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};

  if (!phases || Object.keys(phases).length === 0) {
    errors.phases = ['At least one phase is required'];
    return { isValid: false, errors, warnings };
  }

  const phaseIds = Object.keys(phases);
  const stageIds = stages ? Object.keys(stages) : [];
  const taskIds = tasks ? Object.keys(tasks) : [];

  // Validate each phase
  phaseIds.forEach(phaseId => {
    const phase = phases[phaseId];
    const phaseErrors: string[] = [];

    if (!phase.name?.trim()) {
      phaseErrors.push('Phase name is required');
    }

    if (!phase.type || !['PLANNING', 'EXECUTION', 'REVIEW'].includes(phase.type)) {
      phaseErrors.push('Invalid phase type');
    }

    if (phaseErrors.length > 0) {
      errors[`phase_${phaseId}`] = phaseErrors;
    }
  });

  // Validate stage-phase relationships
  if (stages) {
    stageIds.forEach(stageId => {
      const stage = stages[stageId];
      if (stage.phaseId && !phaseIds.includes(stage.phaseId)) {
        errors[`stage_${stageId}`] = ['Stage references non-existent phase'];
      }
    });
  }

  // Validate task-stage relationships
  if (tasks) {
    taskIds.forEach(taskId => {
      const task = tasks[taskId];
      if (task.stageId && !stageIds.includes(task.stageId)) {
        errors[`task_${taskId}`] = ['Task references non-existent stage'];
      }
    });
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
}

/**
 * Workflow Structure Validation
 * Validates the workflow JSON structure for database storage
 */
export function validateWorkflowStructure(workflow: any): ValidationResult {
  const errors: Record<string, string[]> = {};

  if (!workflow || typeof workflow !== 'object') {
    errors.workflow = ['Workflow must be a valid object'];
    return { isValid: false, errors };
  }

  // Validate workflow has required structure
  if (!workflow.phases && !workflow.stages) {
    errors.workflow = ['Workflow must contain either phases or stages'];
  }

  // Validate workflow metadata
  if (workflow.metadata) {
    if (workflow.metadata.version && typeof workflow.metadata.version !== 'string') {
      errors.metadata = ['Workflow version must be a string'];
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Real-time Validation for Template Editor
 * Provides immediate feedback as user types
 */
export function validateTemplateRealTime(templateData: any, templateType: TemplateType): {
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  suggestions: Record<string, string[]>;
} {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};
  const suggestions: Record<string, string[]> = {};

  // Name suggestions
  if (templateData.name && templateData.name.length < 3) {
    suggestions.name = ['Consider a more descriptive name (at least 3 characters)'];
  }

  // Description suggestions
  if (templateData.description && templateData.description.length < 20) {
    suggestions.description = ['A more detailed description helps users understand the template purpose'];
  }

  // Type-specific suggestions
  if (templateType === 'phase') {
    const phaseCount = templateData.phases ? Object.keys(templateData.phases).length : 0;
    const stageCount = templateData.stages ? Object.keys(templateData.stages).length : 0;
    
    if (phaseCount === 0 && stageCount === 0) {
      suggestions.structure = ['Start by adding a phase to organize your template'];
    } else if (phaseCount > 0 && stageCount === 0) {
      suggestions.structure = ['Consider adding stages to break down your phases'];
    }
  }

  return { errors, warnings, suggestions };
}

/**
 * Template Performance Validation
 * Checks for potential performance issues
 */
export function validateTemplatePerformance(templateData: any, templateType: TemplateType): ValidationResult {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};

  if (templateType === 'pov') {
    const fieldCount = templateData.fields ? Object.keys(templateData.fields).length : 0;
    const sectionCount = templateData.sections ? templateData.sections.length : 0;

    if (fieldCount > 30) {
      warnings.performance = ['Large number of fields may impact form performance'];
    }

    if (sectionCount > 10) {
      warnings.performance = ['Consider consolidating sections for better user experience'];
    }
  } else if (templateType === 'phase') {
    const phaseCount = templateData.phases ? Object.keys(templateData.phases).length : 0;
    const stageCount = templateData.stages ? Object.keys(templateData.stages).length : 0;
    const taskCount = templateData.tasks ? Object.keys(templateData.tasks).length : 0;

    if (phaseCount > 10) {
      warnings.performance = ['Large number of phases may be difficult to manage'];
    }

    if (taskCount > 100) {
      warnings.performance = ['Consider breaking down complex tasks into smaller ones'];
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
}
