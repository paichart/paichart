# Specialist-Review Launch Prompt — Kubernetes / GitOps Pipeline

> Phase 5.0 of the use-case design playbook. A Protocol 2 specialist review that gates the
> Kubernetes/GitOps design out of Draft before any build. Copy the block below into a fresh
> session (or launch in-session). It points the specialists at the design docs and tells each
> to run discovery-first. Worked sibling: `../network-provisioning/SPECIALIST-REVIEW-PROMPT.md`.

## Prompt (copy from here)

```
I need a Protocol 2 specialist review of a Pipeline Harness use-case DESIGN (not yet built)
before we author anything. The use case: an autonomous Kubernetes/GitOps provisioning pipeline
(read-only cluster harvest → declarative desired-state design → approved-but-unapplied GitOps
change package; the reconciler/kubectl applies it OUTSIDE the loop).

READ FIRST (design docs + grounding):
1. .claude/knowledge/pipelines/kubernetes-gitops/kubernetes-gitops-pipeline.md   (the RFC — Phases 1-3)
2. .claude/knowledge/pipelines/PIPELINE-DOMAIN-FIT-CATALOG.md  (§K8s + transfers-vs-domain-specific)
3. .claude/knowledge/pipelines/PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md  (the procedure + Phase-2 role-reuse rule)
4. .claude/knowledge/domain/harness/harness-output-guards.md  (R9/R10, shipped + flag-gated)
5. .claude/knowledge/discoveries/pipeline-harness-discovery.md  (shipped harness invariants)
6. lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts  (ROLE_GUIDANCE_LIBRARY — the roles we reuse)
   and the shipped reference: scripts/seed-network-provisioning-templates.ts.

Run FOUR specialists. Each MUST run its own discovery prompt FIRST (ground in CURRENT code, not
just these docs), then assess. Target >= 85% confidence (Protocol 2); below 75% is a blocker that
must be named. Map every finding to a Required-Work item (R1/R2/K1/R9/R10/K2/K3/R-val/B1-B5).

1) sec-ops-specialist — the security floor (the design-first trio):
   - R1: the read-only verb-enum surface. Is excluding exec/attach/port-forward/proxy/cp/eviction/
     scale/watch sufficient and complete? Any other actuation-bearing read-adjacent subresource missed?
   - R2: least-privilege read-only ServiceAccount (RBAC ∧ verb-enum defense-in-depth). Is RBAC the
     right enforcement half? kubeconfig/SA-token credential boundary, no-fallback, storage/injection.
   - K1: harvest secret METADATA not values + exclude logs. Does this actually shrink R10 to ~zero?
     Residual leak paths (ConfigMap data, annotations, env, downward API)?

2) boundary-contract-specialist — the data boundaries:
   - The Harvester -> Architect -> Author auto-chaining via Section 6 (result.json.finalResponse).
     Field leakage / completeness of the harvested snapshot; the 50KB tool-result truncation trap.
   - K2 harvest scoping (namespace/label/type) — is the contract sufficient for token budget?
   - R9 at the harvest boundary (annotations/labels/ConfigMap as injection carriers) + R10 conditional on K1.
   - The descriptor contract (WS4) for the read-only k8s service.

3) architectural-review-specialist — fit, seam, and REUSE:
   - The cognition/actuation seam + the GitOps terminus (K3 declarative-not-imperative). Is the
     "harness never calls a write verb" invariant airtight given Argo/Flux/kubectl apply is out-of-loop?
   - Protocol 10 (R-val): are the validation steps FACTS (kubeconform/kubectl diff/OPA), not verdicts?
   - The role-reuse-vs-duplicate decision (B1): is reusing change_reviewer as-is + generalizing
     config_change_author/solution_architect correct, or are we under/over-reusing?

4) validation-engine-specialist — the verb-enum schema (B5):
   - The structured Zod verb-enum for inner-arg validation (envelope-only wrapWithSchema does NOT
     reach inner args). Pathological matrix: reject exec/injection/newline/`;`/`--`/homoglyph/escalation.
   - The descriptor schema (read-only capabilities.tools, typed args).

CROSS-CUTTING (every specialist must weigh in): BACKWARD COMPATIBILITY of shared-role reuse.
We will REUSE existing role-guidance (change_reviewer as-is; config_change_author/solution_architect
generalized) rather than mint k8s-specific clones. IF your assessment recommends EDITING a shared,
SHIPPED role to serve k8s, you MUST evaluate the impact on the LIVE network-provisioning pipeline:
  - Prefer ADDITIVE generalization (broaden phrasing) over replacing network-specific text.
  - Equivalence-gate it: the network pipeline's output must be unchanged in MEANING after the edit
    (the harvested live config is the syntax exemplar, so domain context carries specifics).
  - A role-KEY rename (e.g. network_state_harvester -> infra_state_harvester) is a Protocol 11 drift
    sweep: update the network template's defaultRole + ALL refs in the same commit.
  - Keep the pre-commit role validators (Deliverable Contract + coverage) and any string-pinned
    tests (scripts/test-*.ts) green.

OUTPUT: create cline_docs/reviews/kubernetes-gitops-design-<date>/ with each specialist's findings,
a confidence score per specialist, and a CONSOLIDATED recommendation-coverage table mapping EVERY
recommendation (Critical / Important / Nice-to-have) to folded-in / deferred-with-reason /
rejected-with-reason — so the long tail isn't dropped behind the headline number.

IF the review clears >= 85% with no blocker, the build phase (Phase 6) is, sequenced AFTER the pass:
  - template-system-specialist authors B1 templates REUSE-FIRST (no new role keys beyond ~0-1) per
    Pattern #44 Gold Standards;
  - prompt-construction-specialist makes any shared-role generalization BACKWARD-COMPATIBLY
    (additive + equivalence-gated, per the cross-cutting rule above);
  - then B2 (protocol text) / B3 (descriptor) / B4 (logging) / B5 (verb-enum tests).
```

## (end prompt)

## Why this shape

- **Discovery-first** is the standing project instruction — each specialist grounds in current code,
  not just these docs (otherwise the review reflects the docs, not the tree).
- **Four specialists**: the Protocol 2 security-change row (sec-ops + boundary-contract +
  architectural-review) plus validation-engine, because the **read-only verb-enum is the security
  floor** and inner-arg validation is its core. "Prefer more specialists, not fewer."
- **Backward-compatibility is cross-cutting, not one specialist's job** — reusing shipped roles is the
  whole anti-duplication strategy, so a regression to the LIVE network-provisioning pipeline is the
  highest-blast-radius risk this review exists to catch.
- The **recommendation-coverage table** is required so the long tail of findings survives the headline.
- Build actors (template-system + prompt-construction) are sequenced **after** a passing review, and
  carry the reuse-first + backward-compat mandate into Phase 6.
