import React, { useState, useRef, useCallback } from 'react';
import { MinimapProps } from './types';

/**
 * Minimap component for navigating the tree view
 */
export const TreeMinimap: React.FC<MinimapProps> = ({ 
  nodes, 
  containerRef, 
  viewportRef,
  focusedStageId,
  selectedNodeId
}) => {
  const minimapRef = useRef<SVGSVGElement>(null);
  const [minimapDragging, setMinimapDragging] = useState(false);
  const minimapSize = { width: 150, height: 100 };
  
  // Calculate total height of the tree
  const totalHeight = nodes.length > 0 
    ? nodes[nodes.length - 1].position!.y + nodes[nodes.length - 1].position!.height 
    : 0;
  
  // Calculate scale for minimap
  const scale = Math.min(
    minimapSize.height / totalHeight,
    minimapSize.width / 200
  );
  
  // Handle click on minimap to navigate
  const handleMinimapClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !viewportRef.current) return;
    
    // Get click position relative to minimap
    const minimapRect = minimapRef.current?.getBoundingClientRect();
    if (!minimapRect) return;
    
    const clickY = e.clientY - minimapRect.top;
    
    // Convert to tree coordinates
    const treeY = clickY / scale;
    
    // Scroll to position
    viewportRef.current.scrollTop = treeY - viewportRef.current.clientHeight / 2;
  }, [containerRef, viewportRef, scale]);
  
  // Handle mouse down for dragging the minimap
  const handleMinimapMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimapDragging(true);
  }, []);
  
  // Handle mouse move for dragging the minimap
  const handleMinimapMouseMove = useCallback((e: React.MouseEvent) => {
    if (!minimapDragging || !containerRef.current || !viewportRef.current) return;
    
    // Get mouse position relative to minimap
    const minimapRect = minimapRef.current?.getBoundingClientRect();
    if (!minimapRect) return;
    
    const mouseY = e.clientY - minimapRect.top;
    
    // Convert to tree coordinates
    const treeY = mouseY / scale;
    
    // Scroll to position
    viewportRef.current.scrollTop = treeY - viewportRef.current.clientHeight / 2;
  }, [minimapDragging, containerRef, viewportRef, scale]);
  
  // Handle mouse up to end dragging
  const handleMinimapMouseUp = useCallback(() => {
    setMinimapDragging(false);
  }, []);
  
  // Handle mouse leave to end dragging
  const handleMinimapMouseLeave = useCallback(() => {
    setMinimapDragging(false);
  }, []);
  
  // Calculate viewport position
  const viewportPosition = viewportRef.current ? {
    y: viewportRef.current.scrollTop,
    height: viewportRef.current.clientHeight
  } : { y: 0, height: 0 };
  
  return (
    <div className="absolute bottom-4 right-4 border border-border bg-card rounded shadow-md">
      <div className="p-1 bg-muted border-b flex justify-between items-center">
        <span className="text-xs font-medium">Overview</span>
      </div>
      <svg
        ref={minimapRef}
        width={minimapSize.width}
        height={minimapSize.height}
        className="p-2"
        onClick={handleMinimapClick}
        onMouseDown={handleMinimapMouseDown}
        onMouseMove={handleMinimapMouseMove}
        onMouseUp={handleMinimapMouseUp}
        onMouseLeave={handleMinimapMouseLeave}
      >
        {/* Tree nodes */}
        {nodes.map(node => {
          const isFocused = focusedStageId === node.id;
          const isSelected = selectedNodeId === node.id;
          const isInFocusedStage = focusedStageId && !node.isStage && 
            nodes.find(n => n.id === node.id)?.parentId === focusedStageId;
          
          // Skip nodes that are not in focus mode if a stage is focused
          if (focusedStageId && !isFocused && !isInFocusedStage && node.isStage) {
            return null;
          }
          
          return (
            <rect
              key={`minimap-${node.id}`}
              x={node.position!.x * scale}
              y={node.position!.y * scale}
              width={node.position!.width * scale}
              height={node.position!.height * scale}
              rx={2}
              fill={
                isSelected
                  ? "var(--primary)" // Selected node
                  : isFocused || isInFocusedStage
                    ? "var(--primary-light)" // Focused stage or task in focused stage
                    : node.isStage
                      ? "var(--muted)" // Stage
                      : "var(--background)" // Task
              }
              stroke={
                isSelected
                  ? "var(--primary)"
                  : isFocused || isInFocusedStage
                    ? "var(--primary-light)"
                    : "var(--border)"
              }
              strokeWidth={isSelected || isFocused || isInFocusedStage ? 1 : 0.5}
            />
          );
        })}
        
        {/* Viewport indicator */}
        <rect
          x={0}
          y={viewportPosition.y * scale}
          width={minimapSize.width - 4}
          height={viewportPosition.height * scale}
          fill="var(--primary-light)"
          stroke="var(--primary)"
          strokeWidth={1}
          strokeDasharray="2,2"
          pointerEvents="none"
        />
      </svg>
    </div>
  );
};
