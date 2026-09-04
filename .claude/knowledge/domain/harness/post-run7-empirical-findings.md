# Post-Run 7 Empirical Findings — Truncation + Tool-Call Patterns

**Created**: 2026-04-29
**Source**: `cline_docs/TODO-POST-RUN7-FOLLOWUPS.md` items #1 + #6 (combined empirical discovery)
**Method**: SQL queries against `agent_artifacts` for last 30 days of `result.json` artifacts on prod
**Companion**: `run6-run7-dataflow-evidence.md` (single-run evidence) + `run-comparison.md` (run-series tracker)

---

## Headline finding

**Synthesis-pipeline middle layers (Editorial Writer + Artifact Harvester) account for ALL meaningful chained-context truncation**. The 50KB tool-result truncation cap hits them at 28.6% rate vs ≤6% for any other role. Same two roles are also the only ones consistently calling `agent.results(verbose: true)` (1.0-1.1 calls per run). The redundant re-fetch IS the cause; the truncation is the consequence; the Editor's self-disclosed *"Harvester's equity findings were in the truncated portion"* (Run 6) is the proof.

This validates the war story #6 lesson (chained-context-prefer guidance) but reveals the prose-only mitigation isn't fully sticking on these two specific roles. Worth tightening their role guidance OR adding a server-side nudge at `agent.results` for tasks with auto-chained predecessors.

---

## Query 1: 5MB artifact-content truncation prevalence (BC38 cap)

```sql
SELECT
  CASE WHEN aa.content LIKE '%[TRUNCATED: exceeded 5MB limit]' THEN 'truncated' ELSE 'ok' END as state,
  count(*) as artifacts,
  round(avg(length(aa.content)/1024.0)::numeric, 1) as avg_kb,
  round(max(length(aa.content)/1024.0)::numeric, 1) as max_kb
FROM agent_artifacts aa
WHERE aa."createdAt" > NOW() - INTERVAL '30 days'
GROUP BY state ORDER BY state;
```

| State | Artifacts | Avg KB | Max KB |
|---|---|---|---|
| ok | 279 | 163.5 | 4,027.1 |
| truncated | 1 | 5,119.8 | 5,119.8 |

**Verdict**: 5MB BC38 truncation is rare — **0.36% rate**. NOT a systemic concern. The single hit was at exactly the cap (5119.8 KB). Max non-truncated artifact reached 4027 KB — close enough to the cap to be worth keeping.

This is **NOT** the truncation Run 6 Editor noticed. Different mechanism.

---

## Query 2: 50KB tool-call result truncation prevalence (c1492c70 cap)

The 50KB cap from commit `c1492c70` (2026-04-28) limits the size of any single tool call's `result` value INSIDE `result.json.toolCalls[]`. When a tool call returns >50KB, the engine replaces the body with a `{truncated, originalSize, preview, note}` shape. Detected by grepping for the marker phrase `50KB persistence threshold`:

```sql
SELECT
  count(*) filter (WHERE aa.content::text LIKE '%50KB persistence threshold%') as truncated,
  count(*) as total,
  round(100.0 * count(*) filter (WHERE aa.content::text LIKE '%50KB persistence threshold%') / count(*), 1) as pct
FROM agent_artifacts aa
WHERE aa."createdAt" > NOW() - INTERVAL '30 days' AND aa.name = 'result.json';
```

| Truncated | Total | Pct |
|---|---|---|
| 6 | 140 | **4.3%** |

**Per-role breakdown** (`substring` regex used to bypass JSONB cast errors on artifacts with unescaped 0x0a):

| Role | Runs | Truncated | Truncation rate |
|---|---|---|---|
| **editorial_writer** | 7 | **2** | **28.6%** ⚠️ |
| **artifact_harvester** | 7 | **2** | **28.6%** ⚠️ |
| business_analyst | 18 | 1 | 5.6% |
| security_analyst | 35 | 1 | 2.9% |
| pipeline_harness_orchestrator | 18 | 0 | 0.0% |
| technical_writer | 16 | 0 | 0.0% |
| solution_architect | 14 | 0 | 0.0% |
| publication_reviewer | 7 | 0 | 0.0% |
| synthesis_source_acquirer | 6 | 0 | 0.0% |
| research_analyst | 5 | 0 | 0.0% |
| (10 other roles) | 1-2 each | 0 | 0.0% |

**Verdict**: 50KB tool-result truncation is **concentrated**, not distributed. Editorial Writer + Artifact Harvester at **28.6% each** vs every other role at <6%. These two roles drive the entire signal.

---

## Query 3: `agent.results` call concentration per role

Why are those 2 roles truncating? Hypothesis: they call `agent.results(verbose: true)` to fetch upstream content despite chained context being sufficient. The verbose response is large (5-30KB normal, 100-300KB verbose with toolCalls), so re-fetching upstream's full result.json into your own toolCalls hits the 50KB cap.

Counting `agent.results` references per role:

```sql
SELECT
  role, runs, avg_tools, avg_agent_results_calls
FROM (
  SELECT
    substring(aa.content from '"agentRole":\s*"([^"]+)"') as role,
    count(*) as runs,
    round(avg((length(aa.content) - length(replace(aa.content, '"server":', '')))/length('"server":'))::numeric, 1) as avg_tools,
    round(avg((length(aa.content) - length(replace(aa.content, '"agent.results"', '')))/length('"agent.results"'))::numeric, 1) as avg_agent_results_calls
  FROM agent_artifacts aa
  WHERE aa."createdAt" > NOW() - INTERVAL '30 days' AND aa.name = 'result.json'
  GROUP BY role HAVING count(*) >= 3
) t ORDER BY avg_agent_results_calls DESC;
```

| Role | Runs | Avg tools/run | Avg agent.results calls/run |
|---|---|---|---|
| **editorial_writer** | 7 | 5.7 | **1.1** ⚠️ |
| **artifact_harvester** | 7 | 11.3 | **1.0** ⚠️ |
| pipeline_harness_orchestrator | 18 | 16.8 | 0.1 |
| publication_reviewer | 7 | 3.7 | 0.0 |
| business_analyst | 18 | 12.3 | 0.0 |
| solution_architect | 14 | 9.3 | 0.0 |
| research_analyst | 5 | 13.2 | 0.0 |
| technical_writer | 16 | 13.8 | 0.0 |
| synthesis_source_acquirer | 6 | 30.8 | 0.0 |
| security_analyst | 35 | 11.3 | 0.0 |

**Verdict**: only 3 roles call `agent.results`:
1. **editorial_writer** at 1.1/run (consistent every run)
2. **artifact_harvester** at 1.0/run (consistent every run)
3. pipeline_harness_orchestrator at 0.1/run (rare — likely SYNTHESIZE-time introspection of children)

**The correlation is exact**: editorial_writer + artifact_harvester are simultaneously
- the 2 highest agent.results callers (1.0-1.1/run vs 0.0 for everyone else)
- the 2 highest truncation rates (28.6% each vs <6% for everyone else)

This is the chained-context-prefer non-compliance pattern from war story #6 (commit `1a16e49b`), surviving on these specific roles even after the role-guidance fixes.

The pattern is **not random**. These are the synthesis-pipeline INTERMEDIATE roles (Harvester reads Acquirer; Editor reads Harvester). Synthesis pipelines have:
- The largest individual data flows (Acquirer's normalized event table can be 200-300KB)
- The longest chains (4-child for synthesis vs 3-child for default Security Assessment)
- The roles where the cumulative chained context is most likely to exceed any reasonable single-call response budget

---

## Notable: Reviewer (synthesis leaf) demonstrates compliance is possible

**publication_reviewer**: 7 runs, **3.7 tools/run, 0.0 agent.results, 0.0% truncation**.

Same protocol prose. Same chained-context architecture. Same upstream constraints (Editor's article in §6 Pipeline Context). Yet zero re-fetches.

The Reviewer's role guidance has the strongest chained-context-prefer language (post-`4fa3fafa` Run 2 fix where the Reviewer fabricated a critique without reading the article; the harness diagnosed this and added explicit "**The Editorial Writer's article IS in your §6 Pipeline Context as auto-chained finalResponse. Read it there — do NOT try to fetch the artifact by ID**" prose). That prose works empirically.

The Editor + Harvester role guidance is less explicit on this point — and that's where compliance falls apart.

---

## Implication for Session 3 (#6 follow-up)

The empirical case is strong enough to act on. Two paths:

### Path A — Tighten role guidance (low cost)

Add explicit failure-mode warning to `editorial_writer` + `artifact_harvester` role-guidance entries (similar shape to the Reviewer's post-`4fa3fafa` warning):

> **Do NOT call `agent.results(verbose: true)` to fetch upstream content** — your dependencies' full output is already in §6 Pipeline Context. Re-fetching via `agent.results` triggers the 50KB tool-result truncation cap (`c1492c70`), and the truncated content lands in YOUR result.json — making YOUR result inaccessible to YOUR downstream specialist via chained context. Empirically observed in 28.6% of editorial_writer + artifact_harvester runs (2026-04-29 #1+#6 discovery). Read the §6 block; use the chained content directly.

Cost: ~10 LOC of role-guidance prose × 2 roles + a re-seed. ~30 min. Could land tomorrow.

### Path B — Server-side guard (architectural)

When `agent.results(verbose: true)` is called against a task that's an auto-chained predecessor of the current task, the MCP handler returns a structured warning (or stripped response) + the chained context already in §6. Don't block the call (some legitimate uses), but nudge.

Cost: ~50-80 LOC handler edit + tests + Run 8 validation. ~2-3h. More architecturally complete.

### Recommendation

**Try Path A first** — it's the cheapest possible fix for the empirically demonstrated problem. If a Run 8 + Run 9 measurement still shows ≥15% truncation rate on these two roles, then escalate to Path B. The Reviewer's post-`4fa3fafa` evidence shows targeted role-guidance prose CAN move compliance from 0% adherence to 100% adherence, so Path A has good empirical priors.

**Defer**: Path B should be a separate plan with specialist review (event-system-specialist for the handler-side guard logic). Don't mix the two attempts.

---

## Implication for Session 3 (#1 follow-up)

The truncation observation that prompted #1 (Run 6 Editor's "Harvester findings in the truncated portion") is empirically real but **NOT a separate truncation budget problem** — it's a downstream consequence of the chained-context-non-compliance pattern in #6. The 50KB cap is sized correctly (other roles never hit it); the agents in question shouldn't be re-fetching through agent.results in the first place.

**Therefore**: don't pursue a separate chained-context inject budget (the original #1 hypothesis). Pursue Path A above instead — fix the cause, not the symptom.

If the role-guidance fix lands and 30+ days of subsequent data still show truncation in synthesis pipelines, THEN reconsider a separate inject budget.

---

## Implication for the seed-protocol-prompts.ts protocol prose

The synthesis protocol's Phase 1-2 (Harvester) + Phase 3-6 (Editor) sections describe each phase's READ shape (chained context or upstream artifact reading) but don't have the "do NOT re-fetch via agent.results" warning that the Phase 4+7 (Reviewer) section gained post-`4fa3fafa`. Adding the same warning to those two phase sections is the same prose change as the role-guidance fix above (one in the protocol, one in the role guidance). Both should land together for max coverage.

---

## Methodological notes

1. **30-day window** covers Runs 1-7 of the energy-quarterly synthesis series + ad-hoc runs + Run 7 default-shape. Larger sample than a single-run analysis.
2. **`substring` regex for agentRole** instead of `::jsonb->>'agentRole'` — some artifacts have unescaped 0x0a inside string literals which break the jsonb cast. Regex sidesteps this.
3. **`length(content) - length(replace(...))` arithmetic** counts substring occurrences without needing jsonb. Works for "tool calls" (count `"server":`) and "agent.results calls" (count `"agent.results"`).
4. **`HAVING count(*) >= 3`** filters out roles that only ran once or twice — avoids noisy single-sample results.
5. **Selection bias caveat**: the 30-day window is dominated by synthesis-pipeline runs (Runs 1-7 series). For default-shape pipelines (Run 7 only), sample is small. The Run 7 Roadmap leaf (business_analyst) showed 5.6% truncation — within noise, but worth re-measuring after a few more default-shape runs.
