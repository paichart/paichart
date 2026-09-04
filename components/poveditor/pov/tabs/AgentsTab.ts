import { EditorTab } from '../types/EditorTab';
import AgentSection from '../sections/AgentSection';

/**
 * Tab definition for the Agents section
 * This tab replaces the Tasks tab and focuses on agent configuration and monitoring
 */
export const AgentsTab: EditorTab = {
  id: 'agents',
  label: 'Agents',
  component: AgentSection,
  order: 7
};
