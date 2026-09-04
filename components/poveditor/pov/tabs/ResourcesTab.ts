import { EditorTab } from '../types/EditorTab';
import ResourcesSection from '../sections/ResourcesSection';

/**
 * Tab definition for the Resources section
 */
export const ResourcesTab: EditorTab = {
  id: 'resources',
  label: 'Resources',
  component: ResourcesSection,
  order: 4
};
