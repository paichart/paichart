"use client";

import { useContext } from 'react';
import { SelectedTaskContext } from '../context/SelectedTaskContext';

/**
 * Hook to access the selected task context
 * 
 * @returns The selected task context with selectedTaskId and updateSelectedTask
 */
export function useSelectedTask() {
  const context = useContext(SelectedTaskContext);
  
  if (context === undefined) {
    throw new Error('useSelectedTask must be used within a SelectedTaskProvider');
  }
  
  return context;
}
