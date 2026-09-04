import { Template, Stage, Task } from '../types';

/**
 * Validation error type
 */
export interface ValidationError {
  message: string;
  type: 'error' | 'warning';
  field?: string;
  stageId?: string;
  taskId?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a template
 */
export function validateTemplate(template: Template): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate template name
  if (!template.name || template.name.trim() === '') {
    errors.push({
      message: 'Template name is required',
      type: 'error',
      field: 'name',
    });
  }

  // Validate template description
  if (!template.description || template.description.trim() === '') {
    errors.push({
      message: 'Template description is required',
      type: 'error',
      field: 'description',
    });
  }

  // Validate stages
  if (!template.stages || template.stages.length === 0) {
    errors.push({
      message: 'At least one stage is required',
      type: 'error',
      field: 'stages',
    });
  } else {
    // Validate each stage
    template.stages.forEach((stage) => {
      validateStage(stage, errors);
    });

    // Validate task dependencies
    validateTaskDependencies(template, errors);
  }

  return {
    isValid: errors.filter(e => e.type === 'error').length === 0,
    errors,
  };
}

/**
 * Validates a stage
 */
function validateStage(stage: Stage, errors: ValidationError[]): void {
  // Validate stage name
  if (!stage.name || stage.name.trim() === '') {
    errors.push({
      message: `Stage name is required`,
      type: 'error',
      field: 'name',
      stageId: stage.id,
    });
  }

  // Validate stage tasks
  if (!stage.tasks || stage.tasks.length === 0) {
    errors.push({
      message: `Stage "${stage.name || 'Unnamed stage'}" must have at least one task`,
      type: 'error',
      field: 'tasks',
      stageId: stage.id,
    });
  } else {
    // Validate each task
    stage.tasks.forEach((task) => {
      validateTask(task, stage, errors);
    });
  }
}

/**
 * Validates a task
 */
function validateTask(task: Task, stage: Stage, errors: ValidationError[]): void {
  // Validate task title
  if ((!task.title || task.title.trim() === '') && (!task.name || task.name.trim() === '')) {
    errors.push({
      message: `Task title is required in stage "${stage.name || 'Unnamed stage'}"`,
      type: 'error',
      field: 'title',
      stageId: stage.id,
      taskId: task.id,
    });
  }

  // Validate task type
  if (!task.type || task.type.trim() === '') {
    errors.push({
      message: `Task type is required for task "${task.title || task.name || 'Unnamed task'}" in stage "${stage.name || 'Unnamed stage'}"`,
      type: 'error',
      field: 'type',
      stageId: stage.id,
      taskId: task.id,
    });
  }
}

/**
 * Validates task dependencies
 */
function validateTaskDependencies(template: Template, errors: ValidationError[]): void {
  // Create a map of all tasks for quick lookup
  const taskMap = new Map<string, { task: Task; stage: Stage }>();
  
  template.stages.forEach((stage) => {
    stage.tasks.forEach((task) => {
      taskMap.set(task.id, { task, stage });
    });
  });

  // Check each task's dependencies
  template.stages.forEach((stage) => {
    stage.tasks.forEach((task) => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach((dependency) => {
          // Ensure dependency is a valid object before accessing taskId
          if (!dependency || typeof dependency !== 'object' || !('taskId' in dependency)) {
            errors.push({
              message: `Task "${task.title || task.name || 'Unnamed task'}" has an invalid dependency entry`,
              type: 'error',
              field: 'dependencies',
              stageId: stage.id,
              taskId: task.id,
            });
            return; // Skip to the next dependency
          }
          // Check if the dependency exists
          const dependencyTask = taskMap.get(dependency.taskId);
          
          if (!dependencyTask) {
            errors.push({
              message: `Task "${task.title || task.name || 'Unnamed task'}" depends on a non-existent task`,
              type: 'error',
              field: 'dependencies',
              stageId: stage.id,
              taskId: task.id,
            });
          }
        });
      }
    });
  });

  // Check for circular dependencies
  checkCircularDependencies(template, errors);
}

/**
 * Checks for circular dependencies in the template
 */
function checkCircularDependencies(template: Template, errors: ValidationError[]): void {
  // Create a dependency graph
  const graph = new Map<string, string[]>();
  
  // Initialize the graph with all tasks
  template.stages.forEach((stage) => {
    stage.tasks.forEach((task) => {
      graph.set(task.id, []);
    });
  });

  // Add dependencies to the graph
  template.stages.forEach((stage) => {
    stage.tasks.forEach((task) => {
      if (task.dependencies && task.dependencies.length > 0) {
        const dependencies = task.dependencies.map((dep) => dep.taskId);
        graph.set(task.id, dependencies);
      }
    });
  });

  // Check for cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (taskId: string): boolean => {
    // Mark the current node as visited and add to recursion stack
    visited.add(taskId);
    recursionStack.add(taskId);

    // Visit all the adjacent vertices
    const dependencies = graph.get(taskId) || [];
    
    for (const dependencyId of dependencies) {
      // If the dependency is not visited, check if it leads to a cycle
      if (!visited.has(dependencyId)) {
        if (hasCycle(dependencyId)) {
          return true;
        }
      } 
      // If the dependency is in the recursion stack, there is a cycle
      else if (recursionStack.has(dependencyId)) {
        // Find the task and stage for the error message
        let taskName = 'Unknown task';
        let stageName = 'Unknown stage';
        let stageId = '';
        
        // Use the current taskId that has the circular dependency
        const currentTaskId = taskId;
        
        template.stages.forEach((stage) => {
          stage.tasks.forEach((task) => {
            if (task.id === currentTaskId) {
              taskName = task.title || task.name || 'Unnamed task';
              stageName = stage.name || 'Unnamed stage';
              stageId = stage.id;
            }
          });
        });
        
        errors.push({
          message: `Circular dependency detected involving task "${taskName}" in stage "${stageName}"`,
          type: 'error',
          field: 'dependencies',
          stageId,
          taskId: currentTaskId,
        });
        
        return true;
      }
    }

    // Remove the task from the recursion stack
    recursionStack.delete(taskId);
    return false;
  };

  // Check each task for cycles
  for (const taskId of graph.keys()) {
    if (!visited.has(taskId)) {
      hasCycle(taskId);
    }
  }
}
