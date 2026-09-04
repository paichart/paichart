/**
 * POV Creation Handler for MCP Tasks Action API
 *
 * @class POVCreateHandler
 * @description Creates complete POV with intelligent defaults:
 *   - Auto-generates team with owner as member
 *   - Creates 3 default phases (Planning/Execution/Review) with smart date distribution
 *   - Derives salesTheatre from country automatically
 *   - Fuzzy country lookup by name/code
 *   - Transaction-based for data consistency (all-or-nothing)
 *   - Admin-only operation for security
 *
 * @method handlePOVCreate(parameters, user, actionId)
 * @param {Object} parameters - POV creation parameters
 * @param {string} parameters.title - POV title (REQUIRED)
 * @param {string} parameters.description - POV description (REQUIRED)
 * @param {string} [parameters.countryName] - Country name for fuzzy lookup (e.g., "Australia", "Mexico")
 * @param {string} [parameters.countryCode] - ISO country code (e.g., "AU", "MX")
 * @param {string} [parameters.countryId] - Direct country ID
 * @param {number} [parameters.duration=90] - POV duration in days (default: 90)
 * @param {string} [parameters.customerName] - Customer name (optional)
 * @param {number} [parameters.revenue] - Expected revenue (optional)
 * @param {number} [parameters.estimatedBudget] - Estimated budget (optional)
 * @param {string} [parameters.opportunityName] - Opportunity name (optional)
 * @param {string} [parameters.objective] - POV objective (optional)
 * @param {string} [parameters.priority] - Priority (HIGH/MEDIUM/LOW, default: MEDIUM)
 * @param {boolean} [parameters.createDefaultPhases=true] - Create 3 default phases
 * @param {Array<{name:string,type:'PLANNING'|'EXECUTION'|'REVIEW',description?:string}>} [parameters.phases] - Custom phases. When supplied & non-empty, overrides the default 3-phase generation (createDefaultPhases ignored).
 * @param {TokenPayload} user - Authenticated user (role gated via RolePermission table)
 * @param {string} actionId - Unique action tracking ID
 *
 * @returns {Promise<Object>} POV creation result with created POV details
 * @throws {Error} If title or description missing
 * @throws {Error} If country not found
 * @throws {ApiError} FORBIDDEN if checkPermission(PoV, CREATE) denies the caller's role
 * @throws {Error} If transaction fails
 *
 * @security RolePermission-TABLE governed (2026-05-25, ed74e8ce — replaced hardcoded ADMIN gate)
 *   - checkPermission({id, role}, {type: PoV}, CREATE) — policy: ADMIN+USER allowed, DEMO blocked
 *   - Activity logging with user validation
 *   - Transaction ensures consistency
 *
 * @version 1.0.0
 * @since 2025-12-18
 * @created 2025-12-18 - pov.create MCP action implementation
 */

import { TokenPayload, ResourceType, ResourceAction } from '@/lib/types/auth';
import { checkPermission } from '@/lib/auth/permissions';
import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { POVStatus, Priority, PhaseType, SalesTheatre } from '@prisma/client';
import { mcpLogger } from '@/lib/logger';
import { assertPersisted } from '@/lib/mcp/tasks/action/utilities/durability';

const log = mcpLogger.child({ module: 'POVCreateHandler' });

/**
 * Helper: Lookup country by name, code, or ID
 */
async function lookupCountry(params: {
  countryName?: string;
  countryCode?: string;
  countryId?: string;
}): Promise<{ id: string; name: string; code: string; theatre: SalesTheatre }> {
  const { countryName, countryCode, countryId } = params;

  // Direct ID lookup
  if (countryId) {
    const country = await prisma.country.findUnique({ where: { id: countryId } });
    if (country) return country;
    throw new Error(`Country not found with ID: ${countryId}`);
  }

  // Code lookup (exact match)
  if (countryCode) {
    const country = await prisma.country.findUnique({ where: { code: countryCode.toUpperCase() } });
    if (country) return country;
    throw new Error(`Country not found with code: ${countryCode}`);
  }

  // Name lookup (fuzzy search)
  if (countryName) {
    // Try exact match first
    const exactMatch = await prisma.country.findFirst({
      where: { name: { equals: countryName, mode: 'insensitive' } }
    });
    if (exactMatch) return exactMatch;

    // Try partial match
    const partialMatch = await prisma.country.findFirst({
      where: { name: { contains: countryName, mode: 'insensitive' } }
    });
    if (partialMatch) {
      log.info({ searchName: countryName, matchedName: partialMatch.name }, 'fuzzy matched country');
      return partialMatch;
    }

    // Get suggestions for helpful error
    const allCountries = await prisma.country.findMany({
      select: { name: true, code: true },
      orderBy: { name: 'asc' },
      take: 50
    });
    const suggestions = allCountries.slice(0, 5).map(c => `${c.name} (${c.code})`).join(', ');
    throw new Error(
      `Country not found: "${countryName}". Suggestions: ${suggestions}... ` +
      `Use countryName (e.g., "Australia"), countryCode (e.g., "AU"), or countryId.`
    );
  }

  throw new Error('One of countryName, countryCode, or countryId is required');
}

/**
 * Helper: Calculate phase dates using 15-70-15 distribution
 */
function calculatePhaseDates(startDate: Date, totalDays: number): {
  planning: { startDate: Date; endDate: Date };
  execution: { startDate: Date; endDate: Date };
  review: { startDate: Date; endDate: Date };
} {
  const planningDays = Math.floor(totalDays * 0.15);
  const reviewDays = Math.floor(totalDays * 0.15);
  const executionDays = totalDays - planningDays - reviewDays;

  const planningStart = new Date(startDate);
  const planningEnd = new Date(planningStart);
  planningEnd.setDate(planningEnd.getDate() + planningDays);

  const executionStart = new Date(planningEnd);
  executionStart.setDate(executionStart.getDate() + 1);
  const executionEnd = new Date(executionStart);
  executionEnd.setDate(executionEnd.getDate() + executionDays);

  const reviewStart = new Date(executionEnd);
  reviewStart.setDate(reviewStart.getDate() + 1);
  const reviewEnd = new Date(reviewStart);
  reviewEnd.setDate(reviewEnd.getDate() + reviewDays);

  return {
    planning: { startDate: planningStart, endDate: planningEnd },
    execution: { startDate: executionStart, endDate: executionEnd },
    review: { startDate: reviewStart, endDate: reviewEnd }
  };
}

type PhaseConfig = {
  name: string;
  description: string;
  type: PhaseType;
  order: number;
  startDate: Date;
  endDate: Date;
};

// Canonical display order used by getPoVPhases (lib/pov/services/phase.ts):
// phases render TYPE-first (PLANNING → EXECUTION → REVIEW), order only as a
// within-type tiebreak. We store dates/order in this same order so the stored
// timeline agrees with the displayed sequence.
const PHASE_TYPE_ORDER: Record<PhaseType, number> = {
  [PhaseType.PLANNING]: 0,
  [PhaseType.EXECUTION]: 1,
  [PhaseType.REVIEW]: 2
};

/**
 * Helper: the original hardcoded 3-phase defaults (Planning/Build/Assessment),
 * extracted so POV end/forecast dates can be derived from the built configs.
 */
function buildDefaultPhaseConfigs(startDate: Date, duration: number): PhaseConfig[] {
  const d = calculatePhaseDates(startDate, duration);
  return [
    {
      name: 'Planning and Design',
      description: 'Requirements gathering, architecture design, and project planning',
      type: PhaseType.PLANNING,
      order: 1000,  // Industry standard 1000 increment pattern
      ...d.planning
    },
    {
      name: 'Build and Deploy',
      description: 'Implementation, integration, testing, and deployment',
      type: PhaseType.EXECUTION,
      order: 2000,  // Allows insertion of additional EXECUTION phases at 2500, 2750, etc.
      ...d.execution
    },
    {
      name: 'Assessment and Validation',
      description: 'Performance validation, documentation, and final review',
      type: PhaseType.REVIEW,
      order: 3000,  // Maintains logical sequence after all EXECUTION phases
      ...d.review
    }
  ];
}

/**
 * Helper: build phase configs from a caller-supplied `phases` array.
 *
 * - Rejects duplicate names (stage/task attach is by-name first-match —
 *   duplicate names cause non-deterministic wiring; see stage-create-handler).
 * - Sorts into canonical TYPE order (duplicate types are allowed).
 * - Dates: if the set is exactly the 3 canonical types one-each, reuse the
 *   default 15/70/15 distribution so "same shape, custom names" yields
 *   identical dates to the default path; otherwise even-split the duration
 *   across N phases with a 1-day gap (avoids the overlap validatePhaseTimeline
 *   rejects on later edits).
 */
function buildCustomPhaseConfigs(
  supplied: Array<{ name: string; type: PhaseType; description?: string }>,
  startDate: Date,
  duration: number
): PhaseConfig[] {
  const seen = new Set<string>();
  for (const p of supplied) {
    const key = p.name.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `Duplicate phase name: "${p.name}". Phase names must be unique within a ` +
        `POV (tasks and stages attach to phases by name).`
      );
    }
    seen.add(key);
  }

  const sorted = [...supplied].sort(
    (a, b) => PHASE_TYPE_ORDER[a.type] - PHASE_TYPE_ORDER[b.type]
  );

  const isCanonicalTriple =
    sorted.length === 3 &&
    sorted[0].type === PhaseType.PLANNING &&
    sorted[1].type === PhaseType.EXECUTION &&
    sorted[2].type === PhaseType.REVIEW;

  if (isCanonicalTriple) {
    const d = calculatePhaseDates(startDate, duration);
    const slots = [d.planning, d.execution, d.review];
    return sorted.map((p, i) => ({
      name: p.name,
      description: p.description ?? p.name,
      type: p.type,
      order: (i + 1) * 1000,
      ...slots[i]
    }));
  }

  const n = sorted.length;
  const per = Math.max(1, Math.floor(duration / n));
  let cursor = new Date(startDate);
  return sorted.map((p, i) => {
    const phaseStart = new Date(cursor);
    const phaseDays = i === n - 1 ? Math.max(1, duration - per * (n - 1)) : per;
    const phaseEnd = new Date(phaseStart);
    phaseEnd.setDate(phaseEnd.getDate() + phaseDays);
    cursor = new Date(phaseEnd);
    cursor.setDate(cursor.getDate() + 1);  // 1-day gap before the next phase
    return {
      name: p.name,
      description: p.description ?? p.name,
      type: p.type,
      order: (i + 1) * 1000,
      startDate: phaseStart,
      endDate: phaseEnd
    };
  });
}

/**
 * Main POV creation handler
 */
export async function handlePOVCreate(
  parameters: any,
  user: TokenPayload,
  actionId: string
): Promise<any> {
  log.info({ actionId, userId: user.userId }, 'starting POV creation');

  // 🔒 Capability gate: POV-create is governed by the RolePermission table
  // (role-level — a new POV has no instance to scope). Mirrors the web route.
  // CRITICAL: map TokenPayload.userId → checkPermission's `id`. Passing the raw
  // TokenPayload yields id=undefined and a role-blind, colliding cache key
  // (cross-role privilege escalation within the 5-min TTL).
  const canCreate = await checkPermission(
    { id: user.userId, role: user.role },
    { id: null, type: ResourceType.PoV },
    ResourceAction.CREATE
  );
  if (!canCreate) {
    throw new ApiError('FORBIDDEN',
      `You do not have permission to create POVs. Your role: ${user.role}.`
    );
  }

  // Validate required parameters
  const { title, description } = parameters;
  if (!title) throw new Error('title is required');
  if (!description) throw new Error('description is required');

  const duration = parameters.duration || 90;
  const createDefaultPhases = parameters.createDefaultPhases !== false;  // Default: true
  const priority = (parameters.priority || 'MEDIUM') as Priority;

  // Lookup country
  const country = await lookupCountry({
    countryName: parameters.countryName,
    countryCode: parameters.countryCode,
    countryId: parameters.countryId
  });

  log.info({ country: country.name, code: country.code, theatre: country.theatre }, 'resolved country');

  // Calculate dates
  const startDate = new Date();

  // Build phase configs UP FRONT so POV end/forecast can be derived from the
  // phases actually created (custom or default) — not a fixed REVIEW slot that
  // a custom set may not contain. A non-empty `phases` array overrides the
  // default 3-phase generation (createDefaultPhases is ignored in that case).
  const customPhases = Array.isArray(parameters.phases) && parameters.phases.length > 0
    ? parameters.phases
    : null;

  const phaseConfigs: PhaseConfig[] = customPhases
    ? buildCustomPhaseConfigs(customPhases, startDate, duration)
    : (createDefaultPhases ? buildDefaultPhaseConfigs(startDate, duration) : []);

  // POV endDate should be 1 week AFTER the LAST phase to end (shape-agnostic:
  // works for custom sets with no REVIEW phase, even split, etc.). Falls back
  // to startDate+duration when zero phases were created.
  const lastPhaseEndDate = phaseConfigs.length > 0
    ? new Date(Math.max(...phaseConfigs.map(c => c.endDate.getTime())))
    : new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);
  const povEndDate = new Date(lastPhaseEndDate);
  povEndDate.setDate(povEndDate.getDate() + 7);  // 1 week buffer after last phase

  // forecastDate should be 1 week AFTER POV endDate
  const forecastDate = parameters.forecastDate
    ? new Date(parameters.forecastDate)
    : new Date(povEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);  // 1 week after POV end

  // 🔒 TRANSACTION: Create POV + Team + Phases atomically
  const result = await prisma.$transaction(async (tx) => {
    // Step 1: Create POV
    const pov = await tx.pOV.create({
      data: {
        title,
        description,
        // BUG-BASIC-001 fix (2026-05-22): drop the `|| description` fallback
        // that caused Description and Objective to render identically in
        // pov.details responses. Objective is nullable (POV.objective is
        // `String?` in schema). Callers that want them populated together
        // can pass both explicitly; UI prompts the user to optionally add
        // an objective. Restores semantic separation:
        //   description = customer-facing summary
        //   objective   = success criteria (what done looks like)
        objective: parameters.objective || null,
        status: POVStatus.PROJECTED,
        priority,
        startDate,
        endDate: povEndDate,
        forecastDate,
        customerName: parameters.customerName,
        revenue: parameters.revenue,
        estimatedBudget: parameters.estimatedBudget,
        opportunityName: parameters.opportunityName,
        salesTheatre: country.theatre,
        countryId: country.id,
        regionId: null,  // Optional: can be set later
        ownerId: user.userId,
        tags: [],
        metadata: {
          createdVia: 'mcp',
          actionId,
          createdBy: user.email
        }
      }
    });

    log.info({ povId: pov.id }, 'created POV');

    // Step 2: Create Team with owner as member
    // NOTE: Team model doesn't have povId - relationship is POV.teamId → Team.id
    // 2026-08-19 (morning-list #7): pov.create's validation schema ACCEPTED salesEngineers but
    // this handler silently dropped it (the MCP-parameter-three-layers class: schema without a
    // consuming handler = silent loss) — callers passing engineers got a team of 1 and a
    // hardcoded "Members: 1" summary. Consume it: engineers join at create, deduped against the
    // owner, and the summary reports the REAL member count.
    const requestedEngineerIds: string[] = Array.isArray(parameters.salesEngineers)
      ? (parameters.salesEngineers as unknown[]).filter(
          (id): id is string => typeof id === 'string' && id !== user.userId)
      : [];
    // Existence-filter BEFORE create: one bogus id must not FK-abort the whole POV
    // transaction (that would be worse than the old silent drop). Unknown ids are
    // skipped and surfaced in the summary, not fatal.
    const existingEngineers = requestedEngineerIds.length > 0
      ? await tx.user.findMany({ where: { id: { in: [...new Set(requestedEngineerIds)] } }, select: { id: true } })
      : [];
    const engineerIds = existingEngineers.map((u) => u.id);
    const team = await tx.team.create({
      data: {
        name: `${title} Team`,
        members: {
          create: [
            { userId: user.userId, role: 'OWNER' },
            ...[...new Set(engineerIds)].map((userId) => ({ userId, role: 'SALES_ENGINEER' as const })),
          ]
        }
      },
      include: {
        members: true
      }
    });

    log.info({ teamId: team.id }, 'created team with owner as member');

    // Step 3: Update POV with teamId to establish relationship
    await tx.pOV.update({
      where: { id: pov.id },
      data: { teamId: team.id }
    });

    // Step 4: Create phases (custom if supplied, else the default 3, else none).
    // phaseConfigs was built before the transaction so POV end/forecast dates
    // could be derived from the phases actually created.
    const phases: any[] = [];
    for (const config of phaseConfigs) {
      const phase = await tx.phase.create({
        data: {
          ...config,
          povId: pov.id
        }
      });
      phases.push(phase);
      log.info({ phaseName: phase.name, phaseType: phase.type }, 'created phase');
    }

    // Step 5: Log activity
    await tx.activity.create({
      data: {
        userId: user.userId,
        action: 'create',
        type: 'POV_CREATED',
        metadata: {
          povId: pov.id,
          povTitle: title,
          actionId,
          phasesCreated: phases.length,
          via: 'mcp',
          description: `Created POV: ${title} via MCP`
        }
      }
    });

    return {
      pov,
      team,
      phases,
      skippedEngineers: new Set(requestedEngineerIds).size - engineerIds.length
    };
  });

  const { pov, team, phases } = result;

  // DURABILITY ASSERTION — guard the phantom-commit class (resolved $transaction, no durable row).
  // POV-presence stands in for whole-tx durability: a lost COMMIT loses POV+team+phases atomically.
  // See cline_docs/findings/2026-06-20-mcp-task-create-false-success.md.
  await assertPersisted(
    () => prisma.pOV.findUnique({ where: { id: pov.id }, select: { id: true } }),
    { entity: 'POV', actionLabel: 'pov.create', id: pov.id, log: { povId: pov.id, teamId: team.id, actionId } }
  );

  // Format success response
  const successMessage = `✅ **POV Created Successfully**

**POV Details:**
• Title: ${pov.title}
• ID: ${pov.id}
• Status: ${pov.status}
• Priority: ${pov.priority}
• Customer: ${pov.customerName || 'Not specified'}
• Duration: ${duration} days (phases: ${startDate.toLocaleDateString()} → ${lastPhaseEndDate.toLocaleDateString()})
• POV End Date: ${povEndDate.toLocaleDateString()} (1 week buffer after phases)
• Forecast Date: ${forecastDate.toLocaleDateString()} (1 week after POV end)

**Location:**
• Country: ${country.name} (${country.code})
• Sales Theatre: ${country.theatre}

**Team:**
• Team ID: ${team.id}
• Members: ${result.team.members.length} (you as owner${result.team.members.length > 1 ? ` + ${result.team.members.length - 1} sales engineer${result.team.members.length > 2 ? 's' : ''}` : ''})${result.skippedEngineers > 0 ? `\n• ⚠️ ${result.skippedEngineers} salesEngineers id(s) not found — skipped` : ''}

**Phases Created:** ${phases.length}
${phases.map((p: any) => `• ${p.name} (${p.type}) - ${new Date(p.startDate).toLocaleDateString()} → ${new Date(p.endDate).toLocaleDateString()}`).join('\n')}

**💡 Next Steps:**
• Add tasks: perform(action: 'task.create', parameters: { povId: '${pov.id}', phaseName: '${phases[0]?.name ?? 'Planning and Design'}', title: '...' })
• View details: project(action: 'pov.details', povId: '${pov.id}')
• Add team members: Use web UI to add team members (not yet available via MCP)
• Create stages: perform(action: 'stage.create', parameters: { phaseName: '${phases[0]?.name ?? 'Planning and Design'}', name: 'Requirements Analysis' })`;

  return {
    actionId,
    action: 'pov.create',
    status: 'completed',
    result: {
      success: true,
      pov: {
        id: pov.id,
        title: pov.title,
        status: pov.status,
        priority: pov.priority,
        teamId: team.id,
        phaseCount: phases.length
      },
      message: successMessage
    }
  };
}
