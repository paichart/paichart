import { TemplateTab } from './types';
import FieldsSection from '../sections/FieldsSection';

export const FieldsTab: TemplateTab = {
  id: 'fields',
  label: 'Fields',
  description: 'Define template fields and their properties',
  component: FieldsSection,
  icon: 'RectangleStackIcon',
  order: 2,
  templateTypes: ['pov'],
  isRequired: false,
  validation: {
    custom: (templateData: any) => {
      const fields = templateData.fields || {};
      const fieldCount = Object.keys(fields).length;
      
      const errors: Record<string, string[]> = {};
      
      if (fieldCount === 0) {
        errors.fields = ['At least one field is required for POV templates'];
        return {
          isValid: false,
          errors
        };
      }
      
      return {
        isValid: true,
        errors
      };
    }
  }
};
