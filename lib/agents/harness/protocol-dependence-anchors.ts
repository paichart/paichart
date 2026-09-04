/**
 * PROTOCOL_DEPENDENCE_ANCHORS — the hand-authored delta→base reference pairs (WS1 Phase C, D5).
 *
 * Under composed injection (`loadProtocols: 'composed'`) a domain protocol's prompt carries the
 * BASE + that ONE delta — so every place a delta's prose LEANS on the base ("per the standard
 * rule", "remains in force", "see pipeline-orchestrator-protocol Step 5a") is a cross-document
 * dependence that silently dangles if either side is edited alone. These pairs make each
 * dependence a TESTABLE claim: `ref` must appear in the delta row's promptText and `anchor` must
 * appear in the base row's promptText (scripts/test-protocol-dependence-anchors.ts, DB-needing —
 * health-run list, not CI).
 *
 * HAND-AUTHORED, never harvested — the avg/average near-miss is the reason: pov-program says
 * "never the default orchestrator's average" while the base says "avg of children"; a grep for
 * "average" concludes the anchor dangles, a grep for "avg" finds it (WS1 Phase C panel, R4).
 * Pairing by meaning is a human act; this file records the result so a machine can re-verify it.
 *
 * MAINTENANCE CONTRACT (bidirectional, count-pinned in the test):
 *  - Editing a base/delta string that breaks a pair → the test names the pair; fix the TEXT
 *    coupling (usually restore or re-label), do not weaken the pair.
 *  - Adding a NEW base-reference to a delta (the test counts the reference-marker phrases per
 *    delta) → add its pair HERE in the same commit, or the count pin fails.
 *  - This array is wired into the string-pinned sweep (feedback_string_pinned_tests): rewording
 *    any of these strings in the seed requires updating this file in the SAME commit.
 */

export interface ProtocolDependencePair {
  /** Library row name of the delta whose prose leans on the base. */
  delta: string;
  /** Verbatim substring that must appear in the DELTA row's promptText. */
  ref: string;
  /** Verbatim substring that must appear in the BASE row's promptText (the referent). */
  anchor: string;
  note?: string;
}

export const PROTOCOL_DEPENDENCE_ANCHORS: readonly ProtocolDependencePair[] = [
  // ── The shared infra override clause — identical across all three infra domains (the single
  //    highest-value pin: it is the sentence that MAKES composition semantically coherent). ────
  ...(['network-provisioning-protocol', 'kubernetes-gitops-protocol', 'terraform-iac-protocol'] as const).map((delta) => ({
    delta,
    ref: 'Everything the default pipeline-orchestrator protocol states remains in force except where this protocol overrides it.',
    anchor: '# Pipeline Orchestrator Protocol (System Default)',
    note: 'the override clause presumes the base is present in the same prompt — composition guarantees it',
  })),
  // ── "per the standard rule" ×3 → the base's NAMED Step-5 confidence rule (B8: the name was
  //    added 2026-08-17; before that these three references dangled in prod). ─────────────────
  ...(['network-provisioning-protocol', 'kubernetes-gitops-protocol', 'terraform-iac-protocol'] as const).map((delta) => ({
    delta,
    ref: 'Aggregate child confidences into the harness confidence per the standard rule.',
    anchor: 'the standard rule — avg of children',
  })),
  // ── infra ×3 → orchestrator Step 5a (deliverable-wiring mechanics live base-side; surfaced by
  //    this file's own bidirectional count pin on its first run — the pin works) ────────────────
  ...(['network-provisioning-protocol', 'kubernetes-gitops-protocol', 'terraform-iac-protocol'] as const).map((delta) => ({
    delta,
    ref: 'pipeline-orchestrator-protocol Step 5a for tool-call mechanics',
    anchor: '### Step 5a: Wire the deliverable metadata',
  })),
  // ── artifact-synthesis → orchestrator Step 5a (deliverable-wiring mechanics live base-side) ──
  {
    delta: 'artifact-synthesis-protocol',
    ref: 'pipeline-orchestrator-protocol` Step 5a',
    anchor: '### Step 5a: Wire the deliverable metadata',
  },
  // ── pov-program: six base-references (ph's verified count, WS1 Phase C review) ──────────────
  {
    delta: 'pov-program-protocol',
    ref: 'Pre-flight per the default orchestrator',
    anchor: 'No duplicate pipeline.',
    note: 'references the base CREATE pre-flight (duplicate check + clearance channel)',
  },
  {
    delta: 'pov-program-protocol',
    ref: "per the default orchestrator's ORCHESTRATE rules",
    anchor: '**ORCHESTRATE** — Rare.',
  },
  {
    delta: 'pov-program-protocol',
    ref: 'the mode-detection comment (breadcrumb first line, per the default orchestrator)',
    anchor: 'child-stage breadcrumb',
  },
  {
    delta: 'pov-program-protocol',
    ref: 'pipeline-orchestrator-protocol Step 5a for tool-call mechanics',
    anchor: '### Step 5a: Wire the deliverable metadata',
  },
  {
    delta: 'pov-program-protocol',
    ref: '## Harness Context (Platform-Resolved)',
    anchor: '## Harness Context (Platform-Resolved)',
    note: 'both sides describe the platform-injected block; pinned so a heading rename moves together',
  },
  {
    delta: 'pov-program-protocol',
    ref: "never the default orchestrator's average",
    anchor: 'the standard rule — avg of children',
    note: "THE SHOWCASE PAIR (R4): delta says 'average', base says 'avg' — grep-by-one-word concludes dangling; the pair records the human judgment that they refer to the same rule",
  },
] as const;

/**
 * Reference-marker phrases counted per delta for the BIDIRECTIONAL pin: a new base-reference
 * using any of these phrases must come with an anchor pair above (same commit).
 */
export const BASE_REFERENCE_MARKERS: readonly string[] = [
  'the default orchestrator',
  'default pipeline-orchestrator',
  'pipeline-orchestrator-protocol',
  'the standard rule',
];

/**
 * Expected marker-hit counts per delta row (occurrences of any BASE_REFERENCE_MARKERS in
 * promptText). Re-derive with the test's --print-counts mode after a deliberate change; a drift
 * without an anchor-list change IS the finding.
 */
export const EXPECTED_MARKER_COUNTS: Readonly<Record<string, number>> = {
  // MEASURED against the live seeded rows (2026-08-17, --print-counts) — never guessed.
  // NAMED UNPAIRED HITS (counted, deliberately without an anchor pair — descriptive claims, not
  // textual dependences): each protocol's fence header ("the harness follows it instead of the
  // default pipeline-orchestrator" — names the base descriptively); pov-program's PLAN-SPAWN
  // warning "A child created WITHOUT its token silently routes to the default orchestrator"
  // (a routing FACT — under composition: no token → null stamp → base-only; still true).
  'artifact-synthesis-protocol': 2,
  'network-provisioning-protocol': 4,
  'kubernetes-gitops-protocol': 4,
  'terraform-iac-protocol': 4,
  'pov-program-protocol': 7,
};
