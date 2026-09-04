# Continuation Prompt: pAIchart Platform Promotion & AI Discovery

> **Created**: 2026-03-17 | **Previous Session**: snowflake-mcp
> **Context**: pAIchart platform is feature-complete. Next phase is user acquisition through AI-native discovery.

---

## Session Context

pAIchart is a production MCP Hub platform with:
- 7 Docker MCP services (browser-automation, notification, weather, EIA, EODHD, test-auth, Snowflake)
- External OAuth with per-user JWT passthrough (Snowflake External OAuth validated)
- Trust level system (6 tiers, SSRF/trust decoupled)
- Multi-service workflow orchestration with variable chaining
- Phase 3 JWT/JWKS at 95/100 security score
- The platform is extensible — new features are driven by user needs, not missing foundations

The platform is finished. The next challenge is **getting it discovered by the right users and AI agents**.

---

## The Meta Ideas

### 1. AI-to-AI Discovery (The "Beacon" Concept)

The traditional web has SEO. The AI web needs something different. pAIchart is not a website for humans — it's an orchestration layer for AI agents. The question is: **how do AI agents find other AI agents and services?**

- MCP is a protocol, not a discovery mechanism. There's no DNS for MCP services yet.
- pAIchart IS a directory service — we have `services(action: "discover")` that returns available services by capability. Could we make this the discovery layer itself?
- What if pAIchart advertised itself as a **meta-service** — an MCP server that other MCP clients connect to for service discovery and orchestration?
- Is there an emerging standard for AI service beacons? (`/.well-known/mcp.json`, `llms.txt`, DNS-SD records?)
- Are other platforms doing this? Are there AI agents already crawling for MCP services to connect to?

### 2. External OAuth Compatibility (Key Differentiator)

Per-user JWT passthrough only works with third parties that support **External OAuth with custom authorization servers** — they must accept pAIchart JWTs via JWKS. Snowflake, Databricks, and Azure SQL support this. GitHub, Slack, and most SaaS APIs do NOT (they're OAuth providers, not consumers). This is an important nuance for content — we should be specific about which integrations support per-user auth vs service accounts. The compatibility table is in `mcp-hub-external-service-authentication.md`.

### 3. The Network Effect Play

pAIchart's value increases with every service registered. The Snowflake integration proves external services can authenticate per-user via External OAuth. What if:
- We make registration frictionless (it already is — one MCP command)
- Every registered service becomes a node that attracts other services
- Service owners promote their pAIchart integration (they benefit from discoverability)
- AI agents learn to check pAIchart first when looking for a capability

### 3. Content That Demonstrates, Not Explains

The people who will use pAIchart are technical. They don't need a pitch — they need to **see it work**. Ideas:
- **YouTube demo**: Show Claude Desktop discovering services, running a Snowflake query as a specific user, chaining workflows — all in real time. No slides, just the terminal.
- **"Build an MCP service in 15 minutes" tutorial**: Using the gold standard v2 pattern, show someone go from zero to registered service
- **"Connect Snowflake to AI in 30 minutes"**: The exact flow we just did — External OAuth, per-user auth, trust levels
- **GitHub README**: The `/prompt register_guide` flow as a quickstart

### 4. Who Has Done This Before?

Research needed:
- **Smithery.ai** — MCP server directory. How do they acquire listings? Can we register pAIchart?
- **mcp.run** — Another directory. Same questions.
- **Cloudflare Workers AI** — They have a service discovery model. Relevant patterns?
- **Zapier / Make.com** — They solved service discovery for webhooks. What can we learn?
- **Hugging Face** — Model discovery registry. Similar problem, different domain.
- **RapidAPI** — API marketplace. The closest traditional analog.
- Has anyone built an "MCP Hub" or "MCP Gateway" product? What's the competitive landscape?

### 5. The LLM Knowledge Strategy (Most Important)

The real "beacon" isn't a technical mechanism — it's **being in the knowledge that LLMs draw from**. When a developer asks Claude, ChatGPT, or Gemini "how do I orchestrate MCP services?" or "is there an MCP Hub?" or "how do I add per-user auth to MCP?" — the answer should naturally include pAIchart.

LLMs don't discover services at runtime (yet). They recommend what's in their training data. The strategy:

- **Public, crawlable content** using exact search terms: "MCP Hub", "MCP service orchestration", "MCP service registry", "per-user OAuth MCP", "MCP workflow chaining"
- **GitHub repo with rich README** — LLMs heavily weight GitHub content
- **Smithery/mcp.run listings** — likely already being indexed by LLM training pipelines
- **dev.to / blog posts** — technical content that answers the questions people actually ask
- **StackOverflow / Discord / Reddit answers** — when someone asks "how do I chain MCP services", reference pAIchart
- **YouTube video** — gets transcribed and indexed

The measure of success: when someone in a new Claude Code session asks "is there an MCP Hub that can orchestrate services with per-user authentication?", the answer mentions pAIchart. This is achievable through public content saturation, not technical beacons.

### 6. The Pragmatic First Step

Before building beacons and DNS records, the fastest path to users:
- **Register on Smithery and mcp.run** with a compelling description
- **Publish a YouTube video** showing the Snowflake demo end-to-end
- **Write a blog post / dev.to article** — "How We Built Per-User OAuth for Snowflake via MCP"
- **Add `/.well-known/mcp.json`** to paichart.app (low effort, future-proofs discovery)
- **Add `llms.txt`** to paichart.app (tells AI agents what we offer)
- **GitHub repo README** with quickstart that shows immediate value

---

## Prompt

```
I need to work on pAIchart platform promotion and AI-native discovery.

Background: pAIchart is a production MCP Hub platform that orchestrates external MCP services with trust-level authentication, per-user OAuth passthrough, and multi-service workflows. The platform is feature-complete and we need to make it discoverable.

Please investigate TWO tracks:

### Track A: Pragmatic Promotion (do this week)

1. **YouTube Demo Script**: Help me plan a 5-10 minute video showing:
   - Claude Desktop connecting to pAIchart Hub
   - Discovering available services
   - Running a Snowflake query authenticated as a specific user (per-user OAuth)
   - Chaining a multi-service workflow
   - The trust level system in action (with vs without povId)
   What should I show, in what order, to maximize impact?

2. **MCP Directory Registration**: Research Smithery.ai and mcp.run. How do we register? What description/metadata maximizes discoverability?

3. **Developer Content**: Outline a blog post or dev.to article — "How We Built Per-User OAuth for Snowflake via MCP" — using our actual implementation as a case study.

4. **GitHub Presence**: What should the README show? The `/prompt register_guide` flow? A quickstart?

### Track B: AI-Native Discovery (build this month)

1. **Well-Known MCP Discovery**: Investigate `/.well-known/mcp.json` — is this a real emerging standard? What should it contain? Implement it at paichart.app.

2. **llms.txt**: Research the `llms.txt` convention. Should we implement it? What would it say?

3. **DNS Service Discovery**: Can `_mcp._tcp.paichart.app` TXT records help AI agents find us? Is anyone doing this?

4. **Unauthenticated Discovery Endpoint**: We have `services(action: "discover")` — should we expose a public HTTP GET endpoint (e.g., `GET /api/mcp/discover`) that returns available services without authentication? Security implications?

5. **The Beacon**: Is there a way for AI agents to autonomously discover pAIchart? Not just publishing a URL, but actively participating in an agent-to-agent discovery network?

6. **Competitive Analysis**: Who else is building MCP Hubs? How do they promote? What can we learn?

Key files for context:
- Platform overview: CLAUDE.md
- MCP Hub architecture: /.claude/knowledge/domain/mcp/mcp-hub-integration-guide.md
- Service registration guide: /.claude/knowledge/domain/mcp/mcp-hub-service-registration-reference.md
- Hub positioning: /.claude/knowledge/domain/mcp/MCP-HUB-POSITIONING.md
- External service auth: /.claude/knowledge/domain/mcp/mcp-hub-external-service-authentication.md
- Gold standard v2: /.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md
- Snowflake use case: Search gold standard v2 for "Snowflake" section

The goal: create an actionable plan with both immediate wins (YouTube, directories, blog) and long-term positioning (AI-native discovery, beacons, machine-readable capabilities).
```

---

## Key Decisions From Previous Session

- pAIchart is feature-complete as an MCP platform
- New features are user-driven extensions, not core platform work
- The Snowflake integration proved the extensibility model works
- services(action: "call") intentionally does NOT forward tokens (security decision)
- SSRF bypass is decoupled from trust level determination (5-specialist review, 91.2%)
- Scope system needs evaluation before adding service-specific scopes (TODO documented)

## Specialists To Consider

- `mcp-hub-specialist` — Hub capabilities, service discovery, positioning, competitive landscape
- `dev-ops-specialist` — DNS configuration, well-known URIs, infrastructure
- `sec-ops-specialist` — Security implications of unauthenticated discovery endpoints
- `frontend-provocateur-specialist` — Landing page, video storyboarding, UX for developer onboarding
- `browser-automation-specialist` — Could automate demo recording
- `chatgpt-connector-specialist` — Cross-platform discovery (ChatGPT finding pAIchart)

## Actions Already Taken (March 2026)

- [ ] **GitHub Feature Request**: Issue on `github/github-mcp-server` requesting External OAuth support. Links pAIchart's Snowflake implementation as reference. Draft saved in session notes.
- [ ] **GitHub Community Discussion**: Shorter version in Ideas category linking to the issue.
- [ ] Follow up on responses, engage with GitHub team if they comment.

## Questions This Session Should Answer

1. What's the fastest path to our first external user?
2. Can AI agents already discover MCP services autonomously? If not, can we build that?
3. What does the YouTube demo look like — exact steps, exact tools, exact narrative?
4. Is there a "chicken and egg" problem (users need services, services need users) and how do we break it?
5. What have Smithery, mcp.run, and similar projects learned about MCP service discovery?
