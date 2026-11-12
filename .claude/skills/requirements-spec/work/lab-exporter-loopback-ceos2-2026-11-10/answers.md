# Owner answers — lab exporter loopback on ceos2 (2026-11-10)

Owner: Steve. Zero draft: `draft-zero/report.md` (task `cmwa1786e000kyxwvllenp8pp`, requirements-authoring 1.11.0).
Every answer arrived as a paste, was read back, and was confirmed by the owner before it was written here.
Leg class (owner, 2026-11-10): no leg grants or removes access; no leg is a routing leg (Groups C–F do not exist).

### Group S — program shape (owner decision, 2026-11-10)
1. The program has two network legs. Pipeline 1 is a value leg: it reads lab switches ceos1 and ceos2, selects the free /32 in the exporter pool 10.99.0.0/24 and publishes it. This leg changes no device configuration.
2. Pipeline 2 is a change leg: on lab switch ceos2 it applies the /32 that Pipeline 1 published (the new loopback, its description and its BGP advertisement) and does not re-select. This leg changes device configuration.

### Group A — what to act on (accepted 2026-11-10)
3. The program changes lab switch ceos2 only: exactly one new loopback interface and the BGP advertisement of its /32. No configuration change on any other device.
4. A /32 is used by a lab switch when it lies inside any IPv4 prefix configured on any interface of that switch, or inside any prefix that switch originates in BGP. The value leg reads every such prefix of ceos1 and ceos2 that overlaps the pool, and never selects a candidate that overlaps one. An address is free when neither lab switch uses it; nothing outside the two switches is consulted.
5. If no /32 in the pool is free, the value leg reports a gap and publishes nothing.
6. The selected value is expressed as one aligned prefix: a single /32.

### Group N — decisions the zero draft added (accepted 2026-11-10)
7. When more than one /32 in the pool is free, the value leg selects the lowest free one.
8. The pool's first and last addresses are never selected.
9. The new loopback takes the next loopback number after the highest-numbered existing telemetry-exporter loopback on that switch; if that number is already in use, it takes the next unused loopback number above it.
10. The new loopback carries the same description as the existing telemetry-exporter loopbacks; the leg reports, in its own published deliverable, the literal description it applied.
11. The new /32 is advertised in BGP by the same mechanism the existing telemetry-exporter loopbacks use; the leg reports the mechanism it applied.

### Group A2 — Device sources (accepted 2026-11-10; limits L1–L4 shown)
12. Device sources for the network value leg:
   ## Device sources
   ceos1: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos1-startup.cfg
   ceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg
13. Device sources for every network change leg:
   ## Device sources
   ceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg
   ceos2: device-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
   ceos1: live-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json

### Group B — who approves and when (accepted 2026-11-10; three gates)
14. The program plan gate is approved by Jacob Wilcox (approver-0003@example.com).
15. A value gate approves the /32 produced by Pipeline 1. It is approved by Josh Allen (approver-02@example.com) and its position is after-producer-before-consumers: the value reaches Pipeline 2 only after this gate is released.
16. The network change gate approves the change package for ceos2 produced by Pipeline 2. It is approved by Steve Terry (approver-001@example.com) and its position is after-leg-before-completion.

### Group N2 — decisions answered run 1 added (accepted 2026-11-10)
17. If the change leg's own harvest finds the /32 that Pipeline 1 published already used, in item 4's sense, on ceos1 or ceos2, the change leg reports a gap and authors no change package.
18. If the existing telemetry-exporter loopbacks on ceos2 do not share one description, or do not share one BGP advertisement mechanism, the change leg reports a gap and authors no change package.
19. When ceos2's Git file and its device read differ on a line the change leg reads, the Git file governs: it is the base the change package edits, and the device read is evidence.
20. An existing telemetry-exporter loopback is a loopback whose description contains "telemetry-exporter"; the leg reports the literal criterion it applied.

## Owner rationale
- Group N interface-name: neither Author option; the owner gave the rule and, asked about the collision case, the "next unused number above it" branch.
- Group N advertisement-method: the owner's own rule ("same mechanism"); the current mechanism was left out of the item as current state. "the leg reports the mechanism it applied" was proposed by the skill and kept by the owner.
- Git-only value leg: confirmed knowingly — "uses" is judged from the two Git files and the value is stated as derived from Git files only; the change leg reads the running switches as evidence and does not re-select.
- No Git ref is written: the owner states github-service pins that repo at main (not verified by the skill; an absent ref reads as main).
- Owner premise (not in the objective): no reservation of pool addresses exists outside the two switches.
- Owner statement: github-service needs no grant for a fresh POV (the 2026-11-06 canaries).
- inputs-empty: the forced gap is accepted.
- Team (owner, 2026-11-10): the owner added Jacob Wilcox (project manager, stays) and Josh Allen to the POV; no one else joins.
- Gates: three, by owner decision (the zero draft had two). Three distinct approvers.
- Release: Steve Terry releases all three gates on the named approvers' behalf; each release is recorded as made by Steve Terry for the named approver.
- Group N2 (answered run 1's three OPEN rows, Z76): value-in-use = gap; exemplar-disagree = gap; sources-disagree = git-file-governs. Item wording is the skill's, from the owner's option choices; item 20 is the owner's own sentence (declared instead of confirming the derived row).
- Change-leg inputs-empty (no existing exporter loopback): the forced gap stands; the owner raised no objection.
- Z77: the owner will waive the four duplicate-row coverage errors by name at publish.
- Cap (owner): raised to $13 for three generations; the first two cost about $7.70 by the owner's measurement. Stop and ask before any fourth generation.
- Path check (owner asked): github-service lists network/base/ceos1-startup.cfg and ceos2-startup.cfg in paichart/paichart-lab-configs at the default ref main. A directory listing; file contents not read.

## Row → item map
Merged against ONE draft: draft-zero/report.md. Rows marked (added …) were not in that draft's owner block.

<!-- ROW-ITEM-MAP -->
| row id | item |
|---|---|
| `network-provisioning.inputs-empty` | forced |
| `network-provisioning.selection` | 7 |
| `network-provisioning.pool-edges` | 8 |
| `network-provisioning.interface-name` | 9 |
| `network-provisioning.class-marker` | 10 |
| `network-provisioning.advertisement-method` | 11 |
| `network-provisioning.sources` | 13 |
| `approver.program-plan` | 14 |
| `approver.network-change` | 16 |
| `gate.network-change.position` | 16 |
| `network-provisioning.item-1` (added 2026-11-10: owner decision, program shape, the value leg) | 1 |
| `network-provisioning.item-2` (added 2026-11-10: owner decision, program shape, the change leg) | 2 |
| `network-provisioning.target` (added 2026-11-10: the zero draft cited an item the objective did not have, Z74) | 3 |
| `network-provisioning.population` (added 2026-11-10: the zero draft decided what uses means inside a declared row, Z75) | 4 |
| `network-provisioning.item-5` (added 2026-11-10: pool exhausted, decided in the zero draft without a row, Z75) | 5 |
| `network-provisioning.representation` (added 2026-11-10: the zero draft cited an item the objective did not have, Z74) | 6 |
| `network-provisioning.item-12` (added 2026-11-10: Device sources for the value lane) | 12 |
| `approver.network-value` (added 2026-11-10: the owner added a value gate) | 15 |
| `gate.network-value.position` (added 2026-11-10: the owner added a value gate) | 15 |
| `network-provisioning.item-17` (added 2026-11-10: answered run 1 row value-in-use, Z76) | 17 |
| `network-provisioning.item-18` (added 2026-11-10: answered run 1 row exemplar-disagree, Z76) | 18 |
| `network-provisioning.item-19` (added 2026-11-10: answered run 1 row sources-disagree, Z76) | 19 |
| `network-provisioning.item-20` (added 2026-11-10: owner declares the change leg population answered run 1 derived, Z78) | 20 |

## Recorded for a later regeneration — NOT merged (owner, 2026-11-10)
Answers to the three OPEN rows of answered run 2 (`draft-answered2/report.md:63,72,73`, Z80). The owner stopped the flow
before a fourth generation, so these are not numbered items and no objective carries them. A later regeneration words
them as items 21–23 and shows the wording to the owner first.
- Unreadable declared source, value leg (`P1.network-provisioning.source-unreadable`): gap.
- Unreadable declared source, change leg (`P2.network-provisioning.source-unreadable`): gap.
- No existing telemetry-exporter loopback on ceos2 (`P2.network-provisioning.exemplar-absent`): gap.
