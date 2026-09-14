# VT-23 — a permission addressed to the author never reached the reviewer who blocks; now it does, and it stays refused where it was never granted

**Date**: 2026-09-14/15
**Change under test**: the shared REQUIRED SHAPE validation clause becomes ONE definition across four
domains, and its permission is **re-addressed to the reviewer**
**Protocols**: network-provisioning 1.11.0 · kubernetes-gitops 1.7.0 · terraform-iac 1.5.0 ·
observability-config 1.1.0
**Rig**: Arista cEOS (containerlab, 2 nodes) + LocalStack — live, self-provisioned per run

---

## Objective

A change package's validation steps must each be an exact command plus **the literal text it returns**.
Sometimes that literal cannot exist: the step describes POST-change state, and the harvest returned
structured getter data rather than CLI text, so the author has never seen how the device renders that
command. Predicting it is fabrication — and a wrongly predicted literal is worse than no step, because
an operator following it **rolls back a correct change**.

The network protocol had already earned a third sanctioned shape for that case (a *presence
assertion*) on 2026-08-27. The question this round answers: **did that permission reach the party who
actually blocks — and does it stay refused in domains that never granted it?**

## The defect, measured before anything was written

The permission sat inside a bullet headed *"Phase 2 — Config Change-Package Author"*. The reviewer
reads its own bullet, which was silent on shapes, then a role-neutral section saying *"replace it with
one you can, or drop it"*, then role guidance instructing it to treat non-fact validation as blocking.

Assembled-prompt evidence, taken from the platform's own directive inspector rather than from source:

| role receives | network reviewer | terraform reviewer |
|---|---|---|
| UNWITNESSED RENDERINGS / THIRD SANCTIONED SHAPE | ✅ | ❌ (nothing) |

So the contradiction resolved **against** the permission for the reviewer, by construction, every time.

> The 2026-08-27 fix was earned by a reviewer blocking a *compliant* author — and its entire remedy
> landed on the author side. **As shipped, it did not prevent its own incident**, which recurred on
> 2026-09-14 in another domain.

Corpus measurements taken before the change (production artifacts, not fixtures):

- **0 of 21** network harvests contain raw CLI; 17 of 21 report structured getters. The rendering
  format is usually unwitnessed, so the literal usually cannot be quoted honestly.
- **73 of 110** substantive lines inside literal `Expected output` blocks appear in **no** harvest —
  i.e. most "literal" content was prediction. Four such predictions had already shipped wrong, one
  propagating a bad number into a blocking defect.
- Non-literal shape usage by domain: network **15/87**, terraform **1/38**, k8s **0/6**.

## What shipped

One shared clause, interpolated into all four domain protocols — source-level only, so the four
published files remain byte-identical with the rule inline and no pointer at any tier. Its tail names
REPLACE before DROP, separates *"the check does not exist"* (drop) from *"exists but unwitnessed"*
(the sanctioned shape), and adds a paragraph addressed to the reviewer:

> A step written in your protocol's sanctioned shape for unwitnessed output, carrying every part that
> shape requires, is SANCTIONED: accept it, and judge the stated REASON, not the absence of a literal.
> One missing a required part, or prose wearing the label, is a blocking defect. **Where your protocol
> sanctions no such shape, this paragraph licenses nothing — the requirement is the literal.**

## Result — both arms tested on live runs

**Arm one — the domain that grants it.** A live network-provisioning leg against the cEOS rig. Its
author produced **six** presence assertions and zero literal blocks. Its reviewer approved, 90, zero
blocking issues, citing the rule:

> *"All six steps use the **sanctioned presence-assertion shape** (command + named required fields +
> named excluded volatile fields + reason no literal is possible), correctly justified by the harvest
> having used only structured NAPALM getters (no raw CLI captured for either device)."*

It checked all four required parts, and independently reconstructed *why* the shape applied from the
artifact — the same structured-getter fact the corpus measurement found.

**Arm two — the domain that does not.** Terraform authors reach for a non-literal step about 1 time
in 38, so waiting for one is not a test plan. A control probe was built instead: a terraform change
package, clean in every other respect, carrying one **well-formed** presence assertion (all four
parts) for a step whose output *is* obtainable — `tflint` can simply be run. The reviewer blocked it:

> *"Validation Step 2 (tflint) uses an **unsanctioned** 'Presence assertion' prose shape instead of the
> required literal fenced expected-output block **or a protocol-sanctioned alternate** — must be
> replaced with a quotable command/output or explicitly escalated."*

It reasoned about **licensing**, not form; acknowledged the sanctioned category exists; and prescribed
the REPLACE rung first. It also caught a second, unplanted defect in the probe package.

| | author wrote | reviewer verdict | basis cited |
|---|---|---|---|
| network (grants the shape) | 6 presence assertions | **APPROVED** 90 | *"the sanctioned presence-assertion shape"* |
| terraform (grants none) | same shape, well-formed | **BLOCKED** | *"unsanctioned … prose shape"* |

Identical artifact shape, opposite verdicts, each citing its own domain's licensing state.

## Why this is the result that matters

A blanket permission would have approved both. The pre-change state blocked both — that was the
original defect. Only a fix that distinguishes produces this pair, and the distinction is the claim:
**permission where it is earned, refusal where it is not.**

## Honest limits

- Arm two is a **control probe**, not a naturally occurring event. It tests the reviewer's disposition
  on demand; it does not establish how often authors reach for the shape.
- The clause could still raise non-literal usage in domains licensing none. That is a **rate**
  question one run cannot answer. Pre-change baseline recorded above; it is re-measured on the
  quarterly cadence.
- The same live program run escalated its cloud leg on a genuine backend outage before this data was
  gathered. That leg's confidence fell 15 → 12 as the chain starved and its reviewer attributed root
  cause upstream at confidence 92 — escalate-don't-fabricate holding under real infrastructure
  failure, reported here for the same reason the pack publishes failed rounds.
