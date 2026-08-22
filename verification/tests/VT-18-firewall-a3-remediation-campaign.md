# VT-18 — Firewall Approach-3 remediation campaign (five rounds to an earned green)

**Dates:** 2026-08-21 → 2026-08-22 · **POV:** Autonomous Delivery Use Cases, phase *Firewall Rules
Change* · **Programs:** FW-A3.1 `cmt2lr3gw…` · A3.2 `cmt2n1i8j…` · A3.3 `cmt2rinio…` · A3.4
`cmt3ryshj…` · A3.5 `cmt3tgp4d…` (all preserved; rounds 1–4 archived with disposition comments).
**Claim under test:** `firewall-policy-use-case.md` §7.3 — the Approach-3 shape (three DAG-sequenced
pipelines across two domains, transitive inter-pipeline chaining of a runtime-derived value, with a
mechanical containment net and a facts-only integration reviewer) runs end-to-end on live rigs and
releases only when every gate conjunct is green.

## Verdict

**VALIDATED.** Round 5 completed `programReleasable: true` — all three legs approved first-pass
(reviewer 90/90/87), Node C `## VERDICT: APPROVED` 0-blocking (conf 90), pool `10.99.0.6/31`
(exactly minimal for that rebuild's scatter) mechanically verified at derivation and consumed
verbatim at both downstream hops, chained coverage 3/3 / 0 degraded on producer and Node C, program
confidence 88 (MIN). Zero retries; zero human overrides — the only human actions were gate reviews.

**The stronger claim this campaign proves is the remediation loop itself.** Four consecutive rounds
each ended non-green on a *distinct* defect; each defect produced a shipped, validated fix; round 5's
green is traceable fix-by-fix:

| Round | Outcome | Defect (all caught, none shipped) | Fix → validated in |
|---|---|---|---|
| A3.1 | leg NEEDS-REVISION (parked at G2) | run-input gap: untrust zone mapped to a port that did not exist; agents **disclosed rather than fabricated** a binding | bindable policy ports (Et2/Et3 + zone descriptions) → A3.2 |
| A3.2 | `releasable:false` | leg reviewer blocked placeholder expected-output (`<unchanged>`) in the sole eBGP-untouched proof; Node C rejected independently (2 blocking) | literal-scoped expected-output rule in author role guidance (targeted reseed) → A3.3 (zero placeholders, that leg first-pass) |
| A3.3 | `releasable:false` | derived-values JSON nested under a wrong heading ⇒ checker read it ABSENT ⇒ **fail-closed cascade blocked the AND-gate even though Node C's own re-derivation found the math clean** — machine fact held authoritative over LLM re-check | MACHINE-PARSED-MARKER heading contract (protocols 1.3.3/1.2.2 + role guidance) → A3.4 (`## Derived Values` parsed) |
| A3.4 | `releasable:false` (parked pre-G2) | Harvester opened the ```json fence one line early, swallowing the heading inside the fence ⇒ harvest unparseable ⇒ deriving-leg fail-closed | fence-inversion tolerance in `parseFencedJsonBlock` (containment v0.3.1, fixture-pinned on all three live shapes) → A3.5 (`checked, 0 violations`) |
| A3.5 | **`releasable:true`** | — | — |

## Mechanisms exercised (beyond the §7.3 claim set)

- **Transitive inter-pipeline chaining** (A3.2, A3.5): the runtime pool crossed network → terraform →
  network intact; coverage facts clean at every hop.
- **Containment taxonomy, all arms live**: checked-clean (deriving), consuming-leg-discharged (green
  upstream), needs-node-c discharged by independent recomputation, and both blocking directions
  (upstream-not-green in A3.3; deriving-leg harvest-unparseable in A3.4).
- **Machine-over-LLM precedence** (A3.3): the release gate refused a package whose arithmetic Node C
  had verified clean, because the *mechanical* check could not run — the deliberate conservative
  ordering, observed under exactly the conditions that tempt a system to cave.
- **Self-repair** (A3.2, A3.3 dmz legs): band retry → staleness re-authoring → staleness re-review,
  converging in ≤4 generations of the 10-budget with zero human touches; keep-best selection live.
  A well-executed reviewer's NEEDS-REVISION was never re-rolled (A3.2 core leg) — retries repair weak
  executions, never override honest verdicts.
- **Duplicate-halt + clearance choreography**: the re-run guard fired on a genuine duplicate (A3.2),
  released only via task-state clearance; subsequent rounds pre-armed root + per-leg clearances
  (description-block form for multi-duplicate inventories) and passed 4-deep duplicate history.
- **Model-upgrade canary**: the entire campaign ran on the day-old claude-sonnet-5 flip — ~120
  executions, zero truncation retries, content defects at LLM-typical rates, all caught by tiers.

## Honesty notes

- The lab dataplane does not exercise NAT forwarding; packages are approved-but-unapplied by design.
  The claims validated are program-machinery claims, not traffic claims.
- Known cosmetic defect, open: `{{HARNESS_REPORT_MD_ID}}` unsubstituted in harness synthesis
  comments (4 sightings).
- A3.3's pool included the /24 zero-address — legal against every harvested fact, off lab
  convention; recorded as a requirements-clarification candidate, not a defect.

**Reproduce:** program-artifacts `firewall-a3-partner-path/` (rounds 1) and
`firewall-a3-partner-path-r2/` (rounds 2–5, reused unchanged from round 2 on — the remediations were
platform-side, which is itself the point). Full contemporaneous record: `copov15`
`cline_docs/firewall-a3-validation-2026-08-21/VT-CLAIMS.md`.
