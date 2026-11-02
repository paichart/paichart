# Facts Only Tighten — asymmetric authority between computed facts and agent verdicts

**Confidence**: 92% ✅ (production since 2026-07; every gate below is live and has fired in both directions)
**Category**: Architecture
**Added**: 2026-10-31 (pipeline-harness; owner-approved)
**Related**: Protocol 10 (signal design — facts vs verdicts) · `kept-file-edit-by-reference-pattern.md` (the heldEdit force) ·
ARCHITECTURE.md Invariant 6 · the 2026-08-29 verdict-consumption decision · tutorial `cline_docs/tutorials/policing-agentic-ai/`

---

## The pattern in one rule

**Anything the platform computes may turn an approval into a refusal. Nothing may turn a refusal into an approval — not a fact,
not a score, not a second agent.** An agent's verdict is transcribed exactly and is one input among several; the outcome is an
AND over facts *and* that verdict, so a single conjunct can only remove approval, never supply it.

## When to use

- A system lets agents (or any judgement source) propose outcomes, and you also have mechanical checks that can see things the
  agent can't — a containment recomputation, a byte comparison, an applied-edit receipt, a coverage count.
- You are tempted to let a reviewer's verdict "decide" because it is usually right, or to let a fact "rescue" an outcome an agent
  refused.

## The shape

```
outcome = AND( agent verdict == approved,          // transcribed, never rephrased or re-scored
               fact_1 holds, fact_2 holds, …,       // computed; each can only veto
               coverage complete )                   // every input actually delivered

platform overrides:   approved → needs-revision   ✅ allowed (a fact contradicts it; stamp WHY)
                      needs-revision → approved   ❌ never
confidence scores:    recorded as facts about the run, never a conjunct, at any tier
release:              a person, after reading — the AND is a precondition, not the decision
```

Three properties make it hold:
1. **Direction is structural, not a convention.** The override code path only has a write to the stricter value (e.g. the
   kept-file carrier forces `needs-revision` and records `heldEdit.reason` + `forced`; there is no branch that writes `approved`).
2. **The verdict is a fact about the agent, transcribed** (`reviewerVerdict`: approved/blocking parsed from a terminal block,
   null-on-miss). Transcribing it exactly keeps "what the agent said" checkable; rephrasing it would make the platform a second,
   unaccountable judge.
3. **The AND is recomputable by hand** from the stored record, so a person (or an auditor) can check the release without trusting
   the code that computed it.

## Evidence (why the asymmetry, not "trust the better source")

- **Symmetric consumption was measured and rejected** (2026-08-29). A quarter's mismatches between the stamped outcome and the
  reviewer verdict: the reviewer was right in 1 of 3. Letting the verdict decide would have **released two wrong legs to block
  one** — an over-wide range the reviewer approved at 92 (a containment fact caught it), and a leg scored 25 while "approved".
  Replacing a conjunction with one of its conjuncts can only lose information, and it loses toward approval.
- **A third case, 2026-09-20**: a reviewer saw an unrelated-pipeline import, described it, and approved at 92; the gate refused.
  Verdict-decides would have released it.
- **The force direction fires live** — the kept-file carrier forced a leg whose reviewer approved (golden case TF-TL4: agent
  approved, platform forced `source-not-pinned`); every forced leg since has been read and none was a wrong refusal.
- **Reviewers are reliable at recomputation, unreliable at judging evidence they can't see** (Invariant 6) — so the facts cover
  exactly the blind spots, and their veto is where the value is.

## How to apply it to a new gate

1. Write each new check as a **fact** with a disposition (`checked-clean`, `violation`, `NOT checked (reason)`); "not checked"
   never reads as passed.
2. Wire it as a **conjunct** (veto only). If it can only ever say "fine", it is not a gate — it is context.
3. Stamp the **reason** on every forced outcome, so a refusal is explainable from the record.
4. **Never** add a confidence threshold as a conjunct; never add a branch that upgrades an outcome.
5. Measure the veto rate before and after (series-cut ledger), and hand-read each forced outcome in the first window: a fact that
   vetoes correct work is a bug in the fact, fixed in the fact — never by adding an approve-path override.

## Anti-patterns

- **"The reviewer is usually right, let it decide"** — usually-right judgement replacing an AND loses toward approval.
- **Rescue overrides** — a fact that flips a refusal to approved ("the containment check passed, so ignore the reviewer").
- **Confidence as a bar** — a score becomes a verdict that nothing validated (Protocol 10).
- **Rephrasing the verdict** — the platform becomes a second judge whose words nobody can check against the agent's.
- **Silent veto** — forcing without a recorded reason; the refusal can't be read, so it can't be trusted or fixed.

## Known limits

- A wrong fact vetoes correct work (a false refusal). The defence is the replay-before-ship discipline and hand reads, not an
  override — see the 2026-10-31 quote-check replay (2 false positives caught before ship).
- The asymmetric *fail-closed veto* by a reviewer (`approved:false` vetoing an `approved` stamp) is itself a verdict and has
  NOT been earned; it is filed, not shipped (CLAUDE.md § harness Phase-2 verdict consumption).
