# program-artifacts — an archive of past runs' inputs

**Frozen 2026-11-13. Nothing new is added here.** New specs go in the
[`paichart/paichart-configs`](https://github.com/paichart/paichart-configs) repository, under `usecases/` — start from
[docs/WRITING-A-SPEC.md](../docs/WRITING-A-SPEC.md).

## What this directory is

Each sub-directory holds the two input files of one program run: `requirements.md` and `topology.json`. A run fetches its
inputs by URL, so each directory is that run's **input of record**. They are kept, unchanged, for two reasons:

- the [verification pack](../verification/README.md) cites them as evidence;
- the runs that used them stored these URLs, and a run can only be read back against the inputs it actually had.

Never edit a directory here.

## Do not copy from here

- Many are superseded revisions of one another (`-r2`, `-v2`, `run3`, `run4` …).
- The network examples name the retired repository `paichart/paichart-lab-configs` in their Device sources lines. A run
  launched from one of them as published is refused at its first Git read.
- Several were produced by a spec generator that is no longer the route in use; their layout differs from a hand-written spec.

The examples to copy are the released ones in `paichart-configs/usecases/`; each has a README saying what must be running and
what the run proved.

## `_TEMPLATE/`

The long template the spec generator fills. It is kept because that generator and its tests read it. For a hand-written spec use
the shape in [docs/WRITING-A-SPEC.md](../docs/WRITING-A-SPEC.md) instead.
