import { EditorTab } from '../types/EditorTab';
import LaunchesSection from '../sections/LaunchesSection';

/**
 * Tab definition for the Launches section
 */
export const LaunchesTab: EditorTab = {
  id: 'launches',
  label: 'Launches',
  component: LaunchesSection,
  order: 9
};
