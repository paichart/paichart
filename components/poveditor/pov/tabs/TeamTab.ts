import { EditorTab } from '../types/EditorTab';
import TeamSection from '../sections/TeamSection';

/**
 * Tab definition for the Team section
 */
export const TeamTab: EditorTab = {
  id: 'team',
  label: 'Team',
  component: TeamSection,
  order: 5
};
