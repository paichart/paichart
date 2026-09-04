/**
 * Task Type Utilities (Backend-Safe)
 *
 * Rationalized Apr 2026: 13→7 types (browser dropped, MCP 4→1, PIPELINE added)
 *
 * IMPORTANT: This file MUST stay free of frontend-only imports (lucide-react,
 * React components, etc.) because it sits in the require chain reached by
 * lib/mcp/tasks/action/router-bridge.js → tasks-action-router.ts → handlers
 * → lib/tasks/services/task.ts → here. lucide-react is ESM-only and ts-node's
 * CJS loader cannot require() it at runtime, which breaks the embedded
 * execution engine's direct Tier 1 routing.
 *
 * Frontend code that needs icons should import from `./taskTypeIcons` instead.
 *
 * See: .claude/knowledge/domain/harness/TODO-RATE-LIMIT-FIX.md (A2 fix)
 */

import { TaskType } from '@prisma/client';

/**
 * Labels for task types
 */
export const taskTypeLabels: Record<TaskType, string> = {
  [TaskType.ACTION]: 'Action',
  [TaskType.DECISION]: 'Decision',
  [TaskType.MILESTONE]: 'Milestone',
  [TaskType.APPROVAL]: 'Approval',
  [TaskType.DOCUMENT]: 'Document',
  [TaskType.MCP_SERVICE]: 'MCP Service',
  [TaskType.PIPELINE]: 'Pipeline',
};

/**
 * Descriptions for task types
 */
export const taskTypeDescriptions: Record<TaskType, string> = {
  [TaskType.ACTION]: 'A task that requires action to be taken',
  [TaskType.DECISION]: 'A decision point that needs to be resolved',
  [TaskType.MILESTONE]: 'A significant achievement or checkpoint',
  [TaskType.APPROVAL]: 'Requires formal approval to proceed',
  [TaskType.DOCUMENT]: 'Documentation or artifact creation',
  [TaskType.MCP_SERVICE]: 'MCP service operation (registration, discovery, testing, integration)',
  [TaskType.PIPELINE]: 'Pipeline orchestrator — decomposes objectives and coordinates specialist agents',
};

/**
 * Colors for task types
 */
export const taskTypeColors: Record<TaskType, string> = {
  [TaskType.ACTION]: 'blue',
  [TaskType.DECISION]: 'purple',
  [TaskType.MILESTONE]: 'amber',
  [TaskType.APPROVAL]: 'green',
  [TaskType.DOCUMENT]: 'slate',
  [TaskType.MCP_SERVICE]: 'violet',
  [TaskType.PIPELINE]: 'orange',
};

/**
 * Get the color class for a task type
 * @param type The task type
 * @param variant The color variant (text, bg, border)
 * @returns CSS class name
 */
export function getTaskTypeColorClass(type: TaskType, variant: 'text' | 'bg' | 'border' = 'text') {
  const color = taskTypeColors[type] || taskTypeColors[TaskType.ACTION];
  return `${variant}-${color}-500`;
}

/**
 * Convert a string to a TaskType enum value.
 * Handles legacy types from before the Apr 2026 rationalization.
 */
export function stringToTaskType(typeString: string): TaskType {
  const normalizedType = typeString.toUpperCase();

  if (Object.values(TaskType).includes(normalizedType as TaskType)) {
    return normalizedType as TaskType;
  }

  // Legacy type mappings (pre-rationalization)
  const legacyMappings: Record<string, TaskType> = {
    'TASK': TaskType.ACTION,
    'COMPLETED': TaskType.ACTION,
    // Browser types (dropped Apr 2026)
    'BROWSER_AUTOMATION': TaskType.ACTION,
    'WEB_SCRAPING': TaskType.ACTION,
    'UI_TESTING': TaskType.ACTION,
    'FORM_SUBMISSION': TaskType.ACTION,
    // MCP types (consolidated Apr 2026)
    'MCP_SERVICE_REGISTRATION': TaskType.MCP_SERVICE,
    'MCP_SERVICE_DISCOVERY': TaskType.MCP_SERVICE,
    'MCP_SERVICE_TEST': TaskType.MCP_SERVICE,
    'MCP_SERVICE_INTEGRATION': TaskType.MCP_SERVICE,
  };

  return legacyMappings[normalizedType] || TaskType.ACTION;
}

/**
 * Get all task types as an array of options (no icons — backend-safe).
 * Frontend code that needs icons can compose this with taskTypeIcons from
 * `./taskTypeIcons`.
 */
export function getTaskTypeOptions() {
  return Object.values(TaskType).map(type => ({
    value: type,
    label: taskTypeLabels[type],
    description: taskTypeDescriptions[type],
  }));
}
