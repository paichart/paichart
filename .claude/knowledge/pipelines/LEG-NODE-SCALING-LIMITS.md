# Leg Node-Scaling Limits — how many devices fit in one pipeline leg

**Authored** 2026-08-31, from measured corpus data (56 archived leg pipelines) + the twin-suppression
fix landing the same week. **Answer up front: ~5–6 EOS nodes per leg is the comfortable ceiling
under current caps; the devext lab host caps at 7–8 regardless; beyond that, scale LEGS PER
PROGRAM, not nodes per leg.**

## Measured basis

- 2–3-node harvests persisted at **68–125KB `result.json`** across the archived corpus —
  measured PRE-twin-fix (FastMCP serialized-text duplication ≈ half the bytes;
  `cline_docs/follow-ups/r10-serialized-leaf-blindness-2026-08-28.md`, fixed at both rig
  producers 2026-08-31).
- Post-fix planning figure: **~12–20KB of real harvest content per node** under the protocol's
  scoped-read discipline (config sections + IGP state + route table per device).
- Re-measure after any harvest-discipline or rig change (adjust the stage/POV filter):

```bash
# Per-leg harvest artifact sizes, newest first (run on prod)
psql "$DATABASE_URL" -c "SELECT c.title, length(a.content)/1024 AS kb, a.\"createdAt\"::date
  FROM tasks c JOIN agent_executions e ON e.\"taskId\"=c.id
  JOIN agent_artifacts a ON a.\"executionId\"=e.id AND a.name='result.json'
  WHERE c.title ~* 'harvest' ORDER BY a.\"createdAt\" DESC LIMIT 10;"
```

## The limits, in the order they bind

| Limit | Value (source of truth) | Nodes before it binds |
|---|---|---|
| Downstream read depth: 8K Tier-1 window + `read_more` (6 pages/origin, ~8/run) | `agentic-tool-loop.ts` `MAX_TOOL_RESULT_LENGTH` + pager caps | **~4–5** if a consumer must page the RAW harvest (R19 P4 hit this at 3 nodes pre-twin-fix) |
| `agent.results` verbose ceiling | 100KB (`VERBOSE_MAX_CHARS`, task-action-handler) | ~5–8 |
| §6 chain cap (harvester finalResponse → author) | 128KB/predecessor (`context-chainer.ts`) | ~8–10, and only if the finalResponse bloats — discipline keeps it a curated summary |
| Harvest tool turns (3–6 scoped reads/device) | loop turn budget | ~8–10 |
| Author output budget (package ~2–4KB/device) | maxTokens 24000 ≈ ~70KB | ~15+, not the constraint |
| **Lab host RAM** (cEOS ≈ 2GB each) | devext: 19GB usable | **7–8, hard** |

The binding LLM constraint is **downstream read depth**, and it binds only when a consumer needs
the raw harvest rather than the curated summary — the provenance-shaped case
(`cline_docs/follow-ups/r19-p4-reviewer-false-positive-2026-08-31.md`).

## The architectural answer: scale legs per program, not nodes per leg

The composition catalog (`PROGRAM-COMPOSITION-CATALOG.md`, S2/S3 shapes) already prescribes this,
and the firewall campaign proved it live: edge/core/dmz ran as separate legs chained through the
interface contract, each harvesting only its own devices. Every cap above **resets per leg**.

- A 20-device change = a 4–5-leg program at 4–5 devices each, NOT a 20-device leg.
- The per-leg grouping seam should follow real change-window boundaries (team, site, vendor,
  blast radius) — the same axes as the decision matrix in `firewall-policy-use-case.md`.

## If a use-case genuinely forces more depth per leg

Levers in preference order (none currently needed):
1. Raise the `read_more` per-run page budget — one constant, Layer 1 (`agentic-tool-loop.ts`,
   agent-execution-specialist's domain).
2. Only then consider the 8K Tier-1 window — it is calibrated to context economics
   (`harvest-truncation-safety.md`), not arbitrary; raising it taxes every run.

Do NOT relax harvest scoping to "read the whole config once" — the narrow-read discipline is what
keeps per-node cost at 12–20KB (and is load-bearing for R10/secret hygiene).

## Freshness triggers for this doc

- Twin-fix regression (`structuredContent` duplication returning) — re-run the per-service twin
  query in the r10 follow-up; per-node cost roughly doubles if it comes back.
- A rig host change (RAM ceiling row).
- A cap change in `agentic-tool-loop.ts` / `context-chainer.ts` / `VERBOSE_MAX_CHARS` (Protocol 11
  sweep should touch this table).
- A live leg failing a read-depth limit at ≤5 nodes — that contradicts this doc's envelope and IS
  a finding.
