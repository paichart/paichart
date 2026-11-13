# Designing a program

How to turn an objective that spans several systems into a program. Read [PROGRAM-SHAPES.md](../PROGRAM-SHAPES.md) for the
shapes, and [FIREWALL-POLICY-USE-CASE.md](FIREWALL-POLICY-USE-CASE.md) for one decision worked through. When the design is
settled, write the spec with [WRITING-A-SPEC.md](../WRITING-A-SPEC.md). Terms are in [GLOSSARY.md](../GLOSSARY.md).

## 1. Do you need a program at all?

A program adds a plan gate, a gate per leg, a shared contract and a final review. Earn it. Ask, in order:

1. **Is there more than one real boundary?** A boundary is a different vendor or tool, a different team that must approve
   separately, or something one part must produce before another part can be designed. With no boundary it is a single
   pipeline: one pipeline can change several devices of one vendor for one team.
2. **What kind of boundary?** Vendors or teams only, with everything shared known up front: parallel legs. A later part needs
   what an earlier part produces (an address after translation, a derived range): sequenced legs.
3. **More than eight parts?** A program holds at most eight pipelines. Group the systems: one leg per segment or vendor group,
   not one per device. Twelve devices are three legs of four.

Write down, in one paragraph, why it is a program and why this shape. A wrong answer here is the most expensive mistake,
because everything after inherits it.

## 2. The two input files

- **`topology.json`** holds facts: the systems, in order where order matters, which vendor or tool each is, where each one's
  configuration is read from, and the read-only services to use. **Describe a service, never what to do with it.** A line
  about registering or removing a service gets copied into the plan, and the final review is then asked to judge something it
  cannot see; a correct program has been refused for exactly that.
- **`requirements.md`** holds the intent: the outcome, the boundaries ("nothing else changes"), who approves what, and the
  final checks. It is the planner's brief.

Both files are fetched by URL and read by an agent, so treat them as you would any input: no secrets, and nothing copied from
an untrusted source.

## 3. The interface contract

List what **every leg must use exactly** and that is known before any leg runs: a flow definition, a naming rule, an address
plan, a default-deny rule. The planner turns these into the contract and every leg receives it as fixed values.

- **Make each item data, not prose.** A value, a name, a range. If something can only be said as a sentence, it is a
  requirement for the planner, not a contract value.
- **Two legs that each need the other's result cannot be sequenced.** Decide the shared value up front and put it in the
  contract; both legs then design against it.

## 4. The legs and their order

- **Parallel** is the default: no leg waits for another.
- **Sequenced:** a leg waits for an earlier leg and receives its result. Use it only where the later leg cannot be designed
  without that result. A value handed on is used exactly as given; the later leg may not choose another.
- **A leg with two upstream legs** has never been run and has a known gap: read the caution in
  [PROGRAM-SHAPES.md](../PROGRAM-SHAPES.md) before you design one.
- **Keep it shallow.** A long chain of legs each waiting on a gate is slow and fragile. Prefer parallel legs and a contract.
- **Size each leg** at about five or six devices ([PROGRAMS.md](../PROGRAMS.md), "How big a program can be").

## 5. The gates

- The **plan gate** is always there and cannot be skipped: nothing runs before a person has approved the plan.
- Then **one gate per approval boundary**: after a value is worked out, and for each change package.
- A gate waits for a person: the project's owner, a team member or an administrator releases it ([GATES.md](../GATES.md),
  "Who can release a gate"). Say in the spec who approves each, by name and email, and where each gate sits. The named
  approver is who is asked; the platform does not restrict release to them.

## 6. The domain of each leg

Each leg runs under one domain's rules, named in its title: `network-provisioning` and `network-derivation` (network devices),
`kubernetes-gitops`, `terraform-iac`, `observability-config`. Use these. A leg for a system none of them covers needs a new
domain, which is beyond what these documents describe.

## 7. The final review

The last step checks that the legs fit together: each leg did exactly its part of the contract, every leg that uses a value
applied the value that was published, and nothing was widened. It works from recorded facts, not from re-reading the legs'
prose. Write the spec's final checks so that each can be verified from what the legs produce
([WRITING-A-SPEC.md](../WRITING-A-SPEC.md), question M5). Where two domains meet in a way only a person can judge, say so: that
judgement is yours at release, not a check.

## 8. The first run is a test of the design

Run it once and read every gate ([GATES.md](../GATES.md)). Expect the first run of a new design to find something: an unstated
decision, a device left out of a leg's list, a check no leg can prove. Fix the spec and run again; a refused program is never
repaired in place.

## What you cannot design around

| Fact | If you ignore it |
|---|---|
| A program never applies a change | a design that expects a later leg to see an earlier leg's change, without a person applying it between them, sees nothing |
| The plan gate cannot be skipped | — |
| At most eight pipelines | group systems into legs |
| The contract is fixed when the legs are created | a corrected plan does not reach legs that already exist: launch again |
| Release depends on every leg's outcome, from recorded facts | a high score does not rescue a refused leg, and a refused leg cannot be re-run to a release |
| The two input files are read by an agent | anything written in them can steer it |
