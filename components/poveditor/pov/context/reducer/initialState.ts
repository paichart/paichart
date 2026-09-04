import { POVStatus, Priority } from '@prisma/client';
import { EditorState } from '../types';

/**
 * Initial state for the editor
 */
export const initialState: EditorState = {
  data: {
    title: '',
    description: '',
    customerName: '',
    customerContact: '',
    partnerName: '',
    partnerContact: '',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    forecastDate: undefined,
    objective: '',
    solution: '',
    priority: 'MEDIUM' as Priority,
    status: 'PROJECTED' as POVStatus,
    salesTheatre: '',
    countryId: '',
    regionId: '',
    projectManager: '',
    salesEngineers: [],
    technicalTeam: [],
    phaseTemplateIds: [], // Keep this for POV creation from templates
  },
  entities: {
    phases: {},
    tasks: {},
    team: {},
    stages: {},
    kpis: {},
  },
  relationships: {
    phaseOrder: [],
    phaseToTasks: {},
    phaseToStages: {},
    stageToTasks: {},
  },
  ui: {
    activeTab: 'basic-info',
    dirtyFields: new Set<string>(),
    validationErrors: {},
    mode: 'create', // Default mode
  },
  meta: {
    isSubmitting: false,
    lastSaved: null,
    isDirty: false,
  },
};
