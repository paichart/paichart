# pAIchart Verification Pack

Independently checkable evidence that the pAIchart autonomous-delivery engine behaves as claimed —
including, deliberately, under injected faults and adversarial inputs.

## What this is

Most platforms publish green dashboards. This directory publishes the **failure rounds**: tests where
we deliberately broke something — deleted a deliverable mid-run, stripped a binding contract after a
human approval gate, planted a prompt-injection payload inside harvested infrastructure state — and
recorded what the system did. The claims worth trusting are the ones proven by a system *refusing to
lie* when lying was the easy path.

Each test document follows one shape (see `TEMPLATE.md`):

| Section | What it gives you |
|---|---|
| Objective | The single claim under test |
| Method | The exact procedure, including the injected fault |
| Config | Public, runnable inputs (linked in `configs/` and `program-artifacts/`) |
| Expected observables | The precise facts you should see — gate values, statuses, comments |
| Results | What happened on our production run, with timestamps |
| Conclusion | What the claim's status is, stated plainly — including anything that did NOT pass |
| Enforcement | The protocol version + named regression pins that keep the behavior true after the test |

## Using this in a proof of concept

The configs are public and the procedures are written to be re-runnable. A typical PoC pattern:
run the green-path round first (VT-06), then pick one failure round and re-inject the fault yourself.
If a document's test cannot be reproduced outside our environment, the document says so explicitly and
its claim is downgraded accordingly — no silent asterisks.

## Index

| # | Document | Claim under test |
|---|---|---|
| VT-01 | `tests/VT-01-contract-guard.md` | A pipeline child **cannot execute without its binding interface contract** — refused loudly, never silently composed |
| VT-02 | `tests/VT-02-frozen-cone-escalation.md` | A program with a non-runnable leg **escalates to a human**; it never hangs and never silently composes a partial deliverable |
| VT-03 | `tests/VT-03-gate-park.md` | A program parked at its human approval gate **stays parked indefinitely** — nothing queues, no timeout misfires |
| VT-04 | `tests/VT-04-negative-quality-gate.md` | A **needs-revision child blocks release**, keyed on the outcome fact — a high reviewer score cannot rescue it |
| VT-05 | `tests/VT-05-coverage-block.md` | A **missing deliverable is caught by structured coverage facts**, not a raw count (defect-found-and-fixed) |
| VT-06 | `tests/VT-06-green-run-validation.md` | An end-to-end program reaches **`programReleasable: true` only when every machine fact says so** — the same gate that blocked the failure rounds |
| VT-07 | `tests/VT-07-adversarial-state-injection.md` | Hostile instructions and secret-shaped values planted in harvested infrastructure state are **refused, not obeyed** |
| VT-08 | `tests/VT-08-policy-claims-audit.md` | The protocol's **own policy claims verified against the running system** — including a safety guard found structurally blind |

Supporting documents: `OVERVIEW.md` (what the engine is, every claim linked to its proof),
`ARCHITECTURE.md` (the design invariants and decision log), `METHODOLOGY.md` (how the testing regime
works — findings-driven rounds, failure injection, panel-designed fixes, pin discipline, prove-before-write).

## Honesty rules this pack follows

1. **Failures are published, not filtered.** Where a round found a defect, the document says what was
   broken, how it was fixed, and shows the re-run.
2. **Facts over verdicts.** Documents cite machine-checkable facts (gate fields, task states, log
   events), not adjectives.
3. **Claims are pinned.** Every behavioral claim names the regression test that enforces it in our CI
   on every commit. Pin names are listed so they can be audited.
4. **Reviewed before publication.** Documents are sanitized of internal infrastructure detail; what
   remains is sufficient to reproduce the behavior, not our internals.
