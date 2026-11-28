/**
 * Stage Resolution Utility
 *
 * Comprehensive stage resolution function with multiple fallback strategies.
 * Used for task creation when stage needs to be determined from various inputs.
 *
 * Extracted from: app/api/mcp/tasks/action/route.ts (lines 971-1211)
 *
 * Resolution Priority:
 * 1. Direct stageId
 * CALLER-NAMED PHASE (2026-11-27): when the caller named a phase (phaseId not
 *    marked phaseIsDefault, or phaseName), the stage is found (exact, then
 *    partial) or CREATED inside that phase only; no stageName -> first stage in
 *    it; an unknown phaseName, or a phaseId/phaseName pair that disagree, is
 *    refused. Nothing below runs.
 * 2. stageName in the platform's default phase
 * 4. Auto-detect stageName in POV (with partial match fallback) — no caller phase only
 * 5. Create new stage in the default phase if stageName provided
 * 5.5. **phaseId-only honor (task #92, 2026-04-16)** — if caller supplied
 *      phaseId without stageName/stageId, return the first stage IN THAT PHASE
 *      rather than crossing phase boundaries. Refuse if the supplied phase
 *      has zero stages — fail loud, do not silently relocate.
 *      Rationale: priorities 6/7 below were designed around stageName
 *      disambiguation and ignore phaseId entirely. A caller who supplied
 *      phaseId has expressed intent that must not be silently overridden.
 * 6. Fallback to planning phase stage (only when neither phaseId nor stageName supplied)
 * 7. Create default stage in planning phase (only when neither phaseId nor stageName supplied)
 */

import { prisma } from '@/lib/prisma';
import { mcpLogger } from '@/lib/logger';
import { getNextStageOrder } from './order-utils';

/**
 * Resolves target stage for task creation using multiple fallback strategies
 *
 * @param params - Stage resolution parameters
 * @returns Object with stageId and phaseId
 * @throws Error if stage cannot be resolved
 */
export async function resolveStageForTask(params: {
  stageId?: string;
  stageName?: string;
  phaseId?: string;
  phaseName?: string;
  povId?: string;
  title?: string;
  /** true when phaseId was chosen by the platform (PLANNING/first phase), not named by the caller */
  phaseIsDefault?: boolean;
}): Promise<{ stageId: string; phaseId: string }> {
  const { stageId, stageName, phaseId, phaseName, povId, title, phaseIsDefault } = params;

  mcpLogger.debug({ stageId, stageName, phaseId, phaseName, povId }, 'Stage resolution started');

  // 🔒 BUG-004 FIX: Validate POV exists before attempting stage resolution
  // This provides a clear error instead of confusing "Stage resolution failed"
  if (povId) {
    const povExists = await prisma.pOV.findUnique({
      where: { id: povId },
      select: { id: true, title: true }
    });

    if (!povExists) {
      throw new Error(
        `POV not found: "${povId}".\n\n` +
        `The POV ID may be incorrect or the POV was deleted.\n\n` +
        `💡 Find valid POVs:\n` +
        `• project(action: "pov.list") - See all your POVs\n` +
        `• project(action: "pov.details", pov_name: "Your POV") - Find by name\n\n` +
        `Example POV ID format: cmjgt9iia000nyxn0h02d1c9l`
      );
    }
  }

  // Priority 1: Use direct stageId if provided
  if (stageId) {
    mcpLogger.debug({ stageId }, 'Method 1: direct stageId lookup');
    const stage = await prisma.stage.findUnique({
      where: { id: stageId },
      select: {
        id: true,
        phaseId: true,
        name: true,
        // SECURITY: cross-POV stage write fix (Wave A C3, Phase 3 sec-ops,
        // 2026-05-23). Sibling of task #92 phaseId honor — Priority 1
        // previously trusted caller-supplied stageId without checking
        // ownership. Attacker with access to POV A who knows POV B's stage
        // ID could write tasks into POV B's stage. Now: refuse if the
        // stage's phase belongs to a different POV than the caller's povId.
        phase: { select: { povId: true } }
      }
    });

    if (stage) {
      if (povId && stage.phase?.povId && stage.phase.povId !== povId) {
        mcpLogger.warn({
          stageId,
          stagePovId: stage.phase.povId,
          callerPovId: povId
        }, 'Cross-POV stageId rejected — fail loud, do not silently relocate');
        throw new Error(
          `Stage "${stageId}" belongs to a different POV than the requested POV "${povId}". ` +
          `Refusing to relocate task across POV boundaries. ` +
          `Either supply a stageId from POV "${povId}" or omit stageId to use stageName + phaseId.`
        );
      }
      mcpLogger.debug({ stageId: stage.id, phaseId: stage.phaseId }, 'Direct stage found');
      return { stageId: stage.id, phaseId: stage.phaseId };
    } else {
      mcpLogger.warn({ stageId }, 'Direct stageId not found');
    }
  }

  // 2026-05-23 Round 2 hardening: cross-POV phaseId pre-check helper.
  // Wave A C3 closed cross-POV stageId in Priority 1; sibling probe today
  // (lib/mcp/tasks/action/utilities/stage-resolver Round 2) revealed Priority
  // 2 (stageName + phaseId), Priority 5 (auto-stage create), AND Priority 5.5
  // (phaseId-only honor) ALL silently honor caller-supplied phaseId across POV
  // boundaries when caller also supplies povId. This shared helper enforces
  // the invariant at every phaseId-consuming branch. Loud-reject same as
  // Wave A C3 pattern.
  const assertPhaseInPov = async (pid: string): Promise<void> => {
    if (!povId) return; // No povId supplied → nothing to validate against
    const phaseOwner = await prisma.phase.findUnique({
      where: { id: pid },
      select: { povId: true }
    });
    if (phaseOwner && phaseOwner.povId !== povId) {
      mcpLogger.warn({
        phaseId: pid,
        phasePovId: phaseOwner.povId,
        callerPovId: povId,
      }, 'Cross-POV phaseId rejected — fail loud, do not silently relocate');
      throw new Error(
        `Phase "${pid}" belongs to a different POV than the requested POV "${povId}". ` +
        `Refusing to relocate task across POV boundaries. ` +
        `Either supply a phaseId from POV "${povId}" or omit phaseId to use stageName + auto-detection.`
      );
    }
  };

  // CALLER-NAMED PHASE (2026-11-27, TASK-CREATE-PHASENAME-IGNORED-ON-NEW-STAGE).
  // When the CALLER named a phase (phaseId, or phaseName), every stage lookup
  // and every auto-create happens INSIDE that phase — never a POV-wide search,
  // never the PLANNING fallback. Before this, the handler pre-resolved phaseId to
  // the PLANNING/first phase whenever phaseId was absent and Priority 5 preferred
  // that phaseId over the caller's phaseName, so a NEW stageName was CREATED in the
  // first phase (prod repro 2026-11-26T08:55:34Z); and Priority 4 could REUSE a
  // same-named (or partially matching) stage from another phase. A phaseId chosen
  // by the platform (phaseIsDefault) is not a caller choice and keeps the old
  // auto-detect cascade below.
  let scopedPhaseId: string | undefined;
  if (phaseId && !phaseIsDefault) {
    await assertPhaseInPov(phaseId);
    if (phaseName) {
      const named = await prisma.phase.findUnique({ where: { id: phaseId }, select: { name: true } });
      if (named && named.name.toLowerCase() !== phaseName.toLowerCase()) {
        throw new Error(
          `phaseId "${phaseId}" is phase "${named.name}" but phaseName is "${phaseName}". ` +
          `Refusing to guess which phase the task belongs in — supply one of them, or two that agree.`
        );
      }
    }
    scopedPhaseId = phaseId;
  } else if (phaseName && povId) {
    // Exact, then partial — the same lookup stage.create uses (stage-create-handler.ts).
    const named =
      (await prisma.phase.findFirst({
        where: { povId, name: { equals: phaseName, mode: 'insensitive' } },
        orderBy: { order: 'asc' },
        select: { id: true }
      })) ??
      (await prisma.phase.findFirst({
        where: { povId, name: { contains: phaseName, mode: 'insensitive' } },
        orderBy: { order: 'asc' },
        select: { id: true }
      }));
    if (!named) {
      const phases = await prisma.phase.findMany({ where: { povId }, select: { name: true }, orderBy: { order: 'asc' }, take: 50 });
      throw new Error(
        `Phase "${phaseName}" was not found in POV "${povId}". ` +
        `Phases: ${phases.map(p => `"${p.name}"`).join(', ') || 'None'}. ` +
        `Refusing to place the task in a different phase.`
      );
    }
    scopedPhaseId = named.id;
  }

  if (scopedPhaseId) {
    if (stageName) {
      // Exact, then partial, match — both INSIDE the named phase only.
      const exact = await prisma.stage.findFirst({
        where: { phaseId: scopedPhaseId, name: { equals: stageName, mode: 'insensitive' } },
        select: { id: true, phaseId: true }
      });
      if (exact) return { stageId: exact.id, phaseId: exact.phaseId };
      const partial = await prisma.stage.findFirst({
        where: { phaseId: scopedPhaseId, name: { contains: stageName, mode: 'insensitive' } },
        orderBy: { order: 'asc' },
        select: { id: true, phaseId: true, name: true }
      });
      if (partial) {
        mcpLogger.debug({ stageId: partial.id, matchedName: partial.name }, 'Stage found by partial match in the named phase');
        return { stageId: partial.id, phaseId: partial.phaseId };
      }
      const newStage = await prisma.stage.create({
        data: {
          name: stageName,
          phaseId: scopedPhaseId,
          order: await getNextStageOrder(scopedPhaseId),
          description: `Stage created for task: ${title || 'MCP Task'}`
        }
      });
      mcpLogger.info({ stageId: newStage.id, phaseId: newStage.phaseId, stageName: newStage.name }, 'New stage created in the named phase');
      return { stageId: newStage.id, phaseId: newStage.phaseId };
    }

    // Phase named, no stage named (task #92 phaseId-only honor, now also for phaseName):
    // first stage IN THAT PHASE; refuse if it has none — never cross phases.
    const firstStageInPhase = await prisma.stage.findFirst({
      where: { phaseId: scopedPhaseId },
      orderBy: { order: 'asc' },
      select: { id: true, phaseId: true }
    });
    if (firstStageInPhase) return { stageId: firstStageInPhase.id, phaseId: firstStageInPhase.phaseId };
    throw new Error(
      `Phase "${phaseName ?? scopedPhaseId}" has no stages. Provide a stageId/stageName, ` +
      `or create a stage in this phase first via stage.create. ` +
      `Refusing to silently relocate the task to a different phase.`
    );
  }

  // From here on, no phase came from the caller. phaseId (if any) is the
  // platform's default (PLANNING/first phase) chosen by the handler.

  // Priority 2: stageName in the default phase
  if (stageName && phaseId) {
    mcpLogger.debug({ stageName, phaseId }, 'Method 2: stageName + default phaseId lookup');
    await assertPhaseInPov(phaseId);
    const stage = await prisma.stage.findFirst({
      where: {
        phaseId: phaseId,
        name: { equals: stageName, mode: 'insensitive' }
      },
      select: { id: true, phaseId: true, name: true }
    });

    if (stage) {
      mcpLogger.debug({ stageId: stage.id, phaseId: stage.phaseId }, 'Stage found by name + phaseId');
      return { stageId: stage.id, phaseId: stage.phaseId };
    }
  }

  // Priority 4: Auto-detect - Find stageName in any phase of the POV
  // (only reached when the caller named no phase — see CALLER-NAMED PHASE above)
  if (stageName && povId) {
    mcpLogger.debug({ stageName, povId }, 'Method 4: auto-detect stage in POV');
    const stage = await prisma.stage.findFirst({
      where: {
        phase: {
          povId: povId
        },
        name: { equals: stageName, mode: 'insensitive' }
      },
      include: {
        phase: { select: { id: true, name: true, type: true } }
      }
    });

    if (stage) {
      mcpLogger.debug({ stageId: stage.id, phaseId: stage.phaseId }, 'Stage auto-detected in POV');
      return { stageId: stage.id, phaseId: stage.phaseId };
    } else {
      mcpLogger.debug({ stageName, povId }, 'Exact match not found, trying partial match');

      // Try partial match as fallback
      const partialStage = await prisma.stage.findFirst({
        where: {
          phase: {
            povId: povId
          },
          name: { contains: stageName, mode: 'insensitive' }
        },
        include: {
          phase: { select: { id: true, name: true, type: true } }
        }
      });

      if (partialStage) {
        mcpLogger.debug({ stageId: partialStage.id, phaseId: partialStage.phaseId, matchedName: partialStage.name }, 'Stage found by partial match');
        return { stageId: partialStage.id, phaseId: partialStage.phaseId };
      }
    }
  }

  // Priority 5: Create the new stageName in the default phase
  if (stageName && phaseId) {
    mcpLogger.info({ stageName }, 'Method 5: creating new stage in the default phase');
    await assertPhaseInPov(phaseId);
    const newStage = await prisma.stage.create({
      data: {
        name: stageName,
        phaseId: phaseId,
        order: await getNextStageOrder(phaseId),
        description: `Stage created for task: ${title || 'MCP Task'}`
      }
    });
    mcpLogger.info({ stageId: newStage.id, phaseId: newStage.phaseId, stageName: newStage.name }, 'New stage created');
    return { stageId: newStage.id, phaseId: newStage.phaseId };
  }

  // Priority 5.5: default phase, no stageName — first stage in that phase
  // (unchanged from task #92; refuse if it has none).
  if (phaseId && !stageName) {
    await assertPhaseInPov(phaseId);
    const firstStageInPhase = await prisma.stage.findFirst({
      where: { phaseId },
      orderBy: { order: 'asc' },
      select: { id: true, phaseId: true, name: true }
    });
    if (firstStageInPhase) {
      return { stageId: firstStageInPhase.id, phaseId: firstStageInPhase.phaseId };
    }
    throw new Error(
      `Phase "${phaseId}" has no stages. Provide a stageId/stageName, ` +
      `or create a stage in this phase first via stage.create. ` +
      `Refusing to silently relocate the task to a different phase.`
    );
  }

  // Priority 6: Fallback - First stage in planning phase
  if (povId) {
    mcpLogger.debug({ povId }, 'Method 6: fallback to planning phase stage');
    const planningStage = await prisma.stage.findFirst({
      where: {
        phase: {
          povId: povId,
          type: 'PLANNING'
        }
      },
      orderBy: { order: 'asc' },
      select: { id: true, phaseId: true, name: true }
    });

    if (planningStage) {
      mcpLogger.debug({ stageId: planningStage.id, phaseId: planningStage.phaseId }, 'Using planning phase stage');
      return { stageId: planningStage.id, phaseId: planningStage.phaseId };
    }

    // If no planning phase, use first available stage
    const firstStage = await prisma.stage.findFirst({
      where: {
        phase: {
          povId: povId
        }
      },
      orderBy: { order: 'asc' },
      include: {
        phase: { select: { id: true, name: true, type: true } }
      }
    });

    if (firstStage) {
      mcpLogger.debug({ stageId: firstStage.id, phaseId: firstStage.phaseId }, 'Using first available stage');
      return { stageId: firstStage.id, phaseId: firstStage.phaseId };
    }
  }

  // Priority 7: Create default stage in planning phase if POV exists
  if (povId) {
    mcpLogger.info({ povId }, 'Method 7: creating default stage in planning phase');

    // Find or create planning phase
    let planningPhase = await prisma.phase.findFirst({
      where: {
        povId: povId,
        type: 'PLANNING'
      }
    });

    if (!planningPhase) {
      // Get first phase as fallback
      planningPhase = await prisma.phase.findFirst({
        where: { povId: povId },
        orderBy: { order: 'asc' }
      });
    }

    if (planningPhase) {
      const defaultStage = await prisma.stage.create({
        data: {
          name: stageName || 'Miscellaneous Tasks',
          phaseId: planningPhase.id,
          order: await getNextStageOrder(planningPhase.id),
          description: `Default stage created for task: ${title || 'MCP Task'}`
        }
      });

      mcpLogger.info({ stageId: defaultStage.id, phaseId: defaultStage.phaseId, stageName: defaultStage.name }, 'Default stage created');
      return { stageId: defaultStage.id, phaseId: defaultStage.phaseId };
    }
  }

  // Final error - cannot resolve stage
  const availableStages = povId ? await prisma.stage.findMany({
    where: {
      phase: { povId: povId }
    },
    include: {
      phase: { select: { name: true, type: true } }
    },
    take: 50
  }) : [];

  const stageList = availableStages.map(s => `"${s.name}" (${s.phase.name})`).join(', ');

  throw new Error(
    `Cannot resolve target stage for task creation. ` +
    `Provided: ${JSON.stringify({ stageId, stageName, phaseId, phaseName, povId })}. ` +
    `Available stages: ${stageList || 'None'}. ` +
    `Please provide stageId, stageName, or valid POV with stages.`
  );
}
