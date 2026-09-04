import React from 'react';
import { TaskNodeData } from './types';

interface DependencyArrowProps {
  sourceNode: TaskNodeData;
  targetNode: TaskNodeData;
  isHighlighted: boolean;
  generatePath: (sourceNode: TaskNodeData, targetNode: TaskNodeData) => string;
}

export const DependencyArrow = React.memo(function DependencyArrow({
  sourceNode,
  targetNode,
  isHighlighted,
  generatePath
}: DependencyArrowProps) {
  return (
    <path
      d={generatePath(sourceNode, targetNode)}
      fill="none"
      stroke={isHighlighted ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
      strokeWidth={isHighlighted ? 2 : 1}
      strokeDasharray={isHighlighted ? "none" : "4,4"}
      markerEnd="url(#arrowhead)"
    />
  );
});

export const ArrowMarker = React.memo(function ArrowMarker() {
  return (
    <defs>
      <marker
        id="arrowhead"
        markerWidth="10"
        markerHeight="7"
        refX="9"
        refY="3.5"
        orient="auto"
      >
        <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" />
      </marker>
    </defs>
  );
});
