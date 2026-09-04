import { useState, useCallback } from 'react';
import { TaskNodeData, GraphTransform, GraphDimensions } from '../components/graph/types';

export function useTaskSelection(
  nodes: TaskNodeData[],
  transform: GraphTransform,
  svgDimensions: GraphDimensions,
  centerViewOn: (x: number, y: number, width: number, height: number) => void
) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  
  // Create a map of task IDs to their nodes for quick lookup
  const taskNodesMap = nodes.reduce((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {} as Record<string, TaskNodeData>);
  
  // Check if a task is related to the selected task
  const isRelatedToSelectedTask = useCallback((taskId: string): boolean => {
    if (!selectedTaskId) return false;
    
    // The task itself is related
    if (taskId === selectedTaskId) return true;
    
    // The task is a dependency of the selected task
    const selectedTask = taskNodesMap[selectedTaskId];
    if (selectedTask && selectedTask.dependencies && selectedTask.dependencies.includes(taskId)) {
      return true;
    }
    
    // The selected task is a dependency of this task
    const task = taskNodesMap[taskId];
    if (task && task.dependencies && task.dependencies.includes(selectedTaskId)) {
      return true;
    }
    
    return false;
  }, [selectedTaskId, taskNodesMap]);
  
  // Handle task click
  const handleTaskClick = useCallback((taskId: string) => {
    const newSelectedId = taskId === selectedTaskId ? null : taskId;
    setSelectedTaskId(newSelectedId);
    
    if (newSelectedId) {
      // If selecting a task, center the view on it
      const node = taskNodesMap[newSelectedId];
      if (node) {
        centerViewOn(node.x, node.y, node.width, node.height);
        
        // Automatically show task details when a task is selected
        setShowTaskDetails(true);
      }
    } else {
      // Hide task details when deselecting
      setShowTaskDetails(false);
    }
  }, [selectedTaskId, taskNodesMap, centerViewOn]);
  
  // Select first task (for Tab navigation)
  const selectFirstTask = useCallback(() => {
    if (nodes.length > 0) {
      const firstNode = nodes[0];
      setSelectedTaskId(firstNode.id);
      setHoveredTask(firstNode.id);
      
      // Center the view on the first selected task
      centerViewOn(firstNode.x, firstNode.y, firstNode.width, firstNode.height);
      
      // Automatically show task details for the first selected task
      setShowTaskDetails(true);
    }
  }, [nodes, centerViewOn]);
  
  // Select next task (for Tab navigation)
  const selectNextTask = useCallback((shiftKey: boolean) => {
    if (nodes.length > 0 && selectedTaskId) {
      // Find current index
      const currentIndex = nodes.findIndex(node => node.id === selectedTaskId);
      const nextIndex = shiftKey 
        ? (currentIndex - 1 + nodes.length) % nodes.length // Previous with wrap
        : (currentIndex + 1) % nodes.length; // Next with wrap
      
      const nextNode = nodes[nextIndex];
      setSelectedTaskId(nextNode.id);
      setHoveredTask(nextNode.id);
      
      // Center the view on the selected task
      centerViewOn(nextNode.x, nextNode.y, nextNode.width, nextNode.height);
      
      // Automatically show task details when navigating with Tab
      setShowTaskDetails(true);
    }
  }, [nodes, selectedTaskId, centerViewOn]);
  
  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedTaskId(null);
    setHoveredTask(null);
    setShowTaskDetails(false);
  }, []);
  
  return {
    selectedTaskId,
    hoveredTask,
    showTaskDetails,
    setSelectedTaskId,
    setHoveredTask,
    setShowTaskDetails,
    isRelatedToSelectedTask,
    handleTaskClick,
    selectFirstTask,
    selectNextTask,
    clearSelection,
    taskNodesMap
  };
}
