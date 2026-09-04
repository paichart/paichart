"use client";

import React from 'react';

/**
 * Activity Visual Components
 * Phase 6: Frontend Visual Redesign for Rich Task Activity Details
 *
 * Transforms generic B2B patterns into distinctive, memorable UI:
 * - Inline visual diffs instead of click-to-expand
 * - Quote blocks for comments
 * - Status cards for agent executions
 * - Kanban lane visualization for stage/phase changes
 *
 * Inspiration: Git diffs, Bloomberg Terminal, Slack threading, GitHub Actions, Subway maps
 */

// ============================================================================
// CRITICAL TREATMENT 1: Inline Visual Diffs (CRITICAL-F1)
// Shows transitions inline: OPEN ━━━━━━━━> IN_PROGRESS
// ============================================================================

interface ActivityTransitionProps {
  oldValue: string | null | undefined;
  newValue: string;
  fieldName?: string;
}

export function ActivityTransition({ oldValue, newValue, fieldName }: ActivityTransitionProps) {
  if (!oldValue) {
    // Creation - just show new value
    return (
      <div className="activity-transition flex items-center gap-2 font-mono text-xs pl-14 text-muted-foreground">
        <span className="text-foreground font-medium">{newValue}</span>
      </div>
    );
  }

  return (
    <div
      className="activity-transition flex items-center gap-2 font-mono text-xs pl-14"
      role="status"
      aria-label={`${fieldName || 'Value'} changed from ${oldValue} to ${newValue}`}
    >
      <span className="text-muted-foreground line-through opacity-70">{oldValue}</span>
      <span className="text-amber-400 tracking-tighter">{'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━>'}</span>
      <span className="text-foreground font-medium">{newValue}</span>
    </div>
  );
}

// ============================================================================
// CRITICAL TREATMENT 2: Comment Quote Blocks (CRITICAL-F2)
// Shows comments inline with blockquote treatment
// ============================================================================

interface ActivityCommentProps {
  comment: string;
  maxLength?: number;
}

export function ActivityComment({ comment, maxLength = 80 }: ActivityCommentProps) {
  const truncated = comment.length > maxLength
    ? comment.slice(0, maxLength) + '...'
    : comment;

  return (
    <div
      className="activity-comment flex items-start gap-2 pl-14 text-xs max-w-full"
      title={comment}
    >
      <span className="text-cyan-400 text-base leading-tight flex-shrink-0">{'▌'}</span>
      <span className="text-muted-foreground italic overflow-hidden text-ellipsis whitespace-nowrap max-w-[60ch]">
        &quot;{truncated}&quot;
      </span>
    </div>
  );
}

// ============================================================================
// CRITICAL TREATMENT 3: Agent Execution Cards (CRITICAL-F3)
// Status cards with progress bar for AI operations
// ============================================================================

interface ActivityAgentCardProps {
  agentName: string;
  executionId: string;
  status: 'PENDING' | 'READY' | 'RUNNING' | 'PENDING_REVIEW' | 'REVIEW_APPROVED' | 'REVIEW_REJECTED' | 'SUCCESS' | 'FAILED' | string;
  duration?: string;
  tokens?: number;
}

export function ActivityAgentCard({
  agentName,
  executionId,
  status,
  duration,
  tokens
}: ActivityAgentCardProps) {
  // Map status to display properties
  const statusConfig: Record<string, { color: string; bgColor: string; progress: string; percent: string }> = {
    SUCCESS: {
      color: 'text-green-400',
      bgColor: 'bg-green-500/10 border-green-500/30',
      progress: '████████████████████',
      percent: '100%'
    },
    FAILED: {
      color: 'text-red-400',
      bgColor: 'bg-red-500/10 border-red-500/30',
      progress: '████████░░░░░░░░░░░░',
      percent: '40%'
    },
    RUNNING: {
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/30',
      progress: '████████████░░░░░░░░',
      percent: '60%'
    },
    PENDING: {
      color: 'text-gray-400',
      bgColor: 'bg-gray-500/10 border-gray-500/30',
      progress: '░░░░░░░░░░░░░░░░░░░░',
      percent: '0%'
    },
    READY: {
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/30',
      progress: '████░░░░░░░░░░░░░░░░',
      percent: '20%'
    },
    PENDING_REVIEW: {
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10 border-purple-500/30',
      progress: '████████████████░░░░',
      percent: '80%'
    },
    REVIEW_APPROVED: {
      color: 'text-green-400',
      bgColor: 'bg-green-500/10 border-green-500/30',
      progress: '██████████████████░░',
      percent: '90%'
    },
    REVIEW_REJECTED: {
      color: 'text-red-400',
      bgColor: 'bg-red-500/10 border-red-500/30',
      progress: '████████████████░░░░',
      percent: '80%'
    },
  };

  const config = statusConfig[status] || statusConfig.PENDING;

  return (
    <div
      className={`activity-agent-card ml-14 mt-1 p-2 border rounded font-mono text-xs max-w-[50ch] ${config.bgColor}`}
      role="region"
      aria-label={`Agent execution: ${agentName}, status: ${status}`}
    >
      {/* Header row */}
      <div className="flex justify-between items-center gap-4">
        <span className="font-medium text-foreground">{'🤖'} {agentName}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${config.color} ${config.bgColor}`}>
          {status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-1 text-[11px] text-muted-foreground">
        <span className={config.color}>{config.progress}</span> {config.percent}
      </div>

      {/* Metadata row */}
      <div className="mt-1 text-[10px] text-muted-foreground flex gap-4">
        <span>Execution: {executionId.slice(0, 7)}</span>
        {duration && <span>Duration: {duration}</span>}
        {tokens && <span>Tokens: {tokens.toLocaleString()}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// CRITICAL TREATMENT 4: Kanban Lane Visualization (CRITICAL-F4)
// Stage/Phase transitions with arrow flow
// ============================================================================

interface ActivityStageTransitionProps {
  oldStageName: string | null | undefined;
  newStageName: string;
  oldPhaseName?: string;
  newPhaseName?: string;
}

export function ActivityStageTransition({
  oldStageName,
  newStageName,
  oldPhaseName,
  newPhaseName
}: ActivityStageTransitionProps) {
  return (
    <div className="activity-stage-transition flex flex-col pl-14 font-mono text-xs">
      {/* Stage row */}
      <div className="flex items-center gap-2">
        {oldStageName && (
          <>
            <span className="px-2 py-0.5 border border-border rounded bg-background text-foreground font-medium">
              [ {oldStageName} ]
            </span>
            <span className="text-amber-400 tracking-tighter">{'───────────────────>'}</span>
          </>
        )}
        <span className="px-2 py-0.5 border border-amber-500/50 rounded bg-amber-500/10 text-foreground font-medium">
          [ {newStageName} ]
        </span>
      </div>

      {/* Phase labels row */}
      {(oldPhaseName || newPhaseName) && (
        <div className="flex items-center gap-2 mt-0.5">
          {oldPhaseName && (
            <span className="text-[10px] text-muted-foreground pl-1">{oldPhaseName}</span>
          )}
          {oldPhaseName && newPhaseName && (
            <span className="text-[10px] text-muted-foreground" style={{ visibility: 'hidden' }}>
              {'───────────────────>'}
            </span>
          )}
          {newPhaseName && (
            <span className="text-[10px] text-muted-foreground pl-1">{newPhaseName}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Phase change - more prominent styling
interface ActivityPhaseTransitionProps {
  oldPhaseName: string | null | undefined;
  newPhaseName: string;
}

export function ActivityPhaseTransition({
  oldPhaseName,
  newPhaseName
}: ActivityPhaseTransitionProps) {
  return (
    <div className="activity-phase-transition pl-14 mt-1 font-mono text-xs">
      <div className="border-2 border-amber-400 p-2 flex items-center justify-center gap-4 bg-background/50">
        {oldPhaseName && (
          <>
            <span className="font-semibold text-foreground">{oldPhaseName}</span>
            <span className="text-amber-400 font-bold">{'══════════════════════>'}</span>
          </>
        )}
        <span className="font-semibold text-amber-400">{newPhaseName}</span>
      </div>
    </div>
  );
}

// ============================================================================
// SUPPORTING ELEMENT 5.1: Skeleton Loading States
// ============================================================================

export function ActivitySkeleton() {
  return (
    <div className="pl-14 font-mono text-xs animate-pulse">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground/50">{'▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓'}</span>
        <span className="text-muted-foreground/30">{'████████████████████'}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-muted-foreground/30">{'░░░░░░░░░░░░░░░░░░'}</span>
        <span className="text-muted-foreground/20">{'░░░░░░░░░░░░░░░░░░░░'}</span>
      </div>
    </div>
  );
}

// ============================================================================
// SUPPORTING ELEMENT 5.2: File Type Badges
// ============================================================================

interface ActivityAttachmentProps {
  filename: string;
  fileSize?: number;
  fileType?: string;
}

export function ActivityAttachment({ filename, fileSize, fileType }: ActivityAttachmentProps) {
  // Map file extensions to badge types
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  const badgeConfig: Record<string, { label: string; color: string }> = {
    pdf: { label: 'PDF', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
    png: { label: 'IMG', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
    jpg: { label: 'IMG', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
    jpeg: { label: 'IMG', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
    gif: { label: 'IMG', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
    xls: { label: 'XLS', color: 'text-green-400 border-green-500/30 bg-green-500/10' },
    xlsx: { label: 'XLS', color: 'text-green-400 border-green-500/30 bg-green-500/10' },
    doc: { label: 'DOC', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
    docx: { label: 'DOC', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  };

  const config = badgeConfig[extension] || { label: 'FILE', color: 'text-gray-400 border-gray-500/30 bg-gray-500/10' };

  // Format file size
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="activity-attachment flex items-center gap-2 pl-14 font-mono text-xs">
      <span className={`px-1.5 py-0.5 border rounded text-[10px] font-semibold ${config.color}`}>
        [ {config.label} ]
      </span>
      <span className="text-foreground">{filename}</span>
      <span className="text-muted-foreground flex-1">{'─'.repeat(20)}</span>
      {fileSize && (
        <span className="text-muted-foreground">{formatSize(fileSize)}</span>
      )}
    </div>
  );
}

// ============================================================================
// CRITICAL TREATMENT 7: Workflow Execution Cards (Jan 2026)
// Status cards for MCP orchestration workflows
// ============================================================================

interface ActivityWorkflowProps {
  workflowId: string;
  workflowType: string;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | string;
  stepCount?: number;
  executionTime?: number;
}

export function ActivityWorkflow({
  workflowId,
  workflowType,
  status,
  stepCount,
  executionTime
}: ActivityWorkflowProps) {
  // Map status to display properties
  const statusConfig: Record<string, { color: string; bgColor: string; progress: string; percent: string }> = {
    SUCCESS: {
      color: 'text-green-400',
      bgColor: 'bg-green-500/10 border-green-500/30',
      progress: '████████████████████',
      percent: '100%'
    },
    FAILED: {
      color: 'text-red-400',
      bgColor: 'bg-red-500/10 border-red-500/30',
      progress: '████████░░░░░░░░░░░░',
      percent: '40%'
    },
    PARTIAL: {
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/30',
      progress: '████████████████░░░░',
      percent: '80%'
    },
  };

  const config = statusConfig[status] || statusConfig.PARTIAL;

  // Format workflow type for display
  const formatWorkflowType = (type: string): string => {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  // Format execution time
  const formatDuration = (ms?: number): string => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div
      className={`activity-workflow-card ml-14 mt-1 p-2 border rounded font-mono text-xs max-w-[50ch] ${config.bgColor}`}
      role="region"
      aria-label={`Workflow execution: ${workflowType}, status: ${status}`}
    >
      {/* Header row */}
      <div className="flex justify-between items-center gap-4">
        <span className="font-medium text-foreground">{'⚙'} {formatWorkflowType(workflowType)}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${config.color} ${config.bgColor}`}>
          {status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-1 text-[11px] text-muted-foreground">
        <span className={config.color}>{config.progress}</span> {config.percent}
      </div>

      {/* Metadata row */}
      <div className="mt-1 text-[10px] text-muted-foreground flex gap-4">
        <span>Workflow: {workflowId.slice(0, 7)}</span>
        {stepCount !== undefined && <span>Steps: {stepCount}</span>}
        {executionTime !== undefined && <span>Duration: {formatDuration(executionTime)}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// SUPPORTING ELEMENT 5.3: AUDIT Toggle (Metadata Display)
// ============================================================================

interface ActivityAuditMetadataProps {
  ipAddress?: string;
  source?: string;
  requestId?: string;
  userAgent?: string;
}

export function ActivityAuditMetadata({ ipAddress, source, requestId, userAgent }: ActivityAuditMetadataProps) {
  if (!ipAddress && !source && !requestId) return null;

  return (
    <div className="activity-audit-metadata pl-14 font-mono text-[10px] text-muted-foreground flex gap-4 mt-1">
      {ipAddress && <span>IP: {ipAddress}</span>}
      {source && <span>Source: {source}</span>}
      {requestId && <span>Request: {requestId.slice(0, 8)}</span>}
    </div>
  );
}

// ============================================================================
// HELPER: Determine which visual treatment to use
// ============================================================================

export type ActivityVisualType =
  | 'transition'
  | 'comment'
  | 'agent'
  | 'stage'
  | 'phase'
  | 'attachment'
  | 'workflow'
  | 'none';

export function getActivityVisualType(action: string, details?: any): ActivityVisualType {
  const actionUpper = action.toUpperCase();

  if (actionUpper === 'COMMENT_ADDED' && details?.comment) {
    return 'comment';
  }

  if (actionUpper === 'AGENT_EXECUTED' && details?.agentName) {
    return 'agent';
  }

  if (actionUpper === 'WORKFLOW_EXECUTED' && details?.workflowType) {
    return 'workflow';
  }

  if (actionUpper === 'STAGE_CHANGED' && (details?.newStageName || details?.newValue)) {
    return 'stage';
  }

  if (actionUpper === 'PHASE_CHANGED' && (details?.newPhaseName || details?.newValue)) {
    return 'phase';
  }

  if ((actionUpper === 'ATTACHMENT_ADDED' || actionUpper === 'ATTACHMENT_REMOVED') && details?.attachmentName) {
    return 'attachment';
  }

  // Status, priority, assignment changes show transitions
  if (['STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'DUE_DATE_CHANGED'].includes(actionUpper)) {
    if (details?.oldValue || details?.newValue) {
      return 'transition';
    }
  }

  return 'none';
}
