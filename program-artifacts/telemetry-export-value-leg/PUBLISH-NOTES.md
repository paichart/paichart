# Publish notes: telemetry-export-value-leg

**Not a program input.** The program reads `requirements.program.md` and `topology.json` only. This note records how the
spec was produced, so the spec itself carries no history.

**DRAFT, not yet published.** It is in the local working tree only: not committed, not pushed, not served.

## What this is: a hand-shaped derivative of `telemetry-export-genspec-t1zero-v2`

This spec exists to run the owed **value-leg control of promotion E**. Under pov-program 2.0.0, the Program Architect
types the fabric leg `leg type: value` (token `network-derivation`) only where the requirements say that leg changes
nothing, and it must quote the phrase it relied on.

`t1zero-v2` does not say that. Its `topology.json` says *"The change is to advertise the covering range in place of the
individual routes"*. Its requirements ask the fabric deliverable for *"the exact description-marker text this leg
applied"*. Control 2's Architect therefore typed the fabric leg `change`, which was correct.

**The A10 limit.** The generated requirements template has no slot for a "this leg changes nothing" phrase, and the
design-decision registry (`DESIGN-DECISION-QUESTIONS.md`) has no leg-type key. So no generated spec can yield a value
leg (`PROGRAM-HARNESS-USER-GUIDE.md` §10b). This spec is therefore hand-edited. **No row key was added.** Inventing one
outside the registry is forbidden, so the phrase is carried in prose instead.

## The "regenerate, never hand-edit" rule, and why it does not apply here

`PUBLISH-GENERATED-SPEC.md` §2 says a defect found in a GENERATED draft is fixed by regenerating, because a hand-edited
spec "tests nothing" about the generator. **This is not a generated spec.** It is a hand-shaped derivative, and what it
tests is the pov-program 2.0.0 Architect's leg typing, not the requirements generator. Regenerating cannot produce the
phrase (A10).

**The tension is real, and stated openly here:**
- The body still carries the generator's header (`Authored in … Iteration: 20260930-0710`) and its 45 `(declared — item
  N: "…")` citations of the t1zero objective. Those citations remain verbatim against that objective (checked below), but
  the document as a whole is no longer that pipeline's output.
- Do not use this spec as evidence of generator quality.
- Do not carry its edits back into `t1zero-v2`.
- When the F lane adds a changes-nothing slot, a generated value-leg spec supersedes this one.

## Every edit and its reason

The only base is `t1zero-v2`. **`requirements.program.md` is exactly `--program-view(requirements.md)`** (verified with
`cmp`), so both files carry the same body edits, and the program view's READING NOTES block is unchanged.

| # | where | edit | why |
|---|---|---|---|
| T1 | `topology.json` `fabric.exporterPool.existenceAssumption` | "The change is to advertise the covering range in place of the individual routes" → the pool "stays exactly as it is: the fabric leg changes nothing on either switch. It reads the pool and publishes the covering range … does not change how they are advertised." | This sentence was the change-leg signal control 2 relied on. It is the ONLY topology edit. |
| R1 | Program scope, leg count line | "one upstream leg that derives a value" → "derives and publishes a value and changes nothing" | Puts the phrase where the Architect first reads the legs. |
| R2 | Program scope, leg 1 | "**Network provisioning (fabric)**" → "**Network (fabric) — value leg**", plus "It changes nothing (see Pipeline 1); its design-decision rows are keyed `network-provisioning.*`." | Removes a change-token name used as a label. The rows keep their key, which the Architect guidance applies "whichever of the two tokens you give it". |
| R3 | Program scope, out-of-scope line | "any of the four produced change packages" → "three"; "change packages only" → "change packages and one published value only" | The value leg has no package. |
| R4 | Gate table, fabric exporter value row | "the value produced by the network-provisioning (fabric) leg" → "the value published by the fabric leg" | Label consistency. The gate already approved a value, not a package. |
| R5 | Dependency consequence | `network-provisioning (fabric) leg →` → `fabric leg →` (×2) | Label consistency. No edge changed. The value leg still has no incoming pipeline edge (a producer), only the plan gate. |
| R6 | Pipeline 1 heading | "Network provisioning (fabric)" → "Network (fabric) — value leg" | As R2. |
| R7 | Pipeline 1, new first bullet | "**The fabric leg changes nothing.** It harvests read-only and publishes one derived value, the exporter-range CIDR; it changes no device and produces no configuration, no change package and no rollback plan." | **The quotable sentence** the Architect relies on. |
| R8 | Pipeline 1 deliverable bullet | "the exact description-marker text this leg applied" → "… this leg selected on … — the marker it read, not anything it wrote" | This was the second change-leg signal in control 2. |
| R9 | Pipeline 1 validation | Labelled "the leg's whole validation; nothing is changed, so no rollback". "re-run the same read-only interface harvest across the fabric's scope" → "re-derive from this run's harvest … to the harvested interfaces"; "re-obtained" → "harvested". | A value leg has no validation child. Its Derivation Architect makes no device contact (network-derivation protocol), so a second harvest would have no executor. Validation re-derives the value. |
| R10 | Derivation block, first bullet | "shown in the DESIGN" → "shown in the DERIVATION" | The value leg's Phase 1 is a derivation, not a design. |
| R11 | Consumer legs 2–4 and Design constraints | "the network-provisioning (fabric) leg" → "the fabric leg"; "produced by" → "published by" | Label consistency (×4). |
| R12 | Acceptance, first two bullets | "Each change package" → "Each of the three change packages (…)", plus "The fabric leg has neither: it publishes a value and validates by re-deriving it (Pipeline 1)." Also "change packages only" → "change packages and one published value only". | No rollback or package is required of a value leg. |
| R13 | Node C checks 1, 2, 4 and the consuming-leg attribution | Label → "fabric leg"; check 1 "produced" → "published"; check 2 "(as re-obtained by the fabric leg's own validation step)" → "(as harvested by the fabric leg in this run)" | Consistent with R9. **Check numbers unchanged** (1, 2, 2b, 3, 4). |

Not touched:
- every Design-decisions row and every `(declared — item N: "…")` quote;
- the gate rows and gate positions;
- the three consumer legs' duties, branches and collateral;
- *Why this is sequenced*;
- *Open questions*;
- the Writing-rules section of both files.

## Left inconsistent on purpose (cannot change without breaking a citation)

- Row `network-provisioning.population` quotes item 5: *"The fabric leg reports, in its own deliverable, the description
  marker it applied."* Here "applied" means the selection filter it applied. R8 states the leg's duty unambiguously.
- Row `approver.fabric-exporter-value` quotes item 7: *"fabric exporter value (network-provisioning)"*. That is the
  objective's gate label, not a token instruction.
- Each Design-decisions row asks the template's fixed question, *"which surface of the leg's service does it act on"*.

## Checks run (2026-10-06)

- `requirements-rules.py --check requirements.md`: byte-identical to canonical (232 non-blank lines), exit 0.
- `requirements-rules.py --check requirements.program.md`: exit 1. This is expected, because the program view replaces
  the rules. The `t1zero-v2` program view gives the same exit 1.
- `requirements-rules.py --program-view requirements.md` reproduces `requirements.program.md` byte for byte.
- `requirements-rules.py --lint <file> --declared <t1zero objective>`: 0 state-shaped tokens on both files.
  - The objective is the generation task `cmunrlf23001ayx1ic5xns8vd`, read from prod read-only.
  - It is kept outside this directory.
- `check-requirements-citations.py`: 45 citations, 45 verbatim, 0 failing on both files. Premise branches are present on
  all three consuming legs.
- `requirements-rules.py --size-check requirements.program.md topology.json`: ⚠️ fits, exit 0.

  | file | delivered | pages | headroom |
  |---|---|---|---|
  | `requirements.program.md` | ~48,995 | 6/6 | 1,005 |
  | `topology.json` | ~13,464 | 1/6 | 36,536 |

  The run uses 7/8 pages. `t1zero-v2` had 1,461 headroom. The edits cost 456, after trimming the added prose twice.
- Publish greps on both files: 0 `🗑`, 0 `{{`, 0 `Confidence:` lines, 0 markers. Writing rules is the last section.
- `topology.json` parses as JSON.
