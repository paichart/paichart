# TODO: Protocol Experimentation Framework

**Status**: Vision
**Phase**: TBD (post-protocol-library-maturity)
**Created**: 2026-04-22
**Estimated Effort**: High — three related sub-features, each ~1 session of design + 2-3 sessions of build, plus a shared prerequisite
**Dependencies**:
- **Blocker**: outcome-metric definition (what does "this protocol performed better" mean operationally?)
- **Soft prerequisite**: mature protocol library — at least 3 competing protocols targeting overlapping task classes
- **Platform**: execution telemetry (signals, durations, tokens, confidence) stable and queryable at scale

---

## Introduction

The pipeline harness makes new planning/synthesis strategies cheap to author — a protocol is a DB seed, not a code change. That's asymmetric with how we currently *evaluate* protocols: authoring is minutes, but deciding whether the new one is actually better is ad-hoc prose judgement on a handful of runs.

As the protocol library grows, informal comparison stops scaling. Two new protocols with overlapping scopes will silently compete (the LLM picks one implicitly at runtime), and we won't know if the pick was right. A regressive protocol — one that looks plausible but degrades outcomes — could ship and stay in rotation indefinitely.

This doc captures the three sub-features that would close that gap, plus the shared design question that gates all three.

## Objective

Give protocol authors a feedback loop that answers "did this change help?" with statistical confidence, and a safety net that disables a change that regresses production.

In scope:
- **A. Automated A/B testing** — randomised protocol assignment across matched pipelines, outcome logging, per-arm aggregation
- **B. Statistical guarantees** — significance tests, minimum sample sizes, confidence intervals on the outcome metric
- **C. Rollback on regression** — automatic detection of a statistically significant degradation + disable-the-protocol action, with alerting

Out of scope for now:
- Cross-protocol *composition* experiments (A+B together vs A alone)
- Multi-arm bandits / adaptive assignment (start with fixed random assignment first)
- Human-in-the-loop rating UIs (if those become the outcome metric, they're a separate layer)

---

## A. Automated A/B Testing

**What it is**: When two or more protocols target overlapping task classes, assign pipelines to a protocol randomly rather than letting the LLM's implicit match decide. Record the arm assigned and the measured outcome so the two populations can be compared later.

**Why it matters**: LLM-driven protocol selection is noisier than random assignment for comparison purposes — it's correlated with task description phrasing, which correlates with task characteristics, which correlates with outcomes. Clean comparison requires assignment uncorrelated with the task's inherent difficulty. Random assignment gives that for free.

**Minimum viable shape**:
- An experiment registry — a list of `{experiment_id, protocol_arms[], eligibility_filter, active_window}` records
- On harness entry, if the task matches any active experiment's eligibility, deterministically hash (pipeline id → arm) and force that protocol
- Tag the harness execution with `experiment_id + arm_id` in metadata so outcomes can be grouped later
- A reporting view aggregating outcomes per arm

**Open questions**:
- Eligibility filters — title regex, template id, phase type, something else?
- How to handle pipelines that *already* have a protocol explicitly named in the title — exclude from experiments, or override?
- Should the harness log "would have picked X, assigned Y" for counterfactual analysis?

---

## B. Statistical Guarantees

**What it is**: Per-arm outcome metric aggregation with the standard statistical machinery — mean + confidence interval, significance test against control, minimum-sample-size thresholds before any verdict is shown.

**Why it matters**: Without power analysis, any reported "10% improvement" is unfalsifiable noise at small N. Without minimum sample sizes, we'll be tempted to call winners at 20 runs when the variance demands 200. Without confidence intervals, decisions will be made on point estimates that are within each other's error bars.

**Minimum viable shape**:
- A per-experiment `minimum_n_per_arm` derived from a pre-registered effect size and power level (0.8 is the usual default)
- Welch's t-test (or equivalent non-parametric if the outcome is rank-based) on each pairwise arm comparison
- A status field per experiment: `collecting | significant_winner | significant_no_effect | inconclusive_underpowered`
- Outcome values displayed with CIs, never as bare point estimates

**Open questions (most are outcome-metric open questions disguised)**:
- **Is the outcome continuous or binary?** Confidence score (continuous) vs "did SYNTHESIZE complete without protocol gaps" (binary) have different tests.
- **Is the outcome observed immediately or delayed?** Quality-rated outcomes (days later) need a holdout window; system-observable outcomes (token cost, duration) are instant.
- **Do we care about compound outcomes?** Most real preferences are joint (quality-per-token, success-rate-at-fixed-budget) — pure single-metric comparison may understate the right tradeoff.
- **Multiple comparisons correction?** If one experiment runs 5 arms, pairwise t-tests need Bonferroni or similar.

---

## C. Rollback on Regression

**What it is**: Continuous monitoring of deployed protocols against their baseline; automatic disable (or revert) if an arm crosses a statistically significant degradation threshold on any guardrail metric.

**Why it matters**: A new protocol that looks better on the headline metric can be worse on unmonitored dimensions (cost, latency, failure rate, user escalations). Rollback-on-regression is the backstop that lets protocol authors ship more aggressively — they know a bad protocol will be caught and retired without manual intervention.

**Minimum viable shape**:
- Per-protocol guardrail metrics list (e.g., "don't regress token-cost by > 20%" and "don't regress confidence-score by > 0.1")
- A monitoring job that evaluates each active protocol nightly against its guardrails using the last N eligible runs
- Auto-disable action: flip the protocol's `active` flag off + post a comment to an alert channel + record the disable reason in the prompt library
- Manual re-enable path for authors to iterate and re-ship

**Open questions**:
- What's the N-of-samples window — last 50 runs, last 7 days, some adaptive combination?
- Guardrail breach severity: single-threshold auto-disable vs tiered (warn → throttle → disable)?
- Does rollback revert to the previous protocol version, or to the "no protocol" baseline? (Protocol version history is a separate deferred item — see TODO-DEFERRED-FEATURES.md.)
- Alert routing — which channels, who owns triage?

---

## The shared prerequisite — outcome metrics

All three sub-features are downstream of a decision we haven't made yet: **what counts as a good outcome for a protocol run?**

Candidate metrics, roughly ordered from cheapest to most informative:

| Metric | Observable? | Notes |
|--------|-------------|-------|
| Harness execution completed cleanly (SYNTHESIZE mode reached, no missing steps) | Immediate, system-observable | Binary. Already surfaced by the protocol validator. Low variance — most runs should pass. |
| Error category breakdown (which P-categories fired) | Immediate, system-observable | Discrete. Useful for detecting regressions but not for ranking improvements. |
| Token cost per pipeline | Immediate, system-observable | Continuous. Easy to regress on, easy to optimise wrongly (cheap protocols that produce junk). |
| End-to-end duration | Immediate, system-observable | Continuous. Similar caveats to cost. |
| Final confidence score | Immediate, self-reported by agent | Continuous. Noisy — agents rate their own work. Correlated with token spend. |
| Human rating of deliverable | Delayed, requires workflow | The gold standard. Expensive; requires a rating queue. |
| Downstream acceptance (customer AI in the agent-to-agent eval story) | Very delayed | Matches the long-term vision but far off today. |

Pragmatic starting point: a composite of the first three (protocol-validator-clean + error-category-absent + cost-under-threshold) treated as a single pass/fail outcome. That's cheap, unambiguous, and can ship before human-rating infrastructure exists. When the library and run volume grow enough to demand finer-grained comparison, layer in confidence score and eventually ratings.

Until the outcome-metric question is resolved even at that pragmatic level, work on A/B/C is premature — no point building comparison infrastructure when we don't agree on what we're comparing.

---

## Suggested first step

Not "start building A/B testing."

**Start by writing a 1-page outcome-metric spec** that names the composite pass/fail outcome, the guardrail metrics, the eligibility rule, and the treatment of edge cases (FAILED children, budget-exhausted runs, synthesis skipped). Circulate it, get agreement on what we measure. Then A/B testing (sub-feature A) has a well-defined target and can scope itself.

The spec is ~half a session of work. Everything else is downstream of it.

---

## Related docs

- `ARCHITECTURE.md` §Protocol Injection — how protocols currently attach to executions
- `TODO-DEFERRED-FEATURES.md` — Protocol version history / changelog entry (prerequisite for cleanly reverting on rollback)
- `TODO-AGENT-TO-AGENT-EVALUATION.md` — longer-horizon vision where the outcome signal comes from a customer AI rather than internal metrics
- `.claude/knowledge/patterns/prompt-library-gold-standard-pattern.md` — authoring side of the protocol pipeline that this framework would sit downstream of
