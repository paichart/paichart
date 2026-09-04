import { EditorTab } from '../types/EditorTab';
import KPISection from '../sections/KPISection';

/**
 * Tab definition for the KPI section
 */
export const KPITab: EditorTab = {
  id: 'kpi',
  label: 'KPI',
  component: KPISection,
  order: 3
};
