"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { 
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  FileText,
  Users,
  Calendar
} from 'lucide-react';
import { usePhaseTemplateOperations, useTemplateData } from '../context/TemplateEditorContext';

/**
 * Phase Template Preview Component
 * Provides a visual preview of the phase template structure
 */
export default function PhaseTemplatePreview() {
  const { phases, stages, tasks, relationships } = usePhaseTemplateOperations();
  const templateData = useTemplateData();

  // Get preview statistics
  const getPreviewStats = () => {
    const phaseCount = Object.keys(phases).length;
    const stageCount = Object.keys(stages).length;
    const taskCount = Object.keys(tasks).length;
    
    // Calculate estimated duration (if phases have duration data)
    const totalDuration = Object.values(phases).reduce((total: number, phase: any) => {
      return total + (phase.estimatedDuration || 0);
    }, 0);

    return { phaseCount, stageCount, taskCount, totalDuration };
  };

  // Get phase type color
  const getPhaseTypeColor = (type: string) => {
    switch (type) {
      case 'PLANNING':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'EXECUTION':
        return 'bg-green-500/10 text-green-600 dark:text-green-400';
      case 'REVIEW':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Get task priority color
  const getTaskPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-600 dark:text-red-400';
      case 'MEDIUM':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
      case 'LOW':
        return 'bg-green-500/10 text-green-600 dark:text-green-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Get task type icon
  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case 'ACTION':
        return <Play className="h-4 w-4" />;
      case 'REVIEW':
        return <FileText className="h-4 w-4" />;
      case 'APPROVAL':
        return <CheckCircle className="h-4 w-4" />;
      case 'MILESTONE':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  // Get stages for a specific phase
  const getStagesForPhase = (phaseId: string) => {
    return relationships?.phaseToStages?.[phaseId] || [];
  };

  // Get tasks for a specific stage
  const getTasksForStage = (stageId: string) => {
    return relationships?.stageToTasks?.[stageId] || [];
  };

  const stats = getPreviewStats();

  if (stats.phaseCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Template Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Template Structure</h3>
            <p className="text-muted-foreground">
              Add phases, stages, and tasks to see a preview of your template structure.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Template Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Template Preview: {templateData.name || 'Untitled Template'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.phaseCount}</div>
              <div className="text-sm text-muted-foreground">Phases</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.stageCount}</div>
              <div className="text-sm text-muted-foreground">Stages</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.taskCount}</div>
              <div className="text-sm text-muted-foreground">Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {stats.totalDuration > 0 ? `${stats.totalDuration}d` : '—'}
              </div>
              <div className="text-sm text-muted-foreground">Duration</div>
            </div>
          </div>
          
          {templateData.description && (
            <p className="text-muted-foreground text-sm">{templateData.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Phase Structure */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Template Structure</h3>
        
        {Object.values(phases)
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
          .map((phase: any, phaseIndex: number) => {
            const phaseStages = getStagesForPhase(phase.id);
            
            return (
              <Card key={phase.id} className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-sm font-semibold">
                        {phaseIndex + 1}
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">{phase.name}</h4>
                        {phase.description && (
                          <p className="text-sm text-muted-foreground">{phase.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getPhaseTypeColor(phase.type)}>
                        {phase.type}
                      </Badge>
                      {phase.estimatedDuration && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {phase.estimatedDuration}d
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                {phaseStages.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {phaseStages
                        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                        .map((stage: any, stageIndex: number) => {
                          const stageTasks = getTasksForStage(stage.id);
                          
                          return (
                            <div key={stage.id} className="border border-border rounded-lg p-4 bg-muted">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center justify-center w-6 h-6 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full text-xs font-semibold">
                                    {stageIndex + 1}
                                  </div>
                                  <h5 className="font-medium text-foreground">{stage.name}</h5>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {stageTasks.length} task{stageTasks.length !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                              
                              {stage.description && (
                                <p className="text-sm text-muted-foreground mb-3">{stage.description}</p>
                              )}
                              
                              {stageTasks.length > 0 && (
                                <div className="space-y-2">
                                  {stageTasks
                                    .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                                    .map((task: any) => (
                                      <div key={task.id} className="flex items-center gap-3 p-2 bg-background rounded border border-border">
                                        <div className="flex items-center gap-2 flex-1">
                                          {getTaskTypeIcon(task.type)}
                                          <span className="text-sm font-medium text-foreground">
                                            {task.title}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {task.priority && (
                                            <Badge className={`${getTaskPriorityColor(task.priority)} text-xs`}>
                                              {task.priority}
                                            </Badge>
                                          )}
                                          {task.assigneeRole && (
                                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                                              <Users className="h-3 w-3" />
                                              {task.assigneeRole}
                                            </Badge>
                                          )}
                                          {task.estimatedHours && (
                                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                                              <Clock className="h-3 w-3" />
                                              {task.estimatedHours}h
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
      </div>

      {/* Template Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Template Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h5 className="font-medium text-foreground mb-2">Complexity Analysis</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average tasks per stage:</span>
                  <span className="font-medium text-foreground">
                    {stats.stageCount > 0 ? Math.round(stats.taskCount / stats.stageCount) : 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average stages per phase:</span>
                  <span className="font-medium text-foreground">
                    {stats.phaseCount > 0 ? Math.round(stats.stageCount / stats.phaseCount) : 0}
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <h5 className="font-medium text-foreground mb-2">Recommendations</h5>
              <div className="space-y-1 text-sm text-muted-foreground">
                {stats.phaseCount > 8 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Consider consolidating phases
                  </div>
                )}
                {stats.taskCount > 50 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Large number of tasks may be complex
                  </div>
                )}
                {stats.stageCount === 0 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-blue-500" />
                    Add stages to organize tasks better
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
