# VT-03 — A program parked at its human approval gate stays parked indefinitely; nothing queues, nothing misfires

**Status**: VERIFIED 2026-07-16 (32-minute monitored window) + a permanent live exhibit | Re-verify trigger: any change to the stale-execution sweep or the can-never-run event anchor
**Layer**: program
**Round type**: functional (negative control)

## Objective

A program's mandatory plan-approval gate is a template-less APPROVAL task the platform can never
auto-complete. The claim: while the gate is unreleased, (1) **nothing downstream ever queues**, (2)
**no timeout mechanism misfires** against the parked tasks, and (3) the failure-detection machinery
(the can-never-run marking that powers VT-02) **never touches** an awaiting-human gate. This is the
negative control that proves the escalation machinery is anchored on a *refused execution attempt*,
not on elapsed time.

## Method

1. Create a program; let the Architect + PLAN-SPAWN build the gate + both legs + producer + reviewer.
2. **Do not release the gate.**
3. Observe over a window that covers the platform's stale-execution sweep cycle (the 20-minute sweep
   plus engine cycles) — poll task states and executions; watch the logs for the program/stage ids.

## Config

- Any two-pipeline program; the round used the `meridian-t4b` artifacts (Loopback2 objective, chosen
  distinct from a concurrently-running program to avoid the duplicate-objective pre-flight).
- Protocol: `pov-program` v1.0.6 (the fixed can-never-run build — this is also that fix's negative control).

## Expected observables

- Zero executions queued behind the gate for the whole window; the gate stays IN_PROGRESS.
- Zero `executionStatus` marks on any parked task; the program stays at exactly two executions
  (the planning pair).
- No `TASK_CAN_NEVER_RUN`, no stale-flip, no auto-queue log lines for the program/stage in the window.

## Results

**Verified over a 32-minute window (2026-07-16, program `cmrmhxr8f…`):** polled every 2 minutes —
zero executions queued behind the gate, zero `executionStatus` marks on any parked task, the program
stayed at exactly two executions, the gate stayed IN_PROGRESS. Logs were silent for the program/stage
ids across the window (no `TASK_CAN_NEVER_RUN`, no stale-flip, no auto-queue). Two things proven at
once: (1) a parked program forms no timeout-zombie — there is nothing to flip, because every task
behind the gate has zero executions; (2) **the F16 negative control** — the can-never-run machinery
(VT-02) never touches an unreleased gate or the tasks parked behind it, because its event anchor is a
*refused execution attempt*, and an awaiting-human gate never attempts one.

**Permanent live exhibit:** the demo POV **"pAIchart Verified Delivery — Live Exhibits"** carries
**Exhibit 4**, a program deliberately left at its gate forever (the machine even titled the gate
"PERMANENT PARK — DO NOT RELEASE"). It extends this 32-minute window indefinitely: any visitor can
open the *Program Runs* stage *"Program: Exhibit 4"* and confirm the legs and synthesis tasks sit OPEN
with zero executions, no failure marks, no timeout flags — today, or in six months. The longer it
sits unchanged, the stronger the evidence.

## Conclusion

**Verified live**, and continuously verifiable via the permanent exhibit. A program awaiting its
human release parks indefinitely with none of the failure or timeout machinery firing against it.

## Enforcement

- Protocol: `pov-program` v1.0.6 (event-anchored can-never-run; the anchor is what excludes parked
  gates structurally).
- CI pin (every commit): `test:cc7-contract-guard` includes the parked-gate exclusion (F16.4 — the
  walk's forward direction structurally excludes upstream parked gates).
- Residual: a program-level watchdog for hang classes with *no* event anchor is deliberately deferred
  (no such class is known); the trigger to build it is documented.
