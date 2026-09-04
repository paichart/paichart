# Pattern Registry

**Purpose**: Quick reference for all proven implementation patterns in pAIchart knowledge library

**Last Updated**: July 27, 2026

**Total Patterns**: 64 documented patterns

---

## How to Use This Registry

**Before implementing a solution**:
1. Check this registry for existing patterns
2. Read the relevant pattern file for implementation details
3. Follow proven patterns instead of reinventing solutions

**Pattern Confidence Levels**:
- **90-95%**: Production-proven with specialist validation
- **85-90%**: Field-tested with strong evidence
- **75-85%**: Documented but needs more validation
- **<75%**: Experimental or draft

---

## Performance Patterns (17 patterns)

### **connection-pool-pattern.md** - 94% Confidence ✅
**When to use**: Reuse expensive connections (MCP clients, HTTP clients, WebSocket connections)
**Results**: 50-70% faster operations through connection reuse
**Key features**: Singleton pattern, LRU eviction, idle timeout, statistics tracking
**Production use**: ServiceConnectionPool (MCP service calls)

### **cache-lru-invalidation-pattern.md** - 95% Confidence ✅
**When to use**: Read-heavy operations with occasional mutations
**Results**: 50-95% faster queries with 70-80% cache hit rates
**Key features**: TTL expiration, LRU eviction, mutation invalidation, auth-aware keys
**Production use**: Service discovery, health checks

### **pagination-safety-cap-pattern.md** - 95% Confidence ✅
**When to use**: Every `findMany()` call needs a `take` parameter (safety cap or full pagination)
**Results**: 50-70% memory reduction, 40-60% faster responses, DoS vector closed
**Key features**: Two tiers (full pagination + safety caps), cap value guide, validation script
**Production use**: 253+ bounded calls, 100% effective coverage, `npm run validate:pagination`

### **parallel-query-optimization-pattern.md** - 98% Confidence ✅
**When to use**: Independent database queries (same WHERE clause, all reads)
**Results**: 40-50% faster for parallel count + findMany
**Key features**: Promise.all for independent reads, no race conditions
**Production use**: Service discovery pagination

### **api-efficiency-patterns.md** - 94% Confidence ✅
**When to use**: API design, query optimization, response efficiency
**Results**: 50-90% data transfer reduction through scoped filtering
**Key features**: POV-scoped filters, N+1 prevention, backward compatibility
**Production use**: Activity filtering, analytics endpoints

### **event-emitter-memory-safety.md** - 90% Confidence ✅
**When to use**: Event-driven systems with dynamic listeners
**Results**: Zero memory leaks from event listeners
**Key features**: Listener tracking, automatic cleanup, max listeners enforcement
**Production use**: PostgreSQL NOTIFY/LISTEN systems

### **global-singleton-health-monitoring.md** - 92% Confidence ✅
**When to use**: Cross-system health monitoring (MCP servers, databases, services)
**Results**: Centralized monitoring without redundant checks
**Key features**: Global singleton, periodic checks, error aggregation
**Production use**: MCP Hub health monitoring

### **database-drift-elimination-pattern.md** - 95% Confidence ✅
**When to use**: ALWAYS - for database schema changes
**Results**: Zero drift between development and production
**Key features**: db push everywhere, schema.prisma as single source of truth
**Production use**: All schema updates (replaces migrate dev/deploy)

### **sanctioned-db-push-exception-ops-script-pattern.md** - 97% Confidence ✅
**When to use**: Schema changes that `db push` CANNOT express — partial unique indexes, JSONB expression indexes, or `CREATE INDEX CONCURRENTLY` on production-scale tables
**Results**: 4 canonical instances in production, zero incidents. Aug 2025 raw-SQL partial index on agent_executions has survived 200+ `db push --accept-data-loss=false` deploys since drift-elimination
**Key features**: Hardened bash script (ON_ERROR_STOP, INVALID-index cleanup, post-create indisvalid + WHERE-clause verification, ANALYZE refresh); doc-only annotation on the Prisma model; sanctioned escape hatch from the db-push-everywhere default
**Pairs with**: database-drift-elimination-pattern (this is the escape hatch; that is the default)
**Production use**: L3 partial UNIQUE on agent_executions (Apr 2026), A6 partial JSONB on tasks (Apr 2026), 10× CONCURRENTLY P0 batch (Oct 2025)

### **global-prisma-singleton-pattern.md** - 98% Confidence ✅
**When to use**: ALWAYS - for ALL Prisma usage (mandatory pattern)
**Results**: Zero connection leaks, zero hot reload memory issues, optimal connection pooling
**Key features**: Global singleton, hot reload safety, 15-connection pool, PgBouncer compatibility
**Production use**: 179+ files, 32 facade extractions (100% adherence)
**Discovery**: memory-safety-audit-2025.md (Category 3: Connection Cleanup)
**Critical**: P1 High priority if violated (memory leaks, connection pool exhaustion)

### **transaction-atomicity-pattern.md** - 95% Confidence ✅ (NEW - Feb 2026)
**When to use**: Any operation writing to 2+ tables as one logical unit (execution + task, artifacts + execution)
**Results**: Zero partial state on failure, prevents orphaned artifacts and status mismatches
**Key features**: `$transaction(async (tx) => {})`, helper method inlining, SSE-after-commit pattern, race protection
**Production use**: 9 transaction blocks across 5 files (orchestration tracker, agent execution, API routes)
**Detection**: Grep for files with 2+ `await prisma.` writes and no `$transaction` — potential missing atomicity
**Intentional exceptions**: Fire-and-forget logging, single-table CRUD, parallel reads

### **fire-and-forget-activity-logging-pattern.md** - 96% Confidence ✅
**When to use**: Audit trail logging, analytics events, non-critical notifications
**Results**: Near-zero latency overhead (10-50ms saved per log), non-blocking writes
**Key features**: No await, internal error handling, void return type, source metadata tracking
**Production use**: 22 files (MCP handlers, API routes, services), Rich Activity Logging Phase 2.3-2.6
**Discovery**: taskActivityService.ts centralized logging functions
**Key difference**: Unlike parallel-query (reads), this is for non-blocking writes

### **time-bomb-detection-pattern.md** - 96% Confidence ✅
**When to use**: Detecting silent degradation issues (unbounded caches, missing cleanup, connection leaks)
**Results**: Prevents production crashes, 5 time bombs detected and fixed in MCP Hub investigation
**Key features**: Detection grep commands, 6 categories of time bombs, fix patterns with code examples
**Production use**: MCP Hub registry(action: "update") implementation (Jan 8, 2026), all 5 time bombs deployed to production
**Categories**: Unbounded caches, missing cleanup schedulers, session/connection leaks, OAuth state accumulation, session TTL without enforcement, singleton misuse
**Discovery**: MCP Hub specialist review, validated through implementation experience

### **transport-boundary-argument-coercion-pattern.md** - 96% Confidence ✅ (NEW - Feb 2026)
**When to use**: Any `client.callTool()` that crosses an MCP transport boundary (stdio→SSE, HTTP→SSE)
**Results**: Prevents silent argument type mutation that causes downstream -32603 validation failures
**Key features**: typeof guard + JSON.parse before callTool, z.union schema for string→object transform, grep audit commands
**Production use**: 4 external callTool sites + 8 P0 unguarded sites + 1 defense-in-depth (19 total sites cataloged)
**Bug family**: Same class as docker-mcp-service-gold-standard body-parser fix (transport boundary data mutation)
**Shared defense**: `ensureObject()` utility in `lib/utils/ensure-object.{ts,js}` + inlined in Docker services
**Discovery**: Feb 15, 2026 - services(action: "call") failing from Claude Code but working from Claude Desktop
**Eradication**: Bug Class 1 in `/.claude/knowledge/domain/mcp/bug-class-registry.md` (ERADICATED)
**Grep**: `\.callTool(` + verify ensureObject guard exists upstream

### **mcp-parameter-three-layer-pattern.md** - 98% Confidence ✅ (NEW - Apr 2026)
**When to use**: Adding any new parameter to an MCP action (task.create, task.update, agent.configure, etc.)
**Results**: Prevents silent parameter stripping at the validation boundary
**Key features**: Three-layer checklist (tool schema + validation schema + handler), Zod strips unknown fields by default
**Production use**: dependencyIds on task.create/update, confidence on task.complete
**Bug family**: Silent data loss at validation boundary — no error thrown, parameter simply absent
**Discovery**: Apr 4, 2026 — dependencyIds silently stripped, pipeline dependencies not created, two failed production tests
**Grep**: Check `MCPParameterSchemas['action.name']` in `mcp-action-validation.ts` for the field

### **dual-execution-path-parity-pattern.md** - ✅ RETIRED 2026-07-06 (convergence complete)
**Status**: RETIRED to adapter-render guidance. Engine + stream are now ONE shared core (`lib/services/execution-core.ts` `runExecutionCore`) + two thin presentation adapters — cross-path output drift is structurally impossible.
**When to use**: No longer a two-file sync checklist. To change an execution OUTCOME, change it once in the core (or the modules it calls: execution-artifacts/terminal-persist/quality/diagnostic-retry/parse-confidence/agentic-tool-loop). Adapters own only presentation (engine EventEmitter progress / stream SSE) + documented per-adapter facts (extensions N-6, prompt heads, `prune` transitional — Flip 2 gated; `fireReactors` CONVERGED both-true via Flip 1).
**Shipped**: Phase 6 core extraction — engine `ef768e7a`, stream `200dd0e7` (both UAT-banked). Drift-locked by `test:execution-core-boundary`, `test:sse-event-sequence`, `test:terminal-persist-ponr`, + retargeted single-core parity pins.
**History**: 4 parity fixes (Apr) → 5-site extraction (May) → tool-loop extraction (Jun) → Phase 0.5–6 convergence (Jul). Authoritative per-adapter record: `cline_docs/reviews/execution-path-convergence-2026-07-04/divergence-manifest.md`.

### **prompt-section-ownership-pattern.md** - 98% Confidence ✅ (NEW - Apr 2026)
**When to use**: Adding instructions that agents must follow — deciding system prompt vs user prompt
**Results**: Prevents cross-cutting instructions from being silently absent for custom-template agents
**Key features**: Ownership map (system = template-owned, user = engine-owned), decision rule
**Production use**: Confidence instruction moved from Universal Template (system) to §8 (user)
**Bug family**: Instruction present for Universal Template agents but absent for custom-template agents
**Rule**: "Does EVERY agent need this?" → Yes = user prompt (§8), No = system prompt (template)

---

## Architecture Patterns (12 patterns)

### **agent-prompt-assembly-pattern.md** - 95% Confidence ✅
**When to use**: Agent prompt construction — system prompt, user message, directive synthesis, context injection
**Results**: ~2,400 tokens saved per execution, eliminates description duplication, activates dormant outputSchema
**Key features**: CrewAI-aligned 5-field separation (backstory/directive/expected-output/description/context), shared placeholder resolution, synthesized directives
**Production use**: agentExecutionEngine, stream/route, agent-configure-handler
**Industry alignment**: CrewAI role/goal/backstory, LangGraph SystemMessage/HumanMessage, Claude Cowork outcome-oriented


### **facade-handler-extraction-pattern.md** - 98% Confidence ✅
**When to use**: Files >400 lines with multiple responsibilities (CRITICAL: >2,000 lines)
**Results**: 77-90% code reduction, all modules <400 lines, zero breaking changes
**Key features**: Extract handlers, thin facade, dependency injection, test-after-each, sequential phases
**Production use**:
- December 15, 2025: sdk-native-advanced-tools (2,415 → 452 lines, 81%), hub-tools-handler (2,306 → 611 lines, 73%)
- December 17-18, 2025: tasks/action route (4,441 → 449 lines, 90% - LARGEST file extraction)
**Success rate**: 32/32 extractions (100%), zero rollbacks needed
**Discovery**: facade-extraction-discovery.md (comprehensive grep commands)

### **domain-based-api-routing-pattern.md** - 92% Confidence ✅
**When to use**: API route organization by domain (POV, tasks, agents)
**Results**: Clear domain boundaries, easier navigation
**Key features**: Domain-based folder structure, consistent patterns
**Production use**: /api/pov/, /api/tasks/, /api/agent-*

### **authorization-dual-layer-pattern.md** - 94% Confidence ✅
**When to use**: Multi-tenant systems with resource-level permissions
**Results**: Secure resource access with user + resource validation
**Key features**: JWT validation + withPOVAccess middleware, metadata preservation
**Production use**: All POV/Phase/Task endpoints

### **mcp-metadata-exposure-pattern.md** - 95% Confidence ✅
**When to use**: MCP tools that need API metadata (totalPages, hasMore, etc.)
**Results**: 100% test coverage, dual-layer metadata preservation
**Key features**: MetadataEnhancer helper, API → MCP metadata pass-through
**Production use**: 30+ dual-layer tests, ChatGPT connector tools

### **internal-service-gold-standard-pattern.md** - 94% Confidence ✅ (NEW - Mar 2026)
**When to use**: Creating internal pAIchart services (same-process, zero HTTP latency)
**Results**: 3 services deployed, repeatable 5-step creation pattern, 6 quality standards
**Key features**: Registration in MCPTool, InternalServiceRouter handler, POV access validation, two service types (routable vs system/FK)
**Production use**: paichart-project-service, paichart-recommendation-engine, paichart-kpi-service
**Companion to**: mcp-tool-gold-standard-pattern.md (external tools) and docker-mcp-service-gold-standard-v2.md (Docker services)
**Anti-patterns**: No eval/new Function, no independent queries when contextData available, no MCP writes without explicit need

### **docker-mcp-service-gold-standard-v2.md** - 98% Confidence ✅
**When to use**: Creating new MCP services as Docker containers for Hub orchestration
**Results**: First-time-right deployments, 7 production services, External OAuth, trust level config
**Key features**: MCP SDK 1.25.3, SSE transport, JWKS auth, External OAuth, dual trust models, retry logic, service-specific .env
**Production use**: browser-automation, notification, weather, eia, eodhd, test-auth, snowflake (7 services)
**Critical fix**: `handlePostMessage(req, res, req.body)` - prevents "stream is not readable" error
**Discovery**: Jan 6, 2026 debugging session - SSE transport stream consumption conflict

### **admin-dashboard-data-flow-pattern.md** - 95% Confidence ✅
**When to use**: Admin-only dashboards aggregating metrics across ALL POVs (portfolio-wide)
**Results**: Proper admin RBAC, prevents POV scoping errors, cross-POV aggregation integrity
**Key features**: Role-based access (not validatePOVAccess), status-based filtering, cross-POV aggregation, Bloomberg UI
**Production use**: Admin Dashboard 4 tabs (Intelligence, Automation, Operations, Tools)
**Critical difference**: Admin uses role check + no povId filter; Analytics uses validatePOVAccess + povId filter

### **analytics-data-flow-pattern.md** - 98% Confidence ✅
**When to use**: User-facing analytics with POV scoping, IDOR prevention, URL sync
**Results**: Zero field leakage bugs, proper POV isolation, browser back/forward sync
**Key features**: 12-step data flow (POV selection → URL → API → validation → Prisma → UI), dependency array safety
**Production use**: AI Analytics Dashboard 5 tabs (Overview, Tasks, Insights, Agents, Tools&ROI)
**Critical difference**: Analytics uses validatePOVAccess + povId filter; Admin uses role check + no povId filter

### **pino-structured-logging-pattern.md** - 96% Confidence ✅ (NEW - Feb 2026)
**When to use**: Every server-side file (TS API routes, services, handlers, middleware, MCP JS servers)
**Results**: 348+ files migrated (310 TS + 38 JS), auto-redaction, 720+ correct error sites, zero regressions
**Key features**: Two-layer architecture (TS `lib/logger.ts` + JS `mcp-logger.js` with `createAdapter()`), domain child loggers, component child loggers, both pino-native and console-style calling conventions, `{ err: error }` serialization, security event tagging, ESLint + audit enforcement
**Production use**: Full codebase — `lib/logger.ts` root + 4 exported domain loggers + 40+ module loggers
**Anti-patterns**: `console.*` on server, message-only logging, wrong error key (`{ error }` instead of `{ err }`), manual secret logging
**Monitoring**: JSON filtering by level/domain/module with `grep` or `jq`

### **safe-modular-extraction-pattern.md** - 96% Confidence ✅ (NEW - Feb 2026)
**When to use**: High-risk refactoring of files >1,000 lines where you suspect silent failures or duplicated logic
**Results**: 1 silent bug class eliminated (cache key mismatch), 71 tests passing, zero regressions
**Key features**: 6-phase methodology (Discover → Contract → Extract → Modularize → Validate → Document), silent failure detection catalog, risk mitigation rules, parameterized discovery prompt
**Production use**: Resource manager dual-extraction (Feb 2026), pino migration (14 files)
**Discovery**: `pre-refactor-structural-mapping-discovery.md` (structural mapping before extraction)
**Key difference**: Facade pattern is mechanical extraction; this pattern is analytical — discover contracts and silent failures FIRST
**Next target**: `mcp-server-http-clean.js` (~3,886 lines as of 2026-05-21 post Waves 1-4 — IN PROGRESS; Wave 3b + Wave 5 + Wave 6 remaining for further decomposition)

### **tool-name-audit-taxonomy** - 97% Confidence ✅
**Location**: `/.claude/knowledge/domain/mcp/tool-name-audit-taxonomy.md`
**When to use**: Adding, renaming, or consolidating MCP tools; auditing legacy name leakage
**Results**: Mar 2026 sweep: 80+ files fixed across 6 commits, 0 regressions, caught 2 tests that would have broken silently
**Key features**: 7 categories (runtime, user-facing, observability, documentation, agent knowledge base, infrastructure, intentionally-kept), prompt name false-positive guide, validation protocol with 7 verification steps, recommended sweep order
**Production use**: Mar 2026 tool consolidation (22 legacy -> 6 consolidated tools). Agent knowledge base (Category 5) discovered as largest category (~90 files, ~1400+ refs).
**Referenced by**: `mcp-tool-architecture-specialist` agent

### **two-execution-path-drift-pattern.md** - 60% Confidence ⚠️ DRAFT (Apr 2026)
**When to use**: Detecting + remediating silent drift between two code paths that independently handle the same domain concern (tool loop, validation rule, dedup check)
**Results**: Caught `MAX_TOOL_TURNS` drift (engine read template metadata up to 100, stream route hardcoded 10 — 95% of harness runs silently starved); caught PIPELINE auto-complete skip missing in stream path
**Key features**: Grep-for-constant detection; mirror-change remediation with cross-reference comments; shared-extraction long-term fix; audit checklist when adding behavior near drift-prone paths
**Canonical instance**: Engine vs stream-route agentic tool loops (2026-04-14, fixed in `e008aba2`)
**Known latent sites**: Task-completion handling, execution terminal states, task creation — two+ call sites each
**Status**: Draft — one confirmed instance, 2-3 more needed before promoting above 60%. Related: `orchestration-reactor-pattern.md` §Common Pitfalls ("Multiple-execution-path drift")

---

## Security Patterns (15 patterns)
<!-- COUNT CONVENTION: this number is validated by `npm run validate:patterns` and counts only
     `.md`-BACKED entries (heading form `### **file.md**`). "Inline guidance" entries, which
     have no pattern file, are deliberately NOT counted — there are 2 in this section. Do not
     increment the header when adding one. (2026-07-28: incremented it for an inline entry and
     broke the validator; it was already red on the Total line, so nothing surfaced it.) -->

### **cache-key-as-trust-boundary** — Inline guidance (NEW 2026-07-27)
**Invariant**: *A cache entry may hold only data identical for every caller entitled to reach that key. Caller-dependent projection — authorization filtering, ownership hints, role-derived fields, identity echo — is computed AFTER retrieval, never stored.*
**Corollary (the part that is usually missed)**: a cache placed in front of an authorization filter **relocates the trust boundary to the cache key**. The key is then a security control and must be reviewed as one.
**When to use**: Reviewing or adding ANY cache whose value is derived per-caller, or that sits in front of a filter/permission check. Also the review lens for "the control exists but a path reaches around it."
**Three failure shapes this catches** (all three were live in the hub, 2026-07-27):
1. **Filtered value cached** — `services.discover` cached a fully per-caller-filtered response under a key whose only discriminator was a boolean. The *envelope* was the worst part: `user{id,email,role}`, `tier`, `capabilities.currentServices` are built in a DIFFERENT FILE (`public-discovery-filter.js`) from the strip logic everyone was reading, so they leaked unconditionally and survived every prior review of that handler.
2. **Key built from RAW args while the body is built from NORMALIZED args** — cache POISONING, not a hit-rate bug: `include_schemas:true` cached under the lightweight key. Neither "add userId to the key" nor "cache the unfiltered list" fixes this; only key-after-normalize does.
3. **Authorization sequenced BELOW the cache-hit return** — `services.health` returned health data on a hit without ever evaluating the caller's VIEW permission. A cache audit that looks only for caller-dependent *content* will miss this shape entirely.
**Positive controls — what right looks like**: `app/api/pov/route.ts:222` and `lib/tasks/handlers/get.ts:69` both key on userId **and** role, with an explicit comment naming the reason. Every violation found was in the JS MCP hub layer; every TS/REST cache had the invariant. **This is a knowledge-transfer failure across the TS/JS boundary, not a code bug class** — which is why the durable fix is a discovery tripwire, not a code sweep.
**Resolution bias**: if the caller-independent residue is small (here: raw rows from a 15-row indexed table) **delete the cache** rather than partition it. Deleting removed the leak, the poisoning, the timing oracle, the eviction primitive and the whole invariant surface, at a cost of one indexed query on 5.6% of calls. Prior art: the cross-user `recentServices` cache was likewise *gutted* rather than partitioned (2026-05-23, `parameter-normalizer.js:1052`).
**Testing discipline**: pin the invariant **behaviourally** — *"two callers, same args → each receives their own projection"* — never on key shape, or the test needs demolishing when the strategy changes. **Negative-control it**: `test:hub-discovery-caller-isolation` fails 10/22 against the pre-fix handler. ⚠️ A clean *live* run proved nothing here — prod has one distinct service owner, so the strip had nothing to demonstrate; a two-owner fixture reproduced instantly.
**Production use**: `service-discovery-handler.js` (cache deleted 2026-07-27), `service-health-handler.js` (auth hoisted above the hit; projection moved post-retrieval). Sweep of ~20 caches found no other violations.
**Related**: Bug Class 75 (Phantom Canonical Variant) — same generative shape, an optimization path that bypasses a canonical control. Discovery tripwires: `mcp-hub-discovery.md` §1b-ii. Full evidence: `cline_docs/reviews/hub-discovery-cache-caller-identity-2026-07-27/PANEL-SYNTHESIS.md`

### **audit-write-time-sanitize-pattern** — Inline guidance (NEW 2026-05-23)
**When to use**: Any new `prisma.activity.create` (or other JSONB persistence) site that writes user-controlled string fields into metadata. Same pattern when user input flows into `mcp_workflow_executions.input` / `steps`, `mcp_recommendations.actions[].description`, or any DB column an admin UI may later render.
**Results**: 7 sites covered in 2026-05-23 sweep (commit aa9e4d68); closed BUG-AUDIT-STORED-XSS D1, R3-3, R3-5, A5; established `sanitizeMetadataForAudit` walker as project-wide reusable helper.
**Key utility**: `lib/mcp/server/tools/response-sanitizer.js` exports `sanitizeMetadataForAudit(value, maxDepth=4)` — recursive object walker, escapeHtml on strings, prototype-pollution key strip, depth ceiling for DoS guard.
**Two-axes discipline (BC71)**: output-time sanitize at render is NOT sufficient for DB-stored XSS prevention. Every persistence site needs write-time escape AT the write call. See [[feedback_audit_write_time_sanitize]] memory + [[feedback_bc2_audits_two_axes]].
**Production use**: workflow-tools-handler.js (audit + execution write), hub-audit-service.js (permissions + config), compliance-monitor.js, trust-level.js, service-call-handler.js (3 sites)
**Anti-pattern**: relying on Zod input validation alone. The HTML-tag regex blocks `<script>` but lets `'-alert(1)-'` through (R3-5 finding).

### **coupled-atomic-schema-read-fix-pattern.md** - 95% Confidence ✅ (NEW 2026-05-15)
**When to use**: Eradicating a Bug Class 76 site ("validation bypass via post-safeParse raw-body read"). Required for any handler that mixes `validation.data` reads with raw `body`/`requestData` reads on schema-validated input.
**Results**: 7 BC76 sites eradicated atomically; 188 dual-layer tests locking the bug class; zero silent NULL drops in production
**Key features**: Schema expansion + read swap + smoke test ship as ONE commit (never split); Phase 0 production queries before deploy; Layer 1 pattern checks lock the fix structurally; explicit recommendation-coverage audit at synthesis time
**Production use**: BC76 sites #1-7 (2026-05-14 to 2026-05-15) — see bug-class-registry.md § Bug Class 76 for the full instance list
**Companion**: discipline rule for arch-review final-gate synthesis — walk this pattern's "Implementation Checklist" before emitting a post-edit projection; flag missing items as ship-blockers not bookkeeping

### **oauth-token-minting-not-passthrough.md** - 98% Confidence ✅ (NEW - CRITICAL)
**When to use**: OAuth integrations with GitHub, Microsoft, Google, etc.
**Results**: Prevents CRITICAL token scope leakage (0/10 → 9/10 security score)
**Key features**: First-party token minting, server-side provider storage, RS256 + JWKS validation
**Production use**: MCP OAuth callbacks (GitHub, Microsoft) - Fixed 2026-01-30
**Vulnerability**: GitHub token passthrough allowed external services to access user's repos

### **admin-page-hybrid-ssr-pattern.md** - 96% Confidence ✅ (NEW)
**When to use**: Admin-only pages requiring role-based access control
**Results**: Unauthorized users never receive component code, immediate server-side redirect
**Key features**: SSR page for auth gate, client component for UI, server-side audit logging
**Production use**: `/dashboard`, `/workflows` (January 2026)
**Migration targets**: `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/audit`

### **api-security-withPOVAccess-pattern.md** - 96% Confidence ✅
**When to use**: POV-scoped endpoints requiring multi-tenant isolation
**Results**: Prevents unauthorized access, metadata preservation, 8 documented pitfalls
**Key features**: withPOVAccess middleware, this.get() pattern, pizza test validation
**Production use**: 50+ POV/Phase/Task endpoints
**Complementary helpers**:
- `buildPOVAccessFilter(user)` — Multi-POV WHERE clause for list/dashboard endpoints (`lib/pov/auth/pov-access-filter.ts`)
- `getPOVForAccess(povId)` — Direct POV lookup for access validation (`lib/tasks/helpers/pov-access.ts`)

### **cross-domain-security-patterns.md** - 94% Confidence ✅
**When to use**: Applying security patterns across POV, tasks, agents domains
**Results**: Consistent validation, injection prevention, CUID enforcement
**Key features**: Reusable schemas, detectPromptInjection, UUID→CUID migration
**Production use**: UpdatePOVSchema, UpdateTaskSchema, UpdateAgentTemplateSchema

### **security-patterns.md** - 92% Confidence ✅
**When to use**: General security best practices (validation, sanitization, auth)
**Results**: Comprehensive security coverage
**Key features**: Input validation, XSS prevention, CSRF protection, rate limiting
**Production use**: Foundation for all security implementations

### **field-leakage-prevention-pattern.md** - 93% Confidence ✅
**When to use**: Prevent required fields from disappearing at boundaries
**Results**: 10-20x faster debugging, 5-minute comparative analysis
**Key features**: Boundary contract validation, JWT ↔ User, MCP ↔ API, DB ↔ Code
**Production use**: OAuth bugs Oct 20-21 (missing req.user.token, email/role)

### **mcp-api-context-differences.md** - 91% Confidence ✅
**When to use**: MCP tools vs API routes with different auth contexts
**Results**: Prevents security bugs from context confusion
**Key features**: Context detection, user ID extraction patterns, audit_all_tasks fix
**Production use**: MCP server tools with authenticated/unauthenticated flows

### **native-enum-pattern.md** - 98% Confidence ✅ (NEW - Feb 2026)
**When to use**: Any Zod schema validating values from a Prisma enum
**Results**: Zero enum drift between Prisma and Zod, 50/50 enum parity tests
**Key features**: `z.nativeEnum(PrismaEnum)` instead of `z.enum([...])`, canonical schemas in `enum-validation.ts`, audited exception table
**Production use**: 37 Prisma enums covered, full audit Feb 2026 (1 fix, 9 files verified intentional)
**Discovery**: `npm run test:enum-parity` (dual-layer: consistency + behavior)

### **security-fix-checklist.md** - 88% Confidence ✅
**When to use**: Quick reference for fixing unvalidated endpoints
**Results**: Fast security fixes with consistent patterns
**Key features**: 5-step checklist (schema, UUID→CUID, enums, .safeParse, logging)
**Production use**: Weekly security fixes

### **oauth-phantom-user-detection.md** - 96% Confidence ✅ (NEW - Feb 2026)
**When to use**: OAuth user lookup with Prisma connection pooling (pgbouncer transaction-mode)
**Results**: Prevents CRITICAL phantom user authentication (CVSS 8.5 → 0.0)
**Key features**: findUnique() verification after findFirst(), stale cache detection, provider ID canonical
**Production use**: MCP OAuth validator (GitHub, Google, Microsoft) - Fixed 2026-02-10
**Pattern**: Double-check with PRIMARY KEY lookup to bypass connection cache
**Grep**: `findFirst.*oauth.*OR.*email` (finds vulnerable OR clauses)

### **oauth-provider-id-canonical.md** - 98% Confidence ✅ (NEW - Feb 2026)
**When to use**: Multi-provider OAuth authentication (GitHub, Google, Microsoft)
**Results**: Prevents account takeover via email reuse (+15 security points)
**Key features**: Match ONLY by (oauthProvider, oauthProviderId), never by email, unique constraint
**Production use**: OAuth user lookup across 3 providers - MCP path fixed 2026-02-10; **web path adopted Wave 2 2026-06-21** (commit ed615ebe; CI-pinned in test-security-invariants.ts §H)
**Pattern**: Provider ID immutable, email can change/collide, use `@@unique([oauthProvider, oauthProviderId])`. Email permitted ONLY as a gated cross-provider link fallback.
**Grep**: `findFirst.*OR.*email.*oauth` (finds email-based OAuth lookups)

### **phased-security-deployment.md** - 93% Confidence ✅ (NEW - Feb 2026)
**When to use**: Critical security fixes requiring low-risk deployment
**Results**: Zero rollbacks, transparent to users, comprehensive validation
**Key features**: P0 (immediate code), P1 (constraints), P2 (validation/audit), defense-in-depth
**Production use**: OAuth phantom user fix (4 commits, 96% confidence, 0 issues)
**Pattern**: Layer fixes (remove vulnerability + detection + enforcement + monitoring)
**Evidence**: 3 specialist reviews, all approved, successful deployment

### **handler-level-authorization-pattern.md** - 92% Confidence ✅
**When to use**: Action-specific permissions in multi-action tools (vs tool-level ADMIN_TOOLS)
**Results**: Fine-grained per-action authorization, future-proof permission evolution
**Key features**: 2-layer defense (tool auth + handler authz), resource-aware checks, single enforcement point
**Production use**: pov.create in perform(action: "execute") (14 actions, each with unique security)
**Security score**: 92/100 (sec-ops validated, 0 bypass paths found)
**Key difference**: Handler-level for complex/evolving permissions; tool-level for simple ADMIN-only

### **identity-preserving-token-forwarding-pattern.md** - 94% Confidence ✅ (NEW - Mar 2026)
**When to use**: MCP tools making internal API calls on behalf of users
**Results**: Zero privilege escalation paths, user identity preserved at every boundary
**Key features**: Three-tier fallback (in-process → authenticated HTTP → fail closed), buildTokenPayload guards, admin fallback blocked on writes
**Production use**: Perform tool three-tier refactor (Mar 2026) — token forwarded through 3 auth paths
**Known limitation**: DEMO_USER gets write access to demo POVs via `isDemo` flag
**Grep**: `routeAction\|Tier 2\|buildTokenPayload` in task-action-handler.js

---

## Agent Template Patterns (2 patterns)

### **agent-template-gold-standard-pattern.md** - 95% Confidence ✅ (NEW - Apr 2026)
**When to use**: Creating, reviewing, or rationalizing agent templates
**Results**: 8-point quality checklist, eliminates naming conflicts, scope overlap, and prompt quality gaps
**Key features**: GS1-Naming, GS2-Role Guidance, GS3-Prompt Structure, GS4-Category Alignment, GS5-Pre-flight Checks, GS6-Output Rules, GS7-Seed Script Safety, GS8-Template Differentiation
**Production use**: MCP Service Orchestrator + Workflow Orchestrator (Apr 2026), 4 templates built to gold standard
**Discovery**: Sections 17-21 in `template-system-discovery.md` (inventory, GS2/4/8 audits, prompt quality)
**Specialist**: template-system-specialist has full gold standard integration + rationalization workflow
**Model selection**: by **tier**, from `lib/agents/model-tiers.ts` (`AGENT_MODELS.infra|generic|synthesis|orchestrator`) @ temp 0.3 — **never a literal in a seed script** (hoisted 2026-08-09; the literal was previously duplicated 15× across 9 seeds, so a migration could silently half-apply)

### **prompt-library-gold-standard-pattern.md** - 92% Confidence ✅ (NEW - Apr 2026)
**When to use**: Creating, reviewing, or maintaining database prompts (agent_prompt_library table)
**Results**: 6-point quality checklist for 3 prompt types (interactive, protocol, workflow)
**Key features**: GS1-Prompt Types, GS2-Tags (mcp/protocol/interactive/workflow/domain:*), GS3-Handlebars Safety (no nested {{#if}}), GS4-Protocol Rules (plain markdown, parallel guidance), GS5-Variable Definitions, GS6-Seed Script
**Production use**: pipeline-orchestrator-protocol + artifact-synthesis-protocol (Apr 2026), Pattern #45
**Companion to**: agent-template-gold-standard-pattern.md (Pattern #44 for templates)
**Specialist**: prompt-construction-specialist has Handlebars limitation + protocol creation guidance

---

## Automation Patterns (5 patterns)

### **orchestration-reactor-pattern.md** - 90% Confidence ✅ (NEW - Apr 2026)
**When to use**: A domain event (task completes, artifact created, milestone reached) should trigger orchestration action in another component — without coupling or polling
**Results**: Closes automation loops without LLM agents polling; reactor coverage = automation coverage
**Key features**: Event hook + guard chain + fire-and-forget queue action + structured logs; guard primitives library (status gate, in-flight, debounce, completeness, sanity)
**Production use**: pipelineRetriggerReactorService (Apr 2026) — queues harness SYNTHESIZE when last sibling terminal
**Strategic doc**: `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` (event catalogue + roadmap of 7 future reactors)
**Anti-patterns**: Not a handler, not a cron, not a workflow step — use only for async loop closure after tx commit
**Common pitfalls**: Context field shape drift across reactor boundary (see boundary-contract-wrapper-enforcement-pattern) — reactors amplify this class because read site is temporally far from the reactor

### **boundary-contract-wrapper-enforcement-pattern.md** - 94% Confidence ✅ (NEW - Apr 2026)
**When to use**: N independent writers assemble the same JSONB blob or loosely-typed record and drift would be silently absorbed downstream
**Results**: Would have caught 2026-04-15 reactor userId drift at write-time; 6 sites standardized in one migration; zero regressions across 7 prod executions exercising all 4 source enum values
**Key features**: Strict Zod schema (`.strict()` + `.cuid()` on IDs + required discriminator enum) + canonical wrapper function + automated grep test; asymmetric enforcement (hard-throw at write, soft-warn+fallback at read for legacy rows); `BoundaryContractViolation` error class
**Production use**: `lib/services/agent-execution-create.ts` (Apr 2026) — 6 write sites migrated; task #85 reactor-userId propagation
**Specialist validation**: boundary-contract 94% + sec-ops 93% + architectural-review 94% + validation-engine ship + database-manager 92%
**Companion patterns**: orchestration-reactor-pattern (reactors are a common source of N-writer drift); fire-and-forget-activity-logging-pattern (audit writes use it); field-leakage-prevention-pattern (sibling "validate at boundary")
**Anti-patterns**: Documentation-only shape rules; per-writer soft-parse; joining audit-log write to create transaction; using `'system'` enum as silent fallback

### **agent-output-trustworthiness-defense-stack-pattern.md** - 91% Confidence ✅ (NEW - Apr 2026)
**When to use**: Agent execution can produce SUCCESS that masks structural defects (failed tools, fabricated success narratives, wrong template assigned, harness skipped a step, budget rejection silently absorbed)
**Results**: 7 detection signals + 1 anti-fabrication correction turn; would have caught 2026-04-16 artifact-synthesis incident across 3 independent dimensions (BUDGET_EXHAUSTED, PROTOCOL_STEP_SKIPPED, narrative correction); zero control-flow changes; 23 unit tests; engine + stream-route parity
**Key features**: Additive signals (no SUCCESS/FAILED reclassification); single `errorCategory` cascade with co-occurring evidence fields (`protocolValidation`, `templateScopeMismatch`, `executionDegradation`); pure-function validators in `lib/services/*Matcher.ts`/`*Validator.ts`; anti-fabrication correction turn with `functions: []` to structurally prevent tool re-entry
**Signal cascade** (priority): TEMPLATE_MISMATCH_SELF_REPORTED (overrides) → BUDGET_EXHAUSTED → TOOL_LOOP_DEGRADED → TOOL_FAILURES → SILENT_REFUSAL → PROTOCOL_STEP_SKIPPED → ~~TEMPLATE_SCOPE_MISMATCH~~ (P9 RETIRED 2026-07-17: ~60 firings / 0 true positives; historical artifacts only)
**Production use**: `lib/services/agentExecutionEngine.ts` (engine path) + `app/api/pov/agent/execute/stream/route.ts` (stream path) — task #84 umbrella, tasks #82/87/88/89/90/91
**Companion patterns**: boundary-contract-wrapper-enforcement (sibling — additive signals at data boundaries vs execution outputs); orchestration-reactor-pattern (the reactor system this stack defends); dual-execution-path-parity (the parity discipline this stack obeys)
**Anti-patterns**: Don't make signals blocking; don't overload `executionDegradation` (use co-occurring fields); don't skip stream-route mirror; don't ship a detector without a regression test using the canonical incident shape

### **reactor-chain-depth-budget-pattern.md** - 88% Confidence ✅ (NEW - 2026-06-14)
**When to use**: A reactor's queued action can (directly or transitively) cause its own hook to fire again — so per-cycle guards bound a SINGLE firing but nothing bounds the chain (the Nth consecutive firing)
**Results**: Closes the "guards-bound-a-cycle-not-the-chain" gap; D-4 capped the harness retrigger chain (was depth-unbounded — `pipelineRetriggerReactorService.ts:281`) without self-starving legit pipelines; shipped `148e321a` + 10 pinned tests
**Key features**: Per-chain **generation budget** (count chain depth, not rows); mirrors workflow engine's `maxTotalRetries=10`; soft/best-effort (no advisory lock — the one-row invariant gives exact-once); routed through reactor-skip-counter as a FACT signal (no `securityEvent`); env-tunable
**Distinction to grade separately**: fan-out (breadth, idempotency-bounded) vs concurrency (rate, poller `take:5`-bounded) vs **depth (cumulative total, unbounded until a budget)** — "bounded rate ≠ bounded cost; a runaway bleeds, it doesn't spike"
**Production use**: `pipelineRetriggerReactorService` Guard 8 (2026-06-14) — pipeline-harness 88% + event-system 91%
**Strategic doc**: `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` § "Reactor Chain Depth"
**Companion patterns**: inherited-context-chain-state-pattern (the mechanism the counter rides); orchestration-reactor-pattern (the reactor this guards)
**Anti-patterns**: Per-cycle guards as a chain bound; per-user row-count cap (can't be set without self-starvation risk); bare `log.warn` for the stop; trusting a chain-state field read from a client-writable link

### **inherited-context-chain-state-pattern.md** - 88% Confidence ✅ (NEW - 2026-06-14)
**When to use**: You must carry state (counter, accumulator, flag) across a chain of SEPARATE executions where there is no shared memory — each link is a fresh process spawned by a poller/reactor
**Results**: D-4's generation counter survives across N retrigger executions; race-safe BY CONSTRUCTION (exact-once, no lock); reuses the channel that already carries `triggeredBy.id`
**Key features**: Persist state in the execution's **`context` JSONB**; each link reads the PRIOR link's context, increments, writes to its own `contextExtras`. **Race-safety rule**: a per-chain counter is exact-once **iff each chain step has a one-row DB guarantee** (here BC67 partial-unique + serial generations ⇒ concurrent readers race the same prior link, one wins). **Trust rule**: read a control-relevant chain-state field ONLY from a server-written link (a client-initiated first link may carry injected context)
**Anti-pattern it replaces**: copying the workflow engine's in-memory `retryState` — that resets every firing because a reactor chain is N executions, not one
**Production use**: `pipelineRetriggerReactorService.ts` `reactorGeneration` (2026-06-14)
**Strategic doc**: `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` § "Threading state through a reactor chain"
**Companion patterns**: reactor-chain-depth-budget-pattern (the budget that uses it); boundary-contract-wrapper-enforcement-pattern (the strict context shape it rides in); client-context-trust-boundary (the trust rule's origin)
**Anti-patterns**: In-memory counters across separate executions; colocating an exact-once chain counter with any feature allowing >1 active execution per step; reading chain-state from a client-writable link for a control decision

---

## Process & Workflow Patterns (8 patterns)

### **specialist-knowledge-propagation-pattern.md** - 95% Confidence ✅
**When to use**: After implementing patterns that should update specialists
**Results**: Closes self-improvement loop, 7 specialist updates systematically
**Key features**: Decision matrix for specialist updates, pattern extraction workflow
**Production use**: Meta-pattern for specialist enhancement

### **toolkit-execution-pattern.md** - 93% Confidence ✅
**When to use**: Executing toolkits with user-directed flow
**Results**: Fast wins (5-10 minutes), user control, immediate feedback
**Key features**: Step-by-step execution, user approval, proven patterns only
**Production use**: endpoint-security-fix-toolkit

### **batch-endpoint-remediation-guide.md** - 90% Confidence ✅
**When to use**: Fixing 5+ similar endpoints efficiently
**Results**: 80-90% time savings (4 hours vs 20 hours for 10 endpoints)
**Key features**: Domain grouping, shared schemas, parallel testing
**Production use**: POV security audit (11 endpoints), tasks (8 endpoints)

### **admin-ui-quick-wins-pattern.md** - 85% Confidence ⚠️
**When to use**: Admin dashboard development with rapid iteration
**Results**: Quick UI improvements with validated patterns
**Key features**: Component reuse, consistent UX, incremental enhancements
**Production use**: Admin panel features

### **mcp-tool-lifecycle-pattern.md** - 98% Confidence ✅ (NEW)
**When to use**: Adding, removing, renaming, or modifying any MCP tool
**Results**: Zero drift guaranteed across 7-layer pipeline (schemas, security, annotations, handler, facade, routing, docs)
**Key features**: Complete checklists for add/remove/rename/modify, dead code detection, verification commands
**Production use**: Feb 2026 cleanup (removed 4 tools, found ghost tools, 356 lines dead code, 139 stale doc references)
**Anti-patterns**: Partial registration, ghost annotations, dead helper methods, stale test scripts, documentation drift
**Discovery**: Feb 2026 cleanup session — every issue found would have been prevented by this checklist

### **post-change-specialist-review-pattern.md** - 95% Confidence ✅ (NEW)
**When to use**: After completing significant refactors, cleanups, or multi-file changes
**Results**: Found 4 P1 + 4 P2 issues that manual review missed in Feb 2026 session
**Key features**: Two-pass review (system-reviewer → domain-specialist), prompt templates, ROI analysis
**Production use**: Feb 2026 tool cleanup — system-reviewer found ghost configs, mcp-hub-specialist found dead code
**Key insight**: Different specialists catch different categories — structural vs semantic

### **multi-specialist-dead-code-deletion-pattern.md** - 95% Confidence ✅ (NEW - 2026-05-18)
**When to use**: Specialist review confirms code block has no consumers AND surfaces strategic work at adjacent sites
**Results**: Ship the minimal deletion as its own commit, defer strategic work to pre-scoped follow-up
**Key features**: 2+ specialist consensus via static-analysis trace (not runtime canary), reduce-then-defer scope split, traceability matrix audit (don't trust headline summary)
**Production use**: U2 Path A (`ec04a853`) + U2 Path B v3 (`9b2c2d08`) — 9 specialist reviews across 2 rounds, 96.6% post-edit projection
**Key insight**: Static analysis can resolve "is this dead?" in minutes; runtime instrumentation is fallback only. Audit the long-tail of multi-specialist reviews — headline 96% can hide 15+ missed action items.
**Validates**: feedback_dont_boil_ocean + feedback_grep_before_instrumentation + feedback_phantom_canonical_audit + feedback_specialist_recommendation_audit

### **shadow-validation-observation-window.md** - 92% Confidence ✅ (NEW - 2026-05-20)
**When to use**: Extracting a class from a monolith where the new class will be authoritative on a hot path. Want behavioral-equivalence evidence on real traffic before cutover.
**Results**: ~47 LOC shadow scaffolding (removed in flip commit) buys evidence-based confidence. Across 2 deploy cycles in Wave 3a, observed 0 disagreements → safe flip.
**Key features**: 4-step lifecycle (instantiate → introduce shadow → observe → flip-and-remove). Fire-and-forget comparison. Exceptions swallowed. Single audit event `<class>_dual_validate_drift` for grep-based gate. Shadow code deleted in the same commit that flips authority.
**Production use**: AuthManager extraction Wave 3a (Phase 3.4 → 3.6, commits `309e1f38` → `e80df8c4`). Phantom user guard pattern shipped twice (SessionStore in Wave 2, AuthManager in Wave 3a) — pattern validated on 2 extractions.
**Anti-patterns**: Skip the observation window (lose evidence); compare unstable fields (timestamps, random IDs); let shadow throw (production unaffected requires .catch); forget to remove shadow on flip (migration scaffolding becomes maintenance liability)
**Companion**: [[safe-modular-extraction-pattern]] (the 6-phase methodology; shadow window plugs into Phase 4-5)
**Validates**: feedback_audit_ownership_at_extraction + feedback_ts_port_behavioral_equivalence

---

## Frontend Patterns (2 patterns)

### **frontend-patterns.md** - 88% Confidence ✅
**When to use**: React component development, state management, UI patterns
**Results**: Consistent frontend architecture
**Key features**: Component patterns, hooks patterns, state management, error handling
**Production use**: Frontend codebase standards

### **shared-list-page-primitives-pattern.md** - 94% Confidence ✅
**When to use**: Any admin "list of things + edit one" page (sortable table → row actions → builder/editor)
**Results**: Three sibling pages unified on one design language; 2nd/3rd pages reuse 100% of the primitives
**Key features**: PageHeader / RowActionIcon / useSortableRows extraction; share-the-chrome / keep-page-shaped boundary; M1/M2/M3 runtime preservation when a table feeds an editor
**Production use**: /agents, /workflows, /prompt-library (Skills)

---

## UX Patterns (3 patterns)

### **mcp-tool-ux-pattern.md** - 98% Confidence ✅
**When to use**: MCP tool descriptions, error messages, user guidance
**Results**: 100% tool schema coverage, consistent error format, actionable recovery
**Key features**:
- Tool schema template (WHEN TO USE, EXAMPLES, SEE ALSO, [PARAMETERS])
- Error helper format (❌🔍💡🔧 emojis, fuzzy suggestions, next steps)
- Fuzzy search integration (4-tier scoring, `getScoredSuggestions()`)
**Production use**: 26 MCP tools (100% coverage), 3 error helper modules
**Discovery**: mcp-integration-discovery.md (Sections 19-21)

### **mcp-tool-gold-standards-spec.md** - 98% Confidence ✅ (registered 2026-07-28)
**When to use**: Grading ANY MCP tool surface against the gold standards — ours or a third party's. This is the canonical, platform-agnostic definition of GS1–GS15; the file to hand a stranger and say "grade my tool against this".
**Results**: Extracted from mcp-tool-gold-standard-pattern.md on 2026-05-05 so the standards could be stated without pAIchart file paths or team conventions. **GS11–GS15 (the plumbing standards) are defined ONLY here** — the pattern file defers to it rather than duplicating.
**Key features**: Part A (UX, GS1–10) + Part B (Plumbing, GS11–15), each with definition / success criteria / failure modes; cross-cutting interaction rules (e.g. content.text mirrors _meta); A+/A/A−/B+ grading rubric; self-audit procedure
**Production use**: The quarterly health-run grades with it (2026-07-27: services B+, registry B). GS14 is enforced in code by `dispatchers/dispatch-with-schema.js`; GS15 by the `qualityAssessment` field in `hub/service-tools-handler.js`.
**Companion**: `mcp-tool-gold-standard-pattern.md` (the pAIchart-specific implementation half — concrete paths, real code, which file to copy from). Public tutorial version: `tutorials/02-the-ten-gold-standards.md` in the paichart repo.
**Confidence rationale**: same 98% as its companion — this is the extracted canonical half of a single 98% pattern, not an independent claim.

### **mcp-tool-gold-standard-pattern.md** - 98% Confidence ✅
**When to use**: Upgrading MCP tools from "good" to "excellent" (builds on mcp-tool-ux-pattern baseline)
**Results**: 10 gold standards for A+ tool implementations, consistent excellence across all domains
**Key features**: Description UX (A+), workflow documentation, error categorization, state-aware responses, decision trees, centralized error helpers, success _meta, action handler response structure
**Production use**: 28-tool assessment + Dec 2025 UX enhancements, all 4 domains (Basic, Advanced, Browser, Hub)
**Prerequisite**: Baseline compliance with mcp-tool-ux-pattern.md

---

## Quick Decision Guide

**Performance issue?**
- Expensive connections? → connection-pool-pattern.md
- Slow queries? → parallel-query-optimization-pattern.md or cache-lru-invalidation-pattern.md
- High data transfer? → api-efficiency-patterns.md
- Memory leaks? → event-emitter-memory-safety.md
- Blocking audit/activity logs? → fire-and-forget-activity-logging-pattern.md
- Silent degradation over time? → time-bomb-detection-pattern.md
- Arguments failing across MCP transports? → transport-boundary-argument-coercion-pattern.md

**Architecture decision?**
- Large file (>400 lines)? → facade-handler-extraction-pattern.md
- Large file with suspected silent failures? → safe-modular-extraction-pattern.md
- API routing? → domain-based-api-routing-pattern.md
- MCP metadata? → mcp-metadata-exposure-pattern.md
- Admin dashboard (cross-POV)? → admin-dashboard-data-flow-pattern.md
- User analytics (POV-scoped)? → analytics-data-flow-pattern.md
- Server-side logging? → pino-structured-logging-pattern.md

**Security concern?**
- Action-specific permissions? → handler-level-authorization-pattern.md
- Multi-tenant access? → api-security-withPOVAccess-pattern.md or authorization-dual-layer-pattern.md
- Cross-domain security? → cross-domain-security-patterns.md
- Missing fields at boundaries? → field-leakage-prevention-pattern.md
- MCP vs API context? → mcp-api-context-differences.md
- Enum in Zod from Prisma? → native-enum-pattern.md
- Unvalidated endpoint? → security-fix-checklist.md

**Workflow optimization?**
- Need to update specialists? → specialist-knowledge-propagation-pattern.md
- Executing toolkit? → toolkit-execution-pattern.md
- Multiple similar fixes? → batch-endpoint-remediation-guide.md

**Database changes?**
- Schema update? → database-drift-elimination-pattern.md (ALWAYS use this!)
- Multi-table writes in one operation? → transaction-atomicity-pattern.md
- Non-critical logging? → fire-and-forget-activity-logging-pattern.md (intentionally NOT transactional)

**Frontend development?**
- React components? → frontend-patterns.md

**MCP tool UX?**
- Tool descriptions? → mcp-tool-ux-pattern.md
- Error messages? → mcp-tool-ux-pattern.md
- Fuzzy suggestions? → mcp-tool-ux-pattern.md
- Upgrade tool to A+ excellence? → mcp-tool-gold-standard-pattern.md

**MCP Docker services?**
- New Docker MCP service? → docker-mcp-service-gold-standard-v2.md
- SSE transport issues? → docker-mcp-service-gold-standard-v2.md (body-parser fix)
- Hub service registration? → docker-mcp-service-gold-standard-v2.md
- callTool arguments failing? → transport-boundary-argument-coercion-pattern.md

**Bug that might affect multiple places?**
- Systematic eradication? → `/.claude/knowledge/protocols/bug-class-eradication-protocol.md`
- Known bug classes? → `/.claude/knowledge/domain/mcp/bug-class-registry.md` (11 classes tracked)
- Transport boundary? → transport-boundary-argument-coercion-pattern.md (Bug Class 1, ERADICATED)
- Prisma Json columns? → bug-class-registry.md (Bug Class 2, ERADICATED)
- Form type loss? → bug-class-registry.md (Bug Class 3, MONITORED)
- Unhandled async in setInterval? → fire-and-forget-activity-logging-pattern.md (Bug Class 11, ERADICATED)
- Defensive code sweep (BC11 + TOCTOU + ensureObject)? → `/.claude/knowledge/discoveries/defensive-code-sweep-discovery.md`

---

## Pattern Cross-References

**Patterns that work together**:

- **connection-pool** + **facade-handler-extraction**: Connection pools fit naturally in extracted handlers
- **cache-lru** + **parallel-query**: Cache the results of parallel queries for maximum performance
- **parallel-query** + **fire-and-forget**: Parallel reads + non-blocking writes = maximum throughput
- **transaction-atomicity** + **fire-and-forget**: Complementary — transactions for critical writes, fire-and-forget for logging
- **pino-structured-logging** + **cross-domain-security**: Security events use structured pino context for monitoring
- **api-security-withPOVAccess** + **authorization-dual-layer**: Both implement multi-tenant security
- **facade-handler-extraction** + **mcp-metadata-exposure**: MetadataEnhancer used in extracted handlers
- **specialist-knowledge-propagation** + **ALL patterns**: Meta-pattern for updating specialists after pattern creation
- **docker-mcp-service-gold-standard** + **connection-pool**: Hub uses ServiceConnectionPool to manage service connections
- **transport-boundary-argument-coercion** + **docker-mcp-service-gold-standard**: Same bug family (transport boundary data mutation)
- **transport-boundary-argument-coercion** + **field-leakage-prevention**: Both guard data integrity at boundaries
- **admin-dashboard-data-flow** + **analytics-data-flow**: Complementary patterns (admin = cross-POV RBAC, analytics = POV-scoped)
- **handler-level-authorization** + **authorization-dual-layer**: Both implement authorization at different granularity (action vs resource)
- **identity-preserving-token-forwarding** + **field-leakage-prevention**: Both guard data integrity at boundaries (identity vs fields)
- **identity-preserving-token-forwarding** + **handler-level-authorization**: Handler auth depends on forwarded user identity being correct
- **mcp-tool-gold-standard** + **mcp-tool-ux**: Gold standard builds on UX baseline (prerequisite relationship)
- **safe-modular-extraction** + **facade-handler-extraction**: Safe extraction discovers contracts first, facade does mechanical extraction (Phase 4)
- **safe-modular-extraction** + **field-leakage-prevention**: Contract definition (Phase 2) uses boundary validation techniques
- **safe-modular-extraction** + **time-bomb-detection**: Silent failure detection (Phase 1) uses time-bomb categories
- **safe-modular-extraction** + **post-change-specialist-review**: Run specialist review after Phase 5 validation

**Patterns that prevent each other's problems**:
- **field-leakage-prevention** catches bugs that **authorization-dual-layer** might miss
- **database-drift-elimination** prevents issues that **security-patterns** assumes are fixed
- **mcp-api-context-differences** prevents confusion that **api-security-withPOVAccess** addresses
- **time-bomb-detection** catches degradation before **cache-lru** or **connection-pool** patterns are needed
- **transport-boundary-argument-coercion** prevents the type-mutation class of **field-leakage-prevention** bugs

**Bug class eradication workflow**:
- **transport-boundary-argument-coercion** + **docker-mcp-service-gold-standard**: Both are Bug Class entries (1 and 8) in the bug class registry
- **bug-class-eradication-protocol**: Meta-protocol that produced the ensureObject shared defense from a single bug report
- **bug-class-registry**: Tracks 11 known bug classes with status, sites, detection commands, and remediation
- **fire-and-forget** + **connection-pool**: Both updated with BC11/TOCTOU lessons (Feb 2026 defensive sweep)

---

## Statistics

<!-- RECOUNTED 2026-07-28. These figures had drifted badly — they claimed 43 patterns
     against an actual 64, and Performance 13 against an actual 17. The section headers
     above ARE validated by `npm run validate:patterns`; this block is NOT, so it decayed
     silently while every header stayed correct. Classic claim-staleness (Protocol 11
     Part B): every individual number plausible, the aggregate wrong.
     Recount with the loop in the health-run section, or just re-derive from the
     section headers — they are the validated source. -->

**By confidence level** (64 `.md`-backed entries):
- 90-100%: 57 patterns (89%) - Production-ready ✅
- 75-90%: 6 patterns (9%) - Needs validation ⚠️
- no % stated: 1 pattern (2%)

**By category** (matches the validated section headers above):
- Performance: 17 patterns (27%)
- Security: 15 patterns (23%)
- Architecture: 12 patterns (19%)
- Process & Workflow: 8 patterns (13%)
- Automation: 5 patterns (8%)
- UX: 3 patterns (5%)
- Agent Template: 2 patterns (3%)
- Frontend: 2 patterns (3%)

**Total line count**: ~15,500 lines of documented patterns

**Newest patterns** (December 2024 - February 2026):
1. connection-pool-pattern.md (Dec 15, 2024)
2. facade-handler-extraction-pattern.md (Dec 15, 2024)
3. cache-lru-invalidation-pattern.md (Dec 15, 2024)
4. parallel-query-optimization-pattern.md (Dec 15, 2024)
5. database-drift-elimination-pattern.md (Dec 17, 2024)
6. mcp-tool-ux-pattern.md (Dec 20, 2024)
7. fire-and-forget-activity-logging-pattern.md (Dec 31, 2024)
8. docker-mcp-service-gold-standard-v2.md (Jan 6, 2026)
9. time-bomb-detection-pattern.md (Jan 8, 2026)
10. mcp-tool-lifecycle-pattern.md (Feb 12, 2026)
11. post-change-specialist-review-pattern.md (Feb 12, 2026)
12. transport-boundary-argument-coercion-pattern.md (Feb 15, 2026)
13. native-enum-pattern.md (Feb 20, 2026)
14. transaction-atomicity-pattern.md (Feb 20, 2026)
15. pino-structured-logging-pattern.md (Feb 21, 2026)
16. safe-modular-extraction-pattern.md (Feb 26, 2026)
17. identity-preserving-token-forwarding-pattern.md (Mar 10, 2026)
18. agent-template-gold-standard-pattern.md (Apr 2, 2026)

**Most proven patterns** (98%+ confidence):
- parallel-query-optimization-pattern.md (98%)
- global-prisma-singleton-pattern.md (98%)
- facade-handler-extraction-pattern.md (98%)
- oauth-token-minting-not-passthrough.md (98%)
- native-enum-pattern.md (98%)
- oauth-provider-id-canonical.md (98%)
- mcp-tool-lifecycle-pattern.md (98%)
- mcp-tool-ux-pattern.md (98%) - 100% tool coverage

**Most impactful patterns** (>70% improvement):
- facade-handler-extraction-pattern.md (77% code reduction)
- cache-lru-invalidation-pattern.md (50-95% faster)
- connection-pool-pattern.md (50-70% faster)
- batch-endpoint-remediation-guide.md (80-90% time savings)

---

## Adding New Patterns

When documenting a new pattern:

1. **Create pattern file** in `/.claude/knowledge/patterns/[pattern-name].md`
2. **Include required sections**:
   - Pattern Overview (problem, solution, results)
   - When to Use This Pattern
   - The Pattern (code examples)
   - Performance/Results (real-world data)
   - Related Patterns
   - Confidence score + validation source
3. **Update this registry** with one-line description and confidence
4. **Cross-reference** related patterns
5. **Update CLAUDE.md** if pattern is fundamental (performance, security, architecture)

---

## Pattern Lifecycle

**Pattern Maturity Levels**:
1. **Draft** (<75%): Documented but not tested in production
2. **Field-tested** (75-85%): Used successfully 1-2 times
3. **Validated** (85-95%): Specialist-reviewed, 3+ successful uses
4. **Production-proven** (95-100%): Battle-tested, multiple deployments, zero regressions

**Retirement criteria**:
- Pattern superseded by better approach (keep for historical reference)
- Technology changed (mark as deprecated)
- Never used in 6+ months (move to archive)

---

**Next Review**: March 17, 2026 (quarterly pattern audit)
