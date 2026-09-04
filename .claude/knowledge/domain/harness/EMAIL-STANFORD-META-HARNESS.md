# Email Drafts: Outreach to Meta-Harness Authors

**To**: Yoonho Lee, Roshen Nair, Qizheng Zhang, Kangwook Lee, Omar Khattab, Chelsea Finn
**Paper**: "Meta-Harness: End-to-End Optimization of Model Harnesses" (arXiv:2603.28052v1, Mar 2026)
**Affiliations**: Stanford University, MIT, KRAFTON

---

## Option A: Practitioner-to-Researcher (Grounded, Results-First) — REFINED

**Tone**: Respectful peer sharing production results. Leads with what we built, connects to their concepts. No hype, no ask — just "here's what happened when we applied your ideas in production."

**Subject**: Production results applying Meta-Harness concepts to multi-agent pipeline orchestration

---

Hi Yoonho and team,

I read your Meta-Harness paper with great interest — and the project page walkthrough showing the TerminalBench-2 evolution from 28.5% to 46.5% on that 19-task subset is a compelling illustration of what filesystem-level diagnostic access makes possible. The 10M tokens of context per iteration vs. 26K for prior methods is a striking gap.

I'm the founder of pAIchart, a production platform that orchestrates typed specialist agents to deliver structured outcomes autonomously. We built what we call a Pipeline Harness — a meta-agent (also running on Claude, like your proposer) that decomposes objectives into dependency-wired task graphs of specialist agents (architects, reviewers, analysts, etc.), executes them, and quality-gates their output via confidence scores.

Your paper landed while we were actively iterating on our orchestration layer, and several of your findings directly influenced what we shipped to production this week.

**What we applied:**

*Selective context access* — Your finding that the proposer reads a median of 82 files per iteration but selectively (41% source, 40% traces, 6% scores) validated a design change we were debating. Our context chainer was injecting full predecessor output (sometimes 26K+ characters) into each agent's prompt. We shifted to token-efficient access patterns — the orchestrator now avoids pulling verbose results into its own context, and we're designing artifact-level selective retrieval for larger pipelines. Concrete result: our orchestrator went from exceeding a 500K token/hour budget to completing 3-task pipelines in 3.8 minutes well within a 1M budget.

*Hypothesis-driven re-execution* — Your Appendix A.2 case study — where the proposer isolated "both regressed... root cause: prompt template changes were confounded with structural bugfixes" — directly shaped our completion loop. When a specialist produces output scoring 50-69/100, our harness reads the artifact, diagnoses what's specifically weak (e.g., "the risk analysis lacks industry benchmarks"), and provides that targeted feedback on re-execution rather than blind retry.

*Interface validation* — Your pattern of validating harness interface compliance before evaluation informed our thinking about artifact structure validation — checking that a DOCUMENTER produces sectioned markdown, an ANALYST produces quantified findings, before accepting the output.

**What we haven't implemented yet (your paper gives us the roadmap):**

- *Pareto frontier discovery* — We track confidence scores per pipeline run but don't yet maintain non-dominated variants trading quality vs. cost. Your approach maps naturally to our use case: customers may want a fast 3-task assessment or a thorough 6-task deep dive.

- *Non-Markovian history across runs* — Your proposer references 20+ prior candidates per step. Our pipelines currently start fresh each time. We're designing cross-pipeline learning where execution metadata (which template type, what confidence, token cost, wall-clock time) feeds future orchestration decisions.

- *Causal isolation* — When a pipeline run produces lower confidence than a previous similar run, we don't yet systematically isolate which orchestration decision caused the regression. Your counterfactual diagnosis approach from execution traces is exactly what we need.

**Where our work extends yours:**

Your system optimizes the harness wrapping a single model. Ours orchestrates multiple specialist models, each with its own harness, introducing challenges your framework doesn't address:

- *Typed specialization* — 8 cognitive types (ARCHITECT, BUILDER, REVIEWER, ANALYST, etc.) with 16 specialist templates, each with distinct prompts and cognitive approaches
- *Dependency inference* — The orchestrator reads task descriptions and infers a dependency graph, including emergent parallel topology it wasn't explicitly told to create
- *Cross-agent knowledge transfer* — Full predecessor output is injected into successor prompts so each specialist builds on prior work without re-deriving it
- *Dual-mode orchestration* — CREATE mode (decompose from objective) and ORCHESTRATE mode (organize existing tasks), auto-detected based on pipeline state

**Production results (April 2026, 7 pipeline tests):**

- Task decomposition from single objective: ~30 seconds
- Template inference from task descriptions: 100% accuracy (10/10 across 3 orchestrate-mode tests)
- Full 3-task orchestrated pipeline: 3.8 minutes, zero manual intervention
- Full 6-task autonomous pipeline: 8.1 minutes, zero manual intervention
- Context chaining accuracy: 100%
- Confidence-gated completion with hypothesis-driven re-execution: production

Both projects converge on the same core insight — the hard problem isn't making smarter models, it's building the system that decides what information to present, what to do with the output, and whether the result is good enough. You're proving it for single-model harness optimization. We're proving it for multi-agent pipeline orchestration.

Happy to share more details or walk through the system if any of this is relevant to your research direction.

One practical ask, separable from everything above: I am preparing to submit a paper on the Pipeline Harness to arXiv (target categories `cs.MA`, cross-listed to `cs.AI` and `cs.SE`). As a first-time submitter to those categories, I need an endorsement from an existing author. If you would be willing to endorse the submission, I would be very grateful — I can send the draft PDF and the arxiv endorsement code ahead of time so you can review before endorsing. If this is not something you do for people you do not know personally, I completely understand; I mention it only because the research connection above is real and your name came up as the most natural endorser given the subject overlap. Declining the endorsement does not decline the conversation, and I would still welcome any thoughts you have on the ideas above.

Best,
Steve Terry
Founder, pAIchart
https://paichart.app

---

## Option B: Collaborative-Academic (Shorter, More Formal, Opens Door)

**Tone**: Concise and academic. Positions our work as a complementary production system that validates their theoretical findings. Explicitly invites collaboration.

**Subject**: Multi-agent orchestration system applying Meta-Harness principles — potential synergy

---

Dear Dr. Lee, Dr. Khattab, Professor Finn, and co-authors,

Your recent paper on Meta-Harness addresses a problem we've been solving from the production side: how to optimally present information to LLMs within an orchestration context.

We've built pAIchart, a production platform that orchestrates typed specialist agents (8 cognitive types across 16 templates) to autonomously deliver structured outcomes. Our Pipeline Harness decomposes high-level objectives into dependency-wired task graphs, assigns specialists, executes with confidence-gated quality loops, and chains context between agents — all without manual intervention.

Reading your paper, we identified strong alignment on three concepts:

1. **Selective history access over full-context injection** — Your finding that selective filesystem access outperforms compressed summaries (7.7 points better, 4x fewer tokens) directly influenced our context management. We're moving from full predecessor output injection toward artifact-level selective retrieval.

2. **Hypothesis-driven iteration over blind retry** — Your proposer's causal reasoning from execution traces (Appendix A.2) informed our completion loop design. When specialist confidence falls below threshold, our harness diagnoses the specific weakness before re-executing.

3. **Pareto-optimal trade-offs** — Your multi-objective approach (accuracy vs. context cost) maps naturally to our use case where pipeline speed/cost and output quality are explicit trade-offs.

Our system differs in that we use heterogeneous specialist agents (not a single proposer), which introduces coordination, knowledge transfer, and dependency management challenges your framework doesn't address — but your optimization insights apply to each agent-to-harness interaction within our pipeline.

We have production results across 7 pipeline tests showing 100% template inference accuracy, sub-4-minute orchestrated pipelines, and confidence-gated completion. If there's interest, I'd welcome a conversation about potential overlap — particularly around extending Meta-Harness concepts to multi-agent orchestration.

Best regards,
Steve Terry
Founder, pAIchart | https://paichart.app

---

## Option C: Builder-to-Builder (Informal, Enthusiastic, Vision-Forward)

**Tone**: Direct, founder energy. Leads with the vision parallel — "we're building the orchestration layer you're optimizing the harness for." More personal, less formal. Shows genuine excitement about where both projects could go.

**Subject**: We built the multi-agent orchestration layer your Meta-Harness paper optimizes for

---

Hi Yoonho,

Your Meta-Harness paper caught my attention because we've been building the layer above what you're optimizing — and hitting the exact same insights from the opposite direction.

You optimize the harness code wrapping a single model. We orchestrate multiple specialist models, each with its own harness, coordinating through typed dependency graphs with automatic context chaining.

Your paper's key insight — that the system deciding what information to present matters more than the model processing it — is something we've proven in production. Our Pipeline Harness takes a one-sentence objective like "Assess cloud migration readiness" and autonomously:

- Decomposes it into 5-6 typed specialist tasks (~30 seconds)
- Assigns the right cognitive approach to each (architect, reviewer, analyst, etc.)
- Wires a dependency graph (including emergent parallel topology — it figured that out itself)
- Executes each specialist, chains their output to the next, checks confidence
- Delivers a complete assessment in under 10 minutes, zero human intervention

Three things from your paper directly shaped what we shipped this week:

**Selective access works.** Your proposer reads 82 files but only pulls what's relevant. We were injecting 26,000-character predecessor outputs wholesale. Switching to selective access patterns cut our token budget in half while maintaining 100% context chaining accuracy.

**Hypothesis-driven retry beats blind retry.** Your Appendix A.2 case study — where the proposer isolated "prompt template changes were confounded with structural bugfixes" — is exactly what we implemented in our completion loop. When an analyst produces a 55/100 confidence report, our harness reads it, diagnoses "the ROI analysis lacks industry benchmarks," and re-executes with that specific feedback.

**The filesystem-as-middleware pattern scales.** Your proposer uses grep/cat on a filesystem of prior runs. We're designing the same thing — execution history as a searchable knowledge base that future pipelines can reference. You proved it works for single-model optimization. We think it works for multi-model orchestration too.

What we haven't cracked yet (and where your work gives us a roadmap):
- Pareto frontier across pipeline variants (fast/cheap vs thorough/expensive)
- Cross-pipeline meta-learning (the system getting better at orchestrating by observing its own history)
- Causal isolation when pipeline quality regresses

The thesis we share: the models will keep getting smarter, but the orchestration layer — the thing that decides WHAT to do, WHO should do it, and WHETHER the result is good enough — that's the hard part. You're proving it for single-model harnesses. We're proving it for multi-agent pipelines.

Would love to compare notes if you're interested. Happy to give you access to the platform or walk through the architecture.

Steve Terry
pAIchart | https://paichart.app

---

## Comparison

| Aspect | Option A | Option B | Option C |
|--------|----------|----------|----------|
| **Tone** | Respectful practitioner | Academic/formal | Founder enthusiasm |
| **Length** | Medium (~500 words) | Short (~300 words) | Long (~550 words) |
| **Lead** | Results table | Alignment on 3 concepts | Vision parallel |
| **Ask** | None (soft open) | Explicit collaboration invite | Access/demo offer |
| **Best for** | Credibility without overselling | If you want academic partnership | If you want to build a relationship |
| **Risk** | Could feel like a pitch | Could feel transactional | Could feel presumptuous |
| **Best recipient** | Yoonho (first author, likely did the work) | Chelsea Finn / Omar Khattab (senior authors) | Yoonho (peer energy) |

**My recommendation**: Option A sent to Yoonho (first author — he'll care most about someone applying his work). CC the team. It leads with concrete results, connects honestly to their paper, and doesn't overreach. The results table at the end is the hook — researchers love seeing their ideas validated in production.
