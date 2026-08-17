# The protocols — the agent-facing contracts, published verbatim

These are the **exact texts injected into pipeline agents' system prompts** — the contracts the
[verification pack](../verification/) holds runs against, rendered byte-for-byte from the platform
seed. Since 2026-08-17 injection is **composed**: a running agent's prompt carries the
orchestration base (`pipeline-orchestrator-protocol`) plus the **one** protocol its task is bound
to — the binding is resolved by the platform from the task title's `(protocol: <name>)` token,
once, at first execution, and stamped; it is never a model-side choice. So each file here is not
just "available" to an agent — when bound, it is the governing half of that agent's prompt,
verbatim. Nothing is edited for publication: internal cross-references, tool-call mechanics, and the
scar tissue of dated incident clauses are all part of the record. The
[ARCHITECTURE decision log](../verification/ARCHITECTURE.md) is the version history; every version
stamp there now has a readable text here.

Why publish them: the pack's central claim is that behavior is governed by *contracts plus
mechanical checks*, not by hope. A verification document that says "the protocol's Phase-0 clause
requires X" is a paraphrase; this directory is the primary source. When VT-15 says a clause "bound
on first live exposure", the clause it means is [readable below](terraform-iac-protocol.md).

## Index

| Protocol | Version | What it governs | Live validation status |
|---|---|---|---|
| [`pipeline-orchestrator`](pipeline-orchestrator-protocol.md) | 3.10.0 | The default pipeline decomposition + the three-mode lifecycle every domain protocol inherits | Exercised by every pipeline run in the pack |
| [`pov-program`](pov-program-protocol.md) | 1.0.30 | Programs of pipelines: the DAG, the interface contract, the plan gate, the release gate's deterministic AND | The most-verified text here — VT-01…VT-14 exercise it, including the failure rounds |
| [`artifact-synthesis`](artifact-synthesis-protocol.md) | 1.4.0 | Source material (git history, execution logs, delivery history, external services) → a publishable deliverable via harvest → author → review | Exercised by the published [artifact-synthesis case study](../examples/artifact-synthesis-case-study.md) |
| [`network-provisioning`](network-provisioning-protocol.md) | 1.3.1 | Device config change packages; the origin of the derivation-evidence contract | Battle-hardened: runs 2–26 shaped it clause by clause (see the decision log). The v1.3.1 secret-hygiene clause is newly seeded and not yet exercised by a published round |
| [`terraform-iac`](terraform-iac-protocol.md) | 1.2.0 | HCL change packages as PRs; zero-provider harvest; the cross-ported derivation-evidence contract | v1.2.0's evidence contract: **benign path verified live** ([VT-15](../verification/tests/VT-15-cross-domain-evidence-contract.md) — bound on first exposure). The *deriving* path (containment arithmetic firing on a Terraform derivation) is not yet exercised live |
| [`kubernetes-gitops`](kubernetes-gitops-protocol.md) | 1.2.0 | Declarative GitOps change packages; offline validation only | v1.2.0's baseline-scoped drift clause ships **seeded-unvalidated** — no published round has presented out-of-band drift yet. We say so here for the same reason the pack publishes failed rounds |

Not in this directory, honestly rather than silently: a `research-program` protocol exists as a
**database-side draft** under active authoring and is deliberately unpublished until it stabilizes;
the user-facing `HOWTO-*` guides are prompt UX, reachable in any connected AI client via
`list_prompts()`, and are not verification-bearing contracts.

## How to read one

- The **description** at the top of each file documents which title token binds it — binding is a
  platform stamp, not model-side matching (2026-08-17; before that the harness matched intent
  prose). A protocol still self-fences, but a fence no longer says "ignore this and fall back":
  a wrong binding is an **escalation** — the agent stamps `metadata.cannotRun` and stops, and the
  platform terminalizes the run for human re-route.
- Dated clauses (*"2026-08-04, measured"*, *"run-4 incident"*) are earned, not decorative: nearly
  every load-bearing sentence exists because a published round failed without it. The
  [decision log](../verification/ARCHITECTURE.md) and the [VT index](../verification/README.md)
  are the cross-reference.
- Prose contracts are **advisory until a mechanical check backs them** — the platform's own
  measured position (two rounds skipped a numbered prose check by two different mechanisms). Where
  a clause matters, look for its structured block (`## Harvested Allocations`, `## Derived Values`,
  `## Consumed Values`) — those are parsed and re-checked in code
  ([`@paichart/containment-checks`](../packages/containment-checks/), the open-sourced arithmetic).

## Fidelity guarantee

Each file is rendered from the platform's seeded row and byte-parity-checked against it
(`--check` mode of the render script, run at every protocol change and quarterly). The public copy
is never edited directly — a divergence fails the check naming the file. If a version stamp here
lags the decision log, that is a defect; please open an issue.
