# The Gate That Refused Its Own Reviewer — A Case Study in Machine Facts Outranking AI Reassurance

**Audience**: The skeptics — security architects, change-approval boards, and the buyers who answer
for them. If your first question about an AI delivery engine is *"what happens when the AI is
confidently wrong — or confidently right for reasons nobody can verify?"*, this chapter is the
answer, told through one real run that put the question to the system directly.
**What this is**: a case study of a single program round (2026-08-21) in which the arithmetic at the
heart of a multi-domain change was **correct**, the AI integration reviewer **independently
re-derived it and said so** — and the release gate **refused the release anyway**. And was right to.
**Companions**: [*A Coordinated Infrastructure Change, Checked by Machine*](coordinated-infra-change.md)
explains the checking architecture this story exercises; [*Inside a Multi-Domain
Program*](inside-a-multi-domain-program.md) names the internals. Read this one first if your
question is about trust under pressure.
**Reading time**: ~10 minutes. **Self-contained** — no prior reading required.

---

## What this chapter teaches

Every vendor with an AI in the loop says "we have guardrails." The claim is unfalsifiable until you
see a guardrail **overrule the system's own reviewer** — because the only time a guardrail matters
is when something authoritative-sounding is telling the system it's fine to proceed.

This chapter shows that moment happening in a real run, with the receipts persisted. The design
principle it demonstrates, stated plainly: **a machine-checked fact outranks an AI's reassurance —
even the system's own AI, even when the AI turns out to be right.** What a release gate trusts is
not the answer; it's the *verifiable evidence chain behind the answer*. An answer that arrives
without its chain is refused, and the refusal names exactly what was missing.

---

## The setup, in one paragraph

The run is round three of a five-round campaign (the *FW-A3* series) on a live lab: a partner-HTTPS
security policy spanning three infrastructure domains in sequence — an Arista switch at the edge
performing source-NAT, a Terraform-managed cloud security group in the middle, a second Arista
switch at the core. The edge leg must *derive* a NAT address pool from the live devices' harvested
state — a value that does not exist until the devices are read — and the two downstream legs must
match **exactly that pool**, received through the engine's chaining machinery, never recomputed. The
engine produces approved-but-unapplied change packages only; applying is a separate, human-gated
step. (Lab honesty up front: the "firewall" and "cloud" here are vendor-analogs — Arista cEOS
containers and LocalStack — because what this campaign validates is the program machinery, not any
vendor's dataplane.)

## What the round produced

The edge leg harvested both switches, selected the pool `10.99.0.0/31`, and authored its change
package. The pool was arithmetically sound: aligned, minimal, colliding with none of the harvested
allocations. It crossed the chain intact — the Terraform leg consumed it verbatim, the core leg
consumed it verbatim. All three per-leg reviewers approved their packages.

Then the **integration reviewer** — an AI whose job is to check the cross-domain whole from
structured facts — did its work. From the persisted record, verbatim:

> *"Node C's own re-derivation found the underlying containment math correct."*

It had independently re-computed the pool's containment against the harvested allocations:
collision-free, minimal, consumed identically at every hop, the pre-NAT source isolated to the edge
as required. By every mathematical measure, the change was right.

**The program's release verdict: `programReleasable: false`.**

## Why the gate said no

Alongside the AI reviewers, the engine runs a **deterministic containment checker** — plain code,
not a model — that re-verifies any value one leg derives and another consumes. It doesn't read
prose; it reads a structured evidence block the deriving leg is contractually required to publish.

In this round, the edge leg's author had written that evidence — the values were all there — but
had **nested the block under the wrong heading**. To a human eye, a formatting nit. To the checker,
which parses by exact contract, the evidence was *absent*. It reported precisely that: the derived
values could not be mechanically verified. One hop downstream, a second deterministic rule
converted that into a hard block: a leg consuming a value whose upstream verification never ran is
stamped `blocking`, fail-closed. The release gate is a deterministic AND over facts like these, and
one conjunct was false.

So the system faced exactly the tempting configuration: *the math is right, our own reviewer
re-derived it and says it's right — surely we release?* The gate's answer, from the persisted
synthesis, verbatim:

> *"Per protocol this is authoritative and gates release even though Node C's own re-derivation
> found the underlying containment math correct."*

No override. Not because the reviewer was distrusted — its re-derivation was accurate, and it even
diagnosed the root cause correctly (the mis-titled heading). But an AI's runtime re-derivation is
not a substitute for the mechanical check, for a reason this codebase learned empirically before it
ever wrote it into policy: **prose-level verification demonstrably slips** (an earlier run shipped a
subnetting error past an AI reviewer that approved it at high confidence — that incident is *why*
the deterministic checker exists). A gate that accepts "an AI checked it again" as a stand-in for
"the machine check ran" has quietly deleted its own floor. The gate held the floor.

## What a refusal is worth

Notice what the refusal *wasn't*: it wasn't a crash, a hang, or a vague failure. The verdict named
the exact blocking fact, the leg carrying it, and — via the reviewer's diagnosis — the root cause,
down to which heading the evidence sat under. A human reading the record could see in one screen
that the mathematics was fine and the *evidence contract* was not, and could decide what to do with
complete information. That is the difference between a gate and an obstacle.

And the miss didn't stay a miss. The heading contract was made explicit to the authoring agents
(with the incident cited in the rule); one round later a *different* formatting slip appeared (a
code fence opened one line early) and was likewise refused; that second miss earned a **tolerance
in the parser itself**, shipped with the incident as its regression fixture. On round five, the
same program ran green: `programReleasable: true`, every leg approved first-pass, the pool
mechanically verified at derivation and confirmed verbatim at every hop — and this time the
integration reviewer's APPROVED sat *on top of* a complete mechanical chain, not in place of one.

Five rounds, four refusals, one green — and the green is **auditable defect-by-defect**: every
earlier round's failure maps to a shipped, validated fix. Across all five rounds, not one defective
package reached a deliverable anyone could act on.

## The principle, generalized

The engine sorts its own safeguards by a hard rule: **judgment lives in prompts; guarantees live in
code.** AI reviewers are judgment — valuable, adaptive, and fallible. The containment checker, the
evidence contracts, and the release AND-gate are guarantees — deterministic, testable, and immune
to persuasion, including persuasion by the system's own components. When the two disagree, the
guarantee wins, and the disagreement itself is preserved as a fact for the human who owns the
release. This round is that rule observed in the wild, under the exact conditions that tempt a
system to cave.

If you sit on a change-approval board, this is the property to ask any vendor to demonstrate — not
"do you have guardrails," but: *show me a persisted run where your guardrail overruled your own AI,
and show me it was right.* Ours is below.

## The receipts

Everything above is traceable in the public [verification pack](../verification):

- **VT-18 — the five-round campaign record**, with per-round defects, fixes, and validations.
- The round in question: program `cmt2rinio0007yx77g2d3qmrm` (2026-08-21) — gate table, the
  `blocking (consuming-leg-upstream-not-green)` fact, and the synthesis text quoted above are in
  its persisted comments and artifacts.
- The green round: program `cmt3tgp4d0005yx91v1jxkvox` (2026-08-22) — `programReleasable: true`,
  pool `10.99.0.6/31`, mechanical check `0 violations`, integration reviewer APPROVED 0-blocking.
- The parser tolerance and its incident fixtures ship in the open
  [`@paichart/containment-checks`](../packages/containment-checks) package (v0.3.1).

**Honesty notes**: the run executed on lab vendor-analogs (Arista cEOS, LocalStack), not production
devices; packages are approved-but-unapplied by design; the integration reviewer is itself an AI —
which is precisely why the story is about the gate and not about it; and the campaign also surfaced
defects in *our own* run inputs and platform cosmetics, all recorded in VT-18 rather than tidied
away. The claim this chapter makes is narrow and demonstrated: when evidence and reassurance
diverged, the system sided with evidence.
