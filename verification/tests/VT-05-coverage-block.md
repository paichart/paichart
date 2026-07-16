# VT-05 — A missing deliverable is caught by structured coverage facts, not a raw predecessor count

**Status**: VERIFIED 2026-07-16 (two live runs; defects found, fixed, and re-verified in VT-06) | Re-verify trigger: any change to the chainer coverage facts or the release-gate coverage consumer
**Layer**: program
**Round type**: failure-injection

## Objective

When a program composes its final deliverable, each synthesis node chains its predecessors' outputs
and records **coverage facts**. The claim: a predecessor whose authoritative deliverable
(`report.md`) is **missing** must be caught by those facts and block the release — a count that merely
"looks complete" cannot mask a gutted deliverable. This round is the one that found the fact-design
was initially *wrong*, and shows the fix.

## Method

1. Run a two-pipeline program to completion.
2. **Inject**: after both legs settle, hard-delete one leg's `report.md` artifact rows (run #2 used a
   deterministic operator-hold dependency so the deletion window is controlled).
3. Observe whether the synthesis nodes' coverage facts detect the missing deliverable and whether the
   deterministic release gate blocks on it.

## Config

- Two-pipeline (network + terraform) programs; runs used the `meridian-t4e` and `meridian-t4e2` artifacts.
- Protocol: `pov-program` — the round drove the fix from the pre-v1.0.7 build to v1.0.7.

## Expected observables

- The gutted predecessor chains via the **fallback** source (`pipeline-index.json`), not `report.md`.
- A per-predecessor **`source`** fact distinguishes an authoritative `report.md` chain from a fallback.
- The release gate blocks on a **`degradedPredecessors > 0`** fact — not on a raw predecessor count
  (which counts never-executing gate/hold nodes and would both false-block and false-pass).

## Results

**Two real defects found — the point of the round:**

- **F18 (stale-chain race):** in run #1 (operator-UNTOUCHED, deletion hit 0 rows), the producer and
  reviewer still chained a **stale pre-completion snapshot** of the network leg. Timestamp forensics:
  a sibling leg's terminal-persist fired the shared dependents' queue at 20:45:17, but the network
  leg's `report.md` was written at 20:45:30 — **13.5 seconds after** the chain. The "deps satisfied"
  predicate keyed on status=COMPLETED, not on the dependency's deliverable being **persist-settled**.
- **F19 (coverage counter blind to fallback):** both synthesis nodes read `predecessors: 2/2,
  anyTruncated: false` — the numeric gate PASSED — while one predecessor's content was a placeholder.
  The counter counted "a chain happened," not "the authoritative deliverable was chained." Run #2's
  deterministic deletion confirmed it definitively: the gutted leg chained `source:
  "pipeline-index.json"` (the fallback) **and incremented `predecessors`** — the distinguishing
  `source` fact was shipped per-predecessor, but the gate consumed only the count. A missing
  deliverable passed the numeric gate.

**Defense-in-depth held anyway:** in both runs the program was correctly NOT releasable — but by the
**outcome** gate (the gutted leg had escalated/needs-revision), not by coverage. The specific coverage
consumer did not do the blocking; the LLM's content inspection and the outcome gate did.

**The fix (v1.0.7 + chainer):** ship a **`degradedPredecessors`** count (chains whose `source` ≠
`report.md` for PIPELINE predecessors) and a **`chainCapablePredecessors`** count (excluding
never-executing ACTION/gate nodes), and make the release gate block on `degradedPredecessors > 0` and
`predecessors === chainCapablePredecessors` — never on the raw edge count. F18's settledness predicate
(a PIPELINE dependency counts as satisfied only once its final execution has persisted) closes the
stale-chain window. Both fixes are verified live in **VT-06**.

## Conclusion

**Verified via defect-and-fix.** The round proved that a raw count *cannot* catch a missing
deliverable, drove the fix to fact-carrying coverage (`chainCapablePredecessors`,
`degradedPredecessors`) plus a settledness predicate, and the fix is confirmed live in VT-06. Honest
status: the *original* numeric gate failed the specific test; defense-in-depth prevented any wrong
release; the redesigned gate now does the blocking deterministically.

## Enforcement

- Protocol: `pov-program` v1.0.7 (coverage-fact consumer) + `pipeline-orchestrator` v3.9.0.
- CI pins (every commit): `test:nonterminal-family` (11 NTF source pins including the coverage facts
  and the settledness predicate) + `test:chained-context-signal`.
- Residual: the two evidence programs (T4e run #1 / #2) are retained on production as F18/F19 forensic
  evidence.
