import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Button } from '@/components/ui/Button';
import { ArrowUpDown, Edit2, Trash2, ArrowDown, ArrowUp, Link } from 'lucide-react';
import { Task, DragItem } from '../types';
import { ItemTypes } from '../constants';
import { getTaskTypeIcon } from '../utils/iconHelpers';

interface DraggableTaskProps {
  task: Task;
  index: number;
  stageId: string;
  onEdit: () => void;
  onDelete: () => void;
  onMoveTask: (dragIndex: number, hoverIndex: number) => void;
  moveTaskBetweenStages: (sourceStageId: string, targetStageId: string, taskId: string) => void;
  hasDependencies?: boolean; // Whether this task has dependencies on other tasks
  isDependencyForOthers?: boolean; // Whether this task is a dependency for other tasks
}

export function DraggableTask({
  task,
  index,
  stageId,
  onEdit,
  onDelete,
  onMoveTask,
  moveTaskBetweenStages,
  hasDependencies = false,
  isDependencyForOthers = false
}: DraggableTaskProps) {
  const taskRef = React.useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.TASK,
    item: { type: ItemTypes.TASK, id: task.id, index, stageId },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  const [, drop] = useDrop<DragItem & { stageId?: string }, void, {}>({
    accept: ItemTypes.TASK,
    hover(item, monitor) {
      if (!taskRef.current) {
        return;
      }
      
      const dragIndex = item.index;
      const hoverIndex = index;
      
      // Don't replace items with themselves
      if (dragIndex === hoverIndex && item.stageId === stageId) {
        return;
      }
      
      // Determine rectangle on screen
      const hoverBoundingRect = taskRef.current.getBoundingClientRect();
      
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
      
      // If moving within the same stage
      if (item.stageId === stageId) {
        onMoveTask(dragIndex, hoverIndex);
        item.index = hoverIndex;
      } else if (item.stageId) {
        // If moving between stages
        moveTaskBetweenStages(item.stageId, stageId, item.id);
        item.stageId = stageId;
        item.index = index;
      }
    },
  });
  
  drag(drop(taskRef));
  
  return (
    <div 
      ref={taskRef}
      className={`flex items-center justify-between p-2 mb-2 border rounded-md ${
        isDragging ? 'opacity-50 bg-muted' : 'bg-card'
      }`}
    >
      <div className="flex items-center">
        <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground cursor-move" />
        <div className="mr-2">
          {getTaskTypeIcon(task.type)}
        </div>
        <div>
          <div className="font-medium flex items-center">
            {task.title}
            <div className="ml-2 flex space-x-1">
              {hasDependencies && !isDependencyForOthers && (
                <div key="depends-only" className="flex items-center" title="This task depends on other tasks">
                  <Link className="h-3 w-3 text-blue-500" />
                </div>
              )}
              {isDependencyForOthers && !hasDependencies && (
                <div key="dependency-only" className="flex items-center" title="Other tasks depend on this task">
                  <ArrowDown className="h-3 w-3 text-amber-500" />
                </div>
              )}
              {hasDependencies && isDependencyForOthers && (
                <div className="ml-2 flex space-x-1">
                  <div key="depends-on" className="flex items-center" title="This task depends on other tasks">
                    <ArrowUp className="h-3 w-3 text-blue-500" />
                  </div>
                  <div key="dependency-for" className="flex items-center" title="Other tasks depend on this task">
                    <ArrowDown className="h-3 w-3 text-amber-500" />
                  </div>
                </div>
              )}
              {/* The Link icon logic was removed as it was mutually exclusive with the arrows.
                  If a specific use case for the Link icon is needed, it can be added back. */}
            </div>
          </div>
          {task.description && (
            <div className="text-xs text-muted-foreground">{task.description}</div>
          )}
        </div>
      </div>
      <div className="flex space-x-1">
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
  );
}
