"use client";

import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Button } from '@/components/ui/Button';
import { ArrowUpDown, Trash2 } from 'lucide-react';
import { ItemTypes } from '../constants';
import { DraggableFieldProps, DragItem } from '../types';

/**
 * Draggable field component for the sections wizard
 */
export function DraggableField({ 
  fieldId, 
  field, 
  index, 
  onRemove 
}: DraggableFieldProps) {
  const fieldRef = React.useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.FIELD,
    item: { type: ItemTypes.FIELD, id: fieldId, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  const [, drop] = useDrop<DragItem, void, {}>({
    accept: ItemTypes.FIELD,
    hover(item, monitor) {
      if (!fieldRef.current) {
        return;
      }
      
      const dragIndex = item.index;
      const hoverIndex = index;
      
      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }
      
      // Determine rectangle on screen
      const hoverBoundingRect = fieldRef.current.getBoundingClientRect();
      
      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      
      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      
      // Get pixels to the top
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;
      
      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      
      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      
      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }
      
      // Time to actually perform the action is handled by the parent component
      
      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });
  
  drag(drop(fieldRef));
  
  return (
    <div 
      ref={fieldRef}
      className={`flex items-center justify-between p-2 mb-2 border rounded-md ${
        isDragging ? 'opacity-50 bg-muted' : 'bg-background'
      }`}
    >
      <div className="flex items-center">
        <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground cursor-move" />
        <div>
          <div className="font-medium">{field.label}</div>
          <div className="text-xs text-muted-foreground">{field.type}</div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="text-destructive hover:text-destructive/80"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}