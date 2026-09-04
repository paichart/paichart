"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { getActionSymbol } from '@/lib/constants/bloomberg-styles';
import {
  ActivityTransition,
  ActivityComment,
  ActivityAgentCard,
  ActivityWorkflow,
  ActivityStageTransition,
  ActivityPhaseTransition,
  ActivityAttachment,
  ActivityAuditMetadata,
  ActivitySkeleton,
  getActivityVisualType,
} from './activity-visuals';
import {
  Activity,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react';

interface TaskActivity {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  action: 'CREATED' | 'UPDATED' | 'ASSIGNED' | 'UNASSIGNED' | 'STATUS_CHANGED' | 'PRIORITY_CHANGED' |
          'COMMENT_ADDED' | 'ATTACHMENT_ADDED' | 'ATTACHMENT_REMOVED' | 'DUE_DATE_CHANGED' |
          'DESCRIPTION_UPDATED' | 'TITLE_UPDATED' | 'PHASE_CHANGED' | 'STAGE_CHANGED' | 'AGENT_EXECUTED' |
          'COMPLETED' | 'REOPENED' | 'WORKFLOW_EXECUTED';
  description: string;
  details?: {
    // Currently used fields (parsed from action string):
    oldValue?: any;           // Previous value for status/priority changes
    newValue?: any;           // New value for status/priority changes
    fieldName?: string;       // Which field changed (status, priority, etc.)

    // Future-ready fields (schema/interface prepared, UI implementation pending):
    comment?: string;         // Task comments (Comment model exists, activity tracking TBD)
    attachmentName?: string;  // File attachments (Attachment model exists, upload UI pending)
    agentName?: string;       // Agent execution tracking (prepared for AGENT_EXECUTED action)
    executionId?: string;     // Link to AgentExecution record (future integration)
    assigneeName?: string;    // Assignment target (for ASSIGNED action)
    executionStatus?: string; // Agent execution status (SUCCESS, FAILED, etc.)

    // Phase 6: Rich visual treatment fields
    duration?: string;        // Agent execution duration
    tokens?: number;          // Token count for agent executions
    fileSize?: number;        // Attachment file size in bytes
    fileType?: string;        // Attachment MIME type
    oldStageName?: string;    // Stage change: previous stage name
    newStageName?: string;    // Stage change: new stage name
    oldPhaseName?: string;    // Phase change: previous phase name
    newPhaseName?: string;    // Phase change: new phase name

    // Workflow execution fields (Jan 2026)
    workflowId?: string;           // MCPWorkflowExecution.id
    workflowType?: string;         // e.g., 'mcp_service_orchestration'
    workflowStatus?: string;       // 'SUCCESS' | 'FAILED' | 'PARTIAL'
    workflowStepCount?: number;    // Total steps executed
    workflowExecutionTime?: number; // Duration in ms
  };
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    source: 'WEB' | 'API' | 'MOBILE' | 'AGENT' | 'SYSTEM';
    sessionId?: string;
  };
  timestamp: Date;
  isSystemGenerated: boolean;
  relatedEntities?: Array<{
    type: 'USER' | 'TASK' | 'POV' | 'PHASE' | 'AGENT';
    id: string;
    name: string;
  }>;
}

interface ActivitySummary {
  totalActivities: number;
  todayActivities: number;
  weekActivities: number;
  monthActivities: number;
  topUsers: Array<{
    userId: string;
    userName: string;
    activityCount: number;
    lastActivity: Date;
  }>;
  activityBreakdown: Array<{
    action: string;
    count: number;
    percentage: number;
  }>;
  trends: {
    dailyTrend: number;
    weeklyTrend: number;
    monthlyTrend: number;
  };
  hourlyDistribution: Array<{
    hour: number;
    count: number;
  }>;
}

interface TaskActivityTimelineProps {
  taskId: string;
  povId?: string; // Filter activities by POV
  compact?: boolean;
  showFilters?: boolean;
  maxItems?: number;
  realTime?: boolean;
  taskTitle?: string;
  taskData?: {
    id: string;
    title: string;
    [key: string]: any;
  };
  dateRange?: string; // External date range control (syncs with analytics page)
}

export function TaskActivityTimeline({
  taskId,
  povId,
  compact = false,
  showFilters = true,
  maxItems = 100,
  realTime = true,
  taskTitle,
  taskData,
  dateRange: externalDateRange
}: TaskActivityTimelineProps) {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters - dateFilter can be controlled externally via dateRange prop
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(externalDateRange || '7d');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sync dateFilter when external dateRange prop changes
  useEffect(() => {
    if (externalDateRange) {
      setDateFilter(externalDateRange);
    }
  }, [externalDateRange]);

  // Dense list state
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showAuditDetails, setShowAuditDetails] = useState(false);

  // Router for navigation
  const router = useRouter();

  // Toggle activity expansion
  const toggleExpanded = (activityId: string) => {
    const newExpanded = new Set(expandedActivities);
    if (newExpanded.has(activityId)) {
      newExpanded.delete(activityId);
    } else {
      newExpanded.add(activityId);
    }
    setExpandedActivities(newExpanded);
  };

  // Group activities by day and sort chronologically
  const groupByDay = (activities: TaskActivity[]) => {
    const groups = new Map<string, { date: Date; activities: TaskActivity[] }>();

    activities.forEach(activity => {
      const date = new Date(activity.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dayKey: string;
      if (date.toDateString() === today.toDateString()) {
        dayKey = 'TODAY';
      } else if (date.toDateString() === yesterday.toDateString()) {
        dayKey = 'YESTERDAY';
      } else {
        dayKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      if (!groups.has(dayKey)) {
        groups.set(dayKey, { date, activities: [] });
      }
      groups.get(dayKey)!.activities.push(activity);
    });

    // Sort day groups: TODAY, YESTERDAY, then older dates descending
    return Array.from(groups.entries())
      .sort((a, b) => {
        if (a[0] === 'TODAY') return -1;
        if (b[0] === 'TODAY') return 1;
        if (a[0] === 'YESTERDAY') return -1;
        if (b[0] === 'YESTERDAY') return 1;
        // For other dates, sort by date descending (newest first)
        return b[1].date.getTime() - a[1].date.getTime();
      })
      .map(([key, { activities }]) => [key, activities] as [string, TaskActivity[]]);
  };

  // Fetch task activities
  const fetchTaskActivities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        taskId,
        ...(povId && { povId }), // Filter by POV if provided
        ...(actionFilter !== 'all' && { action: actionFilter }),
        ...(userFilter !== 'all' && { userId: userFilter }),
        ...(sourceFilter !== 'all' && { source: sourceFilter }),
        dateRange: dateFilter,
        limit: maxItems.toString()
      });

      // Use different endpoints based on taskId
      let activitiesUrl, summaryUrl;
      
      if (taskId === 'global') {
        // For global view, use the global activities endpoints
        activitiesUrl = `/api/tasks/global/activities?${params}`;
        summaryUrl = `/api/tasks/global/activities/summary?${params}`;
      } else {
        // For specific tasks, use the task-specific endpoints
        activitiesUrl = `/api/tasks/${taskId}/activities?${params}`;
        summaryUrl = `/api/tasks/${taskId}/activities/summary?${params}`;
      }

      // Fetch activities and summary in parallel
      const [activitiesResponse, summaryResponse] = await Promise.all([
        fetch(activitiesUrl),
        fetch(summaryUrl)
      ]);

      if (!activitiesResponse.ok || !summaryResponse.ok) {
        throw new Error('Failed to fetch task activities');
      }

      const [activitiesData, summaryData] = await Promise.all([
        activitiesResponse.json(),
        summaryResponse.json()
      ]);

      // Handle different response formats and transform data
      let processedActivities = [];
      
      if (taskId === 'global') {
        // Global endpoint returns activities from ALL tasks
        const rawActivities = activitiesData.data || [];
        
        // Transform to match TaskActivityTimeline format with enhanced data
        processedActivities = rawActivities.map((activity: any) => ({
          id: activity.id,
          taskId: activity.taskId,
          userId: activity.user?.id || activity.userId,
          userName: activity.user?.name || 'Unknown User',
          userAvatar: null,
          action: mapActionToTimelineFormat(activity.action),
          description: formatActivityDescription(activity.user?.name || 'Unknown User', activity.action),
          details: extractActivityDetails(activity),
          metadata: {
            source: 'WEB',
            sessionId: null
          },
          timestamp: new Date(activity.timestamp),
          isSystemGenerated: activity.action.includes('via_mcp') || activity.action.includes('system'),
          // Include task and POV data from API response
          task: activity.task,
          pov: activity.pov,
          relatedEntities: [
            {
              type: 'TASK' as const,
              id: activity.taskId,
              name: activity.task?.title || `Task ${activity.taskId.slice(0, 8)}...`
            },
            {
              type: 'USER' as const,
              id: activity.user?.id || activity.userId,
              name: activity.user?.name || 'Unknown User'
            }
          ]
        }));
        
        setSummary(summaryData.data?.summary || null);
      } else {
        // Task-specific endpoint returns activities for ONE specific task
        const rawActivities = activitiesData.data?.activities || activitiesData.data || [];
        
        // Transform to match TaskActivityTimeline format
        processedActivities = rawActivities.map((activity: any) => ({
          id: activity.id,
          taskId: taskId,
          userId: activity.user?.id || activity.userId,
          userName: activity.user?.name || 'Unknown User',
          userAvatar: null,
          action: mapActionToTimelineFormat(activity.action),
          description: formatActivityDescription(activity.user?.name || 'Unknown User', activity.action),
          details: extractActivityDetails(activity),
          metadata: {
            source: 'WEB',
            sessionId: null
          },
          timestamp: new Date(activity.timestamp),
          isSystemGenerated: activity.action.includes('via_mcp') || activity.action.includes('system'),
          relatedEntities: [
            {
              type: 'TASK' as const,
              id: taskId,
              name: `Task ${taskId.slice(0, 8)}...`
            },
            {
              type: 'USER' as const,
              id: activity.user?.id || activity.userId,
              name: activity.user?.name || 'Unknown User'
            }
          ]
        }));
        
        setSummary(summaryData.data?.summary || null);
      }

      setActivities(processedActivities);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load task activities');
    } finally {
      setIsLoading(false);
    }
  }, [taskId, povId, actionFilter, userFilter, dateFilter, sourceFilter, maxItems]);

  useEffect(() => {
    fetchTaskActivities();
    
    if (realTime) {
      const interval = setInterval(fetchTaskActivities, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [fetchTaskActivities, realTime]);

  // Filter activities based on search term
  const filteredActivities = Array.isArray(activities) ? activities.filter(activity => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      activity.action.toLowerCase().includes(searchLower) ||
      activity.userName?.toLowerCase().includes(searchLower) ||
      activity.action.toLowerCase().includes(searchLower) ||
      (activity.details?.comment || '').toLowerCase().includes(searchLower)
    );
  }) : [];

  // Helper function to map database action to timeline format
  const mapActionToTimelineFormat = (action: string): string => {
    // Map our descriptive actions to timeline action types
    if (action.includes('assigned')) return 'ASSIGNED';
    if (action.includes('unassigned')) return 'UNASSIGNED';
    if (action.includes('priority')) return 'PRIORITY_CHANGED';
    if (action.includes('status')) return 'STATUS_CHANGED';
    if (action.includes('title')) return 'TITLE_UPDATED';
    if (action.includes('description')) return 'DESCRIPTION_UPDATED';
    if (action.includes('completed')) return 'COMPLETED';
    if (action.includes('created')) return 'CREATED';
    if (action.includes('comment')) return 'COMMENT_ADDED';
    if (action.includes('agent')) return 'AGENT_EXECUTED';
    if (action.includes('stage')) return 'STAGE_CHANGED';
    if (action.includes('phase')) return 'PHASE_CHANGED';

    return 'UPDATED'; // Default fallback
  };

  // Helper function to format activity descriptions
  const formatActivityDescription = (userName: string, action: string): string => {
    // If action already contains the user name, return as is
    if (action.includes(userName)) {
      return action;
    }

    // Format the action into a more readable description
    const actionLower = action.toLowerCase();

    // Handle comment actions with quoted text
    if (actionLower.includes('added comment:')) {
      // Extract the comment text from quotes
      const commentMatch = action.match(/added comment:\s*"([^"]+)"/);
      if (commentMatch) {
        return `${userName} added comment: "${commentMatch[1]}"`;
      }
      return `${userName} added a comment`;
    }

    // Handle specific action patterns
    if (actionLower.includes('assigned') && !actionLower.includes('unassigned')) {
      // Extract assignee name if present
      const assigneeMatch = action.match(/assigned\s+(.+)/i);
      if (assigneeMatch) {
        return `${userName} assigned ${assigneeMatch[1]}`;
      }
      return `${userName} assigned this task`;
    }
    if (actionLower.includes('unassigned')) {
      return `${userName} unassigned this task`;
    }
    if (actionLower.includes('changed status to')) {
      const statusMatch = action.match(/changed status to\s+(.+)/i);
      if (statusMatch) {
        return `${userName} changed status to ${statusMatch[1]}`;
      }
      return `${userName} changed the status`;
    }
    if (actionLower.includes('set priority to')) {
      const priorityMatch = action.match(/set priority to\s+(.+)/i);
      if (priorityMatch) {
        return `${userName} set priority to ${priorityMatch[1]}`;
      }
      return `${userName} changed the priority`;
    }
    if (actionLower.includes('marked as completed')) {
      return `${userName} marked as completed`;
    }
    if (actionLower === 'completed task' || actionLower === 'completed') {
      return `${userName} completed this task`;
    }
    if (actionLower.includes('created task')) {
      // Extract task title if present
      const titleMatch = action.match(/created task\s+"([^"]+)"/i);
      if (titleMatch) {
        return `${userName} created task "${titleMatch[1]}"`;
      }
      return `${userName} created this task`;
    }
    if (actionLower.includes('started work')) {
      return `${userName} started work on this task`;
    }
    if (actionLower.includes('updated task title')) {
      return `${userName} updated the task title`;
    }
    if (actionLower.includes('updated task description')) {
      return `${userName} updated the task description`;
    }
    if (actionLower.includes('updated')) {
      return `${userName} updated the task`;
    }
    if (actionLower.includes('removed')) {
      return `${userName} ${action}`;
    }

    // Default: prepend user name if not already included
    return `${userName} ${action}`;
  };

  // Helper function to extract activity details
  //
  // 2026-04-16 (task #80): accept raw activity so we can prefer the structured
  // `details` JSONB column from the DB over regex-parsing the action string.
  // Previously this function looked ONLY at the action string, ignoring the
  // rich details that logActivityWithDetails() persists (agentName, executionId,
  // executionStatus, duration, tokens, workflow fields, etc.). That's why the
  // AGENT_EXECUTED rendering path (visualType === 'agent' + activity.details.
  // agentName) was unreachable even though ActivityAgentCard was wired.
  //
  // Merge order: DB `details` takes priority, regex parse is the fallback.
  const extractActivityDetails = (activityOrAction: any): any => {
    const action: string =
      typeof activityOrAction === 'string' ? activityOrAction : (activityOrAction?.action ?? '');
    const dbDetails: any =
      typeof activityOrAction === 'object' && activityOrAction?.details && typeof activityOrAction.details === 'object'
        ? activityOrAction.details
        : {};

    const regexDetails: any = {};

    // Extract comment text for display in details section
    if (action.toLowerCase().includes('added comment:')) {
      const commentMatch = action.match(/added comment:\s*"([^"]+)"/);
      if (commentMatch) {
        regexDetails.comment = commentMatch[1];
      }
    }

    // Extract details based on action type
    if (action.includes('assigned') && !action.includes('unassigned')) {
      // For assignments, extract the assignee name from the action
      const assigneeMatch = action.match(/assigned\s+(.+)/i);
      if (assigneeMatch) {
        regexDetails.newValue = assigneeMatch[1];
        regexDetails.fieldName = 'assignee';
      }
    }

    if (action.toLowerCase().includes('priority to')) {
      // For priority changes, extract the priority level
      const priorityMatch = action.match(/priority to\s+(.+)/i);
      if (priorityMatch) {
        regexDetails.newValue = priorityMatch[1];
        regexDetails.fieldName = 'priority';
      }
    }

    if (action.toLowerCase().includes('status to')) {
      // For status changes, extract the status
      const statusMatch = action.match(/status to\s+(.+)/i);
      if (statusMatch) {
        regexDetails.newValue = statusMatch[1];
        regexDetails.fieldName = 'status';
      }
    }

    if (action.toLowerCase().includes('created task')) {
      // For task creation, extract the task title
      const titleMatch = action.match(/created task\s+"([^"]+)"/i);
      if (titleMatch) {
        regexDetails.taskTitle = titleMatch[1];
      }
    }

    // DB details win on overlap (e.g., structured agentName/executionId from
    // logActivityWithDetails beats regex-parsed newValue).
    const merged = { ...regexDetails, ...dbDetails };
    return Object.keys(merged).length > 0 ? merged : undefined;
  };

  // Handle export activities
  const handleExportActivities = async () => {
    try {
      const params = new URLSearchParams({
        taskId,
        ...(actionFilter !== 'all' && { action: actionFilter }),
        ...(userFilter !== 'all' && { userId: userFilter }),
        ...(sourceFilter !== 'all' && { source: sourceFilter }),
        dateRange: dateFilter,
        format: 'csv'
      });

      const response = await fetch(`/api/tasks/${taskId}/activities/export?${params}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `task-${taskId}-activities.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch {
      // Could not export activities
    }
  };

  if (isLoading && activities.length === 0) {
    return (
      <div className="bg-background border border-border font-mono">
        <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
          <span className="text-amber-400 font-bold">LOADING</span>
        </div>
        <div className="divide-y divide-border p-2 space-y-2">
          <ActivitySkeleton />
          <ActivitySkeleton />
          <ActivitySkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Bloomberg Dense Activity List - Grouped by Day */}
      <div className="space-y-4">
          {/* AUDIT Toggle Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted border border-border text-xs font-mono">
            <span className="text-muted-foreground">
              {filteredActivities.length} activities
            </span>
            <button
              onClick={() => setShowAuditDetails(!showAuditDetails)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
                showAuditDetails
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={showAuditDetails}
              aria-label={showAuditDetails ? 'Hide audit details' : 'Show audit details'}
            >
              {showAuditDetails ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              <span>{showAuditDetails ? 'AUDIT ON' : 'AUDIT'}</span>
            </button>
          </div>

          {/* Dense Activity List - Grouped by Day */}
          {(() => {
            const dayGroups = groupByDay(filteredActivities);

            return dayGroups.map(([day, dayActivities]) => (
              <div key={day} className="bg-background border border-border mb-4 font-mono">
                {/* Day header - Always visible (no collapse per user request) */}
                <div className="px-3 py-1.5 bg-muted border-b text-xs">
                  <span className="text-amber-400 font-bold">{day}</span>
                  <span className="text-muted-foreground ml-2">({dayActivities.length} activities)</span>
                </div>

                {/* Activity rows */}
                <div className="divide-y divide-border">
                  {dayActivities.map((activity, idx) => {
                    const isExpanded = expandedActivities.has(activity.id);
                    const actionInfo = getActionSymbol(activity.action);
                    const time = new Date(activity.timestamp).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    });
                    const activityTaskTitle = (activity as any).task?.title || taskData?.title || taskTitle || 'Unknown Task';
                    const povTitle = (activity as any).pov?.title || '';
                    const activityTaskId = (activity as any).task?.id;
                    const taskPovId = (activity as any).task?.povId;

                    // Determine visual treatment type
                    const visualType = getActivityVisualType(activity.action, activity.details);

                    return (
                      <div
                        key={activity.id}
                        className={idx % 2 === 0 ? '' : 'bg-muted/30'}
                        role="article"
                        aria-label={`Activity: ${actionInfo.label} by ${activity.userName}`}
                      >
                        {/* Main row - All info inline */}
                        <div className="px-3 py-1.5 flex items-center gap-3 text-xs">
                          {/* Row number */}
                          <span className="text-muted-foreground w-6" aria-hidden="true">{String(idx + 1).padStart(2, '0')}</span>

                          {/* Time (absolute HH:MM) */}
                          <time className="text-muted-foreground w-12" dateTime={new Date(activity.timestamp).toISOString()}>{time}</time>

                          {/* Action symbol */}
                          <span className={actionInfo.color + " w-6 text-center font-bold"} aria-hidden="true">{actionInfo.symbol}</span>

                          {/* Action label */}
                          <span className={actionInfo.color + " w-24"}>{actionInfo.label}</span>

                          {/* User name */}
                          <span className="text-foreground w-32 truncate" title={activity.userName}>
                            {activity.userName}
                          </span>

                          {/* Task title */}
                          <span className="text-foreground flex-1 truncate" title={activityTaskTitle}>
                            {activityTaskTitle}
                          </span>

                          {/* POV name */}
                          <span className="text-muted-foreground w-24 truncate" title={povTitle}>
                            {povTitle}
                          </span>

                          {/* Task navigation button */}
                          {activityTaskId && taskPovId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/pov/edit/${taskPovId}?mode=project&taskId=${activityTaskId}`)}
                              className="h-6 px-2 text-[10px]"
                              title="Open task in POV editor"
                              aria-label={`Open task ${activityTaskTitle} in editor`}
                            >
                              →
                            </Button>
                          )}
                        </div>

                        {/* Inline Visual Treatment - Always visible based on activity type */}
                        {visualType === 'transition' && activity.details?.newValue && (
                          <ActivityTransition
                            oldValue={activity.details.oldValue}
                            newValue={String(activity.details.newValue)}
                            fieldName={activity.details.fieldName}
                          />
                        )}

                        {visualType === 'comment' && activity.details?.comment && (
                          <ActivityComment comment={activity.details.comment} />
                        )}

                        {visualType === 'agent' && activity.details?.agentName && (
                          <ActivityAgentCard
                            agentName={activity.details.agentName}
                            executionId={activity.details.executionId || 'unknown'}
                            status={activity.details.executionStatus || 'SUCCESS'}
                            duration={activity.details.duration}
                            tokens={activity.details.tokens}
                          />
                        )}

                        {visualType === 'workflow' && activity.details?.workflowType && (
                          <ActivityWorkflow
                            workflowId={activity.details.workflowId || 'unknown'}
                            workflowType={activity.details.workflowType}
                            status={activity.details.workflowStatus || 'SUCCESS'}
                            stepCount={activity.details.workflowStepCount}
                            executionTime={activity.details.workflowExecutionTime}
                          />
                        )}

                        {visualType === 'stage' && (activity.details?.newStageName || activity.details?.newValue) && (
                          <ActivityStageTransition
                            oldStageName={activity.details.oldStageName || activity.details.oldValue}
                            newStageName={activity.details.newStageName || activity.details.newValue}
                            oldPhaseName={activity.details.oldPhaseName}
                            newPhaseName={activity.details.newPhaseName}
                          />
                        )}

                        {visualType === 'phase' && (activity.details?.newPhaseName || activity.details?.newValue) && (
                          <ActivityPhaseTransition
                            oldPhaseName={activity.details.oldPhaseName || activity.details.oldValue}
                            newPhaseName={activity.details.newPhaseName || activity.details.newValue}
                          />
                        )}

                        {visualType === 'attachment' && activity.details?.attachmentName && (
                          <ActivityAttachment
                            filename={activity.details.attachmentName}
                            fileSize={activity.details.fileSize}
                            fileType={activity.details.fileType}
                          />
                        )}

                        {/* AUDIT Mode Details - Only visible when AUDIT toggle is ON */}
                        {showAuditDetails && (
                          <div className="px-3 py-2 border-t border-border/30 bg-muted/20">
                            <ActivityAuditMetadata
                              ipAddress={activity.metadata?.ipAddress}
                              source={activity.metadata?.source}
                              requestId={activity.metadata?.sessionId}
                            />
                            <div className="ml-14 mt-1 text-[10px] text-muted-foreground space-y-0.5">
                              <div>
                                <span className="opacity-60">Full Time:</span>
                                <span className="ml-2">{new Date(activity.timestamp).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="opacity-60">User:</span>
                                <span className="ml-2">{activity.userName}</span>
                                {(activity as any).user?.email && (
                                  <span className="ml-1 opacity-60">({(activity as any).user.email})</span>
                                )}
                              </div>
                              {activityTaskId && (
                                <div>
                                  <span className="opacity-60">Task ID:</span>
                                  <span className="ml-2 font-mono">{activityTaskId}</span>
                                </div>
                              )}
                              {activity.isSystemGenerated && (
                                <div>
                                  <span className="opacity-60">Type:</span>
                                  <span className="ml-2 text-blue-400">System Generated</span>
                                </div>
                              )}
                              {activity.description && (
                                <div>
                                  <span className="opacity-60">Raw:</span>
                                  <span className="ml-2 font-mono">{activity.description}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {/* Empty State */}
          {filteredActivities.length === 0 && !isLoading && (
            <Card>
              <CardContent className="text-center py-8">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No activities found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || actionFilter !== 'all' || userFilter !== 'all'
                    ? 'Try adjusting your filters to see more activities.'
                    : 'Task activities will appear here as users interact with the task.'}
                </p>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}

