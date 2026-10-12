# Publish notes — k8s-obs-collector-senders-genspec

**Not a program input.** The program reads `requirements.program.md` and `topology.json` only.

- **Source:** `cmv4v3b2w0024yx9kl3xb9fg3` — "Generate requirements: telemetry collector senders restricted to namespace pods", 2026-10-12, requirements-authoring protocol 1.10.1 (group 4). Attempt 2 of Phase 4: answered generation from objective v3 (owner items 1–23; item 23 = enforcer-scope). One execution per child, no truncation retry; Author Opus 5.5. In-run correction attempted and NOT adopted (false refusal, skill register Z66) — the published text is the Author's original.
- **Verdict:** APPROVED (Reviewer 92; quality gate approved). **Owner decisions left:** none (owner block: 0 blocking, 15 not-applicable).
- **`topology.json`** NEW for this pair (Kubernetes → observability), adapted from `k8s-tf-log-archive-read-genspec-v2/topology.json`: two domains (`trading` namespace; the ingress proxy in front of the collector's receiver), the two read-only descriptors, one crossing value (the host list). Properties only — no addresses, block names, ports or existence claims; lint 0. (The publish script copies a topology byte-identically from a prior directory; a new pair has none, so this file replaced the staged copy after `prepare` and was size-checked with the program view: 7 of 12 run pages.)

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

## Checks run before publishing (publish-generated-spec.py)
- removed the Author's trailing Confidence line
- removed the template's format comment left in the owner block (template residue, Z65)
- topology.json copied byte-identical from k8s-tf-log-archive-read-genspec-v2
- harvested-state pre-filter: 0 hits (a pre-filter only — the §2 full read is still owed)
- writing rules spliced; --check byte-identical to canonical (✓ /home/steve/paichart/program-artifacts/k8s-obs-collector-senders-genspec/requirements.md: rules spliced at the marker (232 non-blank lines).)
- §3 checks: 0 🗑 · 0 {{ · 0 Confidence · 0 marker · 0 stale claim · Writing rules last
- coverage ERRORS present and accepted ONLY because --waiver was given — the waiver must name each one
- citation gate: 0 findings
- dropped clauses: 0 flags
- size: requirements.md over the read limit → program view written and fits; the program fetches requirements.program.md
- §2 full human read for harvested state (names, counts, worked example, preconditions): done by the operator (Claude, for the POV owner) — 2026-10-12
- Derivation POPULATION matches the objective's noun: done (running pods of `trading`, host-network and deletion-requested excluded = item 4) — 2026-10-12

## Human read (§2) — 2026-10-12
- Full read of the Author's draft (473 lines; the program view is the same body without the writing rules and the not-applicable owner rows): no harvested addresses, block names, ports or counts; Preconditions are a pointer + property; worked examples synthetic (documentation ranges 192.0.2.0/24, 198.51.100.0/24, in the designated slots).
- All 23 owner items transcribed and applied in the leg clauses; group 4 rows present (`observability-config.enforcer-scope` declared from item 23; `kubernetes-gitops.enforcer-scope` not-applicable); premise contradiction arm, empty-upstream rule and proxy collateral option present.
- **Two passages weaker than attempt 1's run 3, neither wrong for this program** (skill register Z67): Pipeline 2 step 5 states "The proxy is nginx." as a fact (an observation of today's estate; run 3 made it conditional); sender blocks are classified by literal host:port equality with the collector's declared receiver endpoint, with no upstream-group resolution — correct on this estate (the authoring harvest shows explicit receiver addresses equal to the proxy's forward targets).
- Consequence the owner should expect: item 22 restricts every block forwarding to an OTLP receiver, including one whose description places it outside the sender allowlist (an operator injection path) — applying the package refuses non-member senders there too. Owner decision, by design.
- Template residue removed by the publish pass: the owner-block format comment (Z65).
