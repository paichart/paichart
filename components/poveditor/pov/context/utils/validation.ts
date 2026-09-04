import { EditorState, Task } from '../types';
import { checkForDependencyCycles } from './taskDependencies';

export { checkForDependencyCycles };

/**
 * Validate the editor state
 * @param state The editor state to validate
 * @returns A record of validation errors by field path
 */
export function validateEditorState(state: EditorState): Record<string, string[]> {
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
  
  // Validate geographical data
  if (!state.data.salesTheatre) {
    errors['data.salesTheatre'] = ['Sales Theatre is required'];
  }
  
  if (!state.data.countryId) {
    errors['data.countryId'] = ['Country is required'];
  }
  
  // Validate dates
  if (!state.data.startDate) {
    errors['data.startDate'] = ['Start date is required'];
  }
  
  if (!state.data.endDate) {
    errors['data.endDate'] = ['End date is required'];
  }
  
  // Validate date ranges
  if (state.data.startDate && state.data.endDate) {
    const startDate = new Date(state.data.startDate);
    const endDate = new Date(state.data.endDate);
    
    if (startDate > endDate) {
      errors['data.endDate'] = ['End date must be after start date'];
    }
  }
  
  // Validate status and priority
  if (!state.data.status) {
    errors['data.status'] = ['Status is required'];
  }
  
  if (!state.data.priority) {
    errors['data.priority'] = ['Priority is required'];
  }
  
  // Ensure phaseTemplateIds is always an array to prevent validation errors
  if (!state.data.phaseTemplateIds) {
    state.data.phaseTemplateIds = [];
  } else if (!Array.isArray(state.data.phaseTemplateIds)) {
    state.data.phaseTemplateIds = [state.data.phaseTemplateIds].filter(Boolean);
  }
  
  // Validate phases
  Object.keys(state.entities.phases).forEach(phaseId => {
    const phase = state.entities.phases[phaseId];

    if (!phase.name) {
      errors[`entities.phases.${phaseId}.name`] = ['Phase name is required'];
    }

    if (!phase.type) {
      errors[`entities.phases.${phaseId}.type`] = ['Phase type is required'];
    }

    // Validate phase dates
    if (phase.startDate && phase.endDate) {
      const phaseStartDate = new Date(phase.startDate);
      const phaseEndDate = new Date(phase.endDate);

      if (phaseStartDate > phaseEndDate) {
        errors[`entities.phases.${phaseId}.endDate`] = ['Phase end date must be after start date'];
      }

      // Validate phase dates are within POV dates
      if (state.data.startDate && state.data.endDate) {
        const povStartDate = new Date(state.data.startDate);
        const povEndDate = new Date(state.data.endDate);

        if (phaseStartDate < povStartDate) {
          errors[`entities.phases.${phaseId}.startDate`] = ['Phase start date must be after POV start date'];
        }

        if (phaseEndDate > povEndDate) {
          errors[`entities.phases.${phaseId}.endDate`] = ['Phase end date must be before POV end date'];
        }
      }
    }
  });
  
  // Validate stages
  Object.keys(state.entities.stages).forEach(stageId => {
    const stage = state.entities.stages[stageId];

    if (!stage.name) {
      errors[`entities.stages.${stageId}.name`] = ['Stage name is required'];
    }

    if (!stage.phaseId) {
      errors[`entities.stages.${stageId}.phaseId`] = ['Stage must be associated with a phase'];
    }
  });
  
  // Validate tasks
  Object.keys(state.entities.tasks).forEach(taskId => {
    const task = state.entities.tasks[taskId];

    if (!task.title) {
      errors[`entities.tasks.${taskId}.title`] = ['Task title is required'];
    }

    if (!task.phaseId) {
      errors[`entities.tasks.${taskId}.phaseId`] = ['Task must be associated with a phase'];
    }

    // Check for circular dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      const hasCycle = checkForDependencyCycles(taskId, state.entities.tasks);
      if (hasCycle) {
        errors[`entities.tasks.${taskId}.dependencies`] = ['Circular dependency detected'];
      }
    }

    // Validate task dates
    if (task.dueDate) {
      const taskDueDate = new Date(task.dueDate);

      // Validate task due date is within phase dates
      if (task.phaseId && state.entities.phases[task.phaseId]) {
        const phase = state.entities.phases[task.phaseId];

        if (phase.endDate) {
          const phaseEndDate = new Date(phase.endDate);

          if (taskDueDate > phaseEndDate) {
            errors[`entities.tasks.${taskId}.dueDate`] = ['Task due date must be before phase end date'];
          }
        }
      }
    }
  });
  
  return errors;
}

