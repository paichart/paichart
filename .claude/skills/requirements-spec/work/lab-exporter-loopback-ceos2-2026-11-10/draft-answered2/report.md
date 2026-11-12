> ⚠ **NOT RELEASED — quality gate: needs-revision**
> This document is the composed draft deliverable exactly as produced; the run's release gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline task (quality-gate metadata and final comment).

# Program Requirements — Lab Exporter Loopback (DRAFT for human review)

- Authored in: Lab Exporter Address Expansion · Requirements
- Iteration: Run 20261110-0348 · 2026-11-10

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

This document is a **draft specification for human review**. It is not approved, and it is not ready to launch. A person launches the program it describes separately, after the plan gate.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct
  DOMAIN or a PHASE of one — see the definition above; do not call two phases of one protocol two
  domains:
  1. **network-provisioning — value leg (Pipeline 1)** (UPSTREAM) on lab switches ceos1 and ceos2. These are read-only reads, described in `topology.json`.
  2. **network-provisioning — change leg (Pipeline 2)** (DOWNSTREAM) on lab switch ceos2.

  Both legs use the same protocol (`network-provisioning`) on the same class of target. They are two **phases** of one domain, not two domains. Pipeline 2 consumes a value that only Pipeline 1 can produce, and item 15 puts an approval between the two (see *Why this is sequenced*).
- The following are explicitly **out of scope**:
  - any configuration change on any device other than lab switch ceos2 (item 3)
  - any change on ceos2 other than exactly one new loopback interface and the BGP advertisement of its /32 (item 3)
  - any address outside the exporter pool 10.99.0.0/24 (item 1)
  - any usage source outside the two lab switches (item 4)
  - applying any change (apply is out-of-band and human-gated)

## Design decisions

Row ids are `<leg>.<protocol token>.<question>`. `P1` is Pipeline 1 (the value leg) and `P2` is Pipeline 2 (the change leg). Both legs are on the `network-provisioning` token.

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| P1.network-provisioning.target | which surface of the leg's service does it act on | — | the configurations of lab switches ceos1 and ceos2, read only | (declared — item 1: "it reads lab switches ceos1 and ceos2") |
| P1.network-provisioning.population | which members of the class the derivation reads | — | every IPv4 prefix configured on any interface of ceos1 or ceos2, and every prefix either switch originates in BGP, that overlaps 10.99.0.0/24. Nothing outside the two switches is consulted. | (declared — item 4: "The value leg reads every such prefix of ceos1 and ceos2 that overlaps the pool") |
| P1.network-provisioning.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | one aligned prefix: a single /32 | (declared — item 6: "expressed as one aligned prefix: a single /32") |
| P1.network-provisioning.inputs-empty | the derivation's inputs are empty | gap | gap: no /32 in the pool is free, so the leg reports a gap and publishes nothing | (declared — item 5: "If no /32 in the pool is free, the value leg reports a gap and publishes nothing.") |
| P2.network-provisioning.target | which surface of the leg's service does it act on | — | lab switch ceos2 | (declared — item 2: "on lab switch ceos2 it applies the /32 that Pipeline 1 published") |
| approver.plan | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 14: "The program plan gate is approved by Jacob Wilcox (jacob.wilcox@paichart.com).") |
| approver.value | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 15: "It is approved by Josh Allen (josh.allen@paichart.com)") |
| gate.value.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 15: "its position is after-producer-before-consumers") |
| approver.network-change | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 16: "It is approved by Steve Terry (steve.terry@paichart.com)") |
| gate.network-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion | (declared — item 16: "its position is after-leg-before-completion") |

### Item rows and further decisions

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| P1.network-provisioning.item-7 | which free /32 is selected when several are free | — | the lowest free /32, by numeric address order | (declared — item 7: "the value leg selects the lowest free one") |
| P1.network-provisioning.item-8 | which addresses of the pool are never candidates | — | the pool's first and last addresses are never selected | (declared — item 8: "The pool's first and last addresses are never selected.") |
| P1.network-provisioning.target-absent | the declared target itself does not exist (a switch's declared source returns not-found) | gap · create-target | gap: a report naming the switch and the source that returned not-found | (forced — creating a switch or its configuration is outside item 1, "This leg changes no device configuration.") → gap |
| P1.network-provisioning.source-unreadable | a source that item 12 declares returns an error instead of a configuration or a not-found | gap · proceed-on-readable-sources | OPEN | OPEN — what Pipeline 1 does when a declared source cannot be read; options: gap · proceed-on-readable-sources |
| P2.network-provisioning.item-9 | which loopback number the new loopback takes | — | the next loopback number after the highest-numbered existing telemetry-exporter loopback on ceos2. If that number is already in use, the next unused loopback number above it. | (declared — item 9: "takes the next loopback number after the highest-numbered existing telemetry-exporter loopback on that switch") |
| P2.network-provisioning.item-10 | which description the new loopback carries | — | the same description as the existing telemetry-exporter loopbacks. The leg reports the literal description it applied. | (declared — item 10: "The new loopback carries the same description as the existing telemetry-exporter loopbacks") |
| P2.network-provisioning.item-11 | how the new /32 is advertised in BGP | — | by the same mechanism the existing telemetry-exporter loopbacks use. The leg reports the mechanism it applied. | (declared — item 11: "advertised in BGP by the same mechanism the existing telemetry-exporter loopbacks use") |
| P2.network-provisioning.item-17 | what the leg does if the published /32 is already used | — | if its own harvest finds the /32 that Pipeline 1 published already used (item 4's sense) on ceos1 or ceos2: report a gap and author no change package | (declared — item 17: "If the change leg's own harvest finds the /32 that Pipeline 1 published already used") |
| P2.network-provisioning.item-18 | what the leg does if the existing telemetry-exporter loopbacks disagree | — | if they do not share one description, or do not share one BGP advertisement mechanism: report a gap and author no change package | (declared — item 18: "do not share one description, or do not share one BGP advertisement mechanism") |
| P2.network-provisioning.item-19 | which source governs when ceos2's Git file and its device read differ | — | the Git file governs. It is the base the change package edits, and the device read is evidence. | (declared — item 19: "the Git file governs") |
| P2.network-provisioning.item-20 | which loopbacks are existing telemetry-exporter loopbacks | — | a loopback whose description contains `telemetry-exporter`. The leg reports the literal criterion it applied. | (declared — item 20: "An existing telemetry-exporter loopback is a loopback whose description contains") |
| P2.network-provisioning.target-absent | the declared target itself does not exist (ceos2's declared Git file returns not-found, and the device read lists no ceos2) | gap · create-target | gap: a report naming what is absent; no change package | (forced — creating the switch is outside item 3, "exactly one new loopback interface and the BGP advertisement of its /32") → gap |
| P2.network-provisioning.exemplar-absent | the leg's harvest finds no loopback on ceos2 that meets item 20's criterion, so items 9, 10 and 11 have no existing loopback to follow | gap · owner-declared-values | OPEN | OPEN — what Pipeline 2 does when ceos2 has no existing telemetry-exporter loopback; options: gap · owner-declared-values |
| P2.network-provisioning.source-unreadable | a source that item 13 declares (ceos2 Git file, ceos2 device read, ceos1 live read) returns an error instead of a configuration or a not-found | gap · proceed-on-readable-sources | OPEN | OPEN — what Pipeline 2 does when a declared source cannot be read; options: gap · proceed-on-readable-sources |

### A leg that grants or removes access (authorisation)

Neither leg grants or removes access on its target:
- Pipeline 1 reads two configurations and publishes a value.
- Pipeline 2 adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal.

Every row of this block is therefore deleted on both legs, except `target-absent`, which each leg's null branch needs (see above). Each deleted row is listed `not-applicable` in *Decisions needed from the owner*.

### A leg that changes routes (routing)

Neither leg is a routing leg:
- Pipeline 1 changes nothing.
- Pipeline 2 advertises a single /32 that stands in for no more-specific route.
- Neither leg suppresses, filters, withdraws or replaces any route or advertisement.

Both rows of this block are deleted on both legs, and each is listed `not-applicable` in *Decisions needed from the owner*.

### A network leg (configuration sources)

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| P1.network-provisioning.sources | which devices the leg reads (the ones it changes and the ones it only needs to see), and where each one's configuration is read from | — | the owner's block in item 12, transcribed in Pipeline 1's *Device sources* slot | (declared — item 12: "Device sources for the network value leg (Pipeline 1):") |
| P2.network-provisioning.sources | which devices the leg reads (the ones it changes and the ones it only needs to see), and where each one's configuration is read from | — | the owner's block in item 13, transcribed in Pipeline 2's *Device sources* slot | (declared — item 13: "Device sources for the network change leg (Pipeline 2):") |

## Decisions needed from the owner

<!-- one line per row that is not simply declared:
<row id> — <question> — options: <enum> — governs: <which leg clause> — tier: blocking | confirm | default | not-applicable -->
P1.network-provisioning.source-unreadable — a source that item 12 declares returns an error instead of a configuration or a not-found — options: gap · proceed-on-readable-sources — governs: Pipeline 1, Existence branches (a declared source cannot be read) — tier: blocking

P2.network-provisioning.exemplar-absent — the leg's harvest finds no loopback on ceos2 that meets item 20's criterion, so items 9, 10 and 11 have no existing loopback to follow — options: gap · owner-declared-values — governs: Pipeline 2, Existence assumption (no telemetry-exporter loopback on ceos2) — tier: blocking

P2.network-provisioning.source-unreadable — a source that item 13 declares (ceos2 Git file, ceos2 device read, ceos1 live read) returns an error instead of a configuration or a not-found — options: gap · proceed-on-readable-sources — governs: Pipeline 2, Existence assumption (a declared source cannot be read) — tier: blocking

P1.network-provisioning.target-absent — the declared target itself does not exist — options: gap · create-target — governs: Pipeline 1, Existence branches (a switch's declared source returns not-found) — tier: default

P2.network-provisioning.target-absent — the declared target itself does not exist — options: gap · create-target — governs: Pipeline 2, null outcome (ceos2 absent) — tier: default

P1.network-provisioning.receiver — which workload/resource on the target is authorised — options: — — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in — options: direct · private-endpoint · translated — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.collateral — what else on the target changes because enforcement now applies — options: per enforcer — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.enforcer-scope — which parts of the enforcer the restriction covers — options: all-reaching-the-protected-thing · exemption-by-property · gap — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 neither grants nor removes access on its target: it reads two configurations and changes no device configuration (item 1)

P1.network-provisioning.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no clause (row deleted) — tier: not-applicable — the leg adds no advertised covering route

P1.network-provisioning.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no clause (row deleted) — tier: not-applicable — Pipeline 1 is not a routing leg: it adds, suppresses, filters, withdraws or replaces no route or advertisement

P2.network-provisioning.receiver — which workload/resource on the target is authorised — options: — — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in — options: direct · private-endpoint · translated — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.collateral — what else on the target changes because enforcement now applies — options: per enforcer — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.enforcer-scope — which parts of the enforcer the restriction covers — options: all-reaching-the-protected-thing · exemption-by-property · gap — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 neither grants nor removes access on ceos2: it adds a loopback interface and its BGP advertisement, and admits or denies no sender or principal

P2.network-provisioning.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no clause (row deleted) — tier: not-applicable — the leg adds no advertised covering route: the one route it advertises is a single /32 that stands in for no more-specific route

P2.network-provisioning.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no clause (row deleted) — tier: not-applicable — Pipeline 2 is not a routing leg: it adds no covering route and suppresses, filters, withdraws or replaces no route or advertisement

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No — the program is sequenced.**

Pipeline 2 needs **the /32 produced by Pipeline 1**. That value comes from a rule (items 4, 6, 7, 8): the lowest /32 in the declared pool, other than the pool's first and last addresses, that overlaps no prefix configured on an interface of either lab switch and no prefix either switch originates in BGP.

The rule's inputs are the two switches' configurations, read when Pipeline 1 runs. Those inputs change whenever any address or BGP origination on either switch changes, including after every run of this program, because each run consumes one /32.

So the value cannot be pinned in a static artifact or agreed in a contract. The Program Architect reads only `topology.json` and this file, with **no live state access**, so it structurally cannot know the value.

The value is a **design decision, not a lookup**: the rule chooses one candidate from many. A value guessed up front would do one of two things:
- **collide** with an address a switch already uses (two endpoints answering on one address, with BGP advertising a conflicting /32), or
- **skip the lowest free candidate**, which breaks item 7.

Either way, the value gate (item 15) would be approving the wrong thing.

The two legs are **one domain**: both are authored by the same protocol (`network-provisioning`) against the same class of target, the lab switches. They are split into two legs only because they are **phases**:
- the change leg consumes a value that only the value leg can produce, and
- item 15 places an approval of that value between the producer and its consumer.

The change leg therefore takes the direct edge from Pipeline 1 described under *Approvals*.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- Program plan gate approver is Jacob Wilcox jacob.wilcox@paichart.com (declared, item 14) — member
- Value gate approver is Josh Allen josh.allen@paichart.com (declared, item 15) — member
- Network change gate approver is Steve Terry steve.terry@paichart.com (declared, item 16) — member

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
| value (Pipeline 1 output) | the value produced by Pipeline 1: the /32 it published, with its input block (produced value; producer: Pipeline 1) | Pipeline 1 | Pipeline 2 | Josh Allen (declared) |
| network change (ceos2) | the change package for ceos2 produced by Pipeline 2 (produced value; producer: Pipeline 2) | Pipeline 2 | program completion, and release of the package for out-of-band apply | Steve Terry (declared) |

The network change gate sits after the leg it approves, and that is deliberate (item 16: after-leg-before-completion). It does not govern Pipeline 2's authoring work. It governs whether the change package that Pipeline 2 produced is released: the program cannot complete, and the package cannot go to the out-of-band apply, until this gate is released. That makes it a control on the package, not a record of the leg.

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

**Then state the dependency consequence explicitly** — do not leave a planner to infer the DAG from
the prose above, because two readings of the same sentence produce two different graphs:
- Pipeline 2 depends on **its own gate (the value gate)** AND on **Pipeline 1**, and the value gate also depends on Pipeline 1. The edges are:
  - `Pipeline 1 → value gate`
  - `Pipeline 1 → Pipeline 2`
  - `value gate → Pipeline 2`
  - `Pipeline 2 → network change gate`
  - `network change gate → program completion`

  Every leg also depends on the program plan gate.

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

## Pipeline 1 objective — network-provisioning value leg (UPSTREAM)

- Harvest lab switches ceos1 and ceos2 **read-only**. Service descriptor: `none — item 12 declares Git-file sources only (service github-service); this leg uses no live-device descriptor`
- **Preconditions verified — 2026-11-10, while authoring (run 20261110-0348)**:
  - **Which harvest:** the authoring pipeline's harvest task "Harvest lab switch network state (ceos1, ceos2)". It read the switches' **live** configuration through the read-only device descriptor that item 13 names — **not** the Git files that item 12 declares as this leg's sources.
  - **What it confirmed:** on both switches, at least one IPv4 prefix overlaps the pool, and at least one candidate /32 in the pool overlaps no such prefix on either switch.
  - **Against the Git sources of item 12:** none — first run against these files. The premise is UNTESTED for them.
- **The work:**
  - Read ceos1 and ceos2 only from the sources declared in the *Device sources* block below (row `P1.network-provisioning.sources`), and nothing outside the two switches (row `P1.network-provisioning.population`).
  - From each switch, collect every IPv4 prefix configured on any interface and every prefix the switch originates in BGP, keeping those that overlap 10.99.0.0/24. This is the **input block** (row `P1.network-provisioning.population`).
  - **Candidates** are the /32s of 10.99.0.0/24 excluding the pool's first and last addresses (row `P1.network-provisioning.item-8`).
  - A candidate is **free** when it overlaps no prefix in the input block (row `P1.network-provisioning.population`, item 4).
  - Select the **lowest** free candidate, by numeric address order (row `P1.network-provisioning.item-7`), and express it as a **single /32** (row `P1.network-provisioning.representation`).
  - This leg changes no device configuration (row `P1.network-provisioning.target`).
- **The derivation** is the rule above, applied under the derivation clauses below.
  - An input block with **no** overlapping prefixes is **not** a null case. Every candidate is then free, and the leg selects the lowest one (rows `P1.network-provisioning.population` and `P1.network-provisioning.item-7`).
- **If the harvest leaves no free candidate /32**, apply row `P1.network-provisioning.inputs-empty` (gap):
  - Report that every candidate /32 in the pool overlaps a prefix in the input block, and publish the input block as evidence.
  - Name what would have to exist: a candidate /32 that no prefix on either switch overlaps.
  - Publish no /32. NEVER substitute a value, an address outside the pool, or the pool's first or last address.
- **Existence branches** (each decided by this leg's own harvest):
  - If a switch's declared source returns not-found, apply row `P1.network-provisioning.target-absent` (gap). Report the switch and the source, and publish no /32.
  - If a declared source returns an error instead of a configuration or a not-found, apply row `P1.network-provisioning.source-unreadable`. That row is OPEN, so the leg reports a gap naming row `P1.network-provisioning.source-unreadable` and publishes no /32.
- **The deliverable MUST publish, explicitly and prominently**:
  - **the value produced by Pipeline 1:** the /32 selected by the rule above, or the row `P1.network-provisioning.inputs-empty` gap;
  - **the input block:** every collected prefix, with its switch and the configuration line it came from;
  - **the revision of each Git file it read**, where its source returns one;
  - **both check scripts below, unchanged.**

  Pipeline 2 depends on what this leg PRODUCES at run time, not on what was read while authoring.
- **Validation (mechanical)**: obtain both files from the sources item 12 declares, at the revisions the deliverable records, saved as `ceos1-startup.cfg` and `ceos2-startup.cfg`. Then run:
  1. `python3 p1check.py extract ceos1-startup.cfg ceos2-startup.cfg > used.txt` and then `sort used.txt | diff - <(sort input-block.txt)`, where `input-block.txt` holds the prefix column of the published input block, one prefix per line.
     - **Expected:** no output, exit status 0.
     - If `extract` prints an `UNSUPPORTED` line instead, the leg's input block must list, under that line, every prefix it counted as originated by it. The grader appends those prefixes to `used.txt`, and the expected outputs are unchanged.
  2. `python3 p1check.py select <the /32 Pipeline 1 published, or none if it reported the inputs-empty gap> < used.txt`
     - **Expected:** exactly `MATCH`.

  The check recomputes the published value from re-obtained inputs. It is never compared with today's inputs or their count.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*

  For this leg, the tightest-correct property is a single /32 (item 6) that is the **lowest** free candidate (item 7). A free candidate that is not the lowest is a defect.
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** Two rules decide every case: **overlap, not equality, decides use**, and **"lowest" is numeric**. A *synthetic* example, in a pool that is not this program's (192.0.2.0/24):
  - An interface carrying `192.0.2.17/28` uses every address from 192.0.2.16 to 192.0.2.31, though only `.17` appears literally.
  - A BGP-originated `192.0.2.64/27` uses .64 to .95, although no interface carries any of them.
  - `192.0.2.9` is lower than `192.0.2.10`, even though "10" sorts before "9" as text.
  - The pool's first address (`192.0.2.0`) and last address (`192.0.2.255`) are never candidates, even when free.

  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every input is inside the derived result, and
  nothing foreign is. For this leg's **exclusion** derivation, the member-by-member test is the inverse:
  - the selected /32 overlaps no member of the input block, and
  - every lower candidate overlaps at least one member.
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

### Device sources — a network leg only (delete this sub-section on a leg on any other token)

- **Device sources** (row `P1.network-provisioning.sources`, item 12). This leg changes no device configuration.
  The leg's task description carries this `## Device sources` block exactly:

```
## Device sources
ceos1: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos1-startup.cfg
ceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg
```

## Pipeline 2 objective — network-provisioning change leg (DOWNSTREAM)

- Harvest lab switch ceos2 (its Git file and its device read) and lab switch ceos1 (its live read) **read-only**, per item 13. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified — 2026-11-10, while authoring (run 20261110-0348)**:
  - **Which harvest:** the authoring pipeline's harvest task "Harvest lab switch network state (ceos1, ceos2)". It read ceos1's and ceos2's live configuration through the descriptor above.
  - **What it confirmed:** ceos2 carries at least one loopback whose description contains `telemetry-exporter`, and those loopbacks share one description and one BGP advertisement mechanism.
  - **Against ceos2's Git file:** not read. Item 19 makes that file the base, so the premise is UNTESTED there.
- **The work:**
  - On lab switch ceos2 only (row `P2.network-provisioning.target`), author a change package that edits ceos2's Git file (row `P2.network-provisioning.item-19`) to add **exactly one new loopback interface and the BGP advertisement of its /32**, and nothing else on any device (row `P2.network-provisioning.target-absent`, item 3).
  - The **loopback number** follows row `P2.network-provisioning.item-9`. A synthetic illustration: existing telemetry-exporter loopbacks 5 and 7, with Loopback8 in use for something else, give Loopback9.
  - The new loopback's **address** is the chained /32.
  - Its **description** follows row `P2.network-provisioning.item-10`.
  - Its **advertisement** follows row `P2.network-provisioning.item-11`.
  - **Telemetry-exporter loopbacks** are identified by row `P2.network-provisioning.item-20`.
  - Where ceos2's Git file and its device read differ on a line the leg reads, apply row `P2.network-provisioning.item-19`.
- **Admitted-principal premise:** not applicable. This leg grants or removes no access, and its `admitted-principal` and `principal-unseen` rows are deleted (listed `not-applicable` in *Decisions needed from the owner*).
- **Existence assumption** (*Writing rules* #6) — the branches this leg's own harvest decides:
  - **ceos2 absent:** if ceos2's declared Git file returns not-found and the device read lists no ceos2, apply row `P2.network-provisioning.target-absent` (gap).
  - **Source unreadable:** if a declared source returns an error instead of a configuration or a not-found, apply row `P2.network-provisioning.source-unreadable`. That row is OPEN, so the leg reports a gap naming the row and authors no change package.
  - **No telemetry-exporter loopback:** if no loopback on ceos2 meets item 20's criterion, apply row `P2.network-provisioning.exemplar-absent`. That row is OPEN, so the leg reports a gap naming the row and authors no change package.
  - **Loopbacks present:** if such loopbacks exist but do not share one description, or one BGP advertisement mechanism, apply row `P2.network-provisioning.item-18`.
  - **Next number in use:** if the loopback number after the highest existing telemetry-exporter loopback is already in use, apply row `P2.network-provisioning.item-9`.
  - **/32 already used:** if the chained /32 is already used, in item 4's sense, on ceos1 or ceos2, apply row `P2.network-provisioning.item-17`.
- It consumes **the /32 produced by Pipeline 1** **as chained**, released by the value gate. It does **not** re-derive it, and is forbidden from recomputing it. Its own usage check under row `P2.network-provisioning.item-17` tests that the chained /32 is free; it never selects another one. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
  - **If it arrives EMPTY** (a `P1.network-provisioning.inputs-empty` gap, or no members): make no change to the target and report the upstream gap, citing `P1.network-provisioning.inputs-empty`. Never apply an empty set.
- **If this leg's own harvest returns no ceos2**: apply row `P2.network-provisioning.target-absent` (gap). Report what is absent, and author no change package. The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- No further leg consumes from this one. For the network change gate (item 16) and the program reviewer, **the deliverable MUST publish, explicitly and prominently**:
  - **the change package for ceos2 produced by Pipeline 2**, carrying exactly one proposed file: the edited copy of ceos2's Git file, named `ceos2-startup.cfg`;
  - the Git revision it edited;
  - the /32 it applied, as chained;
  - the loopback number it applied;
  - the literal description it applied (item 10);
  - the advertisement mechanism it applied, and the lines it added for it (item 11);
  - the literal membership criterion it applied (item 20);
  - the prefix block its own harvest produced, on which item 17 was decided;
  - both check scripts below, unchanged.

  Where it reports a gap instead, it publishes the gap and the row that governs it.
- **Validation (mechanical)**: save ceos1's live read as `ceos1-running.cfg` and ceos2's Git file at the edited revision as `ceos2-startup.cfg`. Then run:
  1. `python3 p1check.py extract ceos1-running.cfg ceos2-startup.cfg | python3 p1check.py free <the /32 Pipeline 1 published>` (item 17; ceos2 is read from its Git file per item 19).
     - **Expected:** exactly `FREE`.
     - When the leg reported the item-17 gap, the expected output is instead the `USED <prefix>` lines the leg reported.
  2. `python3 p2check.py ceos2-startup.cfg <package>/proposed/ceos2-startup.cfg <the /32 Pipeline 1 published>`
     - **Expected:** exactly one line, `PASS interface Loopback<N>`, where `<N>` is the loopback number the leg reports.
     - When the leg reported an item-18 gap, run `python3 p2check.py ceos2-startup.cfg ceos2-startup.cfg <the /32 Pipeline 1 published>` instead. The expected output is the `GAP` line naming the condition the leg reported.
  3. `ls <package>/proposed`
     - **Expected:** exactly `ceos2-startup.cfg` (item 3: no other device's configuration changes).

### Device sources — a network leg only (delete this sub-section on a leg on any other token)

- **Device sources** (row `P2.network-provisioning.sources`, item 13). This leg changes device configuration.
  The leg's task description carries this `## Device sources` block exactly:

```
## Device sources
ceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg
ceos2: device-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
ceos1: live-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
```

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Exporter pool: 10.99.0.0/24 (declared — item 1).
- Usage rule: a /32 is used when it lies inside any IPv4 prefix configured on any interface of, or originated in BGP by, ceos1 or ceos2. Nothing outside the two switches is consulted (declared — item 4).
- Representation: a single /32 (declared — item 6).
- Selection order: the lowest free /32 (declared — item 7).
- Excluded candidates: the pool's first and last addresses (declared — item 8).
- Changed device and scope: ceos2 only; exactly one new loopback interface and the BGP advertisement of its /32 (declared — item 3).
- Membership criterion for existing telemetry-exporter loopbacks: description contains `telemetry-exporter` (declared — item 20).
- Rules for the new loopback's number, description and advertisement mechanism (declared — items 9, 10, 11). These are rules: the values are read by Pipeline 2 from its own harvest at run time.
- Precedence: ceos2's Git file governs over its device read (declared — item 19).
- Device sources per leg (declared — items 12 and 13).

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The /32 produced by Pipeline 1 — chained into Pipeline 2's §6, settled before that leg starts, and released by the value gate (item 15).

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Check scripts — shipped complete and unchanged with every deliverable that cites them

`p1check.py`:

```python
#!/usr/bin/env python3
# p1check.py extract FILE...   -> every interface or BGP-originated IPv4 prefix in FILE... that overlaps the pool, one per line
# p1check.py select PUBLISHED  -> stdin: prefixes; prints MATCH when PUBLISHED is the items 4/7/8 selection ("none" when no /32 is free)
# p1check.py free PUBLISHED    -> stdin: prefixes; prints FREE, or one "USED <prefix>" line per prefix PUBLISHED overlaps
import ipaddress, re, sys
POOL = ipaddress.ip_network("10.99.0.0/24")
PFX = r"(\d+\.\d+\.\d+\.\d+/\d+)"

def extract(paths):
    used = set()
    for path in paths:
        section, statics, redist_static = "", set(), False
        for raw in open(path):
            line = raw.rstrip("\n")
            if line.strip() and not line[0].isspace():
                section = line.strip()
            s = line.strip()
            m = re.match(r"ip route (?:vrf \S+ )?" + PFX, s)
            if m and s == section:
                statics.add(ipaddress.ip_network(m.group(1), strict=False))
            if section.startswith("interface "):
                m = re.match(r"ip address " + PFX, s)
                if m:
                    used.add(ipaddress.ip_network(m.group(1), strict=False))
            elif section.startswith("router bgp "):
                r = re.match(r"redistribute (\S+)(.*)", s)
                if r and (r.group(1) not in ("connected", "static") or "route-map" in r.group(2)):
                    sys.exit("UNSUPPORTED " + s + " in " + path)
                redist_static = redist_static or bool(r and r.group(1) == "static")
                m = re.match(r"(?:network|aggregate-address) " + PFX, s)
                if m:
                    used.add(ipaddress.ip_network(m.group(1), strict=False))
        if redist_static:
            used |= statics
    for p in sorted(u for u in used if u.overlaps(POOL)):
        print(p)

def read_used():
    return [ipaddress.ip_network(l.strip()) for l in sys.stdin if l.strip()]

def select(published):
    used = read_used()
    free = [a for a in list(POOL)[1:-1]
            if not any(ipaddress.ip_network(f"{a}/32").overlaps(u) for u in used)]
    want = f"{free[0]}/32" if free else "none"
    print("MATCH" if want == published else f"MISMATCH recomputed={want} published={published}")

def free(published):
    pub = ipaddress.ip_network(published)
    hits = [u for u in read_used() if pub.overlaps(u)]
    print("\n".join(f"USED {u}" for u in hits) if hits else "FREE")

mode, args = sys.argv[1], sys.argv[2:]
{"extract": lambda: extract(args), "select": lambda: select(args[0]), "free": lambda: free(args[0])}[mode]()
```

`p2check.py`:

```python
#!/usr/bin/env python3
# p2check.py BASE PROPOSED PUBLISHED
#   BASE      ceos2's Git file (item 13, first line) at the revision the leg read
#   PROPOSED  the edited copy of that file the change package carries
#   PUBLISHED the /32 Pipeline 1 published, as chained
import re, sys
from collections import Counter
ADV = ("router bgp", "ip prefix-list", "route-map")

def parse(path):
    out, sec = [], ""
    for raw in open(path):
        l = raw.rstrip("\n")
        if not l.strip() or l.strip() == "!":
            continue
        if not l[0].isspace():
            sec = l.strip()
        out.append((sec, l.strip()))
    return out

def has(t, a):
    return re.search(r"(?<![\d.])" + re.escape(a) + r"(?!\d)", t)

def norm(t):
    return re.sub(r"\bseq \d+", "seq N", t)

def swap(t, old, new):
    return norm(re.sub(r"(?<![\d.])" + re.escape(old) + r"(?!\d)", new, t))

base, prop, pub = parse(sys.argv[1]), parse(sys.argv[2]), sys.argv[3]
addr = pub.split("/")[0]
basenorm = {(norm(s), norm(l)) for s, l in base}
propnorm = {(norm(s), norm(l)) for s, l in prop}
loops = {}
for s, l in base:
    m = re.fullmatch(r"interface Loopback(\d+)", s)
    if m:
        loops.setdefault(int(m.group(1)), []).append(l)
exp = {k: v for k, v in loops.items()
       if any(l.startswith("description ") and "telemetry-exporter" in l for l in v)}
if not exp:
    sys.exit("NO-EXEMPLAR no loopback whose description contains telemetry-exporter")
descs = {l for v in exp.values() for l in v if l.startswith("description ")}
if len(descs) != 1:
    sys.exit("GAP telemetry-exporter loopbacks do not share one description")
addrs = {}
for k, v in exp.items():
    for l in v:
        m = re.fullmatch(r"ip address (\d+\.\d+\.\d+\.\d+)/32", l)
        if m:
            addrs[k] = m.group(1)
for a in addrs.values():
    for b in addrs.values():
        for s, l in base:
            if s.startswith(ADV) and has(l, a) and (swap(s, a, b), swap(l, a, b)) not in basenorm:
                sys.exit("GAP telemetry-exporter loopbacks do not share one BGP advertisement mechanism")
n = max(exp) + 1
while n in loops:
    n += 1
newsec = f"interface Loopback{n}"
errs = []
removed = Counter(base) - Counter(prop)
added = Counter(prop) - Counter(base)
if removed:
    errs.append("REMOVED " + repr(sorted(removed)))
stanza = {l for s, l in added if s == newsec}
for need in (newsec, next(iter(descs)), f"ip address {pub}"):
    if need not in stanza:
        errs.append("STANZA missing " + need)
for s, l in added:
    if s == newsec:
        continue
    if not any((swap(s, addr, a), swap(l, addr, a)) in basenorm for a in addrs.values()):
        errs.append("FOREIGN " + s + " | " + l)
for a in addrs.values():
    for s, l in base:
        if s.startswith(ADV) and has(l, a) and (swap(s, a, addr), swap(l, a, addr)) not in propnorm:
            errs.append("MISSING " + swap(l, a, addr))
print("\n".join(errs) if errs else "PASS " + newsec)
```

### Program integration reviewer (Node C) verifies, from structured facts:

1. The /32 on the new loopback in Pipeline 2's change package equals, character for character, the /32 produced by Pipeline 1, as chained — not a guess and not a recomputation.
   - **Check:** `python3 p2check.py <ceos2 base> <ceos2 proposed> <the /32 Pipeline 1 published>` prints exactly `PASS interface Loopback<N>`, with `<N>` equal to the number Pipeline 2 reports. Its stanza test passes only when the new loopback's `ip address` line carries that /32.
2. The /32 produced by Pipeline 1 lies inside 10.99.0.0/24 and is neither the pool's first nor its last address.
   - **Check:** `python3 -c 'import ipaddress,sys; p=ipaddress.ip_network(sys.argv[1]); P=ipaddress.ip_network("10.99.0.0/24"); print(p.prefixlen==32 and p.subnet_of(P) and p.network_address not in (P.network_address, P.broadcast_address))' <the /32 Pipeline 1 published>` prints exactly `True`.
2b. The tightest-correct property — recompute it; do not take the stated value on trust. Feed the prefix column of Pipeline 1's published input block to `python3 p1check.py select <the /32 Pipeline 1 published>`.
   - **Expected:** exactly `MATCH`.
   - When Pipeline 1 reported the `P1.network-provisioning.inputs-empty` gap, the same command with `none` prints `MATCH`, and Pipeline 2's deliverable reports no change, citing that row.
3. No collision and no widening:
   - Feed Pipeline 1's input block to `python3 p1check.py free <the /32 Pipeline 1 published>`, and separately feed Pipeline 2's published own-harvest prefix block to the same command. Each prints exactly `FREE`.
   - The check-1 command prints no `REMOVED`, `FOREIGN` or `MISSING` line: nothing is changed except the new loopback and its advertisement.
   - Pipeline 2's package carries exactly one proposed file, `ceos2-startup.cfg`.
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

### Consuming-leg attribution — not used in this program

This program does not use consuming-leg attribution. Pipeline 2 can check the property it depends on against its own state: under row `P2.network-provisioning.item-17`, it tests from its own harvest that the chained /32 is free. Minimality is re-verified at the program tier (check 2b).

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

- **Gap — the authoring harvest read the switches' live configuration, not the Git files that items 12 and 13 declare as the base.** Whether those Git files hold the same interface prefixes, BGP originations and telemetry-exporter loopbacks is UNTESTED until Pipeline 1 and Pipeline 2 run.
  - Pipeline 1 reads only the Git files (item 12). A difference between file and device is outside its view by declaration.
  - Pipeline 2 reads both for ceos2, and the file governs (item 19).

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 82
