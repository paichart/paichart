/**
 * Client-Side Validation Schemas for Analytics API Responses
 *
 * Purpose: Validate API responses in React Query hooks (defensive programming)
 * Layer: CLIENT-SIDE validation only (browser, not server)
 *
 * These schemas validate API responses to prevent:
 * - Null pointer crashes from deleted users/tasks/phases
 * - Type mismatches between API and component expectations
 * - Boundary field leakage issues
 *
 * Reviewed by:
 * - boundary-contract-specialist (null safety)
 * - validation-engine-specialist (runtime validation)
 * - types-system-specialist (type correctness)
 *
 * @version 3.1 — deprecated /api/tasks/analytics/* wrappers removed at sunset 2026-06-12
 * @see /app/api/analytics/route.ts (unified endpoint; domains/tasks/{performance,insights}.ts)
 * @see /app/api/agent-executions/route.ts
 */

import { z } from 'zod';
import { TaskStatus, TaskPriority } from '@prisma/client';

/**
 * Validates the `performance` metric payload from the unified analytics endpoint:
 * GET /api/analytics?domain=tasks&metrics=performance → { data: { performance: <this .shape.data> } }
 * (the deprecated /api/tasks/analytics/performance wrapper returned <this> directly;
 * removed at sunset 2026-06-12)
 *
 * Returns team performance metrics, task distribution, and top performers
 * Used for: Team Performance widget, Top Contributors leaderboard
 */
export const PerformanceResponseSchema = z.object({
  data: z.object({
    summary: z.object({
      totalTasks: z.number(),
      completedTasks: z.number(),
      completionRate: z.number(),
      averageCompletionTime: z.number(),
      onTimeRate: z.number(),
      overdueTasks: z.number()
    }),
    distribution: z.object({
      byStatus: z.array(z.object({
        // Use Prisma enum to prevent drift (TaskStatus)
        status: z.nativeEnum(TaskStatus),
        count: z.number()
      })),
      byPriority: z.array(z.object({
        // Use Prisma enum to prevent drift (TaskPriority: HIGH, MEDIUM, LOW only)
        priority: z.nativeEnum(TaskPriority),
        count: z.number()
      })),
      byType: z.array(z.object({
        type: z.string(),  // TaskType has many values, keep as string
        count: z.number()
      }))
    }),
    trends: z.object({
      activityTrends: z.array(z.object({
        action: z.string(),
        count: z.number()
      }))
    }),
    topPerformers: z.array(z.object({
      assigneeId: z.string(),
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string()
      }).nullable(),  // ✅ Explicit null handling for deleted users (boundary-contract)
      completedTasks: z.number()
    }))
  })
});

export type PerformanceResponse = z.infer<typeof PerformanceResponseSchema>;

/**
 * Validates the `insights` metric payload from the unified analytics endpoint:
 * GET /api/analytics?domain=tasks&metrics=insights → { data: { insights: <this .shape.data> } }
 * (the deprecated /api/tasks/analytics/insights wrapper returned <this> directly;
 * removed at sunset 2026-06-12)
 *
 * Returns risk analysis, AI recommendations, workload distribution, and bottlenecks
 * Used for: Health Dashboard, AI Recommendations widget, Risk indicators
 */
export const InsightsResponseSchema = z.object({
  data: z.object({
    summary: z.object({
      tasksAtRisk: z.number(),
      blockedTasks: z.number(),
      productivityTrend: z.number(),
      averageWorkload: z.number().nullable()  // ✅ Can be null when no tasks assigned
    }),
    risks: z.object({
      tasksAtRisk: z.array(z.object({
        id: z.string(),
        title: z.string(),
        dueDate: z.union([z.string(), z.date()]).nullable(),  // ✅ Date type union (types-system)
        assignee: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string()
        }).nullable(),  // ✅ Null safety for deleted users
        phase: z.object({
          id: z.string(),
          name: z.string()
        }).nullable(),  // ✅ Null safety for deleted phases (phase-stage)
        daysOverdue: z.number()
      })),
      blockedTasks: z.array(z.object({
        id: z.string(),
        title: z.string(),
        assignee: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string()
        }).nullable(),
        blockingDependencies: z.array(z.object({
          id: z.string(),
          title: z.string(),
          // Use Prisma enum to prevent drift (TaskStatus)
          status: z.nativeEnum(TaskStatus)
        }))
      }))
    }),
    workload: z.object({
      distribution: z.array(z.object({
        assignee: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string()
        }).nullable(),
        activeTasks: z.number()
      })),
      imbalanceScore: z.number()
    }),
    bottlenecks: z.array(z.object({
      phase: z.object({
        id: z.string(),
        name: z.string(),
        type: z.string()  // PhaseType enum (PLANNING/EXECUTION/REVIEW)
      }).nullable(),  // ✅ Null safety for deleted phases
      incompleteTasks: z.number()
    })),
    recommendations: z.array(z.object({
      type: z.enum([
        'RISK_MITIGATION',
        'WORKLOAD_BALANCING',
        'PRODUCTIVITY_IMPROVEMENT',
        'BOTTLENECK_RESOLUTION'
      ]),  // ✅ Enum constraint (types-system)
      priority: z.enum(['HIGH', 'MEDIUM']),  // ✅ Fixed: removed LOW (types-system)
      title: z.string(),
      description: z.string(),
      actionItems: z.array(z.string())
    }))
  })
});

export type InsightsResponse = z.infer<typeof InsightsResponseSchema>;

/**
 * Validates /api/agent-executions response
 *
 * Returns agent execution history with task details
 * Used for: Agent Activity widget, Recent executions timeline
 *
 * IMPORTANT: API only returns basic task fields (id, title, status, type)
 * Do NOT expect assignee, phase, pov in task object (types-system finding)
 */
export const AgentExecutionsResponseSchema = z.object({
  data: z.object({
    executions: z.array(z.object({
      id: z.string(),
      taskId: z.string(),
      agentRole: z.string(),
      status: z.string(),
      startTime: z.union([z.string(), z.date()]),  // ✅ Date type union (types-system)
      endTime: z.union([z.string(), z.date()]).nullable(),  // ✅ Date type union (types-system)
      duration: z.number().nullable(),
      prompt: z.string(),
      result: z.any(),
      error: z.string().nullable(),
      logs: z.array(z.any()),
      task: z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        type: z.string()
        // ✅ FIXED: Removed priority, assignee, phase, pov (types-system critical finding)
        // API only returns 4 fields, not 8 - see /app/api/agent-executions/route.ts:59-68
      }).nullable(),  // ✅ Task could be deleted (boundary-contract)
      createdAt: z.union([z.string(), z.date()]),
      updatedAt: z.union([z.string(), z.date()])
    })),
    pagination: z.object({
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number()
    })
  })
});

export type AgentExecutionsResponse = z.infer<typeof AgentExecutionsResponseSchema>;

/**
 * (token-usage-persistence Phase 1) Contract for the token FACTS + read-time-derived cost added to the
 * agents-summary metric: GET /api/analytics?domain=agents&metrics=summary → { data: { summary: <…> } }.
 * Cost is derived, never stored (Protocol 10). `model` is an OPEN string — served models are a superset
 * of the offered registry (de-picked ids, dated snapshots, server-fallback models), so a closed enum
 * would reject legitimate aggregates (boundary-contract [CRITICAL]). `costUsd`/`totalCostUsd` are plain
 * numbers (unpriceable executions contribute 0 and lower `costCoverage`, rather than poisoning the sum
 * with a fabricated value).
 *
 * NOTE: the legacy agents-summary endpoint is not yet in the live validate:schemas suite; this schema
 * documents + guards the token subset (unit-asserted in scripts/test-token-usage.ts). Full-endpoint
 * validate:schemas wiring is Phase 2.
 */
export const TokenUsageSummarySchema = z.object({
  totalTokensUsed: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCacheReadTokens: z.number(),
  totalCacheCreationTokens: z.number(),
  totalCostUsd: z.number(),
  costCoverage: z.number(),        // 0..1 — fraction of in-window executions carrying real token data
  byModel: z.array(z.object({
    model: z.string(),             // OPEN — served superset of the registry
    executions: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
  })),
});

export type TokenUsageSummary = z.infer<typeof TokenUsageSummarySchema>;
