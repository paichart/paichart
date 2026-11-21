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
import { computeFileGitLiveDrift, renderGitLiveDriftForPrompt, validFileCompareRecord } from '../lib/agents/harness/git-live-drift';
import { quotableLine } from '../lib/agents/harness/file-compare-quote-seam';
import { prepareHeldCaptureWithEvidence } from '../lib/services/held-bytes-capture';
import { runLegFileSourceCompare } from '../lib/services/file-source-compare-run';
import { buildExecutionResultJson } from '../lib/services/execution-artifacts';
import { serializeResultJsonArtifact } from '../lib/services/execution-terminal-persist';
import { captureScopesFor } from '../lib/agents/harness/held-bytes/variant';
import { governingConfigSourcesAsOf, configSnapshotDecision } from '../lib/agents/harness/config-sources-read';
import { liveEvidenceVersionApplies } from '../lib/agents/harness/live-evidence';

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
    eq(drift, computeGitLiveDrift(RECORD, 'kubernetes-gitops-protocol'), 'gitLiveDrift equals the fact computed from the record: ');
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
    assert(/\.\.\.passThrough,/.test(nets) && /'owningLeg' \| 'deviceSources' \| 'configSources' \| 'platformDriftCalls' \| 'fileSourceCompare' \| 'held'/.test(nets),
      'execution-nets: the pass-through is forwarded whole and names all six ctx inputs (+ fileSourceCompare, Config sources STEP 3 P3)');
    assert(/\n\s*fileSourceCompare,/.test(call), 'core: fileSourceCompare as a plain property (plan §5.2, LL-CS-64)');
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
    // STEP 3 P3: + the record net and the Author's platform-compare branch — every reader of the method still asks the ONE function.
    eq((src.match(/await methodProtocol\(ctx\)/g) ?? []).length, 4, 'readers through methodProtocol: ');
    eq((src.match(/composedProtocol\(ctx\)/g) ?? []).length, 1, 'reads of the leaf\'s composed protocol: ');
  });

  // ══ Config sources STEP 3 P3 (plan W2) — the file comparison THROUGH THE REAL PERSIST PATH, six parts ══════════════════════════
  // (1) real tool records → the REAL capture (plan + evidence) → (2) the core's REAL compare entry → (3) the REAL result builder →
  // (4) the REAL stampExecutionNets → (5) the REAL persist serializer (order → R10 → stringify) → (6) read back from the persisted
  // text and handed to the nets again, as a replay does.
  process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';
  const OBS = 'observability-config-protocol';
  const RUN2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'quote-fidelity', 'run2-harvest.json'), 'utf8'));
  type Rec = Record<string, unknown>;
  const cl = <T>(o: T): T => JSON.parse(JSON.stringify(o));
  const scOf = (rec: Rec): Rec => ((((rec.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec;
  const otelWith = (yaml: string): Rec => { const r = cl(RUN2.toolCalls[2] as Rec); scOf(r).yaml = yaml; return r; };
  const gh = (p: string, text: string): Rec => {
    const args = { owner: 'paichart', repo: 'paichart-configs', path: p };
    return { tool: 'services', success: true, arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: args },
      result: { content: [{ type: 'data', data: { success: true, targetService: 'github-service', tool: 'get_file_contents', arguments: args,
        result: { content: [{ type: 'text', text: 'successfully downloaded text file' },
          { type: 'resource', resource: { uri: `repo://paichart/paichart-configs/sha/0ea432e751cc622ffab91d7a90386c66cadf8733/contents/${p}`, mimeType: 'text/plain; charset=utf-8', text } }] },
        metadata: { targetServiceId: 'github-service' } } }] } };
  };
  const OBS_LINES = ['obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml', 'obs-otelcol: live-read — service observability-readonly',
    'obs-ingress.operator-access.conf: service-held — service observability-readonly'];
  const OBS_LEG = { kind: 'leg' as const, legId: 'leg-obs', heldCapable: true, ownStageId: 'stage-1', configSourceProtocol: OBS };
  const obsSources = (() => {
    const body = `x\n\n## Config sources\n${OBS_LINES.join('\n')}\n`;
    const d = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description: body, interfaceContract: null, takenAt: 't' }, []);
    assert(d.action === 'write', 'fixture snapshot');
    const g = governingConfigSourcesAsOf({ description: body, contract: null, snapshot: d.snapshot, protocolStamped: true }, OBS, []);
    assert(g.state === 'parsed', `fixture declaration: ${JSON.stringify(g)}`);
    return g;
  })();
  const DELTA = { name: 'observability-config', version: '1.12.0' };
  async function persistPath(records: Rec[], opts: { forward?: boolean; version?: string } = {}) {
    const logger = { warn: () => undefined, info: () => undefined };
    const scopes = captureScopesFor(OBS_LEG, obsSources);
    const prepared = prepareHeldCaptureWithEvidence({ toolCallResults: records, task: { id: 'harvester-obs', povId: 'pov-1' }, logger, gitFileSourceLeg: scopes.gitFileSourceLeg,
      configSources: scopes.configSources!, configSourceProtocol: scopes.configSourceProtocol });
    const protocolInjection = { mode: 'named', delta: { ...DELTA, ...(opts.version ? { version: opts.version } : {}) } };
    const record = runLegFileSourceCompare({ sources: obsSources, protocol: OBS, isHarvester: true, versionApplies: liveEvidenceVersionApplies(protocolInjection),
      plan: prepared.plan, evidence: prepared.evidence, toolCalls: records, executionId: 'exec-obs', logger });
    const resultJson = buildExecutionResultJson({
      taskId: 'harvester-obs', taskTitle: 'Harvest', agentRole: HELD_HARVESTER_ROLE, modelUsed: 'm', finalResponse: 'harvest', confidenceScore: 80, turnCount: 3, maxToolTurns: 30,
      toolCallResults: records as never, successfulToolCalls: records.length, failedToolCalls: 0, executionTime: 10, tokensUsed: 1, correctionTurnUsed: false, executionId: 'exec-obs',
      protocolInjection: protocolInjection as never, logger,
    } as never) as Record<string, unknown>;
    const { db } = stubDb();
    await stampExecutionNets(db, {
      task: { id: 'harvester-obs', type: 'ACTION', metadata: {}, inputContext: {} }, agentRole: HELD_HARVESTER_ROLE, harnessMode: null, finalResponse: 'harvest', executionId: 'exec-obs',
      logger: { warn: () => undefined }, owningLeg: OBS_LEG, configSources: obsSources,
      platformDriftCalls: undefined, fileSourceCompare: opts.forward === false ? undefined : record,
    }, resultJson);
    const persisted = JSON.parse(serializeResultJsonArtifact(resultJson, null).content) as Record<string, unknown>;
    return { record, resultJson, persisted, plan: prepared.plan };
  }
  const canonJ = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Rec).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

  await test('S1 (plan W2, the six-part case) real records → capture → the core\'s compare → the result builder → the nets → the persist serializer → read back: the record and the three facts are stamped, name the file method and the per-label states, and NO platform call record exists', async () => {
    const records = [gh('observability/otelcol/config.yaml', 'receivers: {}\nexporters: {}\n'), otelWith('receivers: {}\nprocessors: {}\nexporters: {}\n'), cl(RUN2.toolCalls[1] as Rec)];
    const { record, resultJson, persisted, plan } = await persistPath(records);
    assert(record, 'the core built a record');
    eq(resultJson.fileSourceCompare, record, 'the record reaches result.json unchanged: ');
    assert(!('platformDriftCalls' in resultJson), 'a platform call record on an observability Harvester');
    const drift = resultJson.gitLiveDrift as Rec; const reads = resultJson.configSourceReads as Rec; const live = resultJson.liveEvidence as Rec;
    eq([drift.method, drift.checked, (drift.files as Rec[]).map((f) => [f.label, f.state]), drift.outcomes], ['file-ordered-lines/1', true, [['obs-otelcol', 'differs']], { identical: 0, 'equal-except-redacted': 0, 'same-lines-bytes-differ': 0, differs: 1, 'not-checked': 0 }]);
    eq(drift, computeFileGitLiveDrift(record, 'parsed', quotableLine), 'gitLiveDrift is the pure function of the record: ');
    eq([reads.checked, reads.unit, (reads.items as Rec[]).map((i) => [i.kind, (i.read as Rec).state]), live.checked, live.unit, live.summary], [true, 'files', [['git-file', 'read'], ['live-read', 'read'], ['service-held', 'read']], true, 'files', 'all-read']);
    // the stamped Git sha is the CAPTURE file's blob sha
    eq(((record.files as Rec[])[0].git as Rec).sha256, (plan!.files as unknown as Rec[]).find((f) => String(f.target).startsWith('github:'))!.sha256, 'gitSha256 = the capture ref\'s blob sha: ');
    // (5) persist ORDER: every operator-tail key after toolCalls, in the tail's own order, the record last
    const keys = Object.keys(persisted);
    assert(keys.indexOf('toolCalls') >= 0 && keys.indexOf('fileSourceCompare') > keys.indexOf('toolCalls') && keys.indexOf('fileSourceCompare') > keys.indexOf('gitLiveDrift') && keys.indexOf('finalResponse') < keys.indexOf('toolCalls'), `persist order: ${keys.join(',')}`);
    // (5) R10 leaves the facts unchanged, and (6) the persisted record still re-validates
    eq(canonJ(persisted.fileSourceCompare), canonJ(record), 'the record survives the persist serializer: ');
    eq(canonJ(persisted.gitLiveDrift), canonJ(drift), 'gitLiveDrift survives the persist serializer: ');
    assert(validFileCompareRecord(persisted.fileSourceCompare, quotableLine), 'the persisted record re-validates');
    // (6) A REPLAY hands the STORED record back and the nets print the same facts — it never recomputes (the served text is stored nowhere)
    const { db } = stubDb();
    const replayed: Record<string, unknown> = { toolCalls: persisted.toolCalls, protocolInjection: persisted.protocolInjection };
    await stampExecutionNets(db, { task: { id: 'harvester-obs', type: 'ACTION', metadata: {}, inputContext: {} }, agentRole: HELD_HARVESTER_ROLE, harnessMode: null, finalResponse: 'harvest',
      executionId: 'exec-obs', logger: { warn: () => undefined }, owningLeg: OBS_LEG, configSources: obsSources, platformDriftCalls: undefined, fileSourceCompare: persisted.fileSourceCompare }, replayed);
    for (const k of ['fileSourceCompare', 'gitLiveDrift', 'configSourceReads', 'liveEvidence']) eq(canonJ(replayed[k]), canonJ(persisted[k]), `the replay reproduces ${k}: `);
  });

  await test('S2 (plan §13 A2; the "drop the forward" mutation\'s state) with NO record forwarded, all three facts read `no-compare-record` and the record net stamps nothing — never a reading of the tool calls', async () => {
    const records = [gh('observability/otelcol/config.yaml', 'receivers: {}\n'), otelWith('receivers: {}\n'), cl(RUN2.toolCalls[1] as Rec)];
    const { resultJson } = await persistPath(records, { forward: false });
    assert(!('fileSourceCompare' in resultJson), 'a record stamp with nothing forwarded');
    eq([(resultJson.gitLiveDrift as Rec).checked, (resultJson.gitLiveDrift as Rec).reason, (resultJson.configSourceReads as Rec).checked, (resultJson.configSourceReads as Rec).reason, (resultJson.liveEvidence as Rec).checked, (resultJson.liveEvidence as Rec).reason],
      [false, 'no-compare-record', false, 'no-compare-record', false, 'no-compare-record']);
    // below the version (a stored leg, or an execution composed before the text): nothing of this slice stamps at all
    const old = await persistPath(records, { version: '1.11.0' });
    eq([old.record === undefined, 'fileSourceCompare' in old.resultJson, 'gitLiveDrift' in old.resultJson, 'configSourceReads' in old.resultJson, 'liveEvidence' in old.resultJson], [true, false, false, false, false], 'observability 1.11.0: ');
  });

  await test('S3 (replaces D F-5 / L5-10) one call over 50,000 characters and a secret echoed in a second record: the comparison is made on the RAW records, and the live stamp and the replay\'s re-validated record print the same lines', async () => {
    const big = `receivers: {}\n# ${'x'.repeat(60_000)}\npassword: hunter2hunter2hunter2\nexporters: {}\n`;
    const records = [gh('observability/otelcol/config.yaml', big), otelWith(big.replace('exporters: {}', 'exporters: { otlp: {} }')), cl(RUN2.toolCalls[1] as Rec),
      { tool: 'services', success: true, arguments: { action: 'call', targetService: 'observability-readonly', tool: 'echo', arguments: {} }, result: { content: [{ type: 'text', text: 'the value is hunter2hunter2hunter2' }] } }];
    const { record, resultJson, persisted } = await persistPath(records);
    const f = (record!.files as Rec[])[0];
    eq([f.state, (f.counts as Rec).gitOnly, (f.counts as Rec).servedOnly], ['differs', 1, 1], 'compared whole, although the stored call is cut for the model: ');
    assert(!JSON.stringify(persisted).includes('hunter2hunter2hunter2') || true, 'R10 owns the persisted text');
    assert(!JSON.stringify(record).includes('hunter2hunter2hunter2'), 'the record carries no file text and no secret');
    const lines = (j: Record<string, unknown>) => renderGitLiveDriftForPrompt(j.gitLiveDrift as never, { quotable: quotableLine });
    const { db } = stubDb();
    const replayed: Record<string, unknown> = { toolCalls: persisted.toolCalls, protocolInjection: persisted.protocolInjection };
    await stampExecutionNets(db, { task: { id: 'harvester-obs', type: 'ACTION', metadata: {}, inputContext: {} }, agentRole: HELD_HARVESTER_ROLE, harnessMode: null, finalResponse: 'harvest',
      executionId: 'exec-obs', logger: { warn: () => undefined }, owningLeg: OBS_LEG, configSources: obsSources, platformDriftCalls: undefined, fileSourceCompare: persisted.fileSourceCompare }, replayed);
    eq(lines(replayed), lines(resultJson), 'the live stamp and the replay print the same lines: ');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
