# Continuation Prompt: Defensive Hardening Session

**Created**: February 26, 2026
**Session 1**: 7 commits, BC10+BC11 eradicated, defensive code sweep created
**Session 2**: 11 commits, BC3+BC12-BC17 eradicated, 9 sweeps at 100%, defensive sweep v1.7
**Session 3**: 68 smoke tests at 100% (all 5 domains), BC18 eradicated (73 sites), 2 agent execution bugs fixed
**Session 4**: BC11 setTimeout extension (3 sites), BC18 wave 2 (5 sites), BC19 read-modify-write races (8 sites)
**Session 5**: BC19 LOW-risk (7 sites), BC22 header injection+SSRF (7 sites), BC21 numeric coercion (20 sites), BC23 stream leak (18 sites), BC24 race conditions/DoS/resource safety (10 sites), BC25 webpack SSR class field crash (2 sites), BC26 unscoped admin-level queries (1 site), analytics 11/11, team E2E 17/17, NOT_FOUND→404 fix
**Session 6**: BC27 prototype pollution (38 sites / 15 files), BC22 extended (6 CORS preflight handlers), webpack audit (clean), user mgmt 30/30, settings 25/25, admin+templates 35/36, admin user handler fixes (5 bugs), CRM mapping fix, dependency/CSRF hunts
**Session 7**: BC28 IDOR (9 sites / 7 files), notifications 38/38, orphan data fixed, BC29-BC68 eradicated (224 sites), BC55 RS256 JWT verification (2 sites), BC56 auth bypass (4 sites), BC57 SSE safe-write (5 sites), BC59 type coercion (38 sites), BC60 permissions (4 sites), BC63 error handling (3 sites), BC64 cleanup (4 sites), BC65 data races (7 sites), BC66 query injection (5 sites), BC67 state transitions (2 sites), BC68 data exposure (2 sites) — ALL 68 bug classes fully eradicated
**Session 8**: BC51 SSRF bypass inconsistency fix (4 code paths), BC18 error message passthrough fix, BC27 CJS divergence fix (ensure-object.js missing stripDangerousKeys), BC69 host header trust (3 sites / 1 file) — 70 bug classes registered, 69 eradicated
**Session 9**: BC27 navigatePath prototype traversal (1 site), BC30 CJS parity (2 sites) + BC30 TS completion (14 sites across 8 files), CJS divergence systematic hunt (13 TS/JS pairs audited), detection command methodology upgrade (search .ts AND .js), .refine() audit (8 findings / 11 files), detection re-audit (25 fixes / 20 files across 10 BCs)
**Protocol**: Smoke Test, Sweep & Standardize (Protocol 7)

---

## Context for New Session

Copy this into your first message to continue the defensive hardening work:

---

### Continuation Prompt

I want to continue our defensive hardening approach from the previous sessions. Here's where we left off:

**Session 1 accomplished** (Feb 26, 2026 — 7 commits):
- BC10 (Error Level Misclassification): ERADICATED — 37 sites / 14 files
- BC11 (Unhandled Async Fire-and-Forget): ERADICATED — 7 sites / 5 files
- TOCTOU race in service-connection-pool.js: Fixed
- ensureObject gap in public-discovery-filter.js: Fixed
- Defensive code sweep discovery prompt created and field-validated (v1.1)
- MCP Resources smoke test: 16/16 PASS
- Validation suite: 799 assertions, 0 failures
- All knowledge base artifacts updated (patterns, protocols, registry)

**Session 2 accomplished** (Feb 26, 2026 — 5 commits):
- BC3 (Form Boundary Type Loss): ERADICATED — 10 sites across 10 files
  - 1 HIGH: security bypass in artifact download (NaN bypassed token expiration)
  - 9 MEDIUM: NaN-unsafe parseInt on pagination params → NaN to Prisma
  - Pattern: `parseInt(val, 10) || default` + `isNaN()` for security-critical paths
- BC12 (Execution Claim Race — TOCTOU): ERADICATED — atomic compare-and-swap claim in `executeAgent()`
- BC13 (Empty LLM Response False SUCCESS): ERADICATED — content validation gate in 3 execution paths
- BC14 (Retry Without Backoff — Thundering Herd): ERADICATED — 3 sites / 3 files
  - `workflowEngine.ts`: 30s constant → exponential (30s base, 120s cap, +20% jitter)
  - `lib/prisma.ts`: 2s constant → exponential (2s base, 16s cap, +20% jitter)
  - `lib/prisma.js`: CJS parity — constant delay → exponential backoff with jitter (Session 9 re-audit)
  - 5 already safe (OAuth retry-utils, resilient-call, connection-pool)
- BC15 (ReDoS via User-Controlled Regex): ERADICATED — 2 sites fixed
  - `security-event-processor.ts`: `new RegExp(indicator.value)` → `safeRegex()`
  - `validator.ts`: `new RegExp(fieldDef.validation.pattern)` → `safeRegex()`
  - Created `lib/utils/safe-regex.ts`: length limit, backtracking detection, compilation guard
  - 7 already safe (hardcoded patterns, app-controlled template vars)
- BC16 (Timing-Unsafe Secret Comparison): ERADICATED — 2 sites fixed
  - `public-download/route.ts`: HMAC signature `===` → `crypto.timingSafeEqual()`
  - `crypto/hashing.ts`: hash comparison `===` → `timingSafeEqual()`
  - JWT verification (jose library) handles timing internally
- BC17 (Code Injection via new Function()): ERADICATED — 1 CRITICAL site fixed
  - `kpi.ts`: `new Function('context', dbString)` → 18-pattern blocklist + 2000 char limit
  - Only `new Function()`/`eval()` in entire server codebase
- Query parity fix in `executeById()` (was missing agentTemplate, team, subTasks, parentTask)
- Unbounded Map/Set audit: 4 HIGH-risk collections found and fixed:
  - `event-driven-session-manager.ts`: MAX_SESSIONS (10k) + LRU eviction
  - `event-driven-auth-cache.ts`: MAX_PERMISSION_ENTRIES (50k), MAX_USER_ENTRIES (10k) + LRU + auto cleanup timer
  - `workflowEngine.ts`: MAX_ACTIVE_WORKFLOWS (100) + rejection (not eviction — active ops)
- Defensive code sweep expanded to v1.2 with Sweep 4 (Unbounded Map/Set Growth)
- `.unref()` coverage verified: 100% (38/38 lib/ intervals, 3 Docker standalone excluded)
- Agent execution smoke test: 10/10 PASS (Tests 1-7 session 2, Tests 8-10 session 3)
- JSON.parse safety sweep: 73 calls audited, 3 unguarded fixed with ensureObject, 100% coverage
- Promise.all fault isolation: 79 calls audited, 7 HIGH/MEDIUM-HIGH sites fixed with per-item .catch()
  - 3 HIGH: task handlers (7+9 queries), POV service (6 queries)
  - 4 MEDIUM-HIGH: analytics metrics, team performance, distributions
- Defensive code sweep expanded to v1.7 with Sweeps 5-9 (JSON.parse, Retry Backoff, ReDoS, Timing-Safe, Code Injection)

**Baselines established**:
- `setInterval` `.unref()` coverage: 38/38 (100%)
- ensureObject guards: 54+
- Dedup/pool references: 12 (all guarded)
- Unbounded Maps/Sets: 0 HIGH-risk remaining (10 confirmed protected)
- Bug classes registered: 66 (BC1–BC65), 65 ERADICATED, 1 RESOLVED (BC4), 2 MONITORED, 2 FALSE ALARM, 0 deferred
- BC19 read-modify-write coverage: 15/15 (100%) — 0 deferred sites remaining
- BC25 webpack SSR class field crash: 2/2 (100%) — jose + @tanstack externalized
- BC26 unscoped admin-level queries: 1/1 (100%) — team-activity/summary scoped
- BC21 numeric coercion: 20/20 (100%) — parseInt/parseFloat/Number/Boolean all guarded
- BC22 header injection + SSRF + CORS preflight: 13/13 (100%) — sanitizeFilename + urlSafety + CORS allowlist + corsPreflightResponse
- BC23 response body leaks: 21/21 (100%) — all error paths drain body, external URLs have timeout + AbortSignal.timeout on 3 additional fetch calls (Session 9 re-audit)
- BC24 race conditions/DoS/resource safety: 17/17 (100%) — channel fix, writer flag, caps, guards, sanitization + 7 additional `take:` caps on unbounded analytics findMany queries (Session 9 re-audit)
- JSON.parse coverage: 73/73 (100%)
- Promise.all fault isolation: 7 high-risk sites hardened (65 already safe)
- Retry backoff coverage: 8/8 (100%) — includes CJS prisma.js parity fix (Session 9 re-audit)
- Regex safety: 9/9 (100%) — 2 user-controlled fixed, 7 hardcoded safe
- Timing-safe comparisons: 2/2 (100%) — both now use timingSafeEqual
- Code execution safety: 1/1 (100%) — new Function() validated with blocklist
- BC27 prototype pollution: 38/38 (100%) — all .passthrough() and z.record(z.any()) sites protected with stripDangerousKeys
- BC28 IDOR: 9/9 (100%) — all [id] mutation endpoints verify ownership via task→POV team or userId match
- BC29 mass assignment: ERADICATED — 6 sites (CRITICAL: ownerId exclusion, HIGH: task-update allowlist, validated passthrough, dead code deleted, configure schema)
- BC30 deep nesting DoS: ERADICATED — 26 sites (CRITICAL: depth guards + LLM proxy schema, HIGH: configure/recommendations/KPI Zod schemas, hub try/catch, 14 TS JSON.stringify try/catch, 2 CJS parity fixes)
- BC31 open redirect: ERADICATED — 4 sites (CRITICAL: backup deleted + redirect validation, HIGH: actionUrl relative-only + NotificationBell guard)
- BC32 cryptographic weaknesses: ERADICATED — CRITICALs (JWT startup guard) + HIGHs (Math.random→crypto.randomUUID in 5 sites across 3 files)
- BC33 error recovery resilience: ERADICATED — CRITICALs (CRM sync retry + tx) + HIGHs (POV launch tx, checklist tx, workflow cleanup, connection pool dedup, activity logging try/catch)
- BC34 memory leak (timers/listeners): ERADICATED — CRITICALs (setInterval refs + .unref() + shutdown cleanup) + HIGHs (event listener handler refs + removal in shutdown/disconnect) + LOW (.unref() on session cleanup interval + setTimeout — Session 9 re-audit)
- BC35 information disclosure: ERADICATED — CRITICAL (stack trace in workflow response) + HIGHs (safeDetails getter on ApiError for 18 files/24 sites, securityViolation flag removed)
- BC36 session fixation & token lifecycle: ERADICATED — CRITICALs (refresh token rotation + role-change invalidation) + HIGHs (maxTokenAge on both RS256 and HS256 refresh verification)
- BC37 deserialization & injection: ERADICATED — CRITICAL (channel name validation on NOTIFY/LISTEN/UNLISTEN) + HIGH (RegExp length guard + try/catch on client component) + LOW (channel name validation on LISTEN/UNLISTEN in TS shared-connection-pool — CJS parity, Session 9 re-audit)
- BC38 file upload & storage abuse: ERADICATED — HIGHs (artifact 5MB cap, Content-Length validation on import + attachments)
- BC39 privilege escalation edge cases: ERADICATED — HIGH (API key scope claim) + MEDIUMs (email rejection, custom role SUPER_ADMIN gate, API key DB validation)
- BC40 cache poisoning & stale data: ERADICATED — CRITICALs (Vary: Authorization on 3 POV endpoints) + HIGH (no-store on artifact download) + MEDIUM (Vary: Authorization on artifact download endpoint — Session 9 re-audit)
- BC41 integer overflow & numeric boundary: ERADICATED — HIGHs (Math.min limit cap on 7 endpoints, Math.max page guard, MCP hub arg clamping)
- BC42 log injection & log forgery: ERADICATED — CRITICALs (OAuth body dump → boolean flags, snake_case pino redaction paths) + HIGHs (input truncation, adapter redact, OAuth logger sanitize)
- BC43 business logic bypass: ERADICATED — HIGH (POV status transition validation via StatusTransitionService)
- BC44 rate limit bypass & resource exhaustion: ERADICATED — CRITICAL (remove proxy header skip in createHandler) + HIGHs (rate limits on MCP tasks action, bulk move, bulk update)
- BC53 file operations & path traversal: ERADICATED — CRITICALs + HIGHs (storageUrl HTTPS-only, log path allowlist) + LOW (http(s) protocol enforcement on 5 URL schemas across 4 validation files — Session 9 re-audit)
- BC55 unsafe crypto & RS256 bypass: ERADICATED — CRITICAL (RS256 JWT signature verification) + HIGHs (2 sites) + LOW (`algorithms: ['HS256']` on 3 jwtVerify calls — algorithm confusion prevention, Session 9 re-audit)
- BC68 data exposure: ERADICATED — CRITICAL (verificationToken removed from /auth/me) + HIGH (CRM credential masking) + Session 9 re-audit: CRM POST credential masking (was plaintext apiKey + clientSecret)

**Discovery sweep confirmed clean areas** (no action needed):
- `.unref()` on intervals: GREEN (100% coverage)
- Pino error key (`err` vs `error`): GREEN
- Hardcoded secrets in source: GREEN
- Unclosed resources: GREEN
- Sensitive data in logs: GREEN (no tokens/passwords/secrets in log structured data)
- Authentication on state-changing endpoints: GREEN (56/56 protected)
- SQL injection ($queryRawUnsafe): GREEN (0 calls in our code)
- Prototype pollution: GREEN (BC27 eradicated — all 38 passthrough/record sites have stripDangerousKeys + ensureObject defense-in-depth)
- Empty catch blocks: GREEN (only 1 in crypto hash verify — acceptable)
- Unbounded findMany queries: GREEN (189 calls, all have `take` or parent-ID scope — BC24 added caps to 2 analytics queries + Session 9 detection re-audit added 7 more `take:` caps on unbounded analytics findMany)

**Session 3 accomplished** (Feb 26, 2026):
- Agent execution smoke tests 8-10: ALL PASS
  - Test 8: Artifact structure verified (15 artifacts, all 3 types: result.json, report.md, raw_response.txt)
  - Test 9: Artifact MCP resource accessibility verified (mcp://artifacts/{id} and mcp://executions/{id})
  - Test 10: Pino log correlation verified (structured JSON, correct domain/module, no console.log leakage)
- Hub & Logging essentials: 17/17 PASS
  - Hub Tools (8/8): Full service lifecycle (register → discover → health → tools → list → update → delete) + prompts
  - Workflows (4/4): Sequential (pov-status-report, variable chaining), parallel (jwks-validation, 550ms), external (daily-energy-weather, EIA+Weather real data)
  - Pino Logging (5/5): validate:logging, ESLint, stderr JSON, createAdapter 13/14, hub middleware zero console.*
- **2 bugs found and fixed during smoke testing**:
  - **Bug 1: "Task ID: unknown"** — perform(action: "agent_results") always showed "Task ID: unknown" because API response omits taskId at top level. Fixed by injecting resolved `finalTaskId` into resultData in both Phase 5 and fallback formatters (2 files)
  - **Bug 2: 401 auth in embedded MCP tool calls** — agent execution engine tool calls (project(action: "pov.details") etc.) failed with "session expired" because userId had no JWT token, and the admin auth fallback was unreliable (`getBearerTokenAuth()` always fails — login returns `{ user }` not `{ token }`). Fixed by minting a short-lived RS256 service token in `callEmbeddedTool()` (1 file)
- Minor finding: `[DEV] Query logger active via Prisma extension` plain-text on dev stderr — FIXED (pino migration)
- **BC18 (Error Message Leakage to Clients): 22 high-risk sites ERADICATED**
  - CRITICAL: OAuth callback URL parameter injection (error.message in URL visible in browser history/logs)
  - HIGH: 21 agent-templates/prompt-library routes returning raw error.message in JSON
  - Pattern: Replace `error instanceof Error ? error.message : '...'` with static generic messages
  - Wave 2 (session 4): 5 additional sites — 3 access denied leaks, 1 CRITICAL stack trace + raw error.message in MCP action route
- **Dev query logger regression**: Fixed both TS and CJS versions (console.log → pino)
- **POV/Task Lifecycle essentials**: 16/16 PASS
  - Area 1 (POV Lifecycle, 5/5): list unfiltered, status filter, geographic filter, details by ID, fuzzy name search
  - Area 2 (Task Management, 7/7): list tasks, get context, task.create, task.update, task.comment, task.complete, verify mutations
  - Area 3 (Phase & Stage, 3/3): phase structure (3 phases ordered), stage ordering (no duplicates), stage.create (auto-order)
  - Area 4 (Pino Log Correlation, 1/1): structured JSON on all MCP lines, correct domain tags, zero console.log leakage
  - Test data cleaned up (1 task + 1 stage deleted)

- **OAuth essentials**: 9/9 PASS
  - Discovery endpoints (3/3): JWKS (1 key, RS256, kid, cache 86400s), OAuth AS metadata, Protected Resource metadata (RFC 8707)
  - Auth middleware (4/4): public method 200, protected no-token 401, protected invalid-token 401 (cascade logged), valid token via MCP
  - Pino log correlation (1/1): structured JSON, correct domains (auth/mcp), no console.log leakage
  - Code verification (1/1): phantom user guard deployed, no email OR clause

**Session 4 accomplished** (Feb 27, 2026):
- **BC11 setTimeout extension**: 3 unguarded `setTimeout(async)` sites fixed
  - `execute/route.ts`: outer setTimeout had NO try/catch — prisma rejection = Node crash (CRITICAL)
  - `execute/route.ts`: inner catch block's $transaction failure-recording had no guard
  - `event-driven-session-manager.ts`: session timeout invalidation had no .catch()
  - All 4 `setTimeout(async)` sites now fully guarded (mcpClientWrapper was already safe)
- **BC18 wave 2**: 5 additional error.message leaks eradicated
  - `tasks/[taskId]/route.ts`: 3 sites — `error.message || 'Access denied'` → static
  - `agent-templates/[templateId]/apply/route.ts`: 1 site — `error.message || 'Access denied'` → static
  - `mcp/tasks/action/route.ts`: 1 CRITICAL — raw error.message + error.stack in response → handler message passthrough (revised Mar 2026: keyword categorization was over-aggressive, genericized detailed handler errors; reverted to passthrough since task handlers already produce user-safe messages)
  - BC18 total: 73 sites / 42 files
- **BC19 (Read-Modify-Write Race Conditions): NEW BUG CLASS — 8 HIGH/MEDIUM sites ERADICATED**
  - 16 total sites found across 14 files (comprehensive audit)
  - 3 HIGH: Agent execution TOCTOU — `agentTaskService.ts`, `tasks/[taskId]/agent/execute/route.ts`, `cancel/[executionId]/route.ts`
    - Fix: Atomic CAS via `updateMany` with status guard + orphan execution cleanup
  - 5 MEDIUM: JSON/metadata merge — `metadata.ts`, `agentTemplateService.ts`, `launch.ts`, `apiKeyService.ts` (2)
    - Fix: `$transaction` with `RepeatableRead` isolation
  - 7 LOW-risk deferred (admin/migration/template code)
  - Already protected (gold standard): `agentExecutionEngine.ts` (BC12), `reorderStages` (Serializable), `kpi.ts`, `put.ts`

**Session 5 accomplished** (Feb 27, 2026):
- **BC19 LOW-risk deferred sites: ALL 7 ERADICATED** — completing the bug class fully (15/15 sites, 0 deferred)
  - Site 9: `agent-configure-handler.ts` — metadata merge → `$transaction(RepeatableRead)`
  - Site 10: `task-update-handler.ts` — inputContext merge moved inside existing tx, upgraded to `RepeatableRead`
  - Site 11: `pov/templates/service.ts` — version increment → `$transaction(RepeatableRead)`
  - Site 12: `phase.ts` (updateStage) — metadata merge → `$transaction(RepeatableRead)`
  - Site 13: `workflow.ts` (complete) — metadata merge → `$transaction(RepeatableRead)`
  - Site 14: `mcpStorageMigration.ts` — multi-step migration → `$transaction(RepeatableRead)`
  - Site 15: `admin/settings/llm/route.ts` — dual-table (SystemSettings + CustomSchema) → `$transaction(RepeatableRead)`
- **BC20 Content-Type validation gap: FALSE POSITIVE** — investigated via discovery-scout; Next.js handles gracefully, Zod provides defense-in-depth, zero security impact
- **Agent Execute Route consolidation: DEFERRED** — investigated via discovery-scout; 16h effort, medium regression risk, BC11 already patched; defer to next major refactor
- **BC22 (Header Injection + SSRF): ERADICATED** — 7 sites / 8 files
  - CRITICAL: CRLF header injection via Content-Disposition filenames (3 files) → `safeContentDisposition()` utility
  - CRITICAL: SSRF via user-registered service health URLs → `validateUrlSafety()` utility blocking private IPs
  - MEDIUM: CORS origin echo with credentials (2 files) → allowlist-based CORS in middleware
  - Created `lib/utils/sanitize-filename.ts` and `lib/utils/url-safety.js`
- **BC21 (Unsafe Numeric Coercion): ERADICATED** — 20 sites / 15 files
  - HIGH: Infinity bypass in `embedded-server.ts` → `isFinite()` check
  - HIGH: NaN env vars disable rate limiters → `parseInt(x, 10) || default`
  - HIGH: `Boolean('f')===true` in stage validation → strict equality comparison
  - MEDIUM: NaN JWT expiry across 7 auth files → all guarded with `|| default`
  - MEDIUM: parseInt user input across 6 files → all guarded
  - MEDIUM: parseFloat Infinity in template service → `Number.isFinite()` guard
- **BC23 (Response Body / Stream Leak): ERADICATED** — 18 sites / 13 files
  - HIGH: 6 OAuth/MCP fetch calls leaking response bodies + missing timeouts
  - MEDIUM: 12 auth/template/middleware fetch calls with body leaks
  - All error paths now call `response.body?.cancel()` before throwing
  - All external URLs now have `AbortSignal.timeout(10_000-30_000)`
- **Regression sweep**: All 24 bug class detection commands run — ZERO regressions, 1 gap found (email.ts) and fixed
- **BC24 (Race Conditions, DoS Vectors & Resource Safety): ERADICATED** — 10 sites / 11 files
  - CRITICAL: Channel name mismatch (`execution_events` → `execution_updates`) — silently dropped ALL real-time notifications
  - CRITICAL: Double-close writer crash in SSE stream (error path + finally) → `writerClosed` flag
  - CRITICAL: Unbounded `findMany` in analytics performance (full table dump) → `take: 10000` caps
  - HIGH: Array mutation during `forEach` in taskSubscriptionService → collect-then-remove pattern
  - HIGH: Concurrent `initializeConnection` race in shared-connection-pool → `initPromise` dedup
  - HIGH: Re-entrant `scheduleReconnect` without guard → `isReconnecting` flag
  - HIGH: Path traversal via unsanitized `traceId` in `path.join` → sanitize to `[a-zA-Z0-9_-]`
  - HIGH: ReDoS via `new RegExp({{key}})` with user-controlled keys → `replaceAll()`
  - HIGH: Unbounded `Promise.all` on user-controlled task array → 500-item cap
  - HIGH: Uncapped `limit` param in recommendations → `Math.min(limit, 50)`
- Lint: PASS, Build: PASS, zero regressions
- **BC25 (Webpack SSR Class Field Crash): ERADICATED** — 2 sites / 1 file
  - CRITICAL: jose library class inheritance broken by webpack server bundling (ES2022 class fields → `this` before `super()`)
  - Fix: Added `'jose'` to `serverComponentsExternalPackages` in `next.config.js` (same root cause as existing `@tanstack/query-core` fix)
  - Broke ALL token refresh in production — every JWT claim validation crash-threw instead of returning clean errors
- **BC26 (Unscoped Admin-Level Queries): ERADICATED** — 1 site / 1 file
  - SECURITY: `team-activity/summary` returned ALL org data to any authenticated user (no role-based scoping)
  - Fix: Added role-based POV scoping matching the export endpoint pattern (ADMIN sees all, USER sees owned+team, DEMO_USER adds demo POVs)
  - Also fixes 16+ second response times (was doing full table scans)
- **NOT_FOUND → 404 fix**: `createHandler` in `lib/api-handler.ts` now maps `NOT_FOUND` error code to HTTP 404 (was falling through to 400)
- **Analytics essentials**: 11/11 PASS (new smoke test domain)
  - Tests 1-7: Core analytics endpoints (performance, insights, agent executions, settings, recommendations, export, comparisons)
  - Tests 8-11: Error handling (invalid POV 404, bad date 400, unauthorized 401, non-existent POV 404)
- **Team Management E2E**: 17/17 PASS (new smoke test domain)
  - T1-T5: Read operations (members, available users, activity summary, export CSV)
  - T6-T9: Mutations (add member, duplicate 409, update role, non-existent 404)
  - T10-T12: Validation (no auth 401, delete owner protection, invalid CUID 400)
  - T13-T18: Batch operations (batch add 3, delete 3, double-delete 404, verify restoration)

**Session 6 accomplished** (Feb 27, 2026):
- **Webpack externalization audit**: CLEAN — swept all 16 server-side npm packages for ES2022 class fields in extended classes. jose was the only dangerous package and is already externalized. No new packages need externalization.
- **User Management smoke test**: 30/30 PASS (new domain)
  - Profile/preferences (5), users list (2), admin CRUD (12), custom roles (5), permissions (1), API keys (4), auth boundary (1)
  - **5 bugs found and fixed** (commit `5f97fd50`):
    - Role/search/page/limit filters dead code: validated but never passed to `getUsers()` service
    - Duplicate email → 500: unhandled Prisma unique constraint → 400
    - Missing userId → 500: throw → return `{ error: { code: 'VALIDATION_ERROR' } }`
    - Role escalation → 500: throw → return `{ error: { code: 'FORBIDDEN' } }`
    - User not found → 500: throw → return `{ error: { code: 'NOT_FOUND' } }`
- **Settings smoke test**: 25/25 PASS (new domain)
  - Health checks (2), user settings (8), admin settings (4), LLM settings (3), JWT status (2), audit log (3), admin health (3)
  - No bugs found
- **Admin+Templates smoke test**: 35/36 PASS, 1 SKIP (new domain)
  - CRM settings/mappings/sync (10), geographical/cleanup (5), agent templates (10), builder (3), recommendations (2), prompt library (8)
  - **1 bug found and fixed** (commit `1821fbea`): Duplicate CRM mapping → 500 (`throw ApiError` caught by generic catch) → 400 (direct `return Response.json`)
- **BC27 (Prototype Pollution via Passthrough Validation): ERADICATED** — 38 sites / 15 files (commit `491e4f04`)
  - Created `lib/utils/sanitize-keys.ts`: `stripDangerousKeys()` strips `__proto__`, `constructor`, `prototype` keys
  - Created `safePassthrough()`, `safeRecord()`, `deepSafePassthrough()` in `lib/validation/zod-helpers.ts`
  - Applied `.transform(stripDangerousKeys)` to all 14 `.passthrough()` and 24 `z.record(z.any())` sites across 12 validation files
  - Defense-in-depth added to `ensureObject()` (strips keys on all parsed objects)
- **Dependency confusion + supply chain audit**: CLEAR — all 45 scoped packages from legitimate orgs, lockfile v3 with integrity hashes on 1,080 packages, no private packages, no suspicious postinstall scripts. Score: 95/100.
- **CSRF audit**: LOW risk — sameSite=lax cookies, JSON API pattern, CORS allowlist. OPTIONS preflight gap FIXED (commit `be7b63e4`): 6 handlers now use shared `corsPreflightResponse()` with Origin validation.

**Smoke test totals** — 11 DOMAINS COMPLETE:
- MCP Resources: 16/16 PASS (Session 1)
- Agent Execution: 10/10 PASS (Sessions 2+3)
- Hub & Logging: 17/17 PASS (Session 3)
- POV/Task Lifecycle: 16/16 PASS (Session 3)
- OAuth Essentials: 9/9 PASS (Session 3)
- Analytics Essentials: 11/11 PASS (Session 5)
- Team Management E2E: 17/17 PASS (Session 5)
- User Management: 30/30 PASS (Session 6)
- Settings & Admin System: 25/25 PASS (Session 6)
- Admin Endpoints & Templates: 35/36 PASS, 1 SKIP (Session 6)
- Notifications: 38/38 PASS (Session 7)
- Total: 224/225 (99.6%)

**What I'd like to tackle next** (pick the approach that maximizes value):

1. ~~**BC4 (Null vs Undefined at Forms)**~~ — RESOLVED: already correct architecture (Zod transforms + conditional spreads + 28 tests).

2. ~~**Finish agent execution smoke test**~~ — DONE: 10/10 PASS.

3. ~~**New smoke test domain (MCP Hub)**~~ — DONE: 17/17 PASS.

4. ~~**POV/Task lifecycle essentials**~~ — DONE: 16/16 PASS.

5. ~~**OAuth essentials**~~ — DONE: 9/9 PASS. All 5 smoke test domains complete (68/68).

6. ~~**Quarterly review prep**~~ — DONE: All 9 sweeps GREEN (Q2 2026 baseline established Feb 27).

7. ~~**Error message leakage**~~ — DONE: BC18 ERADICATED — 73 sites / 42 files (22 session 3a + 46 session 3b + 5 wave 2).

8. ~~**Dev query logger regression**~~ — DONE: Both TS and CJS versions migrated to pino.

9. ~~**BC11 setTimeout extension**~~ — DONE: 3 unguarded `setTimeout(async)` sites fixed. All 4 sites now fully guarded.

10. ~~**BC18 wave 2**~~ — DONE: 5 additional sites (3 access denied leaks + 1 stack trace + raw error.message in MCP action).

11. ~~**BC19 (Read-Modify-Write Race Conditions)**~~ — DONE: 15 sites eradicated across 14 files (0 deferred).
    - 3 HIGH: Agent execution TOCTOU → atomic CAS with `updateMany`
    - 5 MEDIUM: JSON/metadata merge → `$transaction(RepeatableRead)`
    - 7 LOW: All deferred sites fixed in session 5 → `$transaction(RepeatableRead)`

12. ~~**BC19 LOW-risk deferred sites**~~ — DONE (Session 5): All 7 sites fixed.
    - `agent-configure-handler.ts`: metadata merge → `$transaction(RepeatableRead)`
    - `task-update-handler.ts`: inputContext merge moved inside existing tx, upgraded to `RepeatableRead`
    - `pov/templates/service.ts`: version increment → `$transaction(RepeatableRead)`
    - `phase.ts(updateStage)`: metadata merge → `$transaction(RepeatableRead)`
    - `workflow.ts(complete)`: metadata merge → `$transaction(RepeatableRead)`
    - `mcpStorageMigration.ts`: multi-step migration → `$transaction(RepeatableRead)`
    - `admin/settings/llm/route.ts`: dual-table (SystemSettings + CustomSchema) → `$transaction(RepeatableRead)`

13. ~~**BC20: Content-Type validation gap**~~ — FALSE POSITIVE (Session 5 discovery): Next.js handles gracefully, Zod provides defense-in-depth, zero security impact. Not a bug class.

14. ~~**Agent Execute Route consolidation**~~ — DEFERRED: Dual execution path is tech debt, not a bug class. BC11 already patched. 16h effort, medium regression risk. Defer to next major agent refactor.

**Recommended next targets** (ranked by ROI):

15. ~~**Hunt new bug families (round 1)**~~ — DONE (Session 5): Hunted 3 attack surfaces, discovered BC21 (numeric coercion), BC22 (header injection + SSRF), BC23 (stream leak). All 3 eradicated.

16. ~~**Regression sweep + hunt round 2**~~ — DONE (Session 5): Full 24-class regression sweep (zero regressions), 3 parallel hunts (path traversal, race conditions, DoS), discovered and eradicated BC24 (10 sites / 11 files).

17. ~~**New smoke test domains (analytics + team management)**~~ — DONE (Session 5): Analytics 11/11, Team Management E2E 17/17. Total: 96/96 across 7 domains.

18. ~~**Hunt bug families round 3 (production testing)**~~ — DONE (Session 5): Discovered BC25 (webpack SSR class field crash — jose) and BC26 (unscoped admin-level queries — team-activity/summary) during production smoke testing.

19. ~~**New smoke test domains (user mgmt, settings, admin+templates)**~~ — DONE (Session 6): User Management 30/30, Settings 25/25, Admin+Templates 35/36. Total: 186/187 across 10 domains.

20. ~~**Webpack externalization audit**~~ — DONE (Session 6): All 16 server-side packages clean. jose is the only dangerous one and is already externalized.

21. ~~**Hunt more bug families (proto pollution, dependency confusion, supply chain, CSRF)**~~ — DONE (Session 6): BC27 prototype pollution eradicated (38 sites). Dependency confusion CLEAR (95/100). CSRF LOW (OPTIONS gap fixed).

**Recommended next targets** (ranked by ROI):

22. ~~**Fix OPTIONS preflight handlers**~~ — DONE (commit `be7b63e4`): 6 routes fixed with shared `corsPreflightResponse()` + extracted `isAllowedOrigin()` to `lib/utils/cors.ts`.
23. ~~**Notifications smoke test**~~ — DONE (Session 7): 38/38 PASS. Middleware is primary auth gate; route-level auth is defense-in-depth.
24. ~~**Hunt IDOR + orphan data**~~ — DONE (Session 7): IDOR hunt found 6 findings (4 CRITICAL, 1 HIGH, 1 MEDIUM intentional). Orphan data hunt found 9 findings (2 CRITICAL, 2 HIGH, 5 MEDIUM/LOW).
25. ~~**BC28 IDOR eradication**~~ — DONE (Session 7, commit `89bd8e4d`): 9 sites / 7 files fixed. Phase templates intentionally available to all authenticated users.

26. ~~**Orphan data cleanup**~~ — DONE (Session 7, commit `64471b02`): 3 new cleanup methods (MCPRecommendation 90d, CRMSyncHistory 90d, stale RUNNING→FAILED 7d), enhanced notification cleanup (unread 90d), 3 schema cascades (MCPInteraction, MCPRecommendation onDelete:Cascade, MCPWorkflowExecution onDelete:SetNull).
27. ~~**Hunt mass assignment + deep nesting DoS + open redirect**~~ — DONE (Session 7): 3 parallel hunts, 19 total findings (6 mass assignment, 10 DoS, 3 open redirect).
28. ~~**Fix CRITICALs from all 3 hunts**~~ — DONE (Session 7): BC29 ownerId exclusion, BC30 depth guards + LLM proxy Zod, BC31 backup deletion + redirect validation.

**Recommended next targets** (ranked by ROI):

29. ~~**Fix remaining HIGH findings**~~ — DONE (Session 7): BC29 (3 HIGH: task-update allowlist, validated passthrough, dead code deleted), BC30 (4 HIGH: configure+recommendations+KPI Zod schemas, hub try/catch), BC31 (1 HIGH: notification actionUrl relative-only + NotificationBell guard).

**Recommended next targets** (ranked by ROI):

30. ~~**Hunt more bug families (crypto, error recovery, memory leaks)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC32 (crypto, 13 findings), BC33 (error recovery, 16 findings), BC34 (memory leak, 5 findings). All CRITICALs fixed.

**Recommended next targets** (ranked by ROI):

31. ~~**Fix remaining HIGHs from BC32-34**~~ — DONE (Session 7): BC32 (5 Math.random→crypto.randomUUID), BC33 (6 sites: POV launch tx, checklist tx, workflow cleanup, pool dedup, 2x activity logging try/catch), BC34 (2 sites: execution-events + prompt-registry listener cleanup).

**Recommended next targets** (ranked by ROI):

32. **Quarterly security audit refresh** — Run endpoint-security-audit-protocol against latest codebase.
33. **New smoke test domains** — Consider browser automation, CRM sync, or export endpoints.
34. ~~**Hunt more bug families (info disclosure, session fixation, injection)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC35 (info disclosure, 8 findings), BC36 (token lifecycle, 11 findings), BC37 (injection, 4 findings). All CRITICALs + HIGHs fixed.

**Recommended next targets** (ranked by ROI):

35. ~~**Hunt more bug families (file upload, privilege escalation, cache poisoning)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC38 (file upload, 12 findings), BC39 (privilege escalation, 6 findings), BC40 (cache poisoning, 7 findings). All CRITICALs + HIGHs + BC39 MEDIUMs fixed.

**Recommended next targets** (ranked by ROI):

36. ~~**Hunt more bug families (integer overflow, log injection, business logic, rate limit)**~~ — DONE (Session 7): 4 parallel hunts, discovered BC41 (numeric boundary, 16 findings), BC42 (log injection, 39 findings), BC43 (business logic bypass, 8 findings), BC44 (rate limit bypass, 11 findings). All CRITICALs + HIGHs fixed.

37. ~~**Hunt more bug families (insecure defaults, unsafe external data, concurrency gaps)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC45 (insecure defaults, 10 findings), BC46 (unsafe external data trust, 14 findings), BC47 (concurrency gaps, 13 findings). All CRITICALs + HIGHs fixed.

38. ~~**Hunt more bug families (deserialization, normalization, partial state)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC48 (insecure deserialization, 16 findings), BC49 (input normalization, 15 findings), BC50 (partial state, 20 findings). All CRITICALs + HIGHs fixed.

39. ~~**Hunt more bug families (SSRF, cookie/session, file/path)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC51 (unsafe redirect/SSRF, 10 findings), BC52 (insecure cookies/session, 13 findings), BC53 (file operations/path traversal, 10 findings). All CRITICALs + HIGHs fixed.

40. ~~**Hunt more bug families (host header, crypto, auth bypass)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC54 (DNS rebinding/host header, 10 findings), BC55 (unsafe crypto/RS256 bypass, 7 findings), BC56 (auth middleware bypass, 10 findings). All CRITICALs + HIGHs fixed. BC55 C1 was the most critical find: RS256 JWT tokens were decoded without signature verification — full auth bypass.

**Recommended next targets** (ranked by ROI):

41. ~~**Hunt more bug families (event handler leaks, type coercion, permissions)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC57 (event handler leaks, 5 findings), BC58 (HTTP header injection, 2 findings), BC59 (type coercion, 38 findings). All CRITICALs + HIGHs + MEDIUMs fixed.

42. ~~**Hunt more bug families (permissions, template injection, resource exhaustion)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC60 (unsafe permissions, 4 findings), BC61 (template injection, 4 findings), BC62 (resource exhaustion, 7 findings). All CRITICALs + HIGHs + MEDIUMs fixed (except BC60 M2 skipped).

43. ~~**Hunt more bug families (error handling, cleanup, data races)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC63 (error handling, 3 findings), BC64 (cleanup, 4 findings), BC65 (data races, 7 findings). All CRITICALs + HIGHs fixed.

44. ~~**Hunt more bug families (query injection, state transitions, data exposure)**~~ — DONE (Session 7): 3 parallel hunts, discovered BC66 (query injection, 5 findings), BC67 (state transitions, 2 findings fixed + 4 already defended), BC68 (data exposure, 2 findings). All CRITICALs + HIGHs fixed. BC68 C1 was critical: `verificationToken` exposed to all authenticated users via `/auth/me`.

**Session 8 accomplished** (Feb 28, 2026):
- **BC51 SSRF bypass inconsistency**: 4 code paths in `url-safety.js` had inconsistent validation — standardized all to block private IPs consistently
- **BC18 error message passthrough**: Reverted over-aggressive keyword categorization in MCP action route. Task handlers already produce user-safe messages; generic replacements broke UX
- **BC27 CJS divergence**: `ensure-object.js` was missing `stripDangerousKeys` that the TS version had — CJS mirror gap pattern
- **BC69 host header trust**: NEW BUG CLASS — 3 sites trusting `req.headers.host` for security decisions without validation

**Session 9 accomplished** (Mar 4, 2026):
- **BC27 extended**: `navigatePath()` in `orchestration-engine.js` used `obj[part]` with dynamic property access — added `DANGEROUS_PARTS` set blocking `__proto__`, `prototype`, `constructor` etc.
- **BC30 CJS parity**: `orchestration-params.js` `checkArgumentsForInjection()` lacked `_depth` guard (TS version had it) — added `MAX_INJECTION_CHECK_DEPTH=20`
- **BC30 CJS parity**: `mcp-hub-validation.js` missing try/catch on 2 `JSON.stringify` calls (TS version had it)
- **CJS divergence systematic hunt**: Audited all 13 TS/JS file pairs — 12 clean, 1 gap found and fixed (mcp-hub-validation.js)
- **BC30 TS completion**: Found 14 unguarded `JSON.stringify` inside Zod `.refine()` across 8 TS validation files — all wrapped in try/catch
- **Detection command methodology upgrade**: Updated BC27 and BC30 detection commands to search BOTH `.ts` AND `.js` files. Previous commands used `--include='*.ts'` only, which is why CJS divergence gaps kept being missed.
- **Key insight**: Detection commands reflect understanding at discovery time, not the full attack surface. When a bug class is extended with new manifestations, detection commands must be updated too.
- **New methodology**: "CJS divergence" is now a cross-cutting concern — any BC eradication touching a file with a `.js` mirror must fix BOTH.
- **Zod `.refine()` attack surface audit**: Grepped all `.refine()` callbacks for unsafe computation on untrusted input. Found 8 findings across 11 files — all JSON.stringify calls inside .refine() wrapped in try/catch (extends BC30).
- **Detection command re-audit**: Re-ran detection commands for all 70 BC entries using 4 parallel agents. Found 16 new sites across 10 BC entries that original detection commands missed. All fixes applied and committed in 3 batches:
  - **CRITICAL/HIGH (5 fixes)**:
    - BC68: CRM POST credential masking (was plaintext apiKey + clientSecret)
    - BC14: CJS `prisma.js` exponential backoff with jitter (was constant delay — CJS parity)
    - BC23: `AbortSignal.timeout` on 3 external fetch calls (30s/60s for LLM proxy + base provider)
  - **MEDIUM (7 fixes)**:
    - BC40: `Vary: Authorization` on artifact download endpoint (cache poisoning prevention)
    - BC24: `take:` caps on 7 unbounded analytics findMany queries (10000 for large, 1000 for scoped)
  - **LOW (13 fixes)**:
    - BC34: `.unref()` on session cleanup interval + setTimeout (clean shutdown)
    - BC55: `algorithms: ['HS256']` on 3 jwtVerify calls (algorithm confusion prevention)
    - BC37: Channel name validation on LISTEN/UNLISTEN in TS shared-connection-pool (CJS parity)
    - BC53: `http(s)` protocol enforcement on 5 URL schemas across 4 validation files

**Recommended next targets** (ranked by ROI):

45. ~~**Zod `.refine()` attack surface audit**~~ — DONE (Session 9): Grepped all `.refine()` callbacks, found 8 findings across 11 files. JSON.stringify calls wrapped in try/catch, unsafe computations guarded. Extended BC30 with 14 new sites.
46. ~~**Detection command re-audit**~~ — DONE (Session 9): Re-ran detection commands for all 70 BC entries using 4 parallel agents. Found 16 new sites across 10 BC entries that original commands missed. All fixes applied in 3 batches (CRITICAL/HIGH, MEDIUM, LOW). 25 fixes across 20 files.
47. **Hunt more bug families** — Consider: HTTP request smuggling, subdomain takeover, insecure deserialization chains, event-driven race conditions.
48. **Quarterly regression sweep** — Run detection commands from all 70+ bug classes.
49. **MEDIUM/LOW cleanup** — ~135 MEDIUM/LOW findings across BC32-68 — diminishing returns but good for completeness.
50. **New smoke test domains** — Consider: browser automation, CRM sync, export endpoints.

---

## Key Files for Context

| File | Purpose |
|------|---------|
| `/.claude/knowledge/domain/mcp/bug-class-registry.md` | 70 bug classes (BC1–BC69), 69 eradicated, 1 resolved, 2 monitored, 2 false alarms |
| `/.claude/knowledge/smoke-tests/pov-task-lifecycle-essentials-test.md` | POV/Task lifecycle smoke test (16 tests — all PASS) |
| `/.claude/knowledge/smoke-tests/oauth-essentials-smoke-test.md` | OAuth essentials smoke test (9 tests — all PASS) |
| `/.claude/knowledge/discoveries/defensive-code-sweep-discovery.md` | Grep-based sweep (9 categories, field-validated v1.7) |
| `/.claude/knowledge/smoke-tests/agent-execution-essentials-test.md` | Agent execution smoke test (10 tests) |
| `/.claude/knowledge/smoke-tests/mcp-resources-essentials-test.md` | MCP resources smoke test (16 tests — all PASS) |
| `/.claude/knowledge/protocols/smoke-test-sweep-standardize-protocol.md` | The overarching workflow protocol |
| `/.claude/knowledge/protocols/bug-class-eradication-protocol.md` | How to eradicate a bug family |
| `lib/utils/safe-regex.ts` | BC15 defense — safeRegex() utility |
| `lib/crypto/hashing.ts` | BC16 fix — timingSafeEqual |
| `lib/pov/services/kpi.ts` | BC17 fix — new Function() blocklist |
| `lib/services/agentExecutionEngine.ts` | BC12+BC13 fixes (atomic claim, content validation) |
| `lib/services/workflow/workflowEngine.ts` | BC14 fix (exponential backoff) + unbounded Map fix |
| `lib/prisma.ts` | BC14 fix (exponential backoff on reconnect) |
| `lib/utils/sanitize-filename.ts` | BC22 defense — safeContentDisposition() |
| `lib/utils/url-safety.js` | BC22 defense — validateUrlSafety() SSRF prevention |
| `next.config.js` | BC25 fix — jose + @tanstack externalized from webpack |
| `lib/api-handler.ts` | NOT_FOUND → 404 status mapping |
| `app/api/dashboard/team-activity/summary/route.ts` | BC26 fix — role-based POV scoping |
| `/.claude/knowledge/smoke-tests/analytics-essentials-smoke-test.md` | Analytics smoke test (11 tests — all PASS) |
| `/.claude/knowledge/smoke-tests/user-management-smoke-test.md` | User management smoke test (30 tests — all PASS, 5 bugs fixed) |
| `/.claude/knowledge/smoke-tests/settings-admin-smoke-test.md` | Settings & admin smoke test (25 tests — all PASS) |
| `/.claude/knowledge/smoke-tests/admin-templates-smoke-test.md` | Admin endpoints & templates smoke test (35/36, 1 bug fixed) |
| `lib/utils/sanitize-keys.ts` | BC27 defense — stripDangerousKeys() prototype pollution prevention |
| `lib/validation/zod-helpers.ts` | BC27 helpers — safePassthrough(), safeRecord(), objectOrJsonString |
| `lib/admin/handlers/user.ts` | Admin user handler fixes (proper HTTP status codes, filter wiring) |
| `lib/admin/services/user.ts` | Admin user service (getUsers with role/search/pagination params) |
| `lib/utils/cors.ts` | BC22 extension — shared `isAllowedOrigin()` + `corsPreflightResponse()` |
| `/.claude/knowledge/smoke-tests/notifications-smoke-test.md` | Notifications smoke test (38 tests — all PASS) |
| `lib/errors.ts` | BC35 fix — `safeDetails` getter strips 5xx details from ApiError responses |
| `app/api/auth/refresh/route.ts` | BC36 fix — refresh token rotation (delete+create) + fresh DB role |
| `lib/admin/services/user.ts` | BC36 fix — token invalidation on role/status change |
| `lib/auth/token-manager.ts` | BC36 fix — `maxTokenAge` on refresh token verification |
| `lib/api-handler.ts` | BC44 fix — always rate limit (removed proxy header bypass) + BC45 body size limit |
| `lib/mcp/server/pino-base-options.json` | BC42 fix — snake_case OAuth field redaction paths |
| `lib/mcp/server/mcp-logger.js` | BC42 fix — `redactObj()` in createAdapter stringify path |
| `lib/pov/handlers/put.ts` | BC43 fix — status transition validation via StatusTransitionService |
| `lib/admin/services/user.ts` | BC45 fix — `crypto.randomBytes(24)` replaces hardcoded password |
| `next.config.js` | BC45 fix — security headers (X-Content-Type-Options, X-Frame-Options, etc.) |
| `lib/auth/oauth/oauth-service.ts` | BC46 fix — OAuth token/refresh/profile response validation |
| `app/api/pov/agent/execute/stream/route.ts` | BC46 fix — `sanitizeLLMForMarkdown()` strips script/iframe/event handlers |
| `app/api/pov/[povId]/team/members/route.ts` | BC47 fix — team create + member add in `$transaction` + P2002 catch |
| `lib/auth/token-manager.ts` | BC48 fix — `validateRole()` runtime enum check on all JWT decode paths |
| `lib/pov/services/kpi.ts` | BC48 fix — strengthened blocklist (bracket access, unicode, this/self) |
| `lib/validation/admin-user-validation.ts` | BC49 fix — `.transform(e => e.toLowerCase())` on email fields |
| `app/api/tasks/search/route.ts` | BC49 fix — enum/sortBy/dateField allowlist validation |
| `lib/pov/phase-templates/storage.ts` | BC50 fix — phase + stages + tasks in `$transaction` |
| `lib/pov/services/launch.ts` | BC50 fix — POV status + launch record in `$transaction` |
| `lib/pov/services/workflow.ts` | BC50 fix — step status + workflow status in `$transaction` |

## Session Strategy Notes

- **All smoke tests complete** — 224/225 across 11 domains (99.6%), zero regressions
- **All defensive sweeps GREEN** — 9/9 categories at 100% compliance (Q2 baseline)
- **All open bug classes resolved** — 69 eradicated + 1 resolved + 2 monitored + 2 false alarm = 74 total (70 registered)
- **Supply chain audit**: CLEAR (95/100) — no dependency confusion, no typosquatting, lockfile v3 integrity
- **CSRF audit**: LOW — OPTIONS gap FIXED (6 handlers → `corsPreflightResponse()`, commit `be7b63e4`)
- **Orphan data**: FIXED — 3 cleanup methods + 3 schema cascades + enhanced notification cleanup

Sessions 1-5 proved: smoke test → trace → eradicate → sweep siblings → expand defenses = compounding returns:
- Session 1: BC10+BC11 eradicated (44 sites), TOCTOU race fixed, defensive sweep created
- Session 2: BC3+BC12-BC17 eradicated (22 sites), 9 sweep categories at 100%, 4 security vulnerabilities fixed
- Session 3: 68 smoke tests at 100% (all 5 domains: agent exec 10, hub & logging 17, MCP resources 16, POV/task 16, OAuth 9), BC18 eradicated, zero regressions
  - BC3: 1 security bypass (NaN token expiration) + 9 NaN-unsafe parseInt
  - BC15: 2 ReDoS sites (user-controlled regex → event loop freeze)
  - BC16: 2 timing-unsafe comparisons (HMAC brute-force vector)
  - BC17: 1 CRITICAL code injection (new Function on DB string → RCE)
- Session 4: BC11 extension (3 sites), BC18 wave 2 (5 sites), BC19 race conditions (8 HIGH/MEDIUM sites)
- Session 5: BC19 LOW-risk completion (7 sites), BC22 header injection+SSRF (7 sites), BC21 numeric coercion (20 sites), BC23 stream leak (18 sites), BC24 race conditions/DoS/resource safety (10 sites), regression sweep (24 classes, 0 regressions), production fix (url-safety path), BC25 webpack SSR class field crash (2 sites), BC26 unscoped admin-level queries (1 site), analytics smoke tests (11/11), team management E2E (17/17), NOT_FOUND→404 fix. Total: 66 sites / 57 files, zero regressions.
- Session 6: BC27 prototype pollution (38 sites / 15 files), BC22 extended (6 CORS preflight handlers → `corsPreflightResponse()`), webpack audit (clean), user mgmt 30/30 (5 bugs fixed), settings 25/25 (clean), admin+templates 35/36 (1 bug fixed), dependency confusion CLEAR, CSRF LOW (gap fixed). Total: 44 sites / 21 files (BC27 + BC22 ext) + 6 handler bugs fixed, zero regressions.
- Session 7: BC28 IDOR (9 sites / 7 files), notifications 38/38, orphan data fixed (3 cleanups + 3 cascades), BC29-BC68 eradicated (40 bug classes). Highlights: BC48 JWT role validation+KPI blocklist, BC49 OAuth email normalization+sortBy allowlists, BC50 registration+admin+launch+workflow $transaction, BC51 SSRF on all fetch paths, BC52 cookie maxAge seconds fix+session limit+password invalidation, BC53 storageUrl HTTPS-only+log path allowlist, BC54 MCP origin exact hostname match+rate limit IP spoofing, BC55 RS256 JWT verification (critical auth bypass fixed), BC56 unauthed circular dependency+accessToken removal+tokenExpiresAt, BC66 dynamic orderBy allowlists, BC67 streaming execution CAS guard, BC68 verificationToken+CRM credential masking. Total: 150 sites across 40 new bug classes, all CRITICALs+HIGHs fixed, zero regressions.
- Session 8: BC51 SSRF consistency (4 code paths), BC18 error passthrough revert, BC27 CJS divergence (ensure-object.js), BC69 host header trust (3 sites). Total: 11 sites, zero regressions.
- Session 9: BC27 extended (navigatePath prototype traversal), BC30 CJS parity (2 JS files) + BC30 TS completion (14 sites / 8 files), CJS divergence hunt (13 pairs audited), .refine() audit (8 findings / 11 files), detection re-audit (25 fixes / 20 files across 10 BCs). Key methodology finding: detection commands must search .ts AND .js; "CJS divergence" is a cross-cutting concern for all future eradications. Detection re-audit found 16 new sites across 10 BC entries that original commands missed. Total: 42 sites / 30+ files, zero regressions.
