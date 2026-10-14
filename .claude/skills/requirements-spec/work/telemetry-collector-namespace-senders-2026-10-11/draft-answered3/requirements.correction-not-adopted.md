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
| kubernetes-gitops.item-6 | as of when the sender set is valid, and whether anything maintains it after the program | — | point-in-time as of the leg's harvest; the deliverable states the harvest time; nothing maintains the set after the program | (declared — item 6: "The sender set is point-in-time as of the leg's harvest; the deliverable states the harvest time. Nothing maintains the set after the program") |
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
| observability-config.item-22 | which proxy blocks count as sender endpoints | — | every proxy block that forwards to one of the collector's OTLP receivers, whatever its own description says | (declared — item 22: "A proxy block is a sender endpoint if it forwards to one of the collector's OTLP receivers, whatever its own description says (every-block-forwarding-to-an-OTLP-receiver)") |
| observability-config.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: the member pods' addresses, as the host list produced by the kubernetes-gitops leg | (declared — item 12: "The observability-config leg admits senders by source address: the member pods' addresses, as the host list in item 5") |
| observability-config.request-path | the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) | direct · private-endpoint · translated | direct, carrying each pod's own address | (declared — item 13: "The admitted senders' requests reach the proxy directly, carrying each pod's own address (direct)") |
| observability-config.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless; the deliverable states the premise as owner-declared, not observed | (declared — item 14: "If the leg's own harvest cannot confirm that the proxy sees the pods' own addresses, the leg acts anyway (act-regardless)") |
| observability-config.granted-action | what the admitted principal may do (actions, ports) | — | submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP, and nothing else on those endpoints | (declared — item 15: "Admitted senders may submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP (item 3), and nothing else on those endpoints") |
| observability-config.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | replace: on every sender block, the allowances become exactly the sender set, followed by a deny for everything else | (declared — item 16: "the allowances are replaced by exactly the sender set, followed by a deny for everything else (replace)") |
| observability-config.item-16 | what happens to proxy blocks that forward into the collector without reaching an OTLP receiver | — | left unchanged; each one is listed in the deliverable as unchanged by owner decision | (declared — item 16: "the leg leaves them unchanged and lists each one in its deliverable as unchanged by owner decision") |
| observability-config.target-empty | the receiver selector/surface matches nothing now | act · gap | gap: report a gap and author nothing | (declared — item 17: "If no proxy block forwards to the OTLP sender endpoints, the observability-config leg reports a gap and authors nothing (gap)") |
| observability-config.enforcer-absent | no policy object governs the receiver yet | create · gap | create: add the access directives to that block | (declared — item 18: "If a block forwarding to the sender endpoints carries no access directives, the observability-config leg adds them to that block (create)") |
| observability-config.target-absent | the declared target itself does not exist | gap · create-target | gap: report a gap and create nothing | (declared — item 19: "If the proxy does not exist, the observability-config leg reports a gap and creates nothing (gap)") |
| observability-config.item-20 | what the leg does when no sender set arrives from the kubernetes-gitops leg | — | make no change to the proxy, report the upstream gap, and never write a deny-everything rule from an empty set | (declared — item 20: "If no sender set is published, the observability-config leg makes no change to the proxy and reports the upstream gap; it never writes a deny-everything rule from an empty set") |
| observability-config.collateral | what else on the target changes because enforcement now applies | confined-to-block · whole-listener · gap | confined-to-block: no other server block, location, port or forwarded path on the proxy changes | (declared — item 21: "no other server block, location, port or forwarded path on the proxy changes") |
| observability-config.item-21 | what the leg does when a sender endpoint shares an access setting with a non-sender path | — | report a gap instead of widening the change | (declared — item 21: "If the leg finds that a sender endpoint shares an access setting with a non-sender path, so the restriction cannot be confined to the sender endpoints, it reports a gap instead of widening the change") |
| observability-config.enforcer-scope | which parts of the enforcer the restriction covers | all-reaching-the-protected-thing · exemption-by-property · gap | all-reaching-the-protected-thing | (declared — item 23: "covers every part of the proxy that reaches the collector's OTLP receivers (all-reaching-the-protected-thing)") |

### A leg that changes routes (routing)

Neither leg adds, suppresses, filters, withdraws or replaces routes or how they are advertised. The routing rows are deleted for both legs and listed as `not-applicable` in *Decisions needed from the owner*.

## Decisions needed from the owner

<!-- one line per row that is not simply declared:
<row id> — <question> — options: <enum> — governs: <which leg clause> — tier: blocking | confirm | default | not-applicable -->
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

  The leg's product is the sender set that the kubernetes-gitops change gate approves (item 10). The set is point-in-time as of this leg's harvest. The deliverable states the harvest time, and states that nothing maintains the set after the program (`kubernetes-gitops.item-6`).
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
  - proxy blocks carry description text that does not by itself decide whether the block is a sender endpoint, which is why classification is by forward target (`observability-config.item-22`).

  That is a pointer and a property only.
- The work:
  1. **Find the sender blocks.** From this leg's own harvest, identify every proxy block whose forwarding target (`proxy_pass` / `grpc_pass` host:port) equals an endpoint of one of the collector's OTLP receivers as declared in the collector's as-deployed receiver configuration. These blocks are the sender endpoints (`observability-config.receiver`, `observability-config.item-22`), whatever their descriptions say. The restriction covers every part of the proxy that reaches those receivers (`observability-config.enforcer-scope`).
  2. **Restrict each sender block.** Replace the block's allowances with exactly the sender set, followed by a deny for everything else (`observability-config.existing-grant`). Admitted senders may then submit telemetry on those endpoints and nothing else there (`observability-config.granted-action`).
  3. **Leave non-sender blocks alone.** A block that forwards into the collector without reaching an OTLP receiver stays unchanged, and the deliverable lists each one as unchanged by owner decision (`observability-config.item-16`).
  4. **Keep the change confined.** No other server block, location, port or forwarded path on the proxy changes (`observability-config.collateral`). If a sender endpoint shares an access setting with a non-sender path, the restriction cannot be confined, so the leg reports a gap naming `observability-config.item-21` instead of widening the change.
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
  - **If it arrives EMPTY** (a `kubernetes-gitops.inputs-empty` gap, or no members): make no change to the target and report the upstream gap, citing `kubernetes-gitops.inputs-empty` and `observability-config.item-20`. Never apply an empty set, and never write a deny-everything rule.
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

<!-- WRITING-RULES -->

Confidence: 88
