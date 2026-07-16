# Methodology — how these claims were tested

This pack is the published face of an internal engineering regime. The regime's rules are what make
the claims worth trusting; this document states them plainly so you can judge the evidence by its
process, not just its conclusions.

## Findings-driven rounds, not a fixed test matrix

Testing proceeds in rounds where **each round's findings seed the next round's tests** — the plan is
not written in advance. A round that passes cleanly ends a line of inquiry; a round that surfaces a
defect spawns targeted follow-up rounds until the defect class is closed. This is why the documents
here are numbered by claim, not by a pre-planned suite: the suite grew from what the system actually
did under pressure.

Consequence you can see in the docs: several rounds are *defect-and-fix* narratives (VT-01's contract
double-nesting, VT-05's coverage-counter blindness, VT-02's original permanent hang). The defect, the
review that designed the fix, and the re-run are all published. A round that found nothing would be
the *less* informative document.

## Failure injection is the primary instrument

Green-path tests confirm a system works when nothing goes wrong — the least interesting case. The
load-bearing rounds here **deliberately break something** at a chosen point in the lifecycle:

- strip a binding contract *after* human approval (VT-01, VT-02) — the worst-case silent-composition setup;
- delete a deliverable *after* a leg completes (VT-05) — probe the coverage gate directly;
- plant a prompt-injection payload and a secret in harvested state (VT-07) — the untrusted-input surface;
- never release a human gate (VT-03) — the negative control that proves the failure machinery is
  event-anchored, not timer-anchored.

Where an injection turned out to be *too graceful* to exercise the target path (a dead URL that
degraded cleanly instead of hard-failing), that is recorded and a sharper injection designed — the
round is not declared passed on the wrong evidence.

## Discovery-first, panel-designed fixes

A defect worth fixing gets a **specialist design panel** (typically three independent domain
reviewers) that each run a discovery pass first, propose independently, and then reconcile
contradictions **on evidence** before any code is written. Fixes are synthesized from the panel's full
analyses with a traceability record (every finding folded, deferred-with-reason, or rejected-with-reason).
This is why the fixes tend to reject the naive placement: the VT-02 frozen-cone fix rejected a
belt-and-braces cone rule on evidence that it would re-hang the program one gate downstream; the VT-01
guard fix rejected the obvious handler-level placement because the router strips the field one layer
above.

## Facts over verdicts

The platform distinguishes **facts** (verifiable truths, wrong only as a findable bug) from
**verdicts** (judgements that can be wrong even when the facts are right). Client-facing signals
default to shipping facts; a verdict is earned only after it is validated against outcomes. This
discipline is itself under test — VT-08 is a policy audit that grep-verifies the protocol's own claims
against the running system, and it found a safety-signal guard that had been structurally blind since
it shipped (F21). The meter being broken is published as loudly as any product defect.

## Pin discipline — claims are enforced, not asserted

Every behavioral claim names the **regression pin** that guards it on every commit (listed in each
document's Enforcement section). The distinction the pack is careful about: a **CI pin** runs on every
commit in the validation battery; a **behavioral round** is a database-level reproduction run on
changes to its path but not on every commit. The docs say which is which — a claim guarded only by a
behavioral round is not dressed up as a per-commit guarantee.

## Prove-before-write

Every number, timestamp, version stamp, and pin name in these documents is verified against the source
of truth — the production database, the private-repo test files, the seeded protocol rows — **before**
it is written down. A documented "expect N" that does not match the tree is treated as a defect in the
document, not a rounding difference. The published pack was itself independently audited against this
rule before release, and its corrections recorded.

## Write-at-time-of-test

The standing rule going forward: **every future test round writes its verification document at the
time of the test**, from the evidence in hand, rather than reconstructing it later from memory. The
earlier documents in this pack were migrated from an internal findings ledger written contemporaneously
with each round; new rounds skip the migration step and author the document directly.
