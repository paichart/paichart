import { EditorTab } from '../types/EditorTab';
import PhaseTemplateSelectionSection from '../sections/PhaseTemplateSelectionSection';

/**
 * Tab definition for the Phase Templates section
 */
export const PhaseTemplatesTab: EditorTab = {
  id: 'phase-templates',
  label: 'Phase Templates',
  component: PhaseTemplateSelectionSection,
  order: 3, // Order 3 in template-based mode, 7.5 in regular mode
  // Show in template-based mode, hide in regular mode for now
  hidden: (state: any) => {
    return state?.ui?.mode !== 'template-based';
  }
};
