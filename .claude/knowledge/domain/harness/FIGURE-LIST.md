# Figure List for arxiv Paper

**Target**: 3-4 figures (Meta-Harness has 4; AutoGen has ~5; ChatDev has ~3). All figures should render cleanly in single-column LaTeX.

---

## Figure 1: System Architecture Overview

**Placement**: End of Section 3.2 (Dual-Mode Operation) or start of Section 3.3.

**What it shows**: How a user objective flows through the harness and produces a deliverable, with the meta-agent and specialists as distinct layers.

**Content**:

```
         ┌────────────────────────────────┐
         │ User: "Assess cloud security   │
         │  posture and produce roadmap"  │
         └────────────┬───────────────────┘
                      │
                      ▼
         ┌────────────────────────────────┐
         │  Pipeline Harness (Sonnet)     │
         │  - Mode detection              │
         │  - Task decomposition          │
         │  - Template assignment         │
         │  - Dependency wiring           │
         └────────────┬───────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       ┌─────┐    ┌─────┐    ┌─────┐
       │Spec.│    │Spec.│    │Spec.│
       │  1  │───▶│  2  │───▶│  3  │    (Haiku)
       │(Arch)│    │(Rev)│    │(Anl)│
       └─────┘    └─────┘    └─────┘
          │           │           │
          └─────┬─────┴─────┬─────┘
                │ pre-exec  │
                │ context   │
                │ chainer   │
                ▼           ▼
         ┌────────────────────────────────┐
         │  Deliverable + confidence      │
         │  + execution metrics           │
         └────────────────────────────────┘
```

**Style**: Simple box-and-arrow diagram. TikZ or a clean Excalidraw export. Gray boxes, black arrows. No color gradients or shadows.

**Caption**: "Pipeline Harness architecture. A meta-agent (claude-sonnet-4-5) decomposes a one-sentence objective into typed specialist tasks, assigns templates, and wires dependencies. Each specialist (claude-haiku-4-5) runs with the complete output of its dependencies injected as pre-execution context. The harness uses confidence scores returned by each specialist to gate progression."

**Source**: Derive from the ASCII art in `ARCHITECTURE.md` and the system overview diagram in `WHITEPAPER-REFERENCE-v1.md`.

---

## Figure 2: Dual-Mode Auto-Detection Flowchart

**Placement**: Inside §3.2 (Dual-Mode Operation).

**What it shows**: The sibling-count branch that determines CREATE vs ORCHESTRATE mode.

**Content**:

```
    agent.execute fired on PIPELINE task
                  │
                  ▼
         task.list(stageId, exclude self)
                  │
                  ▼
           siblings > 0 ?
          ┌───────┴───────┐
         no              yes
          │               │
          ▼               ▼
   ┌─────────────┐  ┌─────────────┐
   │ CREATE mode │  │ ORCHESTRATE │
   │             │  │    mode     │
   │ - read POV  │  │             │
   │ - select    │  │ - infer     │
   │   phase     │  │   templates │
   │ - create    │  │   from      │
   │   stage     │  │   sibling   │
   │ - decompose │  │   desc.     │
   │ - author    │  │ - wire from │
   │   tasks     │  │   type      │
   │             │  │   hierarchy │
   └──────┬──────┘  └──────┬──────┘
          │                │
          └────────┬───────┘
                   │
                   ▼
            execute pipeline
           (Algorithm 1 from §3.4)
```

**Style**: Flowchart. TikZ `flowchart` library or draw.io. Diamond for decision, rectangles for actions.

**Caption**: "Dual-mode auto-detection. The harness's first action is to call `task.list` on its own stage and count siblings. Zero siblings triggers CREATE mode (decompose and author tasks); one or more siblings triggers ORCHESTRATE mode (assign templates and wire dependencies for user-authored tasks). Both modes share the execution pipeline."

**Source**: Derive from §3.2 prose and `PIPELINE-HARNESS-USER-GUIDE.md` mode detection section.

---

## Figure 3: Experiment 6 Execution Timeline

**Placement**: Inside §5 (Experiments), near the Experiment 6 paragraph.

**What it shows**: A time-ordered view of the 9 tool-call steps that made up Experiment 6 (Test G), with durations annotated.

**Content** (horizontal timeline):

```
t=0s   4s    14s   20s          68s         148s        220s 228s
 │     │     │     │            │           │           │    │
 ├──┬──┼──┬──┼──┬──┼────────────┼───────────┼───────────┼────┤
 │  │  │  │  │  │  │            │           │           │    │
 │  │  │  │  │  │  │  Spec 1    │  Spec 2   │  Spec 3   │    │
 │  │  │  │  │  │  │  (Arch)    │  (Rev)    │  (Doc)    │    │
 │  │  │  │  │  │  │  48s       │  80s      │  72s      │    │
 │  │  │  │  │  │  │  conf 88   │  conf 85  │  conf 92  │    │
 │  │  │  │  │  │  │            │           │           │    │
 │  │  │  │  │  │  └──────────► context ──► context ──► │    │
 │  │  │  │  │  │                 chain       chain     │    │
 │  │  │  │  │  │                                       │    │
 │  │  │  │  │  └── Step 4: dependency wiring           │    │
 │  │  │  │  └── Step 3: template assignment            │    │
 │  │  │  └── Step 2: mode detection (ORCHESTRATE)      │    │
 │  │  └── Step 1: user setup (4 tasks)                 │    │
 │  └── execution starts                                │    │
 └── t=0                               self-completion ─┘    │
                                       verification          │
                                                 summary ────┘
```

**Style**: Gantt-like horizontal timeline. Can be rendered in TikZ or matplotlib. Three specialist blocks (Architect, Reviewer, Documenter) with arrows between them showing context flow.

**Caption**: "Execution timeline of Experiment 6 (ORCHESTRATE mode, Test G). The harness detected three siblings within 14 seconds, assigned templates and wired dependencies by t=20s, then ran the specialists sequentially with pre-execution context chaining between each pair. Total pipeline duration: 228 seconds with 3/3 tasks completed and zero manual intervention."

**Source**: The step-by-step data is encoded in `project-page/index.html` (the 9-step interactive demo). Actual timings from the Test G execution records.

---

## Figure 4 (Optional): Stress Test Server Metrics Under Load

**Placement**: Inside §5, near Experiment 7 description. Optional — only include if the paper needs a fourth figure; the results table in §5.1 may be sufficient on its own.

**What it shows**: A flat-line time series of server-side metrics during the concurrency stress test, proving no degradation.

**Content**: Three subplot strip chart over the ~8-minute test window:
- Top: heap memory in MB (flat at 59)
- Middle: PG active connections (flat at 1)
- Bottom: pipeline MCP call completions per teammate (stacked bar per round)

**Style**: Matplotlib, three stacked subplots sharing x-axis (time). Grayscale or single-color.

**Caption**: "Concurrency stress test server-side metrics during Experiment 7. Five Claude Code teammates run 4 rounds of parallel MCP calls each. Heap memory and active database connections remained flat through the test window (30 sampling intervals, 10 s apart). 96 of 96 MCP calls succeeded with zero degradation."

**Source**: Stress test real-time log captured during the session.

**Decision**: Skip unless we need to pad to 4 figures. Figures 1-3 are the priority.

---

## Figure Count by Priority

| Priority | Figure | Purpose |
|---------|--------|---------|
| **P0** | 1 — System Architecture | Required; gives readers a mental model early |
| **P0** | 2 — Dual-Mode Flowchart | Required; makes §3.2 concrete |
| **P1** | 3 — Experiment 6 Timeline | Strongly recommended; gives empirical section a visual anchor |
| **P2** | 4 — Stress Test Metrics | Optional; only if we need a fourth figure for pacing |

---

## Tooling Recommendations

- **TikZ** for Figures 1 and 2 — LaTeX-native, clean academic style, version-controlled with the paper source
- **draw.io / Excalidraw** for initial sketches, export to PDF or SVG
- **matplotlib** for Figure 4 if used
- **NOT** PowerPoint, Keynote, or Google Slides — they tend to produce figures that look out of place in arxiv papers

Keep all figures black, white, and one accent color at most. Avoid gradients, drop shadows, and 3D effects. Arxiv papers have a visual convention; matching it signals that the authors know the medium.

---

## Source Data Locations

All figure content can be derived from existing documents:

| Figure | Source |
|--------|--------|
| 1 — Architecture | `ARCHITECTURE.md` (ASCII art in System Overview section) |
| 2 — Dual-mode | `PIPELINE-HARNESS-USER-GUIDE.md` (Mode Detection section) and §3.2 of this paper |
| 3 — Experiment 6 timeline | `project-page/index.html` (9-step interactive stepper) and session notes |
| 4 — Stress test metrics | `CONTINUATION.md` Experiment 7 results and real-time log transcript |

No new data needs to be gathered; the figures are just visual renders of content already captured in prose and in the live system's execution records.

---

## Version

- **v1** (2026-04-06): Initial figure list for arxiv v1 submission
