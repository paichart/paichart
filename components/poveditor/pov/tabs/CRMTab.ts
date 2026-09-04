import { EditorTab } from '../types/EditorTab';
import CRMSection from '../sections/CRMSection';

/**
 * Tab definition for the CRM section
 */
export const CRMTab: EditorTab = {
  id: 'crm',
  label: 'CRM',
  component: CRMSection,
  order: 2
};
