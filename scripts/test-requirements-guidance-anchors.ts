/**
 * test:requirements-guidance-anchors — pins the phrases that give the requirements-authoring rules their SCOPE
 * (harvested-state panel FU7, filed HS-FU7; built 2026-09-25).
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

const ANCHORS: Array<[role: string, phrase: string, why: string]> = [
  ['requirements_author', 'computed from, or merely READ from',
    'the scope that was lost last time: a READ value (an address, a member) is as frozen as a computed one'],
  ['requirements_author', 'counting is computing',
    'counts of harvested things were the dominant leak channel (ten occurrences in one spec)'],
  ['requirements_author', 'harvested state appears NOWHERE in this document',
    'the 2026-09-24 correction: no carve-out, not even Preconditions verified'],
  ['requirements_author', 'The label is a disclosure, not a licence',
    'a "reference data" label must not exempt a value the rule excludes (the Reviewer passed one at 91 through it)'],
  ['requirements_author', 'as a BRANCH the leg\'s own harvest decides, never as today\'s state',
    'N3: an existence assumption states the branch, never which branch is true today'],
  ['requirements_author', 'TRANSCRIBED from a declaration, never chosen from the roster',
    'FU10: approvers come from the declared mapping, never from the POV roster'],
  ['requirements_reviewer', 'Scan the WHOLE document',
    'the detection side of the same rule: check 5 covers every section, not only predicate positions'],
  ['requirements_reviewer', 'Approver provenance',
    'FU10 detection: every approver cell is (declared) or UNASSIGNED'],
  ['requirements_author', "never made inside a leg's instructions",
    'GS-R5a: every design decision is declared, derived-and-stated, or OPEN — Rev 5 made one silently inside Pipeline 1'],
  ['requirements_author', 'is not a basis for a subset',
    'GS-R5a: the basis must name what SELECTS the subset — Rev 5 gave a basis every member of the class satisfied'],
  ['requirements_author', 'An OPEN row carries NO default',
    'GS-R5a/§0b qualifier: disclosure is not authorisation — Rev 5 and Run 3 shipped a disclosed namespace-wide default'],
  ['requirements_reviewer', 'Design-decision provenance',
    'GS-R5a check 8: the detection side — the reviewer counts decision rows, it never "verifies a basis" it cannot see'],
  ['requirements_reviewer', 'An UNASSIGNED gate is a missing design decision',
    'check 7 aligned with check 8 (Steve, 2026-09-26): an unassigned gate blocks like an OPEN decision'],
  ['requirements_author', 'Out of scope is stated as CLASSES, never by naming other objects the harvest found',
    'recurring slip (4 of 8 drafts named a harvested resource in the out-of-scope list); the lint catches the address shape, this rule prevents it'],
];

let passed = 0, failed = 0;
for (const [role, phrase, why] of ANCHORS) {
  const text = ROLE_GUIDANCE_LIBRARY[role];
  const ok = typeof text === 'string' && text.includes(phrase);
  if (ok) { console.log(`✅ ${role} carries "${phrase}"`); passed++; }
  else { console.log(`❌ ${role} is missing "${phrase}"\n   why it matters: ${why}`); failed++; }
}
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
