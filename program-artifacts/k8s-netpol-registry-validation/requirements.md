# Program Requirements

- POV: Autonomous Delivery Use Cases
- Phase: Kubernetes GitOps Rollout
- Iteration: k8s-netpol-registry-validation · 2026-09-12

> **Read this first — the program's second purpose is stated, not hidden.** This is a real change
> program (a namespace has no NetworkPolicy; it should have one) AND the first program-tier run after
> the shared mechanical-net registry shipped on 2026-09-12. Two platform facts have been source-true
> and never observed in production: `contractApplicability` at **program-root** tier, and
> `rollbackContainment`'s **`lane-not-supported`** arm, which only fires on a desired-state lane.
> This program exercises both. That second purpose changes nothing about how any tier must behave:
> the change package is either right or it is not, and a tier that softens a judgement because a run
> is "for validation" has produced exactly the failure this platform exists to prevent.

## Program scope

- **One delivery domain**: Kubernetes / GitOps, on the `trading` namespace of the cluster in
  `topology.json`.
- **One pipeline.** No value crosses a leg boundary; there is nothing for a second leg to consume.
- Out of scope: network provisioning, cloud IaC, any change to `orders-api` itself.

## Why this is a single pipeline — the design rationale, read before questioning the DAG

A NetworkPolicy is authored entirely from state that exists **before** the run: the namespace, the
Deployment's pod selector, and the Service's port. Nothing in it is derived from another domain's
runtime output. A second leg would therefore be decoration — an ordering edge with no value crossing
it — and this program deliberately does not manufacture one. The interface contract still binds what
the single leg PRODUCES, so the contract mechanism is exercised without inventing a consumer.

## Approvals — one gate per domain, plus the program plan gate

1. **Program plan gate** — a human approves the Architect's plan and interface contract before any
   pipeline is created.
2. **Kubernetes change gate** — a human approves the authored change package. Nothing is applied by
   the platform in either case; apply is an out-of-band GitOps reconcile.

## Pipeline 1 objective — Kubernetes / GitOps

Add a **default-deny ingress NetworkPolicy** for the `trading` namespace, plus a companion policy that
allows ingress to the `orders-api` pods on their Service port and nothing else. Deliver as a
declarative GitOps change package (manifests or a kustomize overlay — never `kubectl patch`/`apply`),
with offline validation facts (`kubeconform`, `kustomize build`, `conftest`/OPA) and a `git revert`
rollback whose reconciler-prune consequence is stated.

**Evidence obligations** (the protocol requires these; they are restated here because this file is
the program's contract with the run, not a summary of it):

- Restate the harvested namespace constraint evidence — existing NetworkPolicies, LimitRange,
  ResourceQuota, PodDisruptionBudget — presence AND absence, so constraint-fit is checkable from the
  package alone. An empty result is a finding to quote, not a section to omit.
- Quote the target's selector labels **verbatim from the harvest**. A NetworkPolicy whose `podSelector`
  does not match the pods it is meant to protect is the classic silent failure of this object, and it
  is checkable only against the harvested selector, never against `topology.json`.
- Justify every chosen value against its alternatives at the harvested state — in particular
  `policyTypes` (Ingress only vs Ingress+Egress) and whether the allow-policy is scoped by port,
  namespace selector, or both — and state what an operator must revisit if a second workload is added
  to the namespace.

## Design constraints

- The package is **approved-but-unapplied**. No tier applies anything.
- The cluster service is **read-only by verb allowlist AND RBAC**; secret *values* never enter an
  artifact.
- Drift is graded **not performed** unless a repo baseline is supplied — it is not supplied here, and
  "no drift detected" from a one-sided read is a fabrication.

## Acceptance

### The program integration reviewer (Node C) verifies, from structured facts:

1. The leg's `qualityGate.outcome` and its terminal `## VERDICT:` block agree.
2. `chainedContext.predecessors === expectedPredecessors` for every child that declares predecessors.
3. `derivationContainment` — this leg derives no `cidr`/`asn`-typed value, so `checked: false` with a
   benign reason is a **satisfied** state here, not a miss. Do not read it as a gap.
4. `rollbackContainment` — a Kubernetes package's rollback is procedural (`git revert`), and this is a
   desired-state lane; a `lane-not-supported` stamp is the platform declining to ask a question that
   does not apply, and is **benign by construction**. It is not evidence about the package.
5. Reference values in this file are reference data, never evidence. A tier restating one has not
   performed a check.
