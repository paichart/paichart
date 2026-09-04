import { TemplateTab } from './types';
import ReviewSection from '../sections/ReviewSection';

export const ReviewTab: TemplateTab = {
  id: 'review',
  label: 'Review',
  description: 'Review and save your template',
  component: ReviewSection,
  icon: 'CheckCircleIcon',
  order: 999, // Always last - higher than all other tabs
  templateTypes: ['pov', 'phase', 'agent'],
  isRequired: true,
  validation: {
    custom: (templateData: any) => {
      const errors: Record<string, string[]> = {};
      
      // Basic validation
      if (!templateData.name?.trim()) {
        errors.name = ['Template name is required'];
      }
      
      if (!templateData.description?.trim()) {
        errors.description = ['Template description is required'];
      }
      
      return {
        isValid: Object.keys(errors).length === 0,
        errors
      };
    }
  }
};
