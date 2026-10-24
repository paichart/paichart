# Give each lab switch a new telemetry-exporter loopback, using an address no device already holds

Two legs, one network fabric. Read this before questioning the shape: it is deliberately small.

## What must happen

Each of the two lab switches (ceos1, ceos2) gets one new loopback interface, `Loopback14`, carrying a
telemetry-exporter address taken from the exporter pool `10.99.0.0/24`, advertised into BGP with a
`network` statement beside the switch's existing exporter addresses. The two new addresses must be free:
no device in the fabric may already hold either of them, and the two must differ. Nothing else changes.

Which addresses are free is not known in advance — it depends on what the switches hold today. One leg
works that out from the switches' current configuration; the other leg makes the change with the values
the first leg produced.

## Why this is a program and not one pipeline

The address selection is a value other work depends on, and it must be checked on its own (each chosen
address free and inside the pool) before any configuration is written with it.

## Approval gates

| gate | approves | approver |
|---|---|---|
| program plan | the plan, the leg types and the interface contract, before either leg runs | Steve Terry |

## Pipeline 1 objective — fabric addresses (network-derivation, value)

Harvest both switches read-only and derive, for each switch, one exporter address from `10.99.0.0/24`
that no device in the fabric holds today. Publish the two values for the second leg. Changes nothing.

## Pipeline 2 objective — fabric loopbacks (network-provisioning, change) — depends on Pipeline 1

Configure `Loopback14` on each switch with the address Pipeline 1 derived for that switch, and add a
matching BGP `network` statement. Never applied by this run.

The leg's task description carries this `## Device sources` block exactly:

```
## Device sources
ceos1: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos1-startup.cfg
ceos1: device-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
ceos2: device-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
```

## Node C — integration review (facts only)

Check numbering is FIXED and referenced by number elsewhere. A new requirement APPENDS (4, 5, …).

1. Pipeline 2 configures, on each switch, exactly the address Pipeline 1 derived for that switch.
2. Each configured address is inside `10.99.0.0/24`, and the two differ.
3. Pipeline 2 changes nothing beyond the new `Loopback14` interface and its `network` statement on each switch.

## Validation shape

Governed by each leg's own active protocol, not by this file. This document does not restate, weaken
or override a protocol clause.

## Connection surfaces

Both legs reach the switches only through a self-provisioned read-only MCP service named by the
descriptor URL in `topology.json` `readOnlyServices`, and Pipeline 2 reads ceos1's configuration file
only through the platform's file source. `topology.json` declares no endpoint, category or tools of its own.
