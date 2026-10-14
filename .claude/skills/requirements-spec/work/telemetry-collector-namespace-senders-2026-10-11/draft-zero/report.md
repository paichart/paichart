> ⚠ **NOT RELEASED — quality gate: needs-revision**
> This document is the composed draft deliverable exactly as produced; the run's release gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline task (quality-gate metadata and final comment).

# Program Requirements — Telemetry collector sender restriction

- Authored in: Telemetry collector access control · Requirements
- Iteration: Run 20261011-0725 · 2026-10-11

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

> **Status: DRAFT for human review.** Not approved and not ready to launch. The objective declares no design decisions and no approvers.

---

## Program scope

**Objective of record (verbatim):** "Produce the requirements document for a program that would restrict which senders the telemetry collector accepts to exactly the running pods of one Kubernetes namespace, and nothing wider. Two systems are involved: the Kubernetes cluster, where those pods run, and the observability stack, where the telemetry collector runs."

- 2 **legs** (pipelines), executed **IN SEQUENCE**. Each leg is a distinct DOMAIN (a different protocol on a different target class), and the downstream leg consumes a value only the upstream leg can produce:
  1. **kubernetes-gitops** (UPSTREAM) on the pods of the namespace answered in `kubernetes-gitops.target`, described in `topology.json`. It reads cluster state, publishes the sender set it derives, and changes nothing in the cluster.
  2. **observability-config** (DOWNSTREAM) on the ingress proxy in front of the telemetry collector's OTLP receiver (`observability-config.target`). It authors the sender-restriction change package.
- Out of scope:
  - any namespace other than the one declared;
  - any change to a cluster resource;
  - any collector pipeline, processor or exporter setting;
  - any ingress server block that does not forward to the collector's receiver;
  - any metrics-scrape or dashboard configuration;
  - applying any change.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on (which namespace holds the sender pods) | — | gap report (OPEN) | OPEN — which single Kubernetes namespace's pods are the permitted senders; options: — |
| observability-config.target | which surface of the leg's service does it act on | — | the ingress proxy in front of the collector's receiver (the collector's only sender-admission point) | (derived — basis: the Phase 0 `get_otel_config` read shows the receiver has no sender-admission setting; the Phase 0 `get_ingress_config` read shows the proxy server blocks that forward to it carry the source-address access directives) |
| kubernetes-gitops.population | which members of the class the derivation reads | — | gap report (OPEN) | OPEN — which pods count as "running": phase Running, or Running and Ready; and are terminating or host-network pods members; options: — |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | gap report (OPEN) | OPEN — how the sender set is expressed (a covering prefix can contain non-member addresses); options: one aligned prefix · a set of prefixes · a host list |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap report (OPEN) | OPEN — the outcome when no pod meets the population rule. No numbered objective item exists to cite, so this row cannot be forced; options: gap |
| kubernetes-gitops.currency | is the sender set point-in-time or maintained after the program | point-in-time · maintained-beyond-program | gap report (OPEN) | OPEN — pod addresses change on reschedule; is a point-in-time set intended; options: point-in-time · maintained-beyond-program |
| approver.program-plan | who approves this gate | — | UNASSIGNED — no approver declared | OPEN — who approves the program plan gate; options: — |
| approver.kubernetes-gitops-change | who approves this gate | — | UNASSIGNED — no approver declared | OPEN — who approves the kubernetes-gitops change gate; options: — |
| approver.observability-config-change | who approves this gate | — | UNASSIGNED — no approver declared | OPEN — who approves the observability-config change gate; options: — |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | gap report (OPEN) | OPEN — when the gate on the sender set produced by the kubernetes-gitops leg sits; options: before-leg · after-leg-before-completion · after-producer-before-consumers |
| gate.observability-config-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | gap report (OPEN) | OPEN — when the observability-config change gate sits (this leg has no consumer leg); options: before-leg · after-leg-before-completion · after-producer-before-consumers |

### A leg that grants or removes access (authorisation)

This block applies to the observability-config leg only. The kubernetes-gitops leg neither grants nor removes access; its rows are listed in the owner block as not-applicable.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| observability-config.receiver | which workload/resource on the target is authorised | — | the collector's OTLP receiver: every protocol endpoint it exposes through the proxy | (derived — basis: the Phase 0 `get_otel_config` read shows this receiver is the collector's telemetry entry point, with gRPC and HTTP endpoints) |
| observability-config.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | gap report (OPEN) | OPEN — by which attribute are the namespace's running pods recognised at the enforcer; options: source-address-range · named-identity · network-path · combination (state each part) |
| observability-config.request-path | the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) | direct · private-endpoint · translated | gap report (OPEN) | OPEN — the pods and the collector run in separate systems; do pod addresses reach the proxy untranslated; options: direct · private-endpoint · translated |
| observability-config.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | gap report (OPEN) | OPEN — the outcome if the leg cannot confirm the proxy sees the admitted attribute; options: gap · act-regardless |
| observability-config.granted-action | what the admitted principal may do (actions, ports) | — | gap report (OPEN) | OPEN — may admitted senders submit over gRPC, HTTP, or both; options: — |
| observability-config.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | gap report (OPEN) | OPEN — the fate of allowances already on any server block forwarding to the receiver; options: replace · preserve · preserve-bounded (state the bound) |
| observability-config.target-empty | the receiver selector/surface matches nothing now | act · gap | gap report (OPEN) | OPEN — the outcome if no server block forwards to the receiver; options: act · gap |
| observability-config.enforcer-absent | no policy object governs the receiver yet | create · gap | gap report (OPEN) | OPEN — the outcome if no access directive governs the receiver's path; options: create · gap |
| observability-config.target-absent | the declared target itself does not exist | gap · create-target | gap report (OPEN) | OPEN — the outcome if the proxy does not exist (no numbered item to cite, so not forced); options: gap · create-target |
| observability-config.collateral | what else on the target changes because enforcement now applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) | gap report (OPEN) | OPEN — the enforcer is the proxy, not Kubernetes, and no behaviour is stated for it; what else may change (e.g. senders admitted today who fall outside the set); options: per enforcer |

### A leg that changes routes (routing)

Neither leg changes routes; the routing rows are listed in the owner block as not-applicable.

## Decisions needed from the owner

kubernetes-gitops.target — which surface of the leg's service does it act on (which namespace holds the sender pods) — options: — — governs: Pipeline 1 work — tier: blocking
observability-config.target — which surface of the leg's service does it act on — options: — — governs: Pipeline 2 work — tier: confirm
kubernetes-gitops.population — which members of the class the derivation reads — options: — — governs: Pipeline 1 derivation — tier: blocking
kubernetes-gitops.representation — how the derived value is expressed — options: one aligned prefix · a set of prefixes · a host list — governs: Pipeline 1 derivation, Pipeline 2 entries — tier: blocking
kubernetes-gitops.inputs-empty — the derivation's inputs are empty — options: gap — governs: Pipeline 1 null outcome — tier: blocking
kubernetes-gitops.currency — is the sender set point-in-time or maintained after the program — options: point-in-time · maintained-beyond-program — governs: Pipeline 1 must-publish — tier: blocking
approver.program-plan — who approves this gate — options: — — governs: Approvals — tier: blocking
approver.kubernetes-gitops-change — who approves this gate — options: — — governs: Approvals — tier: blocking
approver.observability-config-change — who approves this gate — options: — — governs: Approvals — tier: blocking
gate.kubernetes-gitops-change.position — when this gate sits (every gate except the program plan gate) — options: before-leg · after-leg-before-completion · after-producer-before-consumers — governs: Approvals gate edges — tier: blocking
gate.observability-config-change.position — when this gate sits (every gate except the program plan gate) — options: before-leg · after-leg-before-completion · after-producer-before-consumers — governs: Approvals gate edges — tier: blocking
observability-config.receiver — which workload/resource on the target is authorised — options: — — governs: Pipeline 2 work — tier: confirm
observability-config.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: Pipeline 2 work, premise — tier: blocking
observability-config.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) — options: direct · private-endpoint · translated — governs: Pipeline 2 premise — tier: blocking
observability-config.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: Pipeline 2 premise branch — tier: blocking
observability-config.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: Pipeline 2 work — tier: blocking
observability-config.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: Pipeline 2 existence branch, validation — tier: blocking
observability-config.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: Pipeline 2 null outcome — tier: blocking
observability-config.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: Pipeline 2 existence branch — tier: blocking
observability-config.target-absent — the declared target itself does not exist — options: gap · create-target — governs: Pipeline 2 existence branch — tier: blocking
observability-config.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: Pipeline 2 work — tier: blocking
kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: none — tier: not-applicable — the leg only reads and publishes; it neither grants nor removes access (if enforcement moves into the cluster, regenerate)
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) — options: direct · private-endpoint · translated — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.target-absent — the declared target itself does not exist — options: gap · create-target — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: none — tier: not-applicable — the leg neither grants nor removes access
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: none — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: none — tier: not-applicable — not a routing leg
observability-config.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: none — tier: not-applicable — the leg adds no advertised covering route
observability-config.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: none — tier: not-applicable — not a routing leg

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No ⇒ sequenced.** The observability-config leg needs the addresses of the declared namespace's running pods. Those are read from live cluster state:
- addresses are assigned at scheduling and change on every reschedule, rollout, scale event or node replacement;
- membership in "running" changes the same way.

The value therefore cannot be pinned in a contract. The Program Architect has **no live state access** and structurally cannot know it; only the kubernetes-gitops leg can obtain it at run time.

If the set were guessed up front, a stale list would admit reassigned addresses (possibly another namespace's pods, which breaks "nothing wider") and reject current pods. Obtaining the set is a design decision rather than a lookup, because member selection (`kubernetes-gitops.population`) and expression (`kubernetes-gitops.representation`) are owner choices.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- None: no approver is declared, so none can be confirmed.

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 **This is the most expensive thing to get wrong in this section, and stating only one half is how
it goes wrong.** A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | UNASSIGNED — no approver declared |
| kubernetes-gitops change | the sender set produced by the kubernetes-gitops leg (a produced value) | the kubernetes-gitops leg, exact position per `gate.kubernetes-gitops-change.position` (OPEN). `before-leg` contradicts this gate's kind | the observability-config leg (`after-producer-before-consumers`), or kubernetes-gitops completion (`after-leg-before-completion`) | UNASSIGNED — no approver declared |
| observability-config change | the change package produced by the observability-config leg, carrying the sender set produced by the kubernetes-gitops leg. Under `before-leg` it approves the method instead | per `gate.observability-config-change.position` (OPEN): the observability-config leg, or (under `before-leg`) the kubernetes-gitops leg | the observability-config leg's completion, or the leg itself under `before-leg` | UNASSIGNED — no approver declared |

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

**Dependency consequence.** One edge is fixed under every gate answer: the direct data edge `kubernetes-gitops leg → observability-config leg`, on which the sender set travels. The gate edges follow the OPEN position rows:

| row = answer | edges |
|---|---|
| `gate.kubernetes-gitops-change.position` = `after-producer-before-consumers` | `kubernetes-gitops leg → kubernetes-gitops change gate`, `kubernetes-gitops change gate → observability-config leg` |
| `gate.kubernetes-gitops-change.position` = `after-leg-before-completion` | `kubernetes-gitops leg → kubernetes-gitops change gate` |
| `gate.observability-config-change.position` = `before-leg` | `kubernetes-gitops leg → observability-config change gate`, `observability-config change gate → observability-config leg` |
| `gate.observability-config-change.position` = `after-leg-before-completion` | `observability-config leg → observability-config change gate` |
| `gate.observability-config-change.position` = `after-producer-before-consumers` | none; no leg consumes from this one, so the gate blocks nothing |

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

- Harvest the pods of the namespace answered in `kubernetes-gitops.target` **read-only**, including each pod's phase, readiness and address. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — Phase 0 of requirements run 20261011-0725** (task "Harvest cluster namespace pods and observability collector config (read-only)", per-namespace pod list reads). Confirmed:
  - the descriptor answers per-namespace pod reads;
  - its list read returns names and labels only, so phase and address need the per-object read;
  - it offers no namespace enumeration.

  No sender namespace was confirmed. **The premise that the declared namespace holds running pods is UNTESTED.**
- The leg reads every pod in the namespace answered in `kubernetes-gitops.target`, keeps those that `kubernetes-gitops.population` selects, and collects each kept pod's address at harvest time. It changes no cluster resource.
- **Derivation:** express the collected addresses as `kubernetes-gitops.representation` selects, at the tightest-correct width. The leg recomputes from its own harvest and publishes what it recomputed. While any of `kubernetes-gitops.target`, `.population`, `.representation` or `.currency` is OPEN, the outcome is a gap report naming each OPEN row, and no sender set is published.
- **If the harvest returns no pods meeting the population rule**: apply `kubernetes-gitops.inputs-empty`. It is OPEN, so the outcome is a gap report naming that row. The report says what was absent (no pod met the population rule) and what would have to exist (at least one such pod). NEVER a substitute value.
- **The deliverable MUST publish, explicitly and prominently**: the sender set produced by the kubernetes-gitops leg:
  - the namespace selector and the population rule;
  - the input block (each member pod's name and address, as harvested at run time);
  - the result block, in the declared representation;
  - the harvest time.

  The downstream leg depends on what this leg PRODUCES at run time.
- **Validation (mechanical)**:

  ```sh
  kubectl get pods -n "$NS" -o json | jq -r '.items[] | select(<population predicate>) | .status.podIP' | sort -u > recomputed.txt
  ```
  - `$NS` = the `kubernetes-gitops.target` answer.
  - `<population predicate>` = the `kubernetes-gitops.population` answer. A synthetic illustration only: "phase Running" is `.status.phase == "Running"`.
  - Equivalent read through the descriptor: one per-object pod read per pod name.

  ```sh
  python3 - <<'EOF'
  import ipaddress as ip
  i=sorted({ip.ip_address(l.strip()) for l in open('recomputed.txt') if l.strip()})
  n=ip.ip_network(f"{i[0]}/{i[0].max_prefixlen}")
  while i[-1] not in n: n=n.supernet()
  p=[ip.ip_network(l.strip()) for l in open('published.txt') if l.strip()]
  print("UNCOVERED:",[str(a) for a in i if not any(a in q for q in p)])
  print("EXACT_SET:",sorted(str(x) for x in ip.collapse_addresses(ip.ip_network(f"{a}/{a.max_prefixlen}") for a in i)))
  print("MIN_SINGLE_PREFIX:",n)
  EOF
  ```
  `published.txt` holds the published result block, one entry per line.

  Expected:
  - `UNCOVERED: []`
  - for a host list or a set of prefixes, the sorted published entries equal the `EXACT_SET:` line;
  - for one aligned prefix, the published prefix equals the `MIN_SINGLE_PREFIX:` line.

  Never the input literals or their count.

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
- ⚠️ **Verify by arithmetic, never by eyeballing.** Synthetic example, not harvested values: `198.51.100.1` and `198.51.100.2` are adjacent but do NOT summarize to a `/31`. They straddle a boundary, and their minimal single cover is `198.51.100.0/30`, which also swallows `.0` and `.3`; if either of those is a non-member pod, that pod is admitted. A `/31` covers an **aligned** pair only.
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

- Harvest **read-only** the collector's as-deployed receiver configuration, and every proxy server block forwarding to it with that block's access directives. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — Phase 0 of requirements run 20261011-0725** (same task, `get_otel_config` and `get_ingress_config` reads). Confirmed:
  - the receiver has no sender-admission setting;
  - the server blocks forwarding to it carry access directives evaluated on the connection's source address.

  The harvest did not test whether, or with which address, the pods reach the proxy.
- The leg makes the receiver (`observability-config.receiver`) on the target (`observability-config.target`) accept only the principals answered in `observability-config.admitted-principal`, for the actions answered in `observability-config.granted-action`, with the side effects answered in `observability-config.collateral`. While any of these rows is OPEN, the outcome is a gap report naming each OPEN row, and no change is authored.
- **Admitted-principal premise** (`observability-config.admitted-principal`): the proxy must see that attribute on the path answered in `observability-config.request-path`.
  - If the leg's own harvest cannot confirm it, apply `observability-config.principal-unseen` (OPEN, so a gap report naming that row).
  - A harvest of the proxy alone cannot show the address pod requests arrive with, so unless confirmed, the premise is listed under **UNTESTED premises**.
- **Existence assumption** (*Writing rules* #6):
  - no access directive governs the receiver's path → apply `observability-config.enforcer-absent`;
  - allowances already present on any forwarding block → apply `observability-config.existing-grant`;
  - the proxy is absent → apply `observability-config.target-absent`.

  Each is OPEN; until answered, the outcome is a gap report naming the row.
- It consumes the sender set produced by the kubernetes-gitops leg **as chained** — it does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest returns no server block forwarding to the receiver**: apply `observability-config.target-empty`, or `observability-config.target-absent` if the proxy itself does not exist. Both are OPEN, so the outcome is a gap report naming the row. The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- No further leg consumes from this one. **The deliverable MUST publish, explicitly and prominently**:
  - the sender set produced by the kubernetes-gitops leg, restated exactly as chained, beside the access entries authored per forwarding block;
  - its **UNTESTED premises**;
  - a rollback plan.
- **Validation (mechanical)**. These checks apply when `admitted-principal` = `source-address-range`; any other answer requires the package to ship an equivalent command plus expected output.
  - `expected.txt` = the chained set plus exactly the allowances `existing-grant` preserves.
  - `$F` = each packaged forwarding-block file.

  | command | expected output |
  |---|---|
  | `nginx -t -c <packaged top-level config>` | lines ending `syntax is ok` and `test is successful` |
  | `grep -Eo '^\s*allow\s+[^;]+' "$F" \| awk '{print $2}' \| sort -u \| diff - <(sort -u expected.txt); echo "exit=$?"` | `exit=0` and no diff lines |
  | `grep -Ec '^\s*allow\s+all\s*;' "$F"` | `0` |
  | `grep -E '^\s*(allow\|deny)\s' "$F" \| tail -1 \| tr -d ' \t'` | `denyall;` |

  **Post-apply** (by the operator, after the out-of-band apply; this program never applies, so an applied restriction cannot be witnessed before the run). Ports are read from the collector's as-deployed receiver config.

  | from | command | expected output |
  |---|---|---|
  | a host outside the set | `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' "http://$INGRESS:$OTLP_HTTP_PORT/v1/traces"` | `403` |
  | a host outside the set | `curl --http2-prior-knowledge -s -o /dev/null -w '%{http_code}\n' "http://$INGRESS:$OTLP_GRPC_PORT/"` | `403` |
  | a member pod (via `kubectl exec`) | the HTTP command above | any status other than `403` |

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (owner declarations; none declared yet):
- Namespace, population rule, representation and currency: the answers to `kubernetes-gitops.target`, `.population`, `.representation` and `.currency` (OPEN)
- Admission attribute, request path, granted actions and existing-grant treatment: the answers to the matching `observability-config.*` rows (OPEN)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The sender set — produced by the kubernetes-gitops leg, chained into the observability-config leg's §6, settled before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the observability-config leg's access entries exactly equal the sender set produced by the kubernetes-gitops leg, as chained;
2. every address in the kubernetes-gitops leg's input block lies inside its published set, and every pod that the population rule selects is in the input block;
2b. the published set is tightest-correct for the declared representation. Recompute it from the input block with the Pipeline 1 script; do not take the stated value on trust;
3. no entry in any block forwarding to the receiver admits an address outside the chained set, other than allowances `existing-grant` preserves, and no entry is match-all;
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

The observability-config leg cannot verify pod membership against its own state. Its consumption counts as SATISFIED only when all three hold:
1. the kubernetes-gitops derivation was machine-checked with no defect;
2. checks 1, 2, 2b and 3 pass on the chained value;
3. check 4 confirms the real deliverable was received.

This attribution has not been exercised for this program.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

- **Named gap — empty vs absent namespace.** The cluster descriptor has no namespace enumeration, so an empty pod read cannot distinguish an empty namespace from a missing one. A human must confirm the declared namespace exists.
- **Named gap — per-object reads.** The pod list read returns no phase or address; the leg needs one per-object read per pod.
- **Named gap — reachability.** No harvest shows a path from the cluster's pods to the proxy. The program restricts senders and creates no path; whether pods can reach the proxy is a human declaration.
- **Named gap — no bypass path.** That the receiver is reachable only through the proxy is an unprovable absence and must be declared by a human. Until then it is listed under UNTESTED premises.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 70
