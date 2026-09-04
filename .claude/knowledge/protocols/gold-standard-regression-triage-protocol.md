# Gold-Standard Regression Triage Protocol

**Version**: 1.0
**Created**: 2026-05-05
**Purpose**: A repeatable workflow for triaging MCP tool reports that look like gold-standard violations rather than logic bugs.
**When to use**: A user reports an MCP tool behaving unexpectedly — a silent empty result, a confusing error, a successful call that did the wrong thing — and on inspection the failure shape suggests a standards-compliance gap rather than a wrong-code bug.
**Time**: 30–90 minutes per report. Two hours if the meta-rule emergence step (#9) fires.

---

## Why this is a protocol, not just "fix the bug"

Many MCP tool bugs aren't really bugs in the wrong-code sense. The handler executes the path it was written to execute; the logic is correct; the response shape is structurally compliant with the standards. But the *user experience* is broken: a malformed input produces a silent empty result, a typo gets no fuzzy suggestion, the recovery hint sits invisibly in `_meta` while `content.text` says "No tasks found."

These compliance-gap failures need a different triage shape than logic bugs. A logic bug fix asks: *"what code is wrong, and what should it be?"* A standards-compliance gap fix asks: *"which standards are violated, in which layer, and what fixes propagate cleanly?"*. The latter is what this protocol structures.

---

## Companion documents

- **Universal spec**: `mcp-tool-gold-standards-spec.md` — the standards being audited against
- **pAIchart implementation reference**: `mcp-tool-gold-standard-pattern.md` — concrete file paths and code references
- **Tutorial chapter**: `paichart/paichart/tutorials/02-the-ten-gold-standards.md` — the customer-facing version
- **Bug-class-eradication protocol**: `bug-class-eradication-protocol.md` — when this triage reveals a bug class, hand off there
- **Smoke test sweep**: `smoke-test-sweep-standardize-protocol.md` — when a regression suggests the smoke-test suite has a gap

---

## The ten-step protocol

### 1. Capture the exact call and response

Get the input shape (every parameter, every value) and the output shape (`content[0].text`, `_meta`, `isError`). If the user report is a screenshot or paste, transcribe both into your working file before you start. Half of triage time is wasted re-reading paraphrased reports.

### 2. Reproduce the call against the actual handler

Either:
- Run the call yourself via MCP Inspector, OR
- Trace the code path from the entry point to the handler and read what the handler would return

The reproduction validates that the report is real and surfaces any user-side mistakes (wrong tool name, wrong server, etc.) before you spend time on triage.

### 3. Diagnose against the 13 standards

Score the response against the universal spec:

- Does `content.text` give the AI client enough to recover on the next turn? (GS9 implementation rule)
- If error: is it categorised? Does it have specific recovery? (GS3, GS7)
- If empty: do `nextSteps` adapt to the actual outcome state, or are they generic? (GS4)
- Did the input format pass schema/handler-level validation? (GS11, GS12)
- Is the response envelope shape correct? (GS10)

Note which standards are met and which are violated. Don't move past this step until you can name the violations specifically.

### 4. Localize the defect — which layer?

Standards violations live somewhere specific in the code. Common layers:

| Layer | Symptom | Where to look |
|---|---|---|
| Schema | Input format isn't validated; downstream code assumes it's valid | `tool-schemas.*` (Layer 1 in the three-layer model) |
| Validation | Parameter is silently stripped between schema and handler | `*-validation.ts` (Layer 2) |
| Handler | Logic produces correct data but wrong response shape | The handler file itself |
| Formatter | Handler builds rich `_meta`, but the function rendering `content.text` discards it | Formatter files (e.g., `formatters.js`) |
| Cross-cutting | Issue appears across multiple handlers | The shared utility being used (or not) |

Often more than one layer is involved. A single user report can produce three layer-localised defects. List all of them, not just the first one you find.

### 5. Scope — what other layers and other handlers are affected?

Two questions:

a. **Same tool, other layers**: if the schema is loose, are the handler's checks comprehensive enough to catch what the schema lets through? If the formatter discards `_meta`, do other empty paths in the same handler hit the same formatter?

b. **Other tools, same defect class**: if `task.list` doesn't validate CUID format, do `pov.details`, `task.context`, `agent.assign`, `agent.execute` all share the same gap? A regression in one handler is usually a regression in ten — or in zero. Find out which.

If question (b) reveals a class of defects (3+ sites), hand off to the *Bug-Class Eradication Protocol* — this triage workflow is for one report; that protocol is for sweeping the codebase.

### 6. Order the fixes by dependency

Some fixes can land independently; others have to land in sequence. Common dependency:

- **Handler validation must land before formatter surfaces hints** — if the formatter starts surfacing `_meta.nextSteps` in `content.text` before the handler validates input, misleading auto-suggestions become *more* visible (worse UX) before the validation makes them correct.
- **Schema docs can land anytime** — they're additive description text, no behaviour change.
- **Smoke tests should land with the fix, not after** — otherwise the regression-prevention is hypothetical.

Write the dependency order down before applying anything. Saves backtracking when fix N depends on fix M that you didn't realise had to come first.

### 7. Apply the fixes

Mechanical step. Apply each fix as a small, focused change. If the change touches more than two files unrelated to each other, it's probably two fixes that should be split.

### 8. Add a smoke test

A smoke test that exercises the *original failing call* and asserts the corrective behaviour. Round-trip recovery (Chapter 3 of the tutorial series) is the canonical pattern:

```
1. Make the wrong call
   Expect: corrective error with specific hint in content.text
2. Use the hint to construct the right call
   Expect: success
```

Without this step, the same regression will reappear in three months and nobody will know why. With it, the regression surfaces fast.

### 9. Surface the meta-rule (when one emerges)

Most triages don't produce a meta-rule. Some do. If the defect you fixed turns out to be an *implementation gap* in the standards themselves — a way to be compliant on paper while broken in practice — the rule deserves to be added to the universal spec.

The 2026-05 session that produced this protocol surfaced one such rule: *"content.text must mirror _meta.nextSteps for empty/error states"*. The rule wasn't explicit in any of the original ten standards; the gap was demonstrated by a real handler that scored A− on the audit and shipped a dead-end response.

When this happens:

- Add the rule to the universal spec (`mcp-tool-gold-standards-spec.md`)
- Add it to Chapter 2 of the tutorial
- Add a note to the implementation reference (`mcp-tool-gold-standard-pattern.md`) pointing at the new spec entry
- Verify the smoke test from step #8 actually exercises the new rule

### 10. Cross-check: keep all three docs aligned

After step #9 (or step #8 if no meta-rule emerged), do a quick alignment pass:

- Spec doc — has the new rule (or new examples) ✓
- Pattern doc — references spec ✓
- Tutorial — covers the rule with the right tone for its audience ✓
- Smoke test — exercises the bug class ✓

A `grep` for the bug-class name across all three docs confirms the alignment. Drift here is a recurring failure mode (the spec gets the new rule, the tutorial doesn't, future readers learn the old version) — worth the five-minute audit.

---

## Canonical example: 2026-05-04 malformed-CUID triage

A real walkthrough of this protocol, used as the source for refining its steps.

**Step 1 — Captured**:
- Call: `project(action: "task.list", povId: "pov-cmgalshus00bcyx39sfdutido", status: "OPEN")`
- Response: `"No tasks found."` — no `_meta` visible to the user, `isError: false`

**Step 2 — Reproduced**: confirmed via reading `handleListTasks` in `sdk-native-basic-tools.js:372`. The handler queried the API with `pov_id: "pov-..."`, got an empty array, took the empty branch, returned the bare-string formatter output.

**Step 3 — Diagnosed**:
- GS3 violation: empty result not categorised (NOT_FOUND vs no-matching-tasks indistinguishable)
- GS4 violation: nextSteps don't adapt to the *real* state (POV-doesn't-exist vs POV-exists-but-empty)
- GS9 *implementation rule* violation: `_meta.nextSteps` populated but `content.text` discarded them
- GS11 input-validation gap: handler accepted a non-CUID input without checking format

**Step 4 — Localized**:
- Schema layer (`tool-schemas.js` line 116): `povId: z.string().optional()` — no CUID format check
- Handler layer (`sdk-native-basic-tools.js:372`): no CUID format check at handler entry
- Formatter layer (`formatters.js:264`): `formatTaskList` empty branch returned bare string, ignored metadata

Three layers, one report.

**Step 5 — Scoped**:
- Same tool, other layers: yes, all three above need fixing
- Other tools, same defect class: handler-level CUID validation is missing across most consolidated tools that take `povId`. Marked as a follow-up sweep candidate, not done in this triage.

**Step 6 — Ordered**: Handler validation first (#1) → Schema docs second (#2, additive) → Formatter empty-state third (#3, depends on handler validation existing first) → Standards doc fourth (#4) → Smoke test last.

**Step 7 — Applied**: Five files changed.

**Step 8 — Smoke test**: New Test 6.5 in `pov-task-lifecycle-essentials-test.md` — *"Malformed povId — corrective error in content.text"*. Round-trip recovery sub-test included.

**Step 9 — Meta-rule emerged**: *"content.text must mirror _meta.nextSteps for empty/error states"*. Added to `mcp-tool-gold-standards-spec.md` (universal spec), `mcp-tool-gold-standard-pattern.md` (implementation reference), and Chapter 2 of the tutorial. The protocol you're reading now is the final artifact of this step's "the discipline this triage embodies deserves a name" realisation.

**Step 10 — Cross-checked**: All three docs reference the new rule; smoke test exercises it; handler implementation includes it.

Total time: ~3 hours, including the meta-rule emergence. A typical triage without step #9 is ~60 minutes.

---

## When this protocol is the wrong tool

- **Logic bug, not standards gap**: if the handler produces wrong data because the SQL query is wrong, this protocol is overkill. Just fix the query.
- **Performance regression**: this protocol is about UX shape, not speed. Use the performance-analyst-specialist agent instead.
- **Security issue**: do not use this protocol for security reports. Use the forensic-security-investigation protocol or sec-ops-specialist.
- **Confirmed multi-site bug class (5+ sites)**: skip to the bug-class-eradication protocol; this triage is for one report.

---

## Anti-patterns

| Anti-pattern | What goes wrong | Prevention |
|---|---|---|
| **Skip step 1, work from paraphrased reports** | Half the triage time is spent re-asking the user for details | Always transcribe the exact call/response before triage starts |
| **Stop at the first standards violation** | The fix lands; six weeks later, the *other* violation produces an adjacent regression | Force step #5 to enumerate ALL violations and ALL affected tools |
| **Apply fixes in any order** | Misleading auto-suggestions become more visible before they become correct | Step #6 dependency-ordering exists for a reason |
| **Skip the smoke test** | The regression returns in three months, this time un-attributable | Step #8 is non-negotiable |
| **Fix without examining the spec** | Local fix solves the report; the spec stays out of date; future drift recurs | Step #9 catches meta-rules; even when none emerges, re-reading the spec costs five minutes |

---

## Document metadata

**Status**: Production-validated through the 2026-05-04 triage that produced it
**Confidence**: 95% (one cycle through; refinements expected after second use)
**Last Updated**: 2026-05-05
