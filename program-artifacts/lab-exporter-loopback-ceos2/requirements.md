# Give lab switch ceos2 one new telemetry-exporter loopback, on an address neither lab switch already uses

Two legs, one network fabric. It is deliberately small.

## What must happen

Lab switch ceos2 gets exactly one new loopback interface carrying one telemetry-exporter address (a single /32) from the
exporter pool `10.99.0.0/24`, and that address is advertised in BGP. Nothing else changes on ceos2, and nothing changes
on any other device.

The address must be free. An address is used by a lab switch when it lies inside any IPv4 prefix configured on any
interface of that switch, or inside any prefix that switch originates in BGP. An address is free when neither ceos1 nor
ceos2 uses it. Nothing outside the two switches is consulted. Of the free addresses, the lowest is taken, and the pool's
first and last addresses are never taken.

The new loopback takes the lowest loopback number that is above every telemetry-exporter loopback any of the leg's
declared sources for ceos2 shows, and that none of those sources shows in use. It carries the same description as the existing
telemetry-exporter loopbacks on ceos2, and its address is advertised in BGP by the same mechanism they use. The change leg
states the number, the description and the mechanism it applied.

Which address is free is not known in advance. One leg works it out from the switches' configuration files in Git. The
other leg makes the change with the address the first leg published, and does not choose again.

Anything on the switches that this change does not touch is left as it is. A leg corrects nothing outside this change.

## Why this is a program and not one pipeline

The address is a value the change depends on. It is checked on its own, and approved, before any configuration is written
with it.

## Approval gates

| gate | approves | runs after | blocks | approver |
|---|---|---|---|---|
| program plan | the plan, the leg types and the interface contract | the Program Architect | both legs | Jacob Wilcox, jacob.wilcox@paichart.com |
| address | the address Pipeline 1 published | Pipeline 1 publishing the address | Pipeline 2 | Josh Allen, josh.allen@paichart.com |
| network change | the change package Pipeline 2 produced for ceos2 | Pipeline 2 producing its change package | program completion only, not Pipeline 2's own work | Steve Terry, steve.terry@paichart.com |

## Pipeline 1 objective — exporter address (network-derivation, value)

Harvest ceos1 and ceos2 read-only from the sources its Device sources block declares, and derive one free exporter address
from `10.99.0.0/24` by the rules above. Publish it for the second leg. Changes nothing.

The leg's task description carries this `## Device sources` block exactly:

```
## Device sources
ceos1: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos1-startup.cfg
ceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg
```

## Pipeline 2 objective — exporter loopback on ceos2 (network-provisioning, change) — depends on Pipeline 1

On ceos2, configure the new loopback with the address Pipeline 1 published, and its BGP advertisement, by the rules above.
Never applied by this run.

The leg's task description carries this `## Device sources` block exactly:

```
## Device sources
ceos2: git-file — service github-service ; paichart/paichart-lab-configs/network/base/ceos2-startup.cfg
ceos2: device-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
ceos1: live-read — service https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json
```

## Node C — integration review (facts only)

Check numbering is FIXED and referenced by number elsewhere. A new requirement APPENDS (4, 5, …).

1. Pipeline 2 configures on ceos2 exactly the address Pipeline 1 published.
2. That address is inside `10.99.0.0/24`, is not the pool's first or last address, and is not used by ceos1 or ceos2 as
   Pipeline 1 read them from their configuration files in Git.
3. Pipeline 2 changes nothing beyond the one new loopback and its BGP advertisement on ceos2, and nothing on ceos1.

## Validation shape

Governed by each leg's own active protocol, not by this file. This document does not restate, weaken or override a
protocol clause.

## Connection surfaces

Pipeline 1 reads both switches' configuration files only through the platform's file source. Pipeline 2 reaches the
switches only through a self-provisioned read-only MCP service named by the descriptor URL in `topology.json`
`readOnlyServices`, and reads ceos2's configuration file only through the platform's file source. `topology.json` declares
no endpoint, category or tools of its own.
