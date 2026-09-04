"use client";

import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Button } from '@/components/ui/Button';
import { ArrowUpDown, Edit2, MoveDown, MoveUp, Plus, Trash2 } from 'lucide-react';
import { ItemTypes } from '../constants';
import { DraggableSectionProps, DragItem } from '../types';
import { DraggableField } from './DraggableField';
import { useFieldAssignment } from '../hooks/useFieldAssignment';
import { FieldDefinition } from '@/lib/pov/templates/types';

/**
 * Draggable section component for the sections wizard
 */
export function DraggableSection({ 
  section, 
  index, 
  moveSection,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddField,
  onRemoveField,
  onReorderFields,
  availableFields
}: DraggableSectionProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.SECTION,
    item: { type: ItemTypes.SECTION, id: section.id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  const [, drop] = useDrop<DragItem, void, {}>({
    accept: ItemTypes.SECTION,
    hover(item, monitor) {
      if (!ref.current) {
        return;
      }
      
      const dragIndex = item.index;
      const hoverIndex = index;
      
      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }
      
      // Determine rectangle on screen
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      
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
      
      // Time to actually perform the action
      moveSection(dragIndex, hoverIndex);
      
      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });
  
  drag(drop(ref));
  
  // Debug available fields
  React.useEffect(() => {
  }, [section.id, section.title, availableFields]);
  
  // Get assigned and unassigned fields
  const { getAssignedFields, getUnassignedFields } = useFieldAssignment(
    [section],
    availableFields,
    () => {}
  );
  
  const assignedFields = getAssignedFields(section);
  const unassignedFields = getUnassignedFields(section);
  
  // Debug field assignments
  React.useEffect(() => {
  }, [section.id, assignedFields, unassignedFields]);
  
  return (
    <div 
      ref={ref}
      className={`mb-4 border rounded-lg ${isDragging ? 'opacity-50' : 'opacity-100'}`}
    >
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-t-lg">
        <div className="flex items-center">
          <ArrowUpDown className="h-5 w-5 mr-2 text-muted-foreground cursor-move" />
          <div>
            <h3 className="font-medium">{section.title}</h3>
            {section.description && (
              <p className="text-sm text-muted-foreground">{section.description}</p>
            )}
          </div>
        </div>
        <div className="flex space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveUp}
            className="text-muted-foreground"
          >
            <MoveUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveDown}
            className="text-muted-foreground"
          >
            <MoveDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="text-muted-foreground"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="p-4">
        <h4 className="font-medium mb-2">Fields in this section</h4>
        
        {assignedFields.length === 0 ? (
          <div className="text-center p-4 border rounded-md bg-muted/50">
            <p className="text-muted-foreground">No fields assigned to this section</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Add fields from the list below
            </p>
          </div>
        ) : (
          <div className="mb-4">
            {section.fields.map((fieldId, fieldIndex) => {
              const field = availableFields[fieldId];
              if (!field) return null;
              
              return (
                <DraggableField
                  key={fieldId}
                  fieldId={fieldId}
                  field={field}
                  index={fieldIndex}
                  onRemove={() => onRemoveField(fieldId)}
                />
              );
            })}
          </div>
        )}
        
        {unassignedFields.length > 0 && (
          <>
            <h4 className="font-medium mb-2 mt-4">Available fields</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {unassignedFields.map((field: { id: string } & FieldDefinition) => (
                <div 
                  key={field.id}
                  className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50 cursor-pointer"
                  onClick={() => onAddField(field.id)}
                >
                  <div>
                    <div className="font-medium">{field.label}</div>
                    <div className="text-xs text-muted-foreground">{field.type}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}