# Model Evaluation Discovery

> **Last Updated**: 2026-10-12 (section H, group 4 levers; movedBy) · **Status**: ACTIVE · **Last Validated**: 2026-10-08 (creation baseline —
> every grep below RUN before it was written, per Protocol 11 Part C; `npm run test:leg-replay-lab` green)
>
> **Paired specialist**: `.claude/agents/model-evaluation-specialist.md`
> **Created per**: `.claude/knowledge/guides/SPECIALIST-LIFECYCLE-GUIDE.md` §1 (Steve approved the name 2026-10-08).

## Overview

This discovery covers how a **proposed change to what a pipeline agent reads, or to which model (and effort)
reads it, is MEASURED before it ships**: the leg replay lab, Protocol 16's gate, the model-onboarding playbook
(including the Phase 2b ground-truth bench for a reviewer), experiment design, and the replay-choice question
(lab vs byte-identity replay).

It does NOT cover: writing the agent-facing text (prompt-construction), the nets/facts the lab re-runs
(execution-facts), the wire/capability audit of a new model (agent-execution), gate semantics (pipeline-harness),
or tier/seed/reseed delivery (template-system). Those are the hand-off seams; see the specialist's Handover logic.

## When to Run This Discovery

- Before designing, running or reading a leg replay lab experiment
- Before any change to a protocol, `ROLE_GUIDANCE_LIBRARY` entry or template constraint a leg role reads
  (Protocol 16 decides whether a lab gate is required)
- Before evaluating a new model or effort for a pipeline role (playbook Phases 0–7)
- When choosing between the lab and a byte-identity replay (forensics guide §7g)

## Run These Greps FIRST

```bash
# --- A. The instrument: the leg replay lab ---
grep -c "lab:leg-replay\|test:leg-replay-lab" package.json   # expect 2 — the lab entry + its offline test suite
grep -c "npm run test:leg-replay-lab" package.json   # expect 0 — the lab suite is OUT of test:all-validation (quarterly out-of-CI run)
grep -cE "^ \* +npm run lab:leg-replay -- " scripts/leg-replay-lab/lab.ts   # expect >=7 — documented usage lines (build-candidates, fidelity, run x3, summarize, snapshot); +score-self-test, score, blind since 2026-10-09 (10)
grep -c "argv.includes('--spend')" scripts/leg-replay-lab/lab.ts   # expect 1 — the ONLY switch from dry run to paid calls
grep -c "maxUsd" scripts/leg-replay-lab/lab.ts   # expect >=1 — the spend cap
grep -c "reviewerEffort?: string. authorSource?: 'live'" scripts/leg-replay-lab/lab.ts   # expect 1 — the variant lever list (authorModel/reviewerModel, authorEffort/reviewerEffort, authorSource)
grep -c "authorPlant?: string. expect?: string" scripts/leg-replay-lab/lab.ts   # expect 1 — per-node plant (EditSpec) + pre-registered expected verdict
grep -c "^runs/\|^cache/" scripts/leg-replay-lab/.gitignore   # expect 2 — runs/ and cache/ hold production data; never commit them
grep -c "execution-core" scripts/leg-replay-lab/live.ts   # expect >=1 — the post-loop order COPY of execution-core.ts, the lab's one drift point

# --- B. Experiments on disk (pre-registration lives in each experiment.json purpose) ---
grep -l "\"purpose\"" scripts/leg-replay-lab/inputs/*/experiment.json | wc -l   # expect >=6 — every experiment carries its pre-registered rule
grep -l "\"authorSource\": \"persisted\"" scripts/leg-replay-lab/inputs/*/experiment.json | wc -l   # expect >=2 — ground-truth bench experiments (reviewer under test)

# --- C. Gate + procedure docs ---
grep -cE "^[1-9]\. \*\*" .claude/knowledge/protocols/pre-registered-lab-gate-protocol.md   # expect 9 — Protocol 16 non-negotiables
grep -cE "^## Phase [0-7] " .claude/knowledge/pipelines/MODEL-ONBOARDING-PLAYBOOK.md   # expect 8 — playbook Phases 0..7
grep -cE "^### Phase 6b " .claude/knowledge/pipelines/MODEL-ONBOARDING-PLAYBOOK.md   # expect 1 — codifying a GUI switch (2026-10-10)
grep -c "^### Phase 2b" .claude/knowledge/pipelines/MODEL-ONBOARDING-PLAYBOOK.md   # expect 1 — the reviewer ground-truth bench
grep -cE "^### §7[fg]\." .claude/knowledge/pipelines/PIPELINE-RUN-FORENSICS-GUIDE.md   # expect 2 — §7f lab mechanics, §7g which replay
grep -cE "^\| L[0-9]+ \|" .claude/knowledge/pipelines/LAB-EXPERIMENT-LEDGER.md   # expect >=9 — ledger rows (one per paid run; append-only)

# --- D. Model levers (owned elsewhere; read here so an arm names a real tier/capability) ---
grep -cE "^  [a-zA-Z]+: 'claude-" lib/agents/model-tiers.ts   # expect >=5 — AGENT_MODELS tiers (orchestrator, synthesis, infra, generic, infraAuthor)
grep -c "infraAuthor: 'claude-opus-5-5'" lib/agents/model-tiers.ts   # expect 1 — config_change_author on Opus 5.5 since 2026-10-07
grep -c "bindsThinkingToPrefix: true" lib/services/llm/model-capabilities.ts   # expect >=2 — models whose reflection calls must keep tools (playbook Phase 1)
grep -c "opus-5-5" lib/services/llm/model-pricing.ts   # expect >=1 — a model the lab prices must be in the pricing table
grep -rln "defaultRole: 'config_change_author'" scripts/   # expect >=4 — owning seeds a model switch must touch (one per infra domain)
grep -c "test:reflection-history-binding" package.json   # expect 2 — Phase 1 pin, defined AND in the CI chain

# --- E. The other replay (§7g): byte-identity, no model call ---
grep -c "replay" scripts/replay-reviewer-warnings.ts   # expect >=1 — rendered report.md byte-identity replay exists

# --- F. requirements_author nodes (L-R1..L-R5, 2026-10-09; inputs/2026-10-09-req-author-loop) ---
grep -cF 'IN (${REVIEWER_ROLE_LIST})' scripts/leg-replay-lab/snapshot.ts   # expect 1 — reviewer paired by the shipping REVIEWER_ROLES set (L-R1)
grep -cF "\"agentRole\" = 'change_reviewer'" scripts/leg-replay-lab/snapshot.ts   # expect 0 — the old hard-wired pairing must not return
grep -c "requirementsFormCorrection?: boolean" scripts/leg-replay-lab/lab.ts   # expect 1 — the per-ARM 2b flag lever (L-R3)
grep -c "requirementsFormCorrectionEnabled?: boolean" scripts/leg-replay-lab/live.ts   # expect 1 — the arm flag reaches the shipping step, not the env
grep -c "one lever, two sources" scripts/leg-replay-lab/lab.ts   # expect 1 — an arm flag plus the env flag in experiment.flags is refused
grep -c "^export const SIZE_ALLOWANCE_CHARS = 500;" scripts/leg-replay-lab/score-requirements.ts   # expect 1 — L-R5 allowance (measured: report.md +0 approved, +296 refused)

# --- G. Z49 levers (2026-10-10; inputs/2026-10-10-z49-request-path) ---
grep -c "inputEdits?: string" scripts/leg-replay-lab/lab.ts   # expect 1 — L-Z1 node input edit (objective of record + child briefs, on a snapshot COPY); the NodeSpec FIELD, not its position (2026-10-13: harvesterOnly/tools were appended after it)
grep -c "requirementsCheckAt?: string }" scripts/leg-replay-lab/lab.ts   # expect 1 — L-Z2 per-arm in-run check data at a commit (a registry row ships WITH its text)
grep -cF -- '-v2.ts`' scripts/leg-replay-lab/protocol-history.ts   # expect 1 — seed renders read seed-data AT the commit (v1 read today's skeleton at every commit)

# --- H. Group 4 levers (2026-10-12; inputs/2026-10-12-g4-registry) ---
grep -c "appliesTo?: string\[\] }> }" scripts/leg-replay-lab/edits.ts   # expect 1 — an edit op may name a SUBSET of its spec's targets (a paraphrased brief copy)
grep -c "nByVariant?: Record<string, number>" scripts/leg-replay-lab/lab.ts   # expect 1 — per-variant n on a node (base TZ 1 beside g4 TZ 3)
grep -c "export function requireG4Classifier" scripts/leg-replay-lab/score-g4.ts   # expect 1 — the g4 scorer refuses to run on a tree without G's classifier
grep -c '"movedBy"' scripts/leg-replay-lab/inputs/2026-10-09-req-author-loop/scorer-self-test.json   # expect 1 — stage A is history; shipped code moves are listed by commit
```

```bash
npm run --silent lab:leg-replay -- z49-self-test --experiment scripts/leg-replay-lab/inputs/2026-10-10-z49-request-path   # expect 0 STALE — exit 0, "reads every case as pre-registered"
```

⚠️ **Check DATA can be pinned to a commit (`requirementsCheckAt`); check CODE cannot.** A shipped code change moves a
historical self-test by construction (2026-10-12: Z54, group 3a and group 4 moved R2–R5). Never overwrite the historical
value: add a `movedBy` entry (commit + reason + new values), applied only when that commit is in the tree's history — so
the same file reads right in a lab's base tree (release code) and its candidate tree. A lab whose candidate changes CODE
runs its base arm from a detached worktree at the release code (group 4 LAB-PREREG §3.3, D1).

⚠️ **A registry row changes the in-run requirements check for EVERY replayed requirements_author node.** Historical drafts
gain findings by construction (Z49 broke `score-self-test` 14 ways and R3/R5 until they were pinned with `checkAt` /
`requirementsCheckAt` to the data of their day). An arm meant to be "today's production" pins the production commit's data.

```bash
npm run --silent lab:leg-replay -- score-self-test --experiment scripts/leg-replay-lab/inputs/2026-10-09-req-author-loop   # expect 0 STALE — exit 0, "reproduces stage A on all gens" (9 trial drafts); a mismatch is a scorer fault
```

```bash
npm run test:leg-replay-lab   # expect >=26 — offline ($0) lab tests (R1-R5 requirements pins added 2026-10-09); floor, never an exact count
```

## Reading the results

- **A** proves the instrument is the one the docs describe. If `--spend` is not the single paid switch, or the
  variant levers changed shape, re-read `lab.ts` before designing any arm.
- **B** — a new experiment directory without `"purpose"` is a Protocol 16 violation (non-negotiable 1).
- **D** — an arm that names a model not in `model-capabilities.ts` fails LOUD in the $0 dry run (by design); a
  model not priced in `model-pricing.ts` makes the estimate and `--max-usd` meaningless.

## Experiment design checklist (prose — not a command)

**Reviewer checklist** for an `experiment.json` before any spend:
1. **One lever per arm.** Text OR model OR effort. Hold the other role fixed — reviewer under test ⇒
   `authorSource: 'persisted'`; Author under test ⇒ reviewer on its production model + reviewer-INDEPENDENT checks.
2. **Nodes in both directions** for every domain the change ships to: must-refuse (planted via `authorPlant`),
   must-approve controls, must-label (where labels are in scope), real refusals of the class under test.
3. **Every node states `expect`; `purpose` states the gates and what each miss triggers** (do not ship / revise
   and rerun named cells / measured, not a stop).
4. **Byte proofs before spend**: dry run green; `--fake-llm persisted` green; the candidate text appears verbatim
   in every rendered prompt; a reused baseline arm is `cmp`-identical (`*.system.md` / `*.user.md`) to the run it
   came from.
5. **Cost**: estimate from the PREVIOUS run's real cost per sample (the estimator undershoots longer models); give
   the owner the exact command and a `--max-usd` cap. Spend is the owner's call.
6. **Read before counting**: every refusal on a planted/control node, one approval per cell, a label sample.
   Score the REASON of a refusal (is it FOR the planted item?), record the cited rule as a subcount.

Worked example of the whole loop (two paid runs, rule corrections between them, platform defects found by reading
samples): `cline_docs/reviews/warnings-invisible-2026-10-08/LAB-RESULTS-B2.md`.

## Integration points

| Seam | Counterpart | What crosses |
|---|---|---|
| Candidate text | prompt-construction-specialist | protocol / role-guidance edits (`edits/`, `templateEdits`) |
| Nets + measures inside the lab | execution-facts-specialist | `nets.ts` re-runs shipping nets; measure code; parser faults the lab exposes |
| New model wire safety | agent-execution-specialist | playbook Phase 1 audit, capability flag, live probe — BEFORE any paid arm |
| Gate meaning | pipeline-harness-specialist | what an approved/refused verdict means at leg and program tier |
| Switch delivery | template-system-specialist | tier constant, owning seeds, manual reseed, freshness report |
