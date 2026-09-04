"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { useEditorContext } from '../context';
import { TaskStatus, StageStatus, PhaseStatus, EntityStatus } from './StatusUpdateControls';
import { ResourceAction, ResourceType } from '@/lib/types/auth';
import { checkPermission } from '@/lib/auth/permissions';
import { useToast } from '@/lib/hooks/useToast';
import { TaskPriority, TaskType } from '@prisma/client';
import { taskTypeLabels } from '@/lib/utils/taskTypes';
import { toLocalYmd, fromLocalYmd } from '@/lib/utils/local-date';

interface TaskEditDialogProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (taskId: string) => void;
}

export function TaskEditDialog({ taskId, isOpen, onClose, onSave }: TaskEditDialogProps) {
  const { state, updateEntity, addEntity, saveData } = useEditorContext();
  const { toast } = useToast();
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('OPEN');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [type, setType] = useState<TaskType>('ACTION');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [stageId, setStageId] = useState('');
  const [order, setOrder] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  
  // Permission state
  const [canEdit, setCanEdit] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);

  // 🔧 FIX: Deduplicate team members by userId to prevent duplicates in dropdown
  const teamMembers = useMemo(() => {
    const allMembers = Object.values(state.entities?.team || {});
    const uniqueMembers = new Map();
    
    // Deduplicate by userId (keep the first occurrence)
    allMembers.forEach(member => {
      if (member.userId && !uniqueMembers.has(member.userId)) {
        uniqueMembers.set(member.userId, member);
      }
    });
    
    return Array.from(uniqueMembers.values());
  }, [state.entities?.team]);
  
  // Group stages by phase for the dropdown
  const stagesByPhase = useMemo(() => {
    const phases = Object.values(state.entities?.phases || {})
      .sort((a, b) => a.order - b.order);
    
    const allStages = Object.values(state.entities?.stages || {});
    
    // 🔧 ENHANCED FIX: Deduplicate stages by name+phase to handle temp ID → real ID transitions
    const uniqueStages = new Map();
    allStages.forEach(stage => {
      if (stage.id && stage.name && stage.phaseId) {
        // Use stage.id as the unique key to avoid accidentally removing stages
        const key = stage.id;
        uniqueStages.set(key, stage);
      }
    });
    
    const stages = Array.from(uniqueStages.values());

    return phases.map(phase => ({
      phase,
      stages: stages
        .filter(stage => stage.phaseId === phase.id)
        .sort((a, b) => a.order - b.order)
    })).filter(group => group.stages.length > 0);
  }, [state.entities?.phases, state.entities?.stages]);
  
  // Initialize form with task data or defaults for new tasks
  useEffect(() => {
    if (taskId && state.entities.tasks[taskId]) {
      // Existing task - populate with current data
      const task = state.entities.tasks[taskId];
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status as TaskStatus || 'OPEN');
      setPriority(task.priority as TaskPriority || 'MEDIUM');
      setType(task.type as TaskType || 'ACTION');
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
      setAssigneeId(task.assigneeId || '');
      setStageId(task.stageId || '');
      setOrder(task.order ?? 0);  // Use ?? instead of || to preserve 0 values
    } else if (taskId && taskId.startsWith('new-task-for-stage-')) {
      // New task - set defaults and extract stage ID
      const extractedStageId = taskId.replace('new-task-for-stage-', '');
      setTitle('New Task');
      setDescription('');
      setStatus('OPEN');
      setPriority('MEDIUM');
      setType('ACTION');
      setDueDate('');
      setAssigneeId('');
      setStageId(extractedStageId);

      // Calculate order for new task in this stage
      const allTasks = Object.values(state.entities.tasks || {});
      const stageTasks = allTasks.filter(task => task.stageId === extractedStageId);
      const taskOrders = stageTasks.map(task => task.order).filter(o => o !== undefined && o !== null);
      const maxOrder = taskOrders.length > 0 ? Math.max(...taskOrders) : 0;
      const newOrder = maxOrder + 1000;
      setOrder(newOrder);
    } else if (taskId && (taskId === 'new' || taskId.startsWith('temp-'))) {
      // New task without stage context - try to find first available stage
      const firstPhase = Object.values(state.entities.phases || {}).sort((a, b) => a.order - b.order)[0];
      const firstStage = firstPhase ? Object.values(state.entities.stages || {})
        .filter(s => s.phaseId === firstPhase.id)
        .sort((a, b) => a.order - b.order)[0] : null;
      
      setTitle('New Task');
      setDescription('');
      setStatus('OPEN');
      setPriority('MEDIUM');
      setType('ACTION');
      setDueDate('');
      setAssigneeId('');
      setStageId(firstStage?.id || '');
      setOrder(1000);
    } else {
      // Reset form for other cases
      setTitle('');
      setDescription('');
      setStatus('OPEN');
      setPriority('MEDIUM');
      setType('ACTION');
      setDueDate('');
      setAssigneeId('');
      setStageId('');
      setOrder(0);
    }
  }, [taskId, state.entities.tasks, state.entities.phases, state.entities.stages]);
  
  // Check task edit permissions - Jan Marshal's Simple & Reliable Approach
  useEffect(() => {
    const checkTaskPermissions = async () => {
      if (!taskId || !isOpen) {
        setCanEdit(false);
        setIsCheckingPermissions(false);
        return;
      }
      
      setIsCheckingPermissions(true);
      
      try {
        // For new tasks (temporary IDs or new-task-for-stage), allow editing by default
        if (taskId.startsWith('temp-') || taskId.startsWith('new-task-for-stage-')) {
          setCanEdit(true);
          setIsCheckingPermissions(false);
          return;
        }

        // For existing tasks, check if they exist in state
        if (!state.entities.tasks[taskId]) {
          setCanEdit(false);
          setIsCheckingPermissions(false);
          return;
        }

        // Simple approach: allow editing for existing tasks in state
        setCanEdit(true);
        setIsCheckingPermissions(false);
        
      } catch {
        // Default to allowing edit (simple & reliable)
        setCanEdit(true);
      } finally {
        setIsCheckingPermissions(false);
      }
    };

    if (isOpen) {
      checkTaskPermissions();
    }
  }, [taskId, isOpen, state.entities.tasks, state.data]);
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskId) {
      return;
    }
    
    // Check permissions again before submitting
    if (!canEdit) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to edit this task.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSaving(true);
    
    try {
      // 🔧 ACTIVITY: Get current task for previous values
      const currentTask = state.entities.tasks[taskId];
      const previousValues = currentTask ? {
        title: currentTask.title,
        description: currentTask.description,
        status: currentTask.status,
        priority: currentTask.priority,
        type: currentTask.type,
        assigneeId: currentTask.assigneeId,
        dueDate: currentTask.dueDate,
      } : {};
      
      // Check if this is a new task (special ID format) or existing task
      const isNewTask = taskId.startsWith('temp-') || taskId.startsWith('new-task-for-stage-');
      
      if (isNewTask) {
        let actualTaskId = taskId;

        // If this is a new task request, create the task first
        if (taskId.startsWith('new-task-for-stage-')) {
          // Get the stage info for the new task
          const extractedStageId = taskId.replace('new-task-for-stage-', '');
          const stage = state.entities.stages[extractedStageId];

          if (!stage) {
            throw new Error('Stage not found for new task');
          }

          // Create the task data
          const taskData = {
            title,
            description,
            status,
            priority,
            type,
            assigneeId: assigneeId || null,
            dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
            stageId: extractedStageId,
            phaseId: stage.phaseId,
            order: order,
            dependencies: []
          };

          // Add the task to context and get the actual ID
          actualTaskId = addEntity('tasks', taskData);
        } else {
          // For existing temp tasks, just update them
          updateEntity('tasks', taskId, {
            title,
            description,
            status,
            priority,
            type,
            assigneeId: assigneeId || null,
            dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
            stageId: stageId || null,
            order: order,
          });
        }

        // Call the onSave callback to trigger POV save
        if (onSave) {
          onSave(actualTaskId);
        }
      } else {
        // For existing tasks, make direct API call
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            description,
            status,
            priority,
            type,
            assigneeId: assigneeId || null,
            dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
            stageId: stageId || null,
            order: order,
            // 🔧 ACTIVITY: Send previous values for change detection
            logActivity: true,
            previousValues: previousValues,
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to save task');
        }
        
        const savedTask = await response.json();
        // Task saved successfully via API
        
        // Update the local context state with the saved data
        updateEntity('tasks', taskId, {
          title,
          description,
          status,
          priority,
          type,
          assigneeId: assigneeId || null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          stageId: stageId || null,
          order: order,
          assignee: savedTask.assignee, // Update with fresh assignee data from backend
        });
      }
      
      toast({
        title: "Task Updated",
        description: "The task has been successfully updated.",
        variant: "default"
      });
      
      onClose();
    } catch {
      toast({
        title: "Update Failed",
        description: "There was an error updating the task. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Guard against silently losing in-dialog edits. The dialog persists ONLY via
  // its "Save Changes" button; Escape / click-outside / Cancel all dismiss it and
  // drop the local form state. Compare the live form against the loaded task so we
  // only prompt when something actually changed. (New/unsaved tasks aren't guarded
  // — dismissing one discards an uncreated task, which is the expected behavior.)
  const isFormDirty = (): boolean => {
    if (!taskId) return false;
    const t = state.entities.tasks[taskId];
    if (!t) return false;
    const origDue = t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : '';
    return (
      title !== (t.title ?? '') ||
      description !== (t.description ?? '') ||
      String(status) !== String(t.status ?? 'OPEN') ||
      String(priority) !== String(t.priority ?? 'MEDIUM') ||
      String(type) !== String(t.type ?? 'ACTION') ||
      dueDate !== origDue ||
      (assigneeId || '') !== (t.assigneeId ?? '') ||
      (stageId || '') !== (t.stageId ?? '') ||
      order !== (t.order ?? 0)
    );
  };

  const requestClose = () => {
    if (isFormDirty() && !confirm('You have unsaved changes to this task. Discard them?')) {
      return;
    }
    onClose();
  };

  // All dismiss paths (Escape / click-outside) funnel through onOpenChange(false).
  const handleOpenChange = (open: boolean) => {
    if (!open) requestClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Edit the properties of this task and click Save Changes when done.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              disabled={!canEdit}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description"
              rows={3}
              disabled={!canEdit}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={status} 
                onValueChange={(value) => setStatus(value as TaskStatus)}
                disabled={!canEdit}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select 
                value={priority} 
                onValueChange={(value) => setPriority(value as TaskPriority)}
                disabled={!canEdit}
              >
                <SelectTrigger id="priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select 
                value={type} 
                onValueChange={(value) => setType(value as TaskType)}
                disabled={!canEdit}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TaskType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {taskTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="due-date">Due Date</Label>
              {canEdit ? (
                <DatePicker
                  value={dueDate ? fromLocalYmd(dueDate) : null}
                  onChange={(date) => setDueDate(date ? toLocalYmd(date) : '')}
                />
              ) : (
                <Input
                  value={dueDate ? format(fromLocalYmd(dueDate), 'PPP') : 'No due date'}
                  disabled
                  readOnly
                />
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="assignee">Assignee</Label>
            <Select 
              value={assigneeId || 'unassigned'} 
              onValueChange={(value) => setAssigneeId(value === 'unassigned' ? '' : value)}
              disabled={!canEdit}
            >
              <SelectTrigger id="assignee">
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {teamMembers.map((member: any) => (
                  <SelectItem key={member.id} value={member.userId}>
                    {member.name} ({member.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="stage">Stage {stageId && `(Current: ${stageId.substring(0, 8)}...)`}</Label>
            <Select 
              value={stageId || 'unassigned'} 
              onValueChange={(value) => {
                setStageId(value === 'unassigned' ? '' : value);
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="stage">
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">No Stage</SelectItem>
                {stagesByPhase.map(({ phase, stages }) => (
                  <React.Fragment key={phase.id}>
                    <SelectItem 
                      disabled 
                      value={`phase-${phase.id}`} 
                      className="font-semibold text-muted-foreground bg-muted/50 cursor-default"
                    >
                      📋 {phase.name}
                    </SelectItem>
                    {stages.map(stage => (
                      <SelectItem 
                        key={stage.id} 
                        value={stage.id} 
                        className="pl-6"
                      >
                        {stage.name}
                      </SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="order">Order in Stage (Debug: {order})</Label>
            <Input
              id="order"
              type="number"
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
              placeholder="Task order (0 = first)"
              disabled={!canEdit}
              min="0"
            />
            <p className="text-xs text-muted-foreground">
              Lower numbers appear first in the stage
            </p>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canEdit || isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
