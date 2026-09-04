# Protocol Authoring & Maintenance Guide — rules for writing the rules

> **Audience: protocol AUTHORS (humans + Claude sessions), never agents.** The protocols
> themselves are the agents' reference; this document is never seeded, never injected, and adding
> its content to a protocol body would worsen the very broadcast problem it warns about (M2 below).
>
> **Provenance**: consolidates the meta-rules validated by the 2026-08-11 protocol-obligation
> audit (`cline_docs/reviews/protocol-obligation-audit-2026-08-11/AUDIT.md` — the obligation map
> in its Part 1 is the corpus's structural reference) plus rules previously scattered across the
> seed file's comments, the research-program scaffold's author notes, and
> `ADD-A-PROGRAM-PROTOCOL.md`. Finding codes (M1, O5, S5, D6 …) cite that audit.
>
> **Scope**: all seeded protocol classes — base (`pipeline-orchestrator`), domain pipelines
> (`network-provisioning`, `terraform-iac`, `kubernetes-gitops`), synthesis
> (`artifact-synthesis`), and program tier (`pov-program`, future `research-program`).
> Program-tier STRUCTURE (naming, substrate, lifecycle, registration) is owned by
> `ADD-A-PROGRAM-PROTOCOL.md` — this guide does not repeat it.

---

## 1. The layering rule — decide WHERE an obligation lives before writing it

Every obligation has exactly one right tier. Misplacement is the highest-severity authoring
error because it fails silently — the audit's M-class.

| The obligation is… | It belongs in… | Model case |
|---|---|---|
| A platform fact (chaining scope, mode resolution, error codes, stamp shapes) | Stated ONCE, in the protocol whose bound role acts on it — and verified against code at write time | D6: "§6 carries only the IMMEDIATE predecessor" — verified in `context-chainer.ts` |
| Shared tool-call mechanics | The base orchestrator, with domain protocols carrying only the DECISION RULE + a cross-reference | Step 5a deliverable wiring — the corpus's best pattern |
| A role's work product | That protocol's `## What each specialist must produce` bullet for that phase | Harvester/Architect/Author/Reviewer contracts |
| A grading taxonomy | The CONSUMER tier only (the tier that reads the stamps) — never the tier that produces graded material | pov-program Step 5 owns `containmentDisposition`; domain protocols never restate it |
| An operator/human procedure | NOT in agent prose as an instruction — surface it via the harness's comment at the moment the human acts | S5: the `duplicateAcknowledged` stamp is warned about in the Step-8 gate comment, not demanded of the agent |
| An authoring meta-rule | THIS document | — |

**The dischargeability test (M1)**: before binding a role to an obligation, trace the delivery
mechanism — what does that role's chained context / tool surface ACTUALLY carry at that moment?
An obligation the bound role cannot discharge trains agents that undischargeable instructions are
normal. (M1: the network Reviewer was told to compare against a harvest its §6 never carries;
fixed by making the clause conditional. Same trap: telling an agent to `fetch` — a client tool
not on the agent surface.)

## 2. Writing rules — each one is an incident

**R1 — Every clause earns its place with an incident, and carries it.** Date + run reference
inline. This is why "prefer NOT changing" holds during audits: a clause that reads as verbose is
usually load-bearing, and the citation is how the next reader checks before removing. Corollary:
a clause you cannot anchor to a failure (live or measured) is speculation — leave it out
(the toolkit's Step-0 "earn it" rule, applied to prose).

**R2 — State what must be TRUE, never the measure that reports it.** A pass-condition, reason
string, expected count, or range table written where agents read it becomes a target an agent
aims at INSTEAD of the requirement (Run 15's non-minimal /30 passed the one published check;
VT-12's Goodhart mechanism). Write the requirement plus, where a checker exists, the
floor-not-the-bar framing ("a clean mechanical result is a floor… do not target the checker").
Naming a machine state is justified only when that state is the SUBJECT of the clause — and then
say it is a state, never a bar.

**R3 — Closed vocabularies are stated at EVERY block that binds them.** A machine-matched
literal (`kind`: `cidr` | `asn`) that the protocol shows only as an example invites helpful
coining — and a coined token degrades differently at each site (false mismatch / `unsupported[]`
/ silently invisible evidence — O5, Tasman Run 1). When the engine gains a member, the sentences
gain it in the same change (`adding-a-containment-kind-toolkit.md` Step 2d owns that procedure).

**R4 — Respect the derive/consume split.** Deriving rules (tightest-value, member-by-member,
alignment) go ONLY in the deriving protocol. Adding them to a consuming protocol invites the
recomputation its contract forbids — a harmful edit that greps will happily recommend
(2026-08-11 follow-up: the corrected analysis that seeded the audit). The reverse also holds:
consuming contracts (`## Consumed Values`, copy-from-own-artifact) don't belong in the deriver.

**R5 — Duplication is a choice with a maintenance bill.** Duplicating a rule is CORRECT when
each copy sits where its reader meets the temptation (confidence-is-a-fact ×6, terminal-VERDICT
×5 — D3/D4, deliberately kept). But every duplicated family must be named and sweepable: an edit
to one copy greps the others in the same commit (Protocol 11), and the highest-risk family gets
a drift TEST (`test-validation-shape-contract.ts` pins the ×3 validation-shape block; it caught
nothing for months, then correctly blocked a deploy). D7 warning: some pairs cross REPOS
(protocol ↔ `~/paichart` requirements.template.md) — a copov15-only grep misses them.

**R6 — Deltas state their inheritance explicitly.** A protocol that overrides the base says so
("Everything the default orchestrator states remains in force except where this protocol
overrides it" — O4), and an override is written self-containedly, not only by contrast — a rule
phrased as "not the base's X" goes silently vacuous if the base changes (research-program
scaffold's author note, now also here because scaffolds get deleted).

**R7 — Platform-behavior claims rot, and negative/procedural claims rot worst.** A note that was
true when written (release-via-child-description) went silently false when F17 shipped, and sat
wrong for a month until a live run died on it (S5, Run 2). At write time: verify the claim
against code, and name the mechanism (file, guard) so the next platform change can find its
dependents. At platform-change time: grep the seed for the mechanism you just changed —
protocols are downstream doc-claims in Protocol 11's sense.

**R8 — Broadcast discipline: scoped to the BASE; cross-delta references are BANNED.**
Composed injection shipped 2026-08-17 (WS1 Phase C): a harness prompt carries the BASE plus that
task's ONE stamped protocol — a program's grading taxonomy is no longer read by the legs it
grades, so the M2 residual (the ASN-refusal gap published to the agents it concerned) is
**CLOSED by scoping, not by rewording**. What R8 now governs:
(a) the **BASE** is still read by every harness — anything written there is broadcast; keep it
facts and mechanics, never one tier's grading guidance;
(b) **a delta may reference the BASE only, never another delta** — the other delta is no longer
in the same prompt. This was previously enforced by accident (load-all made every cross-reference
resolvable); composition removes the accident, so the ban is now load-bearing. The
delta→base references that ARE allowed are pinned as testable pairs in
`lib/agents/harness/protocol-dependence-anchors.ts` (§4's string-pinned sweep covers them).

**R9 — Rows are lean; the runtime injects the rest.** UNIVERSAL_AGENT_RULES is injected once at
runtime (`execution-system-prompt.ts`, policed by `verify-preamble-delivery.ts`) — never
concatenate it, never restate it. Before adding any prohibition/mandate, run
`npm run prompt:directives -- <role> --protocol <name>` to see every directive already in scope
with it. Additions cost real tokens on every execution (composed harness preamble ≈ rules + ~10K-token
base + your delta; the legacy load-all figure was ~57K — re-measure the current shape with
`npm run prompt:directives -- <role> --protocol <name>` or `client.messages.count_tokens` rather
than trusting either literal); deletions are savings.

**R10 — Version discipline: bump with WHY, append history, never erase.** The changelog is the
protocol's incident record and other checks now depend on it
(`test-validation-shape-contract.ts` asserts the shape-rule entry SURVIVES in each domain
protocol's changelog — a bump that rewrites instead of appending `Prior: …` fails CI). One
protocol per semantic change; a shared-preamble change gets ONE canonical changelog (the
artifact-synthesis 1.4.0 convention).

## 3. What is mechanically enforced vs prose-only

Enforced (trust these to fail loudly): three-copy validation-shape drift + changelog survival
(`test-validation-shape-contract`), the pov-program taxonomy's 20 invariants incl. the
enrichment↔taxonomy↔card couplings (`test-program-containment-taxonomy`), protocol-stamp routing
(`test-program-protocol-token` — since WS2 Phase A 2026-08-17 the title token is resolved once at
first execution into the write-protected `task.metadata.protocol` stamp; tier membership and the
F12/F10 guards read the STAMP, with a test-gated transitional title fallback for pre-stamp tasks;
guard pins in `test-protocol-stamp-guards`), preamble delivery (`verify-preamble-delivery`), seeded-claim
pins (`validate:prompt-claims`), orphaned-row detection (seed orphan guard — WARNS, by design).

Prose-only (the health-run's job): everything in R7's class — platform-behavior claims,
operator procedures, negative claims, the D1–D5 duplicate families without tests, cross-repo
mirrors (D7). **The obligation audit itself is the periodic check for these**: read the
sections, don't grep for the words you would have used — both 2026-08-10 grep failures and the
Tasman handover's four wrong theories were settled by reading (and by retrieving the primary
observable — the live stamp — before theorising).

## 4. The change procedure (mechanics, in order)

1. **Route**: `scripts/seed-protocol-prompts.ts` is the ONLY durable route — protocols re-seed
   on every deploy; GUI edits are clobbered. (Exception on record: a row under active DB-side
   authorship is REMOVED from the seed — see the research-program tombstone in the seed file.)
2. **Before writing**: layering rule (§1) → `prompt:directives` (R9) → string-pinned-test sweep:
   grep `scripts/test-*.ts scripts/validate-*.ts` for phrases you are about to change, and fix
   pins in the SAME commit (a version pin blocked the 2026-08-11 deploy).
3. **Escaping**: protocol bodies are template literals — escape backticks and `${}`.
4. **Verify**: `ts-node` the seed (it is FALSE-CLEAN under `tsc`), check the local rows carry
   your markers (`position('…' in "promptText")`), run the seed-reading suites, then the FULL
   `test:all-validation` battery capturing npm's own exit code — a subset is how the pinned test
   was missed.
5. **Deploy gates**: rigs down (`docker ps` on prod — check and push as SEPARATE commands), no
   RUNNING executions. Then push; the deploy self-seeds.
6. **Verify live**: the same `position()` probes against the prod row, plus version.
7. **Behavioral edits get a live run.** A protocol edit that intends to change agent behavior is
   validated by a run, controlled where possible (Tasman Run 3: same scatter as the failing run,
   one variable — the readout was the agent executing the new prose verbatim). Prose that has
   never steered a run is untested code.

## 5. Maintenance cadence

- **Quarterly (with the specialist health-run)**: re-run the obligation audit's method on the
  corpus — read for misplaced/orphaned/duplicated/stale against the AUDIT.md map; update the map.
- **On any platform change to harness/enrichment/chaining/reactors**: grep the seed for the
  changed mechanism (R7) — this is Protocol 11 applied to seeded prose.
- **On any engine vocabulary change**: R3's same-change rule via the containment-kind toolkit.
- **Cross-repo**: any edit to the derivation-discipline prose sweeps
  `~/paichart/program-artifacts/_TEMPLATE/requirements.template.md` (D7) — and vice versa.

## 6. See also

`ADD-A-PROGRAM-PROTOCOL.md` (program-tier structure + lifecycle + registration) ·
`cline_docs/reviews/protocol-obligation-audit-2026-08-11/AUDIT.md` (obligation map + findings) ·
`../patterns/agent-prompt-assembly-pattern.md` (the message-assembly layer protocols land in) ·
`../patterns/agent-template-gold-standard-pattern.md` (the template tier's equivalent of this
guide) · `../patterns/agent-output-trustworthiness-defense-stack-pattern.md` (the enforcement
stack under the prose) · Protocol 10 in CLAUDE.md (fact vs verdict, for any signal a protocol
tells an agent to emit) · `adding-a-containment-kind-toolkit.md` (R3's procedure).

## Conditional obligations — the three-part shape (earned 2026-08-27, Bug Class 82)

Before writing **"where X is present, do Y"** into any protocol or role-guidance entry, answer in the
same breath: **what guarantees X reaches THIS agent's context?**

If nothing does, the sentence is decoration. When X never arrives the predicate is false, no
obligation is owed, nothing is skipped, and **no transcript records anything** — the run reads clean.
Two such clauses were live for five or more rounds and between them let two rounds ship config that
left a routing protocol INACTIVE while entering, committing and displaying cleanly.

A sound conditional obligation has all three parts:

1. **Condition phrased against the agent's OWN context** — *"WHERE the `## Harvested Allocations`
   block IS available **in your chained context**"*, never *"where a harvest exists"*. The agent can
   evaluate the first; the second is a claim about the world it cannot check.
2. **An explicit ELSE branch** — *"Where it is not available, grade ACCEPTED-FROM-CLAIMS; never claim
   you verified it."*
3. **The absent case defined.** Silence is what turns a guard into decoration.

⚠️ **Prose review cannot catch a violation of this, because the prose is correct.** You have to trace
the channel. The sweep method, the confirmed sites and the detection grep are in
`.claude/knowledge/domain/mcp/bug-class-registry.md` § Bug Class 82; the instrument that can see the
class is `npm run replay:contract-propagation -- <legTaskId>`.
