# telemetry-collector-namespace-senders-2026-10-11 — notes

Objective (owner, verbatim): "Restrict which senders the telemetry collector accepts to exactly the running pods of one
Kubernetes namespace, and nothing wider."

Blind: no published spec, answer key, prior answers.md for this objective, Phase 4 DECISION-RECORD.md or RIG-HOSTING.md
opened. Exception — RUN CONDITION Z55: commit d9ac945d's message (describes the cluster→collector path) was read;
`request-path` is presented options-only, no recommendation (owner ruling 2026-10-11).

## Fit check (2026-10-11)
F1 restrict ✓ · F2 one namespace + one collector ✓ · F3 rule (running pods) ✓ · F4 existing surfaces ✓.
Caveat: the cluster→collector path is non-persistent per its commit; re-check before any program run (not before generation).
Z27: k8s descriptor reads a namespace only when named ⇒ the zero run harvests no pods; target OPEN.

## Step 1 — objective-zero.txt accepted by owner ("ok", 2026-10-11)
Incidental exposure (recorded, not an answer key): reading the prior log-archive zero-2 task's context for its title
format showed its harvested namespace on the same cluster. Not used; the owner supplies the namespace in Group A.

## Step 2 — zero-decision generation (owner "yes" 2026-10-11)
- Pre-flight: MCP identity steve.terry@paichart.com ADMIN; registry holds no rig services.
- POV `cmv3i00vf000byx17h1828s1c` "Telemetry collector access control" (phases Requirements, Program; countryCode AU).
- Stage `cmv3i04gy000myx17penzsixd` "Requirements — collector senders (zero)".
- Task `cmv3i0fnt000oyx17rt47bpad` PIPELINE, Pipeline Harness `cmnjoo31t0000yx3s8e9hc7k8`; no duplicateAcknowledged (new POV).
  Read back: description equals objective-zero.txt (file's trailing newline not stored); template attached.
- agent.execute 07:25:31Z, execution `cmv3i0shf000wyx17lqezuqfn`.

## Step 3 — fetch (2026-10-11)
- Root task `cmv3i0fnt000oyx17rt47bpad`: two harness executions, both SUCCESS (`cmv3i0shf000wyx17lqezuqfn` 07:25–07:27 plan/spawn; `cmv3imej8003zyx18t4kwso6b` 07:42–07:45 synthesize).
- One execution per child, no truncation retry: harvester (Sonnet 5), Author (`claude-opus-5-5` = template; Z32 check by read-only psql, since no MCP tool returns result.json `modelUsed`), Reviewer (Sonnet 5, approved false — expected for a zero draft).
- Teardown: `services discover` lists no rig registration left (12 standing services).
- draft-zero/objective.txt is byte-equal to objective-zero.txt.

## Step 4 — coverage (coverage-zero.txt)
- legs kubernetes-gitops (producer, reads only) → observability-config (auth; enforcer = ingress proxy in front of the collector receiver).
- 21 rows: 0 declared, 2 derived (observability-config.target, .receiver), 19 OPEN. 14 not-applicable (k8s auth block, routing blocks).
- 1 error: Z56 (`kubernetes-gitops.currency`, Author-invented). Show in Group A.
- READ: observability-config has no producer rows (correct: it derives nothing another leg consumes); the not-applicable reasons state the leg's work, not today's state (checked).

## Step 5 — deviations
- Z57: `collateral` has no option set for a proxy enforcer.
- inputs-empty / target-absent left OPEN (no numbered item to cite) — correct for a zero draft.
- Pipeline 2 validation assumes an nginx-style proxy (from the harvest's enforcer kind; no values). Pipeline 1 text names the invented currency row (Z56).

## Steps 6–8 — owner answers and merge (2026-10-11)
- Groups A–E accepted (21 items); Group F empty (routing not-applicable). Request-path (item 13) answered by the owner from options only — Z55 condition held for this row.
- Merge: objective-base.txt narrows the harvest-scope line to the declared namespace (Z27). First merge absorbed the rationale + map table into items (Z58); answers.md restructured (one `## Owner rationale` section), re-merged clean: 21/21 answered, 0 forced.

## Step 9 — answered generation 1 (owner "yes" 2026-10-11)
- Re-queried phase live: one `Pipeline:` stage (`cmv3i0zjs0014yx1734llif6m`).
- Stage `cmv3mc7vl002tyx17wl0ggjrb` "Requirements — collector senders (answered 1)".
- Task `cmv3mculu002vyx17xefvcc19` PIPELINE, Pipeline Harness; metadata duplicateAcknowledged [1] + requirementsRowItemMap (21 items).
  Read back via task.context: description = objective-answered.txt (line-by-line), metadata as set, template attached.
- agent.execute 09:27:25Z, execution `cmv3mdk4y0037yx17bo3vd1qi`.

## Owner condition (2026-10-11)
- Step 16: creating the program task and executing it are two separate owner confirmations. Create + read back, STOP; execute only on a second "yes", after re-checking approvers on team, nothing running, and the item-13 path.

## Step 10 — answered generation 1 gates (gates-answered.txt)
- Root: 2 harness executions SUCCESS; one execution per child, no truncation; models harvester Sonnet 5 · Author `claude-opus-5-5` · Reviewer Sonnet 5 (read-only psql, Z32). Teardown: both registrations deleted (harness comment).
- Reviewer NEEDS-REVISION (score 90): (1) template HTML comment left in owner block (slip); (2) `observability-config.sender-blocks` OPEN — genuine owner decision (Z60). Not slips-only ⇒ no waiver path; answer + regenerate.
- Coverage: 25 rows, 24 declared, 1 OPEN; 5 unknown keys (Z59). Citations 25/25 verbatim, premise branch ✓. Clauses: 3 drops, all false positives (Z61).

## Step 6b — Group G + amendments (2026-10-11)
- Item 22 (sender-blocks = every-block-forwarding-to-an-OTLP-receiver); items 3 and 16 amended (no exempt OTLP path). Four Z59 restated rows mapped as pointers (6/16/21/20) in the map and under Owner rationale. v1 kept: objective-answered-v1.txt, row-item-map-v1.json. Merge: 26 questions (5 added) / 22 items; diff vs v1 = items 3, 16, 22 only.

## Step 9b — answered generation 2 (owner "yes" 2026-10-11)
- Stage `cmv3nbd3n004uyx17er5t40md` "Requirements — collector senders (answered 2)"; task `cmv3nbrgz004wyx17042uvqzm`; duplicateAcknowledged [2] (re-queried live); map 22 items. Read back via task.context.
- agent.execute 09:54:15Z, execution `cmv3nc29z0058yx17zmpsqlz4`.

## Step 10b — answered generation 2 gates (gates-answered2.txt)
- Root 2 harness executions SUCCESS; one per child, no truncation; models Sonnet 5 / `claude-opus-5-5` / Sonnet 5 (read-only psql). Teardown: no rig service in discover (12 standing).
- **Reviewer APPROVED.** Coverage: 25 rows all declared, 0 OPEN; owner block = 14 not-applicable only. 5 unknown keys (Z62, all declared verbatim). Citations 25/25, premise ✓. Clauses 4 drops — all present by reading (Z61/Z62).
- Size (owner asked before waiving): full doc delivered ~77,383; program view ~56,413 (> 50,000, topology excluded) → over (Z63). Waiver W1–W9 NOT recorded (owner's condition: within the limit). Stopped before §2.

## Close-out — attempt 1 (2026-10-11)
- Outcome: FAILED at run 3 on size; not published; no program task. Register OUTCOME entry + Z55 closed (condition held).
- In-run correction (read-only, result.json requirementsFormCheck.correction): runs 2 and 3 both fixed size to 0 over and were refused on `clausesNewlyDropped` (one clause flag each).
- Waiver W1–W9: classified, NOT granted (owner's condition — size — not met). No waiver.md written.
- Kept as-is for attempt 2: answers.md (items 1–22, rationale, map incl. pointers), objective-base.txt, objective-zero.txt, objective-answered.txt (v2), objective-answered-v1.txt, row-item-map.json, row-item-map-v1.json, draft-zero/, draft-answered/, draft-answered2/, coverage-zero.txt, gates-answered*.txt.
- Before any program run from a later attempt: re-confirm the cluster→collector path (items 13/14) still exists and carries the pods' own addresses; create and execute the program task on separate owner confirmations.

## Attempt 2 — answered generation 3 (owner 2026-10-12: "option 1, and add item 23")
- Q5 = option 1: regenerate from the answered objective (no fresh zero run). Item 23 added (Group H, enforcer-scope = all-reaching-the-protected-thing); objective v3 = v2 + item 23 only (`objective-answered-v2.txt` kept); map v3 adds 23 → `observability-config.enforcer-scope` (`row-item-map-v2.json` kept).
- Stage `cmv4v2upc0022yx9k4797i15k` "Requirements — collector senders (answered 3, attempt 2)"; task `cmv4v3b2w0024yx9kl3xb9fg3` (same title as runs 1–3); duplicateAcknowledged [3] re-queried live (`cmv3i0zjs0014yx1734llif6m`, `cmv3me2c3003fyx1733f127f5`, `cmv3ncez4005gyx17vuz96q1g`); requirementsRowItemMap set and read back; description = objective-answered.txt (diff clean); 0 in flight.
- agent.execute 06:19:32Z, execution `cmv4v3svb002gyx9k0ovwv98z`. Runs under requirements-authoring 1.10.1 (group 4), false-alarm fixes, size limit 64,000 (R1).

## Attempt 2 — answered generation 3 gates (2026-10-12)
- Task `cmv4v3b2w0024yx9kl3xb9fg3` COMPLETED; one execution per child, no truncation retry; **Reviewer APPROVED**. Draft fetched to `draft-answered3/` (report.md 50,525; pre-correction + correction-not-adopted kept).
- Group 4 behaved: `observability-config.enforcer-scope` declared from item 23; `kubernetes-gitops.enforcer-scope` not-applicable (row deleted). No "DRAFT SPECIFICATION" banner this run.
- Coverage: 27 rows all declared, 0 OPEN; **6 errors = invented keys restating items 6 (×2: currency, maintenance), 22, 16, 20, 21** — now Author-actionable under B-2. Citations 27/27 verbatim, premise ✓. Clauses 0 dropped. Lint 0.
- **In-run correction FIXED coverage (all six re-keyed to `<token>.item-<N>`, the two item-6 rows merged) and was REFUSED** — `notAdoptedReason: regressed`, `regressedMeasures: [citationsTotal, citationsVerbatim]`: 27 → 26 citations, because merging two duplicate item-6 rows removes one citation. A false refusal by construction (adoption rule "citations may not fall" counts a duplicate's removal as a loss). Corrected draft: coverage 0 errors, 26/26 verbatim.
- **Publish dry run stops:** "1 owner-block line at tier blocking" = the template's HTML format comment left inside *Decisions needed from the owner* (`<row id> — … — tier: blocking | confirm | default | not-applicable -->`), matched as a row. Same Author slip as run 2; the publish script reads text inside an HTML comment as a row.
- Size: program view 47,077 raw, estimate 51,852, ≈ 49,300 real delivered — under the old 50,000 cap; R1 not needed by this spec (record at the program run from `originalSize`).

## Attempt 2 — PUBLISHED (2026-10-12, owner: "yes, publish it and push")
- `paichart/paichart@83f71da` `program-artifacts/k8s-obs-collector-senders-genspec/` (requirements.md, requirements.program.md, topology.json [new two-domain topology], PUBLISH-NOTES.md). Program fetches `requirements.program.md` + `topology.json`; verify: HTTP 200 · identical for both.
- Publish pass: banner none; owner-block template comment removed (Z65); waiver W1–W6 (`waiver-attempt2.md`); citations 27/27; clauses 0; lint 0; size: program view est. 51,645 (≈ 49.3K real), 7 of 12 run pages with the topology.
- Next (step 16): re-run `~/promstack-rig/k8s-direct-path.sh` on devext; owner re-confirms items 13/14 (direct path, pods' own addresses); program task in the POV's **Program** phase (first run there — no clearance needed); R1 read check at the plan gate.

## Step 16 pre-launch (2026-10-12)
- Rig prep at the owner's direction (devext over ssh, "you are able to ssh to devext"): `~/promstack-rig/k8s-direct-path.sh` → "applied: pods 10.244.0.0/16 -> ingress 172.21.0.50 direct (no SNAT)". Rig containers up (k8s-rig-control-plane, k8s-mcp, obs-ingress, obs-otelcol, obs-mcp, …).
- Path proof (same method as 2026-10-11): throwaway pod in namespace `rig-probe` posted to `http://172.21.0.50:4318/v1/traces`; the ingress logged the pod's OWN address (`10.244.0.9 … "POST /v1/traces" 404`; an earlier probe `10.244.0.8` likewise) ⇒ request path `direct`. `rig-probe` deleted (NotFound). 404 = the collector runs no traces pipeline; irrelevant to the path.
- Target in its starting state: `trading` = 2 Running pods (unchanged); ingress baseline `allow all` on both `otlp-ingress.conf` blocks; `operator-access.conf` unchanged.
- Read-only services: both answered in the authoring harvest at 06:20Z today (both descriptors registered, harvested, torn down).
- Owed before launch: the owner's re-confirmation, in words, of items 13/14.
- **Owner re-confirmation (U13), 2026-10-12, in his words:** "The pods in trading still reach the proxy directly, carrying their own addresses." (items 13/14)

## Program run 1 (attempt 2) — launched 2026-10-12 06:57:01Z (owner: "yes, launch it")
- POV `cmv3i00vf000byx17h1828s1c`, Program phase, stage `cmv4wfs4q005myx9kdo2x1erc`; root `cmv4wfvnc005oyx9kljrpehw7`. PLAN 06:57:01–06:57:34Z; Architect `cmv4wgeki006ayx9kcrs8wnp9`; PLAN-SPAWN 07:01:04–07:05:55Z, SUCCESS. Parked at the plan gate.
- **R1 read check:** program view delivered as one result of 50,334 chars (incl. the browser service's response wrapper); `read_more` ×6 at limit 7,000, contiguous 0 → 50,000; the remaining 334 are the wrapper's trailing "next steps" text (the last page already sits inside it) — every character of spec content read; no refusal. 6 pages = within the OLD cap ⇒ R1 not needed by this spec ("proven in unit tests, not yet needed live").
- **Hold window (no gate released):** legs `cmv4woyp50051yx9lii90wviz` (`kubernetes-gitops`, deps: plan gate) and `cmv4wpoq7005dyx9l0e3tgh1g` (`observability-config`, deps: k8s leg + k8s gate); gates plan → Jacob Wilcox, k8s change (after-producer-before-consumers, deps k8s leg) → Josh Allen, obs change (after-leg-before-completion, deps obs leg) → Steve Terry = all declared; producer + Node C depend on the two legs only. Both legs + Node C hold the contract with `serviceDescriptors` for both tokens. Contract: declared values only, each with its item; `branchConditions` copied verbatim; acceptance checks scoped to Node C.
- Plan notes: Architect typed the kubernetes-gitops leg `change` (value type is network-derivation only) and flags it; `platformDialect.target: nginx` carries Z67's "the proxy is nginx" into the contract (true on this estate).
- **Plan gate released** 07:09:18Z by MCP (approver of record Steve Terry, on behalf of declared approver Jacob Wilcox; "yes, release the plan gate").
- **kubernetes-gitops leg** `cmv4woyp50051yx9lii90wviz`: 07:09:24 → COMPLETED ~07:17Z; qualityGate approved, reviewer 94; harvester/architect/author/reviewer one execution each; reviewer approved. Harvest time 2026-10-12T07:12:14Z. Sender set = 2 entries; operator recompute from the leg's own `pod-harvest.json` with item 4's criterion ⇒ MATCH; a live read-only re-read of `trading` (ssh, owner-sanctioned) gives the same 2 members. No Derived Values block (host list, no aggregate). Parked at the kubernetes-gitops change gate (Josh Allen); observability leg OPEN.
- **kubernetes-gitops change gate released** 07:18:37Z by MCP (approver of record Steve Terry, on behalf of declared approver Josh Allen; "yes, release Josh's gate").
- **observability-config leg** `cmv4wpoq7005dyx9l0e3tgh1g`: 07:18:44 → COMPLETED 07:30Z; qualityGate approved, reviewer 90 (`## VERDICT: APPROVED`, 0 blocking; scope confinement verified by the reviewer's own diff; dialect lint clean; `Consumed Values ✓`); one execution per child.
- **Operator check of the package** (desired files from §1a/§1b vs the LIVE proxy files, read-only): exactly three blocks change — both `otlp-ingress.conf` blocks (`allow all;` → `allow 10.244.0.5; allow 10.244.0.6; deny all;`) and `operator-access.conf` (`allow 172.20.0.1;` → the two sender entries, `deny all;` kept). No other line in either file changes. The operator-access change is item 22 (owner decision): after apply, the rig host's injection path is refused too. Nothing applied.
- Node C + producer queued on leg completion (they depend on the legs only); the observability-config change gate (Steve) is open.
- **Node C** `cmv4wqpj9005wyx9li0f0272k`: `## VERDICT: APPROVED`, 0 blocking, confidence 88; chainedContext predecessors 2 = chainCapable 2, degraded 0, not truncated; 3 graded lines all VERIFIED. Flagged (non-blocking) the operator-path replacement as a material change needing owner acknowledgment before apply, and 2 rollback lines not verbatim to the harvest — one is the Harvester's own transcription typo (`$remote_actor`) that the Author correctly wrote as `$remote_addr`; the LIVE file has `$remote_addr`, and the desired files differ from live only in access lines (operator diff). Producer COMPLETED.
- Only the observability-config change gate (Steve) remains before SYNTHESIZE.
- **Observability gate released** 07:34:39Z by MCP (approver of record Steve Terry, declared approver; operator-path restriction acknowledged).
- **SYNTHESIZE 07:34:44–07:38:23Z: root COMPLETED, `programReleasable: false`** (qualityGate needs-revision, reviewerScore 90, verdictMismatchTier program; programConfidence 90). Every leg approved (94 / 90) and Node C APPROVED 88 with coverage complete. The one false conjunct is `derivationContainment` on the CONSUMER: `blocking — consuming-leg-upstream-not-green`, because the PRODUCER stamped `needs-node-c — harvested-pool-no-derivation-cannot-decide` (its Author emitted no `## Derived Values` block: "a single harvested pod address passed through as observed"), so `upstreamContainment.green = false`. Node C explicitly adjudicated the delegated decision (recomputed the selection from `pod-harvest.json`: VERIFIED-AGAINST-EVIDENCE, tight containment) — but the consumer's mechanical `blocking` has no Node C discharge path (`derivation-containment.ts:1158`/`:1217`: green:false treated as a DIRTY upstream, while here it is an UNDECIDED one).
- Contrast: the released log-archive program run 3 had the same producer shape, but its k8s Author emitted a `## Derived Values` block of /32s ⇒ `checked-clean` benign ⇒ consumer `consuming-leg-consumed-discharged`. Neither spec asks for the block; it is Author variance.
- Filed: open register PHASE4-CONTAINMENT-PROPAGATION (owner execution-facts).
- **Program run 1 result:** `programReleasable: false` (consumer containment blocking on an undecided upstream) → PHASE4-CONTAINMENT-PROPAGATION; fix (a) + pov-program 2.2.0 BRANCH D4 deployed 2026-10-12 21:22:09Z.

## Program run 2 (attempt 2) — pre-launch, 2026-10-12 ~21:40Z (the containment live control, `cline_docs/reviews/containment-propagation-2026-10-12/B3-D4.md`)
- Rig: containers up; `k8s-direct-path.sh` re-applied; throwaway pod in `rig-probe` posted to 172.21.0.50:4318 and the ingress logged its OWN address (`10.244.0.10 … POST /v1/traces 404`) ⇒ direct; `rig-probe` deleted (NotFound).
- Target in starting state: `trading` 2 Running pods (10.244.0.5/.6), both `otlp-ingress.conf` blocks `allow all`, `operator-access.conf` `allow 172.20.0.1; deny all` (the run-1 package was never applied).
- Clearance for the re-run (Program phase, re-queried live): `cmv4wgayr0062yx9k8gudz9kz` (Program:), `cmv4wxebv006tyx9lrukpsq7i`, `cmv4x882n009qyx9lrifz8np7` (Pipeline:).
- Owed before launch: the owner's re-confirmation, in words, of items 13/14.
- **Owner re-confirmation (U13), 2026-10-13, in his words:** "The pods in trading still reach the proxy directly, carrying their own addresses" (items 13/14).
- **Launched 2026-10-12 21:41:31Z** (owner confirmed): stage `cmv5s129h0003yxggnw9wagy8`, root `cmv5s15we0005yxgg45vmt698`, clearance [3] read back as an array, 0 in flight, execution `cmv5s1h1a000fyxggwgacb119`.
- **PLAN-SPAWN settled ~21:53Z; hold-window checks (no gate released):** Architect `cmv5s2ooc000ryxggjwl0bpfn` read the program view in 6 contiguous `read_more` pages (8,000 → 50,000), same as run 1. Legs `cmv5sb8mi000uyxgh50eeyzna` (kubernetes-gitops, dep plan gate) and `cmv5sc47g001cyxghwlw2y2zv` (observability-config, deps k8s leg + k8s gate); gates plan `cmv5sanz9000pyxghkfgw0t09` → Jacob, k8s `cmv5sbh6w0017yxgh8kczegyp` → Josh, obs `cmv5scbdq001qyxgh5838kcwy` → Steve (all declared); producer + Node C v2 `cmv5se5k50027yxgh1c8536ux` (Program Integration Reviewer) depend on the legs only; legs + Node C v2 hold the contract with `serviceDescriptors`; legs carry clearance arrays.
- **Anomaly, handled by the protocol:** PLAN-SPAWN first created Node C `cmv5scr6i0021yxghr5r1k876` WITHOUT the contract, tried to add it by `task.update` (contracts are accepted only at `task.create`), then recreated it as v2 with the contract and stamped the draft `cannotRun: superseded: cmv5se5k… — …` + executionStatus FAILED. That is the protocol's DISPOSED shape (SYNTHESIZE Step 1 ignores it; `child-stage-settled` counts it settled) — no hang, no block. Watch for recurrence (candidate register item if it repeats).
- **Run 2: plan gate released** 21:56:29Z by MCP (approver of record Steve Terry, on behalf of Jacob Wilcox).
- **Run 2 kubernetes-gitops leg** `cmv5sb8mi000uyxgh50eeyzna`: COMPLETED 22:07Z; qualityGate approved, reviewer 92; one execution per child. Again NO `## Derived Values` block ⇒ producer `needs-node-c — harvested-pool-no-derivation-cannot-decide` ⇒ **D4 will be exercised** (live-control PASS 1 precondition). Harvest 2026-10-12T21:59:45–48Z; sender set `10.244.0.5`, `10.244.0.6` = operator recompute from the leg's own `pod-harvest.json` (both Running, hostNetwork false, no deletion) = live read-only re-read. Parked at the k8s change gate (Josh).
- **Run 2: Josh's gate released** 22:14:28Z by MCP (approver of record Steve Terry, on behalf of Josh Allen).
- **Run 2 observability leg** `cmv5sc47g001cyxghwlw2y2zv`: COMPLETED 22:27Z, qualityGate approved, reviewer 86. Two findings: (1) **comments dropped** — the desired files omit every comment line of both live files (10-line header + an inline comment in otlp-ingress.conf, 5-line header in operator-access.conf); access-line changes correct (2 allows + deny all on all 3 blocks). The Harvester's quote lacked the comments; the Author flagged the operator-access mismatch and added a P1 HARVEST-MATCH stop, but not for otlp-ingress. Package fails safe at P1 but is not applicable as written; leg reviewer missed it. Run 1's package kept the comments. (2) **No `## Consumed Values`** ("bare host list does not fit the closed kind set cidr|asn" — run 1's Author declared the same addresses as kind cidr and parsed) ⇒ consumer `needs-node-c — consuming-leg-no-consumed-block` (BRANCH D3), so **D4 NOT exercised** (live-control outcome). Owner (2026-10-13): hold the obs gate until Node C's verdict.
- **Run 2 Node C** `cmv5se5k50027yxgh1c8536ux`: `## VERDICT: APPROVED`, 0 blocking, 92; gave the BRANCH D3 discharge (applied vs published sender set, both quoted) but MISSED the dropped comments ("confined to … access lines only", true against the quote). Raw `get_ingress_config` (harvester tool call 5) held both comment headers; the Harvester's deliverable held none.
- **Run 2 DISPOSITION (owner, 2026-10-13, option 1): NOT RELEASABLE — parked at the obs gate, not released.** Comments posted on the obs gate and the root. Live control (B3-D4.md): **D4 NOT EXERCISED** (consumer took D3). Phase 4: 2 of 3 program runs used; run 3 waits for VERBATIM-QUOTE-OMISSION (+ the consumer side of fix (b)).

## Program run 3 (attempt 2) — pre-launch, 2026-10-13 (live control for observability 1.9.0: `cline_docs/reviews/verbatim-quote-omission-2026-10-13/LIVE-CONTROL-RUN3.md`)
- Rig (05:43Z): containers up; `k8s-direct-path.sh` re-applied ("applied: pods 10.244.0.0/16 -> ingress 172.21.0.50 direct (no SNAT)"); throwaway pod in `rig-probe` (10.244.0.11) posted to 172.21.0.50:4318 and the ingress logged its OWN address (`10.244.0.11 … POST /v1/traces 404`) ⇒ direct; `rig-probe` deleted (NotFound).
- Target in starting state: `trading` 2 Running pods (10.244.0.5/.6); both `otlp-ingress.conf` blocks `allow all`; `operator-access.conf` `allow 172.20.0.1; deny all` (runs 1–2 never applied).
- Clearance (Program phase, re-queried live): `cmv4wgayr0062yx9k8gudz9kz`, `cmv4wxebv006tyx9lrukpsq7i`, `cmv4x882n009qyx9lrifz8np7`, `cmv5s2l72000jyxggnoo0p1rn`, `cmv5snmt2003ayxghi6rc8bln`, `cmv5t8jyf007syxghutwix6od`.
- **Owner re-confirmation (U13), 2026-10-13, in his words:** "The pods in trading still reach the proxy directly, carrying their own addresses" (items 13/14).
- Launch waits for: observability 1.9.0 live in production (deploy of `b5d275b6`), 0 in flight, owner's go.
- **Launched 2026-10-13 06:06:46Z** (owner: "go"): stage `cmv6a2u4n0003yxwtua11ohsz`, root `cmv6a2xjq0005yxwtpr4rbti8`, clearance [6] read back as an array, template Pipeline Harness, 0 in flight, execution `cmv6a38co000fyxwt332ip1ia`. observability-config 1.9.0 live since 06:03:41Z.
- **Run 3 hold-window checks (06:28Z, no gate released):** PLAN 06:06:46–06:07:45Z; PLAN-SPAWN 06:13:02–06:19:13Z, SUCCESS. Architect `cmv6a45rs000vyxwti6lfofqw` read the program view to its end (`read_more` ×6, contiguous 8,000 → 50,334). Children: plan gate `cmv6ad6dx000pyxwuccuv1fd0`; k8s leg `cmv6afwsw000uyxwuxr1pb8qn` (dep plan gate); k8s gate `cmv6agdd70017yxwua5x96jqb`; obs leg `cmv6ah2tq001dyxwu0jxzsobb` (deps plan gate, k8s leg, k8s gate); obs gate `cmv6ahbfk001syxwutv1czaya`; producer `cmv6ahi62001yyxwu29yn8c6d` and Node C `cmv6aidce0026yxwud65zdi1f` (deps the two legs only). Interface contract present on both legs and Node C (`interfaceContractSource` stamped). One Node C (no superseded draft this time). Clearance resolved (pre-flight comment names all 6) and carried onto both legs. Both legs typed `change`.
- **Run 3: plan gate released** 06:30:15Z by MCP (approver of record Steve Terry, on behalf of Jacob Wilcox; "yes").
- **Run 3 kubernetes-gitops leg** `cmv6afwsw000uyxwuxr1pb8qn`: COMPLETED 06:34:04Z, qualityGate approved 95, `reviewerPresent: false`. **Different shape from runs 1–2:** the leg brief (PLAN-SPAWN) states the leg authors no configuration change and its deliverable is the harvested sender-set value, so the leg harness ran ONE child (Harvester `cmv6b05gj0020yxwtqcchb329`), no Architect/Author/Reviewer — the VALUE-LEG-K8S shape, typed `change`. Published sender set `10.244.0.5`, `10.244.0.6` (harvest 06:32:44Z, contract criterion applied; matches the live `trading` pods read at 05:43Z). Producer containment: `needs-node-c — no-author-child-leg-kind-undecidable` (pov-program BRANCH C2: Node C must cite the PLAN-SPAWN objective text to discharge), violations 0 ⇒ the consumer should stamp `consuming-leg-upstream-delegated` (D4) under fix (a). Harvester quoteFidelity `no-pairable-quotes` (JSON reads).
- **Run 3: Josh's gate released** 06:44:34Z by MCP (approver of record Steve Terry, on behalf of Josh Allen; "yes as long as we will be testing our changes").
- **Run 3 observability leg** `cmv6ah2tq001dyxwu0jxzsobb` (obs 1.9.0): COMPLETED, qualityGate approved 92; one execution per child; leg reviewer `## VERDICT: APPROVED`, 0 blocking, 0 warnings. **Live-control scoring (LIVE-CONTROL-RUN3.md):**
  - P1 PASS / S2 clear — strict scorer on Harvester `cmv6bgn6d003myxwt9dapclfa`: 3/3 file blocks strict-clean (otel + both ingress files), 0 added, 0 edited, 0 markers; stamped `all-quotes-complete`. Every file the ingress read returned has its own block (W7). C2 NOT exercised (no Prometheus quote).
  - P2 PASS — `markerPresence.consumedValues: true`; Consumed Values `{cidr 10.244.0.5}`, `{cidr 10.244.0.6}` (bare form).
  - P3 PASS — declared = published set = the package's applied `allow` set on all 3 blocks; no own-harvest/contract address (no 172.20.0.1, no 172.31.114.10).
  - P4 PASS — `needs-node-c — consuming-leg-upstream-delegated`, upstreamDelegated = the k8s leg (`no-author-child-leg-kind-undecidable`), consumedValueCheck `not-run-no-upstream-derived` ⇒ **D4 exercised for the first time.**
  - S1 clear (stop end_turn) · S3 clear · S4 clear (one Consumed Values block, no markers).
  - Operator check (devext, read-only): both rollback files BYTE-IDENTICAL to the live files (comments included — run 2's defect gone); desired files differ from live ONLY in the access lines (otlp 4317/4318 `allow all` → `allow .5; allow .6; deny all`; operator-access `allow 172.20.0.1` → `allow .5; allow .6`, `deny all` kept). Same operator-lane restriction as run 1.
- **Run 3 Node C** `cmv6aidce0026yxwud65zdi1f` (exec `cmv6bxw710062yxwt1t449hza`): `## VERDICT: APPROVED`, 0 blocking, confidence 90. C2 discharged: k8s `no-author-child` evidence-only, citing the plan's own objective text ("harvest, derive, publish — author nothing"). P5 (D4) PASS by hand read: acceptance check 1 CONSUMED-EXACT names the upstream published `10.244.0.5`, `10.244.0.6` and the declared + applied sets, "match exactly" (VERIFIED-AGAINST-EVIDENCE); Node C did not name the delegated reason itself — the spec's acceptance check produced the required form (NODE-C-D4-GUIDANCE evidence). Producer `cmv6ahi62001yyxwu29yn8c6d` COMPLETED.
- **Run 3: observability gate released** 07:37:15Z by MCP (approver of record Steve Terry, declared approver; operator-lane restriction acknowledged; "release gate please").
- **Run 3 SYNTHESIZE** `cmv6dblbw006myxwto790k1dw` 07:37:16–07:39:49Z: root COMPLETED, **`programReleasable: true`**, qualityGate approved 92 (MIN of 95, 92); both containment `needs-node-c` dispositions discharged by Node C (C2 + D4); chaining 2/2, 0 degraded. Hand recompute of the release rule agrees. **Phase 4 MVP aim met.**
