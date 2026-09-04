"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ChevronRight, ChevronDown, Edit, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProgressIndicator, calculateProgress, getProgressVariant } from './ProgressIndicator';
import { StatusUpdateControls, EntityStatus, StageStatus } from './StatusUpdateControls';
import { CompletionStatusIndicator, determineOverallStatus, calculateCompletionStatus } from './CompletionStatusIndicator';
import { useEditorContext } from '../context';

// Import the TaskItem component
import { TaskItem } from './TaskItem';

interface Task {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type?: string;
  priority?: string;
  dueDate?: string;
  agentRole?: string;
  executionStatus?: string;
}

interface Stage {
  id: string;
  name: string;
  description?: string;
  status: StageStatus;
  order: number;
  tasks: Task[];
}

interface StageItemProps {
  stage: Stage;
  isExpanded: boolean;
  onToggleExpand: (e: React.MouseEvent<HTMLDivElement>) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddTask?: () => void;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  isEditable?: boolean;
}

export const StageItem: React.FC<StageItemProps> = ({
  stage,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddTask,
  onEditTask,
  onDeleteTask,
  selectedTaskId,
  onSelectTask,
  isEditable = true
}) => {
  const { updateEntity } = useEditorContext();
  // Calculate progress percentage
  const calculateStageProgress = () => {
    const totalTasks = stage.tasks.length;
    const completedTasks = stage.tasks.filter(task => task.status === 'COMPLETED').length;
    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  };

  // Get stage status badge color
  const getStageStatusBadgeColor = (status: StageStatus) => {
    switch (status) {
      case 'PENDING':
        return 'bg-muted text-muted-foreground';
      case 'ACTIVE':
        return 'bg-primary/20 text-primary';
      case 'COMPLETED':
        return 'bg-success/20 text-success';
      case 'BLOCKED':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const progress = calculateStageProgress();

  return (
    <Card className="mb-2 overflow-hidden">
      <div 
        className={cn(
          "bg-muted/20 p-3 cursor-pointer",
          isExpanded ? "border-b" : ""
        )}
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
            )}
            <div>
              <div className="font-medium flex items-center">
                {stage.name}
                <Badge className={`ml-2 ${getStageStatusBadgeColor(stage.status)}`}>
                  {stage.status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">{progress}%</div>
              <ProgressIndicator 
                progress={progress} 
                size="sm" 
                variant={getProgressVariant(progress)}
                className="w-20"
              />
              <CompletionStatusIndicator
                status={stage.status as EntityStatus}
                completedItems={stage.tasks.filter(task => task.status === 'COMPLETED').length}
                totalItems={stage.tasks.length}
                showProgress={false}
                size="sm"
              />
            </div>
            {isEditable && (
              <div className="flex space-x-1">
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                  >
                    <Edit className="h-3 w-3" />
                    <span className="sr-only">Edit</span>
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    <span className="sr-only">Delete</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              {stage.description && (
                <div>
                  <h4 className="text-xs font-medium mb-1">Description</h4>
                  <p className="text-xs text-muted-foreground">{stage.description}</p>
                </div>
              )}
            </div>
            {isEditable && (
              <StatusUpdateControls
                status={stage.status as EntityStatus}
                entityType="stage"
                onStatusChange={(status) => {
                  if (stage.id) {
                    updateEntity('stages', stage.id, { status });
                  }
                }}
                className="ml-4"
              />
            )}
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium">Tasks</h4>
              {isEditable && onAddTask && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddTask();
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Task
                </Button>
              )}
            </div>
            
            {stage.tasks.length === 0 ? (
              <div className="text-center p-3 border rounded-md bg-muted/20">
                <p className="text-xs text-muted-foreground">No tasks defined</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stage.tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onSelect={() => onSelectTask(task.id)}
                    onEdit={onEditTask ? () => onEditTask(task.id) : undefined}
                    onDelete={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                    isEditable={isEditable}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
