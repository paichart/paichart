# The Lab — user guide (what it tests, how to run and read one, what it has caught)

> **Who this is for:** the owner, and anyone deciding whether a change ships.
> **Kept current by:** `model-evaluation-specialist`. **Written:** 2026-10-22, from the records, not from memory: the ledger
> (`LAB-EXPERIMENT-LEDGER.md`, rows L1–L30) and each lab's `LAB-PREREG-*` / `LAB-RESULT-*`.
> **Not this page:** the rules (Protocol 16, `.claude/knowledge/protocols/pre-registered-lab-gate-protocol.md`), how to *build* a lab
> (`LAB-ANATOMY.md`), the lab's internals (`PIPELINE-RUN-FORENSICS-GUIDE.md` §7f/§7g).

---

## 1. What a lab is, in one paragraph

A pipeline leg is four agents in a row: Harvester → Architect → Author → Reviewer. Each one reads a protocol text and a role prompt, and
runs on a model. **A lab re-runs real production legs with ONE thing changed**, usually the text an agent reads and sometimes the model
or effort. It runs each case several times and checks the outputs against rules written down before any money is spent. Everything
else is frozen exactly as production saw it: the task, the earlier agents' outputs, the tool results, the file bytes. So any difference
comes from the change. Nothing is applied anywhere; the lab only reads.

**Why it exists.** Before the lab, a text change shipped and the first evidence came from live runs, one leg at a time, mixed with
everything else that changed that week. The lab gives an answer before the push, at a known cost, and often finds the defect before it
reaches production.

## 2. When a lab is required

From Protocol 16: **a change to what a pipeline agent READS** (a protocol, role guidance, a template constraint), **or to WHICH MODEL /
EFFORT** reads it.

**Not a lab question.** A **code** change that should leave prompts or facts byte-identical gets a byte-identity replay: deterministic,
$0, over every stored leg (`scripts/replay-nets-byte-identity.sh`). One batch of work can need both.

| You are changing… | You need… | Cost |
|---|---|---|
| protocol / role / template text | a lab | paid (samples) |
| a role's model or effort | a lab (+ the model-onboarding playbook) | paid |
| platform code that must not move outputs | byte-identity replay | $0 |
| platform code whose output is deterministic for a given input (an applier, a parser, an arbitration order) | a **fixture** run in the lab (§4) | $0 |

**The golden set rides every agent-text or model lab (2026-10-31).** Besides the lab's own cells, 15 frozen real legs (v2; released
programs, passed windows, correct refusals and forced outcomes, all four domains plus one network value leg) must reproduce their stored outcome under every arm
that reaches them. One flip is do-not-ship unless the pre-registration names that case as the target. A paid run is refused until the
experiment declares `goldenSet`. Commands: `golden-build`, then `run` on `<lab>/golden-v2`, then `golden-score`
(`scripts/leg-replay-lab/golden-set.ts`). Typical extra cost: ≈ $0.35–1.50 batch for a one-domain change, ≈ $4.75 batch for a
shared-key Author + Reviewer change (§8).

**Owner exemption.** You may skip a lab and gate a change with a pre-registered live control instead. It is recorded in the series cut
(e.g. PLAN-SPAWN descriptor B; observability-config 1.9.0).

## 3. What a lab can and cannot test

**It can test agent BEHAVIOUR** — what a model does with a text, measured by sampling. For example:
- does the Harvester read only the file it is told to;
- does the Author edit the held file by reference instead of retyping it;
- does the Reviewer refuse a wrong edit and approve a correct one;
- does the Architect HALT on an out-of-scope difference.

**It also proves code-decided outcomes, for free**, by feeding the real code a hand-written answer (a *fixture*). For example:
- is an ambiguous edit refused;
- is a secret placeholder never copied;
- which correction pass runs when two faults coincide.

**It cannot test:**
- **the harness's own transcription** (what the coordinator writes into each child's brief). The lab stands in a brief edit; the live
  window checks it;
- **anything that needs the live rigs, real customers, or time-dependent behaviour.** The batch tier, for example, makes every time
  check read "ample";
- **production frequency.** A lab tells you what an agent does in a case, not how often the case occurs. MI-13 and the soaks do that.

## 4. Anatomy of a run (the words you will see)

| Term | Meaning |
|---|---|
| **node / cell** | one case: a real production execution plus (optionally) a brief edit or a planted defect, run n times |
| **arm** | one setting of the lever, named by role: `hb` (Author), `xhb` (Architect), `ht2` (Harvester), `rhb` (Reviewer) |
| **base reading** | what production did, read from the stored output at $0 (`--fake-llm persisted`); the "before" |
| **plant** | a deliberate defect: in a file the Harvester reads, in the Author's package a Reviewer judges, or in a brief |
| **fixture** | a hand-written agent answer run through the real code at $0, for code-decided outcomes |
| **gate** | a pass/fail rule written before spend; each says what a miss means: **DO NOT SHIP**, **revise and rerun the named cells**, or **measured** (recorded, not a decision) |
| **pre-registration** | `LAB-PREREG-<id>.md` + `experiment.json`: the question, cells, gates and costs, written BEFORE any spend |
| **addendum** | any change after pre-registration (a text re-pin, a rule correction, a harvest choice), written and dated BEFORE the next spend; a rule found wrong is fixed for the NEXT run, never reinterpreted to pass this one |
| **proxy** | the scorer's automatic reading; it only flags, and the **hand read** decides |
| **crib** | a small first paid run (`--n 1`), read against written stop rules before the rest is spent |
| **batch** | Anthropic's Message Batches tier, about 50% cheaper and slower; cleared for Author/Reviewer/Architect cells, never Harvesters, never time-budget cells |
| **re-assert** | at the commit that SHIPS, render the text and check its sha equals the one the lab measured; if not, the lab does not cover it |

**The shape of every run:**
1. **Design and pre-register at $0.**
   - Inputs come from real production legs.
   - Each plant is read against EVERYTHING its reader holds, including the brief.
   - The text under test is derived as exact edits of the production text and proven byte-identical to the build's render.
2. **Prove it at $0:**
   - a dry run (every prompt built, every plant shown to reach its reader);
   - the "before" run;
   - the fixture proofs;
   - the scorer's self-test, plus a check that it catches deliberate mistakes;
   - the scorer **calibrated on the before-run** (§7, item 9).
3. **You run the crib.** I read every sample against the stop rules.
4. **You run the rest.** I score it, hand-read every flag, and write the result against every gate.
5. **Ledger + register + result in one commit; re-assert at the shipped commit.**

## 5. Your part

**You approve every spend and run every paid command in your own shell** (`ANTHROPIC_API_KEY` set, repo root, nothing else running on
the tree). I give you the exact command with `--max-usd` filled in. Example (L-T2's crib):

```bash
E=scripts/leg-replay-lab/inputs/2026-10-21-held-terraform-l-t2
npm run lab:leg-replay -- run --experiment $E --spend --variants hb --only A-T3,A-T1-INFILE,A-T3-B15,A-T1,A-T-NOBASE --n 1 --batch --max-usd 3
```

- **What you see.** A preamble: the code commit, control checks (`✓`), plant checks, an estimate. Then `▶ spending…`, and per sample a
  `✅`/`⚠️` line with its cost and a running total. `📦 batch … submitted` means it is waiting on Anthropic.
- **"Is it still running?"** Batches take minutes to over half an hour, and each correction turn is another round. Leave the terminal
  open. I can check the run folder and the process for you at any time ("check").
- **`⚠️` is not failure.** It means "read this sample". For example: an expected refusal, a deliberately planted case, an `unheld` control.
- **`--max-usd` stops the run** before it spends past the cap. Every cap is set at or under the budget you approved.
- **You don't need to send output back.** I read the run folder directly; a paste just helps me know it has started.

**Your decisions in a lab** are always offered with a recommendation:
- text fixes found before spend (L-T1: three; L-T2: none needed);
- what to do when a stop rule fires (L-T1: twice);
- rule corrections for the next run (L-T1 ADDENDUM (d));
- accepting a measured miss (L-T1 OFFREF);
- design questions the lab surfaces but cannot settle (L-T2 F-T2-1, the correction-pass order).

## 6. Reading a result

Every `LAB-RESULT-<id>.md` opens with **the verdict**, then **one row per gate**, in four columns: rule · proxy · hand read · verdict.
When the proxy and the hand read differ, the hand read decides, and the row says why. Then come the findings, the scorer or lab defects
fixed, the spend, and what was carried to the live window.

**How to judge it:**
- **DO-NOT-SHIP gates are absolute.** One miss and that version does not ship. Examples: the Harvester reading a file it was not told
  to; an edit applied when it did not match exactly once.
- **Revise gates** carry a bar (usually ≥ 4 of 5). A miss means fix the text and rerun only the named cells.
- **"NOT MEASURED"** means too few valid samples. It is never read as a pass.
- **"Measured"** rows are information for you, not a decision.
- **A pass with an accepted miss** is legitimate when you accepted it, the reason is written, and the safety property held. L-T1: the
  Harvester still *tried* to read a named tag 15/15, but the platform's pin refused every try and no wrong file was ever read.

**Base vs candidate:** "no worse" gates compare the new text with production's stored behaviour on the same legs. A base that does
worse is good news, never a gate.

## 7. What the lab has caught, and how each was fixed

Each row: what happened, how it was found, the fix, the record. **Defects in the text under test:**

| # | Lab | What | Found by | Fix |
|---|---|---|---|---|
| 1 | Batch 2 (L8) | the reviewer-warnings text as drafted had four defects (P-CERT, label misses, untranscribed labels) | run 1 against pre-registered gates | v4 text; run 2 (L9) met every gate ⇒ shipped |
| 2 | Gap 3 (L4) | a proposed text "fix" made a CONTROL worse (C-1002 refused 0 → 3/5) | the controls in both directions | **refuted**; the text was never deployed |
| 3 | L-K1 (L16) | one sentence ("list a directory at most once … to find a file") read as permission: 5/5 listed the directory, one read a bait secret file | G-K1-PATH, do not ship | sentence replaced ("read each named path exactly once … read nothing in its place"); run 2 PATH 0 |
| 4 | L-T1 crib (L19) | "do not read **it**" read as "the ref", so the Harvester read `main` in place of a named tag (the wrong file) | crib stop rule S1 | "do not read that path at all — not at the named ref, and not at `main`" |
| 5 | L-T1 crib (L19) | the `merge()` sentence licensed calling every literal in a merge map "computed" | hand read | a literal key in a `merge()` map is still a declared attribute |
| 6 | L-T1 inv. 2 (L21) | 2/5 compared only the tags and never reported `force_destroy` (an out-of-scope difference could never HALT) | G-T-DIFF | "compare every attribute the file declares, not only the one the change touches" |
| 7 | L-T1 (L19–L23) | the Harvester still TRIED the named tag 15/15 over two texts, because the brief ordered it | G-T-REFUSED | owner-accepted (the pin is the control); the fix moved upstream to the harness, never copy a ref into a brief |
| 8 | L-T1 design | the Architect clause read literally switched off HALT for an out-of-scope difference (T-F2) | the design read, $0 | fixed before spend: "still classified by scope … out of scope ⇒ HALT" |
| 8a | L-OA (L55–L75) | a sanctioned literal `403` for the refused side was approved on the package's word by the Reviewer: Revision 2 2/4 refused, Revision 3 4/5, with the remap directive in plain view in the diff | R4 bench cell, DO NOT SHIP | owner dropped the literal (Revision 4: comparison only); Revision 4 passed every gate, 64/65, 0 false releases |
| 8b | L-OA design | a lab premise ("the Reviewer sees only the edited lines") was false: the held diff renders the whole file up to 200 lines. It cost one text revision | a $0 dry-run placement check (R4b before 1 / after 1) | rule: read the renderer before designing on what an agent sees |

**Defects in the platform found by a lab:**

| # | Lab | What | Fix |
|---|---|---|---|
| 9 | L1–L3 | the raw role template was sent twice in every engine run (~6K tokens per call) | fix A shipped (TEMPLATE-SENT-TWICE) |
| 10 | Batch 2 | two production parser faults, found by reading samples | fixed in the shipping parser |
| 11 | G1 (L12) | 0/6 held-edit corrections adopted: the parser rejected numbered machine headings | parser fix; rerun L12b 25/25 |
| 12 | L-T2 (fixture, $0) | **F-T2-1:** with both a hunk fault in a new file and a refused held edit, the ONE correction pass went to the hunk fix, so a package one correction from correct was forced needs-revision | owner chose (b): edit-correction first; built in `held-edit-step.ts` |
| 13 | L-T1 / L-T2 | every hub policy refusal reached the agent HTML-escaped (`&#039;`) | F-T1 widened, step 2 |
| 14 | L-N2 (fixture, $0) | **F-N2-1:** one unheld handle (an evidence-only device read, or a refused source) made EVERY network package with a Git file + device read `unheld` — nothing applied, the leg forced needs-revision on a correct package | the applier counts only the handles a package names; evidence-only reads get no handle (`c4de2831a`); found before any spend, it would have spoiled 13 of 19 Author samples |

**Defects in the lab itself (the measuring instrument):**
- **Invalid plant or control, wrong inputs.**
  - L-K1: the Reviewer bench's brief said "no baseline", so the "correct" package was refused correctly.
  - G2: a "clean" control was not clean under the Reviewer's own rules.
  - **Lesson: read every plant against every input its reader holds, the task brief included (LL-20).**
- **Undecidable plants.** "A tag in state, absent from `main.tf`" cannot be decided when the file uses `merge(…, local.x)`. Plant outside
  the merge instead.
- **A blind proxy.** L-T2's merge-attribution check read the real failure it was built to catch as a pass. Found by **calibrating on the
  "before" run** at $0, and fixed before spend.
- **The spend counter undercounted concurrent samples** (L12, L16 corrected). Now a per-call meter plus a run-end mismatch check.
- **A plant that never reached its reader** (L-K2 NOWIT, $1.31 wasted). Now every plant is proven in the dry run against an unplanted
  twin.
- **A scorer that couldn't see Git quotes** (L-T1): every Git-sourced quote read "not faithful". Fixed.
- **A recorded test count trusted after a text change** (G3 HB8). Now the lab suite runs at the commit.

## 8. Cost — and why it fell

| Lab | Samples | Cost | Notes |
|---|---|---|---|
| G1 (L12 + L12b) | 145 | $67.03 | the first held lab |
| L-K1 (L16) | 136 | $24.62 | two runs; run 1 stopped by one sentence |
| L-K2 (L17) | 137 | $46.17 | |
| L18 | 6 | $0.97 | the batch-tier crib: proved the cache survives between batches |
| L-T1 (L19–L25) | 84 | $15.53 | crib-first; two stops, both caught text defects before the full spend |
| **L-T2 (L26–L30)** | **54** | **$5.69** | every gate passed |
| L-N1 (L34–L46) | 90 | $18.95 | held-network step 2; five re-pins, each a text defect caught before the window |
| **L-NB1 (L47–L49)** | **25** | **$5.21** | network text batch 1; crib clean, every gate passed (est. $7.46) |
| L-NB2 (L50) | 11 | $1.77 | VOID by its own rule: the baseline did not reproduce the miss, so the candidate was never paid for |
| **L-N2 (L51–L54)** | **42** | **$9.01** | the network held join; F-N2-1 caught at $0 first; every gate passed, 19/19 Author outcomes correct (est. $10.7–13.6) |
| L-OA (L55–L75) | 174 valid samples over 3 revisions | $34.05 recorded (≈ $34.6–35.3 with an estimate) | obs sender-restriction admission check: Revision 2 $11.49 and Revision 3 $9.19 stopped on the R4 DO-NOT-SHIP cell; **Revision 4 $13.37, PASS** (cap $20) |

**The golden set's share of every text/model lab** (n = 1 per reached cell; ledger $/sample: Reviewer Sonnet 5 $0.054–0.118 batch,
$0.18–0.28 standard; Author Opus 5.5 $0.10–0.38 batch, $0.52–0.86 standard):

| Change | Golden cells | Batch | Standard |
|---|---|---|---|
| Reviewer text/model, one domain | 3–4 Reviewer | ≈ $0.35 | ≈ $1.10 |
| Value-leg text (network-derivation) or `derivation_reviewer` | 1 Reviewer | ≈ $0.10 | ≈ $0.30 |
| Shared Reviewer key (`change_reviewer` guidance) | 14 Reviewer | ≈ $1.30 | ≈ $4.00 |
| Protocol text, one domain (Author + Reviewer) | 3–4 Reviewer + 2–4 Author | ≈ $1.20–1.50 | ≈ $4.00–5.70 |
| Shared key, Author + Reviewer (e.g. a model change) | 15 Reviewer + 12 Author | ≈ $4.75 | ≈ $17.90 |

*(Golden v2, 2026-10-31: per-cell basis ≈ $0.09 / $0.28 per Reviewer cell and ≈ $0.28 / $1.14 per Author cell, batch / standard, from the v1 rows. A Reviewer model lever reaches the value leg too — shared `infra` tier — unless the lab opts it out with a reason.)*

**Why it fell (each from the lab-cost decisions, 2026-10-19):**
- code-decided outcomes by fixture, not by samples;
- no paid "base" arm: the stored production output is the base;
- warm-first, so sample 1 writes the cache for its siblings;
- batch for Author / Reviewer / Architect (L-T2's Authors cost $0.10–0.34 each against $0.56–0.86 at k8s);
- a crib first, so a defect costs ~$2, not the whole lab.

## 9. Where to look

| Need | File |
|---|---|
| the rules | Protocol 16 |
| how to build a lab | `LAB-ANATOMY.md` |
| every paid run, real cost, $/sample | `LAB-EXPERIMENT-LEDGER.md` |
| a lab's design / result | `cline_docs/reviews/<topic>/LAB-PREREG-<id>.md`, `LAB-RESULT-<id>.md` |
| the experiment | `scripts/leg-replay-lab/inputs/<date-label>/experiment.json` |
| a run's samples (production data, gitignored, never committed) | `scripts/leg-replay-lab/runs/<stamp>-<label>/` |
| the CLI | the header of `scripts/leg-replay-lab/lab.ts` |
| open lab work | the register (`MODEL-EVALUATION`, `L-T`, `LAB-` items) |

**Worked examples to read, in order:**
1. `LAB-RESULT-L-T2.md`: a clean pass, the current shape.
2. `LAB-RESULT-L-T1.md`: two stops, three text fixes, an accepted miss.
3. `LAB-RESULT-L-K1.md`: a do-not-ship found by reading.

## Carried from the join learnings ledgers (2026-10-31)

Source: the held-network ledger `cline_docs/reviews/held-network-2026-10-22/LEARNINGS-LEDGER.md` (LL-N) and the terraform ledger `cline_docs/reviews/held-terraform-2026-10-19/LEARNINGS-LEDGER.md` (LL-T). Each line is the learning in one sentence; the ledger row holds the evidence.

- **Run the $0 fixture path through the SHIPPING applier before any spend (LL-N-39).** L-N2's free run found F-N2-1, which every unit test had passed; the crib would have bought 13/19 known failures.
- **A lab only tests what its fixtures serve (LL-N-17).** L-NB1's device pool was post-redaction, so it never served a clear secret; live, 2 of 3 misses were exactly that. Build fixtures from PRE-redaction shapes, and read the stored record before theorising.
- **Fixture gaps look like model failures (LL-N-15).** 5 of 14 crib samples were unserved calls. Mark a sample invalid at the FIRST stub, and pin each fixture fix with a mutation.
- **Scorer faults are routine (LL-N-16).** Negations, table headers and hyphenated tokens were misread as claims. Hand-read every flag; fix the scorer with the exact sentence pinned.
- **A cell's brief can carry the behaviour the text should (LL-N-14).** Strip brief sentences that pre-order the expected answer, or the cell measures the brief.
- **The crib finds defects cheaply (LL-N-13).** Ten L-N1 revisions cost $18.95; three of the finds were platform or precondition, not text.
- **A refusal leg proves the reason, not the override (LL-N-42).** When agents refuse for the same cause, the platform records `forced: false`. To show the override direction, design a leg the agents would approve.
- **Spend runs in the owner's shell with the owner's key (LL-N-18).** The agent shell has none by design.
- **Every agent-text lab replays the golden set (Protocol 16, standing no-regression rule, 2026-10-31).**
