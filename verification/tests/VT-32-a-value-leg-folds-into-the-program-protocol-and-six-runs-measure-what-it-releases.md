# VT-32 — a value leg folds into the program protocol, is typed from the specification alone, and six runs measure what it releases

**Status**: VERIFIED 2026-10-06 (live; the promotion of value legs into `pov-program` 2.0.0, one plan-gate-only check and
six program runs after it; 3 of 6 releasable) | Re-verify trigger: any change to the `pov-program` or
`network-derivation` protocol; to the `program_architect` role guidance (the leg-type rule); to the integration
reviewer's template or the `change_reviewer` role guidance; to the `## VERDICT:` parser; or the all-domain per-leg
refusal rate, measured with the same definition over the latest 80 or more leg reviews, differing from 26% by more than
ten points (a single domain counts only at n ≥ 30; a protocol text change resets the series).
**Layer**: program (two to four pipeline-tier legs, one program tier) — and the program protocol's own release
**Round type**: promotion acceptance (a plan-gate-only check and three regression controls in a frozen window), the
promotion's owed positive control, then two post-promotion runs

**Date:** 2026-10-05 to 2026-10-06. Related: VT-31 (a generated specification drives a releasable program), VT-29 (a
generated specification drives the same program as a human-authored one), VT-25 (the value reached the container, not
the worker).

## Objective

Until 2026-10-05 a program leg that only **publishes a value** — harvest live state read-only, derive an address
aggregate, change no device — could run only under a separate, opt-in program protocol built to measure that shape in
isolation. This round folds it into the released program protocol and checks three things:

> **1. The fold breaks nothing that already released.** The shapes that `pov-program` already ran — two network legs
> plus a cloud leg, a sequenced network → Terraform program, a four-domain program, a Kubernetes → Terraform program —
> plan and gate exactly as before under 2.0.0, with the program's integration reviewer (Node C) moved to a neutral
> template that is bound to no domain protocol.
>
> **2. A value leg is typed from the specification alone.** Given a specification whose text says the fabric leg
> changes nothing, the program architect types that leg `leg type: value` on the `network-derivation` protocol, with no
> help from a harness-written brief, and the leg runs end to end with no Author and no change package.
>
> **3. What the program releases, and why it refuses.** Every refusal across the runs that follow is checked against
> the package it refused, and the rate behind them is measured, not inferred from the runs we happened to watch.

Ruled out explicitly: a release obtained by re-running a leg until it passes (no leg in this round was re-rolled for
a better verdict), and a pass in which the integration reviewer was skipped.

## Method

1. **Built as a variant, measured, then folded.** The value-leg shape was built as a separate program protocol
   (`value-chain-program`), measured in a frozen window with every text held fixed, and only then folded into
   `pov-program` 2.0.0. The variant's name survives only as a retired marker: a task bound to it fails loudly before it
   runs.
2. **Two deploys.** The first added the neutral integration-reviewer template and nothing else. The second switched
   `pov-program` to 2.0.0 and retired the variant. No program was launched between them.
3. **A pre-declared stop line.** Eight conditions — each a way the fold itself could have broken a released shape —
   would halt the window on first sight. Every control was read against all eight.
4. **Controls on a fresh project with neutral names.** Phase, stage and task names say nothing about the shape under
   test; one root title was rewritten before launch because the draft named the answer ("value leg control").
5. **Gate recomputation by hand** for every run, from the persisted facts: leg outcomes, the MIN of the leg reviewer
   scores, Node C's parsed verdict, coverage, and each leg's containment stamp — read as stamped, never re-derived.
6. **Gates.** The value-leg control's gates were all released **by the owner in the product's GUI**. Every other run's
   gates were released by an AI coordinator under the owner's delegation, with the owner as approver of record. A gate
   holding a refused leg was released only **to close the record** — never as approval of that leg's package.
7. **The rate** (claim 3) is a read-only query over every leg review since 2026-09-28: the latest verdict per review
   task, across the four change-leg domains.

The network legs run against an Arista cEOS lab and are **not externally reproducible** (the image requires an Arista
account). The Kubernetes, Terraform and observability legs run against the labs published in [`usecases/`](../../usecases/).

## Config

- Specifications:
  - plan-gate-only check: [`program-artifacts/firewall-a3-partner-path-r2/`](../../program-artifacts/firewall-a3-partner-path-r2/)
  - control 1: [`program-artifacts/meridian-t6-sequenced/`](../../program-artifacts/meridian-t6-sequenced/)
  - control 2 and the regression run: [`program-artifacts/telemetry-export-genspec-t1zero-v2/`](../../program-artifacts/telemetry-export-genspec-t1zero-v2/) (program view)
  - control 3: [`program-artifacts/k8s-tf-podrange-authz/`](../../program-artifacts/k8s-tf-podrange-authz/)
  - value-leg control and the demo run: [`program-artifacts/telemetry-export-value-leg/`](../../program-artifacts/telemetry-export-value-leg/)
    — a derivative of `…-t1zero-v2` whose `topology.json` differs in one field and whose requirements say: *"The fabric
    leg changes nothing. It harvests read-only and publishes one derived value, the exporter-range CIDR; it changes no
    device and produces no configuration, no change package and no rollback plan."* (`PUBLISH-NOTES.md` lists every
    edit.)
- Protocols, as stamped on each execution: [`pov-program`](../../protocols/pov-program-protocol.md) 2.0.0 on every root
  execution · `pipeline-orchestrator` 3.18.0 · [`network-derivation`](../../protocols/network-derivation-protocol.md)
  1.0.1 · `network-provisioning` 1.18.1 (controls 1–2), **1.19.0** (regression run) · `kubernetes-gitops` 1.14.0
  (controls 2–3, value-leg control), **1.15.0** (regression and demo runs) · `terraform-iac` 1.12.1 ·
  `observability-config` 1.6.0.

## Expected observables

- Every root execution composes `pipeline-orchestrator` 3.18.0 + `pov-program` 2.0.0.
- Node C runs on the neutral integration-reviewer template; the producer and Node C depend on the pipeline legs only,
  never on a gate; every leg and Node C hold the interface contract the plan carries.
- The plan types each leg `leg type: change` or `leg type: value`, and the plan gate lists the types for the human.
- A value leg's roster is Harvester → Derivation Architect → Derivation Reviewer — no Author; its card carries
  `legShape: value`; its containment stamp is `checked-clean`.
- Releasable ⟺ every leg `approved` AND no `verdictMismatch` AND every leg's containment disposition `benign` AND Node C
  `## VERDICT: APPROVED` AND coverage clean (`chainCapablePredecessors` = legs, `degradedPredecessors` = 0,
  `notChained` = `[]`). Root `qualityGate.reviewerScore` = MIN of the legs' reviewer scores.

## Results

### The six runs, and the gate recomputed by hand

| run | legs (reviewer score, outcome) | MIN | Node C | containment | coverage | releasable |
|---|---|---|---|---|---|---|
| control 1 — sequenced network → Terraform | network 88 ✅ · Terraform 90 ✅ | 88 | APPROVED, 0 blocking | network `checked-clean` (8 harvested, 0 violations; `10.99.0.6/31`) · Terraform consumed `10.99.0.6/31`, discharged, upstream green | 2 of 2, 0 degraded, `[]` | **true** |
| control 2 — four domains | fabric 90 ✅ · Kubernetes 88 **NR** · Terraform 88 ✅ · observability 90 ✅ | 88 | NEEDS-REVISION, 1 blocking: the Kubernetes leg's own refusal | fabric `checked-clean` (10 harvested, 0 violations; `10.99.0.0/27`) · three consumers discharged on `10.99.0.0/27` | 4 of 4, 0, `[]` | **false** |
| control 3 — Kubernetes → Terraform | Kubernetes 93 ✅ · Terraform 90 ✅ | 90 | APPROVED, 0 blocking | Kubernetes `checked-clean` (2 harvested, 0 violations; `10.244.0.4/30`) · Terraform discharged on it | 2 of 2, 0, `[]` | **true** |
| value-leg control | fabric **value leg** 95 ✅ · Kubernetes 92 ✅ · Terraform 90 ✅ · observability 87 ✅ | 87 | APPROVED, 0 blocking | value leg `checked-clean` (10 harvested, 0 violations; `10.99.0.0/27`) · three consumers discharged on it | 4 of 4, 0, `[]` | **true** |
| regression run | fabric 91 ✅ · Kubernetes 91 ✅ · Terraform 88 **NR** · observability 88 ✅ | 88 | NEEDS-REVISION, 1 blocking: the Terraform leg's own refusal | fabric `checked-clean` (10 harvested, 0 violations; `10.99.0.0/27`) · three consumers discharged | 4 of 4, 0, `[]` | **false** |
| demo run | fabric **value leg** 94 ✅ · Kubernetes 90 ✅ · Terraform 90 ✅ · observability 88 **NR** | 88 | NEEDS-REVISION, 1 blocking: the observability leg's own refusal | value leg `checked-clean` (10 harvested, 0 violations; `10.99.0.0/27`) · three consumers discharged | 4 of 4, 0, `[]` | **false** |

Every stamped `programReleasable` and every root `reviewerScore` equals the hand recomputation. No leg in any run
carried `verdictMismatch`; every containment disposition is `benign`. Each refused run fails on one leg's outcome, and
Node C's refusal names that same leg as its only blocking item.

The value (`10.99.0.0/27`, a lab address) is derived from live state on every run in which it appears; consumers
declare it exactly as published and the platform discharges the declaration (`consuming-leg-consumed-discharged`) rather
than trusting it.

### Claim 1 — the fold broke nothing that already released

- **Plan-gate-only check (2026-10-05):** a three-leg network/cloud program planned under 2.0.0 typed all three legs
  `leg type: change` — two `network-provisioning`, one `terraform-iac`. **No value leg was proposed**, which is correct:
  the specification contains no sentence saying any leg changes nothing. Node C was created on the neutral template,
  depending on the three legs only; the contract reached all three legs and Node C. The plan gate was then deliberately
  never released, and the run was closed as abandoned.
- **Controls 1 and 3** released. Control 1 is the shape whose replay three days earlier, on the previous text set, was
  not releasable.
- **Control 2** passed every check the fold could affect — roster, leg types, gate wiring, contract, Node C — and was
  refused on one leg for a reason that predates the fold (below). Its plan typed the fabric leg `change`, not `value`:
  that specification's topology says the fabric change *advertises the covering range in place of the individual
  routes* — a device change. That is the rule working, and it is why the value-leg control needed its own
  specification.
- **Stop line: 0 hits across all four reads.** The program's synthesis waited for every gate: on control 2 it started
  two seconds after the last gate release, while Node C and the producer had already run, as designed.

### Claim 2 — a value leg typed from the specification alone

- The architect typed the fabric leg `network-derivation` · `leg type: value`, quoting the specification's sentence
  verbatim, and typed the three consumers `change`. **This is the first value typing driven by a specification.** Under
  the retired variant, the value typing came from the variant's own harness-written brief; no specification before this
  one carried the sentence.
- The value leg ran Harvester → Derivation Architect → Derivation Reviewer, with **no Author and no change package**.
  Its card carries `legShape: value`; its reviewer approved with 0 blocking items.
- The value leg's Derivation Architect wrote its marker heading as `## ## Derived Values`, and the platform still parsed it — a
  tolerance like the verdict parser's for doubled headings.
- All four legs approved; Node C approved; `programReleasable: true`, MIN 87. **Every gate in this run — plan, value
  and three change-method gates — was released by the owner in the GUI**, and each release fired the cascade.
- The demo run repeated the value typing on the same specification: value leg approved 94, consumed by all three legs.

### Claim 3 — what it refuses, and the rate

**Every refusal was correct, each on a different leg, and each was a defect in the form of the Author's output, not in
the change it proposed.** In two of the three, the literal the reviewer wanted was already in the same package. In the
third (Kubernetes), the protocol never asked the Author to carry the decision; that has since been fixed in 1.15.0:

| run | leg | the one blocking item | why the refusal is right |
|---|---|---|---|
| control 2 | Kubernetes | no drift-handling disposition in the package — no config-repo baseline was supplied, and the protocol requires an explicit "not performed" | the reviewer reads only the package; the protocol told the *Architect* to decide drift but never told the *Author* to restate the decision. Fixed at source in `kubernetes-gitops` 1.15.0 — the Author now restates it |
| regression | Terraform | the rollback diff's hunk header says `@@ -1,26 +0,0 @@` but its body carries three lines, one of them the placeholder `... (full block as added above)` | that is not a patch anyone can apply; the lines it elided exist verbatim earlier in the same package |
| demo | observability | a post-apply validation step written as "Must contain / Must NOT contain" prose | the full post-change file is quoted verbatim in the same package, so the literal expected content was available to copy |

**The regression run also validated two text changes made the same morning.**
- `network-provisioning` 1.19.0 (reachability after route suppression): the fabric Author's package carried its own
  reachability checks — route-table checks that name the risk that a summary-only aggregate installs a discard route
  which wins best-path, with pass/fail criteria, plus an end-to-end ping in both directions. The reviewer judged the
  coverage complete and emitted no warning; the verdict parsed `approved`, `blocking: []`.
- `kubernetes-gitops` 1.15.0: the Kubernetes Author wrote a restated drift decision — *not performed: no config-repo
  baseline supplied* — and the leg was approved. That discharges control 2's sole blocker word for word.

**The rate.** Over every leg review in the four change-leg domains since 2026-09-28 (the latest verdict per review
task; 84 reviews), the **first-pass refusal rate is 26%**:

| domain | refused / reviews | refusal |
|---|---|---|
| network | 6 / 15 | 40% |
| observability | 7 / 21 | 33% |
| Terraform | 5 / 26 | 19% |
| Kubernetes | 4 / 22 | 18% |
| **all four** | **22 / 84** | **26%** |

A program releases only if every leg passes. For a four-leg program whose fabric leg is a **value leg** feeding three
consumers, the product of the consumers' first-pass approval rates is 0.81 × 0.82 × 0.67 ≈ 0.44, and about 0.42 with a
value leg that passes 95% of the time — **roughly 40–45% releasable per run**, in any leg order. The 95% is an
assumption, though all 11 value-leg reviews so far have approved. With a network **change** leg in the fabric's place,
the figure is about **26%** (0.60 × 0.44). Observed here: 3 of 6, made up of two-leg programs 2 of 2 and four-leg
programs 1 of 4. Over all 23 programs completed since 2026-09-28, of mixed shapes, 7 were releasable (30%). The
impression that "the first run works and later runs fail" is selection: a series stops when a run passes.

## Conclusion

**Verified live.**
- The promotion: value legs are part of `pov-program` 2.0.0, the released shapes still plan and gate as before, and the
  stop line was never hit.
- A value leg is typed from the specification alone and runs end to end with no Author.
- Three of the six runs released, each gate recomputing exactly from the persisted facts.
- Every refusal was correct, on a different leg each time, and each was an Author output-form defect, not a defect in
  the change proposed.

**Not verified.**
- **A steady releasable rate.** The measured per-leg refusal rate implies about 40–45% releasable per run for a
  four-leg program with a value leg, and about 26% with a network change leg in its place. We observed 3 of 6 (two-leg
  2 of 2, four-leg 1 of 4), and 7 of 23 (30%) across all programs of mixed shapes since 2026-09-28. Nothing here makes
  "it releases" true. "It can release, and when it refuses, the
  refusal names its fix" is the claim.
- **A fix for output-form defects.** Two of the three refusals were copy-only: the literal the reviewer wanted already
  existed in the same package. The current low-confidence reflection pass never fires on them: all three refused
  Authors in this round scored their own packages 85, and refused packages since 2026-10-01 self-scored 78–94. A deterministic pre-persist check is planned, not built.

## Enforcement

- Behaviour ships in the protocol versions under *Config*. The retired variant's name is kept permanently in the
  platform's program-protocol set, so a task bound to it fails loudly instead of running without its program
  mechanics.
- CI pins: `test:protocol-golden` (the protocol texts), `test:parse-verdict` (the terminal verdict grammar, including the
  doubled-heading tolerance), `test:program-protocol-token`, and `test:domain-carry-pins` (the reachability step, its
  non-blocking warning label and placement, and the drift restatement, mutation-tested).
  `test:protocol-dependence-anchors` also pins the texts but runs outside CI.
- **Residual — a provider credit outage surfaced as an unnamed error.** The demo run stopped at 07:03Z on 2026-10-06,
  when the model provider's account ran out of credit. Six executions failed between 07:01 and 07:04 UTC, each with the
  generic error code `unknown_error`; nothing alerted an operator, and the leg harnesses' automatic retriggers failed
  straight back into the same error. After the credit was topped up, the three leg reviewers were re-executed by the
  operator. The failed runs had produced no output, so these are first reviews, not re-rolls. Each leg harness then
  re-triggered by itself. A named billing error code and an alert are filed, not built.
- **Residual — Node C's evidence grading sometimes parses nothing.** The platform counts Node C's
  verified-against-evidence and accepted-from-claims lines. On the regression run it parsed **zero of either**
  (`graded: false`), although the review stated which checks it had passed. On control 2 it parsed one of each. The
  fact is recorded, unrendered and consumed by nothing, so it cannot move a gate. On control 2, Node C blocked on the
  Kubernetes leg's stamped refusal without being able to see the leg's reason, and it took the plan's leg types from
  its task directive rather than locating them in the plan.
- **Release remains a human decision.** `programReleasable: true` says that the record supports release; it releases
  nothing. The value-leg control's gates were released by the owner in the GUI. In the other runs an AI coordinator
  released the gates under the owner's delegation, with the owner as approver of record. A gate holding a refused leg
  was released only to close the record, and its leg's refusal stands.
- **Residual — one environment.** Every run harvested the same labs.
