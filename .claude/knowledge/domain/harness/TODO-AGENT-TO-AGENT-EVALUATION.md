# TODO: Agent-to-Agent POV Evaluation

**Status**: Vision
**Phase**: 8
**Created**: 2026-04-05
**Estimated Effort**: High (5+ sessions, requires external integration)
**Dependencies**: Phase 6 (POV as executable program), MCP server maturity, A2A protocol support

---

## Introduction

Phases 1-6 deliver POV outcomes to a human SE who presents to a human customer. Phase 8 changes WHO evaluates the deliverables: the customer's AI.

When the customer's evaluator is an AI — procurement AI checking compliance claims, security AI validating architecture assertions, due diligence AI reading audit reports — the trust model shifts from relationship-based to verification-based. The deliverable isn't a PDF to be persuaded by; it's structured data to be verified against.

This is the two-sided vision from the positioning document: pAIchart's agents produce, the customer's agents evaluate, and the feedback loop iterates across organizational boundaries.

## Objective

Enable a customer's AI (running in Claude Desktop, ChatGPT, or any MCP-compatible client) to:

1. **Connect** to pAIchart's MCP server with customer-scoped read access
2. **Read** structured deliverables from a POV (security assessments, architecture reviews, compliance audits)
3. **Evaluate** deliverables against the customer's own criteria (compliance schemas, security standards, procurement requirements)
4. **Provide feedback** that flows back into the pipeline as re-execution input
5. **Accept** deliverables when criteria are met, closing the evaluation loop

**End state**: A cross-organizational feedback loop between AI systems. pAIchart produces → customer AI evaluates → feedback flows back → pAIchart refines → customer AI accepts.

## How It Would Work

### The Producer Side (pAIchart)

Already built:
- MCP server exposes POV data, task results, and artifacts
- Structured artifacts (`result.json` with typed fields: findings, risk scores, confidence, recommendations)
- `report.md` as human-readable deliverable

Needs building:
- Machine-readable structured deliverables (beyond free-text reports)
- Evaluation-ready output format (claims + evidence pairs)
- Feedback ingestion endpoint (receive structured critique → route to appropriate task for re-execution)

### The Evaluator Side (Customer's AI)

The customer's AI connects to pAIchart via MCP and:

```
1. Read POV summary
   → fetch(id: "pov-xxx") → structured POV metadata

2. Read deliverables for a specific phase
   → fetch(id: "artifact-xxx") → security assessment with typed findings

3. Evaluate against criteria
   → Customer's AI compares findings against their compliance schema
   → Identifies gaps: "IAM section lacks detail on privileged access management"

4. Submit feedback
   → perform(action: "evaluation.submit", povId: "...",
       feedback: [
         { taskId: "...", finding: "IAM privileged access detail insufficient",
           severity: "HIGH", criteria: "APRA CPS 234 §32" }
       ])

5. pAIchart routes feedback to the relevant task
   → REVIEWER re-executes with specific feedback in inputContext
   → Produces refined output

6. Customer's AI re-evaluates
   → Accepts or provides further feedback

7. Loop until acceptance
   → Customer's AI marks deliverable as ACCEPTED
```

### Trust Model

| Aspect | Human Customer | AI Customer |
|--------|---------------|-------------|
| Trust built through | Relationship | Verifiability |
| Deliverables are | Documents (persuade) | Structured data (verify) |
| Evaluation method | Read and judge | Compare against schema |
| Feedback format | Email/call ("needs more detail on IAM") | Structured critique (taskId, finding, severity, criteria) |
| Interface | Web UI, PDF, presentation | MCP server, structured resources |
| Iteration speed | Days (meetings, email chains) | Minutes (automated loop) |

## Key Design Decisions

### Structured Deliverable Format

Current artifacts are free-text (`report.md`) and metadata-rich JSON (`result.json`). For machine evaluation, deliverables need a claims-and-evidence structure:

```json
{
  "deliverableType": "security_assessment",
  "claims": [
    {
      "id": "claim-1",
      "category": "access_management",
      "claim": "Role-based access control implemented across all API endpoints",
      "evidence": "189 endpoints audited, 186 enforce RBAC via validatePOVAccess middleware",
      "confidence": 92,
      "complianceFrameworks": ["APRA CPS 234 §32", "ASD Essential Eight"]
    }
  ],
  "gaps": [
    {
      "id": "gap-1",
      "category": "privileged_access",
      "finding": "No privileged access management (PAM) solution identified",
      "severity": "HIGH",
      "recommendation": "Implement PAM with session recording for admin accounts"
    }
  ]
}
```

This lets a customer's AI verify claims against evidence, check compliance coverage, and identify gaps — all programmatically.

### Feedback Ingestion

New MCP actions needed:
- `evaluation.submit` — Customer's AI submits structured feedback on a POV's deliverables
- `evaluation.status` — Check current evaluation state (pending, accepted, revision-needed)
- `evaluation.accept` — Customer's AI accepts the deliverable

Feedback flows into the pipeline as `inputContext` on the relevant task, triggering re-execution.

### Access Control

Customer's AI needs:
- **Read access** to their POV's deliverables (not other POVs)
- **Write access** limited to evaluation feedback (not task modification)
- **No access** to internal execution details (tool calls, prompt content, cost data)

This is a new access tier: `EVALUATOR` — read deliverables + submit feedback only. Scoped to a specific POV.

### Protocol: MCP vs A2A

**MCP** (current): Customer's AI connects as an MCP client. pAIchart exposes resources and tools. Works with Claude Desktop, ChatGPT, any MCP client.

**A2A** (Agent-to-Agent protocol, Google): Purpose-built for agent-to-agent communication. More structured than MCP for this use case. Still emerging (2025-2026).

**Recommendation**: Build on MCP first (we already have it). Add A2A as an alternative transport when the protocol matures. The application logic is the same regardless of transport.

## Implementation Procedure (High-Level)

### Step 1: Structured Deliverable Format
- Define claims-and-evidence schema for each deliverable type
- Extend artifact generation to produce structured output alongside free-text report
- This can be a post-processing step: after agent execution, parse findings into structured format

### Step 2: Evaluation MCP Actions
- `evaluation.submit` — receives structured feedback, routes to tasks
- `evaluation.status` — returns current evaluation state
- `evaluation.accept` — marks deliverable as accepted
- Add EVALUATOR access tier to auth system

### Step 3: Feedback-to-Re-execution Pipeline
- Feedback on a specific task → inject into task's inputContext
- Trigger re-execution with the feedback as additional context
- The specialist sees: "Customer feedback: IAM section lacks detail on privileged access management (APRA CPS 234 §32)"

### Step 4: Evaluation Loop
- Track iteration count per deliverable (prevent infinite loops)
- Maximum 3 evaluation rounds before human escalation
- Dashboard showing evaluation status per POV

### Step 5: Customer Onboarding
- How does a customer's AI connect? OAuth flow? API key? Shared POV link?
- Documentation for customer's AI configuration
- Example evaluation prompts for common AI clients

## Related Context

- **MCP server**: Already exposes POV data and artifacts to Claude Desktop, ChatGPT, Gemini
- **OAuth**: Production OAuth proxy supporting GitHub, Microsoft, Google auth
- **Positioning doc**: `PLATFORM-POSITIONING.md` — "The Two-Sided Vision" section describes this concept
- **Vision doc**: `VISION.md` — "Cross-organizational feedback loop" section
- **Confidence scores**: Already parsed and stored — foundation for claims-and-evidence

## Success Criteria

- [ ] Structured deliverable format defined and generating from at least one pipeline type
- [ ] `evaluation.submit` MCP action accepting structured feedback
- [ ] Feedback routed to correct task and triggering re-execution
- [ ] EVALUATOR access tier scoped to POV deliverables only
- [ ] End-to-end loop: produce → evaluate → feedback → refine → accept
- [ ] Works with at least one external AI client (Claude Desktop or ChatGPT)

## Why Nobody Else Has This

- **CrewAI/LangGraph/AutoGen**: No concept of external evaluation. Output goes to a human.
- **Vivun**: Tracks POV status but no AI evaluation of deliverables.
- **Devin/Factory.ai**: Output is code, not customer-facing deliverables. No evaluation loop.

A cross-organizational AI feedback loop — where the producer's agents and the customer's agents negotiate deliverable quality programmatically — doesn't exist anywhere. It's the most direct path from "AI tool" to "AI colleague."

## Risks

- **Chicken-and-egg**: Requires customers to have AI evaluators. Early adopters will be AI-forward enterprises.
- **Trust**: Will customers trust AI evaluation of security assessments? Likely only as a supplement to human review initially.
- **Complexity**: This is the most architecturally ambitious phase. Requires solid foundation from Phases 1-6.
- **Protocol maturity**: A2A is still emerging. MCP is more stable but designed for human-facing clients, not agent-to-agent.
- **Security**: Exposing deliverables to external AI clients requires careful access control. The EVALUATOR tier must be bulletproof.
