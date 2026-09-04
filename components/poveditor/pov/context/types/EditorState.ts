import { POVStatus, Priority } from '@prisma/client';
import { Phase, Stage, Task, TeamMember, KPI } from './EntityTypes';

/**
 * Main interface for the POV editor state
 * Note: Template-related fields have been moved to the standalone template editor
 */
export interface EditorState {
  /**
   * Main POV entity data
   */
  data: {
    id?: string;
    title: string;
    description: string;
    status: POVStatus;
    priority: Priority;
    startDate?: string;
    endDate?: string;
    objective?: string;
    solution?: string;
    customerName?: string;
    customerContact?: string;
    // CRM fields
    dealId?: string;
    opportunityName?: string;
    revenue?: string;
    forecastDate?: string;
    partnerName?: string;
    partnerContact?: string;
    competitors?: string[];
    lastCrmSync?: string;
    crmSyncStatus?: string;
    // Resources
    resources?: string;
    // Workflows
    workflows?: string;
    // Launch
    launch?: string;
    // Team selection
    teamName?: string;
    projectManager: string;
    salesEngineers: string[];
    technicalTeam: string[];
    // Geographical selection
    salesTheatre?: string;
    countryId?: string;
    regionId?: string;
    // Phase template selection (for POV creation from templates)
    phaseTemplateIds?: string[]; // IDs of selected phase templates
    // Other top-level fields
  };
  
  /**
   * Related entities in normalized form
   */
  entities: {
    phases: Record<string, Phase>;
    tasks: Record<string, Task>;
    team: Record<string, TeamMember>;
    stages: Record<string, Stage>;
    kpis: Record<string, KPI>;
    // Other entity types
  };
  
  /**
   * Relationships between entities
   */
  relationships: {
    phaseOrder: string[];
    phaseToTasks: Record<string, string[]>;
    phaseToStages: Record<string, string[]>;
    stageToTasks: Record<string, string[]>;
    // Other relationships
  };
  
  /**
   * UI state
   */
  ui: {
    activeTab: string;
    dirtyFields: Set<string>;
    validationErrors: Record<string, string[]>;
    mode?: 'create' | 'edit' | 'view' | 'template-based' | 'project'; // Editor mode
    wizardStep?: number; // For multi-step form navigation in template-based mode
    
    // Agent-specific UI state
    selectedTaskId?: string | null; // Currently selected task for agent configuration
    expandedPhases?: Set<string>; // Set of expanded phase IDs
    expandedStages?: Set<string>; // Set of expanded stage IDs
    // Other UI state
  };
  
  /**
   * Form metadata
   */
  meta: {
    isSubmitting: boolean;
    lastSaved: string | null;
    isDirty: boolean;
    // Other metadata
  };
}
