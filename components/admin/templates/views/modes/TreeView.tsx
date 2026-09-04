import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { ViewModeProps } from '../types';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Button } from '@/components/ui/Button';
import { Plus, Minus, RotateCcw } from 'lucide-react';
import { useTaskTypeIcons } from '../../phase-builder/hooks/useTaskTypeIcons';
import './tree-view/theme-vars.css';

// Import components and hooks from tree-view
import {
  KeyboardShortcutsHelp,
  TreeMinimap,
  TreeNode,
  convertTemplateToTreeData,
  flattenNodes,
  toggleNodeExpansion,
  expandAllNodes,
  collapseAllNodes,
  findNodeById,
  removeNode,
  insertNode,
  convertTreeDataToTemplate,
  useKeyboardNavigation
} from './tree-view';

/**
 * TreeView component for displaying a template as a collapsible tree
 */
export const TreeView: React.FC<ViewModeProps> = ({
  template,
  onTemplateChange,
  onSave,
  isReadOnly
}) => {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  
  // State
  const [treeData, setTreeData] = useState(() => convertTemplateToTreeData(template));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedStageId, setFocusedStageId] = useState<string | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  
  // Hooks
  const { getTaskTypeIcon } = useTaskTypeIcons();
  
  // Update tree data when template changes
  useEffect(() => {
    setTreeData(convertTemplateToTreeData(template));
  }, [template]);
  
  // Flatten tree nodes for rendering and minimap
  const flattenedNodes = useMemo(() => {
    return flattenNodes(treeData);
  }, [treeData]);
  
  // Toggle node expansion
  const handleToggleNode = useCallback((id: string) => {
    setTreeData(prevData => toggleNodeExpansion(prevData, id));
  }, []);
  
  // Select a node
  const handleSelectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
  }, []);
  
  // Focus on a stage
  const handleFocusStage = useCallback((id: string) => {
    setFocusedStageId(prev => prev === id ? null : id);
  }, []);
  
  // Move a node
  const handleMoveNode = useCallback((dragId: string, hoverId: string, position: 'before' | 'after' | 'inside') => {
    setTreeData(prevData => {
      // Find the dragged node
      const draggedNode = findNodeById(prevData, dragId);
      if (!draggedNode) return prevData;
      
      // Remove the dragged node from the tree
      const [newTree, removedNode] = removeNode(prevData, dragId);
      if (!removedNode) return prevData;
      
      // Insert the dragged node at the new position
      return insertNode(newTree, hoverId, removedNode, position);
    });
  }, []);
  
  // Expand all nodes
  const handleExpandAll = useCallback(() => {
    setTreeData(prevData => expandAllNodes(prevData));
  }, []);
  
  // Collapse all nodes
  const handleCollapseAll = useCallback(() => {
    setTreeData(prevData => collapseAllNodes(prevData));
  }, []);
  
  // Reset view
  const handleResetView = useCallback(() => {
    setFocusedStageId(null);
    setSelectedNodeId(null);
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
    }
  }, []);
  
  // Handle keyboard navigation
  useKeyboardNavigation({
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
  });
  
  // Save changes
  const handleSave = useCallback(() => {
    const updatedTemplate = convertTreeDataToTemplate(treeData, template);
    onSave(updatedTemplate);
  }, [treeData, template, onSave]);
  
  // Render tree nodes recursively
  const renderTreeNodes = useCallback((nodes: typeof treeData, level = 0, parentId?: string) => {
    return nodes.map((node, index) => (
      <React.Fragment key={node.id}>
        <div id={`tree-node-${node.id}`}>
          <TreeNode
            node={node}
            index={index}
            parentId={parentId}
            onToggle={handleToggleNode}
            onSelect={handleSelectNode}
            onFocus={handleFocusStage}
            onMove={handleMoveNode}
            selectedNodeId={selectedNodeId}
            focusedStageId={focusedStageId}
            getTaskTypeIcon={getTaskTypeIcon}
            level={level}
          />
        </div>
        
        {/* Render children if expanded */}
        {node.isExpanded && node.children && (
          <div className="ml-4">
            {renderTreeNodes(node.children, level + 1, node.id)}
          </div>
        )}
      </React.Fragment>
    ));
  }, [
    handleToggleNode,
    handleSelectNode,
    handleFocusStage,
    handleMoveNode,
    selectedNodeId,
    focusedStageId,
    getTaskTypeIcon
  ]);
  
  return (
    <DndProvider backend={HTML5Backend}>
      <div ref={containerRef} className="h-full flex flex-col">
        {/* Keyboard shortcuts help */}
        <KeyboardShortcutsHelp visible={showKeyboardHelp} />
        
        {/* Controls */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExpandAll}
              title="Expand all"
            >
              <Plus size={16} className="mr-1" />
              Expand All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCollapseAll}
              title="Collapse all"
            >
              <Minus size={16} className="mr-1" />
              Collapse All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetView}
              title="Reset view"
            >
              <RotateCcw size={16} className="mr-1" />
              Reset View
            </Button>
          </div>
          
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeyboardHelp(prev => !prev)}
              title="Keyboard shortcuts"
            >
              ?
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMinimap(prev => !prev)}
              title="Toggle minimap"
            >
              M
            </Button>
            {/* Save button removed to unify save functionality in the parent TemplateEditor component */}
          </div>
        </div>
        
        {/* Tree view */}
        <div 
          ref={viewportRef}
          className="flex-1 overflow-auto border rounded-lg p-4 relative"
          tabIndex={0}
        >
          <div className="space-y-1">
            {renderTreeNodes(treeData)}
          </div>
          
          {/* Minimap */}
          {showMinimap && (
            <TreeMinimap
              nodes={flattenedNodes}
              containerRef={containerRef}
              viewportRef={viewportRef}
              focusedStageId={focusedStageId}
              selectedNodeId={selectedNodeId}
            />
          )}
        </div>
      </div>
    </DndProvider>
  );
};
