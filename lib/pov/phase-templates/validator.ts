import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { PhaseTemplate, Stage, Task } from './types';
import { templateSchema, stageSchema, taskSchema } from './schema';
import { ApiError } from '@/lib/errors';

/**
 * Validator for Phase templates
 */
export class SchemaValidator {
  private static instance: SchemaValidator;
  private ajv: Ajv;
  private validators: {
    template: ReturnType<Ajv['compile']>;
    stage: ReturnType<Ajv['compile']>;
    task: ReturnType<Ajv['compile']>;
  };

  private constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    
    this.validators = {
      template: this.ajv.compile(templateSchema),
      stage: this.ajv.compile(stageSchema),
      task: this.ajv.compile(taskSchema)
    };
  }

  public static getInstance(): SchemaValidator {
    if (!SchemaValidator.instance) {
      SchemaValidator.instance = new SchemaValidator();
    }
    return SchemaValidator.instance;
  }

  /**
   * Validate a template against the schema
   */
  public validateTemplate(template: PhaseTemplate): { valid: boolean; errors: any[] } {
    const valid = this.validators.template(template);
    return {
      valid: !!valid,
      errors: this.validators.template.errors || []
    };
  }

  /**
   * Validate a stage against the schema
   */
  public validateStage(stage: Stage): { valid: boolean; errors: any[] } {
    const valid = this.validators.stage(stage);
    return {
      valid: !!valid,
      errors: this.validators.stage.errors || []
    };
  }

  /**
   * Validate a task against the schema
   */
  public validateTask(task: Task): { valid: boolean; errors: any[] } {
    const valid = this.validators.task(task);
    return {
      valid: !!valid,
      errors: this.validators.task.errors || []
    };
  }

  /**
   * Validate dependencies between stages
   */
  public validateStageDependencies(template: PhaseTemplate): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const stageMap = new Map<string, Stage>();
    
    // Create a map of stage names for quick lookup
    template.stages.forEach(stage => {
      stageMap.set(stage.name, stage);
    });
    
    // Check dependencies
    template.stages.forEach(stage => {
      if (stage.dependencies && stage.dependencies.length > 0) {
        stage.dependencies.forEach(depName => {
          if (!stageMap.has(depName)) {
            errors.push(`Stage "${stage.name}" depends on non-existent stage "${depName}"`);
          }
        });
      }
    });
    
    // Check for circular dependencies
    template.stages.forEach(stage => {
      const visited = new Set<string>();
      const path: string[] = [];
      
      const checkCircular = (currentName: string): boolean => {
        if (path.includes(currentName)) {
          const cycle = [...path.slice(path.indexOf(currentName)), currentName];
          errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
          return true;
        }
        
        if (visited.has(currentName)) {
          return false;
        }
        
        visited.add(currentName);
        path.push(currentName);
        
        const current = stageMap.get(currentName);
        if (current && current.dependencies) {
          for (const depName of current.dependencies) {
            if (checkCircular(depName)) {
              return true;
            }
          }
        }
        
        path.pop();
        return false;
      };
      
      checkCircular(stage.name);
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate dependencies between tasks
   */
  public validateTaskDependencies(stage: Stage): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const taskMap = new Map<string, Task>();
    
    // Create a map of task ids for quick lookup
    stage.tasks.forEach(task => {
      taskMap.set(task.id, task);
    });
    
    // Check dependencies
    stage.tasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(depId => {
          if (!taskMap.has(depId)) {
            errors.push(`Task "${task.id}" depends on non-existent task "${depId}"`);
          }
        });
      }
    });
    
    // Check for circular dependencies
    stage.tasks.forEach(task => {
      const visited = new Set<string>();
      const path: string[] = [];
      
      const checkCircular = (currentId: string): boolean => {
        if (path.includes(currentId)) {
          const cycle = [...path.slice(path.indexOf(currentId)), currentId];
          errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
          return true;
        }
        
        if (visited.has(currentId)) {
          return false;
        }
        
        visited.add(currentId);
        path.push(currentId);
        
        const current = taskMap.get(currentId);
        if (current && current.dependencies) {
          for (const depId of current.dependencies) {
            if (checkCircular(depId)) {
              return true;
            }
          }
        }
        
        path.pop();
        return false;
      };
      
      checkCircular(task.id);
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Format validation errors into human-readable messages
   */
  public formatErrors(errors: any[]): string[] {
    return errors.map(error => {
      const path = error.instancePath || '';
      const property = error.params.missingProperty ? 
        `/${error.params.missingProperty}` : '';
      
      switch (error.keyword) {
        case 'required':
          return `Missing required property: ${error.params.missingProperty}`;
        case 'enum':
          return `${path}${property} must be one of: ${error.params.allowedValues.join(', ')}`;
        case 'type':
          return `${path}${property} must be a ${error.params.type}`;
        default:
          return `${path}${property} ${error.message}`;
      }
    });
  }
}

export const schemaValidator = SchemaValidator.getInstance();
