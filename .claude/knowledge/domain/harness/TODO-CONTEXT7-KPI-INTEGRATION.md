# TODO: Context7 + KPI + Harness Integration

> **Created**: 2026-04-10 | **Updated**: 2026-04-11 | **Status**: Planning
> **Goal**: Activate dormant KPI infrastructure + integrate Context7 as a Hub service, with harness integration hooks for both. Improve confidence scoring via calibrated examples and a simple objective guard.

---

## Why Combine These

- **Context7** provides real-time library knowledge (what's current, what's deprecated)
- **KPI service** measures POV health and tracks progress against targets
- **Pipeline harness** is the orchestration layer that both consume and feed — Context7 enriches agent prompts, KPIs capture agent output quality
- **Recommendation engine** is downstream of KPI (deferred until KPIs produce real scores)
- All three need MCP Hub exposure and share the same execution lifecycle

### Dependency Chain

```
Context7 (knowledge)  ──┐
                        ├──▶  Harness (orchestration)  ──▶  KPI (measurement)  ──▶  Recommendations (reaction)
KPI (targets)  ─────────┘                                        ▲                         │
                                                                 │                         │
                                                                 └─────────────────────────┘
                                                                   (future: KPI miss triggers rec)
```

**Build order**: Context7 Hub service (Phase 1) → KPI activation (Phase 2) → Simple harness hooks (Phase 3) → Confidence calibration (Phase 4) → Recommendations (Phase 5, deferred)

**Phases 1-4 are independently startable** — Phase 4 (confidence rubric + guard) can happen today with zero dependencies on Phases 1-3.

---

## Phase 1: Context7 as Hub Service (1-2 days)

### 1a. Register as External Service (~30 min) — DONE
- [x] Register `context7-docs` via `registry(action: "register")` pointing at `https://mcp.context7.com/mcp`
- [x] Category: `ai-intelligence`
- [x] Tools: `resolve-library-id`, `query-docs` with full inputSchemas (Grade A)
- [x] Verified: Grade A quality, 2 tools with full schemas, serviceId: `cmnthq55x0004yxus188xkcw6`
- [x] Tested: both `resolve-library-id` and `query-docs` working via `services(action: "call")` (~1.2-1.7s response)

### 1b. Docker Proxy with Caching (Gold Standard v2, ~4 hours)
- [ ] Create `services/context7-docs/` on port 3107
- [ ] Follow gold standard v2 pattern (SSE transport, ensureObject, _context stripping)
- [ ] Add LRU cache: library IDs (1h TTL), docs (15m TTL)
- [ ] Add batch tool: `get_docs_for_stack(["prisma", "next.js", "tailwind"])`
- [ ] Add cross-library search: `search_across_libraries(topic: "authentication")`
- [ ] Trust model: TRUSTED (internal Docker, no external OAuth needed)
- [ ] Compliance: add to BOTH policy lists (service-call-policy.js + service-approval-policy.js)
- [ ] Seed script: `scripts/seed-context7-docs.ts`
- [ ] Health check: ping Context7 upstream, report degraded if unreachable
- [ ] CI/CD: add to docker-services-deploy.yml

### 1c. Named Workflows (~1 hour)
- [ ] `library-research-workflow` — resolve + fetch docs + notify team
- [ ] `tech-stack-audit-workflow` — parallel docs fetch for full stack
- [ ] Seed workflows into MCPWorkflowExecution or named workflow store

---

## Phase 2: Activate KPI Service (2-3 days)

### 2a. Fix calculateKPI() Security Issue
- [ ] Replace `new Function()` with safe predefined formula engine
- [ ] Options: formula map (PERCENTAGE: `current/target*100`), or `isolated-vm` for custom formulas
- [ ] Decision: predefined formulas cover 95% of use cases, defer custom until needed

### 2b. Wire Up Missing Endpoints
- [ ] Implement `/api/pov/kpi/{kpiId}/history` (HistoryChart.tsx depends on this)
- [ ] Complete KPI detail page (`/pov/[povId]/kpi/[kpiId]`) — currently a stub
- [ ] Complete KPI templates page — currently a stub

### 2c. Expose as Internal MCP Service
- [ ] Add KPI tools to `paichart-project-service` internal router (or create `paichart-kpi-service`)
- [ ] Tools: `kpi.list`, `kpi.details`, `kpi.history`, `kpi.update`, `kpi.health_score`
- [ ] `kpi.health_score` — aggregate weighted KPI scores into single POV health metric
- [ ] Accessible via `services(action: "call")` and `services(action: "workflow.execute")`

### 2d. Dashboard Integration
- [ ] KPI summary panel on main POV dashboard
- [ ] POV health score badge (derived from weighted KPIs)

---

## Phase 3: Harness Integration (Half day)

Keep this minimal. Context7 is a Hub service that agents can call via tools — no prompt injection machinery needed yet. KPI gets a simple post-pipeline write. Revisit deeper integration only after Phases 1-2 prove value.

### 3a. KPI → Post-Pipeline Update

**Where**: `agentExecutionEngine.ts` → after marking SUCCESS

After a pipeline completes, write a simple KPI entry if the POV has KPIs configured:

- [ ] After pipeline SUCCESS, check if POV has POVKPI records
- [ ] If yes, call `kpi.update` via internal router with: success/fail, average confidence, duration
- [ ] Append to `POVKPI.history[]` for HistoryChart.tsx
- [ ] If no KPIs configured, skip silently

That's it. No new modules, no metric-to-KPI mapping engine, no kpi-reporter.ts. One function call in the existing post-execution path.

### 3b. Context7 → Available as Hub Tool (No Prompt Injection)

Context7 is registered as a Hub service (Phase 1). Agents can already call Hub services via their tool set. If an agent needs library docs, it calls Context7 the same way a human would from ChatGPT.

**Not building yet**:
- ~~§7 Library Reference prompt injection~~ — speculative, adds latency and token cost
- ~~context7-enricher.ts~~ — new module for a problem we haven't confirmed exists
- ~~Context chaining enrichment~~ — over-engineered
- ~~Elicitation rule families for deprecated API detection~~ — premature

**Revisit when**: We observe agents producing code with deprecated APIs frequently enough to justify automated injection. Track this manually for now.

---

## Phase 4: Confidence Score Calibration (~1 day)

### The Problem

The `confidenceScore` is the most load-bearing metric in the harness — it drives the retry/escalation loop (>= 70 proceed, 50-69 retry, < 50 escalate). But it's entirely self-reported by the LLM with no calibration. An agent can claim "Confidence: 92/100" while half its tool calls failed.

The engine already captures objective metrics in `qualityMetrics` (tool call success/fail, total turns, hitMaxTurns) but these are stored and ignored for decisions.

### The Fix: Calibrated Examples + Simple Objective Guard

Instead of building a complex composite scoring system, fix the problem at the source (uncalibrated self-assessment) and add one objective safety net.

#### 4a. Calibrated Confidence Rubric (~30 min, prompt-only change) — DONE

**Where**: `scripts/seed-harness-template.ts` → specialist prompt section (§8 Output Requirements)

Replace the bare "end with Confidence: N/100" instruction with a rubric that includes concrete examples. This tells the LLM what the numbers actually mean:

```
Rate your confidence using this rubric:

95-100: Complete solution, all tool calls succeeded, output verified
        against requirements, no assumptions made.
        Example: "I queried all 3 data sources, cross-referenced the
        results, and the analysis covers every requirement in the brief."

80-94:  Solid solution but made 1-2 reasonable assumptions that couldn't
        be verified. All critical tool calls succeeded.
        Example: "Analysis is complete but I assumed the Q3 data follows
        the same format as Q2 — I couldn't verify because the endpoint
        returned a timeout on one call."

60-79:  Core problem addressed but gaps remain. Some tool calls failed
        or returned unexpected data. Output needs human review.
        Example: "I completed the risk assessment but 2 of 5 data
        sources were unavailable. The assessment covers 60% of the
        portfolio."

40-59:  Partial progress only. Significant blockers encountered.
        Output is a starting point, not a deliverable.
        Example: "I identified the schema structure but couldn't
        execute the migration because permissions were denied.
        Here's the migration plan for human execution."

Below 40: Blocked. Could not meaningfully progress. Escalate.
        Example: "The API credentials are invalid and all 3
        alternative approaches failed. Human intervention required."
```

**Why this works**: Research and practice show that LLMs calibrate significantly better when given concrete examples of what each score band looks like. The examples anchor the numbers to observable outcomes rather than gut feel.

**Impact**: High — addresses the root cause (LLM doesn't know what the numbers mean). Zero code changes, just a prompt template update.

**File**: `scripts/seed-harness-template.ts` (the §8 Output Requirements section is now in `lib/agents/harness/build-agent-prompt-body.ts:buildAgentPromptBody` since B1-S2 — NOT `agentExecutionEngine.ts`, which only delegates; edit the §8 rubric there)

#### 4b. Simple Objective Guard (~20 lines of code)

**Where**: `agentExecutionEngine.ts` → after confidence extraction (~line 910)

One safety net: if tool call failure rate > 50%, cap the confidence score at 60 regardless of what the LLM claims. This catches the pathological case where the LLM ignores its own evidence.

```typescript
// After parsing confidenceScore from LLM output (~line 910)
const toolFailRate = failedToolCalls / Math.max(toolCallResults.length, 1);
if (toolFailRate > 0.5 && confidenceScore !== null && confidenceScore > 60) {
  logger.warn({
    msg: 'Confidence capped: tool failure rate exceeds 50%',
    original: confidenceScore,
    capped: 60,
    toolFailRate: Math.round(toolFailRate * 100),
  });
  confidenceScore = 60;
}
```

**Why this and not a full composite**: Only 2 of the 6 proposed composite metrics actually matter — tool call success rate and the LLM's own confidence. The rest (turn efficiency, duration, artifact completeness, predecessor health) add complexity without proportional insight. This guard catches the worst cases with minimal code.

**Impact**: Prevents the specific failure mode where agents claim high confidence despite evidence of failure. ~20 lines in one file.

#### 4c. Preserve Both Scores for Visibility

- [ ] Keep `confidenceScore` in `result.json` (LLM self-report, may be capped by guard)
- [ ] Add `originalConfidence` field when guard triggers (so we can see the delta)
- [ ] Add `confidenceCapped` boolean flag
- [ ] `qualityMetrics` already captured — no change needed

```typescript
// In result.json when guard fires:
{
  confidenceScore: 60,           // Capped value (used for decisions)
  originalConfidence: 92,        // What the LLM claimed
  confidenceCapped: true,        // Flag for analysis
  qualityMetrics: {
    toolCallSuccess: { total: 8, succeeded: 3, failed: 5 },  // 37.5% success
    totalTurns: 12,
    hitMaxTurns: false,
  },
}
```

#### 4d. Monitor and Evaluate

After deploying 4a + 4b, observe for 1-2 weeks:
- [ ] How often does the guard fire? (If rarely → examples alone fixed it)
- [ ] Are confidence scores better distributed? (Less clustering at 85-95?)
- [ ] Does retry rate change? (Should increase slightly — healthier)
- [ ] If the guard fires frequently, consider tightening (40% failure threshold) or adding a second guard (e.g., hitMaxTurns → cap at 70)

**If examples + guard prove insufficient**: Revisit the composite KPI approach (see Appendix A) with real data about what's actually failing.

---

## Phase 5: Recommendations Integration (Deferred)

**Deferred until**: KPIs are producing real scores from pipeline executions (Phase 3c working).

Recommendations are downstream of KPI — they react to KPI state, they don't produce it. No point wiring them until the measurement layer is live.

### 5a. KPI Misses Trigger Recommendations
- [ ] When KPI score drops below threshold, generate recommendation
- [ ] Recommendation includes: what's behind, suggested action, priority
- [ ] Wire into existing recommendation engine

### 5b. Context7-Enriched Recommendations
- [ ] When recommendation involves a specific library/technology, fetch Context7 docs
- [ ] Inject current API references into recommendation text
- [ ] Prevents recommendations from suggesting deprecated patterns

---

## Phase 6: Workflow Patterns (Ongoing)

### Named Workflows Combining All Three
- [ ] `pov-health-report` — KPI scores + task status + Context7 docs for blocked technologies
- [ ] `weekly-kpi-digest` — parallel KPI fetch across POVs + email summary
- [ ] `tech-debt-audit` — Context7 checks current versions vs. what POV uses, KPI tracks migration progress
- [ ] `pipeline-retrospective` — post-pipeline KPI update + Context7 doc check on any libraries referenced

---

## Knowledge Layer: Vector DB Options (Future Phase)

### The Two Knowledge Layers

Context7 and a vector database solve different problems and are complementary, not competing:

| Layer | What it knows | Example query | Source |
|-------|--------------|---------------|--------|
| **Context7** (external knowledge) | Current public library docs, APIs, deprecations | "What's the current Prisma `createMany` API?" | Public library documentation |
| **Vector DB** (internal knowledge) | Past execution artifacts, codebase patterns, KPI history | "How did we solve a similar authentication task last month?" | Platform's own execution history |

Context7 answers "what does the world know?" — a vector DB answers "what does *our platform* know?"

### Use Cases for Vector Search in the Harness

1. **Semantic artifact retrieval** — Find similar past `result.json` artifacts and inject as context. More powerful than context chainer which only passes immediate predecessor output.
2. **Template recommendation** — Match task descriptions to best template type by similarity to past successful executions.
3. **KPI pattern matching** — Find POVs with similar KPI trajectories.
4. **Codebase RAG** — Embed the platform's own codebase for internal pattern queries.
5. **Failure pattern detection** — Search similar past failures to surface known fixes.

### Options Evaluated

| Option | Type | Pros | Cons | Fit |
|--------|------|------|------|-----|
| **pgvector** | PostgreSQL extension | Zero new infrastructure (already on PG), Prisma support via raw queries, single backup/restore | Limited to ~1M vectors before perf degrades | Best for starting |
| **Pinecone** | Managed SaaS | Purpose-built, scales to billions, serverless option | External dependency, cost, data leaves infrastructure | Best if volume exceeds PG capacity |
| **Qdrant** | Self-hosted (Rust) | Fast, Docker-native (fits gold standard pattern), open source | Another container to manage | Good middle ground |
| **Weaviate** | Self-hosted / Cloud | Full-featured, built-in vectorization | Heavy (Java-based), resource-hungry | Over-engineered |
| **ChromaDB** | Lightweight | Simple API | Python ecosystem, not production-grade | Not a fit |
| **Turbopuffer** | Serverless | Pay-per-query, no infrastructure | New/unproven | Worth watching |

### Recommendation: Start with pgvector

You're already on PostgreSQL. It's a `CREATE EXTENSION` away — zero new containers, zero new backup procedures.

**When to upgrade**: If artifact volume exceeds ~500K embeddings or query latency becomes a concern, evaluate Pinecone (managed) or Qdrant (Docker, fits gold standard pattern).

### Not Yet Scheduled

This is a future enhancement. The trigger is whether the calibrated confidence approach (Phase 4) and KPI data (Phase 3c) reveal gaps that semantic artifact retrieval would fill.

---

## Appendix A: Composite KPI (Deferred)

If calibrated examples + the simple objective guard (Phase 4) prove insufficient, a full composite KPI could be revisited. The design would compose a weighted score from:

- Tool call success rate (objective, already in qualityMetrics)
- Turn efficiency (objective, turnsUsed / maxTurns)
- Execution duration (objective, needs baseline calibration per template type)
- LLM confidence (subjective, one input among many)
- Artifact completeness (objective, binary check)
- Predecessor chain health (objective, recursive)

With per-template-type weight profiles stored in `AgentTemplate.metadata.kpiWeights` feeding into per-POV aggregation via `POVKPI.weight`.

This approach requires shadow scoring (1-2 weeks), baseline calibration, threshold migration, and per-template weight tuning. It's the right tool if the simpler approach leaves significant gaps, but not worth building speculatively.

---

## Dependencies & Decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Context7 Docker vs External | Docker proxy (gold standard) vs direct registration | Start with direct registration (Phase 1a), upgrade to Docker (Phase 1b) when caching needs emerge |
| KPI as separate service vs internal router | New `paichart-kpi-service` vs extend `paichart-project-service` | Extend internal router (KPIs are POV-scoped, same domain) |
| calculateKPI replacement | Predefined formulas vs isolated-vm sandbox | Predefined formulas first, 95% coverage |
| Context7 in agent prompts | Prompt injection vs agents call it themselves | Agents call it themselves (no injection until proven needed) |
| KPI update timing | Per-child vs end-of-pipeline | End-of-pipeline only (3a), keep it simple |
| Context7 in harness | Prompt injection vs tool call | Tool call (agents call Context7 when they need it, no injection machinery) |
| Confidence improvement | Composite KPI vs calibrated examples + guard | Calibrated examples + simple guard (fixes root cause with minimal code) |
| Composite KPI | Build now vs defer | Defer to Appendix A — revisit only if simpler approach proves insufficient |
| Recommendations | Wire now vs defer | Defer until KPIs produce real scores (Phase 5) |
| Vector DB | pgvector vs Pinecone vs Qdrant vs skip | pgvector first (zero new infra), upgrade if volume exceeds ~500K |
| Embedding model | OpenAI vs Voyage vs local | `text-embedding-3-small` to start, evaluate `voyage-3` for code-heavy artifacts |

## Existing Infrastructure Reference

| Component | Location | Status |
|-----------|----------|--------|
| POVKPI model | `prisma/schema.prisma` | Active |
| KPITemplate model | `prisma/schema.prisma` | Active |
| KPI service | `lib/pov/services/kpi.ts` | Active (except calculateKPI) |
| KPI validation | `lib/validation/kpi-validation.ts` | Active |
| KPI types | `lib/pov/types/kpi.ts` | Active |
| KPI API routes | `/api/pov/[povId]/kpi/` | Active |
| KPISection UI | `KPISection.tsx` | Active |
| Harness architecture | `.claude/knowledge/domain/harness/ARCHITECTURE.md` | Reference |
| §8 Output Requirements | `lib/agents/harness/build-agent-prompt-body.ts` (shared builder since B1-S2; applies to all agents) | Active — rubric update target (Phase 4a) |
| Confidence extraction | `agentExecutionEngine.ts` (~line 894-912) | Active — guard insertion point (Phase 4b) |
| Harness template seed | `scripts/seed-harness-template.ts` | Active — rubric update target (Phase 4a) |
| Gold standard pattern | `.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md` | Reference |
| Hub prompts | `.claude/knowledge/domain/mcp/prompts/` | Reference |
| Port registry | 3107 next available | -- |
| PostgreSQL (vector candidate) | Production DB (no pgvector extension yet) | Active, no vector support |
| Agent artifacts table | `agent_artifacts` (Prisma) | Active — embedding column candidate |

---

**Estimated Total**: 5-7 days across Phases 1-4
**Quick Win**: Phase 4a (30 min) — calibrated confidence rubric in prompt, zero code
**Second Quick Win**: Phase 1a (30 min) — register Context7 as external service
**Critical Path**: Phase 2a (calculateKPI fix) unblocks KPI work; Phase 4a+4b (confidence calibration) is independent and can start today
