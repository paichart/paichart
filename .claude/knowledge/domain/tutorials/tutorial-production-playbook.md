# Tutorial Production Playbook

**Type**: Reusable process + conventions for producing the MCP Tool Excellence tutorial series
**Reference implementation**: Chapter 7 (tool consolidation) — every step below has a real Ch.7 artifact you can copy and adapt
**When to use**: Producing or extending any tutorial chapter — written chapter, YouTube script, Google Vids transcript, or HTML artifacts
**Confidence**: high (distilled from the full Ch.7 production cycle, 2026-06)

---

## How to use this in a fresh session

If you're picking up tutorial work cold, do this in order:

1. **Read this playbook** — it's the map. The detail lives in the Ch.7 files it points to.
2. **Read the chapter you're producing for** (e.g. `cline_docs/tutorials/09-hardening-mcp-tools.md`) and its script outline if one exists.
3. **Open the Ch.7 reference files** for whatever artifact you're building — they ARE the template (don't work from memory):
   - Chapter: `cline_docs/tutorials/07-tool-consolidation-case-study.md`
   - Script outline: `cline_docs/tutorials/07-youtube-script-outline.md`
   - Vids transcript: `cline_docs/tutorials/07-vids-transcript.md`
   - HTML artifacts: `cline_docs/tutorials/scene4_dispatcher.html`, `scene5a_four_to_one.html`, `ch7_supporting_visuals.html`
   - Diagram specs: `cline_docs/tutorials/diagram-specs.md` (Ch.7 = Diagrams 6, 7, 7b, 8, 8a)
   - Claude Desktop prompt: `cline_docs/tutorials/07-claude-desktop-artifact-prompt.md`
   - Recording setup (universal, all chapters): `cline_docs/tutorials/02-youtube-recording-setup.md`
4. **Check the status table** (bottom of this doc) for what's done vs remaining.
5. **Honour the cross-cutting lessons** (below) — they're hard-won; several are in auto-loaded memory.

---

## The per-chapter doc-set

A *fully produced* chapter has:

| File | Purpose | Public? |
|---|---|---|
| `NN-<slug>.md` | The chapter prose | **Yes** — mirrored to `~/paichart/tutorials/` |
| `NN-youtube-script-outline.md` | Shooting script: per-scene Screen / Artifact-controls / voiceover / production notes / timing / upload metadata | No (internal) |
| `NN-vids-transcript.md` | Clean spoken narration, per slide, paste-ready into Google Vids | No (internal) |
| HTML artifacts (`sceneN_<slug>.html`, `chN_supporting_visuals.html`) | The animated/step-through visuals | No (internal) |
| `diagram-specs.md` entries | Source content + render notes for each diagram (shared doc, one section per diagram) | No (internal) |

Universal (not per-chapter): `02-youtube-recording-setup.md` holds OBS/audio/export/upload mechanics. Per-chapter script outlines reference it and carry only their deltas — **do not duplicate the universal mechanics per chapter** (drift trap).

The internal index is `cline_docs/tutorials/mcp-tool-excellence-tutorial-plan-2026-04-30.md`.

---

## Naming conventions

- Chapter: `NN-<kebab-slug>.md` (e.g. `07-tool-consolidation-case-study.md`)
- Script outline: `NN-youtube-script-outline.md`
- Vids transcript: `NN-vids-transcript.md`
- Standalone step-through artifact: `sceneN_<slug>.html` (e.g. `scene4_dispatcher.html`)
- Multi-scene tabbed artifact: `chN_supporting_visuals.html` (tabs for the static scenes)
- Claude Desktop prompt (if using Claude Desktop to generate artifacts): `NN-claude-desktop-artifact-prompt.md`

---

## The production process

Each phase has a Ch.7 worked example. Skip phases that don't apply (not every chapter needs new artifacts).

### Phase 1 — Chapter prose (if not already written)
Draft in `cline_docs/tutorials/`, mirror to `~/paichart/tutorials/`. Match the established voice (neutral-technical; case studies earn first-person "we", standards docs don't). Audience can shift per chapter — **audit vocabulary for the new audience** (see lessons).

### Phase 2 — Ground every claim in the codebase BEFORE publishing
This is non-negotiable and the most expensive lesson of the Ch.7 cycle. Reference docs drift; do not copy "facts" from them into a public chapter. Verify against live code.
- Ch.7 worked example: the chapter said "28 tools / perform 13 actions / 33 total"; the codebase said **26 / 14 / 34**. Caught only because we grepped `tool-schemas.js` / `tool-security.js` before publishing. Commits `1338231e`, and the reference-doc correction in the same cycle.
- Rule of thumb: counts, action lists, file paths, tier numbers — grep them, don't trust the prose.

### Phase 3 — Specialist review (for substantive chapters)
- Launch reviews **discovery-first** — instruct each specialist to run its discovery prompt before reviewing (memory: `feedback_specialist_discovery_first`).
- Prefer 3+ specialists; even tangential ones surface things (memory: `feedback_prefer_more_specialists`).
- Build a **coverage table** mapping every recommendation to applied / deferred / rejected (memory: `feedback_specialist_recommendation_audit`). Ch.7 example: `cline_docs/tutorials/specialist-review-coverage-2026-04-30.md`.

### Phase 4 — Consistency pass against sibling chapters
Bring the chapter's intro structure, scope-framing, and cross-references into line with the established pattern (Ch.2 is the spine; Ch.7's "This is a case study, not a how-to" lead is the model for case studies). Worked example: commit on Ch.7 "consistency pass on Ch.7 intro to match Ch.2 structure".

### Phase 5 — Build artifacts
Two routes:
- **Build directly** (Claude Code writes the HTML) — fastest. Copy a Ch.7 artifact and adapt. `scene4_dispatcher.html` is the model for a *step-through trace*; `scene5a_four_to_one.html` for a *before/after with a counter*; `ch7_supporting_visuals.html` for a *multi-scene tabbed file* (static scenes as tabs, keys 1–N).
- **Claude Desktop prompt** — if Steve prefers generating there. `07-claude-desktop-artifact-prompt.md` is the model: self-contained (embeds all real content, since Desktop has no repo access), specifies the black-on-white style, the step model, and the exact animation.

See *Artifact conventions* below for the house style.

### Phase 6 — Wire artifacts into the script outline
Once artifacts exist, the script outline becomes a *shooting script*: add an "Artifact / controls" block per scene mapping voiceover beats → keypresses/steps, a top-of-file Artifacts table, and a recording-order note. Worked example: Ch.7 outline's Artifacts table + per-scene blocks (commit `b9120940` and the Scenes 6/7 extension `086b5e65`).

### Phase 7 — Vids transcript
Clean spoken prose, per scene, sub-split per slide (one block per Vids scene). Separate file (`NN-vids-transcript.md`), one-directional from the outline (outline plans *what* is said; transcript is the *delivery*). The outline carries a "Delivery narration" pointer line. Worked example: `07-vids-transcript.md` — note Scene 5a split into its 5 animation-step slides, and Scene 4 built in three layers because the dispatcher was the hardest concept.

### Phase 8 — Commit & push
- **copov15**: commit and push (I push). Pre-commit hooks run; let them pass.
- **paichart** (public): commit, but **Steve pushes paichart himself** — prepare the commit, do not `git push` the public repo unless told to in the same message.
- HTML artifacts + script outlines + transcripts are **internal** (cline_docs / copov15 only); only the chapter prose (and specs) are mirrored to paichart.

---

## Artifact conventions (the house style)

All HTML artifacts share one look and interaction model. Copy a Ch.7 file rather than rebuilding — the conventions are baked in.

- **Black-on-white.** CSS variables: `--bg:#ffffff; --ink:#1a1a1a; --muted:#6b6b6b; --line:#e0e0e0; --red:#d12727; --green:#1a7f37; --green-bg:rgba(26,127,55,.08); --amber:#b06000; --faint:#9a9a9a;` mono font stack `"JetBrains Mono","Fira Code",ui-monospace,…`.
- **1080p-legible.** `clamp()` font sizes tied to `vh`; the artifact fills the viewport, no page scroll (panels scroll internally if needed).
- **Step/click model** for animated artifacts: advance with click / → / Space, back with ←, reset with **R**; a step-dot indicator and "Step N / M" label.
- **Tabbed model** for the multi-scene file: tabs + number keys (1–N), a "Scene X" label.
- **Caption cards** (closing statements): near-opaque veil (`rgba(255,255,255,.97)` + blur) with a bordered white inner card, explicit `--ink` text — translucent veils let the busy diagram bleed through and kill contrast (fixed in Ch.7 commit `d0355a08`). Align the card toward the top, not centered, to avoid a big gap under the heading (`3f0784ce`).
- **Accuracy:** the artifact numbers must match the (code-grounded) chapter. Ch.7 artifacts show perform=14, 34 actions, −74% — verify against the chapter before rendering.

---

## Cross-cutting lessons (cite, don't re-derive)

These are in auto-loaded memory — read them, don't restate them:
- `feedback_specialist_discovery_first` — specialists run discovery before reviewing.
- `feedback_audience_shift_in_tutorials` — audit vocabulary per chapter's audience; don't carry tone forward. CI/CD jargon is wrong for first-time MCP builders.
- `feedback_specialist_recommendation_audit` — coverage table; don't trust your own headline.
- `feedback_prefer_more_specialists` — default to 3+.
- `feedback_verify_file_line_in_docs` — grep-confirm any file:line / count before writing it.

Lessons specific to this series, not yet in memory:
- **Ground counts in code before publishing** (Phase 2). The 28→26 / 13→14 / 33→34 corrections all came from grepping, not from the reference doc.
- **Qualitative framing for things that drift.** When a number could go stale (action counts, tier counts), state the *pattern* qualitatively in public docs rather than pinning an exact figure that immortalizes a number. (From the mcp-hub-specialist advice on the internal-superset / dogfooding note in Ch.8.)
- **The Ch.7 files are the template — don't fork skeletons.** Copy and adapt real files; blank templates rot out of sync with the house style.
- **paichart push is Steve's.** I commit both repos and push copov15; Steve pushes the public repo.
- **The "would a senior dev nod along?" test — universal-first framing.** Before publishing each video, run every scene against: *"Would a senior backend dev who has never touched MCP nod along and think 'yeah, I've hit the shape of that'?"* If yes, it's a strong resource and positions the author as experienced. If a scene only makes sense to someone who already knows pAIchart's codebase, reframe it universal-first: **lead with the pattern, demote the specific to "for example, on our server…"** The depth is the asset (schema-defined-≠-enforced, transport coercion, fact-vs-verdict, verbatim-port refactoring are senior, transferable lessons) — the *risk is not obscurity, it's proper-noun density* that makes a clip read as "internal stuff" rather than a universal lesson. The chapters already mitigate well (Ch.9 obfuscates to `widget`, Ch.11 calls the energy service "just the substrate," Ch.5/9/10 generalize in "What this isn't" sections; the artifacts keep internal symbols/commit-hashes off-screen). Constructs that *feel* niche but aren't: **the router/dispatcher is universal** (Express/Rails/Spring/gRPC/GraphQL all have one) — lean on it, don't apologize for it.
  - **Watch-list for proper-noun density (narrate "the file is ours; the discipline is yours"):** **Ch.10** (the wave/phase numbering — `7.0a`, `7.2.2` — and the real file name `mcp-server-http-clean.js` are on-screen) and **Ch.7** (consolidation specifics). Both are *fine* because the lesson (wave-and-stop refactoring; consolidation trade-offs) is universal, but they're the two where the on-screen specifics are densest, so explicitly frame the specific as substrate.

---

## Per-chapter status (2026-06)

All chapters are *written and published*, and the **video production layer** (script outline → diagram specs → transcript → HTML artifacts) is now **COMPLETE for the entire series — Ch.1 through Ch.12** (finished in the 2026-06 run). Nothing remains in the pipeline. The run took it from "only Ch.7 complete" to all twelve: Ch.1, 3, 4, 5, 6, 8, 9, 10, 11, 12 produced this run (Ch.2 was external, Ch.7 the reference impl), including authoring three chapters' outlines from scratch (Ch.1, 10, 11). What's left is **recording** (Steve's, external): drive the artifacts per each outline's controls + transcript, assemble in Google Vids.

| Ch | Title | Chapter | Script outline | Diagram specs | Vids transcript | HTML artifacts |
|----|-------|:---:|:---:|:---:|:---:|:---:|
| 1 | Tools that teach themselves | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | Ten gold standards (+ addendum) | ✅ | ✅ | ✅ | ✅* | ✅* |
| 3 | Smoke tests | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | Three-layer parameter | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | Transport boundaries | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | JSDoc + 7-layer | ✅ | ✅ | ✅ | ✅ | ✅ |
| **7** | **Tool consolidation** | ✅ | ✅ | ✅ | ✅ | ✅ **(reference impl)** |
| 8 | From tool to hub | ✅ | ✅ | ✅ | ✅ | ✅ |
| 9 | Hardening MCP tools | ✅ | ✅ | ✅ | ✅ | ✅ |
| 10 | Large-scale refactoring | ✅ | ✅ | ✅ | ✅ | ✅ |
| 11 | Error recovery signals | ✅ | ✅ | ✅ | ✅ | ✅ |
| 12 | Initialize instructions entry-point | ✅ | ✅ | ✅ | ✅ | ✅ |

Also published: `gold-standards-spec.md`, `mcp-tool-layered-architecture-spec.md`, `examples/` (minimal-tool, gold-standard-tool).

`*` Ch.2 video completed externally in Google Vids (the transcript/slides weren't saved back to the repo — that's fine; the repo doesn't need the final video assets). Ch.3 transcript + artifacts ARE in the repo (`03-vids-transcript.md`, `ch3_supporting_visuals.html`, `examples/gold-standard-tool/weather-smoke-test.md`) — built 2026-06 as the second run of this playbook.

**Ch.3 is a useful second reference**: it's a *live-demo* chapter (Inspector + editor), so it needed only **2 artifacts** vs Ch.7's five — the supporting-visuals tabbed file (Scene 5 + 7) and the real `weather-smoke-test.md`. It shows the playbook's per-scene judgment working: skip artifacts for live scenes, copy the Ch.7 shapes only where they fit.

**Ch.12 is a useful third reference — the *hybrid***: two live Claude Desktop scenes (1, 6, no artifact) + three standalone step-throughs for the conceptual cores (Scene 3 Tool-Search loop, Scene 4 instructions lever, Scene 5 two-transport trap) + one supporting-visuals tabbed file (Scenes 2 + 7). **4 artifacts**, between Ch.3 and Ch.7. Worth copying when a chapter mixes live demos with diagrams that genuinely need animation. Note `scene4_instructions_lever.html` carries an *accuracy gate* — it renders the production `getServerInstructions()` string verbatim and must stay count-free (the chapter's own lesson applied to its artifact). Built 2026-06 as the third run of this playbook.

**Remaining: nothing in the pipeline.** The video-production layer is complete for all twelve chapters; `diagram-specs.md` covers Ch.1–12 (Slides/Diagrams through #40). The only step left is the actual **recording**, which is external (Steve's) — each chapter's `NN-youtube-script-outline.md` (Artifacts table + per-scene controls) + `NN-vids-transcript.md` are the shooting guide. If a new chapter is ever written, run this playbook's pipeline for it.

Update this table as chapters are produced.

---

## Related

- Internal index: `cline_docs/tutorials/mcp-tool-excellence-tutorial-plan-2026-04-30.md`
- Public series: `https://github.com/paichart/paichart/tree/main/tutorials`
- Memory pointer: `project_tutorial_production_playbook` (so a fresh session surfaces this doc)
