/**
 * gate-check-contract-files.ts — the files a CHANGE leg's contract names, for `report:gate`'s PLAN gate (GATE-REPORT-CONFIG-FILES-LINE,
 * 2026-11-28). Its own module because `gate-check-spec.ts` names no source kind by design (test R2); this one has to.
 * Pure: no database, no file, no exit. Tests: scripts/test-gate-check-spec.ts GC1-GC7.
 */
import { configSourceContractKeyOf, deviceSourceContractKeyOf } from '../lib/agents/harness/held-bytes/variant';
import { contractDeviceSourcesValue, parseDeviceSourcesContractValue } from '../lib/agents/harness/device-sources';
import { contractConfigSourcesValue, parseConfigSourcesContractValue } from '../lib/agents/harness/config-sources';
/** GATE-REPORT-CONFIG-FILES-LINE (2026-11-28): the files a CHANGE leg's contract names, for the PLAN gate's "config files" line.
 *  Before, the report read only the legacy `interfaceContract[<token>].configRepo`, so every leg declaring its Git files in
 *  `deviceSources[<key>]` (network, since 2026-10-24) or `configSources[<key>]` (Kubernetes, Terraform, observability) read "none"
 *  — the operator releases gates on this report. The leg's OWN key only (the contract carries every leg's entries), parsed by the
 *  SHIPPING parsers so the report cannot disagree with the platform. A fact list; an unparseable block is a problem, never "none". */
export function contractFilesOf(token: string, interfaceContract: unknown): { files: string[]; problems: string[] } {
  const files: string[] = []; const problems: string[] = [];
  const ic = interfaceContract && typeof interfaceContract === 'object' && !Array.isArray(interfaceContract) ? (interfaceContract as Record<string, unknown>) : null;
  if (!ic) return { files, problems };
  const own = ic[token];
  if (own && typeof own === 'object' && !Array.isArray(own) && (own as Record<string, unknown>).configRepo !== undefined) {
    files.push(`configRepo ${JSON.stringify((own as Record<string, unknown>).configRepo)}`);
  }
  const gitFile = (e: { owner: string; repo: string; path: string; ref: string | null }) => `${e.owner}/${e.repo}/${e.path}${e.ref ? ` @ ${e.ref}` : ''}`;
  const dsKey = deviceSourceContractKeyOf(token);
  if (dsKey) {
    const p = parseDeviceSourcesContractValue(contractDeviceSourcesValue(ic, dsKey));
    if (p.state === 'unparseable') problems.push(`deviceSources["${dsKey}"] is unparseable (${p.problem}) — the platform reads no file from it`);
    else if (p.state === 'parsed') for (const e of p.entries) {
      if (e.kind === 'git-file') files.push(`${e.device}: ${gitFile(e)} (Git, kept)`);
      else if (e.kind === 'device-read') files.push(`${e.device}: running configuration (device read, kept)`);
    }
  }
  const csKey = configSourceContractKeyOf(token);
  if (csKey) {
    const p = parseConfigSourcesContractValue(contractConfigSourcesValue(ic, csKey), csKey);
    if (p.state === 'unparseable') problems.push(`configSources["${csKey}"] is unparseable (${p.problem}) — the platform reads no file from it`);
    else if (p.state === 'parsed') for (const e of p.entries) {
      if (e.kind === 'git-file') files.push(`${e.label}: ${gitFile(e)} (Git, kept)`);
      else if (e.kind === 'service-held') files.push(`${e.label}: kept from the read-only service`);
    }
  }
  return { files, problems };
}

