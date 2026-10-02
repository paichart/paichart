# Publish notes — telemetry-export-genspec-t1zero-v2

**Not a program input.** The program reads `requirements.md` and `topology.json` only; this note records how the spec
was produced and published, so the spec itself carries no history.

- **Source:** requirements-authoring pipeline task `cmunrlf23001ayx1ic5xns8vd` ("T1-zero answered, regeneration 5"),
  2026-09-30, requirements-authoring protocol **1.7.4**. The objective = the zero-decision objective + the same 16
  owner-answered items as `telemetry-export-genspec-t1zero`, except **item 16**, amended after Program Run 7 to
  act-regardless on all three consuming legs (a leg authors the change even when its harvest cannot confirm the
  enforcer sees the admitted attribute on the exporter path, and records that premise as UNTESTED). Regeneration 4
  used a first wording of that amendment which the Author misread as "gap"; regeneration 5's wording names the option.
- **`requirements.md`** = the pipeline's SYNTHESIZE `report.md`, minus the platform's "NOT RELEASED — quality gate:
  needs-revision" banner (removed under the waiver below), minus the Author's trailing `Confidence:` line, with the
  writing rules spliced (`requirements-rules.py --check`: byte-identical to canonical). The draft carried no
  "rules not yet spliced" status claim, so there was none to rewrite. **`topology.json`** byte-identical to
  `telemetry-export-genspec-t1zero/topology.json` (its stale route-advertisement sentence is tracked separately and is
  deliberately not edited here — the spec is the only variable).
- **Verdict:** NEEDS-REVISION (Reviewer 88). **Owner decisions left: none.**

## Owner waiver — Steve Terry (approver of record), 2026-10-01
Published despite two write-up findings, neither of which changes what the program is told:
1. `observability-config.enforcer-absent` cites two items (12 and 13) instead of one. Items 12 and 13 overlap for the
   observability leg ("no configuration on 4317/4318" vs "no policy object"); the row states item 12's gap for the
   no-configuration case, and the leg's instructions route an existing configuration to replace. The overlap is in the
   owner's answers, not the spec — recorded for the next answer revision.
2. The owner block reads "none" but should list the forced `network-provisioning.inputs-empty` row (tier `default`);
   the owner had already accepted that default (answers map: `forced`). Same finding waived on the prior spec.

## Checks run before publishing
- Pre-publish gate (`copov15/scripts/check-requirements-citations.py`, parentheses-tolerant since 2026-09-30):
  **45 citations, 45 verbatim, 0 failing**; premise branches applying `principal-unseen` present on all three
  authorisation legs, each reading act-regardless ("author the change regardless … record the premise as UNTESTED").
- Harvested-state lint (`requirements-rules.py --lint --declared <objective>`): 0 state-shaped tokens. Full hand-read of
  the four Preconditions slots: pointer + property only, no harvested values or counts. The only address literals are
  the template's synthetic CIDR worked example.
- Publish checks: 0 `🗑` blocks, 0 `{{`, 0 `Confidence:` lines, 0 markers; *Writing rules* is the last section.

## 2026-10-02 — program view added (value-chain frozen window)

`requirements.program.md` added beside `requirements.md` (no published file edited). It is byte-identical to
`requirements.md` through `## Open questions`; the `## Writing rules` section (20,771 chars) is replaced by the
READING_NOTES block from `scripts/requirements-rules.py --program-view` — the omission is deliberate, the rule numbers
the body cites (#1, #2, #6) are glossed, and the two reading properties are carried. The full `requirements.md` stays the
human/editor copy and is NOT an input to a value-chain run.

Size check (`--size-check requirements.program.md topology.json`): ⚠️ fits — 48,539 delivered chars, 6/6 pages,
1,461 headroom; run 7/8 pages. The full `requirements.md` does not fit (9/6 pages — Program Run 14 stopped at 50,000).
The ⚠️ is ACCEPTED rather than trimmed: the frozen window must run the same spec body as Program Runs 11-14; a trim would
be a new spec version and a series break. An Architect reporting an incomplete read is a stop-line finding.
