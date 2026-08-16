# pAIchart — high-level design in, reviewed low-level design out

Across network devices, Terraform, and Kubernetes — on an open MCP hub. Give pAIchart a `requirements.md` and a `topology.json` at any fetchable location — and it returns a reviewed low-level design: per-device config, the exact commands that prove it worked, and a rollback. Your team applies it, idempotently and out of band. pAIchart designs and reviews the change; it never applies it.

The LLD is the bottleneck it removes. Producing one today means a senior engineer reading live state across every box, writing config in each vendor's language, and hand-reconciling the values that cross domains. pAIchart does that work as a graph of specialist agents, checks it in three tiers, and hands you one reviewed result to approve. You stop authoring across every system and start approving one package.

## The directed acyclic graph (DAG) coordinates agents

Other solutions give you a DAG of tasks. pAIchart gives you a DAG of reviewed changes.

Every node is a domain pipeline of agents *harvest live state → design → author → review* and every edge carries a value that did not exist until runtime. Legs with no edge between them run in parallel; a dependency edge forces order and hands the real derived value forward.

```
                    ┌──▶ [firewall leg] ──┐
[network leg] ──────┼──▶ [cloud leg] ─────┼──▶ [integration review] ──▶ release gate
                    └──▶ [k8s leg] ───────┘
     derived range                              checks all legs against
     exists only after                          the one shared contract
     this leg runs
```

That's the difference between a graph and a script: the cloud leg authorises exactly the address range the network leg derived, because the cloud leg reads the content the network leg created. There are no pre-defined values in the high level design.

- multiple legs, parallel or sequenced, with context chaining and dependencies
- Three supported domains today, network device, Terraform, Kubernetes and the shape is extensible
- The graph is declared with the work, in a single `PIPELINE` task, not in a separate scheduler you also have to operate
- Approval gates release from your AI client or the web UI, over one common code path
- Live state comes from your devices, harvested read-only through per-device MCP servers

## How correctness is checked using three tiers, and a lower one can't be overruled

Tier 1 — arithmetic, in code. Where appropriate pAIchart uses code to do a deterministic check rather than an LLM reviewer's confidence. Every derived value is tagged with a **`kind`**, and the engine runs the arithmetic for that kind against the harvested evidence — never against the package's restated copy of it:

- `cidr` — does the derived range cover exactly its declared members? Catches **too wide** (an already-allocated address swept in) and **too narrow** (a claimed member falling outside).
- `asn` — is the AS number inside the private range, and is it actually free in the harvested state?

And when a `kind` isn't implemented, the platform says so. It records the value as *not mechanically covered* and escalates it to the integration reviewer — it never counts an unchecked value as a passed one. That path is verified end-to-end in VT-14: the reviewer named the uncovered value, traced its provenance, found it had no device config behind it, and blocked over two green legs and its own approval.

Tier 2 — independent reviewers. One per leg against its own contract, plus an integration reviewer across *all* legs against the shared contract — running the domain's own validators over the composed set (whole-topology [Batfish](https://batfish.org), `terraform plan`, `kubeconform`). It consumes those validators; it does not reimplement them.

Tier 3 — the release gate. A deterministic AND: every leg approved **AND** no containment violation **AND** any unchecked value carries a benign reason **AND** the integration reviewer approved **AND** coverage complete. No confidence number appears in it.

A Tier-1 violation blocks regardless of who approved above it.

## The proof is we publish the rounds we failed

Most of this category asks you to trust a demo. We provide **15 verification documents**, each stating its expected observables before the run, then recording what actually happened.

See also the ones that went wrong. **VT-12**: a program self-certified `programReleasable: true` while shipping an authorization widening. Five tiers passed it, so minimality is now checked in code rather than in prose.

- Two byte-identical review runs scored 45 and 92 on the same input. So confidence was demoted to a recorded fact at every tier, and the release gate decides on verifiable facts alone — there is no confidence number in it.
- A check that couldn't run is a block, not a pass. "We couldn't verify it" never rounds up to "it's fine."

→ **[Verification pack](verification/)** · every claim linked to its machine record

## Four domains, one harness

- Network Provisioning : *"add a Loopback0 per switch and advertise it into BGP"* → an approved change package the provisioning team applies idempotently: self-provision a read-only device service from a descriptor, harvest real running state, design, author per-device config + validation + rollback, independent reviewer gates it. → [example change report](examples/network-provisioning-change-report.md)
- Kubernetes / GitOps: *"add an HPA and resource requests/limits to the orders-api Deployment"* → a declarative kustomize overlay from live cluster state, validated offline (`kubeconform` / `kustomize build` / OPA and we never `kubectl diff`). Read-only, RBAC-scoped; secret *names* surface, values never leave the cluster. → [example](examples/kubernetes-gitops-change-report.md) (includes an earned **NEEDS-REVISION** — the reviewer refusing to approve what it couldn't verify)
- Terraform / Cloud IaC: "add versioning and a public-access-block to the acme-app-logs bucket" → an HCL change package as a PR, from a scoped `state pull` (no providers launched, no state lock), with `validate` / `plan` / `tflint` / OPA expected-facts and rollback. → [example](examples/terraform-iac-change-report.md) (shows the layered defense: a secret-shaped tag **redacted**, a prompt-injection tag **refused**)
- Artifact Synthesis: source material (git history, execution logs, a POV's delivery history, external MCP services) → a publishable deliverable via harvest → author → review. → [example](examples/artifact-synthesis-case-study.md)

## Reaching your live systems safely — the MCP hub

The harvest step is a Hub call, and the same machinery is open to anyone: register a service, discover it by capability, orchestrate it — with per-user identity and no shared API keys.

- Per-user authentication: every external call runs as *you*, via OAuth (GitHub / Microsoft). No shared platform account.
- Tokens your services can verify themselves: the Hub mints a short-lived token per call and publishes its **public key at a JWKS endpoint**. A service that supports JWKS validates the signature itself, so pAIchart-issued identity replaces static API keys in URLs and **no secret is ever shared between us**. Signing keys rotate on a 90-day cadence. 
- Scoped to one service each: every minted token carries a per-service audience (RFC 8707), so a token leaked from one service cannot be replayed against another.
- Trust levels: a 6-tier model controls token forwarding (INTERNAL → TRUSTED → OWNER → TEAM_MEMBER → SCOPED → ANONYMOUS).
- A fixed tool surface for agents: the execution loop calls six stable tools, permanently — a newly registered service becomes reachable to every agent through service calls, with no new tool schemas, no prompt changes, no redeploy.
- Open registry: any MCP service registers in one command and defaults to private; discovery is by capability, not name; workflows chain services sequentially, in parallel, or conditionally.

## Administration, observability, access

- Change the DAG definition or any agent's system prompt from the web app. Stored in the database, applied without a restart or redeploy.
- Full forensics: every run's metadata and artifacts are browsable in the GUI: what each agent saw, what it produced, which checks ran, why a gate held.
- Multi-user: RBAC and personal API keys.
- Model selection per agent: choose from the current Claude family in a dropdown.

## Organizing the work — POVs → Phases → Tasks

In most agent frameworks the orchestration graph is code — it exists only while the run exists. In pAIchart, every node of the DAG is a **task**: a durable record with status, dependencies, artifacts, and history, in the same delivery plan your team already works in. Programs and pipelines are just typed tasks, so the graph survives restarts, every agent's work is a browsable work item, and an approval gate is a task transition — the same one a human completing a task goes through, over one common code path.

That's also why there is no separate scheduler to operate, and why forensics come for free: the workflow engine *is* the delivery plan. Ask *"which of my POVs are at risk?"* and get an answer — no UI required.

## Get Started

pAIchart is a hosted MCP hub configured as a claude connector or ChatGPT app so nothing to install. Point your AI client at the endpoint, authenticate, and state the objective.

- Hub: `https://paichart.app/mcp`
- Connect with: Claude Desktop (GitHub OAuth) or ChatGPT (Microsoft OAuth) — or use the web app
- First thing to say: *"Help me get started with paichart"* — or run `list_prompts()` for every guided workflow
- Privacy: [PRIVACY-DEMO.md](./PRIVACY-DEMO.md) — what a demo account holds, what it can do, 30-day auto-deletion

**To run a program (DAG)**, you supply two files at any fetchable location (a GitHub repo works):

| File | What it is |
|---|---|
| `requirements.md` | your HLD — the objective and its constraints, in prose |
| `topology.json` | the devices/targets in scope and how they connect |

Then in an AI client ask to load the 'HOWTO-use-pov-program' prompt or in the GUI create one task, and the graph runs.
See lots of examples in the shared pov in the gui or ask to 'list my povs and show me the details'
Or start smaller:

- *Use the HOTO-use-pipeline-harness then ask "Provision a Loopback0 per switch and advertise it into BGP"* — one pipeline, one domain, a reviewed package back
- *"Which of my POVs are at risk?"* — delivery analytics, answered directly
- *"Discover services"* — browse the registry by capability

## Under the Hood

```
You (Claude Desktop / ChatGPT / web app)
  → authenticate to the pAIchart Hub
  → one PIPELINE task, its title declaring the graph, pointing at your HLD
      │
      ├─▶ Program Architect designs the DAG + the interface contract every leg must honour
      │
      ├─▶ ⏸  PLAN GATE — a human releases it (AI client or GUI, one common code path)
      │
      ├─▶ legs execute: parallel where no edge joins them, sequenced where one does
      │     each leg:  harvest (read-only, via per-device MCP) → design → author → review
      │     each edge:  carries a real derived value forward, not an assumption
      │
      ├─▶ Tier 1 arithmetic in code · Tier 2 integration review over the composed set
      │
      └─▶ release gate — a deterministic AND, no confidence number
              ↓
    a reviewed LLD change package, in your AI client and the web GUI
    your team applies it — idempotently, out of band, with the rollback
```

Every external call runs as *you*, never as a shared platform account — enforced below the agent, so even a prompt-injected agent cannot exceed the permissions of the user who asked.

## Live Services

The Hub's open registry. Device services are different — they're **self-provisioned per run from a descriptor and torn down after**, so pAIchart never stores your device credentials. The descriptor contract is open: **[spec + JSON Schema + four production-exercised examples](descriptors/SPEC.md)** — author one for your own gear and validate it before a run.

| Service | Capability | Per-User Auth |
|---------|-----------|---------------|
| Snowflake | Data warehouse queries | ✅ External OAuth |
| EIA | U.S. energy data analytics | Service account |
| Weather | Real-time weather data | Service account |
| EODHD | Financial market data | Service account |
| Alpha Vantage | Financial data — 113 tools | Service account |
| Browser Automation | Web scraping, screenshots, PDFs | Service account |
| Notifications | Email, Slack, webhooks | Service account |
| Token Validator | JWT/JWKS integration & trust-level debugging | ✅ Per-user JWT |

Run **`HOWTO-register-service`** (`list_prompts()`) for the walkthrough from basic registration to Grade-A tool schemas, access control, and trust levels.

Register your own in one command:

```
registry(action: "register", {
  name: "my-service",
  description: "What your service does",
  endpoint: "https://my-service.com/mcp",
  category: "data-services"
})
```



## Learn

- **[Verification pack](verification/)** — 15 documents, each stating its expected observables before the run. **Including the rounds that failed.**
- **[Open questions](verification/OPEN-QUESTIONS.md)** — for researchers. Three findings we think are interesting (three reviewer tiers once approved a defect at *rising* confidence), one hypothesis we lack the power to settle, and lab run data we will share.
- **Case studies** — three walkthroughs of the same real network→cloud program: [Checked by Machine](case-studies/coordinated-infra-change.md) (*can you trust it*), [You Approve; You Don't Author](case-studies/you-approve-you-dont-author.md) (*what it buys you*), [Inside a Multi-Domain Program](case-studies/inside-a-multi-domain-program.md) (*how it's built* — the DAG, the review tiers, how far it scales).
- **MCP Tool Excellence** — a 12-chapter series on building MCP tools AI clients can call without external docs, extracted from pAIchart's own production audits: [tutorials/README.md](tutorials/README.md)
- **[`@paichart/containment-checks`](packages/containment-checks/)** — the Tier-1 arithmetic, extracted verbatim as an MIT library with its incident-fixture test suite: mechanical checks for LLM-derived infrastructure values (`cidr`, `asn` — extensible by `kind`), where an unimplemented check reports *not mechanically covered*, never a pass.

## Links

- **Hub (connect here)**: [paichart.app/mcp](https://paichart.app/mcp)
- **JWKS**: `https://paichart.app/api/auth/jwks`
- **Verification**: [verification/](verification/)
- **Documentation**: an MCP resource in your AI client, or `list_prompts()`

## Credits

Device harvesting builds on [`nornir-napalm-mcp`](https://github.com/sydasif/nornir-napalm-mcp) by [@sydasif](https://github.com/sydasif), used under the MIT licence, in a modified form.

## Keywords

`mcp` `mcp-hub` `mcp-server` `model-context-protocol` `dag` `directed-acyclic-graph` `multi-agent-orchestration` `low-level-design` `hld-to-lld` `change-synthesis` `intent-driven` `human-gated` `network-automation` `network-provisioning` `napalm` `nornir` `batfish` `kubernetes` `gitops` `terraform` `infrastructure-as-code` `multi-domain-automation` `verification` `deterministic-gate` `autonomous-agents` `change-management` `delivery-management` `pov` `service-discovery` `external-oauth` `jwks` `rfc8707` `per-user-authentication` `workflow-orchestration` `claude-desktop` `chatgpt` `snowflake`
