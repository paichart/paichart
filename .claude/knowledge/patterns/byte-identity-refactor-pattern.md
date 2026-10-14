# Byte-Identity Refactor Pattern (agent-facing text and fact-producing code)

**Confidence**: 85% — production-proven once end to end (value-chain build, 2026-10-02: five batches, 41/41 texts
byte-identical after every step, a 2,196-task production replay with zero changed facts). Needs a second build to
go higher.
**Used by**: Protocol 15 (`protocols/isolated-variant-build-protocol.md`) phases 4–6.

## Problem

You must restructure text or code that LIVE agents read (a protocol body, a role entry) or that stamps facts live gates
read (a mechanical net), so that something new can share it — and the existing behaviour must not move by a single
byte. "All suites green" does not prove that: several checks read SOURCE, not what agents receive, and pass vacuously
once text moves out of the place they slice.

## The pattern — four proofs, in order

### 1. Pin the RECEIVED bytes before touching anything
A CI test hashing every rendered agent-facing text the change could reach — each protocol `promptText`, each role
entry, the shared base texts — against a committed golden file. Semantics: existing keys PRESENT and EQUAL; new keys
allowed (so additive work passes); `--update` only with a version bump of what changed; an optional `--db` mode
compares the rendered text with the stored rows. **Mutation-prove it**: a same-length one-character edit must fail and
name the key. (`scripts/test-protocol-golden.ts`, `scripts/fixtures/protocol-golden.json`.)

### 2. Draft the new text, then cut the seams
Write what the new consumer needs FIRST; the places it differs from the original are the seams. Turn the original into
a BUILDER whose parameters are exactly those seams (inserted text carries its own separator; `''` renders nothing) plus
shared CONSTANTS for passages reused verbatim. Called with the original's values it must render byte-identically —
the golden says so after every step. Commit per step.

### 3. Prove the CHECKS still read what they read
For every source-reading scanner, capture its output at the base, then after each step: **diff, don't just pass** —
an identical output is the claim; a green exit is not. Where text moved into an interpolated constant, teach the
scanner to follow `${CONST}` transitively, then mutation-prove it: plant a defect only in moved text — the new scanner
must catch it and the old one must miss it. (value-chain: `test-protocol-marker-declarations`, `test-no-rig-identifiers`.)
Normalise only what is provably noise (source offsets, query timings), and say so.

### 4. Prove the CODE on the production population
For fact-producing code, replay the shipping registry over the real population — every leg in the window AND their
children — at the BASE commit and at the new commit, back to back, against production through a session that cannot
write (`default_transaction_read_only=on`; demonstrate a refused write first). Accept zero changed lines; account for
every ADDED line exactly (value-chain: 1,731 added = one informational "does not apply" line per leaf task). Re-run
after any later edit to the module. **Harness: `scripts/replay-nets-byte-identity.sh`** — it fetches the prod URL into
memory only, opens the tunnel, forces and PROVES read-only, refuses to run with a run in flight, builds the population,
runs both passes (re-using a complete base pass), resumes a cut-off pass, and prints the removed / unexplained-added /
allowed-added accounting. It is a dry run of the shipping code: it shows what WOULD be stamped and writes nothing; it
cannot exercise a shape production does not have yet.

## Pitfalls (each observed)

- A closing-newline difference when moving a template literal into a function (caught by the golden, 1 char).
- `export const` made a scanner's const-boundary regex miss a boundary, so the last protocol absorbed the PROTOCOLS
  array — green before, red in CI after; fix the boundary, not the export.
- A builder line shared with a LIVE role edited for the new consumer — moves the original; keep variant-only
  requirements in the variant's own parameter.
- A vocabulary check that searched the whole text passed with the token removed from the list it guards — scope a
  check to the sentence it is about, and mutation-test it.
- A long replay hit a background time limit mid-pass; resume from the last complete task and trim the duplicated
  header at the join — never splice blindly.
- `git stash` in a shared worktree takes everyone's files; it is not an isolation tool.

## When NOT to use

Greenfield text with nothing live reading it; a deliberate behaviour change to the original (that is a version bump
with its own review, not a refactor).
