import { produce } from 'immer';
import { EditorState } from '../types';
import { dependsOn } from '../utils/taskDependencies';

/**
 * Handle adding an entity to the state
 * @param draft The draft state from Immer
 * @param entityType The type of entity to add
 * @param entity The entity to add
 */
export function handleAddEntity(draft: EditorState, entityType: string, entity: any) {
  const entityCopy = { ...entity };
  const id = entityCopy.id || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  if (!entityCopy.id) {
    entityCopy.id = id;
  }
  
  (draft.entities as any)[entityType][id] = entityCopy;
  draft.meta.isDirty = true;
  
  // Initialize relationships if needed
  if (entityType === 'phases') {
    if (!draft.relationships.phaseToTasks[id]) {
      draft.relationships.phaseToTasks[id] = [];
    }
    if (!draft.relationships.phaseToStages[id]) {
      draft.relationships.phaseToStages[id] = [];
    }
  }
  
  if (entityType === 'stages') {
    const phaseId = (entityCopy as any).phaseId;
    if (phaseId && !draft.relationships.stageToTasks[id]) {
      draft.relationships.stageToTasks[id] = [];
    }
    if (phaseId) {
      // Initialize phaseToStages relationship if it doesn't exist
      if (!draft.relationships.phaseToStages[phaseId]) {
        draft.relationships.phaseToStages[phaseId] = [];
      }
      draft.relationships.phaseToStages[phaseId].push(id);
    }
  }
  
  if (entityType === 'tasks') {
    const phaseId = (entityCopy as any).phaseId;
    const stageId = (entityCopy as any).stageId;
    
    // Add task to phase-to-tasks relationship
    if (phaseId) {
      if (!draft.relationships.phaseToTasks[phaseId]) {
        draft.relationships.phaseToTasks[phaseId] = [];
      }
      draft.relationships.phaseToTasks[phaseId].push(id);
    }
    
    // Add task to stage-to-tasks relationship
    if (stageId) {
      if (!draft.relationships.stageToTasks[stageId]) {
        draft.relationships.stageToTasks[stageId] = [];
      }
      draft.relationships.stageToTasks[stageId].push(id);
    }
  }
}

/**
 * Handle updating an entity in the state
 * @param draft The draft state from Immer
 * @param entityType The type of entity to update
 * @param id The ID of the entity to update
 * @param updates The updates to apply
 */
export function handleUpdateEntity(draft: EditorState, entityType: string, id: string, updates: any) {
  if ((draft.entities as any)[entityType][id]) {
    // Handle null updates (deletion)
    if (updates === null) {
      handleRemoveEntity(draft, entityType, id);
      return;
    }
    
    const currentEntity = (draft.entities as any)[entityType][id];
    
    // FIXED: Handle task stage reassignment by updating relationships
    if (entityType === 'tasks' && updates && updates.stageId !== undefined) {
      const oldStageId = currentEntity.stageId;
      const newStageId = updates.stageId;
      
      // Remove task from old stage relationship
      if (oldStageId && draft.relationships.stageToTasks[oldStageId]) {
        const index = draft.relationships.stageToTasks[oldStageId].indexOf(id);
        if (index !== -1) {
          draft.relationships.stageToTasks[oldStageId].splice(index, 1);
        }
      }
      
      // Add task to new stage relationship
      if (newStageId) {
        if (!draft.relationships.stageToTasks[newStageId]) {
          draft.relationships.stageToTasks[newStageId] = [];
        }
        if (!draft.relationships.stageToTasks[newStageId].includes(id)) {
          draft.relationships.stageToTasks[newStageId].push(id);
        }
      }
    }
    
    // Update the entity
    (draft.entities as any)[entityType][id] = {
      ...currentEntity,
      ...updates
    };
    draft.meta.isDirty = true;
  }
}

/**
 * Handle removing an entity from the state
 * @param draft The draft state from Immer
 * @param entityType The type of entity to remove
 * @param id The ID of the entity to remove
 */
export function handleRemoveEntity(draft: EditorState, entityType: string, id: string) {
  if ((draft.entities as any)[entityType][id]) {
    delete (draft.entities as any)[entityType][id];
    
    // Clean up relationships
    if (entityType === 'phases') {
      handleRemovePhase(draft, id);
    } else if (entityType === 'stages') {
      handleRemoveStage(draft, id);
    } else if (entityType === 'tasks') {
      handleRemoveTask(draft, id);
    }
    
    draft.meta.isDirty = true;
  }
}

/**
 * Handle removing a phase and its related entities
 * @param draft The draft state from Immer
 * @param phaseId The ID of the phase to remove
 */
function handleRemovePhase(draft: EditorState, phaseId: string) {
  // Remove phase from phaseOrder
  const index = draft.relationships.phaseOrder.indexOf(phaseId);
  if (index !== -1) {
    draft.relationships.phaseOrder.splice(index, 1);
  }
  
  // Remove phase-to-tasks relationship
  delete draft.relationships.phaseToTasks[phaseId];
  
  // Remove phase-to-stages relationship
  delete draft.relationships.phaseToStages[phaseId];
  
  // Remove tasks associated with this phase
  Object.keys(draft.entities.tasks).forEach(taskId => {
    const task = draft.entities.tasks[taskId];
    if (task.phaseId === phaseId) {
      delete draft.entities.tasks[taskId];
    }
  });
  
  // Remove stages associated with this phase
  Object.keys(draft.entities.stages).forEach(stageId => {
    const stage = draft.entities.stages[stageId];
    if (stage.phaseId === phaseId) {
      delete draft.entities.stages[stageId];
      delete draft.relationships.stageToTasks[stageId];
    }
  });
}

/**
 * Handle removing a stage and its related entities
 * @param draft The draft state from Immer
 * @param stageId The ID of the stage to remove
 */
function handleRemoveStage(draft: EditorState, stageId: string) {
  // Remove stage from phase-to-stages relationship
  Object.keys(draft.relationships.phaseToStages).forEach(phaseId => {
    const index = draft.relationships.phaseToStages[phaseId].indexOf(stageId);
    if (index !== -1) {
      draft.relationships.phaseToStages[phaseId].splice(index, 1);
    }
  });
  
  // Remove stage-to-tasks relationship
  delete draft.relationships.stageToTasks[stageId];
  
  // Update tasks associated with this stage
  Object.keys(draft.entities.tasks).forEach(taskId => {
    const task = draft.entities.tasks[taskId];
    if (task.stageId === stageId) {
      draft.entities.tasks[taskId] = {
        ...task,
        stageId: undefined
      };
    }
  });
}

/**
 * Handle removing a task and its related relationships
 * @param draft The draft state from Immer
 * @param taskId The ID of the task to remove
 */
function handleRemoveTask(draft: EditorState, taskId: string) {
  // Remove task from all phase-to-tasks relationships
  Object.keys(draft.relationships.phaseToTasks).forEach(phaseId => {
    const index = draft.relationships.phaseToTasks[phaseId].indexOf(taskId);
    if (index !== -1) {
      draft.relationships.phaseToTasks[phaseId].splice(index, 1);
    }
  });
  
  // Remove task from all stage-to-tasks relationships
  Object.keys(draft.relationships.stageToTasks).forEach(stageId => {
    const index = draft.relationships.stageToTasks[stageId].indexOf(taskId);
    if (index !== -1) {
      draft.relationships.stageToTasks[stageId].splice(index, 1);
    }
  });
  
  // Remove task dependencies
  Object.keys(draft.entities.tasks).forEach(otherTaskId => {
    const task = draft.entities.tasks[otherTaskId];
    if (dependsOn(task, taskId)) {
      draft.entities.tasks[otherTaskId] = {
        ...task,
        dependencies: task.dependencies?.filter(d => d.dependsOnId !== taskId) ?? []
      };
    }
  });
}
