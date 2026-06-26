# pAIchart — AI-Native Delivery Management + MCP Hub

pAIchart is an MCP hub for AI-native delivery management — POVs, tasks, and phases you drive in natural language — plus a registry of external MCP services you can discover, call, and orchestrate into multi-service workflows, and autonomous multi-specialist pipelines that turn an objective into a reviewed deliverable.

Anyone can self-register a service; agents and AI clients then reach all of them through a single Hub with trust-level authentication and per-user OAuth passthrough.

## What pAIchart Does

### Delivery management (the core)

- **POVs → Phases → Tasks** — run proof-of-value engagements as structured, AI-readable delivery plans
- **Natural-language operation** — ask "Which of my POVs are at risk?" or "show open tasks for BlackEye" — no UI required
- **AI agents on your work** — configure, assign, and execute agents against delivery tasks
- **Portfolio analytics** — health, insights, and execution metrics across your POVs

### MCP service hub

- **Free Service Registration** — Comprehensive guides available via `list_prompts()` or as MCP resources
- **Service Discovery** — AI agents find services by capability, not by name
- **Multi-Service Workflows** — Chain services sequentially, in parallel, or conditionally with variable passing
- **Per-User Authentication** — Each user's operations run as themselves via External OAuth (validated with Snowflake)
- **Trust Level System** — 6-tier security model controls token forwarding (INTERNAL → TRUSTED → OWNER → TEAM_MEMBER → SCOPED → ANONYMOUS)
- **JWKS Token Validation** — RS256 asymmetric cryptography, public-key verification, no shared secrets
- **Per-Service Audience Scoping** — Hub-minted access tokens carry a per-service audience (RFC 8707 resource indicators): each service receives a short-lived credential scoped to *only itself*, so a token leaked from one service can't be replayed against another. Services that validate it via JWKS can accept pAIchart-issued identity instead of static API keys in URLs.
- **Trustworthy Error-Recovery Signals** — When a service call fails, the Hub returns *facts* an AI client can act on — the honoured timeout, the service's recent success rate, and recovery guidance that never points at a blind health check — rather than unvalidated verdicts that can mislead. Built so the client recovers on its own; see the [Error Recovery Signals](tutorials/11-error-recovery-signals.md) case study.

### Autonomous pipelines (the Pipeline Harness)

Give pAIchart a one-line objective and it orchestrates a team of specialist agents into a reviewed, decision-grade deliverable — decompose into typed tasks, wire dependencies, chain each agent's full output to the next, quality-gate every step, synthesize the result. You provide direction; the agents provide labor.

- **Network Provisioning** — turn *"add a Loopback0 per switch and advertise it into BGP"* into an **approved-but-unapplied change package**: the pipeline self-provisions a read-only device service from a descriptor, harvests the device's real running state, designs the change, authors per-device config + validation + rollback, and an independent reviewer gates it. **It never actuates** — apply stays human-gated; device output is sanitized before any reasoner reads it and secrets are redacted from the artifact. → [example change report](examples/network-provisioning-change-report.md)
- **Artifact Synthesis** — turn source material (git history, execution logs, external MCP services) into a publishable deliverable (case study, post-mortem, quarterly recap) via a harvest → author → review pipeline.

Both run on the same harness — for the full how-to, see the in-product **`HOWTO-use-pipeline-harness`** guide (run `list_prompts()` in your AI client to find it).

## Get Started

pAIchart is a hosted MCP hub — nothing to install. Point your AI client at the endpoint, authenticate, and start asking in natural language.

- **Hub access**: `https://paichart.app/mcp`
- **Connect with**: Claude Desktop (GitHub OAuth) or ChatGPT (Microsoft OAuth)
- **First thing to say**: *"Help me get started with paichart"* — or run `list_prompts()` to see every guided workflow
- **Privacy**: [PRIVACY-DEMO.md](./PRIVACY-DEMO.md) — what a demo account holds, what it can do, 30-day auto-deletion

Once you're connected, try:

- *"Which of my POVs are at risk?"* — delivery analytics, answered directly
- *"Discover services"* — browse the registry by capability
- *"Run the prompt `energy_operations_optimizer`"* — correlates weather forecasts with energy data into operational recommendations, a multi-service workflow across two live services

## Under the Hood

Every request is either answered directly or composed into a workflow across services — and every external call runs as *you*, never as a shared platform account:

```
You (Claude Desktop / ChatGPT)
  → authenticate to the pAIchart Hub
  → ask in natural language, e.g.
      • "Which of my POVs are at risk?"            → project / analytics tools answer directly
      • "Texas energy mix + this week's weather"   → Hub composes a multi-service workflow
  → for external service calls:
      → Hub discovers services by capability, determines trust level, mints a per-service JWT
      → the external service validates it via JWKS — no shared API keys
  → operations execute as the authenticated user
```

## Live Services

| Service | Capability | Per-User Auth |
|---------|-----------|---------------|
| Snowflake | Data warehouse queries | ✅ External OAuth |
| EIA | U.S. energy data analytics | Service account |
| Weather | Real-time weather data | Service account |
| EODHD | Financial market data | Service account |
| Browser Automation | Web scraping, screenshots, PDFs | Service account |
| Notifications | Email, Slack, webhooks | Service account |
| Alpha Vantage | Financial data — 113 tools (equities, forex, crypto, indicators) | Service account |
| Token Validator | JWT/JWKS integration & trust-level debugging | ✅ Per-user JWT |

## Register Your MCP Service

Any MCP service can register with the Hub in one command:

```
registry(action: "register", {
  name: "my-service",
  description: "What your service does",
  endpoint: "https://my-service.com/mcp",
  category: "data-services"
})
```

Services that support External OAuth (like Snowflake, Databricks) get per-user authentication automatically.

## Learn

- **MCP Tool Excellence** — a 12-chapter tutorial series on building MCP tools AI clients can call without external documentation, extracted from pAIchart's own production audits: [tutorials/README.md](tutorials/README.md)

## Links

- **Platform**: [paichart.app](https://paichart.app)
- **JWKS**: `https://paichart.app/api/auth/jwks`
- **Documentation**: provided as an MCP resource (or run `list_prompts()`) in your AI client
- **Demo User Privacy**: [PRIVACY-DEMO.md](./PRIVACY-DEMO.md) — what a demo account holds, what it can do, 30-day auto-deletion

## Keywords

`mcp` `mcp-hub` `mcp-server` `mcp-orchestration` `model-context-protocol` `ai-native` `delivery-management` `proof-of-value` `pov` `task-management` `project-management` `ai-services` `service-discovery` `external-oauth` `jwks` `per-service-audience` `rfc8707` `per-user-authentication` `workflow-orchestration` `error-recovery` `mcp-tutorials` `claude-desktop` `chatgpt` `snowflake` `context7` `pipeline-harness` `autonomous-agents` `network-provisioning` `change-management`
