# Agent Output Trustworthiness Defense Stack

**Type**: Architecture / Detection
**Created**: 2026-04-16
**Confidence**: 91% ✅ (multi-specialist reviewed: agent-execution + template-system + pipeline-harness)
**Status**: Production-shipped (task #84 umbrella; tasks #82, #87, #88, #89, #90, #91)
**Swept**: 2026-11-21 (Protocol 11) — file map, path-parity rule, test references, retired field and coverage row brought to the tree; record at the end of this file

---

## Pattern Overview

### Problem

Agent execution can produce a `SUCCESS` outcome that masks structural defects: tool calls failed but the LLM's narrative claimed success, the wrong template was assigned and the agent produced plausible-but-wrong output, the harness skipped a protocol step but exited cleanly, the budget limiter rejected critical operations and the agent gracefully gave up. Each of these used to surface as the same opaque `SUCCESS` row in `agent_executions`, with downstream agents trusting the `finalResponse` text as ground truth.

The 2026-04-16 artifact-synthesis incident was the canonical case: harness made 3 `task.create` calls, then 3 consecutive budget-rejected calls, then exited with `end_turn` and a `finalResponse` claiming "Tasks Created and Assigned ✅" — when the third assign had failed. Pipeline stalled silently; agent's narrative was self-contradicting against the tool log.

### Solution

A layered defense stack of **additive detection signals** that surface structural defects in `result.json` artifact metadata WITHOUT changing the `SUCCESS`/`FAILED` control flow. Each signal is independently emitted by a detector. The first match in a priority cascade sets the single-value `errorCategory` field; co-occurring detectors populate separate evidence fields that can all coexist on one execution. Plus one anti-fabrication intervention that prevents the most common failure mode at the source by injecting a correction turn before `end_turn`.

Three structural pillars:

1. **Additive signals, not control flow** — every detector adds metadata; none reject the execution. Downstream consumers (GUI, harness chainer, reactor) decide what to do with the signals.
2. **Single `errorCategory` + co-occurring evidence fields** — `errorCategory` holds the most-specific category (cascade order); fields like `protocolValidation` and `executionDegradation` populate independently and can all be present (`templateScopeMismatch` was a third until its detector was retired on 2026-07-17).
3. **Anti-fabrication correction turn** — when end_turn fires with failed tool calls, inject one correction turn (no tools available) so the LLM rewrites its narrative against ground truth before the response is persisted.

### Results

- **Would have caught the artifact-synthesis incident across 3 independent dimensions**: BUDGET_EXHAUSTED (P5), PROTOCOL_STEP_SKIPPED (P8), and the correction turn (#89) would have rewritten the fabricated success narrative.
- **Zero control-flow changes** — no executions reclassified from SUCCESS to FAILED; signals are purely additive metadata.
- **Tests.** At ship: 23 unit tests across two pure-function helpers. Today: `npm run test:pipeline-protocol-validator` runs 61 checks; the template-scope matcher and its 11 tests were deleted with the retired detector (2026-07-17).
- **One home for every signal** (since the 2026-07-05 execution-path convergence): the cascade, the validators, the correction turn and the `result.json` builder live in shared modules that both callers reach through `runExecutionCore`; `agentExecutionEngine.ts` and the stream route contain none of them. At ship (April 2026) there were two implementations and parity was kept by mirroring every signal in both files — that rule is RETIRED; see File Architecture.
- **Zero regressions** across the existing 13-test agent-execution security suite.

---

## The Stack — All Signals At A Glance

### Pre-execution (PRE-LLM dispatch)

| # | Signal | Trigger | Source file |
|---|--------|---------|-------------|
| **P9** | ~~`TEMPLATE_SCOPE_MISMATCH`~~ | **RETIRED 2026-07-17** — the verb-overlap heuristic measured ~60 firings / 0 true positives (every firing was a deliberate protocol assignment whose vocabulary the verb table didn't cover); at ~100% FPR it occupied 95% of the degradation channel and trained readers to ignore it. Matcher deleted; revisit trigger = first ACTUAL wrong-template incident | (deleted) |

### During-execution (correction turn)

| Mechanism | Trigger | Source file |
|-----------|---------|-------------|
| **#89** Anti-fabrication correction turn | `end_turn` + `failedToolCalls > 0` + non-empty text + NOT `BUDGET_EXHAUSTED` | `lib/agents/harness/agentic-tool-loop.ts` — ONE shared module since 2026-06-10 (at ship it was mirrored in the engine and the stream route) |

The correction turn appends a user-role message with `functions: []` (structurally prevents tool re-entry), asks the LLM to rewrite its response against the actual tool outcomes, and replaces `currentResponse` with the corrected text. Existing stopReason branching processes the corrected response — same code path, no duplicated logic. Counts tokens against `totalUsage` but exempt from `MAX_TOOL_TURNS`. Tracked via `toolLoop.correctionTurnUsed: true` in result.json.

### Post-execution detection cascade (priority order)

Cascade fires top-to-bottom; first match sets `errorCategory`. Evidence fields populate independently regardless of cascade winner.

| # | Signal | Trigger | Priority |
|---|--------|---------|----------|
| **P10** | `TEMPLATE_MISMATCH_SELF_REPORTED` | Anchored regex detects `[TEMPLATE_MISMATCH]` marker at the START of finalResponse (first 300 chars, non-multiline) | **OVERRIDES all** |
| **P5** | `BUDGET_EXHAUSTED` | Any failed tool call's error matches `/budget exceeded\|hourly limit/i` | 1 (specific) |
| **P4** | `TOOL_LOOP_DEGRADED` | Last 2+ tool calls all failed | 2 |
| **P3** | `TOOL_FAILURES` | `failedToolCalls / totalToolCalls > 0.5` | 3 |
| **P7** | `SILENT_REFUSAL` | `stopReason === 'end_turn'` + non-empty text + first 500 chars match an inability regex (`/i (?:am )?(?:unable|cannot|can[''t]?) to (?:complete\|fulfill\|do)/i`) | 4 |
| **P8** | `PROTOCOL_STEP_SKIPPED` | Pipeline harness validator detects missing required tool-call(s) for the executed mode (CREATE / ORCHESTRATE / SYNTHESIZE) | 5 (only if no other matched) |
| **P9 (promotion)** | ~~`TEMPLATE_SCOPE_MISMATCH`~~ | RETIRED 2026-07-17 (see P9 row) — historical artifacts only | — |

### Co-occurring evidence fields in `result.json`

**Happy-path property — important for consumers:** A clean execution produces a `result.json` with NONE of the signal fields below populated. Only `toolLoop.correctionTurnUsed: false` is added unconditionally — that field is the "code path executed" canary. Consumers (GUI, harness chainer, reactor) MUST treat absence of `errorCategory` / `executionDegradation` / `protocolValidation` as "no issues detected", not as "fields missing — error in detector." (Artifacts written before 2026-07-17 may also carry the retired `templateScopeMismatch`.)

⚠️ **The converse is NOT true for `protocolValidation` (2026-09-15).** Presence no longer implies a problem: a **sanctioned halt** (`haltExempt: true`, `haltReason`, empty `missingSteps`) emits the block as a POSITIVE fact and raises no degradation. Gate on `missingSteps.length > 0`, never on presence. This exists because the null-means-omitted convention above, combined with "absence = no issues", made a harness that correctly REFUSED to act (e.g. declining to spawn a duplicate program) indistinguishable from a flawless run — trading a false accusation for a false all-clear. Protocol 10: ship the fact; silence is a verdict nobody can audit.

This is by design: detection signals are conditional, NOT exhaustive. A `null`/missing field means "this detector ran and found nothing." Validated 2026-04-16 smoke test on Meridian Health pipeline — all 7 executions completed cleanly with `correctionTurnUsed: false` and zero other signal fields.

Always populated when the underlying signal fires, regardless of which cascade winner claimed `errorCategory`:

| Field | Source | What it contains |
|-------|--------|------------------|
| `executionDegradation` | P3/P4/P5/P7 | `{ errorCategory, degradationReason, consecutiveTailFailures, toolFailureRate, budgetError? }` |
| `protocolValidation` | P8 | `{ mode, missingSteps[], toolCallSummary, expectedChildCount?, actualAssignedCount? }` |
| ~~`templateScopeMismatch`~~ | ~~P9~~ | **RETIRED 2026-07-17 — no longer written.** Artifacts from before that date still carry `{ match: false, templateType, templateName, reason, expectedVerbs[], taskKeywords[] }` |
| `confidenceCapped` + `originalConfidence` | Confidence cap (`lib/agents/harness/parse-confidence.ts`, applied in `lib/services/execution-core.ts`) | When LLM-stated confidence > 60 but tool failure rate > 50%, cap at 60 and record original |
| `toolLoop.correctionTurnUsed` | #89 | Boolean flag — was an anti-fabrication turn fired? |
| `chainedContext` | D1 (2026-06-08) | **Coverage signal — NOT a cascade detector** (does not set `errorCategory`). `{ predecessors, expectedPredecessors, chainCapablePredecessors, degradedPredecessors, notChained?, totalChars, anyTruncated, … }` — the `ChainedContextSignal` interface in `execution-artifacts.ts` is the list; it has grown several times, so read it rather than this row — pipeline input coverage so a consumer can tell full-input from clipped-input runs (`predecessors < expectedPredecessors` ⇒ an upstream was silently dropped: missing result.json / 5MB-skip / parse failure); ⚠️ since program gates became dependency nodes this holds only against `chainCapablePredecessors` — `expectedPredecessors` counts never-executing gates, so compare against the former, as the program gate does). Emit-only; derived from `task.inputContext.pipelineMetadata` (context-chainer) via `deriveChainedContextSignal`, derived ONCE in the shared core (`execution-artifacts.ts`, called from `execution-core.ts`). Present only when predecessors were chained (happy-path-clean). |

---

## File Architecture

**Rewritten 2026-11-21.** At ship (April 2026) the whole stack sat inside `agentExecutionEngine.ts`, mirrored by hand in the
stream route, and this section listed eight line numbers in the engine file. The execution-path convergence (2026-07-05) moved
all of it into shared modules. Both callers now only delegate.

```
lib/agents/harness/
├── execution-quality.ts          # THE cascade — assessExecutionQuality(): P3/P4/P5, P7, P8 gating, P10 override
├── agentic-tool-loop.ts          # #89 anti-fabrication correction turn (one module since 2026-06-10)
└── parse-confidence.ts           # the confidence cap

lib/services/
├── execution-core.ts             # runExecutionCore(): loop → post-loop → quality → result.json; BOTH callers enter here
├── execution-artifacts.ts        # buildExecutionResultJson() + deriveChainedContextSignal(): every field of result.json
├── pipelineProtocolValidator.ts  # P8 — pure function, validates the harness step signature per mode
├── execution-terminal-persist.ts # the ONE terminal persist both paths converge on
├── agentExecutionEngine.ts       # caller (engine path) — contains NO detector, NO cascade, NO result.json assembly
└── (templateScopeMatcher.ts DELETED 2026-07-17 — P9 retired, 0 true positives ever)

app/api/pov/agent/execute/stream/route.ts   # caller (stream path) — the same: delegates to runExecutionCore

scripts/
├── test-pipeline-protocol-validator.ts     # P8 (61 checks, incl. the artifact-synthesis regression)
└── (test-template-scope-matcher.ts DELETED 2026-07-17 with its detector)
```

A detector, a cascade branch or a `result.json` field appearing in either CALLER file is a regression (a re-inlined copy), not
parity. See `two-execution-path-drift-pattern.md` and the pipeline-harness discovery prompt, Phase 9.

---

## When This Pattern is SAFE

- ✅ Domain involves agent execution where the LLM's response is consumed downstream (chained context, GUI, reactor)
- ✅ Multiple failure modes can produce the same `SUCCESS` outcome
- ✅ Detection is cheap (pure functions, regex, count comparisons)
- ✅ Downstream consumers can act on structured signals (GUI banner, reactor branch, chainer skip)

## When This Pattern is UNSAFE

- ❌ Single-failure-mode systems where every defect IS the same — no cascade needed; one boolean works
- ❌ Hot-path execution where the few-ms cost matters (this pattern adds ~5-10ms)
- ❌ Detection signal accuracy < 70% — at low precision, signals become noise the GUI must suppress, defeating the point

---

## Performance Analysis

| Phase | Cost | Notes |
|---|---|---|
| ~~Pre-execution scope check (P9)~~ | — | RETIRED 2026-07-17; no longer runs |
| Detection cascade (P3-P5, P7-P10) | ~2ms | Pure operations on already-collected toolCallResults; no I/O |
| Protocol validator (P8) | ~1ms | Tally + signature compare; only fires on PIPELINE tasks |
| Correction turn (#89) | One LLM call | Only fires on a narrow trigger (~5% of executions); same model, same apiKey |
| **Total overhead per execution** | **~5ms + occasional LLM call** | <0.5% of typical execution time |

The correction turn is the only meaningful cost. It fires only on the narrow trigger (`end_turn + failures > 0 + non-empty + not BUDGET_EXHAUSTED`); in practice, most executions never trigger it.

---

## Real-World Results

**Scope (as shipped, April 2026)**: 7 detection signals + 1 correction turn + 2 pure-function helpers + 23 unit tests + engine/stream-route parity. **Today**: 6 live categories (P9 retired), one shared home for all of them, 61 validator checks.

**The 2026-04-16 artifact-synthesis incident** would have produced this `result.json` on a re-run with the full stack:

```json
{
  "errorCategory": "BUDGET_EXHAUSTED",        // P5 — most specific
  "executionDegradation": {
    "errorCategory": "BUDGET_EXHAUSTED",
    "degradationReason": "Token budget limit hit mid-execution — tool calls rejected",
    "budgetError": "Token budget exceeded: Request would exceed hourly limit (2035858 > 2000000)",
    "consecutiveTailFailures": 3,
    "toolFailureRate": 33
  },
  "protocolValidation": {                     // P8 — co-occurring evidence
    "mode": "CREATE",
    "missingSteps": [
      "Step 5: 3 children created but only 2 agent.assign calls succeeded — 1 child(ren) left untemplated and cannot be queued for execution",
      "Step 6: no task.comment for the Pipeline Queued breadcrumb"
    ],
    "expectedChildCount": 3,
    "actualAssignedCount": 2
  },
  "toolLoop": {
    "correctionTurnUsed": true               // #89 fired — narrative was rewritten
  },
  "finalResponse": "...harness wrote: 'Phases 1-3 created. Phase 4 attempted but agent.assign was rejected by token budget limiter at turn 10. Pipeline is INCOMPLETE — 1 child needs manual template assignment to recover.'"
}
```

Three independent signals diagnose the same incident from different angles. GUI renders three banners. Reactor knows it's BUDGET_EXHAUSTED and won't re-queue. Harness chainer sees `correctionTurnUsed: true` and trusts the (now-honest) narrative.

### Production smoke-test verification (2026-04-16)

End-to-end pipeline run on Meridian Health POV (task `cmo10k1cp0001yxlgn6b61ll6`) verified the stack with zero false-positives:

- 7 executions, all SUCCESS in ~6 minutes
- All 4 reactor source enum values exercised (mcp-direct + reactor-task-ready-initial + reactor-task-ready + reactor-pipeline-retrigger)
- Every `result.json` contained `correctionTurnUsed: false` (code-path canary present)
- Zero spurious `errorCategory` / `executionDegradation` / `protocolValidation` / `templateScopeMismatch` fields on the clean run
- Confirms the conditional-fields design: detectors run, find nothing, contribute nothing — exactly as intended

**Debugging gap discovered during smoke test:** `agent_executions.config.systemPrompt` stores the BASE template prompt (assembled by `agentExecutionConfigBuilder` at task-config time), NOT the runtime prompt assembled by `buildSystemPrompt` at execution time. The P10 escape hatch (and any other runtime appends) are NOT visible in the persisted config. To verify "what did the LLM actually see," inspect pino logs at the time of execution OR trust the code path. This is a known visibility limitation, not a bug — but worth noting for any future GUI feature that wants to show "exact prompt sent." *(Note 2026-11-21: since this was written each execution records `protocolInjection` — which protocol and version were injected — in its artifact, and the leg replay lab rebuilds a composed prompt from stored rows. Whether `config.systemPrompt` itself is still base-only was NOT re-verified in this sweep.)*

---

## Specialist Validation

- **agent-execution-specialist** (88% — design review on #89 correction turn): "Treats the LLM as authority over its own narrative rather than letting post-hoc metadata contradict the text users actually read. Trigger conditions correctly narrow."
- **template-system-specialist** (82% — design review on #90 scope check): "Multi-signal scoring would have over-engineered for current data. Single-signal MVP with templateType-verbs handles the confirmed false-positive case correctly."
- **pipeline-harness-specialist** (94% — diagnosed the artifact-synthesis incident; informed P8 design): "Engine-side post-execution validator (Option A) is the right shape — additive, no protocol-template coordination required."
- **boundary-contract-specialist** (94% — pattern philosophy reuse): "The additive-signal pattern from `boundary-contract-wrapper-enforcement-pattern.md` extends cleanly to 7 more signals here. Same write-strict / read-soft framing applied to detection rather than data validation."
- **prompt-construction-specialist** (validated P10 escape-hatch convention): "Anchored regex on first 300 chars with non-multiline flag is the correct pattern for distinguishing 'agent emitted marker' from 'agent quoted marker syntax in prose'."

---

## Implementation Checklist

When extending this stack with a new detector:

- [ ] Decide priority position in the cascade — most-specific signals fire first
- [ ] If signal can have evidence beyond the category alone, add a co-occurring field (don't overload `executionDegradation`)
- [ ] Pure-function helper in `lib/services/<name>.ts` — testable in isolation
- [ ] Unit test file in `scripts/test-<name>.ts` — include a regression test for the canonical incident
- [ ] Put it in the SHARED modules — `lib/agents/harness/execution-quality.ts` for a cascade signal, `lib/services/execution-artifacts.ts` for a `result.json` field — and NEVER in `agentExecutionEngine.ts` or the stream route. Both callers must stay at zero; a signal appearing in either is a re-inline regression. *(Until 2026-07-05 this line said the opposite: wire it into both files.)*
- [ ] Add to `npm run test:all-validation` chain
- [ ] Update this pattern doc's signal table
- [ ] Update agent-execution-specialist Core Knowledge section if cascade priority changed

---

## Common Opportunities in Your Codebase

```bash
# Find places where execution status is set to SUCCESS without context-aware checks
grep -rn "status: 'SUCCESS'" lib/services/ app/api/ --include="*.ts" | grep -v test

# Find places that read finalResponse text and trust it as ground truth
grep -rn "finalResponse" lib/services/ app/api/ --include="*.ts" | grep -v "result.json"

# Find detection signals you might be missing — check for new failure modes
grep -rn "errorCategory:" lib/services/ lib/agents/harness/ app/api/ --include="*.ts"
```

---

## Anti-Patterns to Avoid

❌ **Make a detection signal blocking** — turns an additive signal into control flow; loses the "execution may still have done useful work" property
✅ **GOOD**: Always additive. Status stays SUCCESS; downstream decides whether to act on the signal.

❌ **Overload `executionDegradation` with multiple co-occurring signals** — only one cascade winner can hold the field cleanly
✅ **GOOD**: Add separate evidence fields (`protocolValidation`, `chainedContext`, etc.) for co-occurring signals. Cascade winner gets `errorCategory`; everyone else gets their own field.

❌ **Re-inline a signal into a caller** — both callers delegate to `runExecutionCore`; a detector copied into `agentExecutionEngine.ts` or the stream route recreates the two-path drift this stack once had to police by hand (the class Pattern #46's pitfall warns against)
✅ **GOOD**: One home in the shared modules; both callers at zero. *(At ship the rule was the reverse — mirror every signal in both files — because there were two implementations. Retired by the 2026-07-05 convergence.)*

❌ **Hardcode regex/threshold without a regression test** — the artifact-synthesis case proved that intuitive heuristics false-positive on real data
✅ **GOOD**: Every detector ships with a unit test using the canonical incident's actual shape (or a similar shape) as the regression case.

❌ **Make the correction turn unconditional** — would add LLM cost on every degraded execution
✅ **GOOD**: Narrow trigger — `end_turn + failures > 0 + non-empty + NOT BUDGET_EXHAUSTED`. Skip when budget is the cause (would just hit the wall again).

❌ **Trust LLM narrative over tool log** — fabricated success was the original bug
✅ **GOOD**: Use detection cascade to flag mismatches; use correction turn to fix at source. The tool log is authoritative; the narrative is inspected.

---

## Related Patterns

- **`boundary-contract-wrapper-enforcement-pattern.md`** — sibling pattern. That one validates DATA at boundaries (write-strict, read-soft); this one validates EXECUTION outputs (additive signals, no control flow). Same philosophical framing.
- **`orchestration-reactor-pattern.md`** (Pattern #46) — the reactor system this stack defends. P8 specifically validates harness protocol steps that the reactor depends on.
- **`dual-execution-path-parity-pattern.md`** and **`two-execution-path-drift-pattern.md`** — the parity discipline. Since the 2026-07-05 convergence this stack satisfies it STRUCTURALLY (one shared core), not by mirroring.
- **`facts-only-tighten-pattern.md`** (Pattern #71) — the OTHER half of the trust machinery, and the boundary of this pattern. "Always additive, never blocking" is a rule of THIS cascade only. Platform FACTS that feed a gate (the mechanical nets, a reviewer's transcribed verdict, the held-edit carrier's forced outcomes) follow Pattern #71: a fact may only tighten an outcome, never loosen it. Do not read this pattern as saying the platform never forces an outcome.
- **Mechanical nets and the output guards** — `.claude/knowledge/domain/execution-facts/execution-facts-library.md` (how facts are produced and stamped; owner `execution-facts-specialist`) and `.claude/knowledge/domain/harness/harness-output-guards.md` (R9 sanitize, R10 redact).
- **`fire-and-forget-activity-logging-pattern.md`** — used by the audit log writes throughout the cascade detection.
- **Protocol 10 (Signal Design — Fact vs. Verdict)**: `.claude/knowledge/protocols/signal-design-protocol.md` — the design lens this stack embodies. Every signal here is a **fact** (additive metadata, never control flow); a detector that wanted to *judge* rather than *report* would be a verdict, subject to that protocol's "earn it" bar before it could gate.

**Use Together**:
- This pattern + boundary-contract-wrapper = additive-signals at both data boundaries and execution boundaries
- This pattern + orchestration-reactor = reactor knows when to skip a degraded execution vs retry
- This pattern + dual-execution-path-parity = invariant: one shared home, so the two paths cannot differ

---

**Pattern Status**: Production ✅ | **Confidence**: 91% | **Failure Modes Detected**: 7 distinct categories at ship (6 live since P9's retirement on 2026-07-17) where executions previously stored as opaque SUCCESS now surface structured signals. Zero regressions.

---

## 2026-09-16 — a new defense in this stack: do not feed a HARVESTER another pipeline's deliverable

Added when cross-pipeline delivery shipped (Bug Class 84). It is a defense of a kind this stack did
not previously carry: **a restriction on what the platform may deliver**, rather than a check on what
an agent produced.

**The threat.** A harvester's entire output is a point-in-time snapshot of **observed** state, and it
is the *machine-parsed ground truth* downstream containment compares derived values against. An
upstream pipeline's `report.md` carries allocations, CIDRs and VLANs **in exactly the shape of a
harvest table**. A harvester that folds one injected entry into its `## Harvested Allocations` block
produces a clean-looking harvest containing **a value nobody observed on the device**.

**Why that is worse than an ordinary fabrication.** It poisons the net *at its root*: every tier above
then checks **correctly, against contaminated ground truth**. Nothing further up can detect it,
because nothing further up sees the device.

**Why the existing defenses do not cover it.**
- The provenance stamp (`inheritedFromLeg`) answers *who produced this*; it cannot answer *is this
  still true*. The content is not false — it was observed elsewhere, at another time.
- `<prior_output role="context_only">` and "not instructions for you" address
  **instruction-following**, which is the wrong threat model. The harvester would not be *obeying*
  the entry; it would be *citing* it.
- Anti-fabrication prose asks the agent not to report what it did not observe — and the agent has no
  way to tell that an entry in its own §6 was not observed by it.

**The defense**: harvest-shaped roles are excluded from cross-pipeline injection
(`INJECTION_EXCLUDED_ROLES`, `context-chainer.ts`), with a runtime tripwire warning when a role
matches `/review|harvest|acquir/i` and is not on the list. `change_reviewer` and
`publication_reviewer` are excluded on a separate ground (a reviewer must not gain a second
reviewable document; three self-host format vetoes on 2026-09-09 were reviewers misreading a
one-document §6).

**Generalisation worth keeping**: when adding a delivery mechanism, ask **per seat** what that role
would *do* with the payload — not merely whether it is entitled to it. This exclusion came from
asking that question of a role that had no case either way, and it was invisible to three review
panels that asked only about delivery.

---

## 2026-11-21 — drift sweep (Protocol 11): what was corrected, and how to check it stays true

The principle, the incident history and the two dated sections above are unchanged. Corrected against the tree:

- **The path rule was backwards.** Five places said "mirror every signal in the engine AND the stream route". Since the 2026-07-05
  convergence every signal has ONE home and both callers contain none; the checklist and an anti-pattern entry now say so. Following
  the old text would have re-introduced the regression the convergence removed.
- **The file map** listed eight line numbers in `agentExecutionEngine.ts`; none of that code is there. Rewritten.
- **Tests**: "23 unit tests" and a listed `test-template-scope-matcher.ts` (deleted). Now 61 validator checks, one file.
- **`templateScopeMismatch`** was still described as a live field in three places. It is retired; old artifacts carry it.
- **The `chainedContext` row** listed four of its fields; the interface is now the reference.
- **Added**: the boundary with Pattern #71 (facts that feed a gate may tighten an outcome), and pointers to the mechanical nets
  and the output guards.

Every expectation below was run before it was written:

```bash
grep -c "BUDGET_EXHAUSTED\|SILENT_REFUSAL\|executionDegradation = {" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts   # expect 0 and 0 — no detector in either caller
grep -c "^export function assessExecutionQuality" lib/agents/harness/execution-quality.ts   # expect 1 — the cascade's one home
grep -c "_failedToolCallsForCorrection" lib/agents/harness/agentic-tool-loop.ts            # expect >=1 — the correction turn's trigger lives in the shared loop
grep -c "^export function buildExecutionResultJson\|^export function deriveChainedContextSignal" lib/services/execution-artifacts.ts   # expect 2
test -e scripts/test-template-scope-matcher.ts && echo present || echo deleted              # expect deleted
npm run -s test:pipeline-protocol-validator | grep -c "Passed: "                            # expect 1 (61 checks on 2026-11-21 — a floor, not an exact count)
```

**Not re-verified in this sweep:** the exact trigger regexes in the signal tables (P7's inability pattern, P10's first-300-chars
anchor); the ~5 ms performance figures; whether `agent_executions.config.systemPrompt` is still the base template only.

