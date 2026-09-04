# Agent Tool Surface & Read-Depth — why synthesis harvests comments, not reports

> **Type**: Domain finding (validated) · **Established**: 2026-07-03 (Meridian capstone run `cmr479v0y0009yx1ebh53tcxv`)
> **Companions**: [[post-run7-empirical-findings]] · [[HARNESS-MENTAL-MODEL]] · FR `cline_docs/follow-ups/tool-result-truncation-caps-reassess-2026-06-26.md`

## The finding in one line

**An agent's read-depth is set by its *tool grant*, not by the tool-result truncation cap** — and the harness's default agent grant does **not** include `fetch`, so agents read *summaries* (completion comments + auto-chained context), never raw *artifact bodies*.

## The agent tool surface (ground truth)

Agents are granted from a fixed six-tool consolidated set — `execution-hub-guidance.ts:15` `CONSOLIDATED_TOOLS`, resolved via `deriveMcpToolNames` (`agentExecutionEngine.ts:483`):

```js
const CONSOLIDATED_TOOLS = ['project', 'perform', 'analytics', 'template', 'services', 'registry'];
```

**`fetch` and `search` are NOT in it.** They are *client* tools (Claude Desktop / ChatGPT pull resources with them); an agent cannot call them. The legacy tool-name mapping (`execution-hub-guidance.ts` `LEGACY_TOOL_MAP`) only normalizes legacy names into those six — nothing produces `fetch`. (Role guidance in `pAIchartUniversalTemplate.ts:388/:401` *also* tells agents not to call `fetch(id)` / `agent.results(verbose:true)` — belt-and-suspenders against a tool they don't have, plus the 50 KB Tier-2 overflow the latter causes.)

**Consequence:** to read another task's work, an agent uses `project(task.context)` (the completion **comment** — a summary) or its auto-injected **§6 Pipeline Context** (the upstream child's `finalResponse`). The only path to a raw artifact *body* is `perform(agent.results, verbose:true)` — which *is* the discouraged Tier-2-overflow anti-pattern. The platform is built so **agents consume curated summaries, not raw bodies.**

**Grant mechanism (authoritative detail):** a template's `selectedTools` controls the executable `functions:` array; an **empty/collapsed grant silently expands to all six** (`execution-hub-guidance.ts:58`), and the per-turn executor is **grant-blind** (no enforcement — `agentic-tool-loop.ts:652`). No seeded template sets an explicit grant today, so every agent effectively gets all six (and only those six). See **agent-execution-specialist** (2026-06-16 tool-grant investigation) and **sec-ops-specialist:39** (same fact, confinement angle).

**One addition since (2026-07-10, `3264e28f`) — `read_more`, and it does NOT change the read-depth thesis.** A truncation-recovery pager is now a **seventh** tool an agent can call, but NOT via the consolidated grant: `READ_MORE_FUNCTION_DEF` is **injected directly into `mcpFunctions`** at both build sites (`agentExecutionEngine.ts` + `stream/route.ts`) and served by the loop's name-interceptor — embedded-only, never client-published, never in `CONSOLIDATED_TOOLS` (so every "six consolidated" count on this page stays true; it's a distinct injected category). Crucially, `read_more(ref, offset)` pages the tail of a truncated result the agent **already received in THIS execution** — *alone* it does **NOT** reach artifact *bodies* or other tasks' outputs; it only recovers the overflow of a call the agent itself made this run. **⚠️ BUT THE TOOLS COMBINE (precision fix 2026-08-16, prompted by exactly this sentence being read as a hard wall)**: `perform(agent.results, verbose: true)` on another task IS "a call the agent made this run", returning up to the 100 KB V1 ceiling (`agent-results-handler.js:280`) — so `verbose` + `read_more` paging is a real, if laborious, body-read path to another task's output, no longer bounded by the first Tier-1 window. The correct statement of the thesis is therefore a **design posture, not an enforcement boundary** (the same shape as the D1 tool-grant fact): the defaults condense, the role guidance discourages the deep path, and agents observably operate within the defaults — "the platform curates what agents read and agents comply", NOT "agents can't read". So this **exercised** the "add a tool to the surface" door below — for *same-result paging*, with the combination above as the priced escape hatch; a first-class arbitrary-artifact reader remains a deliberate decision not taken.

## Read depth is deliverable-dependent

From the 2026-07-03 capstone (synthesize a delivery case study from a POV's execution history): the Artifact Harvester harvested **comments only** (no `fetch`, self-reported) and produced an **85/100** publication-passed case study. It *self-flagged* the boundary: it could not quote verbatim config, and a deliverable *requiring* verbatim snippets would need artifact-body access.

So *"does the truncated tail matter?"* has a concrete answer:

| Deliverable class | Comments/summaries enough? | Why |
|---|---|---|
| **Narrative / recap** (case study, post-mortem, exec summary) | ✅ yes | outcome + verdict + scores + trust-posture all live in the comment |
| **Verbatim reproduction** (config-quoting report, full diff) | ⚠️ no — but achievable (2026-07-04; easier since 2026-07-10) | needs `perform(agent.results, verbose:true)` on the *source* runs — first ~8 KB reaches the LLM through the Tier-1 window, **and since `read_more` (2026-07-10) the tail is pageable** rather than lost, up to verbose's 100 KB ceiling — **plus per-source decomposition + adequate harvest-role output budget** — see the 2026-07-04 update below |

## 2026-07-04 update — the verbatim case ran (cutover-runbook Runs 1+2)

The verbatim class was exercised live twice on Meridian (FR §0b has the full evidence). What changed in this finding:

- **Verbatim reproduction is achievable with the existing tool surface and caps.** Run 2 produced all 4 changes verbatim (forensically byte-diffed; zero invented config across both runs). No body-read tool needed.
- **The binding constraint for verbatim is the OUTPUT-generation ceiling, not read depth.** Run 1's single Harvester had all the config visible in its tool-result windows and still lost half the harvest to `max_tokens` mid-write. The fix is *decomposition* (one harvest task per source run — the orchestrator invented this itself when the failure was named in the objective) plus harvest-role output budget. ~~Engine-path hard ceiling: `maxTokens ≤ 21,333`~~ (SDK non-streaming guard — **RESOLVED same-day**: `generateText` streams internally since `15c1ab4d`; the request bound is now the model clamp (64K/128K) and the completion bound is the execution watchdog, ~35–45 K output @ 30 turns — `cline_docs/reviews/engine-streaming-accumulate-2026-07-04/` R4).
- **Scope note on the anti-pattern**: leaf harvesters verbose-reading their *named source* runs is NOT the §6-discipline violation (that was re-fetching your own pipeline's upstream instead of reading chained context). Tier-2 bounds the stored consequence either way, and its preview (8 KB since `365d746b`) now always covers what the LLM saw.
- **Residual integrity nuance**: under verbatim pressure, writers may render *predicted device outputs* ("Expected: `Loopback0 1.1.1.1 up up`") inside fences without marking them as predictions — the only non-sourced content observed. Template guidance should require labeling predictions.

## Why the comment channel is *good* fuel (not a degraded fallback)

The harness posts a machine-consistent comment skeleton per pipeline (CREATE → QUEUED decomposition → Execution Complete → SYNTHESIZE → completion summary) and a pre-digested `Summary` + `Confidence` field. It effectively maintains a **running executive summary** of each run. So a synthesis Harvester is *re-summarizing summaries* (uniform, high-signal, already-scoped), which is why cross-domain synthesis (network + k8s + terraform in one pass) works without per-domain handling. **Reading the comment is reading the channel designed to be read.**

## Why the curated-read posture is deliberate (2026-08-16 — evidence-linked, not asserted)

Every reason below is anchored to something measured or lived, because "our approach is good" is a
verdict and this doc trades in facts. The posture — condensed by default, deep reads priced but
possible — earns its keep on five independent grounds:

1. **Attention is the scarce currency, and it does not amortise.** ~30 K tokens of protocol prose
   already sit in the primacy region of every pipeline system prompt (prompt-construction review,
   2026-08-16 §0.2); caching amortises the *dollars* (~10× measured PIPELINE cache ratio,
   CACHING-AND-COST.md) but not the *attention*. Full artifact bodies on every cross-task read
   would spend the context window on transcription instead of reasoning — and the corpus's own
   burial evidence (the once-whipsawed Confidence CARVE-OUT, clause-tail reliability past ~4 K
   chars) says crowding is a real failure mode, not a hypothetical.
2. **Condensed surfaces are auditable chokepoints; prose re-reads are not.** When SYNTHESIZE
   misread a verdict (2026-07-14), the fix chosen was NOT "grant `fetch`" — it was the result.json
   **field-order contract** (facts before `finalResponse`, surviving head-slices) and
   **`leanFactsLine`** (the card carries the load-bearing facts). A fact that must survive a known
   condensation point gets *engineered* to survive it, and every consumer reads the same stamped
   value. A consumer re-deriving from 100 KB of prose reads whatever it reads, unauditable.
3. **Deep prose reads are echo surfaces.** The 2026-07-18 calibration incident: a reviewer handed a
   package's plausible verification table echoed it and approved at 92; the reviewer forced to
   construct caught the identical defect at 45. The anti-theater contracts (carry only structured
   blocks; construct-never-copy) work *because* agents consume curated, structured channels — a
   free body-read surface is a wider copyable-wrong-answer surface.
4. **Measured sufficiency at the default depth.** The 2026-07-03 capstone: comments-only harvest,
   85/100 publication-passed, and the agent *self-flagged* the boundary rather than fabricating
   past it. The 2026-07-04 verbatim runs: byte-diffed-verbatim output achieved *within* this
   surface. VT-15 (2026-08-16): 9/9 observables through condensed surfaces. The binding constraint
   found each time was output budget or fact-placement — never a missing body-read tool.
5. **The escape hatch is priced, not walled.** `verbose:true` + `read_more` paging exists for the
   genuine verbatim case; role guidance discourages it, so its friction is proportional to its
   rarity. That is graceful degradation in both directions — the common case stays cheap and
   auditable, the rare case stays possible — which is the same posture the containment engine takes
   with `unsupported[]` (degrade honestly, never block capability outright).

**The honest converse, stated so this section is not advocacy**: the posture is *load-bearing on
its mitigations*. It is only as good as (a) the condensed surfaces actually carrying the
load-bearing facts (the field-order contract and facts-line are not optional decorations — E1/GAP-1
showed facts silently unreachable when they lapse), and (b) chaining reaching the reads that matter
(the immediate predecessor's FULL `finalResponse` — which IS `report.md` verbatim — arrives via §6;
without that, "curated" would just mean "starved"). A deliverable class that genuinely needs
arbitrary cross-DAG body reads remains a deliberate surface-design decision, per the Corrections
section below.

## Corrections this supersedes

- The earlier consult claim (pipeline-harness-specialist runtime output, relayed, and in the FR's original framing) that *"the synthesis Harvester reaches the artifacts via `fetch(id)`, clipped at 8 KB"* is **wrong** — agents have no `fetch`, so that clip path is **structurally unreachable**. The 8 KB Tier-1 cap is *moot for the synthesis pipeline*.
- Implication for the truncation-cap FR: the read-depth lever is **tool-grant design**, not the cap constant. Env-var-ising the cap was considered and **rejected** (wrong knob, global-blast-radius footgun, no demonstrated need). If artifact-body reads are ever wanted (verbatim class), that is a deliberate decision to add a body-read tool to the consolidated surface with its own contract — not a cap tweak.

## Scope note

Artifact-synthesis is an **ETL over a bounded, *specified* source** (task text, a Phase-0 acquire from *named* MCP services, chained upstream context, or the POV's own execution records) — **not** open-corpus RAG. The "no open retrieval" boundary is drawn by exactly this tool surface.
