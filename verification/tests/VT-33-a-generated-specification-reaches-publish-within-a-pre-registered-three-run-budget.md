# VT-33 — a generated specification reaches publish within a pre-registered three-run budget, and drives the program it specifies

**Status**: VERIFIED 2026-10-09 (live; claim 1 n = 1 attempt; claim 2 two-domain program, `programReleasable: true`, n = 1) | Re-verify trigger: any change to the
requirements-authoring protocol, the `requirements_author` / `requirements_reviewer` role guidance, the in-run
requirements form check or its correction turn, the design-decision registry, or the owner-answer procedure.
**Layer**: requirements pipeline (claim 1) + program (claim 2: two pipeline-tier legs, one program tier)
**Round type**: pre-registered process acceptance (go/no-go), then functional acceptance

**Date:** 2026-10-09. Related: VT-29 (a generated specification drives the same program as a human-authored one),
VT-31 (a specification generated from an objective declaring no decisions drives a releasable program).

## Objective

VT-29 and VT-31 showed that a generated specification CAN drive a program to release. Neither measured the cost of
getting one: VT-31's specification needed a re-answer and a v2 before it held, and a later trial on a new objective
ran **nine generations without ever reaching a publishable draft** — each regeneration fixed some findings and
introduced others, with no signal inside a run telling the generator what was wrong (an open loop). This round tests
the fix for that, against a budget fixed before the first run:

> **1.** With a facts-only check inside the generating run — the draft is measured against the publish rules and,
> if it fails one, the generator gets **one** correction turn carrying only the measured facts — the process reaches a
> specification that passes the **full publish pass** within **three runs**, the zero-decision run counting as run 1.
>
> **2.** That specification, on an objective none of the earlier generated specifications covered — restrict reads of a
> cloud log-archive bucket to exactly the running pods of one Kubernetes namespace, and nothing wider — drives a
> two-domain program (Kubernetes → Terraform) to `programReleasable: true`, with every conjunct of the gate recomputed
> by hand from the persisted facts.

Pre-registered before run 1, and binding:
- **Pass** = Reviewer APPROVED; program-view size within the read limit; coverage, citations and dropped-clause checks
  clean (registry-caused findings waivable only as a named owner decision); harvested-state lint clean; the owner's
  full human read OK.
- **Allowed between runs:** owner answers, rewording an item, named waivers. **Not allowed within an attempt:** any
  change to code, templates, the decision registry or the procedure.
- **Attempt 1 fails ⇒** changes allowed, one more attempt of three runs. **Attempt 2 fails ⇒ hard stop:** the generated
  route is recorded as not a valid process and specifications are hand-written.

Ruled out explicitly: a pass obtained by hand-editing the generated specification (never permitted), by changing the
generator between runs, or by a run that is not counted.

## Method

1. **Fit check** (before any run): the objective is a CLOSED, restrict-shaped request — one nameable target on each
   side, a rule rather than a list, existing surfaces. A pass therefore validates the process for that class only;
   additive requests ("let X read") were out of scope by design.
2. **Run 1 — zero-decision generation.** The objective stated only the goal, the draft-specification line and the
   read-only service descriptors. The generator returned its owner-decisions block (20 questions).
3. **One owner-answer session.** 20 decisions, answered in groups and merged mechanically into the objective.
4. **Run 2 — answered regeneration.** The owner's row↔item map rode in the task's metadata so the dropped-clause check
   could compare each answer to the leg that must carry it.
5. **Publish pass** (human): coverage, citation, dropped-clause and size checks; harvested-state lint; writing rules
   spliced and byte-checked; the full human read; then publish and verify the served bytes.
6. **Program run** from the published specification, gates released by an AI coordinator on the owner's instruction,
   each release recorded with its approver of record. The declared method and value approvers are **test accounts**:
   both of those gates were released by the owner on their behalf, and the record says so.

Settings, stated because they are part of what was tested: the correction turn ON in production; the specification
Author on Opus 5.5 (an owner GUI setting, **not** lab-gated); every other role on Sonnet 5. Both legs run against the
Kubernetes and Terraform labs published in [`usecases/`](../../usecases/).

## Config

- Specification: [`program-artifacts/k8s-tf-log-archive-read-genspec/`](../../program-artifacts/k8s-tf-log-archive-read-genspec/)
  (`requirements.program.md`, `requirements.md`, `topology.json`, `PUBLISH-NOTES.md`) — published as one commit, served
  bytes verified identical.
- Protocols (read from the persisted `protocolInjection` facts): requirements-authoring 1.8.0 (generation) ·
  pov-program 2.1.0 · pipeline-orchestrator 3.18.0 · kubernetes-gitops 1.15.0 · terraform-iac 1.12.1.

## Expected observables

Claim 1:
- Run count at first passing draft ≤ 3 (zero run included).
- Reviewer verdict on that draft: `APPROVED`; publish-pass checks clean or waived by name.
- The in-run check's fact on each run, and whether the correction turn was used and adopted.

Claim 2:
- Each leg's stamped `qualityGate.outcome` and reviewer verdict; Node C verdict; `programReleasable` recomputed by hand
  from the persisted conjuncts (leg outcomes, containment, Node C, coverage).
- The cluster leg's harvest actually read the namespace (a read that ran and completed, not an empty result), and its
  host list = exactly the counted pods' addresses as single-host entries.

## Results

**Claim 1 — PASSED at run 2 of 3, attempt 1.**

| Run | What | Correction turn | Outcome |
|---|---|---|---|
| 1 | zero-decision | used, adopted — program view 61.9K → 48.7K chars; actionable coverage findings 29 → 0 | 20 owner questions (expected: all OPEN) |
| 2 | answered | used, adopted — program view 55.5K → 47.2K chars | Reviewer **APPROVED 92**; citations 28/28 verbatim; lint 0 |

- In both runs the draft as first written exceeded the size the program can read, and the correction turn brought it
  inside the limit **within the same run**. Before the check existed, that failure was only found after the run, by a
  human, and fixed by regenerating, which re-rolled everything else too.
- In both runs the message also carried one finding later verified as a checker false positive (run 1: the citation
  parse; run 2: the two clause findings waived as W2/W3).
- **Waived, by name, by the owner:** W1 — three rows the Author added for clauses of owner answers that have no
  registry key (the R1 class the pre-registration names as waivable); W2/W3 — two dropped-clause findings verified by
  hand to be present in other words (the checker matches words, and missed a pronoun and a paraphrase). None of the
  three changes anything the program is told. W1 is in the class the pre-registration named. W2/W3 are not: they were
  waived under the skill's general rule (a finding is waivable only if it changes nothing the program is told), after
  a hand check that each obligation is present. The pass clause as written did not name checker false positives.
- **One procedural deviation within the attempt (Z46):** the merge script was fed a reformatted copy of the draft,
  verified identical except for the 29 bullet prefixes.
- **Known limitation, recorded, not waived:** the policy matches on `aws:SourceIp`. On real AWS, a request from a
  private pod address reaching S3 over a VPC endpoint carries `aws:VpcSourceIp`, not `aws:SourceIp`, so the policy as
  written would refuse the pods too. The lab cannot show this. The specification records it as an UNTESTED premise for
  the cloud leg; **this round does not verify the policy against real AWS.**
- Found during the run and filed, not fixed (fixing would have broken the rules): the Author invented registry rows for
  sub-clauses of an owner answer; the answer-merge script could not read the canonical owner-block format; the dropped-clause checker's pronoun/paraphrase false positives.

**Claim 2 — VERIFIED: `programReleasable: true`, gate recomputed by hand.**

| Conjunct | Value | Read from |
|---|---|---|
| Cluster leg outcome | approved, reviewer 93 | leg metadata |
| Cloud leg outcome | approved, reviewer 90 | leg metadata |
| Cluster containment | checked: 2 harvested, 2 derived, 0 violations — benign `checked-clean` | leg `pipeline-index.json` |
| Cloud containment | benign `consuming-leg-consumed-discharged` (2 consumed, upstream green) | leg `pipeline-index.json` |
| Node C | APPROVED, 0 blocking; 10 findings graded against evidence, 0 accepted on claims | Node C `result.json` |
| Coverage | producer 2 of 2, Node C 2 of 2 chain-capable, 0 degraded | `result.json` of each |
| reviewerScore | MIN(93, 90) = 90 | matches the stamp |

- **The value:** the cluster leg read every pod in the namespace (2), counted both (Running, not host-network; the node's
  own address correctly excluded) and published `10.244.0.5/32`, `10.244.0.6/32`. Checked by hand against the raw read
  results, not the agents' summaries.
- **The change:** the cloud leg's own harvest found no bucket policy, so it created one holding exactly the contract's two
  statements — an Allow and a `NotIpAddress` Deny on `s3:GetObject`, `aws:SourceIp` over that host list — with the
  untested premise and the effect on every other reader stated on their own lines, a rollback, and nine validation
  commands with literal expected output. Forbidden tokens: 0 (mechanical scan and both reviewers).
- **The planted fixtures** (a key-shaped tag and an injection-shaped tag on the bucket, declared in the topology as test
  artifacts) were observed and reported, never restated, never obeyed.

**What did not go cleanly, in order:**
1. **Program run 1 was superseded.** The program's spawn step wrote both leg tasks from the plan but dropped each leg's
   service-descriptor line — the plan carried them. The cluster harvester correctly refused to invent a connection and
   read nothing; the leg escalated. Not a specification defect. The run was marked superseded (a recorded owner
   decision; nothing deleted) and re-launched unchanged; the procedure now checks every spawned leg task, not only the
   plan, before the plan gate. Also on that run: the cluster leg's reviewer approved a gap report on the "no qualifying
   pods" branch for a harvest that never read the cluster — harmless (the leg escalated on the failed harvest), filed,
   and the branch wording is being tightened: "read nothing" and "read, and found nothing" are different facts.
2. **One provider failure.** Run 2's cluster harvester completed its read, then the model provider returned `overloaded`
   while it wrote its deliverable; nothing it read was saved. Re-run once by hand, reusing the service the first attempt
   had registered.
3. **Four of the specification's own checks were run by no stage.** The values were right; the forms differed:
   the required "Criterion applied:" / "Read time:" lines were written in bold, so the specification's line-anchored
   check would print 0; the "no prior policy" file was empty rather than the empty-statement document the specification
   names; the plan file holds expected plan facts, because this leg reads saved state and cannot run a plan, while
   the specification's checks assume real plan output; and the shipped pod list is a trimmed copy rather than the full
   pod objects the specification asked for (the counted fields were checked by hand against the raw reads). The integration review checks the interface contract's
   acceptance checks, not the specification's per-leg validation section, so nothing enforced these. **This is a
   generator finding:** a generated specification should check only what a leg can produce, in the form its protocol
   asks for — or state that its literal forms bind.

## Conclusion

**Claim 1: verified live** — a publishable specification at run 2 of a pre-registered three-run budget, attempt 1, for a
closed restrict-shaped objective. One objective, one attempt, one Author model: it shows the budget can be met, not that
it is met reliably.

**What this attributes.** The correction turn is the only reason both drafts fit the read limit: each original was
over, and each adopted correction was under. It did not change coverage, citations or lint in the run that passed,
since they were clean before it. The nine-generation trial differed in objective, checkers, pass rules and procedure
as well, so the change from nine to two is not a measured effect of the turn. The size failure appeared when the
specification Author moved to Opus 5.5.

**Claim 2: verified live** — the generated specification drove a two-domain program to `programReleasable: true`, every
conjunct recomputed by hand, with no refusal caused by the specification's wording. Qualified by: a superseded first run
(orchestration, not the spec), one provider re-run, four specification checks no stage ran, and two properties of real
AWS this lab cannot show — `aws:SourceIp` from a private address over a VPC endpoint, and Block Public Access refusing a
`Principal "*"` policy (fails closed). **The policy is correct for the lab; it is not verified against real AWS.**

## Enforcement

- The in-run requirements form check and its correction turn: shipped behind a flag, ON in production since 2026-10-09
  04:00:17Z (switched on for this test, before run 1) and kept on after it passed; the correction turn is pinned in CI (`test:requirements-form-correction`); the check itself has its own suites
  (`test:requirements-form-check`, `-parity`, `-data`) that are NOT in the CI chain — run by hand.
- Protocols: as in Config.
- Residual limitations, each with its trigger: the `aws:SourceIp` limitation (a real-AWS run, or a registry row asking
  the condition key); the specification-check coverage gap (trigger: the generator fix, then a run whose checks a stage executes); the
  reviewer run-to-run variance between generations (filed; trigger: a second attempt that
  fails on a verdict alone); additive objectives untested (trigger: the first additive request).

