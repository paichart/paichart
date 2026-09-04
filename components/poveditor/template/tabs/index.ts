// Export all tab definitions
export { BasicInfoTab } from './BasicInfoTab';
export { FieldsTab } from './FieldsTab';
export { SectionsTab } from './SectionsTab';
export { PhaseTemplateSelectionTab } from './PhaseTemplateSelectionTab';
export { PhaseDesignTab } from './PhaseDesignTab';
export { PhaseControlsTab } from './PhaseControlsTab';
export { AgentConfigTab } from './AgentConfigTab';
export { ReviewTab } from './ReviewTab';

// Export tab registry
export { templateTabRegistry, TemplateTabRegistryImpl } from './TemplateTabRegistry';

// Export types
export type {
  TemplateTab,
  TemplateTabValidation,
  FieldValidation,
  ValidationResult,
  TemplateTabRegistry,
  TemplateTabContext
} from './types';
