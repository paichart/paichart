import { EditorTab } from '../types/EditorTab';
import WorkflowSection from '../sections/WorkflowSection';

/**
 * Tab definition for the Workflow section
 */
export const WorkflowTab: EditorTab = {
  id: 'workflow',
  label: 'Workflow',
  component: WorkflowSection,
  order: 6
};
