# Publish notes — k8s-tf-log-archive-read-genspec

**Not a program input.** The program reads `requirements.program.md` and `topology.json` only.

- **Source:** `cmv0hik5z003qyxmclqclywca` — "Generate requirements: log-archive bucket reads restricted to namespace pods (protocol: requirements-authoring)", 2026-10-09, requirements-authoring protocol 1.8.0. Run 2 of 3 under REQ-SPEC-THREE-RUN-TEST attempt 1 (run 1 = zero-decision generation `cmv0g162e000iyxmca3ydv6n2`; 20 owner questions answered as items 1–20 in one owner-answer session). Author Opus 5.5, form-correction loop ON. One execution per child, no truncation retry.
- **Verdict:** APPROVED (Reviewer 92; quality gate approved). **Owner decisions left:** none (owner block: 0 blocking, 13 not-applicable).
- **`topology.json`** adapted from `k8s-tf-podrange-authz/topology.json` (owner decision, Steve, 2026-10-09) — NOT byte-identical: that file describes the write/range program, so `name`, `description`, `cloud.purpose` and `interdependency.crossingValue` were reworded to this program (s3:GetObject; host list), and `cloud._plantedArtifacts` was added declaring the bucket's two planted tag fields (`tags.legacy_key`, `tags.note`; wording adapted from `telemetry-export-genspec-t1zero-v2`). Everything else byte-identical. Size re-checked with the adapted file: run pages 7/8, fits.

## Owner waiver

- **Approver of record:** Steve Terry (POV owner), 2026-10-09, in his own words: "B. Waive W1 (registry-caused rows), W2 and W3 (verified checker false positives — the clauses are present at :186-187 and :298/:319)."
- **Source:** task `cmv0hik5z003qyxmclqclywca` (run 2 of 3, REQ-SPEC-THREE-RUN-TEST attempt 1) — Reviewer APPROVED 92, quality gate approved.
- **Waived findings** — each changes nothing the program is told:
  1. **W1 — coverage: 3 unknown keys** (`kubernetes-gitops.writes`, `terraform-iac.policy-managers-multiple`, `terraform-iac.tags`; register Z47). R1 class (registry-caused). Each row is declared and quotes its item verbatim (items 13, 15, 20); the rows state exactly what the items state.
  2. **W2 — clause check: item 13 "publishes them" reported dropped** (register Z48). Checker false positive on the pronoun; the leg publishes the host list (requirements.md, Pipeline 1 "The deliverable MUST publish …").
  3. **W3 — clause check: item 20 "lists the existing statements …" reported dropped** (register Z48). Paraphrase; the leg lists each existing Allow whose `s3:GetObject` the Deny overrides (`overridden-statements.txt`) and a validation check verifies it.
- **Known limitation, recorded by the owner (not waived as a slip):** the cloud leg is fixed to `aws:SourceIp` and forbids `aws:VpcSourceIp` / `aws:SourceVpce`. On real AWS a pod's private address reaches S3 unchanged only over a VPC endpoint, where it is `aws:VpcSourceIp`; so the Allow cannot match a pod there and the Deny refuses every reader, pods included — fails closed, never wider. Covered by item 14's UNTESTED premise. Filed as a registry candidate (register Z49).

## Checks run before publishing (publish-generated-spec.py)
- removed the Author's trailing Confidence line
- topology.json copied byte-identical from k8s-tf-podrange-authz, then replaced by the owner-approved adaptation above (size-check re-run: fits)
- harvested-state pre-filter: 0 hits (a pre-filter only — the §2 full read is still owed)
- writing rules spliced; --check byte-identical to canonical (✓ /home/steve/paichart/program-artifacts/k8s-tf-log-archive-read-genspec/requirements.md: rules spliced at the marker (232 non-blank lines).)
- §3 checks: 0 🗑 · 0 {{ · 0 Confidence · 0 marker · 0 stale claim · Writing rules last
- coverage ERRORS present and accepted ONLY because --waiver was given — the waiver must name each one
- citation gate: 0 findings
- size: requirements.md over the read limit → program view written and fits; the program fetches requirements.program.md
- §2 full human read for harvested state (names, counts, worked example, preconditions): read by Claude, confirmed by Steve Terry — 2026-10-09. Only declared names appear (items 1–2); no harvested address, count or abbreviation; worked example synthetic (RFC 5737 198.51.100.7/.8, /28 arithmetic checked); both *Preconditions verified* lines are pointer + property.
- Derivation POPULATION matches the objective's noun: Claude, confirmed by Steve Terry — 2026-10-09. Every address in `status.podIPs` of every pod of `trading` whose phase is Running at read time and `spec.hostNetwork` is not true (item 4); readiness ignored; single-host entries (item 5).
