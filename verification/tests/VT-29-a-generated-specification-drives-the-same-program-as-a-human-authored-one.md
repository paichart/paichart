# VT-29 — a generated specification drives the same program as the one a human wrote, and the value is still derived

**Status**: VERIFIED 2026-09-23 (live, four-domain program, `programReleasable: true`) | Re-verify
trigger: any change to the requirements-authoring protocol's Phase 0 or Phase 1; a change to the
`derivationContainment` net or its disposition arms; a change to the Kubernetes descriptor's tool
surface; or a change to the harvest-scope clause in any domain protocol.
**Layer**: program (four pipeline-tier legs, one program tier)
**Round type**: functional acceptance, after three prior attempts on the same generated specification
failed the gate

**Date:** 2026-09-23. **POV:** Cheap-Rig Program Runs, phase *Telemetry export authorization across
fabric, cluster, cloud and observability*. Related: VT-25 (the value reached the container, not the
worker), VT-28 (marker placement), VT-21 (a fact delivered where the judgement happens).

## Objective

Two claims, and the second is the one that makes the first worth anything:

> **1.** A `requirements.md` that the platform GENERATED drives the same four-domain program, to the
> same verdict, as the `requirements.md` a human wrote.
>
> **2.** The value the program is about is still DERIVED from live state on every run — it is not
> carried in by either document, and a generated specification does not smuggle it.

Claim 2 matters because a generated spec is produced by a pipeline that itself harvested the
environment, and *a spec generated from a harvest cannot un-know what it harvested*. If the answer
leaks into the document, the program that reads it is no longer deriving anything — it is
transcribing, with every gate green.

## What was found

### The arc — this was not a first-try pass

| run | specification | releasable | outcome | score |
|---|---|---|---|---|
| R8, 09-19 | **human-authored control** | **true** | approved | 87 |
| genspec attempt 1, 09-22 08:56 | generated | false | needs-revision | 20 |
| genspec attempt 2, 09-22 21:55 | generated | — | never reached synthesis | — |
| genspec attempt 3, 09-23 00:05 | generated | false | needs-revision | 88 |
| **Run 10, 09-23 05:21** | **generated** | **true** | **approved** | **85** |

Three failures on the generated specification before one matched the control. Each failure was a
different defect at a different layer, and each was fixed at the layer that owned it rather than by
editing the document to suit the run.

### Run 10 — the four legs

| leg | domain | outcome | reviewer | containment |
|---|---|---|---|---|
| L1 Fabric | network-provisioning | approved | 90 | **benign — checked-clean, 0 violations** |
| L2 Kubernetes | kubernetes-gitops | approved | 88 | benign — consumed-discharged, upstream green |
| L3 Cloud | terraform-iac | approved | 91 | benign — consumed-discharged, upstream green |
| L4 Observability | observability-config | approved | 85 | benign — consumed-discharged, upstream green |

**Program:** `programReleasable: true`, `qualityGate.outcome: approved`, `reviewerScore: 85`
(the MIN across legs; L4 limiting), `reviewerPresent: true`.

**Node C** (program integration reviewer) returned a terminal `## VERDICT: APPROVED`, zero blocking
issues, confidence 82 — and recomputed rather than trusted:

> independently recomputed containment of all 6 harvested addresses against the derived block
> (**VERIFIED-AGAINST-EVIDENCE**), confirmed exact block-identity match across Legs 2/3/4, and
> confirmed no leg admits any range beyond Leg 1's block.

**Chained coverage:** 4 of 4 chain-capable predecessors on both the producer and Node C, 0 degraded
— and the harness recorded that it retrieved this *"independently, not from Node C's prose"*. It did
not take the reviewer's word for the coverage fact it was about to gate on.

### Claim 2 — the value is derived: machine-checked for shape, hand-checked for membership

Leg 1's mechanical containment net:

```json
{ "checked": true, "harvestedCount": 6, "harvestedByKind": { "cidr": 6, "asn": 4 },
  "derivedCount": 1, "derivedValues": [{ "kind": "cidr", "value": "10.99.0.0/27" }],
  "violations": [],
  "containmentDisposition": { "disposition": "benign", "reason": "checked-clean" } }
```

`checked: true` with zero violations attests **four** properties of the derived value, and it is worth
being exact about which, because two adjacent properties are **not** checked:

| check | what `violations: []` proves |
|---|---|
| `misaligned-prefix` | the aggregate sits on a proper prefix boundary |
| `member-not-covered` | every **declared** member lies inside the aggregate |
| `prefix-not-minimal` | the aggregate is the smallest prefix for its **declared** members |
| `covered-not-member` | no harvested allocation **inside** the aggregate was left undeclared |

**Not checked by the net:** that each declared member *came from* the harvest, and that every
harvested address is *covered* by the aggregate. A member list copied from a stale source, on a fabric
that had since grown an exporter **outside** the aggregate, would stamp `violations: []` exactly like a
correct run. (One inside the aggregate would be caught by `covered-not-member`.) The omission is not a
simple bug: in network domains the harvested-allocations block exists for **collision** avoidance, so a
blanket "cover every harvested address" rule would be wrong there — the net would need to know which
harvested entries are members to cover and which are allocations to avoid.

**For this run, membership was verified by inspection instead**, and it holds: the Architect's six
declared members are exactly the six cidr entries in the harvester's own `## Harvested Allocations`
block — set-equal, none outside the aggregate. So the derivation is correct; the claim is that it was
**machine-checked for shape and hand-checked for membership**, not that the platform attested it
end to end. (Found by the 2026-09-24 panel on harvested state in generated specs, and confirmed against
`lib/agents/harness/derivation-containment.ts:700-766` before this correction was written.)

**Minimality, recomputed by hand for this record.** The six harvested loopbacks are `.1 .2 .4 .24
.26 .29`. A `/28` covers `.0–.15` and would exclude three of them; a `/27` covers `.0–.31` and is the
smallest prefix containing the set. The Architect documented the same half-split test independently,
in its own words, before any human checked it.

**Twelve derivations, twelve runs.** Across the whole arc, the fabric leg derived `10.99.0.0/27`
twelve separate times — from its own live harvest each time, under **both** specifications:

```sql
-- architect legs that emitted a DERIVED block (not merely carried the value) containing it
SELECT to_char(e."startTime",'MM-DD HH24:MI'), left(leg.title,30), prog.id
FROM tasks t
JOIN agent_executions e ON e."taskId"=t.id
JOIN agent_artifacts a ON a."executionId"=e.id AND a.name='result.json'
JOIN tasks leg ON leg.metadata->>'pipelineStageId' = t.stage_id
LEFT JOIN tasks prog ON prog.metadata->>'pipelineStageId' = leg.stage_id
WHERE t."agentRole"='infra_change_architect'
  AND (a.content::jsonb)->>'finalResponse' LIKE '%## Derived Values%'
  AND (a.content::jsonb)->>'finalResponse' LIKE '%members%'
  AND (a.content::jsonb)->>'finalResponse' LIKE '%10.99.0.0/27%'
ORDER BY e."startTime";
```

⚠️ **The `## Derived Values` + `members` predicate is load-bearing.** A plain string search for the
value returns **40** rows and is wrong for this claim: a CONSUMING leg legitimately carries the value
it was handed, so a value-only search counts consumption as derivation. Twelve is the number of legs
that *produced* it.

⚠️ **"Twelve derivations" is not "twelve environments."** It is the same rig and the same six
loopbacks throughout. What varies across the twelve is the execution, the harvest, and — for five of
them — the specification driving it. The claim is reproducibility of the derivation, not independence
of the input.

## The change under test in this round

Run 10's Kubernetes leg is the reason this round exists. In the previous run the same leg returned
**needs-revision at 90**; here it returned **approved at 88**. Three things changed, all shipped the
same day, and all three are visible in the record.

**1. A metadata-only listing tool.** Before it, Kubernetes could not read its own pod population
without truncation *at all*: the narrowest available form was 3.4× the per-tool-result cap, 12 of 13
reads clipped, the unscoped form peaking at 18.6×. A read that clips returns a partial population
that looks complete. The new tool returns names, labels and a count — never specs.

**2. The harvest clause was split along its two axes.** The shipped sentence governs read DEPTH; its
parenthetical had been smuggling a BREADTH rule, and a brief-writer acted on it. Enumerating a
population by identifier IS a narrow read.

**3. The tool is named nowhere in any protocol.** The protocol describes a SHAPE — *whichever tool
your descriptor declares that returns identifiers without full object specs; if it declares none, say
so.* The harvester found it from that description alone, for the second independent time:

```
list_resource_names  pods                    2,861 chars  ✓
list_resource_names  networkpolicies         2,084       ✓
list_resource_names  deployments (selector)  2,403       ✓
list_resource_names  limitranges             2,072       ✓
list_resource_names  resourcequotas          2,081       ✓
list_resource_names  poddisruptionbudgets    2,099       ✓
list_resource_names  services (selector)     2,108       ✓
```

Seven population reads, **zero truncated**, none above 2.9 KB against an 8 KB cap.

Two calls in the same leg DID truncate, and both are correct: the fetch of the descriptor document
itself, and one `get_resource` on a single deployment at 8,809 chars — a full object spec, which is
what that tool is for. Counting either as a harvest failure would be a measurement error, and an
earlier pass in this arc made exactly that mistake.

**What the design then did with the census** is the part that matters:

> `podSelector: {}` in #2 reaches the harvested namespace population of **exactly 2 pods** … Blast
> radius is fully enumerated by the harvest.

and, separating absence from blindness:

> all genuine absences, not read failures — harvest confirms `success:true` on all four calls

and finally, instructing the Author to **carry the census into the package**:

> quote this census so the Reviewer can verify blast-radius from the package alone

That last move is the design routing around a known limit on its own initiative. A reviewer reads the
PACKAGE, not the harvest, so evidence the reviewer needs has to be carried rather than referenced —
the property recorded as Invariant 6, applied here without being asked.

## Limits of this result

- **One environment.** Every run in the arc harvested the same rig. This verifies that the derivation
  reproduces, not that it generalises to an estate nobody has tried.
- **The generated specification was spliced and read by a human before launch.** The publish pass
  (mechanical writing-rules insertion, placeholder strip, register strip) is a human step and was
  performed. This result says a generated spec can drive the program; it does not say an unreviewed
  one can.
- **`reviewerScore: 85` is a recorded fact, not a bar.** No gate in this platform tests a confidence
  or reviewer score against a threshold, at either tier, by design.
- **Release remains a human decision.** `programReleasable: true` states that the record supports
  release. It does not release anything.
