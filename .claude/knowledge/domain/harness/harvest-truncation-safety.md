# Harvest Truncation Safety — the tiered-truncation model + the scoped-read discipline

> **Created**: 2026-07-07 · **Why it exists**: a production-assurance record. Provisioning/synthesis pipelines
> read potentially LARGE external source (a device running-config, Terraform state, a k8s cluster snapshot,
> months of events). This doc is the single source of truth for *where that content is truncated, what is silent
> vs flagged, what survives, and the discipline that keeps large source from silently losing fields.*
> **Audit that produced it**: 2026-07-07 protocol-seed audit (below). Owner: pipeline-harness-specialist.

## 1. The tiered truncation model (four independent caps, coherent by nesting)

Content in a pipeline run passes through four **independent** size caps, tightest first. They are intentionally
NOT unified (runtime-limits sweep §5 "document-as-distinct, do NOT unify") — each bounds a different concern.

| Tier | Cap | Constant / site | Bounds | Silent? |
|------|-----|-----------------|--------|---------|
| **Tier-1 — LLM view** | **8 KB** | `MAX_TOOL_RESULT_LENGTH = 8000` (`agentic-tool-loop.ts:298`; `truncateForLlm` helper `:307`, applied `:717`) | What a tool result feeds BACK to the LLM in-loop | **Flagged + auto-nudged** (C1, 2026-07-08; `read_more` recovery added 2026-07-10 `3264e28f`) — appends `... [truncated] — showed the first 8000 of N characters…` + the recovery directive: re-read narrower; **page the SAME result's tail via `read_more(ref, offset)`** when no narrower form exists (memory-backed loop pager `:399 READ_MORE_FUNCTION_DEF`, injected into `mcpFunctions`); or flag the gap. Record also carries the C2 forensic fields (see §6) |
| **Tier-2 — forensic persist** | **50 KB** store; **8 KB** preview if over | `MAX_STORED_TOOL_RESULT_BYTES = 50000`, `TOOL_RESULT_PREVIEW_BYTES = 8000` (`execution-artifacts.ts:311/318`) | What of a tool result is persisted in result.json | Flagged — `truncated:true` + `note` (`:357`) |
| **Tier-3 — §6 chained context** | 128 KB / predecessor, 512 KB ceiling | `context-chainer.ts` | What an upstream stage's output passes to the next stage | Flagged — `[CHAINED CONTEXT TRUNCATED: k of n chars]` |
| **Tier-4 — artifact** | **5 MB** | `MAX_ARTIFACT_SIZE = 5*1024*1024` (`execution-terminal-persist.ts:64`) | The persisted deliverable/artifact body | Flagged — `[TRUNCATED: exceeded 5MB limit]` |

Nesting (coherent by design): **8 KB (LLM) < 50 KB (forensic) < 128/512 KB (§6) < 5 MB (artifact)** — noisy raw
*input* capped tightest, curated *output* looser, storage loosest. Since 2026-07-04 the Tier-2 preview (8 KB)
was raised to **equal** the Tier-1 LLM view (8 KB), so the forensic record now always covers **≥ what the LLM
acted on** — the guarantee no longer inverts past 50 KB (was 2 KB pre-fix; chars 2000–8000 were unrecoverable).

**Since 2026-07-08 the nesting is TEST-ENFORCED, no longer convention-only** (Finding D):
`scripts/test-truncation-tier-invariant.ts` (`npm run test:truncation-tiers`, in `test:all-validation` and a
pre-commit gate that fires whenever a tier-constant file is staged) asserts the full ordering AND the
preview ≥ LLM-view guarantee. The constants stay independent (do-NOT-unify still holds) — the test pins their
*relative order*, never their values.

## 2. The load-bearing fact: Tier-1 is where large SOURCE would be lost — IF a harvest were unscoped

Streaming-accumulate (2026-07-04) removed the SDK's 21,333-token **output** ceiling — the LLM can now *generate*
large deliverables. It did **not** change **Tier-1** — the **8 KB cap on what the LLM SEES of a tool result**
(a CHARACTER cap: `.slice`, not bytes; Tiers 2/4 are byte caps). These are different layers. So the failure mode
that *would* survive is on the **input/harvest** side:

- A Phase-0 Harvester that read a large source in **one broad call** (a full `show running-config`, an unscoped
  `state pull`, `kubectl get all -A -o yaml`, "all events") would get the result **truncated to 8 KB before it
  reasons** — the tail gone from the LLM's view, so the downstream design built on a partial snapshot.
- It is **flagged, not silent** (`... [truncated]`), and the anti-fabrication rules ("don't invent, mark as a gap")
  make the failure mode *incomplete-but-honest*, not *silently-wrong*. The full raw result IS persisted at Tier-2
  (≤50 KB; >50 KB → 8 KB preview + a note on where it lives).

**THE TWO QUESTIONS (keep them separate).** "Did we lose it?" is always two different questions:
1. **Lost from the AGENT'S VIEW** (Tier-1) — the LLM didn't see it on that call, which can affect that run's
   reasoning and deliverable. The agent is TOLD exactly how much it missed (the C1 directive carries the counts)
   but cannot read the tail on that call.
2. **Lost from the RECORD** (Tier-2) — unrecoverable. Only true past 50 KB (where the stored preview covers
   exactly what the LLM saw, guaranteed ≥ by the tier-invariant test).
Between 8 KB and 50 KB the answer is "invisible to the agent, fully auditable by us" — which is how the
2026-07-08 `spanning-tree mode mstp` incident was diagnosed to the exact character position: the harvester's
LLM never saw the line; the forensic record held all 16K. A truncation FLAG is therefore a fact about question 1
only; whether anything MATERIAL was lost requires the §3 dissection (PIPELINE-RUN-FORENSICS-GUIDE §3).

**Why this is NOT a live production hole (the reframe — 2026-07-07 pipeline-harness review):** the safeguard is
enforced on the axis the LLM actually reads — **ROLE GUIDANCE**, baked into each harvester template's
`promptTemplate` at seed time. All three infra Phase-0 harvesters share `defaultRole: 'infra_state_harvester'`,
whose guidance (`pAIchartUniversalTemplate.ts:492` + common-mistake #1 at `:498`) ALREADY mandates the scoped-read
discipline verbatim. So the network harvester agent **is already instructed to do narrow reads at runtime** — the
"design built on a partial view" scenario is guarded by the role, not left open. The gap is defense-in-depth /
prose consistency / human-auditor visibility, NOT live data loss.

## 3. THE SAFEGUARD — Harvest discipline (narrow, scoped reads)

The production safeguard is **architectural, at the protocol level**, not a bigger cap (raising Tier-1 bloats
context on multi-call loops). Every Phase-0 harvest MUST:

- **Never issue a broad "get everything" read** of a large source.
- **Issue many narrow, scoped, field-projected reads** — per interface / per protocol / per section / per resource
  / per address / by filter or page — sized to stay under Tier-1.
- **One TARGET per read, especially config reads** (added 2026-07-08 after a live incident): a config getter
  returns running+startup+candidate per target, so a group/fleet-filtered config read bundles every target's
  copies and truncates everything past the first — the 3rd multicast run lost ceos2's config section
  (`spanning-tree mode mstp` never reached the snapshot; recovered forensically from Tier-2). Per-device
  `filter_name`, never `filter_group`, for config-class getters.
- **Scope to the objective** named in the task (don't harvest the whole device to change one VLAN).
- **Treat `[truncated]` as a gap** — read the unseen remainder explicitly with a narrower call, page it with the
  `read_more(ref, offset)` continuation in the notice (when no narrower form exists), or flag it; never
  reason as if the truncated tail were absent.

This is the "state-never-in-LLM" moat in practice: large source stays out of the LLM's single-shot view; the LLM
consumes scoped facts.

## 4. Audit (2026-07-07) — which protocols carry the discipline

**Audit BOTH axes** — the one the LLM reads (ROLE GUIDANCE, baked into `promptTemplate`) and the one auditors read
(PROTOCOL PROSE, `seed-protocol-prompts.ts`). The first is what actually governs behavior; the second is
defense-in-depth + human visibility. The original audit checked only the protocol axis and over-stated network's risk.

| Protocol | Reads large source in Phase 0? | **Role guidance** (LLM reads → governs behavior) | **Protocol prose** (auditor reads) |
|----------|-------------------------------|--------------------------------------------------|-------------------------------------|
| kubernetes-gitops | Yes — cluster state | ✅ `infra_state_harvester` (`:492`) | ✅ `:1577` |
| terraform-iac | Yes — `state pull` | ✅ `infra_state_harvester` (`:492`) | ✅ `:1671` |
| **network-provisioning** | Yes — device running-config (20–100 KB) | ✅ `infra_state_harvester` (`:492`) — **live behavior protected** | ❌ missing (prose gap) |
| artifact-synthesis | Yes — external events/logs/tickets | ⚠️ `synthesis_source_acquirer` — has pagination/budget, but frames the cap as Tier-3 (Harvester context), NOT its own per-call Tier-1 | ❌ missing |
| pipeline-orchestrator | No (decomposes objectives) | N/A | N/A |

**Key correction**: all three infra harvesters share `defaultRole: 'infra_state_harvester'`, so **network's live
harvest is already disciplined** — the gap is protocol-prose parity + device-specific `show …` vocabulary + auditor
visibility, not a live "partial-view" hole. The one genuine *behavioral* gap is `artifact-synthesis`'s source
acquirer, whose role guidance names the cap as protecting the downstream Harvester's context (a Tier-3 framing),
never its own per-call Tier-1 truncation.

**Root cause (the tell)**: network-provisioning's *protocol* is `v1.0.0` — the FIRST/spike. k8s (2026-06-27) +
terraform (2026-06-29) were built LATER and added the belt-and-suspenders protocol section; the shared *role* was
correct all along. "First built, last hardened" — in the prose, not the behavior.

## 5. Remediation (reviewed by pipeline-harness 2026-07-07, GREEN 88% — three layers, TWO deploy pipelines)

Three altitudes, three audiences (all kept — not redundant): universal rule (every future protocol inherits) +
role guidance (what the agent executes) + protocol prose (domain command vocab + auditor visibility).

- **`UNIVERSAL_AGENT_RULES`** (`lib/agents/universal-agent-rules.ts` since 2026-08-04 — was `seed-protocol-prompts.ts:54`; under `### Turn Efficiency`): one line so EVERY
  current + future protocol inherits the awareness — the durable fix (a new protocol can't forget it). *(re-seed)*
- **network-provisioning protocol** (`seed-protocol-prompts.ts`, after the self-provision lifecycle `:1483`, before
  Anti-fabrication `:1485`): a trimmed "Harvest discipline" section in device terms (`show run interface …`,
  `show run | section …`, `show ip bgp summary`, per-interface/protocol) — belt-and-suspenders + the `show` vocab the
  generic role can't carry. Bump the protocol `1.0.0 → 1.1.0`. *(re-seed)*
- **artifact-synthesis** — the ONE genuine behavioral fix goes in the **`synthesis_source_acquirer` ROLE GUIDANCE**
  (`pAIchartUniversalTemplate.ts:352-373`, after the pagination bullet), NOT the protocol: reframe the cap from
  Tier-3 (Harvester context) to its own per-call Tier-1 truncation. This is COMPILED runtime code →
  **`npm run build` + deploy**, `validate:role-guidance` gates — a different pipeline from the seed. (template-system owns this file.)

**Two deploy pipelines (do NOT conflate):** protocol + universal-rule edits ship via `npm run seed:protocols`
(ts-node — plain tsc is false-clean for this file) + pm2 restart + `/mcp` re-auth (prompt cache). The synthesis
role-guidance line ships via build + deploy. Escape backticks in the `show …` commands inside the TS template literal.

## 6. Verification a future run is safe (operator check)
Since C1+C2 (2026-07-08, reviewed agent-execution 90% + boundary-contract 93% GREEN), the runtime itself
enforces + records the discipline — the check is a grep, not eyeballing:

- **Grep the Harvester child's `result.json.toolCalls` for `"resultTruncatedForLlm": true`** — every entry also
  carries `resultChars` (full LLM-bound length, post-R9, pretty-printed measure). Zero hits on a large-source
  device = clean scoped harvest. A hit is not automatically a failure: the LLM received the auto-nudge directive
  in that same tool_result and should have re-read narrower, paged the tail via `read_more`, or flagged the gap
  — verify it did one of the three.
- The signal is **emit-only** (mirrors `ChainedContextSignal.anyTruncated`: detectors emit, consumers decide);
  a future SYNTHESIZE quality gate could consume it.
- **Since the Finding-E de-bloat (2026-07-08)** the embedded envelope no longer carries the schema-echo
  (~45-49% of every response was decoration), so `resultTruncatedForLlm: true` now predominantly means REAL
  payload at the cap — the flag's precision problem observed in Test B is resolved at the source.
- A single broad read + `resultTruncatedForLlm: true` + no narrower follow-up + **no `read_more` page** + no flagged gap
  is the signature of the failure this doc exists to close (pager verification recipe: PIPELINE-RUN-FORENSICS-GUIDE §7c).
