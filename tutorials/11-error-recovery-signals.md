# Chapter 11 — Error Recovery Signals: Fact vs. Verdict

**Audience**: Engineers whose MCP tools are called by AI clients that have to recover from failures on their own, with only the tool surface to reason from.
**Prerequisite**: [Chapter 2 — Ten Gold Standards](02-the-ten-gold-standards.md) (GS3 Error Categorisation, GS7 `nextSteps`). The [Chapter 2 Addendum — The Field-Failure Loop](02-addendum-the-field-failure-loop.md) is the incident this chapter designs the fix for; reading it first helps but isn't required.
**Reading time**: ~14 minutes.

---

## What this chapter teaches

The addendum told the story of one incident — a transient timeout that a capable AI client followed, step by guided step, straight to a *wrong* conclusion ("the tool is broken" — it had already self-recovered). That chapter was about **how we found the gap**: the field-failure loop, the three roles, the discipline of reproducing-and-distrusting.

This chapter is about the other half: **what we decided to put in the error response — and, more instructive, what we decided to withhold.** It introduces the lens we now apply to every signal a tool returns to an AI client: **fact vs. verdict, weighted by blast radius.**

Not a how-to. A case study of a design decision, with one goal: to show why the single most *valuable-sounding* recovery signal was the one we deliberately did not ship.

---

## The reframe — you are programming a reasoner

Start with the thing that makes recovery signals a different engineering problem from anything else on your server.

A normal API returns data to code **you wrote**. *You* decide what a `500` means, *you* write the retry, *you* are in the loop. The consumer is deterministic and under your control.

An MCP tool returns data to an LLM **you do not control**, which treats your response as authoritative and **acts on it autonomously**. Your error response is not a diagnostic for a developer to read — it is an *input to a reasoner's decision loop*. The client will do what your response leads it to do.

Once you see the error response that way — as instructions a reasoner will act on, not data a human will inspect — signal quality stops being cosmetics. A misleading signal doesn't just look untidy; it *steers a capable system into the wrong action*, confidently, every time.

That is exactly what the incident was. In one paragraph (the full account is in the addendum): a service held a keep-alive socket to its upstream; twenty minutes idle left the socket half-open; the next call hung until the 30-second ceiling fired. The tool returned `errorType: "timeout"`, `retryable: true`, and a `nextStep` to *check service health*. The client did all of it correctly — checked health (green), retried, tried a longer timeout — and concluded the tool was broken. It wasn't. It had self-recovered in about a second. Every step the client took was guided by our responses.

---

## Two kinds of signal

The lens has two axes. The first is the one that matters most, and it is easy to blur in practice.

**A fact is a verifiable truth.** "This call took 30,000 ms." "The recent success rate is 92%." "The error was `ETIMEDOUT`." A fact can only be *wrong as a bug* — and a bug is findable and fixable.

**A verdict is a judgment layered on facts.** "This is transient — retry." "This service is broken." A verdict can be wrong **even when every underlying fact is correct**, because it is an inference about an unknown: the upstream's true state, or the future.

Here is the trap that ties the two together: **the client cannot tell your facts from your verdicts.** Both arrive as authoritative text in the same response. A wrong verdict carries exactly the same authority as a correct fact. The reasoner has no way to discount it.

## The second axis — blast radius

How many clients read this signal, how often, how silently, and how recoverably can acting on it wrongly be undone. A recovery signal scores at the maximum on every dimension: **every** client reads it, on **every** failure, **silently** (the client just believes it), and acting wrongly wastes the user's time or abandons recoverable work.

## The asymmetry that makes "fact" the default

Put the axes together and the expected value is lopsided:

- A verdict's **upside** over a plain fact is *small*. A capable client can usually infer "92% recent success, and it just timed out → probably worth a retry" from the fact alone.
- A verdict's **downside** is *large and correlated*. When your heuristic is wrong, it is wrong for a whole **class** of situations, every time, for every client, silently — and it erodes trust in the entire surface.

Facts fail in bounded, you-can-find-it ways. Verdicts fail in unbounded, silent, trust-eroding ways. "Facts by default; verdicts only when earned" is not timidity. It is just the arithmetic.

And there is a kicker specific to recovery work: **the incident itself was a wrong verdict.** The surface, in aggregate, implied "broken, not transient," and a smart client believed it. If you fix a wrong-verdict problem by adding *another* unvalidated verdict, you risk becoming the second source of confident wrongness — the same failure, one level up.

## When a verdict earns its place

A verdict graduates to safe when it is **validated** — when you have measured that it predicts the outcome and you know its error rate ("services above X% recent success that time out recover on retry Y% of the time"). Then it is no longer a guess; it is a measured prediction with a known failure mode.

The path to get there is the useful part: **ship the fact → the fact generates the data → if the data supports the thresholds, you have earned the verdict.** A fact is not a lesser version of a verdict. It is the *input* a responsible verdict is built from.

---

## The decision — what we shipped, and what we withheld

The addendum's incident exposed several candidate signals. Run each through the lens and the right action falls out — including the action of *not acting*.

| Candidate signal | Fact or verdict? | Decision |
|---|---|---|
| Stop the timeout `nextStep` pointing at the blind health check; state plainly that a green `/health` doesn't prove the call will succeed | **Fact** ("the probe can't see this path" is true) | **Shipped** |
| Honour the `timeout` parameter the schema advertises (clamped), and report what was actually applied | **Fact** (repairs a broken contract; states the applied value) | **Shipped** |
| Surface the service's *recent success rate* on failure | **Fact** ("~92% recently") | **Shipped** |
| Assert *transient → retry* / *persistent → stop*, plus a suggested retry delay | **Verdict** (unvalidated heuristic) | **Deferred** |
| On a second timeout, evict the connection and retry | **Verdict** about the connection's state | **Rejected** |

The first three are facts — or the repair of a fact. The last two are verdicts, and they are where the discipline lives.

### What we shipped (the facts)

Concrete, in pAIchart's environment:

- **The message fix.** The timeout `nextSteps` no longer leads with "check health." It now says transient timeouts usually clear on their own, advises a short delay before retrying, and warns that the health probe is an endpoint ping that can read green while the tool's upstream path is wedged. This is GS3's "recovery steps must be trustworthy, not merely present" refinement (introduced in the addendum) made concrete — and every word of it is a fact about how the probe works.
- **The `timeout` contract.** `services(action: "call")` used to *accept* a `timeout` parameter and then silently ignore it — a property the response advertised but did not honour. It is now honoured: caller value if set, else the service's configured ceiling, else 30 s, clamped to a 300 s hard cap. The schema dropped its old `.default(30000)` (which silently filled the field on every call and would have masked a service's own configured ceiling) and gained explicit bounds. The response now reports `effectiveTimeout`, `requestedTimeout`, and `timeoutClamped` — the field that would have told the incident's client its `90000` request had been capped to `30000`, instead of letting it burn an attempt on a test that never ran.
- **The recent-success-rate fact.** On a failed call, the response now carries `recentSuccessRate` — read from the per-service success-rate average the hub already maintained (an exponential moving average over recent calls, weighting the last handful most). It is framed, in both the human-readable text and the structured `_meta`, as *recent quality* — explicitly not as a claim about whether this is the first failure. The client gets a number to reason with; it is not told what to conclude.

(The service-implementation bug underneath all this — the stale keep-alive socket — was fixed in its own layer and is covered in the addendum. The four resilience rules became an internal *Upstream-Call Resilience* standard.)

### What we withheld (the verdict) — and why that is the chapter

The most *valuable-sounding* signal on the list is the fourth: a flag that says **transient → retry** or **persistent → stop**. It is the one that would most directly "let the field agent recover on its own," which was the whole point of the exercise. We had the data to build it — the recent-success-rate average was right there. And we did not ship it.

The lens is why. That verdict would be an **unvalidated heuristic**: an average plus two threshold numbers we picked by intuition, with no production data telling us they actually separate a transient blip from a persistent fault. Worse, it fails in the exact shape of the original incident — a service whose upstream has *just* gone hard-down still carries a high recent-success average, so the verdict would say "transient, retry," and the client would retry into a dead service. On a maximum-blast-radius surface, that is not a bug you find later; it is the incident, re-created by the fix meant to prevent it.

So we shipped the **fact** (`recentSuccessRate`) and deferred the **verdict** — which is exactly the data input a future, validated verdict would be built from. When there is production data showing the thresholds predict the outcome, the verdict can be earned. Until then, we inform the reasoner; we do not prescribe to it.

The fifth candidate — evict the connection and retry on a second timeout — was **rejected** outright, on a different lens: it is aimed at the wrong layer. The incident's stale socket was *service-to-upstream*; the connection a hub-level evict would replace is *hub-to-service*. Replacing it gets a fresh channel to the same wedged process. It would not have fixed this incident, it reverses a deliberate "a slow service is not a dead connection" decision, and it invites a retry storm against a service that is merely slow. (A sibling idea — defaulting workflow steps to auto-retry — was deferred for an orthogonal reason: auto-retrying a non-idempotent step is a hazard, not a convenience.)

---

## What it cost

Three honest trade-offs, in the spirit of the rest of this series.

**The fact is less actionable than a verdict would have been.** `recentSuccessRate: 92` asks the client to reason; `disposition: "transient"` would have told it what to do. We chose the one that cannot mislead over the one that is more directly useful, and the cost is real: the field agent now recovers with *better facts*, not with a verdict. It is more capable than before, not fully autonomous.

**Honouring `timeout` is a behaviour change on a parameter that used to be inert.** A client that had been passing `timeout` and silently having it ignored will now have it applied (clamped). The blast radius is small — no internal caller passed it, and the value is bounded — but a change from "ignored" to "honoured" is a contract change, and worth saying out loud.

**The recent-success average is recent-quality, not first-failure precision.** It weights the last several calls; it cannot tell you "this is the first failure after a long clean streak" with certainty. The copy says so deliberately, because a fact that overstates its own precision is halfway to being a verdict.

And, as in Chapter 7's consolidation case study: we did not instrument the *before* state well enough to publish a hard number for how much the new facts improve client recovery. If your environment needs that number, instrument before you ship, not after.

---

## When to apply this on your own server

Three signs your recovery signals need this lens:

1. **Your error responses are steering clients to wrong conclusions.** Trace logs show clients giving up on failures that were recoverable, or hammering ones that weren't. The information was present; it just pointed the wrong way.
2. **You advertise a property you don't act on.** A `retryable: true` you don't auto-retry; a `timeout` you accept and ignore; a status field that doesn't reflect the thing it names. A contract the response states but the platform doesn't honour is documentation pretending to be behaviour.
3. **You're tempted to emit a verdict you haven't validated.** A `transient`/`persistent` flag, a "the service is down" assertion, a confidence score, a suggested retry delay. The temptation is the signal to stop and ask the two questions: *is this a fact or a verdict?* and, if a verdict, *is it earned or guessed?*

The rule of thumb that falls out of all of it: **when in doubt, ship the fact, instrument, and earn the verdict.** A reasoner can do a great deal with good facts. It cannot recover from a confident wrong verdict, because it has no way to know the verdict is wrong.

---

## Postscript — the same lens, one day later

A day after this work landed, a follow-on bug surfaced and the lens caught a verdict in the team's *own* response surface — the kind of audit the chapter sidestepped: **the lens isn't only for new signals you're designing; apply it to existing ones too.**

The follow-on was small. The platform's background health probe had been counting a `404` from a service's `/health` route as a *failure*, even though many MCP services legitimately don't expose REST `/health` (they answer with 404). That was quietly pinning those services' `successRate` EMAs to near-zero. Fixing the probe — treating any HTTP response under 500 as "the server answered" — was a straightforward correctness pass. But once those EMAs were no longer fed contaminated data, an *older* signal turned out to be reading wrong.

The health response's `recommendation: "use" | "avoid"` field — shipped long before this chapter's lens existed — was binary: `use` if and only if the service was healthy *and* its `successRate >= 90`; otherwise `avoid`. After the probe fix, an external service's EMA started climbing out of its phantom-failure hole. At about 83% — clearly recovering, with the realtime ping reporting healthy — the response still came back:

```json
"recommendation": "avoid",
"nextSteps": ["⚠️ Service has low success rate: 83.3%",
              "Consider using a more reliable service", ...]
```

A live-up service was being prescribed "avoid." Same failure mode as the original incident, on a different surface.

Run it through the lens:

- A *verdict* ("avoid", "use something else") layered on a fact (the EMA percentage).
- An *unvalidated threshold* (90% cutoff — same shape as the transient/persistent thresholds we deferred earlier).
- A *contaminated input* — the EMA still carrying recent phantom failures, plus a permanent `errorCount` counter that never resets.
- *Contradicting a live fact* — the realtime probe in the same response said the service was up *right now*.

The fix wasn't to remove the field — that's a contract change for unclear gain. The fix was to make the verdict honest: **a live-up service is never `"avoid"`** (the live signal overrides the stale EMA), and the low-EMA prose was reframed from prescription ("use a more reliable service") to fact (state the rate, with the EMA caveat; surface `discover(minSuccessRate)` as a *client-chosen* filter instead of a platform instruction). The threshold itself stays an unvalidated tunable, tracked alongside the original deferred verdict.

Two lessons land, both compounding the originals:

1. **Verdicts rot.** A verdict that was reasonable at ship time becomes wrong when its inputs change — a related fix, a contamination, a drift in the underlying distribution. The lens is an audit you *reapply* when surrounding signals move.
2. **Live signals beat stale ones.** When a response carries both a current observation and an aggregated history, the verdict on top must not let the stale signal contradict the live one. If the fact stack isn't coherent, the verdict will be wrong some of the time.

The right answer to "this verdict is misleading" isn't always deletion. Sometimes it's making the verdict's inputs honest, reframing what the response prescribes versus what it states, and keeping the unvalidated threshold on a track to be earned.

---

## What's next

This chapter and the Chapter 2 addendum are a pair: the addendum is the *diagnostic* loop (how a field failure surfaces a gap), and this one is the *design* discipline (how you decide what to do about it). Chapter 9 (Hardening MCP Tools) is the proactive counterpart — the standards that stop a class of these from reaching the field in the first place.

---

## Provenance

The work described here was carried out on 2026-05-29, as the platform-signal half of the 2026-05-28 field-failure incident documented in the [Chapter 2 Addendum](02-addendum-the-field-failure-loop.md). The message fix, the `timeout` contract, and the recent-success-rate fact shipped to pAIchart's MCP hub; the transient/persistent verdict was deferred with the reasoning above, and the connection-evict idea was rejected. The internal companion to this chapter is a *Signal Design* protocol (the fact-vs-verdict lens, applied during design review) and the *Upstream-Call Resilience* standard in the team's domain gold-standards doc.

A follow-on on 2026-05-30 surfaced and fixed the health probe's 404-as-failure miscount and, via the lens, an older `recommendation: "use" | "avoid"` verdict that the probe fix exposed as misleading on live-up services with recovering EMAs (commit `228fa920`). The Postscript above documents that second pass. A further refinement the same day added an `errorCount7d` scoped fact alongside the legacy lifetime `errorCount` (commit `eaeae1dc`) — a *fact-framing honesty* application of the lens (a fact whose name implies one scope and whose value delivers another silently misleads in the same shape as a wrong verdict); the team's internal Signal Design protocol now captures this as a sub-axis (precision / scope / freshness).

The lens — fact vs. verdict, weighted by blast radius — is universal. The specifics (an energy-data service, a 30-second ceiling, an exponential moving average) are the substrate, not the lesson.

- **pAIchart Hub overview** (latest info & instructions): <https://github.com/paichart/paichart>
- **Hub access**: <https://paichart.app/mcp>
- **Instructions**: connect with Claude Desktop (GitHub OAuth) or ChatGPT (Microsoft OAuth)
- **Chat with**: "Help me get started with paichart" or "/prompt list"
- **Privacy**: <https://github.com/paichart/paichart/blob/main/PRIVACY-DEMO.md>
- Companion: [Chapter 2 — Ten Gold Standards](02-the-ten-gold-standards.md) · [Chapter 2 Addendum — The Field-Failure Loop](02-addendum-the-field-failure-loop.md) · [Chapter 9 — Hardening MCP Tools](09-hardening-mcp-tools.md)

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
