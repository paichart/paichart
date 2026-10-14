> ⚠ **NOT RELEASED — quality gate: needs-revision**
> This document is the composed draft deliverable exactly as produced; the run's release gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline task (quality-gate metadata and final comment).

# Program Requirements — Telemetry collector sender restriction

- Authored in: Telemetry collector access control · Requirements
- Iteration: Run 20261011-0927 · 2026-10-11

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct
  DOMAIN or a PHASE of one — see the definition above; do not call two phases of one protocol two
  domains:
  1. **kubernetes-gitops** (UPSTREAM) on the pods of the Kubernetes namespace `trading`, described in `topology.json`.
  2. **observability-config** (DOWNSTREAM) on the ingress proxy in front of the telemetry collector's receiver.
- These are explicitly **out of scope**:
  - any namespace other than `trading`
  - any change on the cluster: the objective declares no cluster change, so the kubernetes-gitops leg publishes the sender set and authors nothing on the cluster
  - the telemetry collector's own configuration
  - any proxy server block, location, port or forwarded path other than the sender-endpoint forwarding blocks (item 21)
  - keeping the sender set up to date after the program (item 6)
  - applying any change

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of the Kubernetes namespace `trading` | (declared — item 1: "acts on the pods of the Kubernetes namespace `trading`") |
| observability-config.target | which surface of the leg's service does it act on | — | the ingress proxy in front of the telemetry collector's receiver | (declared — item 2: "acts on the ingress proxy in front of the telemetry collector's receiver") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | a pod in namespace `trading` whose phase is Running. Pods on the host's network and pods whose deletion has been requested are excluded | (declared — item 4: "a pod in the declared namespace whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: one entry per member pod's address, with no covering prefix | (declared — item 5: "expressed as a host list: one entry per member pod's address, with no covering prefix") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: publish no sender set and report a gap naming what was absent | (declared — item 20: "the kubernetes-gitops leg publishes no sender set and reports a gap naming what was absent (gap)") |
| kubernetes-gitops.maintenance | whether the sender set is maintained after the program | point-in-time · maintained | point-in-time as of the leg's harvest. The deliverable states the harvest time | (declared — item 6: "point-in-time as of the leg's harvest"); (declared — item 6: "Nothing maintains the set after the program") |
| approver.program-plan | who approves this gate | — | jacob.wilcox@paichart.com | (declared — item 7: "The program plan gate is approved by jacob.wilcox@paichart.com") |
| approver.kubernetes-gitops-change | who approves this gate | — | josh.allen@paichart.com | (declared — item 8: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.observability-config-change | who approves this gate | — | steve.terry@paichart.com | (declared — item 9: "The observability-config change gate is approved by steve.terry@paichart.com") |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 10: "sits after that leg and before the observability-config leg (after-producer-before-consumers)") |
| gate.observability-config-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion | (declared — item 11: "sits after that leg and before its completion (after-leg-before-completion)") |

### A leg that grants or removes access (authorisation)

**observability-config** is the authorisation leg. Its rows:

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| observability-config.receiver | which workload/resource on the target is authorised | — | the collector's OTLP sender endpoints, gRPC and HTTP, exposed through the proxy | (declared — item 3: "the collector's OTLP sender endpoints, gRPC and HTTP, exposed through the proxy") |
| observability-config.sender-blocks | which proxy forwarding blocks are the collector's OTLP sender endpoints (item 3), and which are other paths the proxy forwards into the collector. This matters when more than one block forwards to the same collector receiver | description-marked (a block whose own description identifies it as the sender ingress) · every-block-forwarding-to-an-OTLP-receiver · owner-named-blocks (name them) | OPEN — no gap outcome is declared for this row. Until it is answered, the leg reports a gap that names this row | OPEN — item 3 says any other path into the collector is not a sender endpoint, but no item says which attribute separates a sender-endpoint block from another block that forwards to the same receiver; options: description-marked · every-block-forwarding-to-an-OTLP-receiver · owner-named-blocks |
| observability-config.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: the member pods' addresses, as the host list produced by the kubernetes-gitops leg | (declared — item 12: "admits senders by source address: the member pods' addresses, as the host list in item 5") |
| observability-config.request-path | the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) | direct · private-endpoint · translated | direct: each request reaches the proxy carrying the pod's own address | (declared — item 13: "reach the proxy directly, carrying each pod's own address (direct)") |
| observability-config.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless: the deliverable states the premise as owner-declared, not observed | (declared — item 14: "the leg acts anyway (act-regardless)") |
| observability-config.granted-action | what the admitted principal may do (actions, ports) | — | submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP, and nothing else on those endpoints | (declared — item 15: "may submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP (item 3), and nothing else on those endpoints") |
| observability-config.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | replace: in every sender-endpoint forwarding block, the allowances become exactly the sender set, followed by a deny for everything else | (declared — item 16: "the allowances are replaced by exactly the sender set, followed by a deny for everything else (replace)") |
| observability-config.non-sender-paths | what happens to proxy blocks that forward other paths into the collector | leave-unchanged · restrict | the leg leaves them unchanged and lists each one in its deliverable as unchanged by owner decision | (declared — item 16: "the leg leaves them unchanged, and lists each one in its deliverable as unchanged by owner decision (item 3)") |
| observability-config.target-empty | the receiver selector/surface matches nothing now | act · gap | gap: report a gap and author nothing | (declared — item 17: "the observability-config leg reports a gap and authors nothing (gap)") |
| observability-config.enforcer-absent | no policy object governs the receiver yet | create · gap | create: add the access directives to that block | (declared — item 18: "the observability-config leg adds them to that block (create)") |
| observability-config.target-absent | the declared target itself does not exist | gap · create-target | gap: report a gap and create nothing | (declared — item 19: "the observability-config leg reports a gap and creates nothing (gap)") |
| observability-config.collateral | what else on the target changes because enforcement now applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) | nothing outside the sender-endpoint forwarding blocks changes | (declared — item 21: "no other server block, location, port or forwarded path on the proxy changes") |
| observability-config.shared-access | a sender endpoint shares an access setting with a non-sender path, so the restriction cannot be confined | gap · widen | gap: report a gap instead of widening the change | (declared — item 21: "it reports a gap instead of widening the change") |
| observability-config.upstream-empty | the kubernetes-gitops leg published no sender set | no-change (gap) · deny-all | make no change to the proxy and report the upstream gap. Never write a deny-everything rule from an empty set | (declared — item 20: "the observability-config leg makes no change to the proxy and reports the upstream gap; it never writes a deny-everything rule from an empty set") |

**kubernetes-gitops** is not an authorisation leg. It publishes the sender set and grants or removes no access on its own target, which is the namespace's pods. Its authorisation rows are deleted and are listed as `not-applicable` in *Decisions needed from the owner*.

### A leg that changes routes (routing)

No leg in this program changes routes. The observability-config leg filters traffic at the proxy, which is authorisation, not routing. The routing rows for both legs are deleted and are listed as `not-applicable` in *Decisions needed from the owner*.

## Decisions needed from the owner

<!-- one line per row that is not simply declared:
<row id> — <question> — options: <enum> — governs: <which leg clause> — tier: blocking | confirm | default | not-applicable -->
observability-config.sender-blocks — which proxy forwarding blocks are the collector's OTLP sender endpoints (item 3), and which are other paths the proxy forwards into the collector, when more than one block forwards to the same collector receiver — options: description-marked (a block whose own description identifies it as the sender ingress) · every-block-forwarding-to-an-OTLP-receiver · owner-named-blocks (name them) — governs: Pipeline 2 block selection, and through it every clause applying observability-config.existing-grant, .enforcer-absent, .target-empty, .non-sender-paths, .shared-access and .collateral — tier: blocking
kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in — options: direct · private-endpoint · translated — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.target-absent — the declared target itself does not exist — options: gap · create-target — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: no Pipeline 1 clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target: it publishes the sender set and changes nothing on the namespace's pods
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no Pipeline 1 clause — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no Pipeline 1 clause — tier: not-applicable — the leg changes no routes
observability-config.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no Pipeline 2 clause — tier: not-applicable — the leg adds no advertised covering route
observability-config.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no Pipeline 2 clause — tier: not-applicable — the leg changes no routes: it filters traffic at the proxy, which is authorisation, not routing

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

State *why* the value is not knowable up front. The strongest form is an objective test — e.g. *the
value changes on every environment rebuild, so it cannot be pinned in a static artifact or agreed in
a contract, and the Program Architect (which reads only `topology.json` + this file, with **no live
state access**) structurally cannot know it.*

**Answer: No, so the program is sequenced.** The observability-config leg needs the sender set. The sender set is the address of every pod in namespace `trading` that meets item 4, read at the moment of the kubernetes-gitops leg's harvest (item 6). That value is not knowable up front, for three reasons:

- **Addresses change.** The cluster assigns pod addresses when it schedules a pod, and every reschedule, rollout or restart changes them.
- **Membership changes.** It changes as pods start, finish or are marked for deletion.
- **The Program Architect cannot see it.** It has no live state access, so it cannot read the pods.

This is a design decision, not a lookup. The owner declared *which pods count* (item 4) and *how they are expressed* (item 5). The value itself exists only once those rules are applied to live state.

If someone guessed the value up front, the proxy would admit addresses that may since have been given to other pods, including pods outside the declared namespace. It would also refuse current senders, and the restriction would be wrong on the day it was applied. Only the kubernetes-gitops leg can produce the value. It must reach the observability-config leg on a direct DAG edge.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- Program plan approver is Jacob Wilcox jacob.wilcox@paichart.com (declared) — member (PROJECT_MANAGER)
- kubernetes-gitops change approver is Josh Allen josh.allen@paichart.com (declared) — member (SALES_ENGINEER)
- observability-config change approver is Steve Terry steve.terry@paichart.com (declared) — member (OWNER)

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 **This is the most expensive thing to get wrong in this section, and stating only one half is how
it goes wrong.** A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

Fill the table with both columns, never just the first:

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | jacob.wilcox@paichart.com (declared) |
| kubernetes-gitops change | the sender set produced by the kubernetes-gitops leg (a produced value; its producer is the kubernetes-gitops leg) | the kubernetes-gitops leg | the observability-config leg | josh.allen@paichart.com (declared) |
| observability-config change | the change package produced by the observability-config leg (a produced value; its producer is the observability-config leg) | the observability-config leg | the observability-config leg's completion, and with it the release of its package for out-of-band apply | steve.terry@paichart.com (declared) |

The observability-config change gate sits after its own leg by declaration (item 11). This is deliberate. It does not govern how the package is authored. It controls whether the package is released for apply, which happens out-of-band and is human-gated. It approves a produced value that already exists, so its position matches its kind.

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

The declared mapping names three different people for the three gates.

**Then state the dependency consequence explicitly** — do not leave a planner to infer the DAG from
the prose above, because two readings of the same sentence produce two different graphs:
- The observability-config leg depends on **its upstream gate**, the kubernetes-gitops change gate, AND on **the upstream leg**, kubernetes-gitops. The gate also depends on the upstream leg. Write all three edges:
  - `kubernetes-gitops leg → kubernetes-gitops change gate`
  - `kubernetes-gitops leg → observability-config leg`
  - `kubernetes-gitops change gate → observability-config leg`

  The observability-config change gate depends on the observability-config leg, `observability-config leg → observability-config change gate`, and it blocks that leg's completion.

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

- Harvest the pods of the Kubernetes namespace `trading` **read-only** (`kubernetes-gitops.target`). Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — 2026-10-11, Phase 0 harvest of authoring run 20261011-0927**: a pod-name listing of the namespace, then one `get_resource` read per pod. Together they confirmed that at least one pod in the namespace meets the item 4 criterion. No read found an attribute that marks a pod as a telemetry sender. Item 4 does not need one.

- **Work.** Apply the population rule (`kubernetes-gitops.population`) to every pod the leg's own harvest returns from namespace `trading`. A pod is a member when its `status.phase` is `Running`, its `spec.hostNetwork` is not `true` (absent means false), and it has no `metadata.deletionTimestamp`. Publish the members as the sender set (`kubernetes-gitops.representation`).
- **No cluster change.** The leg authors nothing on the cluster. Its change package is the published sender set. No cluster rollback is needed because nothing on the cluster changes.
- **Point-in-time.** The sender set is point-in-time as of this leg's harvest (`kubernetes-gitops.maintenance`), and the deliverable states the harvest time.
- **Derivation.** The address of each member is its `status.podIP`. The sender set is a host list with one entry per member pod's address, each a single host address with no prefix length. It has no duplicates and no covering prefix. The deliverable publishes the literal criterion it applied (item 4), exactly the filter it ran, on one line beginning `Criterion applied: `.
- **If the harvest returns no pod meeting item 4** (including when the namespace is absent), apply `kubernetes-gitops.inputs-empty`: publish no sender set and report a gap. The gap report must say:
  - what was absent: no pod in namespace `trading` with phase Running that is neither on the host's network nor marked for deletion
  - for each pod that was harvested, which of those conditions excluded it
  - what would have to exist: at least one such pod

  The leg never publishes a substitute value.
- **The deliverable MUST publish, explicitly and prominently**:
  - **the sender set produced by the kubernetes-gitops leg**: the host list obtained by applying the item 4 criterion to this leg's own harvest of namespace `trading`
  - the literal criterion line
  - the harvest time, on one line `Harvest time: <ISO-8601 UTC timestamp>`
  - the input block: the pod read the set was derived from, carried as a Kubernetes List JSON (`{"items":[...]}`) and shipped as `pods-input.json`
  - the set itself, shipped as `sender-set.txt` with one address per line

  The downstream leg depends on what this leg PRODUCES at run time, not on what you read while authoring.
- **Validation (mechanical)**: re-obtain the inputs from the published input block, then re-apply the item 4 rule. Expected: the published value equals the recomputation, and every re-obtained input lies inside it.
  1. Recompute the set and diff it against the published set:
     ```
     jq -r '.items[]
       | select(.metadata.namespace == "trading")
       | select(.status.phase == "Running")
       | select((.spec.hostNetwork // false) == false)
       | select(.metadata.deletionTimestamp == null)
       | .status.podIP' pods-input.json | sort -u > recomputed.txt
     diff recomputed.txt <(sort -u sender-set.txt) && echo "exit=0"
     ```
     Expected output, exactly: `exit=0`
  2. No entry carries a prefix length: `grep -c '/' sender-set.txt` → expected output: `0`
  3. No duplicate entries: `sort sender-set.txt | uniq -d | wc -l` → expected output: `0`
  4. The criterion and the harvest time are stated:
     - `grep -c '^Criterion applied: ' report.md` → expected output: `1`
     - `grep -cE '^Harvest time: [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?Z$' report.md` → expected output: `1`
  5. Null branch only. Run step 1's `jq` against the input block and take `wc -l < recomputed.txt`. Expected output: `0`. Then `test -e sender-set.txt; echo "exit=$?"` → expected output: `exit=1`.

  **A live comparison, not a pass/fail check.** A grader with cluster read access may run the same `jq` filter against `kubectl get pods -n trading -o json`. Because the set is point-in-time (item 6), a difference from the published set after the stated harvest time is not a defect of this leg. Any difference is reported to the kubernetes-gitops change gate approver for the approval decision.

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
- ⚠️ **Verify by arithmetic, never by eyeballing.** For a pod host list, these are the traps:
  - **The address is the pod's own `status.podIP`, never `status.hostIP`.** `hostIP` is the node's address, and admitting it admits every pod on that node.
  - **Read the phase from `status.phase`, never from the STATUS column of a pod listing.** That column shows `Terminating` for a pod whose phase is still `Running` but whose deletion has been requested. Item 4 excludes that pod even though its phase reads Running.
  - **Item 5 forbids a covering prefix even where it looks exact.** Synthetic members `192.0.2.10` and `192.0.2.11` are an aligned pair that a `/31` covers exactly, yet `192.0.2.10/31` is still a defect here. Synthetic `192.0.2.11` and `192.0.2.12` are adjacent but straddle a boundary: their minimal cover is a `/30` that also admits two non-members.
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

## Pipeline 2 objective — observability-config (DOWNSTREAM)

- Harvest **read-only**:
  - the ingress proxy in front of the telemetry collector's receiver (`observability-config.target`), including every proxy block that forwards into the collector, with its listen directives, forwarding target, access directives and own description
  - the collector's receiver configuration, needed to identify the OTLP sender endpoints (`observability-config.receiver`)

  Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — 2026-10-11, Phase 0 harvest of authoring run 20261011-0927**: a collector-config read and a proxy-config read. They confirmed four properties:
  - the collector's OTLP receivers are reachable only through the proxy
  - the collector itself exposes no source-address control
  - at least one proxy block forwards to an OTLP receiver
  - at least one forwarding block's own description places it outside the sender allowlist, so blocks inside and outside that allowlist can forward to the same collector receiver. This is why `observability-config.sender-blocks` is a row.
- **Select the sender-endpoint blocks** per `observability-config.sender-blocks`. That row is **OPEN**: until the objective answers it, the leg reports a gap naming `observability-config.sender-blocks` and authors nothing. The remaining clauses apply to the blocks that row selects once it is answered.
- **Work.** In every selected block, apply `observability-config.existing-grant`. The block's access list becomes exactly one allow per entry of the sender set produced by the kubernetes-gitops leg, followed by a deny for everything else. No allow-everything directive remains.
- **Grant.** Admitted senders may submit telemetry on the selected endpoints and nothing else on them (`observability-config.granted-action`). The leg adds no location, route or forwarding target to a selected block. The only lines it changes are access directives.
- **Blocks that forward other paths into the collector** are left unchanged. The deliverable lists each one under the heading `Unchanged by owner decision (item 3)` (`observability-config.non-sender-paths`).
- **Confinement** (`observability-config.collateral`): no server block, location, port or forwarded path outside the selected blocks changes.
- **Shared access setting.** The leg's harvest may find that a selected block's access setting also governs a non-sender path, for example an access list inherited from an enclosing context that a non-sender location also inherits. In that case apply `observability-config.shared-access`: report a gap naming the shared setting and do not widen the change.
- **Exemplar stanza for an nginx-family proxy.** This applies both when access directives are added to a block that has none (`observability-config.enforcer-absent`) and when they replace existing ones (`observability-config.existing-grant`). The lines go in each selected block, in the context that holds its forwarding directive. Every line, in order:
  ```
  allow <sender-address-1>;
  allow <sender-address-2>;
  allow <sender-address-N>;
  deny all;
  ```
  - There is one `allow` line per sender-set entry, in the order the kubernetes-gitops leg published them, then exactly one `deny all;` as the last access directive.
  - Forbidden tokens:
    - `allow all;`
    - any `/` prefix length on an allow line
    - `satisfy any;`
    - any `deny` before the last `allow`
    - Apache dialect (`Require ip`, `Order allow,deny`)
    - firewall dialect (`iptables`, `-s <cidr> -j ACCEPT`)
  - If the leg's own harvest reads a proxy that is not nginx-family, it carries that proxy's own equivalent syntax with the same shape, names that dialect's forbidden tokens, and ships validation commands of the same form with the same expected outputs.
- **Admitted-principal premise** (`observability-config.admitted-principal`): the proxy's allow/deny evaluation must see each sender's own pod address as the source address of the request. The path is direct, carrying each pod's own address (`observability-config.request-path`).
  - If the leg's own harvest confirms this, the deliverable states the premise as observed and names the read.
  - If the harvest cannot confirm it, apply `observability-config.principal-unseen` (act-regardless). The leg acts, states the premise in its deliverable as owner-declared, not observed (item 13), and lists it under **UNTESTED premises**.
  - Either way, `report.md` carries exactly one line beginning `Admitted-principal premise: ` ending in `observed` or `owner-declared, not observed`.
- **Existence assumption** (*Writing rules* #6):
  - if the leg's own harvest finds the proxy itself absent, apply `observability-config.target-absent`
  - if the proxy is present but no block forwards to the OTLP sender endpoints, apply `observability-config.target-empty`
  - if a selected block carries no access directives, apply `observability-config.enforcer-absent`
  - if a selected block carries access directives, apply `observability-config.existing-grant`
- It consumes **the sender set produced by the kubernetes-gitops leg** **as chained**. It does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
  - **If §6 carries the kubernetes-gitops leg's gap report instead of a sender set**, apply `observability-config.upstream-empty`: make no change to the proxy and report the upstream gap. Never write a deny-everything access list from an empty set.
- **If this leg's own harvest returns no sender-endpoint forwarding blocks**: apply `observability-config.target-empty` (gap). **If the proxy does not exist**: apply `observability-config.target-absent` (gap). The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- **No further leg consumes from this one.** Its deliverable is the change package the observability-config change gate approves. The package ships:
  - the baseline and candidate copies of every proxy file the harvest read, complete and runnable
  - the line range of each selected block in both copies
  - the chained sender set as received, saved as `sender-set.txt`
  - the rollback plan: restore every baseline file byte-identically
- **Validation (mechanical)**. These are per selected block. `<candidate-file>`, `<baseline-file>`, `<start>,<end>` (the candidate range) and `<b-start>,<b-end>` (the baseline range) are the values the package lists.
  1. Allow set equals the chained sender set:
     ```
     sed -n '<start>,<end>p' <candidate-file> \
       | sed -nE 's/^[[:space:]]*allow[[:space:]]+([^;[:space:]]+)[[:space:]]*;.*/\1/p' \
       | sort -u | diff - <(sort -u sender-set.txt) && echo "exit=0"
     ```
     Expected output, exactly: `exit=0`
  2. The last access directive is the deny:
     `sed -n '<start>,<end>p' <candidate-file> | grep -E '^[[:space:]]*(allow|deny)[[:space:]]' | tail -n1 | tr -d '[:space:]'`
     Expected output: `denyall;`
  3. No allow-everything directive remains:
     `sed -n '<start>,<end>p' <candidate-file> | grep -cE '^[[:space:]]*allow[[:space:]]+all[[:space:]]*;'`
     Expected output: `0`
  4. Only access lines changed inside the block:
     ```
     diff <(sed -n '<b-start>,<b-end>p' <baseline-file> | grep -vE '^[[:space:]]*(allow|deny)[[:space:]]') \
          <(sed -n '<start>,<end>p' <candidate-file> | grep -vE '^[[:space:]]*(allow|deny)[[:space:]]') && echo "exit=0"
     ```
     Expected output: `exit=0`
  5. Nothing outside the selected blocks changed:
     - `diff <(sed '<b-start>,<b-end>d' <baseline-file>) <(sed '<start>,<end>d' <candidate-file>) && echo "exit=0"`, with one `-e '<range>d'` per selected block in the file. Expected output: `exit=0`
     - For every proxy file containing no selected block: `cmp -s <baseline-file> <candidate-file> && echo "exit=0"`. Expected output: `exit=0`
  6. Syntax. The package ships the exact `nginx -t` invocation it ran against the complete candidate configuration, in an environment where the forwarding targets resolve, and its literal output. Expected, exactly two lines:
     `nginx: the configuration file <path> syntax is ok` and `nginx: configuration file <path> test is successful`
  7. Premise line: `grep -cE '^Admitted-principal premise: .*(observed|owner-declared, not observed)$' report.md`. Expected output: `1`
  8. Upstream-empty branch only. For every proxy file: `cmp -s <baseline-file> <candidate-file> && echo "exit=0"`. Expected output: `exit=0`. No access list was written.
  9. Rollback. After restoring, `cmp -s <baseline-file> <restored-file> && echo "exit=0"`. Expected output: `exit=0`

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Namespace from which senders are drawn: `trading` (item 1)
- Membership criterion: phase Running, excluding pods on the host's network and pods whose deletion has been requested (item 4)
- Representation: a host list with one entry per member pod's address and no covering prefix (item 5)
- Freshness: point-in-time as of the kubernetes-gitops leg's harvest; nothing maintains the set afterwards (item 6)
- Enforcement target: the ingress proxy in front of the telemetry collector's receiver (item 2). The receiver is the collector's OTLP sender endpoints, gRPC and HTTP (item 3).
- Admission: by source address, on a direct path carrying each pod's own address (items 12, 13); act regardless if unconfirmed (item 14)
- Change semantics: replace with exactly the sender set, then deny everything else (item 16); confined to those blocks (item 21)
- Approvers and gate positions (items 7–11)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The sender set, with its harvest time — produced by the kubernetes-gitops leg, chained into the observability-config leg's §6, settled before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- The kubernetes-gitops leg's package is the published sender set. It changes nothing on the cluster, so its rollback plan states that none is needed.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the allow entries of every selected forwarding block in the observability-config change package exactly equal the sender set published by the kubernetes-gitops leg — the chained value, not a guess, not a recomputation;
2. every entry of that sender set is the address of a pod that the kubernetes-gitops leg's published input block shows meeting item 4, and every such pod's address is an entry. Containment holds in both directions;
2b. every entry is a single host address with no prefix length and no duplicate, so the set admits no address beyond the member pods. Recompute it by applying the published criterion to the published input block; do not take the stated set on trust;
3. no widening and no collision. Four conditions must all hold:
   - no selected block keeps an allow-everything directive
   - every selected block's access list ends in a deny for everything else
   - no server block, location, port or forwarded path outside the selected blocks differs between baseline and candidate
   - where the kubernetes-gitops leg published no sender set, the observability-config package changes nothing and contains no deny-only access list;
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. the kubernetes-gitops leg's `report.md` states the literal criterion it applied and the harvest time (items 4, 6);
6. the observability-config leg's `report.md` states its admitted-principal premise as observed or as owner-declared, not observed (item 14), and lists every forwarding block it did not select as unchanged by owner decision (item 16).

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

The observability-config leg consumes a sender set made of pod addresses. It cannot check those addresses against its own state, because the proxy holds no pod inventory. The leg's consumption is **SATISFIED** when all three of these hold:

1. The kubernetes-gitops leg's derivation was machine-checked with no defect. Its Pipeline 1 validation steps 1–4 printed exactly their expected outputs.
2. Program-tier checks 1, 2, 2b and 3 above pass on the chained value.
3. Chaining coverage (check 4) confirms the observability-config leg received the kubernetes-gitops leg's real deliverable.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

- **Gap from the Phase 0 harvest (for information, not a decision):** no read found an attribute that marks a pod as a telemetry sender. Item 4 defines membership by phase and two exclusions, without any such marker, so this specification needs none and no row is opened for it. Under that declaration, every pod meeting item 4 is admitted, whether or not it actually sends telemetry.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 82
