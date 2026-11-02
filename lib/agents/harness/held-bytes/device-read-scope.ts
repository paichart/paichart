/**
 * held-network step 3 batch 2b (P3 / S3-A) — which (service, device) pairs a capture may hold a DEVICE configuration for.
 *
 * Built from the leg's declared Device sources (device-sources.ts, read by device-sources-read.ts) and the execution's own tool
 * records, PURE. A device configuration is held only when the call's service is a service the block declares `device-read` for
 * that device:
 *   - a service declared BY NAME matches the call's RESOLVED service name (the gateway envelope's `data.targetService` — the row
 *     name, never the caller's spelling);
 *   - a service declared BY DESCRIPTOR URL matches the service THIS execution registered from exactly that URL (a successful
 *     `registry register` with `descriptorUrl` equal to the declared string; its result names the row id and name). Registered
 *     elsewhere, or not at all ⇒ that declaration resolves to nothing, and is named (`unresolvedServices`) — never guessed.
 * Anything short of a parsed declaration holds nothing on the device lane: `refuse` with the named reason.
 */
import type { LegDeviceSourcesResolution } from '../device-sources-read';

export type DeviceReadRefusal = 'device-sources-absent' | 'device-sources-unparseable' | 'device-sources-conflict' | 'device-sources-unresolved'
  // push 2 (O-2): the declaration that governs is the immutable snapshot taken at the leg's first execution (device-sources-read.ts)
  | 'device-sources-snapshot-absent' | 'device-sources-snapshot-unreadable' | 'device-sources-snapshot-changed';

export interface DeclaredDeviceReadService {
  /** The service string exactly as the block declares it (a name or a descriptor URL). */
  declared: string;
  names: ReadonlySet<string>;
  serviceIds: ReadonlySet<string>;
  devices: ReadonlySet<string>;
}

/** push 2 (P8 / S3-E): one declared `git-file` line, as the snapshot carries it. */
export interface DeclaredGitFileLine { device: string; owner: string; repo: string; path: string; ref: string | null }
/** push 2 (P8): a service the block declares `git-file` for, resolved like a device-read service, with its lines. */
export interface DeclaredGitFileService {
  declared: string;
  names: ReadonlySet<string>;
  serviceIds: ReadonlySet<string>;
  lines: readonly DeclaredGitFileLine[];
}

export type DeviceReadScope =
  | { state: 'declared'; services: readonly DeclaredDeviceReadService[]; unresolvedServices: readonly string[];
      /** push 2 (P8): the `git-file` services (the declared-line pin for an unpinned row). Absent on a scope built before push 2. */
      gitServices?: readonly DeclaredGitFileService[];
      /** push 2 (owner Phase-0 §4b): every declared `git-file` line — a device whose Git file is held keeps its device read as
       *  EVIDENCE only (held-bytes-capture.ts). */
      gitLines?: readonly DeclaredGitFileLine[] }
  | { state: 'refuse'; refusal: DeviceReadRefusal };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function argsOf(raw: unknown): Obj | null {
  if (isObj(raw)) return raw;
  if (typeof raw === 'string') { try { const p = JSON.parse(raw); return isObj(p) ? p : null; } catch { return null; } }
  return null;
}

/** URL → the rows this execution registered from it (successful `registry register` calls only). */
export function registrationsByDescriptorUrl(records: readonly unknown[]): Map<string, Array<{ serviceId: string | null; serviceName: string | null }>> {
  const out = new Map<string, Array<{ serviceId: string | null; serviceName: string | null }>>();
  for (const rec of records) {
    if (!isObj(rec) || rec.tool !== 'registry' || rec.success === false) continue;
    const a = argsOf(rec.arguments);
    if (!a || a.action !== 'register' || typeof a.descriptorUrl !== 'string') continue;
    const res = isObj(rec.result) ? rec.result : null;
    if (!res || res.isError === true || !Array.isArray(res.content)) continue;
    const first = res.content[0];
    const data = isObj(first) && first.type === 'data' && isObj(first.data) ? first.data : null;
    if (!data || data.success !== true) continue;
    const serviceId = typeof data.serviceId === 'string' ? data.serviceId : null;
    const serviceName = typeof data.serviceName === 'string' ? data.serviceName : null;
    if (!serviceId && !serviceName) continue;
    out.set(a.descriptorUrl, [...(out.get(a.descriptorUrl) ?? []), { serviceId, serviceName }]);
  }
  return out;
}

export function buildDeviceReadScope(sources: LegDeviceSourcesResolution, records: readonly unknown[]): DeviceReadScope {
  if (sources.state === 'absent') return { state: 'refuse', refusal: 'device-sources-absent' };
  if (sources.state === 'unparseable') return { state: 'refuse', refusal: 'device-sources-unparseable' };
  if (sources.state === 'conflict') return { state: 'refuse', refusal: 'device-sources-conflict' };
  if (sources.state === 'snapshot-absent' || sources.state === 'snapshot-unreadable' || sources.state === 'snapshot-changed') {
    return { state: 'refuse', refusal: `device-sources-${sources.state}` };
  }
  if (sources.state !== 'parsed') return { state: 'refuse', refusal: 'device-sources-unresolved' };
  const byService = new Map<string, Set<string>>();
  const gitByService = new Map<string, DeclaredGitFileLine[]>();
  const gitLines: DeclaredGitFileLine[] = [];
  for (const e of sources.entries) {
    if (e.kind === 'git-file') {
      const line = { device: e.device, owner: e.owner, repo: e.repo, path: e.path, ref: e.ref };
      gitLines.push(line);
      gitByService.set(e.service, [...(gitByService.get(e.service) ?? []), line]);
      continue;
    }
    if (e.kind !== 'device-read') continue;
    byService.set(e.service, (byService.get(e.service) ?? new Set<string>()).add(e.device));
  }
  const regs = registrationsByDescriptorUrl(records);
  /** A declared service string → the rows it names in THIS execution, or null (a URL this execution never registered). */
  const resolve = (declared: string): { names: ReadonlySet<string>; serviceIds: ReadonlySet<string> } | null => {
    if (!/^https?:\/\//i.test(declared)) return { names: new Set([declared]), serviceIds: new Set() };
    const hit = regs.get(declared) ?? [];
    if (hit.length === 0) return null;
    return {
      names: new Set(hit.map((h) => h.serviceName).filter((x): x is string => !!x)),
      serviceIds: new Set(hit.map((h) => h.serviceId).filter((x): x is string => !!x)),
    };
  };
  const services: DeclaredDeviceReadService[] = [];
  const unresolved: string[] = [];
  for (const [declared, devices] of byService) {
    const r = resolve(declared);
    if (!r) { unresolved.push(declared); continue; }
    services.push({ declared, devices, ...r });
  }
  const gitServices: DeclaredGitFileService[] = [];
  for (const [declared, lines] of gitByService) {
    const r = resolve(declared);
    if (!r) { if (!unresolved.includes(declared)) unresolved.push(declared); continue; }
    gitServices.push({ declared, lines, ...r });
  }
  return { state: 'declared', services, unresolvedServices: unresolved, gitServices, gitLines };
}

/** push 2: is this held file the declared Git file of `line`? (target `github:<owner>:<repo>` and path `/<path>`, owner/repo compared
 *  lower-cased — GitHub folds case, and the platform source's target is lower-case.) Shared by capture (one base per device) and the
 *  held-edit carrier (O-4). */
export function isFileOfGitLine(f: { target: string; path: string }, line: { owner: string; repo: string; path: string }): boolean {
  return f.target.toLowerCase() === `github:${line.owner.toLowerCase()}:${line.repo.toLowerCase()}` && f.path === `/${line.path}`;
}

/** push 2 (P8): the `git-file` lines declared for the call's resolved service, or null when the service declares none. */
export function declaredGitLinesFor(scope: DeviceReadScope, serviceName: string, serviceId: string | null): readonly DeclaredGitFileLine[] | null {
  if (scope.state !== 'declared' || !scope.gitServices) return null;
  const out: DeclaredGitFileLine[] = [];
  for (const s of scope.gitServices) {
    const match = s.serviceIds.size > 0 && serviceId ? s.serviceIds.has(serviceId) : s.names.has(serviceName);
    if (match) out.push(...s.lines);
  }
  return out.length ? out : null;
}

/** The devices declared device-read for the call's resolved service, or null when the service is not a declared one. A URL
 *  declaration matches on the registered row id when the call carries one, else on the registered name. */
export function declaredDevicesFor(scope: DeviceReadScope, serviceName: string, serviceId: string | null): ReadonlySet<string> | null {
  if (scope.state !== 'declared') return null;
  const out = new Set<string>();
  let hit = false;
  for (const s of scope.services) {
    const match = s.serviceIds.size > 0 && serviceId ? s.serviceIds.has(serviceId) : s.names.has(serviceName);
    if (match) { hit = true; for (const d of s.devices) out.add(d); }
  }
  return hit ? out : null;
}
