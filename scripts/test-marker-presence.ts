/** H-4 (2026-09-10): marker presence is a FACT computed by the containment parser, stamped on harness leaves,
 *  hoisted by the summary whitelist, carried per predecessor by the chainer, and rendered in §6 + on the card. */
import * as fs from 'fs';
import { computeMarkerPresence, renderMarkerPresence, HARNESS_LEAF_ROLE_RE } from '../lib/agents/harness/marker-presence';
import { RESULT_JSON_SUMMARY_KEYS, pickResultJsonSummary } from '../lib/services/execution-artifacts';
import { renderPipelineContextSection } from '../lib/agents/harness/render-pipeline-context';
let failed = 0; const check = (n: string, ok: boolean) => { console.log(`${ok ? '✅' : '❌'} ${n}`); if (!ok) failed++; };
const body = '```json\n[{"kind":"cidr","value":"10.99.0.6/31"}]\n```\n';
const mp = computeMarkerPresence(`## Pre-existing Allocations\ntext\n### 6. Derived Values\n${body}\n## Consumed Values\n${body}`);
check('nested + ordinal Derived Values and standalone Consumed Values → both ✓, harvested ✗', mp.derivedValues && mp.consumedValues && !mp.harvestedAllocations);
check('retitled block → ✗ (same parser as the containment enrichment)', !computeMarkerPresence(`## Pre-existing Allocations\n${body}`).derivedValues);
// X28 (2026-09-28, Run 4 FABRIC Author cmukr4blz00f7yxils8659wsw): the STAMP the Reviewer blocked on. A validation
// line BEGINNING with the marker words inside an expected-output fence must not flip a correctly placed block to ✗.
check('X28: a trailing `Derived Values members set = {…}` validation line does not flip Derived Values to ✗',
  computeMarkerPresence(`## Derived Values\n${body}\n## Validation\n\`\`\`\nDerived Values members set = {10.99.0.6/32, 10.99.0.7/32}\n\`\`\`\n`).derivedValues);
// MARKER-LETTERED-HEADING (2026-10-08, Opus lab L7 N-R sample-02): the STAMP moves with the parser — a lettered
// `## (e2) Derived Values` reads ✓; a bare `P1 ` prefix (a reviewer quoting another leg) stays ✗.
check('lettered `## (e2) Derived Values` → ✓; bare `### P1 Derived Values` → ✗',
  computeMarkerPresence(`## (e2) Derived Values\n${body}`).derivedValues && !computeMarkerPresence(`### P1 Derived Values (Ground Truth)\n${body}`).derivedValues);
check('empty / null response → all ✗, never throws', !computeMarkerPresence(null).derivedValues && !computeMarkerPresence('').consumedValues);
check('parser field names the shared parser', mp.parser === 'parseFencedJsonBlock');
check('leaf roles: harvester/architect/author match, reviewer does not', HARNESS_LEAF_ROLE_RE.test('infra_state_harvester') && HARNESS_LEAF_ROLE_RE.test('config_change_author') && HARNESS_LEAF_ROLE_RE.test('infra_change_architect') && !HARNESS_LEAF_ROLE_RE.test('change_reviewer'));
check('markerPresence is a deliberate RESULT_JSON_SUMMARY_KEYS entry (survives the hoist)', (RESULT_JSON_SUMMARY_KEYS as readonly string[]).includes('markerPresence') && 'markerPresence' in pickResultJsonSummary({ markerPresence: mp }));
const six = renderPipelineContextSection({ chainedFrom: [{ taskId: 'a1', taskTitle: 'Author change package', agentRole: 'config_change_author', confidenceScore: 88, markerPresence: mp, finalResponse: 'x' }], pipelineMetadata: { completedDependencies: 1, totalDependencies: 1 } }).join('\n');
check('§6 renders the platform-fact line for a predecessor (the Reviewer reads it THERE)', /Machine-parsed blocks \(platform fact\)\*\*: Harvested Allocations ✗ · Derived Values ✓ · Consumed Values ✓/.test(six));
check('§6 omits the line when the predecessor stamped no markerPresence (older executions)', !/Machine-parsed blocks/.test(renderPipelineContextSection({ chainedFrom: [{ taskId: 'a1', taskTitle: 't', agentRole: 'r', confidenceScore: 1, finalResponse: 'x' }], pipelineMetadata: { completedDependencies: 1, totalDependencies: 1 } }).join('\n')));
check('renderMarkerPresence null-safe', renderMarkerPresence(null) === null);
const core = fs.readFileSync('lib/services/execution-core.ts', 'utf8'); const chainer = fs.readFileSync('lib/agents/harness/context-chainer.ts', 'utf8'); const tmpl = fs.readFileSync('lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts', 'utf8');
/* RETARGETED 2026-09-12 (stage 2b). This asserted the stamp lived INLINE in execution-core, and the
 * registry migration moved it to a `MECHANICAL_NETS` entry — so the guard failed, which is the guard
 * WORKING: it pins a PROPERTY, and the property moved house (the same thing that happened to the F12
 * lookup's two pins when `findProgramParentForStage` was extracted on 2026-09-11). It is retargeted
 * to the new home AND given the second assertion that lesson demands — that execution-core CONSUMES
 * the registry rather than re-inlining a stamp beside it, which is how a migration half-lands. */
const nets = fs.readFileSync('lib/agents/harness/mechanical-nets.ts', 'utf8');
check('the markerPresence net gates on non-PIPELINE harness leaves and calls the shared predicate',
  /name: 'markerPresence'/.test(nets)
  && /HARNESS_LEAF_ROLE_RE\.test\(ctx\.agentRole/.test(nets)
  && /computeMarkerPresence\(ctx\.finalResponse\)/.test(nets));
// COMPLETE-THEN-FAIL build review EF-F2 (2026-10-05): both registry points moved into ONE shared helper
// (lib/services/execution-nets.ts) that the core AND the completion-anchored rescue call.
const netsHelper = fs.readFileSync('lib/services/execution-nets.ts', 'utf8');
check('execution-core stamps THROUGH the registry (via the shared stampExecutionNets helper) and re-inlines no net of its own',
  /runNetsAtPoint\('leaf-persist'/.test(netsHelper)
  && /runNetsAtPoint\('leg-synthesize'/.test(netsHelper)
  && /await stampExecutionNets\(prisma,/.test(core)
  && !/computeMarkerPresence\(/.test(core));
check('chainer carries markerPresence per predecessor (like confidenceScore)', /markerPresence: \(parsed as/.test(chainer));
// Promotion E5 (2026-10-06, option (b)): the §6 line is scoped to LEG review — Node C's chained deliverables carry no
// markerPresence (pipeline-index.json has none), so at program integration the guidance points at the containment disposition.
check('reviewer guidance points at the §6 line, not at parser beliefs', /At leg review, the platform's reading is IN your §6/.test(tmpl));
check('…and scopes it to leg review: at program integration the fact is the containment disposition, never an absent ✗',
  /At program integration there is no such line\*\*: a leg's chained deliverable carries no machine-parsed reading, so never infer a ✗ from its absence/.test(tmpl)
  && /\\`containmentDisposition\\` on its/.test(tmpl));


/* ── THE JOIN (2026-09-11, required by the coordinator; net #3's write site ↔ read site) ──────
 *
 * WHY A JOIN AND NOT TWO ASSERTIONS. The chainer writing a field and the renderer reading one are
 * each individually testable, and both halves can be green while the PAIRING is broken — the
 * 2026-08-03 A1 defect verbatim. H3's §6 pins build their inputContext by hand with the field
 * already named, so a chainer that carried it under any other name, or that transcribed `missing`
 * as a count, would leave every test green and §6 silently empty forever.
 *
 * So this assertion takes the field name FROM THE CHAINER'S OWN SOURCE and the fact from the REAL
 * predicate over a REAL fixture, then pushes both through the shipping renderer. Rename the field
 * at the push site and the entry is built under the new name while the renderer still reads the old
 * one — empty render, failed test. Reduce the transcription to a count and the named line vanishes
 * from the render — failed test.
 */
{
  const chainerSrcJ = fs.readFileSync('lib/agents/harness/context-chainer.ts', 'utf8');
  // The key the chainer actually writes at its push site (not a literal repeated here).
  const keyMatch = /(\w+): rollbackFact,/.exec(chainerSrcJ);
  const carriedKey = keyMatch ? keyMatch[1] : '<chainer push site not found>';

  // VERBATIM CARRY, asserted from source: the chainer must hand on the parsed object, never a
  // hand-picked subset. A key-picking transcription is how `missing[]` would quietly become a
  // count — the F7 defect (a number denies the reader the subject) reintroduced at the chaining
  // boundary, and it would look green on every existing test.
  // ANCHORED on the assignment itself. A loose substring match survives a subset-picking rewrite
  // that still mentions the parsed access somewhere (proved by mutation: a `{ checked, missingCount }`
  // transcription kept the original expression in a temp and passed a substring test).
  check('JOIN-0: the chainer carries the WHOLE stamped fact, not a picked subset',
    /const stampedRollback =\s*\(parsed as \{ rollbackContainment\?: Record<string, unknown> \}\)\.rollbackContainment \?\? null;/
      .test(chainerSrcJ));

  // A REAL fact from the REAL predicate over live fixture text, mutated so it has an unmatched line.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { scopeRestoreLines, checkRollbackContainment, computeRollbackDisposition } =
    require('../lib/agents/harness/rollback-containment');
  const FIX = 'scripts/fixtures/rollback-containment';
  const doc = fs.readFileSync(`${FIX}/r3b2-author.md`, 'utf8');
  const s0 = doc.indexOf('## 6. Rollback Plan'), e0 = doc.indexOf('## 7. Recommended');
  const mutated = doc.slice(0, s0) +
    doc.slice(s0, e0).replace('endpoint: 0.0.0.0:8889', 'endpoint: 0.0.0.0:9999') + doc.slice(e0);
  const sc = scopeRestoreLines(mutated);
  const ck = checkRollbackContainment(sc.lines, fs.readFileSync(`${FIX}/r3b2-harvest.md`, 'utf8'));
  const fact: Record<string, unknown> = { checked: true, ...ck, excluded: sc.excluded };
  fact.rollbackDisposition = computeRollbackDisposition(fact);

  check('JOIN-1: the real predicate produced exactly one NAMED unmatched line with a package line number',
    ck.missing.length === 1 && ck.missing[0].line === 'endpoint: 0.0.0.0:9999' &&
    typeof ck.missing[0].blockLine === 'number');

  // Build the predecessor entry under the name THE CHAINER WRITES, then render it.
  const entry: Record<string, unknown> = {
    taskId: 'a1', taskTitle: 'Author config + validation + rollback',
    agentRole: 'config_change_author', confidenceScore: 90, finalResponse: 'x',
  };
  entry[carriedKey] = fact;
  const rendered = renderPipelineContextSection({
    chainedFrom: [entry], pipelineMetadata: { completedDependencies: 1, totalDependencies: 1 },
  }).join('\n');

  // DIFFERENTIAL, not a substring sniff. The same entry with and without the chainer's key must
  // render differently — that is the only form that actually asserts "the name written is the name
  // read". (Proved by mutation: a bare /rollback/i test passed while the field was renamed at the
  // push site, because unrelated prose in §6 mentions the word.)
  const withoutField = renderPipelineContextSection({
    chainedFrom: [{ taskId: 'a1', taskTitle: 'Author config + validation + rollback',
      agentRole: 'config_change_author', confidenceScore: 90, finalResponse: 'x' }],
    pipelineMetadata: { completedDependencies: 1, totalDependencies: 1 },
  }).join('\n');
  check('JOIN-2: the chainer\'s field name reaches the §6 renderer (rename either side and this fails)',
    rendered !== withoutField && rendered.length > withoutField.length);
  check('JOIN-3: §6 names the unmatched LINE, not just a count (the F7 lesson, across the seam)',
    rendered.includes('endpoint: 0.0.0.0:9999'));
  check('JOIN-4: §6 carries the package line number for that unmatched line',
    rendered.includes(String(ck.missing[0].blockLine)));
  check('JOIN-5: the counts survive transcription into the render',
    rendered.includes(String(ck.restoreLinesFound)) && rendered.includes(String(ck.restoreLinesTotal)));
}


/* ── Promotion E5 review fold (EF-M1 + PC-F2, 2026-10-06): PROPERTY pins behind the E5 sentences ─────────────────
 * The two wording pins above guard the sentences against deletion. These guard the FACTS they assert, which a code
 * change could falsify while the wording stays green (two of them are negative claims, which age worst):
 *   (a) "At program integration there is no such line" holds only because the markerPresence net never stamps a
 *       PIPELINE task. A hoist of the net to the leg would silently put a ✓/✗ line in Node C's §6.
 *   (b) A leg PIPELINE predecessor (what Node C chains) renders the containment line and NO machine-parsed line.
 *   (c) TWO-WAY, same pattern as test-value-leg-containment's EF-F1 rows: every prompt text that quotes a platform-fact
 *       label names it under the exact string the SHIPPING renderer / card emits. Rename either side and this goes red. */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
{
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MECHANICAL_NETS } = require('../lib/agents/harness/mechanical-nets') as { MECHANICAL_NETS: ReadonlyArray<{ name: string; appliesTo: (ctx: unknown) => boolean }> };
  const mpNet = MECHANICAL_NETS.find((n) => n.name === 'markerPresence');
  const ctxFor = (type: string, agentRole: string) => ({ task: { id: 't', type }, agentRole, finalResponse: 'x', harnessMode: null });
  check('E5 (a): markerPresence never applies to a PIPELINE task (Node C\'s predecessors), so Node C\'s §6 has no Machine-parsed line',
    !!mpNet && mpNet.appliesTo(ctxFor('PIPELINE', 'config_change_author')) === false
    && mpNet.appliesTo(ctxFor('PIPELINE', 'pipeline_harness_orchestrator')) === false
    && mpNet.appliesTo(ctxFor('ACTION', 'config_change_author')) === true);   // control: the leaf still stamps

  const legDisposition = { containmentDisposition: { disposition: 'benign', reason: 'checked-clean' } };
  const nodeC6 = renderPipelineContextSection({ chainedFrom: [{ taskId: 'leg1', taskTitle: 'Provision x (protocol: leg)',
    agentRole: 'pipeline_harness_orchestrator', source: 'report.md', confidenceScore: 90, finalResponse: 'leg report',
    derivationContainment: legDisposition }], pipelineMetadata: { completedDependencies: 1, totalDependencies: 1 } }).join('\n');
  check('E5 (b): a leg PIPELINE predecessor renders the Derivation containment line and NO Machine-parsed line',
    nodeC6.includes('**Derivation containment (platform fact)**: benign — checked-clean') && !/Machine-parsed blocks/.test(nodeC6));

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts.js') as { leanFactsLine: (e: unknown) => unknown };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const roles = require('../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate').ROLE_GUIDANCE_LIBRARY as Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PROTOCOLS } = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string }> };
  const pov = PROTOCOLS.find((p) => p.name === 'pov-program-protocol')?.promptText ?? '';
  const card = String(leanFactsLine({ derivationContainment: legDisposition }));
  const texts: Record<string, string> = { change_reviewer: roles.change_reviewer ?? '', derivation_reviewer: roles.derivation_reviewer ?? '', 'pov-program-protocol': pov };
  const rows: Array<[string, string, string, string]> = [
    // [text, the label it quotes, what the SHIPPING code emitted, the exact emitted substring]
    ['change_reviewer', '`Derivation containment (platform fact)`', nodeC6, '**Derivation containment (platform fact)**'],
    // derivation_reviewer quotes the label WITH its value shape, so its row also pins the ' — ' separator the renderer emits.
    ['derivation_reviewer', '`Derivation containment (platform fact): <disposition> — <reason>`', nodeC6, '**Derivation containment (platform fact)**: benign — checked-clean'],
    ['pov-program-protocol', '`Derivation containment (platform fact)`', nodeC6, '**Derivation containment (platform fact)**'],
    ['change_reviewer', '`containmentDisposition`', card, 'containmentDisposition: benign (checked-clean)'],
    ['pov-program-protocol', '`containmentDisposition`', card, 'containmentDisposition: benign (checked-clean)'],
    ['change_reviewer', '`Machine-parsed blocks (platform fact)`', six, '**Machine-parsed blocks (platform fact)**'],
    ['derivation_reviewer', '`Machine-parsed blocks (platform fact)`', six, '**Machine-parsed blocks (platform fact)**'],
  ];
  const bad: string[] = [];
  for (const [who, inText, emitted, emittedName] of rows) {
    if (!texts[who].includes(inText)) bad.push(`TEXT ${who} no longer names ${inText}`);
    if (!emitted.includes(emittedName)) bad.push(`CODE no longer emits "${emittedName}"`);
  }
  check(`E5 (c): TWO-WAY label↔renderer, ${rows.length} rows over 3 prompt texts${bad.length ? ` — ${bad.join('; ')}` : ''}`, bad.length === 0);
}
if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\n✅ marker presence + net-#3 JOIN: fact → whitelist → chainer → §6 → card');
