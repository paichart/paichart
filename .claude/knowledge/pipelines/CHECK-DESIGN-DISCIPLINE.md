# Check-Design Discipline — how our own checks fail, and what shape a good one has

> **Created**: 2026-09-12, distilled from one long session (the mechanical-net registry arc, two
> protocol bumps, a program run, and ten wrong checks).
> **Sibling to**: `EVIDENCE-FLOW-DISCIPLINE.md`. That document is about **LLM tiers judging each
> other**. This one is about **the checks WE write** — CI gates, protocol clauses, mechanical facts,
> equivalence gates, audit scripts, git habits. Different subject, same epistemics.
> **Owner**: pipeline-harness-specialist, with `execution-facts-specialist` for the fact-production half.
> **Register**: INTERNAL. Customer-facing counterpart: `~/paichart/verification/OVERVIEW.md`.

## Why this exists

On 2026-09-12 the checking tools were wrong **ten times**. The things they were checking were wrong
about four. Every single one of the ten was caught by RUNNING something — never by reading it.

A wrong check is worse than a missing one, because it answers confidently. That is the whole subject.

## 1. A rule is usually a PROXY for a property. Verify the property.

Four instances in one day, two of them mine:

| The rule | The property it stood for | How the gap showed |
|---|---|---|
| "every stage-children `findMany` carries `take: 50`" | bound a read you SEARCH; never cap one you AGGREGATE | a cap on an aggregate returns a *different answer*, not a truncated one |
| "lib pino adoption ≥ 40%" | of the files that LOG, how many use pino | 229 non-logging files sat in the denominator; three correct pure modules failed the build |
| "wait until the program run is terminal" | do not change protocol text a PENDING execution will read | the gate was deliberately BLOCKED — never terminal — so the rule was **unsatisfiable** |
| "stage by explicit path, never `git add -A`" | commit only what you intend | `git commit` commits the INDEX; a teammate's prior `add -A` rides along regardless |

**Test**: state the rule, then ask *what would have to be true for this rule to be satisfied and the
thing still be wrong?* If you can answer, you are holding a proxy. Verify the property instead —
usually it is directly checkable and the proxy was never necessary.

### 1a. The sharpest form: a SYMPTOM shared by the right answer and the wrong one cannot be the test

Earned 2026-09-12, and the author of the defect diagnosed it better than the reviewer did. A clause was
drafted to gate *"a stated blast radius NARROWER than the selector allows"* — the observable that the
defective package exhibited. But the CORRECT package exhibits it too: a selector reaching every pod in
a namespace, with a harvested census showing the namespace holds two, legitimately states a reach of
two. Testing on the symptom gates both.

> *"I had written the symptom as the test. The symptom is shared by the correct answer and the
> fabricated one, so testing on it gates both. The discriminator was never the narrowing — it is
> whether the evidence accounting for it is present. I reached for the observable rather than the
> property."*

**The discriminator test**: before writing a check, describe the CORRECT artifact that would trip it.
If you can describe one, you are testing a symptom. Ask what distinguishes the two cases — that is the
property, and it is usually shorter than the rule you were about to write. Here both failure directions
(silence, and a confident unevidenced number) collapse into ONE requirement: *the harvested extension
must be present.* A single property also cannot be discharged by pattern-matching one of two listed
cases.

This is the same failure as a mechanical net with no notion of leg intent confidently blocking a clean
removal package — one layer up, in prose.

## 2. Convert an ABSENCE into a DECLARED, NAMED state

An absence and an oversight are indistinguishable. A declared not-applicable can be judged.

| Before | After | Why it matters |
|---|---|---|
| a net silently produced no stamp on an out-of-scope lane | `lane-not-supported` + the lane | "adding a restore block would get this adjudicated" was a FALSE implication of the old reason |
| a specimen set silently covered no arm | `ARM NOT EXERCISED`, printed and counted | a net can be fully in-window with an arm no specimen has taken |
| a topology with no `links` failed a mandatory check | `linksNotApplicable` + a stated reason the reader must EVALUATE | the only alternative was fabricating network structure |
| non-logging files counted as non-adopters | `excluded (log nothing — nothing to adopt)` | the number finally measured what its name claimed |

The form that cannot be gamed: a declared reason is a **visible lie** if false, whereas invented data
is invisible. Prefer "declare and justify" over both "require always" and "make optional".

## 3. ENUMERATION vs PROPERTY — and let the corpus decide which

A list cannot anticipate its next member. A property survives novel members but is vaguer and easier
to satisfy hollowly. **Both failure modes are real, so measure before choosing.**

On one day, the same corpus went both ways:
- **Refused** a broad property rewrite of the constraint-evidence clause: 1 FAIL in 45 packages, and
  the failing package had satisfied the enumeration *completely* — restating four listed kinds plus a
  fifth the clause never lists. The enumeration was not the defect.
- **Earned** a narrow property (for any object whose selector matches a SET rather than a named object,
  quote the harvested extension of that set), because the marginal case was an **evidence REGRESSION**:
  a revision silently dropped a census its predecessor had volunteered, and was approved at 90.

**The rule that falls out**: a regression is invisible to any check that compares an artifact against a
list it still satisfies. If the failure you are fixing is *something that used to be there and stopped
being there*, only a property-shaped obligation catches it.

## 4. Coincidental agreement is NOT coverage

An equivalence gate reported 3 uncovered pairs. Applying *"its answer happens to agree" is not "it was
produced by this code"* took that to **12** — and the increase was the correct number. Two things had
been counted as coverage that were not: a comparison with a field subtracted (still measured against a
baseline from different code), and a match produced by a no-op path.

Corollary: **a gate that has been taught which differences are acceptable has stopped being a gate.**
No expected-diff list. Every mismatch triaged.

## 5. Mutation-verify the checker, not just the code

A window mechanism that suppresses phantoms is indistinguishable from one that suppresses findings
until you try it. The minimum pair: falsely declare a withheld case covered (must FAIL), and delete a
declaration (must THROW). Two assertions written the same day *passed under the exact mutations they
existed to catch* — a bare `/rollback/i` match that unrelated prose satisfied, and a substring check
that survived a subset-pick.

## 6. What actually moves the pass rate — and why two of the three levers cannot be pushed

Measured 2026-09-12 on gated PIPELINE roots: **60% approved all-time** (109/181), **64% in the last 30
days** (51/80); escalations 11% → 7.5%.

| Lever | Constraint | Pushable? |
|---|---|---|
| **Mechanical facts that stop WRONG refusals** — the strongest (`rollbackContainment` killed a three-instance class) | Path-3 earn-it: ≥2 live occurrences of a judgement made by a party structurally blind to the evidence, PLUS a corpus bounding false positives | **No — reactive by design.** You cannot pre-build one |
| **Protocol clauses that state an obligation before a reviewer discovers it** | the corpus decides the scope, and it is consistently narrower than intuition wants | Partly — but each clause buys a narrow band, and the tail of novel object classes is unbounded |
| **Input quality** (a defective `topology.json` blocked a program run; FW-A3.1's phantom zone parked a whole round) | **currently unmeasured — there is no metric for "runs blocked by a defective input artifact"** | **Yes — and it is the only one** |

⚠️ **Do not target a high approval rate directly.** The likeliest cause of a jump to 90% is not better
authors but softer reviewers, and that failure is documented: byte-identical inputs scored 45 and 92;
across three verdict mismatches the reviewer was right in **one**. Some refusals are the product working.

**Track refusal CORRECTNESS instead**: of the packages we refused, how many were later shown correct?
That number was three this quarter (the provenance family, all now fixed mechanically). Driving it to
zero is worth more than driving approvals to 90%.

## Noted, not built — nothing lints seeded protocol markdown

A collapsed clause briefly left a stray bolded semicolon (`**;**`) in a protocol body. **No suite would
have caught it** — the pinned suites check versions, markers, clause counts and public parity, none of
them markdown well-formedness — and seeded bodies render verbatim into the public mirror, so the defect
would have shipped to customers looking like a typo in a contract. Caught by reading.

One instance, so: recorded, not built. A balance check on emphasis markers per seeded body is trivial
if a second instance appears. **Trigger**: the next malformed-markdown escape into `~/paichart/protocols/`.

## Named candidate, NOT built — artifact pre-flight lint

Two instances of one class: an input artifact claims something the world does not contain, and it is
discovered only after an Architect execution plus an operator ruling.
- 2026-09-12: `topology.json` with no `links` — blocked at confidence 25, cost one execution and a ruling.
- FW-A3.1: an untrust zone mapped to a nonexistent port — parked an entire round (VT-18).

A pre-launch lint over `topology.json` + `requirements.md` would catch the schema half in seconds. The
bindable-targets half needs live state and is harder. **Trigger**: a third instance, or the first
session where a program launch is blocked by an artifact defect that a schema check would have caught.
Corpus-measure first, per the standing rule — count how many archived program launches were blocked by
artifact defects before building anything.
