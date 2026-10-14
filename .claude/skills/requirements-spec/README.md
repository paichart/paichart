# requirements-spec — the packaged skill

One folder for the whole generated-spec flow. Invoke with `/requirements-spec`.

## How to start
Type `/requirements-spec` followed by the objective in one or two plain sentences — what the program must achieve, which
systems it touches, and what "nothing wider" means to you. Do not list design decisions or any current values (addresses,
names, counts): the flow asks every decision as a question, and current values are harvested, never typed in.
Example: *"/requirements-spec — specify a program that lets one namespace's current pods write to an archive bucket, and
nothing wider."* Expect to be asked for your OK before each launch, push and program task, and for your answers one group
at a time. User-facing summary: `.claude/knowledge/pipelines/PROGRAM-HARNESS-USER-GUIDE.md` §2 "Where the two artifacts
come from".

```
requirements-spec/
  SKILL.md        the walk-through (16 steps, 9 hard rules, every STOP)
  README.md       this file
  STEP-BY-STEP.md the plain-English walk-through for the owner (start here; worked examples live outside this folder — the skill stays blind)
  docs/           SYMLINKS to the canonical procedures (edit them at their home, never here)
    DESIGN-DECISION-QUESTIONS.md   → .claude/knowledge/pipelines/requirements-authoring/
    OWNER-ANSWER-SESSION.md        → same
    PUBLISH-GENERATED-SPEC.md      → same
  scripts/        SYMLINKS to the scripts (one copy each; tests and package.json use the originals)
    check-requirements-coverage.py → scripts/
    build-answered-objective.py    → scripts/   (byte-mirrored to ~/paichart/scripts)
    check-requirements-citations.py→ scripts/   (byte-mirrored to ~/paichart/scripts)
    publish-generated-spec.py      → scripts/
    check-requirements-clauses.py  → scripts/   (dropped-clause check, step 10)
    build-row-item-map.py          → scripts/   (the owner's map → harness metadata, step 9)
  work/           the working folder — one sub-folder per objective run, COMMITTED (the owner's answers are a record)
```

**Why links, not copies (Steve, 2026-10-08):** a copied script or doc drifts from its home — the stale-mirror class fixed
three times that day. Every file keeps one home; this folder is the view. The two scripts that find files relative to
themselves resolve through the link (`os.path.realpath`), proven by rebuilding the published `t1zero-v2` spec
byte-identical when called from here.

**Not linked:** `requirements-rules.py` lives in the PUBLIC repo (`~/paichart/scripts/`); `publish-generated-spec.py`
calls it there (`--repo`, default `~/paichart`). The flow needs that checkout.

**Tests:** `npm run test:requirements-coverage` · `npm run test:publish-generated-spec` (run from the repo root).

**A link that breaks** (a doc or script renamed or moved) shows as a dangling file here; the skill's step 0 reads the
docs through these links, so it fails loudly rather than reading stale text. Re-point the link in the same commit as the
move (Protocol 11).
