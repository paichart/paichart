# Publishing a generated requirements.md as a program input

**Audience:** the operator (or the pipeline-harness specialist acting for one) turning a requirements-authoring
pipeline's draft into the `requirements.md` a `pov-program` run reads. **Proven end to end 2026-09-24:**
`genspec-run4`, generated in one pass (approved 93), published, served, and launched as a customer-facing program.

The design and rules behind each step: `requirements-authoring-pipeline.md` (this directory), the operator HOWTO
(`/prompt HOWTO-use-program-harness`, section *"If the requirements.md was GENERATED"*), and the harvested-state panel
`cline_docs/reviews/harvested-state-in-generated-spec-2026-09-24/SYNTHESIS.md`.

---

> **Walk-through skill (2026-10-08):** `/requirements-spec` (`.claude/skills/requirements-spec/SKILL.md`) orders this
> procedure and its scripts end to end and stops at every owner decision and production/public action. This doc stays canonical.

## 0. Generate it well — most of the publish pass is decided here

Give the generation task's DESCRIPTION one block headed **`DESIGN DECISIONS — DECLARED, NOT INFERRED`** (Steve,
2026-09-25). Each entry is a **choice among valid options that only the POV owner can make**; the generator
TRANSCRIBES it. Everything else — addresses, members, counts, current state — the harness **observes**, and none of it
belongs in the description (it is harvested state; see §2).

**The test for each candidate entry — declare a CHOICE, never an OBSERVATION:**
- Would two competent engineers, given the same live estate, reasonably pick differently? → a decision, declare it.
- Can a read-only harvest establish it? → an observation, never declare it (declaring it freezes a value that goes stale,
  which is the failure this whole pipeline exists to prevent).
- A decision is stated as a **rule or a named target**, never as the values it selects today. *"Exporters are the
  interfaces whose description marks them as telemetry exporters"* is a decision; the six addresses it selects are not.
- Give no **tooling justification** ("the descriptor has no tool that enumerates namespaces"): it goes stale the day the
  tool changes while the decision stays true. State the decision.

> **The questions themselves — every key, its options, which answers it may take, why it exists, and how to add or
> change one — are maintained in [`DESIGN-DECISION-QUESTIONS.md`](DESIGN-DECISION-QUESTIONS.md).** **To answer a whole owner
> block at once** (a zero-decision generation, ~40 rows), run the grouped session in
> [`OWNER-ANSWER-SESSION.md`](OWNER-ANSWER-SESSION.md) — it ends in `scripts/build-answered-objective.py`, which refuses to
> write an objective that leaves a question unanswered. **Before publishing ANY generated draft,** run
> `python3 scripts/check-requirements-citations.py --objective <objective> --draft <requirements.md>` — a finding means not
> publishable, whatever the Reviewer's verdict (its quote check has ~31% recall), UNLESS the owner waives it as a
> write-up-only slip under [`OWNER-ANSWER-SESSION.md`](OWNER-ANSWER-SESSION.md) step 8 (recorded in `PUBLISH-NOTES.md`). This table is the
> owner's view: what to declare, with examples. If the two disagree, the registry wins; fix this table.

| kind of decision | example (telemetry-export objective) | what happened when it was left to the generator |
|---|---|---|
| **TARGET** — which instance, when more than one could qualify | namespace `trading`; the archive bucket | a harvest probes only what it is told about; an unnamed bucket is right only while it is the only one |
| **POPULATION** — which members of a class the program acts on, as a CONVENTION | "exporter addresses are the IPv4 addresses of interfaces whose description marks them as telemetry exporters" | Rev 5 (2026-09-25) took **every** address (management + links + loopbacks) ⇒ minimal cover `0.0.0.0/0`, approved at 90 with all checks green — see §2 |
| **REPRESENTATION** — how a derived value is expressed | "the smallest CIDR block, aligned to a valid prefix boundary, containing every exporter address" | "exactly … nothing wider" has two defensible readings (aligned prefix vs host list); a generator picked the other one |
| **RECEIVER** — what on the target side is authorised | the receiving workload/port in the namespace, or explicitly "namespace-wide" | raised as an open question and defaulted to namespace-wide |
| **APPROVERS** — gate → named person (by email) | five gates; plus "shared assignments are intentional" when one person holds two gates | since requirements-authoring 1.4.0 transcribed and marked `(declared)`, an omitted gate is `UNASSIGNED`; an undeclared intentional overlap is re-raised as an open question on every run |
| **GATE POSITION** — when each gate except the program plan gate sits (before the leg · after the leg, before completion · after the producer, before the consumers) | Decision 12: the three change-method gates sit after their legs; the fabric value gate after FABRIC, before the consumers | never declared (Decision 7 says WHO, not WHEN); Rev 21 and Program Run 4 put the method gates before their legs, Rev 22 after (2026-09-28) |
| **ADMITTED PRINCIPAL** *(a leg that grants or removes access)* — who is admitted, and by which attribute the enforcer recognises them: source-address-range · named-identity · network-path · combination | Decision 5 (the exporter range) for the cluster and the ingress; Decision 14 for the bucket: a named IAM role, through a declared VPC endpoint, from the exporter range — the role and endpoint declared as provisioned outside the program | Program Run 5 (2026-09-28): no row asked it; the cloud Author wrote `Principal "*"` with a source-address condition S3 never sees on the public path, and Node C refused it |
| **PRINCIPAL UNSEEN** *(a leg that grants or removes access)* — the leg's harvest cannot confirm the enforcer sees the admitted attribute on the sender's path: gap · act-regardless | telemetry-export: gap on the receiver pods and the ingress; act-regardless on the bucket (the role and VPC endpoint are declared provisioned outside the program, so the premise is recorded UNTESTED) | the premise branch was missed or uncited in 4 runs; it had no slot and no outcome row. `act-regardless` means NOT CONFIRMED AND NOT CONTRADICTED: harvest evidence that the attribute arrives by another path stops the leg (D2, 2026-10-12). **Where nothing the leg reads can show the arrival address (it is not in configuration), `gap` stops EVERY run** (D1): prefer `act-regardless` with your own verification as the rationale, or give the harvest a read that observes it (the descriptor, defect-layer 1) |
| **GRANTED ACTION** *(a leg that grants or removes access)* — what the admitted principal may do | Decision 6: `s3:PutObject` only; Decisions 3/10/11: TCP 4317 and 4318 | T0 (objective without it, 2026-09-28): 2 of 2 runs APPROVED with an unbounded S3 grant; Rev 10 was the first run to raise it at all |
| **EXISTING GRANT** — other allowances already on the same surface: replace · preserve · preserve-bounded (state the bound) | Decision 9: replace on the receiver pods and the ingress; preserve-bounded on the bucket | a coin flip across 14 revisions (6 additive / 5 replace / 3 ambiguous) — and the template's own "if one exists, modify it" was blurring it until 2026-09-28 |
| **TARGET EMPTY** — the receiver selector or surface matches nothing now: act · gap | Decision 8: author against the selector; report the match count | Authors split 3:7 on identical objectives; Rev 15 contradicted Decision 8 in its null branch through the template's "normally a gap report" |
| **ENFORCER ABSENT** — no policy object governs the receiver yet: create · gap | ONE **numbered** item per authorisation objective ("absent enforcers are created") — declared once, not per leg; unnumbered, no row can cite it | undeclared, it is OPEN on every authorisation leg (three OPEN rows on the telemetry objective) |
| **COVERED ROUTES** *(a leg that changes routes: it adds a covering route, or suppresses, filters, withdraws or replaces routes)* — when the leg adds an ADVERTISED covering route (a summary or aggregate; a static or default route is not one), whether the routes it covers stop being advertised: replace · accompany | a numbered item: the fabric range is advertised ALONGSIDE the individual host routes (accompany), or in place of them (replace) | never asked: 9 of 10 telemetry-export `topology.json` existence assumptions (hand-written) said "advertise the covering range in place of the individual routes", and a control's fabric leg suppressed the covered routes on both devices of a pair (2026-10-05). No generated spec chose it — wording outside a numbered item is not an answer |
| **MUST STAY REACHABLE** *(a leg that changes routes)* — WHAT must stay reachable after the change, and from where (a rule; never how the leg checks it) | "every exporter address, from every device that reached it before"; plus any destination only you know about, e.g. the collector's location. One numbered item can answer it for every routing leg | the same control: the package proved the covered routes gone and never established which destinations had to stay reachable. Declared or OPEN only, never derived — no harvest knows which destinations matter to you |
| **COLLATERAL** — what else on the target changes because enforcement now applies (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests; a proxy or listener allowlist: confined-to-block · whole-listener · gap) | Decision 11: leave-to-workload-manifests, isolation effect stated | not undeclared but **declared and impossible**: Decision 9's "other ports not touched" cannot hold — a pod selected by any Ingress NetworkPolicy is isolated for all ingress no policy allows (Program Run 4). A declared "untouched" on an isolating enforcer is flagged INFEASIBLE, never transcribed. Z57 (2026-10-11): a proxy enforcer had no option set and was answered free-form |
| **ENFORCER SCOPE** *(a leg that grants or removes access; asked on every one)* — which parts of the enforcer the restriction covers (a proxy block, a firewall interface, a bucket access point; asked even where the harvest shows one part): all-reaching-the-protected-thing · exemption-by-property · gap | "the restriction covers every block that forwards to the receiver"; or an exemption by a PROPERTY the leg's harvest can check — never a list of the parts (that is harvested state). On a one-part enforcer, one numbered item answers it for every leg | Z60 (Phase 4 attempt 1, 2026-10-11): the answered harvest found a second block forwarding to the same receiver; no row asked which blocks were in scope, so the Author invented a row and the Reviewer blocked on it. Declared or OPEN only, never derived — an exemption widens what stays open |

**Since the decision inventory (requirements-authoring ≥ 1.7.0, template 2026-09-28) the rows are FIXED QUESTIONS, not free
rows.** The template carries, per leg keyed by its protocol token, one row per question above (TARGET, POPULATION,
REPRESENTATION and `inputs-empty` per leg, APPROVER per gate, GATE POSITION per gate except the program plan gate; the
authorisation rows on a leg that grants or
removes access; the routing rows on a leg that changes routes). The generator answers EVERY row with exactly one source — `(declared — item N: "<selecting words>")` (the NUMBER
and a verbatim quote of the words that select the answer, so number your decisions — **including any line that applies
to every leg, such as "absent enforcers are created": an unnumbered line cannot be cited**), `(derived — basis: …)` (TARGET and SCOPE rows only; never admitted-principal, request-path, granted-action,
existing-grant, target-empty, collateral, enforcer-scope, covered-routes or must-stay-reachable), `(forced — …) → gap` (only `target-absent` and `inputs-empty`; the answer is
always `gap`), or `OPEN — …; options: …`. **What that costs you**: ~2–3 more decision lines per authorisation target plus
the declare-once line, and the first run of a new objective arrives as NEEDS-REVISION with the full list — by design.
Every row that is not declared lands in the document's *Decisions needed from the owner* block (and the harness's final
comment): `blocking` (OPEN) · `confirm` (derived) · `default` (forced) · `not-applicable — <reason>` (a deleted row).
Answer the blocking ones in ONE objective edit and regenerate.
A numbered item that states a choice no question asks gets a row keyed by its NUMBER (`<token>.item-<N>`, B-2,
2026-10-12) — nothing for you to do; a decision the document relies on that no item states arrives as an OPEN row and is
answered as a new item. A leg that consumes a chained value which arrives EMPTY makes no change and reports the upstream
gap (D3) — a rule, not a question.

⚠️ **An address-based principal needs its REQUEST PATH declared too (`<token>.request-path`, Z49, 2026-10-10).** The
path the senders' requests take to the enforcer decides which attribute carries their address: `direct` (the enforcer
sees each sender's own address), `private-endpoint` (the requests arrive through a private endpoint, and the address
arrives in that path's own attribute), or `translated` (NAT, a proxy or a load balancer is in between, so a
sender-address list cannot be enforced: a gap). "No network path is admitted" says WHO is admitted, not how the
requests travel. On object storage a private sender address is visible ONLY through a private endpoint. A spec that
leaves the path unanswered once produced a policy that admits nobody on the real service while every gate passed on
the rig.

⚠️ **The objective's own wording must not contradict a decision.** "Authorise exactly the exporter addresses — nothing
wider" contradicts an aggregate-CIDR representation (a `/27` over six scattered loopbacks admits 26 non-exporters), so
a reviewer can veto a correct value on the objective's words or pass a real widening on the rule's. Write the bound in
terms of the decision: *"authorise exactly the range the declared derivation rule produces — nothing wider than it."*

⚠️ **A declaration is the ANSWER to a question, not a fix for a generator that fails to ask it.** When a generator meets
an undeclared decision the right behaviour is Rev 4's (name it as an open question); Rev 5 answered it silently. Declare
the decision so the spec is correct — and treat a silent answer as a defect of the role that gave it (register GS-R5).

No history, no corrective narrative, no "the last run did X" — the description reaches every child brief verbatim.
**Nor in the stage description or task comments of a re-run:** the harness reads both at CREATE and carries what they say
into child briefs (Rev 5, 2026-09-25: a pre-flight comment naming Rev 4's defect became a steering line in the Author's
brief). Keep them neutral when the regeneration must be blind.
A re-run in a phase with prior runs clears the duplicate check via `metadata.duplicateAcknowledged` (a LIST of every
prior `Pipeline: …` stage id), never a description block — see `pipeline-harness-library.md` § duplicate-check clearance.

## 0b. Judging a generation — the acceptance test (Steve, 2026-09-25)

The gate verdict alone is not the test. A generation is **acceptable** in exactly two cases:

1. **NEEDS-REVISION that names a missing design decision.** The generator met a choice the objective did not declare,
   raised it as an open question, and the Reviewer held it. That is the system working: declare the decision (§0) and
   regenerate.
2. **A successful run in which every design decision the generator DERIVED is correct.** Deriving is fine — on one
   condition that makes "correct" checkable:
   > **A derived decision must be STATED AS A DECISION** — listed as a derived design decision with its basis (e.g.
   > "exporters = interfaces described `telemetry-exporter` in the harvest"). A decision made silently inside a leg's
   > instructions FAILS even if it happens to be right, because no reviewer or reader could have checked it.

   Why the condition exists: Rev 5 derived the exporter population as "every address", buried in Pipeline 1's
   instructions, and passed the gate at 90 — a "successful run" whose derived decision authorised `0.0.0.0/0`. The gate
   cannot see a silent decision. **A stated one can be CHECKED only where the evidence is** — by the human publish read
   (§2), and at the program leg, where the harvested census travels with the package. The Requirements Reviewer cannot:
   it sees only the Author's document, never the harvest or the objective, so it grades a stated basis as
   ACCEPTED-FROM-CLAIMS. *(Corrected 2026-09-26, GS-R5 panel: this line previously said "a recomputation any reviewer can
   do against the harvest", which was false for that reviewer.)*

   > **Qualifier (Steve, 2026-09-26): a derived decision that WIDENS who is authorised or what is selected is never
   > acceptable as derived.** The whole class ("every address"), a match-all selector (`podSelector: {}`, `*`), an
   > all-covering range — each must be DECLARED by the owner, or it is an OPEN question. **An open question carries no
   > default**: the leg takes its null outcome. Why: Run 3 (2026-09-24) met case 2 as first written — the default
   > (namespace-wide) was stated with its basis at every tier and approved through a human plan gate — and still
   > produced a policy that would have cut an unrelated service off from its clients. Disclosure is not authorisation.

Everything else is a **generator quality defect**, and every one is RECORDED and ROUTED — the fix is guidance only when
the guidance lacks the rule (`.claude/knowledge/domain/harness/defect-layer-routing.md`, step 0):

| the defect | route | Rev 6 instance (2026-09-25) |
|---|---|---|
| the rule is MISSING from guidance | **guidance fix** (role guidance or protocol) | — |
| the rule exists and is MECHANICALLY checkable | **mechanical fix** — template marker, `--skeleton` strip, publish grep, lint | author-addressed instruction left in the sequencing section: the template line is not marked `🗑` (register GS-T1) |
| the rule exists, is a judgement, and the Reviewer CAUGHT it | **record only** — the control worked; escalate to a checkable Reviewer item or a lint only on RECURRENCE | absence claimed from harvest silence; broken cross-reference; unattributed resource identifiers |
| the rule exists and the Reviewer MISSED it | **reviewer defect** — a checkable Reviewer item (Invariant 6: recomputation, not judgement) | Rev 5's population (register GS-R5a) |

## 1. Choose which run to publish

Prefer a run that **passed without harness recovery** — one execution per child. A run the harness had to re-run
(a truncated Author, a truncated Reviewer) can pass, but it is the weaker exhibit. "Harness recovery" means a CHILD
re-run; a leg whose SYNTHESIZE was **platform-rescued after `task.complete`** (its `pipeline-index.json` carries
`postCompletionFailure`) still qualifies — its `report.md` is the same upstream extraction a normal SYNTHESIZE
persist produces; only the harness's closing narrative is missing. Before choosing, read the run:

- the final document is the harness SYNTHESIZE execution's `report.md` (the one with both `pipeline-index.json` and
  `report.md`), NOT a child's `result.json`;
- `toolLoop.truncationRetryUsed` false and no `truncated due to token limit` on the Author and Reviewer;
- the reviewer's terminal `## VERDICT: APPROVED`.
- **An in-run correction is not harness recovery.** It is a second turn inside the same Author execution (since
  2026-10-09). A run whose Author draft was corrected still has one execution per child. Read
  `toolLoop.requirementsFormCheck.correction`: `adopted`, `adoptionRuleVersion`, and the before/after measures. If you
  want to see what the turn changed, diff it against the `requirements.pre-correction.md` artifact.

## 2. Read the whole draft for harvested state — by hand

Harvested state belongs **nowhere** in the document. A regex is a pre-filter, not the check:

- full addresses AND **abbreviated** ones (`.1, .2, .4` — written exactly that way on 2026-09-23);
- **counts** of harvested things ("six addresses", "no seventh", "three on each") — the dominant leak channel;
- the **worked example** — it must be synthetic (the template's `.1/.2`, or RFC 5737 `198.51.100.x`), never the
  real harvest worked through (that is the answer, hedged);
- *Preconditions verified* holds a **pointer and a property** ("the Phase 0 harvest confirms at least one target
  carries the label"), never the values.

- the ***Design decisions* table** (requirements-authoring ≥ 1.6.0): every row `(declared)`, `(derived — basis: …)` or `OPEN`; an `OPEN` row means the draft is NOT publishable — declare the decision and regenerate; a `(derived)` row's basis must name what SELECTS the subset, and a derived decision that widens scope is a defect (§0b). Then check each leg against the table:
- **Since the decision inventory (≥ 1.7.0) — read the inventory, not only the rows present:**
  - **every leg carries every question row of its kind** (count them against the template: the every-leg block, plus the
    authorisation block on a leg that grants or removes access, plus the routing block on a leg that changes routes). A
    missing row is a decision taken silently;
  - every row answers with exactly one of `(declared — item N: "…")` — **the quoted words are in item N**, name this leg's target or domain (or all legs), and on a
    row with options select exactly one option —,
    `(derived — basis: …)`, `(forced — …) → gap`, `OPEN — …; options: …`. A `(derived)` basis carries **no number and no
    harvested name** (`--lint` flags a number inside one — "shows one bucket" is harvested state), and its cell names only
    the selected surface or members — no action, port, verb or treatment of existing allowances;
  - row ids use exactly the four protocol tokens (`network-provisioning`, `kubernetes-gitops`, `terraform-iac`,
    `observability-config`) — never `k8s`, `tf`, `obs`;
  - every leg clause that cites a row does exactly what that row's answer says and nothing more; a clause citing an OPEN
    row only reports the gap;
  - `(forced)` appears ONLY on `target-absent` and `inputs-empty`, its rule cell and answer read `gap`, and its reason cites an item that
    exists and names that target. Anywhere else, or with any other answer, is a generator defect;
  - `collateral` on a Kubernetes leg: a declared "other ports are not touched" is INFEASIBLE (NetworkPolicy isolation),
    and must be flagged, not carried;
  - every existence branch and every null branch is PRESENT in every consumer leg and cites its row id;
  - ***Decisions needed from the owner*** lists exactly the rows that are not `(declared — item N: "…")` — OPEN (blocking),
    derived (confirm), forced (default), deleted (not-applicable). Any `blocking` line ⇒ NOT publishable. An OPEN that
    sits only in *Open questions* with no row is a missing row;
- the **derivation POPULATION** matches the objective's noun — "exporter addresses" is not "every address". Read what
  Pipeline 1 tells the leg to harvest and derive over, and ask what that set is on the live estate. **Rev 5 (2026-09-25)
  passed the gate at 90 while deriving over management + link + loopback addresses ⇒ `0.0.0.0/0`**; containment and
  minimality checks run over whatever population the leg is told, so they cannot catch it. This is a judgement no gate
  makes for you.

Anything found is a generation defect: **regenerate rather than hand-edit.** A hand-edited spec is publishable but
tests nothing, and the next generation reproduces the defect.

## 3. The publish pass

**One command (2026-10-08):** `scripts/publish-generated-spec.py` runs §1's run summary (`fetch --task <id>`, read-only),
every mechanical step of §3 in this order with a STOP on each failed gate (`prepare … [--write]`; dry run by default;
banner stripped only under `--waiver`; coverage + citation gates; program view when over the read limit; a
PUBLISH-NOTES.md skeleton), and §4 (`verify --name`). It never commits or pushes: it prints the public-repo commands for a
person. Proven: `fetch cmunrlf23…` → `prepare` rebuilt `telemetry-export-genspec-t1zero-v2` byte-identical (all three
files). Tests: `npm run test:publish-generated-spec`. **It does not replace §2** (harvested names, paraphrase, the
derivation population) — that read is still yours. **Since 2026-10-12 it runs the dropped-clause check** (`prepare`
takes `--answers`): every flag stops the pass until it is READ and named in `--clause-read <item>:<leg>:<anchor>,…`, the
anchor exactly as printed (a checker miss; since checker fix 2 the read dismisses ONE flag — a different anchor on the
same item and leg, e.g. a re-anchored or nested obligation, is a new read, so read the anchor text, never the key) — a real drop means regenerate, and `--waiver` never clears a clause flag. `fetch` also saves the Author's
correction record (`author-correction.json`) and its operator artifacts; `prepare` STOPs without the record, and when an
in-run correction was ADOPTED to fit the read limit it prints the removed lines of every leg / Approvals / Acceptance
section that shrank and STOPs until each is READ and named in `--correction-diff-read "<section>,…"` (owner decision
P2 = c'; a deleted obligation means regenerate). Size is the one check no path waives (`NON_WAIVABLE`). The manual steps below remain the reference for what it does.


```bash
cd ~/paichart
D=program-artifacts/<name>            # a NEW directory — never edit a published one; it is a run's input of record
mkdir -p $D
# requirements.md = the SYNTHESIZE report.md, saved verbatim
cp program-artifacts/<prior-run>/topology.json $D/topology.json   # byte-identical keeps the spec the only variable
```

Then, in this order:

1. **Remove the Author's trailing `Confidence: NN` line** — engine metadata, not document content.
   (genspec-run3 shipped with its `Confidence: 84` — a missed step; left in place as Run 10's input of record.)
2. **Rewrite any sentence claiming the rules are not yet spliced** (e.g. *"structurally incomplete until a person
   splices …"*) into an accurate post-splice status. If you edit it before step 3, `--insert` warns *"no draft-status
   claim found to retire"* — expected; then confirm by grep that no such claim remains.
3a. **Harvested-state pre-filter** (built 2026-09-26, when its trigger fired): save the generation task's description to a file
   OUTSIDE the published directory (e.g. `/tmp/objective.txt`; the objective is not a program input) — then
   `python3 scripts/requirements-rules.py --lint $D/requirements.md --declared /tmp/objective.txt`. It lists every
   address, port, ARN, bucket literal, Terraform resource address or count that came from neither the template nor
   the declared objective (resource addresses added 2026-09-26: 4 of 8 drafts named a harvested resource out of scope). **Any hit
   is a candidate to READ; a harvested one means regenerate.** It cannot see harvested NAMES or paraphrase — a zero does
   not replace §2's full read. (Measured on Revs 4–9: it caught every known leak — a bucket name, a port, a loopback
   descriptor — and passed the clean draft.)
   **A hit read and found NOT harvested** (2026-10-10, owner decision): `publish-generated-spec.py prepare` stops on
   any hit; name each one you read with `--lint-read <line>:<token>,…` and give the reason in the waiver or
   PUBLISH-NOTES. Every hit must be named and every name must match a hit (an unnamed or stale name still stops). Never
   name a harvested one — regenerate. First use: a list under a "Synthetic self-check …:" lead-in, whose own bullets
   end the lint's declared-synthetic exemption (register Z53).
3. `python3 scripts/requirements-rules.py --insert $D/requirements.md` then `--check` → must print
   *"byte-identical to canonical"*. `--insert` fills the section IN PLACE; it cannot move it.
4. Checks — all must be 0 except the last:

   | check | expect |
   |---|---|
   | `grep -c '^> \*\*🗑' requirements.md` | 0 |
   | `grep -c '{{' requirements.md` | 0 — exemplar-stanza placeholders use `<ANGLE_BRACKETS>`; `{{…}}` is the template's must-fill syntax |
   | `grep -c '^Confidence: [0-9]' requirements.md` | 0 |
   | `grep -c '<!-- WRITING-RULES -->' requirements.md` | 0 — the splice replaces the marker |
   | `## Writing rules` is the LAST section | requirements first, rules after Acceptance |

5. **Size gate (SPEC-SIZE, 2026-10-02).** `python3 scripts/requirements-rules.py --size-check $D/requirements.md
   $D/topology.json` must pass. It models how the Program Architect actually reads (`agentic-tool-loop.ts`): each fetched
   document arrives JSON-escaped in an 8,000-char first window, then `read_more` pages of at most 7,000. Since
   2026-10-12 (owner decision R1, `lib/agents/role-read-budget.ts`) the page caps are per role and the check uses the
   **Program Architect's**: **at most 9 pages per document** (71,000 physically readable) and 12 per run (with its
   template at 48 tool turns; 25% of turns also caps it). The **checked limit is 64,000 delivered chars per document** —
   one page under the physical read, so an estimate that undercounts by up to a page still reads to the end; a 64,000
   spec needs 8 pages, leaving 4 for the topology. *Run 14 (2026-10-01), under the old all-roles 6-page cap, needed 9
   pages for one document and stopped at exactly 50,000.* **If it fails**, write the program view
   — `python3 scripts/requirements-rules.py --program-view $D/requirements.md` (→ `requirements.program.md`: identical
   except the Writing rules section becomes a short block saying the omission is deliberate, glossing the rule numbers
   the body cites (#1, #2, #6 — the tool refuses if the body cites any other), and carrying the two properties that
   govern READING; and, since 2026-10-12 (Phase 4 group 3a), the owner section's not-applicable rows are replaced by
   one line — they are for the owner's review and no leg acts on them; ~5,000 chars on attempt 1's run 3) — and size-check THAT; the program task then fetches `requirements.program.md`. Keep the full
   `requirements.md` (the human/editor copy; it still passes `--check`). A ⚠️ under 5,000 headroom means: trim
   author-facing prose from the body first; the per-document page cap was raised once, for the Architect only, by
   owner decision (R1) — never raise a cap to fit one document. The program view is OPT-IN per run; reviewed
   (`cline_docs/reviews/spec-size-2026-10-02/`): the Architect loses nothing a brief or contract needs. **It is not
   value-chain-specific:** since promotion E deploy 2 the ONE program Architect text (both `program_architect` and the
   retired `value_chain_architect`) carries the program-view reading rule, so any `(protocol: pov-program)` run may
   fetch it. Before deploy 2 only the value-chain Architect had that rule — a pov-program run on a program view then
   could read the omitted Writing rules as a truncated fetch.
6. Commit and push `~/paichart` (this repo does not deploy prod). Section §4 below: verify whichever file(s) the program
   will fetch — `requirements.program.md` too, if used.

## 4. Verify what the Architect will fetch

```bash
B=https://raw.githubusercontent.com/paichart/paichart/main/program-artifacts/<name>
for f in requirements.md topology.json; do
  curl -s -o /tmp/raw-$f -w "$f %{http_code}\n" "$B/$f"
  cmp -s /tmp/raw-$f program-artifacts/<name>/$f && echo "  identical" || echo "  DIFFERS"
done
```

Fetch the plain URL, exactly as the Architect will. `raw.githubusercontent.com` caches for ~5 minutes: a NEW
directory has no stale copy, but a request made before the push can have its 404 cached — retry until both are 200
and identical. Launching against a cached 404 derails the program at its first step.

## 5. Set up the program task

Replicate a known-good program root (type `PIPELINE`, the Pipeline Harness template, no copied metadata — every
metadata key on a finished root is a run output) and change only:

- the two artifact URLs → the new directory;
- drop any `PRE-FLIGHT CLEARANCE` block and prior-run history when the POV has no prior program stages;
- the "range is derived at run time, keep it out of the contract" warning is NOT needed when the requirements carry
  the Static → contract / Runtime → DAG-edge split and no value is reachable anywhere (POV description, requirements,
  prior stages). It is a stopgap for FU2 (the Architect's "real VALUES" instruction has no source discrimination),
  not a permanent part of every task.

Before launch: probe the lab services, confirm nothing is running (a push mid-run orphans it), confirm the POV team
holds every declared approver.
