# VT-08 — The protocol's own policy claims, verified against the running system

**Status**: VERIFIED 2026-07-16 (3 of 4 claims pass; claim 4 surfaced a real defect, published) | Re-verify trigger: any change to the SYNTHESIZE fact-authority prose or the verdict-mismatch guard
**Layer**: program / platform
**Round type**: policy-audit

## Objective

The `pov-program` protocol prose makes load-bearing safety **claims** about how the program reasons —
that it consumes structured facts rather than re-deriving verdicts from prose, that its release stamp
is never derived from a head-sliced source, and that verdict contradictions are counted. This round
grep-and-verifies each claim against the seeded protocol text and live production runs. A meta-test:
does the system actually do what its own policy says?

## Method

For each documented claim, map it to a checkable artifact — seeded protocol text, live SYNTHESIZE
tool-call transcripts, production log streams, or the guard source — and verify. Every mismatch is a
finding (a claim proven false is as valuable as one proven true).

## Config

- Protocol: `pov-program` v1.0.6 (seeded prod row) + the daily-summary verdict-mismatch plumbing.
- Evidence run: T4e2 (`cmrmk3g88…`) for the live SYNTHESIZE tool-call audit.

## Expected observables

- The seeded protocol text carries the full facts-only-authority section.
- A live program SYNTHESIZE fetches only structured facts / its own result.json — never a child's
  `report.md` prose to derive a verdict.
- The verdict-mismatch signal actually reaches the daily-summary counter.

## Results

**Claim 1 — facts-only authority prose present: PASS.** The seeded `pov-program` text carries the full
section ("NEVER re-derive a verdict from chained prose", fact-gate via task.details, Node C verdict
from its OWN result.json, full-fetch plan for the human, opaque children). The prod v1.0.6 row matches
(pin text + the F16 `blockedByUpstreamFailure` sentence present).

**Claim 2 — SYNTHESIZE consumes facts, not prose: PASS (live spot-check).** T4e2's program SYNTHESIZE
tool calls were audited: child quality gates read via `project(task.context)` metadata; the only
artifact fetches were the producer's and Node C's own `result.json` (the deliverable + the verdict) —
**no child `report.md` was fetched to derive a verdict.**

**Claim 3 — verdict-mismatch plumbing reaches the daily summary: PASS (with a caveat, see Claim 4).**
The grep targets exist on production; warn-level module logs land there; the grep is protocol-agnostic
so program-level mismatches are counted. BUT the count's upstream signal is broken (Claim 4), so
today's "0 mismatches" is vacuous.

**Claim 4 — the verdict-mismatch guard actually fires: FAIL → F21 (published honestly).** The guard
finds sibling reviewer tasks via a metadata path (`metadata.pipelineStageId`) that **pipeline children
do not carry** (verified live: 4 tasks in a leg's child stage, 0 with the key). Its sibling set is
always empty → it silently returns → **the guard has never been able to fire on real data.** The
multi-week "0 mismatches" streak was *unmeasured*, not clean. This is a meta-test finding the meter
itself was broken. Fix: filter by the `stageId` column instead of the metadata path, plus a pin
asserting the guard resolves a reviewer on a real-shaped stage fixture. **Consequence recorded in the
platform's own quarterly-review rule:** the "0 mismatches ⇒ trust the verdict fact deterministically"
branch is SUSPENDED until F21 ships and a full soak window passes.

## Conclusion

**Verified with one honest failure.** Three of four policy claims hold against the running system; the
fourth exposed that a safety-signal guard had been structurally blind since it shipped. Publishing it
is the point — a policy audit that only confirmed the happy claims would be the less trustworthy
document.

## Enforcement

- Protocol: `pov-program` v1.0.6 fact-authority prose (verified present on the prod row).
- The verdict-reconciliation fact is guarded by `test:parse-verdict` (grammar) and the reviewer
  terminal-verdict pins; F21's fix adds a guard-resolves-a-reviewer pin.
- Residual (tracked, with an explicit trigger-to-act): **F21** — the mismatch guard's blindness; the
  quarterly "trust the verdict deterministically" decision is suspended until F21 ships and soaks.
