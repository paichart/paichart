import { TemplateTab } from './types';
import PhaseTemplateControlsSection from '../sections/PhaseTemplateControlsSection';

export const PhaseControlsTab: TemplateTab = {
  id: 'phase-controls',
  label: 'Controls',
  description: 'Import, export, and manage phase templates',
  component: PhaseTemplateControlsSection,
  icon: 'Cog6ToothIcon',
  order: 3,
  templateTypes: ['phase'],
  isRequired: false,
  validation: {
    custom: (templateData: any) => {
      // Controls tab doesn't have specific validation requirements
      // It's mainly for template management operations
      return {
        isValid: true,
        errors: {}
      };
    }
  }
};
