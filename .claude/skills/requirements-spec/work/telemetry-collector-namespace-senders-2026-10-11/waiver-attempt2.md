## Owner waiver

- **Approver of record:** Steve Terry (POV owner), 2026-10-12, in his own words: "yes to all three, waive W1–W6 and fix the script".
- **Source:** task `cmv4v3b2w0024yx9kl3xb9fg3` (attempt 2, answered generation 3) — Reviewer APPROVED; 27/27 rows declared, 0 OPEN; citations 27/27 verbatim; premise branch ✓; clauses 0 dropped; lint 0.
- **Waived findings** — each changes nothing the program is told; each row is declared and quotes its owner item verbatim:
  1. **W1 — `kubernetes-gitops.currency`** restates item 6 (should be keyed `kubernetes-gitops.item-6`).
  2. **W2 — `kubernetes-gitops.maintenance`** restates item 6 (second half of the same item).
  3. **W3 — `observability-config.sender-blocks`** restates item 22.
  4. **W4 — `observability-config.non-sender-paths`** restates item 16.
  5. **W5 — `observability-config.upstream-empty`** restates item 20.
  6. **W6 — `observability-config.shared-access`** restates item 21.
- **Why not the in-run correction:** it re-keyed all six to `<token>.item-<N>` (coverage 0 errors) and was refused by the adoption rule because merging the two item-6 rows dropped one citation (27 → 26) — a false refusal, filed (skill register Z66).
- **Not a waiver:** the template's owner-block format comment left by the Author is template residue, removed mechanically by the publish pass (Z65).
