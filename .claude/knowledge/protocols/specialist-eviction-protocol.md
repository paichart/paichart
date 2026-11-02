# Specialist Eviction & Size Budget Protocol

> **Protocol 12** | **Version**: 1.0 | **Created**: 2026-06-11 | **Born from**: the external-dev review of CLAUDE.md ("agent-config and knowledge-store became the same file") + the boundary-contract pilot (2,201 lines → split). Pilot artifacts: `cline_docs/reviews/eviction-rule-boundary-contract-pilot-2026-06-11/`.

**Purpose**: Keep specialist agent files small enough to load cheaply and sharp enough to review accurately. The agent file is **config + router**; knowledge lives in the repo's knowledge stores (discoveries, patterns, domain docs). Verification (Protocol 11 / health-runs) keeps knowledge *true*; this protocol keeps it *small*. They are different operations — a health-run with no eviction rule produces docs that are accurate and unbounded.

**Core thesis**: unbounded accretion defeats the discovery-first premise. A 2,200-line specialist forces the whole-document read the architecture was designed to avoid, and every dated assertion added is future sweep debt (Protocol 11). Sessions must be able to *remove* as routinely as they add.

---

## The Rules

### R1 — Session-pointer cap: **3 dated blocks per specialist**

A specialist may carry at most the **3 newest** `## 🆕 <date> Session` blocks. Adding a 4th triggers the R0 liveness review in the SAME commit: the oldest block moves unless it is still live. If it is, fold its live facts into the file's standing sections and move the rest (R3).

### R0 — The trigger is a LIVENESS REVIEW, not a cut (amended 2026-10-31, owner)

The line counts in R1/R2 are **review triggers, not eviction targets.** Crossing one starts a liveness review of the file. The review classifies every block by whether it is still live, and it is finished when nothing stale or superseded is left, **not when a number is hit**. Size alone never moves:
- **responder facts**: still true, and needed to diagnose a run or to act correctly on a typical invocation;
- **standing rules**: owner decisions, invariants, tripwires.

What the review moves (verbatim, to the domain library, per R3):
- **build-step status for finished work** (deploy/push/commit-id/"next:" lines of a closed arc). Fold each closed arc to one line pointing at its close-out record.
- **self-declared superseded lines.** These are wrong by their own account, and an agent can act on them.

A file still over budget after the review is acceptable when everything left is live. Record that in the commit message, then split the file at the next quarterly health-run only if it keeps growing. *Why (owner, 2026-10-31, near MVP):* "an inflexible rule". A size-driven cut risks evicting a live fact for being old, while the real hazard is a STALE line still in the file. First application: `pipeline-harness-specialist` went from 635 to 538 lines (119 lines of closed-join build pointers to the library; the responder facts kept).

### R2 — Size budget: **soft 500 lines / hard 800 lines per specialist**

- \> 500 lines: flagged in the quarterly health-run size scan (see §Quarterly hook) — run the R0 liveness review (a split only if live content keeps growing).
- \> 800 lines: do not append anything further; run the R0 liveness review first, then split if it is still over.
- Discoveries get a looser budget (they hold the grep library): soft 800 total / **hard 800 PROSE lines** (total − fenced-code lines). CALIBRATED 2026-06-11 by the Phase 2 pilot: the original "hard 1,500 total" was uncalibrated; boundary-contract-discovery post-trim sits at 1,533 total but only ~700 prose with 54% executable greps — cutting further would cut the accuracy engine itself. Prose is the accretion surface; code is the product. CAVEAT (mcp-hub Phase 2): fenced blocks that are NOT executable commands — status snapshots, sample outputs — evade the prose metric; evict those by MERIT (stale-claim surface) regardless of the number. Measure: `awk '/^\x60\x60\x60/{f=!f;next} !f{n++} END{print n}' <file>`.

### R3 — Eviction dispositions (every evicted block gets exactly one)

| Content type | Disposition |
|---|---|
| **Lesson already encoded** in a pattern/protocol/memory/test | DELETE from specialist; the pointer to the canonical home suffices |
| **Durable knowledge, no canonical home yet** | MERGE into the paired discovery, a pattern file, or the domain library doc — then delete from the specialist |
| **Live open item** (unresolved P0, deferred fix, watch-item) | MOVE to the backlog/TODO it belongs in — open items are work-tracking, never agent history |
| **Pure history** (narrative of a past session, superseded protocol versions) | MOVE to the specialist's domain library doc (`.claude/knowledge/domain/<domain>/`) — greppable, not auto-loaded — or DELETE if it duplicates `cline_docs/` session records |

### R4 — The thin-specialist shape (what stays IN the agent file)

1. Frontmatter + role statement
2. ≤3 dated session blocks (R1)
3. Compact visual protocol (activation/completion box only — no progress bars, no inherited-progress percentages)
4. Discovery pointer(s) — run FIRST
5. Live invariants + critical bug-class hooks (the things a reviewer must not miss, each ≤~15 lines with a pointer to its canonical home)
6. Quick discovery greps (derive-state commands only — checklists go to protocol prose)
7. When to Use / Common Tasks / Key Files / Success Criteria / Handover (the fleet-standard scaffold)
8. A **Domain Library pointer** to where the evicted depth lives

### R5 — Rewrite structure parity

Any full rewrite/split runs the section-parity check against the fleet scaffold before commit:
`grep -cE "^#+.*(Critical Files|Key Files|When to Use|Handover)"` before vs after (memory: `feedback_rewrite_structure_parity`).

### R6 — Prove-before-write applies to the split

Every grep/claim that survives into the thin specialist is re-proven against the tree during the split (Protocol 11 Part C). A split is a health-run + eviction in one pass.

---

## Quarterly hook (extends the CLAUDE.md health-run milestone)

Add to the freshness scan:

```bash
# Size scan — flag specialists over budget
wc -l .claude/agents/*.md | sort -rn | awk '$1 > 500 && $2 != "total" {print "⚠️ ", $0}'
# Session-block cap check
for f in .claude/agents/*-specialist.md; do n=$(grep -c "^## 🆕" "$f"); [ "$n" -gt 3 ] && echo "⚠️  $n dated blocks: $f"; done
```

---

## Pilot evidence (boundary-contract, 2026-06-11)

| Metric | Before | After |
|---|---|---|
| Specialist size | 2,201 lines / 88K | see pilot dir (target ≤ ~500) |
| Dated session blocks | 4 | 3 (05-24 evicted per R3) |
| 5-minute-protocol copies | **3** (v1 :352, v2 :815, v3 :1976) | 1 canonical (domain library) |
| Inlined pattern library | ~1,400 lines in agent file | `.claude/knowledge/domain/boundary-contracts/` |

Full triage table: `cline_docs/reviews/eviction-rule-boundary-contract-pilot-2026-06-11/PILOT-PLAN.md`.

## Related

- Protocol 11 (drift sweep) — keeps surviving content TRUE; this protocol keeps it SMALL
- `feedback_rewrite_structure_parity`, `feedback_specialist_discovery_pairing`
- The external-dev review (2026-06-11): "keep the agent as a router over docs the repo already maintains"
