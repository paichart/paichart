/**
 * Template Editor Utilities
 * Centralized exports for all utility functions
 */

// API utilities
export {
  fetchPovTemplates,
  fetchPovTemplate,
  savePovTemplate,
  deletePovTemplate,
  fetchPhaseTemplates,
  fetchPhaseTemplate,
  savePhaseTemplate,
  deletePhaseTemplate,
  importPhaseTemplate,
  exportPhaseTemplate,
  validatePhaseTemplate as validatePhaseTemplateApi,
  fetchTemplate,
  saveTemplate,
  deleteTemplate,
  fetchTemplates
} from './api';
export type { ApiResponse, TemplateApiData } from './api';

// Validation utilities
export {
  validateBasicInfo,
  validatePovTemplate,
  validatePhaseTemplate,
  validatePovFields,
  validatePovSections,
  validatePhaseStages,
  validatePhaseTasks,
  validateTemplate,
  validateFieldType,
  checkTemplateCompleteness,
  validateTemplateEditorState
} from './validation';
export type { ValidationResult, FieldValidationResult } from './validation';

// Data normalization utilities
export {
  normalizeApiToEditorState,
  normalizeEditorStateToApi,
  normalizeTemplateList,
  createEmptyTemplateData,
  cloneTemplateData,
  mergeTemplateData,
  extractTemplateMetadata
} from './normalizer';
