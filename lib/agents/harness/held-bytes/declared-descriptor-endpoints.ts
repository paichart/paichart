/**
 * DESCRIPTOR-REGISTRATION-ROUTE (2026-11-16, owner-approved) — the endpoint each PLATFORM-PUBLISHED descriptor URL declares, so a
 * declared `service <descriptor URL>` line can be tied to a service the Harvester registered BY HAND (name + endpoint + …) in the
 * same execution, not only to one registered with `descriptorUrl`.
 *
 * WHY A STATIC TABLE (not a fetch, not a stamp): every consumer (`registrationsByDescriptorUrl`) is pure over the execution's own
 * tool records, and a replay must recompute the same fact from stored data with no network. A fetch would make the fact depend on
 * what a URL serves on the day it is replayed. The table holds the descriptors the platform publishes in its public repo; their
 * endpoints are pinned equal to the in-repo copies by `test:device-sources` (DR-T*).
 *
 * THE RULE FOR ANY OTHER URL: no entry ⇒ the hand route resolves nothing for it — the line stays unresolved exactly as before
 * (named, never guessed). A customer's own descriptor URL resolves only through the `descriptorUrl` route.
 * An endpoint listed under TWO URLs resolves neither (one registration never matches two declared services) — pinned.
 */
const PUBLIC_DESCRIPTORS = 'https://raw.githubusercontent.com/paichart/paichart/main/descriptors/';

export const DECLARED_DESCRIPTOR_ENDPOINTS: Readonly<Record<string, string>> = Object.freeze({
  [`${PUBLIC_DESCRIPTORS}ceos-lab-readonly-descriptor.json`]: 'https://ceos-lab.paichart.app/mcp',
  [`${PUBLIC_DESCRIPTORS}k8s-readonly-descriptor.json`]: 'https://k8s-lab.paichart.app/mcp',
  [`${PUBLIC_DESCRIPTORS}observability-readonly-descriptor.json`]: 'http://127.0.0.1:3114/mcp',
  [`${PUBLIC_DESCRIPTORS}terraform-readonly-descriptor.json`]: 'https://tf-lab.paichart.app/mcp',
});

/** An MCP endpoint compared as an endpoint: scheme + host (lower-cased by URL, default port elided) + path without a trailing slash +
 *  query. A URL carrying userinfo, or one that does not parse, compares as nothing (null). */
export function normalisedEndpoint(s: string): string | null {
  try {
    const u = new URL(s);
    if (u.username || u.password) return null;
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch { return null; }
}

/** normalised endpoint → the ONE descriptor URL declaring it. An endpoint under two URLs is left out (ambiguous ⇒ resolves neither). */
export function descriptorUrlByEndpoint(table: Readonly<Record<string, string>> = DECLARED_DESCRIPTOR_ENDPOINTS): Map<string, string> {
  const seen = new Map<string, string[]>();
  for (const [url, endpoint] of Object.entries(table)) {
    const n = normalisedEndpoint(endpoint);
    if (n) seen.set(n, [...(seen.get(n) ?? []), url]);
  }
  const out = new Map<string, string>();
  for (const [n, urls] of seen) if (urls.length === 1) out.set(n, urls[0]);
  return out;
}
