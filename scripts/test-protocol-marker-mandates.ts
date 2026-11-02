#!/usr/bin/env ts-node
/**
 * HS-FU5 (2026-10-31) — the §6 marker line renders only where the active protocol mandates markers.
 *
 *  M1  the runtime map `PROTOCOL_MARKER_MANDATES` (lib) EQUALS every NON-DEPRECATED seed `emitsMarkers` declaration,
 *      both directions — the seed is the declared source (beside the prose); the map is its pinned projection. A
 *      DEPRECATED row is never projected (its declaration describes a tombstone; unknown ⇒ render).
 *  M2  `namedProtocolOfTemplate` applies the engine's NAMED-mode parse (composed / none / malformed ⇒ null).
 *  M3  `protocolMandatesNoMarkers` is true ONLY for a known `'none'` protocol (unknown/absent ⇒ false).
 *  R1  renderPipelineContextSection: a 'none' protocol drops ONLY the marker line; every other line is identical.
 *  R2  a marker-mandating protocol, an unknown protocol, null, and no options all render BYTE-IDENTICALLY.
 *  W1  buildAgentPromptBody wires the template's binding (engine + stream share it): requirements-authoring drops
 *      the line; terraform keeps it; a composed template keeps it.
 *
 * Mutation-checked: deleting the `!markersNotMandated` guard turns R1/W1 red; forcing the predicate true turns
 * R2/W1 red; adding a key to the lib map turns M1 red.
 *
 * Run: npm run test:protocol-marker-mandates
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import {
  PROTOCOL_MARKER_MANDATES, namedProtocolOfTemplate, protocolMandatesNoMarkers,
} from '../lib/agents/harness/protocol-marker-mandates';
import { renderPipelineContextSection } from '../lib/agents/harness/render-pipeline-context';
import { buildAgentPromptBody } from '../lib/agents/harness/build-agent-prompt-body';

const { PROTOCOLS } = require('./seed-protocol-prompts') as {
  PROTOCOLS: Array<{ name: string; emitsMarkers: 'none' | readonly string[]; status?: string }>;
};

let passed = 0, failed = 0;
const ok = (c: boolean, m: string, d?: string) => {
  if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`); }
};
const norm = (v: unknown) => JSON.stringify(v);

console.log('\n🧾 HS-FU5 — protocol marker mandates\n');

// ── M1 ─────────────────────────────────────────────────────────────────────────────────────────
{
  const seed = new Map(PROTOCOLS.filter(p => p.status !== 'DEPRECATED').map(p => [p.name, p.emitsMarkers]));
  const deprecated = PROTOCOLS.filter(p => p.status === 'DEPRECATED').map(p => p.name);
  ok(deprecated.length >= 1 && deprecated.every(n => !(n in PROTOCOL_MARKER_MANDATES) && !protocolMandatesNoMarkers(n)),
    `M1e DEPRECATED rows are not projected and read as unknown (${deprecated.join(', ')})`);
  ok(seed.size >= 10, `M1a parsed ${seed.size} seed protocols (a parse of 0 would read as clean)`);
  const missing = [...seed.keys()].filter(n => !(n in PROTOCOL_MARKER_MANDATES));
  const extra = Object.keys(PROTOCOL_MARKER_MANDATES).filter(n => !seed.has(n));
  const differ = [...seed.entries()].filter(([n, v]) => n in PROTOCOL_MARKER_MANDATES && norm(v) !== norm(PROTOCOL_MARKER_MANDATES[n]));
  ok(missing.length === 0, 'M1b every seed protocol has a runtime mandate', missing.join(', '));
  ok(extra.length === 0, 'M1c no runtime mandate without a seed protocol', extra.join(', '));
  ok(differ.length === 0, 'M1d every runtime mandate equals its seed declaration', differ.map(([n]) => n).join(', '));
}

// ── M2 ─────────────────────────────────────────────────────────────────────────────────────────
ok(namedProtocolOfTemplate({ metadata: { protocol: 'requirements-authoring-protocol' } }) === 'requirements-authoring-protocol', 'M2a named binding read');
ok(namedProtocolOfTemplate({ metadata: { protocol: 'x', loadProtocols: 'composed' } }) === null, 'M2b composed ⇒ null');
ok(namedProtocolOfTemplate({ metadata: {} }) === null && namedProtocolOfTemplate({}) === null
  && namedProtocolOfTemplate(null) === null && namedProtocolOfTemplate(undefined) === null, 'M2c none/absent ⇒ null');
ok(namedProtocolOfTemplate({ metadata: { protocol: 7 } }) === null && namedProtocolOfTemplate({ metadata: { protocol: '' } }) === null, 'M2d malformed ⇒ null');

// ── M3 ─────────────────────────────────────────────────────────────────────────────────────────
ok(protocolMandatesNoMarkers('requirements-authoring-protocol') && protocolMandatesNoMarkers('artifact-synthesis-protocol'), 'M3a known none ⇒ true');
ok(!['network-provisioning-protocol', 'kubernetes-gitops-protocol', 'terraform-iac-protocol', 'observability-config-protocol', 'network-derivation-protocol']
  .some(protocolMandatesNoMarkers), 'M3b every marker-mandating infra protocol ⇒ false');
ok(!protocolMandatesNoMarkers('no-such-protocol') && !protocolMandatesNoMarkers(null) && !protocolMandatesNoMarkers(undefined)
  && !protocolMandatesNoMarkers('toString') && !protocolMandatesNoMarkers('__proto__'), 'M3c unknown / absent / prototype keys ⇒ false (fail toward rendering)');

// ── R1/R2 ──────────────────────────────────────────────────────────────────────────────────────
const MP = { harvestedAllocations: false, derivedValues: false, consumedValues: false, parser: 'parseFencedJsonBlock' };
const IC = {
  chainedFrom: [
    { taskTitle: 'Harvest', agentRole: 'infra_state_harvester', confidenceScore: 90, finalResponse: 'h', markerPresence: MP },
    { taskTitle: 'Other', agentRole: 'x', confidenceScore: 80, finalResponse: 'o' },
  ],
  pipelineMetadata: { completedDependencies: 2, totalDependencies: 2 },
};
const LINE = '- **Machine-parsed blocks (platform fact)**: Harvested Allocations ✗ · Derived Values ✗ · Consumed Values ✗';
{
  const base = renderPipelineContextSection(IC);
  const none = renderPipelineContextSection(IC, { boundProtocol: 'requirements-authoring-protocol' });
  ok(base.includes(LINE) && !none.includes(LINE), 'R1a a none protocol drops the marker line');
  ok(norm(base.filter(l => l !== LINE)) === norm(none), 'R1b … and ONLY that line (every other line identical, in order)');
  const variants: Array<[string, string | null | undefined]> = [
    ['network-provisioning-protocol', 'network-provisioning-protocol'], ['kubernetes-gitops-protocol', 'kubernetes-gitops-protocol'],
    ['terraform-iac-protocol', 'terraform-iac-protocol'], ['observability-config-protocol', 'observability-config-protocol'],
    ['network-derivation-protocol', 'network-derivation-protocol'], ['unknown', 'no-such-protocol'], ['null', null], ['undefined', undefined],
  ];
  for (const [label, bp] of variants) {
    ok(renderPipelineContextSection(IC, { boundProtocol: bp }).join('\n') === base.join('\n'), `R2 byte-identical to no-options — ${label}`);
  }
}

// ── W1 (the real caller) ───────────────────────────────────────────────────────────────────────
{
  const task = { title: 'T', description: 'd', inputContext: IC, type: 'ACTION', status: 'TODO', priority: 'MEDIUM' };
  const body = (metadata: unknown) => buildAgentPromptBody(task, {}, { agentTemplate: { metadata } });
  ok(!body({ protocol: 'requirements-authoring-protocol' }).includes(LINE), 'W1a requirements-authoring template ⇒ no marker line');
  ok(body({ protocol: 'terraform-iac-protocol' }).includes(LINE), 'W1b terraform template ⇒ marker line');
  ok(body({ protocol: 'requirements-authoring-protocol', loadProtocols: 'composed' }).includes(LINE), 'W1c composed template ⇒ marker line (not named ⇒ unknown)');
  ok(buildAgentPromptBody(task, {}, {}).includes(LINE), 'W1d no template ⇒ marker line');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
