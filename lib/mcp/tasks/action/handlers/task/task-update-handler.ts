/**
 * Task Update Handler
 *
 * Handles task.update action for MCP integration
 * Extracted from app/api/mcp/tasks/action/route.ts (Phase 2.4, Step 1/10)
 *
 * @class TaskUpdateHandler
 * @description Comprehensive task update handler with intelligent field updates, diff tracking,
 *   and transactional consistency. Supports task lookup by ID or name, agent template assignment,
 *   and field-level validation.
 *
 *   Key Features:
 *   - Task lookup by ID or name+POV context (fuzzy matching)
 *   - POV access validation via validatePOVAccess
 *   - Agent template assignment by ID or name (with fallback lookup)
 *   - Field-level updates: title, description, priority, status, dueDate, assigneeId
 *   - Date normalization and validation (ISO format, Date objects)
 *   - Transaction-wrapped update with diff computation
 *   - Activity logging with diff-based messages
 *   - NO_EFFECT validation (prevents silent success on empty updates)
 *   - Assignee validation (ensures user exists)
 *
 * @param {Object} parameters - Task update parameters
 * @param {string} [parameters.taskId] - Task ID for direct lookup
 * @param {string} [parameters.task_name] - Task name for fuzzy lookup (requires POV context)
 * @param {string} [parameters.taskName] - Task name alias
 * @param {string} [parameters.pov_id] - POV ID for task name lookup context
 * @param {string} [parameters.povId] - POV ID alias
 * @param {Object} [parameters.updates] - Update object containing field changes
 * @param {string} [parameters.title] - New task title
 * @param {string} [parameters.description] - New task description
 * @param {string} [parameters.priority] - New task priority (HIGH/MEDIUM/LOW)
 * @param {string} [parameters.status] - New task status (OPEN/IN_PROGRESS/COMPLETED/BLOCKED)
 * @param {string} [parameters.dueDate] - New due date (ISO format or Date object)
 * @param {string} [parameters.due_date] - Due date alias
 * @param {string} [parameters.assigneeId] - New assignee user ID
 * @param {string} [parameters.agentTemplateId] - Agent template ID to assign
 * @param {string} [parameters.agentTemplateName] - Agent template name for lookup
 * @param {string} [parameters.agent_template_name] - Agent template name alias
 * @param {TokenPayload} user - Authenticated user token payload
 * @param {string} user.userId - User ID from JWT token
 * @param {string} actionId - Unique action ID for tracking and logging
 *
 * @returns {Promise<Object>} Task update result
 * @returns {string} returns.actionId - Action tracking ID
 * @returns {string} returns.action - Action type (task.update)
 * @returns {string} returns.status - Completion status (completed)
 * @returns {Object} returns.result - Update result
 * @returns {Object} returns.result.task - Updated task object
 * @returns {Object} returns.result.changes - Diff object showing before/after values
 * @returns {string} returns.result.message - Success message with change summary
 *
 * @throws {Error} If neither taskId nor task_name provided
 * @throws {Error} If task not found via ID or name lookup
 * @throws {Error} If multiple tasks found with same name (requires POV context)
 * @throws {Error} If POV access validation fails
 * @throws {Error} If agent template not found (by ID or name)
 * @throws {Error} If assigneeId provided but user doesn't exist
 * @throws {Error} If dueDate format is invalid (must be ISO string or Date)
 * @throws {Error} If no updates provided or detected (NO_EFFECT validation)
 *
 * @example
 * // Update task status and priority by ID
 * const result = await handleTaskUpdate({
 *   taskId: 'task123',
 *   status: 'IN_PROGRESS',
 *   priority: 'HIGH'
 * }, user, 'action-456');
 *
 * @example
 * // Update task by name with POV context
 * const result = await handleTaskUpdate({
 *   task_name: 'Setup Infrastructure',
 *   pov_id: 'cm123abc',
 *   description: 'Updated requirements',
 *   dueDate: '2025-12-31T23:59:59Z'
 * }, user, 'action-789');
 *
 * @example
 * // Assign task to user with agent template
 * const result = await handleTaskUpdate({
 *   taskId: 'task123',
 *   assigneeId: 'user789',
 *   agentTemplateName: 'Senior Developer'
 * }, user, 'action-101');
 *
 * @example
 * // Update multiple fields via updates object
 * const result = await handleTaskUpdate({
 *   taskId: 'task123',
 *   updates: {
 *     title: 'Revised Task Title',
 *     status: 'COMPLETED',
 *     description: 'Task completed successfully'
 *   }
 * }, user, 'action-202');
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Template lookups: 2 queries → 1 Promise.all (50% faster)
 *
 * @security
 *   - POV access validation via validatePOVAccess
 *   - Assignee validation (user existence check)
 *   - Transaction-wrapped updates (rollback on failure)
 *
 * @version 1.0.0
 * @since 2025-12-18
 * @module lib/mcp/tasks/action/handlers/task/task-update-handler
 */

import { prisma } from '@/lib/prisma';
import { withSerializationRetry } from '@/lib/database/serialization-retry';
import { Prisma } from '@prisma/client';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { computeTaskDiff } from '@/lib/mcp/tasks/action/utilities/task-diff';
import type { TokenPayload } from '@/lib/types/auth';
import {
  logFieldChange,
  logTaskAssignment,
  logStageChange,
  logPhaseChange,
  TaskActivityAction,
} from '@/lib/tasks/services/taskActivityService';
import { logStageFieldChange } from '@/lib/pov/services/stageActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
import { validateTaskStatusTransition } from '@/lib/tasks/services/task';
import {
  runTaskCompletionTx,
  fireCompletionEffects,
} from '@/lib/tasks/services/complete-task-terminally';
import { annotateQualityGateVerdictMismatch } from '@/lib/agents/harness/verdict-mismatch-guard';
import { enforceProtocolStampImmutable, stripAuditFacts } from '@/lib/tasks/services/protected-task-metadata';
import { checkDependencyCycle, GraphLimits } from '@/lib/utils/graph';

export async function handleTaskUpdate(parameters: any, user: TokenPayload, actionId: string) {
  const {
    taskId,
    task_name,
    taskName,
    pov_id,
    povId,
    updates,
    priority,  // Extract priority from parameters
    description, // Extract description from parameters
    title,  // NEW: Extract title
    status, // NEW: Extract status (fixes the bug!)
    dueDate, // NEW: Extract dueDate
    due_date, // NEW: Extract due_date (snake_case alias)
    assigneeId, // NEW: Extract assigneeId
    agentTemplateId,
    agentTemplateName,
    agent_template_name,
    dependencyIds,
    metadata, // NEW: shallow-merged into existing task.metadata inside tx
    // Also check for flat parameters at top level
    ...flatParams
  } = parameters;

  // Extract agentTemplateId from flat parameters if not found in nested structure
  const finalAgentTemplateId = agentTemplateId || flatParams.agentTemplateId;
  const finalAgentTemplateNameParam = agentTemplateName || agent_template_name || flatParams.agentTemplateName || flatParams.agent_template_name;

  mcpLogger.info({ taskId, taskName: task_name || taskName, actionId, hasTemplate: !!(finalAgentTemplateId || finalAgentTemplateNameParam) }, 'Task update started');

  let finalTaskId = taskId;

  // If no taskId provided, try to find task by name + POV context
  if (!finalTaskId && (task_name || taskName)) {
    const searchTaskName = task_name || taskName;
    const searchPovId = pov_id || povId;

    mcpLogger.debug({ searchTaskName, searchPovId }, 'Looking up task by name');

    // Build search criteria
    const searchCriteria: any = {
      title: { equals: searchTaskName, mode: 'insensitive' }
    };

    // Add POV context if provided
    if (searchPovId) {
      searchCriteria.povId = searchPovId;
    }

    // Find matching tasks
    const matchingTasks = await prisma.task.findMany({
      where: searchCriteria,
      include: {
        pov: { select: { id: true, title: true } },
        phase: { select: { id: true, name: true } }
      },
      take: 20
    });

    if (matchingTasks.length === 0) {
      throw new Error(`No tasks found with title "${searchTaskName}"${searchPovId ? ` in POV ${searchPovId}` : ''}`);
    } else if (matchingTasks.length === 1) {
      finalTaskId = matchingTasks[0].id;
      mcpLogger.debug({ taskId: finalTaskId }, 'Unique task found by name');
    } else {
      // Multiple matches - provide helpful error
      const povList = matchingTasks.map(t => `"${t.pov?.title}" (ID: ${t.id})`).join(', ');
      throw new Error(`Multiple tasks found with title "${searchTaskName}". Please specify POV context. Found in POVs: ${povList}`);
    }
  }

  if (!finalTaskId) {
    throw new Error('Either taskId or task_name (with POV context) is required for task update');
  }

  // 🔒 SECURITY: Validate POV access before allowing update
  const taskForAuth = await prisma.task.findUnique({
    where: { id: finalTaskId },
    select: {
      id: true,
      pov: {
        select: {
          id: true,
          ownerId: true,
          status: true,  // Phase A: Added for smart POV status suggestions
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
      `Task not found: "${finalTaskId}"\n\n` +
      `The task may not exist or you don't have access.\n\n` +
      `💡 Find tasks:\n` +
      `• project(action: "task.list", pov_name: "Your POV") - See all tasks in a POV\n` +
      `• project(action: "task.list", assignee_name: "Your Name") - See your assigned tasks\n` +
      `• search("task keywords") - Search across all tasks\n\n` +
      `Or verify the task ID is correct.`
    );
  }

  // Validate user has access to this POV
  validatePOVAccess(user, taskForAuth.pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
    logContext: 'Task Update'
  });

  // Handle agent template assignment if provided
  let templateAgentTemplateId = agentTemplateId;
  let agentTemplate = null;

  // If agent template name is provided, look up the template
  const templateName = agentTemplateName || agent_template_name;
  if (templateName && !templateAgentTemplateId) {
    mcpLogger.debug('Looking up agent template by name');

    // ============================================================================
    // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 2 template lookups → ~50% faster)
    // Run both search strategies in parallel, use best match
    // ============================================================================

    const [exactTemplateMatch, partialTemplateMatch] = await Promise.all([
      prisma.agentTemplate.findFirst({
        where: {
          name: { equals: templateName, mode: 'insensitive' }
        }
      }),
      prisma.agentTemplate.findFirst({
        where: {
          name: { contains: templateName, mode: 'insensitive' }
        }
      })
    ]);

    agentTemplate = exactTemplateMatch || partialTemplateMatch;

    if (agentTemplate) {
      templateAgentTemplateId = agentTemplate.id;
      mcpLogger.debug({ templateId: agentTemplate.id }, 'Agent template resolved');
    } else {
      const allTemplates = await prisma.agentTemplate.findMany({
        select: { id: true, name: true, category: true },
        take: 50
      });
      const availableNames = allTemplates.map(t => t.name);
      throw new Error(`Agent template not found: "${templateName}". Available templates: ${availableNames.join(', ')}`);
    }
  }

  // Build update data from explicit allowlisted fields only
  // BC29 FIX: Removed `...updates` spread — prevents mass assignment of arbitrary fields
  const updateData: any = {
    updatedAt: new Date()
  };

  // Extract known fields from updates (backward compatibility for nested structure).
  // metadata is NOT in this allowlist — it's handled separately with shallow-merge
  // semantics below to preserve existing metadata keys.
  if (updates) {
    const allowedUpdateFields = ['title', 'description', 'priority', 'status', 'dueDate', 'due_date', 'assigneeId', 'agentTemplateId'];
    for (const field of allowedUpdateFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }
    // metadata can also come via the nested updates object
    if (updates.metadata !== undefined && metadata === undefined) {
      // Pass through so the transaction-level merge below picks it up
      (updateData as any)._pendingMetadataMerge = updates.metadata;
    }
  }

  // Top-level metadata merge request
  if (metadata !== undefined) {
    (updateData as any)._pendingMetadataMerge = metadata;
  }

  // Add ALL validated fields (fixes parity violation)
  if (title !== undefined) {
    updateData.title = title;
  }
  if (description !== undefined) {
    updateData.description = description;
  }
  if (priority !== undefined) {
    updateData.priority = priority;
  }
  if (status !== undefined) {
    updateData.status = status;  // ← FIXES STATUS BUG
  }

  // Date handling with validation and normalization
  if (dueDate !== undefined || due_date !== undefined) {
    const dateValue = dueDate || due_date;
    let parsedDate: Date;

    if (typeof dateValue === 'string') {
      // Accept YYYY-MM-DD or full ISO-8601
      if (dateValue.length === 10) {
        // Date only - convert to midnight UTC
        parsedDate = new Date(`${dateValue}T00:00:00Z`);
      } else {
        // Full datetime string
        parsedDate = new Date(dateValue);
      }

      // Validate date is valid (prevent Invalid Date in database)
      if (isNaN(parsedDate.getTime())) {
        throw new Error(
          `Invalid due date format: "${dateValue}". ` +
          `Use YYYY-MM-DD or ISO-8601 (e.g., 2025-11-15 or 2025-11-15T00:00:00Z).`
        );
      }
    } else if (dateValue instanceof Date) {
      parsedDate = dateValue;
    } else {
      throw new Error(`Invalid due date type. Expected string or Date, got ${typeof dateValue}.`);
    }

    updateData.dueDate = parsedDate;
  }

  if (assigneeId !== undefined) {
    // Wave C M3 fix (2026-05-23, Basic Tools sec-ops Phase 3): assignee
    // must be a POV team member or POV owner. Mirror of M2 fix on
    // task.assign. Admins bypass via validatePOVAccess pattern above.
    if (assigneeId !== null && assigneeId !== '') {
      const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
      if (!isAdmin) {
        const isPOVOwner = taskForAuth.pov.ownerId === assigneeId;
        const isPOVTeamMember = (taskForAuth.pov.team?.members ?? []).some(
          (m: { userId: string }) => m.userId === assigneeId
        );
        if (!isPOVOwner && !isPOVTeamMember) {
          throw new Error(
            `User "${assigneeId}" is not a member of this POV team and is not the POV owner. ` +
            `Add them to the team via pov.update first, or assign to an existing team member.`
          );
        }
      }
    }
    updateData.assigneeId = assigneeId;
  }

  // Add agent template if provided
  if (finalAgentTemplateId) {
    updateData.agentTemplateId = finalAgentTemplateId;

    // Also update the agent role if we have the template
    if (!agentTemplate && finalAgentTemplateId) {
      agentTemplate = await prisma.agentTemplate.findUnique({
        where: { id: finalAgentTemplateId }
      });
    }

    if (agentTemplate) {
      updateData.agentRole = agentTemplate.defaultRole || agentTemplate.name;
      mcpLogger.debug({ agentRole: updateData.agentRole }, 'Agent role set from template');

      // BC19 FIX: Flag that inputContext.mcpConfiguration.role needs updating
      // The actual read-modify-write happens inside the transaction below to prevent race conditions
      updateData._needsInputContextRoleMerge = true;
    }
  }

  // Validate status transition if status is being changed. The PIPELINE 4-point invariant
  // and the APPROVAL dep-guard now run INSIDE the transaction below via the shared fns
  // (complete-task-terminally.ts) — this handler's ~120-line invariant clone was deleted
  // (completion-path unification P1-C2; it had already drifted from the complete-handler
  // copy in error class, F10, and metadata handling — the two-copy drift E1 retires).
  let statusChangingToCompleted = false;
  // F2 (2026-07-25): true when the caller re-sent the status the row already has.
  let statusIsUnchanged = false;
  if (updateData.status) {
    const currentTask = await prisma.task.findUnique({
      where: { id: finalTaskId },
      select: { status: true, type: true }
    });
    if (currentTask && updateData.status !== currentTask.status) {
      validateTaskStatusTransition(currentTask.status, updateData.status);
    }
    statusChangingToCompleted =
      !!currentTask && updateData.status === 'COMPLETED' && currentTask.status !== 'COMPLETED';
    statusIsUnchanged = !!currentTask && updateData.status === currentTask.status;

    // TD5 (P1-C2): a dependency rewrite combined with COMPLETED in ONE call on an APPROVAL
    // task is an unaudited guard-bypass shape (dependencyIds: [] strips the edges the guard
    // reads). Reject the combo — sequence the two updates, or use task.complete's audited
    // dependencyOverrideReason for genuine manual recovery.
    if (
      statusChangingToCompleted &&
      currentTask?.type === 'APPROVAL' &&
      dependencyIds && Array.isArray(dependencyIds)
    ) {
      throw new Error(
        `Cannot rewrite dependencyIds and complete an APPROVAL task in the same task.update call. ` +
        `Sequence the two updates, or use task.complete with dependencyOverrideReason for audited manual recovery.`
      );
    }
  }

  // NO_EFFECT check - prevent silent success on empty updates
  // dependencyIds is handled separately in the transaction but still counts as an effective update
  const effectiveFields = Object.keys(updateData).filter(k => k !== 'updatedAt');
  const hasDependencyUpdate = dependencyIds && Array.isArray(dependencyIds);

  if (effectiveFields.length === 0 && !hasDependencyUpdate) {
    throw new Error(
      'NO_EFFECT: No updatable fields provided. ' +
      'To update a task, specify at least one field: ' +
      'title, description, priority, status, dueDate, assigneeId, agentTemplateId, or dependencyIds. ' +
      '\n\nExample: { action: "task.update", taskId: "...", status: "COMPLETED" }'
    );
  }

  mcpLogger.info({ taskId: finalTaskId, fieldCount: effectiveFields.length, fields: effectiveFields }, 'Updating task fields');

  // ITEM 1.1 (2026-04-25): capture metadata-merge details for post-tx logging.
  // logFieldChange is fire-and-forget on the global Prisma singleton — calling
  // it INSIDE the tx would persist activity rows even on tx rollback (recording
  // a state change that never committed). Capture inside the tx, return it as
  // part of the tx result, then iterate logFieldChange calls AFTER the tx
  // commits. Returning from the tx (vs a closure-captured `let`) keeps
  // TypeScript narrowing well-behaved.
  // See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
  type MergedMetadataLog = {
    keys: string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };

  // Phase 2 (2026-04-26): captured stage-back-pointer write for post-tx
  // fire-and-forget logging into stage_activities. Same closure-return
  // pattern as mergedMetadataLog above, for the same reason — must not
  // write activity rows from inside a tx that may roll back.
  type StageBackPointerLog = {
    stageId: string;
    before: unknown;
    after: string;
  };

  // Cycle guard for dependency edges (May 2026 — closes the MCP gap surfaced
  // when auditing UI plans against the 6-month-ago crash class). Mirrors the
  // REST endpoint pattern: check each new dep BEFORE the tx against current
  // state. Same race trade-off as REST — accepted by sec-ops + api-efficiency
  // reviews of the canonical graph.ts.
  if (dependencyIds && Array.isArray(dependencyIds) && dependencyIds.length > 0) {
    for (const dependsOnId of dependencyIds) {
      try {
        const { hasCycle, depth } = await checkDependencyCycle(finalTaskId, dependsOnId);
        if (hasCycle) {
          throw new Error(
            `Circular dependency detected: adding ${dependsOnId} as a dependency of ${finalTaskId} would create a cycle.`
          );
        }
        if (depth >= GraphLimits.MAX_DEPTH) {
          throw new Error(
            `Dependency chain too deep (max depth: ${GraphLimits.MAX_DEPTH}). Cannot add ${dependsOnId} as a dependency of ${finalTaskId}.`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message.includes('exceeds limit') || message.includes('too complex')) {
          throw new Error(`Dependency graph too complex: ${message}`);
        }
        throw err;
      }
    }
  }

  // Verdict-mismatch guard (2026-07-14): when SYNTHESIZE stamps metadata.qualityGate on a PIPELINE
  // task, deterministically reconcile the stamped outcome against the reviewer child's transcribed
  // terminal verdict (result.json.reviewerVerdict). FLAG-only — annotates the pending merge with
  // verdictMismatch, never overrides. Read-only queries, kept OUTSIDE the tx; the guard never throws.
  // See cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/.
  const pendingMergeForGuard = (updateData as any)._pendingMetadataMerge as Record<string, unknown> | undefined;
  if (pendingMergeForGuard && typeof pendingMergeForGuard === 'object' && pendingMergeForGuard.qualityGate) {
    const taskForGuard = await prisma.task.findUnique({
      where: { id: finalTaskId },
      select: { type: true, metadata: true },
    });
    await annotateQualityGateVerdictMismatch(
      prisma,
      finalTaskId,
      taskForGuard?.type,
      taskForGuard?.metadata as Record<string, unknown> | null,
      pendingMergeForGuard,
      mcpLogger,
    );
  }

  // BC19 FIX: Transaction-wrapped update with diff computation (RepeatableRead for atomic read-modify-write)
  // TS4 / BC19 (2026-06-08): the RepeatableRead isolation is the lost-update guard (concurrent writer aborts
  // 40001, never silent-clobbers) — a plain $transaction would NOT suffice. See transaction-atomicity-pattern.md.
  const { task, diff, mergedMetadataLog, stageBackPointerLog, approvalDepRemovalLog, completionTx } = await withSerializationRetry(() => prisma.$transaction(async (tx) => {
    let mergedMetadataLog: MergedMetadataLog | null = null;
    let stageBackPointerLog: StageBackPointerLog | null = null;
    let approvalDepRemovalLog: { removedDepIds: string[]; priorDepIds: string[] } | null = null;
    // BC19 FIX: If agent template was assigned, atomically read-modify-write inputContext
    if (updateData._needsInputContextRoleMerge) {
      delete updateData._needsInputContextRoleMerge;
      const existingTask = await tx.task.findUnique({
        where: { id: finalTaskId },
        select: { inputContext: true }
      });

      if (existingTask?.inputContext) {
        const inputContext = existingTask.inputContext as any;
        updateData.inputContext = {
          ...inputContext,
          mcpConfiguration: {
            ...inputContext.mcpConfiguration,
            role: updateData.agentRole
          }
        };
        mcpLogger.debug({ taskId: finalTaskId }, 'Updated inputContext.mcpConfiguration.role');
      }
    }

    // Atomic read-modify-write for metadata — shallow merge so callers can
    // add keys without clobbering existing ones. The Pipeline Harness
    // protocol relies on this to record metadata.pipelineStageId without
    // destroying modelParameters/loadProtocols/etc. set by the template.
    if ((updateData as any)._pendingMetadataMerge !== undefined) {
      const incomingMetadata = (updateData as any)._pendingMetadataMerge as Record<string, unknown>;
      delete (updateData as any)._pendingMetadataMerge;

      // AR11 (P1-C2 follow-up): the completedWithDependencyOverride audit fact is writable
      // ONLY by the guard path — strip a forged inbound copy at this adapter boundary too
      // (bulk + POV-PUT already strip; a client-writable audit fact is a spoofable claim).
      // NOTE (platform-run-keys panel 2026-08-19): audit facts are stripped here, but
      // dropPlatformRunKeys is deliberately NOT called on this surface — the harness writes
      // qualityGate/pipelineStageId/etc THROUGH this path (mutation-pinned in
      // scripts/test-platform-run-keys.ts P4). Adding it here breaks every pipeline.
      stripAuditFacts(incomingMetadata, (f, m) => mcpLogger.warn({ ...f, taskId: finalTaskId }, m));

      // ITEM 3a.1: extend select to also fetch type for the back-pointer gate.
      const existingTask = await tx.task.findUnique({
        where: { id: finalTaskId },
        select: { metadata: true, type: true }
      });
      const existingMetadata = (existingTask?.metadata as Record<string, unknown> | null) || {};

      // WS2 Phase A (2026-08-17, D3.2): the protocol stamp is platform-written. THIS is the
      // surface the threat model names (the harness holds MCP task.update) — a differing/novel
      // inbound `protocol`/`protocolResolvedAt` throws PROTOCOL_STAMP_IMMUTABLE (clean 400 to
      // the caller: a fact an LLM can act on, never a silent strip it reasons past); an equal
      // echo is dropped and the merge preserves the stored value. One guard here covers BOTH
      // channels (top-level `metadata` and nested `updates.metadata`) because both flow through
      // `_pendingMetadataMerge` into this single merge site.
      enforceProtocolStampImmutable(incomingMetadata, existingMetadata, finalTaskId, {
        surface: 'mcp-task-update',
        onViolation: 'throw',
      });

      updateData.metadata = {
        ...existingMetadata,
        ...incomingMetadata,
      };
      mcpLogger.debug(
        { taskId: finalTaskId, mergedKeys: Object.keys(incomingMetadata) },
        'Merged metadata keys into existing task.metadata'
      );

      // ITEM 1.1: capture merge details for post-tx logging.
      mergedMetadataLog = {
        keys: Object.keys(incomingMetadata),
        before: existingMetadata,
        after: updateData.metadata as Record<string, unknown>,
      };

      // ITEM 3a.1 (2026-04-25): server-side back-pointer write — when a
      // PIPELINE harness records its metadata.pipelineStageId via task.update,
      // also write the back-pointer into the referenced stage's metadata.
      // Closes the silent-corruption clobber-detection gap.
      // Forward-only: legacy stages pre-deploy don't have this back-pointer
      // and produce a soft-warn at completion (not a hard fail).
      // See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
      if (existingTask?.type === 'PIPELINE') {
        const newPipelineStageId =
          typeof incomingMetadata.pipelineStageId === 'string'
            ? incomingMetadata.pipelineStageId
            : null;
        if (newPipelineStageId) {
          // Defensive shallow-merge (NOT whole-replace) — aligns with Item 2's
          // philosophy and future-proofs against stage-create-handler ever
          // setting default metadata keys at create time. We bypass the
          // updateStage service (which provides shallow-merge at the service
          // layer) because we need to be in the SAME tx as the task.metadata
          // merge for atomicity. ~1 extra PK buffer hit on a stage row created
          // seconds ago — cost negligible (verified prod EXPLAIN 2026-04-25).
          // Pattern: transaction-atomicity-pattern.md "Read-Then-Write Race Protection".
          const stageBeforeBackPointer = await tx.stage.findUnique({
            where: { id: newPipelineStageId },
            select: { metadata: true },
          });
          const existingStageMeta =
            (stageBeforeBackPointer?.metadata as Record<string, unknown> | null) || {};
          const mergedStageMeta = {
            ...existingStageMeta,
            harnessTaskId: finalTaskId,
          };

          await tx.stage.update({
            where: { id: newPipelineStageId },
            data: {
              metadata: JSON.parse(JSON.stringify(mergedStageMeta)) as Prisma.InputJsonValue,
            },
          });
          mcpLogger.info(
            { taskId: finalTaskId, pipelineStageId: newPipelineStageId },
            'PIPELINE harness: wrote stages.metadata.harnessTaskId back-pointer'
          );

          // Phase 2 (2026-04-26): capture for post-tx stage_activities log.
          // The harnessTaskId field is the forensic anchor that tells us who
          // owns the stage. If a future investigation shows a clobber, the
          // entry written here lets us reconstruct exactly when, by whom, and
          // from what prior value.
          stageBackPointerLog = {
            stageId: newPipelineStageId,
            before: existingStageMeta.harnessTaskId ?? null,
            after: finalTaskId,
          };
        }
      }
    }

    // P2 wave 5 (3.7): the terminal transition COMPOSES Layer 1 inside this handler's own tx
    // (the panel's own-tx adapter shape — Prisma cannot nest $transaction). Order is the
    // load-bearing part: NON-status updates (incl. the metadata merge above) are written FIRST
    // by the ordinary update below, THEN runTaskCompletionTx re-reads FRESH — so the guards and
    // the PIPELINE invariant see the REAL post-merge metadata (the old _pendingMetadataMerge
    // simulation is fully dissolved; no effectiveMetadataOverride needed). The status field is
    // pulled from the ordinary write — the core owns the ONLY terminal write (CAS).
    // TD5 decision (ruled at 3.7): the pre-tx dep-rewrite+COMPLETED combo REJECT stays — the
    // dep-rewrite block still runs AFTER the completion write, so post-mutation edge evaluation
    // would require reordering atomic effects for a case the reject already closes auditablely.
    // F2 (2026-07-25) adds the second disjunct: an UNCHANGED status is dropped from the ordinary
    // write too. taskCompletedAtExtension stamps completedAt=now on ANY payload containing
    // status:'COMPLETED' and cannot see the prior status (it runs at the write), so a task.update
    // that re-sent COMPLETED on an already-COMPLETED row silently moved the completion timestamp.
    // Note this case does NOT reach the core (statusChangingToCompleted is false — no transition),
    // which is exactly why it needed its own guard. 'status' stays in effectiveFields either way,
    // so the activity diff is unaffected: before and after are equal, so it yields no entry.
    if (statusChangingToCompleted || statusIsUnchanged) {
      delete updateData.status;
    }

    // Optimized SELECT - only fetch fields we're updating.
    // Skip the beforeTask query entirely when there are no real fields to diff
    // (e.g., a dependencies-only or metadata-only update).
    // Also filter out internal "_" flags like _needsInputContextRoleMerge and
    // _pendingMetadataMerge — they're transaction-control signals, not valid
    // Prisma Task columns, so Prisma rejects them in a select clause.
    const diffableFields = effectiveFields.filter(f => !f.startsWith('_'));
    const selectFields = diffableFields.reduce((acc, field) => {
      acc[field] = true;
      return acc;
    }, {} as Record<string, boolean>);

    const beforeTask = diffableFields.length > 0
      ? await tx.task.findUnique({
          where: { id: finalTaskId },
          select: selectFields,
        })
      : null;

    // Perform update (non-status fields; when delegating, status was pulled above)
    const richInclude = {
      assignee: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true } },  // For rich activity logging
      pov: { select: { id: true, title: true } },
      agentTemplate: { select: { id: true, name: true, category: true } }
    };
    let task = await tx.task.update({
      where: { id: finalTaskId },
      data: updateData,
      include: richInclude,
    });

    // P2 wave 5: the terminal write itself — Layer 1 in THIS tx (fresh read sees the merged
    // metadata just written; CAS gated on the validated status; typed guard errors abort the
    // whole tx, rolling the non-status fields back with it — atomic as before).
    let completionTx: { transitioned: boolean; taskType: string } | null = null;
    if (statusChangingToCompleted) {
      const completionResult = await runTaskCompletionTx(tx, {
        taskId: finalTaskId,
        actor: { userId: user.userId, source: 'MCP' },
        include: richInclude,
      });
      completionTx = { transitioned: completionResult.transitioned, taskType: completionResult.taskType };
      if (completionResult.transitioned && completionResult.task) {
        task = completionResult.task as typeof task;
      }
    }

    // Wire/replace dependencies if provided (atomic with task update)
    // Validate dependency IDs exist before FK creation (same pattern as task-create-handler)
    //
    // 🔒 WHY CONCURRENT REWRITES ARE SAFE — and the ONE change that would break it (2026-07-26).
    //
    // This is a read-modify-write: read prior deps -> deleteMany ALL -> findMany to validate the
    // new ids -> createMany. F3 (2026-07-25) made it atomic by putting it in this tx at
    // RepeatableRead, which closes the check-then-use gap between the findMany and the createMany.
    //
    // But RepeatableRead only raises 40001 on a WRITE-WRITE conflict over the SAME ROWS, and two
    // concurrent rewrites need not contend on any dependency row: if the task has no dependencies
    // yet (or the two writers' sets are disjoint), both deleteMany calls match NOTHING, so there is
    // no shared row to conflict on and both createMany calls would succeed — leaving the UNION of
    // two writers' intents, a graph neither asked for.
    //
    // That does not happen, for a reason that lives OUTSIDE this branch: `tx.task.update()` below
    // is UNCONDITIONAL — every task.update writes the parent `tasks` row (Task carries @updatedAt,
    // so the row is written even when only dependencies changed). Two concurrent task.update txs
    // therefore contend on THAT row; the loser gets 40001 and withSerializationRetry (wrapping this
    // whole tx) retries it against a fresh snapshot, re-reading prior deps and applying its full
    // intent. The dependency rewrite is serialised by the parent-row write, not by the dep rows.
    //
    // ⚠️ THE REGRESSION TO AVOID: "optimise task.update to skip the tasks-row write when only
    // dependencyIds changed." That is a plausible-looking performance tweak, it breaks nothing
    // visible, and it silently reopens the union hazard above. If you ever need that optimisation,
    // take an explicit lock first (SELECT id FROM tasks WHERE id = ... FOR UPDATE) so the rewrites
    // still serialise. Pinned by test-task-dependencies.ts ("F3 concurrency mechanism").
    if (dependencyIds && Array.isArray(dependencyIds)) {
      // TD5 corollary (P1-C2): dependency REMOVAL from an APPROVAL gate is an audit-relevant
      // event (the edges are what the completion guard enforces). CAPTURE the before-set
      // in-tx; the warn + activity fact are emitted POST-tx (retry-purity: no side effects
      // inside a withSerializationRetry wrap — the mergedMetadataLog pattern).
      const priorDeps = await tx.taskDependency.findMany({
        where: { taskId: finalTaskId },
        select: { dependsOnId: true },
      });
      const priorDepIds = priorDeps.map((d) => d.dependsOnId);
      const removedDepIds = priorDepIds.filter((id) => !dependencyIds.includes(id));
      if (removedDepIds.length > 0) {
        const depTask = await tx.task.findUnique({
          where: { id: finalTaskId },
          select: { type: true },
        });
        if (depTask?.type === 'APPROVAL') {
          approvalDepRemovalLog = { removedDepIds, priorDepIds };
        }
      }
      // Delete existing dependencies and create new ones
      await tx.taskDependency.deleteMany({ where: { taskId: finalTaskId } });
      if (dependencyIds.length > 0) {
        const existingTasks = await tx.task.findMany({
          where: { id: { in: dependencyIds } },
          select: { id: true },
        });
        const existingIds = new Set(existingTasks.map(t => t.id));
        const validDepIds = dependencyIds.filter((id: string) => existingIds.has(id));
        const invalidDepIds = dependencyIds.filter((id: string) => !existingIds.has(id));

        if (invalidDepIds.length > 0) {
          mcpLogger.warn(
            { taskId: finalTaskId, invalidDepIds, validCount: validDepIds.length },
            'Skipped non-existent dependency IDs during update'
          );
        }

        if (validDepIds.length > 0) {
          await tx.taskDependency.createMany({
            data: validDepIds.map((depId: string) => ({
              taskId: finalTaskId,
              dependsOnId: depId,
            })),
          });
        }
      }
      mcpLogger.info({ taskId: finalTaskId, dependencyCount: dependencyIds.length }, 'Task dependencies updated atomically');
    }

    // Compute diff with error handling. Use diffableFields (not effectiveFields)
    // so internal "_" transaction-control flags aren't reported as spurious diffs.
    let diff: Array<{ field: string; from: any; to: any }> = [];
    try {
      diff = computeTaskDiff(beforeTask, task, diffableFields);
    } catch (diffError) {
      mcpLogger.warn({ err: diffError, taskId: finalTaskId }, 'Diff computation failed');
      // Continue without diff - don't fail the operation
    }

    return { task, diff, mergedMetadataLog, stageBackPointerLog, approvalDepRemovalLog, completionTx };
  }, {
    timeout: 5000,  // 5s timeout for safety
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead  // BC19 FIX: Upgraded for atomic read-modify-write
  }), 'task-update-handler:handleTaskUpdate');

  mcpLogger.debug({ taskId: finalTaskId, changeCount: diff.length }, 'Transaction completed');

  // ITEM 1.2 (2026-04-25): post-tx fire-and-forget per-key activity logging.
  // Must run AFTER the tx commits — see comment on `mergedMetadataLog`
  // declaration above. logFieldChange uses the global Prisma singleton, NOT
  // tx, so writes happen on a separate connection. If we called this INSIDE
  // the tx, a tx rollback would leave the activity rows recording a state
  // that never committed.
  // Per fire-and-forget-activity-logging-pattern.md.
  if (mergedMetadataLog) {
    const mergeMetadata: ActivityMetadata = { source: 'MCP' };
    for (const key of mergedMetadataLog.keys) {
      logFieldChange(
        finalTaskId,
        user.userId,
        {
          name: `metadata.${key}`,
          oldValue: mergedMetadataLog.before[key] ?? null,
          newValue: mergedMetadataLog.after[key],
          action: TaskActivityAction.UPDATED,
        },
        mergeMetadata
      );
    }
  }

  // TD5 corollary (P1-C2): POST-tx emission of the APPROVAL dep-removal audit fact captured
  // in-tx above (retry-purity — same pattern as mergedMetadataLog).
  if (approvalDepRemovalLog) {
    mcpLogger.warn(
      { taskId: finalTaskId, ...approvalDepRemovalLog, newDepIds: dependencyIds, userId: user.userId },
      'APPROVAL task dependency edges REMOVED via task.update (guard-relevant — audited fact)'
    );
    import('@/lib/tasks/services/taskActivityService').then(({ createTaskActivity }) =>
      createTaskActivity({
        taskId: finalTaskId,
        userId: user.userId,
        action: `Dependency edges removed from APPROVAL task: ${approvalDepRemovalLog!.removedDepIds.join(', ')}`,
      })
    ).catch(() => {});
  }

  // P2 wave 5 (3.7): the shared post-commit completion tail, invoked AFTER this handler's own
  // commit (the own-tx adapter shape — the tx boundary is the transaction, not a list position).
  // FLIP A (2026-07-24): fireReactors is now TRUE — task.update completions fire the cascade
  // like task.complete. This also emits the canonical logTaskCompleted fact
  // (matrix #11) — the diff loop below skips STATUS_CHANGED on delegated completions so the
  // completion is recorded exactly once.
  // D2 (Steve, 2026-07-24): povStatusSuggestion further below stays THIS adapter's presentation
  // — deliberately NO cross-path parity.
  if (completionTx?.transitioned) {
    await fireCompletionEffects(prisma, {
      taskId: finalTaskId,
      actor: { userId: user.userId, source: 'MCP' },
      fireReactors: true, // FLIP A (2026-07-24): task.update completions fire the cascade
    }, completionTx);
  }

  // FIX-A (2026-07-18, reactor-cascade audit): consume an agent-stamped metadata.cannotRun at
  // its write path. The F16 machinery fires only on the CanNeverRunError chokepoint, so a leg
  // that bails in its own pre-flight (run 9) and stamps cannotRun here stayed non-terminal
  // forever — the stamp was a fact with no consumer. Fire the same idempotent cone-marking +
  // program-retrigger effector, post-commit, fire-and-forget (Pattern #46 reactor shape).
  // Invariant (ratified 2026-07-18): non-terminal = waiting-for-a-human, always.
  // Scope (PH5): PIPELINE tasks only — matches where the terminal-persist non-terminal family
  // lives. The AUTHORITATIVE fix for an in-loop stamp is the PRE_FLIGHT_BAIL branch inside
  // runTerminalSuccessTx (same-tx, race-free); this hook is the belt for AT-REST stamps (a task
  // whose execution already persisted — e.g. terminalizing an existing frozen specimen).
  if (
    task?.type === 'PIPELINE' &&
    mergedMetadataLog?.keys.includes('cannotRun') &&
    (mergedMetadataLog.before['cannotRun'] === null || mergedMetadataLog.before['cannotRun'] === undefined)
  ) {
    import('@/lib/services/task-can-never-run-persist')
      .then(({ handleAgentStampedCannotRun }) =>
        handleAgentStampedCannotRun(
          finalTaskId,
          typeof mergedMetadataLog.after['cannotRun'] === 'string'
            ? (mergedMetadataLog.after['cannotRun'] as string)
            : JSON.stringify(mergedMetadataLog.after['cannotRun'] ?? ''),
          user.userId
        ).catch((err: unknown) => {
          mcpLogger.warn({ err, taskId: finalTaskId }, 'agent-stamped cannotRun persist failed (non-fatal)');
        })
      )
      .catch(() => {});
  }

  // Gap (e) family, task.update door (2026-07-18, born-ready review td-A3): a
  // dependency rewrite or template attach can leave this task born-ready (all
  // deps already satisfied) with NO future event to queue it — the
  // dep-completion reactor fires only on FUTURE completions, and this handler
  // previously fired no ready-reactor at all. Fire the same idempotent
  // create/assign reactor post-commit, fire-and-forget; every guard (OPEN,
  // template, PIPELINE-with-deps skip, claimed-guard, existing-execution,
  // fail-closed satisfaction SQL) lives inside it. Call-site PIPELINE skip
  // mirrors agent-assign L1 (auto-queue races explicit agent.execute on
  // harness tasks). A status→OPEN reopen deliberately does NOT fire this
  // (outside the reviewed gap-(e) family — revisit only if a reopened task
  // demonstrably strands).
  // executionStatus=FAILED guard (2026-07-18 delta review, event-system): an F16
  // frozen-cone member ends at exactly OPEN+FAILED — a dep rewrite with satisfied
  // new deps must NOT silently un-terminalize a task the cone escalated to a human
  // (non-terminal = waiting-for-a-human works both directions: re-enabling is an
  // explicit human act, agent.execute, never a side effect of rewiring). The
  // reactor's own FAILED tolerance is ratified ONLY for the template re-assign
  // path — this call site is the one that must refuse.
  if (
    (hasDependencyUpdate || updateData.agentTemplateId !== undefined) &&
    task?.executionStatus !== 'FAILED'
  ) {
    if (task?.type !== 'PIPELINE') {
      import('@/lib/services/taskReadyReactorService')
        .then(({ maybeQueueIfDepFree }) => maybeQueueIfDepFree(finalTaskId).catch(() => {}))
        .catch(() => {});
    } else {
      mcpLogger.info(
        { taskId: finalTaskId, taskType: task.type },
        'Skipped maybeQueueIfDepFree for harness task on update (expected)'
      );
    }
  }

  // Phase 2 stage_activities (2026-04-26): forensic anchor for the
  // harnessTaskId back-pointer write. Per-stage history of who claimed
  // ownership lets clobber-detection investigations reconstruct the
  // ordering of competing harness writes.
  if (stageBackPointerLog) {
    logStageFieldChange(
      stageBackPointerLog.stageId,
      user.userId,
      {
        name: 'metadata.harnessTaskId',
        oldValue: stageBackPointerLog.before,
        newValue: stageBackPointerLog.after,
        action: TaskActivityAction.UPDATED,
      },
      { source: 'MCP' }
    );
  }

  // Enhanced activity message using diff (clearer, more accurate)
  let activityAction = 'updated task';

  if (diff.length > 0) {
    // Create human-readable change description
    const changes = diff.map(d => {
      if (d.field === 'priority') {
        const labels: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
        return `priority: ${labels[String(d.from)] || d.from} → ${labels[String(d.to)] || d.to}`;
      } else if (d.field === 'status') {
        const labels: Record<string, string> = {
          OPEN: 'Open',
          IN_PROGRESS: 'In Progress',
          COMPLETED: 'Completed',
          BLOCKED: 'Blocked'
        };
        return `status: ${labels[String(d.from)] || d.from} → ${labels[String(d.to)] || d.to}`;
      } else if (d.field === 'dueDate') {
        const fromDate = d.from instanceof Date ? d.from.toLocaleDateString() : d.from;
        const toDate = d.to instanceof Date ? d.to.toLocaleDateString() : d.to;
        return `due date: ${fromDate} → ${toDate}`;
      } else {
        return `${d.field}: ${d.from} → ${d.to}`;
      }
    }).join(', ');

    activityAction = `updated task (${changes})`;
  }

  mcpLogger.debug({ taskId: finalTaskId, activityAction }, 'Activity description computed');

  // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
  // Fire-and-forget pattern - logs structured details for each field change
  const mcpMetadata: ActivityMetadata = { source: 'MCP' };

  // Map field names to activity action types
  const fieldActionMap: Record<string, typeof TaskActivityAction[keyof typeof TaskActivityAction]> = {
    status: TaskActivityAction.STATUS_CHANGED,
    priority: TaskActivityAction.PRIORITY_CHANGED,
    dueDate: TaskActivityAction.DUE_DATE_CHANGED,
    assigneeId: TaskActivityAction.ASSIGNED,
    phaseId: TaskActivityAction.PHASE_CHANGED,
    stageId: TaskActivityAction.STAGE_CHANGED,
  };

  // Log each field change with rich details
  for (const change of diff) {
    // P2 wave 5 (3.7): on a delegated completion the core's tail emits the canonical
    // TASK_COMPLETED fact — skip the STATUS_CHANGED diff row (double-emission guard).
    if (change.field === 'status' && completionTx?.transitioned) {
      continue;
    }
    if (change.field === 'assigneeId' && task.assignee) {
      // Special handling for assignee changes
      logTaskAssignment(
        task.id,
        user.userId,
        { id: task.assignee.id, name: task.assignee.name },
        change.from ? { id: String(change.from), name: String(change.from) } : null,
        mcpMetadata
      );
    } else if (change.field === 'stageId' && task.stage) {
      // Special handling for stage changes (Kanban moves)
      // The task object includes the new stage after update
      logStageChange(
        task.id,
        user.userId,
        {
          oldStageId: change.from ? String(change.from) : undefined,
          oldStageName: undefined, // Would need extra query for old stage name
          newStageId: task.stage.id,
          newStageName: task.stage.name,
        },
        mcpMetadata
      );
    } else if (change.field === 'phaseId' && task.phase) {
      // Special handling for phase changes
      logPhaseChange(
        task.id,
        user.userId,
        {
          oldPhaseId: change.from ? String(change.from) : undefined,
          oldPhaseName: undefined, // Would need extra query for old phase name
          newPhaseId: task.phase.id,
          newPhaseName: task.phase.name,
        },
        mcpMetadata
      );
    } else {
      // Generic field change logging
      const actionType = fieldActionMap[change.field] || TaskActivityAction.UPDATED;
      logFieldChange(
        task.id,
        user.userId,
        {
          name: change.field,
          oldValue: change.from,
          newValue: change.to,
          action: actionType,
        },
        mcpMetadata
      );
    }
  }

  // If no specific field changes detected but update happened, log generic update
  if (diff.length === 0 && effectiveFields.length > 0) {
    logFieldChange(
      task.id,
      user.userId,
      {
        name: effectiveFields.join(', '),
        oldValue: null,
        newValue: null,
        action: TaskActivityAction.UPDATED,
      },
      mcpMetadata
    );
  }

  mcpLogger.debug({ taskId: finalTaskId, changeCount: diff.length }, 'Rich activity logged')

  // Smart POV Status Suggestion (Phase A: UX Enhancement)
  // Suggest status change when first task completed and POV still PROJECTED
  let povStatusSuggestion = undefined;

  const statusChanged = diff.some(d => d.field === 'status' && d.to === 'COMPLETED');
  if (statusChanged && taskForAuth.pov.status === 'PROJECTED') {
    mcpLogger.info({ povId: taskForAuth.pov.id, suggestion: 'IN_PROGRESS' }, 'POV status suggestion triggered');
    povStatusSuggestion = {
      current: 'PROJECTED',
      suggested: 'IN_PROGRESS',
      reason: 'Work has commenced - task completed',
      tip: `💡 Consider updating POV status: The POV is marked as PROJECTED, but work has started. Update to IN_PROGRESS to reflect active work.`,
      action: `Use web UI to update POV status, or wait for pov.update action support`
    };
  }

  // Enhanced response with diff (mcp-integration recommendation)
  return {
    actionId,
    action: 'task.update',
    status: 'completed',
    result: {
      task,
      message: diff.length > 0
        ? `Task updated successfully. Changes: ${diff.map(d => `${d.field}: ${d.from} → ${d.to}`).join(', ')}`
        : 'Task updated successfully via MCP',
      changes: diff.length > 0 ? diff : undefined,  // NEW: Structured diff array
      effectiveFields: effectiveFields,  // NEW: Which fields were updated
      povStatusSuggestion: povStatusSuggestion  // NEW: Smart POV status suggestions
    }
  };
}
