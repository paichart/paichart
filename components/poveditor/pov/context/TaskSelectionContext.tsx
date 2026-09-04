"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * Interface for the task selection context
 */
interface TaskSelectionContextType {
  selectedTaskIds: Set<string>;
  isTaskSelected: (taskId: string) => boolean;
  toggleTaskSelection: (taskId: string) => void;
  selectTask: (taskId: string) => void;
  unselectTask: (taskId: string) => void;
  clearSelection: () => void;
  selectMultipleTasks: (taskIds: string[]) => void;
}

/**
 * Props for the task selection provider
 */
interface TaskSelectionProviderProps {
  children: ReactNode;
}

/**
 * Create the task selection context
 */
const TaskSelectionContext = createContext<TaskSelectionContextType | undefined>(undefined);

/**
 * Provider component for the task selection context
 */
export const TaskSelectionProvider: React.FC<TaskSelectionProviderProps> = ({ children }) => {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  
  /**
   * Check if a task is selected
   */
  const isTaskSelected = useCallback((taskId: string) => {
    return selectedTaskIds.has(taskId);
  }, [selectedTaskIds]);
  
  /**
   * Toggle the selection state of a task
   */
  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }, []);
  
  /**
   * Select a task
   */
  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      newSet.add(taskId);
      return newSet;
    });
  }, []);
  
  /**
   * Unselect a task
   */
  const unselectTask = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(taskId);
      return newSet;
    });
  }, []);
  
  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);
  
  /**
   * Select multiple tasks
   */
  const selectMultipleTasks = useCallback((taskIds: string[]) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      taskIds.forEach(id => newSet.add(id));
      return newSet;
    });
  }, []);
  
  const value = {
    selectedTaskIds,
    isTaskSelected,
    toggleTaskSelection,
    selectTask,
    unselectTask,
    clearSelection,
    selectMultipleTasks
  };
  
  return (
    <TaskSelectionContext.Provider value={value}>
      {children}
    </TaskSelectionContext.Provider>
  );
};

/**
 * Hook for accessing the task selection context
 */
export const useTaskSelection = (): TaskSelectionContextType => {
  const context = useContext(TaskSelectionContext);
  
  if (context === undefined) {
    throw new Error('useTaskSelection must be used within a TaskSelectionProvider');
  }
  
  return context;
};
