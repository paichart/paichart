import { Template, Stage, Task, TemplateCommand } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Command types for template operations
 */
export enum CommandType {
  UPDATE_TEMPLATE_INFO = 'UPDATE_TEMPLATE_INFO',
  ADD_STAGE = 'ADD_STAGE',
  UPDATE_STAGE = 'UPDATE_STAGE',
  DELETE_STAGE = 'DELETE_STAGE',
  MOVE_STAGE = 'MOVE_STAGE',
  ADD_TASK = 'ADD_TASK',
  UPDATE_TASK = 'UPDATE_TASK',
  DELETE_TASK = 'DELETE_TASK',
  MOVE_TASK = 'MOVE_TASK',
  MOVE_TASK_BETWEEN_STAGES = 'MOVE_TASK_BETWEEN_STAGES',
}

/**
 * Creates a command system for template operations
 */
export function createCommandSystem() {
  /**
   * Creates a command for updating template info
   */
  const createUpdateTemplateInfoCommand = (
    name: string,
    description: string
  ): TemplateCommand => {
    return {
      type: CommandType.UPDATE_TEMPLATE_INFO,
      payload: { name, description },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for adding a stage
   */
  const createAddStageCommand = (stage: Stage): TemplateCommand => {
    return {
      type: CommandType.ADD_STAGE,
      payload: { stage },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for updating a stage
   */
  const createUpdateStageCommand = (
    stageId: string,
    updates: Partial<Stage>
  ): TemplateCommand => {
    return {
      type: CommandType.UPDATE_STAGE,
      payload: { stageId, updates },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for deleting a stage
   */
  const createDeleteStageCommand = (stageId: string): TemplateCommand => {
    return {
      type: CommandType.DELETE_STAGE,
      payload: { stageId },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for moving a stage
   */
  const createMoveStageCommand = (
    fromIndex: number,
    toIndex: number
  ): TemplateCommand => {
    return {
      type: CommandType.MOVE_STAGE,
      payload: { fromIndex, toIndex },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for adding a task
   */
  const createAddTaskCommand = (
    stageId: string,
    task: Task
  ): TemplateCommand => {
    return {
      type: CommandType.ADD_TASK,
      payload: { stageId, task },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for updating a task
   */
  const createUpdateTaskCommand = (
    stageId: string,
    taskId: string,
    updates: Partial<Task>
  ): TemplateCommand => {
    return {
      type: CommandType.UPDATE_TASK,
      payload: { stageId, taskId, updates },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for deleting a task
   */
  const createDeleteTaskCommand = (
    stageId: string,
    taskId: string
  ): TemplateCommand => {
    return {
      type: CommandType.DELETE_TASK,
      payload: { stageId, taskId },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for moving a task within a stage
   */
  const createMoveTaskCommand = (
    stageId: string,
    fromIndex: number,
    toIndex: number
  ): TemplateCommand => {
    return {
      type: CommandType.MOVE_TASK,
      payload: { stageId, fromIndex, toIndex },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Creates a command for moving a task between stages
   */
  const createMoveTaskBetweenStagesCommand = (
    fromStageId: string,
    toStageId: string,
    taskId: string,
    toIndex: number
  ): TemplateCommand => {
    return {
      type: CommandType.MOVE_TASK_BETWEEN_STAGES,
      payload: { fromStageId, toStageId, taskId, toIndex },
      timestamp: Date.now(),
      id: uuidv4(),
    };
  };

  /**
   * Executes a command on a template
   */
  const executeCommand = (
    template: Template,
    command: TemplateCommand
  ): Template => {
    const newTemplate = JSON.parse(JSON.stringify(template)) as Template;

    switch (command.type) {
      case CommandType.UPDATE_TEMPLATE_INFO:
        newTemplate.name = command.payload.name;
        newTemplate.description = command.payload.description;
        break;

      case CommandType.ADD_STAGE:
        newTemplate.stages.push(command.payload.stage);
        break;

      case CommandType.UPDATE_STAGE:
        {
          const stageIndex = newTemplate.stages.findIndex(
            (s) => s.id === command.payload.stageId
          );
          if (stageIndex !== -1) {
            newTemplate.stages[stageIndex] = {
              ...newTemplate.stages[stageIndex],
              ...command.payload.updates,
            };
          }
        }
        break;

      case CommandType.DELETE_STAGE:
        {
          const stageIndex = newTemplate.stages.findIndex(
            (s) => s.id === command.payload.stageId
          );
          if (stageIndex !== -1) {
            newTemplate.stages.splice(stageIndex, 1);
          }
        }
        break;

      case CommandType.MOVE_STAGE:
        {
          const { fromIndex, toIndex } = command.payload;
          const stage = newTemplate.stages[fromIndex];
          newTemplate.stages.splice(fromIndex, 1);
          newTemplate.stages.splice(toIndex, 0, stage);
        }
        break;

      case CommandType.ADD_TASK:
        {
          const stageIndex = newTemplate.stages.findIndex(
            (s) => s.id === command.payload.stageId
          );
          if (stageIndex !== -1) {
            newTemplate.stages[stageIndex].tasks.push(command.payload.task);
          }
        }
        break;

      case CommandType.UPDATE_TASK:
        {
          const stageIndex = newTemplate.stages.findIndex(
            (s) => s.id === command.payload.stageId
          );
          if (stageIndex !== -1) {
            const taskIndex = newTemplate.stages[stageIndex].tasks.findIndex(
              (t) => t.id === command.payload.taskId
            );
            if (taskIndex !== -1) {
              newTemplate.stages[stageIndex].tasks[taskIndex] = {
                ...newTemplate.stages[stageIndex].tasks[taskIndex],
                ...command.payload.updates,
              };
            }
          }
        }
        break;

      case CommandType.DELETE_TASK:
        {
          const stageIndex = newTemplate.stages.findIndex(
            (s) => s.id === command.payload.stageId
          );
          if (stageIndex !== -1) {
            const taskIndex = newTemplate.stages[stageIndex].tasks.findIndex(
              (t) => t.id === command.payload.taskId
            );
            if (taskIndex !== -1) {
              newTemplate.stages[stageIndex].tasks.splice(taskIndex, 1);
            }
          }
        }
        break;

      case CommandType.MOVE_TASK:
        {
          const { stageId, fromIndex, toIndex } = command.payload;
          const stageIndex = newTemplate.stages.findIndex(
            (s) => s.id === stageId
          );
          if (stageIndex !== -1) {
            const task = newTemplate.stages[stageIndex].tasks[fromIndex];
            newTemplate.stages[stageIndex].tasks.splice(fromIndex, 1);
            newTemplate.stages[stageIndex].tasks.splice(toIndex, 0, task);
          }
        }
        break;

      case CommandType.MOVE_TASK_BETWEEN_STAGES:
        {
          const { fromStageId, toStageId, taskId, toIndex } = command.payload;
          const fromStageIndex = newTemplate.stages.findIndex(
            (s) => s.id === fromStageId
          );
          const toStageIndex = newTemplate.stages.findIndex(
            (s) => s.id === toStageId
          );
          
          if (fromStageIndex !== -1 && toStageIndex !== -1) {
            const taskIndex = newTemplate.stages[fromStageIndex].tasks.findIndex(
              (t) => t.id === taskId
            );
            
            if (taskIndex !== -1) {
              const task = newTemplate.stages[fromStageIndex].tasks[taskIndex];
              newTemplate.stages[fromStageIndex].tasks.splice(taskIndex, 1);
              newTemplate.stages[toStageIndex].tasks.splice(toIndex, 0, task);
            }
          }
        }
        break;

      default:
        // Unknown command type - ignore
        break;
    }

    return newTemplate;
  };

  return {
    createUpdateTemplateInfoCommand,
    createAddStageCommand,
    createUpdateStageCommand,
    createDeleteStageCommand,
    createMoveStageCommand,
    createAddTaskCommand,
    createUpdateTaskCommand,
    createDeleteTaskCommand,
    createMoveTaskCommand,
    createMoveTaskBetweenStagesCommand,
    executeCommand,
  };
}

export type CommandSystem = ReturnType<typeof createCommandSystem>;
