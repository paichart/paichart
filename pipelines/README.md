# Pipelines

Operator documentation for the autonomous delivery harness — how to run it, and what it guarantees.

| doc | what it covers |
|---|---|
| [`PROGRAM-HARNESS-USER-GUIDE.md`](./PROGRAM-HARNESS-USER-GUIDE.md) | Running a **program** — a pipeline of pipelines. Launch, the plan gate, per-domain gates, reading the result, and the failure semantics (it never hangs and never applies). |

## What a program is, in one paragraph

You give the platform two documents — a `topology.json` describing the shape of the estate and a
`requirements.md` stating what must be true — and it decomposes the objective into domain pipelines,
runs a specialist team inside each, chains runtime-derived values between them under mechanical
checks, and holds every change behind a named human approval gate. What comes out is an
**approved-but-unapplied change package**. The platform never actuates: applying is an out-of-band,
human-governed step in every domain.

## Where the rest lives

- **[`program-artifacts/`](../program-artifacts/)** — the input pairs for worked programs, plus the
  authoring [`_TEMPLATE/`](../program-artifacts/_TEMPLATE/). Its writing rules are worth reading even
  if you never author one: each is earned by a run that failed or falsely passed.
- **[`protocols/`](../protocols/)** — the protocols the harness enforces, rendered verbatim from the
  platform seed, so what you read is the text the agents actually run.
- **[`verification/`](../verification/)** — the claim narrative and the VT series: what was tested,
  what it established, and what it explicitly does **not**. It includes runs that were correctly
  refused, and at least one assessment that was wrong and is recorded as wrong.
