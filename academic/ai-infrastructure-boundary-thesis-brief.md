# Masters Thesis Brief — Trustworthy AI Access to Operational Infrastructure

**Proposed by**: pAIchart · **Status**: open, unclaimed · **Last updated**: 2026-08-12
**Suited to**: a masters student in AI / machine learning / AI systems
**Contact**: Steve Terry — <steve.terry@paichart.com>

> **Read [`CONCEPTS.md`](CONCEPTS.md) first** if MCP, agentic pipelines, or pAIchart are unfamiliar. It
> assumes no networking background and explains why this boundary is where the hard problems now sit.

---

## The shape of this project

The student builds an **MCP server exposing live network devices to an AI system**, then uses it to run
a measured experiment about **AI behaviour at that boundary**.

**The server is the instrument; the AI question is the experiment.** Building a telescope is not
astronomy, but nothing gets observed without one. The thesis is judged on the experiment; the server
is the apparatus that makes it askable — and, unusually for AI research, it makes the question askable
against *real systems with real consequences* rather than a benchmark.

Three tracks are offered. **Each is a complete thesis on its own.** They share the same build, so the
choice can be deferred until the apparatus works.

---

## Why this is worth doing

**MCP is now industry infrastructure under neutral governance.** Created by Anthropic and open-sourced
in November 2024, it was donated in December 2025 to the **Agentic AI Foundation**, a directed fund
under the **Linux Foundation** co-founded by Anthropic, Block and OpenAI. Its steering committee
includes Anthropic, OpenAI, Microsoft, Google and Amazon. By early 2026 it had 10,000+ published
servers and roughly 97 million downloads, with v2 under active design.

**And the governance is genuinely open to outsiders.** Specification changes proceed through public
**Specification Enhancement Proposals (SEPs)**, developed in open Working and Interest Groups.
Maintainer status is held by *individuals on merit*, with no reserved corporate seats.

So a well-evidenced finding here does not stop at a thesis. It is material for a SEP or an Interest
Group, at precisely the moment v2 is being designed. **A student's measured result can become a
contribution to an international standard.** That is not an aspiration we are inventing — it is how the
process is documented to work.

**The unsolved part is the boundary, not the model.** Frontier model capability is not the bottleneck
for agentic infrastructure work. The bottleneck is that everything a model reads becomes part of its
instructions, that its confidence is poorly calibrated to its correctness, and that the interface it
reads through determines what it can do. Those are the three tracks below.

---

## Track B — Indirect prompt injection through infrastructure telemetry

> ⭐ *The most current, and the one most likely to excite an AI supervisor.*

**Research question.** How effective are structural defences — content quarantining, sanitisation,
provenance marking, privilege separation — against indirect prompt injection delivered through
*machine-retrieved operational data*?

**Why it is open.** Indirect prompt injection is unsolved in general. Most published work studies web
pages, documents and email. **Infrastructure telemetry is a materially different channel**: the fields
are attacker-influenceable (interface descriptions, device banners, hostnames, DNS records), they are
retrieved automatically rather than chosen by a user, they carry high implicit trust because they look
like machine state rather than prose, and the consequence of a successful steer is a configuration
change to production infrastructure.

**Method.**
1. Build a payload corpus planted in device state — banners, interface descriptions, route comments.
2. Run the agent pipeline over the poisoned estate under varying defence configurations
   (none / sanitised / structurally quarantined / provenance-marked).
3. Measure **steering rate**: did the agent's output change in the attacker's intended direction?
4. Analyse which payload classes survive which defence, and why.

**Contribution.** A threat taxonomy for this channel, plus measured defence efficacy. Directly relevant
to a specification that currently says little about it.

**Honest risk.** A weak payload set yields a vacuous "our defences worked." Attack construction is the
creative core — budget real time for it, and treat a *failed* attack as a result requiring explanation.

---

## Track A — Where must code replace model judgement?

**Research question.** In agentic infrastructure automation, which correctness properties can an LLM
be trusted to verify, and which require deterministic code? Is stated confidence a usable signal for
that decision?

**Why it is open.** Multi-agent systems increasingly use "LLM-as-reviewer" as a quality gate. The
implicit assumption is that a reviewing model catches what an authoring model gets wrong. That
assumption is under-tested, and we have production evidence against it.

**Real failure data you would be given.** In our own runs, an LLM reviewer **approved a materially
wrong address derivation at confidence 92/100**. In another, a non-minimal aggregate — authorising
addresses no system used — passed **five** successive review tiers. Binary-prefix arithmetic appears to
be a systematic blind spot: the errors are *plausible*, so review does not catch them.

**Method.**
1. Generate a corpus of flawed-but-plausible artifacts (off-by-one coverage, non-minimal aggregates,
   boundary-straddling ranges) — we can supply the fault generator, so no deep networking is needed.
2. Compare catch rates: LLM reviewer vs deterministic checker vs both.
3. Test **calibration** — does stated confidence correlate with correctness? Our evidence says no, and
   a rigorous negative result here is genuinely valuable.
4. Characterise the boundary: what predicts a property being unsafe to delegate to judgement?

**Contribution.** An evidence-based design principle for where mechanical verification must sit in
agentic systems — applicable well beyond networking.

**Honest risk.** The result may be "the model does fine," which is still publishable but less exciting.
Pre-register what would count as either outcome.

---

## Track C — Designing tool surfaces for probabilistic consumers

**Research question.** How do tool granularity, schema richness, description wording and error design
affect an LLM's ability to select and call tools correctly?

**Why it is open.** Every MCP server author faces this and there is little empirical guidance. Tool
descriptions are not documentation — they are *prompt material*. With 10,000+ servers published,
guidance here has immediate reach.

**A measured starting point.** In our own system, tool responses carried a schema echo consuming
**45–49% of every payload**. Removing it cut results truncated before the model saw them from **10 of
14 to 2 of 13** — a large behavioural change from a pure interface decision, with no model change.

**Method.** Hold a task set fixed; vary the surface (few fat tools vs many narrow; verbose vs terse
schemas; with and without worked examples; different truncation and paging strategies). Measure
wrong-tool selection, malformed arguments, recovery from truncated results, and task completion.

**Contribution.** Empirical design guidance for MCP tool surfaces — the most directly transferable of
the three.

**Honest risks.** Consumes the most LLM API calls of the three, and results are model-version
sensitive — test across at least two models and be explicit that findings are dated.

---

## What all three share

**The build** — an MCP server exposing read-only tools over live network devices, meeting a stated
integration contract: verified caller identity (RS256/JWKS), a closed read-only verb set with typed
arguments, per-identity credential resolution, device-scope authorization, and secret redaction at the
boundary. Full specification and conformance checklist supplied.

**The lab** — Arista cEOS-lab under [containerlab](https://containerlab.dev): a real two-node network
on a laptop, free, running in about two minutes. We supply a working topology and device
configurations. No hardware, no procurement, no lab booking.

**The vendor plumbing is not the point.** [NAPALM](https://github.com/napalm-automation/napalm)
provides a normalized read API across Arista, Cisco and Juniper — one `get_interfaces()` call returns
the same structure regardless of vendor. A student needs no prior networking knowledge; the abstraction
is the whole reason it is tractable.

> The companion brief
> [An MCP Server for Network Devices](network-device-mcp-server-thesis-brief.md) treats the *same build*
> as a network-engineering project, where multivendor abstraction and the security contract are
> themselves the subject. If a network or systems student is a better fit, start there instead.

---

## Indicative milestones

| # | Milestone |
|---|---|
| 1 | Background survey; track selected; hypothesis and success criteria stated |
| 2 | Lab running; one read tool reachable over HTTP transport, end-to-end |
| 3 | **Identity verification enforced** — no token, wrong audience, and expired token all rejected |
| 4 | Apparatus complete: full read tool surface + experimental harness |
| 5 | Pilot experiment; instrumentation validated on a small sample |
| 6 | Full experimental run; results analysed |
| 7 | Thesis; optionally, a SEP or Interest Group contribution |

**Milestone 3 is a gate, not a stretch goal.** Device tooling is gratifying and identity verification
is not, so the security half is the part that historically arrives as a stub in the final fortnight.
Track B in particular is *about* the trust boundary — it cannot be evaluated on a server that has none.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Apparatus consumes the whole project, leaving no time to experiment | Milestones 1–4 are deliberately front-loaded and scoped; we supply lab, spec and fault corpus |
| LLM API costs | Scope the experiment matrix at pilot stage (milestone 5), not after the full run; discuss budget early |
| Results are model-version specific | Test across at least two models; date the findings explicitly — this is a legitimate limitation, not a flaw |
| MCP specification churn | Pin a version at the outset; record subsequent change as a finding — integrating with an evolving standard is itself an observation |
| Intellectual property | Check the university's IP policy **before** starting, not at submission |

---

## What pAIchart provides

- The **integration specification** and its conformance checklist
- A **working lab** — containerlab topology and device configurations
- A **platform account** and registered service, so identity forwarding is tested against a real hub
  rather than a mock
- **Fault-injection corpus and prior failure data** (Track A), and our adversarial-injection exhibit
  as prior art (Track B)
- **Technical review at each milestone**, from the engineers who built the platform side

**What we ask for: nothing.** No IP assignment, no exclusivity, no deliverable owed to us. We are
building our own implementation independently, so this project is **not** on our delivery path and the
student is under no commercial pressure. Publish it, keep the copyright, license it as the university
prefers.

If the work produces something worth taking to a SEP or an Interest Group, we will help navigate that
process — but it is the student's contribution and their name on it.

---

## References

- Model Context Protocol — <https://modelcontextprotocol.io>
- MCP governance and the SEP process — <https://modelcontextprotocol.io/community/governance>
- Agentic AI Foundation — <https://aaif.io>
- Linux Foundation announcement of the AAIF —
  <https://www.prnewswire.com/news-releases/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation-aaif-anchored-by-new-project-contributions-including-model-context-protocol-mcp-goose-and-agentsmd-302636897.html>
- Anthropic on donating MCP —
  <https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation>
- NAPALM — <https://github.com/napalm-automation/napalm>
- containerlab — <https://containerlab.dev>
- pAIchart architecture and verification record — [`../verification/`](../verification/)
