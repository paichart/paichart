// Export main template editor component
export { default as TemplateEditor } from './TemplateEditor';

// Export context and hooks
export { TemplateEditorProvider } from './context/TemplateEditorProvider';
export { 
  useTemplateData,
  useTemplateTypeOperations,
  usePovTemplateOperations,
  usePhaseTemplateOperations,
  useTemplateValidation,
  useTemplateSave,
  useTemplateEditor
} from './context/TemplateEditorContext';

// Export types
export type {
  TemplateType,
  TemplateEditorState,
  Phase,
  Stage,
  Task
} from './context/types/TemplateEditorState';

export type {
  TemplateAction,
  TemplateActionCreators
} from './context/types/TemplateActions';

// Export tab system
export {
  templateTabRegistry,
  BasicInfoTab,
  FieldsTab,
  SectionsTab,
  PhaseDesignTab,
  PhaseControlsTab,
  ReviewTab
} from './tabs';

export type {
  TemplateTab,
  TemplateTabValidation,
  FieldValidation,
  ValidationResult,
  TemplateTabRegistry,
  TemplateTabContext
} from './tabs';

// Export sections (for direct use if needed)
export { default as BasicInfoSection } from './sections/BasicInfoSection';
export { default as FieldsSection } from './sections/FieldsSection';
export { default as SectionsSection } from './sections/SectionsSection';
export { default as PhaseTemplateDesignSection } from './sections/PhaseTemplateDesignSection';
export { default as PhaseTemplateControlsSection } from './sections/PhaseTemplateControlsSection';
export { default as ReviewSection } from './sections/ReviewSection';

// Export components
export { TemplateTypeSelector } from './components/TemplateTypeSelector';
