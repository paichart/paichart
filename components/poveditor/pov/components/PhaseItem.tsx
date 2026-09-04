"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ChevronRight, ChevronDown, Edit, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProgressIndicator, calculateProgress, getProgressVariant } from './ProgressIndicator';
import { StatusUpdateControls, EntityStatus, PhaseStatus, StageStatus } from './StatusUpdateControls';
import { CompletionStatusIndicator, determineOverallStatus, calculateCompletionStatus } from './CompletionStatusIndicator';
import { useEditorContext } from '../context';

// Import the StageItem component
import { StageItem } from './StageItem';
import { TaskItem } from './TaskItem';

// Define PhaseType
type PhaseType = 'PLANNING' | 'EXECUTION' | 'REVIEW';

interface Phase {
  id: string;
  name: string;
  description?: string;
  type: PhaseType;
  status?: string;
  startDate?: string;
  endDate?: string;
  order?: number;
  stages: Stage[];
  tasks?: Task[];
}

interface Stage {
  id: string;
  name: string;
  description?: string;
  status: StageStatus;
  order: number;
  tasks: Task[];
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type?: string;
  priority?: string;
  dueDate?: string;
  agentRole?: string;
  stageId?: string;
  executionStatus?: string;
}

interface PhaseItemProps {
  phase: Phase;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddStage?: () => void;
  onEditStage?: (stageId: string) => void;
  onDeleteStage?: (stageId: string) => void;
  onAddTask?: (stageId: string) => void;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  isEditable?: boolean;
}

export const PhaseItem: React.FC<PhaseItemProps> = ({
  phase,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddStage,
  onEditStage,
  onDeleteStage,
  onAddTask,
  onEditTask,
  onDeleteTask,
  selectedTaskId,
  onSelectTask,
  isEditable = true
}) => {
  const { updateEntity } = useEditorContext();
  // State for expanded stages
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  // Toggle stage expansion
  const toggleStageExpansion = (stageId: string, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const newExpandedStages = new Set(expandedStages);
    if (newExpandedStages.has(stageId)) {
      newExpandedStages.delete(stageId);
    } else {
      newExpandedStages.add(stageId);
    }
    setExpandedStages(newExpandedStages);
  };

  // Calculate progress percentage
  const calculateProgress = () => {
    const stageTasks = phase.stages.flatMap(stage => stage.tasks);
    const phaseTasks = (phase.tasks || []).filter(task => !task.stageId);
    const allTasks = [...stageTasks, ...phaseTasks];
    const totalTasks = allTasks.length;
    if (totalTasks === 0) return 0;
    const completedTasks = allTasks.filter(task => task.status === 'COMPLETED').length;
    return Math.round((completedTasks / totalTasks) * 100);
  };

  // Get phase type badge color
  const getPhaseTypeBadgeColor = (type: PhaseType) => {
    switch (type) {
      case 'PLANNING':
        return 'bg-primary/20 text-primary';
      case 'EXECUTION':
        return 'bg-warning/20 text-warning';
      case 'REVIEW':
        return 'bg-success/20 text-success';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (error) {
      return '';
    }
  };

  // Format end date for phase title display
  const formatEndDateForTitle = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'long' });
      const year = date.getFullYear();
      
      // Add ordinal suffix to day
      const getOrdinalSuffix = (day: number) => {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
          case 1: return 'st';
          case 2: return 'nd';
          case 3: return 'rd';
          default: return 'th';
        }
      };
      
      return `${day}${getOrdinalSuffix(day)} ${month}, ${year}`;
    } catch (error) {
      return '';
    }
  };

  const progress = calculateProgress();

  return (
    <Card className="mb-4 overflow-hidden">
      <div 
        className={cn(
          "bg-muted/30 p-4 cursor-pointer",
          isExpanded ? "border-b" : ""
        )}
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 mr-2 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 mr-2 text-muted-foreground" />
            )}
            <div>
              <div className="font-medium flex items-center">
                {phase.name}
                {phase.endDate && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    - Due by {formatEndDateForTitle(phase.endDate)}
                  </span>
                )}
                <Badge className={`ml-2 ${getPhaseTypeBadgeColor(phase.type)}`}>
                  {phase.type}
                </Badge>
              </div>
              {phase.description && (
                <div className="text-sm text-muted-foreground">
                  {phase.description}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-medium">
                {phase.stages.reduce((acc, stage) => acc + stage.tasks.length, 0)} Tasks
              </div>
              <div className="text-xs text-muted-foreground">
                {progress}% Complete
              </div>
              {/* Small Progress Bar */}
              <div className="mt-1 w-24">
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div 
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
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
                    <Edit className="h-4 w-4" />
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
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              {phase.description && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Description</h4>
                  <p className="text-sm text-muted-foreground">{phase.description}</p>
                </div>
              )}
            </div>
            {isEditable && (
              <StatusUpdateControls
                status={phase.status as EntityStatus || 'PENDING'}
                entityType="phase"
                onStatusChange={(status) => {
                  if (phase.id) {
                    updateEntity('phases', phase.id, { status });
                  }
                }}
                className="ml-4"
              />
            )}
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Stages</h4>
              {isEditable && onAddStage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddStage();
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Stage
                </Button>
              )}
            </div>
            
            {phase.stages.length === 0 ? (
              <div className="text-center p-4 border rounded-md bg-muted/20">
                <p className="text-sm text-muted-foreground">No stages defined</p>
              </div>
            ) : (
              <div className="space-y-2 pl-4">
                {phase.stages.map((stage) => (
                  <StageItem
                    key={stage.id}
                    stage={stage}
                    isExpanded={expandedStages.has(stage.id)}
                    onToggleExpand={(e: React.MouseEvent<HTMLDivElement>) => toggleStageExpansion(stage.id, e)}
                    onEdit={onEditStage ? () => onEditStage(stage.id) : undefined}
                    onDelete={onDeleteStage ? () => onDeleteStage(stage.id) : undefined}
                    onAddTask={onAddTask ? () => onAddTask(stage.id) : undefined}
                    onEditTask={onEditTask}
                    onDeleteTask={onDeleteTask}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                    isEditable={isEditable}
                  />
                ))}
              </div>
            )}
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Tasks without a Stage</h4>
              </div>
              <div className="space-y-2 pl-4">
                {(phase.tasks || []).filter(task => !task.stageId).map(task => (
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
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
