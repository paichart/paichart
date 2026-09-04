# Market Landscape — Agentic Multi-Domain Delivery (July 2026)

> **What this is**: banked deep-research output (2026-07-15) on the competitive landscape for the planned
> **design-artifact-driven, multi-domain autonomous delivery program** (`TODO-POV-EXECUTABLE-PROGRAM.md`
> "2026-07-14 reframe") — topology + requirements in, an engagement of QA-gated LLM-specialist pipelines out,
> spanning physical network / Terraform IaC / k8s GitOps, verdict-fact gates, human-gated apply, POV structure
> as the program representation.
> **Method**: 5-angle web sweep → 22 sources → 104 extracted claims → 3-vote adversarial verification of the
> top 25 → **25 confirmed, 0 refuted**. Time-sensitive: this space moves on a quarterly announcement cadence.

## Headline

**Every individual ingredient is commoditizing; the composition is unoccupied.** HITL gating primitives,
dry-run/diff change packages, digital-twin deterministic validation (now MCP-accessible), and vendor agentic
NetOps all shipped by mid-2026 — but **no surveyed system combines multi-domain scope + QA-gated LLM pipelines
+ engagement-structure program representation + strict never-auto-actuate posture**. Academic results directly
validate our core architectural bet (LLMs as translators inside verification-gated iterative workflows), and
industry survey data shows QA-gating discipline is still genuinely undersupplied.

## Verified findings (all 3-0 unless noted)

### 1. Cisco AgenticOps (Feb 2026) — nearest vendor threat, INVERSE trust posture
Closed-loop autonomous execution of day-to-day ops (telemetry→root-cause agentic investigations, MTTR-to-minutes
claims); human oversight = "control over outcomes" (pre-approved low-risk actions auto-execute; only higher-risk
changes hit an approval queue) — NOT mandatory gated apply. Does ship pre-execution risk-aware change validation
with blast-radius identification (a vendor analogue of our QA-gated assessment).
Source: cisco.com newsroom Feb 2026 + Network World/SDxCentral corroboration.

### 2. HITL gating is a commoditized primitive
LangGraph `interrupt()` (persist + wait indefinitely + `Command(resume=...)`; pause-before-critical-action
documented) and Temporal's AI Cookbook (Jan 2026: LLM-proposes/human-approves-via-Signal, gate holds
indefinitely at zero compute). **Don't market the pause; market the discipline around it.** (Caveat noted:
LangGraph resume re-executes the interrupted node — idempotency burden.)

### 3. Nokia EDA — closest product to "reviewable change packages, not actuation"
Every manifest → a transaction of calculated changes; optional dry-run previews exact per-resource before/after
diff with YANG validation; atomic multi-device change sets recorded in Git for audit/rollback. Single-domain,
not LLM-orchestrated, and dry-run is OPTIONAL (can also apply directly).

### 4. Forward Networks "Forward AI" (GA Apr 2026) — the validation leg, commoditized via MCP
Agentic AI on a mathematically-accurate digital twin, positioned HITL (2-1 vote — dissent from its closed-loop
partner ecosystem positioning, e.g. Itential), and **exposes verification via an open-source MCP server
(~54 tools)** — any external LLM pipeline can rent a deterministic validation gate. Implication for us:
in-house validation legs won't stay defensible; INTEGRATE them (a Forward/Batfish MCP call is a natural
Reviewer tool in our change-package pipelines) rather than compete with them.

### 5. Cornetto (ETH Zürich, arXiv 2604.22513, Apr 2026) — academic validation of the architecture
First at-scale functional benchmark for LLM network-config repair (231 scenarios, 20-754 nodes): 9 SOTA LLMs
restore ~60% of network state on average but the **best model fully resolves only 25% of scenarios**, degrading
with scale; headline conclusion = reliable LLM network automation requires **iterative workflows gated by formal
verification**. Its methodology mirrors our verdict-fact pattern: Batfish differential analysis as oracle, mined
predicates as specs, Fix Rate (efficacy) vs Regression Rate (safety) as verdict metrics. (Preprint; scope =
config repair — extension to full engagement architecture is extrapolation.)

### 6. Clarify (UCLA + Microsoft Research) — validates BOTH gates
LLM strictly as NL→config translator; placement/validation reserved for symbolic tools (Batfish searchFilters /
searchRoutePolicies / compareRoutePolicies); deterministic verifier + feedback loop. Key added insight:
**ambiguity of user intent — not just hallucination — is a fundamental limit**, requiring a human-in-the-loop
Disambiguator over differential examples. Validates the deterministic gate AND the human gate.

### 7. PSA/professional services — nothing does autonomous TECHNICAL engagement delivery
Rocketlane Nitro (leading agentic PSA): named agents for resourcing/financials/governance/docs; its
"Configuration Agent" VALIDATES customer inputs, doesn't generate configs; explicit human approval retained.
**The engagement-structure-as-program-representation for technical delivery has no direct competitor**
(scoped-negative claim, 2-1 — generalizes to the category only weakly).

### 8. QA-gating discipline is genuinely undersupplied (medium confidence — single vendor-adjacent survey)
LangChain State of Agent Engineering (1,340 respondents, Nov-Dec 2025): output quality is the #1 production
barrier (~33%); only **52.4% run offline evals**, 37.3% online — roughly half of agent teams operate without
systematic quality gates. (Skew would likely OVERSTATE eval adoption, strengthening the direction.)

### 9. Competitive synthesis (inference layer, medium confidence)
- **Differentiated**: (a) the multi-domain composition itself (physical + IaC + GitOps — no vendor crosses it);
  (b) structured verdict-fact gates as first-class pipeline artifacts (academia validates; only a benchmark
  implements); (c) never-auto-actuate as a design INVARIANT against the industry current toward pre-approved
  closed-loop; (d) POV/phase/stage program representation.
- **Commoditized**: HITL pause/resume; single-domain dry-run/diff packages; digital-twin/Batfish validation
  (MCP-accessible); single-domain agentic troubleshooting.
- **Nearest competitors**: Cisco AgenticOps (extending down from NetOps, opposite trust posture), Forward AI +
  partners (validation leg expanding toward orchestration), Nokia EDA (change-package model, single-domain).
- **Risks**: platform vendors bundling "good-enough" agentic delivery customers already own; validation legs
  becoming free table stakes.
- **Opportunities**: the trust gap is documented and real (25% full-resolution ceiling; ~half of teams lack
  eval gates) — auditable, human-gated, multi-domain delivery is a defensible wedge, especially for PS
  organizations that Rocketlane-class tools don't serve technically.

## Coverage gaps / open questions (carried verbatim from the run)

- Juniper (Apstra/Marvis), Itential, Selector AI, IP Fabric, CrewAI/AutoGen, OpenAI/Anthropic agent SDK
  maturity: **no claims about them survived verification** — the "no direct competitor" conclusion is bounded
  by what the verification pass covered.
- Does anything support hierarchical pipelines-of-pipelines as a FIRST-CLASS construct (vs custom atop
  LangGraph/Temporal)? (Our Phase-0 probe suggests we may already be ahead here.)
- How mature are the IaC/k8s analogues of the network validation leg (policy-as-code + plan-diff for
  Terraform, admission/dry-run for k8s) as LLM-pipeline gates — is the multi-domain gap in validation
  tooling or only in orchestration?
- How fast do MCP-exposed digital twins erode in-house validation defensibility?

## Actionable consequences for the program plan

1. **Lead positioning with the trust posture + the composition**, not the agent tech: "auditable, human-gated,
   multi-domain delivery" against Cisco's closed-loop current. Cornetto's 25% number is the citable
   why-you-want-gates statistic.
2. **Wire deterministic validation legs EARLY as Reviewer tools** (Batfish offline analysis; Forward's MCP twin
   where a customer runs it; `terraform validate`/OPA and kubeconform/OPA already in our protocols) — they're
   becoming table stakes, so consume them, don't rebuild them.
3. **The verdict-fact discipline is marketable** — it's what half the industry measurably lacks; our
   signal-design protocol + reviewerVerdict machinery is the productized version of what Cornetto proved
   necessary.
4. Watch quarterly: Cisco AgenticOps field maturity, Forward's orchestration creep, and the unanswered
   Juniper/Itential/Selector column.

## Provenance

Full run output (claims, votes, evidence quotes, all 22 sources with quality ratings): workflow run
`wf_15471bda-e00`, 2026-07-15, 104 agents. Key primary sources: Cisco newsroom (Feb 2026), LangGraph +
Temporal official docs, Nokia EDA 25.12 docs, Forward Networks press + forward-mcp GitHub, arXiv 2604.22513
(Cornetto) + 2507.12443 (Clarify), Rocketlane agentic-psa, LangChain State of Agent Engineering.

Cross-refs: `TODO-POV-EXECUTABLE-PROGRAM.md` (the plan) · `PLATFORM-POSITIONING.md` ·
`cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/` (the verdict-fact machinery) ·
memory `project_market_plan`.
