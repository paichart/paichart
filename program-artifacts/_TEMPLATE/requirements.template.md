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

<!-- WRITING-RULES -->

> 🔴 **DO NOT AUTHOR THIS SECTION.** Emit the heading and the `<!-- WRITING-RULES -->` marker above,
> and nothing else here. The rules are spliced in mechanically from `writing-rules.md` by
> `scripts/requirements-rules.py --insert <your-file>`, and verified by `--check`.
>
> *Why: the rules must reach the produced document VERBATIM, because change-package authors read that
> document and never this template. Three independent authoring passes over this template each
> altered them while transcribing — one loosened a rule's permitted forms and dropped another, one
> deleted an acceptance check, one dropped the rule numbering and then cited rules by number. Three
> runs, three distinct defects, none repeating. A model asked to transcribe a rule that constrains it
> is marking its own homework; if you emit them anyway, `--insert` will overwrite them and tell you it
> had to.*

## Program scope

### What counts as a DOMAIN — read this before writing the list below

🔴 **A domain is a PROTOCOL/target class, not a device and not a phase.** Each domain becomes one
pipeline (one "leg"): one protocol, one specialist chain, one gate. Get this wrong and everything
downstream is wrong — the DAG, the gate count, the interface contract, and what Node C compares.

**The test, and it is mechanical: WHICH PROTOCOL WOULD AUTHOR THIS?** If two pieces of work would be
authored by the *same* protocol against the *same* class of target, they are **one domain**, however
many devices, files or accounts are involved.

A separate leg is warranted by exactly two things:

| warrant | example |
|---|---|
| **a different protocol / target class** — a *domain* split | `network-provisioning` + `terraform-iac` + `kubernetes-gitops` + `observability-config` = four domains |
| **a value or state the next leg needs that ONLY the previous leg can produce** — a *phase* split, necessarily sequenced | an IGP migration where the cutover leg must target the exact NET the coexistence leg assigned |

**These do NOT warrant a separate leg:**

- ⚠️ **Device count.** Two switches either side of one link are **ONE** network domain. A leg
  harvests every device in its scope and authors per-device configuration as a matter of course.
  *Earned 2026-09-21: an authoring pass split a 2-node IGP migration into "ceos1 enablement" and
  "ceos2 enablement" as two parallel domains. Its reasoning was sound — it applied the
  sequenced/parallel test correctly and even distinguished an apply-time operational precondition
  from a data dependency — but nothing had told it that a device is not a domain.*
- ⚠️ **Wanting a separate approval.** A gate is attached to a leg; needing a second approver does not
  create a second leg. If two approvers must sign one body of work, that is one leg with a gate whose
  description names both, or a human process outside the program.
- ⚠️ **Tidiness.** Splitting to make each leg smaller multiplies gates, contracts and chaining edges —
  every one of which is a place a value can fail to arrive.

**Sanity check before you write the list:** count your domains and ask what protocol each resolves
to. Two entries resolving to the same protocol against the same targets is the error above, unless
the second is a *phase* that consumes something the first produces — in which case say so in *Why this
is sequenced*, and it must take the direct edge described under Approvals.

- {{N}} **legs** (pipelines), executed **{{IN SEQUENCE | IN PARALLEL}}**. A leg is either a distinct
  DOMAIN or a PHASE of one — see the definition above; do not call two phases of one protocol two
  domains:
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

**Team provisioned for this POV** — every approver named below must be a MEMBER of the POV team, or
the platform cannot route the gate to them and it silently falls to the POV owner, so a board meant
to show several approvers shows one:
- {{ROLE}} is {{NAME}} {{EMAIL}}

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 **This is the most expensive thing to get wrong in this section, and stating only one half is how
it goes wrong.** A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

Fill the table with both columns, never just the first:

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | {{NAME}} |
| {{DOMAIN_1}} change | {{WHAT — and if it is a produced value, NAME ITS PRODUCER}} | {{WHAT MUST FINISH FIRST}} | {{WHICH LEG IT BLOCKS}} | {{NAME_1}} |
| {{DOMAIN_2}} change | {{…}} | {{…}} | {{…}} | {{NAME_2}} |

⚠️ **Write "the value produced by X", never a bare "the PRODUCED value".** A bare "PRODUCED" has no
producer, and the phrase that follows it usually attaches the value to the CONSUMER's artifact
("the produced range *as an ingress source*"), which reads as the consuming leg's own output and
forces the gate after that leg. Then the gate approves work already finished.
*Earned 2026-09-17 (telemetry-export-four-domain): the Approvals table said "the PRODUCED range as an
ingress source" while the sentence below it said the pipeline waits on its own gate. Both readings
were defensible, the Program Architect flagged the contradiction as an Open Question and asked for
confirmation before plan approval, the plan gate was approved without answering it, and all four
change packages were produced with zero domain approvals.*

⚠️ **A gate wired after the leg it was meant to govern is a RECORD, not a control**, and an
intent/method gate in that position is close to meaningless — approving a method after the work is
done changes nothing. If a gate cannot block anything, say so deliberately or move it.

⚠️ **A gate the producing team can release for itself is not a gate.** Distinct owners are the point:
a program exists precisely because the halves are approved by different people.

**Then state the dependency consequence explicitly** — do not leave a planner to infer the DAG from
the prose above, because two readings of the same sentence produce two different graphs:
- {{If sequenced, spell out BOTH edges for each downstream leg}}: the downstream leg depends on
  **its own gate** AND on **the upstream leg**, and the gate also depends on the upstream leg.
  Write `{{upstream leg}} → {{its gate}}` AND `{{upstream leg}} → {{downstream leg}}`.

  ⚠️ **This is not a design choice, and the second edge is not redundancy.** An approval gate
  carries approval, not data: it is template-less and produces no deliverable, so a downstream leg
  whose only dependency is its gate receives an EMPTY chained context and cannot see the value it
  exists to consume. Inter-pipeline chaining walks DIRECT dependency edges only. The gate edge
  decides **when** the leg may start; the direct edge is **how the value reaches it**.

  *Earned twice, in opposite directions. `igp-migration-t1-triangle` stated "each phase waits on
  BOTH its own gate AND the previous pipeline" and ran correctly. `telemetry-export-four-domain`
  said the downstream legs do NOT take a direct edge and that the value "reaches the leg through
  the gate" — an invented mechanism — and three rounds were planned from it before a leg escalated
  (2026-09-18). An earlier version of this line offered both as valid alternatives; only one is.*

## Pipeline 1 objective — {{DOMAIN_1}} {{(UPSTREAM)}}

- Harvest {{TARGETS}} **read-only**. Service descriptor: `{{DESCRIPTOR_URL}}`
- **Preconditions verified — {{WHEN}}**: {{WHICH HARVEST YOU READ — a prior run's harvest
  artifact by id, or a manual read naming the call — and confirmation that the inputs named
  below actually appear in it. `none — first run against this target` is a permitted answer;
  it declares the premise UNTESTED rather than hiding that inside a confident objective.}}
  ⚠️ *YOU do this while authoring, once, before the run. It changes nothing at run time: every
  leg still performs its own Phase 0 harvest, and **no agent reads another run's harvest** — a leg
  reaching into another pipeline's evidence is a blocking defect, not a shortcut. Write the
  OBSERVATION ("`state_list` returns X and Y only"), never the history ("last round failed
  because…") — a prior round's narrative in this file reaches the Architect verbatim.*
- {{THE WORK}}
- {{THE DERIVATION, if any — see the derivation clauses below}}
- **If the harvest returns no {{DERIVATION INPUTS}}**: {{THE NULL OUTCOME — normally a gap report
  naming exactly what was absent and what would have to exist; NEVER a substitute value}}
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
- ⚠️ **Verify the PREMISE before you write the objective — reachability is not sufficiency.** An
  objective naming inputs the target does not hold is unsatisfiable, and the leg will either escalate
  (correct) or find a value somewhere (plausible and wrong). Probing that the service ANSWERS proves
  it is alive, not that it holds what you are about to ask about. Read a harvest — a fresh one or a
  prior run's — before writing the derivation clause.
  *Earned: 2026-09-20 — an objective asked for a cover over harvested private subnet CIDRs in a
  workspace holding two resources and no subnets. All three endpoints had been probed and answered.*
- 🔴 **STATE THE NULL CASE, always.** Say what the correct outcome is when the harvest yields no
  inputs. An objective that only describes the success path forces improvisation at the worst layer:
  the brief a harness composes at CREATE runs BEFORE the harvest, so it presupposes the derivation
  and instructs a later agent to carry forward a block that may never exist. A named null outcome
  ("produce a gap report; author nothing") is satisfiable; silence is not.
  *Earned: 2026-09-20 — the Design correctly declined to derive from an empty harvest, and the Author,
  holding a brief that demanded the block, imported a range from an unrelated pipeline and authored a
  policy permitting writes from switch loopback addresses. Its reviewer graded the import a
  non-blocking observation and approved at 92; the harness gate escalated and refused to release.
  Re-run with the null case stated, it produced a correct gap report on the first attempt.*
- 🔴 **RUN YOUR OWN RULE. A stated derivation rule and the value it publishes are two artifacts, and
  nothing else checks they agree.** Apply the rule you wrote, literally and step by step, to one
  input, and confirm it produces the value you published — including the WIDTH of the result. Every
  other instruction here verifies the VALUE (is it minimal, is it contained, does it trace to a
  harvested input); this one verifies the RULE. A rule that does not produce its own output ships a
  correct-looking value with a wrong method, and every downstream tier that "recomputes using the
  stated convention" then fails against a value that is actually right.
  *Earned 2026-09-21: an authoring pass wrote "zero-pad each octet to 4 hex digits and concatenate",
  which yields 16 hex digits, and published a well-formed 12-digit identifier — one group shorter
  than its own rule produces. The published value was correct; the stated method could not have
  produced it. Its own reviewer check said "recompute using the stated convention", which would have
  mismatched a correct value. Two other passes over the same objective used a self-consistent
  convention and agreed with each other, so this is a per-run slip, not a general one — which is
  exactly why a mechanical self-check belongs here rather than a house convention.*
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
  > ⚠️ **This line cites *Writing rules* by number, so CARRY THAT SECTION into the document you
  > produce.** The rules govern how change-package authors write validation, and those authors read
  > only your produced file — never this template. A citation whose target did not travel is a
  > dangling reference: the author is held to numbered rules it cannot read, and nothing reports it.
  > *(Live 2026-09-18: one artifact of six omitted the section. Two consumer legs were then blocked
  > for violating rule 1 — prose where an exact command plus literal output was required — having
  > been pointed at a rule that was not in front of them. Either carry the section, or replace this
  > citation with the requirement stated inline; do not leave the number pointing at nothing.)*
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
