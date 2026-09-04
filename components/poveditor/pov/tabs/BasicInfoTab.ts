import { EditorTab } from '../types/EditorTab';
import BasicInfoSection from '../sections/BasicInfoSection';

/**
 * Tab definition for the Basic Info section
 */
export const BasicInfoTab: EditorTab = {
  id: 'basic-info',
  label: 'Basic Info',
  component: BasicInfoSection,
  order: 1
};
