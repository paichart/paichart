# MCP SDK Upgrade Protocol

**Version**: 1.0
**Created**: 2026-05-20
**Author**: Claude Opus 4.7 + Steve Terry
**Purpose**: Decision framework and checklist for bumping `@modelcontextprotocol/sdk`. Coordinates spec-delta review, transport-hook detection, SessionStore audit, and the smoke tests required to land an upgrade without regression.
**Companion backlog**: `.claude/knowledge/TODO1-mcp-spec-feature-gap-analysis.md` — the feature-by-feature spec gap table that tracks WHAT we haven't adopted yet.

---

## Executive Summary

Every `@modelcontextprotocol/sdk` version bump can quietly introduce new transport hooks, change session-lifecycle expectations, or ship a new spec version that obsoletes our current design assumptions. This protocol fires on every such bump and produces a written decision on each Tracked Item before the upgrade is merged.

**ROI**: Catches an SDK-introduced regression BEFORE production (typically session/transport state divergence). One miss could break OAuth login or invalidate every active MCP session.

---

## When to Use This Protocol

**Trigger**: Any of these:
- A PR bumps the `@modelcontextprotocol/sdk` version in `package.json`
- Anthropic announces a new MCP spec release (e.g., 2025-11-25 → 2026-XX-XX)
- A "tracked item" trigger condition fires (see §Tracked Items)
- Pre-deploy review for a release that pulls in a transitive SDK update

**Not needed for**:
- Patch-level updates that only touch dev dependencies
- SDK changes confined to client-side packages (we ship server only)

---

## The 6-Step Upgrade Procedure

Run in order. Each step produces a written entry in the upgrade PR description.

### Step 1: Spec version delta

Compare the spec version the new SDK targets against the version recorded at the top of `TODO1-mcp-spec-feature-gap-analysis.md`.

- **Same spec version**: cosmetic upgrade only; usually safe.
- **Newer spec version**: read the spec changelog. Update the doc header. Flag any new REQUIRED capabilities.

**Sources**:
- [MCP Specification](https://modelcontextprotocol.io/specification/) — current spec
- [Lifecycle Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)

### Step 2: Streamable HTTP transport changes

Read the SDK release notes for any of these patterns:

- New server-side hooks (`onSessionResume`, `onSessionMigrate`, `onIdle`, etc.)
- Changed session-lifecycle semantics (creation, resumption, migration, idle timeout)
- New required headers / response shapes
- Behaviour changes in session-ID handling

If any are present, add rows to the feature comparison table in the gap-analysis doc with status `❌ NOT IMPLEMENTED` and a priority assessment.

**Where new transport hooks land (post-Wave-7, 2026-05-21)**: New SDK transport hooks should be wired into `MCPCoreManager` at `lib/mcp/server/mcp-core.ts`, NOT the server class (`mcp-server-http-clean.js`). MCPCoreManager owns the PureSDKNativeServer instance via its private `_mcpServer` field — any new hook closures should reference `this._mcpServer` directly (with the inline guard pattern documented in `MCPCoreManager.processRequest`). The server class is now a facade; transport-level concerns belong in mcp-core.ts.

**Source**: [@modelcontextprotocol/typescript-sdk releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)

### Step 3: Re-evaluate Tracked Item #1 (30-min idle timeout)

Has the new SDK introduced sliding-TTL or activity-based session refresh? See §Tracked Items below. Write a one-line decision: ACT NOW / DEFER / OBSOLETED.

### Step 4: Re-evaluate Tracked Item #2 (stateless transition)

Has the stateless SEP work shipped (SEP-1442, SEP-2567)? Has Streamable HTTP v2 landed as the SDK default? See §Tracked Items. If yes, the upgrade is no longer just a bump — it's a transition planning task.

### Step 5: `lib/auth/oauth/session-store.ts` API audit

Compare our public methods to any new SDK session-management interfaces:

```bash
grep -nE "^\s*(public\s+)?(setSession|getTransport|getContext|getSessionInfo|deleteSession|setOAuthRequest|getOAuthRequest|deleteOAuthRequest|setAuthCode|exchangeAuthCode|deleteAuthCode|isAllowedRedirectUri|startCleanup|destroy)\(" lib/auth/oauth/session-store.ts
```

- Methods removed in Phase 2.11 (`trackSessionCreation`, `refreshSessionTTL`) may need to come back if SDK now requires them.
- New SDK methods may need stub implementations on SessionStore for spec compliance.

### Step 6: Smoke tests after upgrade

ALL of these must pass before merging the upgrade:

```bash
npm run lint
npm run build
npm run test:session-store              # 10 unit tests; race + LRU + TTL invariants
npm run test:mcp-core                   # 19 unit tests; MCPCoreManager — SDK BACKEND WRAPPER (Wave 7 Phase 7.1)
                                        # Covers init() lifecycle, initializeAuthContext, lazy-init guard,
                                        # the inline-guard pattern. Most likely to surface SDK regressions.
npm run test:mcp-method-classifier      # 11 unit tests; VALID_MCP_METHODS dispatch + MCP_PUBLIC_METHODS (Wave 7 Phase 7.0a)
                                        # Covers public/protected method classification — symmetric with
                                        # the dispatch-side `lib/mcp/server/mcp-methods.ts` allowlist.
npm run test:routes-mcp-transport       # 17 unit tests; R11 POST + R12 GET SSE (Wave 6 Phase 6.5)
                                        # Covers ChatGPT manifest discovery + inner-closure auth (sec-ops C6)
                                        # — invariants likely to break on session-lifecycle SDK changes.
npm run test:all-validation             # 106+ platform-wide validation tests
```

Plus the two in-flight MCP smoke suites (run from an authenticated MCP client):

- `oauth-essentials` (9 tests; OAuth + auth middleware end-to-end) — `.claude/knowledge/smoke-tests/oauth-essentials-smoke-test.md`
- `hub-and-logging-essentials` (17 tests; hub CRUD + workflows + pino) — `.claude/knowledge/smoke-tests/hub-and-logging-essentials-test.md`

**Wave 7 (2026-05-21) test additions**: The three NEW commands above (`test:mcp-core`, `test:mcp-method-classifier`, `test:routes-mcp-transport`) were added during the Domain D extraction. They're the tests most likely to catch an SDK regression because they cover the MCP backend dispatch surface directly — earlier protocol revisions predate the extraction and only listed `test:session-store` + `test:all-validation`.

### Step 6.5: Self-apply time-bomb audit (any new/changed class)

If the SDK upgrade introduced new server-side state (new Maps, caches, sessions, scheduled work, in-memory rate limits), run the 8-category time-bomb audit from `.claude/knowledge/patterns/time-bomb-detection-pattern.md` against the new code BEFORE merging. Born from real-world miss: SessionStore Phase 2.x shipped with `cleanupStaleSessions()` only iterating sessions, not oauthRequests/authCodes — a "works by convention" Category 4 latent risk caught only when Steve asked "is our own code time-bomb-free?" (commit `83770919` fixed it).

Per-class checklist:
- [ ] Category 1: All Maps/caches have explicit size caps (no unbounded growth)
- [ ] Category 2: Cleanup scheduler exists AND auto-starts (not "caller must register")
- [ ] Category 3: Atomic deletes across related stores; `destroy()` clears all state
- [ ] Category 4: TTL eviction loop iterates ALL time-based stores (not just one)
- [ ] Category 5: TTL is enforced by a setInterval, not just defined as a constant
- [ ] Category 6: Singleton-by-convention is explicit (or factory) — no global Map
- [ ] Category 7: No `TODO`/`FIXME`/stub returns in production paths
- [ ] Category 8: In-memory rate limiting (if added) is scale-aware

A failing checkbox is a blocker. Either fix the class OR add it to the SessionStore-style follow-up plan with a defined trigger ("if X happens, harden Y").

### Step 7: Discovery prompt + specialist config drift check

> **Canonical standalone procedure**: `drift-sweep-protocol.md` (Protocol 11, 2026-06-11) — run its Parts B+C in full (incl. the claim-staleness pass and prove-before-write rule, which postdate this section).

Born from real-world drift (SessionStore extraction, May 2026): symbol renames and method relocations leak stale grep commands and `file.js:NNNN` line refs into specialist configs and discovery prompts. Specialists then ground on wrong baseline state and produce wrong analyses (per `feedback_specialist_discovery_first`).

Run this audit after every SDK bump (or any refactor that renames/moves symbols across the MCP server):

```bash
# 1) Identify the renamed/moved symbols. For SDK bumps, common candidates:
#    - SDK transport method names that changed in the upgrade
#    - Server-side session/transport hooks introduced or renamed
#    - Constants that moved (e.g., SESSION_TTL_MS, MAX_SESSIONS)
#
# 2) For each, grep across the FULL active-reference scope. Do NOT narrow to
#    just specialist configs + discoveries — patterns, TODOs, domain docs,
#    guides, frameworks, toolkits, and prompts can all reference stale symbols.
#    (Lesson from SessionStore Phase A: initial scope of agents/+discoveries/
#    missed time-bomb-detection-pattern.md + the facade-extraction TODO.)
grep -rnE "<old-symbol-1>|<old-symbol-2>|<old-symbol-N>" \
  .claude/agents/ \
  .claude/knowledge/discoveries/ \
  .claude/knowledge/patterns/ \
  .claude/knowledge/TODO*.md \
  .claude/knowledge/domain/ \
  .claude/knowledge/guides/ \
  .claude/knowledge/frameworks/ \
  .claude/knowledge/toolkits/ \
  .claude/knowledge/prompts/ \
  .claude/knowledge/protocols/ \
  CLAUDE.md

# 3) Triage matches into:
#    a) Active references that need fixing (patterns, TODOs, specialists, discoveries)
#    b) Historical narrative — explicit "removed in Phase X" notes (no fix)
#    c) cline_docs/ files — historical implementation plans/reviews (leave alone)
#    For each (a):
#    - Replace with new symbol name + brief migration note
#    - Replace `file.js:NNNN` line refs with stable grep patterns
#    - Pair specialist + paired discovery updates per feedback_specialist_discovery_pairing

# 4) Verify zero stale hits remain (re-run step 2's grep, filter known-OK narrative refs):
grep -rnE "<old-symbol-1>|<old-symbol-2>|<old-symbol-N>" \
  .claude/agents/ .claude/knowledge/ CLAUDE.md \
  | grep -vE "removed in Phase|previously lived here|history|HISTORICAL" \
  && echo "DRIFT REMAINS" || echo "✅ clean"
```

**Prefer grep patterns over line numbers** in specialist/discovery references. Line numbers in `mcp-server-http-clean.js` (and other large files) shift on every meaningful change. `grep -n "enforceToolSecurity(toolName"` survives refactoring; `mcp-server-http-clean.js:1792-1802` does not.

**Pair specialist + discovery updates** per `feedback_specialist_discovery_pairing`. They ground on each other; updating one without the other introduces silent inconsistency.

Document the audit + fixes in the upgrade PR. Reference commit history of past audits as templates (e.g., commit `338add12` from the SessionStore drift sweep — 9 files, +60 / -27 LOC).

---

## Tracked Items

Tracked Items are conditions we're watching but haven't acted on yet. Each has a defined trigger that flips us from "watch" to "act."

### Tracked Item #1: 30-minute idle timeout for long agent tasks

**Created**: 2026-05-19 (during SessionStore extraction)

**Symptom**: A user running a multi-step agent task in Claude Desktop / ChatGPT for >30 minutes can have their session expire mid-task. We evict by creation time, not last-use.

**Evidence in wild**: GitHub Issue `github/gh-aw-mcpg#3078` — "MCP sessions expire during long-running agent tasks (~30 min idle timeout)". Same hardcoded value, same symptom.

**Current state** (as of 2026-05-20):
- SDK pin: `@modelcontextprotocol/sdk@1.25.3`
- Session TTL: hardcoded `30 * 60 * 1000` ms in `SessionStoreOptions.sessionTtlMs` default
- Cleanup interval: `5 * 60 * 1000` ms, owned by `SessionStore.startCleanup()`
- No sliding-TTL behaviour wired anywhere

**Possible fixes (in increasing intrusiveness)**:
1. Bump `sessionTtlMs` from 30 min → 60 or 90 min (1-line change in `session-store.ts`, no spec impact)
2. Add sliding-TTL behaviour — re-introduce `refreshSessionTTL(sessionId)` on SessionStore AND wire it into the request handler. **Post-Wave-7 location**: the wire-in point is `MCPCoreManager.processRequest` at `lib/mcp/server/mcp-core.ts` (NOT the legacy `mcp-server-http-clean.js:processMCPRequest` referenced in earlier protocol versions). Every request through processRequest would bump the timestamp via `this.sessionStore.refreshSessionTTL(sessionId)`.
3. Move to the MCP stateless roadmap (Tracked Item #2) and let state handles replace TTLs

**Trigger to act**: First user-reported "session expired" during a long task, OR an SDK version introduces a built-in sliding-TTL mechanism we should adopt instead of rolling our own.

**Decision template** (fill on upgrade):
```
SDK X.Y.Z — Tracked Item #1: [ACT NOW | DEFER | OBSOLETED-by-SDK-feature]
Rationale: [...]
```

### Tracked Item #2: 2026 MCP roadmap — move to stateless transports

**Created**: 2026-05-19 (during SessionStore extraction)

**Direction**: The MCP 2026 roadmap moves AWAY from server-owned session state, toward **explicit state handles** the model carries between calls.

**Key SEPs to watch**:

| SEP | Title | What it means for us |
|-----|-------|---------------------|
| SEP-1442 | Make MCP Stateless (by default) | Session concept becomes opt-in; default flow is stateless |
| SEP-2567 | Sessionless MCP via Explicit State Handles | Server mints state handles; client threads them through subsequent calls |
| Streamable HTTP v2 (Transports WG) | Session creation/resumption/migration | Sessions survive server restarts + scale-out events |

**Implications for SessionStore when these land**:
- Our entire SessionStore design assumes server-owned session state. If the stateless SEPs ship as defaults, we'd shift to: stateless by default, opt into sessions only for OAuth flows + persistent transports.
- `sessionContexts` (auth context replay) would become a transient cache rather than a primary data structure.
- LRU caps become less load-bearing because state ownership moves to the client.

**Current state** (as of 2026-05-20):
- SEPs are proposals, not merged spec.
- SDK 2.0-alpha release notes show no session-lifecycle hooks yet.
- We're well-positioned to migrate cleanly because SessionStore is the single consolidated point of stateful session ownership.

**Trigger to act**: SEP-1442 or SEP-2567 reaches "Adopted" status, OR Streamable HTTP v2 lands as the default transport in the SDK.

**Linked debt — A1: the hand-rolled HTTP dispatcher (record 2026-05-31)**:
The HTTP path does NOT use the SDK's `Server.connect(transport)` — it hand-rolls a JSON-RPC `switch` in `MCPCoreManager.processRequest` (`mcp-core.ts`), while the SDK `Server` is `connect()`-ed only to `StdioServerTransport` (`mcp-server-v5.js:1948`). Consequence: **every spec field the SDK would carry for free must be manually mirrored on the HTTP path, or it is silently dropped.** The 2026-05-31 tool-loading work is Exhibit A — it found `instructions` AND `_meta` (alwaysLoad) both silently absent on HTTP, each needing a hand-added passthrough (commit `6d516329`). Each *future* spec field (and the stateless rework itself) is manual-mirror-or-lose with no compiler/SDK forcing parity.
- **The fix is gated here**: migrating the HTTP path onto `Server.connect(StreamableHTTPServerTransport)` is entangled with the session/stateless story — do it *as part of* this transition, not before (it'd be redone otherwise).
- **Interim defense (do NOT wait for the migration)**: add a **parity-assertion test** that fails when the stdio↔HTTP `initialize` result and `tools/list` shapes drift (serverInfo, instructions, capabilities, `_meta` passthrough). Structural prevention beats per-PR vigilance — the tool-loading review caught this only because a human asked; a test makes it self-catching. Tracked in `TODO1-mcp-spec-feature-gap-analysis.md`.

**Decision template** (fill on upgrade):
```
SDK X.Y.Z — Tracked Item #2: [WATCH | TRANSITION-NOW | TRANSITION-PLANNING]
Stateless SEP status: [...]
A1 dispatcher-parity: [parity test exists? Y/N] [HTTP still hand-rolled? Y/N]
```

---

## 2026-06-20 — Pre-upgrade assessment (GHSA-345p exposure + 1.29 vs v2)

Ran Steps 1-5 as an **assessment only** (no merge). Findings + decisions:

**Version delta**: installed `1.25.3`, latest `1.29.0` (all v1.x backports, **no major breaking changes**; the SDK keeps
v1.x as the npm `latest`). `2.0.0-alpha.1/.2` (2026-04) exists — a **major restructure** splitting the monolith into scoped
packages (`@modelcontextprotocol/{server,client,node,express,fastify,hono}`). The notable 1.26-1.29 items: **1.26.0 =
security fix for GHSA-345p-7cg4-v4c7** (shared server/transport → cross-client response leak); 1.28 `_timeoutInfo`
session-cleanup + stricter `inputSchema` (rejects raw JSON Schema on the high-level `registerTool`); 1.29 disallow
null/infinite requested TTL; OAuth discovery-caching/scopes improvements.

**GHSA-345p exposure verdict: NOT EXPOSED** (assessed in code, 2026-06-20):
- *Issue 1 (transport reuse → response mis-routing)*: **mitigated** — production is stateful, per-session transports
  (`crypto.randomUUID()` sessionId → `SessionStore`; stateless path unreachable per `mcp-core.ts:300`).
- *Issue 2 (shared server → server-to-client msgs mis-routed via overwritten `this._transport`)*: **present structurally**
  (one shared `PureSDKNativeServer`) **but not triggered** — progress notifications route through pAIchart's OWN
  `executionId`/`clientId`-keyed subscription layer (`execution-streaming.js:sendProgressUpdate`), NOT the SDK transport;
  **sampling (`createMessage`) and elicitation (`elicitInput`) are unused**; and there is **no SDK shared-server
  `notification()` call anywhere** in the HTTP path (greps empty). The only server→client message (progress) bypasses the
  vulnerable mechanism.
- **GUARDRAIL** (until we upgrade): adding **sampling, elicitation, or SDK-`notification`-based progress** on the shared
  server *before* the bump would reintroduce the exposure. The 1.29 upgrade removes this latent footgun permanently.

**Decisions**:
- **1.29 (1.x bump) — DO as a near-term, low-effort Protocol-9 pass; NOT urgent** (we're not exposed). Value = defense-in-depth
  on the advisory + the session/TTL + OAuth fixes. Code change: **low/none** (we use Zod + the low-level `Server`; the one
  thing to verify is the 1.28 `inputSchema` strictness via the Step-6 smoke tests). It is NOT a step toward v2 and is not wasted.
- **v2 — BACKLOG (do NOT chase)**: alpha, major restructure, requires a real migration (scoped-package imports + likely new
  server/transport APIs). Re-evaluate at GA + a couple of stabilizing releases.

**Tracked Item updates**: #1 — 1.29's null-TTL rejection is adjacent (sliding-TTL still NOT shipped → still WATCH/DEFER).
#2 — `2.0.0-alpha` IS the stateless/transport re-architecture track; trigger stays WATCH until v2 GAs / SEP-1442/2567 land.

---

## Procedure Status Snapshot — Last Run

| Field | Value |
|---|---|
| Last upgrade reviewed | **2026-06-20 — assessment only (no merge)**: 1.25.3→1.29.0 delta + GHSA-345p exposure verdict NOT-EXPOSED (see §2026-06-20 above). 1.29 = DO near-term (cheap, not urgent); v2-alpha = BACKLOG. |
| Last SDK version | `@modelcontextprotocol/sdk@1.25.3` (still installed — 1.29 bump pending) |
| Last spec version | `2025-11-25` |
| Tracked Item #1 status | WATCH (sliding-TTL still not shipped; 1.29 only disallows null/infinite TTL) |
| Tracked Item #2 status | WATCH (SEPs in proposal; `2.0.0-alpha` IS the stateless track — re-eval at GA) |

Update this table on every upgrade.

---

## Sources

**MCP Spec & SDK**:
- [MCP Specification](https://modelcontextprotocol.io/specification/)
- [@modelcontextprotocol/typescript-sdk releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- [Lifecycle Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)

**2026 Roadmap**:
- [The 2026 MCP Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [SEP-2567: Sessionless MCP via Explicit State Handles](https://modelcontextprotocol.io/seps/2567-sessionless-mcp)
- [SEP-1442: Make MCP Stateless (by default)](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1442)
- [Reference incident: MCP sessions expire during long agent tasks (~30 min idle)](https://github.com/github/gh-aw-mcpg/issues/3078)

**Internal**:
- `.claude/knowledge/TODO1-mcp-spec-feature-gap-analysis.md` — feature backlog
- `.claude/knowledge/TODO-mcp-server-http-clean-facade-extraction.md` — Wave 1-7 facade extraction status (Domain D shipped 2026-05-21)
- `.claude/knowledge/TODO-mcp-server-v5-decomposition.md` — mcp-server-v5.js assessment (post-Wave-7 customer review)
- `lib/auth/oauth/session-store.ts` — current SessionStore implementation
- `lib/mcp/server/mcp-core.ts` — `MCPCoreManager` class (Wave 7 Phase 7.1+7.2) — owns PureSDKNativeServer lifecycle + dispatch
- `lib/mcp/server/mcp-methods.ts` — `VALID_MCP_METHODS` dispatch allowlist (Wave 7 Phase 7.2)
- `cline_docs/reviews/mcp-server-http-clean-refactor-2026-05-19/` — Phase 2.0–2.11 history (SessionStore extraction)
- `cline_docs/reviews/mcp-core-extraction-2026-05-21/` — Wave 7 plan + reviews + SESSION-HANDOFF
