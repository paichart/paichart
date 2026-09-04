import React from 'react';
import { TaskNodeData } from './types';
import * as LucideIcons from 'lucide-react';

interface TaskNodeProps {
  node: TaskNodeData;
  isSelected: boolean;
  isRelated: boolean;
  isHovered: boolean;
  onClick: (id: string) => void;
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
  getTaskTypeIcon: (type: string) => string | React.ReactNode;
}

// Helper function to render the icon based on the icon name or React node
const renderIcon = (iconNameOrNode: string | React.ReactNode | undefined) => {
  // If it's a React node, return it directly
  if (React.isValidElement(iconNameOrNode)) {
    return iconNameOrNode;
  }
  
  // Handle undefined or null iconName
  if (!iconNameOrNode) {
    return <LucideIcons.FileText size={16} />;
  }
  
  // If it's a string, convert kebab-case to PascalCase for Lucide icons
  const iconName = String(iconNameOrNode);
  try {
    const iconKey = iconName
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    
    // Get the icon component from Lucide
    const IconComponent = (LucideIcons as any)[iconKey];
    
    // Return the icon component if it exists, otherwise return a default icon
    return IconComponent ? <IconComponent size={16} /> : <LucideIcons.FileText size={16} />;
  } catch {
    // If there's an error (e.g., iconName is not a string or doesn't have split method)
    return <LucideIcons.FileText size={16} />;
  }
};

export const TaskNode = React.memo(function TaskNode({
  node,
  isSelected,
  isRelated,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
  getTaskTypeIcon
}: TaskNodeProps) {
  // Determine fill color based on state using CSS variables
  const getFillColor = () => {
    if (isSelected) return "hsl(var(--primary) / 0.1)"; // Selected task
    if (isRelated) return "hsl(var(--primary) / 0.05)"; // Related to selected task
    if (isHovered) return "hsl(var(--muted))"; // Hovered task
    return "hsl(var(--card))"; // Normal task
  };
  
  // Determine stroke color based on state using CSS variables
  const getStrokeColor = () => {
    if (isSelected) return "hsl(var(--primary))"; // Selected task
    if (isRelated) return "hsl(var(--primary) / 0.5)"; // Related to selected task
    if (isHovered) return "hsl(var(--muted-foreground))"; // Hovered task
    return "hsl(var(--border))"; // Normal task
  };
  
  // Determine stroke width based on state
  const getStrokeWidth = () => {
    return (isSelected || isRelated) ? 2 : 1;
  };
  
  // Determine font weight based on state
  const getFontWeight = () => {
    return (isSelected || isRelated || isHovered) ? "bold" : "normal";
  };
  
  // Truncate long titles
  const getDisplayTitle = () => {
    return node.title.length > 20 ? node.title.substring(0, 18) + '...' : node.title;
  };
  
  return (
    <g
      onMouseEnter={() => onMouseEnter(node.id)}
      onMouseLeave={onMouseLeave}
    >
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={4}
        fill={getFillColor()}
        stroke={getStrokeColor()}
        strokeWidth={getStrokeWidth()}
        onClick={() => onClick(node.id)}
        style={{ cursor: 'pointer' }}
        role="button"
        data-selected={isSelected ? 'true' : 'false'}
        aria-label={`Task: ${node.title}`}
      />
      
      <text
        x={node.x + 30}
        y={node.y + node.height / 2 + 5}
        fontSize="12"
        fontWeight={getFontWeight()}
        className="select-none"
        style={{ pointerEvents: 'none' }}
      >
        {getDisplayTitle()}
      </text>
      
      <foreignObject
        x={node.x + 5}
        y={node.y + (node.height - 20) / 2}
        width={20}
        height={20}
      >
        <div className="w-5 h-5 flex items-center justify-center text-muted-foreground">
          {renderIcon(getTaskTypeIcon(node.type))}
        </div>
      </foreignObject>
    </g>
  );
});
