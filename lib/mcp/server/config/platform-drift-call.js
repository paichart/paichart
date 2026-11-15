/**
 * The platform-initiated drift call (Config sources STEP 2, slice 3b — the HUB half).
 *
 * For a Kubernetes leg the PLATFORM (never an agent) calls the read-only k8s service's `compare_declared_fields` once per held
 * Git file, as the run owner, through the full `services.call` pipeline. `manifest` is the REDACTED held bytes of a YAML
 * manifest. Sec-ops review `REVIEW-sec-ops-STEP2-LAYER1.md` F2 + C4 + C6 + C7 + C8 are the requirements.
 *
 * ONE module owns the names and the single predicate every gate reads, so the gates cannot disagree:
 *   - `mcpService.callEmbeddedTool` sets `toolContext.platformPurpose` ONLY from its `options` (platform code), and only when the
 *     whole call shape matches (`services` + `action: 'call'` + this tool + a string `manifest`). No transport, MCP client or
 *     agent tool loop passes that option; a `platformPurpose` key inside tool ARGUMENTS is never read by anything here.
 *   - the L1 dispatch schema (`dispatch-with-schema.js`), the call gate (`service-call-policy.js`) and the handler's stored /
 *     echoed copies (`service-call-handler.js`) see `{ manifestSha256, manifestLength }` in place of the manifest text.
 *   - the bytes FORWARDED to the service are the manifest, unchanged.
 *
 * The exemption is two conditions, both required: `context.platformPurpose === 'platform-drift'` AND the tool is exactly
 * `compare_declared_fields`. Only the STRING VALUE of the top-level `manifest` argument is left out of a scan. The tool name,
 * every other argument, and `manifest` on any other call are scanned as before. No pattern is loosened.
 * Pinned: `scripts/test-security-invariants.ts` §PD (with negative controls).
 *
 * Plain CommonJS (bare Node + webpack). Requires only `crypto`. Never throws on any input.
 */
'use strict';

const { createHash } = require('crypto');

const PLATFORM_DRIFT_PURPOSE = 'platform-drift';
const PLATFORM_DRIFT_TOOL = 'compare_declared_fields';
const PLATFORM_DRIFT_MANIFEST_ARGUMENT = 'manifest';
/** The service's own limit (`declared_compare.py` MAX_MANIFEST_BYTES) — UTF-8 bytes. The hub refuses above it, by name. */
const PLATFORM_DRIFT_MANIFEST_MAX_BYTES = 262144;
/** Activity.action for a platform-purpose call (DESIGN §1.4). A free String column — no schema change. */
const PLATFORM_DRIFT_ACTIVITY_ACTION = 'PLATFORM_SERVICE_CALL';
/** `_meta.errorType` values of the two named refusals the handler returns as `isError` results. */
const PLATFORM_DRIFT_TOOL_NOT_REGISTERED = 'PLATFORM_DRIFT_TOOL_NOT_REGISTERED';
const PLATFORM_DRIFT_INTERNAL_SERVICE = 'PLATFORM_DRIFT_INTERNAL_SERVICE';
/** sec-ops slice-3b F2: the held bytes are never SENT to a service row the run owner does not own (the rule holding already has). */
const PLATFORM_DRIFT_FOREIGN_SERVICE = 'PLATFORM_DRIFT_FOREIGN_SERVICE';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** BOTH conditions. `context` is the server-built tool context — never tool arguments. */
function isPlatformDriftCall(context, tool) {
  return isPlainObject(context) && context.platformPurpose === PLATFORM_DRIFT_PURPOSE && tool === PLATFORM_DRIFT_TOOL;
}

/** The manifest text when this is the platform drift call and `args.manifest` is an own STRING property; else null. */
function platformDriftManifest(context, tool, args) {
  if (!isPlatformDriftCall(context, tool) || !isPlainObject(args)) return null;
  if (!Object.prototype.hasOwnProperty.call(args, PLATFORM_DRIFT_MANIFEST_ARGUMENT)) return null;
  const m = args[PLATFORM_DRIFT_MANIFEST_ARGUMENT];
  return typeof m === 'string' ? m : null;
}

/** sha256 of the UTF-8 bytes sent, and their count (the same bytes the service hashes as `manifestSha256`). */
function manifestSummary(manifest) {
  const bytes = Buffer.from(String(manifest), 'utf8');
  return { manifestSha256: createHash('sha256').update(bytes).digest('hex'), manifestLength: bytes.length };
}

/**
 * The arguments as every scan, store, log and echo sees them: `manifest` replaced by its summary on the platform drift call;
 * the SAME object, untouched, on every other call.
 */
function withManifestSummarised(context, tool, args) {
  const manifest = platformDriftManifest(context, tool, args);
  if (manifest === null) return args;
  return { ...args, [PLATFORM_DRIFT_MANIFEST_ARGUMENT]: manifestSummary(manifest) };
}

/**
 * For the `services` tool's TOP-LEVEL arguments (`{ action, targetService, tool, arguments }`). Null unless this is
 * `action: 'call'` of the platform drift call with a string manifest. Otherwise:
 *   - `summarised`  — the same arguments with `arguments.manifest` replaced by its summary (what L1 validates, what is logged);
 *   - `restore(d)`  — puts the manifest text back into validated data `d` (what the handler forwards).
 */
function splitServicesCallArguments(args, context) {
  if (!isPlainObject(args) || args.action !== 'call') return null;
  const manifest = platformDriftManifest(context, args.tool, args.arguments);
  if (manifest === null) return null;
  return {
    summarised: { ...args, arguments: withManifestSummarised(context, args.tool, args.arguments) },
    restore(data) {
      if (!isPlainObject(data) || !isPlainObject(data.arguments)) return data;
      return { ...data, arguments: { ...data.arguments, [PLATFORM_DRIFT_MANIFEST_ARGUMENT]: manifest } };
    },
  };
}

module.exports = {
  PLATFORM_DRIFT_PURPOSE,
  PLATFORM_DRIFT_TOOL,
  PLATFORM_DRIFT_MANIFEST_ARGUMENT,
  PLATFORM_DRIFT_MANIFEST_MAX_BYTES,
  PLATFORM_DRIFT_ACTIVITY_ACTION,
  PLATFORM_DRIFT_TOOL_NOT_REGISTERED,
  PLATFORM_DRIFT_INTERNAL_SERVICE,
  PLATFORM_DRIFT_FOREIGN_SERVICE,
  isPlatformDriftCall,
  platformDriftManifest,
  manifestSummary,
  withManifestSummarised,
  splitServicesCallArguments,
};
