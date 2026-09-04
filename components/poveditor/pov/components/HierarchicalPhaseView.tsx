"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';
import { PhaseItem } from './PhaseItem';
import { TaskSelectionToolbar } from './TaskSelectionToolbar';
import { PhaseType, StageStatus } from '@/lib/pov/phase-templates/types';

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
}

interface HierarchicalPhaseViewProps {
  phases: Record<string, Phase>;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  expandedPhases: Set<string>;
  onTogglePhase: (phaseId: string) => void;
  onAddPhase?: () => void;
  onEditPhase?: (phaseId: string) => void;
  onDeletePhase?: (phaseId: string) => void;
  onAddStage?: (phaseId: string) => void;
  onEditStage?: (stageId: string) => void;
  onDeleteStage?: (stageId: string) => void;
  onAddTask?: (stageId: string) => void;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  isEditable?: boolean;
}

export const HierarchicalPhaseView: React.FC<HierarchicalPhaseViewProps> = ({
  phases,
  selectedTaskId,
  onSelectTask,
  expandedPhases,
  onTogglePhase,
  onAddPhase,
  onEditPhase,
  onDeletePhase,
  onAddStage,
  onEditStage,
  onDeleteStage,
  onAddTask,
  onEditTask,
  onDeleteTask,
  isEditable = true
}) => {
  // Convert phases record to array and sort by type first, then by order
  const phasesArray = Object.values(phases).sort((a, b) => {
    // Define type order: PLANNING = 0, EXECUTION = 1, REVIEW = 2
    const typeOrder = { PLANNING: 0, EXECUTION: 1, REVIEW: 2 };
    const aTypeOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 999;
    const bTypeOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 999;
    
    // First sort by type
    if (aTypeOrder !== bTypeOrder) {
      return aTypeOrder - bTypeOrder;
    }
    
    // Then sort by order within the same type
    return (a.order || 0) - (b.order || 0);
  });

  // Bulk actions: only DELETE is implemented. The assign-agent / set-status /
  // set-due-date stubs were removed 2026-08-19 (metadata-panel bc R12): the
  // toolbar hides buttons whose handlers are absent, so passing no-op handlers
  // rendered live buttons that did nothing when clicked. Re-add a handler only
  // WITH its implementation.
  const handleDeleteTasks = (taskIds: string[]) => {
    // If onDeleteTask is provided, call it for each task
    if (onDeleteTask) {
      taskIds.forEach(taskId => onDeleteTask(taskId));
    }
  };
  
  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-end">
        {isEditable && onAddPhase && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAddPhase}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Phase
          </Button>
        )}
      </div>

      {phasesArray.length === 0 ? (
        <div className="text-center p-8 border rounded-md bg-muted/20">
          <p className="text-muted-foreground">No phases defined</p>
          {isEditable && onAddPhase && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={onAddPhase}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Phase
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {phasesArray.map((phase) => (
            <PhaseItem
              key={phase.id}
              phase={phase}
              isExpanded={expandedPhases.has(phase.id)}
              onToggleExpand={() => onTogglePhase(phase.id)}
              onEdit={onEditPhase ? () => onEditPhase(phase.id) : undefined}
              onDelete={onDeletePhase ? () => onDeletePhase(phase.id) : undefined}
              onAddStage={onAddStage ? () => onAddStage(phase.id) : undefined}
              onEditStage={onEditStage}
              onDeleteStage={onDeleteStage}
              onAddTask={onAddTask}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              isEditable={isEditable}
            />
          ))}
        </div>
      )}
      
      {/* Task selection toolbar */}
      {isEditable && (
        <TaskSelectionToolbar
          onDelete={handleDeleteTasks}
        />
      )}
    </div>
  );
};
