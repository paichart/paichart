# VT-16 — composed protocol injection: one task, one protocol, and a release that follows the arithmetic

**Status**: VERIFIED 2026-08-17 | Re-verify trigger: any change to the injection mode parse or
composition ladder (`execution-system-prompt.ts`), to `resolveTaskProtocol`, or to the
`protocol-base` tag contract; any protocol version bump touching a delta→base dependence pair
**Layer**: platform (injection) + program (release)
**Round type**: functional, expectations-authored-before-run (three separate pre-run documents)

## Objective

Until 2026-08-17 the platform injected **every** active orchestration protocol into every pipeline
agent's prompt (~178K characters) and the model selected the applicable one from prose. This round
verifies the replacement: the platform resolves each task's protocol **once**, from the
`(protocol: <name>)` token in the title at first execution, stamps it on the task, and composes the
prompt as **base + that one protocol** — a platform decision, never a model-side selection.
Falsifiable claims:

1. A pipeline's prompt carries the orchestration base plus **exactly** its own protocol — at every
   tier (program harness, leg harness, leaf specialist), on every mode re-entry, with the binding
   frozen at first execution.
2. Every execution records what it was actually composed from, as a durable fact
   (`protocolInjection`: mode, base+version, delta+version, how the binding was chosen, preamble
   size) — so "which protocol governed this agent" is answerable from the artifact, not inferred.
3. The reduced prompt does not degrade the governed behavior it exists to carry — proven the hard
   way, by a full program run whose release gate had to adjudicate a real model failure.

## Method

Three live rounds on production, each with its expected observables authored **before** the run:

1. **Leg canary** (rig-free): one artifact-synthesis pipeline, full lifecycle.
2. **Program round 1**: a two-domain sequenced program (the Meridian T6 objective — live cEOS
   fabric + LocalStack Terraform state, freshly re-randomized scatter) through plan, human gates,
   both legs, integration review, release gate.
3. **Program round 2**: the same objective, fresh run, after round 1 was blocked.

No inputs beyond each task's title token and the two published design-artifact URLs. Gates
released by a human in role order (plan → network → cloud).

## Expected observables (authored pre-run; transcribed, not reconstructed)

| # | Claim | Expected |
|---|---|---|
| 1 | Binding is stamped | `task.metadata.protocol` = the canonical protocol name after first execution |
| 2 | Composition fact | `protocolInjection` on result.json, before the response body: `mode:"composed"`, base + delta with versions, `stampSource:"stamp"` |
| 3 | Tier correctness | program root composes the program protocol; each leg composes its own domain protocol only; leaf specialists keep their template-bound single protocol (`mode:"named"`) |
| 4 | Frozen binding | a harness's later mode re-entry (SYNTHESIZE) composes the byte-identical preamble |
| 5 | Attention delta | composed preamble sizes: ~39K (base only) / ~69K (leg) / ~79K (program) vs ~178K under load-all |
| 6 | No degradation | decomposition, gate creation, chaining, review and release behave per protocol; zero injection-mode errors |

## What happened

**Leg canary — 7/7.** Stamp written and read back within the same execution start; composed fact
`base@3.11.0 + artifact-synthesis@1.4.1`, preamble 68,782 chars (61% below load-all); children ran
under their unchanged leaf bindings; the SYNTHESIZE re-entry composed a byte-identical preamble;
quality gate `approved/95` with the reviewer present. Full lifecycle ~8 minutes, first attempt.

**Program round 1 — the injection passed 7/7, and the run itself was BLOCKED — correctly.** All
composition observables held (program 79,276 chars at PLAN and byte-identical at PLAN-SPAWN; both
legs composed exactly their own protocols; the plan's child titles and per-team gates created
verbatim from the requirements). Then the content: the network design agent, after correctly
rejecting a first candidate pair for collision, made a one-bit arithmetic slip on its second —
selected `.5/.6` and derived `10.99.0.4/29` where the minimal cover is a `/30` (its own text lists
a four-address range under a /29 label). **The leg's reviewer approved it at 92.** The mechanical
containment check stamped `blocking / 3 violations` (non-minimal; the canonical /29 covers two
pre-existing allocations); the harness overturned the approving reviewer — recording
`verdictMismatch: true` — and the program integration reviewer independently recomputed and
blocked on the same arithmetic. `programReleasable: false`, limiting leg named. The
requirements' own re-selection discipline, the two-tier catch, and the outcome-keyed release all
behaved exactly as published.

**Program round 2 — green, machine-released.** A fresh run of the same objective: the design agent
selected an aligned pair and derived `10.99.0.0/31` — minimal, exact, zero violations
(`benign / checked-clean` over a 6-CIDR + 4-ASN harvest). The consuming Terraform leg carried
`10.99.0.0/31` **verbatim** in `consumedValues` with `upstreamContainment.green: true`, and the
program released `programReleasable: true / approved / 92` — the first machine-gated release of
the consuming-leg configuration (previously documented as "shipped but never yet exercised";
that status note is corrected in the requirements as of this round).

## The decisive pair

Both program rounds scored **92 from the leg reviewer**. In round 1 the arithmetic disagreed with
that 92 and release was refused; in round 2 the arithmetic agreed and release was granted. Same
objective, same protocol, same prompt regime, same reviewer confidence — the release authority
demonstrably sits with the machine-checked facts, not with any model's self-assessment. That
property was inherited from the load-all era; this round proves it survives the composed one, on
prompts 55–78% smaller.

## Counterfactuals retired

- Under the old fall-through parse, the flip value would have silently landed the harness in a
  protocol-less mode; it now throws by construction (deploy-gated both directions).
- A program protocol whose row is not live now **fails by name** rather than letting the base
  silently synthesize a malformed one-child program (the tier-split); a leg in the same state
  degrades to base-only with a recorded degradation fact.
- The stream path's route-edge task snapshot predates the stamp write; the shared resolver makes
  the stale read converge with the stamp by construction — pinned by a dual-path parity test that
  did not exist before this round.

## Records

- Design + panel: `copov15 cline_docs/reviews/ws1-phase-c-2026-08-17/` (four specialist reviews,
  synthesis, nine flip blockers)
- Pre-run expectation documents with results:
  `copov15 cline_docs/reviews/ws1-phase-c-2026-08-17/CANARY-EXPECTATIONS.md`,
  `copov15 cline_docs/reviews/demo-pov-design-2026-08-17/PHASE1-EXPECTATIONS.md`
- The runs live in the "Autonomous Delivery Step by Step" POV (blocked round 1 preserved
  deliberately as a fail-detection exhibit)
