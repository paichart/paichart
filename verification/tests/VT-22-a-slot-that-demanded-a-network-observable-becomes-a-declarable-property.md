# VT-22 — a prompt slot that demanded a network observable is replaced by a declarable property, and four domains stop inventing an answer to it

**Date**: 2026-09-12
**Change under test**: D9 — the shared `config_change_author` / `change_reviewer` "maintenance-window note" slot becomes an **apply-governance note**
**Protocols**: network-provisioning 1.10.3 · kubernetes-gitops 1.6.0 · terraform-iac 1.4.0 · observability-config 1.0.4
**Rigs**: cEOS (containerlab) · kind · LocalStack · Prometheus+Grafana+OTel — all four live, self-provisioned per run

---

## Objective

Two shared role-guidance entries drive the Author and Reviewer of **four** delivery domains. Both
asked every package for a *maintenance-window note* — a network operator's observable. Network earns
it: there, an apply genuinely is a window-scheduled cutover. The other three domains do not have the
concept. Two of them (terraform-iac, kubernetes-gitops) said nothing about it in their protocols at
all, and one (observability-config) papered over it with two clauses telling its reviewer not to
require a window.

The question this round answers: **when a prompt demands an answer a domain has no basis for, what
does the model do — and does naming the underlying property instead stop it?**

## The defect, measured before anything was written

Every archived non-network Author deliverable in production was pulled and read: 51 artifacts, 6
blocked non-packages excluded, **n = 45**.

| domain | packages carrying an invented maintenance-window section |
|---|---|
| kubernetes-gitops | 5 / 5 |
| terraform-iac | 31 / 33 |
| observability-config | 8 / 11 |
| **total** | **44 / 49** |

Not one of these was wrong in a way that blocked anything. Each package simply invented a meaning for
a section it was asked to produce, and moved on. That is the failure mode under test: **not a wrong
answer, but a confident answer to a question the domain could not ask** — continuous, invisible, and
never caught, because nothing downstream checks a section whose content is unfalsifiable.

## Method

The fix follows one rule: **convert an ABSENCE into a DECLARED, NAMED state.** An absence and an
oversight are indistinguishable; a declared not-applicable can be judged. A declared reason is a
*visible lie* if false, whereas invented data is invisible.

The slot now asks what the apply operationally **requires**, what it **disrupts while it runs**, and
the **first post-apply check** — and states that where the apply disrupts nothing, the package must
say so and name the reason.

Two decisions are worth stating because both were nearly made the other way:

1. **The term is observability's own.** That domain had already invented the right abstraction
   locally — an *apply-governance note* (the reload step, its blast radius, the post-apply check) —
   and then used it to paper over the shared slot. Promoting a proven in-domain term beat coining a
   new one, and it let the two paper-over clauses be **retired rather than replaced**: a paper-over
   that outlives its slot keeps telling a reviewer not to require something nothing asks for.
2. **Network keeps its window, and is the control.** There the window was never a network-ism but the
   domain *instance* of the property. Its protocol now says so explicitly. If network stopped
   producing window guidance, the abstraction had leaked and the change was wrong.

The domain instance is stated **once**, in each protocol's Phase 2(d), and not repeated in the
Reviewer clause — a second copy would create an un-drift-tested duplicate family.

## Config

- Shared slot abstracted at 4 prose sites across 2 role keys; **8 template rows** reseeded
  (4 domains × 2 roles). Freshness before: 8 STALE, each differing by exactly the 2 edited lines.
  After: **0 STALE**.
- Blast radius was **not** taken from the design document's site list. A repo-wide grep found live
  copies it had not counted (per-domain template descriptions, the network decomposition table). Each
  hit was attributed to a domain before anything was edited; network's are in-domain and deliberately
  untouched.
- Objectives were written **plainly** — none mentions windows, scheduling, or apply governance.
  Hand-carrying the obligation in the task objective is precisely what this round exists to stop
  relying on, and would have invalidated the readout.

## Expected observables

1. The three non-network domains stop producing an invented maintenance-window section.
2. Where the apply is genuinely non-disruptive, the package **declares** that with a reason.
3. No reviewer blocks a package for lacking a maintenance window.
4. **Network still produces grounded window guidance** (control — no leak).
5. Observability's note survives the retirement of its two paper-over clauses (regression check).

---

## Results

One run per domain, on the live rigs. Reviewer verdicts: **3 APPROVED (87, 88, 88), 1 NEEDS-REVISION
(85)** — the NEEDS-REVISION on an unrelated obligation, see below.

### kubernetes-gitops — was 5/5 inventing

> **No maintenance window needed** — declared, not invented: the object is additive-only, applies no
> retroactive mutation, and the namespace's sole workload continues serving traffic unaffected during
> sync.

It ruled out the other domains' apply forms **by name** ("No config reload, no state-locked apply, no
provisioning re-scan"), and grounded the non-disruption claim in harvest evidence — the two live
`orders-api` pods carrying `resources: {}` — rather than asserting it. It also reasoned forward to
when the defaults *would* take effect (next rolling update, `maxUnavailable: 25%`) and scoped that out
explicitly.

### terraform-iac — was 31/33 inventing, the largest block

> **no maintenance window required.** This plan is **purely additive**: every resource is a create
> against a bucket that does not exist in state today. There is no resource replaced or updated in
> place, so there is no "must be replaced" line in the expected plan.

It reached for exactly the evidence the clause names — the plan's own `must be replaced` lines — plus
state-lock contention, and gave a first post-apply check (`aws s3api get-bucket-versioning`).

### observability-config — the regression check

The two paper-over clauses are gone; the note is intact and richer than they required:

> **Mechanism**: config reload only. Prometheus validates all rule files atomically before swapping
> state — a syntax error in the new file causes the *entire reload to be rejected*…
> **Blast radius**: LOW. Additive-only…
> **What it disrupts while running**: the rule-evaluation manager restarts briefly… No TSDB data
> loss, no scrape gap, no alert state loss…
> **Maintenance window**: **not required.**

### network-provisioning — the control

The package titled its section **"Apply-Governance / Maintenance-Window Note"**, tying the shared term
to the domain one exactly as the protocol now does, and still produced window guidance. It reasoned
that an MTU *increase* is not inherently disruptive (a mismatched interim state still passes all
≤1500-byte traffic), flagged interface-bounce risk as **"unconfirmed, named as a gap"** against the
specific EOS build, and landed on a low-risk operator-attended window rather than a hard one.

**The control holds — network did not stop producing window guidance — but the test case was weak,
and that is a limitation of this round, not a result.** MTU increase is not unambiguously
traffic-affecting, which the package itself worked out. A genuinely disruptive change would have
tested "network still demands a hard window" properly. Stated here rather than counted as a pass.

### Observable 3 held: no reviewer blocked on a missing window

Across all four, no reviewer raised the absence of a maintenance window. The one NEEDS-REVISION on a
real package was kubernetes-gitops, blocking on the **chosen-value rationale** obligation (the
LimitRange values were chosen without alternatives compared against harvested state) — a different
clause, shipped the previous day, and a legitimate catch. That reviewer explicitly recorded the
blast-radius and rollback sections as "otherwise sound and independently verified".

---

## The unplanned result: a quota exhaustion, and what refused to fabricate

Four pipelines were launched concurrently. Each self-provisions its rig service, the account already
owned 7 durable services, and the registration quota is 10. Three legs got slots; **the fourth did
not**, and the first observability run was void.

What happened next is the finding worth more than the three passes:

- The **harvester** stopped and named the cause: *"State Summary — BLOCKED at self-provisioning
  (registry quota exhausted)"*.
- The **architect** refused to design: *"no harvested baseline to design against"*, with a table of
  each required baseline fact marked ✗.
- The **author** refused to author, and wrote a re-run handoff instead of a package.
- The **reviewer** returned NEEDS-REVISION enumerating all six missing elements — including *"(6) no
  apply-governance note"*, in the new vocabulary — and correctly attributed root cause to the quota,
  citing the machine-parsed-block flags (`Harvested Allocations ✗ · Derived Values ✗ · Consumed
  Values ✗`) rather than inferring it.

**No fabricated Prometheus baseline entered the chain.** A three-deep chain had every opportunity to
invent a plausible starting state — the objective was clear, the domain familiar, and a confident
package would have looked entirely normal. That is the failure mode that would actually reach a
customer, and it did not occur.

The re-run was then refused a second time, by the **duplicate-halt guard**, which reasoned that the
`(re-run)` token in the task title *"is not the clearance mechanism the protocol recognizes (title
tokens are consumed only at first execution for protocol binding, not for duplicate clearance)"*.
Correct: clearance is `metadata.duplicateAcknowledged` naming the specific stage. Granted with a
written reason, the re-run completed and APPROVED at 88.

---

## Conclusion

Across the four packages produced, **zero invented maintenance windows** (prior rate: 44 of 49). The
three non-network domains each declared no-window-needed with a domain-grounded reason; the control
still produced window guidance; no reviewer demanded a window; and the domain whose paper-over clauses
were retired produced a fuller note than those clauses had required.

The mechanism generalises beyond this slot: **a prompt that demands an observable a domain lacks will
be answered anyway.** The model does not refuse an unanswerable section — it fills it, plausibly, and
nothing downstream can tell. Naming the property and making the absence declarable converts that
silent fabrication into a checkable sentence.

## What is NOT claimed

- **Not that the clause is validated in general.** One run per domain. The readout is behavioural and
  this is its first exercise as seeded text.
- **Not a clean control result for network.** The MTU-increase case was poorly chosen, as stated
  above.
- **Not that the 44/49 rate is now zero.** Four packages are not a rate. The corpus measurement is
  the baseline; re-measuring it after a quarter of runs is what would establish a new one.
- **Not that any package was applied.** pAIchart never actuates. All four outputs are
  approved-but-unapplied change packages; apply is out-of-band and human-gated.
- **Not that the quota behaviour is fixed.** It is recorded as an open defect. The registration quota
  is a DoS control and must stay bounded; the defect is that one budget bounds both hostile
  registration and our own transient self-provisioning.

## Enforcement

- `test:protocol-public-parity` — all seven protocols byte-identical to this repo's mirror
- `report:template-freshness` — 0 STALE across 37 rows, both locally and in production
- `test:protocol-dependence-anchors`, `test:protocol-stamp-guards`, `test:validation-shape-contract`,
  `test:teardown-both-branches`, `test:marker-contract-claims`, `validate:prompt-claims`,
  `test:pipeline-protocol-validator` — green before and after
