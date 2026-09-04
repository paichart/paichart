import { Stage, Task } from '../types';

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  field?: string;
  stageName?: string; // Updated from stageId
  taskId?: string; // Use taskId instead of taskKey
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a phase template
 * @param name Template name
 * @param description Template description
 * @param stages Template stages
 * @returns Validation result
 */
export function validateTemplate(
  name: string,
  description: string,
  stages: Stage[]
): ValidationResult {
  const errors: ValidationError[] = [];
  
  // Validate template name
  if (!name.trim()) {
    errors.push({
      type: 'error',
      message: 'Template name is required',
      field: 'name'
    });
  }
  
  // Validate stages
  if (stages.length === 0) {
    errors.push({
      type: 'error',
      message: 'At least one stage is required',
      field: 'stages'
    });
  }
  
  // Validate each stage
  stages.forEach(stage => {
    if (!stage.name.trim()) {
      errors.push({
        type: 'error',
        message: 'Stage name is required',
        field: 'stage.name',
        stageName: stage.name // Use stageName
      });
    }
    
    // Validate tasks
    if (stage.tasks.length === 0) {
      errors.push({
        type: 'warning',
        message: 'Stage has no tasks',
        field: 'stage.tasks',
        stageName: stage.name // Use stageName
      });
    }
    
    // Validate each task
    stage.tasks.forEach(task => {
      if (!task.title.trim()) { // Use task.title
        errors.push({
          type: 'error',
          message: 'Task title is required', // Update message
          field: 'task.title', // Update field
          stageName: stage.name, // Use stageName
          taskId: task.id // Use taskId
        });
      }
      
      // Validate task dependencies
      if (task.dependencies && task.dependencies.length > 0) {
        // Check for circular dependencies
        const circularDeps = checkCircularDependencies(stages, task.id); // Use task.id
        if (circularDeps) {
          errors.push({
            type: 'error',
            message: 'Circular dependency detected',
            field: 'task.dependencies',
            stageName: stage.name, // Use stageName
            taskId: task.id // Use taskId
          });
        }
        
        // Check for invalid dependencies
        task.dependencies.forEach(depId => { // Use depId
          const depTask = findTaskById(stages, depId); // Use findTaskById
          if (!depTask) {
            errors.push({
              type: 'error',
              message: `Dependency references non-existent task id: ${depId}`, // Update message
              field: 'task.dependencies',
              stageName: stage.name, // Use stageName
              taskId: task.id // Use taskId
            });
          }
        });
      }
    });
  });
  
  return {
    isValid: errors.filter(e => e.type === 'error').length === 0,
    errors
  };
}

/**
 * Checks for circular dependencies starting from a task id
 * @param stages All stages
 * @param startTaskId The id of the task to start checking from
 * @param visited Set of visited task ids
 * @returns True if a circular dependency is found
 */
function checkCircularDependencies(
  stages: Stage[],
  startTaskId: string,
  visited: Set<string> = new Set()
): boolean {
  // If we've already visited this task id in the current path, we have a circular dependency
  if (visited.has(startTaskId)) {
    return true;
  }
  
  // Add this task id to the visited set for the current path
  visited.add(startTaskId);
  
  // Find the task by its id
  const task = findTaskById(stages, startTaskId);
  if (!task) {
    // If the task is not found, it's an invalid dependency, not a circular one in this context.
    // Remove from visited set before returning.
    visited.delete(startTaskId);
    return false;
  }
  
  // Check each dependency of the current task
  if (task.dependencies && task.dependencies.length > 0) {
    for (const depId of task.dependencies) {
      // Recursively check dependencies, passing the same visited set
      if (checkCircularDependencies(stages, depId, visited)) {
        return true;
      }
    }
  }
  
  // Remove from visited set before returning from this path
  // This is crucial for correctly identifying cycles in a graph
  visited.delete(startTaskId);
  
  return false;
}

/**
 * Finds a task by id across all stages
 * @param stages All stages
 * @param taskId Task id to find
 * @returns Task or undefined if not found
 */
function findTaskById(stages: Stage[], taskId: string): Task | undefined {
  for (const stage of stages) {
    const task = stage.tasks.find(t => t.id === taskId); // Use task.id
    if (task) {
      return task;
    }
  }
  return undefined;
}
