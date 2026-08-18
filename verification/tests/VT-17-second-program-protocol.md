# VT-17 — a second program protocol, authored in the GUI, with zero code change

**Status**: VERIFIED 2026-08-18 | Re-verify trigger: any change to `PROGRAM_PROTOCOL_NAMES`,
`resolveTaskProtocol`/`canonicalProtocolName`, or the composed-injection tier-split
(`PROTOCOL_ROW_NOT_ACTIVE` arm)
**Layer**: platform (protocol registry + injection) + program (PLAN / PLAN-SPAWN)
**Round type**: functional, expectations-authored-before-run

## Objective

The platform claims program protocols are **data, not code**: registering a new one requires a
name in a registry list and a prompt-library row — no engine change, no template change, no
deploy. VT-16 proved composed injection for the protocols that already existed; this round proves
the claim for a protocol that did NOT meaningfully exist the day before. Falsifiable claims:

1. A task titled with a **new** protocol token (`(protocol: research-program)`) is stamped with
   the canonical name by the same suffix rule as every other protocol — nothing in the platform
   names this protocol specially.
2. While the protocol's row is **DRAFT**, a program-tier task bound to it **hard-fails by name**
   (`PROTOCOL_ROW_NOT_ACTIVE`) rather than running base-only — because the orchestration base
   carries no program-composition mechanics, a base-only "program" would be a silently
   fabricated one-child structure. This is the tier-split's program arm, designed in the
   2026-08-17 panel and never before observed live.
3. Once the row is flipped **ACTIVE** (a GUI action), the same task composes base + the new
   protocol and runs PLAN and PLAN-SPAWN identically to the established program protocol —
   with zero leakage of the original protocol's identity anywhere in the run's facts.

## Method

- The `research-program-protocol` row (registered 2026-08-08 as a DRAFT scaffold, deliberately
  DB-only) received a GUI paste of the pov-program-protocol 1.1.0 body with **one edit**: the
  self-fence's protocol name. The un-edited fence would have made every run escalate — the fence
  correctly detecting a mis-matched binding — so the edit itself is load-bearing, and the
  pre-run document pre-committed how a missed edit would be scored (a fence validation, not an
  R4 result).
- One fresh PIPELINE task, title carrying the new token, description carrying the same two
  published design-artifact URLs as the VT-16 rounds. Executed **twice by design**: once against
  the DRAFT row (expecting the hard-fail), once after the GUI ACTIVE flip.
- Six observables (R1–R6) authored before the first execution.

## What happened

- **R1** — stamped `research-program-protocol` at execute time; suffix-rule canonicalization,
  no special-casing.
- **R2 — the tier-split's first live firing.** The DRAFT-row execution FAILED in under a second
  with the exact designed message: *"PROTOCOL_ROW_NOT_ACTIVE: program-tier protocol
  'research-program-protocol' is DRAFT, not ACTIVE. A program harness composed on the base alone
  would silently synthesize a malformed program (the base carries no PLAN-SPAWN mechanics).
  Activate the protocol or re-route the task."* No hang, no silent base-only run, and correctly
  NOT a not-found error — the row existed; its lifecycle state was the refusal.
- **R3** — post-flip, the prompt composed base@3.11.0 + `research-program-protocol@0.1.0`,
  binding chosen from the stamp, preamble within 17 characters of the pov-program equivalent
  (the copy + fence-edit delta).
- **R4** — PLAN ran clean; the edited fence did not trip. En route, an unplanned bonus: the first
  post-flip run **duplicate-halted** — the copied pre-flight detected the test phase's prior
  telemetry-export programs, stamped the halt, and the protocol's own task-state clearance
  channel released it — the base's duplicate mechanics working end-to-end under a binding that
  did not exist when they were written.
- **R5** — PLAN-SPAWN produced the full program roster (plan gate, two per-team approval gates,
  both domain pipeline children with their tokens, deliverable producer, integration reviewer),
  then parked at the deliberately-unreleased gates. One cosmetic deviation recorded: the
  Architect appended descriptive suffixes to gate titles.
- **R6** — the original protocol's name appears in **zero** of the run family's injection facts,
  and the composed preamble was byte-identical across all three executions (the binding is
  resolved once and frozen).

**6/6.** After the round, the row was returned to DRAFT — the registered-early, not-yet-runnable
lifecycle state — leaving the parked test program as its artifact.

## Why this matters

Extending the platform to a new program *kind* — a research program, a migration program, a
compliance program — is a prompt-authoring exercise with a safety rail, not an engineering
project. The rail matters as much as the ease: between "registered" and "activated" there is no
window where a half-authored protocol can silently produce malformed programs; it fails loudly,
by name, with the fix in the error text. Both halves were observed on live production runs, with
the expected outcomes written down before each execution.

## Records

- Pre-run expectations + results:
  `copov15 cline_docs/reviews/demo-pov-design-2026-08-17/RESEARCH-PROGRAM-EXPECTATIONS.md`
- Composed-injection foundation: [VT-16](./VT-16-composed-protocol-injection.md)
- The parked test program: Live Exhibits POV, stage
  `Program: Telemetry export objective (Run 20260818-0651)`
