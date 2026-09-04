"use client";

import { createContext, useContext, useReducer, useMemo, useCallback, ReactNode, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { produce, enableMapSet } from 'immer';

// Enable the MapSet plugin for Immer
enableMapSet();
// Import types from Prisma client
import { POVStatus, TaskStatus, PhaseType, StageStatus, TaskType, Priority, TaskPriority } from '@prisma/client';
import { depIds, dependsOn, checkForDependencyCycles } from './utils/taskDependencies';
import type { Task, TaskDependency } from './types/EntityTypes';

// Define the normalized state structure
export interface EditorState {
  // Main entity data
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
    // Metadata (preserves isDemo for DEMO_USER access)
    metadata?: any;
    // Other top-level fields
  };
  
  // Related entities in normalized form
  entities: {
    phases: Record<string, Phase>;
    tasks: Record<string, Task>;
    team: Record<string, TeamMember>;
    stages: Record<string, Stage>;
    kpis: Record<string, KPI>;
    // Other entity types
  };
  
  // Relationships between entities
  relationships: {
    phaseOrder: string[];
    phaseToTasks: Record<string, string[]>;
    phaseToStages: Record<string, string[]>;
    stageToTasks: Record<string, string[]>;
    // Other relationships
  };
  
  // UI state
  ui: {
    activeTab: string;
    dirtyFields: Set<string>;
    validationErrors: Record<string, string[]>;
    // Bug Class 81 #5 (2026-08-19): real (non-temp) phase ids the user removed this session.
    // Sent as deletedPhaseIds on save — the server deletes ONLY these (never by omission).
    deletedPhaseIds: string[];
    // Other UI state
  };
  
  // Form metadata
  meta: {
    isSubmitting: boolean;
    lastSaved: string | null;
    isDirty: boolean;
    // Other metadata
  };
}

// Define interfaces for entity types
interface Phase {
  id: string;
  name: string;
  description: string;
  type: PhaseType;
  startDate?: string;
  endDate?: string;
  order: number;
  // Other phase fields
}

interface Stage {
  id: string;
  name: string;
  description?: string;
  status: StageStatus;
  order: number;
  phaseId?: string;
  // Other stage fields
}

// Task type imported from ./types/EntityTypes (canonical)

interface TeamMember {
  id: string;
  userId: string;
  role: string;
  name: string;
  email?: string;
  phone?: string;
  // Other team member fields
}

// Define KPI interface
interface KPI {
  id: string;
  name: string;
  target: any;
  current: any;
  templateId?: string;
  weight?: number;
}

// Define the initial state
const initialState: EditorState = {
  data: {
    title: '',
    description: '',
    status: POVStatus.PROJECTED,
    priority: Priority.MEDIUM,
    projectManager: '',
    salesEngineers: [],
    technicalTeam: [],
    metadata: {},  // Initialize metadata so it's always present
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
    deletedPhaseIds: [],
  },
  meta: {
    isSubmitting: false,
    lastSaved: null,
    isDirty: false,
  },
};

// Define action types
type EditorAction = 
  | { type: 'SET_FIELD', path: string[], value: any }
  | { type: 'ADD_ENTITY', entityType: string, entity: any }
  | { type: 'UPDATE_ENTITY', entityType: string, id: string, updates: any }
  | { type: 'REMOVE_ENTITY', entityType: string, id: string }
  | { type: 'REORDER_RELATIONSHIP', relationshipKey: string, newOrder: string[] }
  | { type: 'SET_VALIDATION_ERRORS', errors: Record<string, string[]> }
  | { type: 'MARK_DIRTY', fieldPaths: string[] }
  | { type: 'MARK_CLEAN' }
  | { type: 'SET_SUBMITTING', isSubmitting: boolean }
  | { type: 'SET_ACTIVE_TAB', tab: string }
  | { type: 'INITIALIZE_STATE', state: Partial<EditorState> };

// Create the reducer function with Immer
function editorReducer(state: EditorState, action: EditorAction): EditorState {
  return produce(state, (draft) => {
    switch (action.type) {
      case 'SET_FIELD': {
        let current: any = draft;
        for (let i = 0; i < action.path.length - 1; i++) {
          if (current[action.path[i]] === undefined) {
            current[action.path[i]] = {};
          }
          current = current[action.path[i]];
        }
        current[action.path[action.path.length - 1]] = action.value;
        draft.meta.isDirty = true;
        draft.ui.dirtyFields.add(action.path.join('.'));
        break;
      }
      
      case 'ADD_ENTITY': {
        const entity = { ...action.entity };
        const id = entity.id; // Use the ID provided by the action (already generated in addEntity callback)
        
        // ENHANCED DUPLICATE PREVENTION: Check for both ID and content duplicates
        if ((draft.entities as any)[action.entityType][id]) {
          break;
        }
        
        (draft.entities as any)[action.entityType][id] = entity;
        draft.meta.isDirty = true;
        
        // Initialize relationships if needed
        if (action.entityType === 'phases') {
          if (!draft.relationships.phaseToTasks[id]) {
            draft.relationships.phaseToTasks[id] = [];
          }
          if (!draft.relationships.phaseToStages[id]) {
            draft.relationships.phaseToStages[id] = [];
          }
        }
        
        if (action.entityType === 'stages') {
          const phaseId = (entity as any).phaseId;
          if (phaseId) {
            // Initialize stage-to-tasks relationship
            if (!draft.relationships.stageToTasks[id]) {
              draft.relationships.stageToTasks[id] = [];
            }
            
            // DUPLICATE PREVENTION: Only add to phase relationship if not already present
            if (draft.relationships.phaseToStages[phaseId]) {
              if (!draft.relationships.phaseToStages[phaseId].includes(id)) {
                draft.relationships.phaseToStages[phaseId].push(id);
              }
            } else {
              // Initialize phase-to-stages relationship if it doesn't exist
              draft.relationships.phaseToStages[phaseId] = [id];
            }
          }
        }
        
        if (action.entityType === 'tasks') {
          const phaseId = (entity as any).phaseId;
          const stageId = (entity as any).stageId;
          
          // DUPLICATE PREVENTION: Add to phase relationship only if not already present
          if (phaseId && draft.relationships.phaseToTasks[phaseId]) {
            if (!draft.relationships.phaseToTasks[phaseId].includes(id)) {
              draft.relationships.phaseToTasks[phaseId].push(id);
            }
          }
          
          // DUPLICATE PREVENTION: Add to stage relationship only if not already present
          if (stageId && draft.relationships.stageToTasks[stageId]) {
            if (!draft.relationships.stageToTasks[stageId].includes(id)) {
              draft.relationships.stageToTasks[stageId].push(id);
            }
          }
        }
        
        break;
      }
      
      case 'UPDATE_ENTITY': {
        if ((draft.entities as any)[action.entityType][action.id]) {
          (draft.entities as any)[action.entityType][action.id] = {
            ...(draft.entities as any)[action.entityType][action.id],
            ...action.updates
          };
          draft.meta.isDirty = true;
        }
        break;
      }
      
      case 'REMOVE_ENTITY': {
        if ((draft.entities as any)[action.entityType][action.id]) {
          delete (draft.entities as any)[action.entityType][action.id];
          
          // Clean up relationships
          if (action.entityType === 'phases') {
            // Bug Class 81 #5: record real phase removals for the explicit-deletion save
            // contract (reducer chokepoint — covers every removeEntity('phases') caller).
            if (!action.id.startsWith('temp-') && !draft.ui.deletedPhaseIds.includes(action.id)) {
              draft.ui.deletedPhaseIds.push(action.id);
            }
            // Remove phase from phaseOrder
            const index = draft.relationships.phaseOrder.indexOf(action.id);
            if (index !== -1) {
              draft.relationships.phaseOrder.splice(index, 1);
            }
            
            // Remove phase-to-tasks relationship
            delete draft.relationships.phaseToTasks[action.id];
            
            // Remove phase-to-stages relationship
            delete draft.relationships.phaseToStages[action.id];
            
            // Remove tasks associated with this phase
            Object.keys(draft.entities.tasks).forEach(taskId => {
              const task = draft.entities.tasks[taskId];
              if (task.phaseId === action.id) {
                delete draft.entities.tasks[taskId];
              }
            });
            
            // Remove stages associated with this phase
            Object.keys(draft.entities.stages).forEach(stageId => {
              const stage = draft.entities.stages[stageId];
              if (stage.phaseId === action.id) {
                delete draft.entities.stages[stageId];
                delete draft.relationships.stageToTasks[stageId];
              }
            });
          }
          
          if (action.entityType === 'stages') {
            // Remove stage from phase-to-stages relationship
            Object.keys(draft.relationships.phaseToStages).forEach(phaseId => {
              const index = draft.relationships.phaseToStages[phaseId].indexOf(action.id);
              if (index !== -1) {
                draft.relationships.phaseToStages[phaseId].splice(index, 1);
              }
            });
            
            // Remove stage-to-tasks relationship
            delete draft.relationships.stageToTasks[action.id];
            
            // Update tasks associated with this stage
            Object.keys(draft.entities.tasks).forEach(taskId => {
              const task = draft.entities.tasks[taskId];
              if (task.stageId === action.id) {
                draft.entities.tasks[taskId] = {
                  ...task,
                  stageId: undefined
                };
              }
            });
          }
          
          if (action.entityType === 'tasks') {
            // Remove task from all phase-to-tasks relationships
            Object.keys(draft.relationships.phaseToTasks).forEach(phaseId => {
              const index = draft.relationships.phaseToTasks[phaseId].indexOf(action.id);
              if (index !== -1) {
                draft.relationships.phaseToTasks[phaseId].splice(index, 1);
              }
            });
            
            // Remove task from all stage-to-tasks relationships
            Object.keys(draft.relationships.stageToTasks).forEach(stageId => {
              const index = draft.relationships.stageToTasks[stageId].indexOf(action.id);
              if (index !== -1) {
                draft.relationships.stageToTasks[stageId].splice(index, 1);
              }
            });
            
            // Remove task dependencies
            Object.keys(draft.entities.tasks).forEach(taskId => {
              const task = draft.entities.tasks[taskId];
              if (dependsOn(task, action.id)) {
                draft.entities.tasks[taskId] = {
                  ...task,
                  dependencies: task.dependencies?.filter(d => d.dependsOnId !== action.id) ?? []
                };
              }
            });
          }
          
          draft.meta.isDirty = true;
        }
        break;
      }
      
      case 'REORDER_RELATIONSHIP': {
        if ((draft.relationships as any)[action.relationshipKey]) {
          (draft.relationships as any)[action.relationshipKey] = action.newOrder;
          draft.meta.isDirty = true;
        }
        break;
      }
      
      case 'SET_VALIDATION_ERRORS': {
        draft.ui.validationErrors = action.errors;
        break;
      }
      
      case 'MARK_DIRTY': {
        action.fieldPaths.forEach(path => {
          draft.ui.dirtyFields.add(path);
        });
        draft.meta.isDirty = true;
        break;
      }
      
      case 'MARK_CLEAN': {
        draft.ui.dirtyFields = new Set();
        draft.meta.isDirty = false;
        draft.meta.lastSaved = new Date().toISOString();
        break;
      }
      
      case 'SET_SUBMITTING': {
        draft.meta.isSubmitting = action.isSubmitting;
        break;
      }
      
      case 'SET_ACTIVE_TAB': {
        draft.ui.activeTab = action.tab;
        break;
      }
      
      case 'INITIALIZE_STATE': {
        // Handle server response after save - completely replace state
        // This prevents duplicate phases when server responds with real data

        // Bug Class 81 #5: the deletions were applied by the save that produced this
        // response — clear the list so they are not re-sent (harmless but noisy).
        draft.ui.deletedPhaseIds = [];

        if (action.state.data) {
          draft.data = { ...draft.data, ...action.state.data };
        }

        if (action.state.entities) {
          // COMPLETE REPLACEMENT: Don't merge, completely replace entities with server data
          Object.keys(action.state.entities).forEach(entityType => {
            if ((action.state.entities as any)[entityType]) {
              const newEntities = (action.state.entities as any)[entityType];
              (draft.entities as any)[entityType] = { ...newEntities };
            }
          });
        }

        if (action.state.relationships) {
          // COMPLETE REPLACEMENT: Replace relationships with server data
          Object.keys(action.state.relationships).forEach(relationshipKey => {
            if ((action.state.relationships as any)[relationshipKey]) {
              (draft.relationships as any)[relationshipKey] = [...(action.state.relationships as any)[relationshipKey]];
            }
          });
        } else {
          // If no relationships in server response, rebuild phaseOrder from entities
          if (action.state.entities?.phases) {
            const serverPhaseIds = Object.keys(action.state.entities.phases);
            draft.relationships.phaseOrder = serverPhaseIds;

            // Also rebuild phase relationships
            serverPhaseIds.forEach(phaseId => {
              if (!draft.relationships.phaseToTasks[phaseId]) {
                draft.relationships.phaseToTasks[phaseId] = [];
              }
              if (!draft.relationships.phaseToStages[phaseId]) {
                draft.relationships.phaseToStages[phaseId] = [];
              }
            });
          }
        }

        draft.meta.isDirty = false;
        draft.ui.dirtyFields = new Set();
        break;
      }
    }
  });
}

// NOTE: API functions (fetchPovData, savePovData), data transformation
// (normalizeApiData, denormalizeStateForApi, cleanTemporaryIds),
// and validation (validateEditorState, checkForDependencyCycles) have been
// moved to ./utils/ (api.ts, normalizer.ts, validation.ts).
// The PovEditorProvider imports from ./utils, not from this file.
// The dead copies below are kept temporarily for reference during migration.
// TODO: Remove after confirming no other imports reference these functions.

// ============================================================================
// DEAD CODE — superseded by ./utils/api.ts, ./utils/normalizer.ts, ./utils/validation.ts
// These functions are NOT exported and NOT imported by PovEditorProvider.
// ============================================================================

// @deprecated Use ./utils/api.ts fetchPovData instead
async function fetchPovData(povId: string) {
  const response = await fetch(`/api/pov/${povId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch POV data');
  }
  return response.json();
}

async function savePovData(povId: string | undefined, data: any) {
  const url = povId ? `/api/pov/${povId}` : '/api/pov';
  const method = povId ? 'PUT' : 'POST';
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to save POV data');
  }
  
  return response.json();
}

// Data transformation functions
function normalizeApiData(apiData: any): Partial<EditorState> {
  const entities = {
    phases: {} as Record<string, Phase>,
    tasks: {} as Record<string, Task>,
    team: {} as Record<string, TeamMember>,
    stages: {} as Record<string, Stage>,
    kpis: {} as Record<string, KPI>,
  };
  
  const relationships = {
    phaseOrder: [] as string[],
    phaseToTasks: {} as Record<string, string[]>,
    phaseToStages: {} as Record<string, string[]>,
    stageToTasks: {} as Record<string, string[]>,
  };
  
  // Extract main data
  const data = {
    id: apiData.id,
    title: apiData.title,
    description: apiData.description,
    status: apiData.status,
    priority: apiData.priority,
    startDate: apiData.startDate,
    endDate: apiData.endDate,
    objective: apiData.objective,
    solution: apiData.solution,
    customerName: apiData.customerName,
    customerContact: apiData.customerContact,
    resources: apiData.resources,
    workflows: apiData.workflows,
    launch: apiData.launch,
    // Team selection
    teamName: apiData.teamName || `${apiData.title} Team`, // Use "POV Title Team" as default team name
    projectManager: '',
    salesEngineers: [],
    technicalTeam: [],
    // Geographical selection
    salesTheatre: apiData.salesTheatre,
    countryId: apiData.countryId || apiData.country?.id,
    regionId: apiData.regionId || apiData.region?.id,
    // Metadata (preserves isDemo for DEMO_USER access)
    metadata: apiData.metadata,
  };

  // Normalize phases
  if (apiData.phases) {
    // First, sort phases by type (PLANNING → EXECUTION → REVIEW) then by order
    const sortedPhases = [...apiData.phases].sort((a, b) => {
      // Define type order: PLANNING = 0, EXECUTION = 1, REVIEW = 2
      const typeOrder = { PLANNING: 0, EXECUTION: 1, REVIEW: 2 };
      const aTypeOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 999;
      const bTypeOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 999;
      
      // First sort by type
      if (aTypeOrder !== bTypeOrder) {
        return aTypeOrder - bTypeOrder;
      }
      
      // Then sort by order within the same type
      return (a.order || 0) - (b.order || 0);
    });
    
    sortedPhases.forEach((phase: any) => {
      entities.phases[phase.id] = {
        id: phase.id,
        name: phase.name,
        description: phase.description,
        type: phase.type,
        startDate: phase.startDate,
        endDate: phase.endDate,
        order: phase.order,
      };
      
      relationships.phaseOrder.push(phase.id);
      relationships.phaseToTasks[phase.id] = [];
      relationships.phaseToStages[phase.id] = [];
      
      // Normalize stages within phases
      if (phase.stages) {
        phase.stages.forEach((stage: any) => {
          entities.stages[stage.id] = {
            id: stage.id,
            name: stage.name,
            description: stage.description,
            status: stage.status,
            order: stage.order,
            phaseId: phase.id,
          };
          
          relationships.phaseToStages[phase.id].push(stage.id);
          relationships.stageToTasks[stage.id] = [];
          
          // Normalize tasks within stages
          if (stage.tasks) {
            stage.tasks.forEach((task: any) => {
              entities.tasks[task.id] = {
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                type: task.type || TaskType.ACTION,
                priority: task.priority || TaskPriority.MEDIUM,
                assigneeId: task.assigneeId,
                dueDate: task.dueDate,
                phaseId: phase.id,
                stageId: stage.id,
                order: task.order ?? 0,
                // FIXED: Include agent configuration fields from API
                agentRole: task.agentRole,
                prompt: task.prompt,
                inputContext: task.inputContext,
                modelParameters: task.metadata?.modelParameters || task.modelParameters,
                maxRetries: task.maxRetries,
                timeout: task.timeout,
                executionStatus: task.executionStatus,
                agentLog: task.agentLog,
                outputArtifacts: task.outputArtifacts,
                agentTemplateId: task.agentTemplateId, // CRITICAL: This should preserve the value
                agentTemplate: task.agentTemplate, // Pass the full template object
                mcpContext: task.mcpContext,
                mcpMetadata: task.mcpMetadata,
                mcpToolId: task.mcpToolId,
                mcpWorkflowId: task.mcpWorkflowId,
                metadata: task.metadata,
              };

              relationships.phaseToTasks[phase.id].push(task.id);
              relationships.stageToTasks[stage.id].push(task.id);
            });
          }
        });
      }
      
      // Normalize tasks directly under phases (not in stages)
      if (phase.tasks) {
        phase.tasks.forEach((task: any) => {
          if (!task.stageId) {
            entities.tasks[task.id] = {
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              type: task.type || TaskType.ACTION,
              priority: task.priority || TaskPriority.MEDIUM,
              assigneeId: task.assigneeId,
              dueDate: task.dueDate,
              phaseId: phase.id,
              order: task.order ?? 0,
              // FIXED: Include agent configuration fields from API for phase tasks
              agentRole: task.agentRole,
              prompt: task.prompt,
              inputContext: task.inputContext,
              modelParameters: task.metadata?.modelParameters || task.modelParameters,
              maxRetries: task.maxRetries,
              timeout: task.timeout,
              executionStatus: task.executionStatus,
              agentLog: task.agentLog,
              outputArtifacts: task.outputArtifacts,
              agentTemplateId: task.agentTemplateId,
              agentTemplate: task.agentTemplate,
              mcpContext: task.mcpContext,
              mcpMetadata: task.mcpMetadata,
              mcpToolId: task.mcpToolId,
              mcpWorkflowId: task.mcpWorkflowId,
              metadata: task.metadata,
            };
            
            relationships.phaseToTasks[phase.id].push(task.id);
          }
        });
      }
    });
  }
  
  // Normalize team members and extract team roles
  const projectManager: string[] = [];
  const salesEngineers: string[] = [];
  const technicalTeam: string[] = [];
  
  if (apiData.team && apiData.team.members) {
    apiData.team.members.forEach((member: any) => {
      if (!member.user) return;
      
      entities.team[member.id] = {
        id: member.id,
        userId: member.user.id,
        role: member.role,
        name: member.user.name || 'Unknown',
        email: member.user.email,
        phone: member.user.phone,
      };
      
      // Extract team roles
      if (member.role === 'PROJECT_MANAGER') {
        projectManager.push(member.user.id);
      } else if (member.role === 'SALES_ENGINEER') {
        salesEngineers.push(member.user.id);
      } else if (member.role === 'TECHNICAL_TEAM') {
        technicalTeam.push(member.user.id);
      }
    });
  }
  
  // Update data with team roles using type assertions
  data.projectManager = projectManager.length > 0 ? projectManager[0] : '';
  (data as any).salesEngineers = salesEngineers;
  (data as any).technicalTeam = technicalTeam;
  
  // Normalize KPIs
  if (apiData.kpis) {
    apiData.kpis.forEach((kpi: any) => {
      entities.kpis[kpi.id] = {
        id: kpi.id,
        name: kpi.name,
        target: kpi.target,
        current: kpi.current,
        templateId: kpi.templateId,
        weight: kpi.weight,
      };
    });
  }
  
  return {
    data,
    entities,
    relationships,
  };
}

function denormalizeStateForApi(state: EditorState) {
  const { data, entities, relationships } = state;
  
  // Create a deep copy of the data
  const apiData = {
    ...data,
    phases: [] as any[],
    team: [] as any[],
    kpis: [] as any[],
    teamName: data.teamName || `${data.title} Team`, // Use "POV Title Team" as default team name
    metadata: data.metadata,  // Explicitly preserve metadata (including isDemo)
  };
  
  // Denormalize phases with their stages and tasks
  if (relationships.phaseOrder) {
    apiData.phases = relationships.phaseOrder.map(phaseId => {
      const phase = { ...entities.phases[phaseId] };
      const phaseObj = {
        ...phase,
        stages: [] as any[],
        tasks: [] as any[],
      };
      
      // Add stages to phase
      if (relationships.phaseToStages[phaseId]) {
        phaseObj.stages = relationships.phaseToStages[phaseId].map(stageId => {
          const stage = { ...entities.stages[stageId] };
          const stageObj = {
            ...stage,
            tasks: [] as any[],
          };
          
          // Add tasks to stage
          if (relationships.stageToTasks[stageId]) {
            stageObj.tasks = relationships.stageToTasks[stageId].map(taskId => {
              const task = entities.tasks[taskId];
              // FIXED: Ensure modelParameters are stored in metadata for API
              const taskObj = {
                ...task,
                metadata: {
                  ...task.metadata,
                  ...(task.modelParameters && { modelParameters: task.modelParameters })
                }
              };
              // Remove top-level modelParameters since it's now in metadata
              delete taskObj.modelParameters;
              return taskObj;
            });
          }
          
          return stageObj;
        });
      }
      
      // Add tasks directly to phase (not in stages)
      if (relationships.phaseToTasks[phaseId]) {
        const phaseTasks = relationships.phaseToTasks[phaseId].filter(taskId => {
          const task = entities.tasks[taskId];
          return task && !task.stageId;
        });
        
        phaseObj.tasks = phaseTasks.map(taskId => {
          const task = entities.tasks[taskId];
          // FIXED: Ensure modelParameters are stored in metadata for API (phase tasks)
          const taskObj = {
            ...task,
            metadata: {
              ...task.metadata,
              ...(task.modelParameters && { modelParameters: task.modelParameters })
            }
          };
          // Remove top-level modelParameters since it's now in metadata
          delete taskObj.modelParameters;
          return taskObj;
        });
      }
      
      return phaseObj;
    });
  }
  
  // Denormalize team members into the format expected by the API
  const teamMembers = [];
  
  // Add project manager if selected
  if (data.projectManager) {
    teamMembers.push({
      userId: data.projectManager,
      role: 'PROJECT_MANAGER'
    });
  }
  
  // Add sales engineers if selected
  if (data.salesEngineers && data.salesEngineers.length > 0) {
    data.salesEngineers.forEach(userId => {
      teamMembers.push({
        userId,
        role: 'SALES_ENGINEER'
      });
    });
  }
  
  // Add technical team members if selected
  if (data.technicalTeam && data.technicalTeam.length > 0) {
    data.technicalTeam.forEach(userId => {
      teamMembers.push({
        userId,
        role: 'TECHNICAL_TEAM'
      });
    });
  }
  
  // Set teamMembers in the API data using type assertion
  (apiData as any).teamMembers = teamMembers.length > 0 ? teamMembers : undefined;
  
  // Keep the original team data for reference
  apiData.team = Object.values(entities.team);
  
  // Denormalize KPIs
  apiData.kpis = Object.values(entities.kpis);
  
  // Remove temporary IDs
  cleanTemporaryIds(apiData);
  
  return apiData;
}

// Clean temporary IDs before sending to API
function cleanTemporaryIds(data: any) {
  if (!data) return;
  
  if (Array.isArray(data)) {
    data.forEach(item => cleanTemporaryIds(item));
  } else if (typeof data === 'object') {
    // Remove id if it's a temporary ID
    if (data.id && typeof data.id === 'string' && data.id.startsWith('temp-')) {
      delete data.id;
    }
    
    // Process all properties recursively
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'object' && data[key] !== null) {
        cleanTemporaryIds(data[key]);
      }
    });
  }
}

// Validation function
function validateEditorState(state: EditorState): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  
  // Validate main data
  if (!state.data.title) {
    errors['data.title'] = ['Title is required'];
  } else if (state.data.title.length < 3) {
    errors['data.title'] = ['Title must be at least 3 characters'];
  }
  
  if (!state.data.description) {
    errors['data.description'] = ['Description is required'];
  }
  
  // Validate phases
  Object.keys(state.entities.phases).forEach(phaseId => {
    const phase = state.entities.phases[phaseId];
    
    if (!phase.name) {
      errors[`phases.${phaseId}.name`] = ['Phase name is required'];
    }
  });
  
  // Validate stages
  Object.keys(state.entities.stages).forEach(stageId => {
    const stage = state.entities.stages[stageId];
    
    if (!stage.name) {
      errors[`stages.${stageId}.name`] = ['Stage name is required'];
    }
  });
  
  // Validate tasks
  Object.keys(state.entities.tasks).forEach(taskId => {
    const task = state.entities.tasks[taskId];
    
    if (!task.title) {
      errors[`tasks.${taskId}.title`] = ['Task title is required'];
    }
    
    // Check for circular dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      const hasCycle = checkForDependencyCycles(taskId, state.entities.tasks);
      if (hasCycle) {
        errors[`tasks.${taskId}.dependencies`] = ['Circular dependency detected'];
      }
    }
  });
  
  return errors;
}


// Create the context
interface EditorContextType {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  updateField: (path: string[], value: any) => void;
  addEntity: (entityType: string, entity: any) => string;
  updateEntity: (entityType: string, id: string, updates: any) => void;
  removeEntity: (entityType: string, id: string) => void;
  reorderRelationship: (relationshipKey: string, newOrder: string[]) => void;
  saveData: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  isLoading: boolean;
  isSaving: boolean;
  hasErrors: boolean;
}

const EditorContext = createContext<EditorContextType | null>(null);

// Create the provider component
interface PovEditorProviderProps {
  children: ReactNode;
  povId?: string;
}

export function PovEditorProvider({ children, povId }: PovEditorProviderProps) {
  // Initialize state
  const [state, dispatch] = useReducer(editorReducer, initialState);
  
  // Query client for cache invalidation
  const queryClient = useQueryClient();
  
  // Fetch data if editing existing POV
  const { isLoading, data: povData, error: povError } = useQuery({
    queryKey: ['pov', povId],
    queryFn: () => fetchPovData(povId!),
    enabled: !!povId,
  });

  // Handle successful data fetch
  useEffect(() => {
    if (povData) {
      // Transform API data to normalized state structure
      const normalizedData = normalizeApiData(povData);
      dispatch({ type: 'INITIALIZE_STATE', state: normalizedData });
    }
  }, [povData]);

  // Handle error
  useEffect(() => {
    if (povError) {
      // Error loading POV - toast notification would be shown here
    }
  }, [povError]);
  
  // Save mutation
  const { mutate, isPending: isSaving } = useMutation({
    mutationFn: (data: any) => savePovData(povId, data),
    onMutate: async (data) => {
      // Optimistic update logic - but don't update cache to prevent duplicates
      await queryClient.cancelQueries({ queryKey: ['pov', povId] });
      const previousData = queryClient.getQueryData(['pov', povId]);
      
      // CRITICAL FIX: Don't set optimistic data in cache to prevent duplicates
      // Let the server response be the single source of truth
      
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });
      
      return { previousData };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (povId && context?.previousData) {
        queryClient.setQueryData(['pov', povId], context.previousData);
      }
      
      // Error saving POV - toast notification would be shown here
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    },
    onSuccess: (responseData) => {
      // Update state with server response to replace temporary entities
      // Transform server response and update local state
      const normalizedData = normalizeApiData(responseData);
      dispatch({ type: 'INITIALIZE_STATE', state: normalizedData });
      
      // Update cache with server response
      if (povId) {
        queryClient.setQueryData(['pov', povId], responseData);
      } else {
        // Handle new POV creation - redirect to edit page
        // This would be handled in the component using this context
      }
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['povs-list'] });
      
      dispatch({ type: 'MARK_CLEAN' });
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
      // Success - toast notification would be shown here
    },
    onSettled: () => {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  });
  
  // Validate state before saving
  const validateState = useCallback(() => {
    const errors = validateEditorState(state);
    dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
    return Object.keys(errors).length === 0;
  }, [state]);
  
  // Save data
  const saveData = useCallback(async () => {
    if (!validateState()) {
      // Validation errors - toast notification would be shown here
      return;
    }
    
    // Transform normalized state to API format
    const apiData = denormalizeStateForApi(state);
    
    // Execute mutation
    mutate(apiData);
  }, [state, mutate, validateState]);
  
  // Helper functions for components
  const updateField = useCallback((path: string[], value: any) => {
    dispatch({ type: 'SET_FIELD', path, value });
  }, []);
  
  const addEntity = useCallback((entityType: string, entity: any) => {
    // No duplicate prevention - let the system handle duplicates naturally
    const id = entity.id || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    dispatch({ type: 'ADD_ENTITY', entityType, entity: { ...entity, id } });
    return id;
  }, []);
  
  const updateEntity = useCallback((entityType: string, id: string, updates: any) => {
    dispatch({ type: 'UPDATE_ENTITY', entityType, id, updates });
  }, []);
  
  const removeEntity = useCallback((entityType: string, id: string) => {
    dispatch({ type: 'REMOVE_ENTITY', entityType, id });
  }, []);
  
  const reorderRelationship = useCallback((relationshipKey: string, newOrder: string[]) => {
    dispatch({ type: 'REORDER_RELATIONSHIP', relationshipKey, newOrder });
  }, []);
  
  const setActiveTab = useCallback((tab: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', tab });
  }, []);
  
  // Check if there are validation errors
  const hasErrors = useMemo(() => {
    return Object.keys(state.ui.validationErrors).length > 0;
  }, [state.ui.validationErrors]);
  
  // Create context value
  const contextValue = useMemo(() => ({
    state,
    dispatch,
    updateField,
    addEntity,
    updateEntity,
    removeEntity,
    reorderRelationship,
    saveData,
    setActiveTab,
    isLoading,
    isSaving,
    hasErrors,
  }), [
    state,
    dispatch,
    updateField,
    addEntity,
    updateEntity,
    removeEntity,
    reorderRelationship,
    saveData,
    setActiveTab,
    isLoading,
    isSaving,
    hasErrors
  ]);
  
  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
}

// Custom hook for components to use
export function useEditorContext() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditorContext must be used within a PovEditorProvider');
  }
  return context;
}
