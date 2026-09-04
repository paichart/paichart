# Runtime Limits Alignment Discovery
**Purpose**: Detect **validation↔runtime** ceiling mismatches — where a schema says "this input is fine" but the execution engine / LLM API / DB has its own ceiling the validation knows nothing about. When they disagree the failure shows up at *runtime* (timeout balloon, loop starvation, silent truncation, hard API reject), not as a clean 400 — strictly harder to trace.
**Category**: Boundary Contract Validation (runtime axis)
**Priority**: HIGH
**Time**: 30–45 minutes
**Created**: 2026-06-17 (from the 8-specialist runtime-limits sweep; see `cline_docs/reviews/runtime-limits-alignment-2026-06-17/`)
**Last Validated**: 2026-06-17 — inventory below verified against the tree by 8 specialists
**Sibling**: `field-limit-alignment-discovery.md` is the **validation↔validation** axis (schema-A-cap vs schema-B-cap, string sizes). THIS doc is the **validation↔runtime** axis. Run both.

---

## 🎯 What This Discovery Finds

A user/admin input sets a value (`maxToolTurns`, `maxTokens`, `maxRetries`, page `offset`, …) that flows into a runtime ceiling. The bug is not "two schemas disagree" — it's "the schema and the *runtime consumer* disagree," or "there's no schema at all and the runtime trusts the input."

**Trigger example (2026-06-17)**: `MAX_TOOL_TURNS = templateModelParams.maxToolTurns || 30` (`agentExecutionEngine.ts:755`) feeds both the agentic loop cap AND the timeout formula `180_000 + turns*30_000`, sourced from a template metadata field with no cap. `|| 30` is the **default**, not the **max** — a `maxToolTurns: 100000` yields a ~833-hour timeout.

---

## ⭐ THE RULE — verify the OBJECT, not the field name

> **A schema cap protects a runtime ceiling ONLY when the schema validates the SAME object the runtime reads.**

A field name appearing in both a validator and a runtime read is **NOT** evidence of alignment. Before grading any "this input is uncapped → runtime ceiling" finding, answer three questions in order:

1. **WRITE-OBJECT** — what concrete object/path does the user-reachable write land in? (e.g. `task.metadata.modelParameters`)
2. **READ-OBJECT** — what concrete object/path does the runtime consumer dereference at the ceiling site? (e.g. `task.agentTemplate.metadata.modelParameters`)
3. **IDENTITY** — is WRITE-OBJECT **===** READ-OBJECT (same row, same JSON path)?
   - **YES** → cap and ceiling are on the same object; an uncapped write IS a real gap. Fix = cap at the write schema, sharing a constant with the runtime.
   - **NO** → the write is **INERT** for that ceiling (stored, never read). NOT the runtime gap the missing cap would imply. (May still be a data-hygiene/UX bug — accepting a field you never honor — but not a DoS.)

### Two failure modes this catches
- **False gap (inert write)**: a validator looks "missing" on a field nobody reads from that path → don't spend an emergency cap on it. *(2026-06-17: `maxToolTurns` on the task path — written to `task.metadata`, but the cap is read only from `task.agentTemplate.metadata`. Different object → inert.)*
- **Phantom-canonical (cap on the wrong object)**: a capped schema *exists* but on a DIFFERENT object than the runtime reads. *(2026-06-17: the template `parameters` z.object caps temperature 0–2, but the engine reads `template.metadata.modelParameters` — an uncapped freeform sibling. The cap is real but bypassed by the read path.)*

The decisive artifact is the **read-source object path**, not the field name. (Same lesson as [[Phantom canonical audit]] — trace to the destination code; the object it dereferences is the contract.)

---

## 📋 Discovery Process

### Step 1 — Inventory runtime ceilings by the 8-category taxonomy (10 min)

The map (verified current state, 2026-06-17). `✅` aligned · `⚠️` validated-but-drift/path-dependent · `🔴` unvalidated input→ceiling · `📋` engine-internal (no input; document+own).

| CAT | Domain | Key ceilings | Status |
|-----|--------|--------------|--------|
| 1 | Agentic execution | `MAX_TOOL_TURNS` (default 30, **no max** — R-1), timeout `180k+turns*30k`, truncation 50K/2K | 🔴 R-1 (admin-only → backlog) + 📋 |
| 2 | LLM / token | `maxTokens` schema 100000 vs model 64K output (R-4), `DEFAULT_MAX_TOKENS`=**24000** (R1 2026-07-16; = `STANDARD_AGENT_LIMIT`), temperature/topP task-path uncapped | ⚠️ R-4 + R-2 |
| 3 | MCP transport | `SERVICE_CALL_ARGS` 25000, depth 8, leaves 100 | ✅ (shipped `170e3119`) |
| 4 | Rate limits | tiers 5/10/50/300, `agentExecutionLimiter` 10/min/IP. **`config.ts:56-57` global 100/15min = DEAD CONFIG** | sec-ops-owned |
| 5 | DB / query | `statement_timeout` 10s, `pool_timeout` 30s (aligned, no runaway gap); **live pagination offset UNBOUNDED** (R-C1); `PAGINATION_LIMIT/OFFSET` in `input-validation-framework.ts` = **dead code** | ⚠️ R-C1 |
| 6 | Workflow | step cap 20, args DoS cap, retries 5, `maxTotalRetries` max20/def10. Schema homes: `lib/services/workflow/types/orchestration-params.ts` (SOT) · `tool-schemas.js` (MCP) · `lib/workflows/schemas.ts` (REST) | ✅ (`pov.ts:203` nested-phase array uncapped) |
| 7 | Session / auth TTLs | JWT 15min, refresh 7d, MCP idle 30min (Protocol 9 #1) | 📋 env-configured |
| 8 | Resource / artifact | `FIELD_LIMITS.CONTENT` 50000, `MAX_STORED_TOOL_RESULT_BYTES` 50000, inline-output 50K/100K (`cap-text.js`) | 📋 document-as-distinct (§5) |
| 9 | LLM transport | ~~`maxTokens ≤ 21,333`~~ **RESOLVED 2026-07-04** — `generateText` streams internally (stream().finalMessage()); the SDK duration guard no longer applies. Model clamp (64K/128K) = request bound; execution watchdog = completion bound (~35-45K output @ 30 turns). Review: `cline_docs/reviews/engine-streaming-accumulate-2026-07-04/` | ✅ shipped |

### Step 2 — For each candidate field, run the OBJECT trace (15 min)

For any `<field>` flagged "uncapped input → runtime ceiling":

```bash
# 1. WRITE sites — where a user-reachable schema accepts <field>, and how it's capped:
grep -rn "<field>" lib/validation/ --include="*.ts"
#    safeRecord()/safePassthrough() = UNCAPPED; z.number().min().max() = capped.

# 2. READ sites — where the runtime consumes <field> at the ceiling:
grep -rn "<field>" lib/services/ app/api/ --include="*.ts" | grep -v lib/validation

# 3. IDENTITY — for EACH read site, print the object path it dereferences.
#    Decisive: does it start at `task.metadata` (user-write-object)
#    or `task.agentTemplate.metadata` (template-only-object)?
#    Same object => real gap; different object => inert write.
```

### Step 3 — Grade audience BEFORE designing a fix (5 min)

Per [[feedback_security_severity_by_audience]]: a runtime ceiling is only user-facing DoS if a **plain USER** can reach the write that the runtime reads. Trace the write gate (`checkPermission` role-capability vs `validatePOVAccess` instance-scope). Template-metadata writes are **ADMIN-only**; task-metadata writes are **USER-reachable** (POV ownership, no role check). The gate decides emergency vs backlog. (2026-06-17: the audience gate *inverted* the plan's priority — the headline field was the inert/admin one.)

### Step 4 — Check the failure is a FACT, not a silent verdict (Protocol 10) (5 min)

When the ceiling is hit, what does the client see? A clean platform 400 stating the cap (**fact** ✅) or a silent truncation / opaque downstream-LLM-API error / accept-and-ignore (**silent/verdict** ⚠️)? Prefer capping at *our* boundary with a stated number over relying on a downstream reject.

---

## 🪤 Tripwire (mechanical — for the health rotation)

Flag for human review any `modelParameters`/config field whose **runtime read-source path** (`task.metadata.*` vs `task.agentTemplate.metadata.*`) **differs from** its write schema's target object. A mismatch is either an inert write (false gap) or a phantom-canonical bypass (real gap on the wrong object) — both need a human boundary call; neither is auto-gradeable.

```bash
# Surface every modelParameters read site + its object path for eyeballing:
grep -rn "modelParameters" lib/services/ app/api/ --include="*.ts" | grep -v lib/validation
# Then confirm each write schema's shape (should be the shared ModelParametersSchema, not safeRecord):
grep -rnE "modelParameters:.*(safeRecord|safePassthrough)" lib/validation/
#   ^ any hit here is an UNCAPPED door into a field the runtime reads — investigate per The Rule.
#   NB: use `.*` not `\s*` — the task-path door is `FormField.optional(safeRecord())`, so the
#   field name and safeRecord aren't adjacent. As of 2026-06-18 this returns TWO hits
#   (mcp-action-validation.ts:591, task-shapes.ts:123); a THIRD hit is a new uncapped door.

# BLIND SPOT (2026-06-18, Finding A): this grep only catches a TOP-LEVEL `modelParameters:`
# declaration. It MISSED `overrideConfig.modelParameters` — a modelParameters NESTED inside a
# safePassthrough() sibling (overrideConfig), read at agentTaskService.ts:159-160 at precedence-0.
# Found by tracing the READ, not the grep. So also walk every place modelParameters is *read*
# (the first grep) back to its write schema — a passthrough wrapper one level up is still an
# uncapped door. The reads are the source of truth; the write-schema grep is a convenience, not a net.
```

---

## 🔒 The SSOT fix pattern (the FIELD_LIMITS analogue)

When a real gap is confirmed, the fix is a **shared constant imported on BOTH sides of the boundary**, so "validation says OK / runtime says no" cannot happen:

- **`lib/validation/runtime-limits.ts`** (the runtime-ceiling analogue of `field-limits.ts`) — `RUNTIME_LIMITS = { MAX_TOOL_TURNS: 200, MAX_RETRIES: 10, MAX_OUTPUT_TOKENS: 64000, MAX_OUTPUT_TOKENS_OPUS: 128000 }` **+ `maxOutputTokensForModel(model)`** (Opus 128K, Sonnet/Haiku 64K). *(SHIPPED — R-1..R-4 `91a25fa8`; model-aware clamp + full backlog closed 2026-06-18.)*
- **`lib/validation/model-parameters.ts`** — one shared `modelParametersShape` → `ModelParametersSchema` (strict) + `ModelParametersPassthroughSchema`, reused by template (`AgentExecuteSchema.parameters`) + task (`task-shapes.ts`) + MCP (`mcp-action-validation.ts:597`) write paths. One door, capped once. **`maxToolTurns` is NOT in the shape** — it's an orchestration param, template-locked, and `rejectTemplateControlledKeys` 400s any task-path write (D-1).
- Engine belt-and-suspenders: `Math.min(value, maxOutputTokensForModel(model))` at the read site (model-aware since 2026-06-18), defending rows written before the schema landed.
- **Capability map** `lib/services/llm/model-capabilities.ts` (`capabilitiesFor`) now WRAPS `maxOutputTokensForModel` as
  `cap.outputCeiling` (SDK 0.105, 2026-06-19; regex broadened to `/opus|fable|mythos/i` → 128K) and is also the per-model
  source for temperature-acceptance / thinking-mode / allowed-effort. The chokepoint `normalizeModelConfig`
  (`agentic-tool-loop.ts`) reads `cap.outputCeiling` for the clamp — so the ceiling read-site is now the capability map.

---

## 📊 Findings ledger (2026-06-17 verified → **fully SHIPPED + backlog CLOSED 2026-06-18**)

| ID | Field | Real gap? | Severity | Fix → status |
|----|-------|-----------|----------|-----|
| R-1 | `maxToolTurns` | confirmed; template-read-only / ADMIN-write | LOW (backlog) | cap 200 + clamp both read sites → **+ D-1: task-path writes now REJECTED (template-locked orchestration param)** |
| R-2 | task-path `temp`/`maxTokens` | confirmed USER-reachable (write==read) | LOW | shared `ModelParametersSchema` ✅ |
| R-3 | `maxRetries` 5-vs-10 drift | confirmed; runtime enforces NO retry max → validation IS the ceiling | LOW | unify on 10 ✅ |
| R-4 | `maxTokens` 100000 vs model 64K | confirmed misaligned (64001–100000 → Anthropic 400) | LOW | ~~cap 64000~~ → **MODEL-AWARE: `maxOutputTokensForModel` (Opus 128K, else 64K); schema admits up to 128K (`MAX_OUTPUT_TOKENS_OPUS`)** ✅ |
| §5 | 50K/100K cluster | not a bug | — | document-as-distinct, do NOT unify |
| R-C1 | pagination offset unbounded | confirmed | LOW-MED | `MAX_OFFSET` clamp in `parsePaginationParams` ✅ |

**Backlog closed 2026-06-18** (every deferred item DONE — this ledger is the durable record; commits in git history): model-aware maxTokens; removed the `Math.min(timeout*100,4000)` category-error formula (→ `DEFAULT_MAX_TOKENS` 8000); corrected the `anthropicModels` table (8192→64K/128K, Opus 4.8, contextWindow→1M) + wired `/api/llm/models` to read it; **D-1** maxToolTurns template-lock; `DEFAULT_MAX_TOKENS` doc drift (6000→8000); R-C2 pagination-ceiling spectrum documented. The two-axis model resolution (`6ba54c5d`/`a8ea07f9`) is the worked precedent.

> Every "expect N" / "should be empty" grep in this doc is a **test**: a mismatch on re-run IS a finding (Protocol 11 Part C). Prove before you trust.

---

## 📚 Related
- `field-limit-alignment-discovery.md` — the validation↔validation sibling (string sizes)
- `boundary-contract-discovery.md` — general boundary validation (the 5-minute protocol this generalizes)
- `validation-discovery.md` — validation pattern coverage; §8 body-size cap state
- Memories: [[feedback_security_severity_by_audience]], [[Phantom canonical audit]], [[feedback_mcp_filter_narrow_not_page_walk]]

---

**Discovery Complete** ✅
**Use Case**: Prevent runtime failures (timeout/loop/truncation/API-reject) from validation↔runtime ceiling mismatches
**Frequency**: Quarterly (health rotation) or when adding any input that flows into an execution/LLM/DB ceiling
**Priority**: HIGH (failures surface at runtime, not as clean 400s — harder to trace)
