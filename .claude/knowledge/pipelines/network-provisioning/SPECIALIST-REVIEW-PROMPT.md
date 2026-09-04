# Specialist-Review Launch Prompt — Network Provisioning Pipeline

> **How to use**: paste the block below into a fresh session. It runs the Protocol 2
> three-specialist review that gates the network-provisioning design out of Draft, then
> (if the review passes) hands to the build-phase actors. Self-contained — it points the
> specialists at the design docs and tells each to run discovery-first.

---

## Prompt (copy from here)

```
I need a Protocol 2 specialist review of a Pipeline Harness use-case design before we
build it: the **Network Provisioning Pipeline**. It is currently Status: Draft — no code,
no seeded protocol, no templates yet.

REQUIRED READING (read these first, in order):
1. .claude/knowledge/pipelines/network-provisioning/network-provisioning-pipeline.md
   — the design proposal (Objective, Design, Required Work R1–R7, Validation Plan, Decision Log)
2. .claude/knowledge/pipelines/network-provisioning/PIPELINE_PROVISIONING_PROTOCOL.draft.md
   — the candidate protocol prompt text
3. .claude/knowledge/pipelines/PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md
   — the methodology + the standing "harness = planner, not actuator" constraint
4. .claude/knowledge/discoveries/pipeline-harness-discovery.md
   — the shipped-harness invariants this design must not break

Run THREE specialists. Each MUST run its own discovery prompt FIRST (ground in current
code, not just these docs), then assess. Target ≥ 85% confidence (Protocol 2); below 75%
is a blocker.

1) sec-ops-specialist
   - R1 read-only MCP tool (`network_readonly_exec`): is an allowlist-of-`show*` +
     escalation-rejection (`conf t`/`enable`/`write`/chained `; conf t`) sufficient and
     enforceable? Pathological-input list first.
   - R2 credential boundary: scoping of read-only device creds, no secret in logs/throws
     (Phase 8.3), launch-authorization (who can run a pipeline that reaches real devices).
   - R7 audit trail + `securityEvent` coverage.
   - Blast-radius check on the cognition/actuation seam — is the apply-gate terminus a real
     boundary or bypassable?

2) boundary-contract-specialist
   - R1 tool schema/validation surface (does the MCP tool inherit the wrapWithSchema guard?).
   - R2 secret redaction at the tool boundary (output-time AND error-path).
   - The change-package data contract (P2 deliverable) — well-formed, no leakage.
   - The agent tool-surface fact (agentExecutionEngine.ts:477, six consolidated tools):
     does the draft protocol ask the agent to do anything outside that set?

3) architectural-review-specialist
   - The cognition/actuation seam + reactor re-entry argument: is keeping `conf t` out of
     the autonomous loop the right call, and is the apply-gate terminus sound?
   - The deliverable/QA-gate split (P2 producer via deliverableSourceTaskId, P3 reviewer via
     suppressDefaultReportMd) — does it match the shipped artifact-synthesis pattern?
   - Protocol 10 (fact vs verdict): is "validation = deterministic checks, not LLM verdict"
     correctly applied?
   - Does the design break any shipped-harness invariant (Guard 8, 4-point completion,
     two-path parity)?

(Optional 4th, recommended since the read-only tool is central: mcp-tool-architecture-specialist
on the `network_readonly_exec` schema + persistent-vs-ephemeral registration fork in R1.)

OUTPUT: create cline_docs/reviews/network-provisioning-design-<date>/ with each specialist's
findings, a confidence score per specialist, and a consolidated recommendation table mapping
every recommendation to folded-in / deferred-with-reason / rejected-with-reason. Update the
design doc's Decision Log + flip Required-Work items the review resolves.

IF the review clears ≥ 85% with no blocker, the build phase is:
  - template-system-specialist authors the four agents in scripts/seed-agent-templates.ts
    (Network State Harvester, Network Design Architect, Config & Change-Package Author,
    Change Reviewer) — only the Harvester gets the read-only tool.
  - the R1 read-only-tool spike (prove the allowlist holds).
Do NOT seed the protocol or templates until the review passes.
```

## (end prompt)

---

## Why this shape

- **Discovery-first** is explicit per the project's standing instruction (specialists
  grounded only in docs miss current code state).
- **Three specialists** match the security-change row of Protocol 2 (sec-ops +
  boundary-contract + architectural-review), with mcp-tool-architecture-specialist offered
  as the recommended 4th (the tool is the riskiest surface).
- The **recommendation-coverage table** is required so the long tail of findings isn't
  dropped behind the headline confidence number.
- Template authoring (template-system-specialist) is sequenced **after** a passing review —
  building the agents before the design is validated would be premature.
