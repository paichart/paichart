# Approach 1 — single pipeline, multi-device (worked example)

Companion to `.claude/knowledge/pipelines/firewall-policy-use-case.md` §3 Approach 1. The **same**
partner-HTTPS path as Approaches 2/3, but all three firewalls are **one vendor (PAN-OS)** owned by **one
team** — so it is modeled as a **single `network-provisioning` pipeline**, NOT a program. Files here:
`topology.json`, `requirements.md`. **There is deliberately no `interface-contract.json`** — a contract is a
*program* construct, and there is no program here.

> **ILLUSTRATIVE, not runnable as-is.** No live PAN-OS read-only harvest service is wired and the pan-os
> domain protocol is notional. This is a design worked-example. Approach 1's *shape*, though, is the
> production-proven one (the demos configured two cEOS switches in a single pipeline).

## Why this is Approach 1 (not 2, not 3)

- **One vendor** → one specialist chain understands every device; no need to split by domain protocol.
- **One team** → one approval; no per-team gate DAG.
- **The whole path is one coherent design** a single Design stage can hold at once — so the interdependency
  between hops is resolved **inside the designer's context**, not across pipelines. There is nothing for a
  program's contract or DAG to coordinate.

The sharpest contrast with Approach 3: **the very NAT that forces sequencing across vendors is a non-issue
here.** In Approach 3 the edge leg picks a NAT pool and downstream *sibling pipelines* must chain it; in
Approach 1 the **same designer** picks the pool and writes the downstream match rules in the **same design
turn** — one context, no chaining, no settledness gate. The interdependency didn't disappear; it stopped being
a *cross-pipeline* problem because there's only one pipeline.

## The shape (one pipeline, four stages — no program machinery)

```
Single PIPELINE task  (launched per PIPELINE-HARNESS-USER-GUIDE — a normal pipeline, NOT pov-program)
        │  harness CREATE decomposes the objective into typed specialist tasks in ONE stage
        ▼
[ Harvest ] ──▶ [ Design ] ──▶ [ Author ] ──▶ [ Review ]      (deliverables chain via §6 INTRA-pipeline)
 read all 3     hold all 3      per-device      end-to-end
 devices        in context,     PAN-OS diffs    consistency +
 (read-only)    one rule set                    blast-radius + rollback
        │
        ▼
 SYNTHESIZE → confidence-scored, approved-but-unapplied change packages (one per device) + apply-order note
```

Compared with the program examples in this folder, everything is **absent by design**: no Program Architect,
no `interface-contract.json`, no sibling-pipeline DAG edges, no per-team gates, no Node C. The single
pipeline's own confidence gate + human review are the control, and §6 chaining (children populate the context
of the next) is the only coordination needed.

## When Approach 1 stops being enough (the escalation triggers)

Re-run the seam test (`firewall-policy-use-case.md` §4) and move to a program the moment a real boundary
appears:
- a **second vendor** on the path (one chain can't harvest+design two vendors) → **Approach 2** (or 3);
- a **second approval team** owning part of the path → **Approach 2** (or 3);
- a **genuine runtime dependency across a boundary** the single designer can't hold in one context →
  **Approach 3**.

Rule of thumb from the decision framework: **start here.** Don't reach for program machinery until a vendor,
team, or cross-boundary runtime dependency forces it.

## Making it runnable (the follow-up path)

1. Publish a read-only PAN-OS harvest **descriptor** + stand up the read-only MCP service (mirror the ceos-lab
   rig), pointed at three device targets.
2. Add the **pan-os** domain protocol + specialist role guidance — a use-case **config** exercise per
   `ADD-A-PIPELINE-HARNESS-AGENT.md`, NOT an engine change.
3. Run it as a single PIPELINE task. Approach 1's *shape* is already demo-proven (multi-device single
   pipeline); this only adds the PAN-OS domain surface, so it needs no new validation of the mechanism itself.
