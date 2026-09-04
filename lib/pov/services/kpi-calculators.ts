/**
 * KPI Predefined Calculator Library
 *
 * Safe replacement for the disabled calculateKPI() which used new Function() (BC17/BC48).
 * Each calculator is a pure function that derives KPI scores from contextData —
 * zero extra DB queries when piggybacking on the recommendation cycle.
 *
 * Pattern compliance:
 * - parallel-query-optimization (98%): reuses contextData, no independent queries
 * - global-prisma-singleton (98%): no direct prisma usage (pure functions)
 * - pino-structured-logging (96%): child logger for diagnostics
 *
 * @see TODO-autonomous-management-agent.md (Phase 1.5 → KPI integration)
 * @see kpi-service-design CONSOLIDATED-REVIEW.md (5-specialist review, 89/100)
 */

import { povLogger } from '@/lib/logger';

const log = povLogger.child({ module: 'KPICalculator' });

// --- Calculator Metadata Registry ---

export interface KPICalculatorMeta {
  id: string;
  name: string;
  abbreviation: string;
  type: 'PERCENTAGE' | 'NUMERIC';
  direction: 'higher_is_better' | 'lower_is_better';
  defaultTarget: { value: number; threshold?: { warning: number; critical: number } };
  defaultWeight: number;
  description: string;
}

/**
 * Registry of all predefined KPI calculators.
 * MVP: 3 calculators (all zero-cost — derive from contextData).
 * Phase 2: Add velocity, phase-progress, blocked-ratio, team-utilization.
 */
export const KPI_CALCULATOR_REGISTRY: KPICalculatorMeta[] = [
  {
    id: 'task-completion-rate',
    name: 'Task Completion Rate',
    abbreviation: 'COMP',
    type: 'PERCENTAGE',
    direction: 'higher_is_better',
    defaultTarget: { value: 90, threshold: { warning: 70, critical: 50 } },
    defaultWeight: 40,
    description: 'Percentage of tasks completed in this POV',
  },
  {
    id: 'on-time-rate',
    name: 'On-Time Delivery',
    abbreviation: 'TIME',
    type: 'PERCENTAGE',
    direction: 'higher_is_better',
    defaultTarget: { value: 85, threshold: { warning: 70, critical: 50 } },
    defaultWeight: 35,
    description: 'Percentage of completed tasks delivered before due date',
  },
  {
    id: 'stale-task-ratio',
    name: 'Stale Task Ratio',
    abbreviation: 'STAL',
    type: 'PERCENTAGE',
    direction: 'lower_is_better',
    defaultTarget: { value: 10, threshold: { warning: 20, critical: 35 } },
    defaultWeight: 25,
    description: 'Percentage of active tasks not updated in 7+ days (lower is better)',
  },
];

// --- Calculator Functions ---

interface ContextDataForKPI {
  userTasks: Array<{ id: string; status: string; dueDate?: Date | string | null; updatedAt: Date | string; povId?: string | null }>;
  staleTasks: Array<{ id: string; povId?: string | null }>;
}

/**
 * Calculate all KPI scores from existing contextData.
 * Pure function — zero DB queries, ~0ms execution time.
 *
 * @param contextData - The gatherContextualData() result from the recommendation cycle
 * @param povId - The POV to calculate scores for
 * @returns Map of formulaId → score (0-100 for percentages)
 */
export function calculateKPIsFromContext(
  contextData: ContextDataForKPI,
  povId: string
): Map<string, number> {
  const scores = new Map<string, number>();

  const povTasks = contextData.userTasks.filter(t => t.povId === povId);
  const total = povTasks.length;
  const completed = povTasks.filter(t => t.status === 'COMPLETED').length;
  const active = total - completed;

  // task-completion-rate: completed / total * 100
  scores.set('task-completion-rate', total > 0 ? Math.round((completed / total) * 100) : 0);

  // stale-task-ratio: stale / active * 100 (lower is better)
  const stalePOVTasks = contextData.staleTasks.filter(t => t.povId === povId).length;
  scores.set('stale-task-ratio', active > 0 ? Math.round((stalePOVTasks / active) * 100) : 0);

  // on-time-rate: completed with dueDate where updatedAt <= dueDate / total completed with dueDate
  const completedWithDue = povTasks.filter(t => t.status === 'COMPLETED' && t.dueDate);
  const onTime = completedWithDue.filter(t => {
    const completedAt = new Date(t.updatedAt);
    const dueDate = new Date(t.dueDate!);
    return completedAt <= dueDate;
  });
  scores.set('on-time-rate', completedWithDue.length > 0
    ? Math.round((onTime.length / completedWithDue.length) * 100)
    : 100); // No tasks with due dates = 100% on-time (nothing to be late on)

  log.debug({ povId, scores: Object.fromEntries(scores) }, 'KPI scores calculated from contextData');

  return scores;
}

// --- Helpers ---

/**
 * Get calculator metadata by formula ID.
 */
export function getCalculatorMeta(formulaId: string): KPICalculatorMeta | undefined {
  return KPI_CALCULATOR_REGISTRY.find(c => c.id === formulaId);
}

/**
 * Get all calculator IDs.
 */
export function getCalculatorIds(): string[] {
  return KPI_CALCULATOR_REGISTRY.map(c => c.id);
}
