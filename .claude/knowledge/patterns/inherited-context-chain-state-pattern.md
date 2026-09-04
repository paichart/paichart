# Inherited-Context Chain-State Pattern

> **Pattern #48** | Confidence 88% | Created 2026-06-14
> **Canonical impl:** `lib/services/pipelineRetriggerReactorService.ts` (`reactorGeneration`, shipped `148e321a`)
> **Strategic doc:** `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` § "Threading state through a reactor chain"
> **Companion:** `reactor-chain-depth-budget-pattern.md` (a budget that uses it), `boundary-contract-wrapper-enforcement-pattern.md` (the strict context shape it rides in)

## Problem

You need to carry state — a counter, accumulator, or flag — across a chain of **separate
executions**, where each link is a fresh process spawned by a poller/reactor. There is **no
shared memory** between links.

**The wrong reflex:** copy an in-memory shared-state object (e.g. the workflow engine's
`retryState`, `orchestration-engine.js:313`). That works *only* when the whole chain runs inside
one execution. A reactor chain is N executions — the in-memory counter resets every firing.

## Solution

Persist the state in the execution's **`context` JSONB**, and have each link read the **prior**
link's context:

1. **Read** the prior execution's context (the reactor usually already does this for identity —
   e.g. `triggeredBy.id` at `pipelineRetriggerReactorService.ts:299`).
2. **Compute** the new value (`const next = Number(prior?.field ?? 0) + 1`). Coerce defensively
   (`Number(...)`) — a legacy/hand-edited context could carry a string.
3. **Write** it to the new execution's `contextExtras` — the canonical create wrapper spreads
   `contextExtras` verbatim into `context`, beside `triggeredBy`. No rebuild step drops it.

This generalizes to any chain state, not just counters.

## Race-safety rule (for counters/monotonic state)

A per-chain counter looks like a read-modify-write race (two events read gen=N, both write N+1,
under-count). It is **exact-once by construction** — *iff*:

> **each chain step has a one-row DB guarantee.**

In the harness: BC67 partial-unique (one active execution per task) + the one-active guard +
debounce ⇒ exactly one next-link row per generation; generations are **strictly serial** (gen
N+1 can't fire until gen N's children are terminal). So N concurrent readers always race the
**same** prior link, and exactly one wins the write. No advisory lock needed.

**Pin this dependency in code:** the exact-once property depends entirely on the one-row
invariant. Do **not** colocate such a counter with any feature that allows >1 active execution
per chain step.

## Trust rule

If the chain's **first** link can be client-initiated (e.g. an interactive create that persists
client-supplied `body.context` — see `client-context-trust-boundary-2026-06-14.md`), read a
control-relevant chain-state field **only from a server-written link**. D-4 reads
`reactorGeneration` solely when the prior `source === 'reactor-pipeline-retrigger'`, else 0 —
otherwise a client seeds a high starting value and self-trips downstream logic.

## Anti-patterns

- In-memory counters/accumulators across separate executions (reset every firing).
- An exact-once chain counter colocated with a >1-active-per-step feature (breaks the invariant).
- Reading chain-state from a client-writable link for a control decision (injection).
- A bespoke context key that collides with another writer's — check the `contextExtras` sites.
