import React, { useState, useRef } from 'react';
import { Stage } from '../../types';
import { TaskNodeData, GraphDimensions, GraphTransform, MinimapSize } from './types';

interface GraphMinimapProps {
  nodes: TaskNodeData[];
  stages: Stage[];
  svgDimensions: GraphDimensions;
  transform: GraphTransform;
  setTransform: (transform: GraphTransform) => void;
  selectedTaskId: string | null;
  isRelatedToSelectedTask: (taskId: string) => boolean;
  generatePath: (sourceNode: TaskNodeData, targetNode: TaskNodeData) => string;
  taskNodesMap: Record<string, TaskNodeData>;
}

export const GraphMinimap = React.memo(function GraphMinimap({
  nodes,
  stages,
  svgDimensions,
  transform,
  setTransform,
  selectedTaskId,
  isRelatedToSelectedTask,
  generatePath,
  taskNodesMap
}: GraphMinimapProps) {
  const minimapRef = useRef<SVGSVGElement>(null);
  const [minimapDragging, setMinimapDragging] = useState(false);
  const minimapSize: MinimapSize = { width: 150, height: 100 };
  
  // Handle click on minimap to navigate
  const handleMinimapClick = (e: React.MouseEvent) => {
    // Get click position relative to minimap
    const minimapRect = minimapRef.current?.getBoundingClientRect();
    if (!minimapRect) return;
    
    const clickX = e.clientX - minimapRect.left;
    const clickY = e.clientY - minimapRect.top;
    
    // Convert to SVG coordinates
    const svgX = (clickX / minimapSize.width) * svgDimensions.width;
    const svgY = (clickY / minimapSize.height) * svgDimensions.height;
    
    // Calculate new transform to center on clicked point
    const newX = -(svgX * transform.scale - svgDimensions.width / 2);
    const newY = -(svgY * transform.scale - svgDimensions.height / 2);
    
    setTransform({
      ...transform,
      x: newX,
      y: newY
    });
  };
  
  // Handle mouse down for dragging the minimap
  const handleMinimapMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimapDragging(true);
  };
  
  // Handle mouse move for dragging the minimap
  const handleMinimapMouseMove = (e: React.MouseEvent) => {
    if (!minimapDragging) return;
    
    // Get mouse position relative to minimap
    const minimapRect = minimapRef.current?.getBoundingClientRect();
    if (!minimapRect) return;
    
    const mouseX = e.clientX - minimapRect.left;
    const mouseY = e.clientY - minimapRect.top;
    
    // Convert to SVG coordinates
    const svgX = (mouseX / minimapSize.width) * svgDimensions.width;
    const svgY = (mouseY / minimapSize.height) * svgDimensions.height;
    
    // Calculate new transform to center on mouse position
    const newX = -(svgX * transform.scale - svgDimensions.width / 2);
    const newY = -(svgY * transform.scale - svgDimensions.height / 2);
    
    setTransform({
      ...transform,
      x: newX,
      y: newY
    });
  };
  
  // Handle mouse up to end dragging
  const handleMinimapMouseUp = () => {
    setMinimapDragging(false);
  };
  
  // Handle mouse leave to end dragging
  const handleMinimapMouseLeave = () => {
    setMinimapDragging(false);
  };
  
  return (
    <div className="absolute bottom-4 right-4 border border-border bg-card rounded shadow-md">
      <div className="p-1 bg-muted border-b flex justify-between items-center">
        <span className="text-xs font-medium">Overview</span>
        <button 
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {}} // This will be handled by the parent component
          title="Hide minimap"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="12" 
            height="12" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <polyline points="4 14 10 14 10 20"></polyline>
            <polyline points="20 10 14 10 14 4"></polyline>
            <line x1="14" y1="10" x2="21" y2="3"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </div>
      <svg
        ref={minimapRef}
        width={minimapSize.width}
        height={minimapSize.height}
        viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
        className="p-2"
      >
        {/* Stage labels */}
        {stages.map((stage) => {
          const stageNode = nodes.find(node => node.stageId === stage.name);
          if (!stageNode) return null;
          
          return (
            <text
              key={`minimap-${stage.name}`}
              x={stageNode.x + stageNode.width / 2}
              y={20}
              textAnchor="middle"
              fontSize="8"
              fontWeight="bold"
            >
              {stage.name}
            </text>
          );
        })}
        
        {/* Task nodes */}
        {nodes.map(node => (
          <rect
            key={`minimap-${node.id}`}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={2}
            fill={
              selectedTaskId === node.id 
                ? "hsl(var(--primary) / 0.8)" // Selected task
                : isRelatedToSelectedTask(node.id)
                  ? "hsl(var(--primary) / 0.4)" // Related to selected task
                  : "hsl(var(--primary) / 0.1)" // Normal task
            }
            stroke={
              selectedTaskId === node.id || isRelatedToSelectedTask(node.id)
                ? "hsl(var(--primary))"
                : "hsl(var(--border))"
            }
            strokeWidth={
              selectedTaskId === node.id || isRelatedToSelectedTask(node.id)
                ? 1
                : 0.5
            }
          />
        ))}
        
        {/* Dependency arrows */}
        {nodes.map(node => 
          node.dependencies && node.dependencies.map(depId => {
            const targetNode = taskNodesMap[depId];
            if (!targetNode) return null;
            
            // Highlight dependency arrows related to the selected task
            const isHighlighted = 
              selectedTaskId === node.id || 
              selectedTaskId === depId;
            
            return (
              <path
                key={`minimap-${node.id}-${depId}`}
                d={generatePath(node, targetNode)}
                fill="none"
                stroke={isHighlighted ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                strokeWidth={isHighlighted ? 1 : 0.5}
                strokeDasharray={isHighlighted ? "none" : "2,2"}
              />
            );
          })
        )}
        
        {/* Clickable overlay for minimap navigation */}
        <rect
          x={0}
          y={0}
          width={svgDimensions.width}
          height={svgDimensions.height}
          fill="transparent"
          style={{ cursor: 'pointer' }}
          onClick={handleMinimapClick}
          onMouseDown={handleMinimapMouseDown}
          onMouseMove={handleMinimapMouseMove}
          onMouseUp={handleMinimapMouseUp}
          onMouseLeave={handleMinimapMouseLeave}
        />
        
        {/* Viewport indicator */}
        <rect
          x={-transform.x / transform.scale}
          y={-transform.y / transform.scale}
          width={svgDimensions.width / transform.scale}
          height={svgDimensions.height / transform.scale}
          fill="hsl(var(--primary) / 0.1)"
          stroke="hsl(var(--primary))"
          strokeWidth={1}
          strokeDasharray="2,2"
          pointerEvents="none"
        />
      </svg>
    </div>
  );
});
