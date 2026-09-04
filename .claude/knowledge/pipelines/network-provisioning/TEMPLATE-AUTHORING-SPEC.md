# Template Authoring Spec — Network-Provisioning Pipeline (UAT spike)

> **For**: template-system-specialist (separate session) · **From**: pipeline-harness-specialist · **Date**: 2026-06-16
> **Status**: provisional — author for the **UAT learning spike** (`SPIKE-PLAN.md`), **NOT** promoted to prod
> seed-as-shipped until the network-provisioning re-review clears.
> **Run discovery-first**, then author the four templates in `scripts/seed-agent-templates.ts`.

---

## Read these first (the proven precedents this mirrors)

1. **`scripts/seed-artifact-synthesis-templates.ts`** — the shipped template shape to copy (`Editorial Writer`,
   `Publication Reviewer`): `name / description / category / templateType / defaultRole / tags / timeout /
   metadata.modelParameters / hasModelParameters / modelParamsVersion / protocol`.
2. **`scripts/seed-protocol-prompts.ts:112` `PIPELINE_ORCHESTRATOR_PROTOCOL`** — the working protocol. Note its
   **template-type table** (ARCHITECT / BUILDER / ANALYST / REVIEWER / OPERATOR / DOCUMENTER / **ORCHESTRATOR =
   "calling external MCP services"**) and that the harness assigns templates **by type**.
3. **Pattern #44 (8 Gold Standards)** — all four templates must align (the standing template rule).
4. **The design doc** `network-provisioning-pipeline.md` (R3 confinement, R7 logging) + `SPIKE-PLAN.md` (why provisional).

---

## The four templates

| # | Name | templateType | defaultRole | Produces | `selectedTools` (the NET-NEW bit) |
|---|------|-------------|-------------|----------|-----------------------------------|
| 0 | **Network State Harvester** | ORCHESTRATOR | `infra_state_harvester` *(2026-07-01: was `network_state_harvester`)* | current-state snapshot (topology, VLAN/IP, versions) | **all six** — needs `services` (call device svc + run-2 `scrape_page`) + `registry` (register/update/delete) |
| 1 | **Network Design Architect** | ARCHITECT | `infra_change_architect` *(2026-07-01: was `network_design_architect`; domain framing now in the protocol)* | the design changes the objective requires (VLAN/routing/ACL/QoS/LB as applicable) + dependency map | `['project','perform','analytics','template','registry']` — **omit `services`** |
| 2 | **Config & Change-Package Author** | DOCUMENTER | `config_change_author` | per-device config + deterministic validation + rollback (the deliverable) | `['project','perform','analytics','template','registry']` — **omit `services`** |
| 3 | **Change Reviewer** | REVIEWER | `change_reviewer` | risk/standards/blast-radius QA verdict | `['project','perform','analytics','template','registry']` — **omit `services`** |

- **Type rationale**: Harvester = ORCHESTRATOR (it *calls an external MCP service* — the protocol's own definition). Author = DOCUMENTER (it's the deliverable producer, mirroring `Editorial Writer`; if you judge config-gen as BUILDER, flag it — but DOCUMENTER matches the deliverable-producer role). Reviewer = REVIEWER (mirrors `Publication Reviewer`, the QA gate).
- **Common fields** (copy from artifact-synthesis): `category: AUTOMATION`; `metadata.modelParameters` = `anthropic_sdk` / **`AGENT_MODELS.<tier>`** (import from `lib/agents/model-tiers` — **never a literal**, hoisted 2026-08-09) / `temperature: 0.3` / `useSystemPrompt: true` / `maxRetries: 2`; `hasModelParameters: true`; `modelParamsVersion: '1.0.0'`; **`protocol: 'network-provisioning-protocol'`** (the engine injects it — the description should say *"Reads network-provisioning-protocol before beginning work."*).
- **Timeouts**: Harvester/Author longer (it generates config) ~600; Architect/Reviewer ~300 (mirror the synthesis split).
- **Deliverable/QA wiring is NOT in the template** — the harness sets `metadata.deliverableSourceTaskId → the Author task` and `suppressDefaultReportMd → the Reviewer task` at runtime (Step 5a). The templates only need the correct `templateType`.

---

## The net-new pattern (get this exactly right — it's what the spike validates)

**No existing seeded template sets a tool grant** — they all rely on empty→all-six. These are the **first** templates to declare an explicit `metadata.mcpToolConfiguration.selectedTools`. This is the R3 confinement control:

- Set `metadata.mcpToolConfiguration.selectedTools` to the lists in the table above (typed `MCPToolConfiguration`, `lib/types/auth.ts:230`).
- **The cognition trio (1/2/3) MUST omit `services`** — that's the confinement. The Harvester (0) explicitly carries all six (it's the device-touching node; explicit-all-six, not empty-defaults-all).
- **⚠ Consolidated names, not granular.** `selectedTools` must contain the **consolidated** names (`project`/`perform`/`analytics`/`template`/`services`/`registry`) — these are what `embedded-server.ts:1685-1698` advertises and what the engine resolves. If the GUI/seed path expects granular hub-tool names, a consolidated list could be dropped by the availability intersection → collapse to empty → all-six (the D2 risk). **Confirm the seed writes these consolidated names through to the row; pull mcp-tool-architecture-specialist if unsure.**
- **This is exactly what spike observation #1 checks**: at runtime the trio's effective `mcpTools` must exclude `services`. If your authored `selectedTools` doesn't survive to the runtime grant, the spike will show it — which is the point.

---

## Provisional / UAT scoping (don't pollute the prod seed)

These are spike templates, not shipped. Author them so they're clearly **UAT-scoped / provisional** — e.g. a distinct tag (`network-provisioning`, `spike`, `provisional`), and do **not** treat them as the final shipped set until the re-review clears (R1/R2/R8/R10 still open). template-system-specialist's call on the cleanest mechanism (separate seed block, tag-gated, or a `seed-network-provisioning-templates.ts` mirroring `seed-artifact-synthesis-templates.ts`). A dedicated seed file is probably cleanest + matches the domain-seed convention.

---

## Acceptance

- Four templates authored in the seed (source of truth), Pattern #44-aligned, `protocol: 'network-provisioning-protocol'`, descriptions reference reading the protocol.
- The trio's `selectedTools` omits `services`; the Harvester's includes `services` + `registry`.
- Confirmed (with mcp-tool-architecture if needed) that `selectedTools` consolidated names survive to the runtime grant — or flagged if they don't (that's a spike finding, not a blocker to authoring).
- Clearly provisional/UAT-scoped.

## Hand back to pipeline-harness-specialist when done
So the protocol seed + the spike run (observation #1: runtime grant excludes `services` for the trio) can proceed.
