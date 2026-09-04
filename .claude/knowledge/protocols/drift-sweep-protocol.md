# Drift Sweep Protocol (Code Sites + Doc Claims)

> **Protocol 11** | **Version**: 1.1 | **Created**: 2026-06-11 | **Updated**: 2026-06-11 (Axis 6: orphan sweep) | **Born from**: the kid-centralization sweep (commits `6a14a15b` → `e6570d6c`), where the first pass missed 3 code sites and the first doc sweep missed 7 stale claims — each on a *different* scoping axis.

**Purpose**: ONE referable procedure for sweeping a change's full blast radius — both the **code sites** (find ALL siblings of the pattern being changed) and the **knowledge docs** (purge stale symbols, line refs, grep commands, and *claims* from agents, discoveries, guides). Invoke it by name before any sweep: *"run the drift sweep protocol for \<change\>"*.

**Core thesis**: sweeps miss things because the search is shaped by where we *expect* the pattern to live. The fix is to scope the search by what the pattern *is* — on every axis — and to **prove every documented expectation against the tree before writing it down**.

---

## When to Use

- After **renaming / moving / deleting** any symbol, file, script, or env var
- After **deliberate deletions or retirements** (secret retirement, guard removal, dead-code drops) — claim-staleness risk is HIGHEST here, because docs that *verify the deleted thing exists* become "re-add the dead thing" traps
- After **eradicating a bug class** or centralizing a duplicated pattern (Protocol 6 hands off to this protocol at Steps 2.1 and 6.5)
- After **SDK bumps / large refactors** (Protocol 9 Step 7 and large-scale-refactoring Principle 7 are instances of this protocol)
- When Steve asks **"should we double-check the sweep?"** — the answer is yes; run Part B pass 4 + Part C at minimum

---

## Part 0: Define the Blast Radius (5 min — write these down first)

Four lists. A sweep that skips this step inherits the author's habits as its scope.

| List | What goes in it | 2026-06-11 example |
|---|---|---|
| **SYMBOLS** | Renamed/moved/deleted identifiers | `generate-system-token.js`, SEC-C1 guard |
| **VALUES** | Literals: kids, env-var names, URLs, script names | `'paichart-2026-01'`, `JWT_ACCESS_SECRET` |
| **SHAPES** | The pattern *form*, independent of value | `JWT_KEY_ID \|\| '` (catches `\|\| 'unknown'`) |
| **CLAIMS** | Assertions the change makes true or false | "X hard-fails on missing env", "X is required in secrets", "X authenticates /mcp" |

---

## Part A: Code Sweep — Six Axes (find ALL sites)

| # | Axis | Rule | The miss it prevents |
|---|---|---|---|
| 1 | **Value** | Grep every literal in VALUES | (baseline) |
| 2 | **Shape** | Grep every pattern in SHAPES — a behavior-duplicate carries the bug without the literal | `jwt-status` `\|\| 'unknown'` — invisible to every value grep |
| 3 | **Read + Write** | For data-shape classes, sweep both axes (BC2 lesson — see Protocol 6 Step 2.1 table) | BC2 Phase 3 missed 2 write-back P0s |
| 4 | **Path** | Inventory greps are **REPO-WIDE**. Path-scope the FIX pass, never the FIND pass | `app/` JWKS routes missed by `lib/`-scoped grep — **3rd occurrence** of this class (2026-06-06 `middleware/`, 2026-06-11 `app/` + `.github/`) |
| 5 | **File-type** | Run a second literal pass with **NO `--include` filter** — `.yml` workflows, `.sh` scripts, and config files are code-adjacent literal carriers | `production-deploy.yml` kid fallback dropped by `--include='*.ts' --include='*.js'` |
| 6 | **Orphan** (call-graph) | When the change **deletes code**, list every method/function the deleted block *called*, then grep each for surviving callers. **Zero callers = a newly-orphaned method** — disposition it (delete, or justify keeping) in the SAME commit. Axes 1–5 are textual and CANNOT catch this: the orphan's name appears nowhere in the diff. | Wave 3b.0a (`0f07ac90`) verified the Microsoft handler was dead and deleted it — but never swept what the deletion orphaned. `AuthManager.validateScopeMatch` sat dead for a month (with its discovery-doc dispatch count claiming 1 caller) until the 2026-06-11 discovery run found it (`d7c50b08`). Same class one level down: `feedback_audit_dead_imports_post_extraction` (dead *imports* after extraction). |

```bash
# Axis 1+2 — value and shape, repo-wide, code extensions:
grep -rnE "$VALUES|$SHAPES" . --include="*.ts" --include="*.js" --include="*.tsx" | grep -v node_modules | grep -v "\.next"

# Axis 5 — second pass, NO extension filter (catches yml/sh/json/config):
grep -rnE "$VALUES" . 2>/dev/null | grep -vE "node_modules|\.next|\.git/" | grep -vE "\.(ts|js|tsx):"

# Axis 4 sanity check — did you write a path after `grep -rn`? If yes, justify it or delete it.

# Axis 6 — orphan sweep (deletions only). From the DELETED hunk, extract callee names:
git show <commit> -- <deleted-file> | grep "^-" | grep -oE "(this\.[a-zA-Z_]+|[a-zA-Z_]+Manager\.[a-zA-Z_]+|\b[a-zA-Z_]+)\(" | sort -u
# Then for EACH callee: grep -rn "<callee>(" . (repo-wide, per Axis 4) — zero surviving
# call sites means you just orphaned it. "Verified-dead deletion" only verifies the
# deleted node, not the subtree it was holding alive.
```

**Output of Part A**: a numbered site inventory. Fix sites; keep the inventory — Part C re-runs against it.

---

## Part B: Docs Sweep — Five Passes

**Scope** (full active-reference set — agents + discoveries alone is NOT enough):
`.claude/agents/` `.claude/knowledge/{discoveries,patterns,domain,guides,frameworks,toolkits,prompts,protocols,smoke-tests}/` `.claude/knowledge/TODO*.md` `CLAUDE.md` `scripts/README.md` `scripts/archive/README.md`

**Triage rules** (apply to every hit):
- **Active** (instructs, claims current state, would be copied) → fix
- **Historical narrative** ("was X", "removed in Phase N", evidence tables of past runs) → leave, or annotate if ambiguous
- **`cline_docs/`** (reviews, session plans) → frozen artifacts, never touch

### Pass 1 — Symbols + values
```bash
grep -rnE "$SYMBOLS|$VALUES" <scope dirs> --include="*.md"
```

### Pass 2 — Line refs (only for files whose line count shifted)
```bash
# Which changed files actually shifted? (net-zero files keep all their refs valid)
git diff <base>..HEAD --numstat -- <changed code files>
# Three ref formats — the compact regex alone misses the prose forms:
grep -rnoE "(file1|file2)\.(ts|js):[0-9]+(-[0-9]+)?|Line [0-9]+:|Lines [0-9]+(-|–|—)[0-9]+:" <scope dirs>
# Verify every SURVIVING ref against the tree (sed -n Np file) — and every ref you WRITE.
```

### Pass 3 — Grep commands inside docs
Discovery prompts contain shell commands future engineers literally execute. Stale file targets return zero hits → reader concludes the feature was deleted. Stale *expectations* are worse → reader concludes a deliberate deletion is a regression.
```bash
grep -rn "grep .*<old-file-or-symbol>" .claude/knowledge/discoveries/ .claude/agents/
```
**Non-discriminating greps are equally stale** — two failure modes beyond zero-hits (both found in the 2026-06-11 tool-arch run, `2cda5b2f`):
- **Over-matching**: the pattern matches more than the claim's subject, so the output can't be compared to the stated N at all (§1.1 "expect 6+4" whose grep matched schema fields and description text; the loose rewrite still counted 16 — only an anchored `\{$` form returned 6). The doc's own author can write one: run the grep and compare BEFORE committing (Part C rule 1 applies to count-greps, not just expect-ZERO greps).
- **Shape-blindness**: a behavior-preserving refactor moves the code out of the grep's reach and the count silently under-reports (§6.4 "exactly 4 `action ===`" saw 2 after `task.create`/`stage.create` moved into an `includes()` group — the *claim* was still true, the grep could no longer prove it). Code-sweep Axis 2 (shape) applied to the doc's own commands.

### Pass 4 — Claim-staleness (the pass symbol regexes CANNOT do)
For each doc touched by passes 1–3 **and** each doc paired with it, read the surrounding **CLAIMS** and verify each against the tree:

- Hunt especially for: *"X hard-fails on…"*, *"X is required in env/secrets"*, *"verify X is present"*, *"X authenticates Y"* — after a deliberate deletion these are **re-add-the-dead-thing traps**. (SEC-C1: every literal accurate, the assertion dead — guards deleted with the secret.)
- **Born-stale claims**: a doc can describe a *planned* feature as current state — the claim was never true at ANY commit, so no deletion/rename event exists to trigger a sweep, and `git log -S` on the symbol returns empty (which is itself the proof). Detected only by running the doc's greps against the tree. (2026-06-11 db health-run: discovery §10 + specialist pair both asserted a "Plan 8 AuditLog model" that never existed in the schema; real storage was Activity rows all along, `7715d1d6`.)
- **Pairing is a consistency mechanism, not a correctness one.** Specialist ↔ discovery pairs drift *in sync, including in sync about being wrong* (both halves carried the dead SEC-C1 claim). Verify each half against the TREE, never against its pair.
- **Time scope**: verify against current **ground truth**, not today's diff. Most of the 2026-06-11 second-pass catches were leftover drift from the 2026-06-06 session — a diff-scoped sweep can never catch a prior session's incomplete sweep.

### Pass 5 — USER-FACING MIRRORS (the surface the fix always forgets)

**Rule: when a correction lands on a protocol/spec, sweep its user-facing mirror IN THE SAME COMMIT.**

Many mechanisms are documented **twice** — once where an agent reads it, once where a human does —
and a fix reliably lands on the first and not the second. The mirror then keeps describing the old
world, authoritatively, to the audience least able to check it.

**Three instances found in a single sitting on 2026-08-09**, all in
`scripts/seed-protocol-prompts.ts`, which holds protocols AND their guides in one file — so every
mirror was *one grep away* from every fix that missed it:

| the fix | landed on | missed | lag | what a reader was told |
|---|---|---|---|---|
| F1 retry feedback (2026-07-04) | orchestrator protocol | `PIPELINE_HARNESS_GUIDE` ×2 | 5 weeks | that retries carry diagnostic feedback — the protocol says explicitly they do not |
| Flip A GUI gate release (2026-07-24) | the guide's step 5 | the guide's OWN troubleshooting table | 2 weeks | *"the UI path does not fire the reactor"* — false, and the same document said the opposite two screens earlier |
| completion-path unification (2026-07-24) | the handlers + core | the guide's reactor-gap rows | 2 weeks | to grep a handler for a reactor call that correctly no longer exists — **finding nothing reads as confirming the fault being chased** |

**Why this pass is separate from Pass 4.** Pass 4 verifies a claim against the tree. This one asks a
different question — *"who else states this mechanism, and did they get the memo?"* — and it is
answerable mechanically where Pass 4 is not.

**The procedure** (~2 minutes):
1. Name the mechanism the fix changed in plain words ("retries do/don't get feedback", "gate release
   works via GUI").
2. Grep the mirror surfaces for it — **by phrase, not by symbol**. These claims contain no symbol to
   match, which is exactly why symbol sweeps (Passes 1-3) miss them entirely.
3. Include the changed file **itself**: two of the three above were a document contradicting itself.
4. **NEGATIVE claims first.** *"X does not work"* / *"cannot"* / *"never"* / *"no longer"* age worst —
   a fix silently falsifies them and nothing re-checks. All three instances were negative claims.
5. Prefer **repointing over deleting**. A stale troubleshooting row should name the new owner, not
   vanish — the symptom is still real; only the cause moved.

**Do NOT build a validator for this.** `validate:prompt-claims` covers the mechanical half (quoted
error strings, error codes, action names) and **deliberately declines** semantic claims as "not
mechanically decidable" — that is a considered line, and a checker that cries wolf gets ignored.
This is a two-minute discipline at fix time, not a tool.

**Yield check, so the effort is calibrated**: a shortlist sweep of ~10 further mechanism claims the
same day found **1** stale. The guides are mostly right — the failures cluster tightly where *code
moved and the sweep stopped at the first surface*.

**⚠️ Two refinements, measured the same day — the second corrects this pass's own first draft.**

**(a) Symptom sections are the most-missed surface.** 2 of the 3 defects sat in a
*troubleshooting/diagnostic table*, not in the instructions. The reason is mechanical: a sweeper
greps the **instruction** phrasing ("release the gate", "retry with feedback"), and a symptom row is
phrased from the reader's side ("I did X and nothing happened") — no shared vocabulary, so the grep
misses it. **Grep troubleshooting tables separately, by symptom wording.** The Flip A sweep proves
the point: it correctly updated three instruction surfaces and missed one symptom row.

**(b) CHURN in the mirrored subject predicts staleness — NOT the age of the guide.** The first draft
of this pass said to hunt guides that lag their protocol. Measured across all five seeded guides,
that heuristic is wrong:

| guide | last touched | defects |
|---|---|---|
| HOWTO-mcp-tools | oldest (~1 month) | **0** — "10 tools, 6 entity + 4 standalone, 34 actions" all still exact |
| HOWTO-run-an-agent | ~3.5 weeks | **0** — carries the precise `non-PIPELINE` qualifier |
| HOWTO-program-workflow | ~2.5 weeks | **0** |
| HOWTO-use-pov-program *(renamed HOWTO-use-program-harness, 2026-08-18)* | newest | **1** |
| HOWTO-use-pipeline-harness | newest | **2** |

The two guides mirroring the **high-churn** protocols carried every defect; the guide mirroring the
**stable** MCP tool surface was flawless despite being oldest. A doc describing something that has
not changed does not go stale, however old it looks. **Target the subject's change rate, not the
doc's timestamp** — and note the corollary: the guides you edit most are the ones most likely to be
wrong, which is the opposite of the intuition.

---

## Part C: Prove-Before-Write + Verify Clean

1. **Prove every documented expectation.** Any "expect ZERO" / "expect N" grep you write into a discovery prompt MUST be run and return exactly N *before* the doc is committed. **A mismatch IS a finding** — this is the defense that caught both late discoveries on 2026-06-11. Never adjust the expectation to fit the tree ("expect ≤1, known straggler" launders the bug into the baseline).

2. **Final verification — inspect survivors individually, don't trust counts.** Exclusion filters (`grep -v "retired|historical"`) operate line-by-line; a correctly-framed expectation comment on the *adjacent* line is invisible to them, and conversely a real stale claim can hide inside a plausible-looking count. On 2026-06-11 a "5 remaining" result contained 4 false positives and **1 real stale claim** — only line-by-line inspection separated them.

```bash
grep -rnE "$SYMBOLS|$VALUES" <scope dirs> --include="*.md" \
  | grep -viE "retired|removed|deleted|historical|was |expect ZERO|do not re-add" \
  # → read EVERY remaining line; disposition each one explicitly
```

3. **Pair updates** per `feedback_specialist_discovery_pairing`: specialist config session-pointer + discovery prompt run-FIRST grep block move together. New discovery greps obey rule 1.

4. **Commit**: one sweep commit, message lists fixed/annotated/left-alone with reasons (traceability per `feedback_specialist_recommendation_audit`).

---

## Evidence & History

| Sweep | What the extra passes caught | Commits |
|---|---|---|
| SessionStore Phase A/B (May 2026) | 9 files of symbol drift; patterns/ + TODO docs beyond agents/discoveries | `338add12` |
| Wave 7 2nd pass (May 22, 2026) | `Line NNNN:` prose refs + 4 stale grep commands in discoveries | `843051b0` |
| Kid centralization (Jun 11, 2026) | 3 code sites (path/file-type/shape axes) + 7 doc claims incl. SEC-C1 dead-guard claim in BOTH halves of a specialist↔discovery pair | `6a14a15b`, `f4b4259e`, `e6570d6c` |
| validateScopeMatch orphan (Jun 11, 2026) | **Axis 6 origin**: Wave 3b.0a's verified-dead handler deletion (`0f07ac90`, May 12) orphaned `AuthManager.validateScopeMatch` without sweeping it; dead 1 month, discovery dispatch-count claim stale the whole time. Fix swept 13 files (4 code + 9 docs), incl. 2 adjacent specialist files the first doc pass missed — caught by Part C survivor inspection | `d7c50b08` |

---

## Related

- **Protocol 6** (`bug-class-eradication-protocol.md`) Step 2.1 + 6.5 — embeds the axes/claims rules in eradication context; this protocol is the standalone canonical procedure
- **Protocol 9** (`mcp-sdk-upgrade-protocol.md`) Step 7 — SDK-bump instance of Part B
- **Large-scale-refactoring protocol** Principle 7 — refactor-wave instance
- Memory: `feedback_post_refactor_drift_sweep` (refinements 1–13), `feedback_bc2_audits_two_axes`, `feedback_verify_file_line_in_docs`, `feedback_specialist_discovery_pairing`, `feedback_audit_dead_imports_post_extraction` (Axis 6's import-level sibling), `feedback_defend_vs_delete_dead_code` (how to disposition an Axis 6 finding)
