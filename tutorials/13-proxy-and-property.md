# Chapter 13 — Proxy and Property: why your guards pass while your system fails

**Audience**: Engineers building systems where AI agents hand work to each other — multi-agent pipelines, orchestration platforms, or any place where one model's output is another model's input. Also anyone who has written a check that stayed green through an outage.
**Prerequisite**: None. [Chapter 11 — Error Recovery Signals: Fact vs. Verdict](11-error-recovery-signals.md) is the closest companion; this chapter is the same instinct pointed at *checks* rather than *signals*.
**Reading time**: ~16 minutes.

---

## What this chapter teaches

A guard that measures the wrong thing does not fail loudly. **It passes confidently.**

That sentence is the whole chapter. Everything below is the evidence for it, gathered over one campaign in which eleven separate defects turned out to share a single shape — and a method for finding them before they find you.

You will get two lenses and one forecasting model:

1. **Proxy vs Property** — is your check measuring the thing it names, or something that usually coincides with it?
2. **Which layer failed** — information, delivery, instruction, or reasoning. This determines the fix, and getting it wrong is how teams spend weeks solving the wrong problem.
3. **The three defect classes** and how their recurrence behaves, so you can forecast a new domain instead of being surprised by it.

The substrate here is a network-automation pipeline where agents produce device configuration for a human to apply. The lessons are not about networking.

---

## The reframe — a check is a claim, and claims can be false

You already accept that code has bugs. It is harder to accept that **the thing checking the code has bugs of a different and nastier kind**, because a broken check does not produce a red build. It produces a green one.

Consider a rule we shipped:

> *"Where the target has no getter in the tool surface, do not predict its output — mandate an operator-captured baseline instead."*

Perfectly reasonable. It ran for five rounds. It never once fired on the failures it was written for.

The rule keys on **"no getter exists"** — a fact about our tooling. The thing it was protecting against is **"nobody has ever seen this rendered"** — a fact about observation. Those coincide *most* of the time, which is exactly what makes the divergence lethal: the commands that failed all *had* getters. Their post-change output had simply never existed to be observed, because the feature being configured did not exist yet.

The guard was pointed at a **proxy**. Not a wrong proxy — a *usually-correct* one. That is worse, because usually-correct proxies accumulate trust.

---

## Lens 1: Proxy and Property

Here is the same campaign's defect list, re-read through that lens. Ten separate problems, one shape:

| The check measured (proxy) | What it meant (property) |
|---|---|
| "no getter exists for this command" | "no rendering of it has been observed" |
| "the throw precedes the first `try {`" | "the throw is outside **every** try" |
| the error *token* — whose first occurrence was a comment | the error *statement* |
| the config file's **record** for a protocol | the protocol's **body** |
| "the line starts with `net`" | "the line is a NET declaration" |
| "the output matches byte-for-byte" | "the property being validated holds" |
| "the two numbers are equal" | "the two quantities are comparable" |
| "the prompt column matches" | "the row is current" |
| "a required line is absent" | "a required line is **wrongly** absent" |
| "no author produced this leg" | "this leg's derivations are unverified" |

Read the right column and every one is obviously the thing we cared about. Read the left column and every one is obviously easier to compute. **That gap is the whole failure mode**, and it recurs because the proxy is nearly always the cheaper thing to write.

### The three shapes proxies take

**Positional proxies.** A test asserted that a critical `throw` "precedes the first `try {` in the file." Someone inserted an unrelated guarded block above it. The test went red on correct code — and worse, when we investigated we found it had been anchored on the error *message token*, whose first occurrence in the file was an explanatory comment two lines above the throw. **The test had been measuring a comment's position, and it passed under mutation.** It had never once guarded the invariant it was named for.

**Lexical proxies.** A checker looked for a required config line `net <NET>`. Since `<NET>` is a placeholder, it degraded the needle to the literal prefix `net` and matched any line starting with it — including the routing protocol's `network 1.1.1.1/32 area 0.0.0.0` statements. It cheerfully reported four instances of a line that appeared zero times. **False presence is the dangerous direction**: it makes an absent requirement look satisfied.

**Scope proxies.** A freshness report compared one column of a row and reported "0 stale". Everyone, including the person who wrote it, read that as "the rows are current." Four other columns had no detector at all. The report was honest; the *reading* of it was a proxy, and nothing in the output corrected the reading — until we made it print what it did **not** cover.

### The test that finds them

For any check you rely on, ask:

> **What would have to be true for this to pass while the thing I care about is false?**

If you can answer quickly, you have a proxy. Then do the thing almost nobody does: **mutation-verify it.** Break the property deliberately and confirm the check goes red. Three of our guards passed that test only *after* being rewritten; one had been green-through-mutation for weeks.

A guard you have never seen fail is not a guard you have tested. It is a guard you have hoped about.

---

## Lens 2: Which layer failed

The second lens answers a different question, and it is the one that saves the most time.

Four defects in one round, all in validation steps, all looking identical from the outside — a package told the operator to expect output the device did not produce. The instinct was: *the model is not good enough at predicting this; use a stronger model.*

We tested that instinct. It was wrong, and the reason it was wrong is that **the four defects lived on four different layers**:

| Layer | What went wrong | Fix lives in |
|---|---|---|
| **Information** | the fact was genuinely unknowable at that moment — the feature had never run, so nothing had ever displayed it | process / sequencing |
| **Delivery** | the fact existed, was written down, and did not arrive — one was **live-verified in our own requirements file** and died at a boundary because that half of the sentence had no structured field | the channel |
| **Instruction** | we had explicitly told the agent to do the wrong thing | the prose |
| **Reasoning** | it held everything it needed and made a category error | model, or a mechanical check |

**Only the bottom row is capability-sensitive.** We ran the A/B anyway — same task, same inputs, same prompt, model as the sole variable. The stronger model produced **twice the output, 55 predicted-output blocks against the weaker model's 1, and never once declined to predict** where the correct answer was to decline. It was *worse* on the axis we had changed, at 2.5× the price.

That result is not a claim that bigger models are worse. It is a claim that **capability does not address an information problem**, and that a more capable model pursuing a mis-stated instruction pursues it *more energetically*. The instruction said "write validation steps." Restraint was correct. More capability bought more enthusiasm.

### The instruction layer deserves its own warning

The single most uncomfortable finding of the campaign: two of the four defects were **authorised by our own guidance**. The role instruction read:

> *"Expected output is LITERAL text quoted from harvested state **or the authored config**."*

Config text and display text are different languages — what you *write* is not what the device *shows*. The agent quoted its own config into an expected-output block, exactly as instructed, and produced a defect. **It was complying.**

Which yields a rule worth more than any amount of prompt-engineering advice:

> **Before concluding that a model ignored your rule, verify the rule was in its prompt — and that it says what you think it says.**

"Binding" is a property of a document. "Present" is a property of a prompt. They drift apart silently, and an *absent* guard produces evidence indistinguishable from a *disobeyed* one — while arguing for exactly the wrong fix. Write the prose harder, and nothing improves, because nothing was ever delivered.

And its corollary, which surprised us: **deleting an authorisation beat adding a prohibition.** Removing the four words "or the authored config" moved the agent's behaviour further than any instruction we could have added, because the agent was already following instructions faithfully. It was following the wrong one.

---

## The conditional obligation — where both lenses meet

There is one defect shape that sits at the intersection, and it is the most invisible thing we found. We named it and registered it as its own bug class:

> **"Where X is present, do Y" is not a guard unless something guarantees X reaches the agent.**

When X never arrives: the predicate is false, **no obligation is owed, nothing is skipped, and no transcript records anything.** The run is *formally clean*. There is no error, no warning, no degradation signal. The check simply never happened, and nothing anywhere says so.

This is worse than an ignored rule, which at least leaves evidence. And it is worse than silent — it is **confidence-generating**, because a clean run under an inert guard reads as proof the guard passed.

Two such clauses were live for five or more rounds in our system. Between them they allowed two rounds to ship configuration that left a routing protocol **completely inactive** while the config entered, committed, and displayed without error.

### The shape that separates sound from inert

When we swept for this class, we found conditionals of *identical grammar* that were perfectly sound. The difference is mechanical enough to check. A sound conditional obligation has all three:

1. **The condition is phrased against the agent's own context** — *"where the block **is available in your chained context**"*, never *"where a harvest exists"*. The agent can evaluate the first; it cannot check the second.
2. **There is an explicit else-branch** — *"where it is not available, grade the finding accepted-from-claims; never claim you verified it."*
3. **The absent case is defined.** Silence is what turns a guard into decoration.

The broken clauses had none of the three. The sound ones had all three. If you write conditional instructions for agents, that triple is the cheapest quality gate you will ever adopt.

⚠️ **Prose review cannot catch this**, because the prose is correct. You have to trace the channel.

---

## Lens 3: Forecasting a new domain

If you run this kind of system, someone will eventually ask "how many iterations until a new use case is production-ready?" Here is the model that survived contact with two campaigns.

**Class A — domain-onboarding defects. These WILL recur, in new clothes, every single time.** Dialect facts, tool-surface gaps, knob shapes, vocabulary collisions, missing bindable targets. These are facts about a *new domain meeting your substrate*, and nobody can pre-write them all. What changes is that you now know the *classes*, so most become front-loadable at design time.

The single highest-leverage practice we added: **a tool-surface adequacy check.** For every acceptance criterion, name the getter or command that retrieves its evidence — at design time, on paper. One of our costliest escalations was discoverable before any hardware was touched: *"parity needs route tables; the tool surface has no route getter."* That required zero devices to notice, and we noticed it three rounds late.

**Class B — generic craft defects. Recurrence measurably decays.** Prose where exact output was required, placeholder outputs, negative-rule violations. The evidence that the decay is real: none of the first campaign's earned rules recurred in the second. The second campaign's craft defects were *new* classes — which then became rules. Each arc's class-B surface is the residual you have not met yet, and it shrinks.

**Class C — platform bugs. One-time each.** Fixed with an incident fixture; they do not come back.

**The forecast**: expect a new domain to take a handful of remediation rounds, dominated by class A, with most of it catchable at design review if you (1) ship your queued mechanical checks *before* launching, (2) run the tool-surface adequacy check, and (3) author the domain's dialect facts up front.

### The framing that matters

If you build systems like this, you will be asked to defend a use case that took five rounds to go green. Here is the honest framing, and it is not a spin:

> The claim was never "no defects." Across eleven defects in two campaigns, **zero reached a device.** They died at the plan gate, the quality gate, or the operator's apply — each one leaving a rule behind.

A new use case producing a short remediation campaign is not the system failing. **It is the system doing the thing it exists to do.** The number that matters is not defects found; it is defects *escaped*.

---

## What to take to your own system

Six practices, each earned by a specific failure:

1. **Mutation-verify every guard.** Break the property; confirm red. A guard you have never seen fail is untested.
2. **Corpus-measure before proposing a violation class.** Pull the real population and count actual instances *and* naive false positives. Ours: of two findings a checker had ever produced, **one was false** — a 50% false rate we would not have known without counting.
3. **Absence must be a named reason, never a silent pass.** `checked: false` always carries *why*. "Zero violations because clean" and "zero violations because nothing was scanned" must never render identically.
4. **Say what your check does not cover**, in the check's own output. Do not rely on the reader remembering.
5. **Verify the rule was in the prompt** before concluding it was ignored.
6. **Scan what the system will BECOME, not what the operator will RUN.** Our checker flagged an author for writing a command that *searched for* forbidden tokens in order to prove their absence. The package was being more rigorous than the checker.

And the one that governs the rest:

> **Prefer the property to the proxy — and when you must use a proxy, write down which property it stands for.** Then the next person to touch it knows what they are allowed to break.

---

## A closing note on humility

Every lens in this chapter was discovered by being wrong in public.

The proxy lens came from a test that had been measuring a comment. The layer lens came from proposing a deterministic renderer to solve what turned out to be a delivery problem — a fix that would have been built, shipped, and useless. The conditional-obligation class came from two guards that had been inert for five rounds while everyone, including their author, believed they were working.

The most useful thing we did was not any individual fix. It was **measuring the fix's own assumptions** — running the corpus count, running the mutation test, running the A/B that contradicted the intuition everyone shared. Three of those measurements returned answers opposite to what the team expected.

If a system tells you it is healthy, the first thing worth checking is whether it is capable of telling you it is not.

---

## What's next

The mechanical counterpart to this chapter is the checker discipline itself: how to write a check that reports facts rather than verdicts, and how to earn the right to make it blocking. That is [Chapter 11 — Error Recovery Signals: Fact vs. Verdict](11-error-recovery-signals.md), which is the same instinct pointed at what your *tools* tell an AI client rather than at what your *checks* tell you.

---

## Provenance

The work described here was carried out across the IGP-T1 and Firewall-A3 campaigns (2026-08), on a multi-agent orchestration platform running network-change pipelines against live Arista cEOS devices. The proxy/property lens, the four-layer fix model, and the conditional-obligation bug class are internal standards in that team's protocol-authoring guide and bug-class registry; the tool-surface adequacy check is now part of its use-case design playbook.

The specifics — a routing protocol migration, an EOS command surface, a canonical configuration stanza — are the substrate, not the lesson. Any system in which one agent's output becomes another agent's input has the same channels, and therefore the same failure modes.

- **pAIchart Hub overview** (latest info & instructions): <https://github.com/paichart/paichart>
- **Hub access**: <https://paichart.app/mcp>
- **Instructions**: connect with Claude Desktop (GitHub OAuth) or ChatGPT (Microsoft OAuth)
- **Chat with**: "Help me get started with paichart" or "/prompt list"
- **Privacy**: <https://github.com/paichart/paichart/blob/main/PRIVACY-DEMO.md>
- Companion: [Chapter 11 — Error Recovery Signals: Fact vs. Verdict](11-error-recovery-signals.md) · [Chapter 9 — Hardening MCP Tools](09-hardening-mcp-tools.md)

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
