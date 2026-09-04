/**
 * Task Type Icons (Frontend-Only)
 *
 * Split from taskTypes.ts (Apr 2026) to keep lucide-react out of the
 * server-side require chain. lucide-react ships as ESM-only ("type": "module"
 * in its package.json), and ts-node's CJS loader cannot require() an ESM
 * module at runtime — which broke the embedded execution engine's direct
 * Tier 1 routing via lib/mcp/tasks/action/router-bridge.js.
 *
 * Backend code (handlers, services) MUST import from `./taskTypes` instead.
 * Only frontend components should import from this file.
 *
 * See: .claude/knowledge/domain/harness/TODO-RATE-LIMIT-FIX.md (A2 fix)
 */

import { TaskType } from '@prisma/client';
import {
  CheckCircle2,
  GitBranch,
  Flag,
  ClipboardCheck,
  FileText,
  Globe,
  Workflow,
  LucideIcon,
} from 'lucide-react';

/**
 * Icon components for task types
 */
export const taskTypeIcons: Record<TaskType, LucideIcon> = {
  [TaskType.ACTION]: CheckCircle2,
  [TaskType.DECISION]: GitBranch,
  [TaskType.MILESTONE]: Flag,
  [TaskType.APPROVAL]: ClipboardCheck,
  [TaskType.DOCUMENT]: FileText,
  [TaskType.MCP_SERVICE]: Globe,
  [TaskType.PIPELINE]: Workflow,
};

/**
 * Get the icon component for a task type
 */
export function getTaskTypeIcon(type: TaskType): LucideIcon {
  return taskTypeIcons[type] || taskTypeIcons[TaskType.ACTION];
}

export type { LucideIcon };
