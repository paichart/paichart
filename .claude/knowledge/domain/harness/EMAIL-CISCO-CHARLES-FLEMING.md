# Email Draft: Charles Fleming (Cisco)

**To**: chflemin@cisco.com
**Subject**: Multi-agent security assessment pipelines — your Omni-SimpleMem + Stanford's Meta-Harness in production

**Context**: Charles Fleming is a Senior Researcher at Cisco Outshift R&D. PhD UCLA 2013. Focus: security/privacy, ML applications, adversarial ML. Co-authored Omni-SimpleMem (arxiv 2604.01007v2). His security focus aligns with pAIchart's compliance and security assessment pipelines.

---

Hi Charles,

I came across your Omni-SimpleMem paper while researching autonomous system optimization — specifically the PROCEED/ITERATE/PIVOT decision framework and the finding that bug fixes (+175%) outweigh hyperparameter tuning. Both insights resonated because we've been building a production system that faces exactly these challenges at the orchestration layer.

I'm the founder of pAIchart, an autonomous delivery platform that orchestrates typed specialist agents to produce structured outcomes — security assessments, compliance audits, architecture reviews — without manual intervention. A Sales Engineer types one sentence like "Assess cloud security posture for APRA CPS 234 compliance" and the system delivers a multi-specialist pipeline result in under 10 minutes.

Your security and ML background at Cisco is what prompted this email specifically. Our most common pipeline pattern is the **security assessment pipeline**:

```
ARCHITECT (Solution Architect) → Design security framework
    ↓ automatic context chaining
REVIEWER (Security Analyst) → Audit against compliance controls (CIS, APRA CPS 234, ASD Essential Eight)
    ↓
ANALYST (Business Analyst) → Quantify risk exposure and remediation ROI
    ↓
DOCUMENTER (Technical Writer) → Executive summary for CTO audience
```

Each specialist is a separate LLM execution with its own cognitive approach (typed templates — 8 types, 16 templates). The Pipeline Harness orchestrates them autonomously: decomposes the objective, assigns specialists, wires dependencies, executes in order, chains context between agents, and quality-gates output via confidence scores with hypothesis-driven re-execution.

**Two research papers directly influenced what we shipped this week:**

**Your paper (Omni-SimpleMem)** gave us two things:
1. The **PIVOT concept** — our completion loop currently re-executes or escalates when confidence is low, but it never changes approach. Your PROCEED/ITERATE/PIVOT framework showed us there's a third option: change the specialist type or reframe the task. This is on our roadmap.
2. The **full-text over summaries finding** (+53% F1) — we were about to replace full predecessor output injection with summarized manifests to save tokens. Your result stopped us. We're keeping full context injection for now and only switching to selective access when pipelines exceed 10 tasks.

**The Meta-Harness paper** (Stanford/MIT — Lee, Nair, Zhang, K. Lee, Khattab, Finn) gave us three things we shipped to production:
1. **Selective context access patterns** — their proposer navigates 10M tokens of diagnostic context selectively, reading only what's relevant. We applied this to our orchestrator's own token usage (not pulling verbose artifacts into orchestration context).
2. **Hypothesis-driven re-execution** — when a specialist produces low confidence, our harness reads the artifact and diagnoses specifically what's weak before re-executing with targeted feedback. Directly inspired by their Appendix A.2 causal reasoning.
3. **Interface validation** — checking artifact structure against expected format before accepting output.

**Production results (April 2026, 8 pipeline tests):**
- Full 3-task orchestrated pipeline: 3.8 minutes, zero manual intervention
- Full 6-task autonomous pipeline: 8.1 minutes, zero manual intervention
- Template inference from task descriptions: 100% accuracy (10/10)
- Confidence-gated completion with hypothesis-driven re-execution: production
- Dual mode: CREATE (decompose from objective) + ORCHESTRATE (organize existing tasks)

The platform is live at paichart.app with MCP integration for Claude Desktop, ChatGPT, and Gemini.

**Why I'm reaching out**: The intersection of autonomous agent orchestration and security/compliance assessment is where I think the most enterprise value sits — and it's squarely in your research area. Companies need security assessments that are thorough, compliant, and fast. Multi-agent pipelines with typed specialists (not one generalist model) can deliver that. I'd welcome your perspective on whether the approach holds up from a security research standpoint, and whether there's potential overlap with the work Outshift is doing.

Happy to give you access to the platform or walk through the architecture in more detail.

Best,
Steve Terry
Founder, pAIchart
https://paichart.app

---

## Why This Email Works for Charles Specifically

1. **Security angle**: His primary research is security/privacy with ML — our compliance pipelines (APRA CPS 234, ASD Essential Eight, CIS benchmarks) are directly relevant
2. **His paper + another paper**: Shows we're reading broadly and connecting research, not just cold-pitching
3. **Enterprise angle**: He's at Cisco Outshift (R&D for enterprise products) — pAIchart's POV delivery model is enterprise-native
4. **Specific ask**: "Does the approach hold up from a security research standpoint?" — gives him a concrete thing to respond to
5. **Not asking for a job or investment**: Asking for perspective, which is flattering and low-commitment
