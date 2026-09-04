# Deferred Features & Follow-ups

**Created**: 2026-04-13
**Source**: BC73 eradication session (Apr 7-9), protocol-as-prompt session (Apr 10-13), post-graduation audit findings
**Purpose**: Single tracking doc for all features, fixes, and improvements explicitly deferred during these sessions. Organized by domain and priority.

---

## Protocol-as-Prompt Architecture

### Part F: Build 3 synthesis specialist templates (HIGH priority)
**Source**: TODO-PROTOCOL-EXPOSURE-v2.md Part F, TODO-PROTOCOL-EXPOSURE.md Part E
**Effort**: ~2-3 hours
**Depends on**: Parts A-E validated in production (protocol injection working)

Create 3 specialist agent templates for the artifact-synthesis-protocol:
- **Research Analyst** (ANALYST) — Phases 1-2: harvest findings from source material
- **Editorial Writer** (DOCUMENTER) — Phases 3, 5-6: annotate, restructure, produce prose
- **Publication Reviewer** (REVIEWER) — Phases 4, 7: critique quality, assess publishability

Must follow Pattern #44 (agent-template-gold-standard) including:
- GS2: 7-10 actionable role guidance bullets in `ROLE_GUIDANCE_LIBRARY`
- GS3: All 7 prompt sections (Platform → Context → Specialization → Workflow → Reference → Output → Role)
- GS7: Idempotent seed script at `scripts/seed-artifact-synthesis-templates.ts`
- Model: claude-sonnet-4-6 at temp 0.3 (conservative default; downgrade to haiku after measurement)

Full checklist: TODO-PROTOCOL-EXPOSURE.md Part E steps E1-E8.

### Update PROMPT-PIPELINE-HARNESS-GUIDE in prompt library GUI
**Source**: TODO-PROTOCOL-EXPOSURE-v2.md "How the Harness Selects a Protocol" section
**Effort**: ~30 min

The pipeline creation guide can surface available protocols at Step 3 by calling `list_prompts` (it runs as an external Claude Desktop client with access to that tool). Enhancement: show the user available protocols before they write the task title so they can explicitly name one.

### Expose protocols as MCP prompts for Claude Desktop "+" menu
**Source**: TODO-PROTOCOL-EXPOSURE.md "Out of Scope"
**Effort**: ~1 hour

Protocols are currently agent-facing (engine injection). A separate user-facing prompt-menu entry would let human SEs browse and read protocols from Claude Desktop's "+" button. Different consumer, different UX — the agent path (engine injection) and human path (prompt menu) can coexist.

### Task metadata `{ protocol: 'name' }` programmatic override
**Source**: Architectural-review-specialist Q12
**Effort**: ~30 min

Currently protocol selection is LLM-driven (implicit match from task description) or by convention (user writes `(protocol: artifact-synthesis)` in title). A programmatic override in task metadata would let API consumers specify the protocol without embedding it in the title. Priority: engine checks metadata.protocol > title convention > LLM inference.

Defer until: programmatic consumers actually exist and need deterministic selection.

### `loadProtocols` metadata upgrade from boolean to tag-filter array
> **Status 2026-08-17: LARGELY SUPERSEDED** — the need (narrower-than-everything injection) shipped as `loadProtocols: 'composed'` (base + the task's ONE stamped protocol, platform-resolved). A tag-filter array remains unimplemented and now has no known driver.
**Source**: Architectural-review-specialist Q11
**Effort**: ~15 min when needed

Currently `loadProtocols: true` injects ALL protocol-tagged prompts. Future: `loadProtocols: ['protocol', 'domain:security']` would let a security-focused harness load only security protocols. Add `Array.isArray()` check when the need arises. The metadata field is JSON so this is a non-breaking change.

### Protocol version history / changelog
**Source**: TODO-PROTOCOL-EXPOSURE-v2.md risks section
**Effort**: ~1 hour

The `agent_prompt_library` has a `version` string field but no history tracking. When a protocol is updated via admin API, the old content is overwritten. Future: add a `changelog` JSON field or a separate `prompt_versions` table for richer history.

### Protocol experimentation framework (A/B testing, statistical guarantees, rollback on regression)
**Source**: session 2026-04-22 — identified during harness design-purpose review
**Effort**: High — see dedicated doc
**See**: `TODO-PROTOCOL-EXPERIMENTATION.md`

Three-part feature family: randomised protocol assignment across matched pipelines, statistical significance testing on outcomes, and auto-disable of arms that regress on guardrail metrics. All three gate on a shared prerequisite — agreeing on what counts as a "good outcome" for a protocol run. The dedicated doc captures scope, open questions, and the suggested first step (a 1-page outcome-metric spec before any build).

---

## Harness Execution Engine

### Iterative improvement loops (agent B → agent A revision cycle)
**Source**: TODO-PROTOCOL-EXPOSURE-v2.md "What This Does NOT Do"
**Effort**: ~4-8 hours (engine change + protocol + testing)
**Gate**: 10+ successful pipeline runs at 85%+ average confidence

Currently the harness creates a one-directional pipeline (A → B → C → done). If reviewer B says "needs work", a human must manually create a new task. Automated revision cycles (B's output feeds back to A for revision, then B re-reviews) require a "re-execute task" engine capability + a protocol describing the loop.

The protocol-as-prompt pattern is the extension point: a future `iterative-review-protocol` would describe the revision cycle, and the engine would need one small addition.

### Agent-to-agent handoff (specialist spawns specialist)
**Source**: TODO-PROTOCOL-EXPOSURE-v2.md, Apr 10 architectural discussion
**Effort**: Large + dangerous
**Gate**: 10+ successful pipelines at 85%+ confidence + concrete use case where single-level orchestration demonstrably fails

Pattern: "recommend, don't spawn" — specialists recommend follow-up tasks; the harness decides whether to approve. This gives the "agent needs another agent" capability without unbounded recursion.

Do NOT implement until the maturity gate is met.

### Conditional branching (execute B if X, C if Y)
**Source**: TODO-PROTOCOL-EXPOSURE-v2.md future roadmap table
**Effort**: Small engine change ("skip this task" capability based on condition from prior task output)

Not needed currently. The POV domain is inherently sequential. The protocol-as-prompt pattern is the extension point when a concrete use case arises.

### §4.7 stress test re-run on fully-activated state
**Source**: BC73 implementation-plan Phase 3 step 3.12
**Effort**: ~30 min, requires agent teams enabled

The Apr 8 morning stress test (100/100) ran on the intermediate state before `mcp-server-http-clean.js` had ts-node registered. The current post-Phase-2-proper state has more activated TS code. Re-running would tighten the whitepaper §4.7 claim. Nice-to-have, not blocking.

---

## OAuth & Session Management

### Populate RefreshToken clientId/provider/audience fields
**Source**: TODO-oauth-refresh-token-database-persistence.md Limitation 1
**Effort**: ~1 hour across 3 write sites
**Blocks**: DB-persistence TODO Phase 4 Week 2 (dual-write feature flag)

All 3 RefreshToken create calls (login, oauth/callback, refresh) only set `token`, `userId`, `expiresAt`. The `clientId`, `provider`, `audience` columns exist but are never populated. Cannot build "revoke this session" UI without session attribution.

### Provider revocation propagation
**Source**: TODO-oauth-refresh-token-database-persistence.md Limitation 2
**Effort**: ~2 hours for option 1 (periodic provider token probe)
**Blocks**: DB-persistence TODO Phase 4 Week 2

Revoking on github.com doesn't cut off paichart access because paichart uses first-party JWTs. Three fix options documented:
1. Periodic provider token probe on refresh (~200ms per refresh)
2. Shorter refresh_token TTL (7 days → 24h)
3. `/settings/sessions` UI with explicit revoke

### GitHub App "Profile (write)" permission
**Source**: Apr 9 OAuth scope discussion
**Effort**: 5 min manual action on github.com/settings/apps

The MCP Claude Desktop consent screen still shows "Profile (write)" because the GitHub App permissions are configured on github.com, not in code. The code-side scope was reduced to `user:email` (commit `298d9122`) but the GitHub App permissions page needs manual update: Account permissions → Profile → "No access".

---

## Data Quality & Observability

### Historical execution records have null agentTemplateId
**Source**: Apr 13 protocol injection debugging
**Effort**: ~15 min SQL backfill

Hundreds of execution records have null `agentTemplateId`. New executions are fixed (root fix in `agentTaskService.ts`). Backfill: `UPDATE agent_executions ae SET "agentTemplateId" = t."agentTemplateId" FROM tasks t WHERE t.id = ae."taskId" AND ae."agentTemplateId" IS NULL AND t."agentTemplateId" IS NOT NULL;`

### alpha-vantage-market-data service broken (0.1% success rate)
**Source**: Phase 3 post-UAT audit item #6
**Effort**: ~30 min investigation

Alpha Vantage free-tier API key throttled since ~Mar 26. 23K+ errors. Options: rotate key, upgrade to paid tier, fix caller rate limits, or find alternative data provider. Deferred per Steve's instruction (transitory test API).

### Frontend enum drift
**Source**: BC73 implementation-plan "Non-goals" line 749
**Effort**: Unknown — separate investigation needed

Noted as out of scope for the BC73 workstream. May need a similar discovery sweep for frontend/backend enum parity.

---

## Fuzzy Search

### Stage name lookup in task.create — `contains` fallback
**Source**: Apr 13 investigation item #1
**Status**: Investigated — NOT a bug (uses exact Prisma queries, not findBestMatch)
**Note**: The `contains` partial match at Priority 4 (`stage-resolver.ts:143`) could match wrong stages within a POV if stage names share substrings. Low risk because it's scoped to a single POV. Monitor, don't fix.

### Apply "Did you mean?" pattern to template lookup
**Source**: Apr 13 fuzzy search fix
**Effort**: ~15 min

The POV lookup now shows "Did you mean?" for Tier 4 matches. The template lookup in the same file uses the same `findBestMatch` (now with default threshold 50) but doesn't have the clarification UX. Add when template-name ambiguity becomes a real issue.

### GUI monitoring + artifacts for MCP-initiated executions
**Source**: Apr 14 investigation
**Effort**: ~30 min (15 lines per component + visual testing)

The GUI's AgentMonitoringView and ArtifactViewer only show executions initiated from the GUI. MCP-initiated executions (via `agent.execute`) are invisible because:
- MonitoringView gets `executionId` by parsing `task.agentLog` for "Execution started with ID: XXX" — MCP executions don't write to this field
- ArtifactViewer only fetches artifacts when `executionId` is set — null for MCP executions

**Fix**: Add a `useEffect` on mount that calls `/api/agent-executions?taskId=${task.id}&limit=1` to get the latest execution regardless of source (API already exists). Set `executionId` from the result → downstream polling + artifact loading works.

Files: `components/poveditor/pov/components/AgentMonitoringView.tsx` (line ~75) and `components/poveditor/pov/components/ArtifactViewer.tsx` (line ~80). Both need the same pattern.

---

## Documentation & Patterns

### `TypeError: s is not a constructor` — self-resolved follow-up
**Source**: TODO-RATE-LIMIT-FIX.md follow-up line 64
**Status**: Self-resolved by Phase 2 proper (zero occurrences since Apr 8 deploy)
**Action**: Close. The webpack-bundled ESM/CJS interop bug was fixed as a side effect of activating the .ts tree.

### MCP write path for prompts
**Source**: TODO-PROTOCOL-EXPOSURE-v2.md "Out of Scope"
**Effort**: ~2-4 hours

Currently prompts can only be created/updated via admin REST API. A future `registry(action: "update-prompt")` MCP tool would let authorized users edit protocols from Claude Desktop/ChatGPT. Not needed until non-admin users need to edit protocols.

---

## Priority Summary

| Priority | Item | Effort |
|---|---|---|
| **HIGH** | Part F: 3 synthesis templates | 2-3h |
| **HIGH** | RefreshToken field population (blocks DB-persistence) | 1h |
| **MEDIUM** | Provider revocation propagation (blocks DB-persistence) | 2h |
| **MEDIUM** | Pipeline guide protocol selection enhancement | 30m |
| **MEDIUM** | Historical execution agentTemplateId backfill | 15m |
| **LOW** | Protocols as MCP prompts (human-facing) | 1h |
| **LOW** | Task metadata protocol override | 30m |
| **LOW** | loadProtocols boolean → array upgrade | 15m |
| **LOW** | Protocol version history | 1h |
| **LOW** | Template lookup "Did you mean?" | 15m |
| **LOW** | MCP write path for prompts | 2-4h |
| **GATED** | Iterative improvement loops | 4-8h (after 10+ pipelines) |
| **GATED** | Agent-to-agent handoff | Large (after maturity gate) |
| **DEFERRED** | Conditional branching | Small (when use case arises) |
| **DEFERRED** | §4.7 stress test re-run | 30m (nice-to-have) |
| **DEFERRED** | Frontend enum drift | Unknown |
| **DONE** | TypeError: s is not a constructor | Self-resolved |
| **MANUAL** | GitHub App Profile permission | 5m on github.com |
