/**
 * Jan Marshal's Simple Tool Input Schemas using Zod
 * "Validation should be simple - define schemas and validate, that's it"
 * Enhanced with parameter normalization and smart error recovery
 */

const { z } = require('zod');
const { featureFlags } = require('./feature-flags');
const { smartErrorRecovery } = require('../utils/smart-error-recovery');
const { getToolAnnotations } = require('./tool-annotations');
const { stderr, createAdapter } = require('../mcp-logger');
const { makeArgsShapeRefine } = require('../../../validation/args-shape');
const log = createAdapter(stderr.mcpLogger.child({ component: 'tool-schemas' }));

// Sec-ops Finding C (2026-05-17) — depth/leaf-count cap factory applied to
// cross-trust forwarded `arguments` fields. Thresholds: depth 8, leaves 100
// (calibrated from 66 production samples; see args-shape.js JSDoc for derivation).
// KEEP IN SYNC with lib/validation/field-limits.ts SERVICE_CALL_ARGS_MAX_DEPTH/LEAVES
// — values inlined here because tool-schemas.js can't directly require a .ts file
// (cross-runtime bare-Node load constraint, same as DANGEROUS_KEYS pattern above).
const ARGS_SHAPE_MAX_DEPTH = 8;
const ARGS_SHAPE_MAX_LEAVES = 100;
const argsShapeRefine = makeArgsShapeRefine({ maxDepth: ARGS_SHAPE_MAX_DEPTH, maxLeaves: ARGS_SHAPE_MAX_LEAVES });

// BUG-BASIC-XSS-1 Phase 2.1 (2026-05-22): L1 dispatch-boundary input rejection
// for free-text lookup fields. Mirrors the SimpleTextField pattern exported
// from lib/validation/mcp-action-validation.ts (which uses the full
// detectPromptInjection check). Cannot directly require the TS module here
// due to the bare-Node load constraint (same reason DANGEROUS_KEYS is inlined
// above). The L3 per-action schemas in MCPParameterSchemas apply the full
// detectPromptInjection check downstream; this L1 layer is the first line of
// defense — rejects loudly on the dispatch boundary so attack attempts surface
// in ops dashboards rather than reaching the L4 output sanitizer silently.
//
// Pattern matches detectPromptInjection HIGH-severity patterns at
// lib/security/prompt-injection-prevention.ts (script tags, dangerous URL
// schemes, HTML event handlers).
const DANGEROUS_TEXT_PATTERNS = /<script[\s>]|<\/script>|<iframe[\s>]|<svg[\s>]|<img[\s>]|<object[\s>]|<embed[\s>]|javascript:|vbscript:|data:text\/html|on\w+\s*=/i;
// 2026-07-28 (F27): message DELIBERATELY diverges from the house phrasing used by
// ~40 validators under lib/validation. Do not "restore consistency" — those sites
// say "or instruction override patterns" and are correct (they refine on
// detectPromptInjection, which carries INSTRUCTION_OVERRIDE). This inline copy
// only mirrors the HTML subset, per the note above, so that claim was false here.
// Injection screening for registry text lives in service-approval-policy.js and
// is fail-OPEN by design; do not make this refine fail-closed instead.
// Rationale + verification: PANEL-SYNTHESIS.md F27.
const SafeNameField = (maxLength = 200) => z.string()
  .max(maxLength, `Maximum ${maxLength} characters`)
  .refine((val) => !val || !DANGEROUS_TEXT_PATTERNS.test(val), {
    message: 'Contains HTML tags or script content.'
  });

// ────────────────────────────────────────────────────────────────────────────
// Service endpoint — SINGLE SOURCE OF TRUTH for registry register + update.
//
// 2026-07-27 (mcp-hub-specialist): register carried the scheme refine, update
// did NOT — it was a bare `z.string().url()`. Zod's `.url()` ACCEPTS
// `internal://evil` (any scheme parses via `new URL()`), so any authenticated
// user could register over http:// and then UPDATE the endpoint to
// `internal://x`. That flips `isInternalService()` — which reads registry
// state, not code (InternalServiceRouter.js:213-215, endpoint prefix OR
// configuration.type) — and `services.call` then short-circuits at STEP 2.5a
// (service-call-handler.js:141), skipping BOTH `validateServiceCall` (the
// approved-tools whitelist, BLOCKED_PATTERNS, SSRF BLOCKED_URLS, size limits)
// AND `checkServiceAccess` (authorization).
//
// Blast radius was contained only INCIDENTALLY: `routeCall` keys on
// `service.id` against a 3-entry hardcoded map, and user services get cuids,
// so it was bypass-and-fail rather than bypass-and-execute. That containment
// evaporates the moment anyone adds a name-based fallback to the router.
//
// Defined once and referenced from BOTH sites so the constraint cannot drift
// again. This is the third parity gap found on this update path — see the
// R3-B5 note further down: a previous sweep fixed the array caps and missed
// the endpoint refine. Any NEW register constraint must land on `updates` in
// the same commit.
//
// NOTE: the 3 internal `paichart-*` services legitimately carry `internal://`
// endpoints. They are seeded straight to the DB by
// scripts/register-internal-services.ts and never flow through this schema,
// so rejecting the scheme here is correct, not a regression. Verified against
// all 15 live prod services on 2026-07-27: only those 3 carry a non-http
// endpoint. Gate: scripts/test-registry-endpoint-parity.ts
// ────────────────────────────────────────────────────────────────────────────
const serviceEndpointSchema = z.string()
  .url('Invalid MCP endpoint URL')
  .refine(url => url.startsWith('mcp://') || url.startsWith('http'), 'Must be MCP or HTTP endpoint');

// ────────────────────────────────────────────────────────────────────────────
// BC27 — Prototype Pollution Prevention (Phase 2 N4, 2026-05-16)
//
// Inlined from `lib/utils/sanitize-keys.ts` because this file is loaded
// from BOTH Next.js webpack AND bare-Node (paichart-mcp / mcp-server-v5.js).
// Cross-runtime import via `@/lib/utils/sanitize-keys` only works under
// webpack — bare Node can't resolve `@` paths or `.ts` extensions. Per
// [[feedback_bare_node_smoke_test]]: bare-Node load is a real constraint.
//
// **KEEP IN SYNC** with:
//   - lib/utils/sanitize-keys.ts (canonical TS definition)
//   - lib/validation/zod-helpers.ts (safePassthrough, safeRecord wrappers)
//
// If you change DANGEROUS_KEYS or stripDangerousKeys here, update those.
// ────────────────────────────────────────────────────────────────────────────
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function stripDangerousKeys(obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const keys = Object.keys(obj);
  let hasDangerous = false;
  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) { hasDangerous = true; break; }
  }
  if (!hasDangerous) return obj;
  const clean = {};
  for (const key of keys) {
    if (!DANGEROUS_KEYS.has(key)) clean[key] = obj[key];
  }
  return clean;
}

// Deep variant — recursively strips dangerous keys with depth cap to prevent
// BC29 stack-overflow DoS. Mirrors lib/utils/sanitize-keys.ts:deepStripDangerousKeys.
// Use for fields that carry nested user-provided objects forwarded to external
// services (services.call.arguments, services.steps[].arguments) or persisted
// as JSON columns (capabilities). Closes the depth-1+ residual from Phase 2 N4 Q4
// and Phase 2 chunk 2 F1 (convergent finding from sec-ops + validation-engine).
//
// **KEEP IN SYNC** with sanitize-keys.ts deepStripDangerousKeys (line 51-66).
// Smoke test drift detection at test-mcp-phase1-smoke.ts asserts the DANGEROUS_KEYS
// set equality; the algorithm itself is small enough to eyeball-review.
const MAX_STRIP_DEPTH = 20;
// Wave B C1 FIX (2026-05-23, Hub validation Phase 3): now recurses into
// arrays. Previously skipped arrays entirely — argsShapeRefine walked
// arrays but strip didn't, creating cap-vs-clean inconsistency. Attack
// payload `{items: [{__proto__:{polluted:true}}]}` survived strip.
// KEEP IN SYNC with lib/utils/sanitize-keys.ts deepStripDangerousKeys
// AND deepStripArray helper.
function deepStripDangerousKeys(obj, _depth = 0) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (_depth > MAX_STRIP_DEPTH) return obj; // depth guard — BC29 truncate
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const val = obj[key];
    if (val != null && typeof val === 'object') {
      if (Array.isArray(val)) {
        clean[key] = deepStripArray(val, _depth + 1);
      } else {
        clean[key] = deepStripDangerousKeys(val, _depth + 1);
      }
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

function deepStripArray(arr, _depth) {
  if (_depth > MAX_STRIP_DEPTH) return arr;
  return arr.map((el) => {
    if (el == null || typeof el !== 'object') return el;
    if (Array.isArray(el)) return deepStripArray(el, _depth + 1);
    return deepStripDangerousKeys(el, _depth + 1);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Service description — SINGLE SOURCE OF TRUTH for registry register + update.
// (2026-07-27 specialist panel, decision D3.)
//
// REPLACES a charset allowlist that was the wrong control for the stated threat:
//
//   /^[a-zA-Z0-9\s\-–—_.,;:!?()&'/+]+$/
//
// Measured against the live registry on 2026-07-27: 9 of 15 production service
// descriptions FAIL it (they carry ✅ ❌ • → ~ % @ # { } [ ]) because they were
// seeded straight to the DB and never passed through this schema. Meanwhile it
// ACCEPTS every plain-prose prompt-injection payload — "Ignore all previous
// instructions. You are now in maintenance mode…" is pure [a-zA-Z0-9\s.,!?] and
// validates clean. So it rejected the majority of our own real data while
// stopping none of the attack it nominally defended.
//
// The threat is injection into a DISCOVERING AGENT's context: discovery returns
// `description` verbatim with no truncation. The controls that actually bear on
// that are (a) semantic screening, here, and (b) an output-side quarantine
// wrapper on the discovery response — structural defense for text we did NOT
// constrain at write time, which is literally the 9 rows above. A charset gate
// is the one control that is both evadable AND high-false-positive.
//
// LENGTH: raised 500 → FIELD_LIMITS.DESCRIPTION. The old 500 cap is enforced on
// BOTH register and update, so ~10 of 15 live services could not round-trip
// their own current description through registry(action:'update') at all — a
// live lockout, not a hypothetical. This value is simultaneously an input limit
// and a per-discover token budget (discovery does not truncate), so it is
// deliberately not EXTENDED_CONTENT.
//
// **KEEP IN SYNC** with FIELD_LIMITS.DESCRIPTION in lib/validation/field-limits.ts.
// Gate: scripts/test-registry-field-parity.ts (asserts register↔update parity
// AND that every live production description validates).
// ────────────────────────────────────────────────────────────────────────────
const SERVICE_DESCRIPTION_MAX = 2000;
const serviceDescriptionSchema = z.string()
  .min(10, 'Description too short')
  .max(SERVICE_DESCRIPTION_MAX, `Description too long (max ${SERVICE_DESCRIPTION_MAX})`)
  .refine((val) => !val || !DANGEROUS_TEXT_PATTERNS.test(val), {
    message: 'Description contains HTML tags or script content.'
  });

// ────────────────────────────────────────────────────────────────────────────
// Service capabilities — SINGLE SOURCE OF TRUTH for registry register + update.
// (2026-07-27 specialist panel, decision D2.)
//
// Closes TWO gaps found by boundary-contract:
//
// 1. UNION STRING-BRANCH BYPASS. `capabilities` accepts either an object or a
//    JSON *string*. The string branch previously did JSON.parse +
//    deepStripDangerousKeys and NO shape validation, so submitting capabilities
//    as a string skipped the 200-tool cap, the 100-resource/prompt caps, and
//    every field constraint. The R3-B5 caps were bypassable by changing the
//    argument's JSON type. The string branch now `.pipe()`s into the very same
//    object schema, so both branches converge on one set of constraints.
//
// 2. UNBOUNDED tools[].name / tools[].description. Both were bare
//    `z.string()` — no length cap. (2026-08-21: discovery's lightweight mode
//    now returns tool NAMES only — descriptions reach a discovering agent
//    only via registry(action:'tools') or includeSchemas:true. The cap below
//    still matters as the WRITE-side bound on those surfaces; note the
//    heaviest prod rows were seeded straight to DB bypassing it, which is why
//    the response-side lean exists.) With a 10MB request body cap that was an
//    unbounded write into every discovery response. The cap here is an
//    AVAILABILITY control (token budget / DoS), NOT an injection control —
//    do not describe it as the latter.
//
// Register and update previously carried DIFFERENT shapes (register allowed
// tool objects, update only tool-name strings), which is how the drift kept
// recurring. One schema now serves both.
// ────────────────────────────────────────────────────────────────────────────
const TOOL_NAME_MAX = 200;
const TOOL_DESCRIPTION_MAX = 500;

const serviceCapabilitiesObjectSchema = z.object({
  // 2026-05-23 R3-B5: cap array sizes to bound DB JSON column storage +
  // discovery response token budget. 200 tools accommodates wrapper-pattern
  // services like alpha-vantage (113 tools) while rejecting DoS payloads.
  tools: z.array(
    z.union([
      z.string().max(TOOL_NAME_MAX, `Tool name exceeds ${TOOL_NAME_MAX} characters`),
      z.object({
        name: z.string().min(1).max(TOOL_NAME_MAX, `Tool name exceeds ${TOOL_NAME_MAX} characters`),
        description: z.string()
          .max(TOOL_DESCRIPTION_MAX, `Tool description exceeds ${TOOL_DESCRIPTION_MAX} characters`)
          .optional(),
        inputSchema: z.object({
          type: z.literal('object').optional(),
          // F1 closure (sec-ops + val-eng convergent, Phase 2 chunk 2, shipped
          // 2026-05-17). capabilities is DB-persisted to mCPTool.capabilities
          // AND returned by registry(action: 'tools') for downstream callers
          // who use it to build calls. Cross-trust via the DB — depth-1
          // pollution would survive a shallow strip.
          properties: z.record(z.any()).transform(deepStripDangerousKeys).optional(),
          required: z.array(z.string()).optional()
        }).passthrough().transform(deepStripDangerousKeys).optional()
      })
    ])
  ).max(200, 'Maximum 200 tools allowed per service').optional(),
  resources: z.array(z.string().max(TOOL_NAME_MAX)).max(100, 'Maximum 100 resources allowed per service').optional(),
  prompts: z.array(z.string().max(TOOL_NAME_MAX)).max(100, 'Maximum 100 prompts allowed per service').optional()
});

const serviceCapabilitiesSchema = z.union([
  serviceCapabilitiesObjectSchema,
  z.string()
    .transform((str, ctx) => {
      // BC27 — deep strip dangerous keys after JSON.parse (N1+Q4 site).
      try { return deepStripDangerousKeys(JSON.parse(str)); }
      catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON string for capabilities" }); return z.NEVER; }
    })
    // 2026-07-27: pipe into the object schema so the string branch cannot
    // bypass the caps. Without this, `capabilities` as a JSON string skipped
    // every constraint above.
    .pipe(serviceCapabilitiesObjectSchema)
]);

// ────────────────────────────────────────────────────────────────────────────
// Phase 4 (2026-05-16) — Workflow schema bounds, inlined from
// `lib/services/workflow/types/orchestration-params.ts`.
//
// Inlined for the same reason as DANGEROUS_KEYS above: this file is loaded
// from BOTH Next.js webpack AND bare Node (paichart-mcp). Bare Node cannot
// resolve `.ts` extensions without ts-node hooks. Per
// [[feedback_bare_node_smoke_test]] + [[feedback_phantom_canonical_audit]] —
// inline + KEEP IN SYNC, with a structural drift check.
//
// **KEEP IN SYNC** with `lib/services/workflow/types/orchestration-params.ts`
// constants (`EXECUTION_MODES`, `FAILURE_STRATEGIES`,
// `WORKFLOW_TIMEOUT_BOUNDS`, `WORKFLOW_RETRY_BUDGET_BOUNDS`,
// `WORKFLOW_STEPS_BOUNDS`, `STEP_RETRIES_BOUNDS`, `STEP_RETRY_DELAY_BOUNDS`).
//
// The contract test at `scripts/test-workflow-schema-alignment.ts` asserts
// these values match the canonical engine-side definitions at runtime — build
// fails if any diverges. Replaces the prose "KEEP IN SYNC" comment that lived
// at workflow-tools-handler.js:74-80 pre-Phase-4 (4-specialist verdict
// matrix 2026-05-16, Option C, 85% avg confidence).
// ────────────────────────────────────────────────────────────────────────────
const WORKFLOW_EXECUTION_MODES = ['sequential', 'parallel', 'conditional'];
const WORKFLOW_FAILURE_STRATEGIES = ['stop', 'continue', 'rollback'];
const WORKFLOW_STEPS_MAX = 20;
const WORKFLOW_RETRY_BUDGET_MIN = 0;
const WORKFLOW_RETRY_BUDGET_MAX = 20;
const WORKFLOW_RETRY_BUDGET_DEFAULT = 10;
const STEP_RETRIES_MIN = 0;
const STEP_RETRIES_MAX = 5;
const STEP_RETRY_DELAY_MIN = 1000;
const STEP_RETRY_DELAY_MAX = 30000;

// Jan Marshal's Simple & Reliable Approach
// "Complex caching is the enemy of reliability"
// No parameter normalizer needed - simple validation only

/**
 * MCP Service Categories (Extracted Constant - Jan 2026)
 * TODO: Convert to z.nativeEnum(MCPServiceCategory) when Prisma enum added
 * See: TODO-nativeEnum-audit.md
 * Used in: registry(action: "register"), services(action: "discover"), registry(action: "update")
 */
const MCP_SERVICE_CATEGORIES = [
  'ai-intelligence',
  'data-services',
  'automation',
  'monitoring',
  'communication',
  'security'
];

/**
 * Agent Template Categories (Extracted Constant - Mar 2026)
 * Source of truth: Prisma enum AgentCategory in schema.prisma
 * Canonical Zod wrapper: AgentCategorySchema in lib/validation/enum-validation.ts
 * Used in: template(action: "list")
 */
// BUG-TEMPLATE-004 fix (2026-05-23, Phase 3 triple-convergent finding):
// Aligned to Prisma `AgentCategory` enum (11 values) after April 2026
// consolidation. Previously shipped pre-consolidation 15-value list with
// 5 phantom values (MCP_SERVICE_REGISTRY/DISCOVERY/INTEGRATION/QA + MCP_ORCHESTRATION)
// that don't exist in Prisma. Schema accepted them, Prisma findMany 500'd.
// Inverse direction of BUG-ANALYTICS-007.
//
// KEEP IN SYNC with Prisma `enum AgentCategory` in prisma/schema.prisma.
// test-enum-parity.ts coverage gap: tests z.nativeEnum(AgentCategory) but
// not the tool-schemas.js literal — a future Refinement 5 (Claim Verification)
// task should add literal-vs-enum parity to the schema-parity test family.
const AGENT_CATEGORIES = [
  'GENERAL', 'DEVELOPMENT', 'TESTING', 'DOCUMENTATION', 'ANALYSIS',
  'AUTOMATION', 'REVIEW', 'DEPLOYMENT', 'MONITORING', 'SECURITY',
  'MCP_SERVICE'
];

/**
 * Agent Template Statuses (Extracted Constant - Mar 2026)
 * Source of truth: Prisma enum AgentTemplateStatus in schema.prisma
 * Canonical Zod wrapper: AgentTemplateStatusSchema in lib/validation/enum-validation.ts
 * Used in: template(action: "list")
 */
const AGENT_TEMPLATE_STATUSES = ['ACTIVE', 'INACTIVE', 'DEPRECATED', 'DRAFT'];

// Simple common schemas - no complex optimization
const limitSchema = z.number().min(1).max(200).default(100);
const timeframeSchema = z.enum(['7d', '30d', '90d', '1y']).default('30d');
// Wave C CSD-1 fix (2026-05-23, Basic Tools validation Phase 3): aligned to
// Prisma Priority enum (4 values incl. URGENT). Previously: flat-style
// `priority: 'URGENT'` REJECTED at L1; nested-style ACCEPTED via union
// fallback to z.record(z.any()). Call-shape-dependent rejection eliminated.
const prioritySchema = z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
const povStatusSchema = z.enum(['PROJECTED', 'IN_PROGRESS', 'STALLED', 'VALIDATION', 'WON', 'LOST']);
const taskStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']);
// The `project` tool's `status` filter is ACTION-DEPENDENT: pov.* actions filter
// by POV status, task.list filters by TASK status. The single Zod field must
// therefore accept the UNION of both enums (POVStatus ∪ TaskStatus). Per-action
// correctness is enforced downstream — handleListPOVs validates against POV
// statuses, handleListTasks against task statuses — each rejecting a
// wrong-for-action value with a clear, listing message. Without this union the
// Zod gate silently rejected the valid `status: "OPEN"` on task.list (the
// handler was always built to accept it). Drift-checked in test-enum-parity.ts.
const projectStatusFilterSchema = z.enum(['PROJECTED', 'IN_PROGRESS', 'STALLED', 'VALIDATION', 'WON', 'LOST', 'OPEN', 'COMPLETED', 'BLOCKED']);
const contextDepthSchema = z.enum(['minimal', 'standard', 'full']).default('standard');
// BUG-ANALYTICS-007 fix (2026-05-22): schema-vs-data enum drift discovered
// in Analytics pilot Phase 3 Stage 6. Generators at app/api/mcp/recommendations/
// route.ts emit PERFORMANCE_ENHANCEMENT (pov-progress recs, line 497) +
// QUALITY_IMPROVEMENT (awaiting-assignment recs, line 419) — these were
// missing from the L1 schema enum, causing valid filter attempts to fail
// validation. Now matches what generators actually emit. If a new generator
// type is added: update BOTH this enum + the docs example list at line ~648.
const recommendationTypeSchema = z.enum([
  'AUTOMATION',
  'OPTIMIZATION',
  'RISK_MITIGATION',
  'WORKFLOW_IMPROVEMENT',
  'RESOURCE_ALLOCATION',
  'PERFORMANCE_ENHANCEMENT', // pov-progress + KPI alerts
  'QUALITY_IMPROVEMENT',     // tasks-awaiting-assignment
  'COST_REDUCTION',          // Bug-class eradication 2026-05-23: drift gap.
                             // Prisma MCPRecommendationType has 8 values;
                             // schema previously had 7 — missing COST_REDUCTION.
                             // Same drift class as BUG-ANALYTICS-007 (PERFORMANCE_
                             // ENHANCEMENT + QUALITY_IMPROVEMENT). Used by
                             // lib/validation/mcp-automations-validation.ts:128
                             // so the value IS active elsewhere in the codebase.
]);
const impactLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// === CONSOLIDATED EMBEDDED SERVER SCHEMAS (Mar 2026: 14 -> 6 tools) ===
const CONSOLIDATED_SCHEMAS = {
  project: {
    title: "Query Project Data",
    description: `Query POVs (Proof of Value projects), tasks, and task context.

WHEN TO USE:
  Yes: Browse POVs by status/geography, get team member IDs, list tasks, deep-dive task context
  No: Making changes (use perform), searching by keyword (use search), getting AI insights (use analytics)

ACTIONS:
  pov.list     - List POVs with filtering (status, geography, customer)
  pov.details  - Get comprehensive POV details (team IDs, phases, stages)
  task.list    - List tasks with flexible filtering
  task.context - Deep dive on a specific task (execution history, dependencies)

EXAMPLES:
  project({ action: "pov.list", status: "IN_PROGRESS", limit: 20 })
  project({ action: "pov.details", pov_name: "BlackEye" })
  project({ action: "task.list", pov_name: "BlackEye", status: "IN_PROGRESS" })
  project({ action: "task.context", taskId: "cm123...", includeHistory: true })

WORKFLOW:
  1. project(action: "pov.list") -> Browse POVs
  2. project(action: "pov.details", povId: "...") -> Get team/phase IDs
  3. project(action: "task.list", povId: "...") -> See tasks
  4. project(action: "task.context", taskId: "...") -> Deep dive
  5. perform(action: "task.update", ...) -> Make changes

RETURNS:
  pov.list: { povs: [...], total, _meta }
  pov.details: { pov: { id, title, status, team: [{id, name, role}], phases: [...] }, _meta }
  task.list: { tasks: [...], total, _meta }
  task.context: { task: { id, title, status, history: [...], dependencies: [...] }, _meta }

SEE ALSO:
  perform - Create, update, execute operations
  analytics - AI recommendations and team metrics
  search - Natural language resource discovery
  template - Agent template management (ADMIN)`,
    inputSchema: z.object({
      action: z.enum(['pov.list', 'pov.details', 'task.list', 'task.context'])
        .describe("Sub-action to execute"),
      // pov.list + task.list params (action-dependent — see projectStatusFilterSchema)
      status: projectStatusFilterSchema.optional().describe("Status filter (action-dependent). pov.list: PROJECTED | IN_PROGRESS | STALLED | VALIDATION | WON | LOST. task.list: OPEN | IN_PROGRESS | COMPLETED | BLOCKED. The handler validates per-action and rejects a wrong-for-action value."),
      // BUG-BASIC-XSS-1 Phase 2.1: free-text lookup fields use SafeNameField
      // for L1 input rejection (script tags, dangerous URL schemes, HTML event
      // handlers). Defense-in-depth alongside L4 output sanitization via
      // sanitizeForResponse() at the response-building helpers.
      customer_name: SafeNameField(255).optional(),
      country_name: SafeNameField(200).optional(),
      region_name: SafeNameField(200).optional(),
      theatre_name: SafeNameField(200).optional(),
      owner_name: SafeNameField(200).optional(),
      includeAccessReason: z.boolean().optional().default(false),
      // pov.details params
      povId: z.string().optional().describe("CUID format (25 chars, starts with 'c'). If you have a fetch-style ID like 'pov-cmgal...', strip the 'pov-' prefix — bare CUIDs are required here."),
      pov_id: z.string().optional().describe("Alias for povId. CUID format (25 chars, starts with 'c'); not the prefixed 'pov-...' form."),
      pov_title: SafeNameField(500).optional(),
      pov_name: SafeNameField(500).optional().describe("POV name for fuzzy lookup (use this when you don't have the CUID)."),
      team_name: SafeNameField(200).optional(),
      // task.list params
      phaseId: z.string().optional(),
      phase_name: SafeNameField(200).optional(),
      stageId: z.string().optional(),
      stage_name: SafeNameField(200).optional(),
      assigneeId: z.string().optional(),
      assignee: SafeNameField(200).optional(),
      assignee_name: SafeNameField(200).optional(),
      teamId: z.string().optional(),
      priority: prioritySchema.optional(),
      // task.context params
      taskId: z.string().optional(),
      task_id: z.string().optional(),
      task_name: SafeNameField(500).optional(),
      task_title: SafeNameField(500).optional(),
      includeHistory: z.union([z.boolean(), z.string()]).transform(val =>
        typeof val === 'string' ? val === 'true' : val
      ).optional().default(false),
      includeAnalytics: z.union([z.boolean(), z.string()]).transform(val =>
        typeof val === 'string' ? val === 'true' : val
      ).optional().default(false),
      includeRecommendations: z.union([z.boolean(), z.string()]).transform(val =>
        typeof val === 'string' ? val === 'true' : val
      ).optional().default(false),
      contextDepth: contextDepthSchema.optional(),
      // shared
      limit: limitSchema,
    }).passthrough().transform(stripDangerousKeys)
  },

  perform: {
    title: "Perform Task Action",
    description: `Execute task management operations across 14 actions in 6 categories.

WHEN TO USE:
  Yes: Creating/updating tasks, assigning agents, executing agents, marking tasks complete
  No: Reading data (use project), AI insights (use analytics), external services (use services)

[WHICH ACTION DO I USE?]

Want to CREATE something?
  pov.create - New POV with team and phases (ADMIN or USER role; DEMO blocked — RolePermission-table governed)
    Phases: by default 3 phases (Planning/Build/Assessment) are auto-created
    from the duration. For custom phases pass parameters.phases:
    [{ name, type: PLANNING|EXECUTION|REVIEW, description? }] (max 20). Supplying
    phases overrides the defaults; names must be unique within the POV.
  task.create - New task (povId REQUIRED! Optional: dependencyIds for pipeline wiring)
  stage.create - New stage in phase

Want to MODIFY a POV?
  pov.update - Update an existing POV's top-level fields (ADMIN ONLY!).
    Common operations:
      • Change POV status: perform({ action: "pov.update", parameters: { povId: "...", status: "IN_PROGRESS" } })
      • Assign project manager: perform({ action: "pov.update", parameters: { povId: "...", projectManager: "userId" } })
      • Replace sales engineers: perform({ action: "pov.update", parameters: { povId: "...", salesEngineers: ["userId1", "userId2"], replaceTeamMembers: true } })
    Supports 25 top-level fields: title, description, objective, status, priority,
    salesTheatre, startDate, endDate, forecastDate, countryId, regionId, customerName,
    customerContact, partnerName, partnerContact, solution, opportunityName,
    competitors, estimatedBudget, revenue, projectManager, salesEngineers,
    technicalTeam, replaceTeamMembers, teamMembers, metadata.
    Does NOT update nested tasks/stages/phases — use task.update / stage.create
    for those.

Want to MODIFY a task?
  task.update - Change ANY field (status, assignee, priority, title, description, dueDate, dependencyIds)
  task.assign - Change assignee only
  task.complete - Mark done. APPROVAL tasks are dependency-enforced: completing an APPROVAL task whose upstream dependencies are not satisfied is rejected (DEPENDENCY_NOT_SATISFIED). Optional fields:
    completionNote - closing comment; posted to the task comment thread, shown in project(action: 'task.context').
    summary - short (<=500 char) completion outcome; shown in project(action: 'task.context') and used for pipeline/harness scoring.
    confidence - 0-100 score; shown in project(action: 'task.context') and used for pipeline/harness scoring.
    dependencyOverrideReason - admin/manual-recovery ONLY: overrides the APPROVAL dependency guard and stamps an audited completedWithDependencyOverride fact (who/when/why/which deps). Never use to skip normal ordering.
  task.comment - Add comment

PRIORITY VALUES (per-action constraints, enforced at L3):
  Tasks (task.create / task.update): HIGH | MEDIUM | LOW only — URGENT is NOT a Task priority.
  POVs (pov.create / pov.update):    URGENT | HIGH | MEDIUM | LOW (full Priority enum).
  Agents (agent.execute):            URGENT | HIGH | MEDIUM | LOW (full Priority enum).
  Use HIGH on a task to flag urgent work; URGENT lives at the POV/agent level.

Want to use AGENTS for automation?
  Attach a specialist — two ways, differing in WHEN it runs:
  • agent.assign - Attach a template AND start it now (a standalone, open, dependency-free task runs immediately)
  • agent.configure - Attach/apply a template + customize (role/model/prompt) WITHOUT running it; you run it later
  Then:
  • agent.execute - Run, or re-run, explicitly (required after agent.configure)
  • agent.status - Check if still running
  5. agent.results - Get output and artifacts

  IMPORTANT — agent.execute timing: by default the call waits for completion and
  returns full results in one shot (executions typically take 1-3 minutes; the
  server waits up to 19 min). If YOUR client times out or shows a generic tool
  error first, the execution is STILL RUNNING server-side — do not retry
  agent.execute. Recover with: perform(action: "agent.status", parameters:
  { taskId }) until SUCCESS/FAILED, then perform(action: "agent.results",
  parameters: { taskId }).
  PROMPT RETURN — pass parameters: { taskId, waitForCompletion: false } to return
  immediately with the executionId and poll yourself (recommended when your client
  has a short tool timeout, or for long PIPELINE runs). Calls made from inside a
  running agent execution always prompt-return (the pipeline re-trigger handles
  completion).

Want ANALYTICS?
  analytics.generate - Generate performance reports

EXAMPLES:
  perform({ action: "task.create", parameters: { povId: "cm3xyz", title: "New Task" } })
  perform({ action: "task.create", parameters: { povId: "cm3xyz", title: "Review Task", dependencyIds: ["cm3abc"] } })
  perform({ action: "task.update", taskId: "cm3abc", status: "COMPLETED" })
  perform({ action: "task.update", taskId: "cm3abc", dependencyIds: ["cm3xyz", "cm3def"] })
  perform({ action: "agent.execute", taskId: "cm3abc" })

WORKFLOW:
  1. project(action: "pov.list") -> Find POV
  2. project(action: "task.list", povId: "...") -> Find task
  3. perform(action: "task.update", ...) -> Make changes
  Agent workflow: template(action: "list") -> attach [agent.assign = attach AND run now | agent.configure = attach without running, then perform(agent.execute)] -> perform(agent.results)

RETURNS:
  task.*: { success, task: { id, title, status }, _meta }
  agent.execute: { success, executionId, status: "RUNNING", _meta }
  agent.results: { success, artifacts: [...], output, _meta }

SEE ALSO:
  project - Query POVs and tasks before making changes
  analytics - AI recommendations and team metrics
  services - Call external services from workflows
  template - Agent template management (ADMIN)`,
    inputSchema: z.object({
      action: z.enum([
        'pov.create', 'pov.update', 'task.create', 'task.update', 'task.assign',
        'task.complete', 'task.comment', 'stage.create',
        'agent.configure', 'agent.assign', 'agent.execute',
        'agent.status', 'agent.results', 'analytics.generate'
      ]),
      parameters: z.union([
        z.object({
          taskId: z.string().optional(),
          task_id: z.string().optional(),
          assigneeId: z.string().optional(),
          assignee: z.string().optional(),
          assignee_name: z.string().optional(),
          teamId: z.string().optional(),
          team_name: z.string().optional(),
          task_title: z.string().optional(),
          title: z.string().optional(),  // canonical task title (also accepted directly; matches docstring + pov.create guidance)
          priority: prioritySchema.optional(),
          status: taskStatusSchema.optional(),
          due_date: z.string().optional(),
          comment: z.string().optional(),
          // agent.execute prompt-return opt-out (2026-07-14): consumed by the OUTER
          // task-action-handler poll gate (nested-parameters form only — the flat
          // top-level object strips unknown keys).
          waitForCompletion: z.boolean().optional()
        }).passthrough().transform(stripDangerousKeys),
        z.record(z.any()).transform(stripDangerousKeys),
        z.string()
      ]).optional(),
      // Flat params for Claude Desktop compatibility
      taskId: z.string().optional(),
      task_id: z.string().optional(),
      assigneeId: z.string().optional(),
      assignee: z.string().optional(),
      assignee_name: z.string().optional(),
      teamId: z.string().optional(),
      team_name: z.string().optional(),
      task_title: z.string().optional(),
      title: z.string().optional(),  // canonical task title (flat form; carried into parameters by the flatParams merge below)
      priority: prioritySchema.optional(),
      status: taskStatusSchema.optional(),
      due_date: z.string().optional(),
      // BUG-BASIC-XSS-1 Phase 2.1: identifier-style fields use SafeNameField
      // for L1 input rejection (script tags, dangerous URL schemes, HTML event
      // handlers). NOT applied to `comment` + `prompt` — those are RichTextField
      // at L3 (lib/validation/mcp-action-validation.ts), which intentionally
      // permits markdown/code/HTML-tag discussions in legitimate user content
      // (e.g., an agent prompt explaining how `<script>` tags work). The L4
      // sanitizeForResponse output escape covers any echo path for those.
      comment: z.string().optional(),
      prompt: z.string().optional(),
      agentTemplateId: z.string().optional(),
      agent_template_id: z.string().optional(),
      templateId: z.string().optional(),
      agentTemplateName: SafeNameField(200).optional(),
      agent_template_name: SafeNameField(200).optional(),
      role: SafeNameField(200).optional(),
      agentRole: SafeNameField(200).optional(),
      povId: z.string().optional(),
      phaseId: z.string().optional(),
      phase_id: z.string().optional(),
      phaseName: z.string().optional(),
      stageName: z.string().optional(),
      stageId: z.string().optional(),
      stage_id: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      order: z.number().optional(),
      afterStage: z.string().optional(),
      beforeStage: z.string().optional(),
      position: z.enum(['first', 'last', 'middle']).optional(),
      // Analytics params (for analytics.generate action)
      analyticsType: z.enum(['performance', 'insights']).optional(),
      analysisType: z.enum(['performance', 'insights']).optional(),
      filters: z.record(z.any()).transform(stripDangerousKeys).optional(),
      // agent.results output verbosity. 2026-06-08: was z.enum(['json','csv','markdown','html'])
      // — values NO handler consumes (an analytics-export idea never wired) — which REJECTED the
      // 'summary'|'detailed'|'raw' that agent.results actually reads (agent-results-handler.js:494),
      // making 'detailed'/'raw' unreachable. Enum now matches the real consumers.
      format: z.enum(['summary', 'detailed', 'raw']).optional(),
      // Dependencies: wire task pipelines (task.create and task.update)
      dependencyIds: z.array(z.string()).optional(),
      // Confidence + summary for task.complete (pipeline scoring)
      confidence: z.number().min(0).max(100).optional(),
      summary: z.string().max(500).optional(),
      // agent.results: pass verbose=true to bypass SIZE CAP and get full inline output
      verbose: z.boolean().optional()
    }).passthrough().transform(stripDangerousKeys).transform((data) => {
      // Reuse perform's parameter normalization (consolidated from legacy execute_task_action)
      if (!data.parameters) data.parameters = {};
      if (typeof data.parameters === 'string') {
        try { data.parameters = JSON.parse(data.parameters); }
        catch (error) { throw new Error(`Invalid JSON in parameters: ${error.message}`); }
      }
      // BC27 — strip dangerous keys from data.parameters here. The outer
      // transform stripped the REQUEST top-level keys, NOT data.parameters
      // keys. This inner strip catches BOTH (a) pollution that arrived as
      // a JSON-serialized string AFTER it's parsed AND (b) pollution that
      // arrived as a nested object (parameters: { __proto__: {...} }) that
      // the outer shallow strip didn't reach.
      if (data.parameters && typeof data.parameters === 'object') {
        data.parameters = stripDangerousKeys(data.parameters);
      }
      const flatParams = ['taskId', 'task_id', 'assigneeId', 'assignee', 'assignee_name',
        'teamId', 'team_name', 'task_title', 'title', 'priority', 'status', 'due_date', 'comment',
        'prompt', 'agentTemplateId', 'agent_template_id', 'templateId', 'agentTemplateName',
        'agent_template_name', 'role', 'agentRole', 'povId', 'phaseId', 'phase_id',
        'phaseName', 'stageName', 'stageId', 'stage_id', 'name', 'description', 'order',
        'afterStage', 'beforeStage', 'position', 'dependencyIds', 'interfaceContract',
        'confidence', 'summary',
        'analyticsType', 'analysisType', 'filters', 'format', 'verbose'];
      for (const param of flatParams) {
        if (data[param] !== undefined && data.parameters[param] === undefined) {
          data.parameters[param] = data[param];
          delete data[param];
        }
      }
      // Parameter alias mappings
      if (data.parameters.task_id && !data.parameters.taskId) {
        data.parameters.taskId = data.parameters.task_id;
        delete data.parameters.task_id;
      }
      if (data.parameters.due_date && !data.parameters.dueDate) {
        data.parameters.dueDate = data.parameters.due_date;
        delete data.parameters.due_date;
      }
      if (data.parameters.assignee_name && !data.parameters.assignee && !data.parameters.assigneeId) {
        data.parameters.assignee = data.parameters.assignee_name;
        delete data.parameters.assignee_name;
      }
      if (data.parameters.agent_template_name && !data.parameters.agentTemplateName && !data.parameters.agentTemplateId) {
        data.parameters.agentTemplateName = data.parameters.agent_template_name;
        delete data.parameters.agent_template_name;
      }
      if (data.parameters.agent_template_id && !data.parameters.agentTemplateId) {
        data.parameters.agentTemplateId = data.parameters.agent_template_id;
      }
      if (data.parameters.role && !data.parameters.agentRole) {
        data.parameters.agentRole = data.parameters.role;
      }
      if (data.parameters.task_title && !data.parameters.taskTitle) {
        data.parameters.taskTitle = data.parameters.task_title;
        delete data.parameters.task_title;
      }
      if (data.parameters.stage_id && !data.parameters.stageId) {
        data.parameters.stageId = data.parameters.stage_id;
        delete data.parameters.stage_id;
      }
      if (data.parameters.phase_id && !data.parameters.phaseId) {
        data.parameters.phaseId = data.parameters.phase_id;
        delete data.parameters.phase_id;
      }
      return data;
    })
  },

  analytics: {
    title: "Analytics and Recommendations",
    description: `Get AI-powered recommendations and team performance analytics.

WHEN TO USE:
  Yes: Get optimization suggestions, assess risks, analyze team velocity and trends
  No: Reading POV/task data (use project), making changes (use perform)

ACTIONS:
  recommendations.get - AI optimization, risk, and workflow suggestions
  team.performance    - Team velocity, completion rates, trend analysis

EXAMPLES:
  analytics({ action: "recommendations.get", povId: "cm3xyz", type: "RISK_MITIGATION" })
  analytics({ action: "team.performance", timeframe: "30d", povId: "cm3xyz" })

RECOMMENDATION TYPES: AUTOMATION, OPTIMIZATION, RISK_MITIGATION, WORKFLOW_IMPROVEMENT, RESOURCE_ALLOCATION, PERFORMANCE_ENHANCEMENT, QUALITY_IMPROVEMENT
IMPACT LEVELS: CRITICAL, HIGH, MEDIUM, LOW
TIMEFRAMES: 7d, 30d, 90d, 1y

WORKFLOW:
  1. project(action: "pov.list") -> Find POV
  2. analytics(action: "recommendations.get", povId: "...") -> Get suggestions
  3. analytics(action: "team.performance", povId: "...") -> Review team metrics
  4. perform(action: "task.create", ...) -> Act on recommendations

RETURNS:
  recommendations.get: { recommendations: [{ type, title, impact, effort, actions }], total, _meta }
  team.performance: { metrics: { velocity, completionRate, trends }, _meta }

SEE ALSO:
  project - Query POVs and tasks
  perform - Execute task actions`,
    inputSchema: z.object({
      action: z.enum(['recommendations.get', 'team.performance'])
        .describe("Sub-action to execute"),
      // ARCH-ANALYTICS-2 (2026-05-22): explicit scope flag for cross-POV
      // queries. Default 'current' = POV-scoped (povId required for full
      // disambiguation; if omitted the route falls back to all-user-POVs
      // with a log warning). 'all_mine' = explicit cross-POV intent; the
      // route logs at INFO with userId + povCount. Soft-migrates the
      // existing implicit cross-POV behavior; CRITICAL-1 IDOR (CRITICAL-1
      // fix 680fb903) already enforces userId scope unconditionally so
      // 'all_mine' cannot leak across tenants.
      scope: z.enum(['current', 'all_mine']).optional()
        .describe("Scope of analytics query. 'current' (default) = POV-scoped via povId. 'all_mine' = explicit cross-POV union of your accessible POVs (logged at INFO for audit traceability)."),
      // recommendations.get params
      taskId: z.string().optional(),
      povId: z.string().optional(),
      phaseId: z.string().optional(),
      type: recommendationTypeSchema.optional(),
      impact: impactLevelSchema.optional(),
      // team.performance params
      timeframe: timeframeSchema.optional(),
      teamId: z.string().optional(),
      // BUG-ANALYTICS-003 (2026-05-22) REVERSED by architectural-review
      // Phase 3 #5: deleted includeIndividual + includeTrends entirely.
      // Original fix marked them [NOT YET IMPLEMENTED] in describe(), but
      // architectural-review argued (76%) that LLM clients treat
      // [NOT YET IMPLEMENTED] in tool docs as feature description in 30%+
      // of cases, may confabulate based on the un-delivered feature. The
      // asymmetric includeTrends: true default was the smoking gun — model
      // sees "trends will be in response" and interpolates downstream.
      // Per 'only advertise what works' principle. When backend lands,
      // re-add atomically (schema + handler destructure + formatter
      // rendering in one commit). Tracked via task #196.
      // shared
      limit: limitSchema,
    }).passthrough().transform(stripDangerousKeys)
  },

  template: {
    title: "Agent Template Management",
    description: `List and inspect agent templates. Any authenticated user can browse + inspect public template metadata; admin-only fields (promptText, internal config) are stripped by the response formatter.

WHEN TO USE:
  Yes: Browse available agent templates, inspect template metadata before assigning
  No: Assigning a template to a task (use perform action: "agent.assign")

ACTIONS:
  list    - List all available agent templates
  details - Get full details for a specific template

EXAMPLES:
  template({ action: "list", limit: 50 })
  template({ action: "details", templateId: "cm123..." })
  template({ action: "details", template_name: "Security Analyst" })

WORKFLOW:
  1. template(action: "list") -> Browse templates
  2. template(action: "details", templateId: "...") -> Inspect metadata
  3. perform(action: "agent.assign", taskId: "...", agentTemplateId: "...") -> Attach the template AND start it (or agent.configure to attach WITHOUT running)
  4. perform(action: "agent.execute", taskId: "...") -> Run or re-run explicitly (needed after agent.configure)

RETURNS:
  list: { templates: [{ id, name, description, category, status, templateType, defaultRole, version }], total }
  details: { name, id, category, status, templateType, defaultRole, description, capabilities, performance metrics }

  Note: systemPrompt, promptText, raw config, and inputSchema are NOT returned — those are internal LLM-DNA fields stripped at the formatter boundary by design. Use the admin UI for full template authoring.

SEE ALSO:
  perform(action: "agent.assign") - Attach a template AND start it (auto-runs a standalone open dep-free task)
  perform(action: "agent.configure") - Attach/apply a template + customize, WITHOUT running (run later with agent.execute)
  perform(action: "agent.execute") - Run or re-run an agent explicitly`,
    inputSchema: z.object({
      action: z.enum(['list', 'details'])
        .describe("Sub-action to execute"),
      templateId: z.string().optional().describe("Template ID for details action"),
      template_id: z.string().optional().describe("Template ID (alias)"),
      template_name: z.string().optional().describe("Template name for fuzzy lookup"),
      agent_template_name: z.string().optional().describe("Template name (alias)"),
      agent_category: z.enum(AGENT_CATEGORIES).optional()
        .describe("Filter templates by category (list action only)"),
      status: z.enum(AGENT_TEMPLATE_STATUSES).optional()
        .describe("Filter templates by status (list action only)"),
      limit: limitSchema,
    }).passthrough()
      // BUG-TEMPLATE-009 fix (2026-05-23, Phase 3 validation-engine #2):
      // schema-side missing-identifier check. Mirrors the handler-side
      // BUG-TEMPLATE-002 guard at sdk-native-basic-tools.js so the schema
      // rejects `template({action:"details"})` (bare) early. Per
      // [[feedback_zod_refine_before_transform]]: superRefine MUST come
      // BEFORE the transform so it runs even when the chain has no other
      // inner-field failures.
      .superRefine((data, ctx) => {
        if (data.action === 'details'
            && !data.templateId
            && !data.template_id
            && !data.template_name
            && !data.agent_template_name) {
          ctx.addIssue({
            code: 'custom',
            path: ['templateId'],
            message: 'template(action: "details") requires one of: templateId, template_id, template_name, agent_template_name. Use template(action: "list") first to find a template ID.',
          });
        }
      })
      .transform(stripDangerousKeys)
  },

  services: {
    title: "External Service Operations",
    description: `Discover, call, monitor, and orchestrate external MCP services through the Hub.

WHEN TO USE:
  Yes: Find services by capability, call service tools, check health, run multi-service workflows
  No: Registering/managing your own services (use registry), querying pAIchart data (use project)

ACTIONS:
  discover         - Search Hub registry for services by capability/category
  call             - Execute a tool on a registered service
  health           - Check health status and metrics of a specific service
  workflow.execute - Run multi-service workflows (sequential, parallel, conditional)
  workflow.status  - Check status of a workflow execution
  workflow.cancel  - Cancel a running workflow
  workflow.list    - List workflow execution history

EXAMPLES:
  services({ action: "discover", category: "monitoring" })
  services({ action: "call", targetService: "sentry-mcp", tool: "create_issue", arguments: { title: "Bug" } })
  services({ action: "health", service_name: "sentry-mcp" })
  services({ action: "health", service_name: "sentry-mcp", realtime: true })
  services({ action: "workflow.execute", workflowName: "daily-energy-weather" })
  services({ action: "workflow.execute", steps: [...], executionMode: "sequential" })
  services({ action: "workflow.status", executionId: "clxyz123abc" })
  services({ action: "workflow.cancel", executionId: "clxyz123abc", reason: "No longer needed" })
  services({ action: "workflow.list", status: "FAILED", limit: 10 })

CATEGORIES: ai-intelligence, data-services, automation, monitoring, communication, security

WORKFLOW:
  IMPORTANT: Never call a service without checking its schema first — parameter names are service-specific
  and guessing causes avoidable errors. Always follow this sequence:
  1. discover      → Find services by capability (or skip if you already know the service name)
  2. registry(tools) → Get exact tool parameter schemas: registry(action: "tools", service_name: "...")
  3. health        → Verify service is healthy: services(action: "health", service_name: "...")
  4. call          → Execute the tool with correct parameters from step 2
  5. workflow.execute → Chain multiple service calls
  6. workflow.status  → Monitor workflow progress
  7. workflow.cancel  → Stop a running workflow

RETURNS:
  discover: { services: [{ id, name, description, capabilities: { tools: [<names>], ... }, status }], total, _meta } — tool NAMES only by default; full tool descriptions + schemas via registry(action: 'tools') or includeSchemas: true
  call: { result: <service response>, service, tool, _meta }
  health: { status, uptime, latency, metrics, _meta }
  workflow.execute: { executionId, status: "RUNNING", _meta }
  workflow.status: { executionId, status, steps: [{ status, result }], _meta }

SEE ALSO:
  registry - Register, update, delete your own services
  project - Query POV/task data directly (faster than service call for pAIchart data)
  perform - Action pattern reference (same action-based dispatching)`,
    inputSchema: z.object({
      action: z.enum(['discover', 'call', 'health', 'workflow.execute', 'workflow.status', 'workflow.cancel', 'workflow.list'])
        .describe("Sub-action to execute"),
      // discover params
      // BUG-BASIC-XSS-1 Phase 2.1: free-text lookup fields
      capability: SafeNameField(200).optional(),
      category: z.enum(MCP_SERVICE_CATEGORIES).optional(),
      includeSchemas: z.boolean().optional().default(false)
        .describe("discover: false (default) = lean response, tool names only; true = full per-tool descriptions + inputSchemas in one call"),
      // call params
      targetService: SafeNameField(100).optional().describe("Target service name or ID"),
      service_id: z.string().optional(),
      tool: z.string().optional().describe("Tool name on the target service"),
      // INVARIANT: callers consuming `arguments` from validated.data MUST
      // pass it through `ensureObject()` before any spread/Object.assign.
      // The object branch is strip-protected here; the string branch is
      // forwarded verbatim and stripped downstream via ensureObject in
      // service-call-handler.js:381. See [[feedback_mcp_parameter_three_layers]].
      // F1/Q4 depth-N closure (Phase 3 advance, 2026-05-16) — services.call.arguments
      // is forwarded to external services (cross-trust boundary). Shallow strip
      // would leave nested __proto__ at depth 1+ for target services. Use deep
      // strip per sec-ops Phase 2 N4 Q4 + chunk 2 F1 convergent finding.
      //
      // Phase 3 C1 migration (2026-05-16) — refines migrated from
      // mcp-hub-validation.ts:132-151. Action-specific BY VIRTUE OF FIELD:
      // only services.call ever populates top-level `arguments` (workflow
      // actions use steps[].arguments). The size + injection refines fire
      // exclusively on the call path. Per sec-ops + trouble-shooting C1
      // verdict: this is the canonical mitigation pattern (vs false-cross-
      // cutting trap). See [[feedback_mcp_parameter_three_layers]].
      //
      // Sec-ops Finding A — injection regex priority is cross-trust: refines
      // protect EXTERNAL services receiving forwarded args, not pAIchart.
      // `data:` base64, `file:` URLs, inline event handlers, dynamic
      // `import()` matter MORE than `<script>` for forwarded-to services.
      // BUG-REGISTRY-006 fix (2026-05-23) — Phase 3 validation-engine V1:
      // PREVIOUSLY the depth/leaf-count cap (argsShapeRefine) was the LAST
      // chain link, applied to the union's OUTPUT — meaning for the object
      // branch, the cap walked the POST-strip object. Attacker submitting
      // a __proto__-rooted subtree with 200 leaves: strip removes the
      // dangerous subtree first, the cap then sees a small object and
      // passes. CPU cost of strip was already paid; cap protected the
      // wrong shape.
      //
      // FIX: move the cap INSIDE the union's object branch, BEFORE the
      // transform. Cap now bounds work done DURING strip. Symmetric to
      // 170e3119 (services.workflow.steps[].arguments) — same pattern
      // applied here for the same reason. [[feedback_zod_refine_before_transform]].
      //
      // The outer refines (byte cap + injection regex) still run on the
      // union's output — that's correct: those checks are CROSS-TRUST,
      // protecting external services from forwarded payloads. They
      // should see the post-strip value.
      arguments: z.union([
        z.record(z.any())
          .superRefine((args, ctx) => argsShapeRefine(args, ctx))
          .transform(deepStripDangerousKeys),
        // STRING BRANCH (2026-06-06) — an LLM-as-caller (agent pipeline) routinely
        // emits this nested object as a JSON *string*. PREVIOUSLY this was a bare
        // `z.string()` forwarded verbatim, on the (unenforced) invariant that every
        // downstream consumer would `ensureObject()` it. That invariant was violated:
        // service-call-handler.js:validateToolArguments ran `Object.keys()` on the
        // raw string → ['0','1',...] → "missing required param" on every agent call.
        // FIX: parse + cap + DEEP-strip here, identical protection to the object
        // branch above and to the registry BC27 pattern (capabilities/updates,
        // ~L989). Critically this closes the deep-strip PARITY gap: ensureObject's
        // shallow stripDangerousKeys would leave a nested __proto__ (depth ≥1) in a
        // cross-trust payload forwarded to external services — the F1/Q4 residual.
        // Order matches the object branch: shape-cap BEFORE strip (bounds work done
        // during strip — BUG-REGISTRY-006). See [[feedback_mcp_parameter_three_layers]],
        // [[feedback_zod_refine_before_transform]].
        z.string().transform((str, ctx) => {
          let parsed;
          try {
            parsed = JSON.parse(str);
          } catch {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON string for arguments' });
            return z.NEVER;
          }
          if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Arguments JSON string must encode an object' });
            return z.NEVER;
          }
          argsShapeRefine(parsed, ctx); // depth/leaf cap — adds issues → parse fails if tripped
          return deepStripDangerousKeys(parsed);
        })
      ])
        .refine((args) => {
          if (args === undefined) return true;
          try {
            const argsString = JSON.stringify(args);
            return argsString.length <= 25_000; // FIELD_LIMITS.SERVICE_CALL_ARGS — BC30 stack overflow guard via try/catch
          } catch {
            return false; // circular reference or other JSON.stringify failure → reject
          }
        }, 'Arguments object too large (>25KB stringified) or too deeply nested')
        .refine((args) => {
          if (args === undefined) return true;
          try {
            const argsString = JSON.stringify(args);
            // Cross-trust priority — protects EXTERNAL services from forwarded
            // injection patterns. data:/file:/import() prioritized per sec-ops
            // Finding A (Phase 3 verdict matrix).
            return !/(?:<script\b|on\w+\s*=|javascript:|vbscript:|data:[^,]*[bB]ase64|file:|exec\s*\(|eval\s*\(|import\s*\()/i.test(argsString);
          } catch {
            return false;
          }
        }, 'Arguments contain dangerous injection patterns')
        .optional(),
      timeout: z.number().int().min(1000).max(300000).optional().describe("Per-call timeout in ms (1000–300000). Overrides the service's configured ceiling for this call, clamped to 300000ms. Omit to use the service default."),
      // health params
      serviceId: z.string().optional().describe("Service ID for health check"),
      service_name: z.string().optional().describe("Service name for health check"),
      includeDiagnostics: z.boolean().optional().default(false),
      realtime: z.boolean().optional().default(false),
      // workflow.execute params (Phase 4 — bounds use WORKFLOW_* constants
      // declared at the top of this file; KEEP IN SYNC with engine schema
      // via scripts/test-workflow-schema-alignment.ts)
      workflowName: z.string().optional(),
      steps: z.array(z.object({
        service: z.string(),
        tool: z.string(),
        // F1/Q4 — workflow step arguments also forwarded across trust boundary.
        // Sec-ops Finding C (2026-05-17) — symmetric coverage with
        // services.call.arguments above. Was previously protected only by
        // deepStripDangerousKeys; depth + leaf-count caps now applied here
        // too. Per architectural-review + mcp-tool-architecture convergent
        // finding: both forwarded-args sites need the same protection profile.
        //
        // BUG-REGISTRY-003 sibling fix (2026-05-23): superRefine moved BEFORE
        // transform. Previously '.transform(strip).superRefine(cap)' — if
        // deepStripDangerousKeys ever threw (circular refs, etc.) the
        // cap-check never ran, leaving the DoS gate bypassable through
        // transform-crashing inputs. Reorder is also a perf win — cap
        // check runs BEFORE the deep strip, so 100K-leaf payloads get
        // rejected without paying the strip cost.
        arguments: z.record(z.any())
          .superRefine((args, ctx) => { argsShapeRefine(args, ctx); })
          .transform(deepStripDangerousKeys)
          .optional(),
        dependsOn: z.array(z.number()).optional(),
        retries: z.number().min(STEP_RETRIES_MIN).max(STEP_RETRIES_MAX).optional(),
        retryDelay: z.number().min(STEP_RETRY_DELAY_MIN).max(STEP_RETRY_DELAY_MAX).optional(),
      })).max(WORKFLOW_STEPS_MAX).optional(),
      executionMode: z.enum(WORKFLOW_EXECUTION_MODES).optional().default('sequential'),
      failureStrategy: z.enum(WORKFLOW_FAILURE_STRATEGIES).optional().default('stop'),
      maxTotalRetries: z.number().min(WORKFLOW_RETRY_BUDGET_MIN).max(WORKFLOW_RETRY_BUDGET_MAX).optional().default(WORKFLOW_RETRY_BUDGET_DEFAULT),
      povId: z.string().optional(),
      taskId: z.string().optional(),
      // workflow.status / workflow.cancel params
      executionId: z.string().optional().describe("Workflow execution ID"),
      // Phase 3 C1 migration — FIELD_LIMITS.SHORT_TEXT (500) DoS bound; was
      // unbounded at L1 (mcp-hub-validation.ts:201 had .max(500) but L1 didn't).
      reason: z.string().max(500).optional().describe("Reason for cancellation"),
      // workflow.list params
      status: z.enum(["RUNNING", "COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"]).optional(),
      workflowType: z.string().optional(),
      offset: z.number().min(0).default(0).optional(),
      // shared
      limit: limitSchema,
    }).passthrough().transform(stripDangerousKeys)
  },

  registry: {
    title: "Manage Service Registry",
    description: `Register, update, delete, and inspect your MCP services in the hub.

WHEN TO USE:
  Yes: Register a new service, list/update/delete your services, inspect service tool schemas
  No: Discovering other services (use services action: "discover"), calling services (use services action: "call")

ACTIONS:
  register  - Register a new MCP service
  list      - List your registered services and identity
  update    - Update service configuration
  delete    - Permanently delete a service (GDPR Right to Erasure)
  tools     - Get detailed tool definitions for a service

EXAMPLES:
  registry(action: 'register', name: 'my-api', endpoint: 'https://api.example.com', category: 'data-services', capabilities: {tools: ['fetch', 'query']})
  registry(action: 'list')
  registry(action: 'list', status: 'ACTIVE', includeMetrics: true)
  registry(action: 'update', service_name: 'my-api', updates: {endpoint: 'https://new.api.com'})
  registry(action: 'delete', service_name: 'my-api', confirm: true)
  registry(action: 'tools', service_name: 'notification-service')

WORKFLOW:
1. registry(action: 'register', ...) - Register your service
2. services(action: 'discover') - Others find your service
3. registry(action: 'tools', service_name: '...') - Others discover your tool parameters
4. services(action: 'call', ...) - Others use your tools

RETURNS:
  register: { service: { id, name, status }, _meta }
  list: { user: { email, role }, services: [...], total, _meta }
  update: { service: { id, name, updated fields }, _meta }
  delete: { deleted: true, serviceName, _meta }
  tools: { service: { name, version }, tools: [{ name, description, inputSchema }], toolCount, _meta }

SEE ALSO:
  services - Discover, call, and orchestrate services
  search - Find resources by keyword`,
    inputSchema: z.object({
      action: z.enum(['register', 'list', 'update', 'delete', 'tools']).describe("Registry operation to perform"),

      // register params
      // Phase 3 C1 migration (2026-05-16) — constraints migrated from
      // mcp-hub-validation.ts:65-101 (the registry.register wired schema).
      // These fields are TOP-LEVEL register-only (not used by list/update/
      // delete/tools actions). The regex/refine constraints apply naturally
      // by surface — no action-discriminator needed because other registry
      // actions don't populate these fields.
      name: z.string()
        .min(1, 'Service name required')
        .max(100, 'Service name too long')
        .regex(/^[a-z0-9\-]+$/, 'Service name must be lowercase with hyphens only')
        .optional()
        .describe("Service name (lowercase, hyphens allowed)"),
      // Shared with updates.description below — see serviceDescriptionSchema.
      description: serviceDescriptionSchema
        .optional()
        .describe("Service description"),
      // Shared with updates.endpoint below — see serviceEndpointSchema.
      endpoint: serviceEndpointSchema
        .optional()
        .describe("MCP endpoint URL"),
      version: z.string()
        .regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (e.g., 1.0.0)')
        .optional()
        .describe("Semantic version"),
      // Shared with updates.capabilities below — see serviceCapabilitiesSchema.
      capabilities: serviceCapabilitiesSchema.optional().describe("Service capabilities"),
      authType: z.enum(['API_KEY', 'BEARER_TOKEN', 'OAUTH2', 'HMAC', 'NONE']).optional().describe("Authentication method"),
      category: z.enum(MCP_SERVICE_CATEGORIES).optional().describe("Service category"),

      // list params
      // Wave C C3 fix (2026-05-23, Hub validation Phase 3): aligned to Prisma
      // MCPToolStatus enum (ACTIVE/INACTIVE/ERROR/MAINTENANCE) + UX 'ALL'.
      // Previously: missing ERROR + MAINTENANCE — same drift class as
      // BUG-TEMPLATE-004 / BUG-ANALYTICS-007.
      status: z.enum(['ACTIVE', 'INACTIVE', 'ERROR', 'MAINTENANCE', 'ALL']).optional().describe("Filter by service status"),
      includeMetrics: z.boolean().optional().describe("Include performance metrics"),
      includeStatistics: z.boolean().optional().describe("Include hub-wide statistics"),

      // update params
      serviceId: z.string().optional().describe("Service ID if known"),
      service_name: z.string().optional().describe("Service name for lookup"),
      updates: z.union([
        z.object({
          // 2026-07-27 parity fix (D3): was `z.string().min(10).max(500)` with
          // no semantic screen, while register carried a charset regex. Neither
          // was right — see serviceDescriptionSchema. Same schema as register.
          description: serviceDescriptionSchema.optional(),
          // 2026-07-27 parity fix (D2): update previously accepted only
          // tool-NAME strings while register accepted tool objects, and its
          // string branch bypassed every cap. Same schema as register.
          capabilities: serviceCapabilitiesSchema.optional(),
          authType: z.enum(['API_KEY', 'BEARER_TOKEN', 'OAUTH2', 'HMAC', 'NONE']).optional(),
          category: z.enum(MCP_SERVICE_CATEGORIES).optional(),
          // 2026-07-27 parity fix: was a bare z.string().url(), which accepts
          // `internal://` and bypassed the hub gateway. Same schema as register.
          endpoint: serviceEndpointSchema.optional(),
          version: z.string().optional(),
          // Wave C C3 fix: aligned to Prisma MCPToolStatus (4 values).
          // Operators may need to manually set ERROR state to remove a
          // misbehaving service from rotation pending diagnosis.
          status: z.enum(['ACTIVE', 'INACTIVE', 'ERROR', 'MAINTENANCE']).optional(),
          healthCheckPath: z.string().max(200)
            .regex(/^\/[a-zA-Z0-9\-._~/:@!$&'()*+,;=%]*$/, 'Must start with / and contain only valid URL path characters')
            .refine(val => !val.includes('..'), { message: 'Path traversal sequences (..) are not allowed' })
            .optional(),
          rateLimit: z.object({
            requests: z.number().min(1).max(10000).default(100),
            windowMs: z.number().min(1000).max(3600000).default(60000)
          }).optional(),
          maxExecutionTime: z.number().min(1000).max(300000).default(30000).optional(),
          permissions: z.object({
            publicAccess: z.boolean().optional()
          }).optional()
        }),
        z.string().transform((str, ctx) => {
          // BC27 — deep strip dangerous keys after JSON.parse (N1+Q4 site).
          // updates is a nested object structure persisted to DB; depth-N strip.
          try { return deepStripDangerousKeys(JSON.parse(str)); }
          catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON string for updates" }); return z.NEVER; }
        })
      ]).optional().describe("Fields to update"),

      // delete params
      confirm: z.boolean().optional().describe("Confirm deletion (required to proceed)"),
    }).passthrough().superRefine((data, ctx) => {
      // BUG-REGISTRY-003 fix (2026-05-23): superRefine MUST run before
      // .transform() in the chain. Zod ordering rule: if inner-field
      // validation fails (e.g., updates.description too short), subsequent
      // .transform()/.refine() steps NEVER run. Previously the superRefine
      // sat after two transforms, so missing-identifier errors were hidden
      // behind unrelated inner-field failures.
      //
      // Reproduction (Registry pilot, fixed here):
      //   registry({action:'update', updates:{description:'short'}})
      //   → produces ONLY "updates.description: ..." instead of also
      //     "registry(action: 'update') requires serviceId or service_name".
      //
      // After this reorder: BOTH errors are returned (verified locally
      // 2026-05-23 — see commit message).
      // Phase 3 D — action-correlated required fields (2026-05-18).
      //
      // Per architectural-review F3 (Phase 1 diff review): the consolidated
      // registry schema cannot express "required-when-action=X" at the type
      // level. Without this refine, fields like `confirm` are blanket-optional
      // even though they are SEMANTICALLY REQUIRED for delete. The handler-
      // side checks (`service-delete-handler.js:108` etc.) provide today's
      // enforcement; this refine adds the SCHEMA-side guarantee so a future
      // refactor that removes a handler check doesn't quietly drop a safeguard.
      //
      // Lighter weight than full z.discriminatedUnion migration (~30-45min
      // vs 15-20h for 5 schemas); equivalent defensive properties for this
      // specific gap class. See cline_docs/follow-ups/phase-3-discriminated-union-design.md
      // for the full-migration design reference.
      if (!data || !data.action) return;

      if (data.action === 'register') {
        if (!data.name) ctx.addIssue({
          code: 'custom', path: ['name'],
          message: 'name is required for registry(action: "register")',
        });
        if (!data.endpoint) ctx.addIssue({
          code: 'custom', path: ['endpoint'],
          message: 'endpoint is required for registry(action: "register")',
        });
        if (!data.description) ctx.addIssue({
          code: 'custom', path: ['description'],
          message: 'description is required for registry(action: "register")',
        });
        if (!data.category) ctx.addIssue({
          code: 'custom', path: ['category'],
          message: 'category is required for registry(action: "register")',
        });
      }

      if (data.action === 'delete' && data.confirm !== true) {
        // The load-bearing safeguard. service-delete-handler.js:108 has the
        // handler-level check as defense-in-depth; this is the canonical
        // schema-side enforcement. GDPR right-to-erasure — destructive
        // action must require explicit acknowledgement.
        // Message intentionally does NOT prefix with "confirm: " — the
        // dispatch boundary error formatter (dispatch-with-schema.js:81)
        // already prepends the field path. Previous wording caused doubled
        // prefix output: "confirm: confirm: true is required..." (2026-05-23).
        ctx.addIssue({
          code: 'custom', path: ['confirm'],
          message: 'must be `true` to confirm GDPR delete (pass `confirm: true` to acknowledge)',
        });
      }

      if (data.action === 'tools' && !data.serviceId && !data.service_name) {
        ctx.addIssue({
          code: 'custom', path: ['serviceId'],
          message: 'registry(action: "tools") requires serviceId or service_name',
        });
      }

      if (data.action === 'update' && !data.serviceId && !data.service_name) {
        ctx.addIssue({
          code: 'custom', path: ['serviceId'],
          message: 'registry(action: "update") requires serviceId or service_name',
        });
      }
      // 'list' has no action-correlated required fields (lists by caller's identity)
    }).transform(stripDangerousKeys).transform((data) => {
      // Phase 3 C1 — authType default action-discriminator (LEAD option A).
      // mcp-hub-validation.ts:99-101 had `.default('NONE')` on authType.
      // Migrating to L1 naively via z.enum(...).default('NONE') would fire
      // for ALL 5 registry actions (list/update/delete/tools also). Per
      // sec-ops + LEAD recommendation: apply default ONLY when action ===
      // 'register' to preserve the BC76 N3 closure semantics without
      // fan-out. Smoke test #45 (fan-out): registry.list must NOT carry
      // authType in validated data.
      //
      // ORDER NOTE (BUG-REGISTRY-003 fix, 2026-05-23): these transforms
      // now run AFTER the superRefine (vs before). Effect: identifier-
      // checks fire even when inner-field validation fails, producing
      // complete error sets. stripDangerousKeys + authType-default still
      // apply on successful validation paths.
      if (data && data.action === 'register' && data.authType === undefined) {
        data.authType = 'NONE';
      }
      return data;
    })
  },
};

// Non-consolidated tool schemas (standalone tools that keep their own names)
const TOOL_SCHEMAS = {
  // ChatGPT Connector Tools
  search: {
    title: "Search pAIchart Resources",
    description: `Search across Projects (Proof of Value), tasks, agent activities, and templates for comprehensive research. Returns results in ChatGPT-compatible format for natural language queries.

WHEN TO USE:
✅ Natural language discovery across all resource types
✅ Don't know exact POV/task name but know keywords
✅ Quick exploration ("find email gateway projects")
❌ Need structured filters (use project instead)
❌ Already have resource ID (use fetch instead)

EXAMPLES:
• search("CyberDefense") → All CyberDefense resources (POVs, tasks, templates)
• search("validation security") → Security-related validation work
• search("QA testing") → Testing tasks and templates

WORKFLOW:
1. search("keywords") → Discover resources
2. fetch("pov-xyz") → Get full details for interesting result
3. perform(action: "task.update", ...) → Make changes

RETURNS:
Format: {results: [{id, title, url, ...}, ...]}
Note: search returns wrapped object {results: [...]}, fetch returns direct object

SEE ALSO:
• project - Structured POV/task filtering by status/region
• fetch - Get details for specific resource ID`,
    inputSchema: z.object({
      query: z.string().min(1).describe("Search query across all pAIchart resources")
    })
  },

  fetch: {
    title: "Fetch pAIchart Resource",
    description: `Retrieve detailed information for a specific resource including full content and metadata. Use the ID from search results (format: type-id, e.g., 'pov-123', 'task-456').

WHEN TO USE:
✅ Have resource ID from search results
✅ Need a condensed view (content cap is per type, in CHARACTERS: ~50K for summaries, ~100K for artifacts; oversized content is truncated and reports a \`_meta.truncation\` fact {returnedChars, totalChars})
✅ Cross-resource fetch (POVs, tasks, executions, templates)
❌ Need full POV details with team IDs (use project(action: "pov.details") instead)
❌ Need to search first (use search then fetch)

EXAMPLES:
• fetch("pov-cmgalshus00bcyx39sfdutido") → POV summary
• fetch("task-cmgalshy500fayx39xe8f4xn1") → Task with execution history
• fetch("template-cmf6gvbkl0005yxvvqayf35ug") → Agent template details

WORKFLOW:
1. search("keywords") → Find resources
2. fetch("type-id") → Get condensed details
3. If truncated and you need more: POV → project(action: "pov.details"); task → project(action: "task.context"). A large ARTIFACT body is NOT fully retrievable through the connector (view it in the pAIchart app).

RETURNS:
Format: {id, title, text, url, metadata}
Note: fetch returns direct object, search returns wrapped {results: [...]}

SEE ALSO:
• project - Comprehensive POV data with team member IDs
• search - Find resources first`,
    inputSchema: z.object({
      id: z.string().min(1).describe("Resource ID from search results (format: type-id)")
    })
  },

  prompt_command: {
    // 2026-05-31: entry-point tool — opt out of client-side Tool Search deferral so it
    // loads at session start. Surfaced to clients via the _meta passthrough in
    // mcp-server-v5.js getToolCapabilities/getToolsForUser (+ stdio ListTools handler).
    _meta: { "anthropic/alwaysLoad": true },
    title: "Run Prompt Command",
    description: `Execute MCP prompt templates for guided workflows and automation.

WHEN TO USE:
✅ Execute workflow guidance prompts (orchestration, service registration)
✅ Run templated operations with pre-built prompts
✅ Discover available prompts with /prompt list
✅ Get help with /prompt help
❌ General search across resources (use search instead)
❌ Listing specific services (use services(action: "discover"))

EXAMPLES:
• prompt_command(command: '/prompt list') → List all available prompts
• prompt_command(command: '/prompt help') → Show usage guide
• prompt_command(command: '/prompt pov_health_check pov="BlackEye"') → Run focused POV health check

COMMON PROMPTS:
• task_audit_and_planning - Run a complete POV portfolio audit
• pov_health_check - Focused single-POV health check
• HOWTO-get-started - Interactive guide for new users

COMMAND FORMAT:
• Basic: /prompt [name]
• With args: /prompt [name] key=value key2="value with spaces"
• List: /prompt list
• Help: /prompt help

WORKFLOW:
1. list_prompts() → Discover available prompts
2. prompt_command(command: '/prompt [name]') → Execute prompt
3. Follow prompt output for next steps
4. Use perform(action: "task.create", ...) for any resulting tasks

SEE ALSO:
• list_prompts - Search prompts by domain/category
• perform - Create tasks from prompt guidance
• services(action: "discover") - Find available services`,
    inputSchema: z.object({
      command: z.string().describe('The prompt command (e.g., "/prompt list", "/prompt pov_health_check pov=BlackEye", "/prompt task_audit_and_planning")')
    })
  },

  // Legacy register_service, list_my_services, update_service, delete_service, get_service_tools
  // were consolidated into CONSOLIDATED_SCHEMAS.registry (Mar 2026)

  list_prompts: {
    // 2026-05-31: entry-point tool — opt out of Tool Search deferral (see prompt_command).
    _meta: { "anthropic/alwaysLoad": true },
    title: "List Available Prompts",
    description: `Search built-in prompt templates for common Hub workflows like service registration, discovery, and orchestration.

WHEN TO USE:
✅ Learning Hub workflows - see example prompts
✅ Finding orchestration templates
✅ Discovering service lifecycle prompts
✅ Getting started with multi-service workflows
❌ Listing MCP services (use services(action: "discover"))

EXAMPLES:
• list_prompts() → All available prompts
• list_prompts(query: 'orchestrate') → Workflow orchestration prompts
• list_prompts(domain: 'POV') → POV-specific prompts
• list_prompts(category: 'WORKFLOW') → Workflow templates only

SEARCH PARAMETERS:
• query - Free-text search across name and content
• domain - Filter by domain (POV, tasks, agents, general)
• category - Filter by type (WORKFLOW, ANALYSIS, ONBOARDING)

RETURNS:
• prompts - Array of prompt templates with name, description, category
• total - Count of matching prompts
• suggestions (if query used) - Related prompts you might want

PROMPT DOMAINS:
• POV - Proof of Value management prompts
• tasks - Task management workflows
• agents - Agent execution prompts
• general - Hub and service management

SEE ALSO:
• prompt_command - Execute a prompt template
• registry(action: "list") - Check your identity and services
• services(action: "discover") - Find available services`,
    inputSchema: z.object({
      query: z.string().optional().describe("Natural language query: 'help with firewall configuration'"),
      domain: z.string().optional().describe("Filter by domain (education, devops, medical, finance, legal)"),
      povId: z.string().optional().describe("Get prompts relevant to specific POV"),
      category: z.string().optional().describe("Filter by prompt category"),
      mcpOnly: z.boolean().default(true).describe("Only show MCP-tagged prompts"),
      includeUsage: z.boolean().default(true).describe("Include usage examples and descriptions"),
      limit: z.number().min(1).max(100).default(20).describe("Maximum prompts to return")
    })
  },

};

// Simple helper function to get schema with annotations
function getToolSchema(toolName) {
  const schema = CONSOLIDATED_SCHEMAS[toolName] || TOOL_SCHEMAS[toolName];
  if (!schema) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  
  // Add Anthropic Directory Policy compliant annotations
  const annotations = getToolAnnotations(toolName);
  if (annotations) {
    return {
      ...schema,
      annotations
    };
  }
  
  return schema;
}

// Jan Marshal's Simple & Reliable Validation - Direct schema validation only.
// Phase 5 boy-scout (2026-05-17) — converted from .parse() to .safeParse()
// per synthesis row 14 (validation-engine F4). The .parse() throw was being
// caught by today's caller, but a refactor of mcp-server-v5.js:1271 would
// turn validation errors into uncaught 500s. .safeParse() is the defensive
// pattern — return { success, data, error } discriminated union; throw
// only at the function boundary with consistent shape.
async function validateToolInput(toolName, input) {
  const schema = getToolSchema(toolName);

  // Simple direct validation with Zod schema (safeParse — no throw at boundary)
  const result = schema.inputSchema.safeParse(input);
  if (result.success) return result.data;

  const error = result.error;

  // Apply smart error recovery if enabled
  if (featureFlags.isEnabled('smartErrorRecovery')) {
    const recovery = await smartErrorRecovery.analyzeValidationError(error, toolName, input);

    if (recovery.canRecover && recovery.autoFix) {
      // Try auto-fix (also safeParse — no throw on auto-fix failure)
      const fixedResult = schema.inputSchema.safeParse(recovery.autoFix.fixedParameters);
      if (fixedResult.success) {
        log.info({ toolName, changes: recovery.autoFix.changes }, 'Auto-fixed parameters');
        return fixedResult.data;
      }
      // Auto-fix failed, enhance the original error
      const enhancedMessage = createEnhancedErrorMessage(error, recovery, toolName);
      throw new Error(enhancedMessage);
    } else if (recovery.canRecover) {
      // Provide enhanced error message with suggestions
      const enhancedMessage = createEnhancedErrorMessage(error, recovery, toolName);
      throw new Error(enhancedMessage);
    }
  }

  // Fallback to original error
  throw new Error(`Invalid input for tool ${toolName}: ${error.message}`);
}

// Create enhanced error message with recovery suggestions
function createEnhancedErrorMessage(originalError, recovery, toolName) {
  let message = `❌ **Parameter Error in ${toolName}**\n\n`;
  message += `${originalError.message}\n\n`;
  
  if (recovery.suggestions && recovery.suggestions.length > 0) {
    message += `💡 **Suggestions:**\n`;
    recovery.suggestions.forEach((suggestion, index) => {
      message += `${index + 1}. ${suggestion.description}\n`;
      if (suggestion.suggestedValue !== undefined) {
        message += `   Try: ${suggestion.parameter}: ${JSON.stringify(suggestion.suggestedValue)}\n`;
      }
    });
    message += '\n';
  }
  
  // Add tool-specific guidance
  message += getToolSpecificGuidance(toolName);
  
  return message;
}

// Resource alternatives for tools (MCP resource URIs)
const RESOURCE_ALTERNATIVES = {
  'project': {
    resource: 'mcp://database/pov-database',
    benefits: ['Real-time execution context', 'Enhanced filtering', 'Performance metrics'],
    examples: [
      'mcp://database/pov-database?status=IN_PROGRESS&limit=20',
      'mcp://database/task-database?status=IN_PROGRESS&priority=HIGH'
    ]
  },
  'template': {
    resource: 'mcp://database/agent-templates',
    benefits: ['Performance analytics', 'Usage statistics', 'Recommendation engine', 'Success rate tracking'],
    examples: [
      'mcp://database/agent-templates?sortBy=performance&category=ANALYSIS',
      'mcp://database/agent-templates?status=ACTIVE&includePerformance=true'
    ]
  }
};

// Get resource alternative for a tool
function getResourceAlternative(toolName) {
  return RESOURCE_ALTERNATIVES[toolName] || null;
}

/**
 * Get tool-specific guidance for common errors
 *
 * IMPORTANT: These are STATIC fallback messages.
 *
 * For DYNAMIC, context-aware error recovery, see:
 * - /lib/mcp/server/utils/smart-error-recovery.js (primary error handling)
 *
 * Smart Error Recovery provides:
 * - Enum mismatch → suggests closest match + valid options
 * - Type mismatch → suggests correct format with examples
 * - Missing parameters → suggests which parameter to add
 * - Resource not found → suggests using project(action: 'pov.list') first
 * - Auto-fix for common mistakes (if enabled)
 *
 * Static guidance below is used when:
 * - Smart error recovery is disabled (featureFlags.smartErrorRecovery = false)
 * - As fallback if dynamic recovery fails
 * - As additional context appended to smart recovery suggestions
 *
 * Keep these simple - smart-error-recovery.js does the heavy lifting!
 */
function getToolSpecificGuidance(toolName) {
  const guidance = {
    'project': '💡 **Tip**: Use action: "pov.list" with status like "IN_PROGRESS", "WON" (POV statuses: PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST). Use action: "pov.details" with povId or pov_name. Use action: "task.list" with status (task statuses: OPEN, IN_PROGRESS, COMPLETED, BLOCKED), priority, or assignee filters.',
    'perform': `💡 **Task Operations** (via MCP):
• Actions: task.create, task.update, task.assign, task.complete, task.comment
• Agent ops: agent.configure, agent.assign, agent.execute
• Status: OPEN, IN_PROGRESS, COMPLETED, BLOCKED

💡 **Tip**: Task-level = MCP tools, Project-level = Web UI`,
    'analytics': '💡 **Tip**: Use action: "recommendations" with type like "OPTIMIZATION", "AUTOMATION". Use action: "team.performance" with timeframe like "7d", "30d", "90d".',
    'template': '💡 **Tip**: Use action: "list" with agent_category for filtering. Use action: "details" with templateId or agent_template_name.',
    'services': '💡 **Tip**: Use action: "discover" with category or capability. Use action: "health" to check before calling. Use action: "call" to execute tools.'
  };

  return guidance[toolName] || '💡 **Tip**: Check parameter types and values';
}

// Jan Marshal's Simple & Reliable Sync Validation - Direct schema validation only.
// Phase 5 boy-scout (2026-05-17) — converted to safeParse for the same reason
// as validateToolInput above. Single throw point at the function boundary.
function validateToolInputSync(toolName, input) {
  const schema = getToolSchema(toolName);
  const result = schema.inputSchema.safeParse(input);
  if (result.success) return result.data;
  throw new Error(`Invalid input for tool ${toolName}: ${result.error.message}`);
}

module.exports = {
  TOOL_SCHEMAS,
  CONSOLIDATED_SCHEMAS,
  getToolSchema,
  validateToolInput,
  getResourceAlternative,
  getToolSpecificGuidance,
  RESOURCE_ALTERNATIVES,
  validateToolInputSync,

  // BC27 helpers exported for drift-detection smoke test
  // (test-mcp-phase1-smoke.ts asserts equality with the canonical TS source
  // at lib/utils/sanitize-keys.ts — catches inline-copy divergence at PR time)
  DANGEROUS_KEYS,
  stripDangerousKeys,
  deepStripDangerousKeys,

  // Export individual schemas for direct use
  limitSchema,
  timeframeSchema,
  prioritySchema,
  povStatusSchema,
  taskStatusSchema,
  projectStatusFilterSchema,
  contextDepthSchema,
  recommendationTypeSchema,
  impactLevelSchema,

  // Export enum constants for handler-level validation
  AGENT_CATEGORIES,
  AGENT_TEMPLATE_STATUSES,
  MCP_SERVICE_CATEGORIES,

  // Shared register↔update schemas — SINGLE SOURCE OF TRUTH.
  // Referenced by the L3 handler boundary (service-update-handler.js) so a
  // constraint cannot be tightened at L1 and silently missed at L3. Gate:
  // scripts/test-registry-field-parity.ts
  serviceEndpointSchema,
  serviceDescriptionSchema,
  serviceCapabilitiesSchema,
  SERVICE_DESCRIPTION_MAX,
  TOOL_NAME_MAX,
  TOOL_DESCRIPTION_MAX
};
