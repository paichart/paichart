# Pre-registered Lab Gate Protocol (Protocol 16)

> **New to labs?** Start with `.claude/knowledge/pipelines/LAB-USER-GUIDE.md` (what a lab tests, your part, how to read a result, a catalogue of what labs have caught). This protocol is the rules.

> **Purpose**: decide WHEN a change to what a pipeline agent reads, or to the model that reads it, must pass an
> offline lab run before it ships, and what that run may not skip. The HOW lives elsewhere and is not repeated here.
> **Owner**: pipeline-harness-specialist (coordination) · execution-facts-specialist (lab code, measures, replay).
> **Executor (2026-10-08)**: `model-evaluation-specialist` — experiment design, runs, reading, model evaluation.
> **Created**: 2026-10-08, from the 2026-10-07 runs (gap 1–3, the Opus Author, the template Directive) and
> WARNINGS-INVISIBLE batch 2 (two paid runs, `cline_docs/reviews/warnings-invisible-2026-10-08/LAB-RESULTS-B2.md`).
> **Instruments**: leg replay lab mechanics `pipelines/PIPELINE-RUN-FORENSICS-GUIDE.md` §7f · which replay §7g ·
> model changes `pipelines/MODEL-ONBOARDING-PLAYBOOK.md` · reviewer changes (the ground-truth bench) Phase 2b of
> the same playbook.
> **Companions**: Protocol 13 (a live defect starts here; this gates its text fix), Protocol 14 (panel and audit of
> the text BEFORE the lab), Protocol 15 (shape changes; its gate phase may use this lab), Protocol 10 (any new fact).

## When it applies

A lab gate is REQUIRED before push when the change alters what a pipeline agent reads or which model reads it:
- domain or program protocol text a leg role acts on;
- role guidance (`ROLE_GUIDANCE_LIBRARY`) or a template constraint;
- the model or effort of a role.

**Not required** (say so, with the reason, in the change record):
- render-only or platform code that leaves every prompt byte-identical. Prove that with a byte-identity replay
  instead (§7g) — e.g. 461/461 `report.md` unchanged;
- a wording change a panel judged mechanical (a typo, a renamed reference) where no instruction changes;
- a change the owner explicitly ships without a lab, recorded in the register with the reason.

### When the lab cannot replay the reader — owner exemption with a pre-registered LIVE CONTROL

The leg replay lab replays leg nodes. It cannot replay a **Program Architect** or a **program root** (PLAN-SPAWN, SYNTHESIZE). A
text change whose reader is one of those cannot be lab-gated. Used three times (descriptor B 2026-10-10; R2 read budget
2026-10-12; pov-program BRANCH D4 2026-10-12), the accepted path is:
- (1) **The owner exempts the change from the lab, explicitly, in the register** — with the reason "the lab cannot replay this reader".
- (2) **A live control replaces the lab, pre-registered BEFORE launch** in the change record: the run (prefer an existing
   published spec, unedited; stop at the plan gate when only the Architect is under test), PASS conditions, named STOP
   conditions, and every other outcome named with its action (e.g. "not exercised", "passed but blocked elsewhere").
- (3) **Every condition is decidable from stored facts by a stated proxy** (a stamped field, a tool-call offset, a string a
   `finalResponse` must contain). Where a hand read is unavoidable, name the reader and the rule. A condition that is a
   judgement is not a gate (containment review L7, 2026-10-12).
- (4) **Read the authoritative execution**, and say which series the control belongs to (its inputs changed at the deploy).

Trap from R2: a control can PASS while testing nothing — the spec chosen was large enough on paper, but the reader skipped
the only part past the old limit. Before launching, check the control actually exercises the change (here: a body, not a
section the reader is told to skip, past the old cap — and the size from `originalSize`, not an estimate).

### When the lab COULD run — owner exemption for speed and cost, with a live control (added 2026-10-13)

The owner may skip a lab the replay could run, trading it for time and cost. This is a decision, not a default, and is
recorded in the register with its reason. **Acceptable only when ALL hold:** today's failure rate is already high (the text
being replaced fails often); the change is text-only and reversible in minutes (reseed the prior protocol version); the
affected runs are few and watched; every failure is visible in a stamped fact or a named hand read. **Not acceptable for:**
shared role guidance used by several domains (e.g. `change_reviewer`, four domains); a REVIEWER change (counts on real legs
have no fixed instrument — use the bench); a domain that runs often. **Required before launch, in addition to (2)–(4) above:**
- **Test the control's instrument with a planted failure, both directions, at $0** — plant each failure the control must
  catch into stored data and confirm the proxy flags it, and confirm a compliant example passes. A control that cannot see
  the failure passes while the fix fails.
- **Write the rollback before launch:** what is reverted (e.g. reseed the prior version) and which stop condition triggers it.
- **A soak read with a date:** one run is one sample — score the next runs of that domain with the same instrument and read
  them on a stated date.
- Build the lab instrument anyway when it is $0, so a post-hoc lab can run if the live result is ambiguous.

Worked example: observability 1.9.0 (2026-10-13, `cline_docs/reviews/verbatim-quote-omission-2026-10-13/LIVE-CONTROL-RUN3.md`).
The planted check found the hole before launch: the stamped `quoteFidelity` reads a silent cut relabelled "excerpt" as complete,
so P1 would have passed while the fix failed; P1 moved to a strict scorer (register QUOTE-FIDELITY-EXCERPT-BLIND).

## Before designing the arms — scope and size (added 2026-10-13, owner: "yes")

- **Scope the lab by what the next live run needs, not edit by edit.** Ask: "what must hold for the next run to do what we
  want (e.g. release)?" Lab exactly the edits on that path. Edits that land in the SAME protocol version and the same run path
  go into ONE lab with ONE decision rule (all ship or none). Edits off that path wait for their own lab. A split ship decision
  is the owner's explicit call. Example: Phase 4 run 3 (2026-10-13) — the consumer address clause and the Harvester quoting
  rule (C1/C2) in one observability 1.9.0 lab; the k8s producer edit, off the release path, stayed deferred (DRAFT-C.md).
- **Size from the archive first; pay only for new samples.** Choose targets and controls from stored runs, take the
  "before" failure rate from the archive (e.g. 28 of 42, then 14 of 22, observability harvests from a stored-fact recompute,
  $0), and score every lab sample offline with the shipping checks. A replay of stored runs never REPLACES the lab — it
  rescores outputs; only a re-run shows what an agent writes under new text — but it decides where the paid samples go.

## Spend only where a sample can change the verdict (added 2026-10-19, register LAB-COST-REDUCTION)

Measured over L12–L17 ($162.02): ≈ 31% bought nothing a $0 method could not give (`cline_docs/reviews/lab-cost-reduction-2026-10-19/ANSWER.md`).
These rules sit beside the non-negotiables; none of them removes the candidate arm, the Reviewer bench, n on a DO-NOT-SHIP
gate, or the hand read.

- **A gate decided by code is proven by fixture, not sampled.** When the gate's outcome is fixed by deterministic code (the
  applier, R9, R10, the carrier: an NFKC-rewritten line, a secret placeholder, a non-unique SEARCH), prove it with hand-written
  packages through the shipping step (`--fake-llm fixture:<dir>`), both directions, at $0, and run the canary scan over every
  paid sample. Buy a model cell (n = 1) only when the candidate text changes the sentence the plant targets. A gate already
  proven by an earlier lab is INHERITED while its code is byte-unchanged (re-assert by its goldens and a $0 re-apply).
- **Re-apply, never re-run, a platform-reading change.** When the change is how the platform reads a reply (parser, applier,
  scorer) and every prompt is byte-identical, re-apply the recorded samples at $0. Re-run only cells whose correction-turn path
  the change reaches (L12b, $13.16, was such a re-run; L-K2 re-applied 133 samples instead).
- **Prove every plant reaches its reader before spend.** The dry run builds a planted arm's Reviewer prompt beside its
  UNPLANTED twin and refuses the run when the prompts are identical, a line the plant adds is absent, or a line it removes is
  still present (`plantPresence`, LAB-PLANT-PRESENCE-CHECK; raw tool-result plants are re-read in every stored copy, LK11). Lines
  that differ outside the plant are derived renders: read them. Checklist item 7 (read each plant against everything its reader
  holds, incl. the task brief) stays a written tick in the pre-registration.
- **Measured-only base arms are OPT-IN.** A base arm that gates nothing is not run by default. Cite the last `cmp`-proven base
  cell from the ledger, or the persisted production output of the base version, and say so. Run one only when the owner opts in
  at pre-registration for the contrast.
- **Curtail a "≥ k of n" cell once its outcome is fixed** (the rule as written, not a reinterpretation): stop when k passes are in,
  or when n − k + 1 misses are in. **Never** curtail a "0 instances" cell in the pass direction (G-CANARY must see every sample),
  and **never** a cell whose bar is decided by the hand read (curtail revise-level count cells only). Name each curtailed cell
  and its count in the result. The lab does not curtail automatically: split the invocation (`--n` slices, as the crib run does).
- **Warm first, then fan out** (automatic, `--no-warm-first` to disable): each cell's sample 1 writes the cache before its
  siblings start. Not model-visible; only start times move.
- **Batch transport (`--batch`, paid runs only):** Author / Reviewer / Architect calls go to the Message Batches API (50%).
  The request body is production's except `betas` + `fallbacks` (Opus) and a 1h cache TTL, proved by `--fake-llm transport`
  ($0) and named in the manifest. Named divergences: no server-side refusal fallback, the batch served tier, and a loop deadline
  that reads ample time (requirements_author nodes are refused). **Owner ruling 2026-10-19 (Steve): the batch tier IS a valid
  measurement tier for Author / Reviewer / Architect cells — EXCEPT any experiment whose question involves a time-budget behaviour
  (truncation retry, the held edit-correction time check, any correction or retry gated on time left): those run at the standard tier,
  because batch makes every time check read "ample".** Each pre-registration states the tier per cell and, when batch is used, why no
  gate depends on time. **Crib read 2026-10-20 (owner-run, $0.97): the cache survives BOTH between sibling samples' batches and between
  one agent's turns** — Reviewer cell $0.118/sample vs $0.280 standard (−58%), Author one sample $0.376 vs $0.522 (−28%, it pays its own
  cache write); outcomes unchanged (Reviewer 0/5 refused = production; held edit applied 1/1). **Batch is cleared for use.**

## The standing no-regression rule (added 2026-10-31, owner: "we cannot risk any regressions to delivering a successful run")

Runs release reliably now, so the default risk of any change is a REGRESSION rather than an unfixed defect. A lab only tests the cases its author picked, and nothing re-ran a known-good case after a deploy. This rule closes both gaps. It holds alongside the non-negotiables below and never replaces them.

1. **Size the gate by blast radius:**

   | Change | Must pass before push |
   |---|---|
   | Docs, ops alerts, test tooling: nothing an agent reads, no fact computation | the battery |
   | How a stored fact is computed (nets, stamps, renderers) | the nets replay, byte-identical (`scripts/replay-nets-byte-identity.sh --snapshot`); every moved fact explained |
   | Agent-facing text (protocol, role guidance, template constraint), or a role's model/effort | this protocol's lab **plus the golden set** (2) |
   | A SHARED role key: `change_reviewer` (four domains + Node C), `config_change_author` (four domains), or any role guidance every domain reads | the lab plus the golden set **from every domain the key ships to** |

2. **The golden set.** A frozen set of real legs whose outcomes are known correct is replayed in EVERY agent-text or model lab. It is fixed for all labs and never chosen per lab. It holds:
   - the legs of released programs;
   - legs from the passing live windows;
   - a few correct REFUSALS, so an over-permissive change is caught too.

   Each golden case must reproduce its outcome: approved stays approved, refused stays refused, a forced outcome stays forced. **One flip is a do-not-ship miss** unless the pre-registration names that case as the change's intended target. Owner: model-evaluation-specialist (register NO-REGRESSION-GOLDEN-SET). Add a case when a program releases or a window passes; remove one only by recorded owner decision.
   **Built 2026-10-31 (v1, 12 cases, all four domains); re-frozen v2 the same day by owner decision (15 cases: + CANARY 1's network value leg, terraform and observability legs — the set's `refreezes` record names each addition and what was left out):** `scripts/leg-replay-lab/golden/golden-set.json` + `golden-set.ts`. The lab declares `goldenSet` in `experiment.json` (a paid run is refused without it); `golden-build` carries its arms onto the golden cases as a companion experiment; `golden-score` reads each case as REPRODUCED or FLIPPED. Node C cannot be replayed yet (named in the set's `notReplayable`); a value leg (network-derivation) is replayed on its persisted derivation with the derivation_reviewer re-run (Reviewer cells only, since v2). **Re-frozen v3 on 2026-11-06 by owner decision (17 cases: + the network-provisioning 1.26.0 canary's change leg, persisted Author only, and its value leg; the network pin moved to 1.26.0).**
   **The golden set's twin, the STANDING BENCH:** real legs whose stored outcome was WRONG, so a lab must OVERTURN it, not reproduce it. Every lab whose lever reaches a case's reader carries it, with a do-not-ship gate and a spend lock (`golden/standing-bench.json`: NET-FWA3-EDGE, VLG-I3-GIT-ONLY, NET-APPLY-WHOLE-FILE since 2026-11-08). What it is, when it applies, and how to add a case: `LAB-USER-GUIDE.md` § 6a. A live-Author golden refusal that points at content the stored package lacks reads NEEDS-READ (2026-11-08): never a pass, decided by hand read (§ 6).
3. **One canary after every agent-text deploy.**
   - Re-run the latest released program from its published spec, on a fresh stage with the clearance metadata set (≈ $12).
   - It must come back `programReleasable: true`, and its legs must be hand-read, before the NEXT agent-text batch ships.
   - If it does not: roll back (newest first) and treat the cause as a finding before anything else ships.
   - Read it with `npm run report:canary -- --root <canary root> --expect <protocol>@<version> [--control <name>]` (read-only;
     VOID / PENDING / PASS / FAIL + each pre-registered control). A shipped change's live control is added to `scripts/canary-check.ts`
     CONTROLS before its deploy (first: `d2-contract-omission`, pov-program 2.2.1). The hand read still happens.
4. **Fewer, smaller text batches, filtered by the reliability bar.**
   - When a domain is at or above 90% correct outcomes with 0 false releases, a text change ships only for a false-release risk, or for a cheap fix that generalises.
   - Safe failures (false refusals, wording, tidiness) wait behind a measured trigger, or ride the next change that must touch the same text anyway.
   - A batch touching a shared key carries no unrelated items.

## When a text reaches its size ceiling (added 2026-11-07, owner: "yes, write it into Protocol 16")

**Why this exists.** VALUE-LEG-GIT G9 (2026-11-06): to fit program_architect's 21,500 ceiling, one sentence was compressed to
"a value leg's as `deviceSources["network-derivation"]` (none: its descriptor)". The Program Architect read the parenthetical as
content and wrote a prose note under the key, which the platform resolves as an `unparseable` declaration, live in production
until a canary caught it (LL-CS-31). The lab could not see it: the Architect is not lab-replayable, and the lab's cells only
exercised the branch the change was for.

**The procedure, in order:**
1. **Write the sentence at its natural length first, and render it.** Never draft to the budget: you cannot judge what a
   sentence instructs while you are squeezing it.
2. **Read why the ceiling exists before treating it as fixed.** Every ceiling's reason is in its `test:protocol-golden` message.
   If that reason still bites, the ceiling stands; if it no longer does, go to step 5.
3. **Make room by REMOVING, not compressing.** A liveness read of the same text (Protocol 12 R0 spirit): sentences now enforced
   by a platform fact (facts over prose), rules duplicated between the protocol and the role, stale caveats about retired
   behaviour. Each removal is itself a text change and goes into the same lab.
4. **Move content to its layer.** A rule that applies to one domain belongs in that domain's protocol, not a shared role (which
   reaches every domain that uses it — and makes the lab span them all).
5. **Otherwise raise the ceiling by owner decision:** a small, recorded step, with the reason written into the test message
   itself (e.g. "21,500 → 21,800 by owner 2026-11-06 for …").
6. **Never fold a condition into a parenthetical, abbreviation or symbol.** A condition, an "otherwise" or an exception stays a
   full clause.
7. **Every branch of a reworded rule gets its own pre-registered cell** — a lab cell, or a LIVE CONTROL where the reader cannot be
   replayed (§ "When the lab cannot replay the reader") — not only the branch the change was made for.
8. **Offer a blind contradiction read** (§ "Optional blind reads", $0) of the composed prompt after any compression or removal.

**Early warning (mechanical).** `test:protocol-golden` prints a `⚠ headroom` line (a warning, never a failure) when a budgeted
text is within 2% of its ceiling, so the pressure is visible a batch before it bites.

## When a lab fails in a way the text may not explain (added 2026-11-08, owner: "yes", from NB1)

**Why this exists.** NB1 (network text batch 1, ledger L95–L107) went through five rounds. Two of its failures were not the
candidate text's fault:
- a golden flip that the released text also produces (NB1-JL3);
- a refusal of a placement that a rig check proved correct (NB1-JP1).

A third was a model habit that two rewordings did not move (NC1). Fixing each one as a text defect would have spent rounds on the wrong
cause. Worked example: `LAB-ANATOMY.md` § "Worked example 2: NB1".

**The rules:**
1. **Before fixing a golden flip, measure the released text.**
   - Run the flipped case at n≥3 on the released (or previous) text and on the candidate, as its own pre-registered side lab with
     the standing lock carried.
   - Pre-register the readings: text effect, base rate, or not separated.
   - Only a text effect calls for a text fix. A base rate or a non-reproduction goes to the owner (an override beside the gate, or a
     re-freeze).
   - Worked: NB1-JL3, where the released 1.26.0 missed 1/3, so the flip was the base rate.
2. **A refusal that turns on device or tool semantics gets a rig check before it is called a defect.**
   - Examples: where a configuration line lands, what a command renders.
   - One owner-approved, read-only or aborted session on the rig settles what the lab cannot.
   - Worked: NB1-JP1. A top-level `network` entry landed under `address-family ipv4` on cEOS, so the refusal was an over-block.
3. **A model habit that beats two rewordings is measured, and its gate re-examined, before a third rewording.**
   - Read every miss for what the model is trying to do.
   - Ask whether the gate scores harm or only wording.
   - Re-register the gate by owner decision if it scores a safe, true behaviour.
   - Worked: NC1. 6/6 restatements of a true device-only value were re-registered as counted warnings (D1–D2).
4. **A gate is re-registered only before the next spend, never applied to samples already taken.**
   - Write a dated ADDENDUM before the next paid run.
   - Samples read under the old rule keep their registered reading and are not pooled under the new one (NB1 (d), (e)).
5. **Wording rules for a new blocking item** belong to prompt-construction's guidance, and that guidance is the home for them:
   - its trigger words must not collide with existing vocabulary ("HELD" vs held bytes);
   - an anchor sentence states only what is true.

## The non-negotiables

1. **Pre-register the rule in `experiment.json` before any spend.** For each node: the expected verdict. For the
   run: the gates, and what each miss triggers — *do not ship*, *revise and rerun named cells*, or *measured, not
   a stop*. Apply it as written, even when the result disappoints. A rule found wrong after the run is corrected
   for the NEXT run and recorded; it is never reinterpreted to pass this one.
2. **Score both directions.** Must-refuse and must-approve nodes in the same run, for every domain the text ships
   to. A fix that lowers refusals is only proven if the approved controls and the planted defects did not move.
   When the REVIEWER changes, use planted nodes with known answers (playbook Phase 2b); counts on real legs have
   no fixed instrument.
3. **Change one thing per arm.** Text or model, never both. Hold the other role fixed (`authorSource: 'persisted'`
   when the reviewer is under test).
4. **Prove the bytes before spending.** The candidate text appears verbatim in every rendered prompt; a reused
   baseline arm is `cmp`-identical to the run it came from; dry run and `--fake-llm persisted` green.
5. **Hand-read before believing a count.** Every refusal on a planted or control node, one approval per target
   cell, and a sample of label/warning texts. Proxies narrow the reading; they are not the score.
6. **Score the reason, not the wording.** A refusal counts when it is FOR the planted item, whichever rule it
   cites; record the citation as a subcount.
7. **Re-check every control on today's text** in the baseline arm. A control the current text already refuses
   measures nothing — drop it and say so.
8. **Spend is the owner's call.** Give the exact command, the estimate from the ledger's actual $/sample
   (`.claude/knowledge/pipelines/LAB-EXPERIMENT-LEDGER.md`; estimators undershoot longer models), and a `--max-usd` cap.
9. **Write the result against every gate** in the review folder, record it in the open register and a row in
   `LAB-EXPERIMENT-LEDGER.md` (same commit), and only then build. A parser or measure fault the run exposes is fixed and pinned before ship (batch 2 found two).

## Optional blind reads of composed prompts (added 2026-11-05, owner; a $0-proof aid, NOT a gate)

A blind reader is a Claude Code subagent (`sonnet`). It is given ONLY one frozen system + user prompt pair, copied to blind names, and
is told to open nothing else. **None of these uses is evidence that a text works.** Each one warns and never blocks. None of them
replaces a lab sample, and nothing they say about a verdict is ever counted.

**Calibration** (`cline_docs/reviews/config-sources-design-2026-11-04/PROXY-CALIBRATION.md`, LL-CS-18):
- Blind readers agreed with the real Reviewer on 7/14 L-CS-N verdicts.
- Every miss was STRICTER than the real Reviewer.
- On the decisive cell (R-FWA3, T+F) the blind reader refused 3/3 while the real model approved. A verdict pre-screen would have said
  the text worked when it did not.
- What they ARE good for is checkable findings.

**How a session runs it.** These steps work from this protocol alone.

To start one, a person or session says: **"Protocol 16 blind read — contradiction | fixture — on <run folder / cell / role>"**. A session
OFFERS it, it does not run it, after any change to what an agent reads (CLAUDE.md, Protocol 16 row).

1. **Have a $0 dry-run folder** of the experiment, from `npm run lab:leg-replay -- run --experiment <dir>`. It holds each cell's composed
   `<role>.system.md` + `<role>.user.md`.
2. **Copy to blind names and check for leaks ($0):**
   `scripts/leg-replay-lab/second-read/prepare-second-read.sh --mode fixture|contradiction --run <run folder> [--cells A,B] [--roles reviewer,author] --out <scratch dir>`.
   - It writes `blind/pN.{system,user}.md` (shuffled), `key.tsv` (kept outside `blind/`) and `briefs/pN.txt` (the mode's brief with the
     pair's paths filled in).
   - It FAILS LOUD on lab vocabulary in a copy: cell ids, the run label, must-block, crib, plant, golden, ADDENDUM, lab execution ids. On a
     failure, fix the leak; use `--accept '<regex>'` only for a token a human confirmed is production text.
3. **ASK the owner before spawning.** Say how many pairs × 2 readers, and that it uses Claude plan usage, not API credit. Wait for an
   explicit yes.
4. **Two blind runs per pair.** Spawn 2 `general-purpose` subagents with `model: sonnet`. Send each one `briefs/pN.txt` verbatim and
   nothing else: no cell name, no expected verdict, no repo context.
5. **String-test every finding yourself.** Using `key.tsv`, check that each quoted line occurs byte for byte in the source file, then
   check the claimed mismatch or clash against the bytes.
   - Confirmed or false alarm; nothing in between.
   - Ignore every verdict a reader gives.
6. **Report the confirmed findings,** each with its quotes and the string-test result.
   - `fixture`: fix the plant or input edit, re-run the $0 proofs, record it in the experiment's addendum.
   - `contradiction`: the finding is not acted on before the lab.
7. **Register.**
   - Each confirmed `contradiction` finding becomes an open-register row with an owner. A change to the text still needs the lab.
   - Every use gets a tally row in `cline_docs/reviews/config-sources-design-2026-11-04/PROXY-CALIBRATION.md`: confirmed findings and
     false alarms.

**Use 1 — fixture second read (mode `fixture`).**
- *When:* after a cell is built or edited by plant (S6 consistent-plant cells, input edits) and its $0 proofs pass, before its first paid
  run. Not for untouched stored cells.
- *Asks for:* byte-checkable self-disagreements only, with every line quoted verbatim, file and line number given. A finding is a line that does not match what it cites, a value stated two ways, or a referent that is absent. No verdict.
- *On a finding:* confirmed ⇒ fix the plant, re-run the $0 proofs, and record it in the addendum. Unconfirmed ⇒ log it as a false alarm.
- *Record:* it found the L-CS-N Git-plant V2 citation defect that the real Reviewer missed 2/2 (ADDENDUM (e) §e.3). That is 1 confirmed,
  0 false alarms.

**Use 2 — whole-prompt contradiction review (mode `contradiction`).**
- *When:* after any change to what an agent reads (protocol, role guidance, template constraint, brief shape). Run it on the composed
  prompts from a $0 dry run, before the lab.
- *Asks for:* contradictions, ambiguities, missing referents and buried rules, each with verbatim quotes and line numbers, ranked. No
  advice, no rewrites, at most 10 findings.
- *On a finding:* confirmed ⇒ the open register, with an owner. A confirmed clash says nothing about whether it changes the real model;
  that is the lab's job.
- *Record:* it found the known cross-layer clash (brief item 10 vs R1 v2) in 2/2 blind runs, plus 3 further confirmed clashes, for 1
  shared false alarm.

**Use 3 — HYPOTHESIS, tracked, not a rule: a wording-vs-compliance diagnostic for a text change that FAILED in the lab.**
- *What:* run the blind reader on the failing cell's candidate prompts.
  - If it also misses the rule, the wording may be unclear, and a rewording round may be worth paying for.
  - If it finds and applies the rule while the real model does not, the wording is already clear. More rewording is unlikely to help, so
    route the fix to a fact or a structural change ("mechanical beats prose").
- *Evidence:* one case. On L-CS-N R-FWA3/NB with T+F, the blind reader refused 5/5 while the real model approved 4/4. The owner chose a
  fact (option 1); it did NOT move the Reviewer either (L-CS-N ADDENDUM (f)), so the case is unconfirmed.
- *Tally:* tracked in PROXY-CALIBRATION.md as separate rows (case, proxy result, real result, route chosen, did the route work).
- *Promotion:* it becomes guidance only after at least 2 more confirming cases and no contradicting one. It is never evidence that a
  text works.

**Review:** after 5 uses of Use 1 or Use 2, keep or drop each one on its tally of confirmed findings against false alarms.

## Outcome

- All do-not-ship gates met, revise gates met ⇒ build, push, reseed, series cut (the series-cut ledger, `.claude/knowledge/pipelines/SERIES-CUT-LEDGER.md`).
- A revise gate missed ⇒ revise the text (drafter + independent audit), rerun the cells it names, or the whole
  arm when every cell's prompt changed.
- A do-not-ship gate missed ⇒ stop; return to the design.

## Worked example — WARNINGS-INVISIBLE batch 2 (2026-10-08)

- **Run 1:** 160 samples, $29.77. It passed the safety gates (a false restatement approved 0/5, a self-grade
  refused 5/5, no label under `Blocking issues`). It failed four gates, each traced to text: a self-contradicting
  clause; labels on protocol-required sections; labels lost to their form; a catch-all id. Two rule-spec defects
  and one stale control were found and corrected for run 2.
- **Fixes:** five text fixes drafted, independently audited (one HIGH found: label text that would have put a false
  sentence in a customer report), folded.
- **Run 2:** batch-2 arm only, 75 samples, $14.06. Rule re-registered from the audit before spend. Every gate
  met (the unproven certification went from 2/5 approved to 0/5; labels on description prose went from 9/10 to
  0/10). Three measured targets missed and were sent to a later text batch, as pre-registered.
- **Platform defects found by reading samples, not by gates:** two. A label form the parser dropped, and an empty
  `## VERDICT:` line that made the production verdict parser return null. Both were fixed with mutation-proven
  tests and a 0-change corpus check.
