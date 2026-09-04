# Harness Output Guards & Their Feature Flags (R9 / R10)

> Canonical reference for the two output-hardening guards that pAIchart runs on its **own** side (defense-in-depth for any connected-service pipeline — network, k8s, terraform-iac, …). **Default-OFF in code**, but **ENABLED in prod since 2026-06-29** (both `=true`). Pointed to from agent-execution / pipeline-harness / sec-ops / dev-ops specialists.
> Shipped 2026-06-24. Full reviews: `cline_docs/reviews/ws1-r9-sanitizer-2026-06-24/` · `cline_docs/reviews/ws2-r10-redactor-2026-06-24/`.

## The two guards

| | **R9 — connected-output sanitizer** | **R10 — persisted-artifact secret redactor** |
|---|---|---|
| **What it enables** | Neutralizes untrusted connected-service output (prompt-injection patterns, zero-width/ANSI/control chars, `<prior_output>` breakout) **before pAIchart's LLM reasoner reads it**. A poisoned device banner can't steer the model. | Redacts secrets (token-in-place) from pAIchart's **own persisted artifacts** (`report.md` / `result.json`) before write. A non-conforming service's leaked secret doesn't land in the broad-audience artifact. |
| **Pure module** | `lib/agents/harness/sanitize-chained-output.ts` | `lib/agents/harness/redact-artifact-secrets.ts` (`redactArtifactSecrets`, `redactSecretsDeep`, shared `redactArtifactsForPersist`) |
| **Call sites (both wired)** | `agentic-tool-loop.ts` (site A, gated to the `services` gateway) + `context-chainer.ts` (site B) | `agentExecutionEngine.ts` (engine persist) + `app/api/pov/agent/execute/stream/route.ts` (stream persist) — via the shared helper so they can't drift |
| **Flag** | `CONNECTED_OUTPUT_SANITIZE_ENABLED` | `ARTIFACT_SECRET_REDACT_ENABLED` |
| **Posture** | **Platform hardening** (all pipelines) — driving toward a global enable | **OPT-IN defense-in-depth** — NOT a global default (customer R10 + their governance do the primary work) |
| **Enable-gate** | ⚠️ **HISTORICAL — this gate was NOT met; the flag was enabled anyway on 2026-06-29 (`f7398004`), accepting C1 as a known risk.** Read it as an OPEN question, not a blocking precondition. **C1**: `detectPromptInjection` false-positives on prose/device-logs (`system:`, `act as`, chat-role labels); the decision (detector high-signal subset vs mark-don't-mutate) is **routed to prompt-construction + sec-ops**. What changed 2026-07-26: site-A telemetry now *measures* the FP rate on live device output, so the corpus regression this row asks for can be run against real firings instead of guesses — see **Reading R9 firings** below. 🔴 **C1 FIRED LIVE 2026-08-23 — this risk is no longer hypothetical: see §C1 realised.** | Lower bar (opt-in). The egregious false-positives + the crash + parity are already fixed; flip per high-assurance engagement. |
| **CI pins** | `scripts/test-security-invariants.ts` §I (behavioral + both-sites static) | `scripts/test-security-invariants.ts` §J |

## How to turn the flags ON / OFF

**There is no live/DB/admin toggle.** Flags are read from the environment at process start (`process.env.X === 'true'`), so every change needs a restart. The same env var is both the rollout switch *and* the kill-switch.

```bash
# ON  — in .env.production (prod) or .env (local):
CONNECTED_OUTPUT_SANITIZE_ENABLED=true
ARTIFACT_SECRET_REDACT_ENABLED=true
pm2 restart <app>          # prod: ssh <PROD_USER>@<PROD_HOST> -> pm2 restart

# OFF / kill-switch — set =false (or remove the line) -> pm2 restart. Instant.
```

- **Default OFF in code** (absent or any non-`'true'` value → off; fail-safe, since both are *additive* defense). **ENABLED in prod 2026-06-29** (both `=true`) — for the terraform-iac validation rig and as the intended production posture.
- **Durable enable (not a GitHub Secret — non-secret booleans):** a literal in `production-deploy.yml`'s *Create environment file* step (survives the `.env.production` regen on every deploy) **+** the `ecosystem.config.js` env-block passthrough (PM2's explicit allowlist). A `.env.production` hand-edit alone is a deploy-wiped stopgap. See `PRODUCTION_OPERATIONS_GUIDE.md` → "Non-secret feature flags". (`.env.example` / `.env.production.template` may still carry `=false` placeholders — those are the safe code default, not prod.)
- The CI pins run the **pure modules directly**, so they validate R9/R10 **regardless** of the flag — the flag only gates the call sites.

## Reading R9 firings (site-A telemetry, 2026-07-26 — the C1 dataset)

Both R9 boundaries now record what they rewrote. **Site B** (`context-chainer.ts:327-328`) has always
written `sanitized` / `neutralizedCount` into per-predecessor `pipelineMetadata`. **Site A** — the
tool-loop re-entry, the boundary that actually reads the device — used to keep only `.text` and throw
the structured result away, so a rewrite left no trace at all. Since `94ca63fb` it emits the same
facts. Field names match across both sites deliberately: one grep covers the pair.

```bash
# Live firings (matched TEXT is here and nowhere else — attacker-controlled, deliberately
# kept out of result.json, which agents re-read and the GUI renders):
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp --lines 20000 --nostream --raw \
  | grep 'R9 sanitizer rewrote' | tail -40"

# Durable per-call evidence (outlives log rotation). NB the records live in the ARTIFACT
# (agent_artifacts.content, a TEXT column holding result.json / pipeline-index.json) — there is
# no `result` column on agent_executions. Query verified against prod schema 2026-07-26.
psql "$DATABASE_URL" -c "
SELECT a.\"executionId\",
       jsonb_path_query_array(a.content::jsonb, '\$.toolCalls[*] ? (@.sanitized == true)') AS r9_hits
FROM agent_artifacts a
WHERE a.name IN ('result.json','pipeline-index.json')
  AND a.\"createdAt\" > NOW() - INTERVAL '30 days'
  AND a.content::jsonb @? '\$.toolCalls[*] ? (@.sanitized == true)'"
```

**How to read a hit.** On a Phase-0 harvest, `INSTRUCTION_OVERRIDE` is likely a genuine injection
attempt; `SYSTEM_MANIPULATION` is more often the C1 false positive — `system:` appearing in ordinary
device config. Verified against the real detector on real Arista shapes: `logging level
system:informational` and `route-map SYSTEM:PREPEND` are both rewritten, the latter **mangling a
route-map name** a downstream change package may then reference. That is R9 corrupting harvested
state, not defending it — which is exactly the trade-off C1 exists to price, and exactly why the
rate needs measuring rather than debating. Counter-examples that do *not* fire (so the class is
narrower than the row above implies): `description act as backup link`, `remark you are now
entering the mgmt vrf`.

**Never consume the in-band `[NEUTRALIZED-INJECTION:…]` marker** — it is operator-facing and
attacker-spoofable (device output containing that literal passes through unchanged;
`sanitize-chained-output.ts` header). Branch on the structured fields instead, picking the right one:

| Question | Field |
|---|---|
| Did an **injection pattern** fire? | `neutralizedCount > 0` |
| Was the output **rewritten at all**? | `sanitized === true` |
| Was it a **strip-only** rewrite (zero-width/bidi/C0-C1/ANSI)? | `sanitized === true && neutralizedCount === 0`, size in `strippedControlChars` |

Keying on `neutralizedCount` alone MISSES strip-only rewrites, which are still silent modification of
device output (sec-ops finding 2(e), 2026-07-26). Both sites now carry `strippedControlChars`.

**Presence means "R9 examined this result", not "R9 rewrote it"** (corrected 2026-07-26 — the first
shape shipped that day set the fields only when the sanitizer FIRED, and the sentence here wrongly
claimed absent meant "no-op"). Read it three ways:
- **absent** → R9 never ran: flag off, tool wasn't `services`, or the call threw
- **present + `sanitized: false`** → examined, clean ← **this is the C1 denominator**
- **present + `sanitized: true`** → rewritten; `neutralizedCount` / `strippedControlChars` say how

The fields are deliberately NOT stamped on non-`services` records: that would assert R9 inspected
bytes it never saw. Denominator query — clean reads are the whole point, so match on presence, not
on `== true`:

```bash
psql "$DATABASE_URL" -c "
SELECT count(*) FILTER (WHERE tc.value ? 'sanitized')                     AS examined,
       count(*) FILTER (WHERE (tc.value->>'sanitized')::bool)             AS rewritten,
       count(*) FILTER (WHERE (tc.value->>'neutralizedCount')::int > 0)   AS injection_hits
FROM agent_artifacts a,
     LATERAL jsonb_array_elements(a.content::jsonb->'toolCalls') tc(value)
WHERE a.name IN ('result.json','pipeline-index.json')
  AND a.\"createdAt\" > NOW() - INTERVAL '30 days'"
```

Pinned: `test:agentic-tool-loop` §5f (18 assertions, incl. the benign route-map false positive and the
clean-read denominator as expectations — if the route-map case ever flips to clean, the pattern was
narrowed: update C1 here, don't delete the test).

> ✅ **R9 coverage — the "artifact-read trust laundering" finding is CLOSED (2026-07-26).** Recorded
> because it was derived, reviewed by two specialists, CONFIRMED by both, and then disproven — so it
> will look plausible again to the next reader.
>
> **Correct**: the RAW pre-R9 tool result IS persisted into `result.json.toolCalls` (`record.result`
> is assigned before the site-A gate). That is deliberate — forensic evidence, the same line R10
> draws for secrets.
>
> **Wrong**: that it comes back to a reasoner. `perform(action:'agent.results')` returns a **300-char
> preview** per artifact, not its content (`advanced/agent-results-handler.js` — *"Never dump full
> content inline"*); `verbose:true` raises the cap on the assembled summary text, which never held the
> artifact whole; the embedded server exposes no artifact-read tool (`project, perform, analytics,
> template, services, registry` — no `fetch`); and the preview reads the HEAD of `result.json` while
> `toolCalls` is written last. Three independent bounds.
>
> **Full content is served only to EXTERNAL clients** (Claude Desktop / ChatGPT via `fetch`, resource
> reads via `getAgentExecutionContent`) — human-supervised, own-tenant. Re-graded MEDIUM → LOW.
>
> **The rule that came out of it**: R9's scope is decided by whether a path feeds an *autonomous*
> reasoner, not by whether bytes are persisted. A new tool returning stored artifact bodies INTO the
> tool loop WOULD be in scope — and should be marked with a structural envelope, not sanitized in
> place (R9 defangs `<`/`>`, which corrupts JSON a consumer may `JSON.parse`).
>
> Disproof: `cline_docs/reviews/r9-option-b-2026-07-26/TRACE-CORRECTION.md` ·
> Original (CLOSED): `cline_docs/follow-ups/r9-artifact-read-trust-laundering-2026-07-26.md`

## Why no flag on the *enforcement* side (contrast)
R9/R10 are **transforms** (mutate data on hot paths) → flag-gated so they can't surprise the shipped artifact-synthesis pipeline. The dropped **WS3** was an *enforcement gate* — those are fail-closed + data-model-gated, never env-flag-gated (a flag that disables a security gate is a bypass). See `cline_docs/network-provisioning-promotion/ROADMAP.md`.

## §C1 realised — the first measured R9 false-block (2026-08-23, IGP-T1 R5)

C1 predicted false-positives "on prose/device-logs (`system:`, `act as`, chat-role labels)". It
happened, and the blast radius was larger than the row implies — because the neutralization lands at
the **chaining boundary**, not in the document:

- A CLEAN network change package opened a paragraph `System IDs used below are the deterministic…`.
- `MULTILINE_INJECTION` (`/\n\n[\s]*(?:ignore|system|you\s+are|act\s+as|disregard)/gi`) matched the
  bare word **System** at a paragraph break.
- The marker was injected into the DOWNSTREAM reviewer's §6 view. The reviewer — behaving correctly
  on the evidence it could see — issued NEEDS-REVISION for "a leaked artifact string in the heading".
- **The at-rest artifact contained no marker** (verified: zero occurrences in the author's
  `result.json`; the reviewer's copy quotes it only inside its own verdict). A correct round was
  archived on a defect that did not exist.

**Fix shipped (partial, that arm only)**: the `system` arm now requires a role-marker / prompt-context
shape — `system:` or `system (prompt|message|instruction[s]|override)` — so paragraph-initial domain
prose ("System IDs", "System architecture") no longer fires. Other arms untouched: no false-positive
evidence against them. Pinned in `scripts/test-injection-patterns.ts` with the live R5 paragraph as a
named fixture plus 5 attack cases proving the arm still catches real injections (52/52).

**What this does NOT fix, and is the real lesson for the C1 decision**: mutating a *view* of an
upstream deliverable makes a downstream reasoner block a document it cannot inspect at rest. That is
the **mark-don't-mutate** option in C1's own framing, and this incident is the outcome data that
should decide it. Interim mitigation is prose: `change_reviewer` role guidance now says a
`[NEUTRALIZED-…]` marker in chained context is a view-layer annotation to REPORT, never a blocking
defect (+ template rule 10). Prose is the weaker half of every pair in this domain — treat it as
interim, not closure.

**Structural mitigation SHIPPED 2026-08-23 (follow-up 1c), and it does NOT close the C1 decision**:
`renderPipelineContextSection` now annotates the seam — when a predecessor's chained output had
`neutralizedCount > 0`, §6 tells the reader, in-band and per-predecessor, that N spans were rewritten
in transit and that any `[NEUTRALIZED-…]` marker is a platform annotation the predecessor did not
write. This puts the fact where the reader looks instead of relying on role-guidance prose, and it
covers EVERY §6 consumer, not just reviewers. Deliberate scope: keyed on the injection count, never
on the conflated `anySanitized` (the 2026-06-24 harness I-2 / validation N-1 ruling stands); a
strip-only rewrite stays silent because it leaves no marker to misread. Mutation-verified in
`scripts/test-pipeline-context-render.ts` (5 cases, incl. one asserting `anySanitized` still never
reaches the prompt). **Still open: 1b — mutating a reader's view at all.** The annotation makes the
mutation survivable; it does not make it correct.

## §C1 corpus measurement (2026-08-23) — the dataset the decision was waiting for

Ran the *Reading R9 firings* queries over **30 days of production**. Telemetry validated first: the
task we independently know was affected (R5's reviewer, `cmt5c1e86…`) reports
`neutralizedCount: 1, sanitized: true` — the instrument sees the event we can corroborate.

| Boundary | Field recorded on | Injection rewrites | Rate |
|---|---|---|---|
| **Site A** — tool-loop, reads the DEVICE (untrusted input; the boundary R9 exists for) | 104 artifacts | **0** | 0% |
| **Site B** — chaining, agent→agent | 382 tasks | **3** | **0.79%** |

⚠️ The site-A zero is a MEASUREMENT, not a blind spot: the `sanitized` key is present on 104
artifacts (recorded and false), and `CONNECTED_OUTPUT_SANITIZE_ENABLED=true` is confirmed in
`.env.production`. A zero from an unrecorded field would have been meaningless.

**All 3 site-B firings are the SAME false positive, and all 3 are now prevented.** Each was an IGP
change-package Author → Reviewer hop whose deliverable opened a paragraph with IS-IS domain
vocabulary; tested against the at-rest `finalResponse` (unescaped — a regex over raw `result.json`
matches nothing, because newlines are stored escaped, and reads as a false clean):

| Task | old `system` arm | other arms | narrowed arm | matched text |
|---|---|---|---|---|
| R2 reviewer `cmt59gmak…` | fires | no | **no** | "System IDs are the fixed 12-hex-digit middle field…" |
| R3 reviewer `cmt5ae4ni…` | fires | no | **no** | "System IDs below are taken directly from each device's aut…" |
| R5 reviewer `cmt5c1e86…` | fires | no | **no** | "System IDs used below are the deterministic 12-digit body…" |

None of the three Authors' at-rest artifacts contain a `NEUTRALIZED` marker (literal-string test,
escaping-immune) — confirming the marker exists only in the reader's view, in all three cases.

**What this means for the C1 decision (1b).** Observed FP:TP is **3:0**, one class, 100% covered by
the shipped detector-subset narrowing; the boundary handling genuinely untrusted input has never
fired. That is evidence the `detector high-signal subset` path is working and that deferring
mark-don't-mutate carries low measured risk — **it is NOT evidence the detector would catch a real
attack.** This corpus is our own benign traffic with no adversarial testing; absence of true
positives measures our inputs, not the detector's recall. Two honest conclusions only: (1) the
narrowing is validated against every FP we have ever observed; (2) the residual exposure while 1b
stays open is now measured rather than assumed, and 1c makes the residue survivable.

**Re-run this measurement before 1b is decided** — 30 days of post-narrowing data answers the one
question this dataset cannot: whether the narrowed detector still fires on anything at all.
