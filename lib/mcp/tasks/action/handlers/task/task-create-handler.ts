/**
 * Task Creation Handler for MCP Tasks Action API
 *
 * Handles comprehensive task creation with:
 * - POV team structure auto-inheritance
 * - Smart phase/stage resolution
 * - Duplicate prevention (within stage and across POV)
 * - Intelligent ordering (explicit, relative, position-based)
 * - Activity logging
 *
 * @class TaskCreateHandler
 * @description Comprehensive task creation handler that auto-inherits POV team structure,
 *   intelligently resolves phases and stages, prevents duplicates, and manages task ordering.
 *
 *   Key Features:
 *   - Auto-inherits teamId and assigneeId from POV when not provided
 *   - Smart phase resolution: Planning phase → First phase → Error
 *   - Comprehensive stage resolution via resolveStageForTask utility
 *   - Duplicate detection within stage and across POV
 *   - Flexible ordering: explicit order, relative (after/before), position (first/last/middle)
 *   - POV access validation via validatePOVAccess
 *   - Activity logging with fallback to POV owner for MCP users
 *
 * @param {Object} parameters - Task creation parameters
 * @param {string} parameters.title - Task title (REQUIRED)
 * @param {string} parameters.povId - POV ID for task association (REQUIRED - prevents orphaned tasks)
 * @param {string} [parameters.description] - Task description
 * @param {string} [parameters.assigneeId] - User ID to assign task to (auto-inherited from POV owner if not provided)
 * @param {string} [parameters.teamId] - Team ID (auto-inherited from POV team if not provided)
 * @param {string} [parameters.phaseId] - Phase ID for task association (resolved if not provided)
 * @param {string} [parameters.phaseName] - Phase name for lookup (used if phaseId not provided)
 * @param {string} [parameters.stageId] - Stage ID (direct stage association)
 * @param {string} [parameters.stageName] - Stage name for lookup (used for stage resolution)
 * @param {string} [parameters.priority] - Task priority (HIGH/MEDIUM/LOW, defaults to MEDIUM)
 * @param {string} [parameters.type] - Task type (defaults to ACTION)
 * @param {string} [parameters.dueDate] - Due date in ISO format
 * @param {number} [parameters.order] - Explicit task order (multiplied by 1000)
 * @param {string} [parameters.afterTask] - Reference task title to position after
 * @param {string} [parameters.beforeTask] - Reference task title to position before
 * @param {string} [parameters.position] - Position-based ordering (first/last/middle)
 * @param {string} [parameters.parentTask] - Parent task ID for hierarchical tasks
 * @param {TokenPayload} user - Authenticated user token payload
 * @param {string} user.userId - User ID from JWT token
 * @param {string} actionId - Unique action ID for tracking and logging
 *
 * @returns {Promise<Object>} Task creation result
 * @returns {string} returns.actionId - Action tracking ID
 * @returns {string} returns.action - Action type (task.create)
 * @returns {string} returns.status - Completion status (completed)
 * @returns {Object} returns.result - Creation result
 * @returns {Object} returns.result.task - Created task object with relations
 * @returns {string} returns.result.task.id - Task ID (CUID)
 * @returns {string} returns.result.task.title - Task title
 * @returns {string} returns.result.task.description - Task description
 * @returns {string} returns.result.task.priority - Task priority
 * @returns {string} returns.result.task.status - Task status (OPEN)
 * @returns {number} returns.result.task.order - Task order number
 * @returns {Object} returns.result.task.stage - Associated stage information
 * @returns {Object} returns.result.task.phase - Associated phase information
 * @returns {Object} returns.result.task.pov - Associated POV information
 * @returns {Object} returns.result.task.assignee - Assigned user information (if assigned)
 * @returns {Object} returns.result.task.team - Associated team information (if assigned)
 * @returns {string} returns.result.message - Success message
 * @returns {boolean} returns.result.created - True if task was newly created, false if duplicate found
 *
 * @throws {Error} If title parameter is missing
 * @throws {Error} If povId parameter is missing (prevents orphaned tasks)
 * @throws {Error} If POV access validation fails (via validatePOVAccess)
 * @throws {Error} If stage resolution fails (no valid stage found)
 * @throws {Error} If phase resolution fails (no valid phase found)
 * @throws {Error} If reference task for relative ordering is not found
 *
 * @example
 * // Create task with minimal parameters (auto-inherits from POV)
 * const result = await handleTaskCreate({
 *   title: 'Setup Infrastructure',
 *   povId: 'cm123abc'
 * }, user, 'action-456');
 * // Result: Task created in Planning phase (if exists), assigned to POV owner
 *
 * @example
 * // Create task with explicit phase and stage
 * const result = await handleTaskCreate({
 *   title: 'Implementation Task',
 *   description: 'Complete the feature implementation',
 *   povId: 'cm123abc',
 *   phaseName: 'Development',
 *   stageName: 'In Progress',
 *   priority: 'HIGH',
 *   assigneeId: 'user789',
 *   dueDate: '2025-12-31T23:59:59Z'
 * }, user, 'action-789');
 *
 * @example
 * // Create task with relative ordering
 * const result = await handleTaskCreate({
 *   title: 'Follow-up Task',
 *   povId: 'cm123abc',
 *   stageName: 'Backlog',
 *   afterTask: 'Setup Infrastructure',
 *   priority: 'MEDIUM'
 * }, user, 'action-101');
 *
 * @example
 * // Create task at specific position
 * const result = await handleTaskCreate({
 *   title: 'Urgent Fix',
 *   povId: 'cm123abc',
 *   stageName: 'In Progress',
 *   position: 'first',
 *   priority: 'HIGH'
 * }, user, 'action-202');
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Phase lookups: 2 queries → 1 Promise.all (50% faster)
 *   - Duplicate checks: 2 queries → 1 Promise.all (50% faster)
 *
 * @security
 *   - POV access validation via validatePOVAccess
 *   - Prevents orphaned tasks (povId required)
 *   - Activity logging with user validation
 *
 * @version 1.0.0
 * @since 2025-12-18
 * @created 2025-12-18 - Extracted during facade extraction sprint
 */

import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { getNextTaskOrder } from '@/lib/mcp/tasks/action/utilities/order-utils';
import { resolveStageForTask } from '@/lib/mcp/tasks/action/utilities/stage-resolver';
import { assertPersisted } from '@/lib/mcp/tasks/action/utilities/durability';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { logTaskCreated } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
import { checkDependencyCycle, GraphLimits } from '@/lib/utils/graph';

export async function handleTaskCreate(
  parameters: any,
  user: TokenPayload,
  actionId: string
) {
  const {
    title, description, assigneeId, teamId, povId, phaseId, phaseName, priority, status, type, dueDate, stageId, stageName, parentTask,
    order, afterTask, beforeTask, position, dependencyIds, interfaceContract
  } = parameters;

  // 🔒 BUG-005 defence-in-depth, alias map REMOVED 2026-07-25.
  //
  // The local PRIORITY_ALIASES table was a SECOND copy of the alias mapping. It existed because
  // normalization used to be transport-dependent — which is exactly the drift that let task.update
  // 400 on an alias task.create accepted. Aliases are now normalized once, at the router boundary
  // (tasks-action-router.ts, applySemanticMapping before safeParse), and this handler has exactly
  // ONE caller: that router. So by the time we get here the value is already canonical, and a
  // second table could only ever diverge from the first.
  //
  // The VALIDITY check stays: it is cheap, and it fails loudly if the value reaching the handler
  // is ever NOT canonical — which is precisely the signal that the chokepoint was bypassed. The
  // error deliberately points at the normalizer rather than re-listing aliases, so a reader is
  // sent to the single source instead of being tempted to re-add a local map.
  const VALID_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;

  let finalPriority: TaskPriority = TaskPriority.MEDIUM;
  if (priority) {
    const upperPriority = String(priority).toUpperCase();
    if (VALID_PRIORITIES.includes(upperPriority as typeof VALID_PRIORITIES[number])) {
      finalPriority = upperPriority as TaskPriority;
    } else {
      throw new Error(
        `Invalid priority: "${priority}".\n\n` +
        `Valid values: ${VALID_PRIORITIES.join(', ')}\n\n` +
        `Aliases (URGENT/CRITICAL/NORMAL/MINOR/TRIVIAL) are normalized at the MCP router boundary ` +
        `before this handler runs — reaching this error with an alias means that normalization was ` +
        `bypassed (see parameter-normalizer-discovery.md, enum-alias section).\n\n` +
        `Example: { priority: "HIGH" }`
      );
    }
  }

  // 🔧 BUG-002 FIX: Validate and normalize status enum (was hardcoded to OPEN)
  const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'] as const;
  const STATUS_ALIASES: Record<string, string> = {
    'TODO': 'OPEN',
    'PENDING': 'IN_PROGRESS',
    'DOING': 'IN_PROGRESS',
    'WORKING': 'IN_PROGRESS',
    'DONE': 'COMPLETED',
    'FINISHED': 'COMPLETED',
    'CLOSED': 'COMPLETED'
  };

  let finalStatus: TaskStatus = TaskStatus.OPEN;
  if (status) {
    const upperStatus = String(status).toUpperCase();
    if (STATUS_ALIASES[upperStatus]) {
      finalStatus = STATUS_ALIASES[upperStatus] as TaskStatus;
      mcpLogger.info({ from: status, to: finalStatus }, 'Normalized status alias');
    } else if (VALID_STATUSES.includes(upperStatus as typeof VALID_STATUSES[number])) {
      finalStatus = upperStatus as TaskStatus;
    } else {
      throw new Error(
        `Invalid status: "${status}".\n\n` +
        `Valid values: ${VALID_STATUSES.join(', ')}\n` +
        `Aliases: TODO→OPEN, PENDING→IN_PROGRESS, DONE→COMPLETED\n\n` +
        `Example: { status: "IN_PROGRESS" }`
      );
    }
  }

  // Completion-path unification P1-C2 (MT3): a PIPELINE task created already-COMPLETED
  // bypasses the 4-point anti-fabrication invariant entirely — creation is invisible to a
  // transition guard. Reject at the source. D1 (Steve, 2026-07-24): born-COMPLETED for OTHER
  // types stays accepted-and-documented (legit backfill of already-done work; nothing depends
  // on a task at birth, and later dep-rewrites fire maybeQueueIfDepFree).
  if (finalStatus === 'COMPLETED' && type === 'PIPELINE') {
    throw new Error(
      `PIPELINE tasks cannot be created already COMPLETED (anti-fabrication invariant). ` +
      `Create the harness task OPEN/IN_PROGRESS and let it complete through the pipeline lifecycle.`
    );
  }

  // CRITICAL FIX: Strict validation to prevent orphaned tasks
  if (!title) {
    mcpLogger.warn({ povId, actionId }, 'Task create missing title');
    throw new Error('Title is required for task creation. Please provide a title parameter.');
  }

  if (!povId) {
    mcpLogger.error({ title, actionId }, 'Missing povId — would create orphaned task');
    throw new Error('povId is required for task creation. Tasks must be associated with a POV. Please provide the povId parameter.');
  }

  mcpLogger.info({ title, povId, phaseId, stageId, actionId }, 'Creating task');

  // 🔧 JAN MARSHAL'S FIX: Auto-inherit POV team structure
  let finalTeamId = teamId;
  let finalAssigneeId = assigneeId;
  let povWithTeam = null;

  // If povId is provided, get POV team information
  if (povId) {
    mcpLogger.debug({ povId }, 'Looking up POV team structure');
    povWithTeam = await prisma.pOV.findUnique({
      where: { id: povId },
      select: {
        id: true,
        teamId: true,
        ownerId: true,
        title: true,
        team: {
          select: {
            id: true,
            name: true,
            members: {
              select: {
                userId: true,
                role: true,
                user: {
                  select: { id: true, name: true, email: true }
                }
              }
            }
          }
        }
      }
    });

    if (povWithTeam) {
      mcpLogger.debug({ povId, teamId: povWithTeam.teamId, memberCount: povWithTeam.team?.members?.length || 0 }, 'Found POV team structure');

      // Auto-inherit team from POV if not explicitly provided
      if (!finalTeamId && povWithTeam.teamId) {
        finalTeamId = povWithTeam.teamId;
        mcpLogger.debug({ teamId: finalTeamId }, 'Auto-inherited team from POV');
      }

      // Smart assignee assignment if not provided
      if (!finalAssigneeId) {
        // Option 1: Assign to POV owner
        if (povWithTeam.ownerId) {
          finalAssigneeId = povWithTeam.ownerId;
          mcpLogger.debug({ assigneeId: finalAssigneeId }, 'Auto-assigned to POV owner');
        }
        // Option 2: Could assign to team lead or first team member
        // For now, POV owner is the most logical choice
      }
    } else {
      mcpLogger.warn({ povId }, 'POV not found');
    }
  }

  // 🔒 SECURITY: Validate POV access if creating task in a POV
  if (povWithTeam) {
    validatePOVAccess(user, povWithTeam, {
      throwOnDeny: true,
      requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
      logContext: 'Task Create'
    });
  }

  // 🔧 FIX: Smart Phase and Stage Association
  let finalPhaseId = phaseId;
  let finalStageId = null;

  // If povId is provided but no phaseId, try to find the appropriate phase
  if (povId && !finalPhaseId) {
    mcpLogger.debug({ povId }, 'No phaseId provided, resolving phase');

    // ============================================================================
    // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 2 phase lookups → ~50% faster)
    // Run both phase search strategies in parallel, use best match
    // ============================================================================

    const [planningPhase, firstPhase] = await Promise.all([
      // Strategy 1: Look for planning phase (most common for MCP task creation)
      prisma.phase.findFirst({
        where: {
          povId: povId,
          type: 'PLANNING'
        },
        orderBy: { order: 'asc' }
      }),
      // Strategy 2: Get first available phase (fallback)
      prisma.phase.findFirst({
        where: { povId: povId },
        orderBy: { order: 'asc' }
      })
    ]);

    // Use best match (planning > first)
    finalPhaseId = planningPhase?.id || firstPhase?.id;

    if (planningPhase) {
      mcpLogger.debug({ phaseId: planningPhase.id }, 'Resolved to planning phase');
    } else if (firstPhase) {
      mcpLogger.debug({ phaseId: firstPhase.id }, 'Resolved to first available phase');
    }
  }

  // 🔧 PHASE 2: Comprehensive Stage Resolution with All Methods
  if (finalPhaseId || povId) {
    mcpLogger.debug({ phaseId: finalPhaseId, povId }, 'Starting stage resolution');

    // task #92 (2026-04-16): track whether the caller explicitly supplied a
    // phaseId so we can refuse a silent override below. Distinguish from the
    // case where finalPhaseId was auto-resolved (lines 290-322) — that's
    // legitimate, the caller didn't ask for a specific phase.
    const callerSuppliedPhaseId = !!phaseId;

    try {
      const resolvedStage = await resolveStageForTask({
        stageId: stageId, // Direct stage ID if provided
        stageName: stageName, // Stage name for lookup
        phaseId: finalPhaseId,
        phaseName: phaseName,
        povId: povId,
        title: title // For auto-creation context
      });

      // task #92 invariant: if caller supplied phaseId, the resolved stage
      // MUST live in that phase. Refuse silent cross-phase relocation —
      // that's the bug task #92 fixes (the bug Steve hit during the
      // 2026-04-16 smoke test where his Assessment-and-Validation phaseId
      // got overridden to Planning-and-Design). Helper-side fix
      // (stage-resolver.ts Priority 5.5) catches this earlier; this
      // assertion is defense in depth in case of future helper regressions.
      if (callerSuppliedPhaseId && resolvedStage.phaseId !== phaseId) {
        mcpLogger.error({
          callerPhaseId: phaseId,
          resolvedPhaseId: resolvedStage.phaseId,
          stageId: resolvedStage.stageId,
        }, 'Stage resolution returned a phase different from caller-supplied phaseId — refusing silent override');
        throw new Error(
          `Stage resolution returned phase "${resolvedStage.phaseId}" but caller supplied phaseId "${phaseId}". ` +
          `Refusing to silently relocate task across phase boundaries. ` +
          `Provide a stageId or stageName in the supplied phase, or omit phaseId to allow auto-resolution.`
        );
      }

      finalStageId = resolvedStage.stageId;
      finalPhaseId = resolvedStage.phaseId;

      mcpLogger.debug({ stageId: finalStageId, phaseId: finalPhaseId }, 'Stage resolution completed');
    } catch (stageError: unknown) {
      // CRITICAL FIX: Don't allow task creation without proper stage association
      const errorMessage = stageError instanceof Error ? stageError.message : String(stageError);
      mcpLogger.error({ err: stageError, povId, phaseId: finalPhaseId }, 'Stage resolution failed');
      throw new Error(`Cannot create task: Stage resolution failed. ${errorMessage}. Please provide valid stageId, stageName, or ensure the POV has at least one stage.`);
    }
  }

  // CRITICAL FIX: Validate that we have required associations before creating task
  if (!finalStageId) {
    mcpLogger.error({ povId, phaseId, stageId, actionId }, 'No stageId resolved — cannot create orphaned task');
    throw new Error('Cannot create task without a stage association. Please provide stageId, stageName, or ensure the POV has stages created. Use project(action: "pov.details") to see available stages.');
  }

  if (!finalPhaseId) {
    mcpLogger.error({ povId, actionId }, 'No phaseId resolved — cannot create orphaned task');
    throw new Error('Cannot create task without a phase association. Please provide phaseId or phaseName.');
  }

  // 🔧 FIX: Smart Task Ordering using the same pattern as reorder endpoint
  let finalOrder = 0;

  if (finalStageId) {
    mcpLogger.debug({ stageId: finalStageId }, 'Calculating task order');

    if (order && typeof order === 'number') {
      // Explicit order provided - use it with 1000x multiplier
      finalOrder = order * 1000;
      mcpLogger.debug({ order: finalOrder }, 'Using explicit order');
    } else if (afterTask || beforeTask) {
      // Relative positioning requested
      const referenceTaskTitle = afterTask || beforeTask;
      mcpLogger.debug({ referenceTaskTitle }, 'Looking for reference task');

      const referenceTask = await prisma.task.findFirst({
        where: {
          stageId: finalStageId,
          title: { equals: referenceTaskTitle, mode: 'insensitive' }
        },
        select: { id: true, title: true, order: true }
      });

      if (referenceTask) {
        mcpLogger.debug({ refTaskId: referenceTask.id, refOrder: referenceTask.order }, 'Found reference task');

        if (afterTask) {
          // Insert after the reference task
          const nextTask = await prisma.task.findFirst({
            where: {
              stageId: finalStageId,
              order: { gt: referenceTask.order }
            },
            orderBy: { order: 'asc' },
            select: { order: true }
          });

          if (nextTask) {
            // Insert between reference task and next task
            finalOrder = Math.floor((referenceTask.order + nextTask.order) / 2);
          } else {
            // Insert at the end
            finalOrder = referenceTask.order + 1000;
          }
          mcpLogger.debug({ order: finalOrder }, 'Positioned after reference task');
        } else if (beforeTask) {
          // Insert before the reference task
          const prevTask = await prisma.task.findFirst({
            where: {
              stageId: finalStageId,
              order: { lt: referenceTask.order }
            },
            orderBy: { order: 'desc' },
            select: { order: true }
          });

          if (prevTask) {
            // Insert between previous task and reference task
            finalOrder = Math.floor((prevTask.order + referenceTask.order) / 2);
          } else {
            // Insert at the beginning
            finalOrder = Math.max(1000, referenceTask.order - 1000);
          }
          mcpLogger.debug({ order: finalOrder }, 'Positioned before reference task');
        }
      } else {
        mcpLogger.debug({ referenceTaskTitle }, 'Reference task not found, using default ordering');
        finalOrder = await getNextTaskOrder(finalStageId);
      }
    } else if (position) {
      // Position-based ordering (e.g., "first", "last", "middle")
      if (position === 'first') {
        const firstTask = await prisma.task.findFirst({
          where: { stageId: finalStageId },
          orderBy: { order: 'asc' },
          select: { order: true }
        });
        finalOrder = firstTask ? Math.max(1000, firstTask.order - 1000) : 1000;
      } else if (position === 'last') {
        finalOrder = await getNextTaskOrder(finalStageId);
      } else {
        // Default to end
        finalOrder = await getNextTaskOrder(finalStageId);
      }
      mcpLogger.debug({ position, order: finalOrder }, 'Using position-based order');
    } else {
      // No specific ordering requested - append to end
      finalOrder = await getNextTaskOrder(finalStageId);
      mcpLogger.debug({ order: finalOrder }, 'Using default order (append to end)');
    }
  }

  mcpLogger.debug({ povId, phaseId: finalPhaseId, stageId: finalStageId, order: finalOrder }, 'Resolved final IDs for task creation');

  // 🔧 FIX: Duplicate Prevention - Check for existing tasks with same title
  if (finalStageId && povId) {
    mcpLogger.debug({ title, stageId: finalStageId, povId }, 'Checking for duplicate tasks');

    // ============================================================================
    // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 2 duplicate checks → ~50% faster)
    // Run both existence checks in parallel for faster validation
    // ============================================================================

    const [existingInStage, existingInPOV] = await Promise.all([
      // Check 1: Within same stage
      prisma.task.findFirst({
        where: {
          stageId: finalStageId,
          title: { equals: title, mode: 'insensitive' }
        },
        include: {
          stage: {
            include: { phase: true }
          }
        }
      }),
      // Check 2: Across entire POV for data integrity
      prisma.task.findFirst({
        where: {
          stage: {
            phase: {
              povId: povId
            }
          },
          title: { equals: title, mode: 'insensitive' }
        },
        include: {
          stage: {
            include: { phase: true }
          }
        }
      })
    ]);

    // Handle results with priority: stage check first
    if (existingInStage) {
      mcpLogger.info({ existingTaskId: existingInStage.id, stageId: finalStageId }, 'Duplicate task found in same stage');
      return {
        actionId,
        action: 'task.create',
        status: 'completed',
        result: {
          task: {
            id: existingInStage.id,
            title: existingInStage.title,
            description: existingInStage.description,
            priority: existingInStage.priority,
            status: existingInStage.status,
            order: existingInStage.order,
            stage: existingInStage.stage ? {
              id: existingInStage.stage.id,
              name: existingInStage.stage.name
            } : null,
            phase: existingInStage.stage?.phase ? {
              id: existingInStage.stage.phase.id,
              name: existingInStage.stage.phase.name
            } : null,
            pov: povWithTeam ? {
              id: povWithTeam.id,
              title: povWithTeam.title
            } : null,
            assignee: null,
            team: null
          },
          message: `Task "${title}" already exists in stage "${existingInStage.stage?.name || 'Unknown Stage'}"`,
          created: false
        }
      };
    }

    // Cross-stage collision is NOT a reason to reject creation. Different
    // pipelines in different stages can legitimately have identically-named
    // tasks (e.g., each pipeline has its own "Audit security posture"). The
    // Pipeline Harness relies on this — children in a new child stage may
    // share titles with completed children from prior runs. Prior behavior
    // (return the old task as if it were the new one) caused the harness to
    // inherit ghost children from other pipelines and lose track of its own
    // children.
    //
    // Log a warning for visibility (operators can investigate if the collision
    // was unintentional) but proceed with creation.
    if (existingInPOV && existingInPOV.stageId !== finalStageId) {
      mcpLogger.warn(
        {
          title,
          targetStageId: finalStageId,
          collisionTaskId: existingInPOV.id,
          collisionStageId: existingInPOV.stageId,
          collisionStageName: existingInPOV.stage?.name,
        },
        'Task title collision with existing task in another stage — creating new task anyway (different stages = different work items)'
      );
    }

    mcpLogger.debug({ title }, 'No same-stage duplicate found, proceeding with creation');
  }

  // Depth guard for dependency edges (May 2026). Cycle is structurally
  // impossible on create (the new task ID doesn't exist in the graph yet —
  // nothing can reach it). But if the chain we're joining is already at
  // MAX_DEPTH, our new task pushes it over. Use a placeholder that won't
  // collide with any real task ID; checkDependencyCycle returns hasCycle=false
  // (placeholder unreachable) plus the measured depth.
  if (dependencyIds && Array.isArray(dependencyIds) && dependencyIds.length > 0) {
    const PLACEHOLDER = '__MCP_NEW_TASK_PLACEHOLDER__';
    for (const dependsOnId of dependencyIds) {
      try {
        const { depth } = await checkDependencyCycle(PLACEHOLDER, dependsOnId);
        if (depth >= GraphLimits.MAX_DEPTH) {
          throw new Error(
            `Dependency chain too deep (max depth: ${GraphLimits.MAX_DEPTH}). Cannot create task with dependency on ${dependsOnId}.`
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

  // BC47/BC19 FIX (2026-06-08): a plain $transaction does NOT prevent the duplicate-order race —
  // at READ COMMITTED the max-order findFirst takes no lock, so two concurrent default-appends both
  // read the same max and write the same order (silent — `order` has no unique constraint). Lock the
  // parent stage row with FOR UPDATE (waits, no abort) so appends to the same stage serialize.
  // See BC19 / transaction-atomicity-pattern.md.
  const task = await prisma.$transaction(async (tx) => {
    // Re-calculate order inside transaction if using default append (finalOrder came from getNextTaskOrder outside tx)
    let txOrder = finalOrder;
    if (!afterTask && !beforeTask && !position && !order) {
      // Default append — lock the stage row, THEN recalc the max order inside the tx.
      await tx.$executeRaw`SELECT id FROM stages WHERE id = ${finalStageId} FOR UPDATE`;
      const lastTask = await tx.task.findFirst({
        where: { stageId: finalStageId },
        orderBy: { order: 'desc' },
        select: { order: true }
      });
      txOrder = lastTask ? lastTask.order + 1000 : 1000;
    }

    const created = await tx.task.create({
      data: {
        title,
        description,
        assigneeId: finalAssigneeId,
        teamId: finalTeamId,
        povId,
        phaseId: finalPhaseId,
        stageId: finalStageId,
        order: txOrder,
        priority: finalPriority,
        type: type || 'ACTION',
        status: finalStatus,
        dueDate: dueDate ? new Date(dueDate) : null,
        // CC7 (2026-07-15, program-harness design / boundary B1): the program interface
        // contract rides a STRUCTURED inputContext channel, never prose — atomically
        // written at create so a program child is born with its binding design constants
        // (and flagged so prepare-task-for-execution fails LOUD if the contract is ever
        // lost before execution). Nested-parameters form only (flat top-level is
        // schema-stripped, same as waitForCompletion).
        ...(interfaceContract && typeof interfaceContract === 'object' ? {
          inputContext: { interfaceContract },
          metadata: { requiresInterfaceContract: true },
        } : {}),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
        pov: { select: { id: true, title: true } }
      }
    });

    // Wire dependencies atomically with task creation (transaction-atomicity-pattern)
    // Validate that dependency tasks exist before creating FK references — prevents
    // "Foreign key constraint violated" when harness creates tasks with deps on
    // not-yet-created sibling tasks (race condition in pipeline creation)
    if (dependencyIds && Array.isArray(dependencyIds) && dependencyIds.length > 0) {
      const existingTasks = await tx.task.findMany({
        where: { id: { in: dependencyIds } },
        select: { id: true },
      });
      const existingIds = new Set(existingTasks.map(t => t.id));
      const validDepIds = dependencyIds.filter((id: string) => existingIds.has(id));
      const invalidDepIds = dependencyIds.filter((id: string) => !existingIds.has(id));

      if (invalidDepIds.length > 0) {
        mcpLogger.warn(
          { taskId: created.id, invalidDepIds, validCount: validDepIds.length },
          'Skipped non-existent dependency IDs (tasks not yet created)'
        );
      }

      if (validDepIds.length > 0) {
        await tx.taskDependency.createMany({
          data: validDepIds.map((depId: string) => ({
            taskId: created.id,
            dependsOnId: depId,
          })),
        });
        mcpLogger.info({ taskId: created.id, dependencyCount: validDepIds.length }, 'Task dependencies created atomically');
      }
    }

    return created;
  });

  // DURABILITY ASSERTION — guard the phantom-commit class (resolved $transaction, no durable row).
  // See cline_docs/findings/2026-06-20-mcp-task-create-false-success.md. (Protocol 10: ship the fact.)
  await assertPersisted(
    () => prisma.task.findUnique({ where: { id: task.id }, select: { id: true } }),
    { entity: 'Task', actionLabel: 'task.create', id: task.id, log: { taskId: task.id, povId: task.povId, stageId: task.stageId, actionId } }
  );

  mcpLogger.info({ taskId: task.id, povId: task.povId, stageId: task.stageId, actionId }, 'Task created successfully');

  // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
  // Fire-and-forget pattern - logs task creation with title in details
  const activityUserId = finalAssigneeId || user.userId;
  const mcpMetadata: ActivityMetadata = { source: 'MCP' };

  logTaskCreated(
    task.id,
    activityUserId,
    task.title,
    mcpMetadata
  );

  mcpLogger.debug({ taskId: task.id }, 'Activity logged for task creation');

  // Fire-and-forget: if the task was created dep-free (or born-ready — all
  // deps already satisfied at create, gap (e) 2026-07-18) AND has an agent
  // template assigned, queue a PENDING execution so the engine picks it up.
  // This kicks off the initial wave for pipelines created by the harness —
  // without it, a correctly-created child with no deps would sit OPEN forever.
  // Idempotency guarded inside the reactor; safe if the task was created
  // with unsatisfied deps (those get handled by maybeQueueReadyDependents
  // when upstream completes) or without a template (skipped). PIPELINE tasks
  // with deps are never auto-queued here (CC6 — dep-completion reactor only).
  // Deliberate asymmetry (DA1, 2026-07-18 delta review): NO call-site PIPELINE
  // skip here, unlike assign/update — a dep-free PIPELINE created WITH a
  // template in one call has no explicit agent.execute in flight to race
  // (the L1 race is assign/update-time), so the create-with-template flow
  // auto-queues it; assign/update call sites skip PIPELINE entirely.
  // @see lib/services/taskReadyReactorService.ts
  const { maybeQueueIfDepFree } = await import('@/lib/services/taskReadyReactorService');
  maybeQueueIfDepFree(task.id).catch(() => {});

  return {
    actionId,
    action: 'task.create',
    status: 'completed',
    result: {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        order: task.order,
        stage: task.stage ? {
          id: task.stage.id,
          name: task.stage.name
        } : null,
        phase: task.phase ? {
          id: task.phase.id,
          name: task.phase.name
        } : null,
        pov: task.pov ? {
          id: task.pov.id,
          title: task.pov.title
        } : null,
        assignee: task.assignee ? {
          id: task.assignee.id,
          name: task.assignee.name,
          email: task.assignee.email
        } : null,
        team: task.team ? {
          id: task.team.id,
          name: task.team.name
        } : null
      },
      message: `Task "${task.title}" created successfully via MCP${task.stage ? ` in stage "${task.stage.name}"` : ''}${task.phase ? ` of phase "${task.phase.name}"` : ''}`,
      created: true
    }
  };
}
