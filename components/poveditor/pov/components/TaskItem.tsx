"use client";

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Edit, Trash2, Bot, AlertCircle, Clock, CheckCircle2, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusUpdateControls, EntityStatus } from './StatusUpdateControls';
import { CompletionStatusIndicator } from './CompletionStatusIndicator';
import { useEditorContext } from '../context';

interface Task {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type?: string;
  priority?: string;
  dueDate?: string;
  dependencies?: string[];
  agentRole?: string;
  executionStatus?: string;
  /** Full task metadata (already threaded by the editor normalizer). The harness stamps
   *  metadata.qualityGate = { reviewerScore, outcome: 'approved'|'needs-revision'|'escalated' }
   *  at SYNTHESIZE (2026-07-08; may carry verdictMismatch: true when the stamped outcome
   *  contradicts the reviewer's parsed terminal verdict, 2026-07-14) — FACTS only, no adequacy
   *  verdict (Protocol 10). needs-revision renders via the amber else-branch below. */
  metadata?: Record<string, any>;
}

interface TaskItemProps {
  task: Task;
  isSelected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditable?: boolean;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  isEditable = true
}) => {
  const { updateEntity } = useEditorContext();
  // Get task priority badge color
  const getTaskPriorityBadgeColor = (priority?: string) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-destructive/20 text-destructive';
      case 'MEDIUM':
        return 'bg-warning/20 text-warning';
      case 'LOW':
        return 'bg-success/20 text-success';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Get task type badge color
  const getTaskTypeBadgeColor = (type?: string) => {
    switch (type) {
      case 'PIPELINE':
        return 'bg-purple-500/20 text-purple-500';
      case 'ACTION':
        return 'bg-primary/20 text-primary';
      case 'DECISION':
        return 'bg-warning/20 text-warning';
      case 'MILESTONE':
        return 'bg-success/20 text-success';
      case 'APPROVAL':
        return 'bg-info/20 text-info';
      case 'DOCUMENT':
        return 'bg-secondary/20 text-secondary';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Get task status icon
  const getTaskStatusIcon = (status?: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'IN_PROGRESS':
        return <Clock className="h-4 w-4 text-primary" />;
      case 'BLOCKED':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'OPEN':
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
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

  return (
    <Card 
      className={cn(
        "p-3 cursor-pointer hover:bg-muted/20 transition-colors",
        isSelected && "border-primary bg-primary/5"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <CompletionStatusIndicator
            status={task.status as EntityStatus || 'OPEN'}
            showProgress={false}
            size="sm"
            className="mr-2"
          />
          <div>
            <div className="font-medium flex items-center">
              {task.title}
              {/* Agent indicator (2026-06-10): the Bot icon has always meant
                  "agent configured" — now color-codes the latest execution
                  state too. Native title tooltip explains it on hover. */}
              {task.agentRole && (
                <span
                  className="inline-flex items-center ml-2"
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
                      'h-3 w-3',
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
                    <CheckCircle2 className="h-2.5 w-2.5 -ml-0.5 -mt-1.5 text-success" />
                  )}
                </span>
              )}
              {/* Pipeline quality-gate indicator (2026-07-08): renders the FACTS the harness
                  stamped at SYNTHESIZE — reviewer score + approved/escalated. Deliberately no
                  "mitigation adequate" style verdicts (Protocol 10): an escalated run's draft
                  deliverable + mitigation live in report.md for the human to judge in context. */}
              {task.metadata?.qualityGate?.outcome && (
                <span
                  className="inline-flex items-center ml-1.5"
                  title={
                    task.metadata.qualityGate.outcome === 'escalated'
                      ? `Quality gate ESCALATED — reviewer ${task.metadata.qualityGate.reviewerScore ?? '?'}/100 (< 50 floor). Human decision required; draft deliverable on report.md`
                      : `Quality gate: ${task.metadata.qualityGate.outcome} — reviewer ${task.metadata.qualityGate.reviewerScore ?? '?'}/100`
                  }
                >
                  {task.metadata.qualityGate.outcome === 'escalated' ? (
                    <ShieldAlert className="h-3 w-3 text-destructive" />
                  ) : task.metadata.qualityGate.outcome === 'approved' ? (
                    <ShieldCheck className="h-3 w-3 text-success" />
                  ) : (
                    <Shield className="h-3 w-3 text-amber-500" />
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2 mt-1">
              {task.type && (
                <Badge className={getTaskTypeBadgeColor(task.type)}>
                  {task.type}
                </Badge>
              )}
              {task.priority && (
                <Badge className={getTaskPriorityBadgeColor(task.priority)}>
                  {task.priority}
                </Badge>
              )}
              {task.dueDate && (
                <span className="text-xs text-muted-foreground">
                  Due: {formatDate(task.dueDate)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isEditable && (
            <StatusUpdateControls
              status={task.status as EntityStatus || 'OPEN'}
              entityType="task"
              onStatusChange={(status) => {
                if (task.id) {
                  updateEntity('tasks', task.id, { status });
                }
              }}
            />
          )}
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
      
      {task.description && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">{task.description}</p>
        </div>
      )}
      
      {task.executionStatus && task.agentRole && (
        <div className="mt-2 flex items-center">
          <Badge variant="outline" className="text-xs">
            Agent: {task.agentRole}
          </Badge>
          <Badge 
            variant={task.executionStatus === 'SUCCESS' ? 'success' : 
                    task.executionStatus === 'FAILED' ? 'destructive' : 
                    task.executionStatus === 'RUNNING' ? 'default' : 'outline'} 
            className="ml-2 text-xs"
          >
            {task.executionStatus}
          </Badge>
        </div>
      )}
    </Card>
  );
};
