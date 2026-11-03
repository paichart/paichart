/**
 * PLATFORM-HELD-BYTES — the platform default descriptor table (Stage A WI-3, 2026-10-14).
 *
 * A descriptor says which part of a (service, tool) result is a FILE, and where that file lives (P3 §6.1). This table
 * covers the public reference rigs only (`declaredBy: 'platform-default'`); customer-registered descriptors are Stage B
 * (OA-12, keyed by registry id).
 *
 * CLOSED-WORLD per service (panel arch S1 / BC-A2): every tool the `observability-readonly` rig exposes has an entry, and
 * the non-file tools carry `notAFile` (a deliberate exclusion, P3 §6.1). So a (service, tool) pair absent from this
 * table on a SUCCESSFUL call is a fact worth recording (`not-declared`: the rig grew a tool) — not noise.
 * test-held-bytes-capture pins the tool set against the rig source.
 *
 * ORDER IS LOAD-BEARING (panel EF S-1): FILE_DESCRIPTOR_TOOLS is derived in table order and must stay
 * ['get_ingress_config', 'get_otel_config'] — the strict quote scorer (scripts/leg-replay-lab/score-quote.ts:89) builds
 * its per-tool map in RECORDED_FILE_TOOLS order (which spreads this list) and the last pairable tool wins.
 *
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-3. Contract: P3-SERVICE-CONTRACT.md §6.
 */

// A typed require, relative, on purpose: this table loads in scripts run without tsconfig-paths (arch Build 1 M2) AND under the
// deploy's protocol seed config (prisma/tsconfig.seed.json: no allowJs), where an `import` of this plain-JS module fails TS7016
// and aborts the deploy (2026-11-03, release_20261103_053050 — aborted pre-flip, old release stayed live).
const { PLATFORM_GIT_TARGET } = require('../../../mcp/server/config/git-file-source-pin') as { PLATFORM_GIT_TARGET: string };

export const DESCRIPTOR_VERSION = 1;

/** A value source: a constant, a template over the selected key (`{key}`), a named argument of the call, or (held-k8s,
 *  2026-10-18) the PATH parsed from the served resource URI of a pinned Git file source (`{ uri: 'path' }` — '/' + the URI's
 *  `/contents/<path>` tail; the argument path must agree, else `source-not-pinned`). */
export type ValueSource = { const: string } | { template: string } | { argument: string } | { uri: 'path' };

export interface FileSpec {
  /** Closed dotted grammar from the tool result root (`data.result`): `seg ('.' seg)* ('.*')?` where a seg is a key `name`
   *  or (held-k8s) `name[field=literal]` — the ONE element of the array `name` whose `field` equals `literal` (0 ⇒ see
   *  `directoryWhenNone`, ≥ 2 ⇒ `descriptor-mismatch {ambiguous}`). A bracketed seg never combines with a trailing `.*`.
   *  e.g. `structuredContent.yaml`, `structuredContent.files.*`, `content[type=resource].resource.text`. */
  select: string;
  target: ValueSource;
  path: ValueSource;
  /** held-k8s: the Git file-source pin applies (lib/mcp/server/config/git-file-source-pin.js, keyed by the service NAME):
   *  arguments + served URI checked, `sourceRevision` taken from the URI. */
  gitPin?: true | { owner: string; repo: string; ref?: string };
  /** held-k8s (SYNTHESIS v3 R4): when the bracketed selector matches NO element and `content[0].text` parses as a JSON
   *  ARRAY, the call was a directory listing — NO row, a stats count; MI-13 🔴 9/10 carry the same named exemption. */
  directoryWhenNone?: 'content0-json-array';
  /** held-network step 3 batch 2b (P4): the star-bound key NAMES A DEVICE — held only when the leg's Device sources declare that
   *  device `device-read` for the call's service (device-read-scope.ts); and a call in which NO member carries the tail is not a
   *  config read (no row — a stats count), never a `descriptor-mismatch`. Only on the device-read lane. */
  deviceKey?: true;
}

export interface Descriptor {
  descriptorVersion: number;
  service: string;
  tool: string;
  files?: readonly FileSpec[];
  notAFile?: string;
  /** held-k8s (SYNTHESIS v3 §6.2 1b-scope): capture ONLY when the owning leg's protocol is a Git-file-source protocol
   *  (`GIT_FILE_SOURCE_PROTOCOLS`, held-bytes/variant.ts) — any other execution calling the service holds nothing. */
  legScope?: 'git-file-source' | 'device-read';
  /** WI-B10 (2026-10-23): a REGISTRANT entry, built at capture from the immutable held_declarations snapshot the call was stamped
   *  with. Matched on the resolved serviceId + sha (never the name); for that service it REPLACES the defaults as a whole. */
  declaredBy?: 'registrant';
  serviceId?: string;
  declarationSha256?: string;
  /** WI-B10: tools the registrant declared notAFile — calls to them hold nothing and count nothing. */
  notAFileTools?: readonly string[];
}

const RIG = 'observability-readonly';
/** held-k8s (2026-10-18): the read-only GitHub MCP held-file source (services/github-service). Platform-registered. */
export const GITHUB_FILE_SOURCE = 'github-service';
const NOT_A_FILE_READ = 'read-only inspection data, not a configuration file the operator writes';

/** Deep-frozen (code review CR-N5): the entries and their `files` arrays too, so "frozen at descriptorVersion 1" holds. */
const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') { for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v); Object.freeze(o); }
  return o;
};

export const PLATFORM_DEFAULT_DESCRIPTORS: readonly Descriptor[] = deepFreeze([
  {
    descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'get_ingress_config',
    files: [{ select: 'structuredContent.files.*', target: { const: 'obs-ingress' }, path: { template: '/etc/nginx/conf.d/{key}' } }],
  },
  {
    descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'get_otel_config',
    files: [{ select: 'structuredContent.yaml', target: { const: 'obs-otelcol' }, path: { const: '/etc/otelcol/config.yaml' } }],
  },
  // held-k8s step 1b (SYNTHESIS v3 §6): the GitHub file source. Its own entry version (1) — the GLOBAL DESCRIPTOR_VERSION is
  // unchanged, so observability refs and refusals keep their bytes. Closed world: the server runs `--tools get_file_contents`.
  {
    descriptorVersion: 1, service: GITHUB_FILE_SOURCE, tool: 'get_file_contents', legScope: 'git-file-source',
    files: [{ select: 'content[type=resource].resource.text', target: { const: PLATFORM_GIT_TARGET },
      path: { uri: 'path' }, gitPin: true, directoryWhenNone: 'content0-json-array' }],
  },
  { descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'get_prometheus_config',
    notAFile: 'API rendering of the running config, not the file the operator writes (BC N2)' },
  { descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'stack_health', notAFile: NOT_A_FILE_READ },
  { descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'get_scrape_targets', notAFile: NOT_A_FILE_READ },
  { descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'get_rules', notAFile: NOT_A_FILE_READ },
  { descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'query_metric', notAFile: NOT_A_FILE_READ },
  { descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'get_grafana_datasources', notAFile: NOT_A_FILE_READ },
  { descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'list_grafana_dashboards', notAFile: NOT_A_FILE_READ },
  { descriptorVersion: DESCRIPTOR_VERSION, service: RIG, tool: 'get_grafana_dashboard', notAFile: NOT_A_FILE_READ },
] as Descriptor[]);

/**
 * held-network step 3 batch 2b (P4 / S3-B, S3-D, 2026-10-26) — the DEVICE-READ lane: the platform default for a device service's
 * STRUCTURED config getter. A SEPARATE table on purpose: it is keyed by DECLARATION, not by service name, so it never enters the
 * name-keyed lookups of PLATFORM_DEFAULT_DESCRIPTORS (and none of that table's pins — MI-13's declared pairs, the registrant
 * reserved names, the quoteFidelity file lanes — move). It applies ONLY on a Device-sources leg (variant.ts
 * DEVICE_SOURCE_PROTOCOLS), ONLY to a call whose service the leg declares `device-read` (device-read-scope.ts), and ONLY to the
 * hosts (devices) declared for that service. A service with a REGISTRANT declaration uses that instead (WI-B10: it replaces the
 * defaults as a whole).
 *
 * The shape is the one measured on stored production and lab records (2026-10-26, 58 distinct calls in the lab snapshot cache):
 * `structuredContent.hosts.<device>.output.config.{running,startup,candidate}` — the structured getter's `config` output, one or
 * several hosts per call, possibly BUNDLED with other getters in the same call (their output sits beside `config` and is ignored).
 * Never the CLI-text tool's output (`show_commands`): a rendering of a command, not the running configuration the getter returns.
 * Target `device:<host>` (the device a base belongs to; `device:` is a namespace no other entry writes), path `/running-config`.
 */
export const DEVICE_READ_SERVICE = '(the service a Device sources line declares device-read)';
export const DEVICE_READ_TARGET_PREFIX = 'device:';
export const DEVICE_READ_PATH = '/running-config';
export const DEVICE_READ_DESCRIPTORS: readonly Descriptor[] = deepFreeze([
  {
    descriptorVersion: 1, service: DEVICE_READ_SERVICE, tool: 'fetch_data', legScope: 'device-read',
    files: [{ select: 'structuredContent.hosts.*.output.config.running', target: { template: 'device:{key}' },
      path: { const: '/running-config' }, deviceKey: true }],
  },
] as Descriptor[]);

/**
 * held-network step 3 push 2 (P8 / S3-E, sec-ops step-2 N-2) — the DECLARED-GIT-LINE lane: an UNPINNED customer Git service on a
 * Device-sources leg. A service the leg declares `git-file` for (and which has no name-keyed platform entry — the platform Git file
 * source keeps its pin — and no registrant declaration — a registrant's own `gitPin` keeps its pin) is read with the same shape the
 * platform Git file source declares (a `get_file_contents` resource item; the served URI yields the path and the commit). The PIN is
 * the declared LINE: the call's owner / repo / path (and the line's ref, when it names one) must equal ONE declared line for that
 * service, and the served URI must agree — else nothing is held (`git-file-not-declared`, the field named). Declaration-keyed, so
 * none of PLATFORM_DEFAULT_DESCRIPTORS' pins move.
 * ⚠️ mcp-hub push-2 NOTE 6: only `tool` and `select` are read (extract.ts extractGitLine). `target` / `path` / `gitPin` below are
 * DOCUMENTATION of what the lane produces — the target and path come from the matched LINE, the pin is the line — never take
 * `gitPin: true` here at face value in a loop over descriptor tables.
 */
export const GIT_LINE_DESCRIPTORS: readonly Descriptor[] = deepFreeze([
  {
    descriptorVersion: 1, service: '(the service a Device sources line declares git-file)', tool: 'get_file_contents', legScope: 'git-file-source',
    files: [{ select: 'content[type=resource].resource.text', target: { template: 'github:{key}' }, path: { uri: 'path' }, gitPin: true,
      directoryWhenNone: 'content0-json-array' }],
  },
] as Descriptor[]);

/** Tools whose entry declares files, in TABLE order (see the ORDER note above). OBSERVABILITY RIG ONLY (held-k8s, SYNTHESIS v3
 *  1e / AE S-7): this tool-LEAF list feeds the lab's order-pinned scorer and the quoteFidelity lane; the GitHub entry joins the
 *  lane through the service-keyed lane source (1e), never through this leaf list. */
export const FILE_DESCRIPTOR_TOOLS: readonly string[] = Object.freeze(
  PLATFORM_DEFAULT_DESCRIPTORS.filter((d) => d.service === RIG && !d.notAFile).map((d) => d.tool),
);

/** Does this service carry any descriptor at all? (No ⇒ its calls are not a file lane and record nothing.) */
export function serviceHasDescriptors(serviceName: string, table: readonly Descriptor[] = PLATFORM_DEFAULT_DESCRIPTORS): boolean {
  return table.some((d) => d.service === serviceName);
}

/** The descriptor for one (service, tool) pair — keyed on BOTH — or undefined when the pair is absent from the table. */
export function findDescriptor(
  serviceName: string, tool: string, table: readonly Descriptor[] = PLATFORM_DEFAULT_DESCRIPTORS,
): Descriptor | undefined {
  return table.find((d) => d.service === serviceName && d.tool === tool);
}
