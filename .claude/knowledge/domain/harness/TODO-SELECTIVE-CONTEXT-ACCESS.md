# TODO: Selective Context Access

**Status**: Deferred — not needed yet (revisit when pipelines exceed 10 tasks with fan-in)
**Created**: 2026-04-05
**Source**: Meta-Harness paper insight #1 (arxiv 2603.28052v1)
**Estimated Effort**: Low (30 min implementation) but quality risk is non-trivial

### Why Deferred (Apr 5, 2026 analysis)
- **Current system works**: Test G completed 3/3 tasks in 3.8 minutes with full context injection, 100% quality
- **Token savings are modest**: ~15-20K input tokens per 3-task pipeline (~$0.05-0.10 per run)
- **Quality risk is real**: Omni-SimpleMem paper (arxiv 2604.01007v2) found full-text outperforms LLM summaries by 53% F1. If we replace full output with manifests and agents don't fetch, quality drops. If they always fetch, we save nothing.
- **Budget headroom exists**: Raised to 1M/hr and 10M/day — plenty for current pipeline sizes
- **Trigger to revisit**: Pipelines with 10+ tasks and fan-in dependencies where accumulated predecessor output approaches model context limits

---

## Introduction

Currently, the context chainer (`lib/agents/harness/context-chainer.ts`) injects the **full predecessor output** into each successor agent's prompt. When Task A produces a 26,000-character security assessment, Task B receives all 26,000 characters in its `inputContext` — regardless of whether it needs the full text or just the compliance findings section.

This works well for small pipelines (3-6 tasks) but has two scaling problems:

1. **Token waste** — Agents receive more context than they need, consuming budget on input tokens that don't improve output quality
2. **Context window pressure** — As pipelines grow (10+ tasks with fan-in dependencies), the accumulated predecessor output can approach or exceed model context limits

The Meta-Harness paper (Stanford/MIT, 2026) demonstrated that giving their proposer access to **10M tokens of diagnostic context per step** — but letting it **selectively navigate** via filesystem operations (grep, cat) — outperformed full-context injection by 7.7 points while using 4x fewer tokens. The key insight: more context available, less context consumed.

## Objective

Replace full predecessor output injection with an **artifact-based selective access** pattern where:

1. Predecessor outputs are stored as retrievable artifacts (already the case — `result.json` and `report.md`)
2. Instead of injecting full text, the successor's prompt receives a **manifest**: task title, confidence score, artifact IDs, and a 2-3 sentence summary
3. The agent can **pull specific artifacts** when it needs the full text, using `fetch(id: "artifact-xxx")`
4. The agent decides what to read based on the manifest — not everything, just what's relevant to its task

## How It Works Today

```
Task A completes → result.json (26K chars) stored as artifact
                 → context-chainer reads result.json
                 → extracts finalResponse, confidenceScore, qualityMetrics
                 → injects ALL of finalResponse into Task B's inputContext

Task B executes  → sees full 26K chars in §6 Pipeline Context
                 → reads all of it (whether needed or not)
                 → uses maybe 20% of it for its actual work
```

## Proposed Design

```
Task A completes → result.json stored as artifact (no change)
                 → context-chainer reads result.json
                 → extracts: title, role, confidence, artifact IDs
                 → generates 2-3 sentence summary (could be LLM-generated or template-based)
                 → injects MANIFEST into Task B's inputContext

Task B executes  → sees manifest in §6 Pipeline Context:
                   "Previous: Design security framework (solution_architect, 92/100)
                    Summary: Recommended hybrid OAuth 2.0 + mTLS with APRA CPS 234 compliance.
                    Full output: fetch(id: 'artifact-xxx')"
                 → decides: "I need the compliance details" → fetches artifact
                 → OR: "The summary is enough for my ROI calculation" → skips fetch
```

## Implementation Procedure

### Step 1: Add Summary Generation to Context Chainer
- Modify `lib/agents/harness/context-chainer.ts`
- After extracting `finalResponse`, generate a concise summary (first 500 chars? Or extract structured sections?)
- Include artifact IDs in the manifest
- Keep full injection as a fallback flag (`fullContext: true` in dependency metadata)

### Step 2: Update §6 Pipeline Context Format
- Current: full deliverable text
- New: manifest with summary + fetch commands
- The `fetch` tool is already available to agents — no new tooling needed

### Step 3: Add Context Mode to Pipeline Configuration
- `contextMode: "full"` (current behavior — backward compatible default)
- `contextMode: "selective"` (manifest + fetch)
- Configurable per-pipeline or per-template in metadata

### Step 4: Measure Token Savings
- Run the same pipeline with both modes
- Compare: input tokens consumed, output quality (confidence scores), wall-clock time
- Target: 50%+ token reduction with no confidence regression

### Step 5: Smart Summary Generation (Optional Enhancement)
- Instead of truncating to 500 chars, use a cheap model (Haiku) to generate a task-relevant summary
- The summary could be tailored: "For a REVIEWER, emphasize: findings, gaps, risk scores"
- Cost: ~$0.01 per summary generation — offset by savings on main execution

## Related Context

- **Meta-Harness paper**: Proposer reads 82 files/iteration, 41% source code, 40% traces, 6% scores. Selective access outperformed compressed summaries.
- **Current context chainer**: `lib/agents/harness/context-chainer.ts` — reads `result.json` from predecessor executions
- **Artifact system**: Already stores `result.json` + `report.md` per execution, fetchable via `fetch(id: "artifact-xxx")`
- **Token budget**: Currently 1M/hr — selective access would reduce per-pipeline token consumption, allowing more pipelines per hour
- **Pattern #49**: MCP Parameter Three-Layer — any changes to context format need tool schema + validation + handler updates
- **Discovery-scout agent** (`/.claude/agents/discovery-scout.md`): Already demonstrates the selective access philosophy in practice — uses targeted `grep`, `Glob`, `Read` commands to find specific information rather than reading everything. Lines 748-770 show grep-based "Discovery Questions" that search for schemas, patterns, and helpers before estimating work. The same tools (`fetch`, `project`, `search`) are already available to pipeline agents — the implementation change is in the context chainer (inject manifest vs full text), not in agent tooling.
- **Existing precedent**: Pipeline agents already CAN access artifacts selectively via `fetch(id: "artifact-xxx")`. The gap is that the context chainer forces full injection, so the agent receives everything upfront regardless. The fix is prompt + chainer, not tools.

## Risks and Considerations

- **Quality regression**: If the summary is too terse, the successor may miss critical context. Always keep `fullContext: true` as an escape hatch.
- **Extra tool turns**: Fetching artifacts costs tool turns. For small pipelines (3-4 tasks), the overhead may exceed the token savings.
- **Summary quality**: Template-based summaries are cheap but may miss nuance. LLM-generated summaries are better but add cost and latency.
- **When NOT to use this**: For pipelines where every successor genuinely needs the full predecessor output (e.g., a REVIEWER validating a BUILDER's complete code). Keep full injection as the default, selective as opt-in.

## Success Criteria

- [ ] Manifest-based context injection working for at least one pipeline
- [ ] Token consumption reduced by 40%+ compared to full injection on same pipeline
- [ ] No confidence score regression (within 5 points)
- [ ] Full injection remains available as fallback
- [ ] Works with both CREATE and ORCHESTRATE modes

## Dependencies

- None — this is an enhancement to existing infrastructure
- Benefits from but doesn't require: cross-pipeline learning (Phase 7)
