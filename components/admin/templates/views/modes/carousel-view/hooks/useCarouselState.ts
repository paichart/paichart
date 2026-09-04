import { useState, useCallback, useMemo } from 'react';
import { Template, Stage, Task } from '../../../types';

interface PinnedTask {
  id: string;
  stageId: string;
  task: Task;
}

/**
 * Custom hook for managing carousel view state
 */
export const useCarouselState = (
  template: Template,
  onTemplateChange: (template: Template) => void
) => {
  // Current stage index
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  
  // Pinned tasks
  const [pinnedTasks, setPinnedTasks] = useState<PinnedTask[]>([]);
  
  // Memoize stages
  const stages = useMemo(() => template.stages, [template.stages]);
  
  // Pin a task
  const pinTask = useCallback((stageId: string, taskId: string) => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;
    
    const task = stage.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    setPinnedTasks(prev => {
      // Check if task is already pinned
      if (prev.some(pt => pt.id === taskId && pt.stageId === stageId)) {
        return prev;
      }
      
      return [...prev, { id: taskId, stageId, task }];
    });
  }, [stages]);
  
  // Unpin a task
  const unpinTask = useCallback((stageId: string, taskId: string) => {
    setPinnedTasks(prev => 
      prev.filter(pt => !(pt.id === taskId && pt.stageId === stageId))
    );
  }, []);
  
  // Update a stage
  const updateStage = useCallback((stageId: string, updatedStage: Partial<Stage>) => {
    const newTemplate = { ...template };
    const stageIndex = newTemplate.stages.findIndex(s => s.id === stageId);
    
    if (stageIndex === -1) return;
    
    newTemplate.stages[stageIndex] = {
      ...newTemplate.stages[stageIndex],
      ...updatedStage
    };
    
    onTemplateChange(newTemplate);
  }, [template, onTemplateChange]);
  
  // Update a task
  const updateTask = useCallback((stageId: string, taskId: string, updatedTask: Partial<Task>) => {
    const newTemplate = { ...template };
    const stageIndex = newTemplate.stages.findIndex(s => s.id === stageId);
    
    if (stageIndex === -1) return;
    
    const taskIndex = newTemplate.stages[stageIndex].tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) return;
    
    newTemplate.stages[stageIndex].tasks[taskIndex] = {
      ...newTemplate.stages[stageIndex].tasks[taskIndex],
      ...updatedTask
    };
    
    onTemplateChange(newTemplate);
    
    // Update pinned task if it exists
    setPinnedTasks(prev => {
      const pinnedTaskIndex = prev.findIndex(pt => pt.id === taskId && pt.stageId === stageId);
      
      if (pinnedTaskIndex === -1) return prev;
      
      const newPinnedTasks = [...prev];
      newPinnedTasks[pinnedTaskIndex] = {
        ...newPinnedTasks[pinnedTaskIndex],
        task: {
          ...newPinnedTasks[pinnedTaskIndex].task,
          ...updatedTask
        }
      };
      
      return newPinnedTasks;
    });
  }, [template, onTemplateChange]);
  
  return {
    currentStageIndex,
    setCurrentStageIndex,
    pinnedTasks,
    pinTask,
    unpinTask,
    updateStage,
    updateTask,
    stages
  };
};
