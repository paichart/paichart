# Pre-registered Lab Gate Protocol (Protocol 16)

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

## Outcome

- All do-not-ship gates met, revise gates met ⇒ build, push, reseed, series cut (CLAUDE.md).
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
