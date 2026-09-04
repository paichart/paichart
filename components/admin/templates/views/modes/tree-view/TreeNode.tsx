import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { ChevronRight, ChevronDown, Focus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { TreeNodeProps, DragItem, ItemTypes } from './types';

/**
 * Draggable tree node component
 */
export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  index,
  parentId,
  onToggle,
  onSelect,
  onFocus,
  onMove,
  selectedNodeId,
  focusedStageId,
  getTaskTypeIcon,
  level
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isSelected = selectedNodeId === node.id;
  const isFocused = focusedStageId === node.id;
  const isInFocusedStage = focusedStageId && !node.isStage && parentId === focusedStageId;
  const shouldRender = !(focusedStageId && !isFocused && !isInFocusedStage && node.isStage);
  
  // Set up drag
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.TREE_NODE,
    item: { id: node.id, type: ItemTypes.TREE_NODE, index, parentId },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });
  
  // Set up drop
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.TREE_NODE,
    canDrop: (item: DragItem) => item.id !== node.id,
    hover: (item: DragItem, monitor) => {
      if (!ref.current) return;
      
      // Don't replace items with themselves
      if (item.id === node.id) return;
      
      // Determine rectangle on screen
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      
      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      
      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      
      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      
      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      
      // Dragging downwards
      if (item.index < index && hoverClientY < hoverMiddleY) {
        return;
      }
      
      // Dragging upwards
      if (item.index > index && hoverClientY > hoverMiddleY) {
        return;
      }
      
      // Determine drop position
      const position = hoverClientY < hoverMiddleY / 2 ? 'before' : 
                      hoverClientY > hoverMiddleY * 1.5 ? 'after' : 'inside';
      
      // Move the item
      onMove(item.id, node.id, position);
      
      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = index;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop()
    })
  });
  
  // Connect drag and drop refs
  drag(drop(ref));
  
  // Render icon based on node type
  const renderIcon = () => {
    if (node.isStage) {
      return node.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />;
    } else if (node.type) {
      try {
        // Use the task type icon
        const iconName = getTaskTypeIcon(node.type);
        
        // Make sure iconName is a string
        if (typeof iconName !== 'string') {
          return <ChevronRight size={16} />;
        }
        
        // Convert kebab-case to PascalCase for Lucide icons
        const iconKey = iconName
          .split('-')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');
        
        // Get the icon component from Lucide
        const LucideIcon = require('lucide-react')[iconKey] || require('lucide-react').FileText;
        return <LucideIcon size={16} />;
      } catch {
        return <ChevronRight size={16} />;
      }
    }
    return <ChevronRight size={16} />;
  };
  
  if (!shouldRender) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`flex items-center px-2 ${
        node.isStage ? 'h-10' : 'h-9'
      } ${
        isDragging ? 'opacity-50' : 'opacity-100'
      } ${
        isOver && canDrop ? 'bg-primary/10 border border-primary/20' : ''
      } ${
        isSelected ? 'bg-primary/20' :
        isFocused || isInFocusedStage ? 'bg-primary/10' :
        node.isStage ? 'bg-muted' : ''
      } hover:bg-accent cursor-pointer rounded-md mb-1`}
      style={{
        marginLeft: `${level * 24}px`,
        borderLeft: node.isStage ? `4px solid ${isFocused ? 'var(--primary)' : 'var(--muted-foreground)'}` : 'none'
      }}
      onClick={() => onSelect(node.id)}
    >
      <div 
        className="mr-1 p-1 hover:bg-accent rounded"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(node.id);
        }}
      >
        {renderIcon()}
      </div>
      
      <div className="flex-1 truncate font-medium">
        {node.name}
      </div>
      
      {node.isStage && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`p-1 rounded-full ${
                  isFocused ? 'bg-primary/20 text-primary' : 'hover:bg-accent text-muted-foreground'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onFocus(node.id);
                }}
              >
                {isFocused ? <X size={14} /> : <Focus size={14} />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isFocused ? 'Exit focus mode' : 'Focus on this stage'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};
