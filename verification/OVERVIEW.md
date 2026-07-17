# Pipeline Harness — autonomous multi-agent delivery engine

An engine that turns a single high-level objective into a reviewed, multi-specialist deliverable with
no human orchestration in the loop — and, one level up, composes multiple such pipelines into a
plan-gated, human-released **program**.

Every claim below links to the verification document or named regression pin that proves it.
Unlinked claims are descriptive, not load-bearing.

## The pipeline layer

Given an objective, the harness decomposes it into 3–7 typed specialist tasks, assigns the right agent
template to each, wires their dependencies into an execution DAG, and then exits — deliberately never
running the children itself. An event-driven reactor layer cascades each child as its dependencies
clear, auto-chains every upstream deliverable into the next agent's prompt, and re-enters the harness
exactly once to synthesize the final customer-facing artifact.

The system is a **planning / synthesis engine, not an actuator**, and its safety model is built around
that constraint. Any use case whose work has external side effects (mutating infrastructure, sending
mail, moving money) keeps the side-effecting act outside the loop: the harness produces an
**approved-but-unapplied** deliverable, and the apply step stays human-gated.

That discipline is enforced in layers:

- **Bounded self-triggering** — retrigger chains carry a per-harness generation budget; runaway
  self-triggering is structurally impossible, not policy-discouraged.
- **Confidence-gated quality loop** — each child's output is accepted, re-executed once with a
  diagnostic, or escalated to a human; the platform keeps the better of an original and a re-run
  automatically.
- **Server-side anti-fabrication invariant** — a pipeline cannot be reported complete unless its child
  stage exists, is non-empty, every child is terminal, and the stage's ownership back-pointer matches.
  An agent that is misled, out of budget, or simply wrong cannot fabricate completion. (Pinned:
  `test-reactor-race-guard`, `test-cc7-contract-guard`.)
- **Verdict reconciliation** — the quality outcome an orchestrator stamps is checked against the
  reviewer's own transcribed verdict; contradictions are annotated and logged, never silently merged.

## The program layer

A **program** is a pipeline of pipelines: one design artifact (topology-as-code + requirements) is read
by a Program Architect that produces a plan and a binding **interface contract**; a mandatory
human approval gate releases the cascade; domain pipelines run in parallel against the shared contract;
a program integration reviewer checks cross-pipeline conformance; and release is stamped as a
deterministic machine fact (`programReleasable`) that a **human** converts into a release decision.
→ `tests/VT-06-green-run-validation.md` (the end-to-end green path), `tests/VT-01-contract-guard.md`
(the binding-contract guard), `tests/VT-04-negative-quality-gate.md` (the release AND-rule).

The failure semantics are the part we verify hardest:

- A child that **can never run** (its binding contract lost) is refused loudly, marked terminal with
  its reason, its downstream cone is marked, and the program **escalates to a human naming the failing
  leg** — it does not hang, and it does not compose a partial deliverable.
  → `tests/VT-02-frozen-cone-escalation.md`
- A child whose deliverable **goes missing** is detected by structured coverage facts
  (`chainCapablePredecessors`, `degradedPredecessors`) consumed by a deterministic release gate — a
  count that "looks complete" cannot mask a missing deliverable.
  → `tests/VT-05-coverage-block.md`
- A child that **escalates** (its own analysis found something a human must decide) is completed with
  its escalated facts so the program blocks on the outcome rather than hanging on an open task.
- Hostile content inside **harvested customer state** (injected instructions, secret-shaped values) is
  surfaced and refused, not obeyed. → `tests/VT-07-adversarial-state-injection.md`
- A value an agent **derives from harvested customer state** (a covering CIDR, a range) is checked
  **mechanically against the harvest itself** — never against the package's own retelling of it,
  which an adversarial round proved can be fabricated — and every reviewer tier must grade its
  findings as verified-against-evidence or accepted-from-claims. A derivation that swallows a
  pre-existing allocation, or whose arithmetic doesn't cover its own members, is a structured
  violation fact in the run record. (Pinned: `test-derivation-containment`.)
- A program parked at its human approval gate **stays parked indefinitely** — nothing queues behind an
  unreleased gate, and no timeout mechanism misfires against it.

## Proven domains

Generic objective-synthesis plus real-device-validated **network provisioning**, **Kubernetes/GitOps**,
and **Terraform/Cloud-IaC** pipelines — each producing an approved-but-unapplied infrastructure change
against real state, read-only by construction, with credential-free self-provisioning and
secret-redaction guards. New domains are added through a repeatable use-case design playbook: a
configuration-and-review exercise, not an engineering project.

## Why you can trust this page

This overview is the marketing-shaped view of an engineering ledger. The ledger's rules: failures are
recorded and published, claims cite machine-checkable facts, and each behavior is guarded by named
regression pins that run on every commit. When a behavior here changes, the linked verification
document is re-verified or visibly version-stamped — a stale claim is treated as a defect.
