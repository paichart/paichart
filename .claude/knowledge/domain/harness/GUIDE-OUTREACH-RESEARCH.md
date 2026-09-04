# Outreach Research Guide

**Purpose**: Step-by-step methodology for researching individuals before cold outreach
**Created**: 2026-04-05
**Proven on**: Yoonho Lee (Stanford), Omar Khattab (MIT), Charles Fleming (Cisco), Dimitri Vedeneev (CyberCX)

---

## Why Research Matters

Cold outreach fails when it's generic. Research transforms "I'd love to connect" into "Your 8 mitigation areas for AI risk map directly to our architecture." The recipient immediately sees you've done the work, and the message becomes a conversation starter rather than spam.

**Time investment**: 15-30 minutes per person
**Return**: 5-10x higher response rate vs generic outreach

---

## Phase 1: Find the Right Person

Before researching anyone, identify WHO to contact. The right person is someone whose specific work intersects with what you're building.

### Techniques

**From academic papers:**
- Read the author list and affiliations
- The **first author** usually did the most hands-on work
- The **last author** is often the senior advisor (harder to get a response, but higher leverage)
- **Industry affiliations** (e.g., Cisco, Google, KRAFTON) signal people bridging research and practice

**From company blogs:**
- Search `company.com/blog` for topics relevant to your product
- Blog authors with titles like "Lead," "Director," or "Head of" have domain authority AND are visible (they want to be found)
- Multiple posts by the same person = thought leader in that area

**From company leadership pages:**
- `company.com/about/leadership` or `company.com/team`
- Look for roles involving: AI, innovation, R&D, strategy, advisory, solutions architecture
- CSO/CTO are high-value but low-response; Directors and Leads are the sweet spot

---

## Phase 2: Find Contact Information

### Email — Academic Researchers

| Source | URL Pattern | Success Rate |
|--------|-------------|-------------|
| Personal website | `firstname.io`, `firstnamelastname.com` | High — academics almost always list email |
| Institution page | `cs.stanford.edu/people/firstname` | High |
| Paper itself | Check footnotes, correspondence section | Medium |
| Google Scholar | `scholar.google.com/citations?user=XXXXX` | Low (rarely has email) |

**Technique**: Search `"firstname lastname" site:university.edu` to find their faculty page.

**What worked for us:**
- `yoonholee.com` → found `yoonho@cs.stanford.edu` immediately
- `omarkhattab.com` → found `okhattab@mit.edu` immediately
- Academics WANT to be contactable. Their personal sites almost always have email.

### Email — Corporate Researchers

| Source | URL Pattern | Success Rate |
|--------|-------------|-------------|
| Company research page | `research.company.com/people` | Medium-High |
| Paper affiliations | Check footnotes for corporate email | Low |
| Hunter.io | `hunter.io/domain-search/company.com` | Medium (paywalled) |
| RocketReach | `rocketreach.co/company-email-format` | Medium (paywalled) |
| Google search | `"firstname lastname" "@company.com"` | Low |

**Technique**: Try `research.company.com` — corporate research labs often have public profiles with emails, even when the main company site doesn't.

**What worked for us:**
- `research.cisco.com/people` → found Charles Fleming's email (`chflemin@cisco.com`), role, PhD background, and research focus in one page

### When Email Isn't Findable — Use LinkedIn

Some companies (especially cybersecurity firms like CyberCX) deliberately don't publish staff emails.

**Signals that LinkedIn is the right channel:**
- No emails on the company website
- No personal academic page
- The person publishes thought leadership on LinkedIn (they're active there)
- They're in a commercial role (vs academic — academics prefer email)

**LinkedIn connection request**: 300 character limit. Must be specific enough to stand out.

---

## Phase 3: Build the Research Profile

For each person, gather this information before writing the outreach:

### Essential (Must Have)

| Info | Where to Find | Why It Matters |
|------|--------------|----------------|
| **Current role & title** | LinkedIn, company page, paper | Sets the tone (peer, senior, junior) |
| **Specific work relevant to you** | Papers, blog posts, talks | THE HOOK — reference their work, not yours |
| **Affiliation & location** | Paper, LinkedIn | Local connections are warmer |

### Valuable (If Available)

| Info | Where to Find | Why It Matters |
|------|--------------|----------------|
| **Other publications** | Google Scholar, DBLP, company blog | Shows breadth, finds more hooks |
| **Research focus areas** | Personal site "about" page, paper abstracts | Frame your pitch in their language |
| **PhD/academic background** | Personal site, LinkedIn | Academics respond to intellectual substance |
| **Conference talks** | YouTube, conference sites | Shows what they're currently evangelizing |
| **Team/lab they belong to** | Institution page, paper acknowledgments | Context for who they work with |

### Nice to Have

| Info | Where to Find | Why It Matters |
|------|--------------|----------------|
| **Twitter/X handle** | Personal site, paper | Alternative contact channel |
| **GitHub** | Personal site | Shows what they build, not just write |
| **Collaborators** | Paper co-authors, acknowledgments | Name-drop shared connections |
| **Funding sources** | Paper acknowledgments | Signals what they're incentivized to work on |

---

## Phase 4: Craft the Outreach

### Key Principles

1. **Lead with THEIR work, not yours** — "Your paper on X caught my attention" not "I built a platform called X"
2. **Be specific** — Reference a particular finding, blog post, or framework. Generic praise ("great work!") signals you didn't read it.
3. **Show what you applied** — Researchers and practitioners love seeing their ideas used. "Your PIVOT framework directly shaped our completion loop" is far more engaging than "we work in a similar area."
4. **Be honest about what you didn't implement** — Credibility comes from specificity, including acknowledging gaps. "We haven't implemented Pareto optimization yet" shows you understood it.
5. **Make the ask concrete and low-commitment** — "Does this approach hold up from a security standpoint?" is answerable. "Let's collaborate" is vague.
6. **Match the channel to the person** — Email for academics, LinkedIn for commercial, Twitter for public intellectuals.

### Email Structure (Academic/Researcher)

```
Paragraph 1: Reference their specific work (paper, finding, stat)
Paragraph 2: What you built (one paragraph, concrete)
Paragraph 3: What you applied from their work (specific, with results)
Paragraph 4: What you haven't implemented yet (honest, gives them a roadmap)
Paragraph 5: Where your work extends theirs (differentiation, not competition)
Paragraph 6: Results table or bullet points (numbers, not adjectives)
Paragraph 7: The parallel insight (why both projects matter)
Closing: Soft offer (access, demo, details — no hard ask)
```

### LinkedIn Connection Note (300 chars)

```
[Reference their work] + [What you built, one line] + [Local/shared connection] + [Soft ask]
```

Example: "Your Secure AI blog series caught my attention, especially the 8 mitigation areas. I built a multi-agent platform that addresses several architecturally. Fellow Sydney-sider, would love to share. Steve"

### LinkedIn Follow-Up Message

```
Thank for connecting + reference their specific work again
What you built (2-3 sentences)
Map your work to their framework/interests (the bulk — this is the hook)
Cross-references to other research you've applied
Concrete offer (demo, access, walkthrough)
```

---

## Useful Research URLs

### Academic
| Resource | URL | What It Gives You |
|----------|-----|------------------|
| arXiv | `arxiv.org/abs/PAPER_ID` | Paper + author list + affiliations |
| arXiv HTML | `arxiv.org/html/PAPER_ID` | Full readable paper (better than PDF for scraping) |
| Google Scholar | `scholar.google.com/citations?user=XXXXX` | Publication list, h-index, co-authors |
| DBLP | `dblp.org/search?q=NAME` | Complete publication history |
| Semantic Scholar | `semanticscholar.org/author/NAME` | Papers + citation graph + co-author network |
| Personal sites | `firstname.io`, `firstnamelastname.com` | Email, bio, current projects, talks |

### Corporate
| Resource | URL | What It Gives You |
|----------|-----|------------------|
| Company research lab | `research.company.com/people` | Researcher profiles with email + focus areas |
| Company blog | `company.com/blog` | Thought leaders, their topics, their language |
| Company leadership | `company.com/about/leadership` | Key decision makers |
| Hunter.io | `hunter.io/domain-search/company.com` | Email format pattern (freemium) |
| RocketReach | `rocketreach.co` | Email + phone lookup (paid) |

### Social/Professional
| Resource | URL | What It Gives You |
|----------|-----|------------------|
| LinkedIn | `linkedin.com/in/NAME` | Role, history, posts, connections |
| Twitter/X | `twitter.com/HANDLE` | What they're currently thinking about |
| GitHub | `github.com/USERNAME` | What they build (code > claims) |
| YouTube | Search "NAME conference talk" | What they evangelize publicly |

---

## Checklist Before Sending

- [ ] Referenced their SPECIFIC work (not generic praise)
- [ ] Included concrete results from your side (numbers, not adjectives)
- [ ] Honest about what you applied vs didn't
- [ ] Ask is concrete and low-commitment
- [ ] Tone matches the channel (formal for email, conversational for LinkedIn)
- [ ] No typos in their name, title, or paper reference
- [ ] Checked: is this person still at the company/institution listed?
- [ ] Saved the draft in version control (for follow-up context)

---

## Addendum: Australian arxiv Outreach — Research Prospects

**Added**: 2026-04-10
**Context**: Outreach targets for `WHITEPAPER-ARXIV-v3.md` (Pipeline Harness; cs.MA/cs.AI/cs.SE). Derived from arxiv top-100 submitter members list (info.arxiv.org/about/ourmembers.html) filtered to Australian organisations, then researched via the Phase 1-3 methodology above.

**Status**: Qinghua Lu contacted 2026-04-10 (first touch). Remaining prospects below, sequenced for follow-up if primary does not respond within 2 weeks, or as parallel threads where the angle differs enough to justify independent contact.

### Tier 1 — CSIRO Data61 (Sydney)

The Software & Computational Systems group publishes on LLM agent process models, agent design pattern catalogues, and evaluation-driven development of LLM agents. Direct intellectual overlap with the harness's §3 capabilities and §3.4 self-evaluation loop. Local timezone.

#### Professor Liming Zhu

- **Role**: Research Director, CSIRO's Data61 (whole digital/AI arm); leads Software & Computational Systems Program; Conjoint Professor UNSW
- **Relevant work**: Co-author with Qinghua Lu on "Evaluation-Driven Development and Operations of LLM Agents: A Process Model and Reference Architecture" (SSRN `5775317`); co-author of *Responsible AI: Best Practices for Creating Trustworthy AI Systems*
- **Email**: `liming.zhu@data61.csiro.au`
- **Site**: https://liming-zhu.org
- **Hook**: Same eval-driven LLM agent architecture paper as Qinghua — our production harness is an instance of the reference architecture they proposed, with execution traces and a head-to-head baseline that may serve as the empirical case study their paper lacks
- **Contact priority**: Escalation path only. Do not send in parallel with Qinghua — they work in the same group and she is the primary contact. Reach out via Liming only if Qinghua offers an introduction or after 3 weeks of silence.
- **Channel**: Email

#### Dr Zhenchang Xing

- **Role**: Senior Principal Research Scientist, CSIRO's Data61 + Australian National University; leads Software Engineering for AI team at Data61
- **Relevant work**: Co-author on the same LLM agent evaluation paper; co-author on "Rethinking Testing for LLM Applications: Characteristics, Challenges, and a Lightweight Interaction Protocol" (arXiv 2508.20737) — directly relevant to the harness's §3.4 confidence-gated self-evaluation loop
- **Email**: via `csiro.au` (verified on Google Scholar); check ANU faculty page for institutional address
- **Profile**: https://dblp.org/pid/52/6482.html
- **Hook**: The "Rethinking Testing for LLM Applications" framing matches our confidence parsing + retry band architecture. We have production data on how often the self-evaluation loop catches its own failures vs misses them — useful empirical grounding for the interaction protocol they proposed.
- **Contact priority**: Can send in parallel with Qinghua — different paper angle, same group but independent focus
- **Channel**: Email

### Tier 2 — Academic LLM-MAS-for-SE

Authors of the most-cited Australian paper on LLM-based multi-agent systems for software engineering. Direct overlap with §2 Related Work and §3 capabilities framing.

#### Christoph Treude

- **Role**: Honorary Principal Fellow, School of Computing & Information Systems, University of Melbourne; primary appointment Associate Professor, Singapore Management University
- **Relevant work**: Co-author of "LLM-Based Multi-Agent Systems for Software Engineering: Literature Review, Vision and the Road Ahead" (arXiv 2404.04834) — the canonical survey in this area. Two ACM SIGSOFT Distinguished Paper Awards. ARC DECRA 2018-2020.
- **Email**: `christoph.treude@unimelb.edu.au`
- **Office**: Melbourne Connect, 700 Swanston Street, Room 2322.01, Parkville VIC
- **Profile**: https://findanexpert.unimelb.edu.au/profile/893490-christoph-treude
- **Hook**: "Your survey enumerates the open challenges for LLM-based MAS in SE. We built one of the first production deployments addressing several of them — typed specialization, knowledge transfer via context chaining, self-evaluation — and would value your read on whether the §3.1 capability framing in our draft matches what you saw across the literature."
- **Caveat**: Primary affiliation is now Singapore — UMelb affiliation is formal but honorary. Still counts for arxiv Australian institutional context but endorsement-wise he may not have cs.MA privileges. Prioritise for intellectual engagement, not endorsement.
- **Contact priority**: Send 1 week after Qinghua (independent angle, no conflict)
- **Channel**: Email

#### Professor Aldeida Aleti

- **Role**: Professor, Department of Software Systems & Cybersecurity, Monash University
- **Relevant work**: Automated Software Engineering — "creating machines that write software, from requirements elicitation, to design, code generation, testing, and code repair"; applies AI and optimisation techniques to SE. Natural reviewer for the typed-specialist + confidence-gated retry loop.
- **Email**: `Aldeida.Aleti@monash.edu.au`
- **Site**: http://users.monash.edu.au/~aldeidaa/
- **ORCID**: 0000-0002-1716-690X
- **Hook**: "Your automated SE research programme treats the entire SDLC as a target for AI assistance. Our Pipeline Harness orchestrates typed specialists across a similar arc — design, implementation, review, documentation — as a running production system. We'd value your perspective on whether the orchestration layer changes the tradeoffs you've seen at the per-stage level."
- **Contact priority**: Send 2 weeks after Qinghua
- **Channel**: Email

### Tier 3 — Second wave (research before contacting)

Known-relevant institutions where individual targets still need Phase 1 research before they can be contacted.

#### Sydney Artificial Intelligence Centre — University of Sydney

- **URL**: https://www.sydney.edu.au/engineering/our-research/research-centres-and-institutes/sydney-artificial-intelligence-centre.html
- **Stated remit**: "Investigate autonomous agent actions" — directly relevant but too broad
- **Action required**: Identify specific faculty in the centre working on agent orchestration or LLM-based agents. Do not contact the centre generically.

#### University of Melbourne — School of Computing & Information Systems

- **Beyond Treude**: Likely 1-2 additional faculty working on LLM agents. Run a `findanexpert.unimelb.edu.au` search for "LLM agent", "multi-agent system", "agent orchestration" before the first wave runs out.

#### Monash University — Faculty of Information Technology

- **Beyond Aleti**: Worth a Phase 1 pass once Tier 1/2 yield engagement. Automated software engineering is the group focus.

### Outreach Sequencing Rules

1. **Primary sent**: Qinghua Lu (2026-04-10)
2. **+1 week (parallel, different angle)**: Zhenchang Xing — testing/self-evaluation paper angle
3. **+1 week**: Christoph Treude — survey co-author angle
4. **+2 weeks**: Aldeida Aleti — automated SE angle
5. **+3 weeks OR on Qinghua introduction**: Liming Zhu — escalation path only

**Parallel-send rule**: Only send in parallel when the intellectual hook is genuinely different. Two people in the same research group should not receive similar emails in the same week — it reads as a mailing list.

**Endorsement ask rule**: Never in the first email. Wait for a positive substantive reply, then ask in the follow-up. Qinghua Lu and Liming Zhu are the strongest endorsement candidates given cs.AI/cs.SE publication history.

### Open Research Threads (not yet acted on)

- [ ] Verify Zhenchang Xing's current email (csiro.au vs anu.edu.au)
- [ ] Identify 1-2 Sydney AI Centre faculty working on agent orchestration
- [ ] Run `findanexpert.unimelb.edu.au` search for additional UMelb LLM-agent faculty
- [ ] Check if QUT, UTS, or UWA have LLM-agent research groups (arxiv members but not yet researched)

### Sources

- arxiv members list: https://info.arxiv.org/about/ourmembers.html
- Qinghua Lu: https://people.csiro.au/L/Q/Qinghua-Lu
- Liming Zhu: https://liming-zhu.org
- Christoph Treude: https://findanexpert.unimelb.edu.au/profile/893490-christoph-treude
- Aldeida Aleti: https://research.monash.edu/en/persons/aldeida-aleti/
- Eval-driven LLM Agents paper: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5775317
- LLM-MAS for SE survey: https://arxiv.org/abs/2404.04834
