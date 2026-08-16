> **Rendered verbatim from the pAIchart platform seed — version 1.4.0.**
> This is the exact protocol text injected into pipeline agents' system prompts. Internal
> cross-references (file paths, review records, role-guidance names, tool-call mechanics) are part
> of the record and resolve inside the platform, not in this repository. Nothing is edited for
> publication — the fidelity is the point.
>
> **Seeded routing description**: Seven-phase ETL workflow (plus optional Phase 0 source acquisition) for transforming raw unstructured source material (session history, customer interviews, decision records, support tickets, product analytics, or events from external MCP services like GitHub/Sentry/Jira/Slack) into a polished structured artifact (whitepaper, case study, blog post, RFP response, post-mortem). Use when the task description involves producing a deliverable from unstructured source material.

---

# Lived-Experience-to-Artifact Synthesis Protocol

**Version**: 1.3
**Created**: 2026-04-07
**Updated**: 2026-04-28 (Deliverable wiring subsection added — Editor produces customer article, Reviewer produces QA gate; harness CREATE wires metadata.deliverableSourceTaskId on self + suppressDefaultReportMd on Reviewer leaf. See cline_docs/reviews/report-md-policy-rework-2026-04-28/. Cross-reference to pipeline-orchestrator-protocol Step 5a for tool-call mechanics.)
**Previous update**: 2026-04-27 (Path 2 generalization: "war stories" prose generalized to "findings"; per-Phase Output destination lines explicitly map to finalResponse channel; conditional Phase 0 — Source Acquisition added for external-MCP-service synthesis)
**Author**: Claude Opus 4.6 + Steve Terry
**Purpose**: Transform raw source material (session history, debugging logs, decision records, customer interviews, support tickets, product analytics, or events from external MCP services like GitHub / Sentry / Jira / Slack) into a polished external artifact (whitepaper, case study, blog post, sales narrative, RFP response, post-mortem) without losing the concrete details that make it credible
**Proven By**: pAIchart whitepaper v1 → v2 → v3, where the v3 draft reached publishable structure with infused war stories in three iterations across one session (one of several validated synthesis shapes — engineering whitepapers, customer case studies, RFP responses, and incident post-mortems all fit the same seven phases)
**Time**: 2-5 hours per artifact, depending on artifact length and source-material density

---

## Executive Summary

An iterative loop that transforms unstructured lived experience into a structured external artifact while preserving the concrete details that make claims credible. Output is rated "publishable" or "needs editing" against an explicit bar — never against a vague "good enough" bar.

**Key Insight**: The most common failure mode in this kind of synthesis is *not* losing details. It is *conflating two distinct lessons into one paragraph because they share an experiment*. The protocol's center is a self-critique step (Phase 4) that exists specifically to catch conflation before it ships.

**Second insight**: Resist the urge to write final prose during integration. Write annotations first. Convert annotations to prose only after the structure is settled, because rewriting prose is 5× more expensive than rewriting annotations and leads to over-attached drafts that resist restructuring.

**Relationship to other protocols**:
- **specialist-review-protocol**: Use specialists to *generate* the harvest in Phase 1 (e.g., trouble-shooting-specialist for bugs, system-reviewer-specialist for architecture decisions). This protocol then transforms those harvests into an artifact.
- **discovery-first-workflow-guide**: Discoveries are an input to harvesting. A discovery prompt produces structured findings; this protocol turns those findings into prose other people will read.
- **bug-class-eradication-protocol**: Bug class registries are excellent harvest material for engineering blog posts and case studies.

---

## How This Protocol Maps to Agent Execution (Deliverable Contract — 2026-04-26)

This protocol was written for human practitioners; the prose below speaks of "harvest files" and "v2 artifacts" living on disk at file paths next to the target artifact. When the **Pipeline Harness** decomposes a synthesis pipeline into specialist sub-tasks, each agent executes ONE phase (or a small group of phases) and the I/O model maps to the platform's Deliverable Contract:

| Protocol prose says... | Agent reads as... | Persisted as |
|------------------------|-------------------|--------------|
| "Output: normalized event list" (Phase 0 Source Acquirer, when present) | Write the normalized event table as your final assistant response | `result.json.finalResponse` — auto-chained to the Phase 1 Harvester |
| "Output: a flat list of findings with concrete details" (Phase 1 Harvester) | Write the harvest content as your final assistant response | `result.json.finalResponse` — auto-chained to the next-phase Editorial Writer |
| "Output: the same artifact with annotations / restructured / integrated" (Phase 3, 5, 6 Editorial Writer) | Write the annotated/restructured/integrated artifact text as your final assistant response | `result.json.finalResponse` — auto-chained to the Publication Reviewer; ALSO becomes the harness's `report.md` (customer deliverable) via the engine's metadata-driven extraction (2026-04-28) |
| "Output: a list of conflation problems" (Phase 4 Reviewer) | Write the conflation list as your final assistant response | `result.json.finalResponse` — auto-chained back to the Editorial Writer |
| "Output: a specific gap list with severity ratings" (Phase 7 Reviewer) | Write the gap list + score as your final assistant response | `result.json.finalResponse` — leaf, but `report.md` is **suppressed** by harness CREATE (`metadata.suppressDefaultReportMd: true`) so the customer fetches the harness's `report.md` (= the Editor's article) |

Concretely: agents do NOT call `artifact.create` to write a file at a path, and they do NOT split the deliverable across `task.comment` calls. The deliverable channel is your final assistant message; the platform persists it. Use `task.comment` only for short coordination updates (phase transitions, blocker escalations).

When humans run this protocol manually (e.g., during whitepaper authoring), the file-path framing applies as written. When agents run it as a Pipeline Harness pipeline, treat the file paths as section labels rather than literal write targets — the underlying content is the same.

---

## Deliverable Wiring (synthesis-specific) — 2026-04-28

When the **Pipeline Harness** decomposes a synthesis pipeline (Acquirer → Harvester → Editor → Reviewer), the harness in CREATE mode wires the deliverable metadata so the engine can extract the customer-facing article correctly:

- On the **harness root** task: `metadata.deliverableSourceTaskId = <Editor task id>`
- On the **Reviewer leaf** task: `metadata.suppressDefaultReportMd = true`

Net effect at SYNTHESIZE-commit time:
- The harness's `report.md` = the Editor's `finalResponse` (the customer article), extracted by the engine
- The Reviewer's `result.json` carries the QA review (the gate), but produces no `report.md` (suppressed)
- The customer fetches the harness's `report.md` for the deliverable; the Reviewer's review is forensic-only

This avoids the "leaf is the deliverable" mismatch (Run 4, 2026-04-28): the leaf in a synthesis pipeline is the QA Reviewer, NOT the deliverable producer.

**For tool-call syntax see** `pipeline-orchestrator-protocol` Step 5a. The synthesis-specific decision rule (Editor = deliverable producer, Reviewer = QA gate) is the only specialization required here — the mechanics live in the orchestrator protocol so they apply uniformly across pipeline shapes.

---

## When to Use

- Producing a whitepaper, technical paper, or arxiv submission from session history
- Producing a customer case study from POV execution records
- Producing an engineering blog post from a debugging session
- Producing a sales narrative from a closed POV's deliverables
- Producing an RFP response that needs concrete proof points from prior work
- Producing a post-mortem that needs to teach lessons, not just record events
- Any task where the raw input is "what happened" and the desired output is "a structured artifact other people will read"

**Prerequisites**:
- A target artifact (existing draft, template, or known output structure)
- Source material with verifiable concrete details — git history, conversation logs, database records, log files, or specialist review outputs
- A target venue with a publishable bar (arxiv, customer-facing PDF, blog, internal post-mortem, etc.) — the bar must be specific enough to evaluate against

**Do not use for**:
- Greenfield artifacts where there is no lived experience yet (write the artifact first, then run this protocol on the next iteration)
- Pure marketing copy where concrete details would dilute the message (this protocol is for credibility, not persuasion)
- Single-paragraph outputs where the workflow overhead exceeds the writing effort

---

## The Seven Phases

```
Phase 1: HARVEST       — Extract concrete events with verbatim details
    ↓
Phase 2: MAP           — Identify which artifact sections each event reinforces
    ↓
Phase 3: ANNOTATE      — Add inline editing notes; do not write final prose yet
    ↓
Phase 4: SELF-CRITIQUE — Re-read with one question: "Are two distinct
                          lessons being conflated into one paragraph?"
    ↓
Phase 5: SPLIT/MERGE   — Separate conflated stories; consolidate redundant ones
    ↓
Phase 6: INTEGRATE     — Convert annotations to prose. One or two sentences
                          per story. Anchored in numbers, errors, or quotes.
    ↓
Phase 7: ASSESS        — Rate against the publishable bar with specific gaps.
                          Iterate from any earlier phase if gaps are large.
```

Phases 1-2 can complete in one session. Phases 3-7 typically take a second session because the self-critique (Phase 4) benefits from a context break. Do not skip Phase 4.

---

## Phase 1: Harvest

**Input**: Source material — session history, git log, conversation context, log files, database records, specialist review outputs, customer interviews, support tickets, product analytics, or a normalized event list from a Phase 0 Source Acquirer (when source material lives in external MCP services)
**Output**: A flat list of findings (concrete events, war stories, or domain-specific equivalents), each with verifiable details

For each finding, capture:

1. **One-line title** — short enough to scan, specific enough to remember
2. **What happened** — 1-2 sentences describing the concrete event (not its lesson)
3. **Why it was surprising / noteworthy** — 1 sentence on what made it memorable (for engineering content this is "what broke that the design didn't predict"; for case studies / RFP responses this is "what changed measurably" or "what the customer realized")
4. **Resolution / outcome** — 1-2 sentences with verifiable details: file paths, commit references, specific diagnostics, dollar amounts, time savings, named systems, error codes
5. **Artifact relevance** — where this could land in the target artifact (artifact section, customer-narrative beat, RFP requirement, etc.)

**Quality criteria for a good finding**:

- **Specific** — exact error messages, exact file names, exact numbers, named systems, verbatim quotes. "A session ID collision" is vague; "two executions both claimed execution ID `cmnjoo31t` within 17ms of each other and the CAS pattern saved us" is a finding.
- **Unexpected / load-bearing** — for engineering: the failure mode was not what the design predicted. For business / case studies: the customer's perception or measurable behavior changed in a non-obvious way. Surprises survive editing better than confirmations.
- **Has a character arc** — what happened, how long to diagnose / realize / observe, what the surprise was, what the resolution / outcome was. Two to four sentences.
- **Hard for an LLM to invent** — wall-clock durations, specific log messages, odd coincidences, "it took three tries", what the *first wrong hypothesis* was, named regulators, named competitors, named tools.

**Both bugs and emergences count.** A system failing in a weird way is a finding. A system *succeeding* in a way you did not expect is also a finding — and frequently the more valuable kind. The same applies to customer outcomes: surprising adoption patterns are findings, just as surprising churn signals are.

**Output destination — agent execution**: write the harvest content as your final assistant response. The platform persists this verbatim as `result.json.finalResponse` and (for leaf tasks) `report.md`; the next-phase Editorial Writer reads it via auto-chained pipeline context. Do NOT call `artifact.create` to write a file at a path. Do NOT split the harvest across multiple `task.comment` calls.
**Output destination — human practitioner**: a harvest file at the same level as the artifact, e.g., `WAR-STORIES-HARVEST.md` next to `WHITEPAPER.md`, or `CUSTOMER-INTERVIEW-FINDINGS.md` next to `CASE-STUDY.md`. Findings are appended to a session-headed section, never reordered or overwritten across sessions.

**Stopping condition**: 5-15 findings per harvest session. Fewer than 5 means you have not exhausted the source material. More than 15 means you are reporting general background instead of specific events — pull back to the surprises and the load-bearing observations.

---

## Phase 2: Map

**Input**: The Phase 1 harvest plus the target artifact's structure
**Output**: A mapping of findings to artifact sections

For each finding in the harvest, identify:

- **Primary landing spot** — the section that needs this finding most
- **Secondary landing spots** — sections where the finding would also reinforce an existing claim
- **Conflicting findings** — other harvest findings that compete for the same section

Most findings have one primary landing spot. A few have two. If a finding seems to belong everywhere, it is probably general background, not a specific event — return it to Phase 1 for sharpening.

**Output format**: Add an `Artifact relevance:` line to each finding. Be specific — "§3.1 Specialization, after the orthogonality paragraph" not "§3 somewhere".

---

## Phase 3: Annotate (do not write prose)

**Input**: A copy of the target artifact
**Output**: The same artifact with inline editing comments marking story landing spots

**Critical discipline**: This phase produces *editing notes*, not *final prose*. The prose comes in Phase 6. The reason for the separation is cost — annotations are cheap to move, edit, and delete. Prose is expensive to move because it accumulates voice and connective tissue that fights restructuring.

**Annotation format** (HTML comment so it survives markdown rendering but is invisible in viewers):

```markdown
<!--
FINDING — [finding title from harvest]

CONCRETE DETAIL: [the exact number, error message, file path, quote, dollar
amount, named system, or named regulator to fold into the prose]

SUGGESTED DIRECTION: [a sentence or two showing rough phrasing — not
final prose, just enough to communicate the intent]
-->
```

**Anti-pattern**: Multi-paragraph "suggested rewrites" inside annotations. The suggested direction should be 1-3 sentences. If you find yourself writing more, you are doing Phase 6 too early.

**Output destination — agent execution**: write the annotated v2 artifact text as your final assistant response (persisted as `result.json.finalResponse` and chained to the Phase 4 Reviewer).
**Output destination — human practitioner**: a v2 of the artifact with annotations inline. Original v1 stays untouched.

---

## Phase 4: Self-Critique

**Input**: The annotated v2 artifact
**Output**: A list of conflation problems, redundancies, and weight imbalances

Re-read the entire annotated artifact with one question in mind:

> **Are two distinct lessons being conflated into one paragraph because they share an experiment, a section, or a chronology?**

This is the most common failure mode and the only one this protocol exists to catch. Specifically look for:

1. **Conflated findings**: Two annotations on the same paragraph that teach different lessons. Symptom: the suggested direction is two ideas joined by "and also". Fix in Phase 5 by splitting into two paragraphs in different sections.

2. **Redundant findings**: Two annotations in different sections that make the same point with different examples. Symptom: cutting either one would not weaken the artifact. Fix in Phase 5 by keeping the stronger one and deleting the weaker.

3. **Weight imbalance**: A minor finding has a long annotation; a major finding has a short one. Symptom: the most important finding does not have the most prose dedicated to it. Fix in Phase 5 by re-allocating annotation depth.

4. **Wrong section**: An annotation lands in a section where the surrounding prose does not need it. Symptom: the suggested direction would require rewriting the host paragraph rather than infusing the story into it. Fix in Phase 5 by moving the annotation to a section that already makes the relevant claim.

**Stopping condition**: Re-read the entire artifact and list every issue you find in one pass. Do not fix during the pass — that is Phase 5's job.

**This phase is mandatory.** The whitepaper that produced this protocol initially conflated two emergent behaviors into one experiment paragraph. The conflation was caught only because Steve asked "is the big one represented appropriately?" In the absence of an external prompt, run Phase 4 explicitly. The cost of skipping it is shipping a paragraph that says less than the sum of its parts.

---

## Phase 5: Split or Merge

**Input**: The list of conflation problems from Phase 4
**Output**: An updated annotated v2 with stories properly distributed

For each problem from Phase 4:

- **Conflated**: Move one of the two findings to a different section. Update the corresponding `Artifact relevance:` line in the harvest to reflect the new mapping. Add a brief rationale in the new annotation explaining why these two findings are different lessons.
- **Redundant**: Delete the weaker annotation. Mark the deleted finding in the harvest as `[merged into ...]` rather than removing it entirely (preserves the audit trail).
- **Weight imbalance**: Expand or shrink annotations until depth matches importance.
- **Wrong section**: Move the annotation. Verify the new host paragraph already makes a claim the finding can reinforce.

**Output**: An updated v2 artifact where every annotation has a single clear purpose and no two annotations compete for the same paragraph.

**Stopping condition**: A second Phase 4 pass produces no new problems.

---

## Phase 6: Integrate

**Input**: The cleaned-up v2 with annotations
**Output**: A v3 artifact with annotations converted to prose

For each annotation:

1. Read the surrounding paragraph the annotation lives in
2. Identify the existing claim the paragraph makes
3. Write 1-2 sentences that anchor that claim in the concrete finding from the annotation
4. Place those sentences inside the paragraph, not as a sidebar
5. Delete the annotation

**Prose discipline**:

- **Anchor in specifics**: Every infused finding must contain at least one verifiable detail — a number, a file path, an error message, a dollar amount, a named system, a verbatim quote. Without a specific anchor, the finding is invent-able and loses credibility.
- **Casual, not dramatic**: The tone is "we learned this when X happened" or a parenthetical aside. It is not a dedicated subsection, not a sidebar box, and not a dramatic narrative beat.
- **Inside the paragraph, not outside**: The finding reinforces an existing claim. If the paragraph has to be rewritten to accommodate the finding, the finding is in the wrong section.
- **Length budget**: 1-2 sentences for most findings. 3-5 sentences for the most important finding in the artifact (typically one or two findings qualify). Anything longer becomes a section, which is a different kind of edit.

**Output**: A v3 artifact that reads as if it were written by someone who lived the events, not someone summarizing them after the fact.

**Stopping condition**: Every annotation has been converted. The v3 artifact contains zero HTML comments (or they are explicitly preserved as editing notes for future iterations).

---

## Phase 7: Assess

**Input**: The v3 artifact and a publishable bar definition
**Output**: A specific gap list with severity ratings

Rate the artifact against its target venue's publishable bar. Be specific about what would block submission. Common gaps:

- **Missing references / citations** (for papers)
- **Missing figures or diagrams** (for papers and case studies)
- **Missing author affiliation or acknowledgments** (for papers)
- **Unverified factual claims** (any artifact)
- **Thin comparison sections** (for any artifact that positions against alternatives)
- **No baseline comparison** (for empirical claims)
- **Tone mismatch with venue** (e.g., academic for arxiv, narrative for case studies)

**Output format**:

```
Rating: X/10 publishable

Strong (8-9/10):
- [item]
- [item]

Weak (5-7/10, would block submission):
- [item with severity]
- [item with severity]

What's missing for 9+/10:
- [concrete next action]
- [concrete next action]
```

**Honest critique discipline**: Do not soften the rating to be encouraging. The point of Phase 7 is to identify what would actually block publication, not to make the author feel good about the draft. A 7.5/10 honestly assessed is more useful than a 9/10 dishonestly assessed.

**Stopping condition**: The gap list contains specific actionable items with severity ratings. "Needs more polish" is not an actionable item.

---

## Iteration Decision

After Phase 7, decide:

| Rating | Decision |
|--------|----------|
| **9-10/10** | Submit / publish |
| **7-8/10** | One more iteration on the top 3 gaps. Loop back to Phase 1 for missing material or Phase 6 for prose improvements |
| **5-6/10** | Substantial gaps. Loop back to Phase 1 for more material, or reconsider whether the target venue is right |
| **Below 5** | The harvest is insufficient. Spend more time in Phase 1 on a different source-material angle, or accept that the lived experience does not yet support the artifact |

The whitepaper that produced this protocol scored 7.5/10 in v3 and was identified as "ready for editing, not ready for submission" with specific gaps (references, figures, baseline comparison, author affiliation). That is the right state for v3 of any artifact — close enough to feel finished, far enough that you can name what is missing.

---

## Failure Modes to Watch

**1. Skipping Phase 4 (self-critique)**
Symptom: The artifact ships with two findings conflated into one paragraph, and the conflation is caught only by an external reviewer.
Defense: Treat Phase 4 as mandatory. Run it even when the v2 looks clean.

**2. Writing prose during Phase 3 (annotation)**
Symptom: Annotations grow to multi-paragraph "suggested rewrites" that are hard to move and hard to delete.
Defense: Cap suggested directions at 3 sentences. If you need more, that is Phase 6's job.

**3. Inventing details during Phase 6 (integration)**
Symptom: A finding in the prose contains a number, file path, or quote that is not in the harvest.
Defense: Every concrete detail in v3 prose must trace back to a specific harvest entry. If it does not, either add it to the harvest with a citation or remove it from the prose.

**4. Soft-pedaling Phase 7 (assessment)**
Symptom: The rating is 9/10 but the artifact has missing references, no figures, and an unverified claim.
Defense: Specifically ask "what would block submission?" not "is this good?" The first question forces concreteness; the second invites flattery.

**5. Hesitating to delete weaker findings in Phase 5**
Symptom: Two redundant annotations both survive into v3 because deleting one feels wasteful.
Defense: The harvest preserves the deleted finding permanently (marked `[merged into ...]`). Deletion from the artifact is not loss of the finding; it is loss of an attachment point.

**6. Treating the harvest as the artifact**
Symptom: The artifact reads like a list of findings with thin connective prose instead of a structured argument with concrete examples.
Defense: Findings reinforce existing claims. They do not replace them. If a section needs more structural argument, fix the structure first and then come back to integration.

---

## Worked Example: pAIchart Whitepaper v1 → v3

This is one example synthesis run — engineering whitepaper. The same protocol shape applies to customer case studies (interviews + POV history → polished narrative), engineering blog posts (debugging session → public post), RFP responses (POV deliverables → procurement document), and post-mortems (incident timeline → teaching lesson). The findings, source material, and target venue change; the seven phases do not.

**Phase 1 (Harvest)** — 11 findings extracted across two sessions. Concrete details: error messages like `Token budget exceeded: Request would exceed hourly limit (117518 > 100000)`, durations like `22 of 30 tool turns`, file paths like `task-action-handler.js lines 268-288`, commit references like `commit 2d6fcfab`. Human practitioner output: `WAR-STORIES-HARVEST.md` with two session-headed sections. Agent output: same content as `result.json.finalResponse`, chained to the next-phase Editorial Writer.

**Phase 2 (Map)** — Each finding tagged with primary section. Two findings competed for §5 Experiment 3: the tool-turn budget masking incompleteness and the token-exhausted graceful degradation. Both have valid claims to that section.

**Phase 3 (Annotate)** — v1 was copied to v2 with inline `<!-- FINDING -->` comments. Each annotation included title, concrete details, and suggested direction. Total: 8 annotation blocks.

**Phase 4 (Self-Critique)** — Re-read produced one critical finding: the §5 Experiment 3 annotation conflated two distinct findings (Finding A: incompleteness masking → motivates self-completion guard; Finding B: graceful degradation → motivates §6.1 emergent behavior argument). The two taught different lessons but were stuffed into one experiment paragraph.

**Phase 5 (Split/Merge)** — The two findings were separated. Finding A stayed in §5 Experiment 3; Finding B moved to §6.1 Emergent Behavior as a second example alongside the parallel topology emergence. The §6.1 annotation gained the full concrete detail it needed to stand alone. Result: §5 stayed tight, §6.1 gained a defensible "two emergence cases" argument instead of one.

**Phase 6 (Integrate)** — v3 was written from scratch starting from v1 (not v2), with annotations consulted but not copy-pasted. Each finding landed as 1-3 sentences inside an existing paragraph. The §3.1 Persistence paragraph gained one sentence: *"the harness consumed 22 of its 30-turn budget executing one of five children, then returned with confidence 88/100 and a structured auto-comment that looked exactly like a successful completion."* Specific, casual, anchors the abstract claim that the self-completion guard exists for a reason.

**Phase 7 (Assess)** — v3 rated 7.5/10 publishable. Strong on structure, finding integration, and emergent behavior representation. Weak on missing references (entire bibliography is `[To be populated]`), missing figures (no system architecture diagram, no topology diagram, no sequence diagram), thin Meta-Harness comparison (two sentences where two paragraphs are needed), and bare author block. Decision: one more iteration on the top three gaps before submission.

**Total elapsed**: Approximately 4 hours across three sessions (harvest in session 1, integration in session 2, restructure in session 3). Each iteration was cheap because the protocol kept the cost of revisions low.

---

## Integration With Specialist Templates

This protocol can be executed manually by a single operator (as it was for the whitepaper). It can also be decomposed into typed agent tasks for execution by the Pipeline Harness.

**Phase 0 fires when** the task description names external MCP services (GitHub, Sentry, Jira, Slack, Linear, etc.) OR uses phrases like "pull from", "fetch from", "acquire from", "gather from", or "using the X MCP". When source material is local (git logs, session transcripts, project docs already in task.context, or upstream artifacts in the dependency chain), Phase 0 is omitted and the pipeline starts at Phase 1.

| Phase | Specialist Type | Seeded Template | Role |
|-------|----------------|-----------------|------|
| 0. Source Acquisition (conditional) | ACQUIRER | **Synthesis Source Acquirer** | Iterative `services.call` against named external MCP services; normalizes heterogeneous shapes (PR / error / ticket / message) into a flat event table; succeeds-with-partial when one source is unhealthy |
| 1. Harvest | ANALYST | **Artifact Harvester** | Curates 5-15 findings from local source material or from Phase 0's normalized event list; preserves verifiable details |
| 2. Map | ANALYST | (Same Harvester template, continuation phase) | Tags each finding with primary + secondary artifact-section landing spots |
| 3. Annotate | DOCUMENTER | **Editorial Writer** | Inline editing notes on the target artifact; no final prose yet |
| 4. Self-Critique | REVIEWER | **Publication Reviewer** | One question: are two distinct findings being conflated into one paragraph? |
| 5. Split/Merge | DOCUMENTER | (Same Editorial Writer template, continuation phase) | Resolves conflation / redundancy / weight imbalance from Phase 4 |
| 6. Integrate | DOCUMENTER | (Same Editorial Writer template, prose phase) | Converts annotations to final prose; anchors every claim in a verifiable detail |
| 7. Assess | REVIEWER | (Same Publication Reviewer template, assessment phase) | Rates against the publishable bar with severity-rated gap list |

**Pipeline shape — local source material (3 specialists, 3 children)**:
Harvester (Phases 1-2) → Editorial Writer (Phases 3, 5-6) → Publication Reviewer (Phases 4, 7).

**Pipeline shape — external source material (4 specialists, 4 children)**:
Synthesis Source Acquirer (Phase 0) → Harvester (Phases 1-2) → Editorial Writer (Phases 3, 5-6) → Publication Reviewer (Phases 4, 7).

In both cases auto-chained pipeline context (`lib/agents/harness/context-chainer.ts`) feeds each phase's `result.json.finalResponse` to the next phase as input. The harness orchestrates; the specialists execute.

A POV that has just closed could autonomously produce a customer case study by running this protocol against its own execution history (local) or against a combination of GitHub PRs, Sentry events, and customer support tickets (external). Same protocol; different decomposition shape.

---

## See Also

- `/.claude/knowledge/protocols/specialist-review-protocol.md` — for sourcing harvest material from specialists
- `/.claude/knowledge/protocols/discovery-first-workflow-guide.md` — for discoveries as harvest input
- `/.claude/knowledge/domain/harness/WAR-STORIES-HARVEST.md` — example harvest file
- `/.claude/knowledge/domain/harness/WHITEPAPER-ARXIV-v3.md` — example v3 artifact produced by this protocol
- `/.claude/knowledge/domain/harness/PROMPT-HARVEST-WAR-STORIES.md` — the harvest extraction methodology used by this protocol's Phase 1

