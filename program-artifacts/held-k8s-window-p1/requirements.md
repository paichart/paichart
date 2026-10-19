# Give the trading API a disruption budget, from the file the team keeps in Git

One domain, one leg, one file. Read this before questioning the shape: it is deliberately small.

## What must happen

The `orders-api` workload in the `trading` namespace runs more than one replica, but nothing stops a
voluntary eviction (a node drain, a cluster upgrade) from taking every replica down at once. Add a
PodDisruptionBudget so that at least one `orders-api` pod stays available through a voluntary
disruption.

The team keeps the namespace's manifests in a Git config repository. The change is a change to the
file in that repository — the cluster is read only to see what is running.

## Why this is a program and not one pipeline

It is a program so the plan, the interface contract and the integration review run over a change to
a file the platform holds. The single leg is the whole change.

## Approval gates

| gate | approves | approver |
|---|---|---|
| program plan | the plan and the interface contract, before the leg runs | Steve Terry |

## Pipeline 1 objective — cluster (kubernetes-gitops, change)

Read the config-repo file named in `topology.json` (`configRepo`) and harvest the namespace
read-only. Author the PodDisruptionBudget for `orders-api` as an addition to that file — a new
document in it, not a separate file. Choose `minAvailable` or `maxUnavailable` from what the
harvest shows about the workload's replicas, and state why. Never applied by this run.

The leg's task description must name the config-repo file exactly as `topology.json` gives it —
owner, repository, ref and path — and the read-only cluster descriptor URL.

## Node C — integration review (facts only)

Check numbering is FIXED and referenced by number elsewhere. A new requirement APPENDS (4, 5, …).

1. The package adds exactly one PodDisruptionBudget, in the `trading` namespace, whose selector
   matches the `orders-api` pods' labels as harvested.
2. The budget leaves at least one `orders-api` pod available at the replica count the harvest
   reported.
3. The change is to the named config-repo file, and no other part of that file is changed.

## Validation shape

Governed by the leg's own active protocol, not by this file. This document does not restate, weaken
or override a protocol clause.

## Connection surfaces

The leg reaches the cluster only through a self-provisioned read-only MCP service, named by the
descriptor URL in `topology.json` `readOnlyServices`, and reads the config-repo file only through the
platform's file source. `topology.json` declares no endpoint, category or tools of its own.
