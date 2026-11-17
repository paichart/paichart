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

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
