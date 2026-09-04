import { useState, useCallback, useMemo } from 'react';
import { Template, Stage, Task } from '../../../types';

/**
 * Hook for managing the state of the split view
 */
export function useSplitViewState(
  template: Template,
  onTemplateChange: (template: Template) => void
) {
  // State for selected stage and task
  const [selectedStageId, setSelectedStageId] = useState<string | null>(
    template.stages.length > 0 ? template.stages[0].id : null
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // Memoize stages to avoid unnecessary re-renders
  const stages = useMemo(() => template.stages, [template.stages]);
  
  // Get stage by ID
  const getStageById = useCallback(
    (stageId: string) => {
      return template.stages.find(stage => stage.id === stageId) || null;
    },
    [template.stages]
  );
  
  // Get task by ID
  const getTaskById = useCallback(
    (taskId: string) => {
      for (const stage of template.stages) {
        const task = stage.tasks.find(task => task.id === taskId);
        if (task) {
          return task;
        }
      }
      return null;
    },
    [template.stages]
  );
  
  // Get tasks for a stage
  const getTasksForStage = useCallback(
    (stageId: string) => {
      const stage = getStageById(stageId);
      return stage ? stage.tasks : [];
    },
    [getStageById]
  );
  
  // Update a stage
  const updateStage = useCallback(
    (stageId: string, updatedStage: Partial<Stage>) => {
      const updatedTemplate = {
        ...template,
        stages: template.stages.map(stage => {
          if (stage.id === stageId) {
            return {
              ...stage,
              ...updatedStage
            };
          }
          return stage;
        })
      };
      
      onTemplateChange(updatedTemplate);
    },
    [template, onTemplateChange]
  );
  
  // Update a task
  const updateTask = useCallback(
    (taskId: string, stageId: string, updatedTask: Partial<Task>) => {
      const updatedTemplate = {
        ...template,
        stages: template.stages.map(stage => {
          if (stage.id === stageId) {
            return {
              ...stage,
              tasks: stage.tasks.map(task => {
                if (task.id === taskId) {
                  return {
                    ...task,
                    ...updatedTask
                  };
                }
                return task;
              })
            };
          }
          return stage;
        })
      };
      
      onTemplateChange(updatedTemplate);
    },
    [template, onTemplateChange]
  );
  
  // Move a task to a different stage
  const moveTask = useCallback(
    (taskId: string, fromStageId: string, toStageId: string) => {
      // Find the task
      const fromStage = getStageById(fromStageId);
      const task = fromStage?.tasks.find(t => t.id === taskId);
      
      if (!fromStage || !task) return;
      
      // Create updated template
      const updatedTemplate = {
        ...template,
        stages: template.stages.map(stage => {
          if (stage.id === fromStageId) {
            // Remove task from source stage
            return {
              ...stage,
              tasks: stage.tasks.filter(t => t.id !== taskId)
            };
          } else if (stage.id === toStageId) {
            // Add task to target stage
            return {
              ...stage,
              tasks: [...stage.tasks, { ...task, stageId: toStageId }]
            };
          }
          return stage;
        })
      };
      
      onTemplateChange(updatedTemplate);
      
      // Update selected task's stage
      if (selectedTaskId === taskId) {
        setSelectedStageId(toStageId);
      }
    },
    [template, getStageById, selectedTaskId, onTemplateChange]
  );
  
  return {
    selectedStageId,
    selectedTaskId,
    setSelectedStageId,
    setSelectedTaskId,
    getStageById,
    getTaskById,
    updateStage,
    updateTask,
    moveTask,
    stages,
    getTasksForStage
  };
}
