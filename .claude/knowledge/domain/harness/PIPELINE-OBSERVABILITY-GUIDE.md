# Pipeline Observability Guide for Administrators

**Purpose**: Step-by-step guide for administrators building, validating, or debugging Pipeline Harness runs with existing or new protocols, using the pAIchart GUI (`/pov/edit/[POV_ID]?mode=project`) as the primary surface.
**Audience**: pAIchart admins building pipelines. No SQL or terminal access assumed for the GUI path; escalation recipes provided for forensic deep-dives.
**Created**: 2026-04-29
**Worked example**: Run 5 (POV `cmogk3yzh0001yxilotomza6g`, harness `cmoig9wvn0001yx9m3qiycy8c`) — successful synthesis pipeline producing a 1500-2000 word energy-quarterly article from 3 external MCP services.

---

## When to use this guide

- **Building a new protocol** — your protocol prose is being tested for the first time; you need to verify the harness LLM follows it correctly.
- **Validating a pipeline run** — confirming a synthesis pipeline produced the customer deliverable correctly.
- **Debugging a stuck or failed run** — answering "where did it go wrong?" without reading the codebase.
- **Onboarding** — new admins learning what each GUI surface means.

## Prerequisites

- POV exists with at least one Stage where pipeline tasks live.
- Pipeline Harness template seeded (see `template(action: "list", category: "ORCHESTRATOR")`).
- Relevant protocol seeded into `agent_prompt_library` (e.g., `pipeline-orchestrator-protocol`, `artifact-synthesis-protocol`).
- MCP-authenticated user (for triggering executions; not required for read-only observability).

---

## The Three GUI Surfaces (quick map)

Open `/pov/edit/[POV_ID]?mode=project` and select the harness PIPELINE task. The **Comments & Activity** dropdown reveals three tabs:

| Tab | What it shows | When you read it |
|---|---|---|
| **Comments** | Prose narrative of the run — harness's CREATE/SYNTHESIZE comments + engine auto-comments after each execution | First — read top-to-bottom for the full story |
| **Activity Timeline** | Audit log of task-state mutations (UPDATED entries with user + timestamp) | Last — only useful for "did the task get touched?" |
| **Pipeline Results** | Aggregated dashboard: harness summary + child statuses + execution list + protocol-compliance summary | Most often — the killer overview |

A separate **Agents** tab on the task page surfaces the **Artifacts** subtab — flattened across all executions, where you read the actual `result.json` / `report.md` / `pipeline-index.json` content.

---

## Forensic question → GUI surface correlation

Every observability question maps to a primary GUI surface, with escalation paths when the GUI can't answer:

| # | Forensic question | Primary GUI surface | GUI sufficient? | Escalation |
|---|---|---|---|---|
| 1 | Did the task get created with the right shape? | Pipeline Results — HARNESS summary line | ✅ | — |
| 2 | Was Step 5a metadata wired by the harness LLM? | Comments — SYNTHESIZE comment naming the deliverable source child | ✅ for effect | SQL for raw `metadata->>'deliverableSourceTaskId'` |
| 3 | Are dependencies wired correctly? | Pipeline Results CHILDREN list + Comments PIPELINE QUEUED | ✅ | — |
| 4 | Is each execution making progress, stuck, or terminal? | Pipeline Results EXECUTIONS section | ✅ for outcome | pm2 logs for in-flight detail |
| 5 | What's happening turn-by-turn inside the LLM loop? | **Not in GUI** | ❌ | pm2 logs only |
| 6 | What artifacts were produced? | Agents tab → Artifacts subtab + "View artifacts (raw)" button | ✅ | — |
| 7 | Did the policy/extraction work correctly? | Pipeline Results "ALL CLEAR" + Comments inline annotations | ✅ for human-readable | SQL for `reportMdSource` JSONB field |

**Honest GUI gaps**:
- LLM turn-by-turn progress (Question 5) — pm2-only.
- Raw `task.metadata` JSONB values — only their *effects* are surfaced (e.g., the SYNTHESIZE comment naming "deliverable source").
- Forensic JSONB fields like `reportMdSource`, `extractFailureReason`, `protocolValidation.toolCallSummary` — summarised by Pipeline Results' "ALL CLEAR" line; deep inspection requires SQL.

---

## The 8-phase observability loop

Walks through what to read, when, and what each signal means. Worked example uses Run 5.

### Phase 0 — Pre-flight (protocol seeded + template available)

**What to do**:
1. Confirm the protocol you want is seeded by querying the prompt library:
   - **GUI path**: Settings → Prompt Library (if exposed) or use MCP `list_prompts`
   - **SQL path** (admins with DB access): `SELECT name, version FROM agent_prompt_library WHERE name = '<protocol-name>';`
2. Confirm the Pipeline Harness template is assignable: MCP `template(action: "list", category: "ORCHESTRATOR")` should include "Pipeline Harness".

**Success signal**: protocol returns the expected version (e.g., `pipeline-orchestrator-protocol` v3.7.1); harness template appears in list.
**Failure signal**: protocol missing or version doesn't match what you just seeded — re-run `npx ts-node --transpile-only scripts/seed-protocol-prompts.ts` (locally or on prod via SSH).

### Phase 1 — Trigger (create + assign + execute)

**What to do**:
1. Create the PIPELINE task. **Tip**: leave `type` unspecified to test auto-promote (`fa3cc8d8`), OR set `type: "PIPELINE"` explicitly.
2. Assign the Pipeline Harness via MCP `agent.assign(taskId, agentTemplateName: "Pipeline Harness")` — auto-promote fires here if `type` was default.
3. Execute via MCP `agent.execute(taskId)` — harness CREATE begins.

**GUI verification**:
- Open `/pov/edit/[POV_ID]?mode=project`, find your task.
- Pipeline Results tab → HARNESS summary appears (`0 children · 0 done · 0 running` initially).
- Activity Timeline → first `UPDATED` entry appears.

**Success signal**: task type shows PIPELINE in the task list; Pipeline Results tab is visible (only PIPELINE tasks render this).
**Failure signal**: Pipeline Results tab missing → task didn't get type:PIPELINE; either auto-promote didn't fire (template's `defaultRole` may not be `pipeline_harness_orchestrator`) or you assigned a different template.

### Phase 2 — CREATE-phase observation

The harness composes its child stage + child tasks + assignments + Step 5a metadata wiring. Typical wall-clock: 1m30s–2m30s.

**What to read in Comments tab** (top-to-bottom, two new entries):
1. **Mode-resolver entry** ("Mode: CREATE. No pipelineStageId in metadata — creating child stage and decomposing objective. Platform-resolved mode: CREATE...") — confirms harness was given the right mode pre-LLM.
2. **PIPELINE QUEUED comment** with:
   - **First line**: `**Child stage:** \`<id>\` — <name>` breadcrumb (GUI's Pipeline Children panel parses this)
   - **Child task list** with template assignments + dependency annotations
   - **Execution sequence** prose

   In Run 5, this comment ended with: *"4 child tasks created with dependency chain: 1. Phase 0... → Synthesis Source Acquirer | no deps | OPEN; 2. Phase 1-2... → Artifact Harvester | depends on Task 1 | OPEN; 3. Phase 3-6... → Editorial Writer | depends on Task 2 | OPEN; ⭐ deliverable source; 4. Phase 4+7... → Publication Reviewer | depends on Task 3 | OPEN (report.md suppressed)"*

   The `⭐ deliverable source` and `(report.md suppressed)` annotations are the harness's human-readable confirmation that **Step 5a metadata wiring fired correctly** — even though the actual `task.metadata` JSONB isn't directly visible.

3. **Engine auto-comment after CREATE** ("Agent Execution Complete - Role: pipeline_harness_orchestrator - Duration: 2m05s - Tool Calls: N (N succeeded, 0 failed) - Confidence: NN/100 - Artifacts: pipeline-index.json → fetch(id: ...)")

**What to read in Pipeline Results tab**:
- HARNESS line updates: `4 children · 0 done · 0 running` (children created but not yet running)
- CHILDREN section populates with the 4 child tasks, all OPEN
- EXECUTIONS section: 1 SUCCESS execution (the CREATE one)

**Success signals**:
- ⭐ deliverable source annotation present on a child (in Run 5: Phase 3-6 Editorial Writer)
- `(report.md suppressed)` annotation on a child (in Run 5: Phase 4+7 Reviewer)
- Engine auto-comment shows `Tool Calls: N (N succeeded, 0 failed)` with 0 failures
- Pipeline Results CHILDREN section count matches the dependency-chain count in the comment

**Failure signals**:
- No `⭐ deliverable source` annotation → Step 5a was likely skipped (harness LLM didn't set `metadata.deliverableSourceTaskId`). The forensic P-signal in `pipelineProtocolValidator.ts` will fire at SYNTHESIZE.
- Children created with no template assignments → Step 5 (`agent.assign`) failed; check engine auto-comment for tool-call failure breakdown.
- Missing breadcrumb on PIPELINE QUEUED comment first line → GUI Pipeline Children panel won't render; check protocol prose for breadcrumb format.

### Phase 3 — Cascade observation

Children execute in dep order. Auto-execute fires when each child's deps are met. Typical per-child wall-clock: 1–3 min depending on tool calls.

**What to read in Pipeline Results tab**:
- HARNESS line: `4 children · N done · M running` updates as cascade progresses
- CHILDREN list: each child's status pill flips OPEN → COMPLETED (no intermediate "RUNNING" — non-PIPELINE tasks have no in-flight task-status state, only execution rows have RUNNING status)

**To drill into a specific child**: click the child task in the CHILDREN list. Each child task has its own Comments + Pipeline Results (though Pipeline Results on non-PIPELINE tasks is sparser — no CHILDREN section, just EXECUTIONS).

**Stuck child detection**:
- Look at the timestamp of the most recent EXECUTIONS entry on the child; if elapsed time exceeds 2× the typical phase duration (e.g., Acquirer >5min, Harvester >3min, Editor >5min, Reviewer >3min), the execution may be stuck.
- A pm2 deploy mid-run can leave executions stuck in `RUNNING` state. **Recovery is automatic at the 20-minute mark**: the engine's `processPendingExecutions` poll runs every 10s and transitions any PENDING/RUNNING execution older than 20 minutes to FAILED, plus resets the task's `executionStatus` so the cascade can recover. Patient operators can let the watchdog handle it. Impatient operators (or those investigating mid-watchdog-cycle) can intervene manually — see "Forensic escalation: stuck executions" below.

**Success signal**: HARNESS line eventually shows `4 children · 4 done · 0 running` (or whatever your child count is).
**Failure signal**: a child's Pipeline Results EXECUTIONS shows FAILED status, OR cascade halts and HARNESS line shows `M done · 0 running` with M < total — typically means a child's deps weren't satisfied or its execution failed without auto-retry.

### Phase 4 — SYNTHESIZE-phase observation

Once all children are terminal, the retrigger reactor fires SYNTHESIZE on the harness. Harness reads child results, applies quality gates, retries if needed (50-69 band), or escalates if any < 50, otherwise synthesizes the deliverable. Typical wall-clock: 1m–2m.

**What to read in Comments tab** (three new entries):

1. **SYNTHESIZE re-entry breadcrumb** ("Mode: SYNTHESIZE. Platform-resolved: 4 of 4 children terminal. Proceeding to quality-gate each child result and aggregate findings into the final deliverable.")

2. **PIPELINE SYNTHESIS COMPLETE comment** (the centerpiece):
   - **First line**: child-stage breadcrumb
   - **📄 Final deliverable** pointer with `fetch(id: "artifact-...")`
   - **Quality gates** per phase with score and ✅/⚠ marker
   - **All child artifacts (audit trail)** with fetch IDs (showing `(review only — report.md suppressed by Step 5a)` annotation on the QA leaf, `⭐ deliverable source` on the Editor)
   - **Confidence** with avg-of-children math
   - **Key findings** — 3-5 bullets summarising the run

3. **Engine auto-comment after SYNTHESIZE** ("Agent Execution Complete - Role: pipeline_harness_orchestrator - Duration: ~1m30s - Tool Calls: N (N succeeded, 0 failed) - Confidence: NN/100 - Artifacts: pipeline-index.json → fetch + report.md → fetch")

**Pipeline Results tab updates**:
- HARNESS line: `4 children · 4 done · 0 running`
- EXECUTIONS section: now 2 executions (CREATE + SYNTHESIZE), both SUCCESS
- **ALL CLEAR — No detection signals fired** appears at the bottom (or specific signals if compliance gaps exist)

**Success signals**:
- Quality gates: every child ≥ 70 (✅ accept band) — no retries needed
- Final deliverable pointer present (the `**📄 Final deliverable:**` line in PIPELINE SYNTHESIS COMPLETE)
- Engine auto-comment shows BOTH `pipeline-index.json` AND `report.md` fetch IDs (= harness produced both artifacts)
- Pipeline Results "ALL CLEAR — No detection signals fired"

**Failure signals**:
- Quality gates: child scored < 50 (⚠ escalate band) — harness halts; admin must decide
- Quality gates: child scored 50-69 → harness retried (you'll see a `**HARNESS DIAGNOSTIC**` comment in between, plus a second execution row on the affected child task — the §7a Run 2 retry pattern)
- Final deliverable pointer missing → harness didn't compose Step 5; check engine auto-comment Tool Calls for failures
- ALL CLEAR replaced by a missing-step list (e.g., `Step 5a (CREATE): harness has no metadata.deliverableSourceTaskId — ...`) → forensic P-signal fired; harness LLM compliance gap or protocol-prose ambiguity

### Phase 5 — Customer deliverable verification

The customer fetches the harness's `report.md` for the deliverable.

**What to do**:
1. Open the **Agents** tab → **Artifacts** subtab on the harness PIPELINE task.
2. Look for `report.md` in the artifact list (will be on the SYNTHESIZE execution row, not CREATE).
3. Click to view content — should be the customer-facing prose (e.g., the 1500-2000 word article in Run 5).

**Success signal**: `report.md` is present on the harness's SYNTHESIZE execution; content is the customer deliverable (clean prose, no JSON wrapper, no metadata headings); byte-content matches the Editor's `result.json.finalResponse` (you can verify by also opening the Editor's `result.json` and comparing — but in practice, just reading `report.md` is sufficient).

**Failure signals**:
- No `report.md` on harness → engine extraction didn't fire; check `task.metadata.deliverableSourceTaskId` was set (or `agent_executions` for any failures)
- `report.md` starts with `# ⚠️ Report Extraction Failed` → engine error-header rendered (extraction failed, fail-loud guarantee). Check Pipeline Results EXECUTIONS detail or `result.json.reportMdSource.extractFailureReason` for the cause: `parse_error`, `finalresponse_not_string`, `upstream_truncated`, or `no_source_artifact`.
- `report.md` content is the harness's coordination prose ("Pipeline created, deliverable pointer at...") rather than the article → Option A defense was bypassed somehow (shouldn't happen post-2026-04-28).

### Phase 6 — Compliance check

The Pipeline Results "ALL CLEAR" line is the GUI's render of `protocolValidation.missingSteps`. Click to expand if the GUI surfaces individual signal detail.

**Common compliance signals**:
- *"Step 6: no task.comment for the Pipeline Queued breadcrumb"* — harness skipped Step 6 (rare; usually a tool-call failure)
- *"Step 5a (CREATE): harness has no metadata.deliverableSourceTaskId"* — Step 5a was skipped; pointer falls back to leaf via Phase C.3 defensive prose; customer deliverable still works but the forensic signal surfaces the wiring miss
- *"Step 5 (content): SYNTHESIZE final task.comment lacks the breadcrumb"* — first-line breadcrumb missing; Pipeline Children panel won't render correctly
- *"Step 5 (content): SYNTHESIZE final task.comment is missing the 📄 Final deliverable pointer"* — customer can't find THE deliverable
- *"Step 5 (content): SYNTHESIZE final task.comment is missing the re-run note"* — humans may try to flip task back to OPEN

**These are forensic signals, not blockers** — task.complete still succeeds. Treat them as "agent compliance gaps to investigate" rather than "the run failed."

### Phase 7 — Forensic deep-dive (when GUI is insufficient)

When the GUI surfaces don't answer the question, escalate via SQL or pm2 logs.

#### Forensic recipes

**Stuck execution**: an execution row shows `RUNNING` for >2× the typical wall-clock.
```sql
-- Check execution status + age
SELECT id, status, "createdAt", "updatedAt",
  EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int as age_sec
FROM agent_executions
WHERE "taskId" = '<child task id>'
ORDER BY "createdAt" DESC LIMIT 5;
```
If age > 600s (10 min) and status = RUNNING → likely orphaned (pm2 deploy mid-run). The 20-minute watchdog will catch it automatically; manual recovery only saves ~10 min of waiting. If you want to intervene immediately:
```sql
UPDATE agent_executions
SET status='FAILED', "endTime"=NOW(), "updatedAt"=NOW(),
    logs=array_append(logs, 'Marked FAILED <date> — pm2 deploy collision recovery.')
WHERE id='<orphan exec id>';
```
Then re-execute via MCP `agent.execute(taskId: '<child task id>')`. Cascade should resume.

**Step 5a metadata not visible in GUI**: confirm raw JSONB:
```sql
SELECT id, type, metadata->>'deliverableSourceTaskId' as source_task,
       metadata->>'suppressDefaultReportMd' as suppress_md
FROM tasks WHERE pov_id='<POV>' AND created_at > NOW() - INTERVAL '1 hour';
```

**LLM turn-by-turn**: the GUI can't show this; tail pm2 logs:
```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 500 --nostream 2>&1 | grep "<execution id>"' | tail -30
```
Look for `Agentic tool loop: turn N completed` lines — gaps between turns indicate the LLM hung.

**Engine extraction byte-identity**: confirm harness's `report.md` content matches Editor's `finalResponse`:
```sql
SELECT
  (SELECT length(content) FROM agent_artifacts WHERE name='report.md' AND "executionId"='<harness SYNTHESIZE exec>') as harness_md_bytes,
  (SELECT length(content::jsonb->>'finalResponse') FROM agent_artifacts WHERE name='result.json' AND "executionId"='<editor exec>') as editor_finalresponse_bytes,
  (SELECT content FROM agent_artifacts WHERE name='report.md' AND "executionId"='<harness SYNTHESIZE exec>') =
  (SELECT content::jsonb->>'finalResponse' FROM agent_artifacts WHERE name='result.json' AND "executionId"='<editor exec>') as byte_identical;
```
Expected: `byte_identical = t`.

**Cross-POV safety probe**: confirm no `deliverableSourceTaskId` points across tenant boundaries:
```sql
SELECT count(*) FROM tasks t1
WHERE t1.metadata ? 'deliverableSourceTaskId'
  AND (t1.metadata->>'deliverableSourceTaskId') IN (
    SELECT id FROM tasks t2 WHERE t2.pov_id != t1.pov_id
  );
```
Expected: 0.

**Pointer substitution audit** (post-v3.7.1): confirm the engine substituted the placeholder:
```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 500 --nostream 2>&1 | grep "Substituted harness report.md ID"'
```
Expected: 1 line per harness SYNTHESIZE execution with `replacements: 1`.

---

## Common signals and what they mean

Quick-reference table for unfamiliar signals you might see:

| Signal | Where seen | Meaning |
|---|---|---|
| `⭐ deliverable source` | Comments PIPELINE QUEUED + SYNTHESIZE COMPLETE | Step 5a metadata wiring fired; this child's `finalResponse` becomes the customer deliverable |
| `(report.md suppressed)` | Comments comments + Pipeline Results | Leaf has `metadata.suppressDefaultReportMd: true`; only `result.json` produced |
| `[harness report.md extracted from <Child>]` | Comments inline annotation | Engine extraction fired; harness's `report.md` content = upstream child's `finalResponse` |
| `Platform-resolved mode: CREATE/SYNTHESIZE/ORCHESTRATE` | Comments first lines of harness comments | `harnessModeResolver.ts` ran pre-LLM; mode authoritative |
| `**HARNESS DIAGNOSTIC**` | Comments between two child executions | §7a retry pattern: harness diagnosed a 25-69 child failure and re-executed it |
| `ALL CLEAR — No detection signals fired` | Pipeline Results | `protocolValidation.missingSteps` empty; no compliance gaps |
| `Step Na (CREATE): ...` / `Step N (content): ...` | Pipeline Results when not ALL CLEAR | Forensic compliance signal; non-blocking |
| `# ⚠️ Report Extraction Failed` (in `report.md`) | Agents tab → Artifacts | Engine error-header (Theme 1 fail-loud); customer pointer lands but content degraded |
| `(succeed-with-partial)` | Comments key findings | Phase 0 Acquirer surfaced partial source data; not a failure |

---

## Building a new protocol — additional checks

When you've authored a NEW protocol and are validating it for the first time, layer these checks on top of the standard 8-phase loop:

### Pre-deploy

1. **Seed the new protocol locally**, dry-run: `npx ts-node --transpile-only scripts/seed-protocol-prompts.ts`. Verify `Updated: <protocol-name> (N chars)` — chars count should match your expectation.
2. **Validator regex audit**: if your protocol introduces new step prose, verify `pipelineProtocolValidator.ts` regexes (e.g., `BREADCRUMB_RE`, `DELIVERABLE_POINTER_RE`, `RERUN_NOTE_RE`) still match your prose. Run `npx ts-node --transpile-only scripts/test-pipeline-protocol-validator.ts` for the unit-test suite.
3. **Pattern #45 GS3 Handlebars audit**: protocols are regex-only fields — no `{{...}}` syntax allowed. Grep:
   ```bash
   grep -nE "\{\{" scripts/seed-protocol-prompts.ts | grep -iE "YOUR_PROTOCOL_NAME"
   ```
   Expected: zero hits, OR only known engine-substitution placeholders like `{{HARNESS_REPORT_MD_ID}}`.

### After first run

4. **Compliance baseline check**: per the empirical 30%-baseline lesson (`pipelineProtocolValidator.ts:67`), prose-only mandates land at ~30% adherence on first sight. Don't be alarmed if Run 1 of your new protocol surfaces missing-step signals. Plan for 3-5 runs to calibrate.
5. **Run-comparison row**: append a row to `cline_docs/runs/run-comparison.md` capturing: outcome, pre-run fix-stack, surfaced issues, retry layers fired. Future runs benefit from this baseline.
6. **War story candidacy**: if your run surfaces an unexpected behavior (something the protocol prose didn't anticipate), document it in `WAR-STORIES-HARVEST.md`. The pattern-extraction discipline pays off when the same shape appears again.

### Distinguishing protocol-prose-bug from agent-LLM-compliance-miss

When a step doesn't fire, the question is "did the harness LLM not understand" vs "did the protocol prose not say it clearly":

- **Read the harness's actual SYNTHESIZE comment**. Did it explain why it skipped a step? (Sonnet often self-discloses; Haiku less so.)
- **Re-run the same protocol** with the same task description. If 2/3 runs miss the same step, **prose problem**. If 1/3, likely variance.
- **Add a forensic example to the protocol prose** ("If you skip Step Na, this concrete failure mode happens. Run X (date) was this failure mode."). Per Pattern #45 GS5, agents respond to specific failure-mode warnings better than to abstract instructions.
- **Server-side enforcement option**: per the Empirical Compliance Baseline pattern, if 3+ runs fail to land Step Na consistently, consider a 5th-point invariant addition to `task-complete-handler.ts` rather than continuing to invest in prose tuning. See `cline_docs/reviews/report-md-policy-rework-2026-04-28/implementation-plan.md` D-1 for an example.

---

## Quick-reference checklists

### 30-second admin sanity check

For a healthy run, you should see ALL of these:

- [ ] Pipeline Results: `N children · N done · 0 running`
- [ ] Pipeline Results: 2 EXECUTIONS (CREATE + SYNTHESIZE), both SUCCESS
- [ ] Pipeline Results: "ALL CLEAR — No detection signals fired"
- [ ] Comments: `⭐ deliverable source` annotation visible on one child
- [ ] Comments: PIPELINE SYNTHESIS COMPLETE with quality gates ≥ 70 per child
- [ ] Comments: Engine auto-comment after SYNTHESIZE shows BOTH `pipeline-index.json` AND `report.md` fetch IDs
- [ ] Agents → Artifacts: harness's `report.md` is present and contains the customer deliverable

### 5-minute forensic walkthrough

When something looks off, walk through these in order:

1. **Pipeline Results → HARNESS line** — quick anomaly count
2. **Pipeline Results → EXECUTIONS** — any FAILED? any > 2× expected duration?
3. **Pipeline Results → ALL CLEAR or signal list** — read each signal as a forensic clue
4. **Comments → SYNTHESIZE COMPLETE** — quality gates per child; deliverable pointer present
5. **Drill into the lowest-scoring child** — its Comments + Pipeline Results
6. **If still unclear**: SQL/pm2 escalation per Phase 7 recipes above

---

## Related references

- **Protocol files**: `pipeline-orchestrator-protocol`, `artifact-synthesis-protocol`, `HOWTO-use-pipeline-harness` (in `agent_prompt_library` table; sources at `scripts/seed-protocol-prompts.ts`)
- **Specialist file**: `.claude/agents/pipeline-harness-specialist.md` — domain expertise for engine-side work
- **Specialist file**: `.claude/agents/agent-execution-specialist.md` — engine internals, artifact policy, substitution pattern
- **Pattern registry**: `.claude/knowledge/patterns/PATTERN-REGISTRY.md` — proven patterns referenced throughout this guide
- **War stories**: `.claude/knowledge/domain/harness/WAR-STORIES-HARVEST.md` — empirical lessons from prior runs
- **Run comparison tracker**: `cline_docs/runs/run-comparison.md` — baseline metrics across run series
- **Recent rework plans**: `cline_docs/reviews/report-md-policy-rework-2026-04-28/`, `cline_docs/reviews/report-md-pointer-substitution-2026-04-29/`

---

## Worked example: Run 5 in the GUI

**Setup**: POV `cmogk3yzh0001yxilotomza6g`, harness `cmoig9wvn0001yx9m3qiycy8c`, created 2026-04-28 09:55 UTC, completed 10:28 UTC. Synthesis pipeline (Acquirer → Harvester → Editor → Reviewer) producing a 1500-2000 word energy-quarterly article.

**What an admin would see**:

1. **Comments tab (6 entries top-to-bottom)**:
   - Comment 1: SYNTHESIZE re-entry breadcrumb ("Mode: SYNTHESIZE. Platform-resolved: 4 of 4 children terminal.")
   - Comment 2: PIPELINE SYNTHESIS COMPLETE — Final deliverable pointer + quality gates (95/95/82/87 across phases) + audit trail with `(report.md suppressed)` on Reviewer + Confidence 86/100 + Key findings (12 findings harvested, EODHD partial HTTP 402 succeed-with-partial, Phase 4 self-critique found 3 conflation issues + 2 weight imbalances all resolved)
   - Comment 3: Engine auto-comment after SYNTHESIZE — pipeline-index.json + report.md fetch IDs
   - Comment 4: CREATE-mode entry ("Mode: CREATE. No pipelineStageId in metadata.")
   - Comment 5: PIPELINE QUEUED — child task list with dependency chain + ⭐ deliverable source annotation on Editorial Writer + (report.md suppressed) on Reviewer
   - Comment 6: Engine auto-comment after CREATE — pipeline-index.json fetch ID

2. **Activity Timeline tab**: 16 UPDATED entries between 19:55 and 20:28, all by Steve Terry (the MCP-authenticated user).

3. **Pipeline Results tab**:
   - HARNESS · 4 children · 4 done · 0 running
   - PIPELINE CONTEXT: Pipeline: Q1 2026 Energy Quarterly Synthesis (Run 5 20260428-0955) (cmoigat7j000fyx9mhpvv6k0p)
   - CHILDREN (4): all SUCCESS — Phase 0 Source Acquisition, Phase 1-2 Artifact Harvester, Phase 3-6 Editorial Writer, Phase 4+7 Publication Reviewer
   - EXECUTIONS (2): both SUCCESS, claude-sonnet-4-6, pipeline_harness_orchestrator. CREATE 1m 45s, SYNTHESIZE 1m 26s.
   - ALL CLEAR — No detection signals fired
   - "View artifacts (raw)" button

4. **Agents tab → Artifacts subtab**: 7 artifacts across the 6 executions in this run — pipeline-index.json (CREATE) + pipeline-index.json + report.md (SYNTHESIZE) + 4 result.json (one per child).

**Note** (pre-v3.7.1): Run 5 surfaced the deliverable-pointer chicken-and-egg — the SYNTHESIZE comment's `**📄 Final deliverable:**` pointed at the Editor's `result.json` rather than the harness's own `report.md`, because the harness LLM couldn't reference an artifact ID that didn't exist yet at compose time. v3.7.1 closed this with the `{{HARNESS_REPORT_MD_ID}}` placeholder + engine post-processing substitution. Run 6 will validate.

**For admins reading this guide**: when you see the deliverable pointer ID match the harness's own `report.md` ID (visible in Comment 6's engine auto-comment), substitution worked. When they differ — substitution didn't fire (forensic check via pm2 logs).

---

## Addendum — Sequential SQL Playbook

For admins with database access, the full forensic walkthrough as a sequence of psql commands. This is what I actually ran for Run 5 in order.

### Setup pattern

All queries below are wrapped in this SSH pattern:

```bash
ssh <PROD_USER>@<PROD_HOST> 'cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL" -c "<QUERY>"'
```

**Naming gotchas** (Prisma model → Postgres table):
- PascalCase models need quotes in SQL: `"taskId"`, `"createdAt"`, `"endTime"`, `"updatedAt"`, `"executionStatus"`, `"agentTemplateId"`
- snake_case tables (no quotes): `tasks`, `task_dependencies`, `agent_executions`, `agent_artifacts`, `agent_prompt_library`
- `tasks.created_at` (snake_case) vs `agent_executions."createdAt"` (camelCase) — easy to confuse

### Step 1 — Discover the run

What tasks exist for this POV in the recent window?

```sql
SELECT t.id, substring(t.title from 1 for 60) as title,
       t.type, t."executionStatus", t.status,
       t.metadata->'deliverableSourceTaskId' as deliverable_src,
       t.metadata->'suppressDefaultReportMd' as suppress_md,
       t.created_at
FROM tasks t
WHERE t.pov_id='<POV_ID>'
  AND t.created_at > NOW() - INTERVAL '60 minutes'
ORDER BY t.created_at;
```

**What to look for**:
- One row with `type=PIPELINE` (the harness root). If `type=ACTION` instead → auto-promote didn't fire; check the harness template's `defaultRole`.
- N rows with `type=ACTION` (the children).
- Harness row should have `deliverable_src` set to one child's ID, NOT NULL. If NULL → Step 5a was skipped.
- Reviewer leaf (in synthesis pipelines) should have `suppress_md = true`. If NULL → suppressDefaultReportMd wasn't set on the leaf.

**Run 5 expected output**:
- Harness `cmoig9wvn0001yx9m3qiycy8c`: `type=PIPELINE`, `deliverable_src="cmoigblrg0014yx9mua5pyltf"`, `status=COMPLETED`
- Editor `cmoigblrg0014yx9mua5pyltf`: `type=ACTION`, no metadata, `status=COMPLETED`
- Reviewer `cmoigbvqz001byx9ma1vubbmg`: `type=ACTION`, `suppress_md=true`, `status=COMPLETED`

### Step 2 — Verify dependency wiring

Did the harness create the right dependency chain in CREATE Step 4?

```sql
SELECT id, "taskId", "dependsOnId", "createdAt"
FROM task_dependencies
WHERE "taskId" IN ('<child1>','<child2>','<child3>','<child4>')
   OR "dependsOnId" IN ('<child1>','<child2>','<child3>','<child4>')
ORDER BY "createdAt";
```

**What to look for**:
- For a synthesis pipeline (Acquirer → Harvester → Editor → Reviewer), 3 dependency rows: Harvester depends on Acquirer, Editor depends on Harvester, Reviewer depends on Editor.
- Dep order should match the dependency-chain prose in the harness's PIPELINE QUEUED comment.

**Failure mode**: missing rows → harness Step 4 didn't include `dependencyIds`. Children won't auto-execute correctly.

### Step 3 — Track execution health (per task)

For any task that looks stuck or failed, drill into its executions:

```sql
SELECT id, status, "createdAt", "endTime", "updatedAt",
       EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int as age_sec,
       EXTRACT(EPOCH FROM ("endTime" - "createdAt"))::int as duration_sec
FROM agent_executions
WHERE "taskId"='<task_id>'
ORDER BY "createdAt" DESC
LIMIT 5;
```

**What to look for**:
- Healthy: `status=SUCCESS` or `status=FAILED` with `endTime IS NOT NULL` and `duration_sec` reasonable for the phase.
- Stuck: `status=RUNNING` with `age_sec > 600` and `endTime IS NULL` and `updatedAt` close to `createdAt` (i.e., no progress logging) → likely orphaned by pm2 restart. Note: at 1200s (20 min), the engine's stale-execution watchdog auto-marks as FAILED — manual recovery below is only useful for the 10-20 min impatience window.

**Read the execution logs** for stuck-execution diagnosis:

```sql
SELECT logs FROM agent_executions WHERE id='<execution_id>';
```

**Healthy log pattern**: `{"Agent execution started", "Agent execution completed successfully"}`. If only `{"Agent execution started"}` appears and the row is RUNNING → pm2 logs needed to see what the LLM was doing.

### Step 4 — Inventory artifacts

What artifacts were produced across all the run's executions?

```sql
SELECT t.title, ae.id as exec_id, ae.status, ae."createdAt",
       aa.name, length(aa.content) as bytes
FROM tasks t
JOIN agent_executions ae ON ae."taskId" = t.id
JOIN agent_artifacts aa ON aa."executionId" = ae.id
WHERE t.pov_id='<POV_ID>'
  AND t.created_at > NOW() - INTERVAL '60 minutes'
  AND ae.status='SUCCESS'
ORDER BY t.created_at, ae."createdAt", aa.name;
```

**Run 5 expected** (post-2026-04-28 policy):
- Harness CREATE exec: 1 artifact (`pipeline-index.json`)
- Harness SYNTHESIZE exec: 2 artifacts (`pipeline-index.json` + `report.md`)
- Acquirer / Harvester / Editor: 1 artifact each (`result.json`)
- Reviewer (suppressed): 1 artifact (`result.json` only — no `report.md`)
- **Total: 7 artifacts**

**Anomaly checks**:
- Harness CREATE has `report.md` → Option A defense was bypassed (shouldn't happen post-2026-04-28).
- Reviewer has `report.md` → `suppressDefaultReportMd` wasn't set; check harness's CREATE comment for Step 5a.
- Editor has `report.md` (intermediate task) → policy gate misclassified the Editor as a leaf; check `task_dependencies` for downstream Reviewer dep.

### Step 5 — Per-execution metrics

Confidence + tool-call counts + duration for every successful execution:

```sql
SELECT substring(t.title from 1 for 35) as title,
       ae.id as exec_id,
       EXTRACT(EPOCH FROM (ae."endTime" - ae."createdAt"))::int as duration_sec,
       (aa.content::jsonb->>'confidenceScore')::int as confidence,
       jsonb_array_length(COALESCE(aa.content::jsonb->'toolCalls', '[]'::jsonb)) as tool_calls,
       length(aa.content) as result_bytes
FROM tasks t
JOIN agent_executions ae ON ae."taskId" = t.id
JOIN agent_artifacts aa ON aa."executionId" = ae.id
   AND aa.name IN ('result.json','pipeline-index.json')
WHERE t.id IN ('<harness>','<child1>','<child2>','<child3>','<child4>')
  AND ae.status='SUCCESS'
ORDER BY t.created_at, ae."createdAt";
```

**Compare across runs**: this is the row you'd append to `cline_docs/runs/run-comparison.md` to track "is the system stable across runs?"

**Anomaly checks**:
- Confidence NULL on a child → role guidance + universal §8 directive interaction issue (e.g., the Acquirer 2026-04-15 issue fixed by `7f0ff24d`)
- Tool calls suddenly 4× the prior run for a phase → chained-context-prefer guidance regression; check role guidance prose
- Duration 2× the prior run for a phase that doesn't depend on external services → pm2 collision risk during run, OR LLM API latency variance

### Step 6 — Validate engine extraction (post-2026-04-28)

For PIPELINE harness tasks, verify the engine extracted the source's `finalResponse` correctly:

#### Step 6a — `reportMdSource` forensic field

```sql
SELECT content::jsonb->'reportMdSource' as report_md_source
FROM agent_artifacts
WHERE name='pipeline-index.json'
  AND "executionId"='<harness SYNTHESIZE exec>';
```

**Expected**: `{"mode": "upstream", "sourceTaskId": "<editor task id>"}`.
**Failure shapes**:
- `null` → engine extraction didn't fire. Either `decision.source !== 'upstream'` or `task.metadata.deliverableSourceTaskId` was NULL.
- `{"mode": "upstream", ..., "extractFailureReason": "<reason>"}` → extraction failed; the `report.md` will contain the error-header (Theme 1 fail-loud). Check `<reason>` for: `parse_error`, `finalresponse_not_string`, `upstream_truncated`, `no_source_artifact`.

#### Step 6b — Byte-identity check

Confirm harness's `report.md` content === Editor's `result.json.finalResponse`:

```sql
SELECT
  (SELECT length(content) FROM agent_artifacts
    WHERE name='report.md' AND "executionId"='<harness SYNTHESIZE exec>') as harness_md_bytes,
  (SELECT length(content::jsonb->>'finalResponse') FROM agent_artifacts
    WHERE name='result.json' AND "executionId"='<editor exec>') as editor_finalresponse_bytes,
  (SELECT content FROM agent_artifacts
    WHERE name='report.md' AND "executionId"='<harness SYNTHESIZE exec>') =
  (SELECT content::jsonb->>'finalResponse' FROM agent_artifacts
    WHERE name='result.json' AND "executionId"='<editor exec>') as byte_identical;
```

**Expected**: `byte_identical = t` and the two byte counts match.
**Failure mode**: `byte_identical = f` → either content was truncated (check `harness_md_bytes` against the 5MB BC38 cap) or the harness's `report.md` is the error-header (starts with `# ⚠️ Report Extraction Failed`).

### Step 7 — Validate deliverable pointer (post-v3.7.1)

Verify the engine substituted the `{{HARNESS_REPORT_MD_ID}}` placeholder correctly:

```sql
SELECT
  (SELECT id FROM agent_artifacts
    WHERE name='report.md' AND "executionId"='<harness SYNTHESIZE exec>') as harness_report_md_id,
  CASE WHEN (SELECT content::jsonb->>'finalResponse' FROM agent_artifacts
    WHERE name='pipeline-index.json' AND "executionId"='<harness SYNTHESIZE exec>') ~
    ('fetch\(id: "artifact-' || (SELECT id FROM agent_artifacts
      WHERE name='report.md' AND "executionId"='<harness SYNTHESIZE exec>') || '"\)')
  THEN 'YES — pointer references harness own report.md'
  ELSE 'NO — substitution did not fire OR harness wrote a different fetch ID' END
  as deliverable_pointer_check;
```

**Expected**: `deliverable_pointer_check = 'YES — pointer references harness own report.md'`.
**Failure mode**: `'NO — ...'` → either:
1. Harness LLM didn't write the `{{HARNESS_REPORT_MD_ID}}` placeholder (compliance miss; protocol prose at Phase C.3 should fix this in subsequent runs)
2. Substitution code didn't run (engine bug; check pm2 logs for `Substituted harness report.md ID` log line)
3. Pre-v3.7.1 run (placeholder not yet in protocol prose) — harness fell back to pointing at Editor's `result.json` (the chicken-and-egg observation from Run 5)

### Step 8 — Cross-tenant safety

Ensure no `deliverableSourceTaskId` points across POV boundaries (this is the Theme 2 boundary-contract guard):

```sql
SELECT count(*) as cross_pov_violations
FROM tasks t1
WHERE t1.metadata ? 'deliverableSourceTaskId'
  AND (t1.metadata->>'deliverableSourceTaskId') IN (
    SELECT id FROM tasks t2 WHERE t2.pov_id != t1.pov_id
  );
```

**Expected**: `0` rows.
**Failure mode**: any non-zero count → either a misbehaved harness set the wrong ID, OR the engine's POV-scoping guard failed. Both are critical.

### Step 9 — Protocol library version audit

Confirm the protocol on prod matches what you intended to deploy:

```sql
SELECT name, version, length("promptText") as chars,
       "updatedAt"
FROM agent_prompt_library
WHERE name IN ('pipeline-orchestrator-protocol',
               'artifact-synthesis-protocol',
               'HOWTO-use-pipeline-harness');
```

**Expected (post-2026-04-29 deploy)**:
- `pipeline-orchestrator-protocol` v3.7.1, ~26196 chars
- `artifact-synthesis-protocol` v1.3.0, ~34469 chars
- `HOWTO-use-pipeline-harness` v2.2.0, ~34191 chars

If versions don't match what your local code expects, run `npx ts-node --transpile-only scripts/seed-protocol-prompts.ts` against prod to push the latest.

### Recovery — orphaned RUNNING execution

When pm2 restart leaves an execution stuck (`age_sec > 600` from Step 3):

```sql
UPDATE agent_executions
SET status='FAILED',
    "endTime"=NOW(),
    "updatedAt"=NOW(),
    logs=array_append(logs, 'Marked FAILED <YYYY-MM-DD> — manual pm2 deploy collision recovery (preempting the 20-min watchdog).')
WHERE id='<orphan execution id>'
RETURNING id, status;
```

After marking FAILED, re-execute the affected task via MCP `agent.execute(taskId: '<task id>')` — cascade resumes from there.

**Note**: the engine has an existing **20-minute stale-execution watchdog** (`agentExecutionEngine.ts:162-218` `processPendingExecutions` cleanup, polls every 10s). It auto-transitions PENDING/RUNNING executions older than 20 min to FAILED and resets task `executionStatus`. So manual recovery is only useful in the 10-20 min impatience window — patient operators can let the watchdog handle it. Don't use for normal stuck-LLM cases (those should fail naturally via max-turns or LLM API timeout, well under 20 min). Reserve manual UPDATE for the deploy-collision case where you can confirm via `pm2 list` that uptime resets coincide with the stuck execution's start time AND you don't want to wait for the watchdog.

---

## When to graduate from GUI to SQL

The GUI is sufficient for ~80% of admin tasks. Reach for SQL when:

- You need to verify a JSONB field that isn't surfaced as a human-readable annotation (e.g., raw `metadata.deliverableSourceTaskId`, `reportMdSource.extractFailureReason`)
- You're investigating a stuck execution and need precise age + log state
- You're auditing across multiple runs (the GUI is single-task-focused)
- You're recovering from an orphaned execution faster than the 20-min watchdog (manual UPDATE preempts auto-recovery)
- You're validating cross-tenant safety (multi-POV query, no GUI surface)
- You're correlating engine timing with external events (deploys, API outages — joins not in GUI)

For everything else: Comments + Pipeline Results answers the question faster.

---

## Addendum — PM2 Logs Playbook

The platform runs as two pm2 processes (`paichart-mcp` and `paichart-web`), both writing structured pino logs. SQL captures *outcomes*; pm2 captures the *flow* (LLM turns, reactor firings, mode resolutions, extraction events). When SQL says "RUNNING for 16 minutes" or "extraction failed", pm2 tells you *why*.

### Setup

**Two log access paths** — pick by how old the events are:

**Path A — Active log via pm2 (events from last ~1-2h on a busy server)**:
```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs <process> --lines N --nostream 2>&1 | grep ...'
```
`--lines N` reads the last N lines from the active log file. Bounded by `pm2 logs` buffering — older events fall out of the visible window even though they're on disk.

**Path B — Direct file access via grep/zgrep (full 14-day history)** ← USE THIS for anything older than the last hour:
```bash
ssh <PROD_USER>@<PROD_HOST> 'grep "<execution id>" /var/log/paichart/*-combined-*.log* 2>/dev/null'
ssh <PROD_USER>@<PROD_HOST> 'zgrep "<execution id>" /var/log/paichart/*-combined-*.log.*.gz 2>/dev/null'
```
Logs land at `/var/log/paichart/` with system-wide `logrotate` (config: `/etc/logrotate.d/paichart`): daily rotation, 14-day retention, gzip after 1 day with `delaycompress` (yesterday's file uncompressed, older `.gz`), `copytruncate` for pm2-friendliness.

**Two processes — pipeline events split across BOTH** (this is forensically important):
- `paichart-mcp` (id 0, logs: `mcp-combined-0.log*`) — MCP server, engine, reactor services
- `paichart-web` (id 1, logs: `web-combined-1.log*`) — Next.js HTTP/SSE handler, stream-route engine, **also runs reactor services**

#### Why pipeline events split across both processes

Pipeline cascade is **reactor-driven**, not user-driven. The user-initiated `agent.execute` MCP call only handles the FIRST execution (the harness's CREATE). Everything after that — children executing as their dependencies clear, and the harness re-firing for SYNTHESIZE — fires from **PostgreSQL `NOTIFY`/`LISTEN`** events. Both pm2 processes subscribe to the same channel. When a notify fires (e.g., a child task hits terminal status), **both processes receive the event simultaneously**, both try to claim the work, and only one succeeds via the **active-execution-unique-constraint partial index** (the third-layer race guard from `HARNESS-MENTAL-MODEL.md` Chapter 2). The loser logs an idempotency-skip message and exits silently.

**Which process wins is non-deterministic** — depends on which event loop is less busy at the millisecond the notify lands. Single execution may flip between processes mid-cascade. Empirically across Run 6:

```
Run 6 execution        Triggered by                    Won by
─────────────────      ─────────────                   ──────────────
Harness CREATE         User (MCP agent.execute)        mcp ✓ (only mcp could — direct call)
Phase 0 Acquirer       reactor (dep-free auto-queue)   mcp
Phase 3-6 Editor       reactor (dep-completion)        mcp
Phase 4+7 Reviewer     reactor (dep-completion)        web ⚠️
Harness SYNTHESIZE     reactor (pipeline retrigger)    web ⚠️
```

User-triggered executions are bound to whichever process received the MCP call (always mcp). Reactor-fired executions race. **An admin troubleshooting "I triggered it in mcp, where did the SYNTHESIZE events go?" — they likely went to web because the retrigger reactor in web won the race.**

This is also good defense-in-depth: if one process crashes mid-cascade, the other picks up the next reactor event seamlessly. No single-point-of-failure for the cascade.

#### Forensic implication

**Always grep BOTH log streams** when investigating a pipeline. Don't assume "MCP-triggered run → mcp logs":
```bash
ssh <PROD_USER>@<PROD_HOST> 'grep "<execution id>" /var/log/paichart/{mcp,web}-combined-*.log* 2>/dev/null'
```

**Log structure** (pino JSON):
```
2026-04-28T09:59:53: {"level":30,"time":"...","pid":3441227,"hostname":"...","domain":"mcp","module":"AgentExecutionEngine","executionId":"<id>","taskId":"<id>","msg":"Executing agent"}
```

Key fields when grepping:
- `level`: 10=trace, 20=debug, **30=info**, **40=warn**, **50=error**, 60=fatal
- `module`: which engine subsystem emitted the log
- `pid`: process identity (correlates with `paichart-mcp` vs `paichart-web` startup)
- `executionId` / `taskId`: the IDs to correlate with SQL queries above
- `msg`: human-readable event description

**Retention**: 14 days via system logrotate. Path A (`pm2 logs --lines`) is bounded by visible buffer (~1-2h); Path B (`grep`/`zgrep` direct file access) reaches all 14 days.

### Step 1 — Check process state for deploy collisions

Before grepping logs, sanity-check pm2 state:

```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 list'
```

**What to look for**:
- `uptime` column — both `paichart-mcp` and `paichart-web` should show similar uptimes from the last deploy.
- If `uptime` is unexpectedly recent (e.g., 16 min when you've been investigating for 30 min), **a deploy fired during your investigation**. This is the deploy-collision signature that killed Run 5 Phase 1-2.
- `↺` column (restart count) — repeated restarts signal a crash loop; logs in next steps will reveal cause.
- `status` should be `online` for both. If `errored` or `stopped` → process not running; investigate via `pm2 describe paichart-mcp`.

### Step 2 — Trace one execution end-to-end

The most common starting point. Given an execution ID from SQL, get its full turn-by-turn.

**For recent runs (<1h)** — pm2 buffer:
```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 2000 --nostream 2>&1 | grep "<executionId>"'
```

**For older runs OR when above returns nothing** — direct file access (covers full 14-day retention + BOTH processes since pipeline retriggers fire non-deterministically across mcp/web):
```bash
ssh <PROD_USER>@<PROD_HOST> 'grep "<executionId>" /var/log/paichart/{mcp,web}-combined-*.log* 2>/dev/null'
ssh <PROD_USER>@<PROD_HOST> 'zgrep "<executionId>" /var/log/paichart/{mcp,web}-combined-*.log.*.gz 2>/dev/null'
```

**Healthy pattern** (Run 5 Harvester recovery exec `cmoih65u10001yxn7pnbsa71t`):
```
... module:"AgentExecuteHandler" msg:"agent execution dispatched (fire-and-forget)"
... module:"AgentExecutionEngine" msg:"Executing agent"
... module:"AgentExecutionEngine" llmDurationMs:5988 turn:0 msg:"Initial LLM call completed"
... module:"AgentExecutionEngine" turn:1 msg:"Agentic tool loop: starting turn"
... module:"AgentExecutionEngine" turn:1 toolDurationMs:161 llmDurationMs:22916 msg:"Agentic tool loop: turn completed"
... module:"AgentExecutionEngine" turn:2 msg:"Agentic tool loop: starting turn"
... (turn 2 completed, turn 3 starting, ... )
... module:"AgentExecutionEngine" msg:"Agent execution completed successfully" (or extraction logs)
```

**Healthy signals**:
- Every `starting turn` is followed by a matching `turn completed` line within ~30s
- `llmDurationMs` typically 1000-10000ms; >30000ms suggests API slowness
- `inputTokens` grows turn-over-turn (chained context accumulating); plateaus near max-budget (`30000-50000` typical)
- Execution ends with `Agent execution completed successfully` OR a clean failure path (FAILED status with error category)

**Anomaly signals** (from Run 5 stuck Phase 1-2 `cmoigft3o002uyx9nvzzh15nj`):
- Last log line is `starting turn N` with NO matching `turn completed` → LLM call hung (often due to pm2 restart killing the process mid-call)
- `(no further logs for this execution ID)` despite SQL showing `RUNNING` → orphan; recover via SQL UPDATE per Step 9 of SQL addendum

### Step 3 — Trace the cascade across multiple executions

For investigating the full pipeline run, grep multiple execution IDs in one command:

```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 5000 --nostream 2>&1 | \
  grep -E "<harness_create_exec>|<phase0_exec>|<phase1_exec>|<phase2_exec>|<reviewer_exec>|<harness_synth_exec>"'
```

Output is timestamp-ordered, so you can read the cascade as it unfolded — useful for spotting reactor-firing delays, dependency-completion ordering, and retrigger gaps.

**Or** trace by module to see all reactor activity in the window:

```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 2000 --nostream 2>&1 | \
  grep -E "TaskReadyReactor|pipelineRetriggerReactorService|maybeQueueReadyDependents|maybeRetriggerPipelineHarness"'
```

**What to look for**:
- `TaskReadyReactor`: fires when a task's deps complete. Should see N entries (one per child auto-queue).
- `pipelineRetriggerReactorService`: fires when all children of a PIPELINE are terminal → re-fires harness in SYNTHESIZE. Should see exactly 1 entry per harness retrigger.
- `Task auto-queued for execution — dependencies satisfied`: the cascade-firing log; one per child as deps complete.

**Common reactor anomalies**:
- Reactor reports `Skipped — already queued` repeatedly → race condition; check execution-claim atomicity
- Retrigger fires but harness execution doesn't start within ~5s → MCP execute handler hung; check `AgentExecuteHandler` logs

### Step 4 — Verify mode resolution (post-2026-04-26)

The harness mode is platform-resolved pre-LLM via `harnessModeResolver.ts`. Verify the resolver wrote the right mode:

```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 2000 --nostream 2>&1 | \
  grep -E "harnessModeResolver|resolvedMode|Harness mode resolved"'
```

**Healthy pattern**:
```
... module:"harnessModeResolver" mode:"CREATE" reasonCode:"NO_PIPELINE_STAGE_ID" msg:"Harness mode resolved"
... (later) module:"harnessModeResolver" mode:"SYNTHESIZE" reasonCode:"ALL_CHILDREN_TERMINAL" msg:"Harness mode resolved"
```

Mode mismatches between resolver output and harness LLM behavior were the original failure that prompted this resolver (~3/30 days production rate before the fix). If you see resolver writing CREATE but harness LLM behaving as SYNTHESIZE → investigate the universal template's Harness Context block injection.

### Step 5 — Verify engine extraction (post-2026-04-28)

For PIPELINE harness SYNTHESIZE executions, confirm the engine extracted upstream content correctly. **Use direct file access** (not pm2 buffer) because retriggers fire non-deterministically across both processes:

```bash
ssh <PROD_USER>@<PROD_HOST> 'grep -E "Extracted upstream finalResponse|Failed to parse upstream source|No upstream source artifact found|Upstream source result.json was truncated|Upstream finalResponse is suspiciously short" /var/log/paichart/{mcp,web}-combined-*.log* 2>/dev/null | grep "<harness execution id>"'
```

**Healthy line** (Run 5 SYNTHESIZE `cmoiheecy000zyxn8wjv5fadu`):
```
... module:"AgentExecutionEngine" executionId:"cmoiheecy..." sourceTaskId:"cmoigblrg..." sourceExecutionId:"cmoih93sj..." sourceContentLength:16002 msg:"Extracted upstream finalResponse for harness report.md"
```

**Failure line shapes** (Theme 1 fail-loud — extraction error always logs):
- `parse_error`: `Failed to parse upstream source result.json for report.md extraction; falling back to error-header report.md`
- `finalresponse_not_string`: `Upstream source result.json finalResponse is not a non-empty string; falling back to error-header report.md`
- `no_source_artifact`: `No upstream source artifact found for report.md extraction (source not SUCCESS, or cross-POV mismatch); falling back to error-header report.md`
- `upstream_truncated`: `Upstream source result.json was truncated at write time; report.md extraction unreliable`
- The recovery log: `Customer-facing report.md extraction failed; produced error-header report.md instead.` (level 50, ERROR)

### Step 6 — Verify pointer substitution (post-v3.7.1)

For PIPELINE harness SYNTHESIZE executions, confirm engine substituted the `{{HARNESS_REPORT_MD_ID}}` placeholder:

```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 1000 --nostream 2>&1 | \
  grep -E "Substituted harness report.md ID|missing.*HARNESS_REPORT_MD_ID.*placeholder"'
```

**Healthy line**:
```
... module:"AgentExecutionEngine" executionId:"<harness>" pipelineIndexArtifactId:"<id>" reportMdArtifactId:"<id>" replacements:1 msg:"Substituted harness report.md ID in pipeline-index.json deliverable pointer"
```

**Compliance miss** (harness LLM didn't write the placeholder; substitution couldn't fire):
```
... module:"AgentExecutionEngine" executionId:"<harness>" pipelineIndexArtifactId:"<id>" msg:"Harness pipeline-index.json missing {{HARNESS_REPORT_MD_ID}} placeholder — deliverable pointer not substituted (harness LLM may have forgotten the placeholder, falling back to whatever literal ID the harness wrote)"
```

This warn is forensic-only (level 40) — customer still gets a working pointer (whatever the harness wrote literally), but it points at the wrong artifact. Run 5 pre-v3.7.1 was this case.

### Step 7 — Error-level scan across the recent window

When you don't have a specific question yet, scan for any errors in the recent window:

```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 1000 --err --nostream 2>&1 | tail -50'
```

The `--err` flag filters to stderr only — captures uncaught exceptions, pino level=50+ logs, transaction rollbacks.

**Common error patterns worth knowing**:
- `Pipeline harness protocol gap: <mode> mode missing N required step(s)` — `pipelineProtocolValidator.ts` flagged a missing step (forensic, additive only — not a status blocker)
- `tool-call result truncated for persistence` — `c1492c70` 50KB truncation fired; agent's tool result was bounded mid-flight
- `Failed to query Anthropic API` — LLM service error; check Anthropic status
- `Pipeline retrigger skipped — duplicate detected` — reactor's idempotency guard; benign
- `PIPELINE_STAGE_MISMATCH` — 4-point invariant rejected `task.complete`; harness's metadata.pipelineStageId doesn't match the stage's `metadata.harnessTaskId` (clobber-detection)

### Step 8 — Time-window scan (since approximate timestamp)

When you know roughly *when* something happened but not *what*:

```bash
# Match all log lines from the last 30 minutes
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 5000 --nostream 2>&1 | \
  awk -F"\"time\":\"" '"'"'NF>1 && $2 > "'"'"'$(date -u -d "30 min ago" +%Y-%m-%dT%H:%M:%S)'"'"'"'"'"' {print}'"'"' | \
  tail -100'
```

Or simpler — just grep by hour prefix:
```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 5000 --nostream 2>&1 | grep "2026-04-28T10:" | tail -100'
```

### Step 9 — Identifying the deploy-collision pattern

To confirm a deploy fired during a specific time window:

```bash
ssh <PROD_USER>@<PROD_HOST> 'pm2 logs paichart-mcp --lines 3000 --nostream 2>&1 | \
  grep -iE "Listening on|server started|orphaned executions|reset on startup"'
```

The `paichart-mcp` startup logs include lines like:
- `MCP server listening on ...` — process boot
- `Reset N orphaned executions on startup` — `processOrphanedExecutions()` cleanup that runs at boot (`agentExecutionEngine.ts:82-122` — Pattern #37 atomicity)

If you see a `Reset N orphaned executions on startup` near the time your execution stuck, **the deploy killed it AND the cleanup ran AFTER your investigation started** — recovery via manual UPDATE is no longer needed; the cleanup did it. Re-check the SQL Step 3 query — status should show FAILED with `Reset on startup — server restarted before this execution could complete` in logs.

### Common pino fields reference

When reading logs, these fields tell you the most:

| Field | What it means | When relevant |
|---|---|---|
| `level` | Severity (10-60; 30=info, 40=warn, 50=error) | Filter for warn+ during forensics |
| `module` | Engine subsystem | `AgentExecutionEngine`, `TaskReadyReactor`, `pipelineRetriggerReactorService`, `harnessModeResolver`, `AgentExecuteHandler`, `AgentExecutionEngine` (most common) |
| `executionId` | Specific execution row | Always — the primary correlation key |
| `taskId` | Task this execution belongs to | When tracing cascade |
| `turn` | Tool-loop turn number (0=initial, 1+=tool calls) | Stuck-execution diagnosis |
| `llmDurationMs` / `toolDurationMs` | Per-call timing | Slowness diagnosis |
| `inputTokens` / `outputTokens` | LLM token usage | Budget consumption |
| `stopReason` | Why this turn ended | `tool_use`, `end_turn`, `max_tokens` |
| `sourceTaskId` / `sourceExecutionId` | Engine extraction provenance | Verify upstream extraction landed |
| `pipelineIndexArtifactId` / `reportMdArtifactId` | Substitution audit | Post-v3.7.1 placeholder confirmation |

### Common module values reference

| Module | Subsystem | What it logs |
|---|---|---|
| `AgentExecutionEngine` | LLM execution + artifact write + post-processing | Tool-loop turns, extraction, substitution, prune |
| `TaskReadyReactor` | Auto-queue dep-free tasks + post-completion auto-queue | Cascade firings, dep-completion events |
| `pipelineRetriggerReactorService` | Re-fire harness in SYNTHESIZE when all children terminal | Harness retrigger events |
| `harnessModeResolver` | Pre-LLM mode computation | Mode resolutions with reasonCode |
| `AgentExecuteHandler` | MCP `agent.execute` request entry | Dispatch confirmations, polling state |
| `task-update-handler` | Task field mutations + clobber-detection back-pointer | `harnessTaskId` writes, 4-point invariant rejections |
| `task-complete-handler` | Task completion + 4-point invariant validation | Completion gate decisions |

---

## When to graduate from pm2 logs to source code

pm2 logs answer most "what happened?" questions. Reach for source code when:

- The log message you're chasing isn't in the codebase (grep `lib/` for the exact `msg`); the engine has been refactored and the log was renamed or removed
- You need to understand *why* a code path was taken (the log says it happened, you need to see the conditional)
- The log shows a state transition you don't recognize (e.g., a new `errorCategory` value)
- You're suspecting a race condition (logs are append-only and timestamp-ordered, but pino batches output — concurrent operations may interleave non-deterministically)

Source code reading order for engine-side investigations: `agentExecutionEngine.ts` → `pipelineProtocolValidator.ts` → `harnessModeResolver.ts` → reactor services. Most pipeline questions live in those four files.
