# VT-31 — a specification generated from an objective that declared no decisions drives a releasable program

**Status**: VERIFIED 2026-10-01 (live, four-domain program, `programReleasable: true`, n = 1) | Re-verify trigger:
any change to the requirements-authoring protocol; to the `program_architect`, `infra_change_architect`,
`config_change_author` or `change_reviewer` role guidance; to the evidence-carry clause of the network-provisioning or
terraform-iac protocol; or to the `## VERDICT:` parser.
**Layer**: program (four pipeline-tier legs, one program tier) — plus the requirements pipeline that produced its input
**Round type**: functional acceptance, after five prior runs on the same generated specification failed the gate

**Date:** 2026-10-01. Related: VT-29 (a generated specification drives the same program as a human-authored one),
VT-28 (marker placement), VT-25 (the value reached the container, not the worker).

## Objective

VT-29 showed that a GENERATED `requirements.md` can drive this program to release — but that specification was
generated from an objective that already declared the design decisions, found by hand over more than twenty
revisions. This round removes that crutch:

> **1.** A specification generated from an objective that declares **no design decisions at all** — the generator
> asks, the owner answers the questions once, the generator runs again — drives the same four-domain program to
> `programReleasable: true`, with every conjunct of the gate recomputed by hand from the persisted facts.
>
> **2.** The owner's *premise conditions* — "if this leg's own harvest cannot confirm X, do Y" — reach every leg
> **verbatim**, and each leg answers them from **evidence it read**, not from the fact that a value arrived.

Ruled out explicitly: a release obtained by editing the specification to suit a run (the specification was frozen
from Run 8 onward), and a release in which any leg was approved without a reviewer verdict.

## Method

1. **Zero-decision generation.** The requirements-authoring pipeline was given an objective stating only the goal,
   the draft-specification line and the read-only service descriptors. It returned its *Decisions needed from the
   owner* block in full.
2. **One owner-answer session.** The owner answered the block as a numbered list of 16 decisions; the list was merged
   mechanically into the objective, and the pipeline regenerated the specification from it.
3. **Publish pass** (human): writing rules spliced and byte-checked, harvested-state lint, placeholder/marker strip,
   citation gate (45 of 45 citations verbatim). The reviewer's verdict on the generated specification was
   NEEDS-REVISION on two write-up findings that change nothing the program is told; the owner waived them **by name**
   (recorded in the specification's `PUBLISH-NOTES.md`). One decision (item 16, the premise behaviour) was re-answered
   after Run 7 — that is the only change between `…-t1zero` and `…-t1zero-v2`, and is why v2 exists.
4. **Program runs** against the published specification, unchanged from Run 8 onward. Each failing run was read to
   the layer that caused it, fixed there, and the next run launched — never by editing the specification.
5. **Gates.** All five human gates (plan, value, three change-method gates) were released by an AI coordinator under
   a delegation written in advance by the owner: release only an approved leg, or a plan matching the 16 answered
   decisions; hold everything else for the owner; record each release with the owner as approver of record. Each
   release states what was checked.

The fabric leg runs against an Arista cEOS lab and is **not externally reproducible** (the image requires an Arista
account). The Kubernetes, Terraform and observability legs run against the labs published in [`usecases/`](../../usecases/).

## Config

- Specification: [`program-artifacts/telemetry-export-genspec-t1zero-v2/`](../../program-artifacts/telemetry-export-genspec-t1zero-v2/)
  (`requirements.md`, `topology.json`, `PUBLISH-NOTES.md`); v1 at `…/telemetry-export-genspec-t1zero/`.
- Protocols at the releasing run: pov-program 1.8.7 · pipeline-orchestrator 3.18.0 · network-provisioning 1.18.0 ·
  kubernetes-gitops 1.13.0 · terraform-iac 1.9.0 · observability-config 1.4.0 · requirements-authoring 1.7.5 (generation
  of v2 ran on 1.7.4).

## Expected observables

- Root task: `metadata.programReleasable: true`, `qualityGate.outcome: approved`, `qualityGate.reviewerScore` = the MIN
  of the four legs' reviewer scores.
- Each leg: `qualityGate.outcome: approved` with a terminal `## VERDICT: APPROVED` and zero blocking items.
- Node C: `## VERDICT: APPROVED`, zero blocking; its chained-context facts `predecessors = expectedPredecessors = 4`,
  `chainCapablePredecessors = 4`, `degradedPredecessors = 0`, `notChained = []`.
- `derivationContainment`: the producing leg `checked-clean` with zero violations; each consuming leg
  `consuming-leg-consumed-discharged` with `upstreamContainmentGreen: true`.
- Every consuming leg declares the crossing value exactly as the producing leg published it.
- The interface contract carries a `branchConditions` entry per leg, each condition verbatim from the specification;
  each leg architect answers each of its rows CONFIRMED / NOT CONFIRMED / UNTESTED, naming the harvest read that
  decides it (or, for UNTESTED, why none can).

## Results

### The arc — release on the sixth run

| run | spec | fabric | Kubernetes | Terraform | observability | releasable | what blocked, and where it was fixed |
|---|---|---|---|---|---|---|---|
| 6 | v1 | ✅ 92 | ✅ 90 | ✅ 88 | NR 85 | false | observability shipped a validation check that could not fail — did not recur (observability approved in Runs 8, 9 and 11) |
| 7 | v1 | ✅ 90 | NR 85 | ✅ 87 | NR 88 | false | Kubernetes predicted output nobody had yet observed (fixed: the program architect no longer prescribes HOW a leg validates); observability read the premise decision as "gap" (fixed **in the owner's answer**, item 16 → v2) |
| 8 | v2 | NR 85 | ✅ 88 | ✅ 90 | ✅ 90 | false | the producing leg's author quoted its evidence from the architect's restatement — it could not see the harvest (fixed: it now depends on the harvester directly) |
| 9 | v2 | ✅ 90 | ✅ 90 | NR 85 | ✅ 91 | false | Terraform self-assessed against the program's acceptance checks — **caused by our own earlier wording**, which had the program architect cite those checks in leg objectives (fixed: acceptance checks stay out of leg objectives entirely) |
| 10 | v2 | NR 88 | — | — | — | — (ended by owner at the value gate) | the producing author used harvested values it had not quoted; its reviewer sees only the package — **a side effect of the Run 8 fix** (fixed: every harvested value used anywhere is quoted at its point of use) |
| **11** | **v2** | **✅ 91** | **✅ 88** | **✅ 90** | **✅ 88** | **true** | — |

Two of the five failures were caused by our own earlier fixes. We record that because it is the honest shape of the
loop: each wording change is an untested draw until a live run exercises it.

### Run 11 — the gate, recomputed by hand

| conjunct | value |
|---|---|
| leg outcomes | all four `approved` — the first run on this specification where all four were |
| `reviewerScore` = MIN | 88 = min(91, 88, 90, 88) ✅ |
| Node C | `## VERDICT: APPROVED`, 0 blocking, confidence 93 |
| coverage | predecessors 4 = expected 4, chain-capable 4, degraded 0, `notChained: []` |
| containment | producer `checked-clean`, 0 violations (6 harvested CIDRs, 4 ASNs); each consumer `consuming-leg-consumed-discharged`, upstream green |
| crossing value | `10.99.0.0/27` — consumed verbatim by all three consumers; no other `10.99.0.x` range appears in any of the 12 consumer-leg deliverables (harvester, architect, author, reviewer × 3) |

**Minimality, by hand.** The six exporter loopbacks are `.1 .2 .4 .24 .26 .29`. A `/28` ends at `.15` and would exclude
three of them; `/27` (`.0–.31`) is the smallest aligned prefix containing all six.

### Claim 2 — premises answered from evidence

The Kubernetes leg architect answered all five of its rows, each with the read that decides it:

| row | answer | deciding read |
|---|---|---|
| enforcer-absent | CONFIRMED → create | NetworkPolicy listing in the namespace → count 0 |
| existing-grant | NOT CONFIRMED | same read |
| target-empty | CONFIRMED → act regardless, report 0 pods as a fact | pod listing with the receiver selector → count 0 |
| target-absent | NOT CONFIRMED — the namespace exists and is populated | unfiltered listings |
| principal-unseen | **UNTESTED** → act regardless, record the premise | *"no read available to the read-only […] service surfaces CNI/eBPF path behaviour … the chained CIDR being correct says nothing about what the enforcer will actually see on that path"* |

The last row is the property claim 2 is about. In the earlier runs of this arc the same premise was misread three times out of four — each time answered from the value's *arrival* (the range arrived, so the premise was taken as confirmed). Here it is marked
UNTESTED for the right reason, in the leg's own words, and carried to the package.

The producing leg's author — the Run 10 failure — used no harvested value outside its verbatim quote of the harvest:
the two non-member addresses that blocked Run 10 appear in this package only inside that quote, exactly as the
harvest carries them.

### Observed, not a defect

The observability reviewer included an "Acceptance check 3 (no-widening) — PASS" row in its own assessment. That is a
reviewer judging the package against a program property, not an author self-assessing (the Run 9 class). Watched only.

## Conclusion

**Verified live, once.** A specification generated from an objective that declared no design decisions, with the
owner's sixteen answers supplied in a single session, drove the four-domain program to `programReleasable: true`, and
every conjunct of the gate recomputes clean from the persisted facts. The owner's premise conditions reached each leg
verbatim and were answered from evidence.

**Not verified: a rate.** This is one release in six runs on this specification. Whether it is a steady state is a
measurement we have not yet made — the plan is to freeze all guidance and run the same specification three to five
more times. Until then, "it can release" is the claim; "it releases" is not.

## Enforcement

- Behaviour ships in the protocol versions listed under *Config* and in the role guidance named in the re-verify
  trigger.
- CI pins: `test:parse-verdict` (the terminal verdict grammar, including numbered blocking items),
  `test:requirements-guidance-anchors` (the branch-condition and UNTESTED-premise wording, including negative pins on
  the superseded wording), `test:marker-contract-claims` (evidence-carry counts).
- **Residual — no pin:** the point-of-use quoting clause (the Run 10 fix) is prose with no mechanical check. Its
  trigger-to-act: a second package blocked for a harvested value used unquoted.
- **Residual — the specification's publish needed an owner waiver** on two write-up findings. A specification that
  passes its own reviewer unaided is not yet demonstrated for this objective.
- **Residual — one environment.** Every run harvested the same labs. This verifies the path, not its generality; a
  second objective in a fresh environment is the next generality test.
- **Release remains a human decision.** `programReleasable: true` states that the record supports release; it releases
  nothing. On this run the gates were released by an AI coordinator under the owner's written delegation, with the owner
  as approver of record.
