# Program Requirements — DRAFT for human review

- Authored in: Lab Exporter Address Expansion · Requirements
- Iteration: Run 20261110-0232 · 2026-11-10

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct DOMAIN or a PHASE of one. These two legs are two PHASES of one domain (`network-provisioning`), not two domains. Pipeline 2 needs a value that only Pipeline 1 can produce (see *Why this is sequenced*):
  1. **network-provisioning — value leg** (UPSTREAM) on lab switches ceos1 and ceos2, described in `topology.json`.
  2. **network-provisioning — change leg** (DOWNSTREAM) on lab switch ceos2.
- The following are explicitly **out of scope**:
  - a configuration change on any device other than ceos2
  - any configuration change on ceos2 other than exactly one new loopback interface and the BGP advertisement of its /32
  - any address outside the exporter pool 10.99.0.0/24
  - any source of address usage other than the two lab switches (item 4)
  - applying any change

## Design decisions

Both legs carry the protocol token `network-provisioning`. Each row id puts the leg after the token so that the two legs' rows stay distinct: `p1` is Pipeline 1 (the value leg) and `p2` is Pipeline 2 (the change leg). Gates are keyed `plan` (program plan gate), `value` (network value gate) and `change` (network change gate).

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| network-provisioning.p1.target | which surface of the leg's service does it act on | — | lab switches ceos1 and ceos2 (read only), and the exporter pool 10.99.0.0/24 | (declared — item 1: "it reads lab switches ceos1 and ceos2, selects the free /32 in the exporter pool 10.99.0.0/24") |
| network-provisioning.p1.population | which members of the class the derivation reads | — | every IPv4 prefix configured on any interface of ceos1 or ceos2, and every prefix either switch originates in BGP, that overlaps the pool. Nothing outside the two switches is read. | (declared — item 4: "The value leg reads every such prefix of ceos1 and ceos2 that overlaps the pool") |
| network-provisioning.p1.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | one aligned prefix: a single /32 | (declared — item 6: "expressed as one aligned prefix: a single /32") |
| network-provisioning.p1.inputs-empty | the derivation's inputs are empty | gap | gap: when no candidate /32 in the pool is free, the leg reports a gap and publishes nothing | (declared — item 5: "If no /32 in the pool is free, the value leg reports a gap and publishes nothing") |
| network-provisioning.p1.item-7 | the choice item 7 states for this leg | — | when more than one /32 in the pool is free, the lowest free one is selected | (declared — item 7: "When more than one /32 in the pool is free, the value leg selects the lowest free one") |
| network-provisioning.p1.item-8 | the choice item 8 states for this leg | — | the pool's first and last addresses are never selected | (declared — item 8: "The pool's first and last addresses are never selected") |
| network-provisioning.p1.sources | which devices the leg reads (the ones it changes and the ones it only needs to see), and where each one's configuration is read from | — | the item 12 block (Pipeline 1 *Device sources*) | (declared — item 12: "Device sources for the network value leg (Pipeline 1)") |
| network-provisioning.p2.target | which surface of the leg's service does it act on | — | lab switch ceos2: one new loopback interface, its description and the BGP advertisement of its /32 | (declared — item 2: "on lab switch ceos2 it applies the /32 that Pipeline 1 published") |
| network-provisioning.p2.population | which members of the class the leg's item 9–11 derivations read (the existing telemetry-exporter loopbacks) | — | every loopback interface on ceos2 whose description contains the term `telemetry-exporter` | (derived — basis: the Phase 0 interface read of ceos2 shows a per-interface description attribute, and the loopbacks carrying pool addresses are the ones whose description names them telemetry-exporter) |
| network-provisioning.p2.inputs-empty | the derivation's inputs are empty (no existing telemetry-exporter loopback is read on ceos2) | gap | gap | (forced — item 9: "takes the next loopback number after the highest-numbered existing telemetry-exporter loopback on that switch" — a number chosen when no such loopback exists falls outside item 9) → gap |
| network-provisioning.p2.item-3 | the choice item 3 states for this leg | — | exactly one new loopback interface and the BGP advertisement of its /32 on ceos2. No configuration change on any other device. | (declared — item 3: "The program changes lab switch ceos2 only: exactly one new loopback interface and the BGP advertisement of its /32") |
| network-provisioning.p2.item-9 | the choice item 9 states for this leg | — | the next loopback number after the highest-numbered existing telemetry-exporter loopback on ceos2. If that number is in use, the next unused loopback number above it. | (declared — item 9: "takes the next loopback number after the highest-numbered existing telemetry-exporter loopback on that switch") |
| network-provisioning.p2.item-10 | the choice item 10 states for this leg | — | the same description as the existing telemetry-exporter loopbacks. The literal description applied is reported in the leg's deliverable. | (declared — item 10: "carries the same description as the existing telemetry-exporter loopbacks") |
| network-provisioning.p2.item-11 | the choice item 11 states for this leg | — | the same BGP advertisement mechanism the existing telemetry-exporter loopbacks use. The mechanism applied is reported. | (declared — item 11: "advertised in BGP by the same mechanism the existing telemetry-exporter loopbacks use") |
| network-provisioning.p2.value-in-use | the leg's own harvest finds that the /32 produced by Pipeline 1 is already used (in item 4's sense) on ceos1 or ceos2 | gap · apply-regardless | OPEN — no rule until the owner declares one | OPEN — what does the change leg do when its own harvest finds the chained /32 already used on either lab switch?; options: gap · apply-regardless |
| network-provisioning.p2.exemplar-disagree | the existing telemetry-exporter loopbacks on ceos2 do not share one description, or do not share one BGP advertisement mechanism | gap · follow-highest-numbered | OPEN — no rule until the owner declares one | OPEN — which description and mechanism does "the same as the existing telemetry-exporter loopbacks" mean when those loopbacks differ?; options: gap · follow-highest-numbered |
| network-provisioning.p2.sources-disagree | ceos2's two declared sources (git-file and device-read, item 13) disagree on a line this leg reads | gap · git-file-governs · device-read-governs | OPEN — no rule until the owner declares one | OPEN — which ceos2 source governs when the git-file and the device-read disagree?; options: gap · git-file-governs · device-read-governs |
| network-provisioning.p2.sources | which devices the leg reads (the ones it changes and the ones it only needs to see), and where each one's configuration is read from | — | the item 13 block (Pipeline 2 *Device sources*) | (declared — item 13: "Device sources for every network change leg (Pipeline 2)") |
| approver.plan | who approves this gate | — | Jacob Wilcox, approver-0003@example.com | (declared — item 14: "The program plan gate is approved by Jacob Wilcox (approver-0003@example.com)") |
| approver.value | who approves this gate | — | Josh Allen, approver-02@example.com | (declared — item 15: "It is approved by Josh Allen (approver-02@example.com)") |
| gate.value.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 15: "its position is after-producer-before-consumers") |
| approver.change | who approves this gate | — | Steve Terry, approver-001@example.com | (declared — item 16: "It is approved by Steve Terry (approver-001@example.com)") |
| gate.change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion | (declared — item 16: "its position is after-leg-before-completion") |

### A leg that grants or removes access (authorisation)

No row in this block applies, because neither leg grants or removes access on its target. Pipeline 1 changes no device configuration (item 1). Pipeline 2 adds a loopback interface and the BGP advertisement of its /32, and admits, allows, denies or restricts no sender or principal. Every row in this block is listed for each leg under *Decisions needed from the owner* with tier `not-applicable`.

### A leg that changes routes (routing)

No row in this block applies, because neither leg adds an advertised covering route or suppresses, filters, withdraws or replaces any route or advertisement. Pipeline 2 adds the advertisement of one /32, and that /32 stands in for no more-specific route. Every row in this block is listed for each leg under *Decisions needed from the owner* with tier `not-applicable`.

### A network leg (configuration sources)

`network-provisioning.p1.sources` and `network-provisioning.p2.sources` are in the *Every leg* table above. Each leg's block is reproduced in that leg's *Device sources* slot.

## Decisions needed from the owner

network-provisioning.p2.population — which members of the class the leg's item 9–11 derivations read (the existing telemetry-exporter loopbacks) — options: — — governs: Pipeline 2 loopback-number, description and advertisement-mechanism clauses — tier: confirm
network-provisioning.p2.inputs-empty — the derivation's inputs are empty (no existing telemetry-exporter loopback is read on ceos2) — options: gap — governs: Pipeline 2 null outcome — tier: default
network-provisioning.p2.value-in-use — the leg's own harvest finds that the /32 produced by Pipeline 1 is already used (in item 4's sense) on ceos1 or ceos2 — options: gap · apply-regardless — governs: Pipeline 2 existence assumption (consumed-value branch) — tier: blocking
network-provisioning.p2.exemplar-disagree — the existing telemetry-exporter loopbacks on ceos2 do not share one description, or do not share one BGP advertisement mechanism — options: gap · follow-highest-numbered — governs: Pipeline 2 description and advertisement-mechanism clauses — tier: blocking
network-provisioning.p2.sources-disagree — ceos2's two declared sources (git-file and device-read, item 13) disagree on a line this leg reads — options: gap · git-file-governs · device-read-governs — governs: Pipeline 2 harvest and pre-apply validation — tier: blocking
network-provisioning.p1.receiver — which workload/resource on the target is authorised — options: — — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in — options: direct · private-endpoint · translated — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.target-absent — the declared target itself does not exist — options: gap · create-target — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.collateral — what else on the target changes because enforcement now applies — options: per enforcer — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.enforcer-scope — which parts of the enforcer the restriction covers — options: all-reaching-the-protected-thing · exemption-by-property · gap — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 changes no device configuration (item 1) and grants or removes access for no sender or principal
network-provisioning.p1.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 adds no advertised covering route; it changes no device configuration (item 1)
network-provisioning.p1.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: none, row deleted from Pipeline 1 — tier: not-applicable — Pipeline 1 is not a routing leg; it changes no device configuration (item 1)
network-provisioning.p2.receiver — which workload/resource on the target is authorised — options: — — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in — options: direct · private-endpoint · translated — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.target-absent — the declared target itself does not exist — options: gap · create-target — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.collateral — what else on the target changes because enforcement now applies — options: per enforcer — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.enforcer-scope — which parts of the enforcer the restriction covers — options: all-reaching-the-protected-thing · exemption-by-property · gap — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds one loopback interface and the BGP advertisement of its /32 (item 3); it admits, allows, denies or restricts no sender or principal
network-provisioning.p2.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 adds no advertised covering route; the one /32 it advertises stands in for no more-specific route
network-provisioning.p2.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: none, row deleted from Pipeline 2 — tier: not-applicable — Pipeline 2 is not a routing leg; it adds the advertisement of one /32 and suppresses, filters, withdraws or replaces no route or advertisement

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No.** Pipeline 2 applies the specific /32 that Pipeline 1 selects. That /32 cannot be known up front for three reasons:

- **It depends on live state.** The /32 is the lowest address in the pool that is neither the pool's first nor last address and that lies inside no prefix configured on, or originated in BGP by, either lab switch (items 4, 7, 8). Which addresses are used is read from the switches' configuration at the moment Pipeline 1 runs. It changes whenever any address in the pool is configured or released on either switch, so it cannot be pinned in a static artifact or agreed in a contract.
- **The Program Architect cannot compute it.** The Architect reads only `topology.json` and this file and has no live state access.
- **The only valid value is the lowest free one.** A value guessed up front could already be used on one of the switches. Applying it would create a duplicate address. It could also skip a lower free address, which item 7 rules out. Item 6 additionally requires a single /32, so the only correct value is the one recomputed from the harvest at run time.

**Why two legs on one protocol is correct here.** Both legs resolve to the `network-provisioning` protocol. Splitting them is not a device split or a tidiness split. It is a **phase** split: Pipeline 2 consumes a value that only Pipeline 1 can produce. Items 1 and 2 also declare the split ("Pipeline 1 is a value leg", "Pipeline 2 is a change leg"). Because Pipeline 2 consumes Pipeline 1's value, it takes the direct DAG edge described under *Approvals*.

**What would go wrong if it were parallel.** Pipeline 2 would have to receive the /32 through the interface contract, frozen at plan time. Any address configured on either switch between plan approval and Pipeline 2's run would then be invisible to it. Item 2 forbids Pipeline 2 from re-selecting, so it could not correct the value either.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- Program plan approver is Jacob Wilcox approver-0003@example.com (declared) — member
- Network value gate approver is Josh Allen approver-02@example.com (declared) — member
- Network change gate approver is Steve Terry approver-001@example.com (declared) — member

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
| network value | the /32 produced by Pipeline 1 (the value leg). This is a produced-value gate whose producer is Pipeline 1. | Pipeline 1 | Pipeline 2 | Josh Allen (declared) |
| network change | the ceos2 change package produced by Pipeline 2 (the change leg). This is a produced-value gate whose producer is Pipeline 2. | Pipeline 2 | program completion (and so the release of the package for out-of-band apply) | Steve Terry (declared) |

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

The network change gate sits after Pipeline 2 on purpose (item 16). It approves a produced value, the change package, rather than a method. Applying the package is out-of-band and human-gated, so this gate still controls something real: no package reaches program completion, or the out-of-band apply, as approved until it is released.

⚠️ **A gate the producing team can release for itself is not a gate.** Distinct owners are the point:
a program exists precisely because the halves are approved by different people. That is a check on the
DECLARED mapping, never a licence to reassign: if the declaration puts one person on both halves, keep it as
declared and raise it as an open question.

The declared mapping puts different people on the value gate (Josh Allen) and the change gate (Steve Terry).

**The dependency consequence (this program is sequenced):**
- `program plan gate → Pipeline 1` (and every other leg).
- `Pipeline 1 → network value gate` AND `Pipeline 1 → Pipeline 2` AND `network value gate → Pipeline 2`. Pipeline 2 depends on **the network value gate** AND on **Pipeline 1**, and the gate also depends on Pipeline 1. Item 15 states that the value reaches Pipeline 2 only after this gate is released.
- `Pipeline 2 → network change gate`. The network change gate blocks program completion.

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

- **Read-only harvest.** The leg harvests lab switches ceos1 and ceos2 **read-only**, from the sources its *Device sources* block declares (row `network-provisioning.p1.sources`). Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified — 2026-11-10, at authoring (Run 20261110-0232):**
  - **Harvest read.** The Phase 0 harvest of this authoring run read the interfaces and the BGP configuration and state of both switches through the ceos-lab-readonly service.
  - **What it confirmed.** Both switches return their interface IPv4 prefixes and their BGP-originated prefixes. At least one /32 in the pool, other than its first and last addresses, is free under item 4's rule.
  - **What it did not confirm.** The harvest read the switches live, not the git-file sources item 12 declares for this leg. Whether those files agree with the switches' running state is **UNTESTED**.
- **The work.** The leg changes no device configuration (item 1).
  - **Read.** The leg reads the `network-provisioning.p1.population` set from both switches: every IPv4 prefix configured on any interface, and every prefix originated in BGP, that overlaps 10.99.0.0/24. "Overlaps" means the prefix shares at least one address with the pool.
  - **Candidates.** The candidates are every /32 inside 10.99.0.0/24 except the pool's first and last addresses (`network-provisioning.p1.item-8`).
  - **Used candidates.** A candidate is used, and is never selected, when it lies inside any prefix of that set (item 4).
  - **Selection.** Of the candidates that remain free, the leg selects the lowest: the smallest IPv4 address read as an unsigned 32-bit integer (`network-provisioning.p1.item-7`). It expresses that address as a single /32 (`network-provisioning.p1.representation`).
- **Unreadable source.** If either switch's declared source cannot be read, item 4's "free when neither lab switch uses it" is not established for any candidate. The leg then applies `network-provisioning.p1.inputs-empty`: it names the unreadable source and publishes nothing.
- **If the harvest leaves no free /32 in the pool** (no candidate survives items 4 and 8), the leg applies `network-provisioning.p1.inputs-empty`. It reports a gap naming that no /32 in 10.99.0.0/24 is free, and lists the pool-overlapping prefixes it read on each switch. It publishes no value and never a substitute.
- **The deliverable MUST publish, explicitly and prominently:**
  - **Result block.** The /32 produced by Pipeline 1, labelled as Pipeline 1's published value, on one line in CIDR form. It is defined by its rule: the lowest candidate under items 4, 7 and 8, expressed as item 6 requires.
  - **Input block.** Every pool-overlapping prefix the leg read, per switch, naming the source from its *Device sources* block that each one came from.
  - Pipeline 2 depends on what this leg PRODUCES at run time, not on what was read while authoring.
- **Validation (mechanical).**
  - **Inputs.** Fetch each file item 12 declares through github-service and save them as `ceos1-startup.cfg` and `ceos2-startup.cfg`. Save the published /32 as `p1-value.txt`; on the gap branch, save it as an empty file.
  - **Command.** Run the following, which re-obtains the inputs and re-applies the rule:

```
python3 - ceos1-startup.cfg ceos2-startup.cfg p1-value.txt <<'EOF'
import ipaddress, re, sys
pool = ipaddress.ip_network("10.99.0.0/24")
used, unresolved = set(), 0
for path in sys.argv[1:3]:
    section = []
    for line in open(path):
        if line.strip() and not line[0].isspace():
            section = line.split()[:2]
        m = re.match(r"\s+ip address (\d+\.\d+\.\d+\.\d+/\d+)", line)
        if m and section[:1] == ["interface"]:
            used.add(ipaddress.ip_network(m.group(1), strict=False))
        m = re.match(r"\s+(?:network|aggregate-address) (\d+\.\d+\.\d+\.\d+/\d+)", line)
        if m and section == ["router", "bgp"]:
            used.add(ipaddress.ip_network(m.group(1), strict=False))
        if re.match(r"\s+redistribute (?!connected)", line) and section == ["router", "bgp"]:
            unresolved += 1
used = [u for u in used if u.overlaps(pool)]
cands = [ipaddress.ip_network(f"{a}/32") for a in pool if a not in (pool[0], pool[-1])]
free = [c for c in cands if not any(c.overlaps(u) for u in used)]
text = open(sys.argv[3]).read().strip()
pub = ipaddress.ip_network(text) if text else None
print("UNRESOLVED", unresolved)
print("RECOMPUTED", free[0] if free else "GAP")
print("MATCH", pub == (free[0] if free else None))
if pub:
    print("PREFIXLEN", pub.prefixlen)
    print("IN_POOL", pub.subnet_of(pool))
    print("COLLISIONS", sum(pub.overlaps(u) for u in used))
EOF
```

  - **Expected output on the value branch:**

```
UNRESOLVED 0
RECOMPUTED <the /32 in p1-value.txt>
MATCH True
PREFIXLEN 32
IN_POOL True
COLLISIONS 0
```

  - **Expected output on the gap branch:**

```
UNRESOLVED 0
RECOMPUTED GAP
MATCH True
```

  - **Incomplete check.** `UNRESOLVED` other than `0` means a switch originates prefixes by redistributing a source that is not an interface, which this check does not resolve to prefixes. The check is then incomplete and is reported as a gap, never as a pass.
  - **No pinned values.** The check pins no input literal and no count; it holds whenever the published value equals the recomputation over the leg's re-read inputs.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs. Here the tightest-correct property has two parts:
  - The prefix length is exactly 32 (item 6).
  - The value is the lowest free candidate (item 7). A free candidate higher than the lowest is a rejectable defect.

  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise. Only an exhausted pool, after every candidate has been tested, takes the
  `network-provisioning.p1.inputs-empty` gap.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** A candidate is used when it lies INSIDE any overlapping prefix, not only when it equals a configured /32. Synthetic example, with values that are not from this harvest:
  - The pool is 192.0.2.0/24 and an interface carries 192.0.2.8/29. Every address from 192.0.2.8 through 192.0.2.15 is used, so 192.0.2.10 is NOT free, even though no /32 equals it.
  - In the same pool, 192.0.2.0 and 192.0.2.255 are never candidates (item 8), even when no prefix covers them.

  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every input is inside the derived result, and
  nothing foreign is. For this derivation, that means the published /32 lies inside the pool and overlaps no prefix in the input block.
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
  ("produce a gap report; author nothing") is satisfiable; silence is not. For this leg the null
  outcome is `network-provisioning.p1.inputs-empty`: report the gap and publish nothing (item 5).
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

### Device sources — a network leg only

- **Device sources** (row `network-provisioning.p1.sources`, item 12). This leg changes no device configuration.
  The leg's task description carries this `## Device sources` block exactly:

```
## Device sources
ceos1: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos1-startup.cfg
ceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg
```

## Pipeline 2 objective — network-provisioning change leg (DOWNSTREAM)

- **Read-only harvest.** The leg harvests lab switch ceos2 (git-file and device-read) and lab switch ceos1 (live-read) **read-only**, from the sources its *Device sources* block declares (row `network-provisioning.p2.sources`). Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified — 2026-11-10, at authoring (Run 20261110-0232):**
  - **Harvest read.** The Phase 0 harvest of this authoring run read the interfaces and the BGP configuration and state of both switches through the ceos-lab-readonly service.
  - **What it confirmed.** ceos2 carries at least one loopback whose description names it a telemetry-exporter. Those loopbacks share one description, and each one's /32 is originated in BGP by one shared mechanism.
  - **What it did not confirm.** The ceos2 git-file source item 13 declares was not read; its agreement with the device is **UNTESTED**.
- **The work.** On ceos2 the leg authors a change package containing exactly one new loopback interface and the BGP advertisement of its /32 (`network-provisioning.p2.item-3`, `network-provisioning.p2.target`). The package specifies four things:
  - **Address.** The interface's address is the /32 produced by Pipeline 1, consumed as chained.
  - **Loopback number.** The interface's number follows item 9 (`network-provisioning.p2.item-9`), computed over the `network-provisioning.p2.population` set: one more than the highest-numbered loopback in that set. If that number is already used by any loopback on ceos2, the number is the next unused number above it.
  - **Description.** The description is the description carried by the loopbacks in the `network-provisioning.p2.population` set (`network-provisioning.p2.item-10`).
  - **Advertisement.** The /32 is advertised by the mechanism those loopbacks' /32s are advertised by (`network-provisioning.p2.item-11`).
  - The package changes nothing on any other device and removes no existing configuration line.
- **Admitted-principal premise:** not applicable. This leg is not an authorisation leg: it admits, allows, denies or restricts no sender or principal, and every authorisation row is listed `not-applicable` in the owner block.
- **Existence assumption** (*Writing rules* #6). This leg's own harvest decides which branch applies; this document does not state which branch is true:
  - **No telemetry-exporter loopback.** If the harvest finds no loopback in the `network-provisioning.p2.population` set on ceos2, apply `network-provisioning.p2.inputs-empty`. That means a gap report naming the absent loopbacks, and no change package.
  - **Loopbacks disagree.** If it finds such loopbacks but they do not share one description, or one advertisement mechanism, the outcome is the OPEN row `network-provisioning.p2.exemplar-disagree`: a gap report naming that row, and no change package.
  - **/32 already used.** If it finds the /32 produced by Pipeline 1 already used, in item 4's sense, on ceos1 or ceos2, the outcome is the OPEN row `network-provisioning.p2.value-in-use`: a gap report naming that row, and no change package.
  - **ceos2 sources disagree.** If the two ceos2 sources disagree on any line this leg reads, the outcome is the OPEN row `network-provisioning.p2.sources-disagree`: a gap report naming that row, and no change package.
  - **Loopback number in use.** If the number item 9 yields is already in use, item 9 itself governs: the next unused loopback number above it.
- **Consumed value.** The leg consumes the /32 produced by Pipeline 1 **as chained**, after the network value gate is released. It does **not** re-derive the value and is forbidden from recomputing or re-selecting it (item 2). Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If the chained context does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
  - **If it arrives EMPTY** (Pipeline 1 took its `network-provisioning.p1.inputs-empty` gap, or published no member): make no change to ceos2 and report the upstream gap, citing `network-provisioning.p1.inputs-empty`. Never author a loopback without an address.
- **If this leg's own harvest returns no telemetry-exporter loopbacks on ceos2**, including when ceos2's declared sources cannot be read: apply `network-provisioning.p2.inputs-empty` and produce a gap report and no change package. The `target-empty` and `target-absent` rows are authorisation rows and do not apply to this leg. The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- **No further leg consumes from this leg.** Its deliverable is the change package the network change gate approves. **The deliverable MUST publish, explicitly and prominently:**
  - **Consumed value.** The /32 consumed, labelled as the value produced by Pipeline 1.
  - **Input block.** Every loopback in the `network-provisioning.p2.population` set and every loopback number in use on ceos2, as read by this leg, with the source each came from.
  - **Loopback number.** The number applied.
  - **Description.** The literal description applied (item 10).
  - **Advertisement mechanism.** The mechanism applied (item 11).
  - **Added lines.** `p2-added-lines.txt`: the exact lines the change adds to ceos2's running configuration, in running-config order, separators included.
  - **Apply order.** ceos2 is the only device changed.
  - **Rollback plan.**
- **Validation (mechanical), before apply.** These states can be witnessed at package time.
  1. **Consumed value matches.** Command: `diff p1-value.txt p2-consumed-value.txt`, where the first file holds Pipeline 1's published /32 and the second holds the /32 this leg states it consumed. Expected: no output.
  2. **/32 still free.** Run the Pipeline 1 script once for each ceos2 source item 13 declares. The arguments are ceos1's live-read configuration, then the ceos2 configuration from that source, then `p2-consumed-value.txt`. Expected lines in every run: `UNRESOLVED 0`, `PREFIXLEN 32`, `IN_POOL True`, `COLLISIONS 0`. The `RECOMPUTED` and `MATCH` lines are not part of this leg's expectation, because this leg does not re-select (item 2).
  3. **Loopback number and description.** Run the following once for each ceos2 source item 13 declares, with `p2-loopback-number.txt` and `p2-description.txt` holding the number and the description this leg published:

```
python3 - ceos2-current.cfg p2-loopback-number.txt p2-description.txt <<'EOF'
import re, sys
cfg = open(sys.argv[1]).read()
blocks = re.findall(r"^interface Loopback(\d+)\n((?:[ \t].*\n)*)", cfg, re.M)
used = {int(n) for n, _ in blocks}
exp = {int(n): body for n, body in blocks if re.search(r"^\s+description .*telemetry-exporter", body, re.M)}
if not exp:
    print("NUMBER GAP")
else:
    n = max(exp) + 1
    while n in used:
        n += 1
    descs = {re.search(r"^\s+description (.*)$", b, re.M).group(1).strip() for b in exp.values()}
    print("NUMBER", n)
    print("NUMBER_MATCH", n == int(open(sys.argv[2]).read().strip()))
    print("DESCRIPTIONS", len(descs))
    print("DESC_MATCH", descs == {open(sys.argv[3]).read().strip()})
EOF
```

     Expected in every run:

```
NUMBER <the number in p2-loopback-number.txt>
NUMBER_MATCH True
DESCRIPTIONS 1
DESC_MATCH True
```

- **Validation (mechanical), after apply.**
  - **Why this cannot be checked before the run.** The post-change state cannot be witnessed before the run, because applying the change is out-of-band and human-gated after the program completes. That state does not exist until a person applies the package.
  - **Path taken.** The deterministic path is an **operator-captured pre-change baseline plus a post-change diff**.
  - **Baselines.** Immediately before apply, capture `show running-config` on ceos1 as `pre-ceos1.cfg` and on ceos2 as `pre-ceos2.cfg`. After apply, capture the same as `post-ceos1.cfg` and `post-ceos2.cfg`. The baselines hold secret material and are kept as operator artifacts, never published in a deliverable.
  1. **No change on ceos1 (item 3).** Command: `diff pre-ceos1.cfg post-ceos1.cfg`. Expected: no output.
  2. **No removed lines on ceos2.** Command: `diff pre-ceos2.cfg post-ceos2.cfg | grep -c '^<'`. Expected: `0`.
  3. **Only the package's added lines on ceos2.** Command: `diff <(diff pre-ceos2.cfg post-ceos2.cfg | grep '^>' | sed 's/^> //') p2-added-lines.txt`. Expected: no output.
  4. **The new interface on ceos2.** Command: `show running-config interfaces Loopback<the number this leg published>`. Expected: exactly these three lines.

```
interface Loopback<the number this leg published>
   description <the description this leg published>
   ip address <the /32 produced by Pipeline 1>
```

  5. **Same advertisement mechanism on ceos2 (item 11).** For each /32 listed in this leg's input block and for the new /32, run `show ip bgp <that /32> | json` on ceos2 and save the output as `bgp-<n>.json`. Then run:

     `python3 -c 'import json,glob; print("ORIGINS", len({p["routeType"]["origin"] for f in glob.glob("bgp-*.json") for e in json.load(open(f))["vrfs"]["default"]["bgpRouteEntries"].values() for p in e["bgpRoutePaths"]}))'`

     Expected: `ORIGINS 1`.
  6. **The new /32 reaches ceos1.** Command, on ceos1: `show ip route <the /32 produced by Pipeline 1> | json`, piped to `python3 -c 'import json,sys; r=json.load(sys.stdin)["vrfs"]["default"]["routes"]; print("ROUTES", len(r)); print("BGP", all("BGP" in v["routeType"] for v in r.values()))'`. Expected:

```
ROUTES 1
BGP True
```

### Device sources — a network leg only

- **Device sources** (row `network-provisioning.p2.sources`, item 13). This leg changes device configuration.
  The leg's task description carries this `## Device sources` block exactly:

```
## Device sources
ceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg
ceos2: device-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
ceos1: live-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
```

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Exporter pool: 10.99.0.0/24 (item 1)
- Definition of "used" and "free": a /32 is used when it lies inside any IPv4 interface prefix or any BGP-originated prefix of ceos1 or ceos2. Nothing outside the two switches is consulted (item 4).
- Selection order: the lowest free /32 (item 7)
- Exclusions: the pool's first and last addresses (item 8)
- Representation: a single /32 (item 6)
- Changed device: ceos2 only. The change is exactly one new loopback interface and the BGP advertisement of its /32 (items 2, 3).
- Loopback numbering rule: item 9
- Description rule: item 10
- Advertisement-mechanism rule: item 11

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The /32 produced by Pipeline 1 — produced by Pipeline 1, chained into Pipeline 2's chained context, and settled before Pipeline 2 starts (after the network value gate is released).
- The loopback number, the description literal and the advertisement mechanism are also run-time values. Pipeline 2 derives them from its own harvest under items 9–11, and they cross no leg boundary.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the /32 Pipeline 2's deliverable states it consumed exactly equals the /32 Pipeline 1's deliverable published — the chained value, not a guess, not a recomputation;
2. the /32 produced by Pipeline 1 lies inside 10.99.0.0/24, is neither the pool's first nor its last address (item 8), and overlaps no prefix in Pipeline 1's published input block (item 4);
2b. the /32 produced by Pipeline 1 has prefix length 32 (item 6) and is the lowest candidate under items 4, 7 and 8 — recompute it from Pipeline 1's published input block; do not take the stated value on trust;
3. Pipeline 2's change package adds exactly one loopback interface and the advertisement of exactly the consumed /32 on ceos2, removes no configuration line, and changes no other device (item 3). Its loopback number equals the item 9 result recomputed over Pipeline 2's published input block;
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. Pipeline 2's deliverable states the literal description it applied (item 10) and the advertisement mechanism it applied (item 11).

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

  Here the apply-order statement is required in Pipeline 2's deliverable, the only leg that changes a device. Pipeline 1's deliverable states that it changes no device configuration (item 1).

## Open questions

- **Named gap: Pipeline 1's sources were not read at authoring.** The git-file sources item 12 declares for Pipeline 1, and the ceos2 git-file source item 13 declares for Pipeline 2, were not read during authoring. The authoring harvest read the switches live. Whether the files agree with the switches' running state is untested; each leg's own harvest reads them.
- **No claim beyond the two switches.** No absence claim is made about address usage outside the two lab switches. Item 4 declares that nothing outside the two switches is consulted, so "free" here means free on ceos1 and ceos2 only. It is not a statement that the address is unallocated anywhere else.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 80
