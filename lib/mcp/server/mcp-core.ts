/**
 * MCP Server Core Manager — Wave 7 Phase 7.1
 *
 * Owns the PureSDKNativeServer backend lifecycle + initial auth context.
 * Per Plan v2 D5: 3-dependency constructor injection (logger, prismaClient,
 * sessionStore). Constructed at server-class construction time but mcpServer
 * is lazy — populated by init() called from start().
 *
 * **CRITICAL: Lazy-init pattern (Wave 4 Phase 4.4 SEC-C4 — commit ef04e744)**
 * mcpServer is null at construction; init() does the heavy work. Route
 * handlers reference this via ctx.getMcpServer() lazy accessor (returns
 * MCPCoreManager.mcpServer getter).
 *
 * Phase 7.1 (this commit) ships the skeleton + setupMCPServer (now init())
 * + initializeAuthContext methods. Phase 7.2 will add processRequest +
 * detectClientMode + handleStatelessRequest verbatim from the server class.
 *
 * **C-CROSS-1 implementation pattern** (per architectural-review verdict v2 Q1):
 * Each per-request method uses INLINE guard + local const at top:
 *
 *   if (!this._mcpServer) throw new Error('method called before init()');
 *   const mcpServer = this._mcpServer;  // TS narrows automatically
 *   // ...use mcpServer.X throughout
 *
 * This matches the existing line 1020 prior art in mcp-server-http-clean.js;
 * NOT a separate `assertInitialized()` predicate method (which would be
 * over-engineered for a single per-request call site).
 *
 * @see cline_docs/reviews/mcp-core-extraction-2026-05-21/plan-v2.md (Phase 7.1 §3.2)
 * @see cline_docs/reviews/mcp-core-extraction-2026-05-21/architectural-review-verdict-v2.md
 */

import * as crypto from 'crypto';
import type { Logger } from 'pino';
import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import type { SessionStore } from '../../auth/oauth/session-store';
import { VALID_MCP_METHODS } from './mcp-methods';
import { parseResourceUri } from './mcp-resource-uri';

// Phase 7.2 (per mcp-protocol-debug I1): moved tool-security require from
// lazy-inline (at line 1125 of pre-Wave-7 mcp-server-http-clean.js) to
// top-of-file. tool-security.js is CommonJS — use require + destructure.
const { enforceToolSecurity }: { enforceToolSecurity: (toolName: string, ctx: { user: unknown; authenticated: boolean }) => void } = require('./config/tool-security');

// Named CJS interop (C-CROSS-3): mcp-server-v5.js:2031 exports
// PureSDKNativeServer as `module.exports = { PureSDKNativeServer }`.
// .js file has no TS type declarations — use require() with cast to access
// the named export. ts-node + webpack both resolve this at runtime via
// CommonJS resolution.
// Relative path: from lib/mcp/server/ up 3 levels to repo root where
// mcp-server-v5.js lives.
const mcpServerV5: { PureSDKNativeServer: new () => PureSDKNativeServerShape } = require('../../../mcp-server-v5');
const PureSDKNativeServer = mcpServerV5.PureSDKNativeServer;

/**
 * Structural shape of the PureSDKNativeServer instance we depend on.
 *
 * Per boundary-contract Round 1 C2 + architectural-review verdict v2 Q4:
 * Hand-written interface — NOT a `tsc --declaration` lift from
 * mcp-server-v5.js. Covers only the fields/methods we actually touch.
 *
 * Phase 7.1 covers `init()` + `initializeAuthContext()` needs only.
 * Phase 7.2 will expand this interface as processRequest's call sites
 * pull in additional fields (toolHandlers, getToolsForUser, promptRegistry
 * methods, resourceManager, hubResourceProvider).
 */
export interface PureSDKNativeServerShape {
  /** Lifecycle: starts the SDK backend (loads prompt registry + DB prompts). */
  start(): Promise<void>;

  /** Per-request: seed/refresh user context for downstream API forwarding. */
  setUserContext(context: unknown): void;

  /**
   * Prompt command handler — initialized BY PureSDKNativeServer's own
   * constructor. CleanMCPHTTPServer reads BOTH `mcpServer.promptCommandHandler`
   * AND `mcpServer.server?.promptCommandHandler` (dual location per D-H2
   * fallback — they should be the same instance, the dual-read pattern
   * defends against PureSDKNativeServer's own constructor ordering quirks).
   * Phase 7.1 init() preserves the dual-read verbatim.
   */
  promptCommandHandler?: unknown;
  server?: { promptCommandHandler?: unknown };

  /**
   * Background-loaded resources promise. Phase 7.1 fires the .then/.catch
   * but doesn't await it (per current setupMCPServer behavior).
   */
  resourcesReady?: Promise<void>;

  // ─── Phase 7.2 additions (processRequest dispatch surface) ───

  /** Tool handler dispatch map (tools/call branch). */
  toolHandlers: { get(name: string): ((args: unknown, ctx: { user: unknown; authenticated: boolean }) => Promise<unknown>) | undefined };

  /** Filtered tool list per user role (tools/list branch). */
  getToolsForUser(user: unknown): Array<{ name: string; description?: string; inputSchema?: unknown }>;

  /**
   * Server instructions string (initialize result). The SDK stores instructions in a
   * private `_instructions` with no public getter, so this paichart-owned method is the
   * ONLY single source — read by both the SDK Server constructor (stdio) and the HTTP
   * initialize (processRequest) so the two transports cannot drift. (2026-05-31, I1)
   */
  getServerInstructions(): string;

  /**
   * Prompt registry list/get accessors (prompts/list + prompts/get branches).
   * Extended from the Phase 7.1 partial shape.
   */
  promptRegistry?: {
    prompts?: { size: number };
    dbPrompts?: { size: number };
    listPrompts(opts: { user: unknown }): Array<{ name: string; description?: string; summary?: string; parameters?: unknown }>;
    getPrompt(name: string, opts: { user: unknown }): Promise<{ description?: string; content?: string | ((args: unknown) => Promise<string>) } | null>;
  };

  /** Resource manager (resources/list + resources/read branches). */
  resourceManager?: {
    listResources(): Promise<Array<{ uri: string; name?: string; description?: string; mimeType?: string; metadata?: { povContext?: { id?: string; ownerId?: string; teamMemberIds?: string[]; isDemo?: boolean }; povId?: unknown; mimeType?: string }; content?: string }>>;
    getResource(key: string, includeContent?: boolean): Promise<{ uri: string; metadata?: { povContext?: { id?: string; ownerId?: string; teamMemberIds?: string[]; isDemo?: boolean }; mimeType?: string }; content?: string } | null>;
    discoverArtifactResources(opts: { limit: number }): Promise<void>;
    getCachedResourceIds(): string[];
  };

  /** Hub resource provider (resources/list hub merge + resources/read mcp://hub/ branch). */
  hubResourceProvider?: {
    listResources(): Promise<Array<{ uri: string; name?: string; description?: string; mimeType?: string; metadata?: unknown }>>;
    readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | null>;
  };
}

export interface MCPCoreManagerOpts {
  logger: Logger;
  prismaClient: PrismaClient;
  sessionStore: SessionStore;
}

/**
 * Owns the PureSDKNativeServer backend lifecycle.
 *
 * Construction is cheap (just stores deps); the real work happens in
 * `init()` called from server-class `start()`.
 */
export class MCPCoreManager {
  private readonly logger: Logger;
  private readonly prismaClient: PrismaClient;
  private readonly sessionStore: SessionStore;
  private _mcpServer: PureSDKNativeServerShape | null = null;

  constructor(opts: MCPCoreManagerOpts) {
    this.logger = opts.logger;
    this.prismaClient = opts.prismaClient;
    this.sessionStore = opts.sessionStore;
  }

  /**
   * Lazy getter for route-context `getMcpServer()` accessor.
   * Returns null before init(). Per Wave 4 Phase 4.4 SEC-C4 lazy-init
   * pattern — route handlers dereference this PER-REQUEST (after start()
   * has populated it), never at registration time.
   */
  get mcpServer(): PureSDKNativeServerShape | null {
    return this._mcpServer;
  }

  /**
   * Initialize the PureSDKNativeServer backend.
   *
   * Verbatim port of the prior server-class `setupMCPServer()` method body
   * (lines 205-246 of mcp-server-http-clean.js pre-Wave-7).
   *
   * MUST be called once from server-class `start()` BEFORE
   * `initializeAuthContext()`. Throws on init failure (fail-fast per
   * agent-execution Round 1 N1 — PM2 restart-on-crash is the right retry
   * layer; internal retry would mask DB/prompt-registry bugs).
   *
   * @returns the initialized PureSDKNativeServer instance (also available via
   *          `this.mcpServer` getter post-call)
   */
  async init(): Promise<PureSDKNativeServerShape> {
    try {
      this.logger.info('Initializing MCP server backend...');

      // The PureSDKNativeServer already initializes promptRegistry and
      // promptCommandHandler in its constructor, so we don't need to
      // override them here.
      this._mcpServer = new PureSDKNativeServer();

      // Start the MCP server to initialize prompt registry and load
      // database prompts.
      await this._mcpServer.start();
      this.logger.info('MCP server started - prompt registry and database prompts loaded');

      // Verify prompt handler initialization (dual-location read per
      // PureSDKNativeServerShape JSDoc).
      if (this._mcpServer.promptCommandHandler && this._mcpServer.server?.promptCommandHandler) {
        this.logger.info('Prompt command handler verified - already initialized by PureSDKNativeServer');
        this.logger.info(`Prompt registry has ${this._mcpServer.promptRegistry?.prompts?.size || 0} built-in prompts`);
        this.logger.info(`Prompt registry has ${this._mcpServer.promptRegistry?.dbPrompts?.size || 0} database prompts`);
      } else {
        this.logger.warn('Prompt command handler may not be properly initialized');
        // Log more details for debugging
        this.logger.info(`mcpServer.promptCommandHandler exists: ${!!this._mcpServer.promptCommandHandler}`);
        this.logger.info(`mcpServer.server exists: ${!!this._mcpServer.server}`);
        this.logger.info(`mcpServer.server.promptCommandHandler exists: ${!!this._mcpServer.server?.promptCommandHandler}`);
      }

      // PHASE 3 IMPROVEMENT (Priority 1): Don't block on resources.
      // Resources will be lazy-loaded on first access (63% faster HTTP sessions).
      if (this._mcpServer.resourcesReady) {
        this._mcpServer.resourcesReady
          .then(() => {
            this.logger.info('Database resources loaded successfully (background)');
          })
          .catch((err: Error) => {
            this.logger.warn(`Database resources failed to load, will retry on access: ${err.message}`);
          });
      }

      this.logger.info('MCP server backend initialized successfully (resources loading in background)');
      return this._mcpServer;
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize MCP server backend');
      throw error;
    }
  }

  /**
   * Seed initial auth context from `PAICHART_API_KEY` env var (if present).
   *
   * Verbatim port of the prior server-class `initializeAuthContext()` method
   * body (lines 1630-1665 of mcp-server-http-clean.js pre-Wave-7).
   *
   * MUST be called AFTER init() — throws if `this._mcpServer` is null,
   * preserving the D-H6 order check from Phase 0 inventory.
   */
  async initializeAuthContext(): Promise<void> {
    const apiKey = process.env.PAICHART_API_KEY;

    if (!apiKey) {
      this.logger.info('No API key found in environment - starting without initial context');
      return;
    }

    // C-CROSS-1 inline guard + narrowing (per arch-review verdict v2 Q1).
    // Matches existing line 1020 prior art in mcp-server-http-clean.js.
    if (!this._mcpServer) {
      throw new Error('MCPCoreManager.initializeAuthContext called before init() — _mcpServer is null');
    }
    const mcpServer = this._mcpServer;

    try {
      // ⚠️ SECURITY — THIS DECODES A JWT WITHOUT VERIFYING ITS SIGNATURE and then trusts the
      // payload to build an `authenticated: true` context defaulting to `role: 'ADMIN'`.
      // It is not remotely exploitable: the value comes from server-side env, so an attacker
      // able to set it already owns the host. But it means the process can begin life holding a
      // phantom admin identity derived from an unverified token.
      //
      // As of 2026-08-07 PAICHART_API_KEY is no longer written to .env.production (it was HS256
      // and has been unverifiable since the 2026-05-28 RS256 hardening — it returns HTTP 200
      // with an EMPTY payload, i.e. anonymous). With the var absent this method early-returns
      // above and the block below never runs.
      //
      // DO NOT re-introduce the variable to "fix" anything without first replacing this decode
      // with a real verification (jwtVerify against JWKS, algorithms: ['RS256']). Re-adding the
      // env var silently re-arms this path.
      // Check if API key is a JWT and set initial context.
      if (apiKey.startsWith('eyJ')) {
        const parts = apiKey.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as {
            userId?: string;
            sub?: string;
            email?: string;
            role?: string;
            name?: string;
          };

          const context = {
            user: {
              id: payload.userId || payload.sub || 'admin-user',
              email: payload.email || 'system@paichart.com',
              role: payload.role || 'ADMIN',
              name: payload.name || 'Admin User',
            },
            authenticated: true,
            authMethod: 'api_key',
          };

          mcpServer.setUserContext(context);
          this.logger.info('Authentication context initialized from API key');
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to initialize auth context from API key: ${(error as Error).message}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Phase 7.2 additions — processRequest + detectClientMode + handleStatelessRequest
  // (verbatim port from server-class processMCPRequest/detectClientMode/handleStatelessRequest)
  // ════════════════════════════════════════════════════════════════════

  /**
   * Detect client mode from request headers.
   *
   * Pure function (no `this` deps). Verbatim port of server-class
   * `detectClientMode()` (lines 838-873 of pre-Wave-7 mcp-server-http-clean.js).
   *
   * Per D-H4 from Phase 0 inventory + arch-review IMP-1 (verbatim preserved):
   * All 5 detection branches currently return `'persistent'`. The
   * `'stateless'` return path is unreachable in current production traffic
   * but preserved for future client compat. R11/R12 check `clientMode ===
   * 'stateless'` for the 405 / handleStatelessRequest dispatch — those
   * branches stay defensive even though never fired today.
   */
  detectClientMode(req: Request): 'persistent' | 'stateless' {
    const userAgent = (req.headers['user-agent'] || '') as string;
    const referer = (req.headers['referer'] || '') as string;
    const origin = (req.headers['origin'] || '') as string;

    // Claude Code pattern: Persistent sessions with claude-code user agent
    if (userAgent.includes('claude-code')) {
      return 'persistent';
    }

    // Claude.ai MCP integration: python-httpx user agent with claude.ai origin/referer
    if (userAgent.includes('python-httpx') &&
        (referer.includes('claude.ai') || origin.includes('claude.ai') || req.url?.includes('claude.ai'))) {
      return 'persistent';
    }

    // Claude.ai browser AND Claude Desktop GUI: Claude-User agent
    // CHANGED 2025-11-15: Use PERSISTENT mode for OAuth token persistence
    if (userAgent.includes('Claude-User')) {
      return 'persistent';
    }

    // ChatGPT pattern: openai-mcp user agent
    if (userAgent.includes('openai-mcp') || userAgent.toLowerCase().includes('chatgpt')) {
      return 'persistent';
    }

    // Default to persistent mode for unknown clients (safe fallback)
    return 'persistent';
  }

  /**
   * Process an MCP request through the proven backend.
   *
   * Verbatim port of server-class `processMCPRequest()` (lines 1019-1629
   * of pre-Wave-7 mcp-server-http-clean.js, 611 LOC, hot path 3182 hits/14d).
   *
   * **Plan v2 C-CROSS-1 (UNANIMOUS specialist fold)**: inline guard + local
   * `const mcpServer` at top, then narrowing applies throughout the 600 LOC
   * body. Matches the existing line 1020 prior art.
   *
   * **Phase 7.0a fixes (C-PRE-1 + C-PRE-2) preserved verbatim** in switch:
   * - `case 'ping'` returns `{ jsonrpc:'2.0', result:{}, id }` per MCP §6.4
   * - `case 'notifications/message' | 'notifications/progress' |
   *   'notifications/initialized'` share spec-compliant 202 path
   *
   * **D6 fold**: `VALID_MCP_METHODS` imported from `./mcp-methods` (was
   * inline const in pre-Wave-7).
   *
   * **I-CROSS-6 fold**: `parseResourceUri()` extracted to `./mcp-resource-uri`
   * (eliminates the URI-shape vs cache-key split-brain that mcp-protocol-
   * debug discovery prompt warned about).
   *
   * **mcp-protocol-debug I1 fold**: `enforceToolSecurity` imported at
   * top-of-file (was inline lazy require at line 1125 pre-Wave-7).
   *
   * **C2 agent-execution + C3 boundary-contract fold**: `this.prismaClient`
   * (injected via constructor per D5) replaces direct module-level `prisma`
   * usage in resources/read execution-data path.
   */
  async processRequest(request: unknown, user: unknown): Promise<unknown> {
    // C-CROSS-1 inline guard + narrowing. Single per-method call site.
    if (!this._mcpServer) {
      throw new Error('MCPCoreManager.processRequest called before init() — _mcpServer is null');
    }
    const mcpServer = this._mcpServer;

    // Narrow request/user shapes used inside the method body.
    const req = request as { method?: string; params?: { name?: string; arguments?: unknown; uri?: string; protocolVersion?: string }; id?: unknown };
    const usr = user as { id?: string; userId?: string; email?: string; role?: string; token?: string; azp?: string; authMethod?: string } | null | undefined;

    try {
      // Set user context for the MCP server
      // CRITICAL: Include token for API forwarding (fixes admin auth fallback issue).
      // boundary-contract round 1 Critical #3: DO NOT REMOVE the token line — the
      // front-door Tier 1 fast-path at /api/* still uses it. U2 Phase D site #8
      // adds `azp` adjacent so per-call mint sites can preserve client-binding.
      if (usr) {
        mcpServer.setUserContext({
          user: {
            id: usr.userId || usr.id,
            email: usr.email,
            role: usr.role,
            token: usr.token,  // P0-2 FIX: Forward user's JWT token for API calls
            azp: usr.azp,      // U2 Phase D site #8 (2026-05-19): client-binding for per-call mint forensics
          },
          authenticated: true,
          authMethod: usr.authMethod || 'unknown',
        });
      } else {
        mcpServer.setUserContext({
          user: null,
          authenticated: false,
        });
      }

      // D6 fold: VALID_MCP_METHODS imported from ./mcp-methods (was inline const).
      // Validate method FIRST (before session check)
      if (!(VALID_MCP_METHODS as readonly string[]).includes(req?.method || '')) {
        return {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
            data: `Method '${req?.method}' is not supported`,
          },
          id: req?.id || null,
        };
      }

      switch (req?.method) {
        case 'initialize': {
          // Support both Claude.ai browser (2025-03-26) and Claude Desktop (2025-06-18) protocol versions
          const clientProtocolVersion = req.params?.protocolVersion;
          const supportedVersions = ['2025-03-26', '2025-06-18'];
          // Use client's protocol version if supported, otherwise default to latest
          const responseProtocolVersion = clientProtocolVersion && supportedVersions.includes(clientProtocolVersion)
            ? clientProtocolVersion
            : '2025-06-18';
          // 2026-05-31: surface `instructions` on the HTTP initialize (stdio↔HTTP parity).
          // Live single-source from the owned SDK server (getServerInstructions); null-guarded
          // (?.) as defensive depth — init() is awaited before listen() so _mcpServer is
          // non-null here, but the ordering guarantee lives in a different file. Omit the key
          // entirely if absent (don't emit `instructions: undefined`).
          const serverInstructions = mcpServer?.getServerInstructions?.();
          // I3: serverInfo aligned with the stdio SDK Server (mcp-server-v5.js:136-138) to
          // end the split-brain (was paichart-mcp-sdk/1.0.0). I4: capabilities left FLAT —
          // do NOT advertise stdio's resources.subscribe/listChanged on HTTP (over-promise).
          return {
            jsonrpc: '2.0',
            result: {
              protocolVersion: responseProtocolVersion,
              capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} },
              serverInfo: { name: 'paichart', version: '5.0.0' },
              ...(serverInstructions ? { instructions: serverInstructions } : {}),
            },
            id: req.id,
          };
        }

        case 'tools/list': {
          // Tool filtering delegated to business logic layer (single source of truth)
          const filteredTools = mcpServer.getToolsForUser(usr);
          return {
            jsonrpc: '2.0',
            result: { tools: filteredTools },
            id: req.id,
          };
        }

        case 'tools/call': {
          const toolName = req.params?.name || '';
          const toolArgs = req.params?.arguments || {};

          // P1.1: Enforce tool security before execution (top-of-file import per mcp-protocol-debug I1)
          try {
            enforceToolSecurity(toolName, { user: usr, authenticated: !!usr });
          } catch (securityError) {
            throw {
              code: -32001,
              message: (securityError as Error).message,
              data: { tool: toolName, required: 'Authentication or authorization failed' },
            };
          }

          const handler = mcpServer.toolHandlers.get(toolName);
          if (!handler) {
            throw new Error(`Tool not found: ${toolName}`);
          }

          try {
            const result = await handler(toolArgs, { user: usr, authenticated: !!usr }) as { content?: unknown } | string | object | null;
            // Format response for MCP protocol compliance
            let mcpResult: unknown;
            if (result && typeof result === 'object' && 'content' in result && (result as { content?: unknown }).content) {
              mcpResult = result;
            } else if (typeof result === 'string') {
              mcpResult = { content: [{ type: 'text', text: result }] };
            } else if (result && typeof result === 'object') {
              mcpResult = { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            } else {
              mcpResult = { content: [{ type: 'text', text: 'No response data' }] };
            }
            return { jsonrpc: '2.0', result: mcpResult, id: req.id };
          } catch (toolError) {
            throw toolError;
          }
        }

        case 'prompts/list': {
          const availablePrompts = mcpServer?.promptRegistry?.listPrompts({ user: usr }) || [];
          return {
            jsonrpc: '2.0',
            result: {
              prompts: availablePrompts.map((prompt) => ({
                name: prompt.name,
                description: prompt.description || prompt.summary || 'No description available',
                arguments: prompt.parameters || [],
              })),
            },
            id: req.id,
          };
        }

        case 'prompts/get': {
          const promptName = req.params?.name;
          const promptArgs = req.params?.arguments || {};

          if (!promptName) {
            throw new Error('Prompt name is required');
          }

          try {
            const prompt = await mcpServer?.promptRegistry?.getPrompt(promptName, { user: usr });
            if (!prompt) {
              throw new Error(`Prompt not found: ${promptName}`);
            }

            let promptContent: string;
            if (typeof prompt.content === 'function') {
              promptContent = await prompt.content(promptArgs);
            } else {
              promptContent = prompt.content || 'No content available';
            }

            return {
              jsonrpc: '2.0',
              result: {
                description: prompt.description,
                messages: [{ role: 'user', content: { type: 'text', text: promptContent } }],
              },
              id: req.id,
            };
          } catch (promptError) {
            throw promptError;
          }
        }

        case 'resources/list': {
          // P1 fix (Feb 2026): POV-scoped filtering for authenticated users
          try {
            const allResources = (await mcpServer?.resourceManager?.listResources()) || [];

            // Include hub resources (parity with mcp-server-v5.js)
            try {
              const hubResources = (await mcpServer?.hubResourceProvider?.listResources()) || [];
              allResources.push(...(hubResources as typeof allResources));
            } catch (hubErr) {
              this.logger.warn(`Failed to list hub resources: ${(hubErr as Error).message}`);
            }

            // Filter resources based on authentication state (sec-ops requirement)
            const publicResourcePatterns = [
              'mcp://hub-info',
              'mcp://service-catalog',
              'mcp://public-services',
              'mcp://hub/',
            ];

            let filteredResources: typeof allResources;
            if (!usr) {
              filteredResources = allResources.filter((r) =>
                publicResourcePatterns.some((pattern) => r.uri.startsWith(pattern))
              );
            } else if (usr.role === 'ADMIN' || usr.role === 'SUPER_ADMIN') {
              filteredResources = allResources;
            } else {
              const userId = usr.userId || usr.id;
              filteredResources = allResources.filter((r) => {
                if (!r.metadata?.povContext && !r.metadata?.povId) return true;
                const povCtx = r.metadata?.povContext;
                if (!povCtx) return true;
                return povCtx.ownerId === userId ||
                       (povCtx.teamMemberIds && povCtx.teamMemberIds.includes(userId || '')) ||
                       povCtx.isDemo === true;
              });
            }

            return {
              jsonrpc: '2.0',
              result: {
                resources: filteredResources.map((resource) => ({
                  uri: resource.uri,
                  name: resource.name || resource.uri,
                  description: resource.description || 'No description available',
                  mimeType: resource.mimeType || resource.metadata?.mimeType || 'text/plain',
                })),
              },
              id: req.id,
            };
          } catch (resourceError) {
            this.logger.error(`Resource listing error: ${(resourceError as Error).message}`);
            return { jsonrpc: '2.0', result: { resources: [] }, id: req.id };
          }
        }

        case 'resources/read': {
          try {
            const readUri = req.params?.uri;
            if (!readUri) {
              return {
                jsonrpc: '2.0',
                error: { code: -32602, message: 'Missing required parameter: uri' },
                id: req.id,
              };
            }

            // Hub resources have their own provider
            if (readUri.startsWith('mcp://hub/')) {
              this.logger.info(`Reading hub resource via HTTP: ${readUri}`);
              const hubResult = await mcpServer?.hubResourceProvider?.readResource(readUri);
              return {
                jsonrpc: '2.0',
                result: hubResult || { contents: [{ uri: readUri, mimeType: 'text/plain', text: 'Hub resource not available' }] },
                id: req.id,
              };
            }

            const resourceManager = mcpServer?.resourceManager;
            if (!resourceManager) {
              return {
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Resource manager not initialized' },
                id: req.id,
              };
            }

            // I-CROSS-6 fold: parseResourceUri extracted to ./mcp-resource-uri
            const { resourceType, resourceId, cacheKey, includeContent } = parseResourceUri(readUri);

            // Pre-discover if cache is empty for artifacts
            const readCachedIds = resourceManager.getCachedResourceIds();
            if (resourceType === 'artifacts' && readCachedIds.length === 0) {
              await resourceManager.discoverArtifactResources({ limit: 100 });
            }

            let readResource = await resourceManager.getResource(cacheKey, includeContent);

            // Retry with discovery if not found for artifacts
            if (!readResource && resourceType === 'artifacts') {
              await resourceManager.discoverArtifactResources({ limit: 100 });
              readResource = await resourceManager.getResource(cacheKey, includeContent);
            }

            if (!readResource) {
              return {
                jsonrpc: '2.0',
                error: { code: -32602, message: `Resource not found: ${readUri}` },
                id: req.id,
              };
            }

            // POV access validation for authenticated users.
            // 2026-05-27 (embedded-server authz audit): this gate is FAIL-OPEN when
            // metadata.povContext is absent — it only validates resources that carry it
            // (global resources like agent-templates / hub legitimately have none). A
            // POV-scoped resource type lacking povContext would therefore NOT be gated here.
            // INVARIANT: POV-scoped resource *content methods* must self-scope at the source
            // (thread userContext + validateMCPPOVAccess / buildPOVAccessFilter), as
            // getPOV/Task/Execution/ArtifactContent do — do NOT rely on this gate alone.
            if (usr && readResource.metadata?.povContext) {
              const povCtx = readResource.metadata.povContext;
              const userId = usr.userId || usr.id;
              const isOwner = povCtx.ownerId === userId;
              const isTeamMember = povCtx.teamMemberIds?.includes(userId || '');
              const isDemo = povCtx.isDemo;
              const isAdmin = usr.role === 'ADMIN' || usr.role === 'SUPER_ADMIN';

              if (!isOwner && !isTeamMember && !isDemo && !isAdmin) {
                this.logger.warn(`POV access denied for resources/read: user=${userId}, pov=${povCtx.id}`);
                return {
                  jsonrpc: '2.0',
                  error: { code: -32600, message: 'Access denied: insufficient POV permissions' },
                  id: req.id,
                };
              }
            }

            // Build MCP-compliant content response
            let readContent: { uri: string; mimeType: string; text: string };

            if (resourceType === 'executions' && resourceId) {
              // Fetch full execution data from database (C2 + C3 fold: this.prismaClient)
              try {
                const execution = await (this.prismaClient as unknown as { agentExecution: { findUnique: (args: { where: { id: string }; include: unknown }) => Promise<Record<string, unknown> | null> } }).agentExecution.findUnique({
                  where: { id: resourceId },
                  include: {
                    task: { include: { pov: true, phase: true } },
                    agentTemplate: true,
                  },
                });

                // 2026-07-26 (Bug Class 80): this hand-written cast FABRICATED four fields that have
                // never existed on agent_executions — `completedAt` (the column is `endTime`),
                // `result` (results live in artifacts), and `error` (now `errorCode`). A cast is a
                // claim the compiler cannot check, so every read below type-checked and shipped
                // `undefined`: `metrics.duration` was ALWAYS null and `metrics.tokens` ALWAYS null.
                // Shape corrected to the real columns; token facts are the structured *Tokens columns.
                const exec = execution as { id: string; status: string; createdAt: Date; endTime: Date | null; errorCode: string | null; inputTokens: number | null; outputTokens: number | null; task: unknown; agentTemplate: unknown } | null;
                const execData = exec ? {
                  ...readResource.metadata,
                  execution: {
                    id: exec.id,
                    status: exec.status,
                    createdAt: exec.createdAt,
                    endTime: exec.endTime,
                    errorCode: exec.errorCode ?? null,
                    task: exec.task,
                    template: exec.agentTemplate,
                    metrics: {
                      duration: exec.endTime
                        ? new Date(exec.endTime).getTime() - new Date(exec.createdAt).getTime()
                        : null,
                      tokens: (exec.inputTokens ?? 0) + (exec.outputTokens ?? 0) || null,
                    },
                  },
                } : readResource.metadata;

                readContent = {
                  uri: readResource.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(execData, null, 2),
                };
              } catch (dbErr) {
                this.logger.error(`Error fetching execution data for resources/read: ${(dbErr as Error).message}`);
                readContent = {
                  uri: readResource.uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(readResource.metadata || {}, null, 2),
                };
              }
            } else if (resourceType === 'artifacts' && readResource.content) {
              readContent = {
                uri: readResource.uri,
                mimeType: readResource.metadata?.mimeType || 'text/plain',
                text: readResource.content,
              };
            } else if (resourceType === 'artifacts') {
              const resourceWithContent = await resourceManager.getResource(cacheKey, true);
              if (resourceWithContent?.content) {
                readContent = {
                  uri: resourceWithContent.uri,
                  mimeType: resourceWithContent.metadata?.mimeType || 'text/plain',
                  text: resourceWithContent.content,
                };
              } else {
                readContent = {
                  uri: readResource.uri,
                  mimeType: readResource.metadata?.mimeType || 'application/json',
                  text: JSON.stringify({ error: 'Content not available', resource: readResource.metadata || {} }, null, 2),
                };
              }
            } else {
              readContent = {
                uri: readResource.uri,
                mimeType: readResource.metadata?.mimeType || 'application/json',
                text: JSON.stringify(readResource.metadata || {}, null, 2),
              };
            }

            return {
              jsonrpc: '2.0',
              result: { contents: [readContent] },
              id: req.id,
            };
          } catch (readError) {
            this.logger.warn(`Error in resources/read: ${(readError as Error).message}`);
            return {
              jsonrpc: '2.0',
              result: {
                contents: [{
                  uri: req.params?.uri || 'unknown',
                  mimeType: 'text/plain',
                  text: `Error: ${(readError as Error).message}`,
                }],
              },
              id: req.id,
            };
          }
        }

        case 'ping':
          // C-PRE-2 fix preserved verbatim from Phase 7.0a.
          // MCP Spec §6.4: ping returns an empty result.
          return { jsonrpc: '2.0', result: {}, id: req.id };

        case 'notifications/initialized':
        case 'notifications/message':
        case 'notifications/progress':
          // C-PRE-1 fix preserved verbatim from Phase 7.0a.
          // MCP Spec: Notifications MUST return 202 Accepted with no body.
          return { statusCode: 202, specCompliant: true, message: 'notification' };

        default:
          return { jsonrpc: '2.0', result: { success: true, method: req?.method }, id: req.id };
      }
    } catch (error) {
      const err = error as { code?: number; message?: string };
      const errorCode = err.code || -32603;
      const errorMessage = err.message || 'Internal error';

      const isValidationError = errorMessage.includes('Validation failed') ||
                                errorMessage.includes('already registered') ||
                                errorMessage.includes('required') ||
                                errorMessage.includes('invalid');

      this.logger.error({ err: error, tool: req?.params?.name }, 'Tool execution error');

      return {
        jsonrpc: '2.0',
        error: {
          code: isValidationError ? -32602 : errorCode,
          message: errorMessage,
        },
        id: req?.id || null,
      };
    }
  }

  /**
   * Process a stateless request (Claude.ai browser pattern).
   *
   * Verbatim port of server-class `handleStatelessRequest()` (lines 875-933
   * of pre-Wave-7 mcp-server-http-clean.js).
   *
   * **I-CROSS-10 fold (agent-execution Round 1 I4)**: cleanup now in
   * `finally` block — catch-path leaks were possible pre-Wave-7 if
   * processRequest threw before reaching the cleanup line.
   */
  async handleStatelessRequest(req: Request, res: Response): Promise<void> {
    // Create temporary session for this request only
    const tempSessionId = crypto.randomUUID();
    let cleanupNeeded = true;

    try {
      const reqWithUser = req as Request & { user?: unknown };

      // Create minimal transport placeholder
      const tempTransport = {
        sessionId: tempSessionId,
        created: new Date(),
        temporary: true,
      };

      // Create temporary session context
      const tempContext = {
        user: reqWithUser.user,
        authenticated: !!reqWithUser.user,
        authMethod: reqWithUser.user ? 'api_key' : null,
        createdAt: new Date(),
        temporary: true,
      };

      // Store with bounded limits (time-bomb-detection-pattern.md).
      // Cast tempContext through `unknown` — SessionContext shape is more
      // restrictive than the original server-class tempContext usage (which
      // passed `req.user` as raw object). Preserves verbatim runtime behavior.
      this.sessionStore.setSession(tempSessionId, tempTransport, tempContext as unknown as Parameters<typeof this.sessionStore.setSession>[2]);

      // Process request through proven backend
      const response = await this.processRequest(req.body, reqWithUser.user) as { specCompliant?: boolean; statusCode?: number } | null | undefined;

      // Handle MCP spec-compliant responses
      if (response?.specCompliant && response?.statusCode === 202) {
        res.status(202).end();
        return;
      }

      // Send regular response
      if (response) {
        res.status(200).json(response);
      } else {
        res.status(200).json({ success: true });
      }
    } catch (error) {
      this.logger.error(`Stateless request error: ${(error as Error).message}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    } finally {
      // I-CROSS-10 (agent-execution I4): cleanup runs even on catch path.
      // Pre-Wave-7 had cleanup AFTER res.json() — error path leaked sessions
      // until 30-min SessionStore TTL.
      if (cleanupNeeded) {
        this.sessionStore.deleteSession(tempSessionId);
        cleanupNeeded = false;  // belt-and-suspenders
      }
    }
  }
}
