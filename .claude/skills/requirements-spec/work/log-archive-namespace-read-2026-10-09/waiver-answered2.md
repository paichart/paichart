## Owner waiver

- **Approver of record:** Steve Terry (POV owner), 2026-10-10, chose "Waive W1 + W2 (Recommended)".
- **Source:** task `cmv251mdw004eyx0rnnouxxn9` (answered run 2, Z49 Phase D; objective v2 = v1 + item 21) — Reviewer NEEDS-REVISION 90 on one item (W2); gates otherwise clean (24/24 rows declared, 0 OPEN; citations 31/31 verbatim; premise branch ✓; clauses 4 checked / 0 dropped; lint 0).
- **Waived findings** — each changes nothing the program is told:
  1. **W1 — coverage: 4 unknown keys** (`kubernetes-gitops.host-network-member`, `kubernetes-gitops.carrier`, `terraform-iac.out-of-policy-grants`, `terraform-iac.existing-tags`; register Z45, Z47, Z51, Z52). R1 class (registry-caused). Each row is declared and quotes its item verbatim (items 4, 13, 20, 20); the Reviewer matched every citation to the task's `requirementsRowItemMap` (0 mismatches).
  2. **W2 — Reviewer block: Pipeline 2 check T9 carries the parameter `<the row id applied>`** in `grep -qF '<the row id applied>' report.md`, not a concrete row id. T9 runs only on a gap branch; its comment names the rows that apply (target-absent, multiple managers, inputs-empty); no stage in the program executes the per-leg validation checks (register Z50).
- **Z49 resolved, not waived:** the cloud leg's stanza conditions the Allow and the Deny on `aws:VpcSourceIp` (item 21, private-endpoint) and forbids `aws:SourceIp` / `aws:SourceVpce` / `aws:SourceVpc` — run 2's known limitation (`waiver-v1.md`) no longer applies.
