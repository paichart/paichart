# Chapter 10 — Large-Scale Refactoring: A 4-Day, 4500→1000 LOC Case Study

**Audience**: Engineers facing an "untouchable" large file (1500+ LOC) they need to decompose without breaking production.
**Prerequisite**: Comfort with git, basic familiarity with code-review processes, and willingness to ship in small steps.
**Reading time**: ~25 minutes (Part A: 15 min, Part B: 7 min, applying: 3 min).

---

## What this chapter teaches

Ten refactoring standards + three plumbing patterns, extracted from a real 4-day production refactor that took a 4518-LOC monolith down to 1013 LOC (–78%) across **122 commits, 7 waves, 0 incidents**.

The standards split into two parts:

- **Part A — Ten refactoring standards** (Standards 1–10): the disciplines that let you ship 22 sub-phases without a single production rollback. These describe *how the work is structured* — Phase 0 inventory, specialist review timing, the Quartet gate, fix-while-moving, drift sweeps, and honest framing.
- **Part B — Three plumbing patterns** (Patterns 11–13): the technical conventions that make verbatim extractions safe — lazy-init for circular dependencies, structural TS interfaces for JS interop, and archaeological stub comments.

Each standard is structured as: definition, what happens when you skip it, the worked example from the case study, checklist.

The standards are derived from observed failure modes: a first-attempt refactor that stalled, deploy failures caught by CI, PRE-EXISTING bugs surfaced mid-review, dead imports left after sed-rewires, and the recurring need to keep specialist documentation in sync with moved code.

**These standards are universal.** They apply to any large-scale extraction — server class decomposition, monolith carving, library extraction. The case-study examples use one production MCP server file as concrete substrate, but the patterns themselves are domain-agnostic. For the universal-vs-platform-specific breakdown of each standard, see [Where these standards come from](#where-these-standards-come-from) near the end. For the practical workflow against your own refactor, see [Applying these standards to your own code](#applying-these-standards-to-your-own-code).

---

## The starting problem

`mcp-server-http-clean.js`, the HTTP entry point for an MCP server, had grown to **4518 LOC** over a year of incremental additions:

- 7 OAuth providers' authorize/callback flows inline
- JWT auth middleware mixed with Express routing
- SessionStore inline as 3 Maps + 4 helper methods
- 12 MCP protocol dispatch cases in one switch
- 28+ Express routes registered in one method

The file worked. Customers used it daily. Tests passed. But:

- Onboarding engineers couldn't read it end-to-end
- Bug-fix PRs touched 6 different concerns per commit
- A customer asked for a code review and you couldn't reasonably point them at a 4518-LOC file and say "this is the entry point"
- Stack traces had vague line numbers because everything was in one frame

The original plan: "let's refactor it sometime." That plan stalled for 6 months. The actual plan that worked: **stop refactoring everything; instead, identify discrete domains and ship one wave per day.**

---

## The decision: waves, not one big bang

The file decomposed into 5 domains:

| Domain | What | Wave that shipped it |
|---|---|---|
| A — Sessions | `SessionStore` + OAuth-request + auth-code Maps | Wave 2 |
| B — Auth | `AuthManager` + JWT/OAuth middleware + token forwarding | Wave 3a + 4 |
| C — Microsoft OAuth | `handleMicrosoftAuthorize` (one method) | DEFERRED (still open as 7.4 backlog) |
| D — MCP backend | `processMCPRequest` + `setupMCPServer` + dispatch | Wave 7 |
| E — Express | middleware setup + route registration | Wave 5 + 6 |

The earliest two waves (1 + 2) were proof points — "can we extract one tiny thing without breaking anything?" The later waves (5, 6, 7) were larger but rode on the foundation those proof points established. **Wave-and-stop, not all-at-once.**

LOC chain by wave (the customer-facing headline):

| Milestone | File LOC | Delta |
|---|---:|---:|
| Pre-Wave-1 | 4518 | — |
| Post-Wave-4 (auth done) | 3886 | –632 |
| Post-Wave-5 (express middleware done) | 3199 | –687 |
| Post-Wave-6 (express routes done) | 1706 | –1493 |
| Post-Wave-7 (MCP backend done) | **1013** | –693 |
| **Cumulative** | | **–3505 LOC (–78%)** |

The patterns below describe how each wave was structured. They're roughly chronological in *discovery order* — Standard 1 was learned by skipping Phase 0 once and regretting it; Standard 9 was learned by shipping a wave without a drift sweep and watching specialists ground on stale documentation.

---

# Part A — Ten Refactoring Standards

## Standard 1 — Phase 0 inventory before planning

Before drafting an extraction plan, you write a Phase 0 inventory document. It enumerates: every method in scope, every call site (production traffic counts where possible), every shared field, every hazard, and every decision point that's not yet resolved.

```markdown
# Phase 0 Inventory — MCPCoreManager Extraction

## Methods in scope
| Method | LOC | Callers | Production hits/14d | Hazards |
|---|---:|---|---:|---|
| processMCPRequest | 611 | R11 only (mcp-transport-routes.ts) | hot path (high traffic) | mutable mcpServer state |
| setupMCPServer | 42 | constructor | once at boot | lazy-init, dual-location promptCommandHandler read |
| setupSDKSessionServer | 37 | ZERO | ZERO (14d) | DEAD CODE |
| initializeAuthContext | 36 | start() | once at boot | depends on setupMCPServer completing first (D-H6) |

## Hazards (D-H1 ... D-H10)
D-H1: Lazy-init pattern — Wave 4 Phase 4.4 SEC-C4 fix means mcpServer is null at
      construction; route handlers reference via ctx.getMcpServer() lazy accessor
...

## Decision points (D1 ... D6)
D5: Should MCPCoreManager constructor take 2 deps (logger, prismaClient) or 3
    (+ sessionStore)? Defer to Plan v2 with specialist input.
```

**What happens when you skip it**: you write a plan against incomplete information. Mid-execution, you discover `setupSDKSessionServer` is dead code, which means your Plan-v1 "extract 4 methods" was actually "extract 3 + drop 1" — a different shape that affects testing strategy and risk assessment. Or you discover Method X has a hidden caller you didn't know about, and the verbatim move breaks production.

**Case-study example**: Wave 7's Phase 0 inventory at `cline_docs/reviews/mcp-core-extraction-2026-05-21/phase-0-inventory.md` documented **3 LIVE methods + 1 DEAD method + 10 hazards + 6 decision points**. The DEAD method finding (`setupSDKSessionServer`, 37 LOC, zero callers, zero production hits in 14 days) became Phase 7.0b — a separate sub-phase that just deleted it. Without Phase 0, that LOC would have been moved verbatim into the new module and lived as dead code in the new file.

**Checklist**:
- [ ] Every method in scope has a LOC count, caller list, and hazard list
- [ ] Production traffic numbers (or "couldn't measure" with justification)
- [ ] Every shared field/property the methods read or write
- [ ] Every decision NOT YET RESOLVED has an explicit "Defer to Plan v2" marker
- [ ] If inventory work reveals >5h of total effort, **STOP at inventory** and re-scope before writing a plan

## Standard 2 — Specialist review BEFORE execution, not after

You write a Plan v1. You commission 3–6 specialist reviewers to read the plan and the relevant code. They produce written reviews with confidence percentages and explicit Critical / Important / Nice-to-have findings. You fold those findings into a Plan v2. Then you execute.

```
Plan v1 → 4 parallel specialist reviews → Plan v2 with traceability matrix → arch-review verdict → Execute
        86–89% confidence                94% verdict v2
```

**What happens when you skip it**: you execute against a v1 plan that misses the C-CROSS findings (concerns that cut across multiple specialists' domains). Half your phases hit unexpected hazards mid-extraction. You spend the same total hours, but on a worse outcome, with a higher chance of a deploy rollback.

**Case-study example**: Wave 7 Plan v1 proposed a `get mcpServer()` property shim on the server class so existing routes wouldn't need rewiring. Round 1 architectural-review-specialist flagged this as CRIT-1: "the shim is a transient construct that will outlive its purpose." Plan v2 folded the finding as `C-CROSS-2: no property shim; direct rewire of all 17 `this.mcpServer.X` references to `this.mcpCore.mcpServer.X`." That was a 3-hour sed-rewire instead of a shim that would have been a 6-month cleanup TODO. The specialist round caught it before any code was written.

The specialist review pattern also surfaced **two PRE-EXISTING production bugs** during Round 1 (C-PRE-1 dispatch fall-through, C-PRE-2 registration mismatch — see Standard 7). These would have been moved verbatim into the new module without the review — fix-while-moving became a sub-phase explicitly because the reviews surfaced them.

**Checklist**:
- [ ] Plan v1 written and circulated
- [ ] 3+ specialists assigned (domain coverage: architecture + the 2–3 areas the refactor touches)
- [ ] Each specialist instructed to **run their discovery prompt FIRST** (otherwise reviews ground only on docs, not on current code state)
- [ ] Findings classified Critical / Important / Nice-to-have with severity
- [ ] Plan v2 builds a **traceability matrix** mapping every finding to "folded / deferred with reason / rejected with reason"
- [ ] Confidence threshold: aim for 92%+ from architectural-review before execution

## Standard 3 — Plan v2 with traceability matrix

The Plan v2 document is not a polished plan; it's a record of decisions. Every Critical / Important finding from Round 1 maps to one of three outcomes:

- **Folded** — Plan v2 changes to absorb the finding
- **Deferred** — finding is real but the work is deferred to a later phase, with an explicit trigger condition
- **Rejected** — the finding is obviated by another change OR the team disagrees, with a written reason

```markdown
| Finding ID | Source | Severity | Disposition | Plan v2 §ref |
|---|---|---|---|---|
| C1 (agent-execution) | 25× `_mcpServer!` non-null assertions | Critical | FOLDED — inline guard + local const per Q1 | §3.2 |
| C2 (boundary-contract) | `assertInitialized` predicate method | Critical | OBVIATED by C1 fold | n/a |
| I-N1 (boundary-contract) | new `SessionStoreShape` interface | Important | DEFERRED — use real SessionStore type per C-CROSS-4 | n/a |
```

**What happens when you skip it**: 4 weeks later, someone reads Plan v2 and asks "what happened to that boundary-contract finding C2?" — and nobody remembers. Or a follow-up audit ("which Critical findings did we ship and which did we defer?") devolves into archaeology. The matrix preserves intent.

**Case-study example**: Wave 7 Plan v2's traceability matrix folded 10 of 12 Critical findings and 12 of 14 Important findings. The 2 Critical ones marked "OBVIATED" each cited which folded finding made them moot. The deferrals each named a trigger condition (e.g., "ship logging to see what callers do" for an audit-log concern). When commits 7.0a → 7.2.2 shipped, every commit message could point back at the traceability matrix and say "this implements C-CROSS-1 + I-CROSS-5" — no surprise interpretations.

**Checklist**:
- [ ] Every Critical finding has a disposition row
- [ ] Every Important finding has a disposition row
- [ ] Nice-to-have findings have a disposition row OR are documented as "ignored — too low priority"
- [ ] Each "DEFERRED" entry has a trigger condition (not just "later")
- [ ] Each "REJECTED" entry has a reason, not just "no"
- [ ] **Headline ≠ matrix**. After the fold, audit your own headline ("12 of 14 absorbed") — the long tail of "deferred" + "rejected" matters as much as "folded"

## Standard 4 — Sub-phase structure: numbered, atomic, deployable

A wave is not one commit. It's a sequence of sub-phases, each independently buildable, testable, and deployable. Sub-phases are numbered (`Phase 7.0a`, `Phase 7.0b`, `Phase 7.1`, `Phase 7.2`, `Phase 7.2.1`, `Phase 7.2.2`, `Phase 7.3`). Each sub-phase is one commit.

The sub-phase decimal numbering signals work shape:
- `7.0x` = PRE-EXISTING fixes + dead-code drops (set up the work)
- `7.1`, `7.2` = the actual extractions (largest changes)
- `7.x.y` = secondary cleanups discovered post-deploy
- `7.3` = drift sweep + handoff (closes the wave)

```
Wave 7 commits (in actual ship order):
204e6edb  Phase 7.0a — close 2 PRE-EXISTING MCP spec compliance bugs
6d83ec63  Phase 7.0b — drop dead setupSDKSessionServer (37 LOC)
5de41f97  Phase 7.1 — MCPCoreManager skeleton + setupMCPServer + initializeAuthContext + rewire (-49 LOC)
8dc998ba  Phase 7.2 — extract processRequest + detectClientMode + handleStatelessRequest (-645 LOC)
6ca1457d  Phase 7.2.1 — drop dead PromptRegistry + PromptCommandHandler imports
a2369f1f  Phase 7.2.2 — patch test-mcp-resource-security for processMCPRequest extraction
353c88e8  Phase 7.3 — drift sweep + facade-TODO Domain D complete + SESSION-HANDOFF
```

**What happens when you skip it**: you ship a single massive commit. CI fails on something unrelated, you can't bisect to find which sub-change broke it. Or you deploy and break production, and you have to revert *everything* even though only one part was bad.

**Case-study example**: Wave 7 had a deploy failure between Phase 7.2 and Phase 7.2.2 — CI's string-pinned validation tests grepped the moved code by literal text. Because Phase 7.2 was its own commit, the fix (Phase 7.2.2) was a 1-commit revert-and-patch — not a wave-wide rollback. The diagnostic was 30 seconds because only one commit could have caused it.

**Checklist**:
- [ ] Each sub-phase passes its own Quartet gate (Standard 6) before its own commit
- [ ] No sub-phase is "all the things." If you're tempted to put 2 extractions in one phase, split it
- [ ] Sub-phase numbering is monotonic and readable (`7.0a`, `7.0b`, `7.1`, not `7.0`, `7.0.1`, `7.0.1.alpha`)
- [ ] Each sub-phase has a one-line summary in the commit subject (`Phase 7.0b — drop dead setupSDKSessionServer (37 LOC)`)

## Standard 5 — Verbatim port, then optimize separately

When you extract a method to a new location, you don't simultaneously refactor it. The first commit moves the body verbatim. The second commit (if any) optimizes.

```javascript
// BEFORE (server class)
async processMCPRequest(request, user) {
  if (!this.mcpServer) { throw new Error('MCP server not initialized'); }
  // ...611 LOC of dispatch logic...
}

// AFTER (mcp-core.ts — verbatim, same logic, new home)
async processRequest(request: unknown, user: unknown): Promise<unknown> {
  if (!this._mcpServer) { throw new Error('MCPCoreManager.processRequest called before init() — _mcpServer is null'); }
  const mcpServer = this._mcpServer;
  // ...611 LOC of dispatch logic — character-for-character preserved...
}
```

Notice what changed: signature (TS types), guard error message (clearer), and one new local const (`mcpServer`). What didn't change: every branch, every comment, every error path inside the 611 LOC. **That's a verbatim port.**

**What happens when you skip it**: bug attribution becomes impossible. If something breaks, you don't know whether it's the extraction or the optimization. Diff review is harder because reviewers see both motion and change. Code review takes longer.

**Case-study example**: Wave 7 Phase 7.2 ported `processMCPRequest` (611 LOC) to `MCPCoreManager.processRequest`. The diff for that sub-phase included the verbatim move + the TS-type wrappers + one variable rename (`readResourceId` → `resourceId`) that the structural extraction of `parseResourceUri()` required. **Every business-logic branch was character-identical.** The arch-review-specialist verdict v2 explicitly cited "verbatim preservation" as a confidence factor (94% GO instead of 80%).

**Checklist**:
- [ ] First commit changes location only (or location + minimal type wrappers for JS→TS ports)
- [ ] Optimizations (renames, abstractions, "while we're here" cleanup) live in separate commits
- [ ] Diff for the extraction commit can be read line-by-line as "same logic, new home"
- [ ] If you're tempted to "fix this small thing while moving" — DON'T (unless it's a PRE-EXISTING bug per Standard 7)

## Standard 6 — The Quartet gate per sub-phase

Before every sub-phase commit, all four legs must pass:

1. **Unit tests** — every existing test plus any new tests for the extracted module
2. **Build** — `npm run build` or your project's TS/lint/static-check pipeline
3. **Bare-node smoke** — instantiate the class outside the web server, verify construction + basic invariants
4. **Curl smoke** — start the full server, hit the affected endpoints, verify HTTP responses match expectation

```bash
# Leg 1: unit tests for the new module + regression for adjacent modules
npm run test:mcp-core               # 19/19
npm run test:mcp-method-classifier  # 11/11
npm run test:routes-mcp-transport   # 17/17 (no regression)
npm run test:routes-oauth-flow      # 49/49 (no regression)

# Leg 2: build clean
npm run build                       # ✓ Compiled successfully

# Leg 3: bare-node construction
JWT_SECRET=... node -e "
require('tsconfig-paths/register');
const { CleanMCPHTTPServer } = require('./mcp-server-http-clean.js');
const srv = new CleanMCPHTTPServer({ port: 9998, prismaClient: null });
if (typeof srv.processMCPRequest === 'function') throw new Error('still on server');
if (typeof srv.mcpCore.processRequest !== 'function') throw new Error('missing');
console.log('LEG3_OK');
"

# Leg 4: curl smoke against the full server
curl -s -w "%{http_code}\n" -X POST http://127.0.0.1:9999/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}'
# Expected: HTTP 200 + protocolVersion 2025-06-18
```

**What happens when you skip a leg**:
- Skip Leg 1: you ship a regression in an adjacent module
- Skip Leg 2: deploy fails at the build stage, blocks the release
- Skip Leg 3: webpack-resolved imports work, but `npm run mcp` (bare node) fails because the require chain breaks
- Skip Leg 4: the unit tests pass on mocks but production behavior diverges (e.g., session middleware order matters)

**Case-study example**: Wave 5 (express middleware) had a near-miss when a wired-but-untested middleware order change passed unit tests but failed Leg 4 curl smoke — the middleware sequence required `cors → JSON parser → BC54 origin check`, but the new wire-up did `JSON parser → cors → BC54`. Unit tests didn't catch it. Curl smoke did. The Quartet gate caught a bug that would have shipped without Leg 4.

**Checklist**:
- [ ] Each sub-phase runs all 4 legs before commit
- [ ] Leg 3 (bare-node) is non-negotiable — it catches require-resolution issues webpack hides
- [ ] Leg 4 (curl smoke) is non-negotiable for any sub-phase touching HTTP behavior
- [ ] If a leg fails, the sub-phase doesn't ship until the leg passes

## Standard 7 — Fix PRE-EXISTING bugs in the same wave

Specialist reviews often surface PRE-EXISTING production bugs while reviewing the extraction plan. **Fix them in the same wave, before the extraction.** Don't move buggy code verbatim — fix it, then move the fix.

Convention: prefix these fixes as `Phase X.0a` (or `Phase X.0b`, etc.) — they happen BEFORE the actual extraction sub-phases.

```
Wave 7 sub-phase order:
- 7.0a — PRE-EXISTING fixes (2 spec-compliance gaps — see Standard 7)
- 7.0b — PRE-EXISTING dead-code drop (setupSDKSessionServer, 37 LOC)
- 7.1  — Extraction begins
```

**What happens when you skip it**: you move buggy code verbatim into a new module. Two months later, when someone fixes the bug, the git history says "fix shipped in module mcp-core.ts" — but the bug actually existed before the extraction. Attribution breaks.

**Case-study example**: Wave 7 Round 1 review surfaced two PRE-EXISTING MCP-spec compliance issues:
- **C-PRE-1**: a method-dispatch fall-through where two notification methods were listed in the dispatch allowlist but only one had an explicit case branch — the other two fell through to default and returned the wrong response shape.
- **C-PRE-2**: a registration-mismatch where a method was marked auth-public but missing from the dispatch allowlist, so clients calling it got a "method not found" error instead of the spec-required empty result.

Both classes of bug are typical of stale dual-source-of-truth dispatch tables — the kind of compliance gap that surfaces only when a thorough spec reviewer reads the dispatch switch alongside the auth allowlist. Both fixed in Phase 7.0a, before Phase 7.1 extraction began. The Phase 7.1 + 7.2 extraction commits moved already-correct code, not buggy code.

**Checklist**:
- [ ] Specialist reviews explicitly invited to surface PRE-EXISTING concerns
- [ ] PRE-EXISTING fixes get their own `0a`/`0b` sub-phases — separate from extraction commits
- [ ] Commit message explicitly labels them: `🔒 fix(wave-N): Phase N.0a — close 2 PRE-EXISTING bugs`
- [ ] If a finding is PRE-EXISTING but not in the current wave's scope, file as a follow-up task with a trigger condition (not "later")

## Standard 8 — Dead-code drops are sub-phases too

Specialist review or Phase 0 inventory often surfaces methods that are dead code (zero callers, zero production traffic). **Delete them as their own sub-phase, not as part of the extraction.**

```
Wave 7 Phase 7.0b — drop dead setupSDKSessionServer (37 LOC)

mcp-server-http-clean.js change:
- async setupSDKSessionServer(sessionServer, userContext) {
-   try {
-     ...37 LOC of method body...
-   }
- }
+ // setupSDKSessionServer() REMOVED 2026-05-21 (Wave 7 Phase 7.0b).
+ // Last edit Sept 10, 2025 (commit bce5322e). Zero callers in repo;
+ // zero production journald hits in 14 days. Net -37 LOC.
```

**What happens when you skip it**: dead code gets moved verbatim into the new module. The new module starts life with 37 LOC of methods that are never called. Future readers spend time understanding what they do before realizing they're dead.

**Case-study example**: Wave 7 dropped `setupSDKSessionServer` in Phase 7.0b (37 LOC, 14-day production audit confirmed zero callers, last edit was 8 months prior). It was Wave 7's quickest sub-phase — 5 minutes — but it eliminated 37 LOC from the new module's surface and gave reviewers one less thing to understand. Parallel to Wave 3b.0a precedent (dropped 542 LOC of dead Microsoft OAuth helpers under the same pattern).

**Verification ritual** (before dropping):
1. `grep -rn "methodName" .` across the repo — confirm zero callers
2. SSH to production, `journalctl --since "14 days ago" | grep methodName` — confirm zero hits
3. `git log -p methodName | head` — confirm last edit is months/years old

**Checklist**:
- [ ] Verification before delete (repo grep + production journald grep + git history)
- [ ] Archaeological stub comment replaces the deleted body (says when, why, links to git ref)
- [ ] If verification shows ANY live caller or hit, DON'T delete — instead, file as future work

## Standard 9 — Drift sweep at wave close

After the extraction sub-phases ship, specialist agents + discovery prompts that reference the moved code will be stale. They'll say "processMCPRequest at `mcp-server-http-clean.js:1019`" — but the method moved and the file shrunk. The drift sweep finds and patches those refs.

```bash
# Drift-sweep grep, run at wave close
grep -rnE "<old-symbol-1>|<old-symbol-2>|<old-file-path>:<old-line-num>" \
  .claude/agents/ \
  .claude/knowledge/discoveries/ \
  .claude/knowledge/patterns/ \
  .claude/knowledge/protocols/ \
  .claude/knowledge/TODO*.md \
  .claude/knowledge/domain/ \
  CLAUDE.md
```

For each match, triage as one of three categories:

- **Active reference to wrong location** — PATCH (point at new location with grep target, not absolute line ref)
- **Historical narrative** ("was at mcp-server-http-clean.js:670 pre-Wave-4") — LEAVE ALONE
- **Semantic description** ("the function does X") — LEAVE ALONE if accurate

**What happens when you skip it**: when the next bug surfaces in the extracted area, the specialist tasked with diagnosing it reads its discovery prompt, grounds on the old location, and produces a diagnosis based on stale state. The diagnosis is wrong. Trust in the specialist system erodes.

**Case-study example**: Wave 7 Phase 7.3 swept 10 files across `.claude/agents/`, `.claude/knowledge/discoveries/`, `.claude/knowledge/patterns/`, `.claude/knowledge/protocols/`, and `.claude/knowledge/domain/mcp/`. Found and patched 9 active stale refs. Left 3 historical-narrative refs alone (explicitly framed as "BEFORE / pre-Phase X" archaeology). The sweep took ~75 minutes and shipped as a separate commit; the alternative was specialists silently producing wrong diagnoses for weeks.

**Checklist**:
- [ ] Grep covers ALL active reference scopes (agents, discoveries, patterns, protocols, TODOs, domain docs, CLAUDE.md)
- [ ] Per match: classify as active / historical / semantic
- [ ] Patches prefer grep targets to absolute line numbers (line refs decay; grep targets survive moves)
- [ ] Drift sweep is its own commit, not folded into an extraction commit
- [ ] Verification re-grep at end shows only properly-annotated historical refs remaining

## Standard 10 — Honest framing: "substantially complete," not "100%"

When you close a wave, you write a status section. The temptation: "Wave 7 COMPLETE ✅ — server class fully facade." The honest framing: "Wave 7 substantially complete — Domain D shipped; Domain C handleMicrosoftAuthorize still on server class as Wave 7.4 backlog."

```markdown
# BAD (over-claim):
> Status: COMPLETE ✅ — mcp-server-http-clean.js fully extracted

# GOOD (honest):
> Status: SUBSTANTIALLY COMPLETE for current scope —
> Domain A (SessionStore), Domain B (AuthManager), Domain D (MCPCoreManager),
> Domain E.middleware + Domain E.routes all extracted.
> Still extractable for full facade: 1 server-class method (Domain C —
> handleMicrosoftAuthorize, ~322 LOC). Open as Wave 7.4 backlog.
```

**What happens when you skip it**: a customer reading the wave-close memo believes the work is done, then later discovers a 322-LOC method still on the server class. Trust erodes. Worse: a future engineer joining the team trusts the "COMPLETE" claim and skips an audit they should have done.

**Case-study example**: Wave 6 Phase 6.6 initially documented `mcp-server-http-clean.js` as "FUNCTIONALLY COMPLETE for current scope" — but Steve caught me over-claiming twice and asked "we have one method extracted but I believe there is another four." The wave-close TODO was patched to explicitly list **Domain C (1 method) + Domain D (4 methods) + 2 placement decisions** as still open, framed as "Wave 7 backlog." That accurate framing then drove the actual scoping of Wave 7. Over-claiming would have delayed Wave 7 by months.

**Checklist**:
- [ ] Wave-close status uses "substantially complete" or "complete for current scope" — never bare "complete"
- [ ] Explicit list of what's still open (even if "no business driver")
- [ ] Trigger conditions for each open item (what would make us pick it up?)
- [ ] At the close of a wave, audit your own headline before publishing it

---

# Part B — Three Plumbing Patterns

The technical conventions that make Part A's standards possible.

## Pattern 11 — Lazy-init + inline guard for circular dependencies

The extracted module's main field (e.g., `_mcpServer`) is `null` at construction. It's populated by an `init()` method called once at server start. Per-request methods that use the field check `if (!this._mcpServer) throw` at the top, then narrow via a `const mcpServer = this._mcpServer;` local.

```typescript
export class MCPCoreManager {
  private readonly logger: Logger;
  private readonly prismaClient: PrismaClient;
  private readonly sessionStore: SessionStore;
  private _mcpServer: PureSDKNativeServerShape | null = null;  // ← lazy

  constructor(opts: { logger, prismaClient, sessionStore }) {
    this.logger = opts.logger;
    this.prismaClient = opts.prismaClient;
    this.sessionStore = opts.sessionStore;
    // _mcpServer stays null until init() runs
  }

  get mcpServer(): PureSDKNativeServerShape | null {
    return this._mcpServer;  // route handlers reference via this lazy accessor
  }

  async init(): Promise<PureSDKNativeServerShape> {
    this._mcpServer = new PureSDKNativeServer();
    await this._mcpServer.start();
    return this._mcpServer;
  }

  async processRequest(request: unknown, user: unknown): Promise<unknown> {
    // C-CROSS-1 inline guard + narrowing
    if (!this._mcpServer) {
      throw new Error('MCPCoreManager.processRequest called before init()');
    }
    const mcpServer = this._mcpServer;  // TS narrows to non-null
    // ...use mcpServer.X throughout (NOT this._mcpServer.X with !)...
  }
}
```

**Why this pattern instead of "construct everything in constructor"**:
- The backend (`PureSDKNativeServer`) needs DB access to load prompts at start. The DB pool isn't ready at construction. So construction must be cheap.
- Constructor + init separation lets you test the class without the heavy backend (Foundation tests: "constructor stores deps without invoking them").
- Route handlers reference `this.mcpCore.mcpServer` via a lazy getter — they bind at registration time but dereference per-request, so they can survive the init() gap.

**Why inline guard, not predicate**: each per-request method has one place that touches the field. A separate `assertInitialized()` predicate is over-engineered for one site. The inline `if (!this._mcpServer) throw` + `const mcpServer = this._mcpServer` pattern is 3 lines, TS narrows automatically, and matches the existing prior art.

**Case-study example**: Wave 7 used this pattern across `init()`, `initializeAuthContext()`, `processRequest()`, `handleStatelessRequest()`. Architectural-review-specialist verdict v2 Q1 explicitly chose inline guard over predicate as "simpler customer code-review optics."

## Pattern 12 — Hand-written structural TS interfaces for JS interop

When the extracted TS module needs to use a class from a JS module (e.g., `PureSDKNativeServer` from `mcp-server-v5.js`), you DON'T run `tsc --declaration` on the JS file. You hand-write a structural TS interface covering only the fields/methods you actually touch.

```typescript
// lib/mcp/server/mcp-core.ts
export interface PureSDKNativeServerShape {
  start(): Promise<void>;
  setUserContext(context: unknown): void;
  toolHandlers: { get(name: string): Handler | undefined };
  getToolsForUser(user: unknown): Array<Tool>;
  promptRegistry?: { ... };
  resourceManager?: { ... };
  hubResourceProvider?: { ... };
  // ...other fields we depend on...
}

// Named CJS interop — the JS file has no type declarations
const mcpServerV5: { PureSDKNativeServer: new () => PureSDKNativeServerShape } =
  require('../../../mcp-server-v5');
const PureSDKNativeServer = mcpServerV5.PureSDKNativeServer;
```

**Why hand-written, not generated**:
- A `tsc --declaration` lift would emit types for EVERY field of the JS class — including private state you don't depend on. Future JS class evolution would silently break your interface.
- Hand-written interface = explicit contract. If the JS class adds a new field, your TS code doesn't see it (and doesn't need to). If it removes a field you depend on, your TS code fails to type-check immediately.
- The interface lives next to the code that uses it. A reviewer asking "what does this TS module depend on from the JS module?" gets the answer in one place.

**Case-study example**: Wave 7's `PureSDKNativeServerShape` is ~50 LOC covering 7 fields/methods. The actual `PureSDKNativeServer` JS class is 2039 LOC with many more fields. The interface explicitly documents the dependency boundary — and boundary-contract-specialist Round 1 C2 called it out as a requirement, not a nice-to-have.

## Pattern 13 — Archaeological stub comments

When you delete a method body (because it moved to a new module), don't leave the bare `// extracted` comment. Write a stub that future readers can use to find the new home.

```javascript
// processMCPRequest() EXTRACTED to lib/mcp/server/mcp-core.ts:MCPCoreManager.processRequest()
// in Wave 7 Phase 7.2 (2026-05-21). Verbatim port — 611 LOC → ~480 LOC TS
// (parseResourceUri sub-helper + VALID_MCP_METHODS import). Hot path
// (high traffic). Server class delegates via _buildRouteContext.processMCPRequest.
```

**Why this pattern**:
- 6 months later, someone greps the server class for `processMCPRequest` to find where it lives. Without the stub, they conclude it's been deleted. With the stub, they know exactly where to look.
- The "verbatim port" note plus the LOC delta tells a reviewer "this was a careful move, not a rewrite."
- The "Hot path (high traffic)" note signals to the next refactor that this method's location matters.

**Antipattern**: leaving the deleted code as a comment block. That's archaeology of the wrong kind — actual deleted code in comments rots.

**Case-study example**: After Wave 7 Phase 7.2, `mcp-server-http-clean.js` has archaeological stubs for `processMCPRequest`, `detectClientMode`, `handleStatelessRequest`, `setupMCPServer`, `initializeAuthContext`. Each is 3–6 lines, names the new location, the wave/phase that moved it, and the relevant production characteristic.

---

## Where these standards come from

| Standard | Wave that taught it | Mechanism |
|---|---|---|
| 1. Phase 0 inventory | Wave 7 (sub-phase 7.0b) | DEAD `setupSDKSessionServer` discovered ONLY because inventory was done first |
| 2. Specialist review BEFORE | Wave 4 + 5 + 6 + 7 | Each wave shipped specialist-folded plans; one early aborted attempt skipped review and got stuck |
| 3. Traceability matrix | Wave 5 Round 2 | Steve caught me dropping a "deferred" finding from my own headline; matrix discipline saved the next wave |
| 4. Sub-phase structure | Wave 6 Phases 6.1–6.5 | 5 sequential route-group extractions, each independently deployable |
| 5. Verbatim port | Wave 7 Phase 7.2 | 611-LOC `processMCPRequest` moved character-identical; arch-review cited as confidence factor |
| 6. Quartet gate | Wave 5 (near-miss caught by Leg 4) | Middleware ordering bug that unit tests missed; curl smoke caught it |
| 7. Fix PRE-EXISTING bugs | Wave 6 Tasks #156+157 + Wave 7 Phase 7.0a | Specialist reviews surfaced bugs that would have been moved verbatim |
| 8. Dead-code drops | Wave 3b.0a (542 LOC) + Wave 7.0b (37 LOC) | Production audit confirmed zero callers; deletion = its own sub-phase |
| 9. Drift sweep | Wave 7 Phase 7.3 | 10 specialist + discovery files patched after extraction; first attempt at this revealed pattern |
| 10. Honest framing | Wave 6 Phase 6.6 close | Steve caught me over-claiming "FUNCTIONALLY COMPLETE" twice; honest framing drove Wave 7 scoping |
| 11. Lazy-init + inline guard | Wave 4 Phase 4.4 SEC-C4 | Throw-before-init defense; arch-review Q1 chose inline over predicate |
| 12. Structural TS interfaces | Wave 7 boundary-contract Round 1 C2 | `PureSDKNativeServerShape` hand-written instead of `tsc --declaration` lift |
| 13. Archaeological stubs | Wave 3b.0a + Wave 7.0b | Replaces bare comments with new-location signposts |

These are not the only patterns we used — but they're the ones that would have prevented identifiable failures had we used them earlier. Patterns we tried and abandoned (e.g., the property-shim pattern from Wave 7 Plan v1) are visible in the review documents but not in this list.

---

## Self-audit

Score your refactor against the 13 standards. Each is binary (yes / no — no credit for partial).

**Process discipline (Part A)**:
- [ ] **GS1** — Phase 0 inventory documented before any plan was written
- [ ] **GS2** — At least 3 specialists reviewed the plan before execution
- [ ] **GS3** — Traceability matrix maps every finding to folded/deferred/rejected
- [ ] **GS4** — Wave is split into numbered sub-phases, each independently deployable
- [ ] **GS5** — Extraction commits are verbatim ports; optimizations live in separate commits
- [ ] **GS6** — Each sub-phase passes Quartet gate (unit tests + build + bare-node + curl) before commit
- [ ] **GS7** — PRE-EXISTING bugs surfaced by review are fixed in `0a`/`0b` sub-phases before extraction
- [ ] **GS8** — Dead-code drops are separate sub-phases with verification (grep + journald + git history)
- [ ] **GS9** — Drift sweep at wave close, covering agents/discoveries/patterns/protocols/TODOs
- [ ] **GS10** — Wave-close framing uses "substantially complete" — explicit list of what's still open

**Plumbing patterns (Part B)**:
- [ ] **GS11** — Lazy-init + inline guard for fields populated post-construction
- [ ] **GS12** — Hand-written structural TS interfaces for JS interop boundaries
- [ ] **GS13** — Archaeological stub comments mark moved code's new home

| Score | Verdict |
|---|---|
| 13 / 13 | A+ — production-ready discipline |
| 11–12 / 13 | A — minor process gaps, low risk |
| 8–10 / 13 | B — at least one risky shortcut; consider a paired senior review |
| 5–7 / 13 | C — pause and add the missing disciplines before continuing |
| < 5 / 13 | F — high risk of rollback; restart with Phase 0 |

---

## Applying these standards to your own code

### 1. Find your monolith

Run on your repo:
```bash
find . -name "*.js" -o -name "*.ts" | grep -v node_modules | xargs wc -l 2>/dev/null | sort -rn | head -10
```

Any file over ~1500 LOC is a candidate. Some 1500-LOC files are fine (e.g., a generated tool registry). Look for ones with >5 distinct concerns mixed together.

### 2. Score with the self-audit

You're scoring INTENT, not work-done-yet. If you haven't even started a refactor, your score is 0/13 — that's fine. The point is to know which standards you'll need.

### 3. Pick your first wave

Smallest, lowest-risk domain first. The right first wave is one where:
- The domain has a clear boundary (e.g., session management)
- The change is small enough to ship in 1-2 days
- A rollback would be easy (revert one commit)

This is your **proof point**. If Wave 1 doesn't go cleanly, fix the discipline before Wave 2.

### 4. Build the muscle

Each wave gets easier because the rhythm sets in:
- **Day 1**: Phase 0 inventory + Plan v1 + specialist commissions
- **Day 2**: Round 1 reviews + Plan v2 fold + arch-review verdict
- **Day 3**: Sub-phase execution + Quartet gates per phase
- **Day 4**: Drift sweep + SESSION-HANDOFF + memory save

The case study's Wave 7 ran on this exact schedule and shipped –693 LOC + 30 new tests + 2 PRE-EXISTING bug fixes in 4 days.

### 5. Document the journey

After each wave, write a `cline_docs/reviews/<wave-name>/SESSION-HANDOFF.md` that captures:
- LOC chain (start, end, delta)
- Sub-phase commits with one-line summaries
- Specialists consulted + their confidence percentages
- Plan v2 folds applied (Critical / Important / Nice-to-have counts)
- PRE-EXISTING bugs surfaced + closed
- Quartet gate results per sub-phase
- Backlog: what's still open + trigger conditions

This is the document a future engineer (or your future self) reads when they want to understand what shipped and why. **It's not a marketing document — it's a process trace.**

### 6. Repeat with a slightly bigger bite

Wave 2's effort estimate is ~1.5× Wave 1. Wave 3 is ~1.5× Wave 2. Once you hit the comfortable cadence, the wave size plateaus around 600-700 LOC of extraction per wave.

By Wave 7 (the largest single extraction in the case study, 645 LOC moved), the rhythm was so established that the entire wave shipped in one focused day after the customer code-review driver showed up.

---

## Creating your own pattern

If your refactor surfaces a discipline that's not in this chapter — write it up. The patterns in Part A and Part B came from observed failures, not from theory. The 14th standard for your project is the one you needed but didn't have. The case-study repository has a `feedback_*.md` memory pattern for exactly this — capture the lesson in a structured note so the next person doesn't relearn it.

The 13 standards in this chapter are universal. The 14th (or 20th, or 50th) is yours.
