# pAIchart — Intent-Driven, Human-Gated Change Synthesis

Across network, cloud, and Kubernetes — on an open MCP hub, tracked as structured delivery. Give pAIchart a one-line objective and it synthesizes a reviewed, **approved change package your team applies idempotently** — out-of-band, with a rollback. pAIchart designs and reviews the change; it never applies it.

State the intent in plain language; pAIchart's delivery engine harvests your live systems, designs the change, authors the per-vendor config + validation + rollback, and an independent reviewer gates it. What comes back is a change you *approve* — you don't author it, and nothing is applied until a human says so. The expertise a multi-vendor change used to demand shifts from **authoring across every system** to **approving one reviewed result**.

Three layers make that work, and they're one product, not three:

- **The engine** — synthesizes the change from intent (the Pipeline Harness, below).
- **The MCP Hub** — how the engine reaches your live systems *safely*: every harvest is a Hub call, authenticated per-service with no shared secrets. It's also an open registry anyone can self-register a service with, and orchestrate.
- **Delivery management (POVs → Phases → Tasks)** — where the objectives, tasks, artifacts, and change packages are organized, analyzed, and governed.

Agents and AI clients reach all of it through a single Hub with trust-level authentication and per-user OAuth passthrough.

## What pAIchart Does

### Change synthesis from intent — the delivery engine

Give pAIchart a one-line objective and it orchestrates a team of specialist agents into a reviewed, decision-grade change — decompose into typed tasks, wire dependencies, chain each agent's full output to the next, quality-gate every step, synthesize the result. You provide direction; the agents provide labor.

A single **pipeline** handles one domain. A **program** is a pipeline of pipelines — how one intent spans *multiple* domains and hands a real value from one to the next. The flagship shape is a **sequenced, cross-domain program**: e.g. *"the switches export from new dedicated addresses; the cloud archive bucket authorises exactly the range covering them"* runs the network pipeline first, then feeds its **actual derived address range** into a cloud-IaC pipeline — the policy authorises exactly what the network design produced, with no human reconciling the two by hand. One intent, configuration in several vendors' languages, none of it hand-written.

Every run ends the same way: a reviewed change package you approve, then apply on your own terms. pAIchart never applies it for you — device/cluster/state access is read-only, output is sanitized before any reasoner reads it, secrets are redacted from the artifact, and *apply* stays a separate, human-gated step.

- **Network Provisioning** — turn *"add a Loopback0 per switch and advertise it into BGP"* into an **approved change package the provisioning team applies idempotently**: the pipeline self-provisions a read-only device service from a descriptor, harvests the device's real running state, designs the change, authors per-device config + validation + rollback, and an independent reviewer gates it. → [example change report](examples/network-provisioning-change-report.md)
- **Kubernetes / GitOps** — turn *"add an HPA and resource requests/limits to the orders-api Deployment"* into a **declarative GitOps change package** (a kustomize overlay) from live cluster state, with offline validation (`kubeconform` / `kustomize build` / OPA — never `kubectl diff`) and rollback. Read-only + RBAC-scoped; secret *names* surface, values never leave the cluster. Apply is a GitOps-reconcile / human-gated step. → [example change report](examples/kubernetes-gitops-change-report.md) *(includes an earned **NEEDS-REVISION** — the reviewer refusing to approve what it couldn't verify)*
- **Terraform / Cloud IaC** — turn *"add versioning and a public-access-block to the acme-app-logs S3 bucket"* into an **approved HCL change package (a PR) the team applies** from real Terraform state (a scoped `state pull` — no providers launched, no state lock), with `terraform validate` / `plan` / `tflint` / OPA expected-facts and rollback. Apply is the team's governed `terraform apply`. → [example change report](examples/terraform-iac-change-report.md) *(shows the layered defense: a secret-shaped tag **redacted**, a prompt-injection tag **refused**)*
- **Artifact Synthesis** — turn source material (git history, execution logs, a POV's own delivery history, external MCP services) into a publishable deliverable (case study, post-mortem, quarterly recap) via a harvest → author → review pipeline. → [example case study](examples/artifact-synthesis-case-study.md)

Every kind runs on the same harness — for the full how-to, see the in-product **`HOWTO-use-pipeline-harness`** guide (run `list_prompts()` in your AI client to find it). For a narrative walkthrough of a real cross-domain program and how its correctness is machine-checked, see the [coordinated-infrastructure-change case study](case-studies/coordinated-infra-change.md).

### Reaching your live systems safely — the MCP service hub

The engine's harvest step is a Hub call, and the same machinery is open to anyone: register a service, discover it by capability, and orchestrate it — with per-user identity and no shared API keys in URLs.

- **Free Service Registration** — Comprehensive guides available via `list_prompts()` or as MCP resources
- **Service Discovery** — AI agents find services by capability, not by name
- **Multi-Service Workflows** — Chain services sequentially, in parallel, or conditionally with variable passing
- **Per-User Authentication** — Each user's operations run as themselves via External OAuth (validated with Snowflake)
- **Trust Level System** — 6-tier security model controls token forwarding (INTERNAL → TRUSTED → OWNER → TEAM_MEMBER → SCOPED → ANONYMOUS)
- **JWKS Token Validation** — RS256 asymmetric cryptography, public-key verification, no shared secrets
- **Per-Service Audience Scoping** — Hub-minted access tokens carry a per-service audience (RFC 8707 resource indicators): each service receives a short-lived credential scoped to *only itself*, so a token leaked from one service can't be replayed against another. Services that validate it via JWKS can accept pAIchart-issued identity instead of static API keys in URLs.
- **Trustworthy Error-Recovery Signals** — When a service call fails, the Hub returns *facts* an AI client can act on — the honoured timeout, the service's recent success rate, and recovery guidance that never points at a blind health check — rather than unvalidated verdicts that can mislead. Built so the client recovers on its own; see the [Error Recovery Signals](tutorials/11-error-recovery-signals.md) case study.

### Organizing and governing the work — POVs → Phases → Tasks

Where the engine's work lives and is governed: programs and pipelines are typed tasks inside a structured, AI-readable delivery plan, and their change packages, analytics, and history hang off it.

- **POVs → Phases → Tasks** — run proof-of-value engagements as structured, AI-readable delivery plans
- **Natural-language operation** — ask "Which of my POVs are at risk?" or "show open tasks for BlackEye" — no UI required
- **AI agents on your work** — configure, assign, and execute agents against delivery tasks
- **Portfolio analytics** — health, insights, and execution metrics across your POVs

## Get Started

pAIchart is a hosted MCP hub — nothing to install. Point your AI client at the endpoint, authenticate, and start asking in natural language.

- **Hub access**: `https://paichart.app/mcp`
- **Connect with**: Claude Desktop (GitHub OAuth) or ChatGPT (Microsoft OAuth)
- **First thing to say**: *"Help me get started with paichart"* — or run `list_prompts()` to see every guided workflow
- **Privacy**: [PRIVACY-DEMO.md](./PRIVACY-DEMO.md) — what a demo account holds, what it can do, 30-day auto-deletion

Once you're connected, try:

- *"Provision a Loopback0 per switch and advertise it into BGP"* — the delivery engine harvests, designs, authors, and returns a reviewed change package to approve (see `HOWTO-use-pipeline-harness`)
- *"Which of my POVs are at risk?"* — delivery analytics, answered directly
- *"Discover services"* — browse the registry by capability
- *"Run the prompt `energy_operations_optimizer`"* — correlates weather forecasts with energy data into operational recommendations, a multi-service workflow across two live services

## Under the Hood

Every request is either answered directly, synthesized into a change package by the engine, or composed into a workflow across services — and every external call runs as *you*, never as a shared platform account:

```
You (Claude Desktop / ChatGPT)
  → authenticate to the pAIchart Hub
  → state intent in natural language, e.g.
      • "Provision a Loopback0 per switch, advertise into BGP"  → engine: harvest → design → author → review → change package (your team applies)
      • "Which of my POVs are at risk?"                         → project / analytics tools answer directly
      • "Texas energy mix + this week's weather"                → Hub composes a multi-service workflow
  → for external / live-system access (incl. the engine's harvest):
      → Hub discovers services by capability, determines trust level, mints a per-service JWT
      → the external service validates it via JWKS — no shared API keys
  → operations execute as the authenticated user; pAIchart designs and reviews — your team applies, idempotently and out-of-band
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

New to this? Run the **`HOWTO-register-service`** guide (`list_prompts()` in your AI client to find it) — a step-by-step walkthrough from a basic registration to Grade-A tool schemas, access control, and trust levels.

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

- **Coordinated Infrastructure Change** — a narrative case study of a real cross-domain program (network → cloud), and how its correctness is machine-checked rather than trusted: [case-studies/coordinated-infra-change.md](case-studies/coordinated-infra-change.md)
- **MCP Tool Excellence** — a 12-chapter tutorial series on building MCP tools AI clients can call without external documentation, extracted from pAIchart's own production audits: [tutorials/README.md](tutorials/README.md)

## Links

- **Platform**: [paichart.app](https://paichart.app)
- **JWKS**: `https://paichart.app/api/auth/jwks`
- **Documentation**: provided as an MCP resource (or run `list_prompts()`) in your AI client
- **Demo User Privacy**: [PRIVACY-DEMO.md](./PRIVACY-DEMO.md) — what a demo account holds, what it can do, 30-day auto-deletion

## Keywords

`mcp` `mcp-hub` `mcp-server` `mcp-orchestration` `model-context-protocol` `ai-native` `change-synthesis` `intent-driven` `human-gated` `network-provisioning` `kubernetes` `gitops` `terraform` `infrastructure-as-code` `multi-domain-automation` `pipeline-harness` `autonomous-agents` `change-management` `delivery-management` `proof-of-value` `pov` `ai-services` `service-discovery` `external-oauth` `jwks` `per-service-audience` `rfc8707` `per-user-authentication` `workflow-orchestration` `error-recovery` `mcp-tutorials` `claude-desktop` `chatgpt` `snowflake`
