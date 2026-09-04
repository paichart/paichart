# Specialist Lifecycle Guide

> **Created**: 2026-06-11 | **The canonical store for "how specialists are born, run, stay true, stay small, and die."**
> This guide is the answer to "where does our approach live?" — any session (or discovery-scout) executes it;
> no single agent has to be remembered for the system to work.

## The architecture in one diagram

```
INVOKED (Task tool / "act as X-specialist")
  │
  ▼
.claude/agents/X-specialist.md          ← AUTO-LOADED whole, every invocation.
  (config + router: role, ≤3 session      Protocol 12 keeps this ≤500 lines.
   blocks, live invariants, derive-state
   greps, fleet scaffold, pointers)
  │
  ├─ runs FIRST ──► .claude/knowledge/discoveries/X-discovery.md   ← READ ON DEMAND.
  │                  (greps that DERIVE current state from the tree —
  │                   the accuracy engine; expectations are the test suite)
  │
  └─ depth on demand ──► patterns/ · protocols/ · domain/<x>/<x>-library.md
                          (knowledge store: greppable, never auto-loaded)
```

**The tree is the source of truth; greps outrank docs; docs outrank memory.**

## 1. CREATE — "create a new specialist for <domain> based on <files>"

1. **Discovery first**: map the domain (key files, invariants, gates/tests, adjacent specialists —
   check for overlap; if an existing specialist covers >50% of the domain, EXTEND it instead).
2. **Write the discovery prompt** (`.claude/knowledge/discoveries/<domain>-discovery.md`):
   - Header: Last Updated / Status / Last Validated (dated)
   - "Run These Greps FIRST" block — derive-state commands with **proven expect-N counts**
     (run every grep before writing it; a mismatch at creation time means you misunderstood the domain)
   - NO echo-checklists inside bash blocks — checklists are prose (`**Reviewer checklist**` sections)
3. **Write the thin specialist** (`.claude/agents/<domain>-specialist.md`) per **Protocol 12 R4**:
   frontmatter (name = filename, single-sentence description) · role statement · discovery pointer (run FIRST) ·
   live invariants/bug-class hooks (≤15 lines each, pointer to canonical home) · quick derive-state greps ·
   compact visual protocol (activation/completion boxes only) · When to Use · Common Tasks · Critical/Key Files ·
   Success Criteria · Handover logic · Domain Library pointer (create `domain/<x>/` only when depth exists)
4. **Register**: add to CLAUDE.md's agent table (and fix the count — it drifts).
5. **Gate**: structure parity vs this template; every written expectation proven (Protocol 11 Part C).

## 2. EXECUTE — what happens at invocation

The agent file loads whole as the system prompt → the specialist reads + runs its discovery's greps
against the tree → reads depth (patterns/library) only as the task requires → reviews the actual
diff/plan with the remaining context. Accuracy comes from the greps deriving state at runtime,
not from the prose being remembered correctly.

## 3. MAINTAIN — true AND small

- **True**: quarterly health-run per pair (CLAUDE.md milestone, next 2026-09-19; Replayable Flow in
  `cline_docs/session-learnings-2026-06-11.md`) + change-triggered sweeps (Protocols 6/9/11).
- **Small**: Protocol 12 — ≤3 dated session blocks (4th in = oldest out, same commit, R3 disposition),
  soft 500 / hard 800 lines, eviction to the domain library.
- **Paired**: specialist + discovery move together (`feedback_specialist_discovery_pairing`). **Health-run
  step (every pair): diff the config's claims against its discovery — every contradiction IS a finding**
  (Protocol 11 Part C). Canonical failure mode: a config gets updated in the moment during a refactor while
  the paired discovery lags, so discovery-first then feeds the specialist STALE state (2026-06-19: agent-execution
  §11 still described the pre-two-axis model config; token-optimizer-discovery still said `6000`). Heuristic
  pre-filter (then read both and judge — the diff is semantic, not greppable): flag pairs whose config was edited
  since the last health-run while the discovery was untouched (the precise scan + cadence note live in CLAUDE.md
  → Quarterly Specialist Health-Run), and any file:line/symbol/value cited in one but contradicted in the other.
  Discovery name ≠ specialist name 1:1 — resolve the pair via the config's discovery pointer, not just the filename.
- **Rewrites**: structure-parity check before commit (`feedback_rewrite_structure_parity`).

## 4. RETIRE / MERGE

When a domain dissolves or two specialists overlap heavily (measured during health-runs, not assumed):
merge the smaller pair's invariants + library into the survivor; mark the retired pair's files with a
tombstone pointer for one quarter, then delete; run Protocol 11 (Axis 6 + Part B) on the deletion.
Precedent for re-scoping instead of retiring: SC1 (session-consistency, 2026-06-11).

## Who runs this guide — discovery-scout as Lifecycle Steward

**discovery-scout** is the designated steward: invoke it for CREATE and RETIRE/MERGE, and it executes
THIS guide. But the guide is deliberately agent-independent — the original failure mode was making
scout the "master" and storing the approach in its head; it got bypassed and the approach went with it.
The approach lives HERE; scout is its default executor, any session is a valid one. Scout's other
standing duties: route tasks to the right discovery, and flag pairing/size violations it notices.
