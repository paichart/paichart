/**
 * Gate for lib/server/dev-mcp-proxy.ts:
 *  1. the proxy's path rule is byte-identical to the nginx snippet in docs/RUNNING.md (no drift);
 *  2. the rule routes the MCP/OAuth paths and leaves the web server's /.well-known/* alone;
 *  3. an unreachable MCP server yields a 502 with the "start it" hint, not a hang.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { DEV_MCP_PROXY_RULE, shouldProxy, proxyToMcp } from '../lib/server/dev-mcp-proxy';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; };

// 1. drift guard against RUNNING.md
const running = fs.readFileSync(path.join(__dirname, '..', 'docs', 'RUNNING.md'), 'utf8');
const m = running.match(/location ~ (\S+) \{ proxy_pass http:\/\/127\.0\.0\.1:8080; \}/);
check('RUNNING.md carries the nginx MCP location rule', !!m);
check(`proxy rule === nginx rule in RUNNING.md (${m?.[1]})`, !!m && m[1] === DEV_MCP_PROXY_RULE);

// 2. routing
for (const p of ['/mcp', '/mcp/.well-known/jwks.json', '/oauth/authorize', '/oauth/token', '/oauth/callback', '/oauth/register',
  '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource']) check(`proxied: ${p}`, shouldProxy(p));
for (const p of ['/', '/login', '/api/auth/me', '/api/mcp/discover', '/.well-known/mcp.json', '/.well-known/agent-card.json',
  '/.well-known/security.txt', '/oauth', '/docs/oauth', undefined]) check(`web:     ${p}`, !shouldProxy(p));

// 3. unreachable upstream → 502 hint
(async () => {
  const srv = http.createServer((req, res) => proxyToMcp(req, res, { host: '127.0.0.1', port: 1 }));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as { port: number }).port;
  const body = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/mcp' }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => resolve({ status: res.statusCode || 0, text: t }));
    }).on('error', reject);
  });
  srv.close();
  check('unreachable MCP server → 502', body.status === 502);
  check('502 body names the fix (npm run mcp:http:dev)', body.text.includes('mcp:http:dev'));
  if (failed) { console.error(`\n❌ test:dev-mcp-proxy — ${failed} failed`); process.exit(1); }
  console.log('\n✅ test:dev-mcp-proxy — all cases pass');
})();
