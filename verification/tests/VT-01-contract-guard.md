# VT-01 — A program pipeline child cannot execute without its binding interface contract

**Status**: VERIFIED 2026-07-15 (live production run on the fixed build) | Re-verify trigger: any change to the CC7 contract guard or the task-create hoist path
**Layer**: program
**Round type**: failure-injection

## Objective

A program's Program Architect emits a binding **interface contract** (shared addressing/naming
constants) that every domain pipeline must honor. The claim: a pipeline child that reaches execution
**without** that contract is refused **loudly** at execution-creation time
(`INTERFACE_CONTRACT_MISSING`) — it can never silently compose a pipeline against absent constants.
Explicitly ruled out: a contract-less child that runs anyway, or a "contract never arrived" path that
leaves no trace.

## Method

1. Create a program; let the Architect produce the plan + contract; let PLAN-SPAWN create the roster.
2. Confirm the pipeline child landed with `inputContext.interfaceContract` present and its
   `requiresInterfaceContract` flag set.
3. **Inject**: strip `inputContext.interfaceContract` from the child (keep the flag), then release the
   plan gate so the reactor attempts to queue the child.
4. Observe whether an execution is ever created.

## Config

- Any two-pipeline program; the round used the `meridian-t4a` program artifacts.
- Protocol: `pov-program` v1.0.4+ (contract-nesting hardening + structural loud-fail).

## Expected observables

- On gate release, the reactor's queue attempt **throws `INTERFACE_CONTRACT_MISSING`** at
  `prepareTaskForExecution`; **no execution row is created**; the child stays un-run.
- The refusal is independent of any single settable flag: a program pipeline child with no contract
  throws even if the flag is absent (the **structural arm**, keyed on the parent program title-token
  `(protocol: pov-program`), not on a mutable metadata field.

## Results

**Two defects found first, published deliberately** — this round's real value:

- **F11 (contract double-nesting):** the PLAN-SPAWN harness wrote the create call with
  `parameters.parameters.interfaceContract` — nested one level too deep — and the router's default-strip
  `safeParse` silently dropped it, so the child persisted with no contract. Probabilistic (other runs
  nested correctly); a coin-flip on a load-bearing field is unacceptable.
- **F12 (guard hole):** the loud-fail guard fired only when `requiresInterfaceContract` was set — and
  that flag was set by the **same** create call that lands the contract. So "contract never arrived"
  (the likely failure) left no flag → the guard could not fire → the program would have **silently
  composed** a contract-less pipeline. The belt-and-braces had no braces for the most probable failure.

**The fixes (dual-specialist reviewed):** a targeted no-clobber **hoist** at the router (recovers the
unambiguous double-nest before the strip, then still gets the schema's deep dangerous-key strip + 64KB
cap); and a **structural arm** on the guard — a PIPELINE child owned by a `pov-program` parent with no
contract THROWS even with no flag, evaluated at EXECUTE time (immune to create-ordering slips).

**Re-run on the fixed build (2026-07-15, program `cmrls2jh7…`):** the contract LANDED on the child
(`IC:Y`, flag true — the router hoist works live); then the injected strip → gate release → the queue
attempt threw `INTERFACE_CONTRACT_MISSING`, **no execution created**, child stayed OPEN. Requirement
met in both directions: contract present ⇒ runs; contract lost ⇒ loud fail, no run.

## Conclusion

**Verified live.** A program pipeline child cannot execute without its binding contract, by any path —
the flag arm covers "contract present then stripped," the structural arm covers "contract never
arrived." The two defects this round exposed are fixed and pinned.

## Enforcement

- Protocol: `pov-program` v1.0.4+ (nesting sharpened; structural guard makes the prose no longer
  need to be perfectly followed).
- CI pins (every commit): `test:cc7-contract-guard` (12 assertions — includes B1.2 asserting the
  title-token discriminator and forbidding the template-metadata form).
- Behavioral (database-level, on path changes): `scripts/test-cc7-contract-guard-behavioral.ts`
  (5 assertions — hoist lands contract+flag; structural arm throws on a program child; non-program
  child untouched).
- Residual: F13 — the loud-fail is loud in LOGS but the refused child sits OPEN with no FAILED
  status/comment (surfaced later; fixed as part of the F16 frozen-cone work — see VT-02).
