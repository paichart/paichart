# Program shapes

Which shape of program suits which change. Read this after [OPERATING.md](OPERATING.md), when you are deciding how to split an
objective into legs. The procedure for designing a program is in [design/DESIGNING-A-PROGRAM.md](design/DESIGNING-A-PROGRAM.md),
and a worked decision is in [design/FIREWALL-POLICY-USE-CASE.md](design/FIREWALL-POLICY-USE-CASE.md). Terms are in
[GLOSSARY.md](GLOSSARY.md).

## What a program is, as a shape

One spec. A planner reads it and writes a plan and an **interface contract**: the values every leg must use exactly. A person
approves the plan. The legs then run, each a pipeline for one domain or one group of systems, side by side or one after
another. A final review checks from recorded facts that the legs fit together. The platform records whether the program is
releasable, and a person decides.

Any objective that crosses more than one team, vendor or tool, over one shared design, is a candidate. Many objectives that
feel like a program are not: a few devices of one vendor, changed by one team, are one pipeline.

## The shapes

| Shape | What it is | How the legs are coordinated | Gates |
|---|---|---|---|
| **Single pipeline** (not a program) | one team, one vendor; one designer can hold the whole change | nothing to coordinate | none: it runs through, and you read the result and decide |
| **Parallel legs** | several legs for different vendors or teams; everything they must agree on is known up front | the interface contract | the plan, then one per leg |
| **Sequenced legs** | a later leg needs what an earlier leg *produced* (a value, a design) | the earlier leg's result is handed to the later leg | the plan, then one per leg |
| **Grouped legs** | more than eight systems, or a mix of parallel and sequenced | systems are grouped into legs; the parallel part by contract, the sequenced part by hand-over | the plan, then one per leg |
| **Sequenced legs with an apply between them** | a later leg needs the earlier change to be *live* (a migration phase, a staged cutover) | a person applies the earlier package at a gate; the next leg reads the changed system | the plan, then an apply gate per phase |

Parallel and sequenced legs have both released on live runs. Grouped legs are a combination of the two. A program holds at most
eight pipelines.

## Choosing

| Question | Single pipeline | Parallel | Sequenced | Grouped |
|---|---|---|---|---|
| How many vendors or tools? | one | several | several | several |
| How many teams approve? | one | several, a gate each | several, a gate each | several |
| What do the parts depend on? | nothing outside one design | values agreed up front | something an earlier leg produces | both |
| How many systems? | any that one pipeline can hold | up to eight legs | up to eight legs | more than eight: group them |

- **Start with a single pipeline.** Move up only when a real boundary forces it: a second vendor, a second team, or a value one
  part must produce before another can use it.
- **Parallel is the default program.** Use it as soon as the work splits by vendor or team and everything shared can be stated
  up front.
- **Sequence only for a real dependency.** If what the legs share can be stated as a fixed value in the contract, prefer
  parallel: it is faster. Sequencing costs elapsed time.
- **Group when the change is wider than eight systems.** Keep each leg to about five or six devices
  ([PROGRAMS.md](PROGRAMS.md), "How big a program can be").

### Sequenced, or sequenced with an apply?

Ask whether the later leg could do its job from the earlier leg's document alone. If yes, it is plain sequencing: cheaper, and
nothing is applied during the run. If the later leg exists to observe what actually happened (checking that a migration phase
took, validating after a cutover), only a fresh read of the changed system can answer it, and a person must apply between the
legs.

What an apply between legs costs you:

- **The platform does not know whether you applied.** A gate is a task you complete; nothing checks what you did first. If you
  release without applying, the next leg honestly reports the change absent, which looks the same as a wrong package.
- **A defect released at such a gate is in your system**, not in a document. The fix is an operation on the system, and the
  next leg designs against whatever is there.
- **A reviewer cannot see the system.** It reviews a document. Anything about live state is yours to verify at the gate
  ([GATES.md](GATES.md), "Applying a package" and "Apply gate").

## What fits well

A program wants each leg to end in a clean change package, and the join between legs to be checkable from data: an address
plan, a flow definition, a shared label. Objectives like that fit best, because the final review checks data. Where the join
between legs is a judgement (does this cluster's network design suit that switch fabric?), the program still runs, but that
judgement is yours at release, never a check the platform makes.

## A caution: a leg with two or more upstream legs

Every program run so far fans **out**: each leg that uses a value has had exactly one upstream leg. A leg with two upstream
legs (a fan-in, or a diamond where two legs both depend on one and a fourth depends on both) can be built the same way as any
sequenced leg, but **it has never been run**, and there is a known gap: the check that a leg applied the right upstream value
can be satisfied by one upstream leg while the leg actually used the other's value. Until that is fixed, avoid a design where
one leg takes values from two legs; if you must, check at that leg's gate, by hand, which value it used from which upstream leg.
