# Publish notes — telemetry-export-genspec-t1zero

**Not a program input.** The program reads `requirements.md` and `topology.json` only; this note records how the spec
was produced and published, so the spec itself carries no history.

- **Source:** requirements-authoring pipeline task `cmunahw5q0005yx7otydcrgj0` ("T1-zero answered, regeneration 3"),
  2026-09-29/30, requirements-authoring protocol 1.7.3. The objective = a zero-decision objective + 16 owner-answered
  items from a grouped owner-answer session over T1-zero run 2's owner block (43 questions incl. 3 added after it).
- **`requirements.md`** = the pipeline's SYNTHESIZE `report.md`, minus the platform's 3-line "NOT RELEASED — quality gate:
  needs-revision" banner (removed under the waiver below), minus the Author's trailing `Confidence:` line, with the draft
  status sentence rewritten to the post-splice truth and the writing rules spliced (`requirements-rules.py --check`:
  byte-identical to canonical). **`topology.json`** byte-identical to `telemetry-export-genspec-rev22/topology.json`.
- **Verdict:** NEEDS-REVISION (Reviewer 90). **Owner decisions left: none.**

## Owner waiver — Steve Terry (approver of record), 2026-09-30
Published despite four write-up findings, none of which changes what the program is told:
1. The owner block reads "none" but should list the forced `network-provisioning.inputs-empty` row (tier `default`); the
   owner had already accepted that default (answers map: `forced`).
2. The fabric and cloud legs do not cite their `.target` row inline; the targets they name are exactly items 5 and 2.
3–4. Both `item 16` quotes drop the word "on" ("…and **on** the observability stack's OTLP ingress…"); meaning unchanged.
   Found by the pre-publish gate only — the Reviewer missed both.

## Checks run before publishing
- Pre-publish gate (`copov15/scripts/check-requirements-citations.py`): 42 citations, 40 verbatim, 2 failing (findings
  3–4, waived); premise branches applying `principal-unseen` present on all three authorisation legs.
- Harvested-state lint (`requirements-rules.py --lint --declared <objective>`): 1 candidate ("4318 blocks" — the declared
  ports; false positive). Full hand-read of the Preconditions slots: pointer + property only, no harvested values.
- Publish checks: 0 `🗑` blocks, 0 `{{`, 0 `Confidence:` lines, 0 markers; *Writing rules* is the last section.
