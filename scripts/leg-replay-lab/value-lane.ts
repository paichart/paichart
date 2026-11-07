/**
 * Leg replay lab — VALUE-LEG-GIT value lane (L-VLG-a..c, 2026-11-06, model-evaluation). $0, no model call.
 *
 * Production (319b42943 + 11e0c251e, deployed inert): a network-derivation VALUE leg joins Device sources only when its FIRST
 * execution snapshots a declared block (prepare-task-for-execution.ts — the leg's OWN contract key `deviceSources["network-derivation"]`
 * or its task body; an `absent` resolution takes no snapshot). Its Harvester then stamps `deviceSourceReads`, `gitDeviceComparison` and
 * `liveEvidence` (the value lane: `git-only` summary word), the chainer carries the last two to the Derivation Architect and the
 * Derived Value Reviewer (both in LIVE_EVIDENCE_READERS / GIT_DEVICE_COMPARISON_READERS), and the Architect's own persist stamps
 * `derivationContainment` (value-leg-containment-enrichment.ts) before the Reviewer runs.
 *
 * Every stored value leg predates this, so the lab needs three things, each built from SHIPPING code over a snapshot COPY:
 *   L-VLG-a  `withFirstExecutionSnapshot` — the snapshot production's writer WOULD take at the leg's first execution for the (input-
 *            edited) leg row: the same resolver, the same lane key, the same absent ⇒ no-snapshot rule, takenAt = the leg's stamped
 *            protocolResolvedAt. Refused when the leg already carries one (production never overwrites it).
 *   L-VLG-b  `withValueHarvest` — a FROZEN harvest (committed text + committed toolCalls in the shipping persist shape) replaces the
 *            stored Harvester's output: the shipping Harvester leaf nets run over it (replay-prisma `legReads`, so the device facts read
 *            the leg row exactly as production does), every stored copy of its result.json is patched and re-read, and the Harvester
 *            entry of the Architect's and the Reviewer's frozen contexts is rebuilt by the chainer's field rules (chain.ts
 *            chainEntryFromResult), carrying the two facts their role is shown.
 *   L-VLG-c  `valueArchitectContainment` — the shipping leaf-persist `derivationContainment` net over a (live or planted) Architect text,
 *            the harvest being whatever the snapshot's Harvester result now holds (GOLDEN-VALUE-LIVE's "model the containment verdict
 *            per live sample").
 * Nothing here is a second definition of a platform rule: the only lab logic is WHERE the shipping functions are pointed.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { Snapshot } from './snapshot';
import { frozenHarvesterEntry } from './held-store';
import { runLeafNetsFor, runAuthorLeafNets, summarizeFacts } from './nets';
import { chainEntryFromResult, type ReplayedAuthorResult } from './chain';
import {
  resolveLegDeviceSources, contractDeviceSourcesValue, buildDeviceSourcesSnapshot, readDeviceSourcesSnapshot, sameDeclaration,
} from '../../lib/agents/harness/device-sources';
import { governingDeviceSources } from '../../lib/agents/harness/device-sources-read';
import { DEVICE_SOURCE_PROTOCOLS, deviceSourceContractKeyOf, deviceSourceLaneOf } from '../../lib/agents/harness/held-bytes/variant';
import { canonicalProtocolName } from '../../lib/agents/harness/program-protocol';
import { LIVE_EVIDENCE_READERS, GIT_DEVICE_COMPARISON_READERS } from '../../lib/agents/harness/context-chainer';
import { VALUE_LEG_ARCHITECT_ROLE } from '../../lib/agents/harness/value-leg-containment-enrichment';
import { parseConfidenceScore } from '../../lib/agents/harness/parse-confidence';

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const HARVESTER_ROLE = 'infra_state_harvester';
const DEVICE_FACT_KEYS = ['deviceSourceReads', 'gitDeviceComparison', 'liveEvidence'] as const;

export interface FirstExecutionSnapshotReport { state: 'taken' | 'no-leg' | 'not-device-source-protocol' | 'absent-no-snapshot' | 'already-snapshotted';
  protocol?: string | null; lane?: string | null; contractKey?: string | null; resolution?: string; source?: string; entries?: number; takenAt?: string }

/** L-VLG-a. */
export function withFirstExecutionSnapshot(snap: Snapshot): { snap: Snapshot; report: FirstExecutionSnapshotReport } {
  const leg = snap.leg as Record<string, any> | null;
  if (!leg || leg.type !== 'PIPELINE') return { snap, report: { state: 'no-leg' } };
  const meta = (leg.metadata ?? {}) as Record<string, any>;
  const protocol = typeof meta.protocol === 'string' ? canonicalProtocolName(meta.protocol) : null;
  if (!protocol || !DEVICE_SOURCE_PROTOCOLS.includes(protocol)) return { snap, report: { state: 'not-device-source-protocol', protocol } };
  if (meta.deviceSourcesSnapshot !== undefined && meta.deviceSourcesSnapshot !== null) return { snap, report: { state: 'already-snapshotted', protocol } };
  const contractKey = deviceSourceContractKeyOf(protocol);
  const lane = deviceSourceLaneOf(protocol);
  const contract = (leg.inputContext as Record<string, any> | null)?.interfaceContract;
  const resolution = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(contract, contractKey ?? undefined), taskBody: leg.description ?? null });
  if (lane === 'value' && resolution.state === 'absent') return { snap, report: { state: 'absent-no-snapshot', protocol, lane, contractKey, resolution: resolution.state } };
  if (typeof meta.protocolResolvedAt !== 'string') throw new Error(`L-VLG-a: leg ${leg.id} has no stamped protocolResolvedAt (the snapshot's takenAt)`);
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  const cl = copy.leg as Record<string, any>;
  cl.metadata = { ...(cl.metadata ?? {}), deviceSourcesSnapshot: buildDeviceSourcesSnapshot(resolution, meta.protocolResolvedAt) };
  // Re-read through the SHIPPING reader and the governing rule production applies (snapshot vs the live row).
  const back = readDeviceSourcesSnapshot(cl.metadata);
  if (!back || back === 'unreadable') throw new Error(`L-VLG-a: the simulated snapshot does not read back (${String(back)})`);
  const gov = governingDeviceSources({ description: cl.description ?? null, contract, snapshot: cl.metadata.deviceSourcesSnapshot }, contractKey ?? undefined);
  if (!('entries' in gov) && gov.state !== resolution.state) throw new Error(`L-VLG-a: governing declaration reads ${gov.state}, the snapshot holds ${resolution.state}`);
  if ('entries' in gov && !sameDeclaration(gov as never, resolution)) throw new Error('L-VLG-a: governing declaration differs from the snapshot');
  return { snap: copy, report: { state: 'taken', protocol, lane, contractKey, resolution: resolution.state,
    source: (resolution as { source?: string }).source, entries: resolution.state === 'parsed' ? resolution.entries.length : 0, takenAt: meta.protocolResolvedAt } };
}

export interface ValueHarvestSpec { /** the harvest text, relative to the experiment dir */ text: string; /** its tool calls (shipping persist shape), same */ toolCalls: string }
export interface ValueHarvestReport { harvesterExecutionId: string; textFile: string; textSha256: string; toolCallsFile: string; toolCallsSha256: string; calls: number;
  storedCopies: number; chainEntries: string[]; facts: Record<string, string>; liveEvidence: Record<string, unknown> | null; gitDeviceComparison: Record<string, unknown> | null;
  leafNetErrors: Record<string, string> }

/** L-VLG-b. The snapshot must be a value-leg node's (its `author` is the Derivation Architect, its frozen context chains ONE Harvester). */
export async function withValueHarvest(dir: string, snap: Snapshot, spec: ValueHarvestSpec): Promise<{ snap: Snapshot; report: ValueHarvestReport }> {
  const text = fs.readFileSync(path.join(dir, spec.text), 'utf8');
  const tcText = fs.readFileSync(path.join(dir, spec.toolCalls), 'utf8');
  const toolCalls = JSON.parse(tcText) as unknown[];
  if (!Array.isArray(toolCalls) || !toolCalls.length) throw new Error(`L-VLG-b: ${spec.toolCalls} holds no tool calls`);
  const h = frozenHarvesterEntry(snap);
  const hTask = (snap.children ?? []).find((c) => c.id === h.taskId);
  if (!hTask) throw new Error(`L-VLG-b: the frozen Harvester task ${h.taskId} is not among the snapshot's children`);
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  const arts = copy.childArtifacts.filter((a) => a.executionId === h.executionId && a.name === 'result.json');
  if (!arts.length) throw new Error(`L-VLG-b: no stored result.json for the frozen Harvester ${h.executionId}`);
  const stored = JSON.parse(arts[0].content) as Record<string, any>;
  const role = typeof stored.agentRole === 'string' ? stored.agentRole : HARVESTER_ROLE;
  if (role !== HARVESTER_ROLE) throw new Error(`L-VLG-b: the frozen Harvester ran as ${role}`);
  // The Harvester's OWN composed protocol (the value leg's Harvester composes the network-provisioning text, LL-N-07) — the version the
  // liveEvidence population rule reads, exactly as execution-nets hands it.
  const protocolInjection = stored.protocolInjection ?? undefined;
  const leaf = await runLeafNetsFor(copy, hTask as never, role, text, h.executionId, toolCalls, protocolInjection, { legReads: true });
  const bad = DEVICE_FACT_KEYS.filter((k) => leaf.errors[k]);
  if (bad.length) throw new Error(`L-VLG-b: the shipping Harvester nets errored on ${bad.map((k) => `${k} (${leaf.errors[k]})`).join(', ')} — never stubbed`);
  const facts: Record<string, unknown> = {};
  for (const k of [...DEVICE_FACT_KEYS, 'markerPresence', 'quoteFidelity'] as const) if (leaf.stamped[k] !== undefined) facts[k] = leaf.stamped[k];
  // Every stored copy of the Harvester's result.json: the frozen harvest, its calls and its stamps (old device facts and held bytes dropped).
  for (const a of arts) {
    const r = JSON.parse(a.content) as Record<string, unknown>;
    for (const k of [...DEVICE_FACT_KEYS, 'heldBytes', 'markerPresence', 'quoteFidelity']) delete r[k];
    a.content = JSON.stringify({ ...r, finalResponse: text, toolCalls, ...facts });
    const back = JSON.parse(a.content) as Record<string, unknown>;
    if (back.finalResponse !== text || JSON.stringify(back.toolCalls) !== JSON.stringify(toolCalls)) throw new Error('L-VLG-b: stored result.json re-read mismatch');
  }
  const replayed: ReplayedAuthorResult = {
    executionId: h.executionId, finalResponse: text, confidenceScore: parseConfidenceScore(text),
    qualityMetrics: stored.qualityMetrics ? { ...stored.qualityMetrics, responseLength: text.length } : null,
    markerPresence: (facts.markerPresence as Record<string, unknown>) ?? null, rollbackContainment: null, derivationContainment: null,
    gitDeviceComparison: (facts.gitDeviceComparison as Record<string, unknown>) ?? null, liveEvidence: (facts.liveEvidence as Record<string, unknown>) ?? null,
  };
  // The chainer carries the two facts only to their readers: assert every consumer patched here IS one (else the patch would show a role a fact production never shows it).
  const chainEntries: string[] = [];
  for (const [label, block] of [['architect', copy.author], ['reviewer', copy.reviewer]] as const) {
    if (!block) continue;
    const consumer = (block.task as Record<string, any>).agentRole ?? null;
    if (!LIVE_EVIDENCE_READERS.has(consumer) || !GIT_DEVICE_COMPARISON_READERS.has(consumer)) throw new Error(`L-VLG-b: ${label} ${consumer} does not read both device facts — not a value-leg consumer`);
    for (const [where, holder] of [['exec.config.inputContext', block.exec.config?.inputContext], ['task.inputContext', (block.task as Record<string, any>).inputContext]] as const) {
      const ic = typeof holder === 'string' ? JSON.parse(holder) : holder;
      if (!ic || !Array.isArray(ic.chainedFrom)) continue;
      const idx = ic.chainedFrom.findIndex((e: any) => e?.agentRole === HARVESTER_ROLE && e?.executionId === h.executionId);
      if (idx < 0) continue;
      ic.chainedFrom[idx] = chainEntryFromResult(ic.chainedFrom[idx], replayed);
      if (where === 'exec.config.inputContext') block.exec.config!.inputContext = ic; else (block.task as Record<string, any>).inputContext = ic;
      chainEntries.push(`${label}:${where}`);
    }
  }
  if (!chainEntries.includes('architect:exec.config.inputContext')) throw new Error('L-VLG-b: the Architect\'s frozen context carries no entry for the frozen Harvester');
  return { snap: copy, report: { harvesterExecutionId: h.executionId, textFile: spec.text, textSha256: sha(text), toolCallsFile: spec.toolCalls, toolCallsSha256: sha(tcText),
    calls: toolCalls.length, storedCopies: arts.length, chainEntries, facts: summarizeFacts(leaf.stamped as never),
    liveEvidence: (facts.liveEvidence as Record<string, unknown>) ?? null, gitDeviceComparison: (facts.gitDeviceComparison as Record<string, unknown>) ?? null, leafNetErrors: leaf.errors } };
}

/** L-VLG-c. The shipping value-leg containment fact for `text` as the Architect's output on this snapshot. */
export async function valueArchitectContainment(snap: Snapshot, text: string, executionId: string): Promise<{ fact: Record<string, any> | null; error: string | null }> {
  const role = (snap.author.task as Record<string, any>).agentRole;
  if (role !== VALUE_LEG_ARCHITECT_ROLE) throw new Error(`L-VLG-c: the node's author task is ${role}, not ${VALUE_LEG_ARCHITECT_ROLE}`);
  const leaf = await runAuthorLeafNets(snap, VALUE_LEG_ARCHITECT_ROLE, text, executionId, undefined, undefined, undefined, { legReads: true });
  return { fact: (leaf.stamped.derivationContainment as Record<string, any>) ?? null, error: leaf.errors.derivationContainment ?? null };
}

/** A one-line reading of a containment fact (disposition, reason, violations, derived values). */
export function containmentLine(f: Record<string, any> | null): string {
  if (!f) return 'none';
  const d = f.containmentDisposition ?? {};
  const dv = Array.isArray(f.derivedValues) ? f.derivedValues.map((x: any) => x?.value ?? x?.cidr ?? '?').join(',') : '-';
  return `${d.disposition ?? '?'} (${d.reason ?? f.reason ?? '?'}) checked ${f.checked} violations ${Array.isArray(f.violations) ? f.violations.length : '-'} derived [${dv}]`;
}
