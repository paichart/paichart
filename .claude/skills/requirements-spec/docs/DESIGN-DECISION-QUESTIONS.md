# Design-decision questions: the registry

> **Canonical.** This is the one place the requirements generator's design-decision QUESTIONS are maintained: what
> each one asks, which answers it may take, why it exists, and how to add or change one. Every other copy is
> derived from, or checked against, this file. **`npm run test:requirements-guidance-anchors` fails if the key table
> below disagrees with the skeleton, the Author guidance or the Reviewer's check 8.1** — so a key cannot be added,
> moved or renamed in one place only.
>
> Audience: whoever changes the generator (maintainers, specialists). Answering a full owner block: [`OWNER-ANSWER-SESSION.md`](OWNER-ANSWER-SESSION.md). The POV owner's half — how to read and answer
> the owner block — lives in `PUBLISH-GENERATED-SPEC.md` §0. The public template's 🗑 authoring notes serve
> external spec authors.
>
> **Ownership (2026-10-11, register REQ-AUTHORING-SPECIALIST).** Owner of record for changes to this registry: `requirements-authoring-specialist` (split from pipeline-harness 2026-10-11, Steve "do the split"; it also owns the `requirements_author` / `requirements_reviewer` guidance CONTENT and the publish checks). `template-system-specialist` delivers a guidance change (owning seed `scripts/seed-requirements-authoring-templates.ts`, reseed, freshness); `prompt-construction-specialist` owns protocol-text mechanics (skeleton embedding, golden key, version bump); `pipeline-harness-specialist` owns how a program CONSUMES the published spec. *(2026-10-06 to 2026-10-11: owner of record template-system, pipeline-harness coordinating.)*

## What a question is, and why there is a fixed list

A generated `requirements.md` carries a *Design decisions* table. Before 2026-09-28 the table listed only what the
objective happened to declare: **99 of 100 rows across eleven generations read "declared"**, and 84% of the
undeclared decisions were made silently inside leg text, found later by a human read or a later stage (9 of the
telemetry objective's 12 decisions). So the table is now a **fixed list of questions per leg kind**. Every
applicable question gets a row, and every row is answered in exactly one of four ways. A question nobody declared
cannot vanish: it is an OPEN row, and it reaches the owner in one list.

**The generator does not make design decisions. It asks them.** It may *derive* only "which one" answers a harvest
read can select, and *force* only "report a gap" where no other answer is valid. Everything else is declared by
the owner or OPEN, with no default.

## At a glance — how the registry works (read this first)

- **What it is.** The fixed list of design questions every generated `requirements.md` must answer. The generator
  ASKS design decisions; it does not make them.
- **The four answer forms.** Every applicable question gets a row, answered in exactly one way: **declared** (the owner
  chose), **derived** (a harvest read can select it), **forced** (report a gap is the only valid answer) or **OPEN**
  (it goes to the owner, with no default). Details: § The four answer forms.
- **Row ids.** `<leg token>.<key>` (e.g. `terraform-iac.granted-action`); gates use `approver.<gate>` and
  `gate.<gate>.position`.
- **Five classes of key**, each with its own "who gets it" test:

  | class | who gets it | keys |
  |---|---|---|
  | leg | every leg | `target` |
  | producer | a leg that derives a value | `population`, `representation`, `inputs-empty` |
  | gate | every approval gate | `approver`, `position` (not for the program plan gate) |
  | auth | a leg that grants or removes access | `receiver`, `admitted-principal`, `request-path` (only when it admits by address), `principal-unseen`, `granted-action`, `existing-grant`, `target-empty`, `enforcer-absent`, `target-absent`, `collateral`, `enforcer-scope` |
  | routing | a leg that advertises a covering route or suppresses routes | `covered-routes`, `must-stay-reachable` |

- **Every key records the run that earned it** (the table's last column): a run where that decision was made
  silently and went wrong. That is the admission rule (§ Adding or changing a question).
- **Kept in step by CI.** `test:requirements-guidance-anchors` compares this table with the skeleton, the Author
  guidance and the Reviewer's check 8.1, per class, so a key cannot be added in one place only.
- **How the coverage check reads it.** `check-requirements-coverage.py` (and its in-run port,
  `lib/agents/harness/requirements-coverage.ts`) reads every row id in the draft's Design decisions table and checks it
  against the registry. A row `<token>.item-<N>` is an **item row** (§ Item rows): an owner item no key asks, keyed by
  its number. A row whose key is neither a registry key nor an item row is an **invented row**, and the check sorts it
  mechanically (B-2 / R2, 2026-10-12): **"invented key restates item N"** (declared, leading citation item N — the
  Author re-keys it `<token>.item-<N>`) or **"invented key asks a decision no key or item asks"** (anything else — the
  owner answers it as a new item, and it is a registry candidate under the admission rule). *(Until 2026-10-12 both
  read "unknown key for a known token".)*
- **Registry-caused vs Author-caused.** Two coverage findings are caused by the registry, not by the Author: an
  invented row that asks a decision no key or item asks, and the class inferred from a producer leg's `target-absent`
  row (Z17). The in-run form check (`isRegistryCausedCoverageFinding`, `requirements-form-check.ts`) keeps them on the
  fact (`coverage.errorsTotal`) but leaves them out of the correction TRIGGER (`coverage.authorActionableTotal`),
  because "fixing" them would mean deleting an owner question or adding rows the owner ruled out. A restatement of item
  N is Author-actionable since B-2: re-keying it keeps every citation, so the correction can be adopted. Adoption rule
  v2 still guards every finding: a correction may not RAISE `coverageErrorsTotal`. A publishing release check counting
  `errorsTotal = 0` (suggested in `cline_docs/reviews/requirements-author-retrospective-2026-10-09/PORT-NOTE.md` §5,
  not built) would block on the two registry-caused kinds until the owner answers or the registry gap closes.

## The registry

Row ids are `<protocol token>.<key>`. Leg tokens are exactly `network-provisioning`, `kubernetes-gitops`,
`terraform-iac`, `observability-config` (never the leg names a draft invents: Revs 15–21 used five names for the
same observability leg). Gates use `approver.<gate>` and `gate.<gate>.position`.

<!-- REGISTRY-TABLE — parsed by scripts/test-requirements-guidance-anchors.ts. One row per key; the `class` cell is
     one of: leg · producer · gate · auth · routing. Keep the id in backticks in the first cell. -->
| id | class | question | options | may be | earned by |
|---|---|---|---|---|---|
| `<token>.target` | leg | which surface of the leg's service does it act on | — (a named target) | declared · derived · OPEN | pre-Phase-1 (GS-R5); Rev 10–14: an unnamed bucket is right only while it is the only one |
| `<producer>.population` | producer | which members of the class the derivation reads | — (a rule) | declared · derived · OPEN | Rev 5 (2026-09-25) took *every* address; Decision 4 |
| `<producer>.representation` | producer | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | declared · derived · OPEN | "exactly … nothing wider" had two defensible readings; Decision 5 |
| `<producer>.inputs-empty` | producer | the derivation's inputs are empty (the producer reports a gap and publishes nothing; every consumer of the value then makes no change and reports the upstream gap) | gap | declared · **forced** · OPEN | template null case; Lane 2 inventory (no revision handled it consistently) |
| `approver.<gate>` | gate | who approves this gate | — (name, email) | declared · OPEN | 2026-09-24: two generations over one roster assigned 4 of 5 gates to different people |
| `gate.<gate>.position` | gate | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | declared · OPEN | human read of Rev 22 (Decision 12) |
| `<token>.receiver` | auth | which workload/resource on the target is authorised | — (selector or named resource) | declared · derived · OPEN | defaulted to namespace-wide as an open question (Decision 3) |
| `<token>.admitted-principal` | auth | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination | declared · OPEN — **premise branch required** | Program Run 5 (2026-09-28): no row asked who the S3 grant was to; `Principal "*"` + a source-address condition S3 never sees |
| `<token>.request-path` | auth | the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked only when `admitted-principal` admits by address) | direct · private-endpoint · translated | declared · OPEN — never derived, never forced; `translated` ⇒ a sender-address list cannot be enforced there (gap) | Z49 (2026-10-09, log-archive answered run 2, published; program runs 2 and 3 released): `source-address-range` with "no network path" was transcribed as a stanza on the public-path attribute that FORBADE the endpoint-path attribute, so on the real enforcer the Allow matches no sender and the Deny refuses everyone. The rig does not evaluate the keys and the Reviewer had no check that asks. `network-path` in `admitted-principal` means admitted BY a path; it does not answer this |
| `<token>.principal-unseen` | auth | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | declared · OPEN — never forced. `act-regardless` = not confirmed AND not contradicted: harvest evidence that the attribute arrives by another path stops the leg (no change, a report). `gap` is permanent where the harvest has no read that can observe the premise (D1, § What each answer leads to) | the premise branch was missed or left uncited in 4 runs (Rev 24 → answered regen 2): it had no slot and no outcome row. Design sketched by prompt-construction (unruled), adopted by the coordinator; convergence panel 2026-09-30. D2 (2026-10-11): the option did not say what a contradicting harvest does; Phase 4 attempt 1 was safe only because the leg read the answer narrowly |
| `<token>.granted-action` | auth | what the admitted principal may do (actions, ports) | — (the grant) | declared · OPEN | Rev 10 surfaced "which S3 actions" after every earlier revision decided it silently (Decision 6) |
| `<token>.existing-grant` | auth | other allowances already on the same surface | replace · preserve · preserve-bounded | declared · OPEN | hidden for 13 revisions by the word "modify" (Decision 9) |
| `<token>.target-empty` | auth | the receiver selector/surface matches nothing now | act · gap | declared · OPEN | Authors split 3:7 on identical objectives (Decision 8) |
| `<token>.enforcer-absent` | auth | no policy object governs the receiver yet | create · gap | declared (once, as a numbered item for all legs) · OPEN | D-2: forcing "create" was rejected; one numbered objective line (Decision 13) |
| `<token>.target-absent` | auth | the declared target itself does not exist | gap · create-target | declared · **forced** · OPEN | Lane 2 inventory |
| `<token>.collateral` | auth | what else on the target changes because enforcement now applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests; a proxy or listener allowlist: confined-to-block · whole-listener · gap) | declared · OPEN — Kubernetes feasibility check | Program Run 4: the domain Author found "other ports not touched" cannot hold (Decision 11). Z57 (2026-10-11): a proxy enforcer had no option set; the owner answered free-form |
| `<token>.enforcer-scope` | auth | which parts of the enforcer the restriction covers | all-reaching-the-protected-thing · exemption-by-property · gap | declared · OPEN — never derived, never forced; never deleted on an authorisation leg (how many parts exist is harvested state); `exemption-by-property` names a PROPERTY the leg's harvest can check, never the parts, and the leg reports the literal value it matched | Z60 (2026-10-11, Phase 4 attempt 1, answered run 1): the answered harvest found a second block forwarding to the same receiver; no row asked which blocks the restriction covers, the Author invented `sender-blocks` and the Reviewer blocked on it; the owner answered it as a new item. Owner decision 2026-10-11 (Group 4a): no owner-named option, because naming the parts puts harvested names in the spec |
| `<token>.covered-routes` | routing | when the leg adds a covering route, whether the routes it covers stop being advertised | replace · accompany | declared · OPEN — never derived, never forced; asked only when the cover is advertised | program control 2 (2026-10-05): a fabric leg advertised a cover in place of the routes it covered on both devices of a pair, so cross-device reachability to the covered hosts may be lost (inferred, not applied). The choice was never asked: 9 of 10 telemetry-export `topology.json` `existenceAssumption`s say "advertise the covering range in place of the individual routes" (hand-written; the generator never reads them), and the hand-written four-domain spec says "in place of the individual host routes". No generated spec chose it |
| `<token>.must-stay-reachable` | routing | which destinations must stay reachable after the change, and from where | — (a list or rule) | declared · OPEN — never derived, never forced | program control 2 (2026-10-05): the package proved the covered routes were gone and never established which destinations had to stay reachable, or from where — nobody asked. Consumer reference (not evidence): network-provisioning 1.19.0 Author (b2) |

**Which legs get which rows.** Every leg: `target`. A producing leg: `population`, `representation`, `inputs-empty`.
Every gate: `approver`; every gate except the program plan gate: `position` (the platform fixes the plan gate's
position). An **authorisation leg** — one that consumes a chained value into a source, allow, admit, policy or
selector field, or whose work adds, removes, allows, denies or restricts a sender or principal — carries the whole
`auth` block. A **routing leg** — one whose work or deliverable adds a covering route, or suppresses, filters, withdraws or replaces routes
or their advertisement, whatever its token — carries the `routing` block. Filtering TRAFFIC (a network policy, security
group, firewall or bucket policy) is authorisation, not routing. A *covering route* is an ADVERTISED route that can stand
in for the more specific routes it covers (a summary or aggregate); a static or default route, which advertises nothing in
their place, is not one. An authorisation row is deleted only when the leg neither grants nor removes access on its target (and `request-path` also when `admitted-principal` admits no address);
on a routing leg, `covered-routes` only when the leg adds no advertised covering route, and `must-stay-reachable` never. A
deleted row is still listed to the owner as `not-applicable — <why the row does not apply>` (an authorisation row: why the
leg neither grants nor removes access; `covered-routes`: the leg adds no advertised covering route). `enforcer-scope` is
never deleted on an authorisation leg (owner decision Q1, 2026-10-12): how many parts the enforcer has is harvested
state, and the zero-decision harvest that needed the row could not see the second part (Z60).

**The consumer side of an empty upstream set** (D3, owner decision 2026-10-11): a leg that consumes a chained value
which arrives empty makes no change to its target and reports the upstream gap, citing the producer's `inputs-empty` —
never an empty-set write: on a restrict, "exactly the members" of none admits no one. It is a rule, not a question: no
option admits an empty-set write. Reviewer check 8.4 counts the branch (owner decision Q3, 2026-10-12).

**Why `routing` is its own class, keyed on the work and token-generic (Steve, 2026-10-06, register REGISTRY-ROUTING-ROWS).**
The two questions follow the WORK, not the domain: any leg that advertises a covering route or suppresses or filters routes
raises them, and the authorisation block is already token-generic for the same reason. A token-keyed (network-only) rule
would be the first token check deciding applicability in requirements guidance, and would tie a requirements question to
one protocol, which the layering rule forbids. The cost is bounded BY PROPERTY rather than by token: the trigger is an
advertised cover or route suppression/filtering, not bare adds/removes, so connected routes and static or default route
entries do not make a leg a routing leg. Off-network, `covered-routes` may be degenerate (a route table with no
advertisement suppression always answers `accompany`); an extra OPEN row is loud and cheap where a missed question is
silent. The miss that earned both rows is a network leg, and **no non-network protocol consumes a declared answer** (no
(b2) analogue), so off-network the rows only ask. **Revisit trigger: hand-read the first non-network leg that carries a
routing block** (history below). It is not folded into `auth` because the deletion rules differ and either block can apply
without the other (a leg can be both). A value-only leg (it derives a value and changes nothing) is not a routing leg.

**Why a rule-defined `population` must also require the leg to REPORT the literal criterion it applied.** When the owner
declares membership by a RULE ("interfaces whose description marks them as telemetry exporters") rather than a list, the
leg has to interpret that rule against live state — e.g. it matches the description text
`telemetry-exporter (existing allocation)`. That literal IS the leg's interpretation, and it is the only thing that lets a
reviewer, Node C or the owner check that the RIGHT members were selected; without it they can only check that the
arithmetic over the selected members is right (a /27 can be computed correctly over the wrong interfaces). So a declared
rule-population item should end with a clause like *"the leg reports, in its own published deliverable (report.md), the
literal criterion it applied"* — earned by Program Run 4, whose fabric reviewer blocked on exactly this omission
(`cline_docs/follow-ups/telemetry-export-objective-next.md`, Decision 4 amendment). ⚠️ Word it as **applied / discovered**,
never "the declared marker": the rule is declared, the literal is discovered. The owner does NOT declare the literal
(Steve, 2026-09-30, register GEN-MARKER option a) — declaring it would break when the fabric's descriptions change. Run 6 (2026-09-30): the harvester reported the literal but the leg's report.md
omitted it — the clause has to reach the Author's package, not only the harvest.

## The four answer forms, and why each key allows the ones it does

| form | written as | allowed on |
|---|---|---|
| declared | `(declared — item N: "<the words of item N that select the answer>")` | any row; on a row with options, the quoted words must choose one option |
| derived | `(derived — basis: <which harvest read> shows <the selecting property>)` | `target`, `population`, `representation`, `receiver` only — a pointer and a property, never a harvested value, name or count |
| forced | `(forced — <the declared item that rules out the alternative>) → gap` | `target-absent` and `inputs-empty` only; the answer is always `gap` |
| OPEN | `OPEN — <the question>; options: <the row's options>` | any row; **no default** |

The split follows `.claude/knowledge/domain/harness/ARCHITECTURE.md` Invariant 6: agents are reliable at
**recomputation** (counting, matching a quote) and unreliable at **judgement** about what they cannot see.

- **"Which one" questions may be derived.** A harvest read can select *which* namespace or members; the Reviewer can
  then check that the basis names a selecting property. **`must-stay-reachable` is a "which" question that is never
  derived** (Steve, 2026-10-06): which destinations matter is the owner's call, and a harvest cannot see every destination
  the owner needs reached, so a derived answer would be the platform deciding what matters (Protocol 10). It is declared
  (one numbered item can answer it for every routing leg) or OPEN.
- **"How it behaves" questions are never derived or forced** (`admitted-principal`, `principal-unseen`, `granted-action`,
  `existing-grant`, `target-empty`, `collateral`, `enforcer-scope`, `covered-routes`): no harvest selects a behaviour.
  Which parts of the enforcer are in scope is a scope decision, and an exemption WIDENS what stays open, so
  `enforcer-scope` is never derived. Whether a covering
  route replaces or accompanies the routes it covers is a behaviour; wording that says "in place of" outside a numbered
  item (an existence assumption, a topology note) is not an answer. A decision that WIDENS what is
  authorised or selected is never derived either, whatever its key.
- **Forcing is a closed list named in the Reviewer's own guidance**, never read from a label in the draft (which its
  Author wrote), and its answer is pinned to `gap`, so the worst wrongly-forced row is a gap report.
- **Declared answers quote their selecting words**, which turns the Reviewer's check into a number compare plus a
  substring match (adversarial read S-2). The match is against the **objective of record** — the pipeline task's own
  description, which the Reviewer fetches by the id its brief names — never the brief's copy (Rev 23: a reworded brief
  made 11 verbatim citations read as misquotes). A quote is ONE contiguous span; dash variants, backticks, the case of its first letter and one trailing
  sentence-ending mark are the only normalisation. Ellipsis joins are NOT allowed: verbatim fragments joined by one can
  select a different option than the item states (12 of 13 rows attackable — convergence panel, 2026-09-30). The Reviewer
  writes both the option the whole item selects and the option the quote selects, and they must match; the Reviewer
  also writes down the option each quote selects, and counts citations to item numbers the objective does not have.

**Premise and feasibility checks.** `admitted-principal` rests on a premise — that the enforcer SEES the admitted
attribute on the sender's path — written in each authorisation leg's *Admitted-principal premise* slot as a branch the
leg's own harvest decides: it cites `admitted-principal` and applies `principal-unseen` (`gap` or `act-regardless`).
Where the objective declares the program does not verify the attribute's carrier, the branch still exists and records
the premise as UNTESTED. Counted by Reviewer check 8.4. `collateral` on a Kubernetes NetworkPolicy leg is checked for feasibility (check
8.7): a pod selected by any Ingress policy is isolated for all ingress no policy allows, so "other ports not
touched" is INFEASIBLE. That enforcer fact is stated for Kubernetes only; no other enforcer's behaviour is asserted.

## Item rows — an owner item no question asks (B-2, 2026-10-12)

A numbered owner item can state a choice for a leg that no registry key asks (e.g. "the cluster leg reads and publishes,
and writes nothing to the cluster"). It gets ONE row on that leg, keyed by the item's NUMBER: `<token>.item-<N>` (a
letter suffix when one item yields two decisions for one leg), options `—`, source `(declared — item N: "<one exact span
of item N>")` with the same N — never derived, forced or OPEN, never in the owner block. It is owed only where no row of
that leg already cites item N; a registry row citing item N carries the whole item into its leg's clauses (owner
decision Q4, 2026-10-12; an item row that overlaps anyway is a coverage READ, not an ERROR — deleting it would remove a
citation, which the correction's no-fall guard refuses). It asks nothing, so it is a row SHAPE, not a class: it sits
outside the REGISTRY-TABLE and outside every class parser, and the skeleton carries no exemplar row (a live placeholder
row would be residue whenever no item row is owed).
Why keyed by number: an Author-chosen name drifted every generation (Z62: currency → maintenance → freshness), so owner
pointers and waivers keyed on it never matched the next draft; an item number is the owner's own key.

A row on a leg token whose key is neither a registry key nor `item-<N>` is an INVENTED row, sorted mechanically (R2):
- **restates item N** — declared, its leading citation is item N: it is an item row under another name. Nothing for the
  owner to do; the Author re-keys it (the in-run correction can, without losing a citation).
- **asks a decision no key or item asks** — anything else (in practice OPEN): it goes to the owner, who answers it as a
  new numbered item, and it is a registry candidate under the admission rule (file it). An OPEN row that merely MENTIONS
  an item in its question is still this kind (Z60's row mentioned item 3).

The owner session maps a new-decision row answered as item M as `<token>.item-<M>` in the ROW-ITEM-MAP — the id the next
generation carries; for the merge, the zero draft's row id stays the question key (OWNER-ANSWER-SESSION §5/§7).
Measured on the 18 stored drafts at build (2026-10-12): 36 invented rows → 30 restate an item, 6 ask a new decision; 19
of the 30 cite an item a registry row of the same leg already cites, so they need no item row.

## The owner block

Generated from the finished table: one line per row that is not declared, in exactly this form (the template's own
format, pinned by test):

`<row id> — <question> — options: <enum> — governs: <which leg clause> — tier: blocking | confirm | default | not-applicable`

| tier | row | the owner's action |
|---|---|---|
| blocking | OPEN | answer it (a numbered objective item), then regenerate |
| confirm | derived | check the harvest was read the way you intended |
| default | forced | nothing, unless you disagree that only a gap is valid |
| not-applicable | deleted | check the reason; a reason that states today's state ("none exist") is a defect |

The Reviewer compares the block to the table as SETS of row ids (check 8.6), and the harness copies it into its
final comment (protocol 1.7.0).

## What each answer leads to (owner-facing; U12, 2026-10-12)

Facts, not advice: what the program does with each option. The requirements-spec skill builds its combined outcome
tables from these lines (SKILL step 6); its recommendation is always a separate column. Kept OUT of the parsed
REGISTRY-TABLE on purpose (one block per key with enumerated options).

- `<producer>.representation` — interacts with: the consumer's `granted-action`
  - one aligned prefix → one entry; it may admit addresses that are not members when the members are not aligned
  - a set of prefixes → the exact members, in as few aligned prefixes as cover them and nothing else
  - a host list → one entry per member; it changes whenever any member changes
- `<producer>.inputs-empty` — interacts with: every consumer of the value
  - gap → the producer publishes nothing and reports; every consumer makes no change and reports the upstream gap
- `gate.<gate>.position`
  - before-leg → the leg does not start until the gate is released
  - after-leg-before-completion → the leg runs; its result is held until the gate is released
  - after-producer-before-consumers → the value reaches its consumers only after release
- `<token>.admitted-principal` — interacts with: `request-path`, `principal-unseen`
  - source-address-range → admitted by the senders' addresses; `request-path` is then asked
  - named-identity → admitted by an identity the enforcer recognises; `request-path` is not asked
  - network-path → admitted by the path the requests take, not by a sender list
  - combination → each part stated; `request-path` is asked if any part is an address
- `<token>.request-path` — interacts with: `admitted-principal`, `principal-unseen`
  - direct → the enforcer sees each sender's own address; the policy conditions on it
  - private-endpoint → the address arrives in that path's own attribute; the policy conditions on it and never forbids it
  - translated → the enforcer sees the intermediary, not the sender; a sender-address list cannot be enforced: gap
- `<token>.principal-unseen` — interacts with: `request-path`, `admitted-principal`
  - gap → when the leg's harvest cannot confirm the enforcer sees the attribute, no change and a report. If nothing the
    leg reads can show it (an arrival address is not in configuration), this stops EVERY run
  - act-regardless → the leg acts when the premise is not confirmed and not contradicted; contradicting evidence stops
    it; the package lists the premise as UNTESTED
- `<token>.existing-grant` — interacts with: `enforcer-absent`, `enforcer-scope`
  - replace → only the declared grant remains on the surface; other users it allowed lose access
  - preserve → the declared grant is added beside the others; "nothing wider" holds for what this leg adds only
  - preserve-bounded → the others stay within the stated bound; any outside it is reported
- `<token>.target-empty`
  - act → the change is written although nothing matches now; it applies when matches appear
  - gap → no change and a report
- `<token>.enforcer-absent` — interacts with: `existing-grant`
  - create → the leg creates the policy object
  - gap → no change and a report
- `<token>.target-absent`
  - gap → no change and a report naming what is absent
  - create-target → the leg creates the declared target (outside "restrict"; rarely right)
- `<token>.enforcer-scope` — interacts with: `collateral`, `existing-grant`
  - all-reaching-the-protected-thing → every part that reaches the receiver is restricted, including any operator or
    maintenance path that reaches it
  - exemption-by-property → parts carrying your stated property stay open and are listed as your exemption; the leg
    reports the literal value it matched; if its harvest cannot tell the parts apart by it, gap
  - gap → no change and a report
- `<token>.collateral` — interacts with: `enforcer-scope`
  - Kubernetes: allow-named-ports → the other named ports on the selected pods are allowed explicitly · deny → all
    other ingress to them is refused · leave-to-workload-manifests → this leg does not decide; other policies do (a
    pod selected by any ingress policy is isolated, so "untouched" cannot hold)
  - proxy or listener allowlist: confined-to-block → other blocks, paths and ports it serves keep their behaviour ·
    whole-listener → they are restricted too · gap → no change; a report of what else would change
- `<token>.covered-routes` — interacts with: `must-stay-reachable`
  - replace → the covered routes stop being advertised; anything reachable only through them may be lost
  - accompany → both are advertised; nothing is withdrawn

## Where the questions live

| # | surface | what it holds | how it reaches the agent |
|---|---|---|---|
| 1 | `~/paichart/program-artifacts/_TEMPLATE/requirements.template.md` § Design decisions (public repo) | the question tables + 🗑 authoring notes | source of the skeleton |
| 2 | `scripts/seed-data/requirements-skeleton.tmpl` | the tables with 🗑 notes stripped — what the Author fills | `python3 ~/paichart/scripts/requirements-rules.py --skeleton`; `test:requirements-skeleton-parity` fails if it differs from a fresh emit |
| 3 | `requirements-authoring-protocol` (`scripts/seed-protocol-prompts.ts`) | the skeleton, verbatim | seeded on every deploy |
| 4 | `requirements_author` in `ROLE_GUIDANCE_LIBRARY` (`lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts`) | which rows each leg gets, the four forms, the never-derived list, the premise rule, the enforcer fact, the owner-block format | manual reseed: `scripts/seed-requirements-authoring-templates.ts` |
| 5 | `requirements_reviewer` check 8 (same file) | the eight counts, starting from the legs | same reseed |
| 6 | this file | the registry, provenance, procedure | read by maintainers |
| 7 | `PUBLISH-GENERATED-SPEC.md` §0 | owner-facing: what to declare, with examples | read by the human publishing a spec |

The key parity check compares surfaces 2, 4, 5 and 6 per class. `test:requirements-skeleton-parity` pins the keys
as template rows; `test:requirements-guidance-anchors` pins each rule sentence.

## Where a detail belongs

The requirements guidance is shared by EVERY generation, for any objective — so it carries properties and question
shapes, never one objective's details. The general method is `.claude/knowledge/domain/harness/defect-layer-routing.md`
(six layers; "name the PROPERTY, never our environment", enforced by `npm run test:no-rig-identifiers`). Applied to the
requirements generator:

| kind of detail | where it goes |
|---|---|
| This objective's choices — namespace, ports, bucket, principal, approvers, gate positions | the objective's **numbered DESIGN DECISIONS items** (for this pipeline, that is the routing table's "requirements document" layer) — produced by an owner-answer session (`OWNER-ANSWER-SESSION.md`) |
| How a domain's leg does its work — policy syntax, manifest shape, harvest reads | the **domain protocols** (network-provisioning, kubernetes-gitops, terraform-iac, observability-config), read by the legs at run time — never the requirements Author |
| An enforcer fact that changes WHICH QUESTION must be asked | the Author/Reviewer guidance, **stated for that enforcer only**, asserting nothing about others. One instance today: Kubernetes NetworkPolicy isolates a selected pod for all ingress no policy allows (the `collateral` row, Reviewer 8.7) |
| Everything else in the guidance | properties and question shapes that hold for any objective |

**"Earned" notes** may name the run or revision that taught a lesson (evidence), never its values — no addresses,
namespaces, ports or identifiers from that run. A generic example list ("a device, a namespace, a bucket, a port") is
fine; a value from our estate is not.

**A different architecture needs a new owner-answer session, not new questions.** The questions are
architecture-independent (every authorisation leg has a principal, a premise and side effects); the ANSWERS are bound
to one estate. The telemetry-export items 9, 15 and 16 were answered for a Kubernetes NetworkPolicy, an nginx allowlist
and S3 through a VPC endpoint. Behind NAT or a load balancer, `principal-unseen` → `gap` fires at run time and the leg
refuses (fails closed — correct); S3 without the declared endpoint gets a policy that grants nothing, flagged UNTESTED;
a non-deny-by-default enforcer can make a declared side effect simply wrong. Re-run the zero-decision generation for the
new estate and answer its questions there (`OWNER-ANSWER-SESSION.md`). Two known limits:
- **Enforcer semantics are known for Kubernetes only.** For any other enforcer the owner must know its side effects; a
  wrong `collateral` answer is not caught at generation time, only by the leg's reviewer or the owner's gate. Add another
  enforcer's fact the way Kubernetes' was added — only when a run shows the miss.
- **A premise can be confirmed only if the harvest can see the path.** A descriptor with no read of NAT / load-balancer /
  proxy settings makes `principal-unseen` fire `gap` every time — fail-closed, but blocking. The fix belongs in the
  service descriptor (give the harvester the read — defect-layer routing layer 1), never in the guidance prose.

Checked 2026-09-30: the `requirements_author` / `requirements_reviewer` guidance carries 0 objective-specific terms
(`trading`, 4317/4318, `app_logs`, the receiver label, IAM/VPC-endpoint values, `10.99`); its only domain terms are the
Kubernetes enforcer fact and the generic example list.

## Adding or changing a question

**Admission rule.** A new question needs a **measured miss**: a run in which a decision it would have asked was
made silently, contradicted, or found by a human or a later stage. Every current row has one (the table's last
column). A question added on speculation grows the owner's burden with nothing behind it. Record the miss in the
open register before building.

**One source of measured misses: the reviewer-warning watch** (requirements-authoring-specialist since 2026-10-11, register
`WARNING-QUESTION-WATCH`, 2026-10-08). It reads leg reviewers' labelled warnings AND their unlabelled non-blocking notes
for a DECISION a leg had to make that no row asked, and files a candidate with evidence. It proposes; the owner of record
(requirements-authoring-specialist) builds a row only after Steve decides, through the checklist below.

**Before designing, check whether an existing row already asks it** under another reading. Run 5's principal
question was not a new behaviour row; it was *who* is admitted, which no row asked.

**Checklist (one commit, every step):**
1. **Template** (`~/paichart`): add the row to the right block, with a closed options enum where the answer space is
   closed; add the key to any never-derived / forced sentence in the 🗑 notes.
2. **Skeleton:** `python3 ~/paichart/scripts/requirements-rules.py --skeleton > scripts/seed-data/requirements-skeleton.tmpl`.
3. **Author guidance:** the block list, the never-derived list if it is a behaviour row, and any premise rule. Rules
   in a 🗑 note are stripped from the skeleton, so the Author only has them here.
4. **Reviewer check 8.1** (and 8.2 / 8.3 / 8.4 if the key's allowed forms or branches differ).
5. **This registry:** the row, with its "earned by".
6. **Tests:** `DECISION_KEYS` in `test-requirements-skeleton-parity.ts`; an anchor per new rule sentence in
   `test-requirements-guidance-anchors.ts`; the placeholder floor if the skeleton shrank.
7. **Owner mirror:** a row in `PUBLISH-GENERATED-SPEC.md` §0.
8. **Plan the proof:** write the prediction for the next generation before running it — which row, which answer,
   and what refutes it.
9. **Deliver:** push (deploy seeds the protocol), then reseed with `scripts/seed-requirements-authoring-templates.ts`
   on prod and confirm `npm run report:template-freshness` shows 0 STALE. Commit the public template separately.

**Worked example: `<token>.request-path` (Z49, 2026-10-10), the first key carried from a measured miss to a
republished spec.** Record: `cline_docs/reviews/z49-request-path-2026-10-10/` (DESIGN, PLAN, LAB-PREREG, LAB-RESULT,
VT-34-DRAFT).

1. **The measured miss.**
   - **What happened:** the published spec `paichart@ff89bef` drove two releasable programs. Its cloud leg's
     address-based policy conditioned on `aws:SourceIp` and *forbade* `aws:VpcSourceIp`.
   - **Why it fails on AWS:** a pod's private address reaches S3 only through a VPC endpoint, in `aws:VpcSourceIp`. So
     the Allow never matches a pod, and the Deny refuses every reader.
   - **Why nobody caught it:** the Reviewer approved, and the test rig does not evaluate those keys.
2. **The existing-row check came first.**
   - `admitted-principal` asks WHO is admitted and by which attribute. `principal-unseen` asks what to do if the
     harvest cannot confirm the enforcer sees it.
   - Neither row asks *how the requests get there*. The vocabulary also collided: `network-path` means "admit BY a
     path", and the owner's "no network path is admitted" was read as "ban every path key".
3. **Options and decision.**
   - **K:** a new key. **F:** an object-store fact in the guidance. **K+F:** both.
   - **K was chosen** (Steve, "1-4 rec").
   - **F was rejected:** it fixes one enforcer, it adds cloud key names to domain-free guidance, and it has no
     measured miss of its own.
4. **Checklist steps 1–7 in one commit** (`0bcbfd7f`):
   - the template row with closed options (`direct · private-endpoint · translated`), asked only when
     `admitted-principal` admits by address; declared or OPEN, never derived or forced;
   - the skeleton;
   - one enforcer-generic Author sentence: the exemplar conditions on the attribute the declared path carries, and
     never forbids it;
   - Reviewer 8.1 plus a blocking premise line;
   - this registry;
   - coverage in Python and the TS port;
   - the pins and the owner mirrors.

   Protocol 1.8.0 → 1.9.0.
5. **Step 8: the proof was planned before any spend.**
   - **Pre-registered lab** (Protocol 16, `b3eae454` / `3f41ad6d`), with three gates:
     - G-STANZA (do not ship);
     - G-ROW (revise);
     - G-NOWORSE (revise).
   - **Result** ($26.59, `037d2c60`): G-STANZA 3/3 against 0/3 for the base arm, which named no key at all. G-ROW
     passed.
   - **The G-NOWORSE miss** was a fault in the measure, not the text: all 12 flagged "dropped clauses" were checker
     false positives. The owner chose to fix the measure (Z48, `da6c4942`, Python and TS in parity) and re-score the
     stored samples at $0. All gates then passed. **No text change can move a checker false positive. Fix the
     measure and pin it, never the rule.**
6. **Step 9: deliver.**
   - Release `20261010_065211`; protocol seeded 06:56:01Z; reseed 06:57:56Z, 0 STALE.
   - CLAUDE.md series cut.
   - The public template waits for a full public export. Pushed alone, it breaks the public repo's skeleton parity
     CI.
7. **Live** (Phase D):
   - **Zero-decision run:** asked `terraform-iac.request-path` OPEN, at tier blocking, with the registry's options.
   - **Owner answer:** item 21, `private-endpoint`.
   - **Merge:** the earlier zero draft never asked the new row, so it was merged as `(added …)` against one draft
     (OWNER-ANSWER §7).
   - **Answered run 3:** the stanza conditions Allow and Deny on `aws:VpcSourceIp` and forbids `aws:SourceIp` /
     `aws:SourceVpce` / `aws:SourceVpc`.
   - **Published** as `paichart@eeb840d` `k8s-tf-log-archive-read-genspec-v2/`, under the owner's waiver.
8. **What it cost the size budget.** One more row plus one owner item pushed answered run 2 to 50,099 of 50,000
   delivered characters, so it was regenerated. The published draft has 2,525 characters of headroom. Run step 12
   (`--size-check`) for every new row: each adds characters per leg against the Program Architect's read.
9. **Still unproven.** The spec now says the right thing. Whether the policy behaves on AWS's own evaluator is
   register `Z49-ENFORCING-RIG` (Phase E). A release on today's rig is not that proof.

**Adding a class** (a new block of rows with its own applicability test, as `routing` was on 2026-10-06) does
everything in the checklist above for each of its keys, plus these, in the same change. Steps 0 and 1 come first.
0. **Register first.** Record the measured miss in the open register BEFORE building (the admission rule). A new class
   is a `requirements-authoring-specialist` change (minted 2026-10-11, register REQ-AUTHORING-SPECIALIST; this file's
   *Ownership* note).
1. **Name the run-time consumer.** For each new key, name the leg-tier text that applies the answer at run time (a domain
   protocol clause, a contract field, a Node C check) and whether that protocol recognises a declared answer. Where none
   does, record it as a known limit in *Open items* — the rows then only ask. (`routing` shipped with two such limits;
   see its history entry.)
2. **Applicability test:** one quotable sentence keyed on the leg's WORK or deliverable, never its token, with the same
   wording in the Author's block list, Reviewer check 8.1 (both the key-list segment and the classifying phrase the Reviewer
   quotes), this file's *Which legs get which rows*, and the template 🗑 note. Say in one clause what the test is NOT (for
   `routing`: filtering traffic is authorisation). Keep any example list identical across those four copies.
3. **Deletion rule and owner-block reason**, in four places: the Author's deletion sentence, Reviewer 8.1, this file's
   applicability paragraph, and the template's 🗑 deletion sentence. Give each deletable key its own `not-applicable`
   reason shape in the Author's owner-block sentence (the generic reason is authorisation-scoped: "neither grants nor
   removes access").
4. **Template:** a new `### A leg that …` heading with its own table and 🗑 note. The heading is how the skeleton parser
   assigns the class, so choose a phrase no other heading carries; raise the heading count in
   `test-requirements-skeleton-parity.ts` and add the keys to its `DECISION_KEYS`.
5. **Author guidance:** a new `;`-separated segment in the block list (between `you answer EVERY row.` and `(*Measured`)
   carrying a phrase only that segment has (`ROUTING leg`), because `classify()` reads segments, not sentences.
6. **Reviewer 8.1:** a new segment beginning `Every <CLASS> leg` before `A key with no row`, and must not match `Every leg`
   (the leg class's own test). Add the class's citation rule to 8.4 if its rows are applied by a leg clause — stating WHAT
   the row requires, never HOW a leg validates it (the Program Architect may not prescribe validation).
7. **Answer forms — every key in exactly one list.** A never-derived key goes in the never-derived list in three places:
   the Author's list, the template 🗑 note and this file's *How it behaves* bullet (plus PUBLISH §0's prose list). A
   derivable key goes in FIVE places: the Author's derived list, Reviewer 8.2's derived-key list, this file's *four answer
   forms* table, the template's derived 🗑 bullet and PUBLISH §0's derived list. Anchor the list phrases.
8. **This file:** the class name in the REGISTRY-TABLE comment, the rows, the applicability paragraph and why.
9. **Test (`test-requirements-guidance-anchors.ts`):** the class in `CLASSES`; a `classify()` rule on the guidance phrase;
   the skeleton heading test in `keysFromSkeleton`; the class name in the registry row regex. A class missing from any copy
   fails as "NO keys for class"; a key under the wrong class fails as a parity mismatch — mutation-test both.
10. **Owner mirrors:** a grouping row in `OWNER-ANSWER-SESSION.md` step 4; the rows and the derived / never-derived lists in
    `PUBLISH-GENERATED-SPEC.md` §0; the inventory read ("count them against the template") in §3.
11. **Scripts — check, usually unchanged:** `scripts/build-answered-objective.py` (`FORCED_ELIGIBLE` — changes only if a
    key becomes forced-eligible), `scripts/check-requirements-citations.py` (its auth-only premise check), and the
    `requirements-rules.py` lint allowlist (template-derived). Record that each was checked.
12. **Size:** run `python3 ~/paichart/scripts/requirements-rules.py --size-check` on a representative spec — rows grow per leg
    against the Program Architect's read ceiling.
13. **Protocol and mirrors:** the skeleton is embedded in `requirements-authoring-protocol`, so the protocol version moves
    and its golden key moves with it (`test:protocol-golden --update` only with the bump). The public mirror
    (`~/paichart/protocols/requirements-authoring-protocol.md`) and the `export-public.py` projections of the guidance file
    and tests are re-rendered at the next public sitting; `test:protocol-public-parity` (out of CI) reads red until then.
14. **Pairing:** add a versions note to `.claude/knowledge/discoveries/prompt-construction-discovery.md` (the protocol and
    skeleton owner's discovery), per the specialist↔discovery pairing rule.

**Changing or deleting a question** follows the same steps. Deleting one reopens the miss it was earned by, so name
what now asks that question instead. **Changing a key's allowed forms** (e.g. making a behaviour row derivable)
is a change to the recomputation/judgement split above and needs a review, not a drive-by.

## Open items and history

- **Owner items with no registry key (R1; skill register Z45 / Z47) — CLOSED 2026-10-12 by B-2 (register
  REGISTRY-B2-ITEM-ROWS; design `cline_docs/reviews/group4-registry-batch-2026-10-12/DESIGN.md` §2).** Built as § Item
  rows: `<token>.item-<N>`, owed per (leg, item), and the R2 split of invented rows into *restates item N* /
  *asks a decision no key or item asks*; the `unknown key` arm of `isRegistryCausedCoverageFinding` was removed in the
  same change. History: decided 2026-10-10 (Steve, "B-2 now; option 1 only on evidence"); build inventory
  `cline_docs/follow-ups/registry-b2-item-rows-2026-10-10.md`. Worked example: item 13 of the log-archive objective (the
  cluster leg reads and publishes and writes nothing) got an Author-invented name in every generation (`carrier`,
  `writes`), plus `policy-managers-multiple` and `tags` on the cloud leg — all waived as W1 until this change. **Option 1
  stays filed on its trigger:** a producer key `<producer>.writes` (read-and-publish · writes-<what>) is built only on a
  MEASURED MISS (a run where a leg's write behaviour was decided silently or wrongly); the invented rows show the question
  is salient, not that it was missed. Option 3 (forbid rows for un-keyed clauses) stays rejected.
- **Phase 2 (deferred):** render the declared-decision block to the Author and Reviewer from the platform, so the
  Reviewer stops comparing against a paraphrased copy in its brief (D-5).
- **Other target classes** (config values, manifests, IaC resources) have drafted question keys with **no runs behind
  them**: `cline_docs/reviews/requirements-decision-surfacing-2026-09-28/lane2-drafts/ab-inventory-telemetry.md`. Do
  not ship them before a run produces the miss.
- **Retry-with-findings Stage 3** (re-running the Author with the owner's answers) is filed with a trigger in the
  open register (GS-R5-D follow-on B).
- **`routing` class (2026-10-06):** `covered-routes` + `must-stay-reachable`, the requirements half of the NET-REACHABILITY
  decision (`../network-provisioning/network-provisioning-pipeline.md` § route suppression and reachability; protocol half:
  network-provisioning 1.19.0 (b2)). Decided after three reviews (Steve, 2026-10-06, register REGISTRY-ROUTING-ROWS): trigger
  narrowed by property, `must-stay-reachable` never derived. Build record and fold:
  `cline_docs/reviews/registry-routing-rows-2026-10-06/BUILD-REPORT.md`.
  - **Known limit — the topology half** (register REGISTRY-ROUTING-ROWS (4)). The miss's suppression choice entered through
    the hand-written `topology.json` `existenceAssumption`, which the generator never reads and the publish pass copies
    unread; the Program Architect reads it. The rows cover only route work the OBJECTIVE states. They cannot catch a
    route-work decision that lives only in a program-time artifact. No design yet.
  - **Known limit — the consumption half** (register REGISTRY-ROUTING-ROWS (5)). A declared answer reaches the leg only if the
    Program Architect writes it into the leg objective or contract (not mandated; `branchConditions` does not carry it), and
    network-provisioning 1.19.0 (b2) still lists a declared but unharvested destination as "not checked". No non-network
    protocol consumes either row. The rows ask; nothing at the leg tier consumes the answer yet. No design yet.
  - **Prediction** (two generations, objective `cline_docs/reviews/requirements-decision-surfacing-2026-09-28/T0-zero-objective.txt`):
    (a) **positive** — T0 plus one numbered item giving the fabric leg route work without choosing replace or accompany
    (e.g. "the fabric leg advertises a covering range for the pool"): a routing block on the fabric leg ONLY, both rows
    OPEN with no default, `covered-routes` options `replace · accompany`; (b) **negative control** — T0 unchanged (its
    fabric leg derives and publishes, and changes no route): NO routing block on any leg. **Refuted by:** no routing block
    on a leg whose numbered items give it route work; a routing block on a leg that changes no routes (in either run); a
    derived, forced or defaulted `covered-routes` or `must-stay-reachable`; a harvested list or count in
    `must-stay-reachable`; "in place of" (or equivalent) in text that does not cite `covered-routes`.
  - **Revisit trigger:** hand-read the first non-network leg that carries a routing block; record whether its work met the
    test and whether its owner could answer both rows.
- Design record: `cline_docs/reviews/requirements-decision-surfacing-2026-09-28/` — SYNTHESIS, IMPLEMENTATION-PLAN
  (mechanisms M1–M9; §6 predictions, v3 for `admitted-principal`), ADVERSARIAL-READ, INDEPENDENT-AUDIT.
