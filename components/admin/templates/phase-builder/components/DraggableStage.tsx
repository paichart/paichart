import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Button } from '@/components/ui/Button';
import { ArrowUpDown, Edit2, Trash2, Plus } from 'lucide-react';
import { Stage, DragItem } from '../types';
import { ItemTypes } from '../constants';
import { DraggableTask } from './DraggableTask';

interface DraggableStageProps {
  stage: Stage;
  index: number;
  allStages: Stage[]; // All stages for dependency checking
  moveStage: (dragIndex: number, hoverIndex: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddTask: () => void;
  onEditTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTask: (dragIndex: number, hoverIndex: number) => void;
  moveTaskBetweenStages: (sourceStageId: string, targetStageId: string, taskId: string) => void;
}

export function DraggableStage({
  stage,
  index,
  allStages,
  moveStage,
  onEdit,
  onDelete,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onMoveTask,
  moveTaskBetweenStages
}: DraggableStageProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.STAGE,
    item: { type: ItemTypes.STAGE, id: stage.name, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  const [, drop] = useDrop<DragItem, void, {}>({
    accept: ItemTypes.STAGE,
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
      moveStage(dragIndex, hoverIndex);
      
      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });
  
  drag(drop(ref));
  
  return (
    <div 
      ref={ref}
      className={`mb-4 border rounded-lg ${isDragging ? 'opacity-50' : 'opacity-100'}`}
      style={{ borderLeftWidth: '4px', borderLeftColor: '#3b82f6' }}
    >
      <div className="flex items-center justify-between p-4 bg-card rounded-t-lg">
        <div className="flex items-center">
          <ArrowUpDown className="h-5 w-5 mr-2 text-muted-foreground cursor-move" />
          <div>
            <h3 className="font-medium">{stage.name}</h3>
            {stage.description && (
              <p className="text-sm text-muted-foreground">{stage.description}</p>
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
      
      <div className="p-4">
        <h4 className="font-medium mb-2">Tasks</h4>
        
        {stage.tasks.length === 0 ? (
          <div className="text-center p-4 border rounded-md bg-muted">
            <p className="text-muted-foreground">No tasks in this stage</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add tasks to define the workflow for this stage
            </p>
          </div>
        ) : (
          <div className="mb-4">
            {stage.tasks.map((task, taskIndex) => {
              // Check if this task has dependencies
              const hasDependencies = task.dependencies && task.dependencies.length > 0;
              
              // Check if this task is a dependency for other tasks in any stage
              let isDependencyForOthers = false;
              
              // Loop through all stages and their tasks to check if any task depends on this one
              for (const s of allStages) {
                for (const t of s.tasks) {
                  if (t.id !== task.id && t.dependencies) {
                    // Check if this task is in the dependencies
                    const isDependent = t.dependencies.some(dep => {
                      if (typeof dep === 'string') {
                        return dep === task.id;
                      } else if (typeof dep === 'object' && dep !== null) {
                        return 'taskId' in dep && (dep as any).taskId === task.id;
                      }
                      return false;
                    });
                    
                    if (isDependent) {
                      isDependencyForOthers = true;
                      break;
                    }
                  }
                }
                if (isDependencyForOthers) break;
              }
              
              return (
                <DraggableTask
                  key={task.id}
                  task={task}
                  index={taskIndex}
                  stageId={stage.name}
                  onEdit={() => onEditTask(task.id)}
                  onDelete={() => onDeleteTask(task.id)}
                  onMoveTask={onMoveTask}
                  moveTaskBetweenStages={moveTaskBetweenStages}
                  hasDependencies={hasDependencies}
                  isDependencyForOthers={isDependencyForOthers}
                />
              );
            })}
          </div>
        )}
        
        <Button 
          variant="outline"
          onClick={onAddTask}
          className="w-full mt-2"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </div>
    </div>
  );
}
