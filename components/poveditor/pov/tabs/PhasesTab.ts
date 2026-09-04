import { EditorTab } from '../types/EditorTab';
import PhasesSection from '../sections/PhasesSection';

/**
 * Tab definition for the Phases section
 */
export const PhasesTab: EditorTab = {
  id: 'phases',
  label: 'Phases',
  component: PhasesSection,
  order: 8
};
