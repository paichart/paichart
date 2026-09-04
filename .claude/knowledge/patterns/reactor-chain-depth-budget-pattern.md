# Reactor Chain-Depth Budget Pattern

> **Pattern #47** | Confidence 88% | Created 2026-06-14
> **Canonical impl:** `lib/services/pipelineRetriggerReactorService.ts` (Guard 8, shipped `148e321a`)
> **Strategic doc:** `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` § "Reactor Chain Depth"
> **Companion:** `inherited-context-chain-state-pattern.md` (the mechanism), `orchestration-reactor-pattern.md` (the reactor this guards)

## Problem

A reactor's per-cycle guards (in-flight, debounce, terminal-children, etc.) each bound a
**single** firing. They do **not** bound the *number* of consecutive firings. If a reactor's
queued action can — directly or transitively — cause its own hook to fire again, the chain can
loop **indefinitely** even with perfect per-cycle guards.

The harness case: `pipelineRetriggerReactorService` inherits the triggerer through *"arbitrary
reactor-chain depth"* (`pipelineRetriggerReactorService.ts:299`). A SYNTHESIZE run that keeps
creating a new child stage → children complete → retrigger → repeat would never stop.

## The three bounds — grade them separately

| Dimension | Bounded by | Note |
|---|---|---|
| **Fan-out (breadth)** | idempotency (one execution per task) | a single firing can't balloon |
| **Concurrency (rate)** | the execution poller (`take:5`, global) | ~5 run at once, platform-wide |
| **Depth (cumulative total)** | **nothing — until a budget** | the poller bounds *rate*, not *total* |

**The trap:** "bounded rate" reads like "bounded cost," but a rate-clamped runaway doesn't
spike — it **bleeds**: bounded cost-rate, unbounded *cumulative* cost. A reactor can be safe on
concurrency and still unbounded on total cost. Always ask: *"can the work I queue cause me to
fire again? If so, what stops the Nth firing?"*

## Solution

Add a **per-chain generation budget**:
1. Carry a generation counter along the chain (see `inherited-context-chain-state-pattern.md`).
2. Before queueing the next firing, refuse if `generation >= MAX` (env-tunable).
3. On refusal, log a **FACT** skip through the reactor-skip-counter (not a bare `log.warn`),
   with a distinct `errorCode` and **no** `securityEvent` (a runaway-guard is benign, not an
   integrity violation — Protocol 10-clean).

Count **generations (chain depth)**, not rows — a row-count cap can't be set without risking
self-starvation of a legitimately deep chain; a depth budget only ever trips on a runaway.

## Choosing the budget value

Set it to comfortable headroom over the **legitimate** max depth, not a guess at "how big could
it get." For the harness, legit max depth = **1** (CREATE→SYNTHESIZE→complete; no stage-N+1
mode), so budget = 10 (matches `maxTotalRetries=10`) is pure runaway insurance. **Verify the
legit max against the actual lifecycle** — D-4 was first mis-scoped at ~50 on a wrong "legit ≈
stage count" model; the review corrected it to 1.

## Soft vs hard

Prefer **soft** (best-effort count-then-refuse, no advisory lock) when the chain already has a
one-row-per-step DB invariant — that gives exact-once for free (see the companion pattern). A
lock would serialize per-chain firings for no gain.

## Anti-patterns

- Treating per-cycle guards as a chain bound.
- A per-*user* (or per-row) count cap — can't be tuned without self-starvation risk.
- A bare `log.warn` for the stop — loses escalation cadence and grep-distinguishability.
- Trusting a chain-state field read from a **client-writable** link (read only from a
  server-written link — see the companion pattern's trust rule).

## Worked example & alternatives considered

Full distillation (B-i/B-ii, budget 50→10 correction, the Finding B cost-premise that was
deferred, the two-execution-path cost model) lives in the strategic doc's
§ "Design decisions & alternatives considered (D-4)".
