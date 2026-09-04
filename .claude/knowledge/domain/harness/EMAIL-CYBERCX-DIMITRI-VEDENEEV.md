# LinkedIn Outreach: Dimitri Vedeneev (CyberCX)

**Platform**: LinkedIn
**Target**: Dimitri Vedeneev — Executive Director, Secure AI Lead, CyberCX
**Approach**: Connection request with note → follow-up message once accepted

---

## Connection Request Note (300 char limit)

Hi Dimitri — your Secure AI blog series caught my attention, especially the 8 mitigation areas for AI risk. I built a multi-agent platform that addresses several of them architecturally. Fellow Sydney-sider, would love to share what we've built. Steve

**(296 characters)**

---

## Follow-Up Message (Once Connected)

Hi Dimitri,

Thanks for connecting. I've been following your Secure AI series — the shadow AI piece and the AI risk mitigation framework are particularly sharp. The framing of "uplift existing controls rather than build a new empire" resonates with how we approached our platform.

I'm the founder of pAIchart, a multi-agent orchestration platform built here in Sydney. It takes a one-line objective like "Assess security posture for APRA CPS 234 compliance" and autonomously delivers a multi-specialist pipeline result — architecture design, compliance audit, risk quantification, executive summary — in under 10 minutes, zero manual intervention.

Your 8 core AI risk mitigation areas from the February blog are what prompted me to reach out. Here's how our architecture maps to several of them:

**Prompt injection defense** — Every agent input goes through Zod schema validation with injection pattern detection (31 patterns). Agent outputs are structured artifacts, not raw prompts passed between agents.

**Human oversight** — Confidence-gated completion loop. Every specialist reports a score (0-100). Below 70, the system re-executes with specific diagnostic feedback. Below 50, it escalates to the human. The system knows when to push and when to ask for help.

**Identity & access management** — JWT/JWKS auth with RBAC, POV-scoped access (agents can only see data within their customer engagement), multi-tenant isolation.

**Logging & monitoring** — Full execution audit trail. Every agent action, tool call, artifact, and confidence score is logged. Auto-comments on every task with execution metadata and artifact fetch commands.

**Agentic AI credentials** — Each agent execution runs within the user's auth context. No shared service accounts. Token budget guards prevent cost runaway (1M tokens/hr, 10M/day).

We recently applied insights from Stanford's Meta-Harness paper and a UNC/Cisco paper (Omni-SimpleMem, which your colleague Charles Fleming co-authored) to our orchestration engine — hypothesis-driven re-execution, selective context access, and quality gating.

The platform is live at paichart.app with MCP integration for Claude Desktop, ChatGPT, and Gemini. Happy to walk you through it or give you access if any of this is relevant to the work CyberCX is doing with clients on secure AI adoption.

Cheers,
Steve

---

## Why This Works for Dimitri

1. **His own framework as the hook** — mapping our architecture to his 8 mitigation areas shows we read his work and it's relevant, not a generic pitch
2. **Australian connection** — fellow Sydney-sider, same regulatory landscape (APRA, ASD Essential Eight)
3. **Cisco paper tie-in** — mentioning Charles Fleming's co-authorship on Omni-SimpleMem creates a cross-reference ("your colleague's research influenced our platform")
4. **Not selling TO him** — positioning pAIchart as something his clients might benefit from, or that validates his framework in practice
5. **Specific, not vague** — concrete numbers (10 minutes, 31 injection patterns, 1M tokens/hr), not hand-wavy claims
