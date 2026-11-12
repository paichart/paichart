# Checklist for a hand-written program spec

**For:** any engineer writing a short `requirements.md` for a program by hand. **Owner:** pipeline-harness-specialist, with
requirements-authoring-specialist for the questions that come from its registry.
**Status (2026-11-12):** in use. Used on seven program runs (2026-11-10 to 2026-11-12). Four released (`loopback-ceos2` and
`firewall-partner-path-r2`, each Git-only and Git + live). One was correctly refused at the integration review because the spec
left the return route unstated and bound a rule to an interface the traffic never crossed — the routing caution under Tier 2 (C16)
exists for exactly that. One plan was stopped at its gate for a planner defect, not a spec gap. The first run (2026-11-10) found one
correction to the spec at the plan gate. Reviewed by prompt-construction and by
requirements-authoring. No agent reads this file.

**What it does.** It asks, before the first run, the design questions that stopped earlier programs. In the record of 80
programs that did not release (2026-08-21 to 2026-11-10), a design gap or an unstated decision was the known cause of about
1 in 9, at most about 3 in 10.

**What it does not do.** It does nothing about the other causes: a leg's change package breaking one of its own format rules,
platform defects and outages. A program can be "not releasable" for one of those with a perfectly good spec. The release decision
is then yours: read the reason in the program's summary.

**How to use it.** Write the spec from the shape in Part 1. Answer every Tier 1 question in Part 2 that applies, as one plain
sentence in the spec. Answer a Tier 2 question only where you care about the outcome; otherwise the planner or the leg decides,
and you read its decision at the plan gate or in the leg's package. A gate can accept or refuse a decision; it cannot change one.

**Words used here.** *Leg*: one pipeline of the program. *Planner*: the Program Architect, which reads the spec and writes the
plan you approve at the first gate. *Package*: what a leg that changes something produces for approval.

---

## Part 1. The shape that has released

**Examples to copy from — released, in `paichart/paichart-configs`, `usecases/`** (each variant directory is a complete program
input; the README says what must be running, which values are placeholders and what success looks like):
- `loopback-ceos2/` — a value leg then a change leg, three gates; released `git-only/` 2026-11-11 and `git-live/` 2026-11-11.
- `firewall-partner-path-r2/` — two change legs sharing one Device sources block, a value handed from the first to the second,
  a stated reachability rule; released `git-only/` 2026-11-11 and `git-live/` 2026-11-12. (`firewall-partner-path/` is its
  superseded first revision, kept as that run's input.)

Prepared, not yet released: `ssh-access-triangle/git-only` (an access change; the Tier 2 access caution applies) and
`igp-migration-2node/live` (a person applies each phase between legs).

⚠️ The older examples under `paichart/paichart` `program-artifacts/` (`held-network-window-p1-vlg/`, `lab-exporter-loopback-ceos2/`)
name the retired repository `paichart/paichart-lab-configs` in their Device sources lines; production's Git file source has read only
`paichart/paichart-configs` since 2026-11-11 06:06Z, so a run launched from either as published is refused at its first Git read.
Copy their shape, never their repository name.

| Section | What goes in it |
|---|---|
| Title | the outcome, in one line |
| What must happen | the change in plain words, the fixed values (names, pools, ports), and "Nothing else changes" |
| Why this is a program | which value or result one leg makes that another leg depends on |
| Approval gates | a table: gate, what it approves, what it runs after, what it blocks, approver by NAME AND EMAIL (the program matches approvers by email; a name alone gives an unassigned gate). Every approver must be on the project's team list in pAIchart |
| One section per leg | heading names the leg's protocol and type, e.g. `(network-derivation, value)` or `(network-provisioning, change)`. Copy these words exactly: the planner picks the leg's rules from them; what the leg does; "Changes nothing." on a leg that only works out a value; "depends on Pipeline N" where it does; the leg's `## Device sources` block, exactly as it must appear. **Put each rule in the section of the leg that applies it, and name the leg.** A rule stated in the general section without naming its leg was given to the wrong leg by the planner (2026-11-10) |
| Integration review | numbered checks across legs, facts only; a new check is appended, never renumbered |
| Validation shape | one sentence: governed by each leg's own protocol; this file does not restate or override it |
| Connection surfaces | how each leg reaches what it reads |

Keep it short. Do not restate a leg protocol's rules. Do not copy device state into the spec.

- **A `topology.json` goes beside the spec** (Part 1a). A spec without it does not plan.
- **"Changes nothing." belongs to a value leg only.** The planner reads that phrase as the mark of a value leg, and the sources
  check infers the leg's kind from it. In a change leg's section never write "changes nothing", even for a leg that makes no
  edit: write "makes no edit".
- **Do not write "if X, then Y" rules for a leg.** The planner copies each one into the plan as a branch the leg must
  evaluate, and a careless "if" becomes a rule nobody meant. Say it as one sentence with no "if".
- **Never word a check as something a leg must prove about itself,** and never ask a leg to report a difference between two
  sources of one device (a Git file and a device read). The platform compares them.

---

## Part 1a. The topology file

Every program reads two inputs: the spec and a `topology.json` beside it. The Program Architect must be able to parse it.
It is written by hand, it repeats facts the spec states, and until now no check read it.

**What goes in it: facts only.**

| Key | What it holds |
|---|---|
| `name`, `description` | the program's name and one line on what it is |
| the devices or targets | the same names the spec uses |
| the config repository | owner, repository and the file paths the spec's Device sources blocks name |
| `readOnlyServices` | the read-only service address each leg's "Connection surfaces" sentence points to |
| fixed values | pools and names the spec also states |
| which leg feeds which, and the value handed on (an `interdependency` block) | welcome; the planner uses it to sequence the legs. The spec states the same dependency in the consuming leg's heading |

**Three rules.**
1. **State no decision, rule or assumption in the topology that the spec does not also state.** Gate reviewers read the spec.
   A line such as an "existence assumption" in the topology reaches the Architect with nobody having approved it.
2. **Every device, file path, service address and address range in one file appears in the other.**
3. **Keep prose out of it.** A sentence belongs in the spec.

**Check it before publishing:**

```
python3 scripts/check-spec-topology.py --spec <requirements.md> --topology <topology.json>
```

It warns and does not block; the one error is a topology that does not parse. (The script is in the private repository today.)

**Publishing.** The spec and its topology go in a NEW directory under `paichart/paichart-configs` `usecases/<name>/<variant>/`, one
directory per objective (procedure: copov15 `scripts/lab-configs/RUNBOOK.md`). Never edit a directory a run has used: it is that run's
input of record. Check the served files match what you wrote before you launch.

---

## Part 2. Questions, in two tiers

**The idea.** State the outcome and the boundaries. Leave small choices to others. Some unstated choices are made by the
Program Architect, listed under its assumptions, and shown at the PLAN gate. The rest are made by a leg and shown in its
package at that leg's gate. So a choice you did not state is reviewed after it is made, not declared before. A gate cannot
send an answer back to a leg: you can accept the choice or refuse it, not change it. Refusing costs a re-run.

### Tier 1: MUST ANSWER. A run has stopped on each of these

| # | Question | Applies to | Why it is here |
|---|---|---|---|
| M1 | **What exactly does the leg act on?** Name the device, file, bucket, namespace or policy | every leg | an unnamed target is right only while it is the only one |
| M2 | **Which devices does the leg read, and where is each one's configuration?** List every device the leg **changes** and every device it only needs to **see** (for example the other switches that share an address pool). A device you leave out is not checked. For each: a Git file, the running device, or both; for a device the leg changes you may also say "no read" (the package then only writes commands). All change legs in one program share one list. A leg that only works out a value has its own list. If a leg has only Git files, it claims nothing about live state. The exact line format is in the model spec's Device sources blocks (Part 1) | every leg | a leg reads nothing it is not given; a device left off the list was not read and a colliding value was produced |
| M3 | **What must not change?** ("nothing beyond …") | every leg that changes something | a widened change was refused at program review |
| M4 | **Is there anything already on the target that looks wrong but is known and must be left alone?** A deliberate difference between the running device and its file, a planted test value, a setting someone else owns. Declare each by what it is (a property, not a copy of the value). Then say what the leg does with anything else it finds that this change does not touch: leave it, or stop for a person. This file cannot switch off a stop the leg's own rules require: on Kubernetes and Terraform legs, a difference outside the change's scope that you did not declare stops the leg for a person. Never ask a leg to report a difference between a device's Git file and the running device; the platform compares them | every leg | 3–5 runs stopped here with no answer in the spec |
| M5 | **For each success check, which read proves it, and is that read one the leg has?** The reads a leg has are its Device sources (M2) and the tools listed in its read-only service's descriptor. A check on live behaviour (a session is up, traffic passes) cannot be proven from a Git file. A check on the whole fabric cannot be proven from one device. If no read the leg has proves a check, change the check or give the leg the read; do not launch with it. Never word a check as something a leg must prove about itself | every check | 3 runs (one campaign) stopped on a check that could not be proven or that the real state failed |
| M6a | **Who is let in, and how does the thing that enforces the rule (a network policy, a bucket policy, a firewall, a proxy allowlist) tell them apart?** By sender address, by a named identity, by the network path they arrive on, or a combination (state each part) | a leg that grants or restricts access | authors chose differently when the spec was silent |
| M6b | **Only if by sender address: how do their requests reach the enforcing point?** Directly; through a private endpoint; or through address translation (NAT, a proxy, a load balancer). Through a private endpoint the address arrives in a different field, and the rule must test that field. Through address translation the sender's own address never arrives: a list of sender addresses cannot be enforced there, and the leg will report that and change nothing | only when M6a says "by sender address" | 4 runs failed because the target could not tell senders apart by address |
| M6c | **If the leg cannot confirm from its own reads that the enforcing point sees what M6a names: stop and report, or go ahead?** "Go ahead" covers only "could not confirm". If the leg's reads show the opposite, it stops either way. If no read it is allowed can ever show it, "stop" means this leg can never make the change | a leg that grants or restricts access | the same four runs |
| M7 | **In what order are the legs' changes applied? Who approves each gate (name and email)? Where does each gate sit:** before its leg starts; after its leg has produced its result and before the program completes; or after a leg has handed on a value and before any other leg uses it? (The plan gate always sits first.) | the program | a missing apply order was refused; gates with no named approver were assigned differently run to run |

If you cannot answer a Tier 1 question, do not launch.

### Tier 2: ANSWER ONLY IF YOU CARE. Left unstated, the leg (or the planner) decides without asking, and writes what it decided in its package or plan

One sentence each, in the section of the leg that applies it. Skip any you are happy to read at the gate.

**Choices among valid answers**
- C1. Which one, when several are valid: which free address (lowest, highest, any), which interface number, which name.
  Whether edge values are allowed.
- C2. "The same as the existing ones": how the leg recognises the existing ones, and what it does if they disagree or
  none exist.
- C3. A value from an earlier leg that is no longer valid when a later leg uses it: the later leg can only stop. A change
  leg may not pick a different value. The remedy is a fresh run of the program: a program cannot be re-run in place.
- C4. Any number in a check with no obvious basis (a threshold, a time window). A leg that picks a value with no stated basis
  is refused by its reviewer, so state the basis where you care about the value.

**A leg that works out a value**
- C5. Which things it reads to work the value out: all of a kind, or those that match a rule you state (for example "pods
  that are Running, not on the host network"). State a rule, never a list of today's members.
- C6. The form of the answer: one range, a set of ranges, or a list of single values. One range can include addresses that
  are not members when the members do not line up; a list changes whenever a member changes.
- C7. Nothing to work from: the leg reports that and hands on nothing, and every leg that needed the value makes no change.
  There is no other outcome to choose.

**A leg that grants or restricts access**
- C8. What is protected: the workload or resource on the target that the rule applies to, by name or label rule. Left
  unsaid, expect the widest reading (everything in the namespace or on the device).
- C9. What the admitted party may do: actions and ports.
- C10. Allowances already there: replace them all; keep them all; or keep them only within a limit you state (for example
  "keep any that are no wider than this change").
- C11. What is protected (C8) matches nothing when the leg runs (the namespace exists, no workload carries the label): act
  anyway, so the rule is in place when something appears, or stop and report.
- C12. No policy exists yet: create one, or stop.
- C13. What happens to everything else on the same enforcing point once the rule applies. For a Kubernetes network policy:
  once a workload is selected, traffic the policy does not list is refused, so say whether the other ports are allowed by
  name, refused, or left to the workload's own manifests. "Other ports are not touched" is not an available answer there. For
  a proxy or listener allowlist: the rule is confined to the one block, applies to the whole listener, or the leg stops and
  reports.
- C14. If more than one part of the enforcing point leads to the protected thing (two proxy blocks, two firewall interfaces,
  two access points): does the restriction cover every part that reaches it; every part except those with a property you
  state (the leg reports the value it matched); or does the leg stop and report? State a property, never the names of the parts.

**A leg that changes routing**
- C15. Only if the leg adds a summary route (an aggregate) that is advertised: do the more specific routes it covers stop
  being advertised (replace), or stay advertised beside it (accompany)?
- C16. What must stay reachable after the change, and from where.

**Other**
- C17. The thing the leg acts on (M1) is not there at all (no such namespace, bucket or device): stop and report, which is the
  usual outcome, or create it.
- C18. Facts about the environment the leg cannot find in its sources: names, pools, URLs.

**Caution on Tier 2.** Accepting a choice you did not read can cost more than refusing one.
- **A leg that changes routing: C16 is Tier 1.** Only you know what must stay reachable; a leg cannot choose it. If the leg
  adds an advertised summary route, C15 is Tier 1 too.
- **A leg that grants or restricts access in production: treat C8, C9, C10, C11, C13 and C14 as Tier 1.** They decide what
  the change allows. The record shows authors split on them, or decided them silently, when the spec was silent.
- **A value that becomes "who is admitted": C6 is Tier 1.** One range can admit addresses that are not members.

**Not shown yet:** that a leg left to decide a Tier 2 point always writes its decision in its package. It is shown for C1 and
C2 on network legs only. Until it is shown more widely, read the package at each gate for the choices you left open.

---

## Where the questions come from

| Questions | Source |
|---|---|
| M1, M6a–c, M7 (gates), C5–C17 | the generated-spec question registry (`.claude/knowledge/pipelines/requirements-authoring/DESIGN-DECISION-QUESTIONS.md`), reworded and checked by its owner. All 20 of its questions have a counterpart here |
| M2 | the Device sources grammar and the Git-only limit |
| M3 | the released example; one refused run |
| M4, M5 | two question types the registry does not ask, each with three or more stopped runs behind it |
| M7 (apply order), C4, C18 | single recorded cases |
| C1–C3 | a paper test against one objective's 20 recorded owner decisions |

Evidence and the working record: `cline_docs/reviews/requirements-stepback-2026-11-10/` (`STUDY-RERUN-CAUSES.md`,
`STUDY-BROKEN-RULES.md`, the two reviews of this checklist, `RUN-SHEET-short-spec-run1.md`).

## Keeping this current

- After each program written with it, record which questions applied, which could not be answered, the outcome, and the cause
  if it did not release. A question that is asked and never matters can go; a stop on something not asked becomes a question.
- A change to the registry's questions is a change here too (requirements-authoring-specialist).
