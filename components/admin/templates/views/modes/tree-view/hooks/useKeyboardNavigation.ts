import { useCallback, useEffect } from 'react';
import { TreeNodeData } from '../types';

interface UseKeyboardNavigationProps {
  containerRef: React.RefObject<HTMLDivElement>;
  viewportRef: React.RefObject<HTMLDivElement>;
  flattenedNodes: TreeNodeData[];
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  focusedStageId: string | null;
  setFocusedStageId: React.Dispatch<React.SetStateAction<string | null>>;
  showMinimap: boolean;
  setShowMinimap: (show: boolean) => void;
  showKeyboardHelp: boolean;
  setShowKeyboardHelp: (show: boolean) => void;
  handleToggleNode: (id: string) => void;
  handleExpandAll: () => void;
  handleCollapseAll: () => void;
}

/**
 * Hook to handle keyboard navigation in the tree view
 */
export function useKeyboardNavigation({
  containerRef,
  viewportRef,
  flattenedNodes,
  selectedNodeId,
  setSelectedNodeId,
  focusedStageId,
  setFocusedStageId,
  showMinimap,
  setShowMinimap,
  showKeyboardHelp,
  setShowKeyboardHelp,
  handleToggleNode,
  handleExpandAll,
  handleCollapseAll
}: UseKeyboardNavigationProps) {
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle keyboard events when the tree view is focused
    if (!containerRef.current?.contains(document.activeElement)) return;
    
    switch (e.key) {
      case 'ArrowRight':
        if (selectedNodeId) {
          // Expand the selected node
          const selectedNode = flattenedNodes.find(node => node.id === selectedNodeId);
          if (selectedNode && selectedNode.children && !selectedNode.isExpanded) {
            handleToggleNode(selectedNodeId);
          }
        }
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if (selectedNodeId) {
          // Collapse the selected node
          const selectedNode = flattenedNodes.find(node => node.id === selectedNodeId);
          if (selectedNode && selectedNode.children && selectedNode.isExpanded) {
            handleToggleNode(selectedNodeId);
          }
        }
        e.preventDefault();
        break;
      case 'ArrowUp':
        if (selectedNodeId) {
          // Select the previous visible node
          const selectedIndex = flattenedNodes.findIndex(node => node.id === selectedNodeId);
          if (selectedIndex > 0) {
            setSelectedNodeId(flattenedNodes[selectedIndex - 1].id);
            
            // Scroll into view if needed
            const nodeElement = document.getElementById(`tree-node-${flattenedNodes[selectedIndex - 1].id}`);
            if (nodeElement && viewportRef.current) {
              if (nodeElement.offsetTop < viewportRef.current.scrollTop) {
                viewportRef.current.scrollTop = nodeElement.offsetTop;
              }
            }
          }
        } else if (flattenedNodes.length > 0) {
          // Select the first node
          setSelectedNodeId(flattenedNodes[0].id);
        }
        e.preventDefault();
        break;
      case 'ArrowDown':
        if (selectedNodeId) {
          // Select the next visible node
          const selectedIndex = flattenedNodes.findIndex(node => node.id === selectedNodeId);
          if (selectedIndex < flattenedNodes.length - 1) {
            setSelectedNodeId(flattenedNodes[selectedIndex + 1].id);
            
            // Scroll into view if needed
            const nodeElement = document.getElementById(`tree-node-${flattenedNodes[selectedIndex + 1].id}`);
            if (nodeElement && viewportRef.current) {
              if (nodeElement.offsetTop + nodeElement.offsetHeight > viewportRef.current.scrollTop + viewportRef.current.clientHeight) {
                viewportRef.current.scrollTop = nodeElement.offsetTop + nodeElement.offsetHeight - viewportRef.current.clientHeight;
              }
            }
          }
        } else if (flattenedNodes.length > 0) {
          // Select the first node
          setSelectedNodeId(flattenedNodes[0].id);
        }
        e.preventDefault();
        break;
      case ' ':
        if (selectedNodeId) {
          // Toggle the selected node
          handleToggleNode(selectedNodeId);
        }
        e.preventDefault();
        break;
      case 'f':
      case 'F':
        if (selectedNodeId) {
          // Toggle focus mode for the selected node
          const selectedNode = flattenedNodes.find(node => node.id === selectedNodeId);
          if (selectedNode && selectedNode.isStage) {
            setFocusedStageId(prev => prev === selectedNodeId ? null : selectedNodeId);
          }
        }
        e.preventDefault();
        break;
      case 'Escape':
        // Clear selection and focus
        setSelectedNodeId(null);
        setFocusedStageId(null);
        e.preventDefault();
        break;
      case 'm':
      case 'M':
        // Toggle minimap
        setShowMinimap(!showMinimap);
        e.preventDefault();
        break;
      case '+':
      case '=':
        // Expand all nodes
        handleExpandAll();
        e.preventDefault();
        break;
      case '-':
      case '_':
        // Collapse all nodes
        handleCollapseAll();
        e.preventDefault();
        break;
      case '?':
        // Toggle keyboard help
        setShowKeyboardHelp(!showKeyboardHelp);
        e.preventDefault();
        break;
    }
  }, [
    containerRef,
    viewportRef,
    flattenedNodes,
    selectedNodeId,
    setSelectedNodeId,
    setFocusedStageId,
    showMinimap,
    setShowMinimap,
    showKeyboardHelp,
    setShowKeyboardHelp,
    handleToggleNode,
    handleExpandAll,
    handleCollapseAll
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
