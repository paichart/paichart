# Pipeline Use-Case Designs

This directory is the home for **design proposals that apply the Pipeline Harness
(Layer 2 of the autonomous-delivery stack) to a new domain**. The harness shipped
with one production use case — `artifact-synthesis-protocol` (produce a structured
deliverable from raw source material). Each subdirectory here explores a *candidate*
new use case before it earns a seeded protocol.

## Canonical guides in this directory (added 2026-08-08)

This README originally described only the per-use-case design-proposal convention below. The
directory has since accumulated the canonical guides, and a reader landing here had no map.
**Pick your door by what you are trying to do:**

### Pipeline tier (a single pipeline of specialists)
| doc | for |
|---|---|
| `PIPELINE-HARNESS-USER-GUIDE.md` | running a pipeline |
| `PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md` | designing a new pipeline use case (6 phases) |
| `ADD-A-PIPELINE-HARNESS-AGENT.md` | adding a domain/agent to the leg tier |
| `PIPELINE-RUN-FORENSICS-GUIDE.md` | assessing a run from persisted records |
| `PIPELINE-DOMAIN-FIT-CATALOG.md` | does a candidate domain fit at all? (seam test) |

### Program tier (a program of pipelines)
| doc | for |
|---|---|
| `PROGRAM-HARNESS-USER-GUIDE.md` | running a program |
| `PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md` | designing a use case **on the existing** composition model |
| `PROGRAM-COMPOSITION-CATALOG.md` | the shape map (S0-S3) + selection axes |
| **`ADD-A-PROGRAM-PROTOCOL.md`** | authoring a **new composition model** — a different graph structure, gate semantics, or release predicate |
| `PROGRAM-RUN-FORENSICS-GUIDE.md` | assessing a program run |

### Cross-cutting
| doc | for |
|---|---|
| `EVIDENCE-FLOW-DISCIPLINE.md` | how evidence crosses stage boundaries |
| `USING-WORKFLOW-EVOLUTION-AND-SIGNAL-DESIGN.md` | Protocol 13 + Protocol 10 applied here |
| `firewall-policy-use-case.md` | the worked example + single-vs-program decision matrix |

⚠️ **The two program-tier design docs are easy to confuse.** `PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md`
assumes the `pov-program` composition model and designs *content* for it.
`ADD-A-PROGRAM-PROTOCOL.md` is for when the *model itself* differs. If `pov-program`'s shape can
express your objective with different content, you want the playbook.

---

## What belongs here

- A **design proposal** per use case (RFC-style — see structure below).
- A **draft protocol prompt text** (`PIPELINE_<NAME>_PROTOCOL.draft.md`) — the
  candidate string that would eventually be inlined into
  `scripts/seed-protocol-prompts.ts` once the design is approved.

## What does NOT belong here

- Seeded/shipped protocols (those live in `scripts/seed-protocol-prompts.ts`, which
  is the single source of truth — see `.claude/knowledge/discoveries/pipeline-harness-discovery.md` Phase 2).
- Production knowledge about the *shipped* harness (that lives under
  `.claude/knowledge/domain/harness/`).

## Doc structure convention — design proposal, not lab report

A use case that hasn't been built has **no results and no conclusion yet**, so the
classic objective/procedure/results/conclusion (lab-report) skeleton would be filler.
Use the **RFC / design-proposal** skeleton instead — the retrospective sections fill
in *as the design matures*:

| Section | Purpose | When it fills |
|---------|---------|---------------|
| **Status** | Draft / In-Review / Approved / Built / Shipped + date | every edit |
| **Objective** | the problem, why the harness fits, the key seam/constraint | up front |
| **Design** | the decomposition (child specialists, DAG, deliverable/QA split, terminus) | up front |
| **Required Work** | concrete items to build before this is shippable | up front, shrinks over time |
| **Validation Plan** | how we'd *prove* it before shipping (spikes, specialist reviews) | up front |
| **Decision Log** | running record of choices + their rationale (replaces premature "conclusion") | append-only |

The Required Work + Decision Log are the load-bearing sections: they make the doc a
*plan that converges*, not a snapshot that goes stale.

## Standing constraint for any harness use case

The harness is a **planning / synthesis engine, not an actuator**. Its safety model
(reactor re-entry, retrigger chains bounded by Guard 8, confidence + anti-fabrication)
assumes children do **idempotent, re-runnable work** — producing text. Any use case
whose "work" has **external side effects** (mutating infrastructure, sending mail,
moving money) must keep the side-effecting act **outside** the autonomous loop: the
harness produces an *approved-but-unapplied* deliverable; the apply step is human-gated
(e.g. Claude Code) or a deterministic executor. This is the same shape as the harness's
existing "setup-and-exit, never calls `agent.execute`" rule.

## How to run a pipeline

The operator guide — the three modes, quick-start (PIPELINE task), template types, context chaining,
confidence + the completion loop, dependencies, troubleshooting, and the connected-service **domain
pipelines** (network / k8s / Terraform) — is **[`PIPELINE-HARNESS-USER-GUIDE.md`](./PIPELINE-HARNESS-USER-GUIDE.md)**.

## How to design a new use case

Follow the repeatable procedure in
**[`PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md`](./PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md)** —
triage the seam → decompose → list required work → write the RFC + protocol draft →
validate → promote. It names the source-of-truth files and the specialist gates.

**Which domains fit?** — the companion
[`PIPELINE-DOMAIN-FIT-CATALOG.md`](./PIPELINE-DOMAIN-FIT-CATALOG.md) maps the pattern across
domains (network provisioning, Kubernetes/GitOps, and Terraform all shipped; database a candidate),
with what transfers vs what's domain-specific, and a worked Phase-1 fit-triage per candidate.

## How to EVOLVE the platform after a live run finds something

When a run reveals a defect, near-miss, or suspicious pass — or when you're adding a
number/flag/score a consumer will act on — the orientation map for **Protocol 13 (Program Workflow
Evolution)** and **Protocol 10 (Signal Design)** is
**[`USING-WORKFLOW-EVOLUTION-AND-SIGNAL-DESIGN.md`](./USING-WORKFLOW-EVOLUTION-AND-SIGNAL-DESIGN.md)**:
when to reach for which, the four-layer fix classification, and how the calibration-study method
decides whether a signal earns gate authority.

## Index

| Use case | Status | Doc |
|----------|--------|-----|
| Network provisioning (config generation → approved change package) | 🟢 **Shipped** 2026-06-25 — promoted + seeded on prod; real-device-validated (Arista cEOS); R9/R10 guards validated | [`network-provisioning/`](./network-provisioning/network-provisioning-pipeline.md) |
| Artifact synthesis (source → reviewed publication) | 🟢 Shipped — the original reference (pure-cognition shape) | `scripts/seed-protocol-prompts.ts` (`artifact-synthesis-protocol`) + `scripts/seed-artifact-synthesis-templates.ts` |
| Kubernetes / GitOps (cluster state → approved GitOps change) | 🟢 **Built + validated** 2026-06-28 — protocol + templates seeded; end-to-end on a live kind cluster; read-only floor + R9/R10 validated | [`kubernetes-gitops/`](./kubernetes-gitops/kubernetes-gitops-pipeline.md) |
| Terraform / Cloud IaC (state → approved HCL change PR) | 🟢 **Built + seeded + rig-validated** 2026-06-29 — 4-specialist review (~92); LocalStack rig (R9/R10 demonstrated, K1 moat); all 4 roles reused | [`terraform-iac/`](./terraform-iac/terraform-iac-pipeline.md) |

> **Layout note (2026-08-23)**: `firewall-policy-use-case.md` + `firewall-examples/` are a worked
> USE-CASE (composed from the network-provisioning + terraform-iac domains — deliberately NOT a
> domain subdir; no firewall protocol/rig exists). They stay at root pending the `use-cases/`
> reorg, triggered when the IGP-migration design doc graduates from cline_docs — one Protocol-11
> sweep will move both.

## Security

- **`LLM-ORCHESTRATION-SECURITY-POSTURE.md`** — the security properties specific to multi-agent
  ORCHESTRATION (not generic LLM security). Read before designing a new channel between agents:
  trust framing is part of the attack surface; sanitising a binding constant corrupts it; a
  conditional obligation whose subject never arrives is decoration, not a guard. Several of these
  invert the obvious advice.
