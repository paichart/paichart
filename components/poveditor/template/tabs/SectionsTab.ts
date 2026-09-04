import { TemplateTab } from './types';
import SectionsSection from '../sections/SectionsSection';

export const SectionsTab: TemplateTab = {
  id: 'sections',
  label: 'Sections',
  description: 'Organize fields into sections',
  component: SectionsSection,
  icon: 'Squares2X2Icon',
  order: 3,
  templateTypes: ['pov'],
  isRequired: false,
  validation: {
    custom: (templateData: any) => {
      const sections = templateData.sections || [];
      const fields = templateData.fields || {};
      const fieldIds = Object.keys(fields);
      
      const errors: Record<string, string[]> = {};
      
      // Check if all fields are assigned to sections
      const assignedFieldIds = new Set<string>();
      sections.forEach((section: any) => {
        section.fields?.forEach((fieldId: string) => {
          assignedFieldIds.add(fieldId);
        });
      });
      
      const unassignedFields = fieldIds.filter(fieldId => !assignedFieldIds.has(fieldId));
      if (unassignedFields.length > 0) {
        errors.sections = [`${unassignedFields.length} field(s) are not assigned to any section`];
      }
      
      // Check if all sections have at least one field
      const emptySections = sections.filter((section: any) => !section.fields || section.fields.length === 0);
      if (emptySections.length > 0) {
        if (!errors.sections) errors.sections = [];
        errors.sections.push(`${emptySections.length} section(s) have no fields assigned`);
      }
      
      return {
        isValid: Object.keys(errors).length === 0,
        errors
      };
    }
  }
};
