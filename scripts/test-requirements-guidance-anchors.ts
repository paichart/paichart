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
 * Pure: the guidance library has no imports; the protocol half reads the seed file as TEXT; no database.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
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
  ['requirements_author', 'the existence-assumption branches and the null outcome, not only its table row',
    'RQ-1 (2026-09-28): a declared decision binds the null-case and existing-state branches — three generations contradicted one there, two approved'],
  ['requirements_reviewer', 'against every leg clause and the Approvals table that touch it',
    'RQ-1 detection: check 8 read decisions at TABLE level only ("9/9 rows present") and missed a contradicting branch twice'],
  ['requirements_reviewer', 'state in one line what the command measures',
    'RQ-3 (2026-09-28): a validation command that set the destination while claiming to vary the source was approved'],

  // ── Decision surfacing Phase 1 (2026-09-28, cline_docs/reviews/requirements-decision-surfacing-2026-09-28/
  //    IMPLEMENTATION-PLAN.md — M-numbers below; INDEPENDENT-AUDIT.md for why each bound exists) ──────────────────
  ['requirements_author', 'a fixed list of QUESTIONS, not a list of what the objective happened to declare',
    'M1: 99 of 100 rows read "declared" — the table copied the objective and every undeclared decision went silent'],
  ['requirements_author', 'HOW THE CHANGE BEHAVES',
    'M2: the decision kinds gain the grant and change semantics — the questions every baseline run missed (T0, Z1)'],
  ['requirements_author', '`.receiver`, `.admitted-principal`, `.principal-unseen`, `.granted-action`, `.existing-grant`, `.target-empty`, `.enforcer-absent`, `.target-absent`, `.collateral`',
    'M2/M3: the authorisation block\'s keys, named exactly as the template\'s row ids (Appendix A)'],
  ['requirements_author', 'cite the NUMBER and QUOTE the selecting words verbatim',
    'M4: (declared — item N) turns the reviewer\'s match into a numeric comparison instead of a paraphrase'],
  ['requirements_author', 'ONLY on a target or scope row',
    'M4: derived is legal on target/scope rows only — no harvest read selects a behaviour'],
  ['requirements_author', '`target-absent` and `inputs-empty`, and the answer is ALWAYS `gap`',
    'M5 bounds 1+2 (A-4): the closed forced list and the pinned answer — the worst wrongly-forced row is a gap report'],
  ['requirements_author', 'are NEVER derived and NEVER forced',
    'M4: granted-action / existing-grant / target-empty / collateral are declared or OPEN, never answered by the Author'],
  ['requirements_author', 'rests on a premise — that the enforcer SEES that attribute on the path the sender\'s traffic takes',
    'Run 5 (2026-09-28): who is admitted is a design decision; its visibility premise is a harvest-decided branch, never asserted'],
  ['requirements_reviewer', 'every authorisation leg carries a branch for its `admitted-principal` premise',
    'Run 5: the premise branch is COUNTED (8.4) — a private source range the enforcer cannot see is found by recomputation'],
  ['requirements_author', 'APPLY the `<token>.principal-unseen` row for its outcome',
    'premise branch missed/uncited in 4 runs — it had no slot and no outcome row (convergence panel 2026-09-30)'],
  ['requirements_author', 'a declaration that the program does not verify something is never a reason to drop the branch',
    'regen 2: the cloud leg dropped its premise branch citing item 9 "does not create or verify"'],
  ['requirements_reviewer', 'cites `admitted-principal` and APPLIES `principal-unseen`',
    'regen 1: the Reviewer passed 8.4 with two premise branches absent'],
  ['requirements_author', 'A quote is ONE contiguous span copied exactly from item N',
    'answered T1-zero regenerations (2026-09-30): spliced quotes kept failing, and verbatim fragments joined by an ellipsis can select a different option (12 of 13 rows attackable)'],
  ['requirements_author', 'never put a template placeholder',
    'regeneration 2: a `{{TCP 4317/4318}}` placeholder leaked into a quoted citation'],
  ['requirements_reviewer', 'the one item N selects, reading the WHOLE item, and the one the quoted words select',
    'convergence panel 2026-09-30 (execution-facts): a verbatim span can select the wrong answer — the item\'s own option is the comparand'],
  ['requirements_reviewer', 'one trailing sentence-ending mark',
    'convergence panel: first-letter case and one trailing mark cannot change a quote\'s meaning; 5 of 14 historical non-verbatim quotes were only these'],
  ['requirements_author', 'a hyphen stays a hyphen, never a dash',
    'Rev 23: 7 of 28 citations swapped the objective\'s hyphen for a dash — quotes are copied character for character'],
  ['requirements_reviewer', 'Check citations against the OBJECTIVE OF RECORD, never against your brief',
    'Rev 23: a reworded brief made 11 verbatim citations read as misquotes — the Reviewer fetches the pipeline task instead'],
  ['requirements_reviewer', 'numbers the objective does not have',
    'Rev 23: a citation to a non-existent item 14 passed — item existence is now a count'],
  ['requirements_reviewer', 'write TWO options',
    'Rev 23: a principal row cited words that select no principal form and passed — the selection is now written down, for the item and for the quote'],
  ['requirements_author', '`enforcer-absent` is never forced either',
    'D-2: enforcer-absent is declared once per objective, not forced (A-1)'],
  ['requirements_author', 'never to avoid answering it',
    'A-4 hole 3: row deletion is the second escape — a deleted row is still listed to the owner'],
  ['requirements_author', 'a pod selected by any Ingress policy is isolated for ALL ingress',
    'M3/A-5: the enforcer FACT — the 🗑 template note carrying it is stripped by --skeleton, so the Author only has it here'],
  ['requirements_author', 'which the enforcer cannot implement (INFEASIBLE)',
    'M3: a declared-but-impossible collateral answer is raised, never transcribed (Program Run 4)'],
  ['requirements_author', 'Generate the *Decisions needed from the owner* block FROM the finished table',
    'M6: the owner block is generated from the table, so the reviewer can compare the two as sets'],
  ['requirements_author', '`<row id> — <question> — options: <enum> — governs: <which leg clause> — tier: blocking | confirm | default | not-applicable`',
    'M6: the exact line format the harness copies to the owner'],
  ['requirements_author', '`default` for every forced row',
    'A-3: forced rows stay VISIBLE to the owner — the escape path must not be seen by the reviewer only'],
  ['requirements_author', 'Every consumer leg carries its existence branch AND its null branch',
    'M7.4 author side: R19 dropped every branch and was approved'],
  ['requirements_author', 'never answers that decision itself',
    'M8: the example "if it finds one, modify it" answered existing-grant itself; 13 revisions split on it'],
  ['requirements_reviewer', 'starting from the LEGS, never from the table',
    'M7/H-2: a count that starts from the rows cannot find a missing row'],
  ['requirements_reviewer', 'Every leg × every question key of its class has a row',
    'M7.1: the fixed-length count that makes a missing row visible'],
  ['requirements_reviewer', 'the eligible keys are exactly `target-absent` and `inputs-empty`',
    'M5 bound 1 (A-4 hole 1): the closed forced list is named in the REVIEWER\'s guidance, not taken from the draft'],
  ['requirements_reviewer', 'never read eligibility from any mark, note or label in the draft',
    'A-4 hole 1: an Author can write its own forced-eligible marker'],
  ['requirements_reviewer', 'forced whose rule cell or source is anything but `gap`',
    'M5 standing count: forced answer != gap is zero by construction'],
  ['requirements_reviewer', 'passes a citation check by having nothing to cite',
    'M7.4 (A-8a): presence is counted before citation, or a vanished branch passes vacuously'],
  ['requirements_reviewer', 'An OPEN outside the table',
    'M7.5/H-5: R13 was approved with OPEN sitting in Open questions'],
  ['requirements_reviewer', 'compared as SETS of row ids',
    'M7.6: owner block = OPEN ∪ derived ∪ forced ∪ deleted'],
  ['requirements_reviewer', 'isolates a selected pod for ALL ingress no policy allows',
    'M7.7: collateral feasibility — the reviewer holds the enforcer fact itself'],
  ['requirements_reviewer', '`[owner decision]`',
    'M6/E staged: owner decisions are tagged in the verdict\'s Blocking issues line'],
  ['requirements_reviewer', 'The Approvals table agrees with its rows, cell by cell',
    'reconciliation 2026-09-28: the Approvals cells duplicate approver.* and gate.*.position — a copy drifts, so the reviewer compares them'],
  ['requirements_author', "A leg clause that cites a row applies THAT row's answer and nothing more",
    'S-1 (adversarial read): a compliant table with legs that decide silently re-opens the pre-Phase-1 failure'],
  ['requirements_reviewer', "every leg clause that cites a row applies THAT row's answer and nothing more",
    'S-1: clause-to-row comparison — recomputation, not judgement'],
  ['requirements_author', 'if no words in any item do, the row is OPEN',
    'S-2: a declared citation must QUOTE words that select one option'],
  ['requirements_reviewer', 'its quoted words appear in item N as ONE contiguous span, character for character',
    'S-2: paraphrase judgement becomes a substring match (the D9 coin flip lived here) — matched against the objective of record since Rev 23, never the brief'],
  ['requirements_reviewer', 'an item scoped to another leg',
    'S-2: cross-leg citation (item 3 ports cited for the obs listener)'],
  ['requirements_reviewer', 'counted per GATE, never per item',
    'S-3b: one item naming five gates, cited once, covered one gate'],
  ['requirements_reviewer', "includes every gate the objective's approver mapping names",
    'S-3: a gate absent from both table and rows is otherwise never counted'],
  ['requirements_author', 'an AUTHORISATION leg: it consumes a chained value into a source, allow, admit, policy or selector field',
    'S-4: the class test is a quotable structural proxy, not a judgement'],
  ['requirements_reviewer', 'deleting ANY authorisation row is BLOCKING',
    'S-4b: a partial deletion on a granting leg is always wrong'],
  ['requirements_reviewer', 'is an authorisation leg; quote the phrase',
    'S-4: the Reviewer quotes the classifying phrase'],
  ['requirements_author', "the row's rule cell reads `gap`",
    'S-5: which cell of a forced row carries the answer'],
  ['requirements_reviewer', 'whose cited leg branch does anything but report that gap',
    'S-5: the forced answer is checked in the rule cell AND the leg branch'],
  ['requirements_author', 'a substitute population is outside item 4',
    'S-6: without an inputs-empty example the obvious reason ("nothing to derive") cites no item and 8.3 blocks a correct build'],
  ['requirements_author', 'every gate except the program plan gate',
    'S-7: no gate-position option fits the plan gate; requiring it forces OPEN or improvisation'],
  ['requirements_reviewer', 'every gate except the program plan gate',
    'S-7: reviewer side of the plan-gate exclusion'],
  ['requirements_author', 'a derived cell carrying one answers them unasked',
    'S-9: behaviour smuggled into a confirm-tier derived cell'],
  ['requirements_reviewer', 'that is a change-semantics answer wearing a target row',
    'S-9: reviewer side'],
  ['requirements_author', 'never an abbreviation',
    'S-11: token drift (k8s.collateral) escapes a literal-key check'],
  ['requirements_reviewer', 'Leg tokens are exactly `network-provisioning`, `kubernetes-gitops`, `terraform-iac`, `observability-config`',
    'S-11: closed token list'],
  ['requirements_reviewer', 'whose enforcer is a Kubernetes NetworkPolicy — whatever token the row carries',
    'S-11: 8.7 keys on the enforcer, not the literal key string'],
  ['requirements_reviewer', 'turns on an OPEN row existing in the table',
    'A-10: retry/owner routing keys on the OPEN row, never on the presentation tag'],
];

// The protocol half: read the seed as TEXT (no import — the seed module connects to a database).
// ── RPR Phase 0 batch 2a+2b (2026-10-01, requirements-pipeline-review SYNTHESIS §3 items 1-2) ──────────────────────
// Branch conditions travel VERBATIM on the contract; each leg role answers them about their own subject; "gap report"
// is reserved for the `gap` outcome (regen 4 labelled every act-regardless row `gap`).
ANCHORS.push(
  ['program_architect', 'BRANCH CONDITIONS ARE CONTRACT FIELDS, carried VERBATIM',
    'RPR 2a: the premise reached a leg Architect verbatim once (answered correctly) and was dropped/reworded three times (all misread)'],
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
  ['requirements_author', 'lists it under the package\'s **UNTESTED premises**',
    'RPR 2b: the act-regardless artifact is named apart from the gap outcome'],
);
const SEED = readFileSync(join(__dirname, 'seed-protocol-prompts.ts'), 'utf8');
const reqStart = SEED.indexOf('const PIPELINE_REQUIREMENTS_AUTHORING_PROTOCOL');
const reqEnd = SEED.indexOf('## The template to fill', reqStart);
const REQ_PROTOCOL = reqStart >= 0 && reqEnd > reqStart ? SEED.slice(reqStart, reqEnd) : '';
const PROTOCOL_ANCHORS: Array<[phrase: string, why: string]> = [
  ["The Reviewer's brief names YOUR pipeline task id",
    'Rev 23 (2026-09-29): the Reviewer checks citations against the objective of record, and needs the id to fetch it'],
  ["*Decisions needed from the owner* block, copied VERBATIM",
    'M6 surface 6: the owner answers everything in ONE edit from the harness comment, without opening the draft'],
  ["Keep the objective's decision NUMBERS exactly as it numbers them",
    'M4: (declared — item N) only works if the brief keeps the objective\'s numbering'],
  ["A NEEDS-REVISION that rests on an OPEN row is the owner's to answer, never the Author's",
    'RWF note (register GS-R5-M): a re-run makes the Author invent the decision the row asks for'],
  ["An objective line that applies to every leg (absent enforcers, for one) is a numbered item like any other",
    'S-12: the grammar has no source form for an unnumbered line — enforcer-absent could only be invented or left OPEN'],
];

let passed = 0, failed = 0;
// Negative pins (RPR 2b): the act-regardless premise sentence must not carry the gap outcome's name.
{
  const OLD = "names it in the leg's gap report";
  const sources: Array<[string, string]> = [
    ['requirements_author guidance', ROLE_GUIDANCE_LIBRARY['requirements_author'] || ''],
    ['vendored skeleton', readFileSync(join(__dirname, 'seed-data', 'requirements-skeleton.tmpl'), 'utf8')],
  ];
  for (const [where, text] of sources) {
    const ok = text.length > 0 && !text.includes(OLD);
    console.log(`${ok ? '✅' : '❌'} ${where} no longer names the act-regardless premise artifact "gap report"`);
    if (ok) passed++; else failed++;
  }
}
for (const [role, phrase, why] of ANCHORS) {
  const text = ROLE_GUIDANCE_LIBRARY[role];
  const ok = typeof text === 'string' && text.includes(phrase);
  if (ok) { console.log(`✅ ${role} carries "${phrase}"`); passed++; }
  else { console.log(`❌ ${role} is missing "${phrase}"\n   why it matters: ${why}`); failed++; }
}
if (!REQ_PROTOCOL) { console.log('❌ could not locate the requirements-authoring protocol body in the seed'); failed++; }
for (const [phrase, why] of PROTOCOL_ANCHORS) {
  if (REQ_PROTOCOL.includes(phrase)) { console.log(`✅ requirements-authoring-protocol carries "${phrase}"`); passed++; }
  else { console.log(`❌ requirements-authoring-protocol is missing "${phrase}"\n   why it matters: ${why}`); failed++; }
}

// ── Question-key parity across the three copies (reconciliation 2026-09-28) ──────────────────────────────────────
// The Design-decisions key list lives in THREE places: the vendored skeleton's table rows (what the Author fills),
// requirements_author (what it must answer) and requirements_reviewer 8.1 (what it counts). A key added to one and
// not the others is either a row nobody is told to answer or a count nobody can satisfy. Compared per CLASS (every
// leg / producing leg / gate / authorisation), so a key moved between classes also fails. Derived from the text,
// never from a hardcoded list here — a fourth copy would drift the same way.
type KeyClasses = Record<'leg' | 'producer' | 'gate' | 'auth', string[]>;
const norm = (k: string): string => k
  .replace(/^(<token>|<producer token>|<producer>|\{\{LEG_TOKEN\}\}|\{\{PRODUCER_TOKEN\}\})?\./, '.')
  .replace(/\{\{GATE\}\}/g, '<gate>');
const finish = (c: Record<string, Set<string>>): KeyClasses =>
  Object.fromEntries(['leg', 'producer', 'gate', 'auth'].map(k => [k, [...(c[k] || [])].sort()])) as KeyClasses;
const KEY_RE = /`((?:<token>|<producer>)?\.[a-z-]+|approver\.<gate>|gate\.<gate>\.position)`/g;
function classify(seg: string): string | null {
  if (/permitted principal/.test(seg)) return 'auth';
  if (/producing leg/.test(seg)) return 'producer';
  if (/gate/.test(seg) && /approver\.<gate>/.test(seg)) return 'gate';
  if (/Every leg/i.test(seg)) return 'leg';
  return null;
}
function keysFromGuidance(text: string, start: string, end: string, splitter: RegExp): KeyClasses | string {
  const s = text.indexOf(start); const e = text.indexOf(end, s + start.length);
  if (s < 0 || e < 0) return `could not locate the key list (start "${start}", end "${end}")`;
  const c: Record<string, Set<string>> = {};
  for (const seg of text.slice(s, e).split(splitter)) {
    const cls = classify(seg); if (!cls) continue;
    for (const m of seg.matchAll(KEY_RE)) (c[cls] ||= new Set()).add(norm(m[1]));
  }
  return finish(c);
}
function keysFromSkeleton(tmpl: string): KeyClasses | string {
  const s = tmpl.indexOf('## Design decisions'); const e = tmpl.indexOf('\n## ', s + 5);
  if (s < 0 || e < 0) return 'could not locate ## Design decisions in the skeleton';
  const c: Record<string, Set<string>> = {}; let block = '';
  for (const line of tmpl.slice(s, e).split('\n')) {
    if (line.startsWith('### ')) { block = line.includes('grants or removes access') ? 'auth' : line.includes('Every leg') ? 'every' : '?'; continue; }
    const m = line.match(/^\|\s*([^|\s]+)\s*\|/); if (!m || m[1] === 'id' || /^-+$/.test(m[1])) continue;
    const id = m[1];
    const cls = block === 'auth' ? 'auth' : id.startsWith('{{PRODUCER_TOKEN}}') ? 'producer'
      : /^(approver|gate)\./.test(id) ? 'gate' : id.startsWith('{{LEG_TOKEN}}') ? 'leg' : `UNCLASSIFIED(${block})`;
    (c[cls] ||= new Set()).add(norm(id));
  }
  return finish(c);
}
const TMPL = readFileSync(join(__dirname, 'seed-data', 'requirements-skeleton.tmpl'), 'utf8');
// The fourth copy: the maintainers' registry (DESIGN-DECISION-QUESTIONS.md, 2026-09-29). It carries a `class` cell
// per key, so it is compared per class like the others — a registry that lags a key added elsewhere fails here.
function keysFromRegistry(doc: string): KeyClasses | string {
  const s = doc.indexOf('<!-- REGISTRY-TABLE'); if (s < 0) return 'could not locate the REGISTRY-TABLE marker';
  const c: Record<string, Set<string>> = {}; let inTable = false;
  for (const line of doc.slice(s).split('\n').slice(1)) {
    if (line.startsWith('|')) inTable = true; else if (inTable) break; else continue;
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*(leg|producer|gate|auth)\s*\|/); if (!m) continue;
    (c[m[2]] ||= new Set()).add(norm(m[1]));
  }
  return finish(c);
}
// The registry lives under .claude/knowledge/pipelines/requirements-authoring/, which is PRIVATE (export allowlist,
// Steve 2026-09-06) — so in the public export it is absent BY DESIGN. Skip that one copy BY NAME there; in the
// private source repo (recognised exactly as export-public.py's SOURCE GUARD does: cline_docs/ + CLAUDE.md) its
// absence is still a hard failure, so a moved or deleted registry can never read as a silent skip.
const REGISTRY_PATH = join(__dirname, '..', '.claude', 'knowledge', 'pipelines', 'requirements-authoring',
  'DESIGN-DECISION-QUESTIONS.md');
const IS_PRIVATE_SOURCE = existsSync(join(__dirname, '..', 'cline_docs')) && existsSync(join(__dirname, '..', 'CLAUDE.md'));
const REGISTRY = existsSync(REGISTRY_PATH) ? readFileSync(REGISTRY_PATH, 'utf8') : null;
const copies: Array<[string, KeyClasses | string]> = [
  ['skeleton .tmpl', keysFromSkeleton(TMPL)],
  ['requirements_author', keysFromGuidance(ROLE_GUIDANCE_LIBRARY['requirements_author'] || '',
    'you answer EVERY row.', '(*Measured', /;\s+/)],
  ['requirements_reviewer 8.1', keysFromGuidance(ROLE_GUIDANCE_LIBRARY['requirements_reviewer'] || '',
    '8.1 **', 'A key with no row', /\.\s+(?=Every )/)],
];
if (REGISTRY !== null) copies.push(['registry DESIGN-DECISION-QUESTIONS.md', keysFromRegistry(REGISTRY)]);
else if (IS_PRIVATE_SOURCE) { console.log(`❌ key parity: registry missing in the private source repo — ${REGISTRY_PATH}`); failed++; }
else console.log('⏭️  SKIPPED key parity: registry DESIGN-DECISION-QUESTIONS.md — private, not in this exported copy (checked in the source repo)');
const [refName, ref] = copies[0];
for (const [name, got] of copies) {
  if (typeof got === 'string') { console.log(`❌ key parity: ${name}: ${got}`); failed++; continue; }
  const empty = Object.entries(got).filter(([, v]) => v.length === 0).map(([k]) => k);
  if (empty.length) { console.log(`❌ key parity: ${name} has NO keys for class(es) ${empty.join(', ')} — the extractor lost them`); failed++; continue; }
  if (name === refName) continue;
  if (typeof ref === 'string') continue;
  if (JSON.stringify(got) === JSON.stringify(ref)) { console.log(`✅ key parity: ${name} = ${refName} (${Object.values(got).flat().length} keys in 4 classes)`); passed++; }
  else { console.log(`❌ key parity: ${name} ≠ ${refName}\n   ${name}: ${JSON.stringify(got)}\n   ${refName}: ${JSON.stringify(ref)}`); failed++; }
}
// The owner-line format: the Author's guidance must carry the skeleton's comment line character for character.
const ownerLine = (TMPL.match(/^<row id> — .*?(?= -->|$)/m) || [])[0];
if (!ownerLine) { console.log('❌ owner-line parity: no "<row id> — …" line in the skeleton'); failed++; }
else if ((ROLE_GUIDANCE_LIBRARY['requirements_author'] || '').includes('`' + ownerLine + '`')) { console.log('✅ owner-line parity: requirements_author carries the skeleton\'s owner-line format verbatim'); passed++; }
else { console.log(`❌ owner-line parity: requirements_author does not carry the skeleton's format verbatim:\n   ${ownerLine}`); failed++; }
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
