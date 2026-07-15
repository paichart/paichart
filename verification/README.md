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
| VT-02 | `tests/VT-02-frozen-cone-escalation.md` | A program with a non-runnable leg **escalates to a human**; it never hangs and never silently composes a partial deliverable |
| VT-07 | `tests/VT-07-adversarial-state-injection.md` | Hostile instructions and secret-shaped values planted in harvested infrastructure state are **refused, not obeyed** |
| — | Further rounds (contract guard, gate park, negative quality gate, coverage block, green-run validation, policy audit) | being migrated from the internal findings ledger |

Supporting documents: `OVERVIEW.md` (what the engine is, every claim linked to its proof),
`ARCHITECTURE.md` (the design invariants and decision log).

## Honesty rules this pack follows

1. **Failures are published, not filtered.** Where a round found a defect, the document says what was
   broken, how it was fixed, and shows the re-run.
2. **Facts over verdicts.** Documents cite machine-checkable facts (gate fields, task states, log
   events), not adjectives.
3. **Claims are pinned.** Every behavioral claim names the regression test that enforces it in our CI
   on every commit. Pin names are listed so they can be audited.
4. **Reviewed before publication.** Documents are sanitized of internal infrastructure detail; what
   remains is sufficient to reproduce the behavior, not our internals.
