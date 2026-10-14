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

export const DESCRIPTOR_VERSION = 1;

/** A value source: a constant, a template over the selected key (`{key}`), or a named argument of the call. */
export type ValueSource = { const: string } | { template: string } | { argument: string };

export interface FileSpec {
  /** Closed dotted grammar from the tool result root (`data.result`): e.g. `structuredContent.yaml`, or
   *  `structuredContent.files.*` (at most one trailing `.*` over an object's keys). */
  select: string;
  target: ValueSource;
  path: ValueSource;
}

export interface Descriptor {
  descriptorVersion: number;
  service: string;
  tool: string;
  files?: readonly FileSpec[];
  notAFile?: string;
}

const RIG = 'observability-readonly';
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

/** Tools whose entry declares files, in TABLE order (see the ORDER note above). */
export const FILE_DESCRIPTOR_TOOLS: readonly string[] = Object.freeze(
  PLATFORM_DEFAULT_DESCRIPTORS.filter((d) => !d.notAFile).map((d) => d.tool),
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
