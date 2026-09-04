import { EditorTab } from '../types/EditorTab';
import TasksSection from '../sections/TasksSection';

/**
 * Tab definition for the Tasks section
 */
export const TasksTab: EditorTab = {
  id: 'tasks',
  label: 'Tasks',
  component: TasksSection,
  order: 7
};
