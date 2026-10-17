# Program Requirements — Restrict telemetry collector senders to `trading` namespace pods

- Authored in: Telemetry collector access control · Requirements
- Iteration: Run 20261017-0642 · 2026-10-17
- Status: **DRAFT for human review** at the program plan gate. Not approved, not final, not ready to launch.

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. Each leg is a distinct domain: a different protocol against a different class of target.
  1. **kubernetes-gitops** (UPSTREAM) on the pods of the Kubernetes namespace `trading`, described in `topology.json`. This leg produces the sender set.
  2. **observability-config** (DOWNSTREAM) on the ingress proxy in front of the telemetry collector's receiver. This leg consumes the sender set and restricts the collector's OTLP sender endpoints to it.
- The following are explicitly **out of scope**:
  - any namespace other than `trading`
  - any change to the cluster: the kubernetes-gitops leg's product is the sender set its gate approves (`gate.kubernetes-gitops-change.position`), not a cluster change
  - any proxy server block, location, port or forwarded path other than the sender endpoints (`observability-config.collateral`)
  - the collector's own configuration
  - maintaining the sender set after the program (`kubernetes-gitops.item-6`)
  - applying any change: apply is out-of-band and human-gated

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of the Kubernetes namespace `trading` | (declared — item 1: "acts on the pods of the Kubernetes namespace `trading`") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | a pod in namespace `trading` whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested; the leg reports, in its own published deliverable, the literal criterion it applied | (declared — item 4: "A member of the sender population is a pod in the declared namespace whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: one entry per member pod's address, with no covering prefix | (declared — item 5: "expressed as a host list: one entry per member pod's address, with no covering prefix") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: publish no sender set, and report a gap naming what was absent | (declared — item 20: "the kubernetes-gitops leg publishes no sender set and reports a gap naming what was absent (gap)") |
| kubernetes-gitops.item-6 | the sender set's time basis and upkeep | — | the sender set is point-in-time as of the leg's harvest; the deliverable states the harvest time; nothing maintains the set after the program | (declared — item 6: "The sender set is point-in-time as of the leg's harvest; the deliverable states the harvest time. Nothing maintains the set after the program.") |
| observability-config.target | which surface of the leg's service does it act on | — | the ingress proxy in front of the telemetry collector's receiver | (declared — item 2: "acts on the ingress proxy in front of the telemetry collector's receiver") |
| observability-config.item-20 | what the leg does when no sender set is published upstream | — | make no change to the proxy, and report the upstream gap; never write a deny-everything rule from an empty set | (declared — item 20: "If no sender set is published, the observability-config leg makes no change to the proxy and reports the upstream gap; it never writes a deny-everything rule from an empty set") |
| observability-config.item-22 | whether a block's description decides sender-endpoint membership | — | apart from the exemption in `observability-config.enforcer-scope`, a block's own description does not decide whether it is a sender endpoint | (declared — item 22: "Apart from that exemption, a block's own description does not decide whether it is a sender endpoint") |
| approver.program-plan | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 7: "The program plan gate is approved by jacob.wilcox@paichart.com") |
| approver.kubernetes-gitops-change | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 8: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.observability-config-change | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 9: "The observability-config change gate is approved by steve.terry@paichart.com") |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers: after the kubernetes-gitops leg, before the observability-config leg | (declared — item 10: "sits after that leg and before the observability-config leg (after-producer-before-consumers)") |
| gate.observability-config-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion: after the observability-config leg, before its completion | (declared — item 11: "sits after that leg and before its completion (after-leg-before-completion)") |

### A leg that grants or removes access (authorisation)

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| observability-config.receiver | which workload/resource on the target is authorised | — | every proxy block that forwards to one of the collector's OTLP receivers (gRPC and HTTP), except a block exempt under `observability-config.enforcer-scope`. A path the proxy forwards into the collector that does not reach an OTLP receiver is not a sender endpoint. | (declared — item 3: "Every proxy block that forwards to one of the collector's OTLP receivers is a sender endpoint, except a block exempted by item 23") |
| observability-config.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source address: the member pods' own addresses, as the host list in `kubernetes-gitops.representation` | (declared — item 12: "admits senders by source address: the member pods' addresses, as the host list in item 5") |
| observability-config.request-path | the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in | direct · private-endpoint · translated | direct: each request reaches the proxy carrying the sending pod's own address | (declared — item 13: "reach the proxy directly, carrying each pod's own address (direct)") |
| observability-config.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless: the leg acts, relying on `observability-config.request-path`, and states that premise in its deliverable as owner-declared, not observed | (declared — item 14: "the leg acts anyway (act-regardless)"); (declared — item 14: "states that premise in its deliverable as owner-declared, not observed") |
| observability-config.granted-action | what the admitted principal may do (actions, ports) | — | submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP, and nothing else on those endpoints | (declared — item 15: "may submit telemetry on the collector's OTLP sender endpoints, gRPC and HTTP (item 3), and nothing else on those endpoints") |
| observability-config.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | replace: on every sender endpoint, the allowances are replaced by exactly the sender set, followed by a deny for everything else. Blocks that forward non-OTLP paths into the collector are left unchanged, and each is listed in the deliverable as unchanged by owner decision. | (declared — item 16: "the allowances are replaced by exactly the sender set, followed by a deny for everything else (replace)"); (declared — item 16: "the leg leaves them unchanged and lists each one in its deliverable as unchanged by owner decision (item 3)") |
| observability-config.target-empty | the receiver selector/surface matches nothing now | act · gap | gap: report a gap and author nothing | (declared — item 17: "If no proxy block forwards to the OTLP sender endpoints, the observability-config leg reports a gap and authors nothing (gap)") |
| observability-config.enforcer-absent | no policy object governs the receiver yet | create · gap | create: where a sender-endpoint block carries no access directives, the leg adds them to that block | (declared — item 18: "If a block forwarding to the sender endpoints carries no access directives, the observability-config leg adds them to that block (create)") |
| observability-config.target-absent | the declared target itself does not exist | gap · create-target | gap: report a gap and create nothing | (declared — item 19: "If the proxy does not exist, the observability-config leg reports a gap and creates nothing (gap)") |
| observability-config.collateral | what else on the target changes because enforcement now applies | confined-to-block · whole-listener · gap | confined-to-block: senders outside the set are refused on the sender endpoints, and no other server block, location, port or forwarded path on the proxy changes. Where a sender endpoint shares an access setting with a non-sender path, so the restriction cannot be confined, the outcome is gap: report it and do not widen the change. | (declared — item 21: "senders outside the set are refused there, and no other server block, location, port or forwarded path on the proxy changes"); (declared — item 21: "it reports a gap instead of widening the change") |
| observability-config.enforcer-scope | which parts of the enforcer the restriction covers | all-reaching-the-protected-thing · exemption-by-property · gap | exemption-by-property: the restriction covers every part of the proxy that reaches the collector's OTLP receivers, except a block whose own description states that it is an operator path and not part of the sender allowlist. That block and its existing allowances stay unchanged, and the admitted-principal premise is not judged on it. It is listed in the deliverable as exempt by owner decision, quoting the literal description line matched. A block with no description does not carry the property. If the harvest does not return the proxy's configuration with its description lines, the outcome is gap: no change. | (declared — item 23: "except a block whose own description states that it is an operator path and not part of the sender allowlist (exemption-by-property)"); (declared — item 23: "the leg reports a gap and makes no change") |

### A leg that changes routes (routing)

No leg in this program adds a covering route or changes routes or their advertisement. The observability-config leg filters traffic at the proxy, which is authorisation, not routing. Both routing rows are therefore deleted for both legs, and each deletion is listed as `not-applicable` in *Decisions needed from the owner*.

## Decisions needed from the owner

kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg grants and removes no access on its target; its product is the sender set its gate approves (item 10), and only the observability-config leg changes access
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg grants and removes no access on its target
kubernetes-gitops.request-path — the path the admitted senders' requests take to the enforcer — options: direct · private-endpoint · translated — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg grants and removes no access on its target, so it admits no one by address
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg grants and removes no access on its target
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg grants and removes no access on its target
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg grants and removes no access on its target
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg authorises no receiver; its empty case is governed by kubernetes-gitops.inputs-empty
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg creates and changes no enforcer
kubernetes-gitops.target-absent — the declared target itself does not exist — options: gap · create-target — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg grants and removes no access on its target; an absent namespace yields no member pod, which kubernetes-gitops.inputs-empty governs
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: allow-named-ports · deny · leave-to-workload-manifests — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg applies no enforcement on its target
kubernetes-gitops.enforcer-scope — which parts of the enforcer the restriction covers — options: all-reaching-the-protected-thing · exemption-by-property · gap — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the kubernetes-gitops leg applies no restriction on its target
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no clause of the kubernetes-gitops leg (row deleted) — tier: not-applicable — the leg is not a routing leg: it changes no route and no route advertisement
observability-config.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no clause of the observability-config leg (row deleted) — tier: not-applicable — the leg adds no advertised covering route
observability-config.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no clause of the observability-config leg (row deleted) — tier: not-applicable — the leg is not a routing leg: it filters traffic at the proxy (authorisation) and changes no route and no route advertisement

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No ⇒ sequenced.** The observability-config leg needs the sender set: the address of every pod in `trading` that meets `kubernetes-gitops.population`, as a host list (`kubernetes-gitops.representation`). The sender set cannot be known in advance, for these reasons:

- **The cluster assigns the addresses.** A pod gets its address when it is scheduled, and gets a new one whenever it is recreated (rollout, reschedule, eviction, node loss).
- **Membership depends on live state.** Whether a pod is a member depends on its phase, whether it is on the host's network, and whether its deletion has been requested.
- **The value is read from live state at harvest time.** The sender set is point-in-time as of the kubernetes-gitops leg's harvest (`kubernetes-gitops.item-6`), so it cannot be pinned in a static artifact or agreed in a contract.
- **The Program Architect cannot know it.** The Architect reads only `topology.json` and this file and has no live state access.

Choosing the sender set is a design decision, not a lookup. The owner declared both the selection rule (items 1 and 4) and the representation (item 5), and those must be applied to state that exists only when the leg runs.

**What goes wrong if someone guesses it up front:**

- A guessed or authoring-time list would admit addresses that may since have been reassigned to other pods, in any namespace, and would refuse current members.
- Replacing the list with a covering prefix "to be safe" would admit every address inside that prefix. That breaks item 5 and widens who is authorised.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one.

All three were confirmed against the POV team roster read on 2026-10-17:
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
| program plan | the plan and the interface contract | the Program Architect | every leg | Jacob Wilcox, jacob.wilcox@paichart.com (declared) |
| kubernetes-gitops change | the sender set produced by the kubernetes-gitops leg (a produced value; its producer is the kubernetes-gitops leg) | the kubernetes-gitops leg | the observability-config leg | Josh Allen, josh.allen@paichart.com (declared) |
| observability-config change | the change package produced by the observability-config leg (a produced value; its producer is the observability-config leg) | the observability-config leg | the observability-config leg's completion. No change package is released as approved until this gate passes; it governs no later leg. | Steve Terry, steve.terry@paichart.com (declared) |

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

The declared mapping puts three different people on the three gates, so no person approves both halves.

**Dependency consequence. These edges must all exist:**
- `program plan gate → kubernetes-gitops leg` and `program plan gate → observability-config leg`
- `kubernetes-gitops leg → kubernetes-gitops change gate`
- `kubernetes-gitops change gate → observability-config leg`: the gate edge, which decides **when** the leg may start
- `kubernetes-gitops leg → observability-config leg`: the direct edge, which is **how the sender set reaches it**
- `observability-config leg → observability-config change gate`. The program completes only after this gate.

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

- Harvest the pods of the Kubernetes namespace `trading` (`kubernetes-gitops.target`) **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — 2026-10-17 (harvest window starting 06:44Z, Phase 0 harvest of requirements Run 20261017-0642)**:
  - **Harvest read:** the Phase 0 Requirements State Harvester listed the pod names in `trading`, then read each pod individually.
  - **Property confirmed:** at least one pod in `trading` satisfies `kubernetes-gitops.population`, and each such pod carries an address in its status.

- **Work.** Read every pod in namespace `trading`. Select the members by `kubernetes-gitops.population`.
- **Criterion disclosure.** The deliverable states, as literal text, the criterion it applied. That criterion names:
  - the namespace
  - the phase test
  - the host-network test
  - the deletion-requested test
  - which pod fields it read for each test
- **Time basis.** The deliverable states the harvest time, and states that the set is point-in-time and that nothing maintains it after the program (`kubernetes-gitops.item-6`).
- **Derivation.** The sender set is a host list (`kubernetes-gitops.representation`): one entry per member pod's address, read from the pod's address field (`status.podIP`), with no covering prefix.
- **If the harvest returns no member pods** (the namespace is absent, holds no pods, or no pod meets the population rule): apply `kubernetes-gitops.inputs-empty`.
  - Publish no sender set.
  - Report a gap naming what was absent: which of those three conditions held, and for each pod read, which population test excluded it.
  - **Never a substitute value**, never a placeholder set, and never a prefix.
- **The deliverable MUST publish, explicitly and prominently**, the sender set produced by the kubernetes-gitops leg, under the rule in `kubernetes-gitops.population` and `kubernetes-gitops.representation`, as two blocks:
  - **Input block:** a fenced `json` block carrying every pod the namespace listing returned, members and non-members alike. For each pod it carries `metadata.name`, `metadata.namespace`, `metadata.deletionTimestamp`, `spec.hostNetwork`, `status.phase` and `status.podIP` as read, inside `{"harvestTime": "<UTC timestamp>", "items": [ ... ]}`.
  - **Result block:** a fenced block holding one address per line.
  - The downstream leg depends on what this leg PRODUCES at run time, not on what was read while authoring.
- **Validation (mechanical).** Save the input block as `sender-set-inputs.json` and the result block as `sender-set.txt`. The check re-obtains the inputs from the published input block, which is the leg's harvest at its stated harvest time. It then re-applies the population rule.

  A live re-read made after the harvest time measures drift, which item 6 declares unmaintained, so it does not test this derivation.
  ```
  jq -r '.items[]
    | select(.metadata.namespace == "trading")
    | select(.status.phase == "Running")
    | select((.spec.hostNetwork // false) == false)
    | select(.metadata.deletionTimestamp == null)
    | .status.podIP' sender-set-inputs.json | sort -u > recomputed.txt
  diff recomputed.txt <(sort -u sender-set.txt) && echo MATCH
  ```
  Expected: `MATCH`, with no diff lines. The published value equals the recomputation, and every re-obtained member input lies inside it.
  ```
  jq -r '[.items[].metadata.namespace] | unique | join(",")' sender-set-inputs.json
  ```
  Expected: `trading`
  ```
  sort sender-set.txt | uniq -d | wc -l
  grep -c '/' sender-set.txt
  ```
  Expected: `0`, then `0` (no duplicate entries, and no entry carries a prefix length).

  On the `kubernetes-gitops.inputs-empty` branch, run the `jq … | sort -u > recomputed.txt` step above and then `wc -l < recomputed.txt`. Expected: `0`. The deliverable carries the gap report and no result block.

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
- ⚠️ **Verify by arithmetic, never by eyeballing.** For a host list, the trap is to cover the members with a range instead of listing them. The examples below use synthetic addresses only:
  - Members `192.0.2.10` and `192.0.2.11` form an aligned pair that a `/31` would cover exactly, but item 5 forbids any covering prefix. They are published as two host entries.
  - Members `192.0.2.11` and `192.0.2.12` are adjacent but not an aligned pair. Their smallest cover is a `/30` (`192.0.2.8/30`), which would also admit `.8`, `.9` and `.10`.
  - A pod on the host's network reports the node's address as its own. Including it would admit every process on that node, which is why the population rule excludes it.
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

- Harvest the ingress proxy in front of the telemetry collector's receiver (`observability-config.target`) **read-only**: every proxy configuration file with its description lines. Also harvest the collector's own receiver configuration, which decides which proxy blocks forward to an OTLP receiver. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — 2026-10-17 (harvest window starting 06:44Z, Phase 0 harvest of requirements Run 20261017-0642)**:
  - **Harvest read:** the Phase 0 Requirements State Harvester read the proxy configuration and the collector's receiver configuration.
  - **Properties confirmed:** the proxy configuration is returned with its description lines, and at least one proxy block forwards to an OTLP receiver that the collector's receiver configuration declares.
- **Classify every proxy block** that forwards into the collector. Each block falls into exactly one of three classes:
  - **Sender endpoint:** the block forwards to an OTLP receiver (`observability-config.receiver`) and the exemption does not apply. Its description does not otherwise decide membership (`observability-config.item-22`).
  - **Exempt:** the block's own description carries the operator-path property (`observability-config.enforcer-scope`).
  - **Non-sender forwarding block:** the block forwards a path that does not reach an OTLP receiver (`observability-config.receiver`).
- **On every sender endpoint:**
  - Replace the allowances with exactly the sender set, followed by a deny for everything else (`observability-config.existing-grant`).
  - The admitted senders may submit telemetry on the gRPC and HTTP sender endpoints and nothing else there (`observability-config.granted-action`).
  - Senders outside the set are refused there, and no other server block, location, port or forwarded path changes (`observability-config.collateral`).
- **Every exempt block** is left unchanged with its existing allowances. Each is listed in the deliverable as exempt by owner decision, quoting the literal description line matched (`observability-config.enforcer-scope`).
- **Every non-sender forwarding block** is left unchanged and listed in the deliverable as unchanged by owner decision (`observability-config.existing-grant`).
- **Gap: no description lines.** If the leg's harvest does not return the proxy's configuration with its description lines, report a gap naming `observability-config.enforcer-scope` and make no change.
- **Gap: shared access setting.** If a sender endpoint shares an access setting with a non-sender path, so the restriction cannot be confined, report a gap naming `observability-config.collateral` and do not widen the change.
- **Admitted-principal premise** (`observability-config.admitted-principal`): the proxy must see, as the request's source address, the sending pod's own address. The sender's requests must arrive on the direct path (`observability-config.request-path`).
  - **If the leg's own harvest cannot confirm this,** apply `observability-config.principal-unseen`:
    - act regardless;
    - state the premise in the deliverable as owner-declared, not observed;
    - list it under the package's **UNTESTED premises**.
  - **If the harvest CONTRADICTS the premise,** make no change and report. A contradiction is a sender endpoint whose source address the proxy takes from somewhere other than the connecting peer (a forwarded-address header or a real-address substitution), or whose requests arrive through a translating hop. This holds whatever `observability-config.principal-unseen` says.
  - The premise is not judged on exempt blocks (`observability-config.enforcer-scope`).
- **Existence assumption** (*Writing rules* #6). The leg's own harvest decides which branch applies; none is assumed true today:
  - If the proxy does not exist, apply `observability-config.target-absent`.
  - If no proxy block forwards to the OTLP sender endpoints, apply `observability-config.target-empty`.
  - If a sender-endpoint block carries no access directives, apply `observability-config.enforcer-absent`.
  - If a sender-endpoint block carries access directives, apply `observability-config.existing-grant`.
- **Exemplar stanza (reference data: nginx syntax, the proxy kind the Preconditions harvest read).** The leg must write the complete access-directive block on each sender endpoint, every line in this order:
  ```
  allow <sender-set entry 1>;
  allow <sender-set entry 2>;
  # ... one allow line per entry of the sender set produced by the kubernetes-gitops leg ...
  deny all;
  ```
  - **Forbidden tokens on a sender endpoint:**
    - `allow all;`
    - any address carrying a prefix length (`/`)
    - any hostname in an allow line
    - any `deny` line before the last `allow`
    - `satisfy any`
    - any `set_real_ip_from`, `real_ip_header` or `real_ip_recursive` directive, which changes the address the proxy matches (`observability-config.request-path`)
  - **Inheritance trap (nginx):**
    - Access directives at server level apply to every location in that server that has none of its own.
    - A location that carries any access directive inherits none from its server.
    - So server-level directives in a server that also forwards a non-sender path amount to a shared access setting, which leads to the `observability-config.collateral` gap.
- **It consumes the sender set produced by the kubernetes-gitops leg, as chained.** It does **not** re-derive the set, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
  - **If it arrives EMPTY** (a `kubernetes-gitops.inputs-empty` gap, or no members): make no change to the proxy and report the upstream gap, citing `kubernetes-gitops.inputs-empty` and `observability-config.item-20`. Never apply an empty set, and never write a deny-everything rule.
- **If this leg's own harvest returns no sender endpoints:**
  - No proxy block forwards to the OTLP sender endpoints: apply `observability-config.target-empty` (report a gap, author nothing).
  - The proxy does not exist: apply `observability-config.target-absent` (report a gap, create nothing).

  The 🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- **No further leg consumes from this one.** Its deliverable is the change package that the observability-config change gate approves.
- **Validation (mechanical).** The change package publishes these files:
  - complete before and after copies of every proxy configuration file it read, as `before/` and `after/` trees;
  - for each sender endpoint, the block's after-text as `after-block-<n>.conf`;
  - for each exempt or unchanged block, its before-text and after-text;
  - the chained sender set as `sender-set.txt`.

  The checks below are written for nginx syntax. Apply them to every sender endpoint, gRPC and HTTP alike.
  ```
  acc() { grep -E '^[[:space:]]*(allow|deny)[[:space:]]' "$1" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+/ /g'; }
  diff <(acc after-block-<n>.conf | grep '^allow' | sort) <(sed 's/.*/allow &;/' sender-set.txt | sort) && echo ALLOW-MATCH
  acc after-block-<n>.conf | tail -n1
  acc after-block-<n>.conf | grep -c '^deny'
  ```
  Expected, per sender endpoint: `ALLOW-MATCH`, then `deny all;`, then `1`.
  ```
  diff before-block-<m>.conf after-block-<m>.conf && echo UNCHANGED
  ```
  Expected for every exempt block and every non-sender forwarding block: `UNCHANGED`.
  ```
  grep -qF '<the description line the package quotes for exempt block m>' before/<file of block m> && echo FOUND
  ```
  Expected for every exempt block: `FOUND`.
  ```
  diff -rq before/ after/
  ```
  Expected: one `Files before/<f> and after/<f> differ` line for each file the package lists as containing a sender endpoint, and no other line (no `Only in`).
  ```
  diff -r before/ after/ | grep -E '^[<>]' | grep -vcE '^[<>][[:space:]]*(allow|deny)[[:space:]]'
  ```
  Expected: `0`.

  Run `nginx -t` against the after configuration in the proxy's own runtime, before any reload. Expected: `nginx: the configuration file <path> syntax is ok`, then `nginx: configuration file <path> test is successful`.

  On every gap branch, `diff -rq before/ after/` (or the absence of an `after/` tree) prints nothing, and the deliverable carries the gap report naming its row id.
- **Post-apply behaviour cannot be witnessed before the program runs.** Apply is out-of-band and human-gated after the observability-config change gate. The program never applies, so the restricted proxy does not exist during the run.

  The deterministic path is an **operator-captured pre-change baseline plus a post-change comparison**. The package ships these commands; `<proxy-address>` and `<port>` are values the leg reads from its own harvest:
  ```
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://<proxy-address>:<HTTP sender-endpoint port>/v1/traces -H 'Content-Type: application/json' -d '{}'
  curl -s -o /dev/null -w '%{http_code}\n' --http2-prior-knowledge -X POST http://<proxy-address>:<gRPC sender-endpoint port>/opentelemetry.proto.collector.trace.v1.TraceService/Export -H 'content-type: application/grpc'
  ```
  Expected after apply:
  - From a source not in the sender set: `403` on every sender endpoint.
  - From a member pod: any code other than `403`.
  - For every exempt and non-sender forwarding block, the same request from the same source returns the same code as the operator's pre-change baseline. A diff of the baseline output against the post-change output prints nothing.
- **Rollback.** The package ships a rollback plan that restores the `before/` copies of every changed file and reloads the proxy.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Namespace: `trading` (`kubernetes-gitops.target`)
- Population rule: a pod in the declared namespace whose phase is Running, excluding pods on the host's network and pods whose deletion has been requested (`kubernetes-gitops.population`)
- Representation: a host list, one entry per member pod's address, with no covering prefix (`kubernetes-gitops.representation`)
- Sender-endpoint rule: every proxy block forwarding to one of the collector's OTLP receivers, except a block whose description states it is an operator path and not part of the sender allowlist (`observability-config.receiver`, `observability-config.enforcer-scope`, `observability-config.item-22`)
- Access-directive shape on each sender endpoint: one allow per sender-set entry, followed by a deny for everything else (`observability-config.existing-grant`)
- Gate approvers and gate positions: as in *Approvals* (items 7–11)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The sender set (a host list) is produced by the kubernetes-gitops leg and chained into the observability-config leg's §6. It is approved at the kubernetes-gitops change gate before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the sender set written as allow entries in the observability-config leg's change package exactly equals the sender set produced by the kubernetes-gitops leg, as chained — not a guess, not a recomputation;
2. coverage and containment: every sender endpoint (gRPC and HTTP) carries one allow entry for every address in the sender set produced by the kubernetes-gitops leg, and no allow entry outside it, ending in a single deny for everything else. Every block forwarding to an OTLP receiver is either such a sender endpoint or listed as exempt with its quoted description line;
2b. the tightest-correct property — recompute the sender set from the kubernetes-gitops leg's published input block by applying the population rule (`kubernetes-gitops.population`); it must equal the published set, and every entry must be a single host address with no prefix length. Do not take the stated value on trust: a covering prefix, or any entry not traceable to a member pod in the input block, is a defect;
3. no widening and no collision:
   - no `allow all` remains on any sender endpoint;
   - no allow entry carries a prefix length;
   - no server block, location, port or forwarded path outside the sender endpoints changed (exempt and non-sender forwarding blocks are byte-identical before and after);
   - no deny-everything rule was written from an empty sender set;
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.

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

The observability-config leg consumes the sender set produced by the kubernetes-gitops leg, but it cannot verify that set against its own state: its service reads the proxy and the collector, not the cluster.

The consumed value counts as SATISFIED when all three of these hold:
1. The kubernetes-gitops leg's derivation was machine-checked with no defect. Its *Validation (mechanical)* commands printed exactly their expected outputs.
2. Program-tier checks 1, 2, 2b and 3 above pass on the chained value.
3. Check 4 (chaining coverage) confirms the observability-config leg received the kubernetes-gitops leg's real deliverable.

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
