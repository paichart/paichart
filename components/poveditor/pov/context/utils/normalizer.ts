import { POVStatus, TaskType, TaskPriority } from '@prisma/client';
import { EditorState, Phase, Stage, Task, TeamMember, KPI } from '../types';

/**
 * Transform API data to normalized state structure
 * @param apiData The data from the API
 * @returns Partial editor state with normalized data
 */
export function normalizeApiData(apiData: any): Partial<EditorState> {
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
  
  // Extract phase template IDs from all possible locations
  let phaseTemplateIds: string[] = [];
  
  // Check direct phaseTemplateIds property
  if (apiData.phaseTemplateIds && Array.isArray(apiData.phaseTemplateIds)) {
    phaseTemplateIds = [...apiData.phaseTemplateIds];
  }
  // Check metadata.phaseTemplates
  else if (apiData.metadata && apiData.metadata.phaseTemplates &&
           Array.isArray(apiData.metadata.phaseTemplates)) {
    phaseTemplateIds = [...apiData.metadata.phaseTemplates];
  }
  // Check schema.metadata.phaseTemplates for templates
  else if (apiData.schema) {
    const schema = typeof apiData.schema === 'string'
      ? JSON.parse(apiData.schema)
      : apiData.schema;

    if (schema.metadata && Array.isArray(schema.metadata.phaseTemplates)) {
      phaseTemplateIds = [...schema.metadata.phaseTemplates];
    }
  }

  // Check localStorage for cached phase template IDs
  try {
    const cacheKey = apiData.id || 'current';
    const cachedData = localStorage.getItem(`phaseTemplates_${cacheKey}`);
    if (cachedData) {
      const cachedIds = JSON.parse(cachedData);
      if (Array.isArray(cachedIds) && cachedIds.length > 0) {
        // Use cached IDs if we didn't find any from the API data
        if (phaseTemplateIds.length === 0) {
          phaseTemplateIds = cachedIds;
        }
      }
    }
  } catch {
    // Could not read cached phase templates - continue without them
  }
  
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
    // CRM fields
    opportunityName: apiData.opportunityName,
    revenue: apiData.revenue,
    forecastDate: apiData.forecastDate,
    partnerName: apiData.partnerName,
    partnerContact: apiData.partnerContact,
    competitors: apiData.competitors || [],
    // Resources
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
    // Phase templates
    phaseTemplateIds: phaseTemplateIds,
    // Metadata (preserves isDemo for DEMO_USER access)
    metadata: apiData.metadata,
    // Tags (high-query categorization - column field, use ?? to preserve empty arrays)
    tags: apiData.tags ?? [],
  };

  // Normalize phases
  if (apiData.phases) {
    apiData.phases.forEach((phase: any) => {
      entities.phases[phase.id] = {
        id: phase.id,
        name: phase.name,
        description: phase.description,
        type: phase.type,
        startDate: phase.startDate,
        endDate: phase.endDate,
        order: phase.order,
      };
      
      // Only add to phaseOrder if not already present (prevents duplicates)
      if (!relationships.phaseOrder.includes(phase.id)) {
        relationships.phaseOrder.push(phase.id);
      }
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
              // FIXED: Extract modelParameters from task.metadata.modelParameters
              const modelParameters = task.metadata?.modelParameters || task.modelParameters;

              entities.tasks[task.id] = {
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                type: task.type || TaskType.ACTION,
                priority: task.priority || TaskPriority.MEDIUM,
                assigneeId: task.assigneeId,
                assignee: task.assignee, // 🔧 FIX: Store the full assignee object
                dueDate: task.dueDate,
                povId: apiData.id,  // 2026-04-20: needed by PipelineTab
                phaseId: phase.id,
                stageId: stage.id,
                order: task.order ?? 0,
                // FIXED: Include agent-related fields
                agentRole: task.agentRole,
                prompt: task.prompt,
                agentTemplateId: task.agentTemplateId,
                agentTemplate: task.agentTemplate,
                inputContext: task.inputContext,
                outputArtifacts: task.outputArtifacts,
                executionStatus: task.executionStatus,
                agentLog: task.agentLog,
                maxRetries: task.maxRetries,
                timeout: task.timeout,
                // FIXED: Extract modelParameters from metadata
                modelParameters: modelParameters,
                // FIXED: Store full metadata including mcpConfiguration
                metadata: task.metadata,
                // 🔧 FIX: Store comments
                comments: task.comments || [],
                // Task dependency edges from taskFullSelect (see EntityTypes.TaskDependency)
                dependencies: task.dependencies ?? [],
                dependents: task.dependents ?? [],
                // 🎯 FIX: Include unified storage fields for MCP configuration
                mcpContext: task.mcpContext,
                mcpMetadata: task.mcpMetadata,
                mcpToolId: task.mcpToolId,
                mcpWorkflowId: task.mcpWorkflowId,
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
            // FIXED: Extract modelParameters from task.metadata.modelParameters
            const modelParameters = task.metadata?.modelParameters || task.modelParameters;

            entities.tasks[task.id] = {
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              type: task.type || TaskType.ACTION,
              priority: task.priority || TaskPriority.MEDIUM,
              assigneeId: task.assigneeId,
              assignee: task.assignee, // 🔧 FIX: Store the full assignee object for phase tasks too
              dueDate: task.dueDate,
              povId: apiData.id,  // 2026-04-20: needed by PipelineTab
              phaseId: phase.id,
              order: task.order ?? 0,
              // FIXED: Include agent-related fields for phase tasks too
              agentRole: task.agentRole,
              prompt: task.prompt,
              agentTemplateId: task.agentTemplateId,
              agentTemplate: task.agentTemplate,
              inputContext: task.inputContext,
              outputArtifacts: task.outputArtifacts,
              executionStatus: task.executionStatus,
              agentLog: task.agentLog,
              maxRetries: task.maxRetries,
              timeout: task.timeout,
              // FIXED: Extract modelParameters from metadata
              modelParameters: modelParameters,
              // FIXED: Store full metadata including mcpConfiguration
              metadata: task.metadata,
              // 🔧 FIX: Store comments for phase tasks too
              comments: task.comments || [],
              // Task dependency edges from taskFullSelect (see EntityTypes.TaskDependency)
              dependencies: task.dependencies ?? [],
              dependents: task.dependents ?? [],
              // 🎯 FIX: Include unified storage fields for MCP configuration (phase tasks)
              mcpContext: task.mcpContext,
              mcpMetadata: task.mcpMetadata,
              mcpToolId: task.mcpToolId,
              mcpWorkflowId: task.mcpWorkflowId,
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

  // First check if we have team members in the API data
  if (apiData.teamMembers && Array.isArray(apiData.teamMembers)) {
    // Process team members from the API data
    apiData.teamMembers.forEach((member: any) => {
      if (!member.userId) return;
      
      // Extract team roles
      if (member.role === 'PROJECT_MANAGER') {
        projectManager.push(member.userId);
      } else if (member.role === 'SALES_ENGINEER') {
        salesEngineers.push(member.userId);
      } else if (member.role === 'TECHNICAL_TEAM') {
        technicalTeam.push(member.userId);
      }
    });
  }
  
  // Then check if we have team members in the team object
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
      
      // Extract team roles if not already extracted
      if (member.role === 'PROJECT_MANAGER' && projectManager.length === 0) {
        projectManager.push(member.user.id);
      } else if (member.role === 'SALES_ENGINEER') {
        if (!salesEngineers.includes(member.user.id)) {
          salesEngineers.push(member.user.id);
        }
      } else if (member.role === 'TECHNICAL_TEAM') {
        if (!technicalTeam.includes(member.user.id)) {
          technicalTeam.push(member.user.id);
        }
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

/**
 * Clean temporary IDs before sending to API
 * @param data The data to clean
 * @returns The cleaned data
 */
export function cleanTemporaryIds(data: any): any {
  if (!data) return data;
  
  if (Array.isArray(data)) {
    // Create a new array with cleaned items to avoid modifying the original
    return data.map(item => cleanTemporaryIds(item));
  } else if (typeof data === 'object') {
    // Create a shallow copy of the object to avoid modifying the original
    const cleanedData = { ...data };
    
    // Remove id if it's a temporary ID
    if (cleanedData.id && typeof cleanedData.id === 'string' && cleanedData.id.startsWith('temp-')) {
      delete cleanedData.id;
    }
    
    // Process all properties recursively
    Object.keys(cleanedData).forEach(key => {
      if (typeof cleanedData[key] === 'object' && cleanedData[key] !== null) {
        cleanedData[key] = cleanTemporaryIds(cleanedData[key]);
      }
    });
    
    return cleanedData;
  }
  
  // Return primitives as is
  return data;
}

/**
 * Transform normalized state to API format
 * @param state The editor state
 * @returns Data in the format expected by the API
 */
export function denormalizeStateForApi(state: EditorState): any {
  const { data, entities, relationships } = state;
  
  // Check if this is template-based mode
  if (state.ui?.mode === 'template-based' && (data as any).templateId) {
    // For template-based creation, send the specific format the API expects
    const templateApiData = {
      templateId: (data as any).templateId,
      formData: {
        // Basic POV info
        title: data.title,
        description: data.description,
        objective: data.objective,
        customerName: data.customerName,
        customerContact: data.customerContact,
        // CRM fields
        opportunityName: data.opportunityName,
        revenue: data.revenue,
        forecastDate: data.forecastDate,
        partnerName: data.partnerName,
        partnerContact: data.partnerContact,
        competitors: data.competitors || [],
        solution: data.solution,
        // Geographical data
        salesTheatre: data.salesTheatre,
        countryId: data.countryId,
        regionId: data.regionId,
        // Team data
        projectManager: data.projectManager,
        salesEngineers: data.salesEngineers || [],
        technicalTeam: data.technicalTeam || [],
        // Template field values (if any)
        templateFieldValues: (data as any).templateFieldValues || {},
        // Dates
        startDate: data.startDate,
        endDate: data.endDate,
        // Status and priority
        status: data.status || 'PLANNING',
        priority: data.priority || 'MEDIUM',
      },
      // Include phase template IDs if available
      phaseTemplateIds: data.phaseTemplateIds || []
    };

    return templateApiData;
  }
  
  // Create a deep copy of the data
  const apiData = {
    ...data,
    phases: [] as any[],
    team: [] as any[],
    kpis: [] as any[],
    teamName: data.teamName || `${data.title} Team`, // Use "POV Title Team" as default team name
    // Tags (high-query categorization - column field, use ?? to preserve empty arrays)
    tags: (data as any).tags ?? [],
    // Preserve existing metadata first, then add defaults only if missing
    metadata: {
      ...((data as any).metadata || {}),  // Existing metadata FIRST (preserves isDemo!)
      customer: (data as any).metadata?.customer || data.customerName || 'Unknown',
      teamSize: (data as any).metadata?.teamSize || '1-5',
      successCriteria: (data as any).metadata?.successCriteria || 'Not specified',
      technicalRequirements: (data as any).metadata?.technicalRequirements || 'Not specified',
    },
  };
  
  // Handle country and region IDs correctly for Prisma
  if (apiData.countryId) {
    // Keep the countryId field for validation
    // AND add the nested country object for Prisma
    (apiData as any).country = {
      connect: { id: apiData.countryId }
    };
    // Don't delete countryId, as it's needed for validation
  }
  
  if (apiData.regionId) {
    // Keep the regionId field for validation
    // AND add the nested region object for Prisma
    (apiData as any).region = {
      connect: { id: apiData.regionId }
    };
    // Don't delete regionId, as it might be needed for validation
  }
  
  // Ensure phaseTemplateIds are included in the metadata
  if (data.phaseTemplateIds && Array.isArray(data.phaseTemplateIds) && data.phaseTemplateIds.length > 0) {
    // Initialize metadata if it doesn't exist
    if (!(apiData as any).metadata) {
      (apiData as any).metadata = {};
    }
    
    // Add phaseTemplates to metadata
    (apiData as any).metadata = {
      ...(apiData as any).metadata,
      phaseTemplates: data.phaseTemplateIds
    };
  }
  
  // Denormalize phases with their stages and tasks
  if (relationships.phaseOrder && relationships.phaseOrder.length > 0) {
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

              // FIXED: Preserve existing metadata and add modelParameters (including null values)
              const taskObj = {
                ...task,
                metadata: {
                  ...(task.metadata || {}),
                  // FIXED: Include modelParameters even if null (for clearing)
                  ...(task.modelParameters !== undefined ? { modelParameters: task.modelParameters } : {})
                }
              };

              // Remove modelParameters from top level since it's now in metadata
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

          // FIXED: Preserve existing metadata and add modelParameters (including null values)
          const taskObj = {
            ...task,
            metadata: {
              ...(task.metadata || {}),
              // FIXED: Include modelParameters even if null (for clearing)
              ...(task.modelParameters !== undefined ? { modelParameters: task.modelParameters } : {})
            }
          };

          // Remove modelParameters from top level since it's now in metadata
          delete taskObj.modelParameters;

          return taskObj;
        });
      }
      
      return phaseObj;
    });
  }
  
  // IMPORTANT FIX: Include tasks, stages, and phases separately in the API request
  // This ensures that any edited tasks are included in the API request
  const tasks = Object.values(entities.tasks).map(task => {
    // FIXED: Preserve existing metadata (including mcpConfiguration) and add modelParameters (including null values)
    const taskObj = {
      ...task,
      metadata: {
        ...(task.metadata || {}),
        // FIXED: Include modelParameters even if null (for clearing)
        ...(task.modelParameters !== undefined ? { modelParameters: task.modelParameters } : {})
      }
    };
    
    // Remove modelParameters from top level since it's now in metadata
    delete taskObj.modelParameters;
    
    return taskObj;
  });
  const stages = Object.values(entities.stages);

  (apiData as any).tasks = tasks;
  (apiData as any).stages = stages;
  
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

  // IMPORTANT FIX: Set a flag to indicate that team members should replace existing ones
  // (server-side: applyTeamUpdate preserves OWNER rows on replace — 78a5dc88)
  (apiData as any).replaceTeamMembers = true;

  // Bug Class 81 #5 (2026-08-19): explicit phase-deletion list. The server deletes ONLY
  // these ids (verified to belong to this POV) — phase deletion is no longer inferred
  // from payload omission, so concurrently-created phases survive this save.
  const deletedPhaseIds = (state as any).ui?.deletedPhaseIds as string[] | undefined;
  (apiData as any).deletedPhaseIds = deletedPhaseIds && deletedPhaseIds.length > 0 ? deletedPhaseIds : undefined;
  
  // Keep the original team data for reference
  apiData.team = Object.values(entities.team);
  
  // Denormalize KPIs
  apiData.kpis = Object.values(entities.kpis);
  
  // Clean temporary IDs - create a new object instead of modifying in place
  return cleanTemporaryIds(apiData);
}
