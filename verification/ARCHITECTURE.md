# Architecture — the invariants behind the verification pack

This document stays at the **invariant level**: behaviors guarded by regression pins or structural
server-side checks. Version-specific protocol behaviors live in the decision log at the bottom with
explicit version stamps, so drift is visible rather than silent — and since 2026-08-16 every stamped
version has a readable primary source: the protocol texts are published verbatim in
[`protocols/`](../protocols/), byte-parity-checked against the platform seed.

## Execution model (pipeline layer)

- **The orchestration state is the delivery plan itself**: every DAG node is a durable task record —
  status, dependencies, artifacts, history — not an in-process graph object. Runs survive restarts,
  every agent's step is an auditable work item, and an approval gate is a task transition over the
  same code path a human completion takes. Every invariant below is enforced against this database
  state, which is why none of them depends on an agent's cooperation.
- **Three-mode lifecycle**: a harness run resolves to CREATE (decompose, wire the DAG, exit),
  ORCHESTRATE (children in flight — exit and wait), or SYNTHESIZE (all children terminal — gate,
  aggregate, complete). The mode is resolved **server-side from database state** and injected into the
  agent's context — an agent degraded by budget exhaustion cannot mis-detect its own mode.
- **The harness never executes children.** Children start via dependency-completion events only. The
  first wave starts when created dependency-free; every later task starts when its last dependency
  settles.
- **Settled, not just completed**: a pipeline dependency counts as satisfied only when it is completed
  AND its final execution has persisted its deliverable — downstream consumers can never chain a
  stale pre-completion snapshot. (Verified live: consumer queued 84ms *after* the deliverable
  committed, versus 13.5s *before* it on the pre-fix build.)
- **Deliverable chaining is fact-carrying**: every upstream deliverable chained into a prompt carries
  per-predecessor facts — source artifact, truncation, sanitization, not-chained reasons — aggregated
  into a coverage block (`chainCapablePredecessors`, `degradedPredecessors`) that release gates
  consume deterministically.

## Program layer

- A program is a PIPELINE task whose children are pipelines, composed from one design artifact via a
  Program Architect that emits a plan + a binding **interface contract** (shared addressing/naming
  constants). The contract travels as a structured field — never as prose subject to truncation.
- A pipeline child without its contract **fails loudly at execution-creation time** — structurally
  (derived from the program topology), not from a settable flag. It cannot silently compose.
- **Human gates are dependency nodes**: template-less APPROVAL tasks the platform can never
  auto-queue. Everything downstream waits on human release; a parked gate parks its program
  indefinitely and is excluded — structurally, by event anchoring — from every failure-detection
  mechanism.
- **Release is a human verdict fed by machine facts**: `programReleasable` is a deterministic AND over
  child quality-gate outcomes, reviewer verdicts, and chained-coverage facts. It is an input to a
  human decision, never the decision.

## Safety and anti-fabrication stack

Every item below answers one question, and it is deliberately narrower than *"is the change correct?"* — no
system can promise that, and a reviewer's confidence that it has is itself a failure mode measured here
(item 8). The question is: **what entitles anyone to say it was checked?**

Each item names a specific way that entitlement can be false — a claim nobody verified, a fact computed and
then dropped before it reached the gate, a check that could not run and was read as a pass — and the
mechanism that closes it. Where the honest answer is "nothing entitles us", the design says so and escalates
rather than passing.

1. **Planning, not actuating**: side-effecting work stays outside the loop; deliverables are
   approved-but-unapplied changes.
2. **Bounded self-triggering**: reactor retrigger chains carry a per-harness generation budget.
3. **4-point completion invariant** (server-side): a pipeline cannot be reported complete unless its
   child stage exists, is non-empty, all children are terminal, and the stage's ownership back-pointer
   matches the completing task.
4. **Verdict reconciliation**: stamped quality outcomes are checked against the reviewer's own
   transcribed verdict; contradictions are annotated as facts, logged, and counted.
5. **Engine-computed facts over agent adherence**: where an agent could mis-report a derivable value
   (mode, program confidence, coverage), the platform computes and stamps the fact itself.
6. **Failure propagation**: a child that can never run is marked terminal with its reason, its
   downstream cone is marked with attribution, and the parent is retriggered to escalate — hangs are
   treated as defects, and every known hang class is anchored to a platform event, not a timer.
7. **Evidence-flow verification** (added after an adversarial round in which three successive LLM
   review tiers approved a defective derived value at rising confidence — because the evidence needed
   to catch it had been dropped upstream): any value an agent DERIVES from harvested customer state
   must carry its evidence forward — the harvest emits a structured allocations block, the design
   declares its derivations with their intended members, the package quotes the evidence verbatim with
   named provenance, and reviewers must grade every finding as verified-against-evidence or
   accepted-from-claims. Independently, the platform recomputes derivation containment
   **mechanically, anchored to the harvest artifact itself** — never the package's copy, which a
   follow-up round proved can be fabricated — and stamps the result as a structured fact
   (`derivationContainment`) in the run record. A mute or half-completed harness run is likewise
   terminalized with attribution rather than persisting as a silent success.

   *Extended 2026-08-02/04.* The containment engine dispatches on a declared `kind` (`cidr`, `asn`), and
   the honest half matters as much as the check: a value whose kind the engine does not implement is
   recorded as **not mechanically covered** and escalated to the integration reviewer — never counted as
   a passed one — with the outcome stamped as a structured disposition (`blocking` / `benign` /
   `needs-node-c`) carried alongside the fact. **Minimality** joined the mechanically-checked set after a
   later and worse round than the one above: a program self-certified `programReleasable: true` while
   shipping an authorization widening, and five tiers passed it, because minimality was asserted in
   exactly one place — a requirements clause — and a prose edit removed it. The published record is
   `tests/VT-12-false-pass-nonminimal-aggregate.md`. A green gate bounds what was **checked**, never what
   is **correct**; the response was to move the property into code rather than to add another reviewer.
8. **Facts-gated release — confidence numbers carry no gate authority** (added after a calibration
   study found two reviewers handed byte-identical defective inputs returned opposite verdicts at
   45 and 92 — the confidence number carries verdict *direction*, not correctness): every release
   and approval gate, at every tier, keys on verdict direction and mechanical facts only —
   child outcomes, reviewer verdicts, chained-coverage facts, derivation-containment facts —
   never on a confidence threshold. Confidence numbers are still recorded, as facts for humans and
   for calibration, but no `>= N` conjunct exists anywhere in the gate semantics. Companion
   contracts keep the inputs honest: an authoring agent may not self-verify or self-score its own
   package (removing the copyable wrong answer a reviewer might echo), and a reviewer must
   construct its verification itself before reading any package prose about verification. A
   pipeline that runs with no reviewer in its roster cannot borrow this machinery's credibility:
   its approval derives from mechanical trust facts alone and is stamped `reviewerPresent: false`
   — "ran clean, no QA gate", visibly distinct from a QA-vetted approval — and a roster that
   *should* have carried a reviewer (its protocol mandates one) is a defect, never a pass. And
   when a pipeline cannot run at all, bailing is a first-class contract: the agent stamps the
   machine-readable reason, the platform terminalizes it at persist time with transitive root
   attribution — the failure narrative traces to the first non-casualty, not the nearest victim.
9. **Caller-scoped tool authority**: every tool call an agent makes is authorized as the requesting
   user, through fail-closed gates below the agent — no user context, no call; no platform-account
   fallback. Item 7's adversarial rounds show hostile content being *refused*; this item bounds the
   worst case where it isn't: a fully compromised agent still cannot read or write beyond what the
   human who asked could. Prompt injection can degrade output quality; it cannot escalate authority.

## Decision log (version-stamped)

- `pov-program` v1.0.1 — approval gates are type APPROVAL and **born IN_PROGRESS** (a single human
  release call); an earlier draft used ACTION.
- `pov-program` v1.0.2 — one reference v1.0.1 missed was aligned to the APPROVAL wording here
  ("bonus catch" class: prose drift is treated as a defect). Also: PLAN-SPAWN creates any
  **requirements-named approval-gate nodes** from the
  Architect's DAG: template-less APPROVAL, born IN_PROGRESS, assignee set to the plan's named
  approver, wired with the DAG's edges. The plan gate remains the mandatory floor. The Architect emits
  gate nodes **only when requirements name per-domain/per-team approvers** — it is explicitly
  forbidden from inventing gates — and the plan's DAG section lists each gate with what it approves,
  who approves, and its edges.
- `pov-program` v1.0.4–v1.0.5 — contract-nesting hardening (structural loud-fail independent of any
  flag); plan retrieval corrected to full-artifact fetch (pointers vs bodies).
- `pov-program` v1.0.6 — escalation distinguishes the ROOT failing leg from downstream casualties
  (`blockedByUpstreamFailure`).
- `pov-program` v1.0.7 — release gate consumes the coverage FACTS (`chainCapablePredecessors`,
  `degradedPredecessors`) instead of a raw predecessor count that could false-block on gates and
  false-pass on missing deliverables.
- `pov-program` v1.0.8 — truncation-hygiene prose only (additive; the release/escalation semantics above
  are unchanged): the program's synthesis reaches its completion promptly and keeps its final summary
  lean, so the platform's terminal turn is unlikely to hit the output-token ceiling before completing.
- `network-provisioning` v1.2.0 / `pov-program` v1.0.9 — the evidence-flow contract (see safety
  stack item 7): structured harvest-allocations and derived-values blocks, verbatim provenance-quoted
  evidence in the change package (mandatory when derivations exist, forbidden otherwise — an
  over-applied evidence section proved to invite invention), reviewer finding-grading
  (verified-against-evidence vs accepted-from-claims), the harvest as the authority wherever the
  package's copy disagrees, and the integration reviewer retrieving the legs' structured facts by
  tool rather than expecting them in chained prose. (Platform notes, same round: the per-call
  connected-service timeout is now genuinely bound at the SDK boundary — the advertised ceiling and
  the enforced ceiling are the same number, regression-pinned; the stale-run sweep is two-tier and
  derived from the execution envelope so a legitimately long run can never be swept mid-flight; and a
  harness run that produces no output and no child-stage handoff is terminalized with attribution
  instead of hanging as a silent success.)
- `pipeline-orchestrator` v3.9.0 — duplicate-halt stamps a structured fact; program legs with settled
  terminal outcomes (escalated / duplicate-halted) are terminalized by the platform at persist time so
  programs block on outcomes instead of hanging on open legs. (Platform note: a synthesis turn that
  truncates at the output-token ceiling is now auto-recovered — retried with headroom, and the residual
  escalated rather than hung — so a truncation never silently blocks a program.)
- `pipeline-orchestrator` v3.9.1 / `pov-program` v1.0.12 — the bail contract: an agent whose pipeline
  can never run as configured stamps the machine-readable reason instead of guessing or fabricating;
  the platform terminalizes it at persist time, marks its downstream cone, and the program's
  escalation follows the failure **transitively to the first non-casualty** — a bailed leg is itself
  a casualty of the leg that escalated, and the narrative names the root, not the nearest victim.
- `network-provisioning` v1.2.1–v1.2.2 / `kubernetes-gitops` & `terraform-iac` v1.0.3 /
  `pov-program` v1.0.10 / `pipeline-orchestrator` (same sweep) — confidence numbers OUT of gate
  semantics at every tier (see safety stack item 8): gates key on verdict direction + mechanical
  facts (including a new derivation-containment conjunct at the program release gate); scores remain
  recorded facts. Same round: anti-theater authoring contracts — the change-package author carries
  ONLY the structured evidence blocks verbatim (never the design's own containment conclusion — a
  plausible verification narrative in a package is a copyable wrong answer), and the reviewer
  constructs its containment check itself, emitted before reading any package verification prose.
- `pov-program` v1.0.13 — superseding a persisted child is a state-channel act: the harness stamps
  the machine-readable disposal reason and the platform terminalizes the child; disposal by retitling
  or comment is forbidden (nothing consumes it — an inert row would block the program's
  all-children-terminal check indefinitely), and disposal must precede any dependent wiring.
- `pipeline-orchestrator` v3.9.2 — a pipeline whose roster carries no reviewer gains a **defined**
  approval rule (see safety stack item 8): mechanical trust facts only, provenance-stamped
  `reviewerPresent: false`, with a roster-defect rule (a protocol that mandates a reviewer arriving
  without one is `needs-revision`, never a clean pass) and a misroute guard (a domain pipeline that
  lost its protocol token cannot clean-completion-approve past its mandated QA gate).
- `terraform-iac` v1.2.0 / `kubernetes-gitops` v1.2.0 / `network-provisioning` v1.3.1 — the
  cross-port batch (2026-08-16, three-specialist panel; one of five candidate ports rejected and one
  deferred precisely because their prose would have been undischargeable or counterfactual).
  Terraform gains the full producing-side derivation-evidence contract — the structured blocks the
  mechanical tier anchors to are now a **cross-domain contract**, no longer a network-only marker —
  with a Terraform-honest pool boundary stated in the contract itself (the harvested pool is
  state-file-scoped; absence from state is not absence in the cloud, so a clean containment result
  is a floor over the harvested pool, never proof the cloud is clear). Kubernetes gains a
  **baseline-scoped** drift clause: HALT on out-of-scope drift *if and only if* the config repo's
  desired state was supplied — and where it was not, the package must say drift was **not
  determinable** rather than imply it was checked (a confident "no drift detected" from a one-sided
  read is the exact confident-wrong-signal failure item 8 exists to prevent). Network gains a
  secret-hygiene clause (carry redaction placeholders forward verbatim; never reconstruct a
  plausible credential — a fabricated secret in a rollback config is worse than a visibly incomplete
  one). **Platform half, shipped first**: the disposition arithmetic was reclassified before the
  contract extended — a harvested pool with nothing derived now **escalates rather than asserts
  refusal** (the ambiguity between an audit-shaped objective and a real refusal is not the leg's to
  decide), an **empty** parsed pool classifies benign with its own reason (no pool, no refusal
  ambiguity), and a consuming leg with green upstream containment is discharged rather than blocked.
  Verified live the same day: VT-15 — the ported contract bound on its first exposure, and the exact
  green run that the two-week-earlier code would have false-blocked as a "refusal" passed with the
  honest classification stamped.
- `pipeline-orchestrator` v3.11.0 / `network-provisioning` v1.3.2 / `kubernetes-gitops` v1.2.1 /
  `terraform-iac` v1.2.1 / `pov-program` v1.1.0 / `artifact-synthesis` v1.4.1 — the **composed
  injection** batch (2026-08-17, four-specialist panel + independent adversarial review; nine flip
  blockers cleared before the switch). The platform now composes each agent's prompt as **base +
  the one protocol its task is bound to** — the binding is a platform stamp resolved once from the
  task title's `(protocol: <name>)` token at first execution, never a model-side selection.
  Consequences carried into the texts: the base's protocol-routing prose is **deleted** (replaced
  by a state-neutral binding section — an agent reads its binding from a platform-injected
  `Protocol binding:` line); every domain fence's "fall back to the default orchestrator" is
  replaced by **escalate-on-mismatch** (`metadata.cannotRun` + stop — a wrong binding is surfaced,
  never absorbed); the base's Step-5 confidence aggregation is **named** ("the standard rule"), so
  the three infra protocols' references to it resolve — and every delta→base textual dependence is
  now a machine-checked anchor pair, bidirectionally count-pinned so a new unpaired reference fails
  a test rather than dangling. A stamped protocol whose row is not live **hard-fails a program
  harness by name** (the base carries no program-composition mechanics, so a silent base-only run
  would fabricate a one-child "program") and degrades a leg harness to base-only with a recorded
  degradation fact.
