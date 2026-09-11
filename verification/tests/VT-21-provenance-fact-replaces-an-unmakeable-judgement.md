# VT-21 — a judgement a tier structurally cannot make is replaced by a FACT delivered where the judgement happens; and the fact is scoped so it cannot become a rubber stamp

**Status**: VERIFIED 2026-09-11 (live, one round, passing direction) | Re-verify trigger: any widening
of the `rollbackContainment` §6 render lane beyond `observability-config`; a change to the fact's
exclusion classes; `observability-config` protocol bump past v1.0.3; or the first observed
provenance-shaped refusal on a leg that *held* the fact.
**Layer**: platform (with a pipeline-tier round as the specimen)
**Round type**: failure-injection (unplanned — three live rounds produced the defect) + functional acceptance

**Dates:** 2026-08-31 (first forensic reversal) · 2026-09-10 (occurrences 2 and 3, same day) ·
2026-09-11 (build + acceptance round). **POV:** Autonomous Delivery Use Cases, phases *OSPF to ISIS
Migration* and *Observability Config Change*. Related: VT-19 (the R19 round whose refusal is specimen 1),
VT-20 (the sibling lesson — *mechanical beats prose* is a tendency, not a law).

## Objective

Three claims, one arc:

1. **A tier asked to judge something it structurally cannot see will refuse confidently and wrongly.**
   Specifically: a change package's rollback is required to quote pre-change state *verbatim from the
   harvest*, and the reviewer is given the package but never the raw harvest. "Is this quotation
   genuine?" is therefore unanswerable from where the judgement is made — and the reviewers said so in
   their own verdicts, then asserted the conclusion anyway.
2. **Prose cannot fix that class; a fact delivered into the judging tier's context can.** The *delivery
   point* is part of the claim: a fact stamped where the judgement has already happened is worth nothing.
3. **The fact must be scoped so that a green result approves nothing.** It answers exactly one question,
   and every other question a reviewer was already responsible for must stay its own.

Explicitly ruled out as wrong behaviours: a reviewer citing the fact as evidence the *package* is
complete; the fact silencing a refusal that was legitimately about missing evidence; and the fact
blocking anything mechanically on a corpus whose measured base rate of the defect it superficially
resembles is **zero**.

## Method

1. **Three refusals, each tested by hand before being believed.** On every provenance-shaped refusal the
   first action was a string test — is each disputed line present in that leg's own harvest artifact? —
   *before* any theorising about model behaviour.
2. **A prose remedy was tried first, and measured.** After specimen 2, the protocol's Architect
   carry-forward obligation was tightened (witnessed excerpts travel verbatim with provenance labels,
   `observability-config` v1.0.2) and the objective re-run. This is the A/B datum for "can prose alone
   close it?"
3. **Corpus measurement before building anything.** The violation class the fact superficially targets
   (fabricated rollbacks) was measured across the full archived corpus first — the standing rule in this
   project after two earlier proposals were reversed by exactly this step.
4. **The fact was stamped at the AUTHOR leaf's terminal persist, not at the leg's synthesis**, because a
   synthesis-time stamp lands *after* that leg's reviewer has run — reproducing the same blindness one
   layer up — and then **hoisted, never recomputed**, so gate and reviewer cannot see different numbers.
5. **Delivery**: the fact is carried into the next child's Pipeline Context by the context chainer, and
   rendered with mandated framing. The render lane is deliberately scoped to one domain (see *What is
   not claimed*).
6. **Acceptance**: the parked round was re-run unchanged in objective, and the three observables below
   read off the persisted artifacts — not off the reviewer's prose.

## Config

- Protocols: `observability-config` **v1.0.2** at round time (v1.0.3 followed, adding the chosen-value
  rationale clause); `pipeline-orchestrator` base v3.14.0. Both published verbatim under
  [`protocols/`](../../protocols/) and byte-parity-checked against the platform seed.
- Role guidance: `change_reviewer` (a key shared by four domains) reseeded on production immediately
  before the round with one added rule — *a provenance claim you cannot check against the source is an
  UNVERIFIABLE SUSPICION, never a proven fabrication; where your context carries the platform's
  provenance fact, read it rather than inferring from prose.*
- Environment: a live Prometheus + Grafana + OpenTelemetry stack, harvested read-only through a
  descriptor-provisioned service ([`descriptors/observability-readonly-descriptor.json`](../../descriptors/observability-readonly-descriptor.json)).
- Deliverable: [`examples/observability-config-change-report.md`](../../examples/observability-config-change-report.md)
  — the round's package, harvest and applied-state addendum.
- Fixtures: five live packages, both directions (unmutated → expected counts; mutated → exactly one
  missing line), including one deliberate **non-suppression** fixture (below).

## Expected observables

Stated before the acceptance round:

| # | Observable | Where read |
|---|---|---|
| 1 | The Author's `result.json` carries `rollbackContainment` with `checked:true`, all restore-form lines found, `missing: []`, disposition `benign`, and `harvestSource` = **the harvest child of the same leg** | the Author child's artifact |
| 2 | The Reviewer's `inputContext.chainedFrom[]` carries the **same** fact, byte-identical | the Reviewer task row |
| 3 | The terminal `## VERDICT:` block carries `approved: true`, `blocking: []`, and **no provenance-shaped blocking issue** | the Reviewer's `result.json` |

Failure of any one is a failed round. "The reviewer sounded satisfied" is not an observable.

## Results

### The three refusals — all three packages were correct

| # | Round | What the reviewer blocked on | String test |
|---|---|---|---|
| 1 | 2026-08-19/31, network (IS-IS migration, leg P4) | interface `description` lines judged "anachronistic for a genuine OSPF-era device" — asserted as proven | **All 51 restore lines, including all six disputed descriptions, present verbatim in that leg's own harvest.** They trace to the rig's startup configs |
| 2 | 2026-09-10, observability (rules leg) | a `rule_files` value called "a restated fact, not a verbatim quote" | **Byte-equal** to the harvester's witnessed rendering, carried forward as a labelled Key Fact |
| 3 | 2026-09-10, observability (collector leg) | demanded per-section provenance verifiability of a whole-file rollback | **Line-identical to the as-deployed file** |

Specimen 1's reviewer wrote, in the same verdict as its refusal, *"I cannot independently re-verify this
comparison against the raw harvest"* — and then asserted an anachronism as proven. A second tier
(the program-level reviewer) corroborated it; both reached the same conclusion from the same package
text by the same plausibility inference. **Two reasoners sharing an inference share its failure**;
independent corroboration requires an independent evidence path, which neither had.

**Cost of the class:** one day, one extra round, and a false narrative in three internal documents that
described the refusal as the system's strongest moment. The *direction* was fail-safe — a wrongly
blocked correct package costs a day; a wrongly passed fabricated rollback costs the network — so the
posture was right and the claimed certainty was not.

### Prose was tried, and it closed exactly one lane

v1.0.2's carry-forward fix worked on the lane it addressed: the re-run of specimen 2's objective was
APPROVED. **The class then immediately reappeared in the next lane** (specimen 3, whole-file, same day).
That is the measurement that settled the question — the ruling recorded at the time was *no third
prose patch*, and the change class was parked pending the mechanical layer.

### The corpus refused the obvious build, twice

| Rule measured over the 56-package archive | Result |
|---|---|
| Naive (every rollback line ⊆ harvest) | flags **100%** of packages — inverse `no`-form rollbacks quote nothing |
| Scoped (restore-form lines only) | flags ~half; **every examined miss benign** |
| **True fabrications found** | **zero** |

So the leaf's justification is **inverted** from the usual one: it does not catch forgeries — on this
corpus there are none to catch — it **exonerates correct work**, and would have refuted all three
refusals at review time. That required a named third path in the project's own earn-it rule
("a judgement repeatedly made by a party structurally blind to the deciding evidence"), plus a standing
corollary: **a leaf earned that way may escalate, never block.**

### The acceptance round — all three observables held

Round ran ~8 minutes, four children SUCCESS, `qualityGate: approved`, reviewer **90**.

| Observable | Measured |
|---|---|
| 1 | `checked:true` · **26 of 26** restore lines found · `missing: []` · `rollbackDisposition {benign, all-restore-lines-found}` nested inside the fact · `harvestSource` = the leg's own harvest child |
| 2 | the Reviewer's chained copy **byte-identical** (`byte_identical = t`, re-verified independently off the artifacts) |
| 3 | `reviewerVerdict {approved: true, blocking: []}` · `## VERDICT: APPROVED / Blocking issues: none / Confidence: 90` |

**Claim 3 — the scoping — is the result worth reading twice.** The reviewer wrote, unprompted:

> **Platform fact cited directly (not inferred from prose):** rollback provenance shows **26 of 26
> restore lines found verbatim in this leg's own harvest, 0 unmatched**, disposition `benign`. This is
> full containment — no blocking issue. *(Per guidance, this proves line-level provenance only, not
> completeness; I independently checked completeness in §1/§3 above and found the rollback file matches
> the full baseline with nothing omitted.)*

The parenthetical is the rubber-stamp failure not happening. The fact answers *is each quoted line
present in the witnessed harvest?* and the reviewer kept *is the package complete?* as its own
judgement — which is exactly the boundary the render text and the role rule mandate.

### The non-suppression fixture — proving the fact cannot silence a legitimate refusal

Provenance-shaped refusals split into two lanes that look identical in a run-sheet and are opposites:

- **(a) the required evidence is genuinely absent from the package** — a legitimate catch; prose fixes it.
- **(b) the content is correct but unverifiable from the reviewer's seat** — only a mechanical fact fixes it.

A June 2026 Kubernetes round is the (a)-lane specimen: its harvester *had* captured the constraint
evidence (none existed — an absence is a finding), the package omitted it, and the reviewer blocked.
That round is pinned as a **required fixture asserting the fact contributes nothing to it** — all twelve
of its rollback lines fall to a benign class (`procedural-rollback-block`: `git revert`, `kubectl
rollout undo`), so the fact has no opinion and the (a)-lane block stands untouched. The test is
mutation-proven the hard way: make the predicate greedy and *that* assertion must be the one that fails.
The same guard runs at the fact's own level — a package that quotes nothing scores zero restore lines
and stamps `no-restore-blocks`, which approves nothing.

### Two things building it taught, both found by running

- **A "defect" in the sibling checker was not one.** A latent-looking flaw in the block classifier's
  majority test was implemented and then **reverted**: excluding separator lines moved 30 lines of a live
  *removal* package out of `candidate-config`, which would have stopped the dialect lint reading a
  removal package's real config. A hypothetical false scan traded for a live false skip. The non-fix is
  documented at the site so the next reader does not re-fix it.
- **The corpus stopped a false-positive machine from shipping.** The first predicate left unmatched lines
  on 35 of 53 packages that quote restore content. One unnamed class (author annotations) was added;
  the rest resolved into a desired-state lane where "quote the harvest" is the wrong question entirely —
  that lane now stamps a named `lane-not-supported` ("the platform deliberately did not ask"), and the
  residue dropped to 24 packages / 108 lines. **What remains is unsolved and is recorded as such**, below.

## Conclusion

**Verified live, in the passing direction, for one domain lane, on one round.** The claim that holds is:
a judgement structurally unavailable to a tier was replaced by a fact computed where the evidence lives,
delivered into that tier's context, and consumed there — and the class of refusal that had blocked three
correct packages did not recur. The claim that does **not** hold yet is any statement about the
escalation direction in production, or about lanes outside `observability-config`.

## What is NOT claimed

- **Not a single-variable A/B.** Two things changed between the parked round and the accepted one: the
  fact, and a reseeded reviewer rule. The corpus check bounds the second: scoped to *adverse* claims, the
  rule leaves all 119 archived approvals untouched and targets the 3 refusals that block while admitting
  they could not check (~6% of refusals). It is a bound, not a proof of attribution.
- **The escalation direction is fixture-proven, not live.** Unmatched lines render as *lines the check
  could not adjudicate — NOT evidence of fabrication* and escalate rather than block; that arm is
  exercised by mutation fixtures only. By design: the blocking direction is not sought from a live round.
- **The fact reaches one lane.** Its §6 delivery is scoped to `observability-config` because the corpus
  re-measure showed it would escalate on 24 of 42 adjudicated packages elsewhere — a fact that cries wolf
  on most inputs is ignored precisely when it is right. The residue is one coherent unsolved class
  (configuration *context-entry* lines: navigation in one package, restored content in another, with no
  text-level rule separating them — two candidate rules were tested against the corpus and both rejected).
  Widening the lane is gated on ruling that class, not on preference.
- **It is not a fabrication detector** and must not be cited as one. Measured base rate of the defect it
  resembles: 0 of 56. Its demonstrated value is exoneration.
- **It gates nothing.** The fact is recorded, rendered and read; it is not a release-gate conjunct. That
  decision is scheduled for re-examination at the quarterly health run with the outcome data it will have
  produced by then — the project's standing rule is *ship the fact, earn the verdict*.

## Enforcement

| Guard | What it pins |
|---|---|
| `npm run test:rollback-containment` | the scoping/matching predicate, the five named exclusion classes and their precedence, the arm ordering (a deliberate-no-check lane reports as such *before* content reasons), all five live fixtures both directions |
| `npm run test:marker-presence` (JOIN-0..5) | the **write-site ↔ read-site join**: the chainer's real output pushed through the shipping renderer, asserting the unmatched-line detail survives with its line numbers. Mutation-verified — renaming the carried field fails these and nothing else |
| `npm run test:pipeline-context-render` | the §6 render, incl. the mandatory *could-not-adjudicate, NOT evidence of fabrication* framing (mutation-verified), the deliberate-no-check wording, and rendering nothing when the fact is absent |
| `npm run test:lean-card-facts` | the card surfacing and its write-site/read-site coupling |
| `npm run test:execution-artifacts-parity` | the disposition stays **nested inside** the fact (a sibling would be stripped by the summary whitelist and read as absent at any future consumer) |
| `npm run replay:rollback-containment -- <taskId>` | read-only re-measurement of any archived leg through the shipping enrichment — no run required |
| `npm run test:protocol-public-parity` | the published protocol text is byte-identical to the platform seed |

**Residual limitations, each with its trigger to act:**

- *Context-entry residue* (24 packages / 108 lines) — blocks any widening of the render lane. Trigger:
  a design ruling on that class, with the corpus re-measured after.
- *Program-root applicability* — a related fact's structural short-circuit at program-root tier is
  source-true but has no archived observation. Trigger: the next program-tier run.
- *Unrendered siblings* — two neighbouring facts are stamped but surfaced on no operator-facing view;
  the new fact deliberately rides that existing decision rather than creating a second one. Trigger: the
  shared-registry work that makes rendering a required property of every fact.
