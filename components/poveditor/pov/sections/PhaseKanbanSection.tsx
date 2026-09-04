"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useEditorContext } from '../context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { KanbanIcon, Users, CheckCircle, Clock, AlertCircle, Bot } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { toast } from "@/lib/hooks/useToast";
import { Task } from '../context/types/EntityTypes';
import { TaskStatus, TaskPriority } from '@prisma/client';

/**
 * Phase Kanban Section - Original Kanban layout with task groupings
 * 
 * This component displays tasks grouped into logical categories (like the original Kanban stages)
 * but without workflow-based status management. Tasks are grouped by priority or type.
 */

interface TaskGroup {
  id: string;
  name: string;
  description?: string;
  tasks: Task[];
}

interface PhaseKanbanSectionProps {
  phaseId: string;
  phaseData?: {
    id: string;
    name: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };
}

export default function PhaseKanbanSection({ phaseId, phaseData }: PhaseKanbanSectionProps) {
  const { state, updateField } = useEditorContext();

  // State for UI
  const [loading, setLoading] = useState(true);

  // Get tasks for this specific phase from editor state
  const phaseTasks = useMemo(() => {
    const allTasks = Object.values(state.entities?.tasks || {});
    return allTasks.filter(task => task.phaseId === phaseId);
  }, [state.entities?.tasks, phaseId]);

  // Assignee lookup (2026-06-10): resolve names from team entities so the
  // card can show real initials instead of an anonymous Users glyph.
  const teamByUserId = useMemo(() => {
    const map = new Map<string, { name?: string }>();
    (Object.values(state.entities?.team || {}) as any[]).forEach((m) => {
      if (m?.userId && !map.has(m.userId)) map.set(m.userId, m);
    });
    return map;
  }, [state.entities?.team]);
  const getAssigneeInitials = (assigneeId?: string): string | null => {
    if (!assigneeId) return null;
    const name = teamByUserId.get(assigneeId)?.name;
    if (!name) return null;
    return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  };

  // Get stages for this phase from editor state with improved deduplication
  const phaseStages = useMemo(() => {
    const allStages = Object.values(state.entities?.stages || {});

    const phaseStagesFiltered = allStages.filter(stage => {
      return stage.phaseId === phaseId &&
             stage.id !== 'undefined' &&
             stage.id &&
             stage.id.trim() !== '' &&
             stage.name &&
             stage.name.trim() !== '';
    });

    // Better deduplication logic - prefer real IDs over temp IDs
    const stageMap = new Map();
    phaseStagesFiltered.forEach(stage => {
      const key = `${stage.name}-${stage.phaseId}`;
      const existing = stageMap.get(key);

      if (!existing) {
        stageMap.set(key, stage);
      } else {
        // Prefer real ID over temporary ID
        const isExistingTemp = existing.id.startsWith('temp-');
        const isCurrentTemp = stage.id.startsWith('temp-');

        if (isExistingTemp && !isCurrentTemp) {
          // Replace temporary with real
          stageMap.set(key, stage);
        }
        // Otherwise keep existing
      }
    });

    const deduplicatedStages = Array.from(stageMap.values());

    // Sort stages by order
    return deduplicatedStages.sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [state.entities?.stages, phaseId]);

  // Group tasks by the actual phase stages (like the original Kanban)
  const taskGroups = useMemo((): TaskGroup[] => {
    // If we have stages from the database, use those
    if (phaseStages.length > 0) {
      const groups: TaskGroup[] = phaseStages.map(stage => ({
        id: stage.id,
        name: stage.name,
        description: stage.description,
        tasks: []
      }));

      // Distribute tasks into stage groups based on stageId
      phaseTasks.forEach(task => {
        const targetGroup = groups.find(group => group.id === task.stageId);
        if (targetGroup) {
          targetGroup.tasks.push(task);
        } else {
          // If task doesn't have a stageId or stage not found, put in first group
          if (groups.length > 0) {
            groups[0].tasks.push(task);
          }
        }
      });

      // Sort tasks within each group by order field
      groups.forEach(group => {
        group.tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });

      return groups;
    }

    // Fallback: Create default stages if none exist in database
    const defaultGroups: TaskGroup[] = [
      {
        id: 'planning',
        name: 'Planning & Setup',
        description: 'Initial planning and preparation tasks',
        tasks: []
      },
      {
        id: 'implementation',
        name: 'Implementation',
        description: 'Core development and configuration tasks',
        tasks: []
      },
      {
        id: 'testing',
        name: 'Testing & Validation',
        description: 'Testing, validation, and quality assurance',
        tasks: []
      },
      {
        id: 'deployment',
        name: 'Deployment & Completion',
        description: 'Final deployment and project completion',
        tasks: []
      }
    ];

    // Distribute tasks into default groups based on status
    phaseTasks.forEach(task => {
      if (task.status === TaskStatus.COMPLETED) {
        defaultGroups[3].tasks.push(task);
      } else if (task.status === TaskStatus.IN_PROGRESS) {
        defaultGroups[1].tasks.push(task);
      } else if (task.status === TaskStatus.BLOCKED) {
        defaultGroups[2].tasks.push(task);
      } else {
        defaultGroups[0].tasks.push(task);
      }
    });

    return defaultGroups;
  }, [phaseTasks, phaseStages]);

  // Initialize component
  useEffect(() => {
    setLoading(false);
  }, [phaseId]);

  // Handle task selection
  const handleTaskSelect = (taskId: string) => {
    updateField(['ui', 'selectedTaskId'], taskId);
    updateField(['ui', 'selectedPhaseId'], phaseId);
  };


  // Get status icon and color
  const getStatusDisplay = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.COMPLETED:
        return { icon: CheckCircle, color: 'text-green-500' };
      case TaskStatus.IN_PROGRESS:
        return { icon: Clock, color: 'text-blue-500' };
      case TaskStatus.BLOCKED:
        return { icon: AlertCircle, color: 'text-red-500' };
      default:
        return { icon: Clock, color: 'text-gray-500' };
    }
  };

  // Get priority color
  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      case 'LOW':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  // Calculate phase progress
  const phaseProgress = useMemo(() => {
    if (phaseTasks.length === 0) return 0;
    const completedTasks = phaseTasks.filter(task => task.status === TaskStatus.COMPLETED).length;
    return Math.round((completedTasks / phaseTasks.length) * 100);
  }, [phaseTasks]);

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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[400px]">
        <div className="text-center">
          <KanbanIcon className="h-8 w-8 mx-auto mb-2 animate-pulse" />
          <p>Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Phase Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KanbanIcon className="h-6 w-6 text-primary" />
              <div>
                <CardTitle className="text-xl">
                  {phaseData?.name || `Phase ${phaseId}`}
                  {phaseData?.endDate && (
                    <span className="text-base font-normal text-muted-foreground ml-2">
                      - Due by {formatEndDateForTitle(phaseData.endDate)}
                    </span>
                  )}
                </CardTitle>
                {phaseData?.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {phaseData.description}
                  </p>
                )}
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm font-medium">
                {phaseTasks.length} Tasks
              </div>
              <div className="text-xs text-muted-foreground">
                {phaseProgress}% Complete
              </div>
              {/* Small Progress Bar */}
              <div className="mt-1 w-24">
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div 
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${phaseProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Kanban Board - Original Layout with Groups */}
      <div className="space-y-4">
        {phaseTasks.length > 0 ? (
          <div className="flex space-x-4 overflow-x-auto pb-4">
            {taskGroups.map((group) => (
              <div key={group.id} className="w-80 flex-shrink-0">
                <Card>
                  <CardHeader className="bg-muted/50">
                    <CardTitle className="flex justify-between items-center">
                      <span className="text-sm font-medium">{group.name}</span>
                      <span className="text-sm text-muted-foreground bg-background px-2 py-1 rounded">
                        {group.tasks.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    <div className="min-h-[200px] space-y-2">
                      {group.tasks.length > 0 ? (
                        group.tasks.map((task) => {
                          const statusDisplay = getStatusDisplay(task.status);
                          const StatusIcon = statusDisplay.icon;
                          
                          return (
                            <Card 
                              key={task.id}
                              className={`cursor-pointer hover:shadow-md transition-all duration-200 ${
                                state.ui.selectedTaskId === task.id 
                                  ? 'ring-2 ring-primary bg-primary/5 shadow-md' 
                                  : 'hover:bg-muted/50'
                              }`}
                              onClick={() => handleTaskSelect(task.id)}
                            >
                              <CardContent className="p-3">
                                {/* Task Title */}
                                <div className="font-medium text-sm mb-2 line-clamp-2">
                                  {task.title}
                                </div>
                                
                                {/* Task Description */}
                                {task.description && (
                                  <div className="text-xs text-muted-foreground mb-3 line-clamp-2">
                                    {task.description}
                                  </div>
                                )}
                                
                                {/* Task Metadata */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {/* Priority Badge */}
                                    <Badge 
                                      variant="outline" 
                                      className={`text-xs px-2 py-0.5 ${getPriorityColor(task.priority)}`}
                                    >
                                      {task.priority}
                                    </Badge>
                                    
                                    {/* Status Icon */}
                                    <StatusIcon className={`h-3 w-3 ${statusDisplay.color}`} />

                                    {/* Agent indicator (2026-06-10): Bot = agent
                                        configured; color = latest execution state.
                                        Same scheme as TaskItem/TaskCard. */}
                                    {task.agentRole && (
                                      <span
                                        className="inline-flex items-center"
                                        title={
                                          task.executionStatus === 'SUCCESS'
                                            ? `Agent (${task.agentRole}) — last execution succeeded`
                                            : task.executionStatus === 'FAILED'
                                              ? `Agent (${task.agentRole}) — last execution FAILED`
                                              : task.executionStatus === 'RUNNING' || task.executionStatus === 'PENDING'
                                                ? `Agent (${task.agentRole}) — execution in progress`
                                                : `Agent configured (${task.agentRole}) — not yet executed`
                                        }
                                      >
                                        <Bot
                                          className={cn(
                                            'h-3.5 w-3.5',
                                            task.executionStatus === 'SUCCESS'
                                              ? 'text-success'
                                              : task.executionStatus === 'FAILED'
                                                ? 'text-destructive'
                                                : task.executionStatus === 'RUNNING' || task.executionStatus === 'PENDING'
                                                  ? 'text-amber-500 animate-pulse'
                                                  : 'text-primary'
                                          )}
                                        />
                                        {task.executionStatus === 'SUCCESS' && (
                                          <CheckCircle className="h-2.5 w-2.5 -ml-1 -mt-2 text-success" />
                                        )}
                                      </span>
                                    )}
                                  </div>

                                  {/* Assignee — initials when resolvable, Users glyph fallback */}
                                  {task.assigneeId && (
                                    <div
                                      className="flex items-center gap-1"
                                      title={teamByUserId.get(task.assigneeId)?.name || 'Assignee not in team list'}
                                    >
                                      {getAssigneeInitials(task.assigneeId) ? (
                                        <Avatar className="h-5 w-5">
                                          <AvatarFallback className="text-[10px]">
                                            {getAssigneeInitials(task.assigneeId)}
                                          </AvatarFallback>
                                        </Avatar>
                                      ) : (
                                        <Users className="h-3 w-3 text-muted-foreground" />
                                      )}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })
                      ) : (
                        <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                          No tasks in this group
                        </div>
                      )}
                    </div>
                    
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <KanbanIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No tasks yet</h3>
              <p className="text-sm text-muted-foreground text-center">
                Tasks for this phase will appear here once created. Use the Tasks tab to create and manage tasks.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Selection Indicator */}
      {state.ui.selectedTaskId && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              ✓ Task selected. Switch to the <strong>Tasks</strong> tab to edit details and status, or the <strong>Agents</strong> tab to configure AI automation.
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
