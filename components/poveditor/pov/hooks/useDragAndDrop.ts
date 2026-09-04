"use client";

import { useCallback } from 'react';
import { DropResult } from '@hello-pangea/dnd';

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
  phaseId?: string;
  order: number;
}

// Hook props
interface UseDragAndDropProps {
  tasks: Task[];
  onTaskMove: (taskId: string, newStatus: TaskStatus, newOrder: number) => Promise<void>;
  onOptimisticUpdate?: (tasks: Task[]) => void;
}

// Hook return type
interface UseDragAndDropReturn {
  handleDragEnd: (result: DropResult) => Promise<void>;
  isLoading: boolean;
}

export function useDragAndDrop({
  tasks,
  onTaskMove,
  onOptimisticUpdate
}: UseDragAndDropProps): UseDragAndDropReturn {
  
  // Group tasks by status
  const getTasksByStatus = useCallback((taskList: Task[]) => {
    const grouped: Record<TaskStatus, Task[]> = {
      OPEN: [],
      IN_PROGRESS: [],
      COMPLETED: [],
      BLOCKED: []
    };
    
    taskList.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });
    
    // Sort tasks within each column by order
    Object.keys(grouped).forEach(status => {
      grouped[status as TaskStatus].sort((a, b) => a.order - b.order);
    });
    
    return grouped;
  }, []);
  
  // Calculate new order for a task
  const calculateNewOrder = useCallback((
    destTasks: Task[],
    destinationIndex: number,
    excludeTaskId?: string
  ): number => {
    // Filter out the task being moved if it's in the same column
    const filteredTasks = excludeTaskId 
      ? destTasks.filter(t => t.id !== excludeTaskId)
      : destTasks;
    
    if (filteredTasks.length === 0) {
      return 1000; // Default order for first task
    }
    
    if (destinationIndex === 0) {
      // Moving to the top
      return filteredTasks[0].order - 1000;
    }
    
    if (destinationIndex >= filteredTasks.length) {
      // Moving to the bottom
      return filteredTasks[filteredTasks.length - 1].order + 1000;
    }
    
    // Moving between tasks - use integer midpoint to maintain 1000 increment pattern
    const prevTask = filteredTasks[destinationIndex - 1];
    const nextTask = filteredTasks[destinationIndex];
    return Math.floor((prevTask.order + nextTask.order) / 2);
  }, []);
  
  // Create optimistic update
  const createOptimisticUpdate = useCallback((
    taskList: Task[],
    taskId: string,
    newStatus: TaskStatus,
    newOrder: number
  ): Task[] => {
    return taskList.map(task => {
      if (task.id === taskId) {
        return {
          ...task,
          status: newStatus,
          order: newOrder
        };
      }
      return task;
    });
  }, []);
  
  // Handle drag end
  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) {
      return;
    }
    
    const { source, destination, draggableId } = result;
    
    // Find the task being moved
    const task = tasks.find(t => t.id === draggableId);
    if (!task) return;
    
    const sourceStatus = source.droppableId as TaskStatus;
    const destStatus = destination.droppableId as TaskStatus;
    
    // If dropped in the same position, do nothing
    if (sourceStatus === destStatus && source.index === destination.index) {
      return;
    }
    
    // Get current task groupings
    const tasksByStatus = getTasksByStatus(tasks);
    const destTasks = tasksByStatus[destStatus];
    
    // Calculate new order
    const newOrder = calculateNewOrder(
      destTasks,
      destination.index,
      sourceStatus === destStatus ? draggableId : undefined
    );
    
    // Create optimistic update
    const optimisticTasks = createOptimisticUpdate(
      tasks,
      draggableId,
      destStatus,
      newOrder
    );
    
    // Apply optimistic update immediately
    if (onOptimisticUpdate) {
      onOptimisticUpdate(optimisticTasks);
    }
    
    try {
      // Call the actual update function
      await onTaskMove(draggableId, destStatus, newOrder);
    } catch (error) {
      // Revert optimistic update on error
      if (onOptimisticUpdate) {
        onOptimisticUpdate(tasks);
      }

      throw error;
    }
  }, [tasks, onTaskMove, onOptimisticUpdate, getTasksByStatus, calculateNewOrder, createOptimisticUpdate]);
  
  return {
    handleDragEnd,
    isLoading: false // You can add loading state management here if needed
  };
}

export default useDragAndDrop;
