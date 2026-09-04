# Using the Two Protocols — Workflow Evolution (13) + Signal Design (10)

> **Purpose**: an orientation map for the two protocols that govern *changing the program/pipeline
> platform itself*: **Protocol 13 — Program Workflow Evolution** (the loop you run when a live run
> reveals a defect) and **Protocol 10 — Signal Design** (whether a number/flag deserves authority
> over decisions). They are a matched pair. This doc says **when to reach for which, and how they
> connect** — the *procedures* live in the protocols themselves; go there for steps. Do not
> duplicate their content here (Protocol 11 claim-staleness — this is a pointer, not a copy).
>
> **Who maintains it**: `pipeline-harness-specialist` (owns Protocol 13). Protocol 10 is owned by
> `architectural-review-specialist`. Update the one-line summaries here only if a protocol's *scope*
> changes; never mirror its internal steps.
>
> **Canonical sources**:
> [`../protocols/program-workflow-evolution-protocol.md`](../protocols/program-workflow-evolution-protocol.md)
> (Protocol 13) ·
> [`../protocols/signal-design-protocol.md`](../protocols/signal-design-protocol.md) (Protocol 10).

## The one-line distinction

- **Protocol 13** answers: *"A run just showed the platform is wrong (or suspiciously right) — how do
  I fix it so the fix lands at the right layer, is live-validated, and can't silently regress?"*
- **Protocol 10** answers: *"Should this number / flag / score be allowed to make a decision, or
  should it just be recorded?"*

Protocol 13 is the **loop you run**. Protocol 10 is an **instrument one of its steps uses** when the
finding is about a signal. You will often run 13 and never touch 10 (a truncation stall, a race, a
parser blind spot). You reach for 10 only when the question is *epistemic* — do we trust this value.

---

## Protocol 13 — Program Workflow Evolution: when and how

**Reach for it** when a live program/pipeline run produces a **defect, a near-miss, or a suspicious
pass** you intend to fix. It is the discipline that turns findings into durable, right-layer fixes
instead of one-off patches.

The loop (see the protocol for the full 7 steps):
1. **Preserve the specimen** — archive the evidence a later study needs *before* any cleanup.
2. **Measure** — reproduce and quantify from artifacts, not narratives.
3. **Classify the OWNING LAYER** — the heart of it. Four layers; the fix goes in exactly one:
   - **role guidance** = what the LLM reads (behavior shaping)
   - **template** = thin identity (rarely the fix)
   - **protocol** = the procedures the harness follows
   - **platform code** = mechanical enforcement
4. **Review** — domain specialist + adversarial pass, proportional to blast radius.
5. **Ship with coupling** — version bump + dated changelog *same commit*; know the reseed rule
   (**protocols self-seed on deploy; templates need a manual re-bake**).
6. **Live-validate** on a real run.
7. **VT at test time + Protocol 11 drift sweep.**

The most reusable part is the **layer-selection rules earned live**:
- **Prompt warnings insufficient ⇒ add a mechanical net.** (A defect recurred despite an explicit
  brief warning — a warning is not enforcement.)
- **Comments are never enforcement ⇒ state channels only.**
- **Never replicate gate/threshold text per-domain ⇒ one shared chokepoint.** (The retired `>=85`
  survived in three per-domain copies; extraction covers all in one edit.)
- **Facts ship; verdicts are earned.** ← this hands off to Protocol 10.

---

## Protocol 10 — Signal Design (Fact vs. Verdict): when and how

**Reach for it** whenever a change **adds or alters a signal an AI consumer will act on** — an error
message, a `nextSteps` hint, a `retryable`/`disposition` flag, a **confidence score**, a suggested
delay. The core question: is this a **fact** (verifiable truth, wrong only as a findable bug) or a
**verdict** (a judgment that can be wrong even when every fact is right)? **Default: ship facts, earn
verdicts.**

The protocol tells you to *defer* an unearned verdict. The **calibration-study method** (the
"Earning or Retiring a Verdict" section) tells you how a verdict actually earns — or loses — gate
authority. It runs in **both directions** (promote a recorded fact; retire an unearned gate input):
1. **Corpus** — the signal's values paired with known ground-truth outcomes, spanning both classes.
2. **Controlled pair** — equivalent inputs, divergent signal (byte-compare; don't eyeball).
3. **Separation test** — does the value distinguish good outcomes from bad? Overlap = no information.
4. **Ruling** — gate authority *only* on demonstrated separation; else it stays a **recorded fact**
   (stamped, tooltipped, **never a conjunct**).
5. **Transitive sweep** — retiring a threshold means denying it at **every tier in one sweep**; one
   surviving inner-tier `>= N` re-imposes itself through an outer "all children passed" conjunct.

---

## How they connect — the decision path

```
A run produced a finding
        │
        ▼
Protocol 13, step 3: classify the OWNING LAYER
        │
        ├─ Is the finding about WHETHER TO TRUST a number / flag / score?
        │        │
        │        ├─ NO  → fix at the identified layer (role/template/protocol/code),
        │        │         finish the 13 loop.
        │        │
        │        └─ YES → reach for Protocol 10 (fact vs. verdict).
        │                   │
        │                   ├─ Proposing a signal for gate authority, OR
        │                   │  doubting a shipped gate signal?
        │                   │        → run the calibration-study method.
        │                   │          Ruling feeds back as the 13 fix
        │                   │          (usually: demote to recorded fact +
        │                   │           move authority to a signal that separates).
        │                   │
        │                   └─ Retiring a threshold? → transitive sweep is
        │                      itself a Protocol 11 drift sweep (13 step 7).
        ▼
Live-validate → VT at test time → drift sweep.
```

**Canonical worked trace (this is the example both protocols cite):** the pipeline harness gated
release on `reviewerScore >= 85`. Protocol 13's loop surfaced the doubt (a defect passed at
confidence 92 that an equivalent input caught at 45). Protocol 10's calibration study proved the
number carried **no separation** — approvals on defective and clean work shared one band (88–94),
five of seven exactly 92. Ruling: **demote confidence to a recorded fact**; move gate authority to
signals that *do* separate (a mechanical containment check + independent recomputation). The
transitive sweep pulled `>=85` from every tier in one commit. The green pass that followed — release
stamped on facts, zero confidence thresholds in the chain — is the live confirmation.
Records: [`../../../cline_docs/reviews/evidence-flow-arc-2026-07/CALIBRATION-STUDY.md`](../../../cline_docs/reviews/evidence-flow-arc-2026-07/CALIBRATION-STUDY.md)
+ [`../../../cline_docs/reviews/confidence-gate-demotion-2026-07-18/SYNTHESIS.md`](../../../cline_docs/reviews/confidence-gate-demotion-2026-07-18/SYNTHESIS.md).

## Related

- Program run forensics (measure a finding — step 2): [`PROGRAM-RUN-FORENSICS-GUIDE.md`](./PROGRAM-RUN-FORENSICS-GUIDE.md)
- Evidence-flow discipline (the multi-tier-judgment invariants Protocol 13 hardened): [`EVIDENCE-FLOW-DISCIPLINE.md`](./EVIDENCE-FLOW-DISCIPLINE.md)
- Protocol 11 (Drift Sweep — invoked by 13 step 7 and by 10's transitive sweep): `.claude/knowledge/protocols/drift-sweep-protocol.md`

### Implementation-standard patterns (the *how* for each fix layer)

- **Signal Design in production** — the fact catalog: `.claude/knowledge/patterns/agent-output-trustworthiness-defense-stack-pattern.md` (additive detection facts in `result.json`; the Protocol 10 lens applied to agent output).
- **Platform-code, event-driven fixes** — the reactor shape: `.claude/knowledge/patterns/orchestration-reactor-pattern.md` (Pattern #46; the shape Protocol 13's platform-code layer requires).
- **Role-guidance / template fixes** — authoring + bake/re-seed coupling: `.claude/knowledge/patterns/agent-template-gold-standard-pattern.md` (Pattern #44; the standard Protocol 13's role-guidance/template layer authors to).
