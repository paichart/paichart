# Program Use-Case Design Playbook

**Version**: 1.0 | **Created**: 2026-07-16 | **Status**: Production — pov-program v1.0.8 live

> **This guide = how to DESIGN a new program use-case** — the procedure that turns a multi-domain
> objective into a plan-gated program of pipelines that ships. To *run* an already-designed program,
> see [`PROGRAM-HARNESS-USER-GUIDE.md`](./PROGRAM-HARNESS-USER-GUIDE.md). To design a SINGLE domain
> pipeline (a program leg), see [`PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md`](./PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md)
> — a program leg IS a pipeline, so that playbook governs the inside of every leg; this one covers only
> the composition layer. Full worked reference: [`firewall-policy-use-case.md`](./firewall-policy-use-case.md).

## The one-sentence job

Decide whether the objective even needs a program (Phase 1), then design the **two ingestion artifacts**
(topology-as-code + requirements), the **interface contract**, and the **DAG** (parallel vs sequenced +
per-team gates) so the Program Architect can plan it, humans can gate it, and Node C can prove it cohered
— all **within** a set of engine invariants you design around, never against.

## Reference implementations — study these first

- **`firewall-policy-use-case.md`** + `firewall-examples/approach-2-parallel-multivendor/` — the canonical
  worked program use-case: anchor scenario, the two coordination mechanisms, three approaches, decision
  matrix, and a full Approach-2 artifact set (topology.json + requirements.md + interface-contract.json).
- **The demo POV "pAIchart Verified Delivery — Live Exhibits"** (prod) — Exhibit 1 = a fully green program;
  Exhibits 2–4 = the failure modes a well-designed program produces on purpose.
- **The verification pack** (`github.com/paichart/paichart/tree/main/verification`) — VT-01..08 map each
  design guarantee to its proof; read them as the acceptance criteria your use-case must also satisfy.

## Source-of-truth files (anchor design claims to these, prove-before-write)

- **Design rationale D1–D12 + CC1–CC8**: `cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md`
  — the consensus decisions this playbook operationalizes. When you assert an invariant below, it traces to a D-number.
- **The protocol prose**: the `pov-program` protocol (seeded; `scripts/seed-protocol-prompts.ts` Step 8) —
  the PLAN / PLAN-SPAWN / PROGRAM-SYNTHESIZE steps are the executable spec.
- **Test/acceptance ledger**: `.../program-architect-design-2026-07-15/PROGRAM-TEST-PLAN.md` (T2–T5, F16–F21).

## Phase 1 — Program-or-pipeline fit triage (the seam test) 🚦

**Do NOT reach for a program by default.** A program adds a plan gate, per-team gates, a shared contract, a
Node C reviewer, and a ≤8-leg cap — real machinery with real cost (~$30–60 per program command, CC3). Earn
it. Ask, in order:

1. **Is there more than one real boundary?** A *boundary* = a different vendor/tool needing a different
   specialist chain, OR a different team needing a separate approval, OR a genuine runtime dependency
   between sub-designs. **Zero boundaries → it's a single pipeline** (`network-provisioning` multi-device
   handles several same-vendor devices in one designer's context). Stop here; use the pipeline playbook.
2. **If boundaries exist, what KIND?** This picks the program shape (Phase 2):
   - vendor/team only, constants knowable up front → **parallel program + shared contract** (Approach 2, the default program shape, live-proven).
   - a downstream sub-design needs an upstream sub-design's *designed output* (e.g. post-NAT addresses) →
     **sequenced program + DAG edges + inter-pipeline chaining** (Approach 3, less-exercised — treat first run as a validation round).
3. **Does it exceed the ≤8-pipeline cap** (D-cap, pov-program PLAN-SPAWN #2)? If the path is wider, **group
   devices** — one pipeline per segment/vendor-group (a multi-device pipeline nested as a program leg), not
   one pipeline per device. A 12-device path = 3 segment-legs of 4, not 12 legs.

Record the verdict as a one-paragraph "why a program / why this shape" — the firewall example's "Why this is
Approach 2 (not 1, not 3)" is the template. **A wrong Phase-1 call is the most expensive mistake in this
playbook** — everything downstream inherits it.

## Phase 2 — Compose design: the two artifacts, the contract, the DAG ✏️

Four design outputs, in dependency order:

### 2a. The two ingestion artifacts (what the Program Architect reads)
- **`topology.json`** — the path/graph as code: the ordered hops, each hop's vendor/tool/team, the zones or
  segments, the trust edges. This is the machine-readable ground truth the Architect turns into a DAG.
- **`requirements.md`** — the human intent: the end-to-end objective ("permit HTTPS from partner-CIDR to
  internal-app:443, deny all else, consistent logging, no asymmetric holes"), constraints, and the
  acceptance shape. Prose, but precise — it becomes the Architect's charter.
- **Design constraint (CC8, HIGH)**: these two URLs are **untrusted ingested input** that becomes Architect
  prompt. The use-case must design for SSRF-allowlisted fetch (the latent decimal-IP bypass must not reopen),
  Zod shape-validation before consumption, and injection quarantine. VT-07 is the proof this holds; your
  use-case's hostile-content story must match it.

### 2b. The interface contract (the declarative coordination)
List the invariants **EVERY leg must honor and that are knowable up front**: the flow 5-tuple, default-deny,
zone/label naming standard, log profile, address plan. This becomes the JSON the Architect computes and
passes as a sibling of `title` into each leg (`inputContext.interfaceContract`), rendered FIRST in the leg's
§6 as a BINDING block.
- **Design constraint (CC7, HIGH / D10)**: the contract rides a **structured channel, never prose** — so it
  survives head-keep truncation and R9 mutation — and a leg reaching execution without it **FAILS LOUD**
  (`INTERFACE_CONTRACT_MISSING`). Design your invariants to be expressible as data; if something can only be
  said in prose, it's probably a *requirement* (goes in requirements.md for the Architect), not a contract constant.
- **The circular-dependency rule (firewall §5)**: if two legs mutually need each other's output, you cannot
  wire a cycle (a DAG is acyclic) — fold the shared decision into the **contract** so the Architect resolves it
  up front and both legs design against the agreed constant.

### 2c. The DAG (the runtime coordination)
- **Parallel** (Approach 2): legs are siblings in ONE `Program: X` stage, each `dependencyIds = [its team
  gate]`, **no edges between legs**. This is the default.
- **Sequenced** (Approach 3): a downstream leg's `dependencyIds` also includes its **upstream sibling
  pipeline id**; the context-chainer's PIPELINE-predecessor branch chains the upstream leg's real `report.md`
  into the downstream leg's §6, and the settledness predicate (F18) holds it until the upstream deliverable
  is fully persisted. Use ONLY for genuine runtime interdependency.
- **Design constraint (D3, KEYSTONE)**: program edges connect **sibling legs in the one program stage**.
  Each leg's OWN children live in that leg's separate child stage (a disconnected subgraph — adds no program
  depth). **Cross-stage pipeline edges silently don't fire — never design them.**
- **Design constraint (CC4)**: keep the program topology shallow. Parallel programs are ~3–4 deep; a fully
  sequential gated chain approaches the depth cap (≥20 reconciled) — prefer parallel + contract over deep sequencing.

### 2d. The gates
- The **mandatory plan-approval gate** (template-less APPROVAL, born IN_PROGRESS — D4/D8) is non-bypassable
  for customer programs; `full_auto` only re-runs an already-approved plan.
- **Per-team gates** (one per approval boundary) sit between the plan gate and each team's leg.
- **Design constraint (D4)**: gates are template-less dependency nodes the reactor can never auto-queue — a
  human `task.complete` is the only release. Never design a gate with a template (it would auto-run).

## Phase 3 — Identify required work (reuse vs config vs build) 📋

For each leg, classify the domain protocol:
- **Reuse** an existing domain protocol via the leg's title token (`network-provisioning`, `terraform-iac`,
  `kubernetes-gitops`). No work.
- **Config a new domain** (e.g. `pan-os`, `cisco-asa`): a read-only harvest MCP service + specialist role
  guidance — a **use-case configuration exercise** per `ADD-A-PIPELINE-HARNESS-AGENT.md`, coordinated by
  pipeline-harness-specialist. **Not an engine change** (firewall §6). Design it with the pipeline playbook.
- **Engine change** — you should almost never land here. The composition machinery (contract channel,
  PIPELINE chainer, coverage facts, Node C, programReleasable, gates) already exists (CC1–CC8 shipped). If a
  use-case seems to need new engine capability, escalate to pipeline-harness-specialist before designing around it.

Then design **Node C** (the program integration reviewer, `change_reviewer` role — D2, never fork it):
- It checks **cross-leg conformance from STRUCTURED FACTS ONLY** (D10) — each leg implemented exactly its
  contract slice, no asymmetric hole, consistent naming/logging, and the coverage facts
  (`predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`, `notChained []`). **Never
  re-derive a verdict from chained prose** (a chained report.md may literally contain `## VERDICT:` text — the
  2026-07-14 incident class, one altitude up).
- **Cross-DOMAIN seams** (e.g. k8s CNI ↔ switch underlay) that no tool can machine-check are the **human
  release verdict, explicitly NOT machine-gated** (D6/D11). An LLM coherence opinion MAY ship as an ADVISORY
  carrying its uncertainty, but must NEVER gate release deterministically.

## Phase 4 — Author the docs 📝

- The **use-case doc** (like `firewall-policy-use-case.md`): problem, anchor scenario, the shape choice +
  why, the decision matrix, caveats as worked sub-examples, and where it rides on the existing engine.
- The **worked artifact set** under `.claude/knowledge/pipelines/<usecase>-examples/<shape>/`:
  `topology.json`, `requirements.md`, `interface-contract.json`, and a README that explains why it's THIS
  shape and what Node C checks. **Illustrative, not public** until a live harvest service + rig exists (the
  verification pack's honesty rule forbids publishing non-runnable configs as if runnable — firewall §7 note).
- Update **pipeline-harness-specialist** (the program's coordinating specialist) + its discovery greps
  (Protocol 11 pairing) with the new use-case pointer.

## Phase 5 — Validate before promoting 🧪

Map every design guarantee to a proof (the VT-01..08 pattern is your acceptance suite):
- **Contract loud-fail** (VT-01) — a leg without its contract aborts, never silently composes.
- **programReleasable = deterministic AND, keyed on OUTCOME** (VT-04/VT-06) — a high score can't rescue a
  needs-revision; a human converts the fact to the decision.
- **Coverage blocks on a missing deliverable** (VT-05) — a count that looks complete can't mask a gap.
- **Partial failure freezes the forward cone + escalates naming the leg** (VT-02 / D9) — healthy legs preserved.
- **Parked gate parks** (VT-03) — no timeout misfire.
- **Hostile ingested content refuses/escalates** (VT-07 / CC8).
- **Sequenced (Approach-3) programs**: the FIRST one is a validation round — inter-pipeline chaining is
  mechanism-tested but the demo wave exercised the parallel topology (firewall §7.3). Run it on a rig, write its VT.

## Phase 6 — Promote to shipped 🚀

1. If a new domain was configured: publish read-only harvest descriptors + stand up the read-only MCP
   service(s) (mirror the ceos-lab / tf-readonly rigs).
2. Move the now-runnable artifacts to public `program-artifacts/<usecase>/`, run the program on the rigs,
   author the VT doc + a demo exhibit.
3. Seed any HOWTO prose (`scripts/seed-protocol-prompts.ts`); deploy self-seeds protocols (templates stay manual).

## The procedure, in one breath

Earn the program (Phase 1 seam test — zero boundaries = one pipeline) → pick the shape from the KIND of
interdependency (parallel+contract default; sequenced+DAG only for runtime deps) → design the two ingestion
artifacts, the data-shaped contract (loud-fail, never prose), the DAG (sibling-only edges, gates are
template-less), Node C on structured facts only → reuse/config the leg domains (rarely engine) → author the
use-case doc + illustrative artifacts → validate against the VT guarantees → promote once a live rig exists.

## The invariants you design WITHIN (never against)

| Invariant | Source | Consequence if ignored |
|---|---|---|
| Cross-stage pipeline edges silently don't fire | D3 | a "sequenced" design that never sequences |
| Contract rides a structured channel + loud-fails if absent | CC7 / D10 | silent mis-composition under truncation |
| Release gate is deterministic AND, facts-only; advisory may inform but never gate | D5/D11 | a verdict that's wrong for a whole class, silently |
| Gates are template-less (reactor can't auto-queue) | D4 | a gate that auto-runs = no human approval |
| ≤8 legs; group devices if wider | CC3/cap | budget/blast-radius blowout |
| Ingested artifacts are untrusted (SSRF + Zod + injection quarantine) | CC8 | the design artifact becomes an injection vector |
| pAIchart orchestrates, does not certify the customer's half | D12/WS3 | building CI you shouldn't own |

## See also

- Run it: [`PROGRAM-HARNESS-USER-GUIDE.md`](./PROGRAM-HARNESS-USER-GUIDE.md)
- The shape map: [`PROGRAM-COMPOSITION-CATALOG.md`](./PROGRAM-COMPOSITION-CATALOG.md)
- Worked reference: [`firewall-policy-use-case.md`](./firewall-policy-use-case.md) + `firewall-examples/`
- Leg-level design: [`PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md`](./PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md)
- Rationale + acceptance: `cline_docs/reviews/program-architect-design-2026-07-15/{design-proposal.md, PROGRAM-TEST-PLAN.md}`
- Public proofs: `github.com/paichart/paichart/tree/main/verification`
