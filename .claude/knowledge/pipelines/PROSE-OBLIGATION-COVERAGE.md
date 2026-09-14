# Prose Obligation Coverage — which instructions actually bind, and what to do when one doesn't

**Created** 2026-09-14. Sibling of `CHECK-DESIGN-DISCIPLINE.md` (how the checks *we* write fail) and
`EVIDENCE-FLOW-DISCIPLINE.md` (how tiers judge each other). This one is about the third thing:
**an instruction we give a tier, and whether it changes what the tier does.**

## Why this exists

We instruct LLM tiers through four prose channels — seeded **protocols**, **role guidance** in the
template library, the **task objective**, and **`requirements.md`**. All four can be written
correctly, read plausibly, and change nothing. The failures are invisible by construction: a check
that did not run leaves no trace, and a run that succeeds anyway looks like the instruction worked.

The measured position, which is the whole argument of this file:

> **Two runs, two different prose failures, one mechanical guard that held both times.**
> (Runs 15 and 16, 2026-07; the guard was `prefix-not-minimal`.)

This file exists so the next instance is *recorded* rather than rediscovered. Minimality sat as a
single instance inside a 459-line follow-up for six weeks; the pattern only became visible when two
documents were cross-read. **Two instances of the same class is the threshold that earns a mechanical
leaf** — so a register that makes the second instance findable is the difference between a leaf being
earned and a defect recurring.

---

## 1. The five failure modes — and which instrument fixes each

Not every mode is fixable by mechanisation. **Getting this wrong costs a build**: the coordinator
proposed a net-shaped fix for a mode-1 failure on 2026-09-13, which the record had already shown was
the third iteration of a twice-failed prose instrument.

| # | mode | what it looks like | mechanisable? | the fix |
|---|---|---|---|---|
| 1 | **Never processed** | the instruction is simply not engaged | ✅ | mechanise |
| 2 | **Displaced / substituted** | the slot is filled by something else | ✅ | mechanise |
| 3 | **Unanswerable → invented** | the obligation demands something the domain cannot answer | ❌ | **rewrite the obligation** |
| 4 | **Correct by coincidence** | the outcome is right for reasons unrelated to the instruction | ✅ | mechanise |
| 5 | **Hand-carried** | binds while carried in a task objective, vanishes next round | ❌ | **promote into the protocol** |

Modes 1, 2 and 4 are mechanisable because a mechanical check **does not care whether any tier
performed the prose check**. Modes 3 and 5 are not: 3 is a defect in what we asked for, and 5 is a
defect in where we put it.

**Worked confirmation of the split** — both shipped, both correct for their mode:
- **Minimality** was mode 1/2 → fixed by a net (`prefix-not-minimal`). It held through two different
  prose failures.
- **D9's maintenance-window slot** was mode 3 → fixed by *prose only*: name the property, make the
  absence declarable. A net would have been useless, because the problem was that we were demanding
  something unanswerable. **44 of 49 packages had invented an answer.**

---

## 2. Coverage map — obligations against their mechanical counterpart

The point of this table is the **blanks**. On 2026-09-13 it took cross-reading two follow-ups to
discover that four of five numbered checks were already covered and exactly one was exposed.

### `requirements.md` Acceptance checks (terraform program)

| check | obligation | mechanical counterpart | state |
|---|---|---|---|
| 1 | policy value equals the chained aggregate VERBATIM | — | ❌ **EXPOSED** · leaf earned + specced + **FILED**, see below |
| | *(and `upstreamContainment.green` is NOT its counterpart — see §3, 2026-09-14)* | | |
| 2 | *(not audited — do not assume covered)* | ? | ⚠️ **UNKNOWN** |
| 2b | aggregate prefix equals the minimal cover of its members | `prefix-not-minimal` | ✅ covered |
| 3 | aggregate covers no existing allocation | `covered-not-member` | ✅ covered |
| 4 | chaining coverage | `chainedContext` conjuncts | ✅ covered |

⚠️ **Check 2 is marked UNKNOWN deliberately.** It was not audited, and an unaudited row must not be
scored as covered — that is the "silence reads as clean" failure this whole area keeps paying for.

**Check 1's leaf is FILED, not built** — earned under toolkit STEP 0 Path 2, specced, and deliberately
not built because it has nothing to see (3 of 13 comparable legs, zero mismatches across the archive,
no consumer, no terraform run since 2026-08-17). Build triggers are checkable and wired into the
quarterly health-run in `CLAUDE.md`, not left here. Full reasoning:
`cline_docs/reviews/family-b-minimality-residuals-2026-09-13/SPEC.md`.

### The nets themselves

**5 nets, 6 registrations, 2 stamp points** (`lib/agents/harness/mechanical-nets.ts`): 2 at
`leaf-persist`, 4 at `leg-synthesize`.

`markerPresence` · `rollbackContainment` (both points) · `derivationContainment` · `dialectLint` ·
`contractPropagation`

**The authoritative inventory of what each net does, its reasons and dispositions, is
`.claude/knowledge/domain/execution-facts/execution-facts-library.md`** — owned by
`execution-facts-specialist`. **Do not restate it here.** Two descriptions of the same nets is the
duplicate-family problem, and that library was itself found stale on 2026-09-14 (§5 said
`rollbackContainment` was "not built" when it had shipped and been live-accepted).

**Stamp point is a design constraint, not an implementation detail.** A `leaf-persist` net reaches the
leg Reviewer's §6 through the chainer; a `leg-synthesize` net cannot — it stamps after the Author and
the Reviewer are both done and informs Node C and the gate only. Choose the point before the extractor.

---

## 3. Instance register

**Record every observed instance.** Box 3 of toolkit STEP 0 Path 2 demands *"cite a run where a prose
check of that class was skipped — not 'could be': observed."* That evidence is what this table exists
to make findable.

| date | run / source | mode | obligation | what happened | outcome |
|---|---|---|---|---|---|
| 2026-07-29 | Run 15 | **2** displaced | `requirements.md` check 2b (minimality) | Node C renumbered a new T6.1 clause INTO slot 2b and performed that instead | **a non-minimal `/30` shipped** — authorising 4 addresses for 2 exporters; APPROVED, 0 blocking, past all five tiers |
| 2026-07-31 | Run 16 | **1** never processed | `requirements.md` check 2b | Node C never adopted the numbering at all; structured its review as its own sections 1–9 | minimality unverified. The derivation was correct — **for a reason unrelated to Node C** (mode 4 overlay) |
| 2026-09-09 | 3 self-host runs | **2** displaced | reviewer machine-block format judgement | reviewers vetoed on format the platform's own stamp contradicted | 3 format vetoes, all wrong |
| 2026-09-12 | D9 corpus, n=49 | **3** unanswerable | shared role-guidance "maintenance-window note" | 3 of 4 domains have no such concept; the slot demanded one anyway | **44 of 49** packages invented a meaning. Never blocked anything, never checkable |
| 2026-08-26 | IGP-T1 R11 | **5** hand-carried | interface contract delivered to a leg but not its children | 7 of 7 legs lossy, 0 of N children ever held it | reviewer asked to check transcription held only a paraphrase — an **unsatisfiable predicate** |
| 2026-09-14 | Terraform program UC1 | **2** displaced | leg literal-expected-output rule, terraform leg | step 2 (tflint) substituted "comparison to perform" prose. The author skipped the rule's FIRST remedy (*replace the command with one you can quote*) though it used exactly that technique — `-no-color` — one step later | **bound**: leg Reviewer blocked, Node C propagated. Right outcome; the remedy menu is what failed |
| 2026-09-14 | Terraform program UC1 | **2** displaced, **excused** | the SAME rule, network leg | V1–V9 also presence-assertions, not literals. Node C excused them as a *"protocol-sanctioned carve-out for unwitnessed device renderings"*. ⚠️ **CORRECTED 2026-09-14: the carve-out DOES exist** — clause (h) UNWITNESSED RENDERINGS, `seed-protocol-prompts.ts:2627`, network v1.9.0. My original "no such carve-out exists" was a NEGATIVE asserted from `cut -c1-200`-truncated grep output; the evidence was in my own results. The real defect is that (h) is defined in network only and no reviewer in any domain is told the shape exists | ⚠️ **same defect, opposite outcome, lenient side backed by an invented sanction.** Originated at leg tier (Reviewer approved 90/0-blocking), ratified by Node C. The dangerous direction of the 2026-08-29 decision, at program tier |
| 2026-09-14 | Terraform program UC1 | — **bound** | `requirements.md` check 1 (verbatim equality) | Node C performed check 1 explicitly, graded it VERIFIED-AGAINST-EVIDENCE, and retrieved the leg's `qualityGate` from platform metadata rather than package prose | authored `aws:SourceIp = ["10.99.0.6/31"]` == chained `derivedValues` verbatim. **Second correct performance** of the class that failed in runs 15/16 |
| 2026-09-14 | Terraform program UC1 | **evidence-flow** | Node C's reading of `upstreamContainment.green` | cited it as confirming "the cross-leg link clean". It transcribes only whether the UPSTREAM leg derived cleanly — it never compares consumed-to-chained | no cost (Node C re-derived the comparison itself and graded it separately), but the fact was credited with a property it does not have |
| 2026-09-11 | k8s 1.4.0 | **5** hand-carried | two Author obligations carried in the task objective | worked across three rounds while carried, then promoted into the protocol | promoted before it could vanish — the good outcome, recorded as the counter-example |

### How to add a row

Date · run or corpus · mode (1–5) · which obligation · what the tier actually did · what it cost.
**One line each.** If you cannot name the mode, that is itself worth recording — a failure that fits
none of the five means the taxonomy is incomplete.

---

## 4. The promotion rule

**Two observed instances of the same obligation class, where the obligation is load-bearing and
prose-only, satisfies toolkit STEP 0 Path 2.** At that point go to
`.claude/knowledge/pipelines/adding-a-net-toolkit.md` and work STEP 0 onward.

The rule is deliberately mechanical so that acting is not a judgement call. But three brakes apply,
each earned by a refusal:

1. **Modes 3 and 5 do not promote.** They are not mechanisable (§1). A net for a mode-3 failure would
   check an answer to a question the domain cannot ask.
2. **Corpus-measure before any panel.** The standing practice, stewarded by
   `execution-facts-specialist`. Three proposals have been refused by measurement this quarter —
   2026-08-19 (34 packages), 2026-08-31 (56), and 2026-09-14 (the check-1 leaf, filed at 3/13
   coverage with zero observed mismatches).
3. **Earned ≠ worth building.** A leaf can satisfy Path 2 completely and still be the wrong thing to
   build today. The question that settled the last one: *does it have anything to see?* A corpus
   accumulator that accumulates nothing generates no decision data — it generates a maintained file.

---

## 5. What lives elsewhere — pointers, not copies

| for | go to |
|---|---|
| what each net computes, its reasons and dispositions | `.claude/knowledge/domain/execution-facts/execution-facts-library.md` |
| how to build a net, STEP 0 through STEP 5 | `.claude/knowledge/pipelines/adding-a-net-toolkit.md` |
| how the checks WE write fail (incl. rule 1a/1b) | `.claude/knowledge/pipelines/CHECK-DESIGN-DISCIPLINE.md` |
| how tiers judge evidence they cannot see | `.claude/knowledge/pipelines/EVIDENCE-FLOW-DISCIPLINE.md` |
| Protocol 10 — fact vs verdict | `.claude/knowledge/protocols/signal-design-protocol.md` |
