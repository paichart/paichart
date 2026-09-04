import { useCallback, useEffect } from 'react';
import { TaskNodeData } from '../components/graph/types';

interface UseKeyboardNavigationProps {
  containerRef: React.RefObject<HTMLDivElement>;
  nodes: TaskNodeData[];
  selectedTaskId: string | null;
  showMinimap: boolean;
  showTaskDetails: boolean;
  showKeyboardHelp: boolean;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetView: () => void;
  setShowMinimap: (show: boolean | ((prev: boolean) => boolean)) => void;
  setShowTaskDetails: (show: boolean | ((prev: boolean) => boolean)) => void;
  setShowKeyboardHelp: (show: boolean | ((prev: boolean) => boolean)) => void;
  selectFirstTask: () => void;
  selectNextTask: (shiftKey: boolean) => void;
  clearSelection: () => void;
  setTransform: (transform: (prev: { x: number; y: number; scale: number }) => { x: number; y: number; scale: number }) => void;
}

export function useKeyboardNavigation({
  containerRef,
  nodes,
  selectedTaskId,
  showMinimap,
  showTaskDetails,
  showKeyboardHelp,
  handleZoomIn,
  handleZoomOut,
  handleResetView,
  setShowMinimap,
  setShowTaskDetails,
  setShowKeyboardHelp,
  selectFirstTask,
  selectNextTask,
  clearSelection,
  setTransform
}: UseKeyboardNavigationProps) {
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle keyboard events when the graph is focused
    if (!containerRef.current?.contains(document.activeElement)) return;
    
    const STEP = 20;
    
    switch (e.key) {
      case 'm':
        setShowMinimap(prev => !prev);
        e.preventDefault();
        break;
      case 'd':
        setShowTaskDetails(prev => !prev);
        e.preventDefault();
        break;
      case 'ArrowUp':
        setTransform(prev => ({ ...prev, y: prev.y + STEP }));
        e.preventDefault();
        break;
      case 'ArrowDown':
        setTransform(prev => ({ ...prev, y: prev.y - STEP }));
        e.preventDefault();
        break;
      case 'ArrowLeft':
        setTransform(prev => ({ ...prev, x: prev.x + STEP }));
        e.preventDefault();
        break;
      case 'ArrowRight':
        setTransform(prev => ({ ...prev, x: prev.x - STEP }));
        e.preventDefault();
        break;
      case '+':
      case '=':
        handleZoomIn();
        e.preventDefault();
        break;
      case '-':
      case '_':
        handleZoomOut();
        e.preventDefault();
        break;
      case '0':
        handleResetView();
        e.preventDefault();
        break;
      case 'Tab':
        // Navigate between tasks
        if (nodes.length > 0) {
          if (!selectedTaskId) {
            // Select first task
            selectFirstTask();
          } else {
            // Select next task
            selectNextTask(e.shiftKey);
          }
          e.preventDefault();
        }
        break;
      case 'Escape':
        // Clear selection
        clearSelection();
        break;
      case '?':
        // Toggle keyboard help
        setShowKeyboardHelp(prev => !prev);
        e.preventDefault();
        break;
    }
  }, [
    containerRef, 
    nodes, 
    selectedTaskId, 
    handleZoomIn, 
    handleZoomOut, 
    handleResetView,
    setShowMinimap,
    setShowTaskDetails,
    setShowKeyboardHelp,
    selectFirstTask,
    selectNextTask,
    clearSelection,
    setTransform
  ]);
  
  // Add keyboard event listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
  
  return {
    handleKeyDown
  };
}
