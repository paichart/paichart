"use client";

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Task status types
type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';

// Task interface
interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  type: string;
  priority: string;
  assigneeId?: string;
  dueDate?: string;
  phaseId: string;
  order: number;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  assignee?: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  };
  comments?: Array<{
    id: string;
    content: string;
    createdAt: string;
    user: {
      id: string;
      name: string;
      email: string;
    };
  }>;
}

// Agent interface
interface Agent {
  id: string;
  name: string;
  role: string;
  prompt?: string;
  parameters?: any;
}

// Hook props
interface UseTaskSelectionProps {
  povId: string;
  phaseId?: string;
  initialTaskId?: string;
}

// Hook return type
interface UseTaskSelectionReturn {
  // Selection state
  selectedTaskId: string | null;
  selectedTask: Task | null;
  
  // Selection actions
  selectTask: (taskId: string | null) => void;
  clearSelection: () => void;
  
  // Task data
  isLoadingTask: boolean;
  taskError: Error | null;
  
  // Task operations
  moveTask: (taskId: string, newStatus: TaskStatus, newOrder: number) => Promise<void>;
  reorderTasks: (taskIds: string[]) => Promise<void>;
  
  // Related data
  agents: Agent[];
  isLoadingAgents: boolean;
  agentsError: Error | null;
  
  // Cache management
  invalidateTask: () => void;
  invalidateAgents: () => void;
}

/**
 * Hook for managing task selection and related operations
 */
export function useTaskSelection({
  povId,
  phaseId,
  initialTaskId
}: UseTaskSelectionProps): UseTaskSelectionReturn {
  
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId || null);
  
  // Fetch selected task details
  const {
    data: selectedTask,
    isLoading: isLoadingTask,
    error: taskError
  } = useQuery({
    queryKey: ['task', selectedTaskId],
    queryFn: async () => {
      if (!selectedTaskId || !phaseId) return null;
      
      const response = await fetch(`/api/pov/${povId}/phase/${phaseId}/task/${selectedTaskId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch task');
      }
      
      return response.json() as Promise<Task>;
    },
    enabled: !!selectedTaskId && !!phaseId,
    staleTime: 30000, // 30 seconds
  });
  
  // Fetch agents for the selected task
  const {
    data: agents = [],
    isLoading: isLoadingAgents,
    error: agentsError
  } = useQuery({
    queryKey: ['task-agents', selectedTaskId],
    queryFn: async () => {
      if (!selectedTaskId || !phaseId) return [];
      
      // This would be a real API endpoint for task-specific agents
      // For now, return empty array as this endpoint may not exist yet
      try {
        const response = await fetch(`/api/pov/${povId}/phase/${phaseId}/task/${selectedTaskId}/agents`);
        if (!response.ok) {
          return [];
        }
        return response.json() as Promise<Agent[]>;
      } catch (error) {
        console.warn('Task agents endpoint not available:', error);
        return [];
      }
    },
    enabled: !!selectedTaskId && !!phaseId,
    staleTime: 60000, // 1 minute
  });
  
  // Task move mutation
  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus, newOrder }: {
      taskId: string;
      newStatus: TaskStatus;
      newOrder: number;
    }) => {
      if (!phaseId) throw new Error('Phase ID is required');
      
      const response = await fetch(`/api/pov/${povId}/phase/${phaseId}/task/${taskId}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newStatus,
          newOrder,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to move task');
      }
      
      return response.json() as Promise<Task>;
    },
    onSuccess: (updatedTask) => {
      // Update the task in cache
      queryClient.setQueryData(['task', updatedTask.id], updatedTask);
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['phase-tasks', phaseId] });
      queryClient.invalidateQueries({ queryKey: ['pov-tasks', povId] });
    },
  });
  
  // Task reorder mutation
  const reorderTasksMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      if (!phaseId) throw new Error('Phase ID is required');
      
      const response = await fetch(`/api/pov/${povId}/phase/${phaseId}/task/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIds,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to reorder tasks');
      }
      
      return response.json() as Promise<Task[]>;
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['phase-tasks', phaseId] });
      queryClient.invalidateQueries({ queryKey: ['pov-tasks', povId] });
    },
  });
  
  // Selection actions
  const selectTask = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId);
  }, []);
  
  const clearSelection = useCallback(() => {
    setSelectedTaskId(null);
  }, []);
  
  // Task operations
  const moveTask = useCallback(async (taskId: string, newStatus: TaskStatus, newOrder: number) => {
    await moveTaskMutation.mutateAsync({ taskId, newStatus, newOrder });
  }, [moveTaskMutation]);
  
  const reorderTasks = useCallback(async (taskIds: string[]) => {
    await reorderTasksMutation.mutateAsync(taskIds);
  }, [reorderTasksMutation]);
  
  // Cache management
  const invalidateTask = useCallback(() => {
    if (selectedTaskId) {
      queryClient.invalidateQueries({ queryKey: ['task', selectedTaskId] });
    }
  }, [queryClient, selectedTaskId]);
  
  const invalidateAgents = useCallback(() => {
    if (selectedTaskId) {
      queryClient.invalidateQueries({ queryKey: ['task-agents', selectedTaskId] });
    }
  }, [queryClient, selectedTaskId]);
  
  // Update selection when initialTaskId changes
  useEffect(() => {
    if (initialTaskId && initialTaskId !== selectedTaskId) {
      setSelectedTaskId(initialTaskId);
    }
  }, [initialTaskId, selectedTaskId]);
  
  return {
    // Selection state
    selectedTaskId,
    selectedTask: selectedTask || null,
    
    // Selection actions
    selectTask,
    clearSelection,
    
    // Task data
    isLoadingTask,
    taskError: taskError as Error | null,
    
    // Task operations
    moveTask,
    reorderTasks,
    
    // Related data
    agents,
    isLoadingAgents,
    agentsError: agentsError as Error | null,
    
    // Cache management
    invalidateTask,
    invalidateAgents,
  };
}

export default useTaskSelection;
