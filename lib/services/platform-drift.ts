/**
 * Config sources STEP 2 slice 3b — the PLATFORM's Git-vs-live drift calls for a Kubernetes Harvester (the effect half; the decision
 * of which calls to make is `lib/agents/harness/platform-drift-run.ts`, the fact is `git-live-drift.ts`).
 *
 * Called ONCE by the execution core, after the held capture is planned and before the nets, outside any DB transaction. It runs
 * only on a Harvester leaf of a Config-sources leg whose declaration is `parsed` — so on no leg at all until a protocol's
 * Config-sources text ships (the core passes `sources: null` everywhere else and this returns `undefined` without doing anything).
 *
 * THE CALL (sec-ops Layer-1 review C1–C4, C7, C8; hub half: `lib/mcp/server/config/platform-drift-call.js`): the embedded hub's
 * `services` tool, as the RUN OWNER, with `platformPurpose` set by this code only. The manifest is the held bytes exactly as stored
 * (R10-redacted — never raw) and the marker is the R10 placeholder. One call per held declared file, a bounded timeout, no retry
 * here. The hub stores and echoes the manifest's sha and length, never its text.
 *
 * NEVER THROWS. Every way the call can fail is a named outcome on the record; none is ever a difference.
 */
import { mcpService } from '@/lib/services/mcp/mcpService';
import { gatewayMetaOf } from '@/lib/services/mcp/gateway-meta';
import { PLACEHOLDER, isR10Disabled } from '@/lib/agents/harness/redact-artifact-secrets';
import type { LegConfigSourcesResolution } from '@/lib/agents/harness/config-sources-read';
import type { PlatformDriftCall } from '@/lib/agents/harness/git-live-drift';
import { runPlatformDriftCalls, type DriftCaller, type DriftCallOutcome, type HeldFileForDrift } from '@/lib/agents/harness/platform-drift-run';
import { gitLiveDriftCallsService } from '@/lib/agents/harness/git-live-drift';

import * as hub from '@/lib/mcp/server/config/platform-drift-call';

export const EMBEDDED_HUB_SERVER = 'paichart-embedded-mcp';
export const PLATFORM_DRIFT_CALL_TIMEOUT_MS = 30_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** The hub's `services.call` result ⇒ a named outcome. PURE (exported for its test). `gatewayErrorType` = `gatewayMetaOf(result)?.errorType`. */
export function outcomeOfHubResult(result: unknown, gatewayErrorType?: string | null): DriftCallOutcome {
  if (!isObj(result) || !Array.isArray(result.content)) return { kind: 'failed' };
  const first = result.content[0];
  if (result.isError === true) {
    const text = isObj(first) && typeof first.text === 'string' ? first.text : '';
    if (text.startsWith(`${hub.PLATFORM_DRIFT_TOOL_NOT_REGISTERED}:`) || text.startsWith(`${hub.PLATFORM_DRIFT_INTERNAL_SERVICE}:`)) return { kind: 'no-compare-tool' };
    if (text.startsWith(`${hub.PLATFORM_DRIFT_FOREIGN_SERVICE}:`)) return { kind: 'foreign-service' };
    // A transport failure reached the service (or tried to); everything else the pipeline decided is a refusal.
    return gatewayErrorType === 'SERVICE_CALL_FAILED' ? { kind: 'failed' } : { kind: 'refused' };
  }
  const data = isObj(first) && first.type === 'data' && isObj(first.data) ? first.data : null;
  if (!data || data.success === false) return { kind: 'failed' };
  const svc = isObj(data.result) ? data.result : null;
  if (!svc) return { kind: 'failed' };
  if (svc.isError === true) return { kind: 'tool-refused' };
  // The service's tool result: the structured object when the transport carries one, else the JSON text of its first block.
  if (isObj(svc.structuredContent)) return { kind: 'result', result: svc.structuredContent };
  const block = Array.isArray(svc.content) ? svc.content[0] : null;
  if (isObj(block) && typeof block.text === 'string') {
    try { const parsed = JSON.parse(block.text); return isObj(parsed) ? { kind: 'result', result: parsed } : { kind: 'failed' }; } catch { return { kind: 'failed' }; }
  }
  // A service that returned the object directly (no MCP envelope).
  return typeof svc.method === 'string' ? { kind: 'result', result: svc } : { kind: 'failed' };
}

/** The real caller: one `services.call` through the embedded hub, as the run owner, with the platform purpose. */
export function hubDriftCaller(runOwnerId: string, executionId: string): DriftCaller {
  return async ({ targetService, manifest, redactedMarker }) => {
    const result = await mcpService.callTool(EMBEDDED_HUB_SERVER, 'services', {
      action: 'call', targetService, tool: hub.PLATFORM_DRIFT_TOOL, arguments: { manifest, redactedMarker }, timeout: PLATFORM_DRIFT_CALL_TIMEOUT_MS,
    }, { userId: runOwnerId, sessionId: executionId, platformPurpose: hub.PLATFORM_DRIFT_PURPOSE });
    return outcomeOfHubResult(result, gatewayMetaOf(result)?.errorType ?? null);
  };
}

/**
 * The core's ONE entry. Returns `undefined` when this execution is not a Config-sources Harvester with a parsed declaration (the
 * nets then receive no record at all); otherwise the call record (`[]` when the block keeps no file).
 */
export async function runLegPlatformDrift(input: {
  sources: LegConfigSourcesResolution | null;
  isHarvester: boolean;
  /** sec-ops slice-3b F6: the persisting execution's own protocol is at its Config-sources version — the SAME test the stamps use
   *  (liveEvidenceVersionApplies). False ⇒ nothing would be stamped, so nothing is called. */
  versionApplies: boolean;
  heldFiles: readonly HeldFileForDrift[];
  toolCalls: readonly unknown[];
  runOwnerId: string;
  executionId: string;
  logger: { info?: (o: Record<string, unknown>, m: string) => void; warn: (o: Record<string, unknown>, m: string) => void };
  /** Tests and the lab inject a caller; production passes none. */
  call?: DriftCaller;
  /** STEP 4 D-T1 / STEP 3 P3 (plan W4, sec-ops F-7) — REQUIRED: the owning leg's Config-sources protocol. The platform makes a
   *  SERVICE CALL carrying held bytes only for a protocol whose method row says `by: 'service-call'` (`gitLiveDriftCallsService` —
   *  exactly Kubernetes). No method (Terraform), a method the platform itself computes (observability), or null / empty / unknown
   *  ⇒ no call, no record, no held byte sent anywhere. Before P3 an OMITTED protocol meant "the Kubernetes behaviour"; an omission
   *  is now a compile error, and a null makes no call. */
  protocol: string | null;
}): Promise<PlatformDriftCall[] | undefined> {
  if (!input.isHarvester || !input.versionApplies || !input.sources || input.sources.state !== 'parsed') return undefined;
  if (!gitLiveDriftCallsService(input.protocol)) return undefined;   // THE NO-CALL GUARD (plan W4)
  try {
    const calls = await runPlatformDriftCalls({
      sources: input.sources, heldFiles: input.heldFiles, toolCalls: input.toolCalls, redactedMarker: PLACEHOLDER,
      maxManifestBytes: hub.PLATFORM_DRIFT_MANIFEST_MAX_BYTES,
      // sec-ops slice-3b F4 (C1): with R10 off the held text is RAW — it is never sent to a service.
      blocked: isR10Disabled() ? 'redaction-off' : null,
      call: input.call ?? hubDriftCaller(input.runOwnerId, input.executionId),
    });
    if (!calls) return undefined;
    // Content-free: outcome names and counts only (never a label, path, service or sha).
    const byOutcome: Record<string, number> = {};
    for (const c of calls) byOutcome[c.outcome] = (byOutcome[c.outcome] ?? 0) + 1;
    input.logger.info?.({ executionId: input.executionId, files: calls.length, byOutcome, errorCode: 'PLATFORM_DRIFT_CALLS' }, 'platform drift calls made for a Config-sources Harvester');
    return calls;
  } catch (err) {
    input.logger.warn({ executionId: input.executionId, err: (err as Error)?.message, errorCode: 'PLATFORM_DRIFT_CALLS_FAILED' }, 'platform drift calls could not be planned — no call record');
    return undefined;
  }
}
