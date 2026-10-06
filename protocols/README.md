# The protocols — the agent-facing contracts, published verbatim

These are the **exact texts injected into pipeline agents' system prompts** — the contracts the
[verification pack](../verification/) holds runs against, rendered byte-for-byte from the platform
seed. Injection is **composed**: a running agent's prompt carries the orchestration base
(`pipeline-orchestrator`) plus the **one** protocol its task is bound to. The platform resolves
that binding from the task title's `(protocol: <name>)` token, once, at first execution, and
stamps it on the task; it is never a model-side choice. So when a protocol here is bound, it is
the governing half of that agent's prompt, verbatim. Nothing is edited for publication: internal
cross-references, tool-call mechanics, and dated incident clauses are all part of the record.

Why publish them: the pack's central claim is that behavior is governed by *contracts plus
mechanical checks*, not by hope. A verification document that says "the protocol requires X" is a
paraphrase; this directory is the primary source.

## Index

Every status below says what has actually run. "Validated live" means the **current version** has
run end to end on real infrastructure, with the evidence named. Anything less says so — for the
same reason the pack publishes its failed rounds.

| Protocol | Version | What it does | Verification status |
|---|---|---|---|
| [`pipeline-orchestrator`](pipeline-orchestrator-protocol.md) | 3.18.0 | The base every pipeline composes over: the three-mode lifecycle (create, orchestrate, synthesize) and the default decomposition into specialist tasks | **Validated live** — every pipeline in [VT-31](../verification/tests/VT-31-a-specification-generated-with-no-decisions-declared-drives-a-releasable-program.md) (2026-10-01) and every program run on 2026-10-05/06 composed over this version. |
| [`pov-program`](pov-program-protocol.md) | 2.0.0 | A program of pipelines: plan, interface contract, human plan gate, change and value legs, integration review, and a release fact computed from the legs' facts | **Validated live** 2026-10-05/06 ([VT-32](../verification/tests/VT-32-a-value-leg-folds-into-the-program-protocol-and-six-runs-measure-what-it-releases.md)) — the plan-gate check passed; three of six programs were releasable; three correctly withheld release because one leg's own reviewer refused it (a Kubernetes drift-paperwork gap, fixed in 1.15.0; an elided Terraform rollback diff; an observability validation step written as prose where the literal was in the package). |
| [`artifact-synthesis`](artifact-synthesis-protocol.md) | 1.4.1 | Source material (history, logs, external services) to a publishable document via harvest, author, review | **Validated live** at this version in [VT-16](../verification/tests/VT-16-composed-protocol-injection.md) (2026-08-17, approved); see also the [case study](../examples/artifact-synthesis-case-study.md). |
| [`network-provisioning`](network-provisioning-protocol.md) | 1.19.0 | An approved network device change package (never an applied change), with derivation evidence for any computed value | **Validated live, one run** (2026-10-06) — the leg was approved, and this version's new reachability step ran: the Author's package checked a discard-route risk itself. |
| [`network-derivation`](network-derivation-protocol.md) | 1.0.1 | A network value leg: harvest state read-only, derive a value other legs consume (an address aggregate or AS number), review the derivation; changes nothing | **Validated live, two runs** (2026-10-06) — in four-domain programs the value leg published a value every consuming leg used: in the value-leg control, where the program was releasable, and in the demo run, where the value leg approved at 94 and the program was refused on an unrelated observability leg. |
| [`terraform-iac`](terraform-iac-protocol.md) | 1.12.1 | An approved HCL change package as a pull request; state is harvested read-only, and nothing is applied | **Validated live** — Terraform legs were approved in five of six programs on 2026-10-05/06; in the sixth (2026-10-06) a leg was correctly refused for an elided rollback diff (an Author defect we are measuring). |
| [`kubernetes-gitops`](kubernetes-gitops-protocol.md) | 1.15.0 | An approved declarative GitOps change package, validated offline; blast radius is what a selector actually matches | **Validated live, one run** (2026-10-06) — this version's drift-restatement step ran, and the leg was approved. |
| [`observability-config`](observability-config-protocol.md) | 1.6.0 | An approved observability change package (Prometheus rules, OpenTelemetry collector, Grafana provisioning) from an unconditional read-only harvest of the live stack | **Validated live** — observability legs were approved in three four-domain programs on 2026-10-05/06. |
| [`requirements-authoring`](requirements-authoring-protocol.md) | 1.8.0 | A draft `requirements.md` for a program, for human review; never a launched program | **Seeded, not yet exercised live** at 1.8.0 (it adds routing design decisions). Version 1.7.5 generated the specification behind [VT-31](../verification/tests/VT-31-a-specification-generated-with-no-decisions-declared-drives-a-releasable-program.md). |

Version history: the [decision log](../verification/ARCHITECTURE.md) and the
[VT index](../verification/README.md). The decision log itemises changes through 2026-08-17, then
carries a short catch-up for five of the versions published here (through 2026-10-06). Other
versions after 2026-08-17 are not itemised; the VT documents and the protocol texts are the record.

Not in this directory, honestly rather than silently:
- `value-chain-program` was folded into `pov-program` 2.0.0 on 2026-10-05. Its row survives only
  as a retired marker: a task bound to it fails loudly before running. It is not published.
- `research-program` is an unpublished draft.
- The user-facing `HOWTO-*` guides are prompt UX, reachable in any connected AI client via
  `list_prompts()`. They are not verification-bearing contracts.

## How to read one

- The **description** at the top of each file names the title token that binds it. Binding is a
  platform stamp, not model-side matching. A wrong binding is an **escalation**: the agent stamps
  `metadata.cannotRun` and stops, and the platform ends the run for a human to re-route.
- Dated clauses (*"2026-08-04, measured"*, *"run-4 incident"*) are earned, not decorative. Most
  load-bearing sentences exist because a round failed without them.
- Prose contracts are **advisory until a mechanical check backs them**. Where a clause matters,
  look for its structured block (`## Harvested Allocations`, `## Derived Values`,
  `## Consumed Values`). Those are parsed and re-checked in code
  ([`@paichart/containment-checks`](../packages/containment-checks/), the open-sourced arithmetic).
- Strictness is set by the platform, not by the customer. New checks default to a recorded
  warning rather than a block, and there is no customer-settable policy profile today.
- Release stays a human decision. A program's release fact says whether the legs' facts allow
  release; a person still releases.

## Fidelity guarantee

Each file is rendered from the platform's seeded row and checked byte-for-byte against it. The
public copy is never edited by hand; a divergence fails the check and names the file. This set
was re-rendered on 2026-10-06. The check is run by hand, not in CI, and this mirror has fallen
behind before. If a version here lags what the platform runs, that is a defect — please open an
issue.
