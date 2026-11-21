#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage A WI-10 — the archive capture replay (G0, $0). Runs the SHIPPING pure capture half
 * (prepareHeldCapture: extractor + canonical + caps) and the WI-9 digest builder over STORED Harvester result.json
 * toolCalls. Read-only: run it through scripts/replay-held-capture.sh, which fetches the prod URL into memory, tunnels, forces
 * `default_transaction_read_only=on` and proves a write is refused before anything runs. Nothing is written anywhere.
 *
 * Modes:
 *   (default)                 the §11.2 archive replay report + PASS / STOP / ABSENCE verdict
 *   --predict <execId> …      the predicted set (toolCallIndex, selector, held | refusal-name) per execution
 *   --compare <execId> …      §11.3 G-CAP-live (i): the predicted set vs the table rows, symmetric diff (store-error
 *                             excused, named); and (ii) for each held prediction, the predicted baseHash vs the row's
 *                             blobSha256 (both computed from the same stored leaf); (iii) HELD-CAPTURE-COMPARE-ELIGIBILITY
 *                             (2026-10-25): declaredBy + declarationSha256 compared; eligibility predicted `platform` on an
 *                             ownerless row and compared, membership-checked on an owned row (not reconstructable — not
 *                             persisted); `unverifiable (eligibility)` / `unverifiable (echo)` instead of a false ❌ — the
 *                             logic is the pure scripts/held-capture-compare.ts. Exit 1 on any mismatch.
 *   --compare-all             --compare over EVERY execution that wrote a CAPTURE ref or a capture refusal (the step-3 gate form;
 *                             was a hand-built id list)
 *   --device-sources          held-network step 3 batch 2b: the SHIPPING Device sources grammar over every network leg (states/problems)
 *   --device-lane             … the device-read lane + deviceSourceReads + gitDeviceComparison over every stored network Harvester
 *   HELD_REPLAY_DEVICE_LANE=off  predict WITHOUT the device lane (what the pre-lane tree predicted) — the "nothing else moved" compare
 *   HELD_REPLAY_CONFIG_SCOPE=off predict WITHOUT the Config-sources capture scope (what this tool predicted before 2026-11-20:
 *                             "every pinned Git file read is held") — the "nothing else moved" compare for the Config scope
 *   HELD_REPLAY_ASSUME_SNAPSHOT=live  push 2: predict a leg with no first-execution snapshot as if snapshotted from its CURRENT
 *                             declaration (a measurement knob; production holds nothing there — `device-sources-snapshot-absent`)
 *   --check-held              MI-13 🔴 11: held blobs on which R10's deep walk redacts more than the stored text carries;
 *                             prints `candidates N hits M`, or `UNMEASURED` (exit 2) when it cannot run — never a bare 0
 *   --config-lane             Config sources STEP 3 P0 (W19): the Config-lane CORPUS over EVERY PIPELINE task, NO date bound (the count
 *                             read is printed). Per leg, on TWO lines: `leg …` — protocol, the governing declaration and the Config
 *                             force AS SHIPPED; `all-shipped …` — the same with every table row's text shipped, and the live
 *                             declaration. Label collisions; every stored
 *                             `configSourcesSnapshot` read back key for key; and, when the held tables are present, the held rows and
 *                             refusals on observability legs (the database lane's query C). Plain SELECTs over tasks, stages,
 *                             agent_executions, agent_artifacts — so it also runs on a LOCAL read-only copy
 *                             (`replay-held-capture.sh --config-lane --local-db <name>`); the 25006 probe is required there too.
 *   --config-lane-base        (wrapper mode) `replay-held-capture.sh --config-lane-base <base-tree> [--local-db <name>]`: the corpus with
 *                             this runner over the base tree's lib/ and over this tree's, compared leg by leg and snapshot by snapshot
 *   --file-read-counts        plan §7's production counts: (a) registry rows exposing the Git file-read tool (pinned or not), (b)
 *                             stored workflows whose steps read a key-named file through an unpinned file service, (c) stored held
 *                             refs / refusals / blobs / declared paths the never-held predicate of this tree would refuse (exit 1 on any)
 *   HELD_REPLAY_UNTIL=<UTC timestamp>  archive mode: an upper bound on result.json `createdAt` (exclusive). `--archive-base` sets ONE
 *                             value for both passes, so the two passes read the same window
 *   HELD_REPLAY_DEVICE_SCOPE_GATE=off  predict with the device scope gated on `deviceSource === true` only (what this tool did before
 *                             2026-11-21) — the "nothing else moved" compare for the device-scope gate
 *
 * LIMITS (read before trusting a number):
 *   - Stored toolCalls were already R10-deep-walked at persist, so the archive replay re-applies R10 to R10 output. Its
 *     "B == stored leaf" check is R10 IDEMPOTENCE on archive leaves — NOT capture fidelity (§11.2). The live check is
 *     --predict + MI-13 🔴 12.
 *   - Archive `redactedCount > 0` is structurally ~0, and archive `placeholderPreexistingCount` reads the PERSIST-TIME
 *     redaction count — live it reads genuine pre-existing placeholders. ARCHIVE AND LIVE COLUMNS ARE NOT COMPARABLE.
 *   - CONFIG SCOPE (2026-11-20): on a Config-sources leg the prediction applies the leg's governing Config-sources declaration,
 *     read by production's reader (`readLegConfigSources`) behind production's gate (`heldCaptureTakesConfigScope`) — as
 *     execution-core does. Both answer with TODAY's tables and TODAY's snapshot rule: "is a Config-sources leg" is keyed on the
 *     leg's protocol NAME, not the text version the execution ran under. An execution of such a leg that ran BEFORE its
 *     protocol's Config-sources text (kubernetes-gitops < 1.19.0, terraform-iac < 1.17.0) has no snapshot, so it is predicted
 *     `git-file-not-declared` for every Git file it actually held and reads ❌ — history under today's rule (like the pin cut),
 *     not a capture defect. `# config-scope` lines name every execution predicted with a scope and its declaration state. The
 *     gate for a code change stays `--compare-base`.
 *   - DEVICE SCOPE (2026-11-21, CAPTURE-REPLAY-DEVICE-SCOPE-GATE closed): the capture prediction takes the leg's Device-sources
 *     declaration as its device scope only when production's `heldCaptureTakesDeviceScope(leg)` says so — as execution-core does. A
 *     value-lane Device-sources leg is predicted with NO device scope (before this date the tool passed one). `# device-scope`
 *     lines name every execution where the gate withheld a scope. `--device-lane` asks the same gate for its capture half and
 *     production's `carrierAppliesDeviceForce` for its force half; the two device FACTS there still read the declaration on every lane.
 *   - ARCHIVE POPULATION: executions whose result.json names `get_otel_config` or `get_ingress_config` (FILE_TOOLS). A Git-only
 *     observability Harvester (one that calls only `get_file_contents`) is OUTSIDE it until the filter gains the Git tool. The
 *     per-execution lines (`exec <id> …`) carry the held count, the refusal names and a hash of the sorted
 *     (toolCallIndex, selector, sha256) list — nothing else: a change that moves only a held row's metadata (declaredBy, eligibility,
 *     redactedCount with the same bytes, a refusal's detail) is NOT visible in them. `--archive-base` runs THIS runner over the base
 *     tree's lib/ and over this tree's lib/, so it shows what a lib/ change moves — a change to the runner itself is on both sides
 *     (use a knob, e.g. HELD_REPLAY_DEVICE_SCOPE_GATE=off, or `--compare-base`, which runs each tree's own runner). When the two
 *     trees' lib/ are IDENTICAL the wrapper says so: the comparison then proves only that the replay is deterministic under the one
 *     bound, nothing about a change.
 *   - `--config-lane`: (1) THE TWO AWAITING STATES are both asked of PRODUCTION's functions through their defaulted awaiting-list
 *     parameter (Config sources STEP 3 P1): "as shipped" passes nothing; "all rows shipped" passes `[]` to `resolveOwningLegProtocol`
 *     and `carrierAppliesConfigForce`. No resolution is built by hand. On a base tree from before P1 the parameter is ignored, so
 *     there the two states are the same. While the awaiting list is EMPTY the two states are the same by construction, and the mode
 *     exits 2 if they differ. (2) WOULD-FORCE is the Config force only (`configGitFileForce`), not the carrier's final reason
 *     (stage-rebind, source-not-pinned and the device force rank above it; the carrier runs only when a held-capable leg writes an
 *     outcome). On a copy without the held tables it is computed from the PREDICTED capture of the leg's authoritative Harvester,
 *     never from stored refs. (3) LABEL COLLISIONS = two labels of one declaration naming the same Git file; the `service-held`
 *     labels' resolved (target, path) is not compared here (plan W10, slice P2-P3). (4) A leg created after the copy (or after the
 *     pass) is not in it. (5) WHAT THE EXIT CODE CARRIES, and what it proves, depends on where the observability row is — the mode
 *     prints which case it is in:
 *       · the row is absent or AWAITING its text: no stored observability leg may be declared in any way (no snapshot key, no block,
 *         no contract key, no Git-tied held row). As shipped, "not-config-source-leg" is then TRUE BY CONSTRUCTION — it shows the row
 *         is inert. In the all-rows-shipped state it is the per-leg `runs-undeclared` rule that decides each leg, and THAT is the
 *         proof of the rule on stored legs.
 *       · the text has shipped: a declared observability leg is legitimate. The standing rule still stops the run: a leg that
 *         declares NOTHING must read `not-config-source-leg` with no force.
 *     (6) A stored snapshot must still GOVERN — in every state where its leg's protocol declares Config sources, the governing
 *     declaration must be the snapshot's own stored state and entries; a snapshot that reads back equal but governs as
 *     `snapshot-changed` is a STOP. (7) `--config-lane-base <base-tree>` compares the `leg` and `snapshot` lines — the AS-SHIPPED
 *     state only — base against new (this runner on both sides). The all-rows-shipped state is on separate `all-shipped…` lines that
 *     are NOT compared (a base tree from before a lane row prints something else there by design); the NEW pass's own exit code
 *     carries that state's rule, and the wrapper fails the gate when it is not 0.
 *   - `--file-read-counts`: the key-named class is production's `keyNamedPathRefusal` (the measurement copy of P0 was deleted at P1;
 *     on a base tree from before P1 the function is absent and the class reads as empty). It is applied to literal strings only — a templated path (`{{…}}`, `${…}`) is counted as not judged, never as clean. A literal path is judged
 *     raw and after up to two rounds of percent-decoding, as production's unpinned gate does. Count (a) is rows whose STORED
 *     `capabilities.tools` list the tool — production's unpinned gate fires on the tool NAME for a call to ANY service, listed or
 *     not, so a service that serves the tool without listing it is not counted. A workflow step is found by an object holding the
 *     tool name as a VALUE: a templated TOOL name is not walked. "Pinned" for a platform row is this shell's pin (GIT_FILE_SOURCE_PIN
 *     or the default), not production's environment — the row's pinned STATE is the same either way, the printed REPO may not be.
 *   - A stored entry over 50 KB is an 8 KB preview (`truncated: true`): counted BY NAME as not replayable.
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-10, §11.2, §11.3, §12.2.
 */
process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';      // the runner exercises the capture regardless of the shell
process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'true';  // and R10 ON, as in production (EF S-4: never the operator's shell)

import { Client } from 'pg';
import type { Prisma } from '@prisma/client';
import { prepareHeldCapture } from '../lib/services/held-bytes-capture';
import { tableFromDeclarations, type HeldDescriptorTable } from '../lib/services/held-descriptor-table';
import { hydrateToolCallGatewayMeta } from '../lib/services/mcp/gateway-meta';
import { extractDeclaredFiles, withDeviceEvidenceOnly } from '../lib/agents/harness/held-bytes/extract';
import { countPlaceholders } from '../lib/agents/harness/held-bytes/canonical-text';
import { redactSecretsDeep } from '../lib/agents/harness/redact-artifact-secrets';
import { buildHeldBytesDigest } from '../lib/agents/harness/held-bytes/held-bytes-fact';
import type { HeldFileRefRow, HeldCaptureRefusalRow } from '../lib/services/held-bytes-store';
import * as variantModule from '../lib/agents/harness/held-bytes/variant';
import { resolveOwningLegProtocol, heldCaptureTakesConfigScope, heldCaptureTakesDeviceScope, carrierAppliesDeviceForce, carrierAppliesConfigForce,
  configSourceLaneOfResolution, isHeldCapableLeg, CONFIG_SOURCE_LANES, CONFIG_SOURCE_AWAITING_TEXT, HELD_OBS_PROTOCOL, HELD_VARIANT_PROTOCOL,
  type OwningLegResolution } from '../lib/agents/harness/held-bytes/variant';
import { readLegConfigSources, type LegConfigSourcesResolution } from '../lib/agents/harness/config-sources-read';
import { readConfigSourcesSnapshot, resolveLegConfigSources, contractConfigSourcesValue, declaredGitFiles, type LegConfigSources } from '../lib/agents/harness/config-sources';
import { configGitFileForce } from '../lib/agents/harness/held-bytes/config-source-scope';
import * as configScopeModule from '../lib/agents/harness/held-bytes/config-source-scope';
import { isFileOfGitLine } from '../lib/agents/harness/held-bytes/device-read-scope';
import { selectLegHarvesterHeldBytes } from '../lib/agents/harness/held-bytes-nets';
import { resolveTaskProtocol, canonicalProtocolName } from '../lib/agents/harness/program-protocol';
import { createHash } from 'crypto';
import { readLegDeviceSources, governingDeviceSources, type LegDeviceSourcesResolution } from '../lib/agents/harness/device-sources-read';
import { deviceReadForce } from '../lib/agents/harness/held-edit-carrier';
import { buildDeviceReadScope, type DeviceReadScope } from '../lib/agents/harness/held-bytes/device-read-scope';
import { computeDeviceSourceReads, computeGitDeviceComparison } from '../lib/agents/harness/device-source-facts';
import { resolveLegDeviceSources, contractDeviceSourcesValue } from '../lib/agents/harness/device-sources';
import { isDeviceSourceLeg } from '../lib/agents/harness/held-bytes/variant';
import { compareCapture, type PredictedRow, type StoredRow } from './held-capture-compare';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gitPin = require('../lib/mcp/server/config/git-file-source-pin') as {
  heldPathRefusal: (p: string) => string | null; keyNamedPathRefusal?: (p: string) => string | null; unpinnedPathForms?: (raw: string) => { forms: string[]; unjudgeable: boolean };
  unpinnedFileReadPathRefusal?: (tool: string, args: unknown, opts?: unknown) => { pathRefusal: string } | null; hasPrivateKeyBlock?: (t: string) => boolean; gitPinForRow: (row: unknown) => { owner: string; repo: string; refs: readonly string[] } | null;
  GIT_FILE_READ_TOOL: string };

const SINCE = process.env.HELD_REPLAY_SINCE || '2026-08-01';
/** Archive mode only: an exclusive upper bound on result.json `createdAt`, a UTC timestamp WITHOUT a zone (the column is a
 *  `timestamp` holding UTC). Unset = open-ended, as before. `--archive-base` sets one value for both passes. */
const UNTIL = process.env.HELD_REPLAY_UNTIL || null;
if (UNTIL !== null && !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(UNTIL)) {
  console.error('❌ HELD_REPLAY_UNTIL must be a UTC timestamp without a zone, e.g. "2026-11-21 03:00:00"'); process.exit(2);
}
const MIN_POPULATION = 20;
const FILE_TOOLS = ['get_otel_config', 'get_ingress_config'];
const RIG_FORBIDDEN = new Set(['raw-digest-present', 'path-invalid', 'descriptor-mismatch', 'not-declared', 'escaped-secret-residual']);
const silent = { warn: () => undefined, info: () => undefined };

const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

async function connect(): Promise<Client> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set (run through scripts/replay-held-capture.sh)');
  const c = new Client({ connectionString: url });
  c.on('error', () => undefined);
  await c.connect();
  try { await c.query('CREATE TEMP TABLE _held_ro_probe(x int)'); throw new Error('ABORT: a write was NOT refused — the session is not read-only'); }
  catch (e) {
    if (String((e as Error).message).startsWith('ABORT')) throw e;
    // ONLY "read-only transaction" (SQLSTATE 25006) counts as refused — any other error is not proof (code review N3).
    if ((e as { code?: string }).code !== '25006') throw new Error(`ABORT: the write probe failed with ${(e as { code?: string }).code ?? '?'}, not 25006 — read-only not proven`);
  }
  return c;
}

interface Row { id: string; taskId: string; povId: string | null; status: string; supersededById: string | null; content: string;
  taskType: string | null; taskTitle: string | null; taskMetadata: unknown }

/** 2026-10-22 (post-deploy regression, TF-TEXT-BATCH-NEXT / TF-PATH-RULE-GAPS): the replay never passed `gitFileSourceLeg`, so
 *  every Git-file-source capture (k8s, terraform) was predicted as NOTHING at every tree — only obs captures were ever compared.
 *  Production decides it from the owning leg (`execution-core.ts`: kind leg|self ∧ gitFileSource). The replay now calls the SAME
 *  resolver through a read-only adapter over this client (no copy of the ladder), memoised per task. */
const legMemo = new Map<string, OwningLegResolution>();
async function legOf(c: Client, row: Row): Promise<OwningLegResolution> {
  const hit = legMemo.get(row.taskId);
  if (hit !== undefined) return hit;
  const db = {
    task: { findUnique: async (a: { where: { id: string } }) =>
      (await c.query('SELECT stage_id AS "stageId", title, metadata FROM tasks WHERE id = $1', [a.where.id])).rows[0] ?? null },
    stage: { findUnique: async (a: { where: { id: string } }) =>
      (await c.query('SELECT metadata FROM stages WHERE id = $1', [a.where.id])).rows[0] ?? null },
  };
  const r = await resolveOwningLegProtocol(db, { id: row.taskId, type: row.taskType, title: row.taskTitle, metadata: row.taskMetadata });
  legMemo.set(row.taskId, r);
  return r;
}
/** Config sources STEP 3 P2 (plan W1): the two capture switches come from production's ONE helper (`captureScopesFor`) — the Git lane,
 *  the Config scope and the protocol the scope belongs to, together. A BASE tree from before P2 has no such export (`--archive-base`
 *  and `--config-lane-base` run THIS runner over the base's lib/, transpile-only): there, and only there, the two lines production
 *  had before P2 are used — which is exactly what that base's production did. */
const CONFIG_SCOPE_OFF = process.env.HELD_REPLAY_CONFIG_SCOPE === 'off';
type CaptureScopes = { gitFileSourceLeg: boolean; configSources: LegConfigSourcesResolution | null; configSourceProtocol: string | null };
function captureScopesOfLeg(leg: OwningLegResolution, legConfigSources: LegConfigSourcesResolution | null): CaptureScopes {
  const helper = (variantModule as unknown as { captureScopesFor?: (l: OwningLegResolution, s: LegConfigSourcesResolution | null) => CaptureScopes }).captureScopesFor;
  if (typeof helper === 'function') return helper(leg, legConfigSources);
  const resolved = leg.kind === 'leg' || leg.kind === 'self';
  return { gitFileSourceLeg: resolved && leg.gitFileSource === true,
    configSources: legConfigSources && heldCaptureTakesConfigScope(leg) ? legConfigSources : null, configSourceProtocol: null };
}
const scopesMemo = new Map<string, CaptureScopes>();
async function captureScopesOf(c: Client, row: Row): Promise<CaptureScopes> {
  const hit = scopesMemo.get(row.taskId);
  if (hit) return hit;
  const leg = await legOf(c, row);
  const ro = { $queryRaw: async (q: { text: string; values: unknown[] }) => (await c.query(q.text, q.values)).rows } as never;
  const legConfigSources = (leg.kind === 'leg' || leg.kind === 'self') && leg.configSourceProtocol ? await readLegConfigSources(ro, leg) : null;
  const v = captureScopesOfLeg(leg, legConfigSources);
  scopesMemo.set(row.taskId, v);
  return v;
}
/** With HELD_REPLAY_CONFIG_SCOPE=off the Git lane is the leg's NAME bit, as this tool predicted before any scope was passed. */
async function gitFileSourceLegOf(c: Client, row: Row): Promise<boolean> {
  if (CONFIG_SCOPE_OFF) { const r = await legOf(c, row); return (r.kind === 'leg' || r.kind === 'self') && r.gitFileSource === true; }
  return (await captureScopesOf(c, row)).gitFileSourceLeg;
}
/** The protocol the Config scope belongs to (capture is an allow-list of declared files only where that protocol names service files). */
async function configSourceProtocolOf(c: Client, row: Row): Promise<string | null> {
  return CONFIG_SCOPE_OFF ? null : (await captureScopesOf(c, row)).configSourceProtocol;
}

/** held-network step 3 batch 2b (P3): the leg's declared Device sources, through the SHIPPING reader over a read-only adapter
 *  (production: execution-core reads it once per persist on a Device-sources leg). Undefined off such a leg — and when
 *  HELD_REPLAY_DEVICE_LANE=off, which predicts exactly what the pre-lane tree predicted (the "nothing else moved" half of a compare). */
const DEVICE_LANE_OFF = process.env.HELD_REPLAY_DEVICE_LANE === 'off';
/** push 2 (O-2): production governs from the leg's first-execution SNAPSHOT, so every leg first executed before push 2 reads
 *  `snapshot-absent` and holds nothing — the default prediction (the production truth). HELD_REPLAY_ASSUME_SNAPSHOT=live predicts
 *  instead as if each such leg had been snapshotted from its CURRENT declaration — a measurement knob only (what the lane's other
 *  rules would hold on stored legs), never what production does; every line it touches says `(assumed snapshot)`. */
const ASSUME_SNAPSHOT = process.env.HELD_REPLAY_ASSUME_SNAPSHOT === 'live';
const devSrcMemo = new Map<string, LegDeviceSourcesResolution | null>();
async function deviceSourcesOf(c: Client, row: Row): Promise<LegDeviceSourcesResolution | null> {
  if (DEVICE_LANE_OFF) return null;
  if (devSrcMemo.has(row.taskId)) return devSrcMemo.get(row.taskId)!;
  const leg = await legOf(c, row);
  const ro = { $queryRaw: async (q: { text: string; values: unknown[] }) => (await c.query(q.text, q.values)).rows } as never;
  let v = (leg.kind === 'leg' || leg.kind === 'self') && leg.deviceSource === true ? await readLegDeviceSources(ro, leg) : null;
  if (v && v.state === 'snapshot-absent' && ASSUME_SNAPSHOT && (leg.kind === 'leg' || leg.kind === 'self')) {
    const r = (await c.query(`SELECT description, ("inputContext" -> 'interfaceContract') AS contract FROM tasks WHERE id = $1`, [leg.legId])).rows[0];
    if (r) v = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(r.contract), taskBody: r.description });
  }
  devSrcMemo.set(row.taskId, v);
  return v;
}
/** CAPTURE-REPLAY-DEVICE-SCOPE-GATE (2026-11-21): capture takes the declaration as its device scope only when production's lane gate
 *  says so — `heldCaptureTakesDeviceScope(owningLeg)`, the function execution-core calls for `captureDeviceSources`. Nothing of the
 *  lane decision lives here. HELD_REPLAY_DEVICE_SCOPE_GATE=off predicts as this tool did before (a scope on every Device-sources leg).
 *  `deviceScopeWithheld` records every execution whose leg declares Device sources and whose scope the gate withheld. */
const DEVICE_SCOPE_GATE_OFF = process.env.HELD_REPLAY_DEVICE_SCOPE_GATE === 'off';
const deviceScopeWithheld = new Map<string, string>();
async function deviceScopeOf(c: Client, row: Row, tc: unknown[] | null): Promise<DeviceReadScope | undefined> {
  const s = await deviceSourcesOf(c, row);
  if (!s) return undefined;
  if (!DEVICE_SCOPE_GATE_OFF && !heldCaptureTakesDeviceScope(await legOf(c, row))) { deviceScopeWithheld.set(row.id, s.state); return undefined; }
  return tc ? buildDeviceReadScope(s, tc) : undefined;
}

/** CAPTURE-REPLAY-CONFIG-SCOPE (2026-11-20): the Config-sources capture scope, exactly as execution-core computes
 *  `captureConfigSources` — production's reader (`readLegConfigSources`: the snapshot rule, the grammar) on a leg whose resolution
 *  carries `configSourceProtocol`, kept only when production's lane gate (`heldCaptureTakesConfigScope`) says capture takes it.
 *  Nothing of the grammar, the snapshot rule or the lane decision lives here. Null off such a leg — and when
 *  HELD_REPLAY_CONFIG_SCOPE=off, which predicts what this tool predicted before the scope was passed. `configScopeSeen` records every
 *  execution predicted with a non-null scope (the `# config-scope` lines: how much of a pass the scope actually exercised). */
const configScopeSeen = new Map<string, string>();
async function configSourcesOf(c: Client, row: Row): Promise<LegConfigSourcesResolution | null> {
  if (CONFIG_SCOPE_OFF) return null;
  const leg = await legOf(c, row);
  const v = (await captureScopesOf(c, row)).configSources;
  if (v) {
    const proto = (leg.kind === 'leg' || leg.kind === 'self') ? leg.configSourceProtocol : undefined;
    configScopeSeen.set(row.id, `${proto ?? '?'} ${v.state}${'reason' in v ? ` (${v.reason})` : ''}`);
  }
  return v;
}
/** Lines starting `# config-scope` are NOT compared by held-capture-replay-diff.sh (it reads the header, verdicts and detail only). */
function printConfigScope(total: number): void {
  // `# device-scope` lines are not compared by held-capture-replay-diff.sh either.
  if (DEVICE_SCOPE_GATE_OFF) console.log('# device-scope: gate OFF (HELD_REPLAY_DEVICE_SCOPE_GATE=off) — a device scope on every Device-sources leg');
  else {
    for (const [id, st] of deviceScopeWithheld) console.log(`# device-scope ${id} withheld by heldCaptureTakesDeviceScope (declaration ${st})`);
    console.log(`# device-scope: ${deviceScopeWithheld.size} of ${total} executions had a Device-sources declaration and NO device scope (production's gate)`);
  }
  if (CONFIG_SCOPE_OFF) { console.log('# config-scope: OFF (HELD_REPLAY_CONFIG_SCOPE=off) — no execution predicted with a Config scope'); return; }
  const by: Record<string, number> = {};
  for (const [id, st] of configScopeSeen) { by[st] = (by[st] ?? 0) + 1; console.log(`# config-scope ${id} ${st}`); }
  console.log(`# config-scope: ${configScopeSeen.size} of ${total} executions predicted with a non-null Config scope ${JSON.stringify(by)}`);
}

async function loadHarvesters(c: Client, ids?: string[]): Promise<Row[]> {
  const where = ids
    ? `e.id = ANY($1)`
    : `a."createdAt" >= $1${UNTIL ? ` AND a."createdAt" < $2::timestamp` : ''} AND (a.content LIKE '%get_otel_config%' OR a.content LIKE '%get_ingress_config%')`;
  const r = await c.query(
    `SELECT e.id, e."taskId", t.pov_id AS "povId", e.status, e."supersededById", a.content,
            t.type AS "taskType", t.title AS "taskTitle", t.metadata AS "taskMetadata"
       FROM agent_artifacts a JOIN agent_executions e ON e.id = a."executionId" JOIN tasks t ON t.id = e."taskId"
      WHERE a.name = 'result.json' AND a.content LIKE '{%' AND ${where}
      ORDER BY a."createdAt", a.id`, ids ? [ids] : UNTIL ? [SINCE, UNTIL] : [SINCE]);
  return r.rows as Row[];
}

/** The stored toolCalls, with each record's gateway meta re-attached from the `toolCallGatewayMeta` tail key by index
 *  (Stage B P1-4) — so a failed call addressed by registry id yields the SAME refusal row replayed as it did live. */
function toolCallsOf(content: string): unknown[] | null {
  try {
    const j = JSON.parse(content);
    if (!Array.isArray(j.toolCalls)) return null;
    hydrateToolCallGatewayMeta(j.toolCalls, j.toolCallGatewayMeta);
    return j.toolCalls;
  } catch { return null; }
}

/** The plan's files and refusals as the rows the I/O half would build (no DB). */
function planRows(plan: NonNullable<ReturnType<typeof prepareHeldCapture>>): { refs: HeldFileRefRow[]; refusals: HeldCaptureRefusalRow[] } {
  return {
    refs: plan.files.map((f) => ({
      scope: plan.scope ?? '', blobSha256: f.sha256, executionId: 'replay', kind: 'CAPTURE', legTaskId: null, rootTaskId: null,
      serviceId: f.serviceId, serviceName: f.serviceName, sourceTool: f.sourceTool, toolCallIndex: f.toolCallIndex, selector: f.selector,
      target: f.target, path: f.path, declaredBy: f.declaredBy, descriptorVersion: f.descriptorVersion, declarationSha256: f.declarationSha256 ?? null, eligibility: f.eligibility ?? null, grantPovId: f.grantPovId ?? null, hashBasis: f.hashBasis,
      decodeVersion: f.decodeVersion, redactorVersion: f.redactorVersion, redactedCount: f.redactedCount, lineCount: f.lineCount,
      newline: null, bom: null, finalNewline: null, serviceReportsComplete: null, derivedRawByteLength: null,
      placeholderPreexistingCount: f.placeholderPreexistingCount,
      sourceRevision: f.sourceRevision, // held-k8s 1a: required on the row type (a forgotten builder must fail tsc)
    })),
    refusals: plan.refusals.map((r) => ({ ...r, executionId: 'replay' })),
  };
}

async function archive(c: Client): Promise<number> {
  const rows = await loadHarvesters(c);
  const byTool: Record<string, { calls: number; files: number; held: number }> = {};
  const refusalsByName: Record<string, number> = {};
  const truncated: string[] = [];
  const superseded: string[] = [];
  const unexpected: string[] = [];
  const idempotenceBreaks: string[] = [];
  const lineMapBroken: string[] = [];
  const rigForbidden: string[] = [];
  const sizes: number[] = []; const lines: number[] = []; const digestSizes: number[] = []; const cpu: number[] = [];
  let withDeclared = 0; let undeclaredFailed = 0; let rowsOmitted = 0; let truncatedFields = 0;
  const blobsPerScope = new Map<string, Set<string>>(); let refsTotal = 0;
  // W19 (2026-11-21): ONE line per candidate execution — what `--archive-base` compares. Every candidate row gets a line (a row
  // with no toolCalls or no plan says so), so "present in one pass only" means the POPULATION moved, never that a line was skipped.
  const execLines: string[] = [];
  for (const row of rows) {
    const tc = toolCallsOf(row.content);
    if (!tc) { execLines.push(`exec ${row.id} no-toolcalls`); continue; }
    if (row.supersededById) superseded.push(row.id);
    tc.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      const res = rr.result as Record<string, unknown> | undefined;
      const tool = (rr.arguments as Record<string, unknown> | undefined)?.tool;
      if (rr.tool === 'services' && FILE_TOOLS.includes(String(tool)) && res && res.truncated === true) truncated.push(`${row.id}#${i}`);
    });
    const gitLeg = await gitFileSourceLegOf(c, row);
    const storedTable = await storedHeldTable(c, row.id); // WI-B10 — BEFORE t0 (I/O is not the pure half's CPU)
    const devScope = await deviceScopeOf(c, row, tc); // held-network step 3 batch 2b — BEFORE t0, as above
    const cfgScope = await configSourcesOf(c, row); // the Config-sources capture scope — BEFORE t0, as above
    const cfgProto = await configSourceProtocolOf(c, row);
    const t0 = process.hrtime.bigint();
    let plan: ReturnType<typeof prepareHeldCapture>;
    try {
      plan = prepareHeldCapture({ toolCallResults: tc, task: { id: row.taskId, povId: row.povId }, gitFileSourceLeg: gitLeg, heldTable: storedTable, live: false, ...(devScope ? { deviceRead: devScope } : {}), ...(cfgScope ? { configSources: cfgScope, configSourceProtocol: cfgProto } : {}), logger: { warn: (o) => { unexpected.push(`${row.id}:${JSON.stringify(o)}`); }, info: () => undefined } });
    } catch (e) { unexpected.push(`${row.id}:threw:${(e as Error).name}`); execLines.push(`exec ${row.id} threw:${(e as Error).name}`); continue; }
    cpu.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (!plan) { execLines.push(`exec ${row.id} no-plan`); continue; }
    {
      const names: Record<string, number> = {};
      for (const r of plan.refusals) names[r.refusal] = (names[r.refusal] ?? 0) + 1;
      const set = plan.files.map((f) => `${f.toolCallIndex}\t${f.selector ?? ''}\t${f.sha256}`).sort();
      execLines.push(`exec ${row.id} held ${plan.files.length} refusals {${Object.keys(names).sort().map((k) => `${k}:${names[k]}`).join(',')}} set ${createHash('sha256').update(JSON.stringify(set), 'utf8').digest('hex').slice(0, 32)}`);
    }
    // `ex` is the DENOMINATOR (every declared file read, before any scope); what is HELD is `plan.files`, which carries the device
    // and Config scopes. A file the Config scope refuses counts as a file not held, under its name in "refusals by name".
    const ex = extractDeclaredFiles(tc, storedTable?.table ?? undefined, { gitFileSourceLeg: gitLeg, ...(devScope ? { deviceRead: devScope } : {}), unavailableShas: storedTable?.unavailableShas, invalidShas: storedTable?.invalidShas });
    undeclaredFailed += ex.stats.undeclaredFailed;
    if (plan.stats.declaredCalls > 0) withDeclared++;
    for (const f of ex.files) {
      const t = (byTool[f.sourceTool] ??= { calls: 0, files: 0, held: 0 });
      t.files++;
    }
    const callsSeen = new Set(ex.files.map((f) => `${f.sourceTool}#${f.toolCallIndex}`));
    for (const k of callsSeen) byTool[k.split('#')[0]].calls++;
    for (const f of plan.files) {
      byTool[f.sourceTool].held++;
      sizes.push(f.storedByteLength); lines.push(f.lineCount); refsTotal++;
      const set = blobsPerScope.get(plan.scope ?? '') ?? new Set<string>(); set.add(f.sha256); blobsPerScope.set(plan.scope ?? '', set);
      const C = ex.files.find((x) => x.toolCallIndex === f.toolCallIndex && x.selector === f.selector)?.text;
      if (f.redactedCount === 0 && C !== undefined && f.content !== C) idempotenceBreaks.push(`${row.id}#${f.toolCallIndex}${f.selector}`);
    }
    for (const r of plan.refusals) {
      refusalsByName[r.refusal] = (refusalsByName[r.refusal] ?? 0) + 1;
      if (r.refusal === 'line-map-broken') lineMapBroken.push(row.id);
      if (RIG_FORBIDDEN.has(r.refusal)) rigForbidden.push(`${row.id}:${r.refusal}#${r.toolCallIndex}`);
    }
    const { refs, refusals } = planRows(plan);
    const d = buildHeldBytesDigest({ refs, refusals, storedBytes: plan.files.reduce((a, f) => a + f.storedByteLength, 0) });
    const ds = JSON.stringify(d).length; digestSizes.push(ds);
    if (d.rowsOmitted) rowsOmitted++;
    if (d.rows.some((x) => x.truncatedFields)) truncatedFields++;
  }
  const files = Object.values(byTool).reduce((a, t) => a + t.files, 0);
  const held = Object.values(byTool).reduce((a, t) => a + t.held, 0);
  const distinct = [...blobsPerScope.values()].reduce((a, s) => a + s.size, 0);
  console.log(`# --archive: ${rows.length} candidate executions; result.json createdAt >= ${SINCE}${UNTIL ? ` and < ${UNTIL} (UTC)` : ' (no upper bound)'}; device-scope gate ${DEVICE_SCOPE_GATE_OFF ? 'off' : 'on'}; config scope ${CONFIG_SCOPE_OFF ? 'off' : 'on'}`);
  for (const l of execLines) console.log(l);
  console.log('══ ARCHIVE CAPTURE REPLAY (shipping prepareHeldCapture over stored result.json) ══');
  console.log(`window: result.json created >= ${SINCE}${UNTIL ? ` and < ${UNTIL} (UTC)` : ''}; candidate executions (EVERY role whose result.json names a file tool): ${rows.length}; with a declared call: ${withDeclared}`);
  console.log('⚠️  ARCHIVE AND LIVE COLUMNS ARE NOT COMPARABLE (stored leaves are already R10 output).');
  printConfigScope(rows.length);
  for (const [tool, t] of Object.entries(byTool)) console.log(`  ${tool}: successful declared calls ${t.calls}, files ${t.files}, would-hold ${t.held}`);
  console.log(`  refusals by name: ${JSON.stringify(refusalsByName)}`);
  console.log(`  failed calls to a pair absent from the table (context, never a STOP): ${undeclaredFailed}`);
  console.log(`  truncated stored entries (not replayable, by name): ${truncated.length}${truncated.length ? ' ' + truncated.join(', ') : ''}`);
  console.log(`  superseded executions (counted separately): ${superseded.length}`);
  console.log(`  dedup: ${refsTotal} refs over ${distinct} distinct (scope, sha256)`);
  console.log(`  storedByteLength p50/p95/max: ${pct(sizes, 50)}/${pct(sizes, 95)}/${Math.max(0, ...sizes)}; lineCount p50/p95/max: ${pct(lines, 50)}/${pct(lines, 95)}/${Math.max(0, ...lines)}`);
  console.log(`  digest size p50/p95/max: ${pct(digestSizes, 50)}/${pct(digestSizes, 95)}/${Math.max(0, ...digestSizes)}; rowsOmitted ${rowsOmitted}; truncatedFields ${truncatedFields}`);
  console.log(`  pure-half CPU ms p50/p95/max (CPU only — no SELECT, no upsert): ${pct(cpu, 50).toFixed(1)}/${pct(cpu, 95).toFixed(1)}/${Math.max(0, ...cpu).toFixed(1)}`);
  const stops: string[] = [];
  if (unexpected.length) stops.push(`pure half warned/threw on ${unexpected.length}: ${unexpected.slice(0, 5).join(' | ')}`);
  if (lineMapBroken.length) stops.push(`line-map-broken on ${lineMapBroken.join(', ')}`);
  if (idempotenceBreaks.length) stops.push(`R10 idempotence (archive) broken on ${idempotenceBreaks.slice(0, 5).join(', ')}`);
  if (rigForbidden.length) stops.push(`rig shapes that must not occur: ${rigForbidden.slice(0, 5).join(', ')}`);
  if (pct(digestSizes, 95) > 600) stops.push(`digest p95 ${pct(digestSizes, 95)} > 600`);
  if (Math.max(0, ...digestSizes) > 1024) stops.push(`a digest over 1,024 (builder defect)`);
  if (pct(cpu, 95) > 500) stops.push(`pure-half CPU p95 ${pct(cpu, 95).toFixed(1)} ms > 500`);
  if (stops.length) { console.log('\n⛔ STOP:'); for (const s of stops) console.log('  - ' + s); return 1; }
  if (withDeclared < MIN_POPULATION) { console.log(`\n⚪ ABSENCE: ${withDeclared} executions with a declared call < minimum ${MIN_POPULATION}. Not a PASS.`); return 3; }
  const rate = files ? held / files : 0;
  console.log(`\nwould-hold ${held}/${files} files = ${(rate * 100).toFixed(1)}% (PASS needs ≥ 95%; read each remaining file by hand)`);
  if (rate < 0.95) { console.log('⛔ STOP: would-hold below 95% of files'); return 1; }
  console.log('✅ PASS (archive replay)');
  return 0;
}

/** WI-B10 (design §9.1 E, §10 A-8): the SAME table a live capture used, rebuilt from what the execution STORED — the
 *  (serviceId, declarationSha256) pairs on its CAPTURE refs and refusals + the immutable held_declarations snapshots. Stored
 *  records carry no call-time stamp, so the replay is LEGACY (live: false): registrant entries match by serviceId. Null when the
 *  execution holds nothing under a registrant declaration, or the database predates WI-B10 (column absent). */
let declColumnPresent: boolean | null = null;
async function storedHeldTable(c: Client, executionId: string): Promise<HeldDescriptorTable | null> {
  if (declColumnPresent === null) {
    declColumnPresent = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'held_file_refs' AND column_name = 'declarationSha256'`)).rowCount === 1;
  }
  if (!declColumnPresent) return null;
  const pairs = (await c.query(`SELECT DISTINCT "serviceId" AS "serviceId", "declarationSha256" AS sha FROM (
      SELECT "serviceId", "declarationSha256" FROM held_file_refs WHERE "executionId" = $1 AND kind = 'CAPTURE' AND "declarationSha256" IS NOT NULL
      UNION ALL SELECT "serviceId", "declarationSha256" FROM held_capture_refusals WHERE "executionId" = $1 AND "declarationSha256" IS NOT NULL AND "serviceId" IS NOT NULL) x`, [executionId])).rows as Array<{ serviceId: string; sha: string }>;
  if (pairs.length === 0) return null;
  const snaps = (await c.query(`SELECT sha256, "heldFiles" AS "heldFiles" FROM held_declarations WHERE sha256 = ANY($1)`, [[...new Set(pairs.map((p) => p.sha))]])).rows as Array<{ sha256: string; heldFiles: unknown }>;
  return tableFromDeclarations(pairs, snaps);
}

function predictedSet(row: Row, gitFileSourceLeg: boolean, heldTable: HeldDescriptorTable | null = null, deviceRead?: DeviceReadScope, configSources?: LegConfigSourcesResolution | null, configSourceProtocol?: string | null): { lines: string[]; hashes: Map<string, string>; rows: PredictedRow[] } {
  const tc = toolCallsOf(row.content);
  const plan = tc ? prepareHeldCapture({ toolCallResults: tc, task: { id: row.taskId, povId: row.povId }, gitFileSourceLeg, logger: silent, heldTable, live: false, ...(deviceRead ? { deviceRead } : {}), ...(configSources ? { configSources, configSourceProtocol: configSourceProtocol ?? null } : {}) }) : null;
  const hashes = new Map<string, string>();
  if (!plan) return { lines: [], hashes, rows: [] };
  for (const f of plan.files) hashes.set(`${f.toolCallIndex}\t${f.selector}`, f.sha256);
  const rows: PredictedRow[] = [
    ...plan.files.map((f) => ({ i: f.toolCallIndex, s: f.selector ?? '', outcome: 'held', hash: f.sha256, serviceId: f.serviceId,
      declaredBy: f.declaredBy ?? null, declarationSha256: f.declarationSha256 ?? null })),
    ...plan.refusals.map((r) => ({ i: r.toolCallIndex, s: r.selector ?? '', outcome: r.refusal, hash: null, serviceId: r.serviceId,
      declaredBy: r.declaredBy ?? null, declarationSha256: r.declarationSha256 ?? null })),
  ];
  return {
    lines: [
      ...plan.files.map((f) => `${f.toolCallIndex}\t${f.selector}\theld`),
      ...plan.refusals.map((r) => `${r.toolCallIndex}\t${r.selector ?? ''}\t${r.refusal}`),
    ].sort(),
    hashes,
    rows,
  };
}

async function predict(c: Client, ids: string[]): Promise<number> {
  for (const row of await loadHarvesters(c, ids)) {
    console.log(`# ${row.id}`);
    for (const line of predictedSet(row, await gitFileSourceLegOf(c, row), await storedHeldTable(c, row.id), await deviceScopeOf(c, row, toolCallsOf(row.content)), await configSourcesOf(c, row), await configSourceProtocolOf(c, row)).lines) console.log(line);
  }
  printConfigScope(ids.length);
  return 0;
}

/** §11.3 (i) set equality, (ii) bytes and (iii) declaration + eligibility, against the live tables. The prediction runs the
 *  SHIPPING extractor over the STORED leaf, so (ii) compares two hashes of the same text — any difference is a capture defect.
 *  (iii) is the pure compareCapture (HELD-CAPTURE-COMPARE-ELIGIBILITY): see scripts/held-capture-compare.ts for what is and is not
 *  reconstructable. Eligibility columns are read only when the IF-3 schema is present (else every row is pre-IF-3). */
let eligColumnPresent: boolean | null = null;
async function compare(c: Client, ids: string[]): Promise<number> {
  if (eligColumnPresent === null) {
    eligColumnPresent = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'held_file_refs' AND column_name = 'eligibility'`)).rowCount === 1;
  }
  if (declColumnPresent === null) {
    declColumnPresent = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'held_file_refs' AND column_name = 'declarationSha256'`)).rowCount === 1;
  }
  const elig = eligColumnPresent ? `eligibility e, "grantPovId" g` : `NULL::text e, NULL::text g`;
  const decl = declColumnPresent ? `"declaredBy" db, "declarationSha256" ds` : `NULL::text db, NULL::text ds`;
  const ownerMemo = new Map<string, string | null | undefined>();
  let bad = 0; let unverifiable = 0;
  for (const row of await loadHarvesters(c, ids)) {
    const pred = predictedSet(row, await gitFileSourceLegOf(c, row), await storedHeldTable(c, row.id), await deviceScopeOf(c, row, toolCallsOf(row.content)), await configSourcesOf(c, row), await configSourceProtocolOf(c, row));
    const refs = (await c.query(`SELECT "toolCallIndex" i, coalesce(selector, '') s, "blobSha256" h, "serviceId" sid, ${decl}, ${elig} FROM held_file_refs WHERE "executionId" = $1 AND kind = 'CAPTURE'`, [row.id])).rows;
    const refu = (await c.query(`SELECT "toolCallIndex" i, coalesce(selector, '') s, refusal r, "serviceId" sid, ${decl}, ${elig} FROM held_capture_refusals WHERE "executionId" = $1`, [row.id])).rows;
    const actual: StoredRow[] = [
      ...refs.map((x) => ({ i: x.i, s: x.s, outcome: 'held', hash: x.h, serviceId: x.sid ?? null, declaredBy: x.db ?? null, declarationSha256: x.ds ?? null, eligibility: x.e ?? null, grantPovId: x.g ?? null })),
      ...refu.map((x) => ({ i: x.i, s: x.s, outcome: x.r, hash: null, serviceId: x.sid ?? null, declaredBy: x.db ?? null, declarationSha256: x.ds ?? null, eligibility: x.e ?? null, grantPovId: x.g ?? null })),
    ];
    const sids = [...new Set([...actual, ...pred.rows].map((r) => r.serviceId).filter((x): x is string => !!x && !ownerMemo.has(x)))];
    if (sids.length) {
      const owners = (await c.query(`SELECT id, configuration->>'ownerId' o FROM mcp_tools WHERE id = ANY($1)`, [sids])).rows as Array<{ id: string; o: string | null }>;
      for (const sid of sids) { const o = owners.find((x) => x.id === sid); ownerMemo.set(sid, o ? (o.o ? o.o : null) : undefined); }
    }
    const u = (await c.query(`SELECT coalesce(e.context->'triggeredBy'->>'id', t.assignee_id) uid FROM agent_executions e JOIN tasks t ON t.id = e."taskId" WHERE e.id = $1`, [row.id])).rows[0]?.uid ?? null;
    const r = compareCapture(pred.rows, actual, { rowOwner: (sid) => (sid ? ownerMemo.get(sid) : undefined), executionUserId: u });
    if (!r.ok) bad++;
    unverifiable += r.unverifiable.length;
    console.log(`${r.ok ? '✅' : '❌'} ${row.id}: predicted ${pred.rows.length}, rows ${actual.length}, missing ${r.missing.length}, extra ${r.extra.length}, store-error excused ${r.storeErrorExcused}, hash mismatches ${r.hashMismatches.length}, declaration mismatches ${r.declarationMismatches.length}, eligibility mismatches ${r.eligibilityMismatches.length}, unverifiable ${r.unverifiable.length}`);
    for (const l of [...r.missing.map((m) => '  missing ' + m), ...r.extra.map((x) => '  extra ' + x), ...r.hashMismatches.map((x) => '  hash ' + x),
      ...r.declarationMismatches.map((x) => '  declaration ' + x), ...r.eligibilityMismatches.map((x) => '  eligibility ' + x),
      ...r.unverifiable.map((x) => '  ' + x), ...r.eligibilityNotes.map((x) => '  · ' + x)]) console.log(l);
  }
  printConfigScope(ids.length);
  if (unverifiable) console.log(`⚪ ${unverifiable} row(s) unverifiable by construction (named above) — not a pass, not a fail`);
  return bad > 0 ? 1 : 0;
}

/** held-network step 3 batch 2b — CORPUS: the SHIPPING Device sources grammar over every network leg (PIPELINE task on a
 *  Device-sources protocol) since HELD_REPLAY_SINCE: states, sources, problems by name. Prints ids and problem names only, never
 *  task text. */
async function deviceSourcesCorpus(c: Client): Promise<number> {
  const rows = (await c.query(`SELECT id, title, metadata, description, ("inputContext" -> 'interfaceContract') AS contract
                                 FROM tasks WHERE type = 'PIPELINE' AND created_at >= $1 ORDER BY created_at`, [SINCE])).rows as
    Array<{ id: string; title: string | null; metadata: unknown; description: string | null; contract: unknown }>;
  const legs = rows.filter((r) => isDeviceSourceLeg(r));
  const by: Record<string, number> = {};
  const governs: Record<string, number> = {};
  const odd: string[] = [];
  for (const l of legs) {
    // push 2 (O-2): what GOVERNS capture (the first-execution snapshot) beside what the live text declares
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    const g = governingDeviceSources({ description: l.description, contract: l.contract, snapshot: meta.deviceSourcesSnapshot ?? null });
    governs[g.state] = (governs[g.state] ?? 0) + 1;
    if (g.state === 'snapshot-changed' || g.state === 'snapshot-unreadable') odd.push(`${l.id} governing ${g.state}`);
    const r = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(l.contract), taskBody: l.description });
    const k = r.state === 'parsed' ? `parsed (${r.source}, ${new Set(r.entries.map((e) => e.device)).size} devices, kinds ${[...new Set(r.entries.map((e) => e.kind))].sort().join('+')})`
      : r.state === 'unparseable' ? `unparseable (${r.source}: ${r.problem})` : r.state;
    by[k] = (by[k] ?? 0) + 1;
    if (r.state === 'unparseable' || r.state === 'conflict') odd.push(`${l.id} ${r.state}${r.state === 'unparseable' ? ` ${r.problem} line ${r.lineIndex}` : ''}`);
    // the protocol's own heading appearing without a parse is the case to read by hand
    if (r.state === 'absent' && /Device sources/i.test(l.description ?? '')) odd.push(`${l.id} absent-but-mentions-heading`);
  }
  console.log(`══ DEVICE SOURCES CORPUS (shipping grammar v1) — network legs created >= ${SINCE}: ${legs.length} (of ${rows.length} PIPELINE tasks)`);
  for (const [k, n] of Object.entries(by).sort()) console.log(`  ${n}\t${k}`);
  console.log(`  governing declaration (the snapshot, push 2): ${JSON.stringify(governs)}`);
  for (const o of odd) console.log(`  READ BY HAND: ${o}`);
  return 0;
}

/** held-network step 3 batch 2b — CORPUS: the device lane + the two Harvester facts over every stored network Harvester that called
 *  the device lane's getter. Per execution: predicted device-lane rows by outcome, deviceSourceReads, gitDeviceComparison. */
async function deviceLaneCorpus(c: Client): Promise<number> {
  const rows = (await c.query(
    `SELECT e.id, e."taskId", t.pov_id AS "povId", e.status, e."supersededById", a.content, t.type AS "taskType", t.title AS "taskTitle", t.metadata AS "taskMetadata"
       FROM agent_artifacts a JOIN agent_executions e ON e.id = a."executionId" JOIN tasks t ON t.id = e."taskId"
      WHERE a.name = 'result.json' AND a.content LIKE '{%' AND a."createdAt" >= $1 AND (a.content LIKE '%fetch_data%' OR a.content LIKE '%get_file_contents%') AND t."agentRole" ~* 'harvest'
      ORDER BY a."createdAt"`, [SINCE])).rows as Row[];
  const totals: Record<string, number> = {};
  let n = 0;
  for (const row of rows) {
    const src = await deviceSourcesOf(c, row);
    if (!src) continue;
    n++;
    const tc = toolCallsOf(row.content) ?? [];
    // CAPTURE-REPLAY-DEVICE-SCOPE-GATE (2026-11-21): the capture half takes the device scope only where production's capture does
    // (`heldCaptureTakesDeviceScope`), and the force half only where production's carrier does (`carrierAppliesDeviceForce`, asked
    // of the leg row). The two device FACTS below read the declaration on every lane, as the nets do.
    const leg = await legOf(c, row);
    const takesScope = DEVICE_SCOPE_GATE_OFF || heldCaptureTakesDeviceScope(leg);
    const legRow = (leg.kind === 'leg' || leg.kind === 'self')
      ? ((await c.query('SELECT title, metadata FROM tasks WHERE id = $1', [leg.legId])).rows[0] as { title: string | null; metadata: unknown } | undefined) : undefined;
    const forceApplies = DEVICE_SCOPE_GATE_OFF || (!!legRow && carrierAppliesDeviceForce(legRow));
    const scope = takesScope ? buildDeviceReadScope(src, tc) : undefined;
    const ex = extractDeclaredFiles(tc, undefined, { gitFileSourceLeg: true, ...(scope ? { deviceRead: scope } : {}) });
    const lane = [...ex.files.filter((f) => f.target.startsWith('device:')).map(() => 'held'),
      ...ex.refusals.filter((r) => r.refusal.startsWith('device-') || r.sourceTool === 'fetch_data').map((r) => r.refusal)];
    const counts: Record<string, number> = {};
    for (const o of lane) { counts[o] = (counts[o] ?? 0) + 1; totals[o] = (totals[o] ?? 0) + 1; }
    totals.notAConfigRead = (totals.notAConfigRead ?? 0) + ex.stats.notAConfigRead;
    // push 2: what CAPTURE holds after the one-base-per-device rule, and what the O-4 force would read from those refs
    const cap = scope ? withDeviceEvidenceOnly(ex, scope) : ex;
    const bases = cap.files.map((f) => (f.target.startsWith('device:') ? f.target : `git ${f.path}`));
    const evidenceOnly = cap.refusals.filter((r) => r.refusal === 'device-read-evidence-only').length;
    const force = forceApplies ? deviceReadForce(src, cap.files.map((f) => ({ target: f.target, path: f.path }))) : null;
    if (!takesScope) totals['no device scope (production gate)'] = (totals['no device scope (production gate)'] ?? 0) + 1;
    totals['evidence-only'] = (totals['evidence-only'] ?? 0) + evidenceOnly;
    if (force) totals[`O-4 ${force.reason}`] = (totals[`O-4 ${force.reason}`] ?? 0) + 1;
    // push 3 (D-1): the carrier's reason over what the replay can see — source-not-pinned (a capture refusal) beats the device force;
    // stage-rebind / author-not-of-leg need the write and the Author, so they are not predicted here.
    const notPinned = cap.refusals.some((r) => r.refusal === 'source-not-pinned');
    const carrier = notPinned ? 'source-not-pinned' : force ? force.reason : 'none';
    totals[`carrier ${carrier}`] = (totals[`carrier ${carrier}`] ?? 0) + 1;
    const reads = computeDeviceSourceReads(src, tc) as Record<string, any>;
    const cmp = computeGitDeviceComparison(src, tc) as Record<string, any>;
    const cmpText = cmp.checked ? (cmp.devices as Array<Record<string, any>>).map((d) => `${d.device}:${d.state}${d.state === 'compared' ? ` diff ${d.differencesTotal} devOnly ${d.deviceOnlyLines}` : ''}`).join(', ') : cmp.reason;
    if (process.env.HELD_REPLAY_VERBOSE === '1' && cmp.checked) {
      for (const d of cmp.devices as Array<Record<string, any>>) for (const x of d.differences ?? []) console.log(`    ${d.device} ${x.kind}: ${x.line} | git ${JSON.stringify(x.gitParents)}${x.deviceParents ? ` | device ${JSON.stringify(x.deviceParents)}` : ''}`);
    }
    console.log(`${row.id} decl ${src.state}${src.state === 'parsed' ? `/${src.source}` : ''}${ASSUME_SNAPSHOT ? ' (assumed snapshot)' : ''}${takesScope ? '' : ' · NO device scope (heldCaptureTakesDeviceScope)'}${forceApplies ? '' : ' · NO device force (carrierAppliesDeviceForce)'} · lane ${JSON.stringify(counts)} notAConfigRead ${ex.stats.notAConfigRead} · reads ${reads.checked ? `notRead ${reads.notRead} undeclared ${reads.undeclaredDeviceConfigReads}` : reads.reason} · comparison ${cmpText} · held bases [${bases.join(', ')}] evidence-only ${evidenceOnly} · O-4 ${force ? `${force.reason}${force.gitFileDevicesNotHeld ? ` git[${force.gitFileDevicesNotHeld.join(',')}]` : ''}${force.devicesNotHeld ? ` read[${force.devicesNotHeld.join(',')}]` : ''}` : 'none'} · carrier ${carrier}`);
  }
  console.log(`══ DEVICE LANE CORPUS — network Harvesters with a fetch_data or get_file_contents call, created >= ${SINCE}: ${n} (of ${rows.length} candidate rows)`);
  console.log(`  totals: ${JSON.stringify(totals)}`);
  return 0;
}

// ── Config sources STEP 3 P0 (W19): the Config-lane corpus ────────────────────────────────────────────────────────────────────────
const sha16 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);
/** JSON with object keys sorted at every level — two values are "equal key for key" when their canonical texts are equal. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}
/** A Prisma client over the SAME read-only URL, for production's own leg-child selector (`selectLegHarvesterHeldBytes` takes a Prisma
 *  client; its selection rule is not copied here). One connection, and the same write probe as `connect()`: only SQLSTATE 25006
 *  counts as refused. */
async function prismaReadOnly(): Promise<{ client: unknown; close: () => Promise<void> }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  const url = process.env.DATABASE_URL as string;
  const p = new PrismaClient({ datasources: { db: { url: url + (url.includes('?') ? '&' : '?') + 'connection_limit=1' } }, log: [] });
  try { await p.$executeRawUnsafe('CREATE TEMP TABLE _held_ro_probe2(x int)'); throw new Error('ABORT: a write was NOT refused on the Prisma connection — the session is not read-only'); }
  catch (e) {
    const err = e as { message?: string; code?: string; meta?: { code?: string } };
    if (String(err.message).startsWith('ABORT')) { await p.$disconnect().catch(() => undefined); throw e; }
    if (err.meta?.code !== '25006' && !/25006/.test(String(err.message))) {
      await p.$disconnect().catch(() => undefined);
      throw new Error(`ABORT: the Prisma write probe failed with ${err.meta?.code ?? err.code ?? '?'}, not 25006 — read-only not proven`);
    }
  }
  return { client: p, close: () => p.$disconnect() };
}

interface LegRow { id: string; type?: string | null; title: string | null; metadata: unknown; description: string | null; contract: unknown; createdAt: Date | string }
type Gov = LegConfigSourcesResolution;
const govText = (g: Gov): string => g.state === 'could-not-check' ? `could-not-check(${g.reason})` : g.state === 'unparseable' ? `unparseable(${g.source}:${g.problem})` : g.state;
/** Two labels of one declaration naming the same Git file (owner/repo folded, path exact — production's `isFileOfGitLine`). */
function labelCollisions(r: Gov | LegConfigSources): number {
  if (r.state !== 'parsed') return 0;
  // ONE definition (review, architectural F3): production's `configLabelCollisions` — Git files AND platform (target, path) pairs.
  // A base tree from before STEP 3 P2 has no such export (this runner over the base's lib/): there, the Git-only count below.
  const lib = (configScopeModule as unknown as { configLabelCollisions?: (x: unknown) => unknown[] }).configLabelCollisions;
  if (typeof lib === 'function') return lib(r).length;
  const g = declaredGitFiles(r as LegConfigSources); let n = 0;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    if (isFileOfGitLine({ target: `github:${g[j].owner}:${g[j].repo}`, path: `/${g[j].path}` }, g[i])) n++;
  }
  return n;
}
/** The forms of a path the UNPINNED gate judges — PRODUCTION's function (`unpinnedPathForms`: decoding until stable, NFKC, zero-width
 *  and control characters dropped, `.` / `..` resolved, trailing `?` `#` `;` cut; STEP 3 P1 review fix). On a base tree from before it,
 *  the two-round decode this tool used to carry. */
function pathForms(raw: string): string[] {
  if (typeof gitPin.unpinnedPathForms === 'function') return gitPin.unpinnedPathForms(raw).forms;
  const forms = [raw]; let cur = raw;
  for (let i = 0; i < 2 && cur.includes('%'); i++) {
    try { const next = decodeURIComponent(cur); if (next === cur) break; forms.push(next); cur = next; } catch { break; }
  }
  return forms;
}
/** STEP 3 P1: the key-named never-held class (htpasswd, key material) — PRODUCTION's predicate (`keyNamedPathRefusal`,
 *  git-file-source-pin.js); the measurement copy this tool carried in P0 is deleted. `null` when the tree's pin module has no such
 *  function (a base tree from before P1, in a base-against-new pass). */
function keyNamedName(path: string): string | null {
  if (typeof gitPin.keyNamedPathRefusal !== 'function') return null;
  for (const f of pathForms(path)) { const r = gitPin.keyNamedPathRefusal(f.replace(/^\/+/, '').replace(/^(\.\/)+/, '')); if (r) return r; }
  return null;
}
const extOf = (path: string): string => { const n = path.split('/').pop() ?? ''; const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i) : '(no extension)'; };

async function configLaneCorpus(c: Client): Promise<number> {
  const heldTables = (await c.query(`SELECT (to_regclass('public.held_file_refs') IS NOT NULL AND to_regclass('public.held_capture_refusals') IS NOT NULL) AS ok`)).rows[0].ok === true;
  const dbName = (await c.query('SELECT current_database() AS d')).rows[0].d as string;
  const rows = (await c.query(`SELECT id, title, metadata, description, ("inputContext" -> 'interfaceContract') AS contract, created_at AS "createdAt"
                                 FROM tasks WHERE type = 'PIPELINE' ORDER BY created_at, id`)).rows as LegRow[];
  const prisma = await prismaReadOnly();
  const noDb = { task: { findUnique: async () => null }, stage: { findUnique: async () => null } };
  const awaiting = [...CONFIG_SOURCE_AWAITING_TEXT];
  const tableProtocols = Object.keys(CONFIG_SOURCE_LANES);
  const NONE: readonly string[] = [];   // the awaiting list of "every table row's text has shipped"
  const stops: string[] = [];
  const count = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1; };

  /** The governing declaration of a leg: production's reader (`readLegConfigSources`) over a REAL read-only adapter, so the SELECT
   *  that runs is production's own — a column the reader gains is fetched, never silently missing (review F2). The adapter is typed
   *  to the reader's `Db` (a `Prisma.Sql` in, rows out); nothing on this path is cast `as never`. One PK read per (leg, state). */
  const readerDb = { $queryRaw: async <T = unknown>(q: Prisma.Sql): Promise<T> => (await c.query(q.text, q.values as unknown[])).rows as unknown as T };
  // STEP 3 P2 (plan A7): the governing state now depends on the awaiting list (a snapshot on a leg whose row awaits its text governs
  // as `snapshot-text-reverted`), so each state passes ITS list. A base tree from before P2 ignores the third argument.
  const governing = (res: OwningLegResolution, aw?: readonly string[]): Promise<Gov> =>
    (readLegConfigSources as unknown as (db: typeof readerDb, r: OwningLegResolution, a?: readonly string[]) => Promise<Gov>)(readerDb, res, aw);
  /** The Config force (production's `configGitFileForce`) for a governing declaration. A declaration that is not `parsed` forces by
   *  its own name with no refs; a `parsed` one needs the CAPTURE refs of the leg's authoritative Harvester — the stored rows where the
   *  held tables exist, and the shipping capture's prediction over that Harvester's stored result.json everywhere. */
  const forceOf = async (l: LegRow, res: OwningLegResolution, gov: Gov, applies: boolean): Promise<{ text: string; forced: boolean }> => {
    if (gov.state === 'not-config-source-leg') return { text: 'none', forced: false };
    if (!applies) return { text: 'none (carrier not applied to this leg)', forced: false };
    if (gov.state !== 'parsed') { const f = configGitFileForce(gov, []); return { text: f ? f.reason : 'none', forced: !!f }; }
    const stageId = ((l.metadata ?? {}) as Record<string, unknown>).pipelineStageId;
    let execId: string | null = null; let selState = '?';
    try { const sel = await selectLegHarvesterHeldBytes(prisma.client as never, stageId); selState = sel.state; execId = ('executionId' in sel && sel.executionId) ? sel.executionId : null; }
    catch (e) { return { text: `could-not-read (the Harvester selection threw: ${(e as Error).name})`, forced: true }; }
    const reasonOf = (refs: ReadonlyArray<{ target?: string; path?: string }>) => { const f = configGitFileForce(gov, refs) as (ReturnType<typeof configGitFileForce> & { serviceFilesNotHeldTotal?: number }) | null;
      return f ? `${f.reason}${f.gitFilesNotHeldTotal ? `[${f.gitFilesNotHeldTotal}]` : ''}${f.serviceFilesNotHeldTotal ? `[service ${f.serviceFilesNotHeldTotal}]` : ''}` : 'none'; };
    if (!execId) { const t = reasonOf([]); return { text: `${t} (no Harvester execution: ${selState})`, forced: t !== 'none' }; }
    let predicted = 'not-predicted';
    const hr = (await loadHarvesters(c, [execId]))[0];
    if (hr) {
      const tc = toolCallsOf(hr.content);
      // the LEG's resolution in THIS state and its governing declaration, through production's one helper (plan W1)
      const sc = captureScopesOfLeg(res, gov);
      const plan = tc ? prepareHeldCapture({ toolCallResults: tc, task: { id: hr.taskId, povId: hr.povId }, gitFileSourceLeg: sc.gitFileSourceLeg, logger: silent,
        heldTable: heldTables ? await storedHeldTable(c, hr.id) : null, live: false,
        ...(sc.configSources ? { configSources: sc.configSources, configSourceProtocol: sc.configSourceProtocol } : {}) }) : null;
      predicted = reasonOf((plan?.files ?? []).map((f) => ({ target: f.target, path: f.path })));
    }
    if (!heldTables) return { text: `predicted:${predicted}`, forced: predicted !== 'none' };
    const stored = reasonOf((await c.query(`SELECT target, path FROM held_file_refs WHERE "executionId" = $1 AND kind = 'CAPTURE'`, [execId])).rows);
    return { text: `stored:${stored} predicted:${predicted}`, forced: stored !== 'none' };
  };

  const byProtocol: Record<string, number> = {};
  const contractKeys: Record<string, number> = {};
  const obs = { total: 0, bySource: {} as Record<string, number>, snapshotKey: 0, heading: 0, contractKey: 0, newest: '', today: {} as Record<string, number>, joined: {} as Record<string, number>,
    forcedToday: 0, forcedJoined: 0, undeclared: 0, ids: [] as string[] };
  const table: Record<string, { legs: number; today: Record<string, number>; joined: Record<string, number>; live: Record<string, number>; forceToday: Record<string, number>; forceJoined: Record<string, number>; collisions: number }> = {};
  const lines: string[] = [];
  let statesDiffer = 0;
  for (const l of rows) {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    const tp = resolveTaskProtocol(l);
    const p = tp.protocol ? canonicalProtocolName(tp.protocol) : null;
    count(byProtocol, `${p ?? '(none)'} [${tp.source}]`);
    const cs = l.contract && typeof l.contract === 'object' && !Array.isArray(l.contract) ? (l.contract as Record<string, unknown>).configSources : undefined;
    const csKeys = cs && typeof cs === 'object' && !Array.isArray(cs) ? Object.keys(cs as object).sort() : cs === undefined || cs === null ? null : ['(not an object)'];
    if (csKeys) count(contractKeys, csKeys.join('+') || '(empty)');
    const isObs = p === HELD_OBS_PROTOCOL || p === HELD_VARIANT_PROTOCOL;
    const inTable = !!p && tableProtocols.includes(p);
    const snapshotKey = meta.configSourcesSnapshot !== undefined && meta.configSourcesSnapshot !== null;
    const heading = /(^|\n)[ \t]*#+[ \t]*Config sources/i.test(l.description ?? ''); // ROUGH text match, not the parser (database lane query A)
    if (!(isObs || inTable || snapshotKey || heading || csKeys)) continue;

    // AS SHIPPED and ALL ROWS SHIPPED: production's classifier and production's carrier gate, asked with the awaiting list as it is
    // in this tree and with an EMPTY one (the defaulted parameter of plan W5 — no hand-built resolution since STEP 3 P1). On a base
    // tree from before P1 the parameter is ignored, so the two states are the same there.
    const task = { id: l.id, type: 'PIPELINE', title: l.title, metadata: l.metadata };
    const resToday = await resolveOwningLegProtocol(noDb as never, task);
    const resJoined = await resolveOwningLegProtocol(noDb as never, task, NONE);
    const govToday = await governing(resToday);
    // never reused from the as-shipped read: since P2 the SAME resolution can govern differently in the two states (A7)
    const govJoined = await governing(resJoined, NONE);
    const heldCapable = isHeldCapableLeg(l);
    const appliesToday = heldCapable && carrierAppliesConfigForce(l);
    const appliesJoined = heldCapable && carrierAppliesConfigForce(l, NONE);
    const fToday = await forceOf(l, resToday, govToday, appliesToday);
    const fJoined = (canon(govToday) === canon(govJoined) && appliesToday === appliesJoined && canon(resToday) === canon(resJoined)) ? fToday : await forceOf(l, resJoined, govJoined, appliesJoined);
    if (govText(govToday) !== govText(govJoined) || fToday.text !== fJoined.text) statesDiffer++;
    const live = inTable && p ? resolveLegConfigSources({ protocol: p, contractValue: contractConfigSourcesValue(l.contract, CONFIG_SOURCE_LANES[p].contractKey), taskBody: l.description }) : null;
    const collToday = labelCollisions(govToday);
    const collJoined = labelCollisions(govJoined) + (live ? labelCollisions(live) : 0);

    if (isObs) {
      obs.total++; obs.ids.push(l.id); count(obs.bySource, `${p} [${tp.source}]`);
      if (snapshotKey) obs.snapshotKey++;
      if (heading) obs.heading++;
      if (csKeys && csKeys.some((k) => k.startsWith('observability-config'))) obs.contractKey++;
      const ca = new Date(l.createdAt).toISOString(); if (ca > obs.newest) obs.newest = ca;
      count(obs.today, govText(govToday)); count(obs.joined, govText(govJoined));
      if (fToday.forced) obs.forcedToday++;
      if (fJoined.forced) obs.forcedJoined++;
      // THE STANDING RULE (true before and after the join): an observability leg that declares NOTHING — no snapshot, and no live
      // block where its protocol has a row — reads `not-config-source-leg` and takes no force, in BOTH states.
      const undeclared = !snapshotKey && (live === null || live.state === 'absent') && !heading
        && !(csKeys && csKeys.some((k) => k.startsWith('observability-config')));
      if (undeclared) {
        obs.undeclared++;
        for (const [which, g, f] of [['as shipped', govToday, fToday], ['all rows shipped', govJoined, fJoined]] as Array<[string, Gov, { text: string; forced: boolean }]>) {
          if (g.state !== 'not-config-source-leg') stops.push(`observability leg ${l.id} declares nothing, yet reads ${govText(g)} (${which}) — not not-config-source-leg`);
          if (f.forced) stops.push(`observability leg ${l.id} declares nothing, yet would be forced (${which}): ${f.text}`);
        }
      }
      // While the observability row AWAITS its text (and before it had a row), NO stored leg may be declared in any way.
      if (!tableProtocols.includes(HELD_OBS_PROTOCOL) || awaiting.includes(HELD_OBS_PROTOCOL)) {
        // STEP 3 P2 (A7): the one state such a leg can read here is `snapshot-text-reverted` (it carries a snapshot object) — still a
        // stop: no stored observability leg may be declared, or forced, while the row awaits its text.
        if (govToday.state !== 'not-config-source-leg') stops.push(`observability leg ${l.id} reads ${govText(govToday)} as shipped while its protocol declares no Config sources yet${govToday.state === 'snapshot-text-reverted' ? ' — it would hold nothing and be forced config-sources-snapshot-text-reverted' : ''}`);
        if (snapshotKey) stops.push(`observability leg ${l.id} carries a configSourcesSnapshot key before its protocol's text shipped`);
        if (!undeclared) stops.push(`observability leg ${l.id} carries a block, a heading or a contract key before its protocol's text shipped (plan §9.4 population B) — read by hand`);
      }
    }
    if (inTable && p) {
      const t = (table[p] ??= { legs: 0, today: {}, joined: {}, live: {}, forceToday: {}, forceJoined: {}, collisions: 0 });
      t.legs++; count(t.today, govText(govToday)); count(t.joined, govText(govJoined)); if (live) count(t.live, govText(live));
      count(t.forceToday, fToday.text.replace(/\[\d+\]/g, '')); count(t.forceJoined, fJoined.text.replace(/\[\d+\]/g, '')); t.collisions += collToday + collJoined;
    }
    if (collToday + collJoined) lines.push(`READ BY HAND: ${l.id} label collisions ${collToday + collJoined}`);
    // TWO lines per leg. `leg …` carries ONLY the as-shipped state — it is what `--config-lane-base` compares, and a lane row added
    // ahead of its text must not move it. `all-shipped …` carries the other state and the live declaration; it is NOT compared (a
    // base tree from before the row prints something else there by design) — the exit code carries its rule instead.
    lines.push(`leg ${l.id} ${p ?? '(none)'} [${tp.source}] as-shipped ${govText(govToday)} snapshot ${snapshotKey ? 'present' : 'absent'}`
      + ` heading ${heading ? 'yes' : 'no'} contractKeys ${csKeys ? csKeys.join('+') || '(empty)' : '-'} heldCapable ${heldCapable ? 'yes' : 'no'} force ${fToday.text} collisions ${collToday}`);
    lines.push(`all-shipped ${l.id} ${govText(govJoined)} live ${live ? govText(live) : '-'} force ${fJoined.text} collisions ${collJoined}`);
  }

  console.log(`# --config-lane: ${rows.length} PIPELINE tasks read (every one, no date bound) from database ${dbName}; held tables ${heldTables ? 'present' : 'ABSENT (would-force is from the predicted capture; query C not run)'}`);
  console.log(`# awaiting list (CONFIG_SOURCE_AWAITING_TEXT) in this tree: ${JSON.stringify(awaiting)}; table (CONFIG_SOURCE_LANES): ${JSON.stringify(tableProtocols)}`);
  for (const l of lines) console.log(l);
  console.log('══ CONFIG LANE CORPUS ══');
  console.log(`  PIPELINE tasks by protocol [source]: ${JSON.stringify(Object.fromEntries(Object.entries(byProtocol).sort()))}`);
  console.log(`  contracts carrying configSources, by key set: ${JSON.stringify(Object.fromEntries(Object.entries(contractKeys).sort()))} (total ${Object.values(contractKeys).reduce((a, b) => a + b, 0)})`);
  // The same key sets over EVERY task type (a leg's children carry the contract too) — the number the plan's baseline quotes.
  const allCs = (await c.query(`SELECT type::text AS type, ("inputContext" -> 'interfaceContract' -> 'configSources') AS cs FROM tasks
                                 WHERE jsonb_typeof("inputContext" -> 'interfaceContract' -> 'configSources') IS NOT NULL
                                   AND jsonb_typeof("inputContext" -> 'interfaceContract' -> 'configSources') <> 'null'`)).rows as Array<{ type: string; cs: unknown }>;
  const allKeys: Record<string, number> = {}; const allTypes: Record<string, number> = {}; let obsKeyAnyTask = 0;
  for (const r of allCs) {
    const ks = r.cs && typeof r.cs === 'object' && !Array.isArray(r.cs) ? Object.keys(r.cs as object).sort() : ['(not an object)'];
    count(allKeys, ks.join('+') || '(empty)'); count(allTypes, r.type);
    if (ks.some((k) => k.startsWith('observability-config'))) obsKeyAnyTask++;
  }
  console.log(`  … over every task type: ${JSON.stringify(Object.fromEntries(Object.entries(allKeys).sort()))} (total ${allCs.length}, by type ${JSON.stringify(allTypes)}); with an observability key: ${obsKeyAnyTask}`);
  const obsAwaitingOrAbsent = !tableProtocols.includes(HELD_OBS_PROTOCOL) || awaiting.includes(HELD_OBS_PROTOCOL);
  if (obsKeyAnyTask && obsAwaitingOrAbsent) stops.push(`${obsKeyAnyTask} stored contract(s) carry an observability key under configSources before the protocol's text shipped`);
  console.log(`  OBSERVABILITY legs: ${obs.total} ${JSON.stringify(obs.bySource)}; newest created ${obs.newest || '-'}`);
  console.log(`    snapshot key present ${obs.snapshotKey}; "Config sources" heading in the description (rough text match) ${obs.heading}; an observability key under configSources ${obs.contractKey}; declaring nothing ${obs.undeclared}`);
  console.log(`    governing, as shipped: ${JSON.stringify(obs.today)}; all rows shipped: ${JSON.stringify(obs.joined)}; would-force as shipped ${obs.forcedToday}, all rows shipped ${obs.forcedJoined}`);
  for (const [p, t] of Object.entries(table).sort()) {
    console.log(`  ${p}: ${t.legs} legs`);
    console.log(`    governing, as shipped: ${JSON.stringify(t.today)}; all rows shipped: ${JSON.stringify(t.joined)}; live declaration: ${JSON.stringify(t.live)}`);
    console.log(`    Config force, as shipped: ${JSON.stringify(t.forceToday)}; all rows shipped: ${JSON.stringify(t.forceJoined)}; label collisions ${t.collisions}`);
  }

  // Every stored snapshot, read back through production's reader and compared key for key (any task type — a snapshot off a PIPELINE task is named).
  const snaps = (await c.query(`SELECT id, type::text AS type, title, metadata, description, ("inputContext" -> 'interfaceContract') AS contract, created_at AS "createdAt"
                                  FROM tasks WHERE jsonb_typeof(metadata -> 'configSourcesSnapshot') IS NOT NULL ORDER BY created_at, id`)).rows as LegRow[];
  const snapGroups: Record<string, number> = {}; let equal = 0; let takenDiffers = 0; let keyNamedHits = 0; let governing2 = 0; let unstamped = 0;
  for (const l of snaps) {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    const raw = meta.configSourcesSnapshot as Record<string, unknown>;
    const rb = readConfigSourcesSnapshot(meta);
    const res = (raw && typeof raw === 'object' ? raw.resolution : null) as Record<string, unknown> | null;
    const state = String(res?.state ?? '?'); const grammar = String(res?.grammarVersion ?? '?'); const proto = String(raw?.protocol ?? '?');
    const entries = Array.isArray(res?.entries) ? (res!.entries as Array<Record<string, unknown>>) : [];
    const readback = rb === null ? 'ABSENT' : rb === 'unreadable' ? 'UNREADABLE' : canon(rb) === canon(raw) ? 'equal' : 'DIFFERS';
    if (readback === 'equal') equal++; else stops.push(`snapshot on ${l.id} reads back ${readback}`);
    const sameStamp = raw?.takenAt === meta.protocolResolvedAt; if (!sameStamp) takenDiffers++;
    const stamped = typeof meta.protocol === 'string'; if (!stamped) unstamped++;   // A9: a snapshot governs only on a stamped leg
    const paths = entries.filter((e) => e.kind === 'git-file' && typeof e.path === 'string').map((e) => {
      const refusal = gitPin.heldPathRefusal(e.path as string); const keyNamed = keyNamedName(e.path as string); if (keyNamed) keyNamedHits++;
      return `${extOf(e.path as string)}:${refusal ?? 'none'}`; });
    const task = { id: l.id, type: 'PIPELINE', title: l.title, metadata: l.metadata };
    const resToday = await resolveOwningLegProtocol(noDb as never, task);
    const resJoined = await resolveOwningLegProtocol(noDb as never, task, NONE);
    count(snapGroups, `${proto} ${state} grammar ${grammar}`);
    if (l.type !== 'PIPELINE') stops.push(`snapshot on ${l.id}, a ${l.type} task (not a leg)`);
    // Review F1: a stored snapshot can read back equal and still STOP GOVERNING — the reader answers `snapshot-changed` when the
    // leg's live text no longer resolves to it (a grammar change, a new never-held name), `snapshot-unreadable`, and so on. Where
    // the leg's protocol declares Config sources in a state, the governing declaration must be the snapshot's OWN stored state, and
    // a parsed one must govern with the stored entries. Anything else is the plan's stop "a stored snapshot changing state or an entry".
    const govA = await governing(resToday); const govB = await governing(resJoined, NONE);
    let governs = 0; let asked = 0;
    for (const [which, r, g] of [['as shipped', resToday, govA], ['all rows shipped', resJoined, govB]] as Array<[string, OwningLegResolution, Gov]>) {
      const declares = (r.kind === 'self' || r.kind === 'leg') && !!r.configSourceProtocol;
      if (!declares) continue;   // the leg's protocol declares nothing in this state (a row awaiting its text): the snapshot is not asked
      asked++;
      const sameState = g.state === state;
      const sameEntries = g.state !== 'parsed' || canon(g.entries) === canon(res?.entries ?? null);
      if (sameState && sameEntries) governs++;
      else if (g.state === 'snapshot-text-reverted') stops.push(`snapshot on ${l.id} is on a leg whose protocol text is NOT LIVE (${which}): it governs as snapshot-text-reverted — capture holds nothing on that leg and the carrier forces config-sources-snapshot-text-reverted (plan §13 A7; read by hand)`);
      else stops.push(`snapshot on ${l.id} no longer governs (${which}): stored state ${state}, governing ${govText(g)}${sameState ? ' with different entries' : ''}`);
    }
    if (asked > 0 && governs === asked) governing2++;
    // Review fix (architectural F4): a snapshot on a leg whose protocol has NO Config lane in either state is governed by nothing —
    // it is not "fine", it is a snapshot the platform would never have taken there. A stop, so the pass cannot print "N of N equal"
    // beside a smaller governing count and still exit 0.
    if (asked === 0) stops.push(`snapshot on ${l.id}: its leg's protocol (${resolveTaskProtocol(l).protocol ?? 'none'}) has no Config lane in either state — nothing governs it`);
    console.log(`snapshot ${l.id} ${l.type} ${proto} state ${state} grammar ${grammar} entries ${entries.length} kinds ${[...new Set(entries.map((e) => String(e.kind)))].sort().join('+') || '-'} readback ${readback} canon ${sha16(canon(raw))}`
      + ` takenAt=protocolResolvedAt ${sameStamp ? 'yes' : 'NO'} stamped ${stamped ? 'yes' : 'NO'} governing ${govText(govA)} gitPaths(ext:heldPathRefusal) [${paths.join(', ')}]`);
    console.log(`all-shipped-snapshot ${l.id} governing ${govText(govB)}`);
  }
  console.log(`  STORED SNAPSHOTS: ${snaps.length} ${JSON.stringify(Object.fromEntries(Object.entries(snapGroups).sort()))}; read back equal key for key: ${equal} of ${snaps.length}; governing with their stored state and entries in every state that asks them: ${governing2} of ${snaps.length}; on a leg with no protocol stamp: ${unstamped}; takenAt differs from protocolResolvedAt: ${takenDiffers}; declared Git paths the key-named never-held class refuses: ${keyNamedHits}`);

  let gitTied = 0;
  if (heldTables) {
    // The database lane's query C: what a copy without the held tables cannot show. Leg ids come from production's protocol ladder above.
    const refs = (await c.query(`SELECT r.kind, r."serviceName" AS sn, coalesce(r."sourceTool", '') AS tool, split_part(coalesce(r.target, ''), ':', 1) AS tgt, count(*)::int AS n
                                   FROM held_file_refs r WHERE r."legTaskId" = ANY($1) GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`, [obs.ids])).rows as Array<{ kind: string; sn: string; tool: string; tgt: string; n: number }>;
    const git = refs.filter((r) => r.tgt === 'github' || r.tool === gitPin.GIT_FILE_READ_TOOL || /github/i.test(r.sn));
    console.log(`  QUERY C — held rows on observability legs: ${refs.map((r) => `${r.kind} ${r.sn}${r.tool ? `/${r.tool}` : ''}${r.tgt ? ` target ${r.tgt}:…` : ''} ×${r.n}`).join('; ') || 'none'}`);
    gitTied = git.reduce((a, r) => a + r.n, 0);
    console.log(`  QUERY C — held rows tying an observability leg to the Git service: ${gitTied}`);
    if (git.length && obsAwaitingOrAbsent) stops.push(`${gitTied} held row(s) tie an observability leg to the Git service before the protocol's text shipped`);
    const refusals = (await c.query(`SELECT r.refusal, coalesce(r."serviceName", '') AS sn, count(*)::int AS n
                                       FROM held_capture_refusals r JOIN agent_executions e ON e.id = r."executionId" JOIN tasks ct ON ct.id = e."taskId" LEFT JOIN stages s ON s.id = ct.stage_id
                                      WHERE (CASE WHEN ct.type::text = 'PIPELINE' THEN ct.id ELSE s.metadata ->> 'harnessTaskId' END) = ANY($1)
                                      GROUP BY 1, 2 ORDER BY 3 DESC, 1, 2`, [obs.ids])).rows as Array<{ refusal: string; sn: string; n: number }>;
    console.log(`  QUERY C — capture refusals by name on observability legs: ${refusals.map((r) => `${r.refusal}${r.sn ? ` (${r.sn})` : ''} ×${r.n}`).join('; ') || 'none'}`);
  }
  await prisma.close();

  if (awaiting.length === 0 && statesDiffer > 0) { console.log(`\n⛔ TOOL DEFECT: the awaiting list is empty, yet ${statesDiffer} leg(s) read differently in the two states`); return 2; }
  if (rows.length === 0) { console.log('\n⚪ ABSENCE: 0 PIPELINE tasks read. Not a pass.'); return 3; }
  if (stops.length) { console.log('\n⛔ STOP:'); for (const x of stops) console.log('  - ' + x); return 1; }
  // What this pass proves depends on where the observability row is — say it (review F5; the meaning changed at STEP 3 P1).
  const obsInTable = tableProtocols.includes(HELD_OBS_PROTOCOL);
  const dataLine = `the stored DATA: ${obs.snapshotKey} snapshot keys on ${obs.total} observability legs, ${obs.contractKey} observability keys under configSources (${obsKeyAnyTask} over every task type), ${heldTables ? `${gitTied} held rows tying an observability leg to the Git service` : 'held tables absent (the Git-tie count was not read)'}, ${equal} of ${snaps.length} snapshots readable and ${governing2} of ${snaps.length} governing`;
  if (!obsInTable) {
    console.log(`\n⚠️  observability is NOT in CONFIG_SOURCE_LANES in this tree, so "not-config-source-leg in both states, 0 would-force" is TRUE BY CONSTRUCTION for the ${obs.total} observability legs — it proves nothing about a lane rule.`);
    console.log(`   What this pass DOES prove is ${dataLine}.`);
  } else if (awaiting.includes(HELD_OBS_PROTOCOL)) {
    console.log(`\nℹ️  observability is in CONFIG_SOURCE_LANES and AWAITS its text. The two states mean different things for it:`);
    console.log(`   AS SHIPPED — "not-config-source-leg, 0 would-force" is TRUE BY CONSTRUCTION (an awaiting row gives a leg no Config lane). It proves the row is inert, nothing about the rule.`);
    console.log(`   ALL ROWS SHIPPED — the per-leg rule ("no snapshot and no block ⇒ not-config-source-leg") decided each of the ${table[HELD_OBS_PROTOCOL]?.legs ?? 0} legs of the row's protocol (the other ${obs.total - (table[HELD_OBS_PROTOCOL]?.legs ?? 0)} carry the retired held-variant name, which has no row): ${JSON.stringify(obs.joined)}, would-force ${obs.forcedJoined}. THIS is the proof of the runs-undeclared rule on stored legs.`);
    console.log(`   And ${dataLine}.`);
  } else {
    console.log(`\nℹ️  observability's text has shipped (the row is not awaiting): the two states are the same. ${obs.undeclared} of ${obs.total} observability legs declare nothing and read not-config-source-leg with no force; the other ${obs.total - obs.undeclared} are declared legs, judged like any Config-sources leg.`);
  }
  console.log(`\n✅ every observability leg that declares nothing (${obs.undeclared} of ${obs.total}) reads not-config-source-leg in both states, 0 would-force${obsInTable ? '' : ' (by construction — see the warning)'}; ${equal} of ${snaps.length} stored snapshots read back equal key for key and ${governing2} of ${snaps.length} govern with their stored state and entries`);
  return 0;
}

// ── STEP3 plan §7: the two production counts (read-only; counts and names only — never a credential, an endpoint or a file's text) ──
function walk(v: unknown, f: (o: Record<string, unknown>) => void, strings?: (s: string) => void): void {
  if (typeof v === 'string') { strings?.(v); return; }
  if (Array.isArray(v)) { for (const x of v) walk(x, f, strings); return; }
  if (v && typeof v === 'object') { f(v as Record<string, unknown>); for (const x of Object.values(v as object)) walk(x, f, strings); }
}
async function fileReadCounts(c: Client): Promise<number> {
  const T = gitPin.GIT_FILE_READ_TOOL;
  const dbName = (await c.query('SELECT current_database() AS d')).rows[0].d as string;
  // (a) registry rows exposing the Git file-read tool. `credentials` and the rest of `configuration` are never selected.
  const tools = (await c.query(`SELECT id, name, status::text AS status, capabilities, (configuration ->> 'ownerId') AS owner, "heldFiles" AS "heldFiles",
                                       (capabilities::text LIKE '%' || $1 || '%') AS mentions FROM mcp_tools ORDER BY name`, [T])).rows as
    Array<{ id: string; name: string; status: string; capabilities: unknown; owner: string | null; heldFiles: unknown; mentions: boolean }>;
  const pinOf = (r: { name: string; owner: string | null; heldFiles: unknown }) => gitPin.gitPinForRow({ name: r.name, configuration: r.owner ? { ownerId: r.owner } : {}, heldFiles: r.heldFiles });
  const exposes = (cap: unknown): boolean => {
    const t = cap && typeof cap === 'object' && !Array.isArray(cap) ? (cap as Record<string, unknown>).tools : null;
    return Array.isArray(t) && t.some((x) => x === T || (x && typeof x === 'object' && (x as Record<string, unknown>).name === T));
  };
  const exposing = tools.filter((r) => exposes(r.capabilities));
  const mentionOnly = tools.filter((r) => r.mentions && !exposes(r.capabilities));
  console.log(`# --file-read-counts: database ${dbName}; the Git file-read tool is ${T}`);
  console.log(`══ (a) registry rows exposing ${T}: ${exposing.length} of ${tools.length} rows`);
  let pinned = 0;
  for (const r of exposing) {
    const pin = pinOf(r); if (pin) pinned++;
    console.log(`  ${r.name} [${r.status}] ${r.owner ? 'owned (a registrant row)' : 'ownerless (a platform row)'} — ${pin ? `PINNED to ${pin.owner}/${pin.repo} refs ${JSON.stringify(pin.refs)}${r.owner ? '' : ` (a platform row's repo is read from THIS shell's GIT_FILE_SOURCE_PIN ${process.env.GIT_FILE_SOURCE_PIN ? 'env (SET here)' : 'default (env unset here)'}, not from production's environment)`}` : 'UNPINNED'}`);
  }
  console.log(`  pinned ${pinned}; unpinned ${exposing.length - pinned}; rows whose capabilities name the tool in some other shape (read by hand): ${mentionOnly.length}${mentionOnly.length ? ' ' + mentionOnly.map((r) => r.name).join(', ') : ''}`);

  // (b) stored workflows whose steps read a key-named file through an unpinned file service.
  const byName = new Map(tools.map((r) => [r.name, r])); const byId = new Map(tools.map((r) => [r.id, r]));
  const wfs = (await c.query(`SELECT id, name, status::text AS status, steps, "executionCount" AS runs FROM mcp_workflows ORDER BY name`)).rows as
    Array<{ id: string; name: string; status: string; steps: unknown; runs: number }>;
  const byStatus: Record<string, number> = {};
  let withRead = 0; let mention = 0; let literal = 0; let templated = 0; let noPath = 0; let onPinned = 0; let onUnpinned = 0; let onUnknown = 0; let keyNamed = 0; let todayRefused = 0; let wide = 0;
  const hits: string[] = [];
  for (const w of wfs) {
    byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
    if (JSON.stringify(w.steps ?? null).includes(T)) mention++;
    let hasRead = false; let wfKey = false; let wfWide = false;
    walk(w.steps, (o) => {
      if (!Object.values(o).some((x) => x === T)) return; // an object that names the tool = a file-read step, whatever its field names
      hasRead = true;
      const svc = [o.service, o.targetService, o.serviceName, o.service_name, o.serviceId, (o.arguments as Record<string, unknown> | undefined)?.targetService].find((x) => typeof x === 'string') as string | undefined;
      const row = svc ? (byName.get(svc) ?? byId.get(svc)) : undefined;
      const pin = row ? pinOf(row) : null;
      if (!row) onUnknown++; else if (pin) onPinned++; else onUnpinned++;
      const cands = [o.arguments, o.params, o.parameters, (o.arguments as Record<string, unknown> | undefined)?.arguments].filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
      const path = cands.map((a) => a.path).find((x) => typeof x === 'string') as string | undefined;
      if (path === undefined) { noPath++; return; }
      if (/\{\{|\$\{|\$[A-Za-z_]/.test(path)) { templated++; return; }
      literal++;
      if (pathForms(path).some((f) => gitPin.heldPathRefusal(f.replace(/^\/+/, '').replace(/^(\.\/)+/, '')))) todayRefused++;
      const prop = keyNamedName(path);
      if (prop && !pin) { wfKey = true; hits.push(`${w.name} [${w.status}, ${w.runs} runs] step on ${svc ?? '(no service named)'} (${row ? 'UNPINNED' : 'unknown service'}) reads a ${prop} name (${extOf(path)})`); }
    }, (str) => { if (str.length <= 1024 && keyNamedName(str)) wfWide = true; });
    if (hasRead) withRead++;
    if (wfKey) keyNamed++;
    if (wfWide) wide++;
  }
  console.log(`══ (b) stored workflows: ${wfs.length} ${JSON.stringify(byStatus)}`);
  console.log(`  workflows with a ${T} step: ${withRead} (workflows whose steps name the tool anywhere in their text: ${mention})`);
  console.log(`  those steps by service: pinned ${onPinned} (production refuses a Git file source as a workflow step), unpinned ${onUnpinned}, a service not in the registry ${onUnknown}`);
  console.log(`  those steps by path: literal ${literal}, templated (NOT judged) ${templated}, no path argument ${noPath}; literal paths today's heldPathRefusal already refuses: ${todayRefused}`);
  console.log(`  workflows whose steps read a key-named file (the key-named never-held class) through an unpinned file service: ${keyNamed}`);
  for (const h of hits) console.log(`    ${h}`);
  console.log(`  wide net — workflows with ANY string, in any step field, whose last path segment is a key-named never-held name: ${wide}`);
  const hist = (await c.query(`SELECT count(*)::int AS n FROM mcp_workflow_executions WHERE steps::text LIKE '%' || $1 || '%' OR input::text LIKE '%' || $1 || '%'`, [T])).rows[0].n as number;
  console.log(`  context (history, not a stored workflow): workflow executions whose recorded steps or input name ${T}: ${hist}`);
  // (c) STEP 3 P1 (plan §7, W18): what the never-held predicate of THIS tree would refuse among what production has STORED. The
  // key-named class applies at capture on every lane, so a stored held file with such a name is a file the next run would not hold.
  let cHits = 0;
  const heldTables = (await c.query(`SELECT (to_regclass('public.held_file_refs') IS NOT NULL AND to_regclass('public.held_capture_refusals') IS NOT NULL AND to_regclass('public.held_blobs') IS NOT NULL) AS ok`)).rows[0].ok === true;
  if (!heldTables) console.log('══ (c) stored held paths against the never-held predicate: NOT MEASURED (no held tables in this database)');
  else {
    const refPaths = (await c.query(`SELECT kind, coalesce(path, '') AS path, count(*)::int AS n FROM held_file_refs GROUP BY 1, 2`)).rows as Array<{ kind: string; path: string; n: number }>;
    const refHits: Record<string, number> = {}; let refRows = 0; let refKeyNamed = 0;
    for (const r of refPaths) {
      refRows += r.n;
      const all = r.path ? (pathForms(r.path).map((f) => gitPin.heldPathRefusal(f.replace(/^\/+/, ''))).find((x) => x) ?? null) : null;
      if (all) { refHits[`${r.kind} ${all} (${extOf(r.path)})`] = (refHits[`${r.kind} ${all} (${extOf(r.path)})`] ?? 0) + r.n; cHits += r.n; }
      if (r.path && keyNamedName(r.path)) refKeyNamed += r.n;
    }
    console.log(`══ (c) stored held paths against the never-held predicate of this tree`);
    console.log(`  held_file_refs: ${refRows} rows over ${refPaths.length} distinct (kind, path); rows whose path the predicate refuses: ${Object.values(refHits).reduce((a, b) => a + b, 0)} ${JSON.stringify(refHits)}; of those the key-named class: ${refKeyNamed}`);
    const refuPaths = (await c.query(`SELECT refusal, coalesce(path, '') AS path, count(*)::int AS n FROM held_capture_refusals WHERE path IS NOT NULL GROUP BY 1, 2`)).rows as Array<{ refusal: string; path: string; n: number }>;
    const moved: Record<string, number> = {}; let refuRows = 0;
    for (const r of refuPaths) {
      refuRows += r.n;
      const now = pathForms(r.path).map((f) => gitPin.heldPathRefusal(f.replace(/^\/+/, ''))).find((x) => x) ?? null;
      if (now && now !== r.refusal) moved[`${r.refusal} → ${now} (${extOf(r.path)})`] = (moved[`${r.refusal} → ${now} (${extOf(r.path)})`] ?? 0) + r.n;
    }
    const movedN = Object.values(moved).reduce((a, b) => a + b, 0); cHits += movedN;
    console.log(`  held_capture_refusals with a path: ${refuRows} rows; rows this predicate would now refuse under ANOTHER name: ${movedN} ${JSON.stringify(moved)}`);
    // A private-key block in a held file's text (capture refuses it whole from P1). Held blobs are R10 OUTPUT, and R10 keeps a
    // block's BEGIN / END marker lines and redacts only its body — so a held file that HAD a block still carries the marker, and this
    // count is every stored held file that capture would now refuse by content.
    const pk = (await c.query(`SELECT count(*)::int AS n FROM held_blobs WHERE position(convert_to('PRIVATE KEY-----', 'UTF8') IN content) > 0`)).rows[0].n as number;
    cHits += pk;
    console.log(`  held_blobs whose stored text still carries a private-key block marker: ${pk} (R10 keeps the marker lines of a redacted block, so this is every stored held file that had one)`);
    const snaps = (await c.query(`SELECT metadata -> 'configSourcesSnapshot' -> 'resolution' -> 'entries' AS entries FROM tasks WHERE jsonb_typeof(metadata -> 'configSourcesSnapshot') IS NOT NULL`)).rows as Array<{ entries: unknown }>;
    let declared = 0; let declaredHits = 0;
    for (const r of snaps) for (const e of (Array.isArray(r.entries) ? r.entries : []) as Array<Record<string, unknown>>) {
      if (e.kind !== 'git-file' || typeof e.path !== 'string') continue;
      declared++; if (pathForms(e.path).some((f) => gitPin.heldPathRefusal(f))) declaredHits++;
    }
    cHits += declaredHits;
    console.log(`  declared Git paths in stored snapshots: ${declared}; refused by the predicate: ${declaredHits}`);
  }
  // (d) the CALL-GATE half: stored tool calls of the file-read tool whose `path` argument the predicate refuses — a call a run made
  // before P1 that the gate would refuse now. Every result.json that names the tool is read (no date bound); the path is taken from
  // the recorded call arguments, never from a file's text.
  const arts = (await c.query(`SELECT a."executionId" AS id, a.content FROM agent_artifacts a WHERE a.name = 'result.json' AND a.content LIKE '{%' AND a.content LIKE '%' || $1 || '%'`, [T])).rows as Array<{ id: string; content: string }>;
  let calls = 0; const dHits: Record<string, number> = {}; const dExecs = new Set<string>();
  for (const a of arts) {
    const tc = toolCallsOf(a.content) ?? [];
    for (const r of tc) {
      const rr = r as Record<string, unknown>; const args = rr.arguments as Record<string, unknown> | undefined;
      if (rr.tool !== 'services' || !args || args.tool !== T) continue;
      let inner = args.arguments as unknown;
      if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch { inner = null; } }
      const pathArg = inner && typeof inner === 'object' ? (inner as Record<string, unknown>).path : undefined;
      if (pathArg === undefined || pathArg === null) continue;
      calls++;
      // PRODUCTION's unpinned gate function, asked as for an agent run (the strictest caller): every form of the path, both classes,
      // and a path that cannot be judged (a malformed escape, not a string). On a base tree without it, the name predicate.
      const path = typeof pathArg === 'string' ? pathArg : '(not a string)';
      const now = typeof gitPin.unpinnedFileReadPathRefusal === 'function'
        ? (gitPin.unpinnedFileReadPathRefusal(T, { path: pathArg }, { keyNames: true })?.pathRefusal ?? null)
        : (typeof pathArg === 'string' ? (pathForms(pathArg).map((f) => gitPin.heldPathRefusal(f.replace(/^\/+/, '').replace(/^(\.\/)+/, ''))).find((x) => x) ?? null) : null);
      if (now) { dHits[`${now} (${extOf(path)})${rr.success === false ? ' [the stored call failed]' : ''}`] = (dHits[`${now} (${extOf(path)})${rr.success === false ? ' [the stored call failed]' : ''}`] ?? 0) + 1; dExecs.add(a.id); }
    }
  }
  console.log(`══ (d) stored ${T} calls against the never-held predicate of this tree`);
  console.log(`  result.json artifacts naming the tool: ${arts.length}; calls with a path argument: ${calls}; calls whose path the predicate refuses: ${Object.values(dHits).reduce((x, y) => x + y, 0)} ${JSON.stringify(dHits)} in ${dExecs.size} execution(s)`);
  console.log(`\nCOUNT (a) = ${exposing.length} (pinned ${pinned}, unpinned ${exposing.length - pinned}) · COUNT (b) = ${keyNamed} · COUNT (c) = ${heldTables ? cHits : 'not measured'} · COUNT (d) = ${Object.values(dHits).reduce((x, y) => x + y, 0)}`);
  return heldTables && cHits > 0 ? 1 : 0;
}

async function checkHeld(c: Client): Promise<number> {
  const r = await c.query(`SELECT scope, sha256, content FROM held_blobs
                            WHERE octet_length(content) > 40 AND position('\\x5c6e'::bytea IN content) > 0`);
  let hits = 0;
  for (const row of r.rows as Array<{ content: Buffer }>) {
    const B = row.content.toString('utf8');
    const deep = (redactSecretsDeep({ l: B }).value as { l: unknown }).l;
    if (countPlaceholders(typeof deep === 'string' ? deep : B) > countPlaceholders(B)) hits++;
  }
  console.log(`candidates ${r.rowCount} hits ${hits}`);
  return hits > 0 ? 1 : 0;
}

(async () => {
  const args = process.argv.slice(2);
  let c: Client | null = null;
  try {
    c = await connect();
    let rc: number;
    if (args[0] === '--predict') rc = await predict(c, args.slice(1));
    else if (args[0] === '--compare') rc = await compare(c, args.slice(1));
    else if (args[0] === '--compare-all') {
      const ids = (await c.query(`SELECT "executionId" id FROM held_file_refs WHERE kind = 'CAPTURE'
                                  UNION SELECT "executionId" FROM held_capture_refusals`)).rows.map((r) => r.id as string);
      console.log(`# --compare-all: ${ids.length} executions with a CAPTURE ref or a capture refusal`);
      rc = ids.length ? await compare(c, ids) : 0;
    }
    else if (args[0] === '--check-held') rc = await checkHeld(c);
    else if (args[0] === '--device-sources') rc = await deviceSourcesCorpus(c);
    else if (args[0] === '--device-lane') rc = await deviceLaneCorpus(c);
    else if (args[0] === '--config-lane') rc = await configLaneCorpus(c);
    else if (args[0] === '--file-read-counts') rc = await fileReadCounts(c);
    else if (args[0] !== undefined) { console.error(`❌ unknown mode ${args[0]}`); rc = 2; }
    else rc = await archive(c);
    await c.end();
    process.exit(rc);
  } catch (e) {
    if (args[0] === '--check-held') { console.log('UNMEASURED'); process.exit(2); }
    console.error('❌ replay failed:', e instanceof Error ? e.message : e);
    if (c) await c.end().catch(() => undefined);
    process.exit(2);
  }
})();
