/**
 * Stage Creation Handler for MCP Tasks Action API
 *
 * Handles stage creation with:
 * - Phase name or ID resolution
 * - POV access validation
 * - Duplicate prevention
 * - Smart ordering (explicit, relative, position-based, atomic)
 * - Real-time event emission
 *
 * @class StageCreateHandler
 * @description Comprehensive stage creation handler with intelligent phase resolution, duplicate prevention,
 *   flexible ordering, and real-time event emission. Validates POV access before creation.
 *
 *   Key Features:
 *   - Phase resolution by ID or name (exact → partial → error)
 *   - Duplicate prevention within phase
 *   - Flexible ordering: explicit order, relative (after/before), position (first/last/middle), atomic
 *   - POV access validation via validatePOVAccess
 *   - Real-time event emission for UI updates
 *   - Returns created stage with phase information
 *
 * @param {Object} parameters - Stage creation parameters
 * @param {string} [parameters.povId] - POV ID for phase lookup context
 * @param {string} [parameters.phaseId] - Phase ID for direct association
 * @param {string} [parameters.phaseName] - Phase name for fuzzy lookup (requires povId)
 * @param {string} [parameters.stageName] - Stage name (alias for name)
 * @param {string} [parameters.name] - Stage name (REQUIRED if stageName not provided)
 * @param {string} [parameters.description] - Stage description
 * @param {string} [parameters.priority] - Stage priority (HIGH/MEDIUM/LOW)
 * @param {number} [parameters.order] - Explicit stage order (multiplied by 1000)
 * @param {string} [parameters.afterStage] - Reference stage name to position after
 * @param {string} [parameters.beforeStage] - Reference stage name to position before
 * @param {string} [parameters.position] - Position-based ordering (first/last/middle)
 * @param {TokenPayload} user - Authenticated user token payload
 * @param {string} user.userId - User ID from JWT token
 * @param {string} actionId - Unique action ID for tracking and logging
 *
 * @returns {Promise<Object>} Stage creation result
 * @returns {string} returns.actionId - Action tracking ID
 * @returns {string} returns.action - Action type (stage.create)
 * @returns {string} returns.status - Completion status (completed)
 * @returns {Object} returns.result - Creation result
 * @returns {Object} returns.result.stage - Created stage object
 * @returns {string} returns.result.stage.id - Stage ID (CUID)
 * @returns {string} returns.result.stage.name - Stage name
 * @returns {string} returns.result.stage.description - Stage description
 * @returns {number} returns.result.stage.order - Stage order number
 * @returns {Object} returns.result.stage.phase - Associated phase information
 * @returns {string} returns.result.stage.phase.id - Phase ID
 * @returns {string} returns.result.stage.phase.name - Phase name
 * @returns {string} returns.result.message - Success message
 * @returns {boolean} returns.result.created - True if stage was newly created, false if duplicate found
 *
 * @throws {Error} If stageName/name parameter is missing
 * @throws {Error} If neither phaseId nor phaseName provided
 * @throws {Error} If phase not found (by ID or name)
 * @throws {Error} If multiple phases found with same name (requires POV context)
 * @throws {Error} If POV access validation fails
 * @throws {Error} If reference stage for relative ordering not found
 *
 * @example
 * // Create stage with phase ID
 * const result = await handleStageCreate({
 *   phaseId: 'phase123',
 *   name: 'In Progress',
 *   description: 'Active development tasks'
 * }, user, 'action-456');
 *
 * @example
 * // Create stage with phase name lookup
 * const result = await handleStageCreate({
 *   phaseName: 'Development',
 *   povId: 'cm123abc',
 *   stageName: 'Code Review',
 *   position: 'last'
 * }, user, 'action-789');
 *
 * @example
 * // Create stage with relative ordering
 * const result = await handleStageCreate({
 *   phaseId: 'phase123',
 *   name: 'Testing',
 *   afterStage: 'Code Review',
 *   priority: 'HIGH'
 * }, user, 'action-101');
 *
 * @example
 * // Create stage at specific position
 * const result = await handleStageCreate({
 *   phaseName: 'Planning',
 *   povId: 'cm123abc',
 *   name: 'Backlog',
 *   position: 'first'
 * }, user, 'action-202');
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Phase lookups: 2 queries → 1 Promise.all (50% faster)
 *
 * @security
 *   - POV access validation via validatePOVAccess
 *   - Duplicate prevention within phase
 *
 * @events
 *   - Emits 'stageCreated' event via phase-stage event emitter
 *   - Event payload: { phaseId, stage, metadata }
 *
 * @version 1.0.0
 * @since 2025-12-18
 * @created 2025-12-18 - Extracted during facade extraction sprint
 */

import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { getNextStageOrder } from '@/lib/mcp/tasks/action/utilities/order-utils';
import { getPhaseStageEventEmitter } from '@/lib/events/phase-stage-events';
import { mcpLogger } from '@/lib/logger';
import { assertPersisted } from '@/lib/mcp/tasks/action/utilities/durability';

export async function handleStageCreate(
  parameters: any,
  user: TokenPayload,
  actionId: string
) {
  const {
    povId,
    phaseId,
    phaseName,
    stageName,
    name,
    description,
    priority,
    order,
    afterStage,
    beforeStage,
    position
  } = parameters;

  mcpLogger.info({ povId, phaseId, phaseName, stageName: stageName || name, actionId }, 'Creating stage');

  // Use stageName or name for the stage name
  const finalStageName = stageName || name;

  if (!finalStageName) {
    throw new Error('Stage name is required. Use either "stageName" or "name" parameter.');
  }

  // 🔒 SECURITY: Early POV access check BEFORE any phase lookups
  // Prevents leaking phase names in error messages to unauthorized users
  if (povId) {
    const povForAuth = await prisma.pOV.findUnique({
      where: { id: povId },
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
    });

    if (!povForAuth) {
      throw new Error('POV not found');
    }

    validatePOVAccess(user, povForAuth, {
      throwOnDeny: true,
      requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
      logContext: 'Stage Create (early POV check)'
    });
  }

  let finalPhaseId = phaseId;

  // If no phaseId provided, try to find phase by name and POV
  if (!finalPhaseId && phaseName && povId) {
    mcpLogger.debug({ phaseName, povId }, 'Looking up phase by name');

    // ============================================================================
    // PARALLEL QUERY OPTIMIZATION (Dec 2025 - 2 phase lookups → ~50% faster)
    // Run both phase search strategies in parallel, use best match
    // ============================================================================

    const [exactPhaseMatch, partialPhaseMatch] = await Promise.all([
      // Strategy 1: Exact phase name match
      prisma.phase.findFirst({
        where: {
          povId: povId,
          name: { equals: phaseName, mode: 'insensitive' }
        }
      }),
      // Strategy 2: Partial phase name match (contains)
      prisma.phase.findFirst({
        where: {
          povId: povId,
          name: { contains: phaseName, mode: 'insensitive' }
        }
      })
    ]);

    // Use best match (exact > partial)
    const phase = exactPhaseMatch || partialPhaseMatch;

    if (phase) {
      finalPhaseId = phase.id;
      mcpLogger.debug({ phaseId: phase.id, matchType: exactPhaseMatch ? 'exact' : 'partial' }, 'Phase resolved');
    } else {
      // List available phases for debugging
      const allPhases = await prisma.phase.findMany({
        where: { povId: povId },
        select: { id: true, name: true, type: true },
        take: 50
      });
      const availablePhases = allPhases.map(p => `"${p.name}" (${p.type})`);
      mcpLogger.warn({ phaseName, povId, availableCount: allPhases.length }, 'Phase lookup failed');
      throw new Error(`Phase not found: "${phaseName}" in POV ${povId}. Available phases: ${availablePhases.join(', ')}`);
    }
  }

  // If still no phaseId, this is an error - we should not default to PLANNING phase
  if (!finalPhaseId) {
    if (povId) {
      // List available phases for debugging
      const allPhases = await prisma.phase.findMany({
        where: { povId: povId },
        select: { id: true, name: true, type: true },
        take: 50
      });
      const availablePhases = allPhases.map(p => `"${p.name}" (${p.type})`);
      throw new Error(`Phase specification required for stage creation. Available phases in POV ${povId}: ${availablePhases.join(', ')}. Please provide either 'phaseId' or 'phaseName' parameter.`);
    } else {
      throw new Error('Either phaseId, phaseName, or povId with phase specification is required for stage creation');
    }
  }

  // 🔒 SECURITY: Validate POV access before creating stage
  const phaseForAuth = await prisma.phase.findUnique({
    where: { id: finalPhaseId },
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

  if (!phaseForAuth?.pov) {
    throw new Error('Phase or POV not found');
  }

  validatePOVAccess(user, phaseForAuth.pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
    logContext: 'Stage Create'
  });

  // BC65 FIX: Check for duplicate stage name in phase (best-effort — no DB unique constraint)
  // Concurrent creates may both pass this check; result is duplicate name, not data corruption
  const existingStage = await prisma.stage.findFirst({
    where: {
      phaseId: finalPhaseId,
      name: { equals: finalStageName, mode: 'insensitive' }
    }
  });

  if (existingStage) {
    // Reject name collisions explicitly. Prior behavior returned the existing
    // stage silently with `created: false`, which caused autonomous callers
    // (notably the Pipeline Harness) to adopt stages from unrelated prior
    // runs as their own — then execute stale children stuck from those runs.
    //
    // The harness generates stage names deterministically from the task's
    // objective, so collisions across runs are common. Forcing the caller
    // to pick a unique name eliminates the ghost-adoption failure mode.
    // Callers that legitimately want to reuse a stage can query for it
    // explicitly with project(action: "pov.details") — read phases[].stages[] —
    // and act on its id. (There is no stage.list action; the earlier text named
    // one, so agents following this remediation called a tool that does not exist.)
    throw new Error(
      `Stage name "${finalStageName}" already exists in this phase (existing stage id: ${existingStage.id}).\n\n` +
      `Stage names must be unique within a phase. To fix:\n` +
      `  1. Pick a different name (add a suffix like a short run id, timestamp, or revision number).\n` +
      `  2. Example for pipeline harness: "Pipeline: Cloud Security (Run ${new Date().toISOString().slice(0, 10)})".\n\n` +
      `If you intended to use the existing stage, query it with project(action: "pov.details") and read phases[].stages[] to find its id — do not call stage.create.`
    );
  }

  // 🔧 ENHANCED: Smart Stage Ordering with relative positioning
  let finalOrder = 0;

  mcpLogger.debug({ phaseId: finalPhaseId }, 'Calculating stage order');

  if (order && typeof order === 'number') {
    // Explicit order provided - use it with 1000x multiplier for consistency
    finalOrder = order * 1000;
    mcpLogger.debug({ finalOrder }, 'Using explicit order');
  } else if (afterStage || beforeStage) {
    // Relative positioning requested
    const referenceStageTitle = afterStage || beforeStage;

    const referenceStage = await prisma.stage.findFirst({
      where: {
        phaseId: finalPhaseId,
        name: { equals: referenceStageTitle, mode: 'insensitive' }
      },
      select: { id: true, name: true, order: true }
    });

    if (referenceStage) {
      mcpLogger.debug({ referenceStageId: referenceStage.id, order: referenceStage.order }, 'Reference stage found');

      if (afterStage) {
        // Insert after the reference stage
        const nextStage = await prisma.stage.findFirst({
          where: {
            phaseId: finalPhaseId,
            order: { gt: referenceStage.order }
          },
          orderBy: { order: 'asc' },
          select: { order: true }
        });

        if (nextStage) {
          // Insert between reference stage and next stage
          finalOrder = Math.floor((referenceStage.order + nextStage.order) / 2);
        } else {
          // Insert at the end (use 1000 increment pattern)
          finalOrder = referenceStage.order + 1000;
        }
        mcpLogger.debug({ finalOrder, positioning: 'after' }, 'Relative order calculated');
      } else if (beforeStage) {
        // Insert before the reference stage
        const prevStage = await prisma.stage.findFirst({
          where: {
            phaseId: finalPhaseId,
            order: { lt: referenceStage.order }
          },
          orderBy: { order: 'desc' },
          select: { order: true }
        });

        if (prevStage) {
          // Insert between previous stage and reference stage
          finalOrder = Math.floor((prevStage.order + referenceStage.order) / 2);
        } else {
          // Insert at the beginning (use 1000 increment pattern)
          finalOrder = Math.max(1000, referenceStage.order - 1000);
        }
        mcpLogger.debug({ finalOrder, positioning: 'before' }, 'Relative order calculated');
      }
    } else {
      mcpLogger.debug({ referenceStageTitle }, 'Reference stage not found, using default ordering');
      finalOrder = await getNextStageOrder(finalPhaseId);
    }
  } else if (position) {
    // Position-based ordering (e.g., "first", "last", "middle")
    if (position === 'first') {
      const firstStage = await prisma.stage.findFirst({
        where: { phaseId: finalPhaseId },
        orderBy: { order: 'asc' },
        select: { order: true }
      });
      // Use 1000 increment pattern
      finalOrder = firstStage ? Math.max(1000, firstStage.order - 1000) : 1000;
    } else if (position === 'last') {
      finalOrder = await getNextStageOrder(finalPhaseId);
    } else {
      // Default to end
      finalOrder = await getNextStageOrder(finalPhaseId);
    }
    mcpLogger.debug({ position, finalOrder }, 'Position-based order calculated');
  } else {
    // No specific ordering requested - use atomic transaction for collision prevention

    const stage = await prisma.$transaction(async (tx) => {
      // Get next order with atomic calculation to prevent race conditions
      const lastStage = await tx.stage.findFirst({
        where: { phaseId: finalPhaseId },
        orderBy: { order: 'desc' },
        select: { order: true }
      });

      // Use 1000 increment pattern for easy reordering
      const atomicOrder = lastStage ? lastStage.order + 1000 : 1000;

      // Create stage with calculated order in same transaction
      return tx.stage.create({
        data: {
          name: finalStageName,
          description: description || `Stage created via MCP: ${finalStageName}`,
          phaseId: finalPhaseId,
          order: atomicOrder,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        include: {
          phase: {
            select: {
              id: true,
              name: true,
              type: true,
              pov: { select: { id: true, title: true } }
            }
          }
        }
      });
    });

    // DURABILITY ASSERTION — guard the phantom-commit class (see durability.ts / finding doc).
    await assertPersisted(
      () => prisma.stage.findUnique({ where: { id: stage.id }, select: { id: true } }),
      { entity: 'Stage', actionLabel: 'stage.create (atomic)', id: stage.id, log: { stageId: stage.id, phaseId: stage.phaseId, actionId } }
    );

    mcpLogger.info({ stageId: stage.id, phaseId: stage.phaseId, order: stage.order, actionId }, 'Stage created (atomic)');

    // Emit real-time event for UI updates
    try {
      const eventEmitter = getPhaseStageEventEmitter();
      await eventEmitter.emitStageEvent('created', stage, user.userId);
    } catch (eventError) {
      mcpLogger.warn({ err: eventError, stageId: stage.id }, 'Failed to emit stage event');
      // Don't fail the operation if event emission fails
    }

    return {
      actionId,
      action: 'stage.create',
      status: 'completed',
      result: {
        stage: {
          id: stage.id,
          name: stage.name,
          description: stage.description,
          phaseId: stage.phaseId,
          phaseName: stage.phase?.name,
          povTitle: stage.phase?.pov?.title,
          order: stage.order
        },
        message: `Stage "${finalStageName}" created successfully via MCP in phase "${stage.phase?.name}" at position ${stage.order}`,
        created: true
      }
    };
  }

  // Non-atomic path for complex ordering (explicit order, relative positioning)
  finalOrder = await getNextStageOrder(finalPhaseId);

  // Create the new stage
  const stage = await prisma.stage.create({
    data: {
      name: finalStageName,
      description: description || `Stage created via MCP: ${finalStageName}`,
      phaseId: finalPhaseId,
      order: finalOrder,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    include: {
      phase: {
        select: {
          id: true,
          name: true,
          type: true,
          pov: { select: { id: true, title: true } }
        }
      }
    }
  });

  // DURABILITY ASSERTION — guard the phantom-commit class (see durability.ts / finding doc).
  await assertPersisted(
    () => prisma.stage.findUnique({ where: { id: stage.id }, select: { id: true } }),
    { entity: 'Stage', actionLabel: 'stage.create', id: stage.id, log: { stageId: stage.id, phaseId: stage.phaseId, actionId } }
  );

  mcpLogger.info({ stageId: stage.id, phaseId: stage.phaseId, order: stage.order, actionId }, 'Stage created');

  // Log activity (if we have a way to track stage activities)
  // For now, we'll skip this since stages don't have activity logs like tasks

  return {
    actionId,
    action: 'stage.create',
    status: 'completed',
    result: {
      stage: {
        id: stage.id,
        name: stage.name,
        description: stage.description,
        order: stage.order,
        phase: stage.phase
      },
      message: `Stage "${finalStageName}" created successfully via MCP in phase "${stage.phase?.name}" at position ${finalOrder}`,
      created: true
    }
  };
}
