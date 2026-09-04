# TODO — Embedded execution rate-limit fix ✅ RESOLVED 2026-04-07

**Status**: ALL FIXES SHIPPED AND VERIFIED IN PRODUCTION (commits 7727ad9f, 6cb8df40, 7495b5b5, 65bf16f5, ca23282d, e7928d48). Verified by HARNESS-RUN3: Tier 1 active, 6/6 tasks completed, harness confidence 92, zero rate-limit collisions, full pipeline executed in 286 seconds.
**Severity**: Performance / architectural fidelity, not security (confirmed)
**Owner**: Closed by Steve + Claude Opus session 2026-04-07

## Symptom

During the head-to-head baseline experiment for arxiv P0-4, running two agent executions back-to-back on the same POV produced 429 "Too Many Requests" errors after only ~25 internal tool calls — far below the configured 300/min `writeOperationLimiter` budget. The harness gracefully degraded into the §5.1 plan-in-finalResponse pattern, which is itself a valuable observation, but the underlying rate-limit trigger is a bug.

## Root Cause

Three intertwined issues:

### Bug 1 — Bridge silently fails to load in compiled production

`lib/mcp/tasks/action/router-bridge.js:19` does:

```js
const { TasksActionRouter } = require('./tasks-action-router');
```

But `tasks-action-router.ts` is the only file at that path — there is no `.js` sibling. In compiled PM2 production there is no ts-node registered, so `require` throws `MODULE_NOT_FOUND`. The `try/catch` in `lib/mcp/server/tools/advanced/task-action-handler.js:23-28` silently swallows the error and `routeAction` stays `undefined`.

The three-tier fallback in `task-action-handler.js:259-281` then routes every embedded tool call through Tier 2 — `apiClient.post('/api/mcp/tasks/action')` — which is an actual HTTP POST back to the same Next.js server. Confirmed via stack trace in pino logs from the §5.4 experiment:

```
SimpleAPIClient.makeRequest (api-client.js:170)
  ← TaskActionHandler.handle (task-action-handler.js:275)
  ← EmbeddedMCPServer.callTool (embedded-server.ts:146)
  ← MCPService.callEmbeddedTool (mcpService.ts:445)
  ← l.executeAgent (compiled bundle)
```

**Effect on whitepaper §3.5**: the prose claim "in-process TypeScript path uses direct Prisma queries, no HTTP, no rate limiting" is currently wrong in production. We added a forthright correction to §3.5 referencing this TODO until the fix lands.

### Bug 2 — Single shared `'direct'` rate-limit bucket for all internal callers

`lib/api-handler.ts:82`:

```ts
const identifier = forwardedFor?.split(',')[0] || realIp || 'direct';
```

When the embedded server posts back to its own HTTP endpoint there is no `x-forwarded-for` and no `x-real-ip`, so every internal tool call lands in one shared bucket called `'direct'`. Concurrent agents collide. Bug 1 turned this from theoretical into actively harmful — every internal call now hits this bucket.

### Bug 3 — Stale comment + error message (cosmetic, fixed 2026-04-07)

`task-action-handler.js:77` previously said *"30 operations per minute"* and the error string at line 84 said *"Limit: 30 operations per minute"*. Actual config is 300. Updated to 300 and added a note that this check is currently never reached due to Bug 1.

## Fix Plan

Tiered by reversibility/risk:

| Step | What | Risk | Status |
|---|---|---|---|
| C | Update stale comment + error message in task-action-handler.js | None | ✅ Done 2026-04-07 |
| D | Correct §3.5 whitepaper prose; reference this TODO | None | ✅ Done 2026-04-07 |
| B | In `lib/api-handler.ts`, when no proxy headers present, derive identifier from `userId` (if request is authenticated) instead of falling back to `'direct'`. Concurrent agents stop colliding even if Bug 1 stays. | Low — single file, single function | ✅ Done 2026-04-07 (commit pending) — peeks bearer token without verifying for bucketing only |
| A1 | Make `router-bridge.js` resilient: detect missing TS deps at startup and log a *loud* warning instead of swallowing the error silently. Falling back to HTTP is acceptable; falling back silently is not. | Low | ✅ Done 2026-04-07 — `task-action-handler.js:18-46` now logs `info { tier: 'direct' }` on success or `warn { tier: 'http-fallback', code, expectedIn, unexpectedIn }` on failure |
| A2 | ~~Provide a JS-loadable `tasks-action-router`.~~ **Actual root cause was different**: `lib/utils/taskTypes.ts` imported lucide-react (frontend ESM-only) and the bridge handler chain transitively pulled it in via `lib/tasks/services/task.ts`. ts-node's CJS loader cannot `require()` an ESM module → bridge load fails. | Small — split `taskTypes.ts` → `taskTypes.ts` (backend-safe) + `taskTypeIcons.ts` (frontend) | ✅ Done 2026-04-07 (commit `ca23282d`) |
| **C** (NEW — uncovered by A2) | Embedded `mcpService.callEmbeddedTool` only put `{id, token}` on `toolContext.user` — missing `email` and `role`. Broken-bridge era hid this because Tier 2 HTTP re-decoded the JWT at the middleware layer. With Tier 1 active, `buildTokenPayload(enrichedContext)` strictly requires all three and threw "Incomplete user context" on every embedded tool call. | Tiny — 4-line diff, hoist `user` out of try-block scope, include email + role on toolContext | ✅ Done 2026-04-07 (commit `e7928d48`) |
| **Verification** | Re-run §5.4 baseline experiment (BASELINE-RUN3 + HARNESS-RUN3) post-all-fixes | — | ✅ Done 2026-04-07 — Tier 1 active, harness completed 6/6 tasks in 286s, confidence 92, zero 429s, full pipeline executed |
| **Follow-up (non-blocking)** | `TypeError: s is not a constructor` fires once per process on the FIRST request to `/api/mcp/tasks/action` from the webpack-bundled API route. Subsequent requests work. Webpack lazy-load issue, separate from the embedded path. Doesn't affect Tier 1. | Small — likely an ESM/CJS interop issue with one of the bundled handlers | 🔲 Pending — unrelated to embedded execution; track separately |

## Verification Gate Findings (2026-04-07)

Before deciding A2 we ran a verification gate suggested by the agent-execution-specialist. **The gate produced unexpected results that change the diagnosis.**

**What we expected to find**: webpack-bundling of `task-action-handler.js`, with `__webpack_require__` stripping ts-node hooks, justifying Option 2 (precompile).

**What we actually found**:
1. **Webpack does NOT bundle the handler chain.** `grep -rl "router-bridge" .next/server/` returned empty. `task-action-handler.js`, `router-bridge.js`, and `tasks-action-router.ts` all load via Node's real `require` chain at runtime.
2. **`server.js:11-26` already registers `tsconfig-paths/register` and `ts-node.register`** with the `@/*` path alias before requiring `server.ts`. So in theory the running paichart-web process should load the bridge cleanly.
3. **The bridge loads cleanly in a fresh `node` process** that mimics server.js's setup. Confirmed `routeAction` is exported and functional.
4. **In production logs** (`pm2 logs paichart-web --lines 5000`), all 14 Tier 2 hits are clustered in a 3-minute window — exactly the §5.4 baseline experiment timeframe (2026-04-07 00:15–00:18 UTC). There are zero Tier 2 hits before or after.
5. **Tier 1 vs Tier 2 success cannot be distinguished from current production logs** because Tier 2's "Using authenticated HTTP path" log line is at debug level (filtered out at info), and Tier 1's "Successfully executed action" line at `:286` fires regardless of which tier was used.

**This means we cannot make a confident A2 decision until A1 is shipped and the next paichart-web restart logs its bridge-load status.** The §5.4 observation is real (14 confirmed Tier 2 errors in production), but the cause may be transient or environmental rather than "TS bridge cannot load in compiled prod" as originally hypothesized. Possibilities still on the table:
- The bridge loads fine on every fresh restart but the §5.4 traces represent a stale module cache from an earlier release
- There is a module-load-order race that only manifests under specific load patterns
- The bridge fails to load on restart in a way the standalone test does not reproduce

A1 (now done) gives us the diagnostic. The next paichart-web restart will emit either `tier: 'direct'` or `tier: 'http-fallback'` exactly once at startup. **Do not attempt A2 until that log line tells us which scenario is real.**



## Verification

Before marking A2 done, the §5.4 experiment should be re-run: two back-to-back agent executions on the same POV should not trigger any 429s, and the harness execution should complete its full pipeline without falling into graceful-degradation mode (or, if it does, for a different reason than this rate limit).

After A2 lands, also re-extract the §5.4 data and consider whether the §5.1 graceful-degradation argument still has two independent observations or just one. The Experiment 4.3 observation (token budget exhaustion) is independent and stands regardless. The §5.4 observation (rate limit) was caused by this bug, so post-fix it would no longer reproduce — the whitepaper §5.4 prose should retain its current honest framing because the *behavior happened* and is reproducible until the fix ships.

## Bug Class

This started as "one site" but the subsequent discovery sweep (2026-04-07)
uncovered a **much broader family**: 13 pairs of `lib/**/*.ts` + `lib/**/*.js`
at the same path, with `.js` silently shadowing `.ts` in production. Weeks
of TS edits were unreachable — the rate-limiter pino fix (commit 367f5d71)
was empirically confirmed absent from production logs despite being "live".

This was escalated to its own eradication workstream and tracked as
**Bug Class 73 — Silent `.js` shadow over `.ts` source-of-truth, masked
by ts-node's additive extension registration that does not change
resolver priority order**. See:

- `.claude/knowledge/domain/mcp/bug-class-registry.md` #73
- `cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/implementation-plan.md` (v4)

Phase 2 proper (commit `21d21841`, 2026-04-08) deleted the 13 dual-pair
`.js` files + added `ts-node` registration to `mcp-server-http-clean.js`.
Both PM2 workers now log `tier:'direct'` at startup. Finding #10
(commit `12a4d6db`) moved the `Rate limit exceeded` pino log into
`RateLimiter.checkLimit()` itself so the smoking-gun signature finally
fires on MCP-path 429s (was only wired into the `api-handler.ts` helper
path by the original `367f5d71` commit). Empirically verified on UAT:
310 calls → 300 allowed / 10 denied / 10 structured `module:'RateLimiter'`
pino entries.

## Cross-references

- `lib/mcp/tasks/action/router-bridge.js` — bridge (now loads `tier:'direct'` in both PM2 workers post Phase 2 proper)
- `lib/mcp/server/tools/advanced/task-action-handler.js:23-28` — silent catch (kept but now logs loudly on failure via A1 fix)
- `lib/mcp/server/tools/advanced/task-action-handler.js:73-88` — comment + error message updated
- `lib/api-handler.ts:70-88` — `'direct'` bucket fallback (fixed: bucket now keyed from userId via bearer-token peek)
- `lib/utils/rate-limiter.ts:37-50` — pino `log.warn({ module: 'RateLimiter' })` now fires on every denial in `checkLimit()` hot path (Finding #10, commit `12a4d6db`)
- `WHITEPAPER-ARXIV-v3.md` §3.5 — corrected prose
- `WHITEPAPER-ARXIV-v3.md` §5.4 — head-to-head baseline observation that surfaced this bug
- `WHITEPAPER-ARXIV-v3.md` §4.7 — Tier 1 restoration follow-up stress test (100/100 on fully activated state)
- `cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/implementation-plan.md` — v4 plan including all execution-log entries 1-22, Phase 2 proper milestone, and UAT soak graduation criteria

---

## Addendum 2026-06-12 — Duplicate-bundle copy false alarm (paichart-web)

**Trigger**: the "Router bridge failed to load … INVESTIGATE if seen in
paichart-web" warn appeared in `/var/log/paichart/web-error-1.log` at
`2026-06-11T21:00:11.663Z` (pid 2807752) and was investigated per this doc.

**Verdict: BENIGN — Tier 1 is active.** Same pid logged
`Router bridge loaded — Tier 1 (direct in-process) active` at
`21:00:00.500Z` (process boot, +0.5 s). The failure at +11 s came from a
**duplicate webpack bundle copy** of `task-action-handler.js` lazily loaded
by an API route's RSC bundle (`/api/mcp/status` → dynamic
`import('@/lib/mcp/embedded-server')` at 21:00:10), where the module graph
differs and a constructor doesn't survive minification ("r is not a
constructor" — same family as the known prerender-only "s is not a
constructor", `project_embedded_bridge_regression`, resolved 2026-04-07).

**Operational rule** (now embedded in the warn message itself): on seeing
this warn in paichart-web, grep the SAME pid for the Tier-1 success line.
- Success present → duplicate-copy failure, benign. The failing copy serves
  only that route context and falls back to HTTP safely.
- No success for the pid → genuine Tier-1 outage → investigate per the
  original sections above (Bug 1 / Bug 2 re-apply).

```bash
# One-liner triage (replace PID):
grep -E 'Router bridge (loaded|failed)' /var/log/paichart/web-error-1.log | grep '"pid":PID'
```

Frequency observed: exactly one failure per process boot-cycle that touches
the affected route bundle (1× current log, 1× in `.6.gz`), never per-request.
