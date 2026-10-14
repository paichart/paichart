# Requirements-Authoring Discovery

**Last Updated**: 2026-10-11 | **Status**: ACTIVE | **Last Validated**: 2026-10-11 (every expectation below run
against the tree the day it was written)
**Paired specialist**: `.claude/agents/requirements-authoring-specialist.md` (split from pipeline-harness 2026-10-11,
SPECIALIST-LIFECYCLE-GUIDE §3b)

**What this domain is:** how a program's INPUT is produced. A program objective becomes a published, answered
`requirements.md` that a `pov-program` run reads. The steps are the requirements-authoring pipeline (Harvester →
Author → Reviewer), the design-decision question registry, the owner-answer session, the publish checks (coverage,
citations, dropped clauses, size, harvested-state lint, template residue), the in-run form check and its correction
turn, the publish pass and URL verification, and the `requirements-spec` skill that orders them.
**What it is not:** how the program CONSUMES the spec (pipeline-harness), how the in-run check's fact is STAMPED
(execution-facts), and how a text or model change is MEASURED (model-evaluation).

## Run These Greps FIRST

```bash
# The registry — rows by id (leg · producer · gate · auth · routing)
grep -cE '^\| .(<token>|<producer>|approver|gate)\.' .claude/knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md   # expect 19

# The three pipeline roles and their owning seed (infra_state_harvester is SHARED with four infra domains)
grep -c "defaultRole: '" scripts/seed-requirements-authoring-templates.ts   # expect 3

# The Reviewer is a REVIEWER_ROLES member (terminal VERDICT parsed)
grep -c "requirements_reviewer" lib/agents/harness/parse-verdict.ts   # expect 1

# The Author's model tier (Opus 5.5 since the 2026-10-08 GUI switch, codified 2026-10-10)
grep -c "requirementsAuthor: 'claude-" lib/agents/model-tiers.ts   # expect 1

# The in-run TypeScript port of the publish checks (coverage, citations, clauses, size lint, form check,
# correction, pysem, artifact names, generated data)
ls lib/agents/harness/requirements-*.ts | wc -l   # expect 9

# Requirements test suites in package.json (6 in test:all-validation; the 3 Python suites are out of CI)
grep -cE '^    "test:requirements-' package.json   # expect 9

# The correction turn's kill switch is read in three lib files
grep -rl "REQUIREMENTS_FORM_CORRECTION_ENABLED" lib --include=*.ts | wc -l   # expect 3

# The skill's docs/ and scripts/ are SYMLINKS to the canonical homes (never copies)
find .claude/skills/requirements-spec/docs .claude/skills/requirements-spec/scripts -type l | wc -l   # expect 9

# Knowledge docs for the domain
ls .claude/knowledge/pipelines/requirements-authoring/*.md | wc -l   # expect 6

# The skill's own register (Z14 onward; Z1–Z13 stay in the open register) — grows with healthy work
grep -cE '^- \[[ x~-]\] Z[0-9]+' .claude/skills/requirements-spec/work/REGISTER.md   # expect >=40

# Shipped 2026-10-12 — each a property, a floor where healthy work adds hits (re-run 2026-10-13 before writing)
grep -c "export const REQUIREMENTS_ADOPTION_RULE_VERSION = 4" lib/agents/harness/requirements-form-correction.ts   # expect 1 — Z66 rule 4 live
grep -c "citationsNarrowed" lib/agents/harness/requirements-form-correction.ts   # expect >=1 — the item-words guard (Z66 review F1)
grep -c "enforcer-scope" scripts/seed-data/requirements-skeleton.tmpl   # expect >=1 — group 4 auth row in the Author's skeleton
grep -c "item-<N>" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts   # expect >=1 — group 4 item rows in the Author guidance
grep -c "OWNER_FORMAT_COMMENT" scripts/publish-generated-spec.py   # expect >=2 — Z65 template-comment removal (definition + use)
```

Derive-state (no expectation; read the value):

```bash
grep -A8 "name: 'requirements-authoring-protocol'" scripts/seed-protocol-prompts.ts | grep -o "version: '[0-9.]*'"
grep -cE '^- \[ \] Z[0-9]+' .claude/skills/requirements-spec/work/REGISTER.md      # open skill-register items
ls ~/paichart/scripts/requirements-rules.py                                         # the PUBLIC canonical writing rules + lint
node -e 'const s=require("./package.json").scripts,c=s["test:all-validation"];const i=new Set([...c.matchAll(/npm run ([\w:.-]+)/g)].map(m=>m[1]));Object.keys(s).filter(k=>/requirements/.test(k)).forEach(k=>console.log(k,i.has(k)?"IN-CI":"out"))'
```

## Where everything lives

| Concern | Canonical home |
|---|---|
| The question registry (keys, classes, answer forms, add-a-key / add-a-class checklists, worked example Z49) | `.claude/knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md` |
| Owner-answer session (zero run → grouped answers → merge → regenerate) | `…/requirements-authoring/OWNER-ANSWER-SESSION.md`; merge ONLY via `scripts/build-answered-objective.py` |
| Publish pass + checks + `--lint-read` | `…/requirements-authoring/PUBLISH-GENERATED-SPEC.md`; `scripts/publish-generated-spec.py` |
| Pipeline design record | `…/requirements-authoring/requirements-authoring-pipeline.md` |
| Operator procedure (blind; never holds reference answers) | `.claude/skills/requirements-spec/SKILL.md` + `STEP-BY-STEP.md` (owner guide) |
| Skill register (Z14+) and per-objective work folders | `.claude/skills/requirements-spec/work/REGISTER.md`, `work/<objective>-<date>/` |
| Python checks (canonical semantics) | `scripts/check-requirements-{coverage,citations,clauses}.py`, `scripts/build-row-item-map.py` |
| In-run TypeScript port (parity-pinned) | `lib/agents/harness/requirements-*.ts`; `scripts/test-requirements-form-check-parity.ts` |
| Role guidance (Author / Reviewer) | `ROLE_GUIDANCE_LIBRARY` entries `requirements_author`, `requirements_reviewer`; owning seed `scripts/seed-requirements-authoring-templates.ts` |
| Protocol + embedded skeleton | `requirements-authoring-protocol` in `scripts/seed-protocol-prompts.ts`; `scripts/seed-data/requirements-skeleton.tmpl` (generated from the public template) |
| Public template + writing rules + lint (D7 cross-repo pair) | `~/paichart/program-artifacts/_TEMPLATE/requirements.template.md`; `~/paichart/scripts/requirements-rules.py` |
| Patterns earned here | `patterns/owner-decision-elicitation-pattern.md`; the in-run facts-only correction pattern (PATTERN-REGISTRY) |

## Expectation checks (prose, not greps)

**Reviewer checklist:**
- Every registry key appears in four copies that must agree: the template row, the Author's block list, Reviewer
  check 8.1, and the registry table. `test:requirements-guidance-anchors` and `test:requirements-skeleton-parity`
  pin them. A red pin means a copy drifted. Fix the copy, never the pin.
- Python is the canonical semantics, and the TS port must equal it on the whole corpus
  (`test:requirements-form-check-parity`). A Python change without the port is a series-cut-sized defect.
- The size checks measure against the PROGRAM ARCHITECT's read budget (R1, 2026-10-12): the TS port imports
  `PROGRAM_ARCHITECT_READ_BUDGET` (never a literal); `test:requirements-form-check` pins PER_FILE_MAX = 64,000 (71,000
  physical − one page) and that the seeded Architect turn cap grants the 12 per-run pages (or names it PENDING).
- The owner's row↔item map rides in `metadata.requirementsRowItemMap` at launch. Without it, the clause check derives
  the map from the draft and its findings are weaker (read `inputs.ownerRowItemMap` on the fact).
- Author-invented rows vary per generation (R1 class). Since group 4 (2026-10-12) coverage splits them: "invented key
  restates item N — key it <token>.item-<N>" (Author-actionable) vs "invented key asks a decision no key or item asks"
  (owner; filed, shown to the owner, a registry candidate on recurrence — Z51/Z52). The old "unknown key for a known
  token" string is no longer emitted.
- A generated spec is never hand-edited. A defect means regenerate.

## Series and cuts

The requirements series cut at 2026-10-08 22:01:09Z (Author → Opus 5.5), the 2b deploy (form check shadow),
2026-10-09 04:00:17Z (correction ON), 2026-10-10 01:29:20Z (batch 1, adoption rule v2) and 2026-10-10 06:56:01Z
(Z49 + Z48 clause checker), 2026-10-11 17:39:19Z (groups 1+2+3a, adoption rule 3), 2026-10-12 03:35:57Z (group 4,
protocol 1.10.1), 04:24:42Z (false-alarm fixes) and 09:27:20Z (Z66, adoption rule 4). CLAUDE.md's health-run section
carries each one; read it before comparing any requirements number across dates.

## Moved from pipeline-harness-discovery (2026-10-11 split)

These three blocks moved verbatim with the split. Their expectations were re-run the day they moved.

### Publishing a generated spec (2026-09-24)

Procedure: `.claude/knowledge/pipelines/requirements-authoring/PUBLISH-GENERATED-SPEC.md`. The publish pass depends on
the splice tool's two modes and on the operator HOWTO still describing the step — confirm both exist:

```bash
grep -c "def skeleton\|'--insert'\|'--check'" ~/paichart/scripts/requirements-rules.py   # expect >=3
grep -c "If the requirements.md was GENERATED" scripts/seed-protocol-prompts.ts            # expect >=1 — the heading, plus changelog mentions (2 at 2026-09-24)
```

The design-decision questions (2026-09-29) are maintained in
`.claude/knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md`, and the key-parity check compares it
with the skeleton, the Author guidance and Reviewer 8.1 per class. Confirm the registry is still one of the compared
copies (a registry dropped from the check would drift silently):

```bash
grep -c "keysFromRegistry(REGISTRY)" scripts/test-requirements-guidance-anchors.ts   # expect 1
```

The owner-answer session (2026-09-30) turns a zero-decision generation's owner block into an answered objective. Its
merge must stay mechanical — confirm the procedure still points at the script, and the script still refuses an
unanswered question:

```bash
grep -c "build-answered-objective.py" .claude/knowledge/pipelines/requirements-authoring/OWNER-ANSWER-SESSION.md   # expect >=1
grep -c "owner question(s) with no answer" scripts/build-answered-objective.py   # expect 1
```

### WARNING-QUESTION-WATCH — post-run design-gap read (added 2026-10-08)

Owned here since 2026-10-11 (model-evaluation → pipeline-harness 2026-10-08 → requirements-authoring). After each live program completes: read leg `change_reviewer`
labelled warnings (`reviewerVerdict.warnings`) and unlabelled non-blocking notes for a DECISION the leg made that no row
of `.claude/knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md` asks. Candidate = ≥ 3 legs across ≥ 2
objectives, not package form, no existing key under any reading → file it in the register with evidence and a draft
row; a row is built (registry checklist) only after Steve decides. Record every read, including empty ones.

```bash
grep -c "reviewer-warning watch" .claude/knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md   # expect 1 — the registry's admission rule names the watch as a source of measured misses
```

### 2026-10-09 — requirements pipeline: release-true ⇒ publishable (2b) — verification greps (every expectation run before it was written)

Steve's rule: the requirements pipeline's release must mean PUBLISHABLE. First piece shipped: the in-run requirements
form check + correction turn (fact production: execution-facts; this section pins the consumer side). The owner's
ROW-ITEM map reaches the run via the HARNESS task's `metadata.requirementsRowItemMap` (v1 JSON, written by
`/requirements-spec` step 9 via `scripts/build-row-item-map.py`), never the objective text.

```bash
grep -c "REQUIREMENTS_FORM_CORRECTION_ENABLED" lib/agents/harness/requirements-form-correction.ts   # expect 2
grep -c "test:form-correction-core && npm run test:requirements-form-correction" package.json   # expect 1
```
- Before trusting a clause finding, read the fact's `inputs.ownerRowItemMap` — the derive-from-draft fallback missed gen 6's drop (Z44).
- Open: the release-gate conjunct itself (facts AND the Reviewer's judgement checklist — REQ-SPEC-REVIEWER-VARIANCE) is not built yet; the fact has no `publishable` field by design.
