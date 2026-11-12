---
name: requirements-spec
description: Turn a program objective into a published, answered requirements.md for a pov-program run — zero-decision generation, coverage check, the grouped owner-answer session, merge, regeneration, gates, the publish pass and URL verification. Use when the owner wants a NEW program objective specified, or an existing spec re-generated after its answers change. Stops at every owner decision and every production or public action.
---

# requirements-spec — objective → published program spec

You run the generated-spec flow end to end. **The canonical procedures are the three docs below; this skill only orders
them and runs their scripts.** If this file and a doc disagree, the doc wins — fix this file.

- `docs/DESIGN-DECISION-QUESTIONS.md` — the question registry (what is asked)
- `docs/OWNER-ANSWER-SESSION.md` — answering, merging, regenerating, waivers
- `docs/PUBLISH-GENERATED-SPEC.md` — §0 what to declare, §1–§5 publishing

Read all three before step 1 (the registry changes; your memory of it does not).
The owner's plain-English walk-through is `STEP-BY-STEP.md` in this folder — keep your stops and wording consistent with it.

## When to use — and when not
- **Use:** a NEW objective (new target, domain mix, authorisation or routing shape) that passes the **fit check** below,
  or a re-generation after answers change.
- **Not:** another run of an objective that already has a published spec — reuse it (one spec served ~20 runs of
  `telemetry-export-genspec-t1zero-v2`). A single pipeline (not a program) never reads requirements.md.

## Fit check — run it BEFORE step 1; outside these bounds, STOP

**Tell the owner why, in one line, above the table (U5):** *"Fit check: can this objective be turned into questions
whose answers can be checked from what the legs read? If not, a person writes the spec."*

This flow turns an objective into answered registry questions. It works only when the program's END STATE is **fully
determined by, and checkable from, the targets its legs harvest** (owner ruling, 2026-10-09, from the log-archive blind
trial). Check all four; if any fails, do NOT draft an objective and do NOT offer registry options — say which test
failed and why, and recommend that a **human architect writes the requirements.md** (the hand-written route,
`PROGRAM-HARNESS-USER-GUIDE.md` §2). Offering options for an objective the registry cannot bound produces a spec that
looks answered and is not.

| # | test | fits | does NOT fit → human architect |
|---|---|---|---|
| F1 | **Closed end state.** "Nothing wider" is decidable from the leg's own target. | *restrict*: "only X may do Y on Z" — the target's policy alone shows who can (the trial's Allow + Deny, proved mechanically) | *grant-only / additive*: "also let X do Y" where the effective access also comes from surfaces no leg harvests (identity policies, other enforcers) — "nothing wider" is uncheckable; the trial's grant design produced a false expected result (Z24) and open questions it could not close |
| F2 | **Nameable targets.** Every target can be DECLARED by name (namespace, bucket, device, workspace). | one named target per leg | "every bucket", "all namespaces that need it", "whatever the service touches" — no target the owner can declare and no rule a harvest can apply |
| F3 | **Rule-shaped population.** Who/what is acted on is a rule over harvested state. | "pods in phase Running, excluding hostNetwork" | a hand-picked or judgement-based set ("the important services") |
| F4 | **Existing surfaces only — in the OBJECTIVE and in the ESTATE (U1/U2).** The legs change existing enforcers or derive values; nothing must be designed or provisioned first. F4 holds only if the estate the descriptors reach actually has the enforcer and any path the objective relies on (e.g. senders can reach the enforcer at all). What the read-only services can show, check with them; what they cannot (a network path, an address translation), ask the owner to confirm in words, and record it as an owner premise — never infer it from rig docs. | change a policy, derive a value | the objective needs new infrastructure designed (an endpoint, a role, a network path) — the trial's step-6 recommendation to declare an endpoint the harvest never found (Z28) is this failure |

Also outside: an objective whose CORE decision has no registry row (a few Author-added rows for side items are fine —
the trial's final generation added four; a missing row for the main decision means the registry cannot ask it), and a
re-run of an objective that already has a published spec (reuse it).

## Network legs — Device sources (change legs from network-provisioning 1.23.0; value legs from network-derivation 1.3.0)

**A network CHANGE leg reads only the configuration sources the spec DECLARES (network-provisioning ≥ 1.23.0), and a
network VALUE leg reads a Git file only when the spec gives it lines of its own (network-derivation ≥ 1.3.0).** Check
the live versions first: the series-cut ledger, or the leg root's `protocolInjection.delta.version`. These rules apply
to every objective with a network leg. From requirements-authoring 1.11.0 the registry row `network-provisioning.sources`
asks them (the zero draft shows it OPEN on every network leg; map the item to that row). Before 1.11.0 no row asks
them, so YOU carry them as an added item (item 5 below). Either way the objective
declares them, the publish pass checks them (`scripts/check-requirements-sources.ts`, the shipping parser), and the §2
read checks them again.

1. **Ask it per leg, in Group A, beside the leg's TARGET row:**
   > **Pipeline N: which devices does this leg read, and where is each one's configuration?** List every device in this
   > leg's scope: the ones it **changes**, and the ones whose state it only needs to **see** (for example to keep a pool
   > free across the fabric). For each one, say where its configuration comes from: a **Git file** (service,
   > owner/repo/path, optional branch), the **running device** (device service), **both**, or, for a device the leg
   > changes, **no read** (the package writes commands).

   Recommend listing every device the zero-decision harvest found in the leg's scope, using Git where the owner keeps
   Git. The harvest's names are evidence for the owner's answer; only the owner's answer is written down. A device left
   out is not checked by that leg (2026-11-01: a block naming only the changed switch left the other unread, and the
   leg produced a colliding pool).
2. **Write each answer down mechanically, one line per device.** The grammar is the protocol's, character for character
   (U+2014 em dash; nothing else parses):
   - `<device>: git-file — service <name | descriptor URL> ; <owner>/<repo>/<path> [@ <branch|tag|commit>]`
   - `<device>: device-read — service <name | descriptor URL>`
   - `<device>: live-read — service <name | descriptor URL>`
   - `<device>: command-package`

   | Owner says | change leg (network-provisioning) | value leg (network-derivation) |
   |---|---|---|
   | changes it, Git file | `git-file` | — (a value leg changes nothing) |
   | changes it, running device | `device-read` | — |
   | changes it, both | `git-file` + `device-read` | — |
   | changes it, no read | `command-package` | — |
   | sees it, running device | `live-read` (never kept) | `live-read` |
   | sees it, Git file only | `git-file` (KEPT, see L3) | `git-file` (never kept on a value leg; card `git-only`) |
   | sees it, both | `git-file` + `device-read` (both kept, never edited) | `git-file` + `device-read` (the value rests on the running device) |

   `live-read` and `command-package` each stand alone on their device. A device may carry `git-file` + `device-read`:
   the Git file is the base, the device read is evidence, and the platform compares them (it gates nothing; the agents
   write `drift: not checked`). A spec never states a drift cause ("the device was edited out of band") unless it also
   supplies the witness that shows it.
3. **Emit ONE block per LANE, not per leg.** The platform carries one block per protocol key:
   `deviceSources["network-provisioning"]` for every change leg and `deviceSources["network-derivation"]` for a value
   leg (the Program Architect copies them; it writes the value key only when the value leg has lines of its own). So:
   - every change leg gets the SAME block: merge the change legs' answers, each device at the strictest kind any change
     leg needs (changes > sees; `git-file` + `device-read` covers both);
   - every value leg gets the same value block, or none (no lines ⇒ the value leg reads the running devices through its
     descriptor, as before 1.3.0);
   - if no single line fits a device (L2 below), STOP and show the owner L2. Never pick for the owner.
4. **Show the owner the four limits, one line each, before recording the group:**
   - **L1:** all change legs in one program read one device list (register G1-a).
   - **L2:** a device one change leg changes can't be "see only, running device" for another change leg.
   - **L3:** on a change leg, a device that only has a Git file is still kept, even when the leg only sees it: its file
     enters the Author's view, and an unreadable file stops the leg (register GIT-EVIDENCE-KIND, parked).
   - **L4:** a device the owner leaves out is not checked by that leg.
5. **Record it as ONE numbered item per lane.** The item's text is a one-line lead, then the block INDENTED under it (the
   merge script refuses a column-0 `#` line inside an item, Z58), for example:

   ```
   7. Device sources for every network change leg:
      ## Device sources
      edge-sw-01: git-file — service netops-git ; netops/device-configs/configs/edge-sw-01.cfg
      edge-sw-02: live-read — service netops-devices
   ```
   Map it in the ROW-ITEM-MAP to `network-provisioning.sources` (requirements-authoring ≥ 1.11.0: the zero draft asks it),
   or, on an older protocol, as ``| `network-provisioning.item-<N>` (added <date>: Device sources) | N |``
   (OWNER-ANSWER-SESSION, *A question added … AFTER the zero-decision run*). Expect that row in the answered draft.
6. **What the answered draft must carry** (the sources check refuses anything else): in each network leg's
   `## Pipeline N objective` section, exactly one fenced `## Device sources` block equal to its lane's item, and exactly
   one of these two lane sentences, word for word:
   - change leg: `This leg changes device configuration.`
   - value leg: `This leg changes no device configuration.`

   The value sentence is also the "changes nothing" phrase the Program Architect quotes for `leg type: value`. Put the
   lane sentence in the leg's objective item, so the Author transcribes it with the leg.
7. **Name the service; never leave the SOURCE to discovery.** A service already registered in the hub, named by its
   registered name, is used as it is. The run never registers, updates or deletes it. Any other service is given as a
   descriptor URL, and the platform registers it for that run (the run removes only what it registered). Role
   guidance names no service and defers to the task, the contract and the requirements (owner rule 2026-10-24, register
   ROLE-GUIDANCE-AGNOSTIC). The spec is therefore the only place the source is chosen. Example values you write in
   this skill's tables or an objective must not be the lab rig's names. Use neutral ones, such as
   `edge-sw-01: git-file — service netops-git ; netops/device-configs/configs/edge-sw-01.cfg`.
8. **A descriptor URL must be registrable.** Check it at step 0, before any generation:
   - every tool description is ≤ 500 characters (`capabilities.tools[].description`). The published network
     descriptor failed this once (`paichart` `1d5faf1`, register CEOS-DESCRIPTOR-OVER-LIMIT);
   - the service name and every other field come from the descriptor alone. A registration that adds a name of its
     own is refused `DESCRIPTOR_FIELD_DISAGREES` (register HARVESTER-DESCRIPTORURL-SINCE-WIB10);
   - a token goes only in the URL's QUERY string, never the path. A URL with a query registers only from a HUMAN, so
     a run cannot self-provision it: a human pre-registers that service, and the spec names it by name (rule 7);
   - held-file declarations (`heldFiles`, incl. `gitPin`) come only from the descriptor. A spec or a run never
     supplies them.
9. **A named branch, tag or commit must be the one the Git service pins.** That is the `ref` in its descriptor's
   held-file declaration (`heldFiles.files[].gitPin.ref`, read in `git-file-source-pin.js` 2026-10-24). With no
   `ref` declared, only `main` passes. The line's owner/repo must also be the pinned repo. Any other ref is refused,
   and the leg reports the refusal and stops. Read the descriptor before you accept a `@ <ref>` from the owner.
10. **Pasted device state is evidence, never a base.** No pasted configs, and no counts or lists taken from them, may
   stand in for a declared source in the objective or the spec. This extends rule 3 below (harvested state belongs
   nowhere). The L-N1 lab twice saw a count derived from pasted state.
11. **Internal setups** (INTERNAL-FIT, `cline_docs/reviews/held-network-2026-10-22/INTERNAL-FIT-INVENTORY.md`):
   - **A team's shared service** (registered once by one person, used by colleagues' runs): its OWNER grants the
     objective's POV with `registry update` → `heldGrantPovIds` (IF-3). Only the owner can do this: not an admin and
     not an agent. The owner and the person launching must both be literal members of that POV. Without the grant, a
     colleague's run is refused the service (unless it is public), and even a public one holds nothing for that run. Self-host: the operator setting `HELD_ELIGIBILITY_INSTALL_WIDE` instead.
   - **A descriptor on a private host:** the operator adds it to `HUB_PRIVATE_ENDPOINT_ALLOWLIST` (IF-2). Plain http
     works only on self-host, with `DESCRIPTOR_FETCH_ALLOW_HTTP=true`.
   - **A spec that cannot be published publicly:** not supported yet. The program reads the spec from public raw URLs.
     This is INTERNAL-FIT I-19, handed to requirements-authoring, register Z70. Stop and tell the owner.
   These are owner and operator actions. Ask about them at step 16. Never perform them yourself.

## Rules that never bend
1. **You never decide a design question.** Recommend with evidence; the owner answers. No defaults on OPEN rows.
2. **Never hand-edit a generated spec.** A defect means regenerate (or fix the generator and file it).
3. **Harvested state belongs nowhere** in the objective or the spec — addresses, names, members, counts.
4. **STOP and show the exact payload/command before any production or public action** — `task.create`,
   `agent.execute`, a push to `~/paichart`, the program task — and wait for the owner's "yes". Before any copov15
   push, confirm no pipeline execution is RUNNING/PENDING (read-only query).
5. **A waiver is the owner's decision, named and recorded** in `PUBLISH-NOTES.md`; never yours.
6. **Stay blind to reference answers.** Before the owner-answer session is recorded, do not open any published
   `program-artifacts/*/requirements.md`, `cline_docs/reviews/**/ANSWER-KEY.md`, or a prior run's `answers.md` for the
   same objective. Recommendations come from the registry's "earned by" evidence only. The single exception is
   `--topology-from` at publish (step 13). If you have already read one, say so and stop: the run is not blind.
   Also never add a goal clause the owner did not say (e.g. "nothing that goes stale") — that is a decision.
   **Owner-side material is out of bounds wherever it lives (B1/B2):** do not open files under `cline_docs/reviews/`
   that the owner names as theirs, and do not read the MESSAGES or diffs of commits that touch them (`git log` shows
   them; a commit message can carry an answer the docs were kept clear of). If you read something that answers a
   registry question, say so, file it as a run condition, and make no recommendation on that row.
7. **File findings in `work/REGISTER.md`** (this folder) — the skill's own register; create it from the header in
   `work/README.md` if it is missing. The open register indexes it (REQ-SPEC-STREAMLINE), so an entry there IS filed; a
   line in a run's `notes.md` is NOT. You file generator defects, waivers and spec outcomes only — anything else is the
   owner's or pipeline-harness's to file in the open register.
8. **One POV per objective, two phases, never mixed.** A generation never runs in Program; a program never runs in
   Requirements. The duplicate check is phase-scoped, so mixing them makes every program run clear generation stages
   (matched by the model, not platform code — pipeline-harness-library § duplicate-check clearance).
9. **Read production through the pAIchart MCP tools, not SQL.** Tasks, stages, metadata, comments: `project` (`task.context`, `task.list`, `pov.details`); a run's output: `perform agent.results` (`verbose:true` for the body) / `agent.status`. They show what the owner sees and need no server access. psql is a LAST RESORT, only for a question no tool answers (e.g. the RUNNING/PENDING in-flight count before a push): say so first, and run it read-only (`PGOPTIONS="-c default_transaction_read_only=on"`). No Co-Authored-By trailers on commits.

## Habits to keep (Z29 — observed working in the 2026-10-09 trial; keep them through any edit)
- Text that arrives as a bare paste is CONFIRMED with the owner before it is recorded as an owner decision.
- "(or your choice)" is not a delegation — record the answer the owner gave, never pick.
- After any write, READ IT BACK (task description byte-compare, `duplicateAcknowledged` is an array of N, the template's model).
- Owner rationale goes under *Owner rationale* in `answers.md`, never inside a numbered item.
- Keep every superseded merged objective (`objective-answered-v1.txt`, …) — the record of what each generation ran.
- **Read the OUTPUT, not the tick (Z58, 2026-10-11):** the merge reported ✅ "21 answered" while it had absorbed the
  owner's rationale into five items; only reading the merged file caught it. Every script result is checked by reading
  what it produced.
- **Say how far a check went** ("I read the source, not the deployed service") — it let the owner close the gap in a minute.

## This folder
Everything is here (`README.md` has the layout): `docs/` and `scripts/` are SYMLINKS to the canonical files (edit them at
their home, never through the link); `work/` is the working folder. **Run every command from this folder**
(`cd .claude/skills/requirements-spec`) — the paths below are relative to it; `requirements-rules.py` is the one tool outside it (`~/paichart/scripts/`).

## Working files
`work/<objective-slug>-<YYYY-MM-DD>/` — the file list and what each holds: `work/README.md`. Committed: the owner's
answers are a record. Write each accepted group immediately.

## The flow

| # | Step | Who | Tool |
|---|---|---|---|
| 0 | **Systems and descriptors (U3/U8).** If the owner named no systems, list every descriptor in `~/paichart/descriptors/` (skip `*.schema.json`, `SPEC.md`) as a choice table: system · descriptor · picked? · why (the objective's words that matched) · what it can read. End with *"Accept, or name others. Each one is registered as a service for the run and removed at the end."* Never pick silently. **A system may instead be a service ALREADY registered in the hub** (named by its registered name): it is used as-is, never registered or removed by the run. **Network change legs (from network-provisioning 1.23.0):** list the Git and device services the owner will name as sources, and check each descriptor URL against *Network change legs* rules 5–6 (tool descriptions ≤ 500 characters, no token in the path, the pinned `ref`) before step 1. | you + **owner decides** | table |
| 1 | **Draft the zero-decision objective**: goal · the `This is a DRAFT SPECIFICATION for human review. Do not launch a program.` line · descriptors · scope stated as a rule (PUBLISH §0). Declare nothing. Show it to the owner. **Carry the owner's VERB verbatim** (restrict / grant / remove …) into the goal sentence — never paraphrase it (V1: "restrict" became "lets … write" and four generations specified another program). On a rig that cannot enumerate the scoped class (e.g. namespaces), say so: a rule-only scope harvests nothing until a target is declared (Z27). The zero objective declares nothing, so it carries no Device sources block; the block is an owner answer and enters as a numbered item (*Network change legs* rule 1) at the merge. | you + owner | text |
| 2 | **STOP → create the POV, then launch the generation.** Unless the owner names an existing POV, create ONE POV per objective with `pov.create` and `phases: [{name: "Requirements", type: "EXECUTION"}, {name: "Program", type: "EXECUTION"}]`; its description neutral (the harness reads nearby text into briefs — no objective wording, values or history); the owner is the only team member until Group B. Every generation (zero and answered) runs in **Requirements**, each in a new stage; **Program** stays empty until step 16. Show the `pov.create` payload with the launch calls; one "yes" covers both. Launch: (title format (U7): `Generate requirements: <short subject> (protocol: requirements-authoring)` — the same title on every generation of one objective; `(protocol: requirements-authoring)` title token; new stage with a plain name — **never prefix it `Pipeline:`** (the harness creates that child stage; a `Pipeline:`-named parent reads as a prior run to the duplicate check); `metadata.duplicateAcknowledged` = ARRAY of every prior `Pipeline: …` stage id in the phase). `agent.execute` with `waitForCompletion:false`. | owner OK | MCP `perform` |
| 3 | When it completes: `python3 scripts/publish-generated-spec.py fetch --task <id> --out work/<run>/draft-zero` — read the run summary (one execution per child; no truncation). Until the step-2 reseed of `infra_state_harvester` is live, check the Harvester's registrations for a `DESCRIPTOR_FIELD_DISAGREES` refusal (register HARVESTER-DESCRIPTORURL-SINCE-WIB10): it costs a retry turn; file it if it recurs after the reseed. | you | script |
| 4 | **Coverage BEFORE answers:** `python3 scripts/check-requirements-coverage.py --draft work/<run>/draft-zero/report.md`. ERRORS = generator defects: file them in `work/REGISTER.md` (do not answer around them). An *invented key* error (an Author-invented row) is filed AND shown to the owner in the answer session: it is pointed at an existing item or answered as a new one, never dropped (OWNER-ANSWER §7). **The coverage check sorts invented rows itself (R2, B-2 2026-10-12):** *invented key restates item N* (the Author re-keys it `<token>.item-<N>`; nothing for the owner) or *invented key asks a decision no key or item asks* (it needs an answer and is a registry candidate). Show the second kind first. A row keyed `<token>.item-<N>` is an item row, not an invented one. Invented row NAMES change between generations (Z62) — key everything by item number, never by the Author's name. READ items = confirm each leg's class with the owner. | you | script |
| 5 | Note the draft's deviations (OWNER-ANSWER §3): wrongly forced rows, missing options, a harvested value or count inside a question, leg text assuming an OPEN answer. File them. | you | read |
| 5b | **Team before Group B (U10/U11).** Show the POV roster. Ask who else should be on it and who is project manager — the owner picks; never recommend a person (by-role suggestions are fine: "the plan approver is usually the project manager"). Show the `pov.update` that adds them (ADMIN; adds, never removes). Group B then offers the roster as a pick list. Also ask whether each approver releases their own gate or the owner releases it for them, and record which (a release record names who clicked and for whom). | **owner decides** | MCP |
| 6 | **Owner-answer session** (OWNER-ANSWER §4): groups A–F, **one group per turn**, each row: question · recommendation · why (the registry's "earned by"). Derived rows are recommended as derived, for the owner to confirm. **After Group B is accepted:** list every named approver not on the POV team and show the `pov.update` that would add them (ADMIN; adds, never removes) — adding them is the owner's "yes", not deferred to step 16. A recommendation resting on ONE precedent says why that precedent's conditions hold here (Z28: Decision 12 put the producing team in charge of releasing its own value; Decision 14 proposed an endpoint the harvest never found). Never recommend declaring infrastructure the harvest did not find — that premise is `principal-unseen`'s. **Presentation (U9/U12/U14):** keep table cells short (row · options · recommendation) and write each reason IN FULL below the table — a narrow terminal clips cells; state each reason as the failure it prevents, in one plain sentence, with the history id in brackets at the end ("(Decision 5)"), never the id alone. **Rows that depend on each other** (e.g. `request-path` × `principal-unseen`; the registry's *interacts with*) are shown together in ONE combined table first: *if you answer · what the program can do · likely outcome · recommendation* — consequences come from the registry's *leads to* lines (facts), the recommendation is its own column (leave it empty under a run condition that forbids one). Take the outcome cells verbatim from the registry's *What each answer leads to* (`DESIGN-DECISION-QUESTIONS.md`). Never compose a consequence the registry does not state. If a row has no line there, say so and file it. When advising a scope exclusion, say how a leg will RECOGNISE the excluded thing from what it reads (L1). | **owner decides** | AskUserQuestion / table |
| 7 | Record each accepted group immediately in `answers.md` as numbered items + the `<!-- ROW-ITEM-MAP -->` table (OWNER-ANSWER §5). Map an answered new decision as `<token>.item-<M>` (the id the next generation carries); for the merge, the zero draft's row id stays the question key. | you | file |
| 8 | **Merge:** `python3 scripts/build-answered-objective.py --base work/<run>/objective-zero.txt --answers work/<run>/answers.md --draft work/<run>/draft-zero/report.md --out work/<run>/objective-answered.txt` — it refuses any unanswered question. Once targets are declared, narrow the harvest-scope line in `objective-base.txt` to them before merging (Z27). | you | script |
| 9 | **STOP → regenerate** from `objective-answered.txt` (new stage; `duplicateAcknowledged` lists every prior stage incl. the zero run). Verify the task description equals the merged file before executing. Re-query the phase for EVERY `Pipeline:`-named stage at each relaunch — never list from memory; the list grows one per generation (Z30). **Carry the owner's ROW-ITEM map in the harness task's METADATA** (never the objective text): `python3 scripts/build-row-item-map.py --answers work/<run>/answers.md` → set it as `metadata.requirementsRowItemMap` in the same `task.update` as `duplicateAcknowledged`, and read it back (the in-run requirements form check uses it for the dropped-clause check; absent, it falls back to the draft's own citations and records that). | owner OK | MCP |
| 10 | `fetch` the regenerated run; then the gates: `check-requirements-coverage.py` and `check-requirements-citations.py --objective work/<run>/objective-answered.txt --draft …/report.md`. Expect APPROVED with the owner block `none` (or only accepted forced defaults). Also run the dropped-clause check: `python3 scripts/check-requirements-clauses.py --objective work/<run>/objective-answered.txt --answers work/<run>/answers.md --draft …/report.md` — an owner item's obligation (state / list / report / publish / record / name) missing from its leg is NOT a write-up slip. Since 2026-10-12 `prepare` (step 13) runs it too and STOPs on every flag: READ each with the owner (show the clause and the leg text); a checker miss is named in `--clause-read <item>:<leg>:<anchor>` (the anchor exactly as printed: a different anchor on the same item and leg is a NEW read — read the anchor text, never dismiss by key), a real drop means regenerate. If `author-correction.json` shows an ADOPTED correction, `prepare` also prints each shrunk section's removed lines: read them WITH the owner for a deleted obligation (`--correction-diff-read`). Neither read is ever a waiver. | you | scripts |
| 11 | **NEEDS-REVISION on write-up slips only?** Do NOT regenerate to chase slips. Classify each finding (OWNER-ANSWER §8): waivable only if it changes nothing the program is told. **STOP** — show each finding with exact text; the owner decides; write `waiver.md`. Anything not waivable ⇒ regenerate or fix the rule. | **owner decides** | text |
| 12 | **The §2 human read — never skipped:** harvested names/addresses/abbreviations/COUNTS anywhere, a synthetic worked example, pointer-and-property preconditions, and the derivation POPULATION matching the objective's noun. **Network change legs:** each leg section carries its Device sources item character for character (every device the change touches, the service, path and any ref exactly as declared); a value leg carries none; no drift cause stated without its witness; no pasted config, count or list standing in for a source. A paraphrased or partial block is a generator defect: regenerate and file it (it is the measured miss for the proposed registry row). Present what you checked; the owner confirms. | you + owner | read |
| 13 | **Publish pass, dry run:** `python3 scripts/publish-generated-spec.py prepare --source …/report.md --objective work/<run>/objective-answered.txt --answers work/<run>/answers.md --name <new dir> --topology-from <published dir> [--waiver work/<run>/waiver.md] [--clause-read <item>:<leg>:<anchor>,…] [--correction-diff-read …]` (the source must be the directory `fetch` wrote: it needs `author-correction.json`). Every STOP it raises is a stop. Then `--write`; fill the `<…>` parts of `PUBLISH-NOTES.md`. | you | script |
| 14 | **STOP → push the public repo** with the commands the script printed. | owner OK | git |
| 15 | `python3 scripts/publish-generated-spec.py verify --name <dir> --files <requirements.md or .program.md>,topology.json` — retry until 200 + identical (raw caches ~5 min). | you | script |
| 16 | **STOP → program task** (PUBLISH §5). **Pre-launch (U13):** check only what a user can — the read-only services answer, and the target is still in its starting state; then ask the owner to RE-CONFIRM in words every declared premise the harvest cannot observe (e.g. *"requests still reach the enforcer under the pods' own addresses"*), and record it. Never check infrastructure over ssh — a user has only the MCP tools. replicate a known-good root with no copied metadata; change only the two URLs (the `.program.md` one if the size gate produced it); drop prior-run clearance on a fresh POV; confirm the POV team holds every declared approver and nothing is running. **Network change legs:** confirm each service named by name is registered and callable by the launching user; for a team's shared service, that its owner has granted THIS POV (`heldGrantPovIds`) and both are literal POV members; for a private descriptor host, that the operator allowlisted it (*Network change legs* rule 8) — ask, never do it yourself. At the plan gate, read each spawned network leg: its task description (or contract `deviceSources["network-provisioning"]`) carries the block verbatim — until pov-program's PLAN-SPAWN copies `deviceSources` (its own batch), the Architect's copy is the only carrier, and a missing block stops the leg (safe, but a wasted run). The program task goes in the same POV's **Program** phase, in a new plainly-named stage; that phase holds no generation stages, so a FIRST run needs no `duplicateAcknowledged`. **A re-run does:** set it on the root to an array of every earlier `Program:` and `Pipeline:` stage in that phase, re-queried live (legs get it from the platform). "Authored in" (Requirements) and the running phase differ by design. **Then, at the hold window** (after PLAN-SPAWN, before any gate): the plan-gate checklist in `.claude/knowledge/pipelines/PROGRAM-HARNESS-USER-GUIDE.md` § "The plan gate is not a formality" — read the spawned legs, not just the plan. | owner OK | MCP |

## After the program runs
- Record the spec's outcome in `work/REGISTER.md` — this flow's second objective is the evidence
  the owner-answer session needs before it becomes a pattern.
- requirements-authoring-specialist runs the reviewer-warning → design-question watch on the program's completion (register
  WARNING-QUESTION-WATCH): a repeated unasked decision is PROPOSED as a registry row, never added here.
