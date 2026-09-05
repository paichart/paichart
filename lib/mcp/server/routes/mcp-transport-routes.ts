/**
 * MCP transport routes (R11 + R12).
 *
 * Extracted from `mcp-server-http-clean.js:setupRoutes()` in Wave 6
 * Phase 6.5. Verbatim move — no behavioral changes from the pre-extraction
 * shape. FINAL Wave 6 extraction; after this, the server's setupRoutes()
 * becomes a ~5-line orchestrator delegation.
 *
 * Two registrations:
 *
 *   R11 — `app.post('/mcp', authMiddleware, ...)`:
 *     Main MCP client-to-server handler. Dual-mode (stateless via
 *     detectClientMode + persistent session via Mcp-Session-Id). Hot path
 *     — 3182 hits/14d per Phase 0.5 production audit. Hazards H-3
 *     (per-session transport lifecycle), H-2 (registers AFTER B2 401
 *     trigger — order preserved by orchestrator + Plan v2 D4 test).
 *
 *   R12 — `app.get('/mcp', ...)`:
 *     SSE handler + ChatGPT manifest discovery. **INNER-CLOSURE AUTH
 *     PATTERN** (sec-ops C6 fold per Plan v2): authMiddleware is invoked
 *     INSIDE the handler (not in the Express chain), gated by a
 *     ChatGPT-discovery branch that runs BEFORE auth. Different from
 *     R11's chain-auth pattern — DO NOT "tidy" R12 to use chain-auth
 *     because the ChatGPT manifest needs to be served WITHOUT auth.
 *
 *     Hazard H-5: R12's auth invocation is easy to break during
 *     refactor. Sec-ops C6 fold mandates 4 explicit tests for this
 *     pattern (see scripts/test-routes-mcp-transport.ts).
 *
 * Dependencies (RouteContext fields used):
 *   - `ctx.app`                     — route registration target
 *   - `ctx.logger`                  — operational logging
 *   - `ctx.sessionStore`            — session/transport storage
 *   - `ctx.getAuthMiddleware()`     — lazy-init wrapper (Wave 4 SEC-C4 lesson)
 *   - `ctx.detectClientMode`        — H4 helper (stateless vs persistent routing)
 *   - `ctx.handleStatelessRequest`  — H5 helper (stateless mode transport handler)
 *   - `ctx.processMCPRequest`       — Domain D method (stays on server class)
 *
 * @see lib/mcp/server/routes/route-context.ts (DI contract)
 * @see cline_docs/reviews/express-routes-extraction-2026-05-21/express-routes-extraction-plan-v2.md Phase 6.5
 */

import type { Request, Response, RequestHandler } from 'express';
import type { RouteContext } from './route-context';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { isProtectedMethod, MCP_PUBLIC_METHODS } from '../../../auth/mcp-method-classifier';
import { PUBLIC_BASE_URL } from '../../../auth/public-base-url';

import mcpLogger from '../mcp-logger';
const { authLogger } = mcpLogger as { authLogger: { error: (...a: unknown[]) => void; info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; debug: (...a: unknown[]) => void; fatal: (...a: unknown[]) => void } };

// MCP SDK helper for detecting initialize requests
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

// Type shapes for ctx.* fields
type SessionStoreShape = {
  hasSession: (id: string) => boolean;
  getTransport: (id: string) => { temporary?: boolean } | null;
  getContext: (id: string) => { user?: { id?: string; userId?: string; email?: string; role?: string }; userId?: string } | null;
  setSession: (id: string, transport: unknown, ctx: unknown) => void;
  deleteSession: (id: string) => void;
};

/**
 * Register R11 + R12 in declaration order.
 *
 * R11 uses authMiddleware in the Express chain. R12 uses inner-closure
 * auth. Both rely on ctx.getAuthMiddleware() (lazy accessor per Wave 4
 * SEC-C4 lesson — DO NOT call at registration time).
 */
export function registerMCPTransportRoutes(ctx: RouteContext): void {
  // Get auth middleware ONCE per registerAllRoutes call (factory returns
  // the same lazy-init wrapper instance). Lazy accessor pattern means the
  // underlying AuthManager.createMiddleware isn't invoked until first
  // request — preserves Wave 4 Phase 4.4 SEC-C4 throw-before-init fix.
  const authMiddleware: RequestHandler = ctx.getAuthMiddleware();

  registerR11Post(ctx, authMiddleware);
  registerR12GetSSE(ctx, authMiddleware);
}

// ─────────────────────────────────────────────────────────────────────
// R11 — POST /mcp (main MCP client-to-server handler)
//
// Dual-mode: detectClientMode → stateless (handleStatelessRequest) OR
// persistent (session-based transport). Hot path 3182 hits/14d.
//
// Order is LOAD-BEARING (Hazard H-2): registers AFTER B2 (in oauth-flow-
// routes). B2 must fire first to handle unauth'd initialize → 401 + OAuth
// trigger. R11's authMiddleware then handles authenticated POST /mcp.
// ─────────────────────────────────────────────────────────────────────
function registerR11Post(ctx: RouteContext, authMiddleware: RequestHandler): void {
  const sessionStore = ctx.sessionStore as SessionStoreShape;

  ctx.app.post('/mcp', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      // Add anti-cache headers (prevent future caching issues)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      // Detect client mode for appropriate transport handling
      const clientMode = ctx.detectClientMode(req);

      if (clientMode === 'stateless') {
        // Use official SDK stateless pattern for Claude.ai browser
        await ctx.handleStatelessRequest(req, res);
        return;
      }

      // Persistent session mode (existing implementation for Claude Code)
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let currentSessionId: string | undefined = sessionId;

      // Phase 2.6: transport reads migrated to SessionStore
      if (sessionId && sessionStore.hasSession(sessionId)) {
        // Reuse existing per-session transport
        currentSessionId = sessionId;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // Create NEW session manually (bypassing SDK transport connection)
        currentSessionId = crypto.randomUUID();

        const reqUser = (req as Request & { user?: { id?: string; userId?: string; email?: string; role?: string } }).user;

        // Create transport placeholder for session tracking
        const sessionInfo = {
          sessionId: currentSessionId,
          created: new Date(),
          user: reqUser,
          authenticated: !!reqUser,
        };

        // Create session context — P7 FIX: bind session to user identity
        const sessionContext = {
          user: reqUser,
          userId: reqUser?.id || reqUser?.userId || null,  // P7: identity binding
          authenticated: !!reqUser,
          authMethod: reqUser ? 'api_key' : null,
          createdAt: new Date(),
        };

        // Store with bounded limits (time-bomb-detection-pattern.md)
        sessionStore.setSession(currentSessionId, sessionInfo, sessionContext);
        ctx.logger.info('Manual session transport created:', currentSessionId, 'authenticated:', !!reqUser);
      } else if (isProtectedMethod(req.body?.method) ||
                 ['tools/list', 'prompts/list', 'resources/list'].includes(req.body?.method as string)) {
        // STATELESS MODE: Claude.ai browser pattern - create temporary session
        // Includes protected methods AND list methods (public but may need session for filtering)
        currentSessionId = crypto.randomUUID();

        const reqUser = (req as Request & { user?: { id?: string; userId?: string; email?: string; role?: string } }).user;

        // Create temporary transport for this request only
        const tempSessionInfo = {
          sessionId: currentSessionId,
          created: new Date(),
          user: reqUser,
          authenticated: !!reqUser,
          temporary: true,
        };

        // Create temporary session context
        const tempContext = {
          user: reqUser,
          authenticated: !!reqUser,
          authMethod: reqUser ? 'api_key' : null,
          createdAt: new Date(),
          temporary: true,
        };

        // Store with bounded limits
        sessionStore.setSession(currentSessionId, tempSessionInfo, tempContext);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Attach authentication info for per-session transport
      const reqUser = (req as Request & { user?: { id?: string; userId?: string; email?: string; role?: string } }).user;
      if (reqUser) {
        (req as Request & { auth?: { userId?: string; email?: string; role?: string } }).auth = {
          userId: reqUser.id || reqUser.userId,
          email: reqUser.email,
          role: reqUser.role,
        };
      }

      // Route request through existing proven backend integration
      // Phase 2.7: context read migrated to SessionStore
      const sessionContext = currentSessionId ? sessionStore.getContext(currentSessionId) : null;

      // Validate session context exists for methods that require authentication
      const methodNeedsSession = !MCP_PUBLIC_METHODS
        .map((m: string) => m.toLowerCase())
        .includes((req.body?.method || '').toLowerCase());

      if (!sessionContext && methodNeedsSession) {
        ctx.logger.warn('Session context missing for protected method:', { method: req.body.method, sessionId: currentSessionId });
        ctx.logger.warn('Missing session context for authenticated method:', {
          method: req.body.method,
          sessionId: currentSessionId,
          hasUser: !!reqUser,
        });
      }

      // P7 FIX: Verify session is bound to the current user
      // If a request arrives with a valid session ID but a different user identity,
      // reject it — this prevents session hijacking across users.
      if (sessionContext?.userId && reqUser?.id && sessionContext.userId !== reqUser.id) {
        authLogger.error({
          sessionUserId: sessionContext.userId,
          reqUserId: reqUser.id,
          sessionId: currentSessionId,
        }, 'P7: session-user identity mismatch — potential session hijacking');
        res.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session identity mismatch' },
          id: req.body?.id || null,
        });
        return;
      }

      try {
        // P4 FIX: Prefer fresh req.user (from Bearer token on this request) over stale session context.
        // Session user is only a fallback when POST has no auth header (e.g., SSE-only clients).
        const currentUser = reqUser || sessionContext?.user;
        if (reqUser && sessionContext?.user && reqUser.id !== sessionContext.user.id) {
          authLogger.warn({ reqUserId: reqUser.id, sessionUserId: sessionContext.user.id },
            'P4: fresh auth differs from session context — using fresh auth');
        }
        // Cast currentUser to ReqUser-shaped for processMCPRequest. Real ReqUser
        // has more fields but processMCPRequest accepts the union of partial shapes.
        const response = await ctx.processMCPRequest(req.body, currentUser as Parameters<typeof ctx.processMCPRequest>[1]);

        // Add session ID header for initialization responses
        if (req.body?.method === 'initialize' && currentSessionId) {
          res.setHeader('Mcp-Session-Id', currentSessionId);

          // Claude.ai browser expects JSON responses, not SSE format
          res.status(200).json(response);
          return;
        }

        // Handle MCP spec-compliant responses (notifications)
        const specResponse = response as { specCompliant?: boolean; statusCode?: number } | undefined;
        if (specResponse?.specCompliant && specResponse?.statusCode === 202) {
          // Notifications MUST return 202 Accepted with no body per MCP spec
          res.status(202).end();
          return;
        }

        // RFC 6750: Add WWW-Authenticate header to indicate OAuth support available
        res.setHeader('WWW-Authenticate', `Bearer realm="${new URL(PUBLIC_BASE_URL).hostname}", charset="UTF-8"`);

        // Send regular JSON response for non-initialization requests
        if (response) {
          res.status(200).json(response);
        } else {
          res.status(200).json({ success: true });
        }

        // Cleanup temporary sessions immediately after response — SessionStore-only.
        const sessionInfo = currentSessionId ? sessionStore.getTransport(currentSessionId) : null;
        if (sessionInfo?.temporary && currentSessionId) {
          sessionStore.deleteSession(currentSessionId); // atomic across 3 internal Maps
        }
      } catch (requestError) {
        // Task #157: added id per JSON-RPC 2.0 §5.1
        ctx.logger.error('Backend request processing failed:', requestError);
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: req.body?.id ?? null,
        });
      }
    } catch (error) {
      // Task #157: added id per JSON-RPC 2.0 §5.1
      ctx.logger.error('Per-session transport error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: req.body?.id ?? null,
        });
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// R12 — GET /mcp (SSE handler + ChatGPT manifest discovery)
//
// **INNER-CLOSURE AUTH PATTERN** (sec-ops C6 fold per Plan v2):
//
//   1. ChatGPT manifest discovery branch FIRST — no auth required
//      (ChatGPT needs to discover OAuth capabilities BEFORE creating
//      a session)
//   2. Authenticated branch SECOND — wraps remainder in
//      `authMiddleware(req, res, async () => { ... })` inner-closure
//      pattern
//
// This pattern is fragile to "tidy" — moving authMiddleware to the
// chain (e.g., `app.get('/mcp', authMiddleware, ...)`) breaks the
// ChatGPT manifest discovery branch.
//
// Test plan (Plan v2 C6 fold):
//   - POST no-auth → 401 (B2 fires)
//   - POST valid → 200 + req.user populated
//   - **GET no-auth → 401 from inner closure** (proves no SSE-establishment bypass)
//   - GET valid → SSE + Mcp-Session-Id
// ─────────────────────────────────────────────────────────────────────
function registerR12GetSSE(ctx: RouteContext, authMiddleware: RequestHandler): void {
  const sessionStore = ctx.sessionStore as SessionStoreShape;

  ctx.app.get('/mcp', async (req: Request, res: Response): Promise<void> => {
    // ===== CHATGPT MANIFEST DISCOVERY (NO AUTH REQUIRED) =====
    // ChatGPT needs to discover OAuth capabilities BEFORE creating a session
    const userAgent = (req.headers['user-agent'] || '') as string;
    const hasAuth = req.headers.authorization || req.headers['x-api-key'];
    const hasSession = req.headers['mcp-session-id'];

    const isChatGPTDiscovery = (userAgent.includes('openai-mcp') ||
                                 userAgent.toLowerCase().includes('chatgpt')) &&
                                !hasAuth && !hasSession;

    if (isChatGPTDiscovery) {
      ctx.logger.info('ChatGPT manifest: serving static manifest for discovery', { userAgent });

      // Serve static mcp_manifest.json from repo root
      // __dirname here = lib/mcp/server/routes; manifest is at repo root
      const manifestPath = path.join(__dirname, '..', '..', '..', '..', 'mcp_manifest.json');

      try {
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);

        ctx.logger.info('ChatGPT manifest loaded', { providers: manifest.auth?.providers?.length || 0, providerOrder: manifest.auth?.providers?.map((p: { name: string }) => p.name).join(', ') || 'none' });

        res.status(200).json(manifest);
        return;
      } catch (error) {
        ctx.logger.error('ChatGPT manifest: failed to load static manifest', { err: (error as Error).message });

        // Task #156: removed `details: error.message` — was leaking filesystem paths
        res.status(500).json({
          error: 'manifest_load_failed',
          message: 'Could not load MCP manifest file',
        });
        return;
      }
    }

    // ===== AUTHENTICATED REQUESTS (EXISTING BEHAVIOR) =====
    // Apply auth middleware for all other GET requests via INNER-CLOSURE PATTERN
    // (see file-header / sec-ops C6 note for why this is NOT chain-auth)
    authMiddleware(req, res, async () => {
      // Client detection for appropriate response
      const clientMode = ctx.detectClientMode(req);

      if (clientMode === 'stateless') {
        // Official SDK: Return 405 Method Not Allowed for stateless clients
        res.writeHead(405).end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Method not allowed.',
          },
          id: null,
        }));
        return;
      }

      // Persistent session mode (existing SSE implementation)
      let sessionId = req.headers['mcp-session-id'] as string | undefined;
      const reqUser = (req as Request & { user?: { id?: string; userId?: string; authMethod?: string } }).user;

      // If no session but user is authenticated (e.g., via OAuth), create a new session
      if (!sessionId && reqUser) {
        ctx.logger.info('OAuth SSE: creating new session for authenticated user');
        sessionId = crypto.randomUUID();

        // Create session info for tracking
        const sessionInfo = {
          sessionId,
          created: new Date(),
          user: reqUser,
          authenticated: true,
        };

        // Create session context — P7 FIX: bind session to user identity
        const sessionContext = {
          user: reqUser,
          userId: reqUser?.id || reqUser?.userId || null,
          authenticated: true,
          authMethod: reqUser.authMethod || 'oauth',
          createdAt: new Date(),
        };

        // Store with bounded limits
        sessionStore.setSession(sessionId, sessionInfo, sessionContext);

        ctx.logger.info('OAuth SSE: new session created', { sessionId });
      }

      // Phase 2.6: transport reads migrated to SessionStore
      if (!sessionId || !sessionStore.hasSession(sessionId)) {
        // No session and no auth - return error
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session required - initialize connection first via POST /mcp',
          },
          id: null,
        });
        return;
      }

      // Set up SSE headers for streaming responses
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Keep connection alive with periodic pings
      const keepAlive = setInterval(() => {
        res.write('event: ping\ndata: {}\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });

      // Send initial connection confirmation
      res.write(`event: connected\ndata: {"sessionId": "${sessionId}"}\n\n`);
    });
  });
}
