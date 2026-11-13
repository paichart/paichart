# Reading a run: facts, verdicts and the hand read

**What this is:** the reference beside the walkthroughs. The walkthroughs are tours: one real run, stop by stop. This page is the idea
underneath them, the list of signals a run records, and the method for reading a package yourself. Read a walkthrough to see it happen;
read this to know what you are looking at.

**Audience:** the same as the walkthroughs — a customer's network or platform engineer, or a sales engineer preparing a demo. Internals
are named only where you can see them in the GUI or the stored records.

**Worked example:** the released demo run of 2026-10-29, POV "Telemetry Export Authorisation — Fabric to Archive", root
`cmvsyg4t1000oyxb3adp0yvmv` (`programReleasable: true`). Every number below comes from that run's stored records.

---

## 1. The idea in one page: facts and verdicts

A run produces two kinds of signal, and the platform keeps them apart on purpose.

| | A **fact** | A **verdict** |
|---|---|---|
| Who makes it | the platform, mechanically | an agent (an Architect, a Reviewer, Node C) |
| Example | "the edit applied 2 of 2, at line 12 and line 25"; "the range contains all six harvested members, 0 violations" | "APPROVED, confidence 88" |
| How it can be wrong | only as a bug you can find and fix | even when every fact is right — it is a judgement |
| What happens to it | recorded, shown to the next agent plainly, and used by gates | recorded, transcribed exactly, and counted as one input |

**Why it matters:** a language model is a capable reviewer, and it can still be talked into things, or miss a line in front of it. A fact
cannot be argued with. So the design gives every judgement that *can* be made mechanically to the platform, and asks agents only for the
judgements that cannot. When a fact and a verdict disagree, the fact wins in the safe direction.

**The rules that follow from it:**

1. **A verdict is transcribed, not interpreted.** A Reviewer ends with a fixed block (`## VERDICT: APPROVED` / `Blocking issues:` /
   `Confidence:`). The platform reads that block literally. Nobody summarises a Reviewer's prose into a verdict.
2. **A verdict is one input, never the release.** A leg is approved only if its Reviewer approved *and* the facts allow it. The program is
   releasable only if every leg is approved *and* the program reviewer (Node C) approved *and* the program-level facts hold.
3. **The platform can only make an outcome stricter.** When a fact proves a package cannot be trusted as complete (a declared file was never
   read, an edit did not apply, a source was refused), the platform sets the leg to **needs-revision** whatever the agents said. It can never
   turn a refusal into an approval. The Reviewer's own verdict stays visible beside the forced one.
4. **Confidence is recorded, never a bar.** Every agent reports a confidence score. No gate uses it. A confident wrong answer and a hesitant
   right one are both judged on the facts.
5. **Facts reach the next agent plainly.** When an agent is shown an earlier agent's work, the platform's facts about it come stated as
   facts — no "good", "verified" or "trusted". The agent draws its own conclusion.
6. **Agents say what they checked.** A Reviewer grades each finding either **VERIFIED-AGAINST-EVIDENCE** (it recomputed or compared it
   itself) or **ACCEPTED-FROM-CLAIMS** (it took the package's word). That is the agent being honest about its own verdict, and you can read
   it.
7. **`programReleasable` is a fact, not the release.** It says the release conditions hold. A person still decides.

**Key takeaway:** *"The AI does the work and gives its opinion. The platform checks everything that can be checked mechanically, and it can
only ever make the answer stricter. Then a person decides."*

---

## 2. The signals a run records

Where you see them:
- **The execution card** (an agent's result in the GUI, or `agent.results`): a **Facts** line, e.g.
  `derivationContainment: checked, 0 violation(s) | containmentDisposition: benign (checked-clean)`.
- **The leg task's quality gate** (the leg's metadata): `qualityGate` with `outcome`, `reviewerScore` and, for kept files, `heldEdit`.
- **The program root**: `programReleasable`, `programConfidence`, the gate table in the final comment.
- **The deliverable** (`report.md`): a "Platform outcome: needs-revision — …" line when the platform forced an outcome.

### Facts about inputs — did each agent get what it should have?

| Fact | What it proves | What it cannot prove | Used by |
|---|---|---|---|
| **chainedContext** ("2 of 2 chain-capable, degraded 0") | every predecessor's output actually reached this agent, untruncated | that the agent read it carefully | the program's coverage condition (producer and Node C must have all legs) |
| **interfaceContractSource** | the leg holds the plan's contract, copied by the platform, byte-identical to what the Architect wrote | that the contract itself is right (a person approved the plan) | every leg; a leg without its contract cannot run |
| **R9 neutralisation** (an injected instruction shows as `[NEUTRALIZED-INJECTION:…]`) | text that tried to instruct an agent was defused before any agent read it | — | every agent; the terraform planted note in the demo |
| **R10 redaction** (`<<REDACTED-SECRET>>`, `redactedCount`) | secret values were replaced before anything was stored or shown | that every possible secret shape is known (it is a pattern list) | every stored record and every kept file |

### Facts about the kept files — what was read, and what was changed?

| Fact | What it proves | What it cannot prove | Used by |
|---|---|---|---|
| **heldBytes** (Harvester) | which files the platform sealed, from which source and commit, and how many secret lines were redacted | — | the Author's edits; `held.get` |
| **editApplication — the receipt** ("applied 2/2, candidate `35639b96`") | each edit matched exactly once and was applied by the platform, with its positions and the before/after hashes | that the edit is the *right* change (the Reviewer judges that) | the Reviewer's diff; the leg's quality gate |
| **editDiff / reviewedEditDiff** | the Reviewer was shown the platform's own diff of the edited file, not the Author's description of it | that the Reviewer read every line (see R4 in the lab record) | the quality gate (`reviewerSaw: rendered`) |
| **qualityGate.heldEdit** (`applied, inScope, forced: false`) | the package's kept-file edits applied, sit inside the leg's scope, and the Reviewer saw them | — | forces needs-revision if any of this fails |
| **deviceSourceReads / gitDeviceComparison** (network) | each switch was read from its declared source; where both a Git file and the device exist, where they differ | which copy is right | the network Architect and Reviewer |

### Facts about values — is the number right, and used unchanged?

| Fact | What it proves | What it cannot prove | Used by |
|---|---|---|---|
| **markerPresence** | the machine-readable blocks (`## Harvested Allocations`, `## Derived Values`, `## Consumed Values`) are present and parse | that their contents are right | the containment check below |
| **derivationContainment** + **containmentDisposition** ("checked, 0 violations, benign") | on a value leg: every listed member sits inside the range, the range is the smallest that fits, and no other address the leg read falls inside it unlisted; on a consuming leg: the value it used **equals** the one the value leg published (since 2026-10-31 also when the leg lists that value under `## Derived Values` — it is checked as consumed and recorded as `carriedInDerivedBlock`) | that each member was actually read (the check has no member-in-harvest relation; measured 2026-11-01, every member of every summarising range in the stored runs was in its harvest, and the gap is parked with triggers), or that the selection rule was the right rule (the Architect and Reviewer argue that) | a program-gate condition |

### Facts about the package's own text

| Fact | What it proves | What it cannot prove | Used by |
|---|---|---|---|
| **quoteFidelity** | quoted configuration matches the source byte for byte, or names what was left out | that an UNLABELLED quote is complete (an unlabelled block may narrow freely) | flagged for review; never blocks on its own |
| **rollbackContainment** | each line a rollback restores really exists in what was read | that the rollback is complete | the Reviewer |
| **dialectLint** | no banned tokens, and required stanzas present, in candidate config | the intent behind a removal | the Reviewer |
| **validationToolCalls** (network) | tool calls written into validation steps use the arguments the service requires | that the step is the right check | the network Reviewer |

**Why quote fidelity matters, and what to do when it flags.** A Harvester's quote becomes the baseline: the Architect designs against it,
the Author writes the change and the rollback from it, and the Reviewer reads the package, never the raw tool output. A line silently
dropped from a quote is therefore invisible to every later stage, and a rollback built from it restores the wrong file (the 2026-10-13
run: comment headers dropped, Reviewer approved 86, Node C approved 92 "confined to access lines", true only against the quote).
The fact reads a quote by its **label**:
- **verbatim** (or "as deployed", "byte for byte", "full file"): every omitted, added or changed line is a finding.
- **excerpt** (file sources, since quoteFidelity v6, 2026-10-31): the same strict reading, except a gap marked `# [elided: …]`, a whole
  stanza left out, or comments beside the excerpt are allowed. A silent cut under an "excerpt" label is a finding.
- **unlabelled**: the author may narrow freely; only a changed line is a finding.

When it flags: read the named gap against the source (`project(action: "held.get")` for a kept file, or the Harvester's tool call),
decide whether the missing lines matter to the change, and re-run the Harvester if they do. Kept files remove the problem for the files
being edited (the Author edits the platform's copy by reference, nothing is retyped); fidelity still matters for quotes used as
EVIDENCE: device reads, unheld files, anything a Reviewer or the operator takes on trust.

### Verdicts, and the facts recorded about them

| Signal | What it is | How it is used |
|---|---|---|
| **reviewerVerdict** | the Reviewer's closing block, transcribed: approved, blocking items, confidence | the main input to the leg's outcome |
| **evidence grading** | the Reviewer's own VERIFIED / ACCEPTED label per finding | read by people; not yet a gate input |
| **verdictMismatch** | a flag when the stored outcome contradicts the Reviewer's block | warns; never overrides |
| **confidence** (every agent) | the agent's own estimate | recorded only |
| **Node C verdict** | the program reviewer's closing block: legs checked against each other and the plan | one program-gate condition |

---

## 3. How a release is composed

```
each agent ─► facts (platform)      each Reviewer ─► verdict (transcribed)
                   │                                   │
                   └──────────► LEG OUTCOME ◄──────────┘
                                approved only if the verdict approves AND no fact forces needs-revision
                                        │
        all legs approved ──┐           │
        Node C approved ────┼──► programReleasable  (an AND of facts — never a score)
        containment holds ──┤           │
        coverage complete ──┘           ▼
                                  a person releases
```

In the demo run: four legs approved (95, 92, 88, 88), every kept-file edit applied and seen, containment benign on all four, coverage 4 of
4, Node C approved with 0 blocking — so `programReleasable: true`. The day before, the same program came back **not releasable** because one
leg's validation steps were not deterministic; the AND did exactly its job.

---

## 4. The hand read — what to check, in order

Read the **Author's package** (the leg's deliverable). For each item, the fact that backs it is in brackets — check the fact first, then the
text.

### Every change leg
1. **The edit, against the receipt.** Is each SEARCH/REPLACE the change the objective asks for, and nothing more? Does the receipt say every
   edit applied, with the expected positions? *(editApplication)*
2. **What the Reviewer saw.** Was the Reviewer shown the platform's diff? *(heldEdit: `reviewerSaw: rendered`)*
3. **The value.** Is the consumed value exactly the published one, declared in `## Consumed Values`? *(derivationContainment on the
   consuming leg)*
4. **Scope.** Does anything outside the named files or objects change? Look for "No other … changes" and check it against the diff.
5. **Validation, step by step.** Each step is a **command** with an **exact expected output**, or a labelled comparison (the same command
   before and after, and what must change). Prose that describes success is not a check. Read the reason given where a literal is not
   possible.
6. **Branch answers.** Each if-then rule from the requirements is answered **with the read that decided it**. "Confirmed" with no evidence
   is not an answer.
7. **Untested premises.** What could not be checked is said plainly (for example: whether the cluster's network plugin enforces the policy).
   An honest "untested" is correct; a silent assumption is the defect.
8. **Rollback.** `restore H<n>` for each kept file, plus any second step the platform cannot do (for example, a plain `kubectl apply` does not
   delete a removed object).
9. **Apply governance.** What the apply disrupts, whether a window is needed, and the first check to run afterwards.
10. **The Reviewer's verdict.** Read its blocking items and its VERIFIED / ACCEPTED grading. Do the "accepted" items matter for this change?

### A value leg (no change)
1. The selection rule and every member with where it was read. *(markerPresence: harvested ✓)*
2. The arithmetic written out, and the tightness argument. *(derivationContainment: 0 violations)*
3. No other harvested allocation falls inside the range.

### The program
1. The plan: legs, leg types (value or change), gates and their owners, open questions with their defaults.
2. Node C's checks: the same value everywhere, the tightest range recomputed independently, no wider permission than asked, edits only to
   named files, every leg's token matching the plan.
3. `programReleasable` and its conditions — then decide.

**Key takeaway:** *"Check the facts first — they are cheap and they cannot be argued with. Then read the judgement: is each check
deterministic, is each decision backed by a read, is everything uncheckable said out loud?"*

---

## 5. What nothing checks (said out loud)

The platform's facts are narrow on purpose. These are judged by people, or not at all:
- **The changed file is not run on your systems.** The run reads your live systems and the platform checks every edit against the exact
  bytes it read, but nothing is applied and the changed file is never tried there (no `kubectl apply --dry-run`, `terraform plan` or
  `nginx -t` inside the run). Your engineer does that, with the checks the package hands them. These checks can be run without changing
  anything: on the 2026-10-31 canary all three candidates passed them.
- **Whether the right rule was chosen, and whether each member was read.** The facts check that the range covers the members; whether those
  were the right members, and that each was actually read, is the Architect's argument and the Reviewer's judgement.
- **Whether enforcement happens.** A NetworkPolicy, a bucket policy or a proxy rule is checked as written. Whether the cluster's network
  plugin enforces it, or traffic arrives with its original source address, is stated as an untested premise.
- **Everything the Reviewer cannot see.** For a kept file the Reviewer sees the whole file when it is short (200 lines or fewer), otherwise
  each edit's surrounding section. A line in another file, or far away in a long file, is outside its view.
- **A quote that leaves something out.** quoteFidelity flags it; it does not block on it. An UNLABELLED quote may narrow freely, so its
  omissions are not checked at all — only a changed line is.
- **The Reviewer's attention.** A rendered diff proves the Reviewer was *shown* a line, not that it reasoned about it. The 2026-10-28 lab
  measured this: some Reviewers took a package's claim on trust with the contradicting line in front of them. The fix was to remove the
  option the package was claiming, not to hope for more attention.

**Key takeaway:** *"Knowing what is not checked is part of the design. Every gap is named in the package, not discovered after the apply."*

---

## Related
- The tours: [PROGRAM-WALKTHROUGH.md](../.claude/knowledge/pipelines/walkthroughs/PROGRAM-WALKTHROUGH.md), [K8S-LEG-WALKTHROUGH.md](../.claude/knowledge/pipelines/walkthroughs/K8S-LEG-WALKTHROUGH.md), [TERRAFORM-LEG-WALKTHROUGH.md](../.claude/knowledge/pipelines/walkthroughs/TERRAFORM-LEG-WALKTHROUGH.md), [OBSERVABILITY-LEG-WALKTHROUGH.md](../.claude/knowledge/pipelines/walkthroughs/OBSERVABILITY-LEG-WALKTHROUGH.md),
  [NETWORK-LEG-WALKTHROUGH.md](../.claude/knowledge/pipelines/walkthroughs/NETWORK-LEG-WALKTHROUGH.md).
- Forced outcomes in detail, and applying a kept-file package: [PIPELINE-HARNESS-USER-GUIDE.md](../.claude/knowledge/pipelines/PIPELINE-HARNESS-USER-GUIDE.md).
- Investigating a run from stored records: [PIPELINE-RUN-FORENSICS-GUIDE.md](../.claude/knowledge/pipelines/PIPELINE-RUN-FORENSICS-GUIDE.md), [PROGRAM-RUN-FORENSICS-GUIDE.md](../.claude/knowledge/pipelines/PROGRAM-RUN-FORENSICS-GUIDE.md).
- The design rule behind section 1: [signal-design-protocol.md](../.claude/knowledge/protocols/signal-design-protocol.md) (Protocol 10, fact vs verdict).
