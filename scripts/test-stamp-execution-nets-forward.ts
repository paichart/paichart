/**
 * PLATFORM-DRIFT-CALLS-DROPPED (2026-11-16) — the hop from the core to the nets, driven for real.
 *
 * The kubernetes-gitops 1.19.0 live canary (Harvester execution cmwj0pkx00096yxprlmtdd2c5) showed the platform's drift call MADE
 * (prod log: byOutcome {called:1}) and its record DROPPED: the core passed `platformDriftCalls` and `configSources` as conditional
 * spreads into `stampExecutionNets`, whose input declared neither, so `buildNetContext` never received them and the stored result.json
 * carried `gitLiveDrift {checked:false, reason:no-platform-call-record}` and no `platformDriftCalls`. Every existing test called
 * `buildNetContext` (or the lab's own ctx) directly — none drove a record THROUGH `stampExecutionNets`, which is the hop that dropped it.
 *
 * This suite calls the REAL `stampExecutionNets` over a DB stub and reads the stamped resultJson:
 *   F1  a call record reaches result.json as `platformDriftCalls`, and `gitLiveDrift` is computed FROM it (state compared, not shape);
 *   F2  control — no record ⇒ `platformDriftCalls` NOT_STAMPED and `gitLiveDrift` names `no-platform-call-record`;
 *   F3  the core's ONE Config sources read is the one the nets use: no second read of the leg row, and `configSourceReads` is computed
 *       from the passed declaration;
 *   F4  source pins: the core passes both as plain properties (excess-property-checked); the rescue never calls the platform.
 * Mutation-checked at build: dropping the `...passThrough` forward in execution-nets.ts reds F1 and F3.
 *
 * k8s value-lane P1 (2026-11-20) — `gitLiveDrift` takes its METHOD from the OWNING LEG's protocol at both readers:
 *   P1a the 18 stored stamps' shape (leaf protocol = leg protocol) reads exactly as before, at both points;
 *   P1b a leaf that composed one protocol under a leg of another reads the LEG's method — Harvester compute and Author transcription;
 *   P1c a leg that could not be resolved keeps the leaf's composed protocol (the value every stamp had before P1).
 * Seen RED at build against the pre-P1 enrichment: P1b only (P1a and P1c are the neutrality claims and stay green on both trees).
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-stamp-execution-nets-forward.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:y@127.0.0.1:1/z';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
import { stampExecutionNets } from '../lib/services/execution-nets';
import { resolveLegConfigSources } from '../lib/agents/harness/config-sources';
import type { LegConfigSourcesResolution } from '../lib/agents/harness/config-sources-read';
import { computeConfigSourceReads } from '../lib/agents/harness/config-source-facts';
import { computeGitLiveDrift, type PlatformDriftCall } from '../lib/agents/harness/git-live-drift';
import { HELD_HARVESTER_ROLE } from '../lib/agents/harness/held-bytes-nets';

let passed = 0; let failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}

// ── fixtures: the REAL compare-tool result (the same contract fixture test:git-live-drift pins) ───────────────────────────────────
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'git-live-drift', 'compare-result.json'), 'utf8')) as { manifest: string; result: Record<string, unknown> };
const SHA = createHash('sha256').update(FIX.manifest, 'utf8').digest('hex');
const RECORD: PlatformDriftCall[] = [{
  label: 'sample-workloads', path: 'k8s/sample-workloads.yaml', outcome: 'called', service: 'k8s-rig-readonly',
  manifestSha256: SHA, manifestLength: FIX.manifest.length, result: JSON.parse(JSON.stringify(FIX.result)),
}];
const K8S = 'kubernetes-gitops-protocol';
const SOURCES = resolveLegConfigSources({ protocol: K8S, taskBody: null, contractValue: [
  'sample-workloads: git-file — service github-service ; paichart/paichart-configs/k8s/sample-workloads.yaml',
  'trading: live-read — service k8s-rig-readonly',
].join('\n') }) as LegConfigSourcesResolution;
const OWNING_LEG = { kind: 'leg' as const, legId: 'leg-1', heldCapable: true, ownStageId: 'stage-1', gitFileSource: true, configSourceProtocol: K8S };

/** A DB stub: every model call resolves null, every $queryRaw resolves []; each raw query's SQL text is recorded. */
function stubDb() {
  const raw: string[] = [];
  const db = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === '$queryRaw' || prop === '$queryRawUnsafe') {
        return async (q: unknown, ...rest: unknown[]) => {
          const text = q && typeof q === 'object' && 'sql' in (q as object) ? String((q as { sql: unknown }).sql)
            : Array.isArray(q) ? (q as string[]).join('?') : String(q);
          raw.push(text); void rest; return [];
        };
      }
      return new Proxy({}, { get: () => async () => null });
    },
  });
  return { db: db as never, raw };
}

async function stampHarvester(opts: { platformDriftCalls?: readonly unknown[]; configSources?: LegConfigSourcesResolution | null }) {
  const { db, raw } = stubDb();
  const resultJson: Record<string, unknown> = { toolCalls: [], protocolInjection: { delta: { name: 'kubernetes-gitops', version: '1.19.0' } } };
  const warns: string[] = [];
  await stampExecutionNets(db, {
    task: { id: 'harvester-1', type: 'ACTION', metadata: { pipelineStageId: 'stage-1' }, inputContext: {} },
    agentRole: HELD_HARVESTER_ROLE, harnessMode: null, finalResponse: 'harvest', executionId: 'exec-1',
    logger: { warn: (_o, m) => { warns.push(m); } },
    owningLeg: OWNING_LEG,
    configSources: opts.configSources ?? null,
    platformDriftCalls: opts.platformDriftCalls,
  }, resultJson);
  return { resultJson, raw, warns };
}

(async () => {
  console.log('── the core → nets hop (stampExecutionNets, the real function) ──');

  await test('F1 a platform call record passed to stampExecutionNets reaches result.json as platformDriftCalls, and gitLiveDrift is computed FROM it', async () => {
    const { resultJson, warns } = await stampHarvester({ platformDriftCalls: RECORD, configSources: SOURCES });
    eq(resultJson.platformDriftCalls, { version: 1, calls: RECORD }, 'platformDriftCalls: ');
    const drift = resultJson.gitLiveDrift as Record<string, unknown> | undefined;
    assert(drift, 'gitLiveDrift not stamped');
    eq(drift, computeGitLiveDrift(RECORD), 'gitLiveDrift equals the fact computed from the record: ');
    eq([drift.checked, drift.filesCompared, drift.filesNotChecked, (drift.files as Array<{ state: string }>).map((f) => f.state)],
      [true, 1, 0, ['compared']], 'state: ');
    assert(!warns.some((w) => /platformDriftCalls|gitLiveDrift/.test(w)), `a drift net threw: ${warns.join(' | ')}`);
  });

  await test('F2 control: no record ⇒ platformDriftCalls NOT_STAMPED and gitLiveDrift names no-platform-call-record (the canary\'s stored state)', async () => {
    const { resultJson } = await stampHarvester({ configSources: SOURCES });
    assert(!('platformDriftCalls' in resultJson), `platformDriftCalls stamped without a record: ${JSON.stringify(resultJson.platformDriftCalls)}`);
    eq([(resultJson.gitLiveDrift as Record<string, unknown>)?.checked, (resultJson.gitLiveDrift as Record<string, unknown>)?.reason],
      [false, 'no-platform-call-record'], 'gitLiveDrift: ');
  });

  await test('F3 the core\'s ONE Config sources read is the one the nets use: no second read of the leg row; configSourceReads is computed from the passed declaration', async () => {
    const { resultJson, raw } = await stampHarvester({ platformDriftCalls: RECORD, configSources: SOURCES });
    const legReads = raw.filter((q) => q.includes('configSourcesSnapshot'));
    eq(legReads.length, 0, 'second reads of the leg\'s Config sources: ');
    eq(resultJson.configSourceReads, computeConfigSourceReads(SOURCES, []), 'configSourceReads: ');
    // control: absent ⇒ the nets read the leg row themselves (the lazy path the rescue and replays use)
    const lazy = await stampHarvester({ platformDriftCalls: RECORD });
    assert(lazy.raw.some((q) => q.includes('configSourcesSnapshot')), 'control: with no configSources passed the nets must read it lazily');
  });

  await test('F4 source pins: the core passes configSources + platformDriftCalls as PLAIN properties; the rescue never calls the platform', async () => {
    const core = fs.readFileSync(path.join(__dirname, '..', 'lib/services/execution-core.ts'), 'utf8');
    const call = core.slice(core.indexOf('await stampExecutionNets('), core.indexOf('}, resultJson as Record<string, unknown>);', core.indexOf('await stampExecutionNets(')));
    assert(/\n\s*configSources: legConfigSources,/.test(call) && /\n\s*platformDriftCalls,/.test(call), 'core: both fields as plain properties');
    assert(!/\.\.\.\(/.test(call), 'core: no spread in the stampExecutionNets input (a spread is not excess-property-checked)');
    const rescue = fs.readFileSync(path.join(__dirname, '..', 'lib/services/execution-completion-anchored.ts'), 'utf8');
    assert(!/runLegPlatformDrift|platformDriftCalls/.test(rescue), 'the rescue must never call the platform or forge a record');
    const nets = fs.readFileSync(path.join(__dirname, '..', 'lib/services/execution-nets.ts'), 'utf8');
    assert(/\.\.\.passThrough,/.test(nets) && /'owningLeg' \| 'deviceSources' \| 'configSources' \| 'platformDriftCalls' \| 'held'/.test(nets),
      'execution-nets: the pass-through is forwarded whole and names all five ctx inputs');
  });

  // ── k8s value-lane P1: the method's source ────────────────────────────────────────────────────────────────────────────────────
  const TF = 'terraform-iac-protocol';
  const TF_SOURCES = resolveLegConfigSources({ protocol: TF, taskBody: null, contractValue: 'state: live-read — service tf-rig-readonly' }) as LegConfigSourcesResolution;
  const K8S_DELTA = { name: 'kubernetes-gitops', version: '1.19.0' }; const TF_DELTA = { name: 'terraform-iac', version: '1.17.0' };
  const legOf = (protocol: string) => ({ ...OWNING_LEG, configSourceProtocol: protocol });
  const UNRESOLVED = { kind: 'could-not-check' as const, reason: 'read-threw' as const, heldCapable: false as const };
  /** One leaf through the REAL stampExecutionNets; returns its gitLiveDrift stamp. No call record is passed (the method is the subject). */
  async function driftOf(role: string, delta: { name: string; version: string }, owningLeg: unknown, configSources: LegConfigSourcesResolution) {
    const { db } = stubDb();
    const resultJson: Record<string, unknown> = { toolCalls: [], protocolInjection: { delta } };
    await stampExecutionNets(db, {
      task: { id: 'leaf-1', type: 'ACTION', metadata: { pipelineStageId: 'stage-1' }, inputContext: {} },
      agentRole: role, harnessMode: null, finalResponse: 'x', executionId: 'exec-1', logger: { warn: () => undefined },
      owningLeg: owningLeg as never, configSources,
    }, resultJson);
    const g = resultJson.gitLiveDrift as Record<string, unknown> | undefined;
    return g ? [g.point, g.method, g.reason] : null;
  }
  const AUTHOR = 'config_change_author';
  const K8S_H = ['harvester', 'k8s-declared-field-compare', 'no-platform-call-record']; const TF_H = ['harvester', null, 'no-git-vs-live-method'];
  // The Author stub has no stage row, so the transcription stops at `no-stage` — the branch that shows the method it would name.
  const K8S_A = ['author-transcription', 'k8s-declared-field-compare', 'no-stage']; const TF_A = ['author-transcription', null, 'no-stage'];

  await test('P1a leaf protocol = leg protocol (every stored stamp): the same method as before, at both points', async () => {
    eq(await driftOf(HELD_HARVESTER_ROLE, K8S_DELTA, legOf(K8S), SOURCES), K8S_H, 'k8s harvester: ');
    eq(await driftOf(HELD_HARVESTER_ROLE, TF_DELTA, legOf(TF), TF_SOURCES), TF_H, 'tf harvester: ');
    eq(await driftOf(AUTHOR, K8S_DELTA, legOf(K8S), SOURCES), K8S_A, 'k8s author: ');
    eq(await driftOf(AUTHOR, TF_DELTA, legOf(TF), TF_SOURCES), TF_A, 'tf author: ');
  });
  await test('P1b a leaf that composed ANOTHER protocol reads the LEG\'s method — the Harvester compute and the Author transcription both', async () => {
    eq(await driftOf(HELD_HARVESTER_ROLE, K8S_DELTA, legOf(TF), TF_SOURCES), TF_H, 'k8s leaf under a tf leg, harvester: ');
    eq(await driftOf(HELD_HARVESTER_ROLE, TF_DELTA, legOf(K8S), SOURCES), K8S_H, 'tf leaf under a k8s leg, harvester: ');
    eq(await driftOf(AUTHOR, K8S_DELTA, legOf(TF), TF_SOURCES), TF_A, 'k8s leaf under a tf leg, author: ');
    eq(await driftOf(AUTHOR, TF_DELTA, legOf(K8S), SOURCES), K8S_A, 'tf leaf under a k8s leg, author: ');
  });
  await test('P1c a leg that could not be resolved: the leaf\'s own composed protocol still decides (no moved fact on the could-not-check path)', async () => {
    eq(await driftOf(HELD_HARVESTER_ROLE, TF_DELTA, UNRESOLVED, TF_SOURCES), TF_H, 'tf harvester, leg unresolved: ');
    eq(await driftOf(HELD_HARVESTER_ROLE, K8S_DELTA, UNRESOLVED, SOURCES), K8S_H, 'k8s harvester, leg unresolved: ');
    eq(await driftOf(AUTHOR, TF_DELTA, UNRESOLVED, TF_SOURCES), TF_A, 'tf author, leg unresolved: ');
    eq(await driftOf(AUTHOR, K8S_DELTA, UNRESOLVED, SOURCES), K8S_A, 'k8s author, leg unresolved: ');
  });
  await test('P1d source pins: both readers call methodProtocol; composedProtocol is read in ONE place (the fallback)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib/agents/harness/git-live-drift-enrichment.ts'), 'utf8');
    eq((src.match(/await methodProtocol\(ctx\)/g) ?? []).length, 2, 'readers through methodProtocol: ');
    eq((src.match(/composedProtocol\(ctx\)/g) ?? []).length, 1, 'reads of the leaf\'s composed protocol: ');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
