# Publish notes — k8s-obs-collector-senders-genspec-v2

**Not a program input.** The program reads `requirements.program.md` and `topology.json` only.

- **Source:** `cmvc142en00hvyxzp21fk9861` — "Generate requirements: telemetry collector senders restricted to namespace pods", 2026-10-17, requirements-authoring protocol 1.10.1 (registry `c0ca080dd992…`). Answered generation 4 from objective v4 (owner items 1–23; Group I 2026-10-17 amends items 3, 16, 22, 23: the proxy's operator path is exempt by property, open-register C3-SPEC-OPERATOR-PATH). One execution per child, no truncation retry; in-run correction not attempted (no failing check) — the published text is the Author's original. Supersedes `k8s-obs-collector-senders-genspec/` (left unchanged: the input of record for program runs 1–3 and C-3).
- **Verdict:** APPROVED (Reviewer 93; quality gate approved). **Owner decisions left:** none in the spec (owner block: 0 blocking, 15 not-applicable). **F1 waived by the owner (below).**
- **`topology.json`** byte-identical to `k8s-obs-collector-senders-genspec/topology.json`.

## Checks run before publishing (publish-generated-spec.py)
- removed the Author's trailing Confidence line
- removed the template's format comment left in the owner block (template residue, Z65)
- topology.json copied byte-identical from k8s-obs-collector-senders-genspec
- harvested-state pre-filter: 0 hits (a pre-filter only — the §2 full read is still owed)
- writing rules spliced; --check byte-identical to canonical (✓ /home/steve/paichart/program-artifacts/k8s-obs-collector-senders-genspec-v2/requirements.md: rules spliced at the marker (232 non-blank lines).)
- §3 checks: 0 🗑 · 0 {{ · 0 Confidence · 0 marker · 0 stale claim · Writing rules last
- coverage: 0 errors (READ items above still need a person)
- citation gate: 0 findings
- dropped clauses: 0 flags
- size: requirements.md over the read limit → program view written and fits; the program fetches requirements.program.md
- §2 full human read for harvested state (names, counts, worked example, preconditions): done by the operator (Claude, requirements-authoring, for the POV owner) — 2026-10-17
- Derivation POPULATION matches the objective's noun: done (running pods of `trading`, host-network and deletion-requested excluded = item 4) — 2026-10-17

## Human read (§2) — 2026-10-17
- Full read of the Author's draft (473 lines). No harvested address, port, file name, grant or count anywhere: the only addresses are the synthetic worked example (192.0.2.0/24, in the derivation slot); "two blocks" is the deliverable's input/result pair. Preconditions are a pointer + a property in both legs. Lint: 0 state-shaped tokens.
- Item 23 carried: Pipeline 2 classifies every forwarding block as sender endpoint · exempt · non-sender; an exempt block is left unchanged with its allowances and listed "as exempt by owner decision, quoting the literal description line matched", with a mechanical check (`grep -qF '<quoted line>' before/<file>` → `FOUND`) and an `UNCHANGED` diff. The no-description-lines case is a gap. The premise "is not judged on exempt blocks".
- Node C check 2 now reads "Every block forwarding to an OTLP receiver is either such a sender endpoint or listed as exempt with its quoted description line"; check 3 requires exempt and non-sender blocks byte-identical.
- Contradiction arm: outcome unchanged (no change and a report, whatever `principal-unseen` says), now scoped to sender endpoints. Its definition is the arrival path (forwarded-address header, real-address substitution, translating hop); v1's extra "or from an address that is not a pod's own" is gone — with the operator path exempt that clause has nothing left to catch, and the registry arm is about the path.
- Carried over from v1, accepted then (skill register Z67 (1)): nginx named as "the proxy kind the Preconditions harvest read" in the exemplar and the validation commands.

## F1 — draft status line (owner decision before commit)
- Line 5 of both files: "Status: **DRAFT for human review** at the program plan gate. Not approved, not final, not ready to launch." Author-added (not in the template), echoing the objective's DRAFT line; `publish-generated-spec.py` removes only the "NOT RELEASED" banner form (skill register Z64, open). v1 had no such line.
- Precedent: `k8s-tf-log-archive-read-genspec-v2` was published with the same kind of line and its program runs planned and released without the Architect refusing.
- Options: (a) waive it here, named (recommended — it changes nothing a leg does; the plan gate it names is real); (b) regenerate (likely to recur while the objective carries the DRAFT line); never hand-edit.
- Owner decision: waive F1 — Steve Terry, 2026-10-17, "yes" (asked: "Waive F1?" after the line, its origin (Z64) and the log-archive-v2 precedent were shown).
