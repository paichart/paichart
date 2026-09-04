# TODO — Agent Execution Archive (artifact retention beyond 5-per-task cap)

**Status**: PROPOSED — not yet scoped for specialist review
**Created**: 2026-04-10
**Origin**: Meridian Health Systems test session, April 2026. User flagged the concern while planning the whitepaper's future-feature work: "what about reviewing previous session artifacts?"

---

## Problem

`lib/services/agentExecutionEngine.ts:985-1016` prunes per-task agent executions down to **5 successful + 5 failed** on every new completion. The prune hard-deletes both `AgentExecution` and `AgentArtifact` rows.

The auto-completion comment posted at line 1073 (`prisma.comment.create`) persists — `Comment` is keyed on `taskId`, not `executionId`, so it's not touched by the prune. But the comment text contains hardcoded `fetch(id: "artifact-{id}")` references that **become dangling pointers** the moment the execution is pruned.

Two concrete data-integrity consequences:

1. **Historical comments lie.** A comment posted during execution #1 still claims `"Artifacts: result.json → fetch(id: 'artifact-cmxxx123')"` after execution #6 prunes execution #1. Fetching that ID returns 404. The comment cannot tell you this.

2. **Pruned execution content is irrecoverable.** The `finalResponse`, `confidenceScore` provenance, `toolCalls` detail, quality metrics, and full LLM output all live inside the deleted artifacts. Once pruned, the only surviving trace is the ~2000-char auto-comment summary (which itself has dead links).

This was acceptable when agent executions were a transient operational concern. It becomes problematic the moment anyone wants to **compare multiple runs of the same harness task** — which is exactly what the whitepaper's future-feature research use case needs.

## Why this is latent right now

No current feature exposes multi-run comparison. The UI shows the latest execution's artifacts; the MCP `agent.results` handler returns the most recent SUCCESS; the harness's context chainer reads `result.json` from the immediately-preceding dependency. Nothing reads beyond position 5 in the retention window, so the hard-delete is invisible until someone tries to.

The whitepaper's §5 experiment catalogue already contains executions that would benefit from post-hoc review. Future research questions ("did the harness's self-completion guard fire on any of the pruned runs?" or "how did confidence score evolve across 20 retries of the same task?") cannot be answered from production data, only from whatever was live at the moment the researcher happened to look.

## Design options considered

See session transcript for the full comparison. Short version:

| Option | Approach | Verdict |
|---|---|---|
| **A. Tombstone comment on prune** | Append `⚠️ [Artifacts pruned]` to any comment referencing a deleted execution | Stops dangling pointers from lying, but doesn't recover data. Patch for honesty, not capability. |
| **B. Inline summary in comment** | Embed first N chars of `finalResponse` in the auto-comment at creation time | Limited by Comment text cap; loses structure. Partial. |
| **C. `AgentExecutionArchive` model** | Serialize pruned executions to a new archive table before delete | **Recommended.** Only option that preserves data. |
| **D. Raise the cap** | Bump `MAX_SUCCESSFUL_EXECUTIONS_PER_TASK` from 5 to 50 | Defers the ceiling, doesn't remove it. |

## Recommended approach: Option C — `AgentExecutionArchive`

### Schema

```prisma
model AgentExecutionArchive {
  id               String   @id @default(cuid())
  originalId       String   @unique  // original AgentExecution.id
  taskId           String
  agentTemplateId  String?
  status           String
  confidenceScore  Int?
  finalResponse    String   @db.Text  // full text, not digested
  executionSummary Json     // { duration, toolCalls, tokensUsed, role, modelUsed, ... }
  artifactManifest Json     // [{ name, type, size }] — names + sizes, not content
  createdAt        DateTime // original execution createdAt (preserved)
  archivedAt       DateTime @default(now())
  task             Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId, createdAt])
  @@map("agent_execution_archives")
}
```

**Design decisions**:
- `finalResponse` stored as full text. Research needs the actual deliverable, not a digest.
- `artifactManifest` stores structural metadata only (names, sizes, types). The large `content` field from `AgentArtifact.content` is intentionally NOT preserved here — that's the cost/benefit trade-off. If full content preservation is needed, we can add a separate `archivedContent` Text column, but expect the table to grow fast.
- Cascade-delete with Task. Deleting the task deletes the archive. Acceptable — the archive only makes sense scoped to a live task.
- `originalId` is unique to allow lookup by the ID that historical comments already reference. This is the bridge that makes dangling pointers fixable.

### Engine changes

In `lib/services/agentExecutionEngine.ts:985-1016`, before the `deleteMany` calls:

```ts
// ARCHIVE BEFORE PRUNE: preserve execution metadata so historical
// comments don't become dangling pointers and multi-run comparison
// remains possible.
if (allToDelete.length > 0) {
  const execsToArchive = await tx.agentExecution.findMany({
    where: { id: { in: allToDelete } },
    include: { artifacts: { select: { name: true, type: true, content: true } } },
  });

  for (const exec of execsToArchive) {
    const resultArtifact = exec.artifacts.find(a => a.name === 'result.json');
    let confidenceScore: number | null = null;
    let finalResponse = '';
    let executionSummary: any = {};
    if (resultArtifact) {
      try {
        const parsed = JSON.parse(resultArtifact.content);
        confidenceScore = parsed.confidenceScore ?? null;
        finalResponse = parsed.finalResponse ?? '';
        executionSummary = {
          modelUsed: parsed.modelUsed,
          executionTime: parsed.executionTime,
          tokensUsed: parsed.tokensUsed,
          toolLoop: parsed.toolLoop,
          qualityMetrics: parsed.qualityMetrics,
        };
      } catch { /* archive what we can */ }
    }
    await tx.agentExecutionArchive.create({
      data: {
        originalId: exec.id,
        taskId: exec.taskId,
        agentTemplateId: exec.agentTemplateId,
        status: exec.status,
        confidenceScore,
        finalResponse,
        executionSummary,
        artifactManifest: exec.artifacts.map(a => ({
          name: a.name,
          type: a.type,
          size: a.content.length,
        })),
        createdAt: exec.createdAt,
      },
    });
  }

  await tx.agentArtifact.deleteMany({ where: { executionId: { in: allToDelete } } });
  await tx.agentExecution.deleteMany({ where: { id: { in: allToDelete } } });
}
```

All inside the existing transaction — archive creation and prune are atomic. No partial state.

### Fetch handler changes

The `fetch` MCP tool handler (and the `agent.results` handler) should fall back to the archive when an artifact ID lookup fails. Two paths:

1. **Direct artifact lookup** (current) — unchanged fast path.
2. **Archive fallback** — if artifact not found, extract the execution ID from the artifact ID (the format is `artifact-{executionId}`, which happens to match) and check `AgentExecutionArchive.originalId`. If found, synthesize a read-only "archived" artifact response containing `finalResponse` and `executionSummary`, clearly marked as historical.

### Comment handling

Two options:

- **Leave comments alone** — they still reference `artifact-{id}`, but fetch now resolves via the archive fallback. Comments become truthful again automatically. Minimal change.
- **Rewrite comments during prune** — rewrite the `Artifacts:` block to point at the archive. More invasive, more complete.

Recommend the first for v1. Revisit if users report confusion.

### Retention policy

`AgentExecutionArchive` itself needs a retention rule or the archive becomes the unbounded growth source the original prune was fighting. Options:

- **Time-based**: retain 90 days, compliance-monitor cleanup (mirrors `lib/mcp/server/security/compliance-monitor.js:580`).
- **Per-task cap**: retain most recent 50 archives per task. Much larger than the 5-execution cap, but bounded.
- **Compliance-scoped**: retain forever for POVs flagged for research/whitepaper reference; 90-day default otherwise.

Recommend **per-task cap at 50** as the default, with a compliance opt-out mechanism if needed later. Keeps behavior predictable and research-usable without unbounded growth.

## Specialist review needed before implementation

- **database-manager-specialist**: schema, indexes, transaction safety, cascade semantics, growth projections for the archive table
- **api-efficiency-specialist**: fetch-handler fallback path, N+1 risk in multi-execution comparison queries, whether `artifactManifest` JSON queries are performant enough for future archive listing UI
- **mcp-artifacts-specialist**: artifact ID format guarantees, resource URI compatibility, does synthesizing an archived artifact confuse MCP clients
- **agent-execution-specialist**: transaction ordering, failure modes if archive write succeeds but delete fails, verifying the archive-before-prune pattern doesn't break the 5-cap invariant the harness self-completion loop relies on

Target confidence: 90%+ across all four. This is a schema change touching a hot path — it warrants the full specialist-review protocol.

## Success criteria

- ✅ Every pruned execution has a corresponding `AgentExecutionArchive` row
- ✅ Historical comments' `fetch(id: "artifact-{id}")` references continue to resolve (via archive fallback)
- ✅ Archive retrieval returns `finalResponse` + `executionSummary` in a read-only shape marked "archived"
- ✅ Task deletion cascades to archive rows (no orphans)
- ✅ Archive growth bounded by per-task cap (50)
- ✅ Zero regression in the harness 5-execution prune behavior or the self-completion guard's iteration count
- ✅ `npm run validate:schemas` + `npm run test:all-validation` pass
- ✅ Smoke test: run a PIPELINE task 7 times consecutively, verify executions 1-2 are archived and the 6th/7th comments still resolve historical artifacts via the fallback path

## Out of scope for this proposal

- **UI for browsing archived executions** — separate feature. Backend support enables it but doesn't require it.
- **Full artifact content preservation** — we're preserving metadata + finalResponse, not the entire `content` field of every pruned artifact. If that's needed, add `archivedContent` as a follow-up with explicit storage-cost acknowledgement.
- **Cross-task archive queries** — the index is per-task. Cross-task analytics would need a separate query path.
- **Streaming archives to cold storage (S3, etc.)** — a later optimization if DB growth becomes an issue.
- **Migrating existing auto-comments to use the archive fallback** — Option C works for new prunes going forward. Existing dangling pointers in old comments (from runs that already hit the cap) stay broken unless we also retroactively archive from... nothing, since those executions are gone. The gap is historical and unrecoverable.

## Related

- `lib/services/agentExecutionEngine.ts:985-1016` — the prune block
- `lib/services/agentExecutionEngine.ts:1066-1083` — the auto-comment
- `prisma/schema.prisma:173-183` — Comment model (no executionId FK)
- `prisma/schema.prisma:309-343` — AgentExecution + AgentArtifact models
- `.claude/knowledge/RETENTION-POLICY-SUMMARY.md` — existing retention policies (none of which cover this gap)
- Whitepaper `WHITEPAPER-ARXIV-v3.md` §5 — experiments that would benefit from post-hoc multi-run review

## Version

- **v1** (2026-04-10): Initial proposal, surfaced during Meridian Health Systems test session
