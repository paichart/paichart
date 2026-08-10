# Program input artifacts — template

Two files define a program run. Copy both, replace the placeholders, delete what does not apply.

```
cp -r program-artifacts/_TEMPLATE program-artifacts/<run-name>
mv <run-name>/requirements.template.md <run-name>/requirements.md
mv <run-name>/topology.example.json    <run-name>/topology.json
rm <run-name>/README.md
```

| file | what it is |
|---|---|
| `requirements.template.md` | **what to do** — scope, objectives, approvals, acceptance |
| `topology.example.json` | **what exists** — the environment, and which values are runtime-derived |

**Audience**: the Program Architect reads **only these two files** and has **no live state access**.
Anything it must know has to be here. Anything it *cannot* know must be declared runtime, or it will
guess.

## Why this template exists

Before 2026-08-10 each run copy-forked the previous run's artifacts. Measured across the 13 runs then
in this directory:

- **13 `topology.json` files, 13 different checksums** — no shared shape.
- **12 `requirements.md` at ~1.4–3.4 KB; one at 22.9 KB.** The large one had accumulated three weeks
  of hard-won rules; the other twelve carried none of them.

So a new run started from an arbitrary predecessor inherited either **no lessons**, or **all the
lessons plus somebody else's topology to strip out**. The durable know-how and the run instance were
sharing a document.

This directory is the durable half. Instances stay small.

## The rules are tagged with the run that earned them

Every ⚠️ clause in `requirements.template.md` names the run it came from. That is deliberate: these
clauses read as verbose until you know what they cost, and the provenance is what lets you check
before deleting one.

The most expensive is the **fixed check numbers** rule. On Run 15 a new clause was added to a
requirements file and the reviewer renumbered it into the slot held by the minimality check — which
it then never performed. A non-minimal result shipped as approved. **A renumbering silently deletes a
check.**

## The one rule to internalise

> **State what must be TRUE. Do not name the string that reports it.**

Every agent in the program reads `requirements.md`. A machine pass-condition written there becomes a
**target an agent can aim at instead of the requirement** — and hitting the target while missing the
requirement is the failure mode this whole template exists to prevent.

Declaring such a string "reference data" limits the damage. Omitting it removes the temptation.

## Curating this template

When a run teaches something durable, it belongs **here**, not only in that run's instance — that is
the mistake this replaces. Add the clause, **tag it with the run**, and keep it stated as a property.

Related platform-side guidance (in `copov15`):
- `.claude/knowledge/pipelines/PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md` — designing a program
- `.claude/knowledge/pipelines/PROGRAM-HARNESS-USER-GUIDE.md` — running one
- `.claude/knowledge/pipelines/PROGRAM-RUN-FORENSICS-GUIDE.md` — reading the result
