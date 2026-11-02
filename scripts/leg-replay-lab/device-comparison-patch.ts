/**
 * Leg replay lab — L-N2-c (held-network J3, 2026-10-26): the network Harvester's `gitDeviceComparison` for a stored Harvester that
 * PREDATES the net (batch 2b, deployed 2026-10-26 02:20:23Z).
 *
 * Production stamps the comparison at the Harvester's persist; the network Author TRANSCRIBES it (device-source-facts-enrichment.ts)
 * and the chainer carries it to the Architect and the leg Reviewer only. Every window leg in the lab cache ran before the net, so the
 * Author's transcription reads `harvester-not-stamped` and neither reader sees the block — a lab arm would measure a §6 production
 * no longer sends. This module computes the stamp with the SHIPPING pure function (`computeGitDeviceComparison`, over the stored
 * Harvester's `toolCalls` and the leg's declaration through the shipping grammar) and returns a snapshot COPY whose Harvester
 * result.json carries it — every stored copy of that artifact, re-read (LK11). An artifact that already carries the key is left alone.
 * The cached snapshot is never written.
 */
import { resolveLegDeviceSources, contractDeviceSourcesValue } from '../../lib/agents/harness/device-sources';
import { computeGitDeviceComparison } from '../../lib/agents/harness/device-source-facts';
import { deviceLegOf, frozenHarvesterEntry } from './held-store';
import type { Snapshot } from './snapshot';

export interface ComparisonPatchReport {
  state: 'not-device-source-leg' | 'already-stamped' | 'computed';
  harvesterExecutionId?: string;
  checked?: boolean;
  reason?: string | null;
  comparedDevices?: number;
  differences?: number;
}

export function withComputedHarvesterComparison(snap: Snapshot): { snap: Snapshot; report: ComparisonPatchReport; fact: Record<string, unknown> | null } {
  const leg = deviceLegOf(snap.leg as never);
  if (!leg) return { snap, report: { state: 'not-device-source-leg' }, fact: null };
  const h = frozenHarvesterEntry(snap);
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  const arts = copy.childArtifacts.filter((a) => a.executionId === h.executionId && a.name === 'result.json');
  if (!arts.length) throw new Error(`L-N2-c: the snapshot carries no result.json for the frozen Harvester ${h.executionId}`);
  const first = JSON.parse(arts[0].content) as Record<string, unknown>;
  if (first.gitDeviceComparison && typeof first.gitDeviceComparison === 'object') {
    return { snap, report: { state: 'already-stamped', harvesterExecutionId: h.executionId }, fact: first.gitDeviceComparison as Record<string, unknown> };
  }
  const sources = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(leg.contract), taskBody: leg.description });
  const fact = computeGitDeviceComparison(sources as never, first.toolCalls ?? []);
  for (const a of arts) {
    const parsed = JSON.parse(a.content) as Record<string, unknown>;
    a.content = JSON.stringify({ ...parsed, gitDeviceComparison: fact });
    const back = JSON.parse(a.content) as Record<string, unknown>;
    if (JSON.stringify(back.gitDeviceComparison) !== JSON.stringify(fact)) throw new Error(`L-N2-c: re-read of ${h.executionId} result.json does not carry the computed stamp`);
  }
  const devices = Array.isArray(fact.devices) ? (fact.devices as Array<Record<string, unknown>>) : [];
  return {
    snap: copy, fact,
    report: { state: 'computed', harvesterExecutionId: h.executionId, checked: fact.checked === true, reason: (fact.reason as string) ?? null,
      comparedDevices: typeof fact.comparedDevices === 'number' ? fact.comparedDevices : 0,
      differences: devices.reduce((n, d) => n + (typeof d.differencesTotal === 'number' ? d.differencesTotal : Array.isArray(d.differences) ? d.differences.length : 0), 0) },
  };
}
