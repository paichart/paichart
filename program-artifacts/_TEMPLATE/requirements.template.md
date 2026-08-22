# Program Requirements — TEMPLATE

> **How to use.** Copy this file to `program-artifacts/<run-name>/requirements.md` and replace every
> `{{PLACEHOLDER}}`. **Do not delete the ⚠️ clauses** — each one is tagged with the run that earned
> it. They read as verbose until you know what they cost; the provenance is there so you can check
> before removing.
>
> **Why this template exists.** Before 2026-08-10 each run copy-forked the previous run's
> `requirements.md`. Twelve of the thirteen were ~1.9 KB and carried none of the accumulated lessons;
> one had grown to 22.9 KB and carried all of them *plus* another run's topology to strip out. The
> durable know-how and the run instance were sharing a document. This is the durable half.
>
> **The single most transferable rule in this file** is the one at *Writing rules* #3: **state what
> must be TRUE, never the string that reports it.** Every agent reads this document, so a machine
> pass-condition written here is a target an agent can aim at *instead of* the requirement — and
> hitting the target while missing the requirement is the entire failure mode.

- POV: {{POV_NAME}}
- Phase: {{PHASE_NAME}}
- Iteration: {{RUN_ID}} · {{DATE}}

---

## Writing rules — read before authoring, they are the expensive part

These govern how you write **every other section**. All four were earned by a failed or false-passing
run.

1. ⚠️ **"Deterministic validation" means a reviewer can run it and compare, without judgement.**
   Every validation step is an **exact command** plus its **exact expected output** — the literal text
   or count you expect back. Prose like *"verify the loopback is up"*, *"confirm BGP advertises the
   aggregate"*, or *"check the policy is correct"* is a **REJECTABLE defect**, not a validation step:
   two reviewers could disagree on whether it passed.
   *Earned: Run 13's network leg was blocked for exactly this.*

2. ⚠️ **Ship every artefact your validation cites.** If a step invokes a policy/rule file (OPA,
   Conftest, tflint config, a test fixture), the change package must include that file's **complete,
   runnable contents**. Citing a check you did not ship is unrunnable, so it is not validation.
   *Earned: Run 10 was blocked for naming OPA/Conftest checks without shipping the rule files.*

3. 🔴 **State what must be TRUE. Do NOT name the measure that reports it.**
   Where a requirement can be written as a **property**, write the property — not the stamp shape, not
   the reason code, not the violation class, not `violations: []`. Every agent reads this file, so a
   machine pass-condition written here becomes **a target an agent can aim at instead of the
   requirement**. Let the platform own the string.
   *Earned: Run 15 (2026-07-29) — a leg met a published pass condition that was weaker than the
   requirement beside it, and shipped a defect. Declaring such a string "reference data" limits the
   damage; omitting it removes the temptation.*
   **Naming a measure is justified only when that state is the SUBJECT of the clause** and cannot be
   identified without it — and then say plainly that it is a state a leg legitimately lands in, never
   a bar to clear.

4. ⚠️ **Expected values stated in this document are reference data, NEVER evidence.** Where this file
   names an expected state, it describes the round's *intent* so a human can read the run. It is not
   an observation, and restating it is not a check. A tier must retrieve the **actual** value and
   construct its own finding.
   *Earned: Run 15 — Node C asserted a field's expected value, quoting the requirements, for a field
   that was **absent from the artifact entirely**.*

5. **Write properties, not hardcoded values**, wherever the environment can be rebuilt. If the rig
   re-randomizes, a magic expected string makes the round fail for the wrong reason.

6. ⚠️ **State every existence assumption a leg's objective rests on.** If a target resource may be
   ABSENT from harvested state (a security group not yet created, an object tracked under another
   address), say so and name the expected shape ("the resource may not exist; CREATE is the
   expected outcome"). An unstated existence assumption is resolved by the design at runtime as an
   ambiguity — it costs retry generations, or worse, a guessed reconciliation.
   *Earned: FW-A3.2/A3.3 — the same leg entered the retry band both rounds on exactly this
   ambiguity; FW-A3.5 stated it and the leg ran clean first-pass (VT-18).*

7. ⚠️ **A constraint that exists only by convention does not exist for the agents.** Agents can
   honor any constraint observable in harvested facts or written here — nothing else. If a value is
   forbidden by operating convention but legal against every harvested fact (a subnet's zero
   address, a reserved-by-habit range), write the constraint or accept the value.
   *Earned: FW-A3.3 selected a pool containing the /24 zero address — legal against the harvest,
   off-convention, and invisible to every tier because the convention was written nowhere (VT-18).*

---

## Program scope

- {{N}} delivery domains, executed **{{IN SEQUENCE | IN PARALLEL}}**:
  1. **{{DOMAIN_1}}** ({{UPSTREAM|—}}) on {{TARGET_1}}, described in `topology.json`.
  2. **{{DOMAIN_2}}** ({{DOWNSTREAM|—}}) on {{TARGET_2}}.
- {{EXPLICITLY_OUT_OF_SCOPE}} is explicitly **out of scope**.

## Why this is {{sequenced | parallel}} — the design rationale, read before questioning the DAG

> **Delete this section only if the program is genuinely parallel.** If it is sequenced, this section
> is what stops a reviewer "simplifying" the DAG into something that cannot work.

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

State *why* the value is not knowable up front. The strongest form is an objective test — e.g. *the
value changes on every environment rebuild, so it cannot be pinned in a static artifact or agreed in
a contract, and the Program Architect (which reads only `topology.json` + this file, with **no live
state access**) structurally cannot know it.*

{{RATIONALE — the specific derivation, why it is a design decision rather than a lookup, and what
would go wrong if someone guessed it up front}}

## Approvals — one gate per domain, plus the program plan gate

Team provisioned for this POV:
- {{ROLE}} is {{NAME}} {{EMAIL}}

- The **{{DOMAIN_1}} change** requires its own approval before that pipeline may run. Approver: **{{NAME_1}}**.
- The **{{DOMAIN_2}} change** requires its own approval before that pipeline may run. Approver: **{{NAME_2}}**.
- {{If sequenced}}: the downstream pipeline waits on **BOTH** its own gate **AND** the upstream
  pipeline (the DAG edge).

## Pipeline 1 objective — {{DOMAIN_1}} {{(UPSTREAM)}}

- Harvest {{TARGETS}} **read-only**. Service descriptor: `{{DESCRIPTOR_URL}}`
- {{THE WORK}}
- {{THE DERIVATION, if any — see the derivation clauses below}}
- **The deliverable MUST publish, explicitly and prominently**: {{THE CHAINED VALUES}} plus the
  reasoning for the choice. These are the inputs the downstream leg depends on.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

Keep all of the following — every line is an incident.

- **Show the computation** in the deliverable: the inputs, the arithmetic, and the result's coverage.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** {{DOMAIN-SPECIFIC TRAP — e.g. for CIDR: `.1/.2`
  are adjacent but do NOT summarize to a `/31`; they straddle a boundary and their minimal cover is a
  `/30` that swallows a neighbour. A `/31` covers an **aligned** pair only.}}
  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every input is inside the derived result, and
  nothing foreign is.
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence your
  derivation is correct — the checker verifies containment, not that you met the requirement.
  **Satisfy the requirements; do not target the checker.**

## Pipeline 2 objective — {{DOMAIN_2}} {{(DOWNSTREAM)}}

- {{THE WORK}}
- {{If it CONSUMES a chained value}}: it consumes {{VALUE}} **as chained** — it does **not** re-derive
  it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and
  re-verified at the program tier.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- {{CONSTANT}}: {{VALUE}}

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- {{DERIVED VALUE}} — produced by {{LEG}}, chained into {{LEG}}'s §6, settled before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. {{the consumed value exactly equals what the upstream leg produced — the chained value, not a
   guess, not a recomputation}};
2. {{a containment/coverage property of that value}};
2b. {{the tightest-correct property — recompute it; do not take the stated value on trust}};
3. {{a no-widening / no-collision property}};
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []` — i.e. the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging, or substituting
  one **silently deletes it**. If a new requirement needs a number, it **APPENDS** (5, 6, …).
  *Earned: Run 15 (2026-07-29) — a new clause was added to this file and the reviewer renumbered it
  into slot **2b**, the minimality check, which it then never performed. A non-minimal result shipped
  as a result. This is the single most expensive defect this template prevents.*

- Note these checks are **properties, not hardcoded values** — they stay valid when the environment is
  rebuilt. That is deliberate: the round must not depend on a magic expected string.

- ⚠️ **Require evidence where its READER looks, not only where it is convenient to write.** The
  integration reviewer's chained context is the LEG deliverables — a program-level statement (the
  producer's summary) is invisible to a check that reads legs. If a check requires a statement
  (e.g. the apply-order declaration), require it IN EACH leg's objective so it appears in each leg's
  report. *Earned: FW-A3.3 — Node C correctly rejected because the apply order appeared only in the
  producer's deliverable, which its leg-scoped context could not see (VT-18).*

### {{Optional}} Consuming-leg attribution — when a downstream leg legitimately cannot self-check

{{Keep this section only if a downstream leg consumes a derived value it cannot verify against its
own state. State the SATISFIED condition as a property, and require: (1) the upstream deriving leg's
derivation was machine-checked with no defect, (2) the program-tier checks above pass on the chained
value, and (3) chaining coverage confirms the real deliverable was received.}}

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*
