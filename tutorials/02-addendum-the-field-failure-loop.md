# Chapter 2 — Addendum: The Field-Failure Loop

**Audience**: Engineers maintaining an MCP tool surface that is already in use by real clients.
**Prerequisite**: [Chapter 2 — Ten Gold Standards](02-the-ten-gold-standards.md), especially GS3 (Error Categorisation) and GS7 (Error Response `nextSteps`).
**Reading time**: ~12 minutes.

---

## What this addendum teaches

A gold standard can pass its checklist and still fail its purpose.

GS3's checklist asks: *does the error carry category-specific recovery steps?* It does not ask the harder question: *do those steps lead to recovery?* The first is mechanical and easy to verify. The second is only observable in the field, when a real AI client follows your recovery guidance and either recovers or doesn't.

This addendum is a case study of the gap between the two — a real, dated incident in which a tool's error response met GS3 and GS7 on paper, yet a capable AI client followed the tool's own guidance straight to a **wrong conclusion**. It then describes the loop that surfaced the gap: a field signal, an independent reproduction by a second agent with deeper access, and a two-layer fix that includes a refinement to the standard itself.

The point is not that the standard was wrong. The point is that **standards are kept honest by a feedback loop, and this is what one turn of that loop looks like.** Chapter 2's "Applying these standards to your own server" describes the *proactive* loop (audit → fix → re-score). This addendum documents the *reactive* one — the loop that starts when something breaks in production and a human pastes the wreckage into a chat window.

Three roles run that reactive loop, and naming them is half the lesson:

- A **field agent** — the AI client in production. It has *only* the tool surface to reason from.
- A **human relay** — present at the failure. Supplies the context the protocol cannot carry, and asks the question that turns a bug report into a standards question.
- A **deep-access agent** — with repository, host, and log access. Reproduces the failure and distrusts the field verdict.

The standard matters *because of the asymmetry between the first role and the third*: the field agent cannot escalate to the deep-access agent's vantage. When it fails, the error signals are the only recovery instrument it has. If those signals mislead, it has nowhere else to look — which is exactly what happened.

---

## The incident (2026-05-28)

### Stage 1 — the field signal

A user running pAIchart through a mobile MCP client — **the field agent**, with only the tool surface to go on — asked it to run a four-step workflow (`daily-energy-weather`: two energy-data calls, two weather calls). The first step — an external data service's `get_generation_mix_by_state` tool — failed:

```
"error": "TIMEOUT: workflow:eia-service/get_generation_mix_by_state exceeded 30000ms limit",
"errorType": "timeout",
"retryable": true,
"attempts": 1
```

The client did the sensible thing. It read `retryable: true`, checked the service's health (green — 3 ms), and retried. Same timeout. It fetched the tool schema, called the tool directly with an extended timeout, and timed out again at exactly 30 s. It concluded: *"This isn't transient — the tool is broken."*

That conclusion was wrong. But every step the client took was guided by the tool's own responses. **The recovery information was present and the client used it correctly — and it still arrived at the wrong answer.** That is the failure this addendum is about.

The **human relay** captured the entire tool exchange verbatim and reported it with one piece of context the tool responses did not contain: *"it failed after about twenty minutes of idle, right after the client reconnected."*

### Stage 2 — the independent reproduction

The report went to the **deep-access agent** — repository and production access, rather than only the MCP tool surface. The discipline here matters: **it did not trust the field agent's conclusion.** "The tool is broken" was a hypothesis to be reproduced, not a finding to be actioned.

It checked, from the outside in:

- The upstream data API, called directly: **HTTP 200 in 3.2 s.** Not slow.
- Network egress from inside the service's container: **285 ms.** DNS resolved. Not a connectivity break.
- All service containers: **up, zero restarts**, health green.
- Then it re-ran the exact failing call through the live tool surface: **success in 1.1 s.** The full workflow: **2.0 s, all four steps.**

The failure was gone. It had been **transient and self-clearing** — the precise opposite of the first agent's "not transient, broken" verdict.

### Stage 3 — root cause

Reading the service's client code closed the loop. The service held a long-lived HTTP client with default keep-alive, pooling connections to its upstream. The user's twenty-minute idle let a pooled socket go half-open. The next call reused the dead socket and hung — with no response — until the client's own request timeout fired. That timeout was set to the same value as the platform's per-step ceiling (30 s), so the platform gave up at the same instant, every retry hit the same wedged pool, and the service's own retry logic never got far enough to open a fresh socket before the caller had already been told "TIMEOUT".

Health stayed green throughout because the health probe is an endpoint ping — it never travels the pooled upstream path that was actually broken.

This is an ordinary, well-known failure mode (stale keep-alive after idle). The bug was understood and a patch was obvious. But the **human relay** asked a second, larger question — not *"how do we fix this service?"* but *"could the field agent have recovered on its own — did the tool give it what it needed?"* That question is the hinge of the whole loop: it reframes a closed bug as an open audit of the recovery signals, and it is what produces a standards fix rather than just a patch. What makes the incident instructive is not the bug. It is what the *error response* did with it.

### Stage 4 — where the standard's signals misled

The tool's response met GS3 (categorised error, recovery steps) and GS7 (structured `nextSteps`). Here is each signal it provided, and why following it led the client astray:

| Signal the tool returned | What the client reasonably did | Why it misled |
|---|---|---|
| `errorType: "timeout"` | Treated it as "slow", not "wedged" | A stale-socket hang and a genuinely slow query are indistinguishable under one `timeout` category |
| `retryable: true` (no timing) | Retried **immediately**, twice | A stale socket needs seconds-to-minutes to clear; immediate retries hit the same dead pool and were doomed |
| `nextSteps: "check service health"` | Checked health, saw green | The health probe can't see the wedged upstream path — a green signal blind to the actual fault |
| `timeout` accepted in the schema | Passed `90000` to test a longer wait | The platform silently capped it to 30 000 — the client burned an attempt on a test that never ran |
| workflow auto-retry **off by default** | Had to retry by hand | `retryable: true` was advertised but not *acted on*; the platform reported a property it did not itself honour |

Every one of these is a checklist-pass and a purpose-fail. The error was categorised (GS3 ✓) but the category was too coarse to be actionable. Recovery steps were present (GS3 ✓) but one of them pointed at a signal that could not see the fault. `nextSteps` were structured (GS7 ✓) but timing-blind. The standard's letter was met; its intent — *a client that follows the guidance recovers* — was not.

---

## The two-layer fix

A field failure like this almost always decomposes into two layers, and an honest fix touches both:

**Layer 1 — the service implementation (the actual bug).** Lower the upstream request timeout well below the platform ceiling so a hang fails fast and the retry — on a *fresh* connection — still completes inside the ceiling; evict stale keep-alive sockets rather than reuse them; and log each upstream call with its latency, so the next occurrence is visible instead of silent. (The silence — the service logged nothing per request — is why this took external reproduction to diagnose at all.)

**Layer 2 — the platform signals (why the client was misled).** This is the half that touches the gold standards:

- Make `retryable` actionable — carry a `suggestedRetryDelayMs`, so a client doesn't hammer a fault that needs time.
- Stop a category from being a dead end — a *second* consecutive timeout to the same service is reasonable grounds to evict the connection and retry once, the middle ground between "a timeout is never a dead connection" and "always evict".
- Make health honest about its own blindness — for a timeout, say plainly that the endpoint probe may read green while the tool's upstream is wedged.
- Honour the contract — either apply the caller's `timeout` (clamped) or reject it; never accept-and-ignore a parameter.

Layer 1 is fast and local. Layer 2 is slower, crosses more code, and is where the durable improvement lives — because Layer 2 is what would have let the *first* agent recover on its own, with no second agent required.

---

## The mechanism, generalised

The proactive audit loop in Chapter 2 starts with a checklist. This loop starts with a casualty. Stated as a procedure any team can adopt:

1. **Capture the raw exchange.** The verbatim tool request/response is the evidence. A paraphrase ("the energy tool didn't work") loses the `errorType`, the `attempts`, the exact timeout boundary — the very fields that diagnose it.
2. **Add the out-of-band context.** The single most useful fact in this incident — *"after twenty minutes idle"* — was not in any tool response. The human who was present supplies what the protocol cannot.
3. **Reproduce independently, and distrust the first conclusion.** A second agent with deeper access (repo, host, logs) treats the field verdict as a hypothesis. Here, "broken" reproduced as "fine" — the reproduction *was* the finding.
4. **Decompose into two layers.** The implementation bug, and the signal that misled. Fixing only the first leaves the next client to be misled the same way.
5. **Feed the standard, not just the patch.** This is the step the human relay forces, with the Stage-3 meta-question — *did the tool give the field agent what it needed to recover?* The implementation fix closes one ticket; the standard refinement closes the *class*.

Step 5 is the one teams skip — and it is the one a purely-automated loop skips by default, because only the human relay tends to ask the question that escalates a patch into a standard. A patched service is a closed incident; a refined standard is a closed category.

---

## What this changes in the standards

GS3's checklist gains a line it did not have: **recovery steps must be trustworthy, not merely present.** Concretely:

- A recovery step must not point the client at a signal that cannot observe the failure (the "check health" trap for upstream-dependent timeouts).
- `retryable: true` should travel with timing guidance, or it invites the doomed immediate retry.
- A property the response *advertises* (`retryable`) should be one the platform *acts on*, or it is documentation pretending to be behaviour.

None of this demotes GS3. It sharpens it — the way GS7 was itself sharpened by an observed mobile rendering bug (see the provenance table in Chapter 2). A standard that is never revised by contact with the field is not mature; it is merely untested.

---

## Checklist — is your recovery information trustworthy, not just present?

- Does each error category map to a recovery step a client can *act on*, or only to a label?
- Does any `nextStep` send the client to a signal (a health probe, a status field) that is blind to the failure it's diagnosing?
- Does `retryable: true` carry *when* to retry, not just *that* it may be retried?
- Does the platform itself honour the recovery hints it returns (auto-retry on `retryable`; apply the `timeout` it accepts)?
- When a recovery path fails, can a client distinguish "transient, wait" from "persistent, stop" — or do both render as the same timeout?
- Is the failure *visible in logs* without external reproduction, or did diagnosing it require someone with host access?

A response that passes GS3's original checklist can fail every line above. That gap is the work.

---

## Outcome

The loop closed on the implementation and on the signals the team chose to ship — with one refinement deliberately *withheld*, which turned out to be the most instructive part.

**Layer 1 — shipped and verified in production.** The service that failed, plus the two siblings sharing its HTTP-client pattern, received all four resilience rules: a per-request timeout capped below the caller's ceiling, retries extended to timeout/connection errors (not only HTTP 5xx), keep-alive disabled so an idled-out socket can't be reused, and — most consequentially for the *next* incident — per-call latency logging. The original failing workflow now completes end to end, and the once-silent services emit a line per upstream call:

```
[service] upstream OK <endpoint> <ms>      (and on failure: upstream FAILED <endpoint> <ms>: <code>)
```

That last rule matters most: the failure that took a deep-access agent to reproduce would now be visible in the service's own logs. The field agent still can't escalate — but the humans maintaining the service can finally see what it sees.

**Layer 2 — shipped, with one deliberate deferral.** The team's internal companion pattern (the domain-specific gold-standards doc the chapter's "Creating your own pattern" section anticipates) gained an *Upstream-Call Resilience* standard — the durable, checklist form of the four rules. Three platform-signal refinements then shipped and were verified in production: (1) the timeout error no longer steers clients to the blind health check — it states that transient timeouts usually clear, advises a short delay, and warns that a green `/health` does *not* mean the call will succeed (the GS3 "recovery steps must be trustworthy, not merely present" refinement, made concrete); (2) the `timeout` contract is now honest — the caller's value is applied (clamped to a hard cap) instead of accepted-and-ignored, and the response reports what was actually applied; (3) on a failure, the response carries the service's *recent success rate* — a fact the client can reason from.

The fourth refinement — a flag that *tells* the client a failure is transient or persistent — was the most valuable-sounding, and it was **deliberately not shipped**. That signal would be an unvalidated verdict (a heuristic over a moving average), and on a surface every client reads, a wrong verdict re-creates the exact failure this incident was about: confident, silent, wrong. So the team shipped the *fact* (the recent success rate) and deferred the *verdict* until there is production data to validate it. That call — *ship facts, earn verdicts* — became its own standard: a public chapter ([Chapter 11 — Error Recovery Signals: Fact vs. Verdict](11-error-recovery-signals.md)) and an internal signal-design review protocol. Naming what was deliberately withheld, and why, is the honest part: a loop that only reports its successes isn't a loop, it's a press release.

So one field failure — captured and contextualised by a human, reproduced by a deeper agent — hardened three services and produced four standard updates: two internal (the *Upstream-Call Resilience* pattern and the *Signal Design* review protocol) and two public chapters (this case study and [Chapter 11](11-error-recovery-signals.md)).

---

## Provenance

This addendum documents a single incident on 2026-05-28: a transient stale-keep-alive timeout in an external data service, reported from a mobile MCP client, reproduced and root-caused via repository and production access, and decomposed into a service-implementation fix (shipped and verified) and a set of platform-signal refinements — three shipped and verified in production, with a fourth (a transient-vs-persistent verdict) deliberately deferred as an unvalidated heuristic. See Outcome above.

The pattern of the loop — capture, contextualise, reproduce-and-distrust, decompose, feed-the-standard — is universal. The specifics (an energy-data service, a 30-second ceiling) are the substrate, not the lesson.

- pAIchart Hub overview: <https://paichart.app>
- Companion: [Chapter 2 — Ten Gold Standards](02-the-ten-gold-standards.md) · [Chapter 11 — Error Recovery Signals: Fact vs. Verdict](11-error-recovery-signals.md) · [Chapter 9 — Hardening MCP Tools](09-hardening-mcp-tools.md)

---

## License

This addendum is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
