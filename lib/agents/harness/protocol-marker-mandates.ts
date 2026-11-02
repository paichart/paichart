/**
 * HS-FU5 (2026-10-31, owner Wave 3): WHICH PROTOCOLS MANDATE MACHINE-PARSED MARKER BLOCKS — the runtime
 * projection of `ProtocolSeed.emitsMarkers` (`scripts/seed-protocol-prompts.ts`).
 *
 * WHY. §6 renders a predecessor's `markerPresence` stamp as a platform fact (`Harvested Allocations ✗ ·
 * Derived Values ✗ · Consumed Values ✗`). On a protocol that asks for none of those blocks, three ✗ are
 * honest and carry no signal: requirements-authoring reviewers spent observations dismissing them (Run 1,
 * Run B), which teaches a population to discount platform facts. EF-M2 (2026-09-26) stopped STAMPING it on
 * `requirements_*` roles; the requirements Harvester is still stamped (its role matches /harvest/), so the
 * Requirements Author's §6 still printed ✗✗✗ (43 entries since EF-M2 in the 2026-10-31 snapshot). This module
 * lets the renderer suppress the line where the active protocol mandates no block.
 *
 * ONE SOURCE OF TRUTH. The DECLARATION lives beside the prose it describes, on the seed's REQUIRED
 * `emitsMarkers` field (decided 2026-09-12, `cline_docs/follow-ups/marker-mandate-source-of-truth-2026-09-12.md`:
 * mandate and declaration edited in one file, one commit). `lib/` cannot import the seed script (it constructs
 * a PrismaClient and reads files at module load, and `scripts/` is outside the app build), so this map is its
 * projection, and `scripts/test-protocol-marker-mandates.ts` pins the two EQUAL in both directions — a protocol
 * added to the seed without a row here, a row here with no seed entry, or any value that differs fails the
 * battery. Never edit a value here without editing the seed (and vice versa); the pin will tell you.
 *
 * FAIL TOWARD RENDERING. A protocol name not in this map (or no bound protocol at all) keeps today's
 * behaviour: the line renders. Suppression needs a KNOWN protocol that DECLARES `'none'`. So an unknown or
 * new protocol can never silently hide a ✗ that is a real gap (the direction the 2026-09-12 ruling feared).
 *
 * DEPRECATED ROWS ARE NOT PROJECTED (they read as unknown ⇒ render). A retired protocol's declaration describes its
 * TOMBSTONE body, not what its legs were told while it was live: `observability-config-held-protocol` declares
 * `'none'` for its tombstone, yet its live body (obs 1.9.0 + held) mandated `## Consumed Values`. Projecting it
 * moved 15 stored obs-held renders and the lab's held-variant arm (HB3); excluding it keeps every infra render
 * byte-identical. A retired row can no longer run (a named binding to a non-ACTIVE row fails loud), so nothing
 * live depends on it.
 */

export type MarkerName = 'Harvested Allocations' | 'Derived Values' | 'Consumed Values';
export type MarkerMandate = 'none' | readonly [MarkerName, ...MarkerName[]];

/** Projection of every NON-DEPRECATED `PROTOCOLS[].emitsMarkers` in `scripts/seed-protocol-prompts.ts`. Pinned equal by test. */
export const PROTOCOL_MARKER_MANDATES: Readonly<Record<string, MarkerMandate>> = Object.freeze({
  'pipeline-orchestrator-protocol': 'none',
  'artifact-synthesis-protocol': 'none',
  'network-provisioning-protocol': ['Harvested Allocations', 'Derived Values', 'Consumed Values'],
  'kubernetes-gitops-protocol': ['Harvested Allocations', 'Derived Values', 'Consumed Values'],
  'terraform-iac-protocol': ['Harvested Allocations', 'Derived Values', 'Consumed Values'],
  'observability-config-protocol': ['Consumed Values'],
  'pov-program-protocol': 'none',
  'network-derivation-protocol': ['Harvested Allocations', 'Derived Values'],
  'requirements-authoring-protocol': 'none',
  'HOWTO-use-pipeline-harness': 'none',
  'HOWTO-use-program-harness': 'none',
  'HOWTO-program-workflow': 'none',
  'HOWTO-run-an-agent': 'none',
  'HOWTO-mcp-tools': 'none',
} as Record<string, MarkerMandate>);

/**
 * The protocol a template binds in NAMED mode — the same parse `execution-system-prompt.ts` applies
 * (`loadProtocols` falsy + `metadata.protocol` a non-empty string ⇒ named). Any other shape (composed,
 * none, a malformed value) returns null, i.e. "not known here", which renders as before.
 */
export function namedProtocolOfTemplate(template: unknown): string | null {
  const md = (template as { metadata?: unknown } | null | undefined)?.metadata;
  if (!md || typeof md !== 'object') return null;
  const { loadProtocols, protocol } = md as { loadProtocols?: unknown; protocol?: unknown };
  if (loadProtocols) return null;
  return typeof protocol === 'string' && protocol.length > 0 ? protocol : null;
}

/** TRUE only when `protocolName` is a KNOWN protocol that declares `'none'`. Unknown/absent ⇒ false. */
export function protocolMandatesNoMarkers(protocolName: string | null | undefined): boolean {
  if (typeof protocolName !== 'string' || !Object.prototype.hasOwnProperty.call(PROTOCOL_MARKER_MANDATES, protocolName)) return false;
  return PROTOCOL_MARKER_MANDATES[protocolName] === 'none';
}
