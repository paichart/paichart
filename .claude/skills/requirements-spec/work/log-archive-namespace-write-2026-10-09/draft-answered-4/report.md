# Program Requirements — trading namespace pods write to the `acme-app-logs` log archive

- Authored in: Log archive write — requirements spec · Specification
- Iteration: Run 20261008-2206 · 2026-10-08

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

> **DRAFT for human review.** This document is not approved and not final. Do not launch from it. It is structurally incomplete until a person splices in the writing rules and runs the conformance check. The program it describes is launched separately, by a person, through the program plan gate.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct DOMAIN or a PHASE of one. These two legs are two distinct domains: two protocols, each against its own class of target.
  1. **kubernetes-gitops** (UPSTREAM) on Kubernetes namespace `trading`, described in `topology.json`. This leg changes nothing. It only derives the value the downstream leg consumes (item 1).
  2. **terraform-iac** (DOWNSTREAM) on Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`). This leg authors the bucket-policy grant. The bucket is the only enforcer (item 1).
- The following are explicitly **out of scope**:
  - any namespace other than `trading`;
  - any change to any Kubernetes object, of any kind;
  - any Terraform resource, workspace or bucket other than the declared bucket's policy surface;
  - any action other than `s3:PutObject`;
  - any Deny statement;
  - any change to the bucket's tags (item 21);
  - creating the namespace or the bucket (items 16 and 17);
  - applying any change. Apply is out-of-band and human-gated.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of Kubernetes namespace `trading`. The leg reads them and changes nothing. | (declared — item 2: "The target namespace is `trading`") |
| terraform-iac.target | which surface of the leg's service does it act on | — | the bucket policy of Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`) | (declared — item 3: "The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`)") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | every pod in namespace `trading` whose `status.phase` is `Running`. Readiness is not a criterion. | (declared — item 5: "every pod in the namespace of item 2 whose phase is Running; readiness is not a criterion") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: one entry per Running pod, each denoting exactly that pod's address and no other | (declared — item 14: "The derived value is expressed as a host list") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap. The leg reports the gap and produces no value. | (declared — item 15: "the cluster leg reports a gap and produces no value (gap)") |
| kubernetes-gitops.target-absent | the declared target itself does not exist | gap · create-target | gap. The leg never creates the namespace. | (declared — item 16: "If the namespace of item 2 does not exist, the cluster leg reports a gap (gap); it never creates the namespace") |
| approver.program-plan | who approves this gate | — | steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com") |
| approver.kubernetes-gitops | who approves this gate | — | josh.allen@paichart.com | (declared — item 7: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.terraform-iac | who approves this gate | — | jacob.wilcox@paichart.com | (declared — item 8: "The terraform-iac change gate is approved by jacob.wilcox@paichart.com") |
| gate.kubernetes-gitops.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg | (declared — item 9: "sits before the cluster leg (before-leg)") |
| gate.terraform-iac.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 10: "sits after the producer and before the consumers (after-producer-before-consumers)") |

`kubernetes-gitops.target-absent` is a further row. It is added because the cluster leg's namespace-absent branch relies on it. The cluster leg is not an authorisation leg, so it does not carry the rest of the authorisation block (see the owner block).

### A leg that grants or removes access (authorisation)

Only the **terraform-iac** leg grants access. The **kubernetes-gitops** leg neither grants nor removes access on its target (item 1), so its authorisation rows are deleted. They are listed in *Decisions needed from the owner*.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the objects of bucket `acme-app-logs`, with no key-prefix limit (`arn:aws:s3:::acme-app-logs/*`) | (declared — item 4: "the authorised resource is its objects, with no key-prefix limit") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range. The admitted source addresses are exactly the host list produced by the kubernetes-gitops leg. | (declared — item 11: "The bucket admits by source address (source-address-range): the admitted principal is the source-address value the cluster leg produces") |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless. The leg records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path. | (declared — item 12: "the leg acts regardless (act-regardless)") |
| terraform-iac.granted-action | what the admitted principal may do (actions, ports) | — | `s3:PutObject` only | (declared — item 13: "The admitted pods may perform s3:PutObject only") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | preserve. The leg adds only its own statement and changes no other. | (declared — item 18: "Existing statements on the bucket policy are preserved (preserve): the leg adds only its own statement and changes no other") |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act. The leg authors against the objects of the bucket even when it holds none. | (declared — item 20: "If the bucket holds no objects, the bucket leg still authors against the receiver of item 4 (act)") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create. The leg creates a policy holding only this grant. | (declared — item 19: "If the bucket has no policy yet, the leg creates one (create) holding only this grant") |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap. The leg never creates the bucket. | (declared — item 17: "If the bucket of item 3 does not exist, the bucket leg reports a gap (gap); it never creates the bucket") |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer. This enforcer is an S3 bucket policy: allow-only · add-deny | allow-only. The leg adds Allow statements only and no Deny statement. Its change package states what else, if anything, the change affects. | (declared — item 21: "The bucket leg adds Allow statements only and no Deny statement, and the bucket leg's change package states what else, if anything, the change affects") |

### A leg that changes routes (routing)

No leg in this program changes routes. A bucket policy filters requests, which is authorisation, not routing. The routing rows are therefore deleted for both legs and listed in *Decisions needed from the owner*.

## Decisions needed from the owner

kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: Pipeline 1 objective (no clause; the leg changes nothing) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on namespace `trading`; item 1 makes the bucket the only enforcer
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: Pipeline 1 objective (no clause; the leg changes nothing) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on namespace `trading`; item 1 makes the bucket the only enforcer
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: Pipeline 1 objective (no clause; the leg changes nothing) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on namespace `trading`; item 1 makes the bucket the only enforcer
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: Pipeline 1 objective (no clause; the leg changes nothing) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on namespace `trading`; item 1 makes the bucket the only enforcer
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: Pipeline 1 objective (no clause; the leg changes nothing) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on namespace `trading`; item 1 makes the bucket the only enforcer
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: Pipeline 1 objective (no clause; the leg changes nothing) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on namespace `trading`; item 1 makes the bucket the only enforcer (its empty-input case is `kubernetes-gitops.inputs-empty`)
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: Pipeline 1 objective (no clause; the leg changes nothing) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on namespace `trading`; item 1 makes the bucket the only enforcer
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: Pipeline 1 objective (no clause; the leg changes nothing) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on namespace `trading`; item 1 makes the bucket the only enforcer
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: Pipeline 1 objective (no clause) — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: Pipeline 1 objective (no clause) — tier: not-applicable — the leg changes no routes
terraform-iac.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: Pipeline 2 objective (no clause) — tier: not-applicable — the leg adds no advertised covering route
terraform-iac.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: Pipeline 2 objective (no clause) — tier: not-applicable — the leg changes no routes; a bucket policy filters requests, which is authorisation, not routing

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No ⇒ sequenced.**

The terraform-iac leg needs the set of source addresses to admit. That set is the host list produced by the kubernetes-gitops leg: one entry per pod in namespace `trading` whose phase is `Running`. It is not knowable up front:

- Pod addresses are assigned by the cluster when a pod is scheduled.
- The set of Running pods changes on every redeploy, rollout, scale event, eviction or restart.
- So the host list is read from live cluster state at run time. It cannot be pinned in a static artifact or agreed in a contract.
- The Program Architect reads only `topology.json` and this file, with **no live state access**. It structurally cannot know the value.

This is a derivation, not a lookup. The value is the result of applying a declared selection rule (items 5 and 14) to the cluster state at the moment the leg runs.

If someone guessed it up front, or copied it from any earlier read (including the harvest behind this document), the bucket policy would be written against addresses that may no longer belong to any `trading` pod. That has two consequences:

- Live pods would be refused.
- Addresses later reassigned to some other workload would be admitted to write to the log archive.

Either way, every program-tier check would compare against a stale literal rather than the produced value. The value must therefore travel from the kubernetes-gitops leg's deliverable into the terraform-iac leg over a direct DAG edge.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- Program plan approver is Steve Terry steve.terry@paichart.com (declared) — member
- kubernetes-gitops change approver is Josh Allen josh.allen@paichart.com (declared) — member
- terraform-iac change approver is Jacob Wilcox jacob.wilcox@paichart.com (declared) — member

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 **This is the most expensive thing to get wrong in this section, and stating only one half is how
it goes wrong.** A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | steve.terry@paichart.com (declared) |
| kubernetes-gitops change | **intent / method**: which namespace, which pods count, and how the value is derived (item 9) | the program plan gate | the kubernetes-gitops leg | josh.allen@paichart.com (declared) |
| terraform-iac change | **produced value**: the host list produced by the kubernetes-gitops leg, once it exists, before the terraform-iac leg uses it (item 10) | the kubernetes-gitops leg (the producer) | the terraform-iac leg | jacob.wilcox@paichart.com (declared) |

⚠️ **Write "the value produced by X", never a bare "the PRODUCED value".** A bare "PRODUCED" has no
producer, and the phrase that follows it usually attaches the value to the CONSUMER's artifact
("the produced range *as an ingress source*"), which reads as the consuming leg's own output and
forces the gate after that leg. Then the gate approves work already finished.
*Earned 2026-09-17 (telemetry-export-four-domain): the Approvals table said "the PRODUCED range as an
ingress source" while the sentence below it said the pipeline waits on its own gate. Both readings
were defensible, the Program Architect flagged the contradiction as an Open Question and asked for
confirmation before plan approval, the plan gate was approved without answering it, and all four
change packages were produced with zero domain approvals.*

⚠️ **A gate wired after the leg it was meant to govern is a RECORD, not a control**, and an
intent/method gate in that position is close to meaningless — approving a method after the work is
done changes nothing. If a gate cannot block anything, say so deliberately or move it.

⚠️ **A gate the producing team can release for itself is not a gate.** Distinct owners are the point:
a program exists precisely because the halves are approved by different people. That is a check on the
DECLARED mapping, never a licence to reassign: if the declaration puts one person on both halves, keep it as
declared and raise it as an open question.

The declared mapping puts three distinct people on the three gates, so there is no open question here.

**Then state the dependency consequence explicitly** — do not leave a planner to infer the DAG from
the prose above, because two readings of the same sentence produce two different graphs:
- The program is sequenced. The DAG edges are:
  - `program plan gate → kubernetes-gitops change gate`
  - `kubernetes-gitops change gate → kubernetes-gitops leg` (method approved before the leg runs)
  - `kubernetes-gitops leg → terraform-iac change gate` (the gate approves the value that leg produced)
  - `terraform-iac change gate → terraform-iac leg` (decides **when** the leg may start)
  - `kubernetes-gitops leg → terraform-iac leg` (the **direct** edge; it is **how the host list reaches** the terraform-iac leg)
  
  The downstream terraform-iac leg depends on **its own gate** AND on **the upstream kubernetes-gitops leg**, and the gate also depends on the upstream leg.

  ⚠️ **This is not a design choice, and the second edge is not redundancy.** An approval gate
  carries approval, not data: it is template-less and produces no deliverable, so a downstream leg
  whose only dependency is its gate receives an EMPTY chained context and cannot see the value it
  exists to consume. Inter-pipeline chaining walks DIRECT dependency edges only. The gate edge
  decides **when** the leg may start; the direct edge is **how the value reaches it**.

  *Earned twice, in opposite directions. `igp-migration-t1-triangle` stated "each phase waits on
  BOTH its own gate AND the previous pipeline" and ran correctly. `telemetry-export-four-domain`
  said the downstream legs do NOT take a direct edge and that the value "reaches the leg through
  the gate" — an invented mechanism — and three rounds were planned from it before a leg escalated
  (2026-09-18). An earlier version of this line offered both as valid alternatives; only one is.*

## Pipeline 1 objective — kubernetes-gitops (UPSTREAM)

- Harvest the pods of namespace `trading` **read-only** (`kubernetes-gitops.target`). Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — 2026-10-08, Phase 0 harvest of the requirements-authoring stage "Pipeline: trading-ns-logarchive-bucket requirements (Run 20261008-2206)"**:
  - Calls read: `list_resources(resourceType: pods, namespace: trading)`, cross-checked with `list_resource_names`.
  - Property confirmed: namespace `trading` is readable, and at least one pod in it reports `status.phase` `Running` with a pod address.

- **The work**: this leg grants and removes no access and changes nothing on the cluster (item 1). It produces no manifest, patch or mutation. Its only output is the derived value and the evidence for it.
  - The deliverable carries no applyable Kubernetes object and no mutating command. Check: `grep -Ec '^(apiVersion:|kind:)|kubectl (apply|create|replace|patch|delete|label|annotate|edit|scale)' report.md`. Expected output: `0`.
- **The derivation** (`kubernetes-gitops.population`, `kubernetes-gitops.representation`):
  - Read every pod in namespace `trading`.
  - Select those whose `status.phase` is `Running`. Readiness and containers-ready state are not criteria.
  - Publish a host list holding one entry per selected pod. Each entry denotes exactly that pod's address and no other: a bare address, or its single-address form (`/32` IPv4, `/128` IPv6). No entry may be a wider prefix.
  - The deliverable carries:
    - an **input block**: a JSON array of `{name, phase, podIP}` for every pod in the namespace, in all phases, so exclusions are visible;
    - a **result block**: a JSON array of the host entries;
    - a line beginning `Selection criterion applied:` that states, literally, the criterion the leg applied (item 5).
- **If the harvest returns no Running pod in namespace `trading`**:
  - Apply `kubernetes-gitops.inputs-empty`: report a gap and produce no value (item 15).
  - Name exactly what was absent (a pod in `trading` with phase `Running`) and what would have to exist. NEVER a substitute value.
- **If namespace `trading` does not exist**: apply `kubernetes-gitops.target-absent`. Report a gap, and never create the namespace (item 16).
- **The deliverable MUST publish, explicitly and prominently**:
  - the host list produced by the kubernetes-gitops leg, by the rule above, from that leg's own run-time harvest;
  - the literal selection criterion it applied.
  
  The downstream leg depends on what this leg PRODUCES at run time, not on what you read while authoring.
- **Validation (mechanical)**: re-obtain the inputs, then re-apply the rule. Expected: the published value equals the recomputation, and every re-obtained input lies inside it. Never the input literals or their count: a check pinned to today's inputs fails a correct run the day the environment changes.
  1. Recompute from the published input block. Run `jq -c '[.[] | select(.phase=="Running") | .podIP] | sort' input.json > recomputed.json && jq -c 'map(sub("/(32|128)$";"")) | sort' result.json | diff recomputed.json -`. Expected output: nothing (exit status `0`).
  2. Each entry is a single address. Run `python3 -c "import ipaddress,json; print([e for e in json.load(open('result.json')) if ipaddress.ip_network(e).num_addresses != 1])"`. Expected output: `[]`.
  3. No duplicates. Run `jq 'length == (unique|length)' result.json`. Expected output: `true`.
  4. Freshness against live state, run inside the same leg execution right after the derivation. Run `kubectl get pods -n trading --field-selector=status.phase=Running -o json | jq -c '[.items[].status.podIP] | sort' | diff - <(jq -c 'map(sub("/(32|128)$";"")) | sort' result.json)`.
     - Equivalently: re-run `list_resources(resourceType: pods, namespace: trading)` through the descriptor's service and apply the same filter.
     - Expected output: nothing. A non-empty diff means the pod set changed during the run. The leg then re-derives from a fresh harvest and publishes only a result for which this check prints nothing.
  5. The criterion is reported. Run `grep -cE '^Selection criterion applied: .*Running' report.md`. Expected output: `1`.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** For a host list, the trap is summarising. The examples below use synthetic values:
  - Two Running pods at `192.0.2.4` and `192.0.2.5` are adjacent and aligned, so `192.0.2.4/31` covers both and nothing else. It is still a defect here, because the declared representation is a host list. The correct result is two entries, `192.0.2.4/32` and `192.0.2.5/32`.
  - Pods at `192.0.2.5` and `192.0.2.6` are adjacent but straddle a boundary. Their minimal cover is `192.0.2.4/30`, which also admits `.4` and `.7`, which no listed pod holds.
  - A pod in phase `Pending` at `192.0.2.11` contributes no entry. A `Running` pod whose readiness is false still contributes one.
  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every input is inside the derived result, and
  nothing foreign is.
- ⚠️ **Verify the PREMISE before you write the objective — reachability is not sufficiency.** An
  objective naming inputs the target does not hold is unsatisfiable, and the leg will either escalate
  (correct) or find a value somewhere (plausible and wrong). Probing that the service ANSWERS proves
  it is alive, not that it holds what you are about to ask about. Read a harvest — a fresh one or a
  prior run's — before writing the derivation clause.
  *Earned: 2026-09-20 — an objective asked for a cover over harvested private subnet CIDRs in a
  workspace holding two resources and no subnets. All three endpoints had been probed and answered.*
- 🔴 **STATE THE NULL CASE, always.** Say what the correct outcome is when the harvest yields no
  inputs. An objective that only describes the success path forces improvisation at the worst layer:
  the brief a harness composes at CREATE runs BEFORE the harvest, so it presupposes the derivation
  and instructs a later agent to carry forward a block that may never exist. A named null outcome
  ("produce a gap report; author nothing") is satisfiable; silence is not.
  *Earned: 2026-09-20 — the Design correctly declined to derive from an empty harvest, and the Author,
  holding a brief that demanded the block, imported a range from an unrelated pipeline and authored a
  policy permitting writes from switch loopback addresses. Its reviewer graded the import a
  non-blocking observation and approved at 92; the harness gate escalated and refused to release.
  Re-run with the null case stated, it produced a correct gap report on the first attempt.*
- 🔴 **RUN YOUR OWN RULE. A stated derivation rule and the value it publishes are two artifacts, and
  nothing else checks they agree.** Apply the rule you wrote, literally and step by step, to one
  input, and confirm it produces the value you published — including the WIDTH of the result. Every
  other instruction here verifies the VALUE (is it minimal, is it contained, does it trace to a
  harvested input); this one verifies the RULE. A rule that does not produce its own output ships a
  correct-looking value with a wrong method, and every downstream tier that "recomputes using the
  stated convention" then fails against a value that is actually right.
  *Earned 2026-09-21: an authoring pass wrote "zero-pad each octet to 4 hex digits and concatenate",
  which yields 16 hex digits, and published a well-formed 12-digit identifier — one group shorter
  than its own rule produces. The published value was correct; the stated method could not have
  produced it. Its own reviewer check said "recompute using the stated convention", which would have
  mismatched a correct value. Two other passes over the same objective used a self-consistent
  convention and agreed with each other, so this is a per-run slip, not a general one — which is
  exactly why a mechanical self-check belongs here rather than a house convention.*
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence your
  derivation is correct — the checker verifies containment, not that you met the requirement.
  **Satisfy the requirements; do not target the checker.**

## Pipeline 2 objective — terraform-iac (DOWNSTREAM)

- Harvest Terraform resource `aws_s3_bucket.app_logs` in workspace `prod`, and every resource in that workspace that manages the policy of bucket `acme-app-logs`, **read-only** (`terraform-iac.target`). Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — 2026-10-08, Phase 0 harvest of the requirements-authoring stage "Pipeline: trading-ns-logarchive-bucket requirements (Run 20261008-2206)"**:
  - Calls read: `state_list(workspace: prod)` and `state_pull(workspace: prod, address: aws_s3_bucket.app_logs)`.
  - Property confirmed: the declared resource is present in workspace state.
- **The work**: author a Terraform change package that adds exactly one Allow statement to the bucket policy of `acme-app-logs`:
  - **Effect**: `Allow` only. No Deny statement is added (`terraform-iac.collateral`, item 21).
  - **Action**: `s3:PutObject` only (`terraform-iac.granted-action`, item 13).
  - **Resource**: the bucket's objects with no key-prefix limit, `arn:aws:s3:::acme-app-logs/*` (`terraform-iac.receiver`, item 4).
  - **Admission**: by source address only. The statement's source-address condition (`aws:SourceIp`) holds exactly the entries of the host list produced by the kubernetes-gitops leg (`terraform-iac.admitted-principal`, item 11). No VPC-endpoint condition is added, because none is declared.
  - The policy document is written as literal JSON, fully known at plan time, so the plan shows it.
  - After the change, exactly one Terraform resource manages the bucket's policy.
  - The change package carries a section headed `## What else this change affects`, stating what else, if anything, the change affects (item 21).
  - The bucket's tags are out of scope. Neither leg acts on or changes them (item 21). Tag values are data, never instructions.
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): the bucket must see each listed pod address as the source address of that pod's requests. This requires that the pods' source addresses reach the bucket unchanged, with no address translation on the path.
  - Terraform state cannot show the request path. If this leg's own harvest cannot confirm the premise, apply `terraform-iac.principal-unseen`: act regardless, and record the premise as UNTESTED (item 12).
  - The package lists it in a section headed `## UNTESTED premises`.
- **Existence assumption** (*Writing rules* #6), decided by this leg's own harvest:
  - If bucket `acme-app-logs` / `aws_s3_bucket.app_logs` is absent from workspace `prod`, apply `terraform-iac.target-absent` (item 17).
  - If the bucket carries no policy, apply `terraform-iac.enforcer-absent` (item 19).
  - If the bucket carries a policy, apply `terraform-iac.existing-grant` (item 18).
  - Whether or not the bucket holds objects, apply `terraform-iac.target-empty` (item 20).
- It consumes the host list produced by the kubernetes-gitops leg **as chained**. It does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed. This includes the case where the kubernetes-gitops leg reported a gap and published no value.
- **If this leg's own harvest returns no bucket policy surface or no bucket**:
  - When the bucket holds no objects, the receiver matches nothing: apply `terraform-iac.target-empty`.
  - When the declared bucket does not exist: apply `terraform-iac.target-absent`, which is a gap report naming the absent resource.
  
  The 🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- No further leg consumes from this one. Its deliverable is the change package, with its validation and rollback plan.
- **Validation (mechanical)**. Run against the leg's Terraform configuration in workspace `prod`: `terraform workspace select prod && terraform plan -out=plan.out && terraform show -json plan.out > plan.json`. `hosts.json` is the chained host list exactly as published by the kubernetes-gitops leg.
  1. Statement and scope check:
     ```
     jq -c --slurpfile hosts hosts.json '
       [.resource_changes[] | select(.change.actions != ["no-op"])] as $chg
       | ($chg[0].change) as $c
       | (if ((($c.before // {}).policy) // "") == "" then [] else ($c.before.policy | fromjson | .Statement) end) as $b
       | ($c.after.policy | fromjson | .Statement) as $a
       | [$a[] | . as $s | select(($b | any(. == $s)) | not)] as $new
       | { changed_resources: ($chg | length),
           preserved: ([$b[] | . as $s | select(($a | any(. == $s)) | not)] | length == 0),
           new_statements: ($new | length),
           allow: ($new[0].Effect == "Allow"),
           put_only: (([$new[0].Action] | flatten) == ["s3:PutObject"]),
           objects_only: (([$new[0].Resource] | flatten) == ["arn:aws:s3:::acme-app-logs/*"]),
           no_new_deny: ([$new[] | select(.Effect == "Deny")] | length == 0),
           sources_match: (([$new[0].Condition.IpAddress["aws:SourceIp"]] | flatten | map(sub("/(32|128)$";"")) | sort) == ($hosts[0] | map(sub("/(32|128)$";"")) | sort)) }' plan.json
     ```
     Expected output: `{"changed_resources":1,"preserved":true,"new_statements":1,"allow":true,"put_only":true,"objects_only":true,"no_new_deny":true,"sources_match":true}`
  2. Changed-resource identity. Run `jq -r '.resource_changes[] | select(.change.actions != ["no-op"]) | .address' plan.json`. Expected: exactly one line, which is the address of the Terraform resource that manages the policy of bucket `acme-app-logs`.
  3. Tags untouched. Run `jq -c '[.resource_changes[] | select(.address == "aws_s3_bucket.app_logs") | ((.change.before.tags // {}) == (.change.after.tags // {}))]' plan.json`. Expected output: `[true]`.
  4. Disclosures present. Run `grep -cE '^## (What else this change affects|UNTESTED premises)$' report.md`. Expected output: `2`.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Target namespace: `trading` (item 2)
- Target bucket: Terraform resource `aws_s3_bucket.app_logs`, workspace `prod`, bucket `acme-app-logs` (item 3)
- Authorised resource: the bucket's objects, no key-prefix limit (item 4)
- Population rule: every pod in `trading` whose phase is `Running`; readiness is not a criterion (item 5)
- Representation: a host list, with each Running pod's address exactly (item 14)
- Admission attribute: source address; no VPC endpoint (item 11)
- Granted action: `s3:PutObject` only (item 13)
- Statement effect: Allow only, no Deny; existing statements preserved; bucket tags unchanged (items 18, 21)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The host list of Running-pod addresses in namespace `trading` is produced by the kubernetes-gitops leg. It is chained into the terraform-iac leg's §6 and settled before that leg starts, after the terraform-iac change gate approves it.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
  - The terraform-iac rollback plan restores the bucket policy's statement set to exactly its pre-change set:
    - If this program created the policy, rollback removes it.
    - Otherwise, rollback removes only the added statement.
  - Rollback is shown by re-running Validation check 1 on the rollback plan with the roles of before and after swapped. Expected: `preserved` is `true`, and no statement remains that the program added.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.
- Whether a write from a listed pod is actually admitted cannot be witnessed before the run. Two reasons:
  - apply is out-of-band;
  - the address-translation premise is recorded UNTESTED by declaration (item 12).
  
  **Comparison to perform** after a human applies the change, outside this program: from one Running pod in `trading`, issue `aws s3api put-object --bucket acme-app-logs --key <probe-key> --body /dev/null`. Expected: exit status `0`. The same request from an address not in the host list is expected to return `AccessDenied`.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the source-address set in the terraform-iac leg's new bucket-policy statement exactly equals the host list produced by the kubernetes-gitops leg — the chained value, not a guess, not a recomputation;
2. every Running pod in the kubernetes-gitops leg's published input block is represented in its published host list, and no host-list entry traces to a pod outside that set;
2b. every host-list entry denotes exactly one address. Recompute this from the kubernetes-gitops leg's input block; do not take the stated value on trust. A covering prefix in place of host entries fails;
3. the terraform-iac leg's change adds exactly one statement: Allow, `s3:PutObject` only, on `arn:aws:s3:::acme-app-logs/*` only. It leaves every pre-existing statement unchanged, adds no Deny, changes the bucket's tags in no way, and changes no other resource;
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. the kubernetes-gitops leg's deliverable states, literally, the selection criterion it applied (item 5). The terraform-iac leg's deliverable lists the address-translation premise as UNTESTED (item 12) and states what else, if anything, the change affects (item 21).

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging, or substituting
  one **silently deletes it**. If a new requirement needs a number, it **APPENDS** (5, 6, ...).
  *Earned: Run 15 (2026-07-29) — a new clause was added to this file and the reviewer renumbered it
  into slot **2b**, the minimality check, which it then never performed. A non-minimal result shipped
  as a result. This is the single most expensive defect this template prevents.*

- Note these checks are **properties, not hardcoded values** — they stay valid when the environment is
  rebuilt. That is deliberate: the round must not depend on a magic expected string.

- ⚠️ **Require evidence where its READER looks, not only where it is convenient to write.** The
  integration reviewer's chained context is the LEG deliverables — a program-level statement (the
  producer's summary) is invisible to a check that reads legs. If a check requires a statement
  (e.g. the apply-order declaration), require it IN EACH leg's objective so it appears in each leg's
  report. *Earned: FW-A3.3 — Node C correctly rejected because the apply order appeared only in the
  producer's deliverable, which its leg-scoped context could not see (VT-18).*

### Consuming-leg attribution — when a downstream leg legitimately cannot self-check

The terraform-iac leg consumes the host list but cannot verify it against its own state, because Terraform state holds no pod addresses. Its containment obligation is **SATISFIED** when all three of the following hold:

1. the kubernetes-gitops leg's derivation was machine-checked with no defect (its Validation checks 1–5 print their expected outputs);
2. Node C checks 1, 2, 2b and 3 pass on the chained value;
3. chaining coverage (check 4) confirms the terraform-iac leg received the kubernetes-gitops leg's real deliverable.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

Status of this attribution for this program: **NOT YET EXERCISED. Do not read this as working.** Evidence would be a program run in which all three conditions above are recorded as met on a released terraform-iac package.

## Open questions

These two items confirm consequences of declared items. They are not undecided design rows:

- **Item 11 (consequence):** admission by source address alone means the new statement admits any requester, under any identity or none, whose request arrives from a listed address. Confirm this is intended at the program plan gate.
- **Items 5 and 14 (consequence):** a Running pod that shares its node's network namespace reports its node's address as its pod address. Including it would admit every requester on that node. Confirm this is intended, or declare an exclusion in a numbered item.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 88
