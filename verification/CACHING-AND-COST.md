# Token economics of an autonomous pipeline — what we cache, and what we don't

**Last measured**: 2026-08-29 · Companion to `METHODOLOGY.md`

Autonomous multi-agent delivery has an unusual cost shape, and most of what determines the bill is
decided before a single token is generated. This document states what pAIchart does about it, what
we have measured, and — in the spirit of the rest of this pack — what we found we were *not* doing.

---

## The shape of the problem

A pipeline agent's prompt is dominated by a **large, stable preamble**: the universal agent rules
plus every orchestration protocol the harness may need to select between. Measured against the live
platform on 2026-08-09, that preamble is **57,953 tokens** — and it is byte-identical on every
pipeline execution.

That number is model-specific, which is worth stating because it is the kind of detail that
quietly invalidates a cost model. The same 160,334 characters tokenize to **57,953** tokens on
Sonnet 5 (~2.77 chars/token) and **40,210** on Haiku 4.5 (~3.99) — a 44% difference for identical
text. Pipeline executions run on Sonnet 5, so 57,953 is the operative figure. We report it because
we got this wrong ourselves first: an internal measurement taken on Haiku was carried into a Sonnet
workload for a day before a review caught it.

Around it sits a small amount of genuinely variable content: the platform-resolved mode, the task's
own context, the agent's template. On a typical run the stable part is the overwhelming majority of
the prompt.

Then the agent reasons across many turns — calling tools, reading results, deciding what to do next —
and **the entire prompt is re-sent on every one of them.**

That is the whole economic story: **a very large constant, multiplied by turns, multiplied by
agents, multiplied by runs.**

---

## What we do about it

**We cache the prompt prefix.** The Claude API prices a cached prefix at roughly one-tenth of
standard input, against a one-time write premium of about 1.25×. Break-even is two reads. A pipeline
agent gets an order of magnitude more than that.

Measured across 30 days of production execution:

| tier | cache written per execution | cache read per execution | amortisation |
|---|---:|---:|---:|
| pipeline harness | ~89,000 tokens | ~918,000 tokens | **~10×** |
| specialist agent | ~46,000 tokens | ~153,000 tokens | ~3× |

Read the pipeline row as a statement about turns: an execution pays to establish its cache once, then
reads it back about ten times over the course of its own reasoning. **That ratio is the turn count**
— we do not assert it separately, we observe it in the billing. It is why a long agentic run does not
cost ten times a short one, and it is where the majority of the platform's token efficiency comes
from today.

**We measure it rather than assume it.** Cost is derived on read from recorded token counts, never
stored as a number someone typed. One consequence worth stating because it trips up most analyses:
the "input tokens" field on a cached request counts **only the uncached remainder**. Real prompt
volume is `input + cache_read + cache_creation`. Reading the first field alone will tell you an
agent that processed a million tokens processed four thousand.

---

## What we do NOT do — and how we found out

Caching, as configured today, works **within** a single execution and **not across** executions.

Each run establishes its own cache entry and then reads it back through its own turns. The next
agent — even one starting seconds later, with a byte-identical 40,210-token preamble — establishes a
fresh entry rather than reading the previous one.

We did not know this until we measured it. The cause is structural rather than a bug: the cache
boundary sits at the end of the assembled prompt, so the per-task content that follows the shared
preamble prevents any two executions from matching.

**Confirmed by direct experiment, 2026-08-09.** Two request shapes, each issued twice with differing
task content, against the real preamble. Run on Haiku 4.5, where the same preamble measures 40,210
tokens — the experiment tests the *mechanism*, which is model-independent:

| request shape | second call |
|---|---|
| as configured today | wrote 40,259 tokens, read **0** |
| with the cache boundary moved | wrote **0** tokens, read **40,203** |

The first row is the control, and it is the reason the second row means anything: it establishes
that the current shape genuinely never reuses, so the read is attributable to the change and not to
ambient behaviour.

**This is not shipped.** The experiment proves the mechanism; a review panel of three specialists
found the proposed implementation would fail on the majority of executions in its first form, and
that work is open rather than done. When it ships, it will appear here with a measured before and
after.

---

## Why publish a limitation

Because the alternative is a caching claim that sounds identical to everyone else's.

The rest of this pack is built on failure injection and defect-and-fix narratives, on the principle
that a green path proves the least interesting case. The same standard applies to performance: an
efficiency claim you cannot see the boundary of is not a claim you can evaluate.

What we will state plainly:

- **Within a run, caching works and is measured** — ~10× amortisation on pipeline executions.
- **Across runs, it currently does not** — measured, reproducible, and open.
- **The fix is proven at the mechanism level and unproven at the implementation level.** Those are
  different things, and we would rather say so than collapse them.

---

## Reproducing any of this

Every figure above comes from data the platform already records against each execution —
`cacheCreationTokens`, `cacheReadTokens`, `inputTokens`, `outputTokens` — not from instrumentation
added for this document. The cross-execution experiment is a standalone script that renders the real
preamble and issues four API calls; it writes nothing and costs about fifteen cents to run.

If you are evaluating a similar system, the question worth asking is not *"do you use prompt
caching?"* — nearly everyone will say yes. It is **"what is your cache read-to-write ratio in
production, and does it hold across executions or only within one?"** That number is measurable,
it is rarely quoted, and it is where the actual money is.
