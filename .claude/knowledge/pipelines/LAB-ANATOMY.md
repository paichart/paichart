# Lab Anatomy — how to build a leg replay lab, with L-K2 as the worked example

> **For the owner / a first read:** `LAB-USER-GUIDE.md` — what a lab tests, how to run and read one, what labs have caught (2026-10-22).
> **What this is**: the short, human-readable "how to build a lab" page (register LAB-ANATOMY-GUIDE, 2026-10-19). It names the
> steps in order and points at the canonical home of each. It does not restate them.
> **Owner**: `model-evaluation-specialist`. **When**: before you pre-register any lab (Protocol 16 decides WHETHER one is needed).
> **Canonical homes**: the rules are in Protocol 16 (`.claude/knowledge/protocols/pre-registered-lab-gate-protocol.md`); the
> mechanics are in `PIPELINE-RUN-FORENSICS-GUIDE.md` §7f; the reviewer bench is in `MODEL-ONBOARDING-PLAYBOOK.md` Phase 2b; the
> pre-spend checklist (items 1–15) is in `.claude/knowledge/discoveries/model-evaluation-discovery.md`; real costs are in
> `LAB-EXPERIMENT-LEDGER.md`. The CLI is documented in the header of `scripts/leg-replay-lab/lab.ts`.

**Worked example: L-K2** (held-k8s step 3, kubernetes-gitops 1.18.0 joins held bytes; ledger L17; 137 samples, $46.17, SHIP).
Records: `cline_docs/reviews/held-k8s-2026-10-18/LAB-PREREG-L-K2.md` (+ addenda a/b/c) and `LAB-RESULT-L-K2.md`.
Experiment: `scripts/leg-replay-lab/inputs/2026-10-19-held-k8s-l-k2/`.
**Second worked example: NB1** (multi-round: stops, text fixes, side labs, an override, gate re-registration). See § "Worked
example 2: NB1" below.

## The ten steps

### 1. Scope and size before you design (Protocol 16 "Before designing the arms")
Ask what the next LIVE run needs; lab exactly the edits on that path, in one lab with one decision rule. Size from the archive
first: choose targets and controls from stored runs, and take the "before" rate there, at $0.
*L-K2:* one lever, "the join" (the text plus the held template constraints plus the held store/view/edit step). Inputs were the
five admin legs of the step-2 shadow window, which already held a recorded capture of the config file.

### 2. Copy the closest past experiment; change ONE lever per arm
`cp -r scripts/leg-replay-lab/inputs/<closest> scripts/leg-replay-lab/inputs/<date>-<label>`, then edit `experiment.json`.
- `variants`: one arm per (role × lever).
- `nodes`: one per stored execution, each with `kind` + `expect`.
- `edits/`: the candidate text as exactly-once replace ops over the pinned production row.
- `plants/`, `node-inputs/`: the planted defects and brief edits.
- `protocols/`, `templates/`: written by `build-candidates`; never hand-edited.

The role not under test is held FIXED: a persisted or lab-sample Author for a Reviewer bench, and production models elsewhere.
*L-K2:* copied from L-K1/G3. Arms were role-prefixed:
- `hb` Author (Opus 5.5 high, `authorOnly`);
- `xhb` Architect (`architectOnly` nodes X-K1…4);
- `hk2` Harvester (`harvesterOnly`, recorded tools);
- `rhb` Reviewer (the fixed Author is a lab sample via `authorSourceByVariant: lab-sample:…`);
- each paired with its production base.
Every candidate arm carried `edits/k8s-1.18.0.json` + `heldJoinSeed`.

### 3. Spend only where a sample can change the verdict (Protocol 16, added 2026-10-19)
- A gate decided by CODE is proven by fixture (`--fake-llm fixture:<dir>`) or inherited, never sampled.
- A measured-only base arm is opt-in: otherwise cite the ledger or the persisted production output.
- Fix a predicted failure in the TEXT before paying to measure it (checklist 13).

*L-K2:*
- The sampled base Author arm (≈ $11) was dropped; the base reading is each window leg's persisted production Author (n=1).
- SG-DIFF was closed in the text before spend.
- The two code-property plant cells (NFKC, SECRET; $5.72) would be fixtures under today's rule.

### 4. Pre-register before any spend (Protocol 16 non-negotiables 1–3)
`experiment.json` `purpose` carries every gate and what a miss triggers: DO NOT SHIP, REVISE (rerun named cells), or MEASURED.
Write the long form in a `LAB-PREREG-<id>.md` in the review folder: question, lever, held-fixed, inputs, arms, cells, gates,
proofs, cost, commands.
- Read every plant against everything its reader holds, including the task brief and the reviewer's validation rules
  (checklist 7).
- Score role-prefixed arms (checklist 8).

*L-K2:*
- DO NOT SHIP: G-CANARY, G-VIEWRAW, G-AMBIG, G-FAILCLOSED, G-K-COLL, A-K-LIVEQUOTE.
- REVISE: G-APPLY ≥ 23/25, ARCH-QUOTE ≥ 18/20, SG-DOC/SG-DIFF thresholds, DRIFT-CAUSE ≥ 4/5, the Reviewer gates.

A rule found wrong after a run is corrected for the next run in a dated ADDENDUM. It is never reinterpreted.

### 5. Prove the bytes at $0 (non-negotiable 4; checklist 4, 10, 11, 15)
```bash
E=scripts/leg-replay-lab/inputs/<dir>
npm run lab:leg-replay -- build-candidates --experiment $E [--refresh-baseline]   # pin today's prod texts, render the arms
npm run lab:leg-replay -- run --experiment $E                                       # DRY: prompts + controls + estimate
npm run lab:leg-replay -- run --experiment $E --fake-llm persisted                  # the live path reproduces production
npm run lab:leg-replay -- run --experiment $E --fake-llm fixture:<dir>               # a novel output SHAPE through the real applier
npm run lab:leg-replay -- run --experiment $E --fake-llm transport                  # only if you will use --batch: the batch byte proof
```
**Is this a lab question at all?** A lab measures what AGENTS do with a text or model change. A change to platform CODE (a net, the
carrier, a parser, a renderer) gets its free proof elsewhere: `scripts/replay-nets-byte-identity.sh` replays every stored leg's facts at
two commits, read-only, $0 (owner execution-facts; method: `.claude/knowledge/patterns/byte-identity-refactor-pattern.md`). A parser or
applier change on recorded samples is a $0 re-apply (Protocol 16, "re-apply, not re-run"). Spend on a lab only for what neither answers.
The dry run must also show:
- the candidate text in every arm (count the arm folders carrying the new heading; checklist 11);
- each plant reaching its reader: "plant reaches the Reviewer prompt vs its unplanted twin ✓". A plant that does not is REFUSED.
  The VOID class cost $10.85 historically, and L-K2's NOWIT cell was one of them.

**Optional (owner-approved, plan usage):** a blind read of the composed prompts. Use `--mode fixture` on plant-built cells, or `--mode contradiction` after a change to what an agent reads. It warns and never counts: Protocol 16 § "Optional blind reads", `scripts/leg-replay-lab/second-read/`.

*L-K2:*
- the candidate sha re-pinned in addendum (b);
- 73/73 base prompts `cmp`-identical against the release worktree;
- the MIXED create shape proven 1/1 by fixture before sampling.

### 6. Estimate from the ledger and hand the owner the command (non-negotiable 8)
Price each cell at the ledger's REAL $/sample for that model + role, never the estimator (it undershoots long Opus packages).
Give the exact command with the number filled in, and a `--max-usd` cap. **The owner runs every paid invocation in their own
shell.**
*L-K2:* budget $85, spent $46.17.

### 7. Crib first, then the rest (checklist 14)
Split the costliest invocation into `--n 1`, then `--n 4`. Score the n=1 slice and stop on any systematic miss. The scorer
combines both runs, so a clean slice costs nothing extra.
```bash
npm run lab:leg-replay -- run --experiment $E --spend --variants hb --only A-K1,…,A-K5 --n 1 --max-usd <cap>   # crib
npm run lab:leg-replay -- run --experiment $E --spend --variants hb --only A-K1,…,A-K5 --n 4 --max-usd <cap>   # the rest
```
- Warm-first runs automatically: each cell's sample 1 writes the cache before its siblings.
- Curtail a "≥ k of n" revise cell once its outcome is fixed. Never curtail a 0-instance cell in the pass direction or a
  hand-read-at-bar cell (Protocol 16).
- `--batch` (50%) only after the owner has run the batch crib and ruled the tier valid.

*L-K2:* 1a ($3.41) + 1b ($11.21) = one n=5 invocation.

### 8. Score with the experiment's scorer (proxies flag; the hand read decides)
```bash
npm run lab:leg-replay -- k2-score --run <runDir>[,<runDir>…] --experiment $E   # writes k2-scores.{json,md} beside the first run
npm run lab:leg-replay -- k2-self-test                                          # the scorer both directions; each --mutate must FAIL it
```
- Build a new scorer as an ADDITIVE module over the last one, with a mutation-pinned self-test (`test:leg-replay-lab`).
- Cross-check the run's spend against Σ `sample.json` `costUsd` (the manifest prints a 🔴 SPEND MISMATCH if they differ).

*L-K2:* `score-k2.ts` over `score-edits.ts` (G1, unchanged) and `score-g3.ts`.

### 9. Hand-read every refusal on a planted or control node, and every proxy flag (non-negotiables 5–6; checklist 9)
Score the REASON (is the refusal FOR the plant?) and record the cited rule as a subcount. Write a hand-read override beside the
proxy, never in its place. Then refine the proxy and pin the case.

*L-K2:* the proxies missed three hand reads:

| Gate | Proxy | Hand read |
|---|---|---|
| COLLATERAL | 4/5 | 5/5 (one refusal cited the rendered `+2 −2`) |
| ARCH-QUOTE | 15/20 | 19/20 (a new PDB is not a quote) |
| DRIFT-CAUSE NOWIT | 0/5 | 4/5 (negations) |

All three refinements are now in `score-k2.ts` and equal the hand reads on the L-K2 runs.

### 10. Write the result, ledger the spend, then build (non-negotiable 9)
- Write `LAB-RESULT-<id>.md` against EVERY gate, with the true spend per invocation.
- Add a `LAB-EXPERIMENT-LEDGER.md` row (real cost, $/sample per model + role, verdict, reusable baselines) in the same commit.
- Add a register line.
- Fix and pin any lab or platform defect the run exposed before ship. L-K2 found four (heading rule, spend race, single-copy
  plant, scorer file); each is pinned (LK10, LK11, LL-29).

## Worked example 2: NB1, a multi-round lab (2026-11-06 → 2026-11-08)

**NB1** = network text batch 1: network-provisioning 1.27.0 + network-derivation 1.3.1 + derivation_architect guidance. Ledger
L95–L107, about 270 samples, $46.43, SHIP. Records: `cline_docs/reviews/value-leg-git-2026-11-06/LAB-PREREG-NB1.md` (addenda a–f),
`LAB-CRIB-NB1.md`, `LAB-RESULT-NB1.md`, `LAB-RESULT-NB1-JL3.md`, `LAB-RESULT-NB1-JP1.md`. L-K2 shows the ten steps once. NB1 shows
what happens when a step fails and the lab has to go round again.

**1. Stop → text fix → dated addendum → re-crib.** Each failure went through the same loop:
1. read it by hand;
2. fix the text (prompt-construction drafts, the owner decides);
3. write a dated ADDENDUM before any further spend;
4. re-pin and re-prove at $0;
5. re-crib every cell the fixed text reaches.

| Round | Failure | Fix | Addendum |
|---|---|---|---|
| crib (L95) | S1: H-BOTH read a Git-only device live | scope the narrow-read sentence to "that device" | (a) |
| re-crib, 2a-1 (L96–L97) | NC1: the Harvester restated a device-only value beside the Git file | reword the no-compare rule (option A) | (b) split 2a, (c) |
| re-crib 2 (L98) | NC1 again, 6/6 across two wordings | re-register NC1 (option B) | (d) |
| 2a (L99) | the R-GIT standing gate at 4/5: the label was folded mid-line; X-APPLY 3/5 | the label starts its own line; re-register X-APPLY (E2) | (e) |
| golden (L102) | NET-JL3 live arm masked flip toward approval | measure first (NB1-JL3), then the Reviewer's own blocking item | (f) |

**2. Measure the released text before fixing a golden flip.** Two golden flips each got a small side lab. Each ran the flipped case
at n=3 on the released or previous text and on the candidate, with the standing lock carried:
- **NB1-JL3** (L103, $5.70): the released 1.26.0 missed too (1/3), so the flip was the base rate, not a regression. The fix arm passed
  its gate, which included over-block controls.
- **NB1-JP1** (L107, $3.20): both texts approved 6/6, so the flip did not reproduce. A rig check then showed the refused placement was
  correct.

**3. An override sits BESIDE the gate.** When a miss is the known limitation (G13, NET-FWA3-EDGE) or a proven false refusal
(OVR-NB1-JP1), the owner overrides that one sample, for one ship decision, with a written reason and scope. The gate still reads
DO-NOT-SHIP as written in every run that carried it.

**4. Re-register a gate only before the next spend.** NC1 (D1–D2) and X-APPLY (E2) were rewritten as dated addenda before the next
run, and applied only to new samples. The samples already taken kept their registered reading: re-crib 2's H-BOTH stayed a miss under
the old rule and was not pooled.

## Where things go wrong (each one cost money once)

| Trap | Seen in | Guard now |
|---|---|---|
| A plant that never reached the served copy (VOID cell) | L-K2 NOWIT ($1.31) | every stored copy re-read (LK11) + twin check (LK12) |
| A plant read against the Author only, not the reader's brief | L-K1 bench ($2.80) | checklist 7 |
| A control that is not clean under the REVIEWER's own rules | G2 R-CLEAN-R2 | read the validation section before selection |
| Re-running to test a parser change | L12b ($13.16) | re-apply recorded samples (Protocol 16) |
| Concurrent spend counter undercounting | L12, L16, L-K2 3 | per-call meter + run-end mismatch check (LK10) |
| Scoring `--arm k1` instead of the role-prefixed arms | L-K1 | checklist 8 |
| A recorded count trusted after a prompt-moving change | G3 HB8 | run `test:leg-replay-lab` at the commit |
| A shared-protocol change reaches every cell that reads it: assuming "this sentence is only for the Reviewer" | NB1 (f): the Reviewer-only fix moved every h/x/a/r prompt | scope a re-run by `cmp` of the rendered prompts, never by intent; reuse only byte-identical cells ((e): 33/33, (f): 44/44) |
| A cap below the uncached bound | NB1 (e) step 1 ($4.70 cap, $4.75 uncached) | cap = max(estimate + 20%, the uncached bound), so poor caching cannot stop a run mid-cell |
| Budgeting a multi-round lab on the one-pass estimate | NB1: estimate $25.32 → actual $46.43 | expect about twice the one-pass estimate once a lab has a stop; say so in the pre-registration |
| A later failure the crib could not show | NB1: every stop-rule hit showed in an n=1 crib (S1 at L95; the NC1 miss at L96 and L98), but the R-GIT 4/5 and both golden flips showed only at n=4 or in golden | the crib catches large effects; rates and golden still need the full run |
| A background watch that never woke | NB1 re-crib 2 (a watch keyed on `summary.md`) | match every terminal state (manifest spend, sample count), or wait for the owner's ping |
| A proxy that mispaired or misread | NB1: the quote scorer paired ceos2's device block with ceos1's Git file ("edited 10"); vlg-score read an undeclared Git ref as a miss | proxies flag, hand reads decide; fix the scorer and pin it |
