import { TemplateTab } from './types';
import PhaseTemplateSelectionSection from '../sections/PhaseTemplateSelectionSection';

/**
 * Phase Template Selection Tab Definition
 * Allows POV templates to specify which phase templates should be included when POVs are created
 */
export const PhaseTemplateSelectionTab: TemplateTab = {
  id: 'phase-templates',
  label: 'Phase Templates',
  icon: 'CalendarIcon',
  description: 'Select phase templates to include when POVs are created from this template',
  
  // Only available for POV templates
  templateTypes: ['pov'],
  
  // Component to render
  component: PhaseTemplateSelectionSection,
  
  // Order in the tab list (right after basic info)
  order: 15,
  
  // Optional tab
  isRequired: false,
  
  // Enable condition - only for POV templates
  isEnabled: (templateData: any) => {
    // Check both data.type and ui.templateType to be safe
    return templateData.type === 'pov' || templateData.templateType === 'pov';
  },
  
  // Validation function
  validation: {
    custom: (templateData: any) => {
      const errors: Record<string, string[]> = {};
      const warnings: Record<string, string[]> = {};
      
      // Phase template selection is optional, so no required validation
      // But we can provide helpful warnings
      
      if (templateData.type === 'pov') {
        const phaseTemplateIds = templateData.phaseTemplateIds || [];
        
        if (phaseTemplateIds.length === 0) {
          warnings.phaseTemplates = ['No phase templates selected. POVs created from this template will not have predefined phases.'];
        } else if (phaseTemplateIds.length > 10) {
          warnings.phaseTemplates = ['Many phase templates selected. This may create complex POVs with many phases.'];
        }
      }
      
      return {
        isValid: Object.keys(errors).length === 0,
        errors,
        warnings
      };
    }
  },
  
  // No dependencies - phase template selection is independent
  dependencies: []
};
