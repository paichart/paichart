# Instruction Beside Its Subject — an agent follows a rule only where it reads it

**Confidence**: 85% ⚠️ (one pre-registered lab with a same-text position contrast, one live canary; one domain)
**Category**: Agent Template / Prompt construction
**Added**: 2026-11-26 (pipeline-harness, from lab L-OBS-MLH; owner-approved schedule item 1)
**Related**: `prompt-library-gold-standard-pattern.md` (#45, GS4 protocol rules) · `agent-template-gold-standard-pattern.md` (#44) ·
`staged-lab-registration-pattern.md` · Protocol 16 (`protocols/pre-registered-lab-gate-protocol.md`) ·
`domain/harness/defect-layer-routing.md` (Step 0: a control already ships → measure COMPLIANCE)

---

## The pattern in one rule

**When a platform rule must override a more specific instruction an agent receives (a brief, a task body, a contract note), put
the rule DIRECTLY beside the text it governs — not at the end of the system prompt. Same words, different place, different
outcome.** Check compliance by whether the agent's own output cites the rule: in the measured case every compliant sample cited
it and every non-compliant one never mentioned it.

## The evidence (lab L-OBS-MLH, 2026-11-25; record `cline_docs/reviews/config-sources-plans-2026-11-09/LAB-RESULT-L-OBS-MLH.md`)

A leg orchestrator wrote a Harvester brief that carried the six declared `## Config sources` lines and then a narrowing sentence
("Read only the files this leg's own objective concerns …"). The Harvester obeyed the brief over the protocol and held 1 of 3
declared files (live: canary B, 2026-11-24). Measured on the stored production brief, standard tier, n 5 each:

| Variant (one change each) | Held all 3 declared files | Cited the rule |
|---|---|---|
| stored brief, no rule | 0 of 5 | — |
| stored brief with the narrowing sentence removed | 4 of 4 | — |
| + a fixed 682-char platform rule at the END of the system prompt | **2 of 5** | 2 of 2 holds; 0 of 3 misses |
| + the SAME text directly after the `## Config sources` block, above the narrowing sentence | **5 of 5** | 5 of 5 |
| control: a brief that never narrowed, + the rule beside the block | 3 of 3 | — |

Shipped as cut 2026-11-25T11:11:47.804Z (`lib/agents/harness/config-sources-read-rule.ts`); the live re-run of the canary held
3 of 3 on all three observability legs and released.

The same family, a second instance: lab L-CS-O stage 4 — the Reviewer's text already said a false Git-vs-served claim is a
blocking finding; a claim in an apply-note list was approved 4 of 6 times (the same claim elsewhere refused 15 of 15). A
"find every statement" constraint made it search but still miss (1 of 4). The rule was right; the reading position failed.

## How to apply

1. **Render, don't rely on composition order.** Insert the rule at a fixed anchor in the text the agent treats as its
   instructions for the subject (here: after the last line of the block, in BOTH copies of the brief — system HEAD and user §3).
   Never alter the governed text's own bytes; pin the insertion with a round-trip test.
2. **Gate it narrowly** (role, protocol allow-list, a parsed subject) so no other prompt moves; prove 0 bytes elsewhere.
3. **Make it a labelled paragraph, not a heading** — a heading makes the next sentence read as part of the rule.
4. **Measure compliance, not presence:** a pre-registered cell with the ORIGINAL failing input + the rule (one change), scored
   by platform facts; count whether outputs cite the rule.
5. **Keep a no-regression control** on an input that already complied.

## Anti-patterns

- **Appending a "platform rule" block to the system tail** and calling the override done (measured 2 of 5).
- **Adding more Reviewer/Harvester text to say "search harder"** — it changes what the agent does, not what it finds.
- **Fixing only the writer** of the narrowing instruction: any orchestrator, any domain, can write it again; the fix belongs
  where it lands.

## Limits (why 85%)

One domain (observability), one model (Sonnet 5), one kind of conflicting instruction. Widening to Kubernetes/Terraform is
registered (LAB-PREREG-L-OBS-MLH widening controls, n 3 each). Promotion to 90%+: the widening controls pass, or a second
rule moved beside its subject measures the same contrast.
