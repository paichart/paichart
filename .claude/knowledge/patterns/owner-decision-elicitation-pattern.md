# Owner-decision elicitation (ask, don't decide) — pattern

**Status:** field-tested on TWO objectives. **Confidence: 80%** (field-tested band). Promoted 2026-10-10 (Steve) when
its second-objective trigger was met.
**Canonical procedure (one domain instance):**
`.claude/knowledge/pipelines/requirements-authoring/OWNER-ANSWER-SESSION.md`. The `/requirements-spec` skill walks it end
to end. This file is the general shape; that file is the operating procedure, and wins on any detail.

## Pattern overview

**Problem.** A generator (an agent writing a spec, a plan or a policy) makes design decisions that belong to an owner,
and makes them silently, inside its prose. They are found later, one at a time, by a human read or a failed run, and
each one costs a regeneration. Measured on the requirements generator before this pattern existed: 99 of 100 decision
rows across eleven generations read "declared". Of the decisions nobody declared, 84% were made silently inside leg
text. One objective took 20+ hand revisions (telemetry-export Revs 3–25) to surface its decisions.

**Solution.**
- Make the generator **ask, not decide**. A fixed registry lists the questions each kind of part must answer, and
  every applicable question gets a row, answered in exactly one of four forms:
  - **declared** by the owner;
  - **derived** from an observation;
  - **forced** where only one answer is valid;
  - **OPEN**, with no default.
- Run once with nothing declared. That returns every question in ONE list.
- The owner answers them in grouped decisions.
- The answers are merged MECHANICALLY into the objective, and the generator runs again.

**Results.**
- **telemetry-export (2026-09-30):** about 40 owner rows collapsed to about a dozen decisions. One human editing pass
  replaced the 20+ revisions it took to find the same decisions by hand. The answered draft was published under an
  owner waiver.
- **log-archive read (2026-10-09):** the zero-decision run returned 20 owner questions. The answered run was APPROVED
  92 and published (`paichart@ff89bef`). Its program reached `programReleasable: true` (`cmv0jir1y00b0yxmcrcvigrku`).

## When to use this pattern
- An agent produces a design artifact whose choices belong to someone else (an owner, a team, an approver).
- Those choices recur across objectives, so a fixed question list can be written down and EARNED: each question
  added only after a run missed it.
- A missed or silently taken decision is expensive (a wrong program, a re-run, a refused release).

**Not for:** facts the agent can observe (those are *derived*, never asked), or one-off judgement calls with no
recurring shape.

## The pattern
1. **A question registry**, one canonical file. For each question it records:
   - the question, and its id `<part>.<key>`;
   - the closed set of options, where the answer space is closed;
   - the answer forms it may take;
   - **the run that earned it.** A question needs a measured miss before it is admitted.

   A CI parity test keeps every copy of the registry (skeleton, generator guidance, reviewer check) in step.
2. **Zero-decision run.** Give the objective the goal and nothing declared. The generator returns its owner block:
   one line per row that is not declared.
3. **Coverage before answers.** Mechanically check the owner block against the registry: every part × every key of
   its class. A missing question is a generator defect to file, never something to answer around. Once answers exist,
   a missing question becomes invisible.
4. **Group, then recommend with evidence.** Collapse the rows into decision groups. Present ONE group per turn as
   question · recommendation · why (the earned-by run). Name which calls are policy and which are lessons, and which
   values only the owner can supply. Derived rows are recommended as derived, for the owner to confirm.
5. **Record immediately, as numbered items.** The answers file is the owner's record. Write the items in the words the
   objective will use (the numbers are what the generator cites and the reviewer checks), plus a row→item map.
6. **Merge mechanically.** A script builds the answered objective. It refuses on:
   - an unanswered question;
   - an unknown row;
   - a bad item number;
   - an illegal `forced`;
   - non-contiguous numbering.

   Carry the row→item map as structured metadata, never as objective prose.
7. **Regenerate and gate.** Check citations string-for-string, check coverage again, and check that every owner item's
   obligation reached its part (dropped clauses). Write-up slips that change nothing the consumer is told may be
   waived, but only by the owner, by name, finding by finding. Never hand-edit the output: a hand-edited artifact tests
   nothing.

## Anti-patterns
- **Letting the generator default an owner decision**, or offering a "recommended default" for an OPEN row. Silence
  then looks like agreement.
- **Presenting 40 rows flat.** It invites rubber-stamping; a dozen grouped decisions invite judgement.
- **Answering around a missing question** instead of filing it as a generator defect.
- **Merging by hand.** That is where a question quietly goes unanswered.
- **Adding a question on speculation.** It grows the owner's burden with nothing behind it (the admission rule).
- **Putting observed state into an answer** (a count, an address list). The parts are meant to observe it themselves.

## Known limits (open)
- **An owner item that no registry key asks** gets a row whose name the generator invents. The coverage check reads
  that as an error that needs a waiver. The fix is decided but not built: fixed-shape `<part>.item-<N>` rows (register
  REGISTRY-B2-ITEM-ROWS).
- **A question the registry is missing** is not caught by coverage. It surfaces only as a wrong outcome. Example: the
  request path for an address-based principal, Z49, after a green program on a policy that would fail on real AWS.
- **Proven on one domain family** (network / Kubernetes / Terraform / observability authorisation programs) and one
  pipeline. A second generator using the pattern would move it to the validated band.

## Related patterns
- `in-run-facts-only-correction-pattern.md`: fixes FORM slips inside the generating run. This pattern removes DECISION
  gaps before it.
- Protocol 10, fact vs verdict: the generator's derived answers are facts with provenance, and its OPEN rows are never
  given verdict-shaped defaults.
- Registry design and admission rule: `.claude/knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md`.

## Validation source
- Procedure and evidence: `OWNER-ANSWER-SESSION.md`.
- Trial and three-run test: open register `REQ-SPEC-THREE-RUN-TEST`.
- Design pass: `cline_docs/reviews/requirements-design-pass-2026-09-30/`.
- Decision-surfacing design record: `cline_docs/reviews/requirements-decision-surfacing-2026-09-28/`.
