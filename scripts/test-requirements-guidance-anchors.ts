/**
 * test:requirements-guidance-anchors — pins the phrases that give the requirements-authoring rules their SCOPE
 * (harvested-state panel FU7, filed HS-FU7; built 2026-09-25).
 *
 * 2026-11-28 (parcel A): the requirements Author is retired, so its two roles' anchors, the protocol half, the RPR 2b negative
 * pins and the question-key / owner-line parity were removed. What stays are the anchors on LIVE guidance that came from the
 * same requirements work — the Program Architect, the leg roles and Node C reading a spec.
 *
 * Why: the harvested-state defect of 2026-09-23 was rooted in a PARAPHRASE. Canonical writing rule 5 ("write
 * properties, not hardcoded values, wherever the environment can be rebuilt") was restated into the Author's
 * guidance as "where a value can be COMPUTED" — dropping values merely READ from the target — and nothing noticed.
 * Each anchor below is a phrase whose loss would narrow a rule the same way. If you are rewording one of these
 * sentences on purpose, keep the MEANING the anchor carries and update the anchor in the same commit — this test
 * exists so the narrowing is a decision, not an accident.
 * Pure: the guidance library has no imports; no database.
 */
import { ROLE_GUIDANCE_LIBRARY } from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';

const ANCHORS: Array<[role: string, phrase: string, why: string]> = [];

// ── RPR Phase 0 batch 2a+2b (2026-10-01, requirements-pipeline-review SYNTHESIS §3 items 1-2) ──────────────────────
// Branch conditions travel VERBATIM on the contract; each leg role answers them about their own subject; "gap report"
// is reserved for the `gap` outcome (regen 4 labelled every act-regardless row `gap`).
ANCHORS.push(
  ['program_architect', 'BRANCH CONDITIONS ARE CONTRACT FIELDS, carried VERBATIM',
    'RPR 2a: the premise reached a leg Architect verbatim once (answered correctly) and was dropped/reworded three times (all misread)'],
  ['program_architect', 'Service descriptors: only for a leg whose sources block you do not carry',
    'PLAN-SPAWN-DESCRIPTOR B (2026-10-10): program run 1 spawned both legs without the descriptors the plan named; the contract is copied to every leg verbatim (C2-a). Narrowed 2026-11-17 (ARCHITECT-COMPOSED-DESCRIPTOR): the platform derives the descriptor for a leg whose sources block the plan carries (20f127cf0); the Architect still writes it for a leg with none'],
  ['program_architect', 'Acceptance checks are not a leg\'s job — keep them out of leg objectives entirely',
    'ACCEPT-SELFCHECK (Run 9): "Validate against Acceptance checks 1, 3" in a leg objective made a leg self-assess and blocked the program'],
  ['program_architect', 'State what the leg must ACHIEVE, as its objective',
    'ACCEPT-SELFCHECK review: the property a leg must achieve stays in its objective; only the CHECK is excluded'],
  ['program_architect', 'Never prescribe HOW a leg validates',
    'RPR 4b: a contract ordered a validation shape the leg protocol forbids (validation.leg2, 2026-09-22); the leg obeyed'],
  ['infra_change_architect', 'Answer every branch condition about its OWN subject',
    'RPR 2a: three of four legs answered "did the value arrive?" for a condition about what the enforcer observes'],
  ['config_change_author', 'Branch conditions are answered by the Architect, not by you',
    'RPR 2a: a leg Author re-answered the premise from the chained value ("principal confirmed — arrived via DAG chaining")'],
  ['change_reviewer', 'Every branch condition has an answer that names its evidence',
    'RPR 2a: evidence PRESENCE — the reviewers that approved the misreadings never saw the condition'],
);
// ── pattern (h) batch 3 (2026-10-04, text at source) ────────────────────────────────────────────────────────────────
// The builder renders the atomic-row rule into BOTH architect roles; each is anchored on its own key so a future fork
// of buildProgramArchitectGuidance cannot drop it from one role silently.
ANCHORS.push(
  ['program_architect', 'One entry per row id, never a combined id',
    'pattern (h) batch 3: 10 of 12 contracts (09-29→10-03) merged two of one leg\'s rows into one id, spelled five ways — no leg or reviewer can count it row by row'],
  ['value_chain_architect', 'One entry per row id, never a combined id',
    'pattern (h) batch 3: same rule through the shared builder; value-chain B7 runs carried the combined id'],
  ['config_change_author', 'Never assess your own package — whether or not it derives anything',
    'pattern (h) batch 3: the ban read as derivation-scoped; a non-deriving terraform consumer was refused for a self-assessed acceptance-check section (2026-10-01)'],
);
// ── promotion E, E3 — 1d (2026-10-05; SYNTHESIS P11, REVIEW-template-system M4, -architectural-review M3, -prompt-construction F8)
// The two-network-legs case has ONE rule, and it carries the default: keep EVERY network leg on the change token until
// the human answers by re-planning (E3 review PC-L1/L2: the leg-description channel cannot answer a leg type; ND2's shape has 4). It AMENDS the folded value-leg sentence — never a second sentence beside it. Anchored on both Architect keys
// (one constant today; a fork of either drops it loudly), with a negative pin below that the old permissive tail is gone.
const ONE_D_ANCHOR = 'raise it under Assumptions & open questions, and keep EVERY network leg on the change token (`network-provisioning`, `leg type: change`) until the human answers by re-planning';
ANCHORS.push(
  ['program_architect', ONE_D_ANCHOR,
    'promotion E 1d: two network legs share the network-provisioning row key; without a default the Architect could type one a value leg before the human answered'],
  ['value_chain_architect', ONE_D_ANCHOR,
    'promotion E 1d: same rule through the one constant (alias key)'],
);
// ── promotion E, E6 — C1-a wiring (2026-10-06; PLAN-v2 §E6, P22, B9; value-chain-post-window C-PLAN-SPAWN-DESIGN §C1)
// In 3 of 7 value-chain runs the producer and Node C were wired to the change-method gates because the Architect read
// the requirements' "blocks program completion" column as a dependency instruction (and the harness obeyed 4 of 4 times
// it was told). The Architect half of the rule is anchored here on BOTH keys (one constant; a fork drops it loudly); the
// protocol half (PLAN-SPAWN steps 5/6, "never a gate") is pinned beside the E2 pins in test-value-leg-containment.ts.
const E6_NO_EDGES = 'Never prescribe dependency edges for the program-synthesis producer or the program integration reviewer, and never put dependency or wait-for instructions in the contract';
// E6 review PH-M1: state the fact without naming a step — "the program synthesis waits" read as the PRODUCER waiting
// for the gates, i.e. the C1 cause restated as a platform fact.
const E6_GATE_HOLDS = 'holds program completion by existing: the program cannot complete until every child, gates included, has finished';
ANCHORS.push(
  ['program_architect', E6_NO_EDGES, 'E6 C1-a: an Architect-prescribed gate edge on the producer/Node C was obeyed 4 of 4 times (C1, 3 of 7 value-chain runs)'],
  ['value_chain_architect', E6_NO_EDGES, 'E6 C1-a: same rule through the one constant (alias key)'],
  ['program_architect', E6_GATE_HOLDS, 'E6 C1-a: the cause was reading "blocks program completion" as an edge; the gate needs none to hold completion'],
  ['value_chain_architect', E6_GATE_HOLDS, 'E6 C1-a: same rule through the one constant (alias key)'],
);
// The protocol half (PROTOCOL_ANCHORS, phrases in requirements-authoring-protocol) was REMOVED 2026-11-27: the protocol is a
// DEPRECATED tombstone (Author retired, cline_docs/reviews/author-sunset-2026-11-27/INVENTORY.md). The role-guidance anchors
// below stay: the Program Architect ones guard live text, and the requirements roles stay dormant in the library.
let passed = 0, failed = 0;
// The RPR 2b negative pins (requirements_author guidance + the vendored skeleton) were REMOVED 2026-11-28 with them (parcel A).
// Negative pin (promotion E 1d): the old permissive wording — "raise it" with NO change-token default — must be gone, and
// the two-legs case must be stated exactly ONCE (one rule per case: a second sentence would leave two instructions).
{
  const OLD_1D = 'raise it under Assumptions & open questions; do not split the rows yourself';
  const CASE = 'If the program needs both a network value leg and a network change leg';
  for (const role of ['program_architect', 'value_chain_architect']) {
    const text = ROLE_GUIDANCE_LIBRARY[role] || '';
    const gone = text.length > 0 && !text.includes(OLD_1D);
    console.log(`${gone ? '✅' : '❌'} ${role} no longer carries the permissive 1d wording (raise it, no change-token default)`);
    if (gone) passed++; else failed++;
    const once = text.split(CASE).length - 1 === 1;
    console.log(`${once ? '✅' : '❌'} ${role} states the two-network-legs case exactly once (${text.split(CASE).length - 1})`);
    if (once) passed++; else failed++;
  }
}
for (const [role, phrase, why] of ANCHORS) {
  const text = ROLE_GUIDANCE_LIBRARY[role];
  const ok = typeof text === 'string' && text.includes(phrase);
  if (ok) { console.log(`✅ ${role} carries "${phrase}"`); passed++; }
  else { console.log(`❌ ${role} is missing "${phrase}"\n   why it matters: ${why}`); failed++; }
}

// The question-key parity across the skeleton, the two requirements roles and the registry, and the owner-line parity, were
// REMOVED 2026-11-28 with the retired Author's guidance and skeleton (parcel A). The registry is a retired reference document.
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
