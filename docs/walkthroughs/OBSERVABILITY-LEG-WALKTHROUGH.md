# The observability legs — walkthrough (three legs, one shared Config sources block)

**Worked example:** program root `cmww10alv000kyxuysy9wyzct` "Restrict the OTLP ingress to the exporter range, tune the collector batch
processor and raise the operator listener body size (protocol: pov-program)", POV "OTLP Ingress, Collector and Operator Changes"
(`cmww102tl0005yxuy5w54tdfz`, a demo POV: a demo account can open it), run 2026-11-25. Its spec is the released use case
[`otlp-ingress-three-leg/git-live`](https://github.com/paichart/paichart-configs/tree/main/usecases/otlp-ingress-three-leg/git-live) in the configs repository. observability-config 1.12.0; Harvester, Architect and Reviewer on
Sonnet 5, Author on Opus 5.5.

**The run in one sentence:** a value leg works out the exporter range, then three observability legs each change **one** file of the
telemetry stack (the OTLP ingress, the collector, the operator listener). Every leg reads the same three files from Git and from the running
stack, and the platform compares the two copies itself. Nothing is applied.

**Read first:** `K8S-LEG-WALKTHROUGH.md` for the shared mechanics (the leg task, *the three copies*, the edit receipt, applying a package)
and `PROGRAM-WALKTHROUGH.md` for the program tier (plan, gates, Node C, the release AND). What is new here:
- **one `## Config sources` block shared by three legs**, and why every leg reads every line of it;
- **the read rule** the platform puts in each Harvester's brief;
- **the Git-versus-served comparison**, made by pAIchart, never by an agent;
- **a pre-registered service** named on the lines, because more than one observability leg runs.

| Leg | Task | Changes | Held file it edits |
|---|---|---|---|
| P1 value (network-derivation) | `cmww17nkm000syxuzpxggbxec` | nothing; publishes `10.99.0.0/27` | — |
| P2 ingress | `cmww18ci70014yxuzilkdg04s` | only the range may send on TCP 4317/4318 | H2 `observability/nginx/otlp-ingress.conf` |
| P3 collector | `cmww191j9001iyxuzr67315si` | batch processor `send_batch_size: 8192`, `timeout: 5s` | H1 `observability/otelcol/config.yaml` |
| P4 operator | `cmww19rc7001uyxuzk0s6odvc` | `client_max_body_size` 16m → 32m on the TCP 14318 listener | H3 `observability/nginx/operator-access.conf` |

A real-world note: two steps of this run (the ingress leg's harness and the operator leg's final step) failed on an LLM-provider outage and
were re-run in place hours later; that is why the ingress leg's agents ran in the evening of the same day.

## Stop 1 — The plan, the value leg and the first two gates

**Where:** the program stage "Program: OTLP ingress/collector/operator changes (Run 20261125-1114)".

**The plan** (Program Architect `cmww10o5g0012yxuy5pagii4u`): four legs, five gates, a producer and Node C. The plan wrote the shared block
once, under `configSources["observability-config"]`, and named the service `observability-readonly` (a registered name, not a descriptor URL).
The platform records what it did with that: the leg's `interfaceContractSource.serviceDescriptors` reads `notDerived:
observability-config (registered-service)`, so no observability leg registers or tears down a service of its own
([OBSERVABILITY-SERVICE.md](../OBSERVABILITY-SERVICE.md), "How you name the service in a spec").

**The plan gate** (`cmww173x0000nyxuzbo9649x1`) is released by a person after reading the plan. Before releasing,
`npm run report:gate -- <gate id> --spec <requirements.md>` shows, per protocol, whether the plan carries each sources block of the spec line
for line ([GATES.md](../GATES.md), "Plan gate", item 8).

**The value leg (P1)** read both lab switches, matched the `telemetry-exporter` marker on six addresses and derived the smallest aligned
range, `10.99.0.0/27`, with containment `checked, 0 violations`. It changes nothing (walked in depth in `NETWORK-LEG-WALKTHROUGH.md`,
Part A).

**The value gate** (`cmww17sjr000zyxuzt6kjj3av`) blocks only the ingress leg: the collector and operator legs use no value from another leg,
so they started straight after the plan gate and ran beside P1.

**Key takeaway:** *"Only the leg that needs the range waits for a person to approve it. The other two get on with their own files."*

## Stop 2 — The leg tasks and the shared block

**Where:** each of the three observability leg tasks above. Each is a PIPELINE work order whose description names **its one file** ("Edit ONLY
`observability/nginx/otlp-ingress.conf`…") and carries the interface contract.

**The block** every one of the three legs carries, character for character:

```
## Config sources
obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml
obs-otelcol: live-read — service observability-readonly
obs-ingress.otlp-ingress.conf: git-file — service github-service ; paichart/paichart-configs/observability/nginx/otlp-ingress.conf
obs-ingress.otlp-ingress.conf: live-read — service observability-readonly
obs-ingress.operator-access.conf: git-file — service github-service ; paichart/paichart-configs/observability/nginx/operator-access.conf
obs-ingress.operator-access.conf: live-read — service observability-readonly
```

- **`git-file`**: the file in Git. The platform keeps its exact bytes, and the Author edits that copy by reference.
- **`live-read`**: the copy the running stack serves, read as **evidence only**. Nothing in the stack is edited.

**Why every leg reads every line.** One program has one block per protocol, so all three legs hold all three files. That is what lets each
leg prove it left the other two alone, and lets Node C check one file per leg. The leg's title and objective name the one file it changes; the
block says what it reads. A file goes in the block only if some leg needs it.

**The platform's own record of the block:** each leg's metadata carries `configSourcesSnapshot` (6 entries, `state: parsed`,
`source: contract`), taken when the leg resolved its protocol. Later steps read the snapshot, not the agent's retelling.

**Key takeaway:** *"The spec says once which files exist and where each comes from. Each leg changes one of them and reads all of them."*

## Stop 3 — The Harvester and the read rule

**Where:** each leg's child stage → "Harvest current observability state for …" (template *Observability State Harvester*). Ingress
Harvester: execution `cmwwjgseg005xyxuykfq811cc`, 5 calls, 79 s.

**The read rule.** The platform places a short rule directly after the block in each observability Harvester's brief: **a brief may limit what
a leg changes, never which declared lines it reads.** Each leg's brief is about its own file, and in our test lab a brief that said otherwise
made the Harvester skip the other legs' files. The fact that the rule was in the brief is on the Harvester:
`protocolInjection.configSourcesReadRule: true` (all three Harvesters).

**What each Harvester did:** the same five reads in all three legs, all read-only.

| Calls | What | Line it serves |
|---|---|---|
| 1–3 | `github-service.get_file_contents` for the three Git files | the three `git-file` lines: **held** as H1, H2, H3 |
| 4 | `get_otel_config` | `obs-otelcol: live-read` |
| 5 | `get_ingress_config` | both `obs-ingress.*: live-read` lines (one call returns every ingress file) |

**Platform facts on the Harvester** (`result.json`; no agent writes them):

| Fact | This run (each of the three legs) | What it tells you |
|---|---|---|
| `configSourceReads` | 6 items, every one `read`; the three Git lines `outcome: held`, the three live lines `outcome: evidence`; `notRead: 0` | each declared line was read through the service its line names |
| `heldBytes` | `held: 3` (config.yaml 36 lines, otlp-ingress.conf 31, operator-access.conf 16; 0 redactions); `refused: served-file-evidence-only: 3` | the Git copies are sealed; the served copies were read but deliberately not kept |
| `liveEvidence` | `summary: all-read` (3 Git files, 3 live reads declared, 3 read, no Git-only file) | whether the package may rely on a served copy, or must say it relies on Git only |
| `gitLiveDrift` | `identical: 3` (every other state 0) | the comparison, below |
| `quoteFidelity` | `all-quotes-complete` | the files the Harvester quoted match what the tools returned |

The handles are the same in every leg (H1 collector, H2 ingress, H3 operator), so a reader can compare legs line by line.

**The Git-versus-served comparison.** Where a file has both a `git-file` and a `live-read` line, **pAIchart** compares the kept Git file with
the served copy, line by line after secret redaction (`method: file-ordered-lines/1`), and stores the answer as `gitLiveDrift`. Each file reads
`identical`, `equal-except-redacted`, `same-lines-bytes-differ`, `differs` (with the differing lines, credential-shaped lines withheld) or
`not-checked` with a reason. Here all three files are `identical`: the stack runs exactly what Git holds. The Harvester itself makes no such
claim; its report says the comparison is the platform's.

**Where you see it:** the Harvester's `result.json` (`agent.results` with `verbose: true`); the Architect and the Reviewer are shown it in their
brief; the Author's `result.json` carries it again with `editOverlap` per file (whether an applied edit touches a line that differs; here
`no-overlap` on the edited file).

**Key takeaways:**
- *"Every leg reads all six declared lines, and the platform records that it did, line by line."*
- *"Whether your Git file matches what is running is a platform fact, not something an AI says."*

## Stop 4 — The Architect (design)

**Where:** "Design …" (template *Observability Change Architect*). Ingress: execution `cmwwjij06007eyxuy8u2igqzo`, one turn, no tool calls,
62 s. It gets the harvest and, on the ingress leg only, the value leg's deliverable (`chainedContext`: 1 inherited cross-pipeline entry).

**Branch conditions with evidence** (ingress):

| Rule | Answer | Evidence | Outcome |
|---|---|---|---|
| `target-absent` | not confirmed | both `listen 4317` and `listen 4318` server blocks in H2 | — |
| `target-empty` | not confirmed | both ports fully configured | — |
| `enforcer-absent` | superseded | `target-empty` governs that case and is not confirmed | — |
| **`existing-grant`** | **confirmed** | `allow all;` in both `location /` blocks, no `deny` | **replace**: the range becomes the only sender |
| `principal-unseen` | **untested** | nothing read shows whether nginx sees each exporter's real source address | act; record UNTESTED |

It also carries the platform's comparison line for H2 forward **quoted, with no cause named**, lists the lines that must not change
(`listen`, `http2`, `grpc_pass`, `proxy_*`, `client_max_body_size`, comments), and states the blast radius of a graceful reload.

The collector Architect answered one row (`collector.target-absent`: not confirmed, `batch: {}` is present). The operator Architect confirmed
`client_max_body_size 16m` on the 14318 listener and named the identical line in H2 as **out of scope** (the plan's `sharedFileExclusion`).

**Key takeaway:** *"Two files carry the same `client_max_body_size 16m` line. The plan says which leg owns which, and the design repeats it."*

## Stop 5 — The Authors (three packages, one edit each)

**Where:** "Author config + validation + rollback for …" (template *Observability Config Rollback Author*), Opus 5.5.

| Leg | Execution | `## Held File Edits` | Receipt (`editApplication`) |
|---|---|---|---|
| Ingress | `cmwwjjw5w007nyxuylzm2uovq`, 117 s | `SEARCH H2 count=2`: `allow all;` → `allow 10.99.0.0/27;` + `deny all;` | applied 1/1, H2 `d03cac30` → `374b9844`, rollback `["H2"]` |
| Collector | `cmww1goit00amyxuz5xbo8a41`, 67 s | `SEARCH H1`: `batch: {}` → `batch:` + `send_batch_size: 8192` + `timeout: 5s` | applied 1/1, H1 `772d366d` → `f8fedccd`, rollback `["H1"]` |
| Operator | `cmww1h535003cyxuy1ay71sjb`, 83 s | `SEARCH H3`: `client_max_body_size 16m;` → `32m;` | applied 1/1, H3 `9caabce2` → `afd8fd8a`, rollback `["H3"]` |

**One edit, two matches, on purpose.** The ingress SEARCH line `allow all;` occurs twice in H2, once per listener. The Author declared
`count=2`, so the platform applies it only if it matches exactly twice; any other count and the edit is refused rather than guessed. The other two
edits match exactly once.

**Each package also has:**
- **`## Held File Rollback`:** `restore H<n>` of its own file (`rollbackContainment`: not checked, `restore-is-held-base`, benign).
- **Validation steps**, each a command with its exact expected output, or a labelled before-and-after comparison. For example, the ingress
  V2 reads back the deployed file's `allow`/`deny` lines and expects them at lines **12–13** and **25–26** (each pair adds a line, so the
  second moves down by one); V2b counts `client_max_body_size 16m;` and expects `1`; V3/V4 compare a refused probe's status before and after
  the reload and give **no literal** for the refused status, because configuration the package does not hold can change it. The operator
  package's V4 reads back the excluded `16m` line in H2 to prove it did not move.
- **Apply governance:** a graceful `nginx -s reload` for the two nginx changes (one possible gRPC stream reset on 4317), a collector restart
  for the collector change (the in-memory batch is dropped). No maintenance window, each with its reason.
- **`## Consumed Values`:** only on the ingress leg, `[{"kind": "cidr", "value": "10.99.0.0/27"}]` (`markerPresence`: consumed ✓). The other
  two consume nothing and leave the block out.
- **UNTESTED premises**, said plainly: the ingress package names `principal-unseen` and makes the admitted-side probe (from a member of the
  range) the first check after the reload, with the rollback if it fails.

**Key takeaways:**
- *"Three packages, three files, one edit each. The receipt proves each edit landed where the Author said, and that the other two files did
  not change."*
- *"The validation reads back the exact lines the edit wrote, with their line numbers, before anyone reloads anything."*

## Stop 6 — The Reviewers and each leg's outcome

**Where:** "Review change package for …" (template *Observability Change Reviewer*). It gets the Author's package and the **platform-rendered
diff**; the value leg's deliverable is excluded by design (`inheritedSkipped: role-excluded`).

**What the ingress Reviewer checked** (execution `cmwwjmh0400djyxuz3o7mqful`, 84 s): the diff shows exactly 2 removed and 4 added lines,
every one accounted for; all four parts of a sender restriction are present in the validation; rollback `restore H2`; the declared range
equals the applied one; the platform comparison (`all-read`, three `identical`, no edit overlapping a differing line); scope (H2 only,
4317/4318 only). Its one ACCEPTED-FROM-CLAIMS line is the range's equality with the value leg, which the platform checks, not the Reviewer.
**Verdict:** `## VERDICT: APPROVED / Blocking issues: none / Confidence: 92`.

**The collector Reviewer** approved at 90 **with one non-blocking warning**, `unwitnessed-post-apply-shape`: the first post-apply checks
are written as prose rather than in the shape for output never seen before. The package says so itself and keeps them out of its validation
section, so the Reviewer recorded it instead of blocking. **The operator Reviewer** approved at 90 with no warnings.

**Platform facts on the Reviewer and the leg:**
- `reviewerVerdict`: approved (warnings transcribed by id, e.g. `warnings 1 (unwitnessed-post-apply-shape)` on the collector's card).
- `reviewedEditDiff`: `state: rendered`, naming the Author execution and its candidate (ingress: Author `cmwwjjw5…`, candidate `35639b96`,
  diff `f735c867`). It proves the Reviewer saw this Author's diff.
- **The leg's verdict** (`qualityGate` on the leg task, stamped at its SYNTHESIZE): `outcome: approved`, reviewerScore 92 / 90 / 90, and
  `heldEdit: { state: applied, inScope: true, reviewerSaw: rendered, forced: false }`. The platform could have forced `needs-revision` (an
  edit not applied, the diff not seen, a declared file not held); here it had nothing to force.
- **Containment:** ingress `benign (consuming-leg-consumed-discharged)`, upstream green; collector and operator `benign (nothing-to-derive)`.
- **Teardown:** none on these legs; the service is pre-registered and stays registered.

**Key takeaway:** *"Each reviewer judges the platform's diff of its own file. A small issue is recorded as a labelled warning, so you see it
without the change being held up."*

## Stop 7 — The change gates, Node C and the release

**The three change gates** (`cmww18hhy001dyxuz5ebks4pj` ingress, `cmww195cc001pyxuz8f97lwvi` collector, `cmww19v750021yxuzylb3ip06`
operator) sit after their own leg and before the program completes; they do not block the leg's authoring. Before releasing one, a person
runs `npm run report:gate -- <gate id>` (the leg's outcome, the Reviewer's verdict, the edit receipt) and reads the package: the edit, each
validation step as the person who will run it, and any `<REDACTED` placeholder ([GATES.md](../GATES.md), "Change gate").

**Node C** (`cmww1av4s002gyxuzcv2pon45`, 149 s, 4 of 4 legs chained) ran the plan's eight acceptance checks. The ones specific to this
program:
- **check 5:** every leg's held edit applied (H2, H1, H3);
- **check 6, one file per leg:** P2 edited only H2, P3 only H1, P4 only H3;
- **check 7, one body-size change:** only P4 touches `client_max_body_size`; the ingress package's own read-back shows H2's line unchanged;
- **check 8, one processor change:** only P3 touches the batch processor.

**Verdict** approved, 0 blocking, confidence 93.

**The release:** the program root reads `programReleasable: true` (all four legs approved, Node C approved, containment benign, coverage 4
of 4). Release is still a person's decision.

**Key takeaway:** *"The program checks the three changes against each other: one file each, and the shared lines changed by exactly one leg."*

## Checking the facts yourself

| What | Where it is stored | How to see it |
|---|---|---|
| each declared line read, and how | Harvester `configSourceReads` | `perform({ action: "agent.results", taskId: "<Harvester task>", verbose: true })` → `result.json` |
| the comparison | Harvester `gitLiveDrift` (Author: the same, with `editOverlap`) | the same call |
| whether a package may rely on a served copy | `liveEvidence` | the same call |
| the read rule was in the brief | Harvester `protocolInjection.configSourcesReadRule` | the same call |
| the edit landed | Author `editApplication` | the Author's card (**Facts:** line) or `verbose: true` |
| the leg's verdict | leg task `qualityGate` (with `heldEdit`) | `project({ action: "task.context", taskId: "<leg task>" })` → metadata |
| what a gate should check | stored facts for that gate | `npm run report:gate -- <gate task id>` |
| the program released, per leg | root `programReleasable` and each leg | `npm run report:canary -- --root cmww10alv000kyxuysy9wyzct` (add `--control cso-obs-declared-facts` to check every declared observability leg carries its snapshot and these Harvester facts) |

Both `npm run` commands read the database read-only; run them in the pAIchart directory with the database configured. The held bytes
themselves: `project({ action: "held.get", executionId: "<Author execution id>", handle: "H2", kind: "CANDIDATE" })`.

> ⚠️ **Known limitation:** a false "matches what is deployed" statement written as a list item in a package's apply notes can be approved.
> Read the apply notes against `gitLiveDrift` yourself before you apply ([PIPELINES.md](../PIPELINES.md), "Observability: kept files from
> Git or from your service").

## The run in numbers

| | |
|---|---|
| Legs | 1 value + 3 observability change legs; 5 gates; producer; Node C |
| Tool calls | each observability Harvester 5 reads (3 Git, 2 service), read-only |
| Held files | 3 per leg, from Git; served copies read as evidence, not kept |
| Comparison | `identical` on 3 of 3 files, in every leg |
| Output | three packages, one edit each (H2 `count=2`, H1, H3), rollback `restore H<n>` |
| Leg verdicts | ingress 92, collector 90 (one non-blocking warning), operator 90; Node C 93; `programReleasable: true` |
| Changed in Git / in the stack | nothing (an operator merges and reloads) |
