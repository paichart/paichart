# Open questions — an invitation to researchers

**Who this is for**: empirical software engineering, AI evaluation and scalable oversight, and human-AI
trust. If you study whether multi-agent verification actually works, we have a running system, a
pre-registered corpus, three uncomfortable findings, and at least one hypothesis we cannot afford to test
ourselves.

**What we are asking for**: replication, and better experimental design than a small team can run alongside
shipping. **What we can offer**: a live instrumented system, machine records of every run including the
failures, and a documentation culture that already commits its expectations before the run rather than
after.

---

## 1. What the corpus is

Fourteen verification documents (`tests/`), each stating its **expected observables before the round was
run**, then recording what actually happened. Roughly 25 program and pipeline runs against a two-switch
Arista cEOS lab and a cloud tier, June–August 2026.

Two properties worth knowing before you decide whether it is useful to you:

- **It is pre-registered.** We adopted this operationally, not academically: a round whose observables are
  written afterwards cannot distinguish a finding from a rationalisation. The consequence is that the
  failures are recorded in the same format as the passes.
- **The failures are published.** VT-12 is a round where the system self-certified a release while shipping
  an authorization widening. It is in the pack with its root cause and fix, not summarised away.

**Honest limits, stated up front.** n is small. The calibration study below rests on a single pair.
Genuine single-variable comparisons are rare in the corpus and we flag them explicitly when they occur. The
domain is narrow (network, Kubernetes, Terraform change synthesis). None of this is peer-reviewed, and the
scale analysis in the case studies is architectural reasoning, not benchmarks.

## 2. Three findings we think are interesting

### 2.1 Stacking reviewers did not add rigour

Three independent reviewer tiers, each **explicitly instructed to catch that defect class**, approved a
defective derived value — at **rising** confidence: **88 → 92 → 94**.

No individual judge malfunctioned. Each was reasoning over a narrative whose supporting evidence had been
dropped upstream. When the evidence was carried forward and the integration tier **recomputed** rather than
read the account, the same defect class was caught.

The claim we drew, which we would like tested properly: **adding reviewers does not add rigour; carrying
evidence does.** Three tiers over stale evidence appear to be worse than one tier over live evidence,
because the additional tiers produce confidence without adding information.

Relevant to: debate and recursive-oversight proposals, which generally assume independent judges compose.

### 2.2 A reviewer's confidence carries verdict direction, not correctness

Two review runs on **byte-identical** prompts, model and parameters, over the same defective input,
returned **45** and **92**.

Corpus-wide, approvals on defective and clean work share one narrow band, and **five of seven approvals sit
at exactly 92**.

We responded by removing confidence from every release gate; it is still recorded as a fact. We have not
established *why* the band is so tight, whether it is model-specific, or whether it generalises beyond this
task shape.

### 2.3 Verification and its performance are behaviourally identical

The finding we find hardest to sit with.

One reviewer performed the **entire** verification procedure: wrote out the correct intermediate work,
reached a conclusion, and stamped its own finding as verified-against-evidence. It was wrong. The input was
byte-identical to a run where the same procedure produced the catch.

So the observable behaviour of a reviewer *doing* verification and a reviewer *performing* it is the same.
No prompt we tried separates them, which is why arithmetic in this system moved into deterministic code
rather than staying a reviewer's responsibility.

Relevant to: LLM-as-judge reliability, and to any oversight scheme where a model reports on its own
checking.

## 3. The open hypothesis, with its experiment

**Hypothesis (untested, and we say so in our own internal record): a reviewer handed a copyable answer will
copy it.**

The observation: a change package containing its own verification table was reviewed by an agent that
**echoed that table** — wrong but plausible — and approved. A package *without* such a table forced the
reviewer to construct the check itself, and that run caught the defect.

**It rests on one head-to-head pair.** We have deliberately not counted a later single-variable comparison
toward it, because that one tests a different property.

**The experiment is clean and we lack the power to run it**: hold prompt, model, parameters and input
fixed; vary only whether the upstream artifact contains a verification narrative; measure detection rate on
seeded defects across n runs. We can supply the harness, the defect injectors, and the artifact format.

If it replicates it is a concrete, transferable design rule for multi-agent systems. If it does not, we
would like to know that too, and we will say so in the pack.

## 4. Other questions we would fund attention on if we could

- **Does pre-registration change what an evaluator concludes?** Our observables were committed before each
  round. We believe this prevented several post-hoc rationalisations, but we have no control condition.
- **Does an unnameable obligation get discharged against whatever is visible?** In one round a reasoning
  tier was told a value could not be checked mechanically but not *which* value. It verified a different,
  already-covered property and reported the obligation met. When the subject was named, it found the real
  defect and blocked. One pair; the general shape needs testing.
- **Where is the ceiling on a flat integration reviewer?** One agent reasoning across all legs of a program
  is our known scaling wall. The proposed fix is hierarchical review where every reviewer sees a diff or a
  seam rather than the whole fleet. It is scoped and unbuilt.
- **Is "coverage" measurable from inside a gate?** VT-12 failed because a required property was asserted in
  exactly one place and a prose edit removed it. Every remaining fact was true. A missing conjunct looks
  identical to a satisfied one from within the gate.

## 5. What we can share

- The verification pack, the case studies and the change reports are public already, CC-BY-4.0 where
  marked.
- Run artifacts are from **lab infrastructure** (a two-switch cEOS lab and a cloud tier), not customer
  systems, so the underlying records carry no third-party data.
- Structured per-run records: agent outputs, chained context, mechanical containment facts, gate
  dispositions, reviewer verdicts, timestamps and token accounting.
- The protocols themselves are text, versioned with dated changelogs, so an experiment can pin the exact
  contract a run executed under.

**The lab run data is available for research use.** It comes from our own two-switch cEOS lab and cloud
tier, carries no third-party or customer data, and we will share the per-run records above with researchers
who ask. Open an issue describing what you want to measure and we will work out the format with you.

## 6. What would make this worth your time

You would be working with a system that already does the two things that usually make applied-AI results
hard to trust: it **states its expectations before the run**, and it **publishes the rounds it failed**.
The instrumentation exists because the platform needed it, not because a paper needed it.

You would also be able to break our claims. Several of them rest on one or two observations, we have marked
which, and we would rather have them refuted with evidence than repeated with confidence.

**To start a conversation**: open an issue on this repository describing what you would want to measure.

---

*This document is intentionally short on architecture. If you want the mechanism first, read
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the invariants and
[`../case-studies/inside-a-multi-domain-program.md`](../case-studies/inside-a-multi-domain-program.md) for
how a program is decomposed, reviewed and gated.*
