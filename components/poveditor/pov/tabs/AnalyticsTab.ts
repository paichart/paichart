import { EditorTab } from '../types/EditorTab';
import AnalyticsSection from '../sections/AnalyticsSection';

/**
 * Tab definition for the Analytics section
 * This is a custom tab that demonstrates dynamic tab registration
 */
export const AnalyticsTab: EditorTab = {
  id: 'analytics',
  label: 'Analytics',
  component: AnalyticsSection,
  order: 10
};
