import { TemplateTab } from './types';
import BasicInfoSection from '../sections/BasicInfoSection';

export const BasicInfoTab: TemplateTab = {
  id: 'basic-info',
  label: 'Basic Info',
  description: 'Template name, description, and metadata',
  component: BasicInfoSection,
  icon: 'DocumentTextIcon',
  order: 1,
  templateTypes: ['pov', 'phase', 'agent'],
  isRequired: true,
  validation: {
    required: ['name', 'description'],
    fields: {
      name: {
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9\s\-_]+$/,
        message: 'Template name must be 1-100 characters and contain only letters, numbers, spaces, hyphens, and underscores'
      },
      description: {
        minLength: 10,
        maxLength: 500,
        message: 'Description must be 10-500 characters'
      }
    }
  }
};
