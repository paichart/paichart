# Chapter 8 — From a Single MCP Server to a Multi-Service Hub

**Audience**: Engineers running an MCP server who are starting to think about composition with other services — either MCP servers their team operates, or third-party services they want to integrate into agent workflows.
**Prerequisite**: Chapters 2 and 6. The standards from Ch.2 give individual services a usable surface; Ch.6's seven-layer model gives you the vocabulary for what each service contributes. This chapter assumes you have that grounding.
**Reading time**: ~13 minutes.

> **A note on this chapter.** Chapters 1–7 describe patterns that apply to any MCP server. This chapter is more specifically about pAIchart's MCP Hub, because the Hub is the concrete implementation we have hands-on experience with. The architectural concepts — capability-based discovery, multi-service workflow orchestration, per-user External OAuth — apply to any hub-style architecture. Where the chapter says "the Hub does X", read it as "one production approach to X is Y", and substitute your own design if you're building something different.

---

## What this chapter teaches

The transition from operating one MCP server to orchestrating many. Three concrete topics:

1. **Capability-based discovery** — letting AI clients find the right service by what it does, not by name.
2. **Multi-service workflow orchestration** — chaining calls across services (sequential, parallel, conditional) as a first-class operation.
3. **Per-user authentication across service boundaries** — keeping the user's identity attached to every downstream call, even when the downstream service is a third party.

The chapter ends with a frame for *when not to bother* — most teams shouldn't operate a hub. The point is to know what's available if your situation calls for it.

---

## When the question even arises

A team typically doesn't think about hub architecture until two or three things have happened:

- They've shipped a working MCP server that AI clients use successfully.
- They've integrated with an external service (Sentry, Linear, Notion, an internal database) by writing a custom MCP wrapper for it.
- They've started writing a *second* wrapper — for a different external service — and noticed they're duplicating registration / authentication / health-check / discovery code from the first one.

At that point, the question becomes: should each wrapper be its own MCP server (with its own deployment, auth, registration), or should there be a shared layer that handles the cross-cutting concerns once?

That shared layer is what a hub is. The cost of running one is non-trivial — it adds operational surface and a new failure mode. The benefit is that adding service number three is dramatically cheaper than service number two was.

---

## Capability-based discovery

The first thing a hub does that a single server doesn't is decouple "what services exist" from "what tools are registered with this AI client".

In a single-server world, the AI client sees a fixed list of tools when it connects. That list is decided at startup and doesn't change unless the server restarts. If you add a new tool, every AI client has to reconnect to see it.

In a hub-style world, the AI client connects to the hub. The hub exposes a small fixed surface (in pAIchart's case: `services`, `registry`, `search`, `fetch`, plus a few others — see Chapter 7's tool table). One of those tools is *discovery*: the AI client calls `services(action: "discover")` with a capability filter — "find me services that handle monitoring", "find me services with a `query` tool" — and the hub returns the matching services.

This matters for two reasons:

1. **Services can come and go without breaking the AI client's contract.** New services register; old services deregister. The AI client's tool list (what it sees on `tools/list`) doesn't change. The hub mediates.

2. **Capability is a more durable abstraction than name.** A workflow that says "find a monitoring service and call its `incident.create` tool" works regardless of which specific monitoring service is registered today. Tomorrow a different one can take over and the workflow keeps working.

The implementation cost is the discovery layer itself: a registry (database table or equivalent) of registered services, plus a query interface that supports capability/category/tag filters. pAIchart's registry is the `MCPTool` Prisma model; the discovery query lives behind `services(action: "discover")`.

The honest cost: services need a way to *describe* their capabilities. Free-text won't do — different authors will use different words for the same thing. pAIchart uses a categorical taxonomy (`category` + `capabilities` array) plus substring search across service name and description. Designing that taxonomy is real work; getting it wrong shows up as discovery returning the wrong services.

---

## Multi-service workflow orchestration

The second thing a hub does is treat *workflows* — sequences of calls across multiple services — as a first-class operation, not as something the AI client has to manage by hand.

In a single-server world, when an AI client wants to do "call service A, then if A succeeded, call service B with A's result", it does that work itself. It calls A, waits, parses A's response, decides whether to call B, calls B, waits, parses B's response. Each call is a separate turn from the AI client's perspective. Each turn round-trips through the model.

In a hub-style world, the AI client describes the workflow *once* — `services(action: "workflow.execute")` with a list of steps, dependencies between them, and a failure strategy — and the hub runs the whole thing. The AI client gets a single response that summarises the result of the whole workflow.

Three execution modes are typical:

- **Sequential** — steps run in order. Step N waits for step N−1. Failure of any step stops the workflow (default) or continues, depending on policy.
- **Parallel** — steps with no dependencies run simultaneously. The workflow waits for all to complete.
- **Conditional** — steps include an `if` clause that's evaluated against earlier results. Branches are taken or skipped accordingly.

Failure strategies parameterise what happens when a step fails: `stop` (default — abort the rest), `continue` (record the failure, run remaining steps anyway), or `rollback` (run a compensating action and stop).

Why this matters: workflows that go through the AI client every turn cost tokens at every step. A five-step workflow that the model has to coordinate is five turns of context, five round-trips of latency, five chances for the model to misinterpret an intermediate result. A five-step workflow that the hub coordinates is one tool call, one response, and the model can stay focused on what it actually needs to do with the final result.

Honest costs:

- **Workflows are harder to debug than individual tool calls.** When step three fails out of seven, the response shape needs to expose enough of step one and two's output for the AI client (or a human) to figure out what went wrong without re-running everything.
- **Step limits matter.** A workflow with too many steps is hard to reason about. pAIchart's hard limit is 20 steps per workflow; 5–10 is the practical sweet spot.
- **The orchestration engine is a single point of failure.** When the hub goes down, every workflow goes down. This is operationally non-trivial.

---

## Per-user authentication across service boundaries

The third — and most distinctive — thing a hub does is preserve user identity across calls to downstream services. This is the architecture that makes hub patterns useful for production AI agents in regulated environments, and it's the part that's hardest to get right.

The naive design — and the one most "AI service" platforms ship with — is **shared service accounts**. Your hub holds a Snowflake API token (one token for the whole platform). When an AI client running on behalf of user Alice calls Snowflake via the hub, the hub uses its single token. Snowflake sees the call coming from "the platform"; it doesn't know about Alice. This works for low-stakes integrations but breaks for anything that needs:

- Per-user audit trails (Alice ran this query, not "the platform")
- Per-user RBAC (Alice can see her tables, not all tables)
- Compliance with regulations that require user-attributable data access

The alternative — and the design pAIchart uses — is **External OAuth with per-user JWT minting**. The hub doesn't hold a service account; it mints a short-lived JWT for each call, signed with a key the downstream service trusts. The JWT carries the *real user's identity* (Alice's user ID, role, scope claims). Snowflake (or whichever service it is) accepts the JWT, verifies the signature against the hub's public key (JWKS), and runs the query as Alice.

The whole call ends up with this shape:

```
User Alice asks her AI client a question
  ↓ (AI client authenticated as Alice)
AI client calls hub: services(action: "call", serviceId: "snowflake-mcp", ...)
  ↓ (hub knows the call is on behalf of Alice)
Hub mints a fresh JWT with Alice's identity, signs it
  ↓ JWT in Authorization header
Snowflake MCP service: validates the JWT against the hub's JWKS endpoint
  ↓ identity confirmed: Alice
Snowflake runs the query as Alice — full RBAC, full audit trail
```

Three properties make this design useful:

1. **No shared secrets.** The hub never holds a Snowflake API token. If the hub is breached, the attacker doesn't get Snowflake access — there's nothing to steal.
2. **Per-call identity.** Every downstream call is attributed to the actual end user, not to the platform.
3. **Service-side enforcement.** Authorization happens at the downstream service, not at the hub. The hub is a courier of identity; it doesn't get to override what the downstream service decides.

Two operational details worth surfacing because they're easy to miss when copying the pattern:

- **The hub itself sits behind an OAuth proxy** so AI clients (Claude Desktop, ChatGPT, etc.) authenticate as a real user before any of this happens. End-to-end per-user identity requires inbound OAuth on the hub *and* outbound JWT minting to downstream services — both halves of the round trip.
- **Trust levels gate token minting.** The hub only mints downstream JWTs for users whose trust level to the service is OWNER, TEAM_MEMBER, TRUSTED, or INTERNAL. Public/anonymous callers get no forwarded identity. This means the design isn't "every call gets a JWT" — it's "every authenticated, sufficiently-trusted call gets a JWT".

The honest costs:

- **The downstream service has to support External OAuth.** Snowflake has supported it for years. Databricks does. Azure SQL does. GitHub does *not* — GitHub's API expects a personal access token or GitHub App auth, not arbitrary JWTs. Slack doesn't. The pattern works for some services and not others; you need to check before you build.
- **JWKS infrastructure has to exist.** The hub publishes its public key at a well-known URL; downstream services fetch it. Key rotation has operational consequences (every downstream service has to refresh its trust). pAIchart's first 90-day rotation is scheduled for April 21, 2026 — the practice run is happening this week.
- **JWT scope and audience claims have to match the downstream service's expectations exactly.** RFC 8707 / RFC 9068 define the relevant fields; getting them wrong means the JWT is rejected.

This is the most architecture-heavy part of running a hub. It's also the part that makes the hub valuable — without per-user identity, the hub adds operational cost without adding capability.

---

## When *not* to operate a hub

Three signs that hub architecture isn't the right answer for you yet:

1. **You have one or two MCP servers, both internal.** The shared-layer benefit isn't there yet; the operational cost is. Operate them as independent servers until you have three or four.
2. **Your integrations are all read-only and low-stakes.** If audit trails and per-user RBAC don't matter, the External OAuth complexity isn't earning its keep. A platform-level service account is fine.
3. **Your AI client population is small and known.** When you operate a hub for "Claude Desktop, ChatGPT, Cursor, plus three internal tools, plus partners on a roadmap", the discovery layer pays for itself. When you operate it for "the AI client our team built", a hardcoded tool list is simpler.

Hub architecture is real architecture. It earns its complexity when you have several services, multiple AI clients, regulated data, or workflows that span more than two or three calls. Outside those conditions, a clean single MCP server with the standards from Chapters 2–7 will get you further than you think.

---

## How pAIchart's Hub fits in

If you've followed the series this far, the Hub is the live example of every pattern the chapters describe applied to a multi-service architecture. Its tool surface (the consolidated `services`, `registry`, plus standalone `search`, `fetch`) is described in Chapter 7. Its discovery model is the capability-based pattern described above. Its orchestration engine implements the sequential / parallel / conditional pattern. Its authentication uses External OAuth with first-party JWT minting against per-user identity.

Three places to look if you want to go deeper:

- **The platform itself** — connect Claude Desktop, ChatGPT, or any MCP client to `https://paichart.app` and run `services(action: "discover")` against the live hub.
- **The repository** — `github.com/paichart/paichart` is open. The hub orchestration code, the discovery layer, the registration tooling, and the OAuth proxy implementation are all there.
- **The internal documentation** — the patterns referenced throughout this series (`patterns/oauth-token-minting-not-passthrough.md`, `patterns/identity-preserving-token-forwarding-pattern.md`, `domain/mcp/mcp-hub-workflow-orchestration-reference.md`) are in `.claude/knowledge/` in the repository.

---

## What's next

This is the last planned chapter in the series. Chapter 1 — the gentle entry point — is also drafted; you can read it if you came in cold from this chapter and want to start over with the foundational framing.

If the series is useful and you spot gaps, the canonical place to file them is the GitHub repository's issues page. The patterns the series documents are themselves still evolving; the next iteration of any of these chapters depends partly on what readers actually run into when they apply them.

---

## Provenance

pAIchart's Hub architecture is documented across several knowledge-base files (`agents/mcp-hub-specialist.md`, `discoveries/mcp-hub-discovery.md`, `domain/mcp/mcp-hub-workflow-orchestration-reference.md`). The External OAuth pattern is documented in `patterns/oauth-token-minting-not-passthrough.md`. The first 90-day key rotation cited in the chapter is real and scheduled for April 2026.

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
