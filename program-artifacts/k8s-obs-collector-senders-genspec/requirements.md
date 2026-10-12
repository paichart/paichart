# Program Requirements — Telemetry collector sender restriction

- Authored in: Telemetry collector access control · Requirements
- Iteration: Run 20261012-0619 · 2026-10-12

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
- These are **explicitly out of scope**: any namespace other than `trading`; any resource other than the declared ingress proxy; every proxy server block, location, port or forwarded path that does not forward to one of the collector's OTLP receivers; the collector's own configuration; keeping the sender set up to date after the program; and applying any change, in either domain.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of the Kubernetes namespace `trading` | (declared — item 1: "The kubernetes-gitops leg acts on the pods of the Kubernetes namespace `trading`") |
| observability-config.target | which surface of the leg's service does it act on | — | the ingress proxy in front of the telemetry collector's receiver | (declared — item 2: "acts on the ingress proxy in front of the telemetry collector's receiver") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | a pod in `trading` whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested | (declared — item 4: "A member of the sender population is a pod in the declared namespace whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: one entry per member pod's address, no covering prefix | (declared — item 5: "expressed as a host list: one entry per member pod's address, with no covering prefix") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: publish no sender set, and report a gap naming what was absent | (declared — item 20: "If no pod in the declared namespace meets item 4, the kubernetes-gitops leg publishes no sender set and reports a gap naming what was absent (gap)") |
| kubernetes-gitops.currency | as of when the sender set is valid | — | point-in-time as of the leg's harvest; the deliverable states the harvest time | (declared — item 6: "The sender set is point-in-time as of the leg's harvest; the deliverable states the harvest time") |
| kubernetes-gitops.maintenance | whether anything keeps the sender set current after the program | — | nothing maintains the set after the program | (declared — item 6: "Nothing maintains the set after the program") |
| approver.program-plan | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 7: "The program plan gate is approved by jacob.wilcox@paichart.com") |
| approver.kubernetes-gitops-change | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 8: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.observability-config-change | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 9: "The observability-config change gate is approved by steve.terry@paichart.com") |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 10: "sits after that leg and before the observability-config leg (after-producer-before-consumers)") |
| gate.observability-config-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion | (declared — item 11: "sits after that leg and before its completion (after-leg-before-completion)") |

### A leg that grants or removes access (authorisation)

Only the observability-config leg grants or removes access. The kubernetes-gitops leg reads its target and publishes a sender set, and grants or removes nothing there. Its authorisation rows are therefore deleted and listed as `not-applicable` in *Decisions needed from the owner*.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| observability-config.receiver | which workload/resource on the target is authorised | — | the collector's OTLP sender endpoints, gRPC and HTTP, exposed through the proxy | (declared — item 3: "The receiver authorised on the observability-config target is the collector's OTLP sender endpoints, gRPC and HTTP, exposed through the proxy") |
| observability-config.sender-blocks | which proxy blocks count as sender endpoints | — | every proxy block that forwards to one of the collector's OTLP receivers, whatever its own description says | (declared — item 22: "A proxy block is a sender endpoint if it forwards to one of the collector's OTLP receivers, whatever its own description says (every-block-forwarding-to-an-OTLP-receiver)") |
| observability-config.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: the member pods' addresses, as the host list produced by the kubernetes-gitops leg | (declared — item 12: "The observability-config leg admits senders by source address: the member pods' addresses, as the host list in item 5") |
| observability-config.request-path | the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) | direct · private-endpoint · translated | direct, carrying each pod's own address | (declared — item 13: "The admitted senders' requests reach the proxy directly, carrying each pod's own address (direct)") |
| observability-config.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless; the deliverable states the premise as owner-declared, not observed | (declared — item 14: "If the leg's own harvest cannot confirm that the proxy sees the pods' own addresses, the leg acts anyway (act-regardless)") |
| observability-config.granted-action | what the admitted principal may do (actions, ports) | — | submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP, and nothing else on those endpoints | (declared — item 15: "Admitted senders may submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP (item 3), and nothing else on those endpoints") |
| observability-config.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | replace: on every sender block, the allowances become exactly the sender set, followed by a deny for everything else | (declared — item 16: "the allowances are replaced by exactly the sender set, followed by a deny for everything else (replace)") |
| observability-config.non-sender-paths | what happens to proxy blocks that forward into the collector without reaching an OTLP receiver | — | left unchanged; each one is listed in the deliverable as unchanged by owner decision | (declared — item 16: "the leg leaves them unchanged and lists each one in its deliverable as unchanged by owner decision") |
| observability-config.target-empty | the receiver selector/surface matches nothing now | act · gap | gap: report a gap and author nothing | (declared — item 17: "If no proxy block forwards to the OTLP sender endpoints, the observability-config leg reports a gap and authors nothing (gap)") |
| observability-config.enforcer-absent | no policy object governs the receiver yet | create · gap | create: add the access directives to that block | (declared — item 18: "If a block forwarding to the sender endpoints carries no access directives, the observability-config leg adds them to that block (create)") |
| observability-config.target-absent | the declared target itself does not exist | gap · create-target | gap: report a gap and create nothing | (declared — item 19: "If the proxy does not exist, the observability-config leg reports a gap and creates nothing (gap)") |
| observability-config.upstream-empty | no sender set arrives from the kubernetes-gitops leg | — | make no change to the proxy, report the upstream gap, and never write a deny-everything rule from an empty set | (declared — item 20: "If no sender set is published, the observability-config leg makes no change to the proxy and reports the upstream gap; it never writes a deny-everything rule from an empty set") |
| observability-config.collateral | what else on the target changes because enforcement now applies | confined-to-block · whole-listener · gap | confined-to-block: no other server block, location, port or forwarded path on the proxy changes | (declared — item 21: "no other server block, location, port or forwarded path on the proxy changes") |
| observability-config.shared-access | a sender endpoint shares an access setting with a non-sender path | — | report a gap instead of widening the change | (declared — item 21: "If the leg finds that a sender endpoint shares an access setting with a non-sender path, so the restriction cannot be confined to the sender endpoints, it reports a gap instead of widening the change") |
| observability-config.enforcer-scope | which parts of the enforcer the restriction covers | all-reaching-the-protected-thing · exemption-by-property · gap | all-reaching-the-protected-thing | (declared — item 23: "covers every part of the proxy that reaches the collector's OTLP receivers (all-reaching-the-protected-thing)") |

### A leg that changes routes (routing)

Neither leg adds, suppresses, filters, withdraws or replaces routes or how they are advertised. The routing rows are deleted for both legs and listed as `not-applicable` in *Decisions needed from the owner*.

## Decisions needed from the owner

kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target; it reads the pods of `trading` and publishes the sender set
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target
kubernetes-gitops.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) — options: direct · private-endpoint · translated — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target; its empty-harvest outcome is kubernetes-gitops.inputs-empty
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target
kubernetes-gitops.target-absent — the declared target itself does not exist — options: gap · create-target — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target; a namespace with no qualifying pod falls under kubernetes-gitops.inputs-empty
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: allow-named-ports · deny · leave-to-workload-manifests — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target, so no enforcement applies there
kubernetes-gitops.enforcer-scope — which parts of the enforcer the restriction covers — options: all-reaching-the-protected-thing · exemption-by-property · gap — governs: none (row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: none (row deleted) — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: none (row deleted) — tier: not-applicable — the leg changes no routes
observability-config.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: none (row deleted) — tier: not-applicable — the leg adds no advertised covering route
observability-config.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: none (row deleted) — tier: not-applicable — the leg changes no routes; it filters traffic, which is authorisation

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No ⇒ sequenced.** The observability-config leg needs the sender set: the addresses of the pods in `trading` that meet the population criterion (`kubernetes-gitops.population`). Those addresses are read from live cluster state. Kubernetes assigns a pod its address when the pod is scheduled, and the address changes whenever a pod is rescheduled, restarted under a new name, scaled, or replaced by a rollout. The criterion also turns on fields that change minute to minute: the pod's phase, and whether its deletion has been requested. The value therefore cannot be pinned in a static artifact or agreed in a contract. The Program Architect reads only `topology.json` and this file, has **no live state access**, and so structurally cannot know it.

This is a design decision, not a lookup. Item 4 is a membership rule with three conditions, and each one keeps a plausible-looking pod out of the set:
- A terminating pod still reports phase Running.
- A pod on the host's network reports the node's address, so admitting it would admit the node.
- A pod that is not Running may have no address yet, or a stale one.

The kubernetes-gitops change gate then approves that exact set (item 10) before anything consumes it. A guessed set, or one copied in when this document was written, fails in one of two ways. Either it admits addresses that belong to no current member, which may now belong to another workload. Or it refuses the senders that really exist. Under the declared replace behaviour (`observability-config.existing-grant`), both failures land on the sender endpoints the day the change is applied.

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
| program plan | the plan and the interface contract | the Program Architect | every leg | Jacob Wilcox (declared) |
| kubernetes-gitops change | the sender set — the value produced by the kubernetes-gitops leg | the kubernetes-gitops leg | the observability-config leg | Josh Allen (declared) |
| observability-config change | the change package — the value produced by the observability-config leg | the observability-config leg | the completion of the observability-config leg | Steve Terry (declared) |

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

The observability-config change gate is a produced-value gate. It sits after the leg that produces the change package and blocks that leg's completion (`gate.observability-config-change.position`). The program applies nothing, so this gate controls whether the package is released as approved. It does not control an apply.

⚠️ **A gate the producing team can release for itself is not a gate.** Distinct owners are the point:
a program exists precisely because the halves are approved by different people. That is a check on the
DECLARED mapping, never a licence to reassign: if the declaration puts one person on both halves, keep it as
declared and raise it as an open question.

The declared mapping puts different people on the two halves: Josh Allen on the sender set, Steve Terry on the proxy change.

**Then state the dependency consequence explicitly** — do not leave a planner to infer the DAG from
the prose above, because two readings of the same sentence produce two different graphs:
- The observability-config leg depends on **its own upstream gate** (the kubernetes-gitops change gate) AND on **the upstream leg**, and that gate also depends on the upstream leg. Written out:
  - `kubernetes-gitops leg → kubernetes-gitops change gate`
  - `kubernetes-gitops leg → observability-config leg`
  - `kubernetes-gitops change gate → observability-config leg`
  - `observability-config leg → observability-config change gate`. This gate must be approved before the observability-config leg completes.

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
- **Preconditions verified — 2026-10-12**: the Phase 0 Requirements State Harvester deliverable of authoring run 20261012-0619 (stage `cmv4v4aix002oyx9kqbb1lr00`). It took a pod name-list read of namespace `trading`, then read each pod individually. It confirmed that at least one pod in `trading` met the population criterion (phase Running, not on the host's network, no deletion requested), so the derivation's premise held when this document was written. That is a pointer and a property only. The leg's own harvest decides what holds when the program runs.

- The work:
  1. Bind the population with a name-list read of the pods in `trading`.
  2. Read every named pod individually.
  3. Apply the population rule (`kubernetes-gitops.population`) to each pod.
  4. Publish the sender set in the declared representation (`kubernetes-gitops.representation`).

  The leg's product is the sender set that the kubernetes-gitops change gate approves (item 10). The set is point-in-time as of this leg's harvest, and the deliverable states the harvest time (`kubernetes-gitops.currency`). It also states that nothing maintains the set after the program (`kubernetes-gitops.maintenance`).
- The derivation: a pod is a member if and only if all three conditions hold:
  - its `status.phase` is `Running`;
  - `spec.hostNetwork` is not `true` (an absent field means `false`);
  - `metadata.deletionTimestamp` is absent.

  The sender set is each member's `status.podIP`, one bare address per line, one line per member, with no covering prefix and no duplicates. The deliverable reports this criterion literally, as the leg applied it (item 4).
- **If the harvest returns no pod meeting the population rule**: apply `kubernetes-gitops.inputs-empty`. The leg publishes no sender set and reports a gap. The gap names what was absent: no pod in `trading` that is Running, off the host's network and not marked for deletion. It also names what would have to exist: at least one such pod. NEVER a substitute value, and never addresses from any other namespace or source.
- **The deliverable MUST publish, explicitly and prominently**:
  1. The sender set produced by the kubernetes-gitops leg, as a block labelled `sender-set.txt`: one bare address per line.
  2. The literal criterion applied.
  3. The harvest time.
  4. The name-list read result, as a block labelled `pod-names.txt`.
  5. The per-pod raw harvest the set was derived from, as a JSON array labelled `pod-harvest.json`. Each object holds `name`, `phase`, `hostNetwork` (`true`, `false`, or `null` when absent), `deletionTimestamp` (string, or `null` when absent) and `podIP`.

  The downstream leg depends on what this leg PRODUCES at run time, not on what you read while authoring.
- **Validation (mechanical)**: save the three published blocks as the files they are labelled with. Then run the following. Expected outputs are exact.
  - Completeness. The raw harvest covers every pod the name-list read returned:
    ```
    jq -r '.[].name' pod-harvest.json | sort | diff - <(sort pod-names.txt) && echo COMPLETE
    ```
    Expected: `COMPLETE`, and no diff lines.
  - Rule re-applied. The published set equals the recomputation:
    ```
    jq -r '.[] | select(.phase=="Running" and (.hostNetwork != true) and (.deletionTimestamp == null)) | .podIP' pod-harvest.json | sort > recomputed.txt
    sort sender-set.txt | diff recomputed.txt - && echo MATCH
    ```
    Expected: `MATCH`, and no diff lines.
  - Representation. Bare addresses only, with no prefix or other token:
    ```
    grep -cvE '^[0-9A-Fa-f:.]+$' sender-set.txt
    ```
    Expected: `0`.
  - No duplicates:
    ```
    sort sender-set.txt | uniq -d | wc -l
    ```
    Expected: `0`.
  - Null case only. When the leg lands in `kubernetes-gitops.inputs-empty`, the deliverable carries no `sender-set.txt` block, and the first command above still prints `COMPLETE`. The recomputation also prints nothing, which confirms that no pod qualified.

  These checks run against the leg's own published harvest. A live re-read of the cluster is a later point in time (item 6) and may legitimately differ, so it is not a pass/fail check here. The expected outputs never name the input addresses or how many there are.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
  The input block is `pod-harvest.json` and `pod-names.txt`, and the result block is `sender-set.txt`.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
  **Prefix minimality does not apply to this leg.** Item 5 requires a host list with no covering prefix, so no aggregate is computed and none may be published. The tightest-correct property that applies instead is **exactness**:
  - every published entry is the address of a member pod;
  - every member pod's address is published;
  - there are no duplicates, and no entry is a prefix.

  A list containing a single non-member address is looser than required, and that is the rejectable defect here.
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
  For this leg, every pod in `trading` is a candidate. A pod that fails the rule rules out that pod only. The null outcome applies only after every pod the name-list read returned has been tested, and the gap names that they all were.
- ⚠️ **Verify by arithmetic, never by eyeballing.** Synthetic examples, not values from any harvest:
  - A pod in the middle of deletion still reports phase `Running`. `kubectl`'s printed `Terminating` status is not a phase. So a pod with `phase: Running` and `deletionTimestamp: "2030-01-01T00:00:00Z"` at `198.51.100.9` is NOT a member: filter on the `deletionTimestamp` field, never on the printed status.
  - A pod with `hostNetwork: true` reports the node's address as its `podIP`. So `podIP 192.0.2.10` with `hostIP 192.0.2.10` is NOT a member, and admitting it would admit the node and every host-network workload on it.
  - An absent `hostNetwork` field means `false`. Do not read it as a gap.
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
  The null case for this leg is `kubernetes-gitops.inputs-empty`, stated above.
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
  Synthetic self-check of the rule above: a pod with `phase: Running`, `hostNetwork: null`, `deletionTimestamp: null` and `podIP: 198.51.100.7` yields exactly the line `198.51.100.7`. That is a bare address, not `198.51.100.7/32`.
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence your
  derivation is correct — the checker verifies containment, not that you met the requirement.
  **Satisfy the requirements; do not target the checker.**

## Pipeline 2 objective — observability-config (DOWNSTREAM)

- Harvest the ingress proxy's as-deployed configuration (every server block, its listen port, its forwarding directive and its access directives) and the collector's as-deployed OTLP receiver configuration **read-only** (`observability-config.target`). Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — 2026-10-12**: the Phase 0 Requirements State Harvester deliverable of authoring run 20261012-0619 (stage `cmv4v4aix002oyx9kqbb1lr00`), using its collector-config read and its ingress-config read. It confirmed three properties:
  - the collector's as-deployed configuration declares OTLP receivers for both gRPC and HTTP;
  - at least one proxy block forwards to one of those receivers;
  - proxy blocks carry description text that does not by itself decide whether the block is a sender endpoint, which is why classification is by forward target (`observability-config.sender-blocks`).

  That is a pointer and a property only.
- The work:
  1. **Find the sender blocks.** From this leg's own harvest, identify every proxy block whose forwarding target (`proxy_pass` / `grpc_pass` host:port) equals an endpoint of one of the collector's OTLP receivers as declared in the collector's as-deployed receiver configuration. These blocks are the sender endpoints (`observability-config.receiver`, `observability-config.sender-blocks`), whatever their descriptions say. The restriction covers every part of the proxy that reaches those receivers (`observability-config.enforcer-scope`).
  2. **Restrict each sender block.** Replace the block's allowances with exactly the sender set, followed by a deny for everything else (`observability-config.existing-grant`). Admitted senders may then submit telemetry on those endpoints and nothing else there (`observability-config.granted-action`).
  3. **Leave non-sender blocks alone.** A block that forwards into the collector without reaching an OTLP receiver stays unchanged, and the deliverable lists each one as unchanged by owner decision (`observability-config.non-sender-paths`).
  4. **Keep the change confined.** No other server block, location, port or forwarded path on the proxy changes (`observability-config.collateral`). If a sender endpoint shares an access setting with a non-sender path, the restriction cannot be confined, so the leg reports a gap naming `observability-config.shared-access` instead of widening the change.
  5. **Use the target's own syntax.** The proxy is nginx. Each sender block's access directives take exactly this form, in this order, in the context that carries the block's forwarding directive:
     ```
     allow <SENDER_SET_ENTRY_1>;
     allow <SENDER_SET_ENTRY_2>;
     # ... one `allow <entry>;` line per entry of the chained sender set, in the order published ...
     deny all;
     ```
     Forbidden in a sender block after the change:
     - `allow all;`
     - any `allow` address carrying a `/` prefix;
     - `satisfy any;`
     - any added `set_real_ip_from`, `real_ip_header` or `proxy_protocol` directive;
     - another product's dialect: `Require ip`, `Allow from`, `whitelist-source-range`, `ipAllowList`.
- **Admitted-principal premise** (`observability-config.admitted-principal`): the proxy must see each admitted sender's own pod address as the connection's source address (nginx `$remote_addr`), on the direct path declared in `observability-config.request-path`. There are three outcomes:
  - **Harvest confirms the premise:** the leg proceeds.
  - **Harvest cannot confirm it:** apply `observability-config.principal-unseen` (act-regardless). The deliverable states the premise as owner-declared, not observed (item 14), and lists it under the package's **UNTESTED premises**.
  - **Harvest CONTRADICTS it** (it shows the senders' requests arriving translated, through an intermediary, or from an address that is not a pod's own): make no change and report, whatever that row says.
- **Existence assumption** (*Writing rules* #6): this leg's own harvest decides which branch applies:
  - The proxy itself is absent: apply `observability-config.target-absent`.
  - The proxy exists but no block forwards to an OTLP receiver: apply `observability-config.target-empty`.
  - A sender block carries no access directives: apply `observability-config.enforcer-absent`.
  - A sender block carries access directives: apply `observability-config.existing-grant`.
- It consumes the sender set produced by the kubernetes-gitops leg **as chained**. It does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and
  re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
  - **If it arrives EMPTY** (a `kubernetes-gitops.inputs-empty` gap, or no members): make no change to the target and report the upstream gap, citing `kubernetes-gitops.inputs-empty` and `observability-config.upstream-empty`. Never apply an empty set, and never write a deny-everything rule.
- **If this leg's own harvest returns no sender blocks**: apply `observability-config.target-empty` if the proxy exists but no block forwards to an OTLP receiver. Apply `observability-config.target-absent` if the proxy does not exist. The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- No further leg consumes from this one; it is the program's last leg. **The deliverable MUST publish, explicitly and prominently**, the following blocks, so that the validation below and the program tier can run:
  - the chained sender set exactly as received (`sender-set.txt`);
  - the collector receiver configuration it read (`otel-config.yaml`);
  - the complete proxy configuration tree before the change (`before/`) and after it (`after/`);
  - the sender blocks identified, each as `<file>:<line of its forwarding directive in before/>` (`sender-blocks.txt`);
  - the forwarding blocks left unchanged by owner decision, in the same form (`non-sender-blocks.txt`);
  - the text of every server block on the proxy before and after the change (`blocks-before/<id>.conf`, `blocks-after/<id>.conf`, where `<id>` is the block's `<file>:<line>` with `/` and `:` replaced by `_`);
  - the **UNTESTED premises** list;
  - a rollback plan.
- **Validation (mechanical)**: run each step against the published blocks. Expected outputs are exact.
  - Syntax:
    ```
    nginx -t -c "$PWD/after/nginx.conf"
    ```
    Expected: the two lines `nginx: the configuration file <path> syntax is ok` and `nginx: configuration file <path> test is successful`, exit 0.
  - Classification is by forward target:
    ```
    yq -r '.receivers.otlp.protocols[].endpoint' otel-config.yaml | sort -u > receivers.txt
    grep -nHE '^[[:space:]]*(proxy_pass|grpc_pass)[[:space:]]' before/*.conf \
      | sed -E 's#^before/([^:]+:[0-9]+):.*(proxy_pass|grpc_pass)[[:space:]]+[a-z0-9]+://([^;/]+).*#\3 \1#' \
      | awk 'NR==FNR{r[$1];next} ($1 in r){print $2}' receivers.txt - | sort > expected-sender-blocks.txt
    sort sender-blocks.txt | diff expected-sender-blocks.txt - && echo CLASSIFIED
    ```
    Expected: `CLASSIFIED`, and no diff lines.
  - Each sender block holds exactly the sender set, then a deny. For each `<id>` in `sender-blocks.txt`:
    ```
    grep -oE '^[[:space:]]*(allow|deny)[[:space:]]+[^;]+;' "blocks-after/<id>.conf" | sed -E 's/^[[:space:]]+//' > got.txt
    { sed 's/.*/allow &;/' sender-set.txt; echo 'deny all;'; } | diff got.txt - && echo "RESTRICTED <id>"
    ```
    Expected: one `RESTRICTED <id>` line per sender block, and no diff lines.
  - Every other block is unchanged. For each block `<id>` not in `sender-blocks.txt`:
    ```
    diff "blocks-before/<id>.conf" "blocks-after/<id>.conf" && echo "UNCHANGED <id>"
    ```
    Expected: one `UNCHANGED <id>` line per block, including every block in `non-sender-blocks.txt`.
  - Only access-directive lines change anywhere:
    ```
    diff -r before after | grep -E '^[<>]' | grep -vE '^[<>][[:space:]]*(allow|deny)[[:space:]]+[^;]+;[[:space:]]*$'
    ```
    Expected: no output.
  - Empty-upstream and gap branches only:
    ```
    diff -r before after && echo NO-CHANGE
    ```
    Expected: `NO-CHANGE`.
  - **After apply only — cannot be witnessed before the program runs.** This program produces change packages and applies nothing, so whether the proxy refuses traffic cannot be observed until a human applies the approved package out-of-band. The comparison to perform, operator-captured after apply, from a source address that is not in the sender set:
    ```
    curl -s -o /dev/null -w '%{http_code}\n' -X POST http://<proxy>:<HTTP sender endpoint port>/v1/traces -H 'Content-Type: application/json' -d '{}'
    ```
    Expected: `403`. The same request from a member pod must print something other than `403`. The deterministic pre-apply checks above are what this program itself is graded on.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs). These are declared values, given as reference data:
- Namespace the senders are drawn from: `trading` (item 1)
- Observability-config target: the ingress proxy in front of the telemetry collector's receiver (item 2)
- Sender-endpoint rule: every proxy block that forwards to one of the collector's OTLP receivers, gRPC and HTTP, whatever its description says (items 3, 22)
- Population criterion: phase Running, not on the host's network, no deletion requested (item 4)
- Representation: a host list, one entry per member pod's address, no covering prefix (item 5)
- Admission attribute and path: source address, direct (items 12, 13)
- Approvers: jacob.wilcox@paichart.com, josh.allen@paichart.com, steve.terry@paichart.com (items 7–9)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The sender set — produced by the kubernetes-gitops leg, chained into the observability-config leg's §6, settled before that leg starts. It is approved at the kubernetes-gitops change gate.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. The sender set the observability-config leg consumed exactly equals the sender set produced by the kubernetes-gitops leg. Compare the chained value with the upstream `sender-set.txt` block: `diff <(sort upstream/sender-set.txt) <(sort downstream/sender-set.txt) && echo CONSUMED-EXACT` prints `CONSUMED-EXACT`. The chained value is what counts, not a guess and not a recomputation.
2. Coverage. Every address in every sender block's `allow` lines is in the sender set produced by the kubernetes-gitops leg. Every entry of that set appears on every sender block. Every block forwarding to an OTLP receiver is in `sender-blocks.txt`. The observability-config leg's `RESTRICTED` and `CLASSIFIED` checks pass on its own published blocks.
2b. The tightest-correct property. Recompute the sender set from the kubernetes-gitops leg's published `pod-harvest.json` using item 4's criterion (the `MATCH` command under Pipeline 1). It must equal the published set exactly: no non-member address, no duplicate, no prefix. Do not take the stated value on trust.
3. No widening and no collision:
   - no sender block carries `allow all;` or a prefixed `allow`;
   - `deny all;` is the last access directive on every sender block;
   - every other block is unchanged (`UNCHANGED` checks);
   - only access-directive lines differ anywhere;
   - no change was written from an empty sender set.
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. Disclosures. The kubernetes-gitops leg's report states the literal criterion it applied and its harvest time. The observability-config leg's report lists every unchanged non-sender forwarding block as unchanged by owner decision. Where the admitted-principal premise was not confirmed, it also states that premise as owner-declared, not observed, under **UNTESTED premises**.

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

The observability-config leg consumes the sender set but cannot check it against its own state, because its service reads the proxy and the collector, not the cluster's pods. It counts as **SATISFIED** for the sender set when three properties all hold:
1. The kubernetes-gitops leg's derivation was machine-checked with no defect: `COMPLETE`, `MATCH`, `0`, `0` under Pipeline 1.
2. Program-tier checks 1, 2, 2b and 3 above pass on the chained value.
3. Chaining coverage (check 4) confirms the observability-config leg received the kubernetes-gitops leg's real deliverable.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

none

## Writing rules — read before authoring, they are the expensive part

*Rules version: 3 — 2026-09-25.* These govern how you write **every other section**. Every one was
earned by a failed or false-passing run.

1. ⚠️ **"Deterministic validation" means a reviewer can run it and compare, without judgement.**
   Every validation step is an **exact command** plus its **exact expected output** — the literal text
   or count you expect back. Prose like *"verify the loopback is up"*, *"confirm BGP advertises the
   aggregate"*, or *"check the policy is correct"* is a **REJECTABLE defect**, not a validation step:
   two reviewers could disagree on whether it passed.
   *Earned: Run 13's network leg was blocked for exactly this.*

2. ⚠️ **Ship every artefact your validation cites.** If a step invokes a policy/rule file (OPA,
   Conftest, tflint config, a test fixture), the change package must include that file's **complete,
   runnable contents**. Citing a check you did not ship is unrunnable, so it is not validation.
   *Earned: Run 10 was blocked for naming OPA/Conftest checks without shipping the rule files.*

3. 🔴 **State what must be TRUE. Do NOT name the measure that reports it.**
   Where a requirement can be written as a **property**, write the property — not the stamp shape, not
   the reason code, not the violation class, not `violations: []`. The **Program Architect** reads this
   file and composes every brief from it, so a machine pass-condition written here propagates into
   prompts **nobody inspects**, and becomes **a target an agent can aim at instead of the
   requirement**. Let the platform own the string.
   *Mechanism corrected 2026-09-21; the OBLIGATION is unchanged. This said "every agent reads this
   file". Measured: 0 of 197 change-package-author legs ever received this document, and the
   Architect is the only verbatim reader (66 of 92 executions). The hazard is WORSE than originally
   stated — the string reaches agents as a paraphrase nobody reviews.*
   *Earned: Run 15 (2026-07-29) — a leg met a published pass condition that was weaker than the
   requirement beside it, and shipped a defect. Declaring such a string "reference data" limits the
   damage; omitting it removes the temptation.*
   **Naming a measure is justified only when that state is the SUBJECT of the clause** and cannot be
   identified without it — and then say plainly that it is a state a leg legitimately lands in, never
   a bar to clear.

4. ⚠️ **Expected values stated in this document are reference data, NEVER evidence.** Where this file
   names an expected state, it describes the round's *intent* so a human can read the run. It is not
   an observation, and restating it is not a check. A tier must retrieve the **actual** value and
   construct its own finding.
   *Earned: Run 15 — Node C asserted a field's expected value, quoting the requirements, for a field
   that was **absent from the artifact entirely**.*

5. **Write properties, not hardcoded values**, wherever the environment can be rebuilt. If the rig
   re-randomizes, a magic expected string makes the round fail for the wrong reason.

6. ⚠️ **State every existence assumption a leg's objective rests on — as a BRANCH, never as today's
   state.** If a target resource may be ABSENT (a security group not yet created, an object tracked
   under another address), say what the leg does in each case: *"if the leg's own harvest finds no
   policy on the bucket, create one — absence is the expected starting point, not an escalation; if
   it finds one, modify it."* An unstated existence assumption is resolved by the design at runtime as
   an ambiguity — it costs retry generations, or worse, a guessed reconciliation. **Never write which
   branch is true today** (*"no policy exists"*, *"CREATE is the expected outcome"*): that is an
   observation of the environment, it goes false the moment anyone applies the change, and a program
   carries it forward as fact.
   *Earned: FW-A3.2/A3.3 — the same leg entered the retry band both rounds on exactly this
   ambiguity; FW-A3.5 stated it and the leg ran clean first-pass (VT-18). Rewritten 2026-09-25: the
   earlier wording asked for today's state, and a generated spec's "no enforcement point exists"
   reached a program's BINDING interface contract after the environment had gained one.*

7. ⚠️ **A constraint that exists only by convention does not exist for the agents.** Agents can
   honor any constraint observable in harvested facts or written here — nothing else. If a value is
   forbidden by operating convention but legal against every harvested fact (a subnet's zero
   address, a reserved-by-habit range), write the constraint or accept the value.
   *Earned: FW-A3.3 selected a pool containing the /24 zero address — legal against the harvest,
   off-convention, and invisible to every tier because the convention was written nowhere (VT-18).*

8. ⚠️ **State the platform dialect for any protocol ABSENT from harvested state.** A config author
   writing a protocol the target does not yet run has no harvested stanzas to imitate — it falls
   back to the textbook dialect, which is often another vendor's, and a reviewer with the same
   corpus gap approves it. If the target platform's syntax for the new protocol differs from the
   textbook form, write the platform's tokens as reference data (rule 4 applies), or accept that
   the first apply adjudicates them and may archive the round.
   *Earned: IGP-T1 R1 (2026-08-23) — an Arista EOS package carried two IOS-isms
   (`is-type level-2-only`, `metric-style wide`); the leg reviewer approved; the operator's EOS
   config-session entry rejected both, and the round was archived at its first apply gate.*
   **Prefer a positive exemplar over a negative token rule.** "Command X does not exist on this
   platform" is an omission-rule, and a generator's training prior re-inserts high-frequency
   tokens past it. A complete platform-native exemplar stanza (verified live where an operator
   can) converts generation into TRANSCRIPTION. Keep the negative list too — it is what a
   reviewer, an operator, and the platform's lint can all grep.
   *Earned: IGP-T1 R3 — with the negative dialect rules binding in its prompt, the author
   re-emitted the exact banned token R1 died on; the round was archived at its quality gate.*

   🔴 **WRITE THE EXEMPLAR — BUT DO NOT RELY ON IT HOLDING.** This rule used to end "...converts
   generation into transcription, WHICH HOLDS". That claim is now FALSIFIED and the correction is
   the most useful thing on this page. On IGP-T1 R11 the exemplar was present, complete, and
   BINDING in the leg's interface contract, under an explicit instruction to transcribe it — and
   the author silently dropped two of its lines. Its reviewer, carrying the same completeness rule,
   approved the package at 86/100 with no blocking issues. The omitted line left the routing
   protocol INACTIVE while the config entered, committed and displayed cleanly.
   What caught it was `dialect-lint`, which does not read.

   ⚠️ **One correction to that account, measured afterwards and worth more than the account itself.**
   This page used to say four guards were in force — protocol rule, role guidance, the exemplar, the
   reviewer — and that *all four* were prose that a language model bypassed. Three of those were
   genuinely in the author's prompt. **The exemplar was not.** The contract was binding on the LEG,
   but it was never delivered to the leg's own child tasks: the author received a harness-written
   paraphrase of it in its brief, **missing 7 of the exemplar's 10 lines** — and the reviewer's brief
   was missing 9 of 10. Measured across every archived leg that carried a contract, the same hole was
   universal: **7 of 7 legs lossy, 0 of N children ever holding the contract.** So the author did not
   ignore a complete exemplar; it faithfully transcribed an incomplete one. That is a mechanical
   defect, and it has since been fixed — the contract is now inherited verbatim by every child on its
   own structured channel, and briefs are forbidden from restating it.
   **The transferable lesson is the one that cost us the misdiagnosis: before concluding that a model
   ignored a rule, verify the rule was IN ITS PROMPT.** "Binding" is a property of a document; being
   *present* is a property of a prompt, and the two drift apart silently. A guard you believe is in
   force and that is merely absent produces evidence indistinguishable from a guard that was
   disobeyed — and it argues for exactly the wrong fix (write the prose more forcefully) while the
   real defect is that nothing was delivered.
   The rest of the account stands, and so does the conclusion: the reviewer DID hold the complete
   rule and still approved, and `dialect-lint` — which does not read — is what caught it.
   **So the exemplar's real value is not that an agent obeys it — it is that it is the SPECIFICATION
   the platform's lint checks against.** Nobody ever wrote "this line is required"; the lint derives
   every required line by decomposing this block. A better exemplar therefore buys you a better
   mechanical check, which is the part that actually holds. Write it carefully for that reason.
   *Earned: IGP-T1 R11 (2026-08-25) — dialect-lint's first live run, catching what four prose
   guards and one LLM reviewer had all passed.*
   **COMPLETENESS is half the rule, and the half that hides.** A required line of the exemplar that
   is ABSENT is as defective as a wrong token, and more dangerous: the config enters, commits and
   displays cleanly while the thing it configures stays INACTIVE. State completeness as a property —
   "the shape must appear COMPLETE, every line, in order" — and name the mechanism, never the line a
   prior round dropped.
   *Earned: IGP-T1 R7 — an omitted line left the protocol disabled; the package was banned-token
   clean and approved at 90/100 by a reviewer checking only the absence direction.*

9. ⚠️ **A validation target the harvest cannot see does not license prose.** When rule 1 demands a
   literal expected output for state the read-only service has no getter for, the author has two
   deterministic paths and must take (and name) at least one: derive the literal expectation from
   declared topology facts (identities, counts, states that are static by design — excluding and
   naming the dynamic fields), and/or mandate an operator-captured pre-change baseline of the exact
   command with a post-change byte-diff of the static fields. State the gap; never fabricate the
   baseline, and never describe the check in prose.
   *Earned: IGP-T1 R1+R2 — the same unharvestable check was handled well by one author (topology
   literals + operator capture) and as prose by the next, whose reviewer correctly blocked it; the
   deterministic shape was never written anywhere, so craft variance decided the round.*

10. ⚠️ **A `[NEUTRALIZED-...]` sanitizer marker seen in CHAINED context is a platform view-layer
    annotation — it is not evidence the marker exists in the document itself.** The platform
    sanitizes text at the boundary where one agent's output is chained into another's context, so
    a reviewer's view can carry a neutralization marker that the at-rest deliverable does not.
    A reviewer must report a marker as an OBSERVATION (naming where it appeared), never as a
    blocking document defect; deliverable hygiene is verified against the at-rest artifact by the
    program tier and the human operator, who can read the document as stored.
    *Earned: IGP-T1 R5 — a clean package's "System IDs..." paragraph false-positived an injection
    pattern at the chaining boundary; the reviewer, seeing the marker in its view, blocked a
    document that contained no marker at rest. The round was archived on a defect that did not
    exist.*

11. ⚠️ **Every validation step must be SATISFIABLE under the phase's own constraints.** Before you
    write an expected output, ask: *can this pass, GIVEN what this phase is required to do?* A step
    whose expected output is precluded by the phase's own requirement makes a CORRECT change look
    failed — the operator then rolls back good work, or "fixes" it by violating the requirement.
    Where a property can be observed several ways, state the PROPERTY and name an observable the
    phase does not preclude.
    *Earned: IGP-T1 R9 — a step required one protocol's routes to appear in the routing table while
    the same phase required the OTHER protocol to stay preferred, which guarantees they never
    install. The same defect recurred in that round's parity criterion, which compared installed
    routes during deliberate coexistence and reported failure on a healthy fabric.*

12. 🔴 **Writing rule 3 governs EVERY channel an agent reads — not just this file.** Task
    descriptions, gate comments, and run notes are all agent-readable contract. Naming a prior
    round's specific defect token there lets the agent satisfy the POINTER instead of the PROPERTY,
    and a round that then passes evidences only "the agent avoided the line it was told about".
    Name the property, name the mechanism, cite the earning round for provenance — never the token.
    *Earned: a round was superseded before its plan gate for exactly this, and re-run clean, which
    is the only reason its result was usable as evidence.*

13. ⚠️ **A value the evidence source does not directly carry must be labelled DERIVED, and its
    basis named.** Where a criterion requires such a value, the value is still legitimate — DERIVE
    it, then say it is derived and name what it was derived from. Never silently promote a
    derivation to a quotation, and never assert a blanket "every value here is a direct quote from
    tool output" over a table that contains one. Do NOT "solve" this by dropping the field or by
    switching to a source that merely prints the word: derive, disclose, and let the reviewer judge
    the derivation.
    🔴 **Check THIS document first.** If a deliverable spec tells the author to present such a value
    "as retrieved output", the author is doing what it was told and the defect is here, not in the
    agent. A requirement that asks for a value its own named evidence source cannot supply is the
    same class of defect as rule 11's unsatisfiable step.
    *Earned: IGP-T1 R15 and R16 — a derived value presented as a literal quote from a source that
    structurally cannot carry it. Where the topology makes the derivation trivially correct, the
    answer is RIGHT and only its stated provenance is wrong, which is exactly the shape a reviewer
    skims past: R16's reviewer blocked it, R15's did not and it shipped. The requirement itself had
    said "as retrieved output".*

14. ⚠️ **A numbered acceptance check keeps its NUMBER for the life of the program family, even
    when its property is narrowed.** Rounds are compared against each other, and "check 2 passed" is
    only meaningful if check 2 is the same check it was last round. When a topology or scope change
    makes a check's original property unobservable, do not renumber, delete, or silently substitute:
    keep the number, narrow the property HONESTLY, and state in the check itself that it is narrower
    and what a pass now evidences. Renumbering makes every prior round's result uncitable;
    substituting silently makes them wrong — a pass gets reported as evidence of a property nobody
    checked.
    *Earned: Run 15 (fabric expansion) — a new clause was added to a requirements file and the
    reviewer renumbered it into the slot held by the minimality check, which it then never
    performed; a non-minimal result shipped as approved. **A renumbering silently deletes a
    check.** The narrowing half was earned on IGP-T1's 2-node topology, where a check written for a
    richer fabric could not express its original property and kept its number with the narrowing
    stated, so the round stayed comparable.*

15. 🔴 **A crossing VALUE always names its producer. "the PRODUCED range" is not one value — it is two.**
    Wherever this file names a value that crosses between legs, write *"the range produced by the
    FABRIC leg"*, never a bare *"the PRODUCED range"*. A bare participle has no subject, and the
    phrase that follows it usually attaches the value to the CONSUMER's artifact (*"the produced range
    **as an ingress source**"*), which then reads as the consuming leg's own output. **Two readings of
    one sentence produce two different DAGs**, and a planner picks one without telling you which —
    unless it happens to notice.
    *Earned 2026-09-17 (telemetry-export-four-domain): the Approvals table said "the PRODUCED range as
    an ingress source" while the sentence four lines below said each downstream pipeline waits on its
    own gate. Both readings were defensible on the text. The Program Architect DID notice, chose one,
    flagged it as an Open Question and asked for confirmation before plan approval — the plan gate was
    released without answering it, and all four change packages were produced with zero domain
    approvals. The gates held the RELEASE, so nothing shipped; but an intent gate that runs after the
    work is a record, not a control.*
    **General form: a noun phrase that omits its subject gets bound to whoever reads it.** Apply it to
    crossing values first, because those decide the graph.
    ⚠️ **Do not over-generalise this to every role-agnostic sentence.** On the same run a role-agnostic
    *"show the computation in the deliverable"* was suspected of misdirecting the change-package author
    into a clause-(f) violation, and **measured not to** — the platform writes per-role task
    descriptions, and that instruction reached the architect and the reviewer but never the author.
    Verify that a sentence actually propagates to the role you think it misled before rewriting it.

    ### ✅ VALIDATED END TO END 2026-09-18 — and the same rule covers SCOPE WORDS, not just values

    A second instance of this family was found, fixed and **proven** on a live campaign, so the rule
    is no longer reasoning from one case.

    **The defect**: acceptance check 3 of a firewall program said *"no **hop** widens the flow."*
    "Hop" reads naturally as the DEVICE (edge / DMZ / core). It was also true of every match list
    WITHIN a device — and on an edge doing source-NAT that is two lists, a security ACL and a
    NAT-match ACL. Three rounds of the same program authored that one list three different widths:
    `tcp <partner> any eq 443` (destination too wide, **not caught**), the correct
    `tcp <partner> host <app> eq 443`, and `ip <partner> any`. The program reviewer blocked the third.
    The requirement was meticulous about the NAT POOL's minimality and silent about the NAT MATCH
    list, so which reading an author took was left to chance.

    **The fix was one definition** — no new obligation, no new constraint:
    > *"**Hop" here means every match list that selects traffic at that hop, NOT just the device.** ...
    > the check is on what the configuration PERMITS, not on what happens to reach it. Every selecting
    > list at a hop carries the same destination and port bounds as that hop's tightest one.*

    **The outcome, measured**: the next round went from `programReleasable: false` to **true**. The
    definition propagated with no human repeating it — the Architect's plan carried it, the leg's brief
    stated it as a named clause, the author **self-checked against it by name**, a second author in a
    different domain cited the same clause, and the program reviewer that had refused the round before
    approved with no blocking issues. Leg scores rose 85→88 and 84→90.

    🔴 **So the rule generalises past values: any term the acceptance checks TURN ON must be defined
    where it is used.** A value needs its producer; a scope word needs its extent. The test is the
    same one — *can this phrase be read two ways that produce different work?* — and the cost of
    leaving it is not a wrong answer, it is a **coin flip across rounds**, which is worse because it
    looks like craft variance and gets remediated at the wrong layer.

    ⚠️ **The discriminator that tells you which layer**: RECURRENCE. The same contract producing
    different results across rounds, from different authors, is an under-specified requirement and
    belongs here. A single slip — a transposed multiplication, a mis-scoped validation step — is craft
    and belongs in a re-run or in role guidance. Encoding a craft slip's specific answer into a
    requirement buys a green that proves nothing; it teaches to the test.

---
