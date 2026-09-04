/**
 * Task Complete Handler
 *
 * Handles task completion action via MCP.
 * Validates POV access before allowing task status change.
 *
 * @class TaskCompleteHandler
 * @description Simple task completion handler that marks tasks as COMPLETED with optional
 *   completion notes. Validates POV access and logs activity.
 *
 *   Key Features:
 *   - Changes task status to COMPLETED
 *   - Adds optional completion notes to description
 *   - POV access validation via validatePOVAccess
 *   - Activity logging for audit trail
 *
 * @param {Object} parameters - Task completion parameters
 * @param {string} parameters.taskId - Task ID to complete (REQUIRED)
 * @param {string} [parameters.completionNotes] - Optional notes to append to task description
 * @param {TokenPayload} user - Authenticated user token payload
 * @param {string} user.userId - User ID from JWT token
 * @param {string} actionId - Unique action ID for tracking and logging
 *
 * @returns {Promise<Object>} Task completion result
 * @returns {string} returns.actionId - Action tracking ID
 * @returns {string} returns.action - Action type (task.complete)
 * @returns {string} returns.status - Completion status (completed)
 * @returns {Object} returns.result - Completion result
 * @returns {Object} returns.result.task - Completed task object
 * @returns {string} returns.result.task.id - Task ID
 * @returns {string} returns.result.task.title - Task title
 * @returns {string} returns.result.task.description - Task description (with completion notes if provided)
 * @returns {string} returns.result.task.status - Task status (COMPLETED)
 * @returns {Date} returns.result.task.completedAt - Completion timestamp
 * @returns {string} returns.result.message - Success message
 *
 * @throws {Error} If taskId parameter is missing
 * @throws {Error} If task not found
 * @throws {Error} If POV access validation fails (via validatePOVAccess)
 *
 * @example
 * // Complete task without notes
 * const result = await handleTaskComplete({
 *   taskId: 'task123'
 * }, user, 'action-456');
 *
 * @example
 * // Complete task with completion notes
 * const result = await handleTaskComplete({
 *   taskId: 'task123',
 *   completionNotes: 'All acceptance criteria met. Deployed to production.'
 * }, user, 'action-789');
 *
 * @security
 *   - POV access validation via validatePOVAccess
 *   - Activity logging for audit trail
 *
 * @version 1.0.0
 * @since 2025-12-18
 * @extracted 2025-12-18 from app/api/mcp/tasks/action/route.ts (lines 1599-1670)
 */

import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { mcpLogger } from '@/lib/logger';
import { validateTaskStatusTransition } from '@/lib/tasks/services/task';
import { completeTaskTerminally } from '@/lib/tasks/services/complete-task-terminally';

const log = mcpLogger.child({ module: 'TaskCompleteHandler' });

export async function handleTaskComplete(
  parameters: any,
  user: TokenPayload,
  actionId: string
) {
  const { taskId, completionNote, completionNotes, confidence, summary, dependencyOverrideReason } = parameters;

  // Use completionNote (validation normalizes completionNotes → completionNote).
  // 2026-05-26: sanitize at the write site (parity with task-comment-handler's
  // sanitizeComment) — completion notes are persisted as a Comment and echoed in
  // the response; strip script/iframe/event-handler payloads before storage.
  const { sanitizeComment } = require('@/lib/utils/sanitization');
  const rawCompletionNote = completionNote || completionNotes;
  const finalCompletionNote = rawCompletionNote ? sanitizeComment(rawCompletionNote) : rawCompletionNote;

  // 2026-06-09: sanitize summary at the write site too. summary is now surfaced
  // as bare text in task.context's COMPLETION section; it was previously stored
  // raw. Output-time sanitizeForResponse in the formatter is the L4 defense —
  // this is the matching write-time defense (parity with completionNote above).
  const finalSummary = summary ? sanitizeComment(summary) : summary;

  // Validate confidence score if provided
  const confidenceScore = confidence != null ? Math.max(0, Math.min(100, Number(confidence))) : null;

  if (!taskId) {
    throw new Error('Task ID is required for task completion');
  }

  // 🔒 SECURITY: Validate POV access before allowing task completion
  const taskForAuth = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      pov: {
        select: {
          id: true,
          ownerId: true,
          metadata: true,
          team: {
            select: {
              members: {
                select: { userId: true }
              }
            }
          }
        }
      }
    }
  });

  if (!taskForAuth?.pov) {
    throw new Error(
      `Task not found: "${taskId}"\n\n` +
      `The task may not exist or you don't have access.\n\n` +
      `💡 Find tasks:\n` +
      `• project(action: "task.list", pov_name: "Your POV") - See all tasks in a POV\n` +
      `• project(action: "task.list", assignee_name: "Your Name") - See your assigned tasks\n` +
      `• search("task keywords") - Search across all tasks\n\n` +
      `Or verify the task ID is correct.`
    );
  }

  validatePOVAccess(user, taskForAuth.pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
    logContext: 'Task Complete'
  });

  // P2 wave 2 (completion-path unification 3.4): this handler is now a THIN ADAPTER over the
  // shared core. The core owns: fresh in-tx read + transition validation + APPROVAL dep-guard +
  // the 4-point PIPELINE invariant + the F10 programConfidence stamp (hoisted core-side) + the
  // CAS terminal write (RepeatableRead + serialization retry — this path gains the tx it never
  // had, closing the bare-prisma TOCTOU stack and the metadata lost-update) + the post-commit
  // tail (completion comment, canonical activity fact, reactors behind fireReactors with the F9
  // deferral). The adapter keeps: param extraction/sanitization, POV auth (above), the MCP
  // response envelope, and the confidence/summary metadata merge as a pure buildUpdateData.
  const result = await completeTaskTerminally(prisma, {
    taskId,
    actor: { userId: user.userId, source: 'MCP' },
    completionNote: finalCompletionNote,
    llmConfidenceScore: confidenceScore,
    dependencyOverride: dependencyOverrideReason ? { reason: dependencyOverrideReason } : null,
    // fireReactors: THREADED — MCP task.complete preserves today's behavior (the ONLY human
    // path that cascades until Flip A).
    fireReactors: true,
    buildUpdateData: (_tx, existing) => {
      if (confidenceScore == null && !finalSummary) return {};
      const existingMeta = (existing.metadata as Record<string, unknown> | null) || {};
      return {
        metadata: {
          ...existingMeta,
          ...(confidenceScore != null ? { confidenceScore } : {}),
          ...(finalSummary ? { completionSummary: finalSummary } : {}),
        },
      };
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      pov: { select: { id: true, title: true } },
    },
  });

  // Behavior parity: task.complete on an already-COMPLETED task has always thrown the terminal
  // transition error (the core's idempotent no-op is for the web re-PATCH case, not MCP).
  if (!result.transitioned) {
    validateTaskStatusTransition('COMPLETED', 'COMPLETED');
  }

  const task = result.task;
  log.info({ taskId }, 'task completed via shared core (rich activity + reactors in the core tail)');

  return {
    actionId,
    action: 'task.complete',
    status: 'completed',
    result: {
      task,
      completionNote: finalCompletionNote,
      commentCreated: !!finalCompletionNote,
      message: finalCompletionNote
        ? 'Task completed successfully via MCP with completion comment'
        : 'Task completed successfully via MCP'
    }
  };
}
