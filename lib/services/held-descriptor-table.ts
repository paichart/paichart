/**
 * WI-B10 (2026-10-23, design §9.1 E + §10 A-1/A-8/A-10/A-11e) — the ONE descriptor table a capture uses: the platform
 * defaults (name-keyed) + REGISTRANT entries built from the immutable `held_declarations` snapshots the calls were STAMPED
 * with at call time (held-eligibility.js — the call handler decided own|platform|foreign and recorded the row's sha).
 *
 *   - Runs as an ASYNC pre-step at BOTH success persists (execution-core, execution-completion-anchored), after endTime and
 *     BEFORE the pure `prepareHeldCapture`, outside the terminal transaction. Reads the records' frozen, non-enumerable
 *     eligibility facts only — never mutates a record, never reads R9 fields.
 *   - Skipped (no query) when capture is off or no call carries an OWN declaration sha (every obs/k8s/terraform run today).
 *   - ONE PK `IN` query with an explicit select. NEVER throws: on a DB error every stamped sha is `unavailable` (the extractor
 *     then writes a named `declaration-unavailable` refusal — never a silent fallback by name) + a `descriptorLookupFailed` stat.
 *   - A snapshot whose grammar fails under its own grammarVersion is `invalid` (named refusal). Guard (2) (tools ∈
 *     capabilities) was checked at registration, where capabilities exist (§10 A-11e).
 * Replay (scripts/replay-held-capture.ts) builds the SAME table through `tableFromDeclarations` from the persisted
 * `declarationSha256` on refs/refusals (legacy records carry no stamp — §10 A-8).
 */
import { DESCRIPTOR_VERSION, PLATFORM_DEFAULT_DESCRIPTORS, type Descriptor, type FileSpec } from '@/lib/agents/harness/held-bytes/descriptors';
import * as heldEligibility from '@/lib/mcp/server/config/held-eligibility';
import { revalidateStoredGrammar } from '@/lib/mcp/server/config/held-file-declaration';

type HeldDeclarationDb = {
  heldDeclaration: { findMany: (args: { where: { sha256: { in: string[] } }; select: { sha256: true; heldFiles: true; grammarVersion: true } }) => Promise<Array<{ sha256: string; heldFiles: unknown; grammarVersion: number }>> };
};

export interface HeldDescriptorTable {
  table: readonly Descriptor[];
  unavailableShas: ReadonlySet<string>;
  invalidShas: ReadonlySet<string>;
  stats: { registrantShas: number; descriptorLookupFailed: number };
}

const DEFAULTS_ONLY: HeldDescriptorTable = Object.freeze({
  table: PLATFORM_DEFAULT_DESCRIPTORS, unavailableShas: new Set<string>(), invalidShas: new Set<string>(),
  stats: { registrantShas: 0, descriptorLookupFailed: 0 },
});

/** Registrant Descriptor entries for one (serviceId, sha) from a stored declaration { files, notAFile }. */
function entriesFor(serviceId: string, sha: string, declaration: { files: Array<Record<string, unknown>>; notAFile?: string[] }): Descriptor[] {
  const byTool = new Map<string, FileSpec[]>();
  for (const f of declaration.files) {
    const spec: FileSpec = {
      select: String(f.select),
      target: f.target as FileSpec['target'],
      path: f.path as FileSpec['path'],
      ...(f.gitPin && typeof f.gitPin === 'object' ? { gitPin: f.gitPin as { owner: string; repo: string; ref?: string } } : {}),
    };
    const t = String(f.tool);
    byTool.set(t, [...(byTool.get(t) ?? []), spec]);
  }
  const notAFileTools = Array.isArray(declaration.notAFile) ? declaration.notAFile.filter((x) => typeof x === 'string') : [];
  return [...byTool.entries()].map(([tool, files]) => ({
    descriptorVersion: DESCRIPTOR_VERSION,
    service: `registrant:${serviceId}`, // never matched by name — registrant entries are matched on serviceId + sha
    tool,
    files,
    ...(files.some((s) => s.gitPin) ? { legScope: 'git-file-source' as const } : {}),
    declaredBy: 'registrant' as const,
    serviceId,
    declarationSha256: sha,
    notAFileTools,
  }));
}

/** Pure: defaults + registrant entries for the given (serviceId → sha) pairs and loaded snapshots. Shared with replay. */
export function tableFromDeclarations(
  pairs: ReadonlyArray<{ serviceId: string; sha: string }>,
  snapshots: ReadonlyArray<{ sha256: string; heldFiles: unknown }>,
): HeldDescriptorTable {
  const bySha = new Map(snapshots.map((s) => [s.sha256, s.heldFiles]));
  const unavailable = new Set<string>(); const invalid = new Set<string>();
  const extra: Descriptor[] = [];
  for (const { serviceId, sha } of pairs) {
    const decl = bySha.get(sha);
    if (decl === undefined) { unavailable.add(sha); continue; }
    if (!revalidateStoredGrammar(decl).ok) { invalid.add(sha); continue; }
    extra.push(...entriesFor(serviceId, sha, decl as { files: Array<Record<string, unknown>>; notAFile?: string[] }));
  }
  return {
    table: Object.freeze([...PLATFORM_DEFAULT_DESCRIPTORS, ...extra]),
    unavailableShas: unavailable, invalidShas: invalid,
    stats: { registrantShas: new Set(pairs.map((p) => p.sha)).size, descriptorLookupFailed: 0 },
  };
}

/** The (serviceId, sha) pairs of HOLDING-eligible (own · granted · install — IF-3) `services` calls stamped with a declaration sha. */
export function stampedDeclarationPairs(records: readonly unknown[] | null | undefined): Array<{ serviceId: string; sha: string }> {
  if (!Array.isArray(records)) return [];
  const seen = new Set<string>(); const out: Array<{ serviceId: string; sha: string }> = [];
  for (const r of records) {
    const f = heldEligibility.fromRecord(r);
    if (!f || !heldEligibility.HOLDS.includes(f.eligibility) || !f.heldFilesSha256) continue; // IF-3: own · granted · install
    const k = `${f.serviceId}\u0000${f.heldFilesSha256}`;
    if (!seen.has(k)) { seen.add(k); out.push({ serviceId: f.serviceId, sha: f.heldFilesSha256 }); }
  }
  return out;
}

/** The async pre-step. Never throws. */
export async function buildHeldDescriptorTable(db: HeldDeclarationDb, records: readonly unknown[] | null | undefined, enabled: boolean): Promise<HeldDescriptorTable> {
  if (!enabled) return DEFAULTS_ONLY;
  const pairs = stampedDeclarationPairs(records);
  if (pairs.length === 0) return DEFAULTS_ONLY;
  const shas = [...new Set(pairs.map((p) => p.sha))];
  try {
    const rows = await db.heldDeclaration.findMany({ where: { sha256: { in: shas } }, select: { sha256: true, heldFiles: true, grammarVersion: true } });
    return tableFromDeclarations(pairs, rows);
  } catch {
    return { table: PLATFORM_DEFAULT_DESCRIPTORS, unavailableShas: new Set(shas), invalidShas: new Set<string>(),
      stats: { registrantShas: shas.length, descriptorLookupFailed: 1 } };
  }
}
