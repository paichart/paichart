/**
 * Operator check: will this descriptor register by URL? (held-network step 2 / INTERNAL-FIT, 2026-10-24)
 *
 * Runs the SHIPPING descriptor validation (`resolveFromDescriptor` + the register-field schema) over a descriptor read from
 * a URL or a local file, and reports the facts a requirements author needs before naming it in a spec:
 *   - PASS / the exact refusal the hub would return (e.g. a tool description over 500 characters)
 *   - the descriptor's own name (a run takes the name from the descriptor; never type another beside the URL)
 *   - whether the URL carries a query string (accepted only when a PERSON registers it — a run cannot self-provision it)
 *   - path segments that look like a token (a token must go in the query string, never the path)
 *   - each declared held file's Git pin ref (a branch/tag/commit the spec names must equal it; none declared ⇒ default branch)
 *
 * Read-only. It does not register anything and does not apply the hub's address rules (allowlist, https/port): those are
 * the operator's install settings, checked at registration.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/check-descriptor.ts <https URL | file> [...]
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:y@127.0.0.1:1/z';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
import { readFileSync } from 'fs';

const regDecl = require('../lib/mcp/server/tools/hub/registrant-declaration');
const { registerFieldsSchema } = require('../lib/mcp/server/config/tool-schemas');

const TOOL_DESCRIPTION_MAX = 500; // mirrors tool-schemas.js; the shipping check below is authoritative

async function load(src: string): Promise<{ json: any; url: URL | null }> {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) throw new Error(`redirect (${res.status}) — the hub refuses redirects; give the final URL`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { json: JSON.parse(await res.text()), url: new URL(src) };
  }
  return { json: JSON.parse(readFileSync(src, 'utf8')), url: null };
}

function tokenLikeSegments(url: URL): string[] {
  return url.pathname.split('/').filter((s) => /^(gh[pousr]_|github_pat_|glpat-)/.test(s) || /^[A-Za-z0-9_\-]{32,}$/.test(s));
}

(async () => {
  const srcs = process.argv.slice(2);
  if (!srcs.length) { console.error('usage: check-descriptor.ts <https URL | file> [...]'); process.exit(2); }
  let failed = 0;
  for (const src of srcs) {
    console.log(`\n== ${src.replace(/\?.*$/, '?***')}`);
    let d: any; let url: URL | null;
    try { ({ json: d, url } = await load(src)); } catch (e: any) { console.log(`  ❌ could not read: ${e.message}`); failed++; continue; }
    const r = await regDecl.resolveFromDescriptor({ action: 'register', descriptorUrl: 'https://example.com/d.json' }, {
      registerFieldsSchema, allowQuery: true,
      fetch: async (u: string) => ({ ok: true, json: d, url: u, storedUrl: u, sha256: 'check' }),
    });
    if (r.ok) console.log('  ✅ registers: the shipping descriptor check passes');
    else { console.log(`  ❌ refused: ${r.message}`); failed++; }
    console.log(`  name (taken from the descriptor): ${d?.name ?? '(none)'}${d?.version ? ` · version ${d.version}` : ''}`);
    for (const t of (d?.capabilities?.tools ?? [])) {
      const n = typeof t?.description === 'string' ? t.description.length : 0;
      if (n > TOOL_DESCRIPTION_MAX) console.log(`  ⚠ tool ${t.name}: description ${n} characters (> ${TOOL_DESCRIPTION_MAX})`);
    }
    if (url) {
      if (url.search) console.log('  ⚠ the URL has a query string: only a PERSON can register it — a run cannot self-provision it; pre-register and name it');
      const tok = tokenLikeSegments(url);
      if (tok.length) { console.log(`  ❌ ${tok.length} path segment(s) look like a token — put a token in the query string, never the path`); failed++; }
      if (url.protocol !== 'https:') console.log('  ⚠ not https: accepted only where the operator enables plain http (self-host)');
    }
    const files = d?.heldFiles?.files ?? d?.heldFiles ?? [];
    const pins = (Array.isArray(files) ? files : []).filter((f: any) => f?.gitPin);
    if (pins.length) for (const f of pins) console.log(`  git pin: ${f.gitPin.owner ?? '?'}/${f.gitPin.repo ?? '?'} ref ${f.gitPin.ref ?? '(none declared — default branch only)'}`);
    else console.log('  git pin: none declared');
  }
  process.exit(failed ? 1 : 0);
})();
