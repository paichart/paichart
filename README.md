  # pAIchart — MCP Hub Platform

  **AI Service Orchestration with Per-User Authentication**

  pAIchart is a MCP service mesh where AI discovers MCP servers, composes & orchestrates multi-service workflows.
  Users can self-register services and connect agents or AI clients to any MCP service through a single Hub with
  trust-level authentication, per-user OAuth passthrough, and multi-service workflows.

  ## What pAIchart Does

  - **Free Service Registration** — Comprehensive guides available via "/prompt list" or as MCP resources
  - **Service Discovery** — AI agents find services by capability, not by name
  - **Multi-Service Workflows** — Chain services sequentially, in parallel, or conditionally with variable passing
  - **Per-User Authentication** — Each user's operations run as themselves via External OAuth (validated with
  Snowflake)
  - **Trust Level System** — 6-tier security model controls token forwarding (INTERNAL → TRUSTED → OWNER →
  TEAM_MEMBER → SCOPED → ANONYMOUS)
  - **JWKS Token Validation** — RS256 asymmetric cryptography, public key verification, 95/100 security score

  ## How It Works

  User (Claude Desktop / ChatGPT)
    → Authenticates to pAIchart Hub
    → Discovers services by capability
    → Hub determines trust level, forwards JWT if authorized
    → External service validates JWT via JWKS
    → Operations execute as the authenticated user

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

  registry(action: "register", {
    name: "my-service",
    description: "What your service does",
    endpoint: "https://my-service.com/mcp",
    category: "data-services"
  })

  Services that support External OAuth (like Snowflake, Databricks) get per-user authentication automatically.

  ## Links

  - **Platform**: [paichart.app](https://paichart.app)
  - **MCP Endpoint**: `https://paichart.app/mcp`
  - **JWKS**: `https://paichart.app/api/auth/jwks`
  - **Documentation**: Provided as a resource (or use /prompt list) in AI Clent

  ## Keywords

  `mcp` `mcp-hub` `mcp-server` `mcp-orchestration` `model-context-protocol` `ai-services` `service-discovery`
  `external-oauth` `jwks` `per-user-authentication` `workflow-orchestration` `claude-desktop` `chatgpt` `snowflake`

