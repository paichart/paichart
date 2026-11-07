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
grep -A24 "^## The non-negotiables" .claude/knowledge/protocols/pre-registered-lab-gate-protocol.md | grep -cE "^[1-9]\. \*\*"   # expect 9 — Protocol 16 non-negotiables (section-scoped since 2026-10-31: the no-regression rule added its own numbered list above them)
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
grep -c "sets requirementsFormCorrection while experiment.flags sets" scripts/leg-replay-lab/lab.ts   # expect 1 — an arm flag plus the env flag in experiment.flags is refused (keyed on the 2b refusal itself; 2026-10-15 the phrase "one lever, two sources" also guards heldEditCorrection and its comment)
grep -c "^export const SIZE_ALLOWANCE_CHARS = 500;" scripts/leg-replay-lab/score-requirements.ts   # expect 1 — L-R5 allowance (measured: report.md +0 approved, +296 refused)

# --- G. Z49 levers (2026-10-10; inputs/2026-10-10-z49-request-path) ---
grep -c "inputEdits?: string" scripts/leg-replay-lab/lab.ts   # expect 1 — L-Z1 node input edit (objective of record + child briefs, on a snapshot COPY); the NodeSpec FIELD, not its position (2026-10-13: harvesterOnly/tools were appended after it)
grep -c "requirementsCheckAt?: string" scripts/leg-replay-lab/lab.ts   # expect 1 — L-Z2 per-arm in-run check data at a commit (a registry row ships WITH its text); the FIELD, not its position (2026-10-15: G1 variant fields were appended after it)
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
7. **Read every plant against EVERY input its reader holds — including the reader's TASK BRIEF** (two L-K1 Reviewer
   plants were invalid: the prod brief said "no baseline supplied"; an override of a declared value draws the
   chosen-value comparison rule). *(held-k8s LL-20)*
8. **Score role-prefixed arms** (`k1-score --arm hk1|xk1|rk1`); an exact-match `--arm k1` reads every gate "not run". *(LL-21)*
9. **Proxies flag, the hand read decides** — table-form drift and verbatim failed-read reports were scorer misses; keyword
   hits ("reconcile", "HALT") were false. *(LL-22)*
10. **Byte-prove fixtures against a live probe, incl. directory and missing cases**; a fixture digest covers listings and
    missing-path text too; a default that is a prefix of live text fails. *(LL-23)*
11. **Prove the candidate text reaches every arm** (count arm dirs carrying the new heading and lacking the old) and
    re-assert the text sha at the push commit. *(LL-24)*
12. **A stalled lab agent: check its artefacts before re-spawning** — most of the work may exist; finish in-session. *(LL-25)*
13. **Close a predicted failure in the TEXT before paying to measure it.** If the pre-registration names a likely revise trigger
    (L-K2: SG-DIFF — the text said "never whole" but not "a unified diff is not an edit", and still said "Helm-values diff"), fix
    the text at $0 and re-pin; the lab then measures the fixed text instead of buying the known failure. *(held-k8s LL-26)*
14. **Crib run first: split the most expensive invocation into `--n 1`, then `--n 4`.** Score the n=1 slice (≈ 1/5 of the cost)
    and stop on any systematic miss; the scorer combines both runs, so a clean slice costs nothing extra. *(LL-27)*
15. **Prove a novel output SHAPE through the real applier/parser at $0 before sampling it** — hand-write one correct package and
    run it with `--fake-llm fixture:<dir>` (L-K2: inserting a new document into a held file applied 1/1). A shape the grammar
    cannot express is a text/code fix, not a lab finding. **Reuse persisted production outputs as the base reading** where they
    exist (L-K2 dropped a ~$11 sampled base Author arm). *(LL-28)*

Worked example of the whole loop (two paid runs, rule corrections between them, platform defects found by reading
samples): `cline_docs/reviews/warnings-invisible-2026-10-08/LAB-RESULTS-B2.md`.

## PLATFORM-HELD-BYTES lab capabilities (2026-10-15, G1)

The held-variant lab (Stage B G1, ledger L12/L12b) added: an in-memory held store and its prod identity check, variant binding by
commit, held fields patched into frozen chain entries, the edit scorer, canned Author fixtures, raw tool-result plants and solo
Architect cells. G2 (2026-10-15) added L-9 (a G1 sample as the fixed Author, refused unless its Author prompt is byte-identical), edit-op plants re-stamped by the PURE applier, `reviewerBaseEdit`, `diffMustShow`, the lever-delta report and `score-g2.ts`.
```bash
grep -c "cmd === 'edits-score'" scripts/leg-replay-lab/lab.ts   # expect 1
grep -c "cmd === 'held-id-check'" scripts/leg-replay-lab/lab.ts   # expect 1
grep -c "export function snapshotWithVariantBinding" scripts/leg-replay-lab/variant-binding.ts   # expect 1
grep -c "harvester-toolcall:" scripts/leg-replay-lab/input-edits.ts   # expect >=1
grep -c "architectOnly" scripts/leg-replay-lab/lab.ts   # expect >=1
grep -c "LAB_SAMPLE_PREFIX" scripts/leg-replay-lab/lab.ts   # expect >=2 — L-9 BUILT 2026-10-15 (G2): node authorSourceByVariant 'lab-sample:<run>/<node>/<arm>/<i>'
grep -c "export function pureStamp" scripts/leg-replay-lab/lab-sample.ts   # expect 1 — a plant re-stamps PURELY (never a correction turn, S-2)
grep -c "reviewerBaseEdit" scripts/leg-replay-lab/lab.ts   # expect >=2 — the named-state case: Reviewer-side held bytes only
grep -c "cmd === 'g2-score'" scripts/leg-replay-lab/lab.ts   # expect 1 — the G2 reason-scored Reviewer-bench scorer (score-g2.ts)
# G3-entry lab changes (2026-10-16, 6b44c9cfe — G3-ENTRY-BUILD.md §2):
grep -c "stripAgentForbiddenActions(" scripts/leg-replay-lab/rebuild.ts   # expect 1 — HUB-P2-2: lab tools = production's stripped tools (series cut)
grep -c "export function r9VersionOfRun" scripts/leg-replay-lab/score-edits.ts   # expect 1 — ME-P2-5: R9 from the run manifest
grep -c "process.env.CONNECTED_OUTPUT_SANITIZE_ENABLED" scripts/leg-replay-lab/score-edits.ts   # expect 0 — the scorer never reads the shell's R9
grep -c "export function plantArmGaps" scripts/leg-replay-lab/lab.ts   # expect 1 — ME-P2-6: an unannounced unplanted arm is refused before any call
# G3 Reviewer lab (2026-10-16, G3-LAB-PREREG.md):
grep -c "cmd === 'g3-score'" scripts/leg-replay-lab/lab.ts   # expect 1 — G3 scorer (score-g3.ts, additive over score-g2): readings diff-rule / remit / partial-render + G3-NOFALSE identical-pair subcount
grep -c "addedTemplateConstraint" scripts/leg-replay-lab/lab.ts   # expect 1 — lever report names variant-template constraint lines apart from "outside the held block" (HB8 was stale 51/1 at 8ce50c814 until this)
```
Records: `cline_docs/reviews/platform-held-bytes-2026-10-13/G1-LAB-PREREG.md`, `G1-LAB-RESULT.md`.
**Phase 10 (2026-10-17):** variant folded into obs ≥ 1.10.0; historic `hb` arms render via the frozen `held-bytes/variant-protocol-stage-b.ts`; `score-edits.ts` imports `inOrderCoverage` from `held-bytes/whole-file.ts`.

## Integration points

| Seam | Counterpart | What crosses |
|---|---|---|
| Candidate text | prompt-construction-specialist | protocol / role-guidance edits (`edits/`, `templateEdits`) |
| Nets + measures inside the lab | execution-facts-specialist | `nets.ts` re-runs shipping nets; measure code; parser faults the lab exposes |
| New model wire safety | agent-execution-specialist | playbook Phase 1 audit, capability flag, live probe — BEFORE any paid arm |
| Gate meaning | pipeline-harness-specialist | what an approved/refused verdict means at leg and program tier |
| Switch delivery | template-system-specialist | tier constant, owning seeds, manual reseed, freshness report |

## held-k8s 1k lab levers (2026-10-18 — DEPLOYED with step 1, `e4e0380d0`)

```bash
ls scripts/leg-replay-lab/fixture-tools.ts scripts/leg-replay-lab/harvester-source.ts scripts/leg-replay-lab/score-k1.ts | wc -l   # expect 3
grep -c "validateServiceCall" scripts/leg-replay-lab/fixture-tools.ts   # expect >=1 — every served Git read passes the SHIPPING pin first
grep -c "unserved-fixture" scripts/leg-replay-lab/fixture-tools.ts      # expect >=1 — an unmodelled github call is logged, never stubbed
grep -c "k1-self-test" scripts/leg-replay-lab/lab.ts                    # expect >=1
```
L-K-a `fileFixture` (one pinned commit, probed shape, gateway envelope) · L-K-b `fixturePlants` · L-K-c `harvesterSourceByVariant`
(`lab-sample:` refused unless byte-identical prompts/protocol/fixture, or `frozen:`) · L-K-d `score-k1.ts` (mutation-pinned self-test).
**Owed before L-K1's pre-registration:** the real fixture at lab-repo commit `6d7d0c7` + the G-FIXTURE-ID admin probe + `fixture-id-check`;
the forensics §7f lab-capability entry. Record: `cline_docs/reviews/held-k8s-2026-10-18/STEP1-BUILD.md` §1 (1k), §7.

## L-K1 (held-k8s step 2, 2026-10-19; every expectation run before it was written)

```bash
grep -c "c.arm === arm" scripts/leg-replay-lab/score-k1.ts   # expect 1 — arms match EXACTLY: score `--arm hk1|xk1|rk1`, never `--arm k1` (reads every gate "not run")
```
Result + lessons (plants read against the Reviewer's TASK BRIEF; scorer proxies vs the hand read; fixture F1/F3):
`cline_docs/reviews/held-k8s-2026-10-18/LAB-RESULT-L-K1.md`.


## L-K2 lab levers (held-k8s step 3, the join; 2026-10-19; every expectation run before it was written)

```bash
grep -c "heldJoinSeed?: string" scripts/leg-replay-lab/lab.ts   # expect 1 — L-K-e: a JOINED domain's held arm (no variant; the owning seed's buildTemplateRow constraints)
grep -c "export function snapshotWithHeldJoin" scripts/leg-replay-lab/variant-binding.ts   # expect 1 — refuses a leg this tree's lib does not make held-capable
grep -c "gitFileSourceLeg: !!snap.leg && isGitFileSourceLeg(snap.leg)" scripts/leg-replay-lab/held-store.ts   # expect 1 — without it the lab store holds NOTHING from a Git read
grep -c "cmd === 'k2-score'" scripts/leg-replay-lab/lab.ts   # expect 1 — score-k2.ts: SG-DOC, SG-DIFF, strict base diffs, independent G-AMBIG, DRIFT-CAUSE, k8s Reviewer gates
grep -c "LK8 (L-K2)" scripts/test-leg-replay-lab.ts   # expect 1 — k2-self-test + its four mutations pinned
```
⚠️ A held-capable domain joins by NAME (`HELD_JOIN_VERSIONS`), so in a tree with the join, a BASE-arm leaf of that domain stamps
`editApplication: step-not-run` (unrendered; prompts unchanged — L-K2 proved 73/73 cmp-identical against the release worktree).
⚠️ A Git held path keeps the URI's leading slash (`/k8s/…`); a `create` must use the same form (register HELD-GIT-CREATE-PATH-SLASH).
⚠️ One held file per k8s leg ⇒ `partial` is unreachable; any one bad SEARCH refuses the file (`refused`).
Record: `cline_docs/reviews/held-k8s-2026-10-18/LAB-PREREG-L-K2.md`.

## Lab spend + plant integrity (2026-10-19, L-K2; every expectation run before it was written)

```bash
grep -c "spendMismatch" scripts/leg-replay-lab/lab.ts                           # expect >=3 — run-end check: meter vs Σ sample.json (LAB-SPEND-COUNTER-RACE; pin LK10)
grep -c -i "re-read" scripts/leg-replay-lab/input-edits.ts                     # expect >=2 — a plant is applied to EVERY stored copy and re-read (pin LK11)
```
⚠️ Cross-check any reported lab spend against Σ `sample.json` `costUsd` — before the fix the manifest under-reported concurrent
Architect/Harvester runs (ledger L12/L16 corrected).

## Lab-cost mechanics + L-K2 scorer refinements (2026-10-19, LAB-COST-REDUCTION ranks 1–5; every expectation run before it was written)

```bash
grep -c "^## Spend only where a sample can change the verdict" .claude/knowledge/protocols/pre-registered-lab-gate-protocol.md   # expect 1 — fixture-not-sample, re-apply-not-rerun, plant presence, base arms opt-in, curtailment, warm-first, batch
ls .claude/knowledge/pipelines/LAB-ANATOMY.md | wc -l                                  # expect 1 — how to build a lab, L-K2 worked
grep -c "export function plantPresence" scripts/leg-replay-lab/lab.ts                  # expect 1 — LAB-PLANT-PRESENCE-CHECK: planted vs UNPLANTED twin prompt
grep -c "LAB-PLANT-PRESENCE-CHECK — plant" scripts/leg-replay-lab/lab.ts               # expect 2 — refused in the dry run on both persisted-Author paths (lab-sample, persisted)
grep -c "export function warmFirstOrder" scripts/leg-replay-lab/lab.ts                 # expect 1 — LAB-WARM-FIRST (--no-warm-first to disable)
grep -c "argv.includes('--batch')" scripts/leg-replay-lab/lab.ts                       # expect 1 — LAB-BATCH-TRANSPORT, paid only
grep -c "export function toBatchParams" scripts/leg-replay-lab/batch-transport.ts      # expect 1 — the one body transform (drops betas/fallbacks, 1h TTL)
grep -c "never touch the network" scripts/leg-replay-lab/batch-transport.ts            # expect 1 — capture mode ($0 proof) refuses messages.create
grep -c "isBatchScope()" scripts/leg-replay-lab/live.ts                                # expect 4 — batch pricing, call stamp, deadline extension, requirements refusal
grep -c "negation-blind" scripts/leg-replay-lab/score-k2.ts                            # expect 3 — DRIFT-CAUSE negation (mutation + type + check)
grep -c "export function k8sArchQuotes" scripts/leg-replay-lab/score-k2.ts             # expect 1 — ARCH-QUOTE k8s document reading (a new object is not a quote)
grep -c "export function countCitation" scripts/leg-replay-lab/score-k2.ts             # expect 1 — collateral: a rendered-count citation is FOR the plant
grep -c "LK12 (lab-cost\|LK13 (LAB-BATCH" scripts/test-leg-replay-lab.ts               # expect 2
```
- **Batch byte proof** (`--fake-llm transport`, $0): the SHIPPING provider builds every request; the capture writes
  `batch-proof/NNN.{production,batch}.json`. First run on L-K2 cells: 5 requests, 0 unexpected. Opus differs by
  `betas`, `fallbacks` and two TTL leaves; Sonnet differs by the TTL leaves only.
- **The ≈ $1 crib is the OWNER's**, and so is the ruling that the batch tier is a valid measurement tier.
- **The batch divergences are named in the manifest**: no refusal fallback, the served tier, and a loop deadline that reads ample
  time. requirements_author nodes are refused.
- The plant-presence check filters ops by the arm's Author form (op-level `appliesTo`). G2 R-COLLATERAL carries ops for two forms.
- The refined L-K2 readings print BESIDE the registered ones (ARCH-QUOTE "k8s document reading", COLLATERAL "with a rendered-count
  citation"). Re-scored on the L-K2 runs they equal the hand reads: 19/20, 5/5, NOWIT 4/5, WIT 5/5.

## L-T1 (held-terraform step 2, pre-registered 2026-10-21; every expectation run before it was written)

```bash
grep -c "cmd === 't1-score'" scripts/leg-replay-lab/lab.ts            # expect 1 — score-t1.ts: PATH (incl. browser bypass + ref/sha + forbidden paths), DESC/STATE, DIFF, CAUSE, REF, NOFALSE, HALT/ARCH
grep -c "export function t1SelfTest" scripts/leg-replay-lab/score-t1.ts  # expect 1 — 8 mutations (refused-blind added in ADDENDUM (d)), each RED
grep -c "HALT_AFTER_NEG_RE" scripts/leg-replay-lab/score-t1.ts          # expect 2 — the negation-AFTER fix ("HALT condition does not trigger"), found on the persisted "before" run
grep -c "LT1 (L-T1)" scripts/test-leg-replay-lab.ts                     # expect 1
grep -c "export const QUOTE_FILE_TOOLS" scripts/leg-replay-lab/score-quote.ts   # expect 1 — the strict quote scorer pairs the GIT read too (before: obs-rig tools only, so every Git quote read "not faithful")
```
- **The lab does not reproduce a non-github refusal**: a `scrape_page` of a pinned-repo URL falls to the recorded tier (unserved), where
  production refuses `PINNED_SOURCE_BYPASS` — score the attempt from arguments, over samples valid OR not.
- **`--batch` never batches a Harvester** (`lab.ts`: Harvesters stay standard) — price Harvester cells at the standard ledger rate.
- **A `merge()` / `local` reference makes a "present in state, absent from the file" plant undecidable** — plant outside the merge, or a
  literal key merge cannot remove (LL-20 applied to HCL).
- Calibrate every new proxy on a `--fake-llm persisted` "before" run first ($0).
- **A brief that orders a read beats the protocol text**: 15/15 Harvesters called a tag their brief named, through three text versions. Fix such a rule where the brief is WRITTEN (the harness), and keep a pin-refused attempt apart from a served off-path read (`refusedAttempts`, ADDENDUM (d)).
- **One crib per text version**: each re-pin invalidates lab-sample harvests (byte-bound), so run Architect cells only after the last Harvester text change.
Result: `cline_docs/reviews/held-terraform-2026-10-19/LAB-RESULT-L-T1.md` (PASS, $15.53).
Record: `cline_docs/reviews/held-terraform-2026-10-19/LAB-PREREG-L-T1.md`.

## L-T2 (held-terraform step 3, the join; PASSED 2026-10-22, $5.69; every expectation run before it was written)

```bash
grep -c "cmd === 't2-score'" scripts/leg-replay-lab/lab.ts                          # expect 1 — score-t2: score-k2 Author tables + HCL ARCH-QUOTE + score-t1 G-T-REF
grep -c "export function hclArchQuotes" scripts/leg-replay-lab/score-t2.ts           # expect 1 — >= 3 NON-TRIVIAL held lines in order (bare } / blank never count)
grep -c "otherValid:" scripts/leg-replay-lab/recorded-tools.ts                       # expect 2 — non-file services served rate; `valid` stays the FILE-tool rule
grep -c "fact.state === 'unheld'" scripts/leg-replay-lab/score-edits.ts              # expect 1 — the digest recheck is not checkable on an unheld stamp (was a false miss)
grep -c "LT3 (L-T2)\|LT2 (LAB-VALIDITY" scripts/test-leg-replay-lab.ts              # expect 2
grep -c "arbitrateReflectionPass" scripts/leg-replay-lab/live.ts                     # expect 3 — the lab calls the SHARED F-T2-1 arbitration; never re-copy the post-loop order
ls scripts/leg-replay-lab/inputs/2026-10-21-held-terraform-l-t2/fixtures-fake/*.md | wc -l   # expect 8 — the $0 fixture proofs (insert, bare-}, NFKC x2, placeholder x2, mixed + its correction)
```
- **Code-decided cells are fixtures, never samples:** the mixed-correction arbitration (F-T2-1), NFKC / R10 placeholder both ways, bare-`}`
  ambiguity, the novel insert shape — all `--fake-llm fixture:`, $0. Only behaviour is sampled.
- **Read the Reviewer's PRODUCTION brief before choosing a clean control**: L-T2's ordered "unified-diff headers", which a correct held
  package cannot meet — a brief edit (the 1.15.0 transcription) made the control valid.
- **`k2ReviewerGates` keys on k8s/G3 node NAMES** — a new domain's `R-*` cells read "not run" (score them with `scoreG2Sample`; register
  T2-REVIEWER-GATE-KEYS).
- **Calibrate on the persisted before-run, every new proxy**: the live F-W1 Harvester exposed a G-T-REF proxy that read its own failure as a
  pass (fixed per sentence); markdown emphasis hid negations twice (now stripped before any negation is read).
Records: `cline_docs/reviews/held-terraform-2026-10-19/LAB-PREREG-L-T2.md`, `LAB-RESULT-L-T2.md`.


## L-N1 (held-network step 2, $0 build 2026-10-24; every expectation run before it was written)

```bash
grep -c "cmd === 'n1-score'" scripts/leg-replay-lab/lab.ts                                 # expect 1 — score-n1: REG, NOHAND, PATH, BASE, CANARY, CTRLX (do-not-ship) + SHAPE/REF/STOP/OUTAGE/QUOTE/SRC/DRIFT/CTRL/DERIV/ARCH
grep -c "export function n1SelfTest" scripts/leg-replay-lab/score-n1.ts                     # expect 1 — 11 mutations, each RED
grep -c "export function createNetworkToolServer" scripts/leg-replay-lab/network-fixtures.ts # expect 1 — B4 device pool (+ failure mode) · B5 catalogue (live probe bodies) · B6 register refusal (thrown)
grep -c "LN1 (L-N1)\|LN2 (L-N1 B4/B5/B6)" scripts/test-leg-replay-lab.ts                   # expect 2
grep -c "export const NET_APPLY_MODE_RE" scripts/leg-replay-lab/score-n1.ts                 # expect 1 — "out-of-band apply/management" is no drift cause (found on the persisted before-run)
grep -c "templateEdits on a Harvester whose template" scripts/leg-replay-lab/lab.ts         # expect 1 — role guidance is now a lever on Harvester nodes
```
- **A Harvester's protocol is its TEMPLATE's named binding, not its leg's**: the value-leg (network-derivation) Harvester runs on
  `Network State Harvester` ⇒ `network-provisioning-protocol`. Check the stored `protocolInjection.delta.name` before choosing an arm.
- A role-guidance change reaches every owning seed's Harvester: add one control per domain whose protocol governs (G-N-CTRLX).
- Records: `cline_docs/reviews/held-network-2026-10-22/LAB-PREREG-L-N1.md` (+ ADDENDUM (a)).

## L-NB1 (network text batch 1, network-provisioning 1.24.0; $0 build 2026-10-25; every expectation run before it was written)

```bash
grep -c "cmd === 'nb1-score'" scripts/leg-replay-lab/lab.ts                          # expect 1 — score-nb1 (additive over score-n1): SECRET-RAW, B5-QUOTE, B3 unpinned read/src, B2-FIRST, NOPKG, NOFALSE
grep -c "export function nb1SelfTest" scripts/leg-replay-lab/score-nb1.ts             # expect 1 — 7 mutations, each RED
grep -c "unpinned?: boolean" scripts/leg-replay-lab/fixture-tools.ts                  # expect 1 — L-NB-a: a customer Git service with NO pin (refs map; refuses a pinned name or the platform-pinned repo)
grep -c "export const AUTHOR_CHAINED_TARGET_RE" scripts/leg-replay-lab/input-edits.ts # expect 1 — L-NB-b: patch an Author's chained finalResponse in every copy, re-read
grep -c "LNB1 (L-NB1)\|LNB2 (L-NB-a" scripts/test-leg-replay-lab.ts                   # expect 2
```
- **A secret rule is measured on the RAW model output** (`harvester.md` / `author.md` are pre-persist); the post-persist R10 survivor
  count is a separate, platform gate. A persisted `<<REDACTED-SECRET>>` inside a quote means the agent wrote the value in clear.
- **Put the measured item IN SCOPE on purpose**: in L-N1 only 1 of ~25 Git-quoting samples quoted the SNMP line at all, so a brief
  sentence makes the touched range include it (named, read against the brief).
- **An unpinned customer Git fixture cannot use the platform-pinned repo** — a non-pinned service naming it is refused
  `PINNED_SOURCE_BYPASS`; rename the repo.
- **Other masks (`...`, `<<REDACTED-SECRET>>`) are not clear values** — count them apart (`masked`), never as a secret hit.
Record: `cline_docs/reviews/held-network-2026-10-22/LAB-PREREG-L-NB1.md`.

## L-NB2 (network text batch 2, network-provisioning 1.25.0; $0 build 2026-10-25; every expectation run before it was written)

```bash
grep -c "cmd === 'nb2-score'" scripts/leg-replay-lab/lab.ts                          # expect 1 — score-nb2 (additive over score-nb1): per-quote source split, clear-quote MISS, Author B5, quotesExact, VOID rule
grep -c "export function nb2SelfTest" scripts/leg-replay-lab/score-nb2.ts             # expect 1 — 5 mutations, each RED
grep -c "export function plantDevicePool" scripts/leg-replay-lab/network-fixtures.ts  # expect 1 — L-NB2: named canary plants into a device pool, exact counts, proved by un-planting
grep -c "cmd === 'nb2-fixtures'" scripts/leg-replay-lab/lab.ts                        # expect 1 — the pool from ONE cached Harvester snapshot + fixtures/device-plants.json
grep -c "LNB3 (L-NB2)" scripts/test-leg-replay-lab.ts                                  # expect 1
```
- **Read the live miss before taking the brief's hypothesis**: F-NB1 was handed over as "long quotes"; the stored quotes were 1–2 lines,
  and the unmeasured factor was that every stored device result is post-R10 (a device read never delivered a clear secret in the lab).
- **A text that tightens a rule needs a SAMPLED baseline that reproduces the miss** (VOID rule: ≥ 2 base misses, else a ≥ n−1 bar cannot
  separate the texts); run the baseline first and stop on VOID.
- **Descriptor copies age**: L-NB1's `ceos-lab-readonly` 0.3.0 copy is refused by today's shipping check (tool description > 500); copy the
  public descriptor the live leg registered, and serve its register + `registry tools` from the live record (`catalogueFallthrough`).
- score-n1's Git QUOTE reading skips blocks under 3 lines — short quotes need `quotesExact`.
Record: `cline_docs/reviews/held-network-2026-10-22/LAB-PREREG-L-NB2.md`.

## L-N2 (held-network step 3, the join; DRAFT pre-registration 2026-10-26; every expectation run before it was written)

```bash
grep -c "cmd === 'n2-score'" scripts/leg-replay-lab/lab.ts                                   # expect 1 — score-n2 Author readings + the node-driven Reviewer bench in one report
grep -c "export function n2SelfTest" scripts/leg-replay-lab/score-n2.ts                       # expect 1 — SG-CLI, G-RESTORE, G-N2, G-N5, unheld handle; 5 mutations RED (LN5)
grep -c "export function reviewerBenchGates" scripts/leg-replay-lab/score-reviewer-bench.ts   # expect 1 — T2-REVIEWER-GATE-KEYS: nodes join by scoring.reviewerGate, never by name (LN6)
grep -c "export function withComputedHarvesterComparison" scripts/leg-replay-lab/device-comparison-patch.ts   # expect 1 — L-N2-c: pre-net network Harvesters get gitDeviceComparison (LN7)
grep -c "export function deviceLegOf" scripts/leg-replay-lab/held-store.ts                    # expect 1 — L-N2-a: the lab store passes declared Device sources (LN4)
grep -c "mCPTool: {" scripts/leg-replay-lab/replay-prisma.ts                                  # expect 1 — validationToolCalls computes in the lab (it stamped an enrichment error before)
```
- **A network held store without the leg's declaration holds no device config** — pass `deviceLeg` (description + interface contract);
  G-HOLD-ID names pre-device-lane extras (before 2026-10-26 02:20:23Z) instead of failing.
- **Stored network Harvesters predate `gitDeviceComparison`**: compute it with the shipping function on a snapshot copy, or the Architect /
  Reviewer §6 lacks a block production now sends. `chainEntryFromResult` carries the replayed Author's `validationToolCalls` + checked
  comparison (it carried neither).
- **Pre-redaction fixtures reverse to the stored base** (P-2): planting clear secrets where R10 left placeholders gives byte-equal held
  bases; a bare echo elsewhere refuses the device (`echo-secret-residual`) — a fixture cell, never sampled.
Record: `cline_docs/reviews/held-network-2026-10-22/LAB-PREREG-L-N2.md`.

## NO-REGRESSION golden set (2026-10-31, Protocol 16 § The standing no-regression rule; every expectation run before it was written)

```bash
grep -c '"authorExecutionId"' scripts/leg-replay-lab/golden/golden-set.json   # expect 17 — golden v3 cases (5 network, 2 network value, 3 k8s, 4 terraform, 3 observability)
grep -c '"shape": "value"' scripts/leg-replay-lab/golden/golden-set.json   # expect 2 — the value legs (NET-VALUE-C1 v2, NET-VALUE-C126 v3)
grep -c '"version": "v4"' scripts/leg-replay-lab/golden/golden-set.json   # expect 2 — the set's version + its newest refreezes entry (v4 2026-11-06: pin move only, network-derivation 1.2.0 → 1.3.0)
grep -c '"version": "1.3.0"' scripts/leg-replay-lab/golden/golden-set.json   # expect 1 — the network-derivation pin (deployed 2026-11-06 07:28Z, L-VLG SHIP)
grep -c '"version": "1.26.0"' scripts/leg-replay-lab/golden/golden-set.json   # expect 1 — the network pin (v3; it was stale at 1.25.0 from the 2026-11-05 deploy until v3)
grep -c "if (goldenSpendRefusal) throw" scripts/leg-replay-lab/lab.ts   # expect 1 — --spend on an agent-text/model lab without a goldenSet declaration is refused before any call
grep -c "export function buildGoldenCompanion" scripts/leg-replay-lab/golden-set.ts   # expect 1 — the companion builder (golden-build)
grep -c "npm run test:golden-set" package.json   # expect 0 — out of CI like the lab suite (needs the snapshot cache)
```

```bash
npm run --silent test:golden-set   # expect >=26 — GS1–GS7 incl. the $0 end-to-end (v3: 29 cells under --fake-llm persisted reproduce every stored outcome); floor, never an exact count
npm run --silent lab:leg-replay -- golden-self-test   # expect 0 STALE — every case recomputes its stored outcome from the stored verdict + carrier stamp
```

- **Set:** `scripts/leg-replay-lab/golden/golden-set.json` (cases + provenance + expected `{legOutcome, agentApproved, platformReason}`),
  today's texts pinned beside it (`golden-pin`, owner re-freeze only). **Code:** `scripts/leg-replay-lab/golden-set.ts` (header = the rules).
- **Per lab:** `experiment.json` carries `"goldenSet": {"version": "v2", "targets"?: [...], "optOut"?: [...]}` (each with a reason);
  `golden-build --experiment <lab>` → `<lab>/golden-v2/`; run it like any experiment (dry → `--fake-llm persisted` → `--spend`);
  `golden-score --run … --experiment <lab>/golden-v2`. Unreached cases cost $0 (today's production text).
- **Read:** leg outcome = agent verdict AND the carrier (run-level reasons carried, package-level recomputed by the shipping
  `heldEditVerdict`). FLIPPED = DO-NOT-SHIP unless a target; a masked flip TOWARD approval = DO-NOT-SHIP; toward refusal = read.
  NEEDS-READ (2026-11-08): a LIVE-Author refusal of an approve-expected case that points at a line the stored package lacks
  (`refusalPointsAtLiveOnly`) is never a pass. The golden result is NEEDS-READ (or DO-NOT-SHIP beside a real flip) until a hand read
  records FLIPPED / Author regression / legitimate refusal. A refusal at stored lines stays FLIPPED.
- **Not replayable yet:** Node C (GOLDEN-NODE-C-CELL) — named in `notReplayable`. **Value legs since v2 (2026-10-31):** `shape: 'value'`
  (derivation_architect persisted + derivation_reviewer, `heldJoinSeedByProtocol` null, persisted Author only — GOLDEN-VALUE-LIVE);
  proved at $0 on CANARY 1's value leg (`fidelity` 9 exact / 2 not checkable on both prompts, `--fake-llm persisted` reproduces).
- **Re-freeze (owner decision only):** hand-read each candidate leg → add the case + a `refreezes` entry (added, excluded-with-reason,
  pins moved) → `golden-pin` (read-only; only the new pins should move) → bump `version` → fixtures' `goldenSet.version` + test counts.
- **Canary after every agent-text deploy:** `.claude/knowledge/pipelines/LIVE-WINDOW-CHECKLIST.md` § "After an agent-text deploy".
- **v3 (2026-11-06, owner):** + NET-C126 (the 1.26.0 canary's held network leg, PERSISTED Author only — its live form duplicates NET-JP1)
  and NET-VALUE-C126 (free-address value leg); network pin 1.25.0 → 1.26.0 from the S-1 candidate file (no `golden-pin`: proved by
  `fidelity` 9/2 on both nodes, seed render at HEAD = `550fb2a0…`, template pins = the snapshot rows). **A text deploy leaves its golden
  pin stale** (nothing re-pins; `golden-build` refuses a lab on the new text until a re-freeze). **Golden Reviewer cells are not yet
  byte-production** (`frozen-cmp`, $0): held change cells send `rollbackContainment` `no-restore-blocks` where production showed
  `restore-is-held-base` (no `persistedEditApplication`; with it NET-C126 is byte-identical) — register GOLDEN-REVIEWER-BYTE-FIDELITY (a),
  still open. **(b) FIXED 2026-11-06:** an unplanted persisted value Architect carries its STORED `derivationContainment` (`persistedAuthorResult`,
  lab.ts; the replay cannot recompute it — `$queryRaw` outside the stub), so NET-VALUE-C1 / C126 Reviewer prompts = the frozen production
  rebuild (`frozen-cmp` ✅ both; every other cell's prompt byte-unchanged; mutation caught). Pinned in GS6 (`test:golden-set`).

## L-CS-N (Config sources, network step; $0 levers built 2026-11-04 on branch `cs-net-lab`; every expectation run before it was written)

```bash
grep -c "export function kindGateCheck" scripts/leg-replay-lab/kind-gate.ts                         # expect 1 — per-arm live-read kind gate (S3/F15): open arm refuses a planted block that does not resolve parsed
grep -c "liveReadKind?: 'open' | 'closed'" scripts/leg-replay-lab/lab.ts                           # expect 1 — the variant lever; run() groups samples by gate (module state)
grep -c "export function runReadOnlySqlLocal" scripts/leg-replay-lab/snapshot.ts                     # expect 1 — self-host snapshot source (snapshot --source local-db:<lab_db> --dump <file>; provenance stamped)
grep -c "export function selfHostProvenanceChecks" scripts/leg-replay-lab/self-host-provenance.ts   # expect 1 — provenance-check P0-P4 (install shas = lab pins, tiers, persisted verdict)
grep -c '"id": "NET-FWA3-EDGE"' scripts/leg-replay-lab/golden/standing-bench.json                   # expect 1 — the standing bench (owner G4-c), not golden
grep -c "if (standingSpendRefusal) throw" scripts/leg-replay-lab/lab.ts                              # expect 1 — a reaching lab without its standing node is refused at --spend
grep -c "export function buildRigPool" scripts/leg-replay-lab/network-fixtures.ts                     # expect 1 — PRE-redaction pool, rig per entry, identity + reversal + witness (cs-fixtures)
grep -c "N1_KIND_UNION_PIN" scripts/leg-replay-lab/score-n1.ts                                       # expect 1 — scorer kind union pinned to the shipping DeviceSourceKind
grep -c "export function withComputedLiveEvidence" scripts/leg-replay-lab/live-evidence-patch.ts     # expect 1 — L-CS-a (not-built while lib/agents/harness/live-evidence.ts is absent; never stubbed)
grep -c "persistedEditApplication?: boolean" scripts/leg-replay-lab/lab.ts                           # expect 1 — a persisted held Author's leaf nets read its stored editApplication (R-FWA3 Reviewer prompt byte = production)
grep -c "LCS[1-6] (" scripts/test-leg-replay-lab.ts                                                  # expect 6 — LCS1-LCS6, each mutation-checked RED by hand
```
- **A persisted held Author on a held arm rebuilt the Reviewer prompt from leaf stamps the lab recomputed WITHOUT the stored
  `editApplication`** — R-FWA3's prompt differed from production at line 199 (`rollbackContainment`). `persistedEditApplication` fixes it
  (opt-in; earlier experiments unmoved). Prove any persisted bench prompt by `cmp` against the frozen rebuild before spend.
- **The fact half's enrichment is version-keyed on `ctx.protocolInjection`; the lab's leaf nets pass none**, so on the merged 1a tree
  every arm would read NOT_STAMPED for the Author transcription (probe 2026-11-04) — pass the arm's composed protocolInjection (O-2(a)).
- Records: `cline_docs/reviews/config-sources-design-2026-11-04/LAB-PREREG-L-CS-N.md` (DRAFT; slots S-1 text, S-2 merged 1a tree).

### L-CS-N build 2 (2026-11-05, branch `cs-net-lab-2`; every expectation run before it was written)

```bash
grep -c "export function armProtocolInjection" scripts/leg-replay-lab/lab.ts                         # expect 1 — the arm's composed delta reaches the leaf/leg nets (liveEvidence population rule)
grep -c "protocolInjection?: unknown, opts: ReplayPrismaOptions = {}): Promise<NetRun>" scripts/leg-replay-lab/nets.ts   # expect 1 — runAuthorLeafNets takes it (+ `opts` legReads since VALUE-LEG-GIT d3c39d9e9)
grep -c "export function splitMultiGetterEntries" scripts/leg-replay-lab/network-fixtures.ts           # expect 1 — O-4: single-getter entries derived from a stored multi-getter read
grep -c "identity?: { to: string; from: string\[\] }" scripts/leg-replay-lab/network-fixtures.ts       # expect 1 — a second registration's id re-stamped (else capture: device-service-not-declared)
grep -c "export const SCOPE_DEFINITION" scripts/leg-replay-lab/score-csn.ts                          # expect 1 — F3: quoted verbatim from the candidate (csn-self-test --experiment proves it)
grep -c "cmd === 'frozen-cmp'" scripts/leg-replay-lab/lab.ts                                         # expect 1 — a base arm's Reviewer prompt = the frozen production rebuild
grep -cF 'sameAs ${rep}' scripts/leg-replay-lab/golden-set.ts                                     # expect 1 — identical-lever arms build golden cells once
grep -c "liveReadKind: (v as any).liveReadKind" scripts/leg-replay-lab/golden-set.ts                 # expect 1 — the companion carries the kind gate (+ composedVersion)
```
- **A golden companion must carry every lever that travels with the text** (the kind gate, the composed version) — the first build dropped
  them and the candidate golden cells would have run without the fact; and a model lever equal to production is still a lever (54 cells).
- **A persisted Author's leaf nets must read the snapshot that carries the computed Harvester stamp**, or its transcription reads
  `harvester-not-stamped` (the golden `r` cells did).
- **A pool assembled from two legs' records carries two registrations** — re-stamp to the replayed leg's, or the shipping capture refuses
  the second device by identity, not by the rule under test (found by a $0 capture probe).
- **Read the Reviewer's own brief before trusting a bench node**: R-FWA3's brief item 10 hands cross-switch collision to Node C — the
  measured R-FWA3-NB cell separates "brief" from "text".

## L-CS-N ADDENDUM (e) + Protocol 16 blind reads (2026-11-05; every expectation run before it was written)
```bash
grep -c "CONTRACT_TARGET = 'contract:interfaceContract'" scripts/leg-replay-lab/input-edits.ts       # expect 1 — an input edit can plant the stored interface contract (every copy, LCS11)
grep -c "await test('LCS11" scripts/test-leg-replay-lab.ts                                          # expect 1
grep -c -- "--mode must be fixture or contradiction" scripts/leg-replay-lab/second-read/prepare-second-read.sh   # expect 1 — blind-read prep, both modes
grep -c "Optional blind reads of composed prompts" .claude/knowledge/protocols/pre-registered-lab-gate-protocol.md   # expect 1
```
- **A consistent plant must re-check every citation the stored text makes against the NEW held bytes.** The Git-only plants kept a V2
  "copied exactly from H1" line that was true only of the device running-config. A blind fixture read found it; the real Reviewer did not.
- **Blind readers are stricter than the real Reviewer.** Use them for checkable findings (fixture defects, prompt contradictions), never as a
  verdict pre-screen (7/14 agreement, decisive cell the wrong way). No skill (owner 2026-11-05): a session runs it from Protocol 16 § "Optional blind reads" alone.

## L-VLG (VALUE-LEG-GIT, network-derivation 1.3.0; $0 build 2026-11-06; every expectation run before it was written)
```bash
grep -c "export interface ReplayPrismaOptions { legReads?: boolean }" scripts/leg-replay-lab/replay-prisma.ts   # expect 1 — opt-in leg-row reads (owning leg by stage, declaration columns, contract); default still throws
grep -c "export function withFirstExecutionSnapshot\|export async function withValueHarvest\|export async function valueArchitectContainment" scripts/leg-replay-lab/value-lane.ts   # expect 3 — L-VLG-a/b/c
grep -c "deviceSourcesSnapshot?: 'first-execution'" scripts/leg-replay-lab/lab.ts   # expect 1 — the node lever (+ valueHarvest)
grep -c "export const PLANT3" scripts/leg-replay-lab/value-lane-fixtures.ts         # expect 1 — the I3 plant (ceos1 Loopback15 10.99.0.3/32, 4 sites, reversal-proved)
grep -c "export const VLG_CELLS" scripts/leg-replay-lab/score-vlg.ts               # expect 1 — vlg-score / vlg-self-test (6 mutations, each RED)
grep -c "export function textReachProblems\|export function armReachSpec" scripts/leg-replay-lab/text-reach.ts   # expect 2 — TEXT REACH (NB1 blind-read defect, 2026-11-07): every run refuses a prompt that composes an edited text without the arm's candidate (or still carries the released template op)
grep -c "  await test('LVLG[1-9]\b\|  await test('LVLG1[01] " scripts/test-leg-replay-lab.ts   # expect 11 — LVLG9 text reach (refuses the defective NB1 dry run), LVLG10 change-lane git-only = production (44cf00704), LVLG11 a superseded render + a template-CONSTRAINT edit refused;
grep -c "export function snapshotWithSeedConstraints" scripts/leg-replay-lab/variant-binding.ts   # expect 1 — NB1 (G15): the `constraintsSeed` arm lever (a template-constraint edit; architectOnly cells); text reach checks each changed row LVLG5 standing-lock role (addendum c), LVLG6 the I3 standing case, LVLG7 golden-build carries reached standing nodes (B12), LVLG8 lane-aware live-evidence patch (B9)
grep -c "export function reviewerLeverKey\|export function reachingArmsWhy\|export function scoreStandingInRuns" scripts/leg-replay-lab/standing-bench.ts   # expect 3 — B12: same-Reviewer-lever coverage, the reach rule, golden-score reads carried STAND-* nodes (a miss = DO-NOT-SHIP)
grep -c 'const id = `STAND-' scripts/leg-replay-lab/golden-set.ts            # expect 1 — golden-build carries every reached standing case (B12), on a persisted cell of the case's own protocol
grep -c "export function laneOf" scripts/leg-replay-lab/live-evidence-patch.ts   # expect 1 — B9: the leg's contract key + lane options (pinned against the shipping enrichment, LVLG8)
grep -c '"id": "VLG-I3-GIT-ONLY"' scripts/leg-replay-lab/golden/standing-bench.json   # expect 1 — standing bench s2 (owner 2026-11-07): the PLANTED I3 case, reader derivation_reviewer
grep -c '"version": "s3"' scripts/leg-replay-lab/golden/standing-bench.json          # expect 1 — s3 (2026-11-08, owner 2026-11-07): + NET-APPLY-WHOLE-FILE
grep -c '"id": "NET-APPLY-WHOLE-FILE"' scripts/leg-replay-lab/golden/standing-bench.json   # expect 1 — RECORDED case, reader change_reviewer: canary B's released package loads ceos1's drifted Git file whole (stored approved 90)
grep -c '"id": "' scripts/leg-replay-lab/golden/standing-bench.json                   # expect 3 — the standing cases (LAB-USER-GUIDE § 6a lists each with why it exists)
grep -c "  await test('LSB3 " scripts/test-leg-replay-lab.ts                             # expect 1 — the new case's frozen record, lock proof on the NB1 experiment, gate both directions
grep -c "export function refusalPointsAtLiveOnly" scripts/leg-replay-lab/golden-set.ts  # expect 1 — golden NEEDS-READ (2026-11-08): a live-Author refusal pointing at content the stored package lacks; never a pass
grep -c "export function requiredCount" scripts/leg-replay-lab/score-vlg.ts             # expect 1 — vlg-score: a standing cell needs every sample (a miss is do-not-ship)
grep -c '^## Worked example 2: NB1' .claude/knowledge/pipelines/LAB-ANATOMY.md        # expect 1 — the multi-round worked example (owner yes 2026-11-08)
grep -c '^## When a lab fails in a way the text may not explain' .claude/knowledge/protocols/pre-registered-lab-gate-protocol.md   # expect 1 — Protocol 16 NB1 rules 1–5
grep -c "export function evaluateStandingGate\|export function plantedNodeProblems\|export function standingGateSelfTest" scripts/leg-replay-lab/standing-bench.ts   # expect 3 — approve-with-warning gate (devices NAMED, not lines), byte-identical planted inputs, both-direction gate self-test
```
- **A value leg needs its first-execution snapshot simulated** (`deviceSourcesSnapshot: "first-execution"`) or it stays off the
  Device-sources lane (G4-c) and every device fact reads NOT_STAMPED. The value-leg Harvester composes network-provisioning: the
  1.3.0 lever reaches it only through the Phase 0 brief (input edit).
- **GOLDEN-VALUE-LIVE is modelled**: the shipping containment net runs per Architect sample (L-VLG-c, LVLG2 both directions). It
  cannot see a free-address collision (F-2: a free /32 is its own member) — score freeness from the harvest block, never from the fact.
- `gitDeviceComparison` never names device-only lines (F-3), so a live-only allocation is visible only in the harvest itself.
- Record: `cline_docs/reviews/value-leg-git-2026-11-06/LAB-PREREG-VLG.md`.
- **Standing bench s2 (2026-11-07):** VLG-I3-GIT-ONLY is a PLANTED case: every lab whose lever reaches the derivation_reviewer
  (network-derivation edits, its template, or a Reviewer model/effort on a value node) declares a node with byte-identical inputs
  (`golden/standing/VLG-I3/*` + `cache/vlg/harvest-git-only.calls.json`) and the exact gate `approve-with-warning` / `git-file-only` /
  ceos1 + ceos2 / `devices-named`. **B12 (2026-11-07): golden-build now carries every reached standing case** as `STAND-<case>` on a persisted cell of the case's own
  protocol (one per Reviewer-side lever set); the lock counts a reaching arm covered when a node-carrying arm has byte-identical
  Reviewer-side levers, and a production-tier Reviewer model (infra, high — golden-build's default) is no standing lever.
  golden-score reads the carried nodes by their gate.
