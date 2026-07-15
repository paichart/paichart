# VT-NN — <one-line claim under test>

**Status**: VERIFIED <date> | Re-verify trigger: <protocol bump / pin rename / N months>
**Layer**: pipeline | program | platform
**Round type**: functional | failure-injection | adversarial | policy-audit

## Objective

The single claim this test verifies, stated as a falsifiable sentence. If the round tests a failure
mode, state the *wrong* behaviors explicitly ruled out (e.g. "must not hang; must not silently
compose").

## Method

The exact procedure, numbered, including the injected fault and WHERE in the lifecycle it is injected
(pre-gate / post-gate / mid-run). Anyone with a pAIchart environment should be able to follow it.

## Config

Public inputs: artifact URLs (`program-artifacts/…`, `verification/configs/…`), protocol name +
version, task shapes. No internal identifiers.

## Expected observables

The precise, machine-checkable facts a passing run produces — gate field values, task states, comment
content patterns, structured-fact values. This section is the contract; "it worked" is not an
observable.

## Results

What the production verification run actually showed, with timestamps and the observable values.
Include anything that did NOT match expectations, and what was done about it. If the round surfaced a
defect: the defect, the fix, and the re-run.

## Conclusion

Plain statement of the claim's status. Downgrade honestly: "verified live", "verified on a fixture",
"reasoned but not reproduced", or "not externally reproducible (requires internal access)".

## Enforcement

- Protocol version(s) the behavior ships in.
- Named CI regression pins guarding the behavior on every commit.
- Known residual limitations, each with its explicit trigger-to-act.
