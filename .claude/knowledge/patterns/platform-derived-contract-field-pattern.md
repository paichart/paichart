# Platform-Derived Contract Field — derive, don't instruct

**Confidence**: 90% ✅ (measured on 33 stored programs; live-proven 2026-11-17)
**Category**: Architecture
**Added**: 2026-11-17 (pipeline-harness; owner-approved step-back on register ARCHITECT-COMPOSED-DESCRIPTOR)
**Related**: `facts-only-tighten-pattern.md` (a computed fact may only tighten) · Protocol 10 (facts vs verdicts) · LL-CS-73/74 ·
record `cline_docs/reviews/architect-contract-stepback-2026-11-17/` (CORPUS.md, DERIVATION-MAP.md, MODEL-EVAL-DESIGN.md)

---

## The pattern in one rule

**If the platform can compute a value from something already declared, compute it — do not ask an agent to write it.** An agent
copies a value it is given very reliably; it fills a silence badly. Instructions against filling the silence help only partly; a
value the platform derives is right for every model, every run.

## When to use

- An agent is asked to restate, in a structured field, a value that is already present in a declared input (a spec line, a source
  block, a contract key).
- Errors in that field cluster where the input was SILENT, not where it supplied the value.
- You are reaching for "a better model" or "a stronger rule" for that field.

## The evidence that earned it

The Program Architect (Sonnet 5) wrote the interface contract for 33 stored programs:

| Spec... | Error rate |
|---|---|
| supplied the value | 3 / 87 (3.4%); 12 / 12 after the latest text |
| was silent | 8 / 20 (40%); composed a `serviceDescriptors` object on 4 of 5 Git-only specs |

Copying was perfect (58/58 descriptor URLs, 26/26 sources blocks). A rule naming the forbidden *process* ("never assemble one from a
source line") failed on its first chance. Deriving `serviceDescriptors` from the declared `device-read` / `live-read` lines at leg
creation removed the class: on the next Git-only run the Architect composed again and the platform removed both values. A $42 model
lab was designed and parked — the defect was not the model's accuracy but the field's existence.

## The shape

```
at the one point the platform writes the field (one function, one door):
  derived = f(declared inputs)                 // only from what a declared line names
  if derivable:   field = derived              // replace / remove an agent value that differs
  else:           keep the agent value only if it is well-formed, else remove
  record a FACT: { derived, kept, replaced, removed:[{ key, reason }] }   // visible at the gate
```

- **Never write a value no declared input names** — the platform derives, it does not invent.
- **One function, one door**: every path that writes the field goes through it (the descriptor derivation sits in `plan-spawn-carry.ts`).
- **Record what changed** as a fact a person sees before spend; a correction that is invisible erodes trust.
- **Replay first**: run the derivation over the stored corpus and show it changes only the known-wrong values (here: 5 of 163 contracts,
  0 of 58 correct URLs). Any correct value that would move is a design error — stop.

## Anti-patterns

- Adding another sentence to the agent's text for the same field after it already failed once (it held 0 of 1 here).
- Moving to a stronger model before measuring whether the errors are copying or gap-filling.
- Silent correction (no fact) — the gate reader cannot tell the plan was fixed.
- Per-path derivations (the create path, the heal path and the reviewer copy disagreeing).

## Production use

- `lib/agents/harness/service-descriptors-derivation.ts` (`deriveServiceDescriptors`) via `lib/agents/harness/plan-spawn-carry.ts`;
  fact `interfaceContractSource.serviceDescriptors`; plan-gate line in `scripts/gate-check.ts`; canary control `arch-text-2-descriptors`.
- Earlier instance of the same idea: the platform COPIES the plan's contract to every leg rather than asking the harness to transcribe it (C2/C3, `plan-spawn-carry.ts`).
