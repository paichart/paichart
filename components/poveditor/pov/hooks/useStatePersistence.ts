"use client";

import { useEffect } from 'react';
import { useSelectedTask } from './useSelectedTask';
import { useTaskSelection } from '../context';

/**
 * Hook for persisting state across tab navigation and page refreshes
 * 
 * This hook saves the selected task ID and selected task IDs to localStorage
 * and restores them when the component mounts.
 */
export const useStatePersistence = (povId: string) => {
  const { selectedTaskId, updateSelectedTask } = useSelectedTask();
  const { selectedTaskIds, selectMultipleTasks, clearSelection } = useTaskSelection();
  
  // Generate storage keys based on POV ID to avoid conflicts
  const selectedTaskKey = `pov-${povId}-selected-task`;
  const selectedTaskIdsKey = `pov-${povId}-selected-task-ids`;
  
  // Save state to localStorage when it changes
  useEffect(() => {
    if (selectedTaskId) {
      localStorage.setItem(selectedTaskKey, selectedTaskId);
    } else {
      localStorage.removeItem(selectedTaskKey);
    }
  }, [selectedTaskId, selectedTaskKey]);
  
  // Save selected task IDs to localStorage when they change
  useEffect(() => {
    if (selectedTaskIds.size > 0) {
      localStorage.setItem(
        selectedTaskIdsKey, 
        JSON.stringify(Array.from(selectedTaskIds))
      );
    } else {
      localStorage.removeItem(selectedTaskIdsKey);
    }
  }, [selectedTaskIds, selectedTaskIdsKey]);
  
  // Restore state from localStorage when component mounts
  useEffect(() => {
    // Restore selected task
    const savedSelectedTask = localStorage.getItem(selectedTaskKey);
    if (savedSelectedTask) {
      updateSelectedTask(savedSelectedTask);
    }
    
    // Restore selected task IDs
    const savedSelectedTaskIds = localStorage.getItem(selectedTaskIdsKey);
    if (savedSelectedTaskIds) {
      try {
        const parsedIds = JSON.parse(savedSelectedTaskIds) as string[];
        if (Array.isArray(parsedIds) && parsedIds.length > 0) {
          // Clear existing selection first
          clearSelection();
          // Then select the saved tasks
          selectMultipleTasks(parsedIds);
        }
      } catch {
        localStorage.removeItem(selectedTaskIdsKey);
      }
    }
  }, [
    selectedTaskKey, 
    selectedTaskIdsKey, 
    updateSelectedTask, 
    selectMultipleTasks, 
    clearSelection
  ]);
  
  // Return nothing as this hook is used for its side effects
  return null;
};
