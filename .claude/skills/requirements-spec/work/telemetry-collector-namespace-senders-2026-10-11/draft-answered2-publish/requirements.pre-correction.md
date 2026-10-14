# Program Requirements — Telemetry collector sender restriction

- Authored in: Telemetry collector access control · Requirements
- Iteration: Run 20261011-0954 · 2026-10-11

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

> **DRAFT SPECIFICATION FOR HUMAN REVIEW.** This document is not approved and not final, and the program it describes has not been launched. The program plan gate is where a wrong spec gets caught.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. Each leg is a distinct DOMAIN, meaning a different protocol and target class. Neither leg is a phase of the other:
  1. **kubernetes-gitops** (UPSTREAM) on the pods of the Kubernetes namespace `trading`, described in `topology.json`. This leg reads the namespace and publishes a sender set. It changes nothing on the cluster.
  2. **observability-config** (DOWNSTREAM) on the ingress proxy in front of the telemetry collector's receiver. This leg authors a change package that restricts the proxy's sender endpoints to the sender set produced by the kubernetes-gitops leg.
- The following are explicitly **out of scope**:
  - any namespace other than `trading`, and any pod outside it;
  - any object on the cluster (no workload, policy or manifest is changed by this program);
  - any proxy server block, location, port or forwarded path that does not forward to one of the collector's OTLP receivers;
  - the telemetry collector's own configuration;
  - any resource other than the two declared targets;
  - keeping the sender set up to date after the program;
  - applying any change. Apply is out-of-band and human-gated.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of the Kubernetes namespace `trading` | (declared — item 1: "acts on the pods of the Kubernetes namespace `trading`") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | each pod in `trading` whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested | (declared — item 4: "a pod in the declared namespace whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: one entry per member pod's address, with no covering prefix | (declared — item 5: "expressed as a host list: one entry per member pod's address, with no covering prefix") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: publish no sender set, and report a gap naming what was absent | (declared — item 20: "the kubernetes-gitops leg publishes no sender set and reports a gap naming what was absent (gap)") |
| kubernetes-gitops.freshness | whether the sender set is maintained after the program | point-in-time · maintained | point-in-time as of the leg's harvest. The deliverable states the harvest time, and nothing maintains the set afterwards | (declared — item 6: "point-in-time as of the leg's harvest") |
| observability-config.target | which surface of the leg's service does it act on | — | the ingress proxy in front of the telemetry collector's receiver | (declared — item 2: "acts on the ingress proxy in front of the telemetry collector's receiver") |
| approver.program-plan | who approves this gate | — | jacob.wilcox@paichart.com | (declared — item 7: "The program plan gate is approved by jacob.wilcox@paichart.com") |
| approver.kubernetes-gitops-change | who approves this gate | — | josh.allen@paichart.com | (declared — item 8: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.observability-config-change | who approves this gate | — | steve.terry@paichart.com | (declared — item 9: "The observability-config change gate is approved by steve.terry@paichart.com") |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 10: "sits after that leg and before the observability-config leg (after-producer-before-consumers)") |
| gate.observability-config-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion | (declared — item 11: "sits after that leg and before its completion (after-leg-before-completion)") |

### A leg that grants or removes access (authorisation)

Only the observability-config leg grants or removes access. The kubernetes-gitops leg publishes a value and changes nothing on its target, so its authorisation rows are not applicable. They are listed in *Decisions needed from the owner*.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| observability-config.receiver | which workload/resource on the target is authorised | — | the collector's OTLP sender endpoints, gRPC and HTTP. This means every proxy block that forwards to one of the collector's OTLP receivers, whatever its description says | (declared — item 3: "Every proxy block that forwards to one of the collector's OTLP receivers is a sender endpoint, whatever its description says") |
| observability-config.description-exempt | whether a forwarding block whose own description places it outside the sender allowlist is a sender endpoint | restricted · exempt | restricted like every other sender endpoint. Non-member senders that use it today are refused there | (declared — item 22: "A block whose description places it outside the sender allowlist is restricted like every other sender endpoint") |
| observability-config.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: the member pods' addresses, taken from the host list in item 5 | (declared — item 12: "admits senders by source address: the member pods' addresses, as the host list in item 5") |
| observability-config.request-path | the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) | direct · private-endpoint · translated | direct: each request arrives carrying the pod's own address | (declared — item 13: "reach the proxy directly, carrying each pod's own address (direct)") |
| observability-config.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless. The leg states the premise in its deliverable as owner-declared, not observed | (declared — item 14: "the leg acts anyway (act-regardless)") |
| observability-config.granted-action | what the admitted principal may do (actions, ports) | — | submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP, and nothing else on those endpoints | (declared — item 15: "may submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP (item 3), and nothing else on those endpoints") |
| observability-config.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | replace: on every sender endpoint block, the allowances become exactly the sender set, followed by a deny for everything else | (declared — item 16: "the allowances are replaced by exactly the sender set, followed by a deny for everything else (replace)") |
| observability-config.non-sender-forwarding | how the leg treats proxy blocks that forward into the collector without reaching an OTLP receiver | leave-unchanged · restrict | leave-unchanged. Each such block is listed in the deliverable as unchanged by owner decision | (declared — item 16: "the leg leaves them unchanged and lists each one in its deliverable as unchanged by owner decision") |
| observability-config.target-empty | the receiver selector/surface matches nothing now | act · gap | gap: report a gap and author nothing | (declared — item 17: "the observability-config leg reports a gap and authors nothing (gap)") |
| observability-config.enforcer-absent | no policy object governs the receiver yet | create · gap | create: add the access directives to that block | (declared — item 18: "the observability-config leg adds them to that block (create)") |
| observability-config.target-absent | the declared target itself does not exist | gap · create-target | gap: report a gap and create nothing | (declared — item 19: "the observability-config leg reports a gap and creates nothing (gap)") |
| observability-config.collateral | what else on the target changes because enforcement now applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) | nothing outside the sender endpoint blocks: no other server block, location, port or forwarded path on the proxy changes | (declared — item 21: "no other server block, location, port or forwarded path on the proxy changes") |
| observability-config.shared-setting | a sender endpoint shares an access setting with a non-sender path, so the restriction cannot be confined | gap · widen | gap: report a gap rather than widening the change | (declared — item 21: "it reports a gap instead of widening the change") |
| observability-config.upstream-empty | the kubernetes-gitops leg published no sender set | gap · deny-all | make no change to the proxy and report the upstream gap. Never write a deny-everything rule from an empty set | (declared — item 20: "If no sender set is published, the observability-config leg makes no change to the proxy and reports the upstream gap") |

### A leg that changes routes (routing)

No leg in this program adds, suppresses, filters, withdraws or replaces a route or its advertisement. The observability-config leg filters traffic, and filtering traffic counts as authorisation, not routing. Because the routing rows are not applicable to either leg, they are deleted from this table and listed in *Decisions needed from the owner*.

## Decisions needed from the owner

kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg publishes the sender set and changes no workload, policy or access setting on the cluster, so it neither grants nor removes access on its target
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target; admission is decided on the observability-config target
kubernetes-gitops.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) — options: direct · private-endpoint · translated — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg admits no principal; there is no enforcer on its target
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg grants nothing on its target
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg changes no allowance on the cluster
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg authorises no receiver; an empty namespace is governed by kubernetes-gitops.inputs-empty
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg creates or modifies no policy object on the cluster
kubernetes-gitops.target-absent — the declared target itself does not exist — options: gap · create-target — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target; an absent namespace yields no member pods and is governed by kubernetes-gitops.inputs-empty
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: Pipeline 1 objective (no access clause) — tier: not-applicable — the kubernetes-gitops leg applies no enforcement on the cluster
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: Pipeline 1 objective (no routing clause) — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: Pipeline 1 objective (no routing clause) — tier: not-applicable — the leg is not a routing leg; it adds, suppresses, filters, withdraws or replaces no route or advertisement
observability-config.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: Pipeline 2 objective (no routing clause) — tier: not-applicable — the leg adds no advertised covering route
observability-config.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: Pipeline 2 objective (no routing clause) — tier: not-applicable — the leg is not a routing leg; it filters traffic at the proxy (authorisation) and changes no route or advertisement

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No ⇒ sequenced.** The observability-config leg needs the sender set produced by the kubernetes-gitops leg. That value is not knowable up front, for three reasons:

- **It is read from live pod state at the moment of the harvest.** Kubernetes assigns pod addresses when pods are scheduled. Every restart, reschedule, scale event or rollout changes which pods qualify and what addresses they carry. A value pinned in `topology.json` or agreed in the interface contract would already be stale when the downstream leg used it.
- **The Program Architect cannot know it.** The Architect reads only `topology.json` and this file, and has no live state access.
- **It is a derivation, not a lookup.** Membership needs three predicates applied to each pod (phase Running, not on the host's network, deletion not requested). A terminating pod still reports phase Running, and a host-network pod reports the node's address as its own, so a guessed or simplified list admits the wrong senders.

Two things would go wrong if someone guessed the set up front:

- **A guessed set that is too wide** admits senders outside the namespace. That violates "nothing wider".
- **A stale set** refuses legitimate pods and admits addresses that now belong to something else.

The value therefore rides the direct DAG edge from the kubernetes-gitops leg to the observability-config leg. Item 6 declares it point-in-time as of that leg's harvest.

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

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | jacob.wilcox@paichart.com (declared) |
| kubernetes-gitops change | produced value: the sender set (host list) produced by the kubernetes-gitops leg | the kubernetes-gitops leg | the observability-config leg | josh.allen@paichart.com (declared) |
| observability-config change | produced value: the change package produced by the observability-config leg | the observability-config leg | completion of the observability-config leg, which releases the package for out-of-band apply | steve.terry@paichart.com (declared) |

The observability-config change gate sits after the leg it approves, and that is deliberate (item 11). It approves a produced value, the change package, and it blocks that package's release for apply. Because apply is out-of-band and human-gated, this gate is a control on what gets applied. It is not a record of work already in effect.

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

The declared mapping puts different people on the two domain gates (josh.allen@paichart.com and steve.terry@paichart.com). No open question is raised.

**Dependency consequence:**
- Program plan gate → kubernetes-gitops leg, and program plan gate → observability-config leg.
- `kubernetes-gitops leg → kubernetes-gitops change gate` AND `kubernetes-gitops leg → observability-config leg`. In addition, `kubernetes-gitops change gate → observability-config leg`. The observability-config leg therefore depends on **its gate** AND on **the upstream leg**, and the gate itself depends on the upstream leg.
- `observability-config leg → observability-config change gate`. The observability-config leg does not complete until that gate is approved.

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

- Harvest every pod in the Kubernetes namespace `trading` **read-only**. Read each pod individually: phase, host-network setting, deletion request and every address Kubernetes reports as allocated to it. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — 2026-10-11**: this was checked against the Phase 0 harvest of the requirements-authoring run 20261011-0954, cluster domain. That harvest listed the pod names in `trading` and then read each pod's resource individually. It confirmed that at least one pod in `trading` meets the item-4 criterion (phase Running, not on the host's network, no deletion requested) and reports an allocated address.
- **The work.** The leg reads the declared namespace (`kubernetes-gitops.target`). It selects the members (`kubernetes-gitops.population`) and publishes them as a host list (`kubernetes-gitops.representation`). It makes **no change to any object on the cluster**: its change package is the published sender set, and its rollback plan reads "not applicable — no cluster object changes".
- **The derivation.** The sender set produced by the kubernetes-gitops leg contains every address allocated to every member pod. A member pod is a pod in `trading` where:
  - `status.phase` is `Running`;
  - `spec.hostNetwork` is not `true` (an omitted field means `false`);
  - `metadata.deletionTimestamp` is unset.

  A pod's allocated addresses are its `status.podIPs` entries, or `status.podIP` when `status.podIPs` is absent. Each address is one entry that denotes exactly that address: a bare address, or `/32` (IPv4) or `/128` (IPv6). The list carries no covering prefix and no duplicates. Executable form of the rule, used by every check below:
  ```
  MEMBER_FILTER='.items[]
    | select(.metadata.namespace == "trading")
    | select(.status.phase == "Running")
    | select((.spec.hostNetwork // false) == false)
    | select(.metadata.deletionTimestamp == null)
    | (.status.podIPs // [{ip: .status.podIP}])[] | .ip'
  ```
- **If the harvest returns no member pods**, including when the namespace returns no pods at all, apply `kubernetes-gitops.inputs-empty`. The leg publishes **no sender set**. It publishes a gap report that names what was absent: no pod in `trading` with phase Running, not on the host's network and with no deletion requested. The report also states what would have to exist (at least one such pod with an allocated address). The leg never substitutes a value.
- **The deliverable (report.md) MUST publish, explicitly and prominently:**
  1. the sender set produced by the kubernetes-gitops leg, one entry per line, as `sender-set.txt`;
  2. the literal membership criterion the leg applied (item 4), as the exact filter it ran;
  3. the harvest time, stating that the set is point-in-time and nothing maintains it (item 6);
  4. the input block: the harvested pod records exactly as read, as a Kubernetes List JSON `harvest-pods.json` with `items[]`, each carrying `metadata.name`, `metadata.namespace`, `metadata.deletionTimestamp`, `spec.hostNetwork`, `status.phase`, `status.podIP` and `status.podIPs`;
  5. a statement that apply is out-of-band and human-gated, and that this leg changes nothing on the cluster.

  The downstream leg depends on what this leg PRODUCES at run time, not on what was read while authoring.
- **Validation (mechanical)** — K1 recomputes the set from the leg's own captured input:
  ```
  jq -r "$MEMBER_FILTER" harvest-pods.json | sort -u > recomputed.txt
  sort -u sender-set.txt | sed -E 's#/(32|128)$##' | diff - recomputed.txt; echo "exit=$?"
  ```
  Expected output: exactly `exit=0`. The published value equals the recomputation, and every re-obtained input lies inside it.

  K2 checks that no entry covers more than one address:
  ```
  grep -vE '^([0-9]{1,3}\.){3}[0-9]{1,3}(/32)?$|^[0-9a-fA-F:]+(/128)?$' sender-set.txt; echo "exit=$?"
  ```
  Expected output: exactly `exit=1` (no non-conforming line).

  K3 is a drift comparison, labelled as such and not a pass/fail check. Run `kubectl get pods -n trading -o json | jq -r "$MEMBER_FILTER" | sort -u | diff <(sort -u sender-set.txt | sed -E 's#/(32|128)$##') -`. Read the result as follows:
  - **No output** means the set has not drifted since the harvest time.
  - **Any output** means drift since the harvest time. That is reported with both timestamps, and it is not a defect of the leg (item 6).

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs. For this leg the tightest-correct result is exactly the member pods' addresses. Any extra entry is a defect, and so is any entry covering more than one address, even if every address it covers is a member.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise. For this leg: a pod that fails the criterion rules out that pod only. Evaluate every pod in `trading`. Take the `kubernetes-gitops.inputs-empty` branch only after every pod has been evaluated and none qualifies, and list each pod tested with the predicate it failed.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** The traps below use synthetic values only:
  - **A terminating pod still reports phase Running.** A record `{phase: Running, deletionTimestamp: set, podIP: 192.0.2.11}` is NOT a member.
  - **A host-network pod reports the node's address as its own.** Including a record `{phase: Running, hostNetwork: true, podIP: 198.51.100.7}` would admit the node and every host-network workload on it.
  - **A `Pending` pod has no address and is not a member.**
  - **Adjacent members must not be collapsed.** Members at `192.0.2.10` and `192.0.2.11` are adjacent and aligned, yet publishing `192.0.2.10/31` is a covering prefix and a defect (item 5), even though it contains exactly those two addresses. Members at `192.0.2.11` and `192.0.2.12` straddle a boundary, and their minimal cover is a `/30` that would also admit non-members.
  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every input is inside the derived result, and
  nothing foreign is.
- ⚠️ **Verify the PREMISE before you write the objective — reachability is not sufficiency.** An
  objective naming inputs the target does not hold is unsatisfiable, and the leg will either escalate
  (correct) or find a value somewhere (plausible and wrong). Probing that the service ANSWERS proves
  it is alive, not that it holds what you are about to ask about. Read a harvest — a fresh one or a
  prior run's — before writing the derivation clause. The premise for this objective was checked against the harvest named under *Preconditions verified*.
  *Earned: 2026-09-20 — an objective asked for a cover over harvested private subnet CIDRs in a
  workspace holding two resources and no subnets. All three endpoints had been probed and answered.*
- 🔴 **STATE THE NULL CASE, always.** Say what the correct outcome is when the harvest yields no
  inputs. An objective that only describes the success path forces improvisation at the worst layer:
  the brief a harness composes at CREATE runs BEFORE the harvest, so it presupposes the derivation
  and instructs a later agent to carry forward a block that may never exist. A named null outcome
  ("produce a gap report; author nothing") is satisfiable; silence is not. This leg's null case is `kubernetes-gitops.inputs-empty` (stated above). The downstream consequence is `observability-config.upstream-empty`.
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
  stated convention" then fails against a value that is actually right. The deliverable shows `MEMBER_FILTER` applied to one record from `harvest-pods.json`, each predicate's result in turn, and the single-address entry it yields. It then confirms that entry appears in `sender-set.txt` at single-address width.
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

- Harvest the ingress proxy in front of the telemetry collector's receiver **read-only**: every server block, every location, every forwarding directive and every access directive, as deployed. Also harvest the collector's own receiver configuration (`receivers.otlp.protocols.grpc.endpoint`, `receivers.otlp.protocols.http.endpoint`), read-only, so the leg can decide which blocks forward to an OTLP receiver. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — 2026-10-11**: this was checked against the Phase 0 harvest of the requirements-authoring run 20261011-0954, observability domain, which read the as-deployed ingress configuration and the collector's deployed configuration file. The harvest confirmed two properties:
  - the collector's OTLP gRPC and HTTP receiver endpoints are readable from its deployed configuration;
  - at least one proxy block forwards to one of those endpoints.
- **The work** proceeds in four steps:
  1. **Classify every block by what it forwards to, never by its description.** A block whose forwarding destination resolves to one of the collector's OTLP receiver endpoints is a sender endpoint (`observability-config.receiver`). A destination that names an upstream group resolves through that group's member servers.
  2. **Restrict every sender endpoint block.** On each one, the allowances are replaced by exactly the sender set, followed by a deny for everything else (`observability-config.existing-grant`). This includes any block whose description places it outside the sender allowlist (`observability-config.description-exempt`). Admitted senders may submit telemetry on those endpoints and nothing else (`observability-config.granted-action`).
  3. **Leave non-sender forwarding blocks alone.** Every block that forwards into the collector without reaching an OTLP receiver is left unchanged and listed in the deliverable as unchanged by owner decision (`observability-config.non-sender-forwarding`).
  4. **Confine the change.** Nothing else on the proxy changes (`observability-config.collateral`). If a sender endpoint shares an access setting with a non-sender path, apply `observability-config.shared-setting`: report a gap for that endpoint and do not widen the change.
- **Exemplar stanza.** Where the leg's own harvest shows the proxy is nginx, each sender endpoint block's complete access stanza is the one below: every line, in order, placeholders intact. It contains one `allow` line per sender-set entry, in the order the kubernetes-gitops leg published them, and then a single `deny all;`. Nothing else in the block, including any nested location, declares `allow` or `deny`.
  ```
      # sender allowlist: the sender set produced by the kubernetes-gitops leg, harvested <HARVEST_TIME>
      allow <SENDER_ENTRY_1>;
      allow <SENDER_ENTRY_2>;
      allow <SENDER_ENTRY_N>;
      deny all;
  ```
  Forbidden tokens in a sender endpoint block:
  - `allow all;`
  - any prefix wider than one address (`/0`–`/31` IPv4, `/0`–`/127` IPv6)
  - `satisfy any`
  - per-address `deny` lists in place of the final `deny all;`
  - other dialects: `Require ip`, `Order allow,deny`, `whitelist-source-range`

  If the harvest shows a proxy other than nginx, the leg uses that proxy's own access syntax, ships its complete stanza, and ships an equivalent syntax-check command with that command's literal success output.
- **Admitted-principal premise** (`observability-config.admitted-principal`): the proxy must see each member pod's own address as the connection's source address. Per `observability-config.request-path`, the requests take the direct path. If this leg's own harvest cannot confirm the proxy sees the pods' own addresses, apply `observability-config.principal-unseen`: the leg acts regardless. It records the premise in its deliverable under **UNTESTED premises**, as owner-declared (items 13 and 14), not observed. It also states the consequence: if the premise is false, the restriction refuses the member pods themselves.
- **Existence assumption** (*Writing rules* #6). The leg's own harvest decides which branch applies, and each branch applies its row:
  - **The proxy itself is absent:** apply `observability-config.target-absent`. Report a gap; create nothing.
  - **The proxy exists but no block forwards to an OTLP receiver endpoint:** apply `observability-config.target-empty`. Report a gap; author nothing.
  - **A sender endpoint block carries no access directives:** apply `observability-config.enforcer-absent`. Add the stanza to that block.
  - **A sender endpoint block carries access directives:** apply `observability-config.existing-grant`. Replace them.
  - **A sender endpoint's access setting also governs a non-sender path:** apply `observability-config.shared-setting`. Report a gap for that endpoint.
- **It consumes the sender set produced by the kubernetes-gitops leg as chained.** It does **not** re-derive it, and it is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If the upstream deliverable in §6 is a gap report with no sender set:** apply `observability-config.upstream-empty`. Make no change to the proxy, report the upstream gap, and never write a deny-everything rule.
  - **If §6 does not carry the upstream deliverable at all:** escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest returns no sender endpoint blocks**, apply `observability-config.target-empty`. If the proxy does not exist, apply `observability-config.target-absent`. In both cases the outcome is a gap report and nothing authored. The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- **The deliverable (report.md) MUST publish:**
  - the sender set it consumed, echoed verbatim, named as the sender set produced by the kubernetes-gitops leg, with that leg's harvest time;
  - the list of sender endpoint blocks it restricted, by file and line, with each block's before and after access directives;
  - the list of non-sender forwarding blocks, each marked unchanged by owner decision;
  - any gap reported under `shared-setting`;
  - the **UNTESTED premises** list;
  - a rollback plan: restore the harvested original files byte for byte;
  - a statement that apply is out-of-band and human-gated.

  The package ships `original/` (the harvested as-deployed proxy files) and `proposed/` (the full proposed tree). For each sender endpoint block, it also ships `proposed-blocks/<block-id>.conf`, extracted from `proposed/` by a shipped script. That script, `strip-sender-blocks.sh` and `classify-forwarding.sh` ship complete and runnable with the package.
- **Validation (mechanical)**, run against the package before apply:
  - O1, syntax: `nginx -t -p proposed/ -c <MAIN_CONFIG_RELATIVE_PATH>`. Expected: a line ending `syntax is ok`, a line ending `test is successful`, exit status 0.
  - O2, exact stanza per sender endpoint block:
    ```
    { sed 's/.*/allow &;/' sender-set.txt; echo 'deny all;'; } > expected-access.txt
    for b in proposed-blocks/*.conf; do
      grep -E '^[[:space:]]*(allow|deny)[[:space:]]' "$b" | sed -E 's/^[[:space:]]+//' \
        | diff -q expected-access.txt - >/dev/null && echo "PASS $b" || echo "FAIL $b"
    done
    ```
    Expected: one `PASS <file>` line for every sender endpoint block listed in the package, and no `FAIL` line.
  - O3, classification completeness: `./classify-forwarding.sh proposed/ <collector-config-file> | grep '^SENDER ' | sort > classified.txt; diff classified.txt <(sort package-sender-blocks.txt); echo "exit=$?"`. The script prints `SENDER <file>:<line>` for each forwarding directive whose destination resolves to an OTLP receiver endpoint, and `OTHER <file>:<line>` otherwise. Expected: exactly `exit=0`. Every block forwarding to an OTLP receiver is restricted, whatever its description.
  - O4, confinement: `./strip-sender-blocks.sh original/ > orig-rest.txt; ./strip-sender-blocks.sh proposed/ > prop-rest.txt; diff orig-rest.txt prop-rest.txt; echo "exit=$?"`. Expected: exactly `exit=0`. Nothing outside the sender endpoint blocks changed.
  - O5, no unrestricted allowance: `grep -c 'allow all' proposed-blocks/*.conf`. Expected: every output line ends in `:0`.
  - O6, upstream-empty branch only: `diff -r original/ proposed/; echo "exit=$?"`. Expected: exactly `exit=0`.
  - **Post-apply comparisons.** These are labelled as comparisons to perform, not pre-run expectations. They cannot be witnessed before the program runs because the program produces packages only: the effective refusal and the source address the proxy sees exist only after a human applies the package out-of-band.
    - **(a) Non-member request:** from a source not in the sender set, `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://<PROXY>:<HTTP_SENDER_PORT>/v1/traces -H 'Content-Type: application/json' -d '{}'`. Compare to `403`. For each gRPC sender endpoint, the proxy access log line for a non-member export carries status `403`.
    - **(b) Member request:** the same request from a member pod returns a code other than `403`.
    - **(c) Source address seen:** the proxy access log's client address for (b) is an entry in the sender set. This tests the owner-declared direct-path premise.
    - **(d) Rollback:** after a rollback, `diff -r original/ <LIVE_CONFIG_DIR>; echo "exit=$?"` prints exactly `exit=0`.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Sender namespace: `trading` (item 1)
- Membership criterion: phase Running, excluding pods on the host's network and pods whose deletion has been requested (item 4)
- Representation: host list, one entry per member pod's address, no covering prefix (item 5)
- Freshness: point-in-time as of the kubernetes-gitops leg's harvest; nothing maintains it afterwards (item 6)
- observability-config target: the ingress proxy in front of the telemetry collector's receiver (item 2)
- Sender endpoint definition: every proxy block forwarding to one of the collector's OTLP receivers (gRPC and HTTP), whatever its description says (items 3 and 22)
- Admission attribute and path: source address, direct (items 12 and 13)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The sender set (host list) is produced by the kubernetes-gitops leg, with its harvest time and literal criterion. It is chained into the observability-config leg's §6 and settled before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. The sender set consumed by the observability-config leg exactly equals the sender set produced by the kubernetes-gitops leg, entry for entry, with nothing added, omitted or reordered. It is the chained value, not a guess and not a recomputation.
2. Coverage and containment: every sender endpoint block in the observability-config package admits every entry of the sender set produced by the kubernetes-gitops leg. No block admits any address outside that set.
2b. The tightest-correct property. Recompute the set by applying the item-4 criterion to the input block the kubernetes-gitops leg published (check K1). The result must equal the published sender set exactly. No entry may cover more than one address (check K2), and every sender endpoint block must end in `deny all;` with no `allow all`. Do not take the stated value on trust.
3. No widening and no collision:
   - No server block, location, port or forwarded path outside the sender endpoint blocks changed (check O4).
   - No block forwarding to an OTLP receiver was left unrestricted, including any block whose description places it outside the sender allowlist (check O3).
   - When the upstream leg published no sender set, the proxy package changes nothing and contains no deny-everything rule (check O6).
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. The kubernetes-gitops leg's report states the literal criterion it applied and the harvest time (items 4 and 6).
6. The observability-config leg's report lists every non-sender forwarding block as unchanged by owner decision, and lists the direct-path premise under **UNTESTED premises** as owner-declared, not observed (items 14 and 16).

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

  In this program, each leg's objective requires its own report to state that apply is out-of-band and human-gated. The observability-config leg's report echoes the consumed sender set with its producer and harvest time, so checks 1 and 2 can be read from the leg reports alone.

### Consuming-leg attribution — when a downstream leg legitimately cannot self-check

The observability-config leg has no access to the cluster, so it cannot check the sender set against its own state. Its consumption is SATISFIED when all three of these hold:
1. the kubernetes-gitops leg's derivation was machine-checked with no defect (checks K1 and K2 print their expected outputs against that leg's own input block);
2. program-tier checks 1, 2, 2b and 3 pass on the chained value;
3. chaining coverage (check 4) confirms the kubernetes-gitops leg's real deliverable was received.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

none

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 86
