"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useEditorContext } from '../context';
import { formatActivityChange } from '@/lib/tasks/activity-format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { TaskActivityTimeline } from '@/components/tasks/TaskActivityTimeline';
import { PipelineTab } from './tabs/PipelineTab';
import { 
  Save, 
  User, 
  Calendar, 
  XCircle, 
  Bot, 
  Settings, 
  FileText, 
  ChevronDown, 
  ChevronUp,
  MessageSquare,
  Link,
  Paperclip,
  AlertCircle
} from 'lucide-react';
import { Task } from '../context/types/EntityTypes';
import { TaskStatus, TaskPriority, TaskType } from '@prisma/client';
import { 
  getTaskStatusColor, 
  getTaskPriorityColor, 
  getTaskTypeColor, 
  getExecutionStatusColor,
  formatTaskStatus,
  formatTaskPriority,
  formatTaskType,
  formatExecutionStatus
} from '@/lib/utils/taskColors';
import { taskTypeLabels } from '@/lib/utils/taskTypes';
import { toast } from '@/lib/hooks/useToast';
import { ResourceAction, ResourceType } from '@/lib/types/auth';
import { checkPermission } from '@/lib/auth/permissions';
interface TaskEditorProps {
  taskId?: string;
  mode?: 'edit' | 'view';
}

const TaskEditor: React.FC<TaskEditorProps> = ({ taskId, mode = 'edit' }) => {
  const { state, updateEntity, updateField } = useEditorContext();
  
  // Get selected task
  const selectedTaskId = taskId || state.ui?.selectedTaskId;
  const selectedTask = selectedTaskId ? state.entities?.tasks?.[selectedTaskId] : null;
  
  // Form state
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [showComments, setShowComments] = useState(false);
  
  // Permission state
  const [canEdit, setCanEdit] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);

  // 🔧 ACTIVITY: Activity state
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // 🔧 COMMENTING: Comment state
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Memoize helper data to prevent unnecessary recalculations
  const phases = useMemo(() => Object.values(state.entities?.phases || {}), [state.entities?.phases]);
  
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
  
  // Re-initialize the form ONLY when a *different* task becomes selected — not on
  // every entity mutation. handleFieldChange now writes edits straight into the
  // shared editor state, which changes selectedTask's reference on each keystroke;
  // without this identity guard the effect would re-run mid-typing and wipe the
  // in-progress edit (and reset isDirty).
  const initializedTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedTask && initializedTaskIdRef.current !== selectedTask.id) {
      initializedTaskIdRef.current = selectedTask.id;
      setFormData({
        title: selectedTask.title || '',
        description: selectedTask.description || '',
        assigneeId: selectedTask.assigneeId || '',
        dueDate: selectedTask.dueDate || '',
        priority: selectedTask.priority || 'MEDIUM',
        status: selectedTask.status || 'OPEN',
        type: selectedTask.type || 'ACTION'
      });
      setIsDirty(false);
      setValidationErrors({});
      
      // 🔧 ACTIVITY: Fetch activities when task changes
      fetchTaskActivities(selectedTask.id);
    }
  }, [selectedTask]);

  // Clear this panel's local dirty flag when the POV-level save completes
  // (onSuccess dispatches MARK_CLEAN → meta.isDirty=false), so an already-persisted
  // edit doesn't keep showing "Unsaved Changes" after the top-level Save.
  useEffect(() => {
    if (!state.meta.isDirty) setIsDirty(false);
  }, [state.meta.isDirty]);

  // Check task edit permissions - Jan Marshal's Simple & Reliable Approach
  useEffect(() => {
    const checkTaskPermissions = async () => {
      if (!selectedTask) {
        setCanEdit(false);
        setIsCheckingPermissions(false);
        return;
      }
      
      setIsCheckingPermissions(true);
      
      try {
        // For new tasks (temporary IDs), allow editing by default
        if (selectedTask.id.startsWith('temp-')) {
          setCanEdit(true);
          setIsCheckingPermissions(false);
          return;
        }

        // Simple approach: Just allow editing
        setCanEdit(true);
        setIsCheckingPermissions(false);

      } catch {
        // Default to allowing edit (simple & reliable)
        setCanEdit(true);
      } finally {
        setIsCheckingPermissions(false);
      }
    };

    checkTaskPermissions();
  }, [selectedTask, state.data]);
  
  // Fetch task activities
  const fetchTaskActivities = async (taskId: string) => {
    // Don't fetch activities for temporary tasks
    if (taskId.startsWith('task-')) {
      setActivities([]);
      setLoadingActivities(false);
      return;
    }

    setLoadingActivities(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}?includeActivity=true`);

      if (response.ok) {
        const responseData = await response.json();
        const activities = responseData.data?.activities || [];

        // Transform the activities to match the display format
        const formattedActivities = activities.map((activity: any) => ({
          id: activity.id,
          action: activity.action,
          timestamp: activity.timestamp,
          details: activity.details,
          userId: activity.userId,
          userName: activity.user?.name || 'Unknown User',
          userAvatar: activity.user?.image
        }));

        setActivities(formattedActivities);
      } else {
        setActivities([]);
      }
    } catch {
      setActivities([]);
    } finally {
      setLoadingActivities(false);
    }
  };
  
  // 🔧 ACTIVITY: Format relative time
  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffMs = now.getTime() - activityTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    return activityTime.toLocaleDateString();
  };
  
  // 🔧 ACTIVITY: Get activity icon
  const getActivityIcon = (action: string) => {
    if (action.includes('assigned')) return '👤';
    if (action.includes('status')) return '✅';
    if (action.includes('priority')) return '🔥';
    if (action.includes('due date')) return '📅';
    if (action.includes('title') || action.includes('description')) return '✏️';
    if (action.includes('agent')) return '🤖';
    return '📝';
  };
  
  // Helper functions
  const getPhaseName = (phaseId?: string) => {
    if (!phaseId) return '';
    const phase = phases.find(phase => phase.id === phaseId);
    return phase ? phase.name : '';
  };
  
  const getAssigneeName = (assigneeId?: string) => {
    if (!assigneeId) return 'Unassigned';
    
    // 🔧 FIX: Always look up by userId in team members (don't use cached selectedTask.assignee)
    const assignee = teamMembers.find(member => member.userId === assigneeId);
    return assignee ? assignee.name : 'Unknown User';
  };
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (error) {
      return '';
    }
  };
  
  const clearTaskSelection = () => {
    updateField(['ui', 'selectedTaskId'], null);
  };

  
  // Memoized event handlers to prevent unnecessary re-renders
  const handleFieldChange = useCallback((field: keyof Task, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);

    // Keep the shared editor state in sync so the top-level POV "Save" (which
    // serializes state.entities.tasks) captures this edit too — not only this
    // panel's own "Save Changes". Previously edits lived solely in local formData,
    // so the POV Save shipped the stale task and silently discarded them.
    // dueDate is normalized to ISO to match the API/handler expectations.
    if (selectedTaskId) {
      const entityValue =
        field === 'dueDate'
          ? (value ? new Date(value).toISOString() : null)
          : value;
      updateEntity('tasks', selectedTaskId, { [field]: entityValue });
    }

    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [validationErrors, selectedTaskId, updateEntity]);
  
  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.title?.trim()) {
      errors.title = 'Title is required';
    }
    
    if (formData.dueDate) {
      const dueDate = new Date(formData.dueDate);
      if (isNaN(dueDate.getTime())) {
        errors.dueDate = 'Invalid date format';
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Handle add comment
  const handleAddComment = async () => {
    if (!selectedTask || !newComment.trim()) {
      setCommentError('Comment cannot be empty');
      return;
    }

    setIsSubmittingComment(true);
    setCommentError(null);

    try {
      // Call MCP task.comment action via API
      const response = await fetch('/api/mcp/tasks/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'task.comment',
          parameters: {
            taskId: selectedTask.id,
            comment: newComment
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to add comment');
      }

      // Success - refresh POV data to show new comment
      setNewComment(''); // Clear input
      setCommentError(null);

      // Trigger POV refetch to update task data including new comment
      window.location.reload(); // Simple refresh for now - Phase 2 can use proper state management

    } catch (error: any) {
      setCommentError(error.message || 'Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Handle save
  const handleSave = async (e?: React.FormEvent) => {
    // Prevent any form submission
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!selectedTask || !validateForm()) {
      return;
    }

    setIsSaving(true);

    // Check if this is a new task (temporary ID)
    const isNewTask = selectedTask.id.startsWith('task-');

    try {
      const updatedTask = {
        ...selectedTask,
        ...formData,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined
      };

      let response;
      let savedTask;

      if (isNewTask) {
        // CREATE new task
        response = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: updatedTask.title,
            description: updatedTask.description,
            status: updatedTask.status,
            priority: updatedTask.priority,
            type: updatedTask.type,
            assigneeId: updatedTask.assigneeId || null,
            dueDate: updatedTask.dueDate,
            phaseId: updatedTask.phaseId,
            stageId: updatedTask.stageId,
            order: updatedTask.order,
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to create task');
        }

        savedTask = await response.json();

        // Update task with real data AND real ID
        // Remove the temporary task and add the real one
        const tempTaskId = selectedTask.id;
        const realTaskId = savedTask.data?.id || savedTask.id;

        // Remove temp task
        updateEntity('tasks', tempTaskId, null);

        // Add real task with real ID
        updateEntity('tasks', realTaskId, savedTask.data || savedTask);

        // Update selected task ID to the real one
        updateField(['ui', 'selectedTaskId'], realTaskId);

        toast({
          title: "Success",
          description: "Task created successfully",
        });

      } else {
        // UPDATE existing task
        
        // 🔧 ACTIVITY: Prepare previous values for change detection
        const previousValues = {
          title: selectedTask.title,
          description: selectedTask.description,
          status: selectedTask.status,
          priority: selectedTask.priority,
          type: selectedTask.type,
          assigneeId: selectedTask.assigneeId,
          dueDate: selectedTask.dueDate,
        };
        
        response = await fetch(`/api/tasks/${selectedTask.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: updatedTask.title,
            description: updatedTask.description,
            status: updatedTask.status,
            priority: updatedTask.priority,
            type: updatedTask.type,
            assigneeId: updatedTask.assigneeId || null,
            dueDate: updatedTask.dueDate,
            // 🔧 ACTIVITY: Send previous values for change detection
            logActivity: true,
            previousValues: previousValues,
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to save task');
        }

        savedTask = await response.json();

        // Update the local context state with the saved data
        updateEntity('tasks', selectedTask.id, {
          ...updatedTask,
          assignee: savedTask.assignee, // Update with fresh assignee data from backend
        });

        // Refresh activities after save to show new activity
        fetchTaskActivities(selectedTask.id);

        toast({
          title: "Success",
          description: "Task updated successfully",
        });
      }

      setIsDirty(false);

    } catch {
      toast({
        title: "Error",
        description: isNewTask ? "Failed to create task" : "Failed to save task",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Empty state
  if (!selectedTask) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Task Selected</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Select a task from one of the phase tabs to view and edit its details here.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Selected Task Header */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-2">{selectedTask.title}</h3>
              
              <div className="flex items-center gap-4 text-sm">
                {selectedTask.phaseId && (
                  <div className="flex items-center gap-1">
                    <span>Phase:</span>
                    <span className="font-medium">{getPhaseName(selectedTask.phaseId)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>Type:</span>
                  <Badge className={getTaskTypeColor(selectedTask.type).badgeClass}>
                    {formatTaskType(selectedTask.type)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <span>Priority:</span>
                  <Badge className={getTaskPriorityColor(selectedTask.priority).badgeClass}>
                    {formatTaskPriority(selectedTask.priority)}
                  </Badge>
                </div>
                {isDirty && (
                  <Badge variant="outline" className="text-amber-600 border-amber-600">
                    Unsaved Changes
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground">
              ID: {selectedTask.id}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Task Details Form */}
      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title || ''}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder="Enter task title"
              className={validationErrors.title ? 'border-red-500' : ''}
              disabled={mode === 'view' || !canEdit}
            />
            {validationErrors.title && (
              <p className="text-sm text-red-500">{validationErrors.title}</p>
            )}
          </div>
          
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Enter task description"
              rows={4}
              disabled={mode === 'view' || !canEdit}
            />
          </div>
          
          {/* Grid Row 1: Assignee, Due Date, Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Assignee */}
            <div className="space-y-2">
              <Label htmlFor="assignee">Assignee</Label>
              <Select
                value={formData.assigneeId || 'unassigned'}
                onValueChange={(value) => handleFieldChange('assigneeId', value === 'unassigned' ? null : value)}
                disabled={mode === 'view' || !canEdit}
              >
                <SelectTrigger id="assignee">
                  <SelectValue placeholder="Select assignee">
                    {formData.assigneeId ? (
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2" />
                        {getAssigneeName(formData.assigneeId)}
                      </div>
                    ) : (
                      <div className="flex items-center text-muted-foreground">
                        <User className="h-4 w-4 mr-2" />
                        Unassigned
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-2 text-muted-foreground" />
                      Unassigned
                    </div>
                  </SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.userId}>
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2" />
                        {member.name}
                        {member.email && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({member.email})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate ? new Date(formData.dueDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                  className={`pl-10 ${validationErrors.dueDate ? 'border-red-500' : ''}`}
                  disabled={mode === 'view' || !canEdit}
                />
              </div>
              {validationErrors.dueDate && (
                <p className="text-sm text-red-500">{validationErrors.dueDate}</p>
              )}
            </div>
            
            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status || 'OPEN'}
                onValueChange={(value) => handleFieldChange('status', value as TaskStatus)}
                disabled={mode === 'view' || !canEdit}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                      Open
                    </div>
                  </SelectItem>
                  <SelectItem value="IN_PROGRESS">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                      In Progress
                    </div>
                  </SelectItem>
                  <SelectItem value="COMPLETED">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                      Completed
                    </div>
                  </SelectItem>
                  <SelectItem value="BLOCKED">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                      Blocked
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Grid Row 2: Type, Priority, Activity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type || 'ACTION'}
                onValueChange={(value) => handleFieldChange('type', value as TaskType)}
                disabled={mode === 'view' || !canEdit}
              >
                <SelectTrigger id="type">
                  <SelectValue />
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
            
            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority || 'MEDIUM'}
                onValueChange={(value) => handleFieldChange('priority', value as TaskPriority)}
                disabled={mode === 'view' || !canEdit}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                      High
                    </div>
                  </SelectItem>
                  <SelectItem value="MEDIUM">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-amber-500 mr-2" />
                      Medium
                    </div>
                  </SelectItem>
                  <SelectItem value="LOW">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                      Low
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* 🔧 ACTIVITY: Recent Activity Feed */}
            <div className="space-y-2">
              <Label>Recent Activity</Label>
              <div className="bg-muted rounded-md p-3 max-h-32 overflow-y-auto">
                {loadingActivities ? (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground mr-2" />
                    Loading...
                  </div>
                ) : activities.length > 0 ? (
                  <div className="space-y-2">
                    {activities.slice(0, 5).map((activity) => (
                      <div key={activity.id} className="flex items-start gap-2 text-xs">
                        <span className="text-sm">{getActivityIcon(activity.action)}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{activity.userName}</span>
                          <span className="text-muted-foreground ml-1">{formatActivityChange(activity.action, activity.details) || activity.action}</span>
                          <div className="text-muted-foreground">
                            {formatRelativeTime(activity.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    No activity yet
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Save Button */}
          {mode === 'edit' && (
            <div className="flex justify-end pt-4">
              <Button 
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="min-w-[140px]"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comments & Activity */}
      <Collapsible open={showComments} onOpenChange={setShowComments}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <div className="flex items-center">
              <MessageSquare className="h-4 w-4 mr-2" />
              Comments & Activity
            </div>
            {showComments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <Tabs defaultValue="comments" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="comments">
                Comments ({selectedTask?.comments?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="activity">
                Activity Timeline
              </TabsTrigger>
              <TabsTrigger value="pipeline">
                Pipeline Results
              </TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  {selectedTask?.comments && selectedTask.comments.length > 0 ? (
                    <div className="space-y-4">
                      {selectedTask.comments.map((comment) => (
                        <div key={comment.id} className="border-l-2 border-muted pl-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{comment.user.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{comment.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">No comments yet</p>
                    </div>
                  )}

                  {/* Add Comment */}
                  <div className="mt-4">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      className="mb-2"
                      disabled={isSubmittingComment}
                    />
                    {commentError && (
                      <p className="text-sm text-red-500 mb-2">{commentError}</p>
                    )}
                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || isSubmittingComment}
                    >
                      {isSubmittingComment ? 'Adding...' : 'Add Comment'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  {selectedTaskId && !selectedTaskId.startsWith('task-') ? (
                    <TaskActivityTimeline
                      taskId={selectedTaskId}
                      compact={false}
                      maxItems={50}
                      taskData={selectedTask ? {
                        id: selectedTask.id,
                        title: selectedTask.title || 'Untitled Task'
                      } : undefined}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">Save the task to view activity timeline</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pipeline" className="space-y-4">
              {selectedTaskId && !selectedTaskId.startsWith('task-') ? (
                <PipelineTab
                  taskId={selectedTaskId}
                  taskType={(selectedTask as any)?.type ?? null}
                  taskMetadata={(selectedTask as any)?.metadata ?? null}
                  // povId fallback (2026-04-20): pre-fix task entities from the
                  // Redux normalizer didn't include povId. Fall back to the
                  // POV's own id from state.data. Stale cached sessions still
                  // work until the next POV refetch repopulates the entity.
                  povId={(selectedTask as any)?.povId ?? state.data?.id ?? undefined}
                  phaseId={(selectedTask as any)?.phaseId ?? undefined}
                />
              ) : (
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">Save the task to view pipeline results</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {/* Dependencies */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dependencies ({(selectedTask.dependencies ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent>
              {(selectedTask.dependencies ?? []).length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Link className="h-6 w-6 mx-auto mb-2" />
                  <p className="text-sm">No dependencies</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(selectedTask.dependencies ?? []).map((dep) => {
                    const crossStage =
                      dep.dependsOn.stageId &&
                      selectedTask.stageId &&
                      dep.dependsOn.stageId !== selectedTask.stageId;
                    return (
                      <div
                        key={dep.id}
                        className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Link className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{dep.dependsOn.title}</span>
                          {crossStage && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              cross-stage
                            </Badge>
                          )}
                        </div>
                        <Badge
                          className={`text-xs shrink-0 ${getTaskStatusColor(dep.dependsOn.status)}`}
                        >
                          {formatTaskStatus(dep.dependsOn.status)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Blocking (reverse edges — tasks waiting on this one) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Blocking ({(selectedTask.dependents ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent>
              {(selectedTask.dependents ?? []).length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Link className="h-6 w-6 mx-auto mb-2" />
                  <p className="text-sm">Nothing waiting on this task</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(selectedTask.dependents ?? []).map((dep) => {
                    const crossStage =
                      dep.task.stageId &&
                      selectedTask.stageId &&
                      dep.task.stageId !== selectedTask.stageId;
                    return (
                      <div
                        key={dep.id}
                        className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Link className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{dep.task.title}</span>
                          {crossStage && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              cross-stage
                            </Badge>
                          )}
                        </div>
                        <Badge
                          className={`text-xs shrink-0 ${getTaskStatusColor(dep.task.status)}`}
                        >
                          {formatTaskStatus(dep.task.status)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* MCP hint: dependency edits go through the AI assistant */}
          <div className="rounded border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Edit dependencies via AI</p>
            <p>
              Ask Claude Desktop, ChatGPT, or any MCP-connected assistant —
              e.g.{" "}
              <span className="rounded bg-background/80 px-1 py-0.5 font-mono text-[11px] text-foreground">
                &quot;make this task depend on the data-prep task&quot;
              </span>
              {" "}or{" "}
              <span className="rounded bg-background/80 px-1 py-0.5 font-mono text-[11px] text-foreground">
                &quot;remove the dependency on X&quot;
              </span>
              . Cycles and chains over 10 deep are rejected automatically.
            </p>
          </div>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Attachments (0)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4 text-muted-foreground">
                <Paperclip className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">No attachments</p>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Agent Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Bot className="h-5 w-5 mr-2" />
              Agent Information
            </CardTitle>
            <div className="flex items-center gap-4">
              {/* Agent Role */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Role:</span>
                {selectedTask.agentRole ? (
                  <Badge className="bg-primary/20 text-primary">
                    {selectedTask.agentRole}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Not configured</span>
                )}
              </div>
              
              {/* Execution Status */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                {selectedTask.executionStatus ? (
                  <Badge className={getExecutionStatusColor(selectedTask.executionStatus).badgeClass}>
                    {formatExecutionStatus(selectedTask.executionStatus)}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Not started</span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 pt-2 border-t">
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Configure in Agents Tab
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowLogDialog(true)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Agent Logs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Agent Log Dialog */}
      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Agent Execution Log</DialogTitle>
            <DialogDescription>
              View the execution log and output from the agent for this task.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto">
            <pre className="bg-muted p-4 rounded-md text-sm">
              {selectedTask.agentLog || 'No log data available'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default TaskEditor;
