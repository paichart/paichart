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
if (failed) { console.error(`\n${failed} failed`); process.exit(1); } console.log('\n✅ marker presence: fact → whitelist → chainer → §6 → card');
