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
check('empty / null response → all ✗, never throws', !computeMarkerPresence(null).derivedValues && !computeMarkerPresence('').consumedValues);
check('parser field names the shared parser', mp.parser === 'parseFencedJsonBlock');
check('leaf roles: harvester/architect/author match, reviewer does not', HARNESS_LEAF_ROLE_RE.test('infra_state_harvester') && HARNESS_LEAF_ROLE_RE.test('config_change_author') && HARNESS_LEAF_ROLE_RE.test('infra_change_architect') && !HARNESS_LEAF_ROLE_RE.test('change_reviewer'));
check('markerPresence is a deliberate RESULT_JSON_SUMMARY_KEYS entry (survives the hoist)', (RESULT_JSON_SUMMARY_KEYS as readonly string[]).includes('markerPresence') && 'markerPresence' in pickResultJsonSummary({ markerPresence: mp }));
const six = renderPipelineContextSection({ chainedFrom: [{ taskId: 'a1', taskTitle: 'Author change package', agentRole: 'config_change_author', confidenceScore: 88, markerPresence: mp, finalResponse: 'x' }], pipelineMetadata: { completedDependencies: 1, totalDependencies: 1 } }).join('\n');
check('§6 renders the platform-fact line for a predecessor (the Reviewer reads it THERE)', /Machine-parsed blocks \(platform fact\)\*\*: Harvested Allocations ✗ · Derived Values ✓ · Consumed Values ✓/.test(six));
check('§6 omits the line when the predecessor stamped no markerPresence (older executions)', !/Machine-parsed blocks/.test(renderPipelineContextSection({ chainedFrom: [{ taskId: 'a1', taskTitle: 't', agentRole: 'r', confidenceScore: 1, finalResponse: 'x' }], pipelineMetadata: { completedDependencies: 1, totalDependencies: 1 } }).join('\n')));
check('renderMarkerPresence null-safe', renderMarkerPresence(null) === null);
const core = fs.readFileSync('lib/services/execution-core.ts', 'utf8'); const chainer = fs.readFileSync('lib/agents/harness/context-chainer.ts', 'utf8'); const tmpl = fs.readFileSync('lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts', 'utf8');
check('execution-core stamps markerPresence on non-PIPELINE harness leaves', /HARNESS_LEAF_ROLE_RE\.test\(agentRole/.test(core) && /markerPresence = computeMarkerPresence\(finalResponse\)/.test(core));
check('chainer carries markerPresence per predecessor (like confidenceScore)', /markerPresence: \(parsed as/.test(chainer));
check('reviewer guidance points at the §6 line, not at parser beliefs', /The platform's reading is IN your §6/.test(tmpl));


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

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\n✅ marker presence + net-#3 JOIN: fact → whitelist → chainer → §6 → card');
