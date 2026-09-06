/**
 * Dev-only reverse proxy: web server (:3000) → MCP HTTP server (:8080) for the MCP/OAuth paths.
 *
 * WHY (E7, devext 2026-09-06): the MCP server ADVERTISES `${APP_BASE_URL}/oauth/…` and
 * `${APP_BASE_URL}/.well-known/oauth-*` in its discovery documents and in the 401 that starts every
 * MCP client's login. In production nginx presents both processes as one origin. In the two-port
 * dev shape those URLs landed on the web app and 404ed, so no real MCP client could connect to a
 * self-host without nginx. This proxy gives dev the same single origin.
 *
 * RULES (from the panel that approved it):
 *  - dev only — `server.ts` mounts it when NODE_ENV !== 'production'; on prod nginx owns routing
 *    and a second proxy would double-route.
 *  - the path rule is IDENTICAL to the nginx snippet in docs/RUNNING.md ("Production shape") —
 *    `scripts/test-dev-mcp-proxy.ts` fails if the two ever diverge.
 *  - `/.well-known/mcp.json` (and agent-card.json, glama.json, …) stay on the web server: the rule
 *    is `.well-known/oauth-` prefixed on purpose.
 */
import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';

/** Same regex as nginx `location ~ ^/(mcp|oauth/|\.well-known/oauth-)` in docs/RUNNING.md. */
export const DEV_MCP_PROXY_RULE = '^/(mcp|oauth/|\\.well-known/oauth-)';
export const DEV_MCP_PROXY_PATH = new RegExp(DEV_MCP_PROXY_RULE);

export function mcpTarget(env: NodeJS.ProcessEnv = process.env): { host: string; port: number } {
  return { host: '127.0.0.1', port: parseInt(env.MCP_HTTP_PORT || '8080', 10) };
}

export function shouldProxy(pathname: string | null | undefined): boolean {
  return !!pathname && DEV_MCP_PROXY_PATH.test(pathname);
}

/** Streams the request to the MCP server and the response back (SSE-safe: no buffering). */
export function proxyToMcp(req: IncomingMessage, res: ServerResponse, target = mcpTarget()): void {
  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  // What nginx adds; Host is left as the client sent it (nginx: proxy_set_header Host $host).
  const remote = req.socket.remoteAddress || '';
  headers['x-forwarded-for'] = headers['x-forwarded-for'] ? `${headers['x-forwarded-for']}, ${remote}` : remote;
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-host'] = req.headers.host || '';

  const upstream = http.request(
    { host: target.host, port: target.port, method: req.method, path: req.url, headers },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    }
  );
  upstream.on('error', (err: NodeJS.ErrnoException) => {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'mcp_server_unreachable',
      error_description: `dev proxy: MCP server not reachable at ${target.host}:${target.port} (${err.code || err.message}) — start it with \`npm run mcp:http:dev\``,
    }));
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}
