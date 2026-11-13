# Gates — what to check before you release one

A gate is a point where a program stops until a person approves. This page says what to check at each kind of gate, and how to
apply a change package once its gate is released. Start with the gate table in [OPERATING.md](OPERATING.md), step 3; this page is
the detail behind it. Terms are in [GLOSSARY.md](GLOSSARY.md).

**Start every gate with the stored facts:** `npm run report:gate -- <gate task id>` (in the pAIchart directory) prints the checks
for that gate, each marked ✓ or ✗, with the reviewer's blocking reasons. It reads only and decides nothing.

## The principle

**A gate is not a rubber stamp on an agent's verdict. It is your own evidence step.** A reviewer's approval and its score are an
agent's judgement; packages approved at 90 out of 100 with no blocking issue have been defective, and were caught at a gate.
Treat every approval as a claim to check.

## Plan gate

Nothing is built yet, so this is the cheapest place to catch a mistake. Read the plan (web app: **Projects** → the project → the
*Produce plan* task → **Agents → Artifacts**).

1. **The legs.** Every leg you expect is there, in the order you expect, and none you did not ask for. Each leg states its type:
   a **value** leg works out a value and changes nothing; a **change** leg produces a change package. Check each type against
   what that leg actually does. A leg that works out a value *and* changes a system is a change leg.
2. **The systems.** The devices, files and services each leg will read are the ones you meant.
3. **Every value the plan works out or states.** Recompute it yourself.
4. **"Assumptions & Open Questions".** Each item is a decision the planner made for you, or one it refused to make. Where you are
   the person who decides, decide it: write the answer in the note you release the gate with.
5. **A configuration form you have not used on that platform before.** Try it on the device in a configuration session and abort
   the session: nothing changes, and you learn in seconds whether the platform accepts it.

**If the plan is wrong, do not release.** A plan cannot be edited after the fact. Which fix depends on what is wrong:

| What is wrong | What to do |
|---|---|
| a value, or an open question (the shape of the plan is right) | answer it in the gate note and release; the legs read the note |
| the shape: a leg missing or of the wrong type, a field the legs need is absent | fix the spec ([WRITING-A-SPEC.md](WRITING-A-SPEC.md)) and launch a new run. Re-running the planner does not help: legs already created never receive a corrected plan |

A new run costs one planning step. A run on a wrong plan costs the whole run and gives you evidence you cannot trust.

## Value gate

A leg has worked out a value (an address, a range) that later legs will use exactly as given.

1. **Check the value yourself** against the sources the leg read: it is inside the pool, and nothing already uses it.
2. **Read the containment line** in the gate report. `checked-clean` means the platform found the value inside the range it was
   drawn from. It does not prove the leg read every device: a device left out of the spec's Device sources was never checked.
3. **Releasing fixes the value.** A change leg uses it and may not pick another. If the value is wrong, do not release: the remedy
   is a new run.

## Change gate

A leg has produced a change package. Read the facts first, then the package.

1. **The gate report:** the leg's outcome, the reviewer's verdict and blocking reasons, the edit receipt for a kept file (how many
   edits, all applied or not, which files), and any platform warnings.
2. **A mechanical check can be wrong about intent.** The format checks assume a leg adds configuration. A leg that *removes*
   something correctly contains none of it, and a check may then report lines "missing". Read such a result against what the leg
   was asked to do.
3. **A table that sets two different measures side by side as equal** is never cosmetic, even when the conclusion happens to
   hold. Later legs use the number.
4. **Read each validation step as the person who will run it.** Can it pass, given what this change is required to do?
5. **Search the package for secret placeholders:** `grep -nE '<{1,2}REDACTED' <package file>`. Every hit inside a block you would
   apply is a stop (see "Applying a package").
6. You can re-check a package against the program's contract by hand:
   `npm run check:package -- --package <file> --contract <file>`. It reports forbidden text that is present and required lines
   that are absent. Both halves matter: a package can be clean of forbidden text and still be missing a required line.

**Releasing a change gate applies nothing.** It records that you accept the package.

## Applying a package

Applying is your step, in your own change process. pAIchart never does it.

1. **Capture the state before the change**, as the package's own validation steps ask. Without it you cannot prove what changed.
2. **Apply the package exactly as written.** Never correct a line while applying. A wrong line is a finding: hold, and get a
   corrected package from a new run. What you apply must be what was reviewed.
3. **Never apply a block that contains `<<REDACTED-SECRET>>`, `<REDACTED-SECRET>` or any other `<REDACTED…>` form.** These are
   placeholders the platform puts where a secret was. Devices and services accept them as literal values: a switch takes one as
   a password or community string, and `nginx -t` or `otelcol validate` pass with one in place. On a switch, replacing the whole
   configuration from a file with a redacted password line can delete that user. Leave the secret-bearing line out of what you
   apply; for a rollback, restore from the device's own saved configuration, not from the package text. Never type the real value
   in by hand: what you applied would then differ from what was reviewed.
4. **Use a configuration session and read the diff before you commit.** The diff holds only the package's lines. Aborting costs
   nothing.
5. **Run the package's validation steps, and read what kind each one is:**

   | Kind of step | It passes when | It fails when |
   |---|---|---|
   | gives an expected output | the named fields match | a named field differs |
   | compares before and after | the named fields are unchanged, or changed as the step says | a named field moved (timers and counters differing is not a failure) |
   | asserts something is present (no expected output, because the feature has never existed on this device) | the named fields are present with the stated values | a named field is absent or contradicts |

6. **A failed check is not always a rollback.**
   - The state is wrong (a session is not up, a route is absent, a protocol is inactive): the change did not do what it claimed.
     **Roll back** as the package says.
   - The state is right and only the display differs (a name where the package expected an id, an extra column, different
     formatting): **hold and record it; do not roll back.** An unnecessary rollback of a live change is itself a risk.
7. **Give it time.** A protocol needs seconds to converge and some fields are only right afterwards. Check again over about
   90 seconds before you call a failure.
8. **Save the configuration** once the change is verified (`write memory` on a switch). Packages do not carry this step. If you
   choose not to save, say so in the gate note.
9. **Read the raw output. An empty result is not a pass.** A command that prints nothing may be telling you the feature is
   disabled.

For a package that edits a kept file, apply the edits as described in [PIPELINES.md](PIPELINES.md), "Kept files", and check the
kept original against your live file first (`scripts/held-base-check.ts`).

## Apply gate

Some programs change a system in phases, and the next leg must read the changed state. Such a gate's description says *apply,
then confirm*. Apply that phase as above, verify it, then release the gate. Most programs have no apply gate.

## The package is right and a validation step is wrong

Sometimes the change is correct and verified, but one of the package's validation steps cannot pass or checks the wrong thing.
An agent can predict what it configures; it cannot see how the device will display a feature that has never been on it.

- Check the property the step was trying to prove, by a means the change does not rule out.
- Release only if that property holds and the applied state is correct.
- Say in the gate note that you departed from the package's own validation, and how.

## Settling a gate without approving the package

A program reaches its final step only when every gate is completed. If a change leg came back `needs-revision` and you will not
run it again, leaving its gate open leaves the program open.

Complete the gate with a note that says **"Gate SETTLED, package NOT APPROVED"**, the leg's blocking reason, and that nothing is
released. The program then finishes and records `programReleasable: false` with the reason. Nothing is released, because release
depends on each leg's outcome and not on the gate.

- This is the owner's decision each time.
- The platform cannot tell a settled gate from an approved one; only your note says so. Keep it factual and under 500 characters
  (a longer note is not stored).

## What does not work

- **A comment reaches no agent.** Not the next leg and not the final review. During a run you can stop a program or let it
  proceed; you cannot improve it.
- **Do not write an earlier run's specific defect into anything an agent reads** (a task description, a clearance note, a spec).
  The agent then avoids that one line, and the run proves nothing more. State the property you need.
- **Do not run a stopped leg again in place.** A leg stopped by the duplicate check freezes everything after it. Launch a new run
  ([TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again in the same project").
- **Running a leg again after the final review has read it leaves that review out of date.** Run the review again, or record
  the deviation before you release.
