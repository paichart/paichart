## Owner waiver

- **Approver of record:** Steve Terry (POV owner), 2026-10-09, in his own words: "B. Waive W1 (registry-caused rows), W2 and W3 (verified checker false positives — the clauses are present at :186-187 and :298/:319)."
- **Source:** task `cmv0hik5z003qyxmclqclywca` (run 2 of 3, REQ-SPEC-THREE-RUN-TEST attempt 1) — Reviewer APPROVED 92, quality gate approved.
- **Waived findings** — each changes nothing the program is told:
  1. **W1 — coverage: 3 unknown keys** (`kubernetes-gitops.writes`, `terraform-iac.policy-managers-multiple`, `terraform-iac.tags`; register Z47). R1 class (registry-caused). Each row is declared and quotes its item verbatim (items 13, 15, 20); the rows state exactly what the items state.
  2. **W2 — clause check: item 13 "publishes them" reported dropped** (register Z48). Checker false positive on the pronoun; the leg publishes the host list (requirements.md, Pipeline 1 "The deliverable MUST publish …").
  3. **W3 — clause check: item 20 "lists the existing statements …" reported dropped** (register Z48). Paraphrase; the leg lists each existing Allow whose `s3:GetObject` the Deny overrides (`overridden-statements.txt`) and a validation check verifies it.
- **Known limitation, recorded by the owner (not waived as a slip):** the cloud leg is fixed to `aws:SourceIp` and forbids `aws:VpcSourceIp` / `aws:SourceVpce`. On real AWS a pod's private address reaches S3 unchanged only over a VPC endpoint, where it is `aws:VpcSourceIp`; so the Allow cannot match a pod there and the Deny refuses every reader, pods included — fails closed, never wider. Covered by item 14's UNTESTED premise. Filed as a registry candidate (register Z49).
