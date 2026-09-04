# LLM-Orchestration Security Posture

**What this is**: the security properties that are specific to running a MULTI-AGENT ORCHESTRATION
platform — not generic LLM security. Nothing here is about jailbreaks, prompt hygiene, or model
alignment. Every item below is about what happens when agents *hand work to each other*, and several
**invert the obvious advice**.

**Why it exists**: these were produced by specialist review transcripts during the IGP-T1 campaign
(2026-08). Those transcripts are session-scoped and gone. This is the durable record.

**Audience**: anyone verbalising our security posture, and anyone designing a new pipeline or program
use-case — because most of these are consequences of DESIGN choices (what channel carries what, with
what framing), not of code defects. Platform-internal implementation detail lives in
`.claude/knowledge/domain/harness/`.

---

## The one-line frame

> **In a single-agent system, security is about what the model is asked. In an orchestration system,
> it is about what agents are ALLOWED TO TELL EACH OTHER, how much authority that carries, and who
> can write into that channel.**

Almost everything below follows from taking that seriously.

---

## 1. Binding-frame authority amplification

The pipeline-context renderer wraps the interface contract in maximum-trust framing — *"Every
design/config value you produce MUST honor these shared constants… do not re-derive, renumber, or
deviate… escalate; never invent one"* (`lib/agents/harness/render-pipeline-context.ts`).

That framing is correct and load-bearing for fidelity. But the contract originates in a
**user-writable field** (`task.create parameters.interfaceContract`). So propagating it to N children
delivers attacker-influenceable text to N agents **with maximum-trust framing and an explicit
do-not-question instruction attached**.

The fidelity fix and the injection amplifier are **the same mechanism**.

> **Generalisable: the trust FRAMING around a channel is part of its attack surface, not just its
> contents.** A reviewer assessing "is this channel safe" must read the wrapper, not only the payload.

## 2. Sanitising can be the wrong safety move

R9 (`CONNECTED_OUTPUT_SANITIZE_ENABLED`) exists to neutralise hostile output from connected services,
and it is right for that. Applied to a **binding constant**, it is actively harmful: it corrupts the
exact value every downstream agent is required to transcribe verbatim.

This is not theoretical. The C1/R5 incident showed platform mutation *inside an agent-attributed view*
producing a **false blocking verdict** — a clean package refused, at the cost of a full round.

> **Where a value's INTEGRITY is the security property, "sanitize everything" is the wrong reflex.**
> The interface contract is therefore rendered verbatim and exempt from R9 and truncation — by design,
> not by omission. Anyone "hardening" that path should read this first.

## 3. Defence-by-accident, and losing it deliberately

Before contract inheritance shipped, the harness paraphrased the contract into child briefs, lossily.
That paraphrase was functioning as a **weak accidental sanitizer** for injection prose: a lossy channel
degrades an attack payload along with everything else.

Fixing the fidelity bug removed that. The trade is correct — defence-by-accident is not a control, and
the lossiness was causing real defects — but the point is procedural:

> **When a fix removes an accidental protection, NAME the trade at the time.** Discovering it later,
> during an incident, is how a team concludes it was compromised by its own improvement.

## 4. Conditional obligations with unsatisfiable predicates

A guard written as *"where X is present, do Y"* is **not a guard** unless something verifies X actually
reaches the agent. When X never arrives the predicate is false, **no obligation is owed, nothing is
skipped, and no transcript records anything.** It is invisible to every forensic method we have — the
run looks clean because, formally, it *was*.

Confirmed live: the author's *"where the contract carries a canonical stanza template, TRANSCRIBE it"*
and the reviewer's *"verify every non-placeholder line appears"*. Both correctly written. Both inert for
five or more rounds. Between them they let two rounds ship config that left a routing protocol INACTIVE
while entering, committing and displaying cleanly.

> **This is a registered bug class, not an anecdote.** For any conditional obligation, the only question
> that matters is: **what guarantees the predicate's subject reaches this agent's context?**

## 5. Provenance forgery

`interfaceContractInheritedFrom` and `interfaceContractInheritedAt` (`lib/tasks/services/inputContext.ts`)
*look* platform-authored. They live in a user-writable channel.

> **Generalisable: platform-looking metadata in an agent-writable store is attacker-controllable.**
> A forensic consumer must treat a provenance stamp as a **hint to verify**, never as a fact. The same
> caution applies to every `metadata.*` field a run reads back and believes.

## 6. Transitivity is not trust

The tempting argument — *"the parent row was validated at create, so copying it to a child is safe"* —
is **false** when other write doors reach that row with weaker validation. Validation is a property of
the DOOR, not of the row, and a row does not remember which door it came through.

> sec-ops' phrasing, kept verbatim because it is the most useful sentence in this document:
> **"transitivity from an unvalidated source is not trust, it's laundering."**

## 7. Co-location as authorization

Contract inheritance flows parent → child keyed **only on `stage_id`**
(`p.metadata->>'pipelineStageId' = c.stage_id`). Its entire safety therefore rests on one prior
invariant: *a caller cannot place a task into another POV's stage.*

That guard does exist (the cross-POV stage guard, Wave A C3, 2026-05-23). The hazard is structural:

> **A new data flow can silently make an OLD invariant load-bearing in a NEW way, and nothing
> re-verifies it.** When you add a flow keyed on an existing field, find the invariant you have just
> started depending on and re-confirm it explicitly. It was written for a different purpose.

## 8. Validation-door asymmetry

One field, three write doors, two protection levels. `inputContext` is reachable through several
paths that do not all validate identically — so "the field is validated" is true of the field's *name*
and false of the field's *contents*.

> **Audit a field by enumerating its WRITE DOORS, never by reading the one you happen to know about.**

## 9. Expected-denial is not degradation

A verb-enum or RBAC denial returned as an MCP `isError: true` tool result is recorded `success: true`
**by construction** — the service RETURNS the error rather than throwing. So a confined harvest, denied
at the boundary, **does not self-degrade** and does not trip the anti-fabrication signals that key off
failure.

Only a genuine throw degrades. Therefore:

> **The fix for a noisy denial path is a CONTRACT with the service (return `isError`, don't throw),
> not engine calibration.** Pinned by test, because it is the kind of property a well-meaning refactor
> quietly inverts.

---

## What generalises beyond this platform

1. **The channel's framing is part of its attack surface.** Trust wrappers amplify whatever they wrap.
2. **Integrity and sanitisation can be opposed.** Ask which property the value actually has.
3. **A conditional guard is only as real as the delivery of its subject.** Unsatisfiable predicates
   fail silently and invisibly — the most dangerous failure shape in the system.
4. **Platform-looking metadata in an agent-writable store is attacker-controllable.**
5. **Validation is a property of the door, not the row.**
6. **New flows inherit old invariants without telling anyone.**

## Standing practice these imply

- When adding a channel between agents, state its **trust framing** and its **write doors** in the
  design, not after.
- When a fix removes an accidental protection, **name the trade in the commit**.
- For every conditional obligation you write into a protocol or role guidance, answer in the same
  breath: *what guarantees the subject arrives?* If nothing does, it is decoration.
- Prefer a **fact** the consumer can check over a **verdict** it must believe — the same Protocol 10
  rule, applied to security signals.

---

*Earned during the IGP-T1 campaign (2026-08) and the contract-inheritance work of 2026-08-26/27.
Implementation detail: `.claude/knowledge/domain/harness/`. Bug-class registry entry for item 4:
`.claude/knowledge/domain/mcp/bug-class-registry.md`.*
