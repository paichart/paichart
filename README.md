# pAIchart — MCP Hub Platform

**AI Service Orchestration with Per-User Authentication**

pAIchart is a MCP service mesh where AI discovers MCP servers, composes & orchestrates multi-service workflows. Users can self-register services and connect agents or AI clients to any MCP service through a single Hub with trust-level authentication, per-user OAuth passthrough, and multi-service workflows.

## What pAIchart Does

- **Free Service Registration** — Comprehensive guides available via "/prompt list" or as MCP resources
- **Service Discovery** — AI agents find services by capability, not by name
- **Multi-Service Workflows** — Chain services sequentially, in parallel, or conditionally with variable passing
- **Per-User Authentication** — Each user's operations run as themselves via External OAuth (validated with Snowflake)
- **Trust Level System** — 6-tier security model controls token forwarding (INTERNAL → TRUSTED → OWNER → TEAM_MEMBER → SCOPED → ANONYMOUS)
- **JWKS Token Validation** — RS256 asymmetric cryptography, public key verification, 95/100 security score
- **Per-Service Audience Scoping** — Hub-minted access tokens carry a per-service audience (RFC 8707 resource indicators): each service receives a short-lived credential scoped to *only itself*, so a token leaked from one service can't be replayed against another. Services that validate it via JWKS can accept pAIchart-issued identity instead of static API keys in URLs.
- **Trustworthy Error-Recovery Signals** — When a service call fails, the Hub returns *facts* an AI client can act on — the honoured timeout, the service's recent success rate, and recovery guidance that never points at a blind health check — rather than unvalidated verdicts that can mislead. Built so the client recovers on its own; see the [Error Recovery Signals](tutorials/11-error-recovery-signals.md) case study.

## How It Works

```
User (Claude Desktop / ChatGPT)
  → Authenticates to pAIchart Hub
  → Discovers services by capability
  → Hub determines trust level, forwards JWT if authorized
  → External service validates JWT via JWKS
  → Operations execute as the authenticated user
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

- **MCP Tool Excellence** — an 11-chapter tutorial series on building MCP tools AI clients can call without external documentation, extracted from pAIchart's own production audits: [tutorials/README.md](tutorials/README.md)

## Links

- **Platform**: [paichart.app](https://paichart.app)
- **MCP Endpoint**: `https://paichart.app/mcp`
- **JWKS**: `https://paichart.app/api/auth/jwks`
- **Documentation**: Provided as a resource (or use /prompt list) in your AI Client
- **Demo User Privacy**: [PRIVACY-DEMO.md](./PRIVACY-DEMO.md) — what a demo account holds, what it can do, 30-day auto-deletion

## Keywords

`mcp` `mcp-hub` `mcp-server` `mcp-orchestration` `model-context-protocol` `ai-services` `service-discovery` `external-oauth` `jwks` `per-service-audience` `rfc8707` `per-user-authentication` `workflow-orchestration` `error-recovery` `mcp-tutorials` `claude-desktop` `chatgpt` `snowflake`
