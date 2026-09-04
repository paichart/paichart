# mcp-hub-specialist — Domain Library

> **Created 2026-06-11** (Protocol 12 wave 2): depth evicted from `.claude/agents/mcp-hub-specialist.md`.
> Verbatim at eviction; dates are provenance. The paired discovery's proven greps outrank this file.

## [evicted] Domain Expertise

Expert in pAIchart's revolutionary MCP Hub - the world's first conversational AI service registry where services register, discover, and orchestrate through pure MCP protocol.

## [evicted] Core Responsibilities

### 1. Service Registry Management
- Service registration via `registry(action: 'register')` tool and register_guide database prompt
- Service discovery optimization and capability matching
- Service health monitoring and performance tracking
- Service ownership and authentication management

### 2. Cross-Service Orchestration
- Multi-service workflow design via workflow_guide database prompt
- Service-to-service communication via `services(action: 'call')` tool
- Service dependency management and integration patterns
- Real-time service coordination and monitoring

### 3. Hub Infrastructure
- MCPTool database model optimization for service storage
- MCP tool and prompt architecture for hub operations
- HTTP server configuration for cross-platform access
- Authentication context management for secure service operations

### 4. Production Service Onboarding
- Real-world MCP service integration (Sentry, Linear, Notion, etc.)
- Service capability assessment and categorization
- Production deployment and monitoring setup
- Service ecosystem growth and community management

### 5. Modular Architecture Management (Dec 2025)
- 19 extracted handler modules (14 hub + 5 advanced)
- Facade pattern with dependency injection (hub-tools-handler.js, sdk-native-advanced-tools.js)
- Hub handlers: registration, discovery, health, calling, update, delete, tools, user-services, prompts, workflow + utilities/middleware
- Advanced handlers: task context/action, agent results, AI recommendations, analytics
- Handler extraction and refactoring guidance with 100% backward compatibility

### 6. Performance Optimization (Dec 2025)
- Database index design for discovery queries (composite + GIN indices)
- Query parallelization patterns (Promise.all for count + findMany)
- Caching strategies (discovery 60s TTL, health 30s TTL)
- Cache invalidation on mutations (register, update, delete)
- LRU eviction for memory management
- Realtime bypass parameters for critical operations (health checks)

### 7. Testing Architecture (Dec 2025, updated Mar 2026)
- Dual-layer MCP test suites (pattern validation + behavior verification)
- 35+ MCP tests across 10 suites + essentials smoke tests (hub, POV/task, resources)
- Test-driven refactoring protection (all modules tested)
- Following formal validation-testing-architecture.md
- Essentials smoke tests: `hub-and-logging-essentials-test.md`, `pov-task-lifecycle-essentials-test.md`, `mcp-resources-essentials-test.md`

### 8. Production Deployment (Dec 2025)
- Database drift elimination (db push everywhere, no migrations)
- GitHub Actions workflow alignment (production = development schema management)
- Zero-downtime index additions (concurrent create)
- Health monitoring and statistics tracking
- Real service calling and health checks (no simulation)

### 9. Workflow System & Performance Monitoring (Jan 2026)
- MCPWorkflowExecution model for execution tracking (PREDEFINED vs AD_HOC modes)
- MCPServiceOrchestrationHandler for multi-service orchestration
- Orchestration modes: sequential, parallel, conditional (with dependency graphs)
- Failure strategies: stop, continue, rollback
- Activity integration: WORKFLOW_EXECUTED action type for task timeline
- **System Limits** (Jan 2026 Quarterly Review):
  - `MAX_CONCURRENT_EXECUTIONS_PER_USER`: 10 (prevents resource exhaustion)
  - `MAX_STEPS_PER_WORKFLOW`: 20 (Zod schema)
  - `maxConcurrent`: 5 parallel steps (orchestration-engine.js)
  - Reference: `/.claude/knowledge/domain/mcp/mcp-hub-workflow-orchestration-reference.md` (System Limits Reference)

### 10. Compliance Policy & Cross-Service Security (Jan 2026, BC70 fix Mar 2026)
- **service-call-policy.js**: Anthropic-compliant validation for cross-service calls
- **Static Whitelist**: APPROVED_TOOLS array (~40 safe operations)
- **Dynamic Whitelist**: Registered service tools auto-whitelisted at call time
- **isTrustedInternalService()**: Central helper (BC70) checks both `name` and `id` for SSRF bypass — handles seeded services (title-case names) vs user-registered (kebab-case)
- **Blocked Patterns**: 12+ regex patterns blocking dangerous operations (injection, path traversal, etc.)
- **Blocked URLs**: SSRF protection for internal networks, cloud metadata endpoints
- **Size Limits**: 100KB params, 1MB response, max call depth 3

### 11. Docker Internal Services (Jan 2026, BC70 fix Mar 2026)
- **browser-automation-service**: Playwright-based MCP server (port 3100, SSE transport)
  - Tools: scrape_page, fill_form, click_element, take_screenshot, generate_pdf, run_script, trace_session
  - Seed script: `scripts/seed-browser-automation-service.ts`
  - DB name: "Browser Automation Service" (title-case — seeded services use human-readable names)
- **notification-service**: Multi-channel notification MCP server (port 3101, SSE transport)
  - Tools: send, broadcast, escalate, schedule
  - Seed script: `scripts/seed-notification-service.ts`
  - DB name: "Notification Service" (title-case)
- **BC70 Fix**: Seeded services have title-case DB names but kebab-case IDs. `isTrustedInternalService()` checks both to ensure SSRF bypass works for all trusted services
- **Key distinction**: Internal services use seed scripts (admin bypass), external use `registry(action: 'register')` (audited)

### 12. registry(action: 'update') Enhancements (Jan 2026)
- **Feature Plan**: `/cline_docs/reviews/mcp-hub-update-service-enhancements-2026-01-08/mcp-hub-update-service-enhancements.md`
- **New Fields**: healthCheckPath, permissions (publicAccess, maxExecutionTime, rateLimit)
- **Deferred**: credentials field (requires encryption-at-rest)
- **Consumer Tool Alignment**: 7 consumer tools must be updated (not just producer)
- **Key Pattern**: Producer→Database→Consumer flow requires all three to be updated
- **MCPServiceOrchestrationHandler Integration**: P2.5 task to verify rate limiting in orchestration
- **Total Effort**: 21-29 hours (includes orchestration integration)

### 13. Internal Service Infrastructure (Jan 2026)
- **InternalServiceRouter**: Routes `internal://` calls directly to pAIchart handlers (no HTTP)
- **File**: `/lib/mcp/server/tools/internal/InternalServiceRouter.js`
- **Services Registered**:
  - `paichart-project-service` (consolidated from paichart-pov-service + paichart-task-service):
    - project: pov.list, pov.details, task.list, task.context
    - perform: task.update, task.complete, agent.execute, etc.
- **Endpoint Pattern**: `internal://pov`, `internal://task` (configuration.type = 'internal')
- **Context Normalization**: Handles both MCP (context.user.id) and Hub API (context.apiUserContext.userId) patterns
- **Health Checks**: Internal services always return healthy (same process, no HTTP ping)
- **Registration Script**: `/scripts/register-internal-services.ts` via `npm run mcp:register-internal`
- **Key Benefit**: Zero network overhead for pAIchart's own service calls

### 14. Shared Orchestration Engine Pattern (Jan 2026)
- **Pure JS Core**: `/lib/services/workflow/core/orchestration-engine.js`
- **Used By Both**:
  - MCP Hub: `workflow-tools-handler.js` (JS)
  - API Routes: `mcpOrchestrationHandler.ts` (TS via require)
- **Engine Features**:
  - Variable chaining: `{{step.N.output.field}}` with array access
  - Dependency analysis: Topological sort for execution order
  - Circular dependency detection: DFS-based cycle detection
  - Execution modes: sequential, parallel, conditional
  - Failure strategies: stop, continue, rollback
- **Two-Step Validation**: Zod schema (types) → Engine.validate() (business logic)
- **Parity Achievement**: 100% feature parity between JS and TS handlers
- **Security Compliance**: validateServiceCall(), connection pooling, PII filtering
- **Documentation**: `/cline_docs/reviews/mcp-hub-cross-service-2026-01-11/completion-summary.md`

### 15. Transport Architecture (Jan 2026 - WebSocket Removed)
- **HTTP/HTTPS Only**: WebSocket transport removed from codebase (Jan 2026)
- **SSE Transport**: `SSEClientTransport` for external MCP service connections
- **Streamable HTTP**: POST /mcp for Anthropic Directory compliance
- **Connection Pooling**: `ServiceConnectionPool` for 100-200ms savings per external call
- **Real-time Events**: PostgreSQL NOTIFY/LISTEN replaces WebSocket for internal events
- **Files Updated**: service-call-handler.js, service-connection-pool.js (reject ws:// endpoints)

### 16. Named Workflow System & GUI (Jan 2026)
- **Named Workflows**: `workflowName` parameter for `services(action: 'workflow.execute')` MCP tool
- **REST API**: `/api/workflows` (CRUD), `/api/workflows/run` (execute by name)
- **Admin-only Access**: `createHandler` with `allowedRoles: [ADMIN, SUPER_ADMIN]`
- **MCPWorkflow Schema**: `name` (unique), `category`, `description`, `steps` (JSON), `createdBy`
- **Workflow GUI**: `/workflows` route with Bloomberg-style terminal UI
- **GUI Components**:
  - `WorkflowTerminal`: CRUD operations with list/create/edit/delete/run
  - `RecommendationEngine`: Service discovery + workflow suggestions
  - `WorkflowEditor`: Step builder with service/tool autocomplete
- **Files**:
  - `app/(authenticated)/workflows/` - Page structure
  - `components/workflows/` - UI components
  - `app/api/workflows/route.ts` - REST endpoints
  - `app/api/mcp/services/route.ts` - Admin-only services endpoint

### 17. Recommendation Engine (Jan 2026)
- **Location**: `components/workflows/RecommendationEngine.tsx`
- **Current Score**: 6/10 (client-side generation with category-based matching)
- **Architecture**: Dynamic recommendations generated based on registered services
- **Service Matching**: Category-based (`hasCategory()`) + tool-based (`hasTool()`) helpers
- **Recommendation Types**: service-combo, template, tool-chain, idle-service, parameter-hint
- **No Hardcoded Services**: Monitoring services auto-discovered (not Sentry-specific)
- **Recommendation Engine**: Phase 1.5 complete — data-driven generators, persisted to DB, preview endpoint. See `/.claude/knowledge/domain/mcp/TODO-autonomous-management-agent.md`
- **Key Pattern**: Services discovered by `capabilities.categories` array, not name matching

### 18. Server-to-Server Communication & Workflow Tracking (Jan 2026)
- **Internal URL Fix**: Use `127.0.0.1` (not `localhost`) for server-to-server calls to avoid nginx 504 deadlock
  - Config: `APP_INTERNAL_BASE_URL=http://127.0.0.1:3000` in `.env`
  - Implementation: `lib/mcp/server/config/server-config.js` → `api.internalBaseUrl`
  - API Client: `lib/mcp/server/utils/api-client.js` uses internal URL for all MCP→API calls
- **node-fetch Bundling**: Add to `serverComponentsExternalPackages` in `next.config.js` to prevent "s is not a function" error
  ```javascript
  experimental: {
    serverComponentsExternalPackages: ['@modelcontextprotocol/sdk', 'node-fetch']
  }
  ```
- **Both Workflow Handlers ACTIVE**: TS (`mcpOrchestrationHandler.ts`) and JS (`workflow-tools-handler.js`) are BOTH used
  - JS handler: MCP Hub tool calls (Claude Desktop, ChatGPT)
  - TS handler: REST API calls (`/api/workflows/run`)
  - Both share: `orchestration-engine.js` core (100% feature parity)
- **Workflow Execution Tracking**: Named workflows now properly link to MCPWorkflowExecution
  - `workflowId` passed through 5-layer execution chain:
    1. `lib/workflows/handlers.ts` - captures `workflow.id` from database
    2. `lib/services/workflow/index.ts` - passes `workflowId` to engine
    3. `lib/services/workflow/workflowEngine.ts` - uses `config.workflowId` (not generated UUID)
    4. `lib/services/workflow/handlers/mcpOrchestrationHandler.ts` - passes to `orchConfig`
    5. `lib/services/workflow/tracking/orchestration-tracker.ts` - links execution to MCPWorkflow
  - `MCPExecutionMode.PREDEFINED` for named workflows, `AD_HOC` for inline
  - Stats updated on completion: `executionCount`, `successRate`, `lastExecution`, `averageTime`
  - **Debug grep**: `grep -n "workflowId" lib/services/workflow/**/*.ts lib/workflows/handlers.ts`

### 19. Workflow Executions API & Cleanup (Jan 2026)
- **New Endpoint**: `GET /api/workflows/executions` - List workflow executions (Admin only)
  - Query params: `workflowId` (CUID), `status` (nativeEnum), `limit`, `offset`
  - Validation: `ListExecutionsQuerySchema` with `.cuid()` and `z.nativeEnum(MCPWorkflowExecutionStatus)`
  - Handler: `handleListExecutions` in `lib/workflows/handlers.ts`
  - Route: `app/api/workflows/executions/route.ts`
- **Time Bomb Fix**: Comprehensive cleanup in compliance-monitor.js
  - Runs on startup + every 24 hours
  - Pattern: time-bomb-detection-pattern.md (Category 2 - Missing Cleanup Schedulers)
  - **Retention Policy**:
    | Table | Retention |
    |-------|-----------|
    | `MCPWorkflowExecution` | 90 days |
    | `Activity` | 180 days |
    | `TaskActivity` | 90 days |
    | `MCPInteraction` | 30 days |
    | `AgentArtifact` | 30 days |
    | `Notification` (read) | 7 days |
    | `RefreshToken` | Expired removed |
- **Rate Limiting Fix**: Internal calls bypass rate limiting
  - Problem: All internal calls (127.0.0.1) shared single rate limit bucket via 'unknown' identifier
  - Solution: Skip rate limiting when no `x-forwarded-for` or `x-real-ip` headers (direct localhost)
  - File: `lib/api-handler.ts` - `isInternalCall` check before rate limit application
  - Rationale: Internal calls are authenticated and trusted; rate limiting protects against external abuse
- **Steps JSON Transformation**: Fixed nested JSON structure for frontend
  - DB stores: `{ steps: [...], executionMode, timeout, failureStrategy }`
  - Frontend expects: `steps` as array directly
  - Transform in: `handleListWorkflows`, `handleGetWorkflow`
- **Specialist Reviews**: api-efficiency (91%) + validation-engine (82%) = 86.5% combined

### 20. JWT/JWKS & Trust Level System (Phase 2 - Jan 2026)
### 21. Streamable HTTP Client Transport (Jan 23, 2026)
- **Implementation**: `lib/mcp/server/utils/service-connection-pool.js` (commit 196c1f8e)
- **Transport Auto-Detection**: `url.pathname.endsWith('/sse')` → SSE, else → Streamable HTTP
- **Client Imports**:
  - `SSEClientTransport` from `@modelcontextprotocol/sdk/client/sse.js`
  - `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`
- **Benefits**:
  - Works through corporate firewalls (no VPN required)
  - Perfect for serverless deployments (AWS Lambda, Cloudflare Workers)
  - Standard HTTP POST (universal compatibility)
- **Backwards Compatible**: SSE services (notification, browser-automation) continue working
- **Real-World Service**: Alpha Vantage MCP (financial data, 113 tools)
- **Documentation Updated**: Streamable HTTP now recommended for external services

### 22. MCP SDK Upgrade to v1.25.3 (Jan 23, 2026)
- **Previous Version**: `@modelcontextprotocol/sdk@1.17.5` (6 months old)
- **Current Version**: `@modelcontextprotocol/sdk@1.25.3` (8 versions, 2 months of fixes)
- **Critical Fix**: PR #1214 (v1.24.3) - "Release HTTP connections after POST responses"
  - Bug: Pooled Streamable HTTP connections not released properly
  - Symptom: Fresh connections work, pooled connections fail with "missing arguments"
  - Impact: 50% success rate → 100% success rate
- **Additional Fixes**:
  - v1.24.0: StreamableHTTPClientTransport instantiation correction
  - v1.24.0: SSE reconnection improvements
  - v1.25.2: ReDoS vulnerability fix (security CVE)
- **Peer Dependency**: Zod upgraded to v3.25.76 (SDK requires v3.25+)
- **Validation**: Alpha Vantage double-call test passes (both succeed)
- **Investigation**: `cline_docs/bug-streamable-http-connection-pooling-2026-01-23.md`

### 23. Service Field Location Standardization (Jan 23, 2026)
- **Problem**: publicAccess stored in both `permissions` and `configuration` columns
- **Impact**: Required dual-location checks in 3+ handlers, workflows failed
- **Solution**: Semantic standardization (commit 1fb6185c + Phase 2 migration + Phase 3 cleanup)
  - **permissions column**: Access control (WHO can access)
    - `publicAccess`: Everyone vs owner-only
    - `canModify`, `canDelete`, `owner`: ACL fields
  - **configuration column**: Operational settings (HOW service operates)
    - `endpoint`, `category`, `healthCheckPath`: Service settings
    - `rateLimit`, `maxExecutionTime`: Operational limits
- **Files Modified** (6 files):
  - Seed scripts: Moved operational settings from permissions to configuration
  - service-registration-handler.js: Added publicAccess default (false)
  - service-update-handler.js: Separated permissions from configuration updates
  - tool-schemas.js: Flattened API structure (BREAKING CHANGE)
- **Breaking API Change**:
  - OLD: `updates: { permissions: { rateLimit: {...}, maxExecutionTime: 45000 } }`
  - NEW: `updates: { rateLimit: {...}, maxExecutionTime: 45000, permissions: { publicAccess: true } }`
- **Migration**: SQL script moved data, validated all 5 services correct
- **Rule of Thumb**: "WHO vs HOW" determines column (access control vs operational)
- **Documentation**: `cline_docs/task-standardize-service-field-locations-2026-01-23.md`

### 24. Alpha Vantage Integration (Jan 23, 2026) - Production Example
- **Service**: Official Alpha Vantage MCP server (https://mcp.alphavantage.co/mcp)
- **Transport**: Streamable HTTP (first production Streamable HTTP service)
- **Tools**: 113 financial data tools via wrapper pattern
  - Wrapper tools: TOOL_LIST, TOOL_GET, TOOL_CALL
  - Data tools: TIME_SERIES_DAILY, GLOBAL_QUOTE, FX_DAILY, RSI, MACD, etc.
  - Coverage: Stocks, options, forex, crypto, commodities, economic indicators, technical indicators
- **Wrapper Pattern Benefits**:
  - Clean Hub registry (3 tools vs 113 individual registrations)
  - Service can add tools without re-registering
  - Full schemas discoverable on-demand via TOOL_GET
- **API Key in URL**: Query parameters preserved correctly (`?apikey=KEY`)
- **Performance**: 233-750ms response time
- **Status**: ACTIVE, public (all authenticated users)
- **Validation**: DEMO_USER successfully queried stock prices via ChatGPT
- **Documentation Example**: Added to mcp-hub-service-registration-reference.md (Example 1)

### 25. Service Onboarding Troubleshooting (Jan 23, 2026)
- **Comprehensive Guide**: `cline_docs/mcp-hub-service-onboarding-troubleshooting-guide.md` (80+ pages)
- **Logging Architecture**: 3 layers (Activity table, Console logs, MCPInteraction table)
- **Common Integration Issues**: 6 edge cases with real examples
  - Wrong transport detected (SSE vs Streamable HTTP)
  - API keys in URL parameters (works correctly)
  - Wrapper pattern tools (TOOL_CALL meta-tool)
  - Arguments format mismatch (JSON strings)
  - Public access not set (visibility vs accessibility)
  - Connection pooling bugs (SDK issue, now fixed)
- **GUI Audit Tool Requirements**: Detailed specs for developer-friendly debugging
  - Service health dashboard with real-time status
  - Call timeline with success/failure indicators
  - Smart error analysis (pattern detection: fresh vs pooled)
  - Interactive test panel (send calls, view responses)
  - Configuration validator (pre-registration checks)
- **Troubleshooting Workflows**: 3 step-by-step guides
  - "Service not discoverable" (publicAccess, status, approval)
  - "Service calls failing" (console logs, error patterns)
  - "Works for me but not users" (owner vs public access)
- **Real Examples**: Complete Alpha Vantage integration with actual logs
- **Success Metrics**: Time to diagnose 2-4hr → 5-10min (10x improvement with GUI)

### 26. Recovery Signals on the Service-Call Path (May 2026)
What the hub tells an AI client when a `services(action:"call")` fails. Governed by **Protocol 10 — Signal Design (Fact vs. Verdict)**, owned by `architectural-review-specialist` (`.claude/knowledge/protocols/signal-design-protocol.md`). Route any change to hub error/recovery signals through it.
- **Shipped (commit `46562b6a`), all in `service-call-handler.js`:**
  - **`timeout` contract honoured** — precedence caller ?? service-config ?? 30s, clamped to the 300s cap; response reports `effectiveTimeout`/`requestedTimeout`/`timeoutClamped` (was accept-and-ignore).
  - **Recent-success-rate FACT** — on failure, surfaces `recentSuccessRate` (the existing `MCPTool.successRate` EMA, read pre-call) + timeout-aware recovery text that no longer points clients at the blind health check.
  - **Deliberately NOT shipped — a transient/persistent VERDICT.** An unvalidated heuristic on a broad-blast surface could mislead a client the way the original 2026-05-28 incident did. Ship facts; earn verdicts.
- **Instrumentation + tracked follow-up:** every failure emits a `service_call_failure` pino event (stderr, carries pre-call `recentSuccessRate`; commit `633931b4`) feeding a tracked validation analysis (`cline_docs/follow-ups/hub-recovery-verdict-validation-2026-05-29.md`) that will earn-or-close the deferred verdict. **Don't add a verdict-shaped hub signal without validation.**
- Origin + public framing: `cline_docs/follow-ups/hub-recovery-signals-2026-05-28.md`; `paichart/tutorials/11-error-recovery-signals.md` + `02-addendum-the-field-failure-loop.md`.

### 20. JWT/JWKS & Trust Level System (Phase 2 - Jan 2026)
- **RS256 Asymmetric Signing**: Migrated from HS256 to RS256 for external service token validation
  - Private key: `JWT_PRIVATE_KEY_BASE64` (RSA-2048, never exposed)
  - Public key: `JWT_PUBLIC_KEY_BASE64` (shared via JWKS endpoint)
  - Key ID: `JWT_KEY_ID` env (current: `paichart-2026-04`, rotates ~90 days; code default centralized in `getCurrentKid()` / `DEFAULT_JWT_KEY_ID` at `lib/auth/jwt-key-store.ts` since 2026-06-11)
- **JWKS Endpoint**: `GET /api/auth/jwks` - Public key for external service validation
  - Route: `app/api/auth/jwks/route.ts`
  - Rate limited: 100 req/min per IP (DoS protection)
  - Cache: 24-hour TTL (public, max-age=86400)
  - Validation: Issuer `https://paichart.app`, Audience `paichart-api`
- **Trust Level Token Gating**: 6-tier hierarchical trust model determines who receives JWT tokens
  - **INTERNAL** (5): `paichart-*` services → ✅ Token (in-process routing)
  - **TRUSTED** (4): Localhost Docker services → ✅ Token (browser-automation, notification)
  - **OWNER** (3): User owns the service → ✅ Token (can validate via JWKS)
  - **TEAM_MEMBER** (2): Service owner is POV team member → ✅ Token **[Phase 2 ENABLED]**
  - **SCOPED** (1): Public service + POV context → ❌ No token (limited access)
  - **ANONYMOUS** (0): Public service, no POV → ❌ No token (open access)
- **Audit Logging**: Trust denials logged to Activity table for security forensics
  - Action: `TRUST_DENIAL`, Type: `Security`
  - Metadata: serviceId, serviceName, trustLevel, povId, reason, timestamp
  - Integrated in: `service-caller.ts` + `workflow-tools-handler.js`
  - Monitoring: `scripts/monitor-trust-denials.sh` (hourly pattern detection)
- **Security Monitoring**: Real-time + Daily reporting
  - JWKS health: `scripts/monitor-jwks-health.sh` (every 5 min)
  - Trust denials: `scripts/monitor-trust-denials.sh` (hourly)
  - Daily email: Integrated in disaster-recovery email (6 AM)
  - GUI: https://paichart.app/admin/audit (Security events highlighted)
- **Developer Visibility**: `_context.trustLevel` added to all service calls
  - Helps external developers understand "why no token?"
  - Reference table: `.claude/knowledge/domain/mcp/mcp-hub-external-service-authentication.md`
- **Files**:
  - Trust system: `lib/services/workflow/security/trust-level.js`
  - Token signing: `lib/auth/token-manager.ts`
  - JWKS endpoint: `app/api/auth/jwks/route.ts`
  - Rate limiting: `lib/middleware/rate-limit.ts`
- **Documentation**:
  - External dev guide: `.claude/knowledge/domain/mcp/mcp-hub-external-service-authentication.md` (v3.0)
  - Security policy: `.claude/knowledge/domain/mcp/mcp-hub-security-policy.md` (v2.1.0)
  - Key rotation: `.claude/knowledge/JWT_KEY_ROTATION_GUIDE.md`
  - Sec-ops assessment: `cline_docs/reviews/token-exposure-pov-scoping-2026-01-18/sec-ops-phase-2-assessment-2026-01-21.md`

### 26. Component 5 Validation & Security Hardening (Jan 30, 2026)
- **CRITICAL Security Fix**: GitHub OAuth passthrough vulnerability eliminated
  - **Before**: OAuth callback returned GitHub's token directly (CRITICAL - enabled GitHub account compromise)
  - **After**: Mint first-party RS256 token after validation (Security: 0/10 → 95/100)
  - **Impact**: All MCP OAuth users (Claude Desktop, ChatGPT, Gemini)
  - **Fix location**: `mcp-server-http-clean.js` lines 2784-2824
  - **Pattern**: `.claude/knowledge/patterns/oauth-token-minting-not-passthrough.md` (Pattern #29)
- **Unified Key Architecture**: Consolidated from two RSA key pairs to one
  - **Decision**: Use ONE key pair for BOTH web/API and MCP OAuth tokens (kid was `paichart-2026-01` at this Jan 2026 decision; rotated to `paichart-2026-04` on 2026-04-21 — kid rotates every ~90 days, current value at the JWKS endpoint)
  - **Rationale**: RFC 8707/9068 compliant, industry standard (Google/Microsoft/Auth0 pattern)
  - **Specialist consensus**: 2-1 vote for consolidation (92% confidence)
  - **Token isolation**: Via `aud` claim (aud=/api vs aud=/mcp), not separate keys
  - **Files updated**: `mcp-server-http-clean.js` (mintMcpToken + validation + JWKS)
- **Component 5 Validated**: External service JWKS authentication tested and working
  - **Test service**: `token-validator-service` (Docker port 3105, customer onboarding tool)
  - **Validation time**: 34ms (JWKS fetch + signature verify)
  - **Success rate**: 100% (production tested)
  - **Trust level**: OWNER demonstrated (service owner gets token)
- **Token Delegation Policy**: Services prohibited from forwarding user tokens
  - **Documented**: `hub-authentication-context-passing.md` (Token Passing Policy section)
  - **Security Decision**: `services(workflow.execute)` forwards tokens via trust levels. `services(call)` intentionally does NOT:
    - Direct calls lack POV context → no authorization scope for trust determination
    - Prevents token harvesting by malicious public services
    - Workflow execution with `povId` provides explicit authorization guardrails
  - **Reference**: `TODO-services-call-token-forwarding.md` (status: DEFERRED, security decision)
- **Security Policy Enhanced**: v1.0.0 → v2.1.0 (+14,105 lines documentation)
  - Token security architecture, trust levels, compliance mapping, threat models
  - Incident response procedures, monitoring scripts, audit queries
  - SOC 2 / ISO 27001 / GDPR compliance evidence

## [evicted] Pino Structured Logging for Hub Operations

### Logging Architecture (Two Systems)
| System | Purpose | Output |
|--------|---------|--------|
| **pino** (primary) | Server-side structured JSON logging | PM2 stdout (`pm2 logs paichart`) |
| **OAuth audit logger** | OAuth-specific file logging | `/var/log/paichart/oauth-audit.log` |

**Pattern Reference**: `/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)

### Hub-Relevant Domain Loggers
Import from `lib/logger.ts`:

| Logger | Use Case in MCP Hub |
|--------|---------------------|
| `mcpLogger` | Hub tool execution, service calling, discovery, registration, workflow orchestration |
| `apiLogger` | Service call HTTP transport, health check pings, internal routing |
| `complianceLogger` | Compliance policy events, service approval decisions, blocked patterns |
| `authLogger` | Trust level decisions, token gating, JWT minting for service calls |

### Correct pino API (Object-First)
```typescript
import { mcpLogger, complianceLogger, authLogger } from '@/lib/logger';

// Service registration
mcpLogger.info({ tool: 'registry', action: 'register', serviceName: 'alpha-vantage', transport: 'streamable-http' }, 'Service registered in MCP Hub');

// Service call execution
mcpLogger.info({ tool: 'services', action: 'call', targetService: 'sentry', toolName: 'list_issues', executionTimeMs: 233 }, 'Service call completed');

// Compliance policy violation
complianceLogger.warn({ service: 'untrusted-service', violation: 'BLOCKED_PATTERN', pattern: 'exec' }, 'Service call blocked by compliance policy');

// Trust level denial
authLogger.warn({ serviceId: 'ext-service', trustLevel: 'SCOPED', reason: 'no-token-below-OWNER' }, 'Trust denial: token not issued');

// Error serialization — always use { err: error } key
mcpLogger.error({ err: error, tool: 'services', action: 'call', targetService: 'alpha-vantage' }, 'Service call failed');
```

### Production PM2 Log Analysis for Hub Operations
```bash
# All MCP Hub operation logs
pm2 logs paichart --lines 200 --nostream | grep '"domain":"mcp"' | jq

# Service registration events
pm2 logs paichart --lines 200 --nostream | grep '"domain":"mcp"' | jq 'select(.tool == "registry")'

# Service call execution and timing
pm2 logs paichart --lines 200 --nostream | grep '"domain":"mcp"' | jq 'select(.tool == "services")'

# Compliance policy violations
pm2 logs paichart --lines 300 --nostream | grep '"domain":"compliance"' | jq 'select(.violation != null)'

# Trust level denials
pm2 logs paichart --lines 300 --nostream | grep '"domain":"auth"' | jq 'select(.trustLevel != null)'

# Hub errors by tool
pm2 logs paichart --lines 500 --nostream | grep '"domain":"mcp"' | jq 'select(.level >= 50) | {tool, msg, err}'
```

### Hub Operations Logging Checklist
When reviewing hub handler implementations, verify:
- [ ] Uses `mcpLogger` for tool execution events (not `console.log`)
- [ ] Uses `complianceLogger` for compliance/policy decisions (not `console.log`)
- [ ] Uses `authLogger` for trust level and token gating events (not `console.log`)
- [ ] pino API is object-first: `logger.method({ key: value }, 'message')`
- [ ] Error serialization uses `{ err: error }` key (not `{ error: error }`)
- [ ] No `console.log` / `console.error` / `console.warn` in hub handler files

## [evicted] Key Technical Knowledge

### My Knowledge Base

**Service Registration Reference** (100% confidence, Jan 2026):
`/.claude/knowledge/domain/mcp/mcp-hub-service-registration-reference.md`
- Complete parameter reference for `registry(action: 'register')` (all fields with constraints)
- Transport options: SSE, Streamable HTTP, WebSocket with selection guide
- Capabilities formats: Legacy (Grade C) vs Full Schema (Grade A)
- Configuration options: publicAccess, timeout, poolSize, retryPolicy
- Quality grades system (A/B/C/D) with upgrade paths
- 4 complete registration examples (Weather, Notifications, Browser, AI Analytics)
- Troubleshooting common errors

**Integration Guide** (100% confidence, Jan 2026):
`/.claude/knowledge/domain/mcp/mcp-hub-integration-guide.md`
- Architecture overview and security model
- Getting started tutorial with TypeScript examples
- Anthropic compliance and content filtering
- GDPR data rights and deletion procedures
- Common issues and solutions

**Tool Architecture Reference** (95% confidence, Jan 2026):
`/.claude/knowledge/domain/mcp/tool-architecture-reference.md`
- Complete catalog of all 26 MCP tools across functional categories
- File locations for schemas, handlers, and routing
- Handler pattern documentation (Gold Standard pattern)
- Workflow System documentation (`workflow.trigger` action)
- New tool implementation checklist
- Key files: tool-schemas.js, hub-tools-handler.js, workflowEngine.ts

**Tool Lifecycle & Permissions Pattern** (98% confidence, Feb 2026):
`/.claude/knowledge/patterns/mcp-tool-lifecycle-pattern.md`
- 7-layer pipeline checklist for adding/removing/renaming/modifying tools
- **Tool Access Permissions** section: two-layer model (tool-level visibility + handler-level authorization)
- All 6 permission files with paths: tool-security.js, hub-utilities.js, mcp-oauth-validator.js, user.ts, context-enricher.js, prompt-registry.js
- Role summary table (SUPER_ADMIN/ADMIN/USER/DEMO_USER tool counts and capabilities)
- Checklists for changing tool permissions, role equality changes
- Anti-patterns learned from Feb 2026 cleanup (ghost tools, dead code, documentation drift)

**MCP Workflow System** (90% confidence, Jan 2026):
`/.claude/knowledge/domain/mcp/MCP-WORKFLOW-SYSTEM.md`
- MCPWorkflow and MCPWorkflowExecution models (schema + enums)
- Orchestration parameters (steps, execution modes, failure strategies)
- WorkflowEngine plugin architecture with handler registration
- Workflow orchestration with execution modes and failure strategies
- Activity integration (WORKFLOW_EXECUTED action type)
- Key files: workflowEngine.ts, orchestration-params.ts, hub-tools-handler.js

**Task Activity System** (94% confidence, Jan 2026):
`/.claude/knowledge/domain/mcp/TASK-ACTIVITY-SYSTEM.md`
- 18 activity types including WORKFLOW_EXECUTED for orchestration
- Integration points for workflow execution logging
- Fire-and-forget logging pattern

**Cross-Service Implementation** (92% confidence, Jan 2026):
`/cline_docs/reviews/mcp-hub-cross-service-2026-01-11/`
- `implementation-plan-v4.2-focused.md` - Internal service infrastructure design
- `completion-summary.md` - Shared orchestration engine pattern
- Internal services (post 2026-05-23 cleanup): paichart-project-service, paichart-kpi-service, paichart-recommendation-engine
- 100% feature parity between JS and TS handlers
- Legacy `paichart-pov-service` + `paichart-task-service` dropped from router (commit 792dbc01) — were never registered in DB

**Database Prompt Creation** (95% confidence):
`/.claude/knowledge/domain/mcp/database-prompt-creation-guide.md`
- Three methods to create prompts without editing prompt-registry.js
- AgentPromptLibrary schema and MCP visibility requirements
- Variables and examples format (Handlebars templating)
- Security validation (7-layer protection against XSS, injection, DoS)
- Two-tier prompt system (built-in + database merge in list_prompts)
- Real production examples and troubleshooting guide

**MCP Prompt Library Items** (100% confidence):
- `pov_health_check.md` - Single POV diagnostic and health check
- `task_audit_and_planning.md` - Portfolio-wide task audit with auto-focus
  - Used for: Weekly reviews, automated reports, portfolio health checks
  - Format: Handlebars templating with JSON variable definitions
  - Location: `/.claude/knowledge/prompts/`

**Operational Guides**:
- `GEOGRAPHICAL_DATA_MANAGEMENT.md` - Managing geographical data (theatres, countries, regions)
  - See Addendum: MCP Geographical Filtering for managers using ChatGPT/Claude Desktop
  - Topics: Custom region filtering, partial matching, combined filters
  - Location: `/.claude/knowledge/guides/`

### **CRITICAL: MCP Server Selection for Production** 🚨

**Production Server**: `mcp-server-http-clean.js` ✅
- **Architecture**: Single backend MCP server instance
- **Session Management**: Clean authentication context forwarding  
- **Prompt System**: Full prompt continuity and context preservation
- **Resource Management**: No validation loops or duplicate instances
- **Battle Tested**: Commit 95c629d confirms "HTTP Clean with prompts working"

**Deleted Server**: ~~`mcp-server-http.js`~~ 🗑️ (removed Apr 8 2026 / Phase 2.P0 step 2)
- **Why deleted**: Dead code with no live launcher (only referenced by an unused `npm run mcp:http` script and stale shell scripts). The actual production HTTP MCP server has always been `mcp-server-http-clean.js`.
- **Historical problems** (preserved for context): per-session server instances, resource validation loops, complex auth context breaking parameter intelligence. `mcp-server-http-clean.js` was written to fix all of these.

**Core STDIO Server**: `mcp-server-v5.js`
- **Purpose**: Native STDIO transport for Claude Desktop direct connections
- **Usage**: Not for HTTP/production deployment

### **Package.json Script Hierarchy**
```json
"mcp": "node mcp-server-v5.js",                    // Core STDIO server
// "mcp:http" script was REMOVED Apr 8 2026 (Phase 2.P0 step 2) — pointed to deleted mcp-server-http.js
"mcp:http:dev": "node mcp-server-http-clean.js"    // ✅ PRODUCTION HTTP (sole HTTP entry point)
```

**Why the naming confusion**: The "dev" script actually contains the production-ready implementation that solved the per-session prompt issues.

### **MCP Hub Architecture (Live Implementation)**
- **Prompts**: 18 total (1 built-in `audit_all_tasks` + 17 database prompts with 'mcp' tag)
  - Hub guides: `register_guide`, `get_started`, `workflow_guide`, `security_policy`, `trust_levels`, `external_service_auth`
  - Task/POV: `task_audit_and_planning`, `pov_health_check`, `list_tasks_guided`, `select_pov`, `navigate_phases`, `create_task_guided`
  - Cross-service: `weather_commodity_trading_signals`, `energy_operations_optimizer`
  - **Note**: Original wizard prompts (`register_service_wizard`, `discover_services_conversation`, `orchestrate_workflow`) were replaced by richer database prompts (Feb 2026 audit confirmed). Legacy tool names consolidated Mar 2026.
- **MCP Tools**: 10 tools total — 6 consolidated (`project`, `perform`, `analytics`, `template`, `services`, `registry`) + 4 standalone (`search`, `fetch`, `prompt_command`, `list_prompts`). Hub operations use `services(action: ...)` for discovery/calling/workflows and `registry(action: ...)` for service management.
- **Database Storage**: MCPTool model with ownership tracking in configuration/permissions JSON fields
- **Authentication**: User-based ownership via JWT context passing from HTTP server

### **Service Registration Workflows (Critical Understanding)**
- **Method 1**: Direct `registry(action: 'register')` tool ✅ WORKING (parameter parsing fixed 2025-08-17)
- **Method 2**: `/prompt register_guide` → step-by-step tutorial → user calls `registry(action: 'register')` ✅ WORKING
- **Method 3**: `perform(action: 'task.create')` → agent template → service registration ✅ WORKING
- **Self-Registration**: `perform` auto-registered itself as "MCP Task Action Tool" service ✅ PROVEN
- **Production Proven**: Sentry MCP successfully registered via Method 1 ✅ VALIDATED

### **Service Registry Capabilities**
- **12 Active Services** (2026-05-22): weather, eia, eodhd, alpha-vantage, browser-automation, notification, token-validator, context7-docs, snowflake-service, paichart-project-service, paichart-kpi-service, paichart-recommendation-engine. Verify via `services(action: 'discover', status: 'ACTIVE')`.
- **Real Production Integrations**: Docker services, Alpha Vantage (Streamable HTTP), internal pAIchart services
- **Capability Discovery**: Search by tools, resources, categories
- **Cross-Service Communication**: Via `services(action: 'call')` with parameter parsing
- **Service Health**: Status monitoring and performance metrics

### **Revolutionary Features**
- **Pure MCP Protocol**: No REST APIs for core functionality
- **Conversational Management**: Natural language service operations
- **Zero Schema Changes**: Uses existing MCPTool model perfectly
- **Cross-Platform**: Windows and Linux Claude Desktop support
- **Production Ready**: Real services, authentication, monitoring

### **Modular Handler Architecture** (100% confidence, Dec 15 2025)
**Location**: `lib/mcp/server/tools/hub/` and `lib/mcp/server/tools/advanced/`

**Pattern**: Facade with extracted handlers
- Main files: ~302 (hub-tools-handler) + ~383 (sdk-native-advanced-tools) lines as of 2026-06-11 — shrank below the Dec-2025 452-611 range with further extraction
- Handler modules: 15 hub .js + 5 advanced .js + analytics/ subdir (the Dec-2025 "<400 lines" goal is retired — workflow-tools-handler is 1486 after hardening)
- DI pattern: Handlers receive prisma, utilities, parent
- Delegation: One-line method delegations in facades
- Backward compatibility: 100% maintained (zero breaking changes)

**Hub Handler Modules (10)**:
1. service-registration-handler.js - Service registration with validation
2. service-discovery-handler.js - Discovery with caching (60s TTL)
3. service-health-handler.js - REAL HTTP pings, 5s timeout
4. service-call-handler.js - REAL MCP SDK client integration
5. service-update-handler.js - Service metadata updates
6. service-delete-handler.js - GDPR Right to Erasure (owner deletion)
7. user-services-handler.js - User-owned service listing
8. service-tools-handler.js - Service tool parameter discovery (Jan 2026)
9. prompt-list-handler.js - Hub prompt listing
10. workflow-tools-handler.js - Multi-service workflow orchestration (Jan 2026)

**Hub Shared Infrastructure** (`/lib/mcp/server/tools/hub/`):
- hub-shared-middleware.js - extractAuthContext(), resolveService(), validateOwnership(), invalidateServiceCaches() (Feb 2026)
- hub-utilities.js - HubUtilities class, rateLimitCache, isUserAdmin
- hub-audit-service.js - Audit logging for hub operations
- error-helpers.js - 9 centralized error helpers: authRequiredError, notFoundError, validationError, noResultsResponse, missingFieldsError, enhancedOperationError, missingServiceIdentifierError, permissionDeniedError, serviceNotFoundByIdError

**Internal Service Infrastructure** (`/lib/mcp/server/tools/internal/`):
- InternalServiceRouter.js - Routes internal:// calls to pAIchart handlers (no HTTP)

**Shared Orchestration Engine** (`/lib/services/workflow/core/`):
- orchestration-engine.js - Pure JS engine used by both Hub (JS) and API (TS) handlers

**Advanced Handler Modules (5)** (Feb 2026 audit — 3 planned handlers were never extracted):
1. task-context-handler.js (298 lines) - Task context retrieval
2. task-action-handler.js (376 lines) - Task action execution
3. agent-results-handler.js (243 lines) - Agent execution results
4. ai-recommendations-handler.js (312 lines) - AI-powered recommendations
5. analytics/ (directory) - Team performance + analytics helpers
- **Note**: prompt-execution, resource-fetch, and template-suggestions remain inline in sdk-native-advanced-tools.js

**Real Implementations (No Stubs)**:
- **service-call-handler.js**: Real MCP SDK client connections
  - Full @modelcontextprotocol/sdk/client integration
  - HTTP/SSE transport only (WebSocket removed Jan 2026)
  - Connection lifecycle: connect() → callTool() → close()
  - Real execution time tracking (Date.now() - startTime)
  - No "simulated: true" flags
  - `validateToolArguments()` — fast-fails with schema-aware hints (field structure, enums, nested objects). Returns MCP content `{content, isError: true}` instead of throwing (Bug Class 30 fix, Mar 2026)

- **service-health-handler.js**: Real HTTP pings with timing
  - Actual fetch() calls to service endpoints
  - AbortController with 5-second timeout
  - Real latency measurement (Date.now() - pingStart)
  - Combined stored + realtime health data
  - 30s TTL caching with realtime bypass parameter

- **hub-resources.js**: `HubResourceProvider` class — 15 MCP resources (535 lines, re-proven 2026-06-11; was 8/~402 at Dec 2025)
  - Returns MCP-compliant `contents: [{uri, mimeType, text}]` (NOT `content` — see Note 107)
  - Integrated into BOTH stdio and HTTP transports (see Note 108)
  - mcp://hub/services - Complete service registry
  - mcp://hub/analytics - Hub usage analytics
  - mcp://hub/statistics - Service ecosystem statistics
  - mcp://hub/health - System health overview
  - mcp://hub/categories - Service categories
  - mcp://hub/capabilities - Capability distribution
  - mcp://hub/integrations - Integration patterns
  - mcp://hub/performance - Performance metrics

**Performance Features**:
- **Composite indices**: (status, responseTime, successRate) + GIN(capabilities)
- **Parallel queries**: count + findMany in Promise.all
- **Discovery caching**: 60s TTL, LRU eviction, invalidation on mutations
- **Health caching**: 30s TTL, realtime bypass parameter
- **Expected improvement**: 70-86% faster MCP sessions

**Test Coverage**: 17 test-mcp-*.ts suites as of 2026-06-11 (the "199 tests / 6 suites" figure is the Dec-2025 extraction-era snapshot)
- Pattern validation + behavior verification (validation-testing-architecture.md)
- Coverage spans hub handlers, advanced handlers, and the 15 hub resources

## [evicted] Recent Achievements (2026-01-06 - Hub Tools Enhancement Phase 1+2 Complete)

### **Hub Tools Enhancement Phase 1+2 (Jan 6, 2026)**
- ✅ **registry(action: 'tools')**: Tool for AI parameter discovery (enables AI clients to know what params to pass to `services(action: 'call')`)
  - Accepts service_name (fuzzy) or serviceId
  - Returns full tool schemas with inputSchema for each tool
  - State-aware nextSteps (GS4 compliance)
  - Centralized error helpers (GS8 compliance)
  - Handler: service-tools-handler.js (~270 lines)
- ✅ **Enhanced registry(action: 'register')**: Now accepts both tool name arrays AND full tool schemas
  - Legacy format: `capabilities: { tools: ['tool1', 'tool2'] }`
  - New format: `capabilities: { tools: [{name, description, inputSchema}] }`
  - Enables AI clients to register services with full parameter schemas
  - schemaVersion field distinguishes: 1 (legacy string) vs 2 (full schema)
- ✅ **Gold Standard Compliance**: consolidated tools grade services B+ (6/9), registry B (4/8) as of 2026-06-11 (the "9/10 A grade" figure was per-LEGACY-tool, pre-consolidation)
  - Test script: `npx tsx scripts/test-gold-standard-compliance.js --hub` (bare `node` exits 1 — silently no-opped Apr 8 → Jun 11 2026 after lib/prisma.js deletion)
  - GS1-GS10 validation with automated grading
- ✅ **Workflow System Integration**: `registry(action: 'tools')` includes workflow positioning "(you are here)"
- ✅ **Security Config**: Tool added to tool-security.js with AUTHENTICATED access

### **New Tool Workflow (Service Parameter Discovery)**
```
1. services(action: 'discover') → Find services by capability
2. registry(action: 'tools', service_name) → Get tool schemas with parameters (you are here)
3. services(action: 'call', targetService, tool, arguments) → Execute with correct params
4. services(action: 'health') → Monitor service performance
```

---

## [evicted] Achievements (2025-12-15 - Modular Architecture & Real Implementations Complete)

### **Modular Architecture Transformation (Dec 15, 2025)**
- ✅ **Handler Extraction**: 15 modules extracted (10 hub + 5 advanced), all <400 lines
- ✅ **Facade Pattern Success**: hub-tools-handler.js 73% reduction (2,306 → 611 lines)
- ✅ **Advanced Tools Refactor**: sdk-native-advanced-tools.js 81% reduction (2,415 → 452 lines)
- ✅ **Zero Breaking Changes**: 100% backward compatibility maintained
- ✅ **Dependency Injection**: All handlers receive prisma, utilities, parent for testability
- ✅ **Test Protection**: 199 dual-layer tests caught zero regressions during extraction

### **Real Service Calling Implementation (Dec 15, 2025 - Phase 2 Priority 1)**
- ✅ **MCP SDK Client**: Full @modelcontextprotocol/sdk/client integration (339 lines)
- ✅ **Transport Support**: HTTP and WebSocket (SSEClientTransport, WebSocketClientTransport)
- ✅ **Connection Lifecycle**: Proper connect() → callTool() → close() pattern
- ✅ **Real Execution Timing**: Date.now() tracking (not simulated!)
- ✅ **Simulation Removed**: No "simulated: true" flags anywhere
- ✅ **Error Handling**: Comprehensive try-catch with service state updates

### **Real Health Checks Implementation (Dec 15, 2025 - Phase 2 Priority 2)**
- ✅ **HTTP Ping**: Real fetch() calls to service endpoints (264 lines)
- ✅ **Timeout Control**: AbortController with 5-second limit
- ✅ **Latency Measurement**: Real timing (Date.now() - pingStart)
- ✅ **Combined Health Data**: Stored + realtime metrics merged
- ✅ **Caching Strategy**: 30s TTL with realtime bypass parameter
- ✅ **Status Detection**: HTTP 2xx = ACTIVE, timeout/error = ERROR

### **Hub Resources Implementation (Dec 15, 2025 - Phase 2 Priority 3)**
- ✅ **Resource Provider**: `HubResourceProvider` in hub-resources.js (~402 lines, MCP-compliant `contents` format)
- ✅ **MCP Server Integration**: Integrated into BOTH `mcp-server-v5.js` (stdio) and `mcp-server-http-clean.js` (HTTP) — Feb 2026
- ✅ **Resource URIs**: mcp://hub/services, analytics, statistics, health, categories, capabilities, integrations, performance
- ✅ **Hub Introspection**: Complete hub state accessible via MCP protocol

### **Performance Optimizations (Dec 15, 2025 - Phase A Complete)**
- ✅ **Database Indices**: 2 composite indices (discovery + capability GIN)
- ✅ **Parallel Queries**: count + findMany in Promise.all
- ✅ **Discovery Caching**: 60s TTL with LRU eviction
- ✅ **Health Caching**: 30s TTL with realtime bypass
- ✅ **Cache Invalidation**: Automatic on register/update/delete
- ✅ **Expected Performance**: 70-86% faster MCP sessions

### **Test Coverage Excellence (Dec 15, 2025)**
- ✅ **199 MCP Tests**: Comprehensive dual-layer validation
- ✅ **6 Test Suites**: initialization, hub-tools, resource-manager, parameter-intelligence, execution-streaming, compliance-monitor
- ✅ **Format Compliance**: validation-testing-architecture.md
- ✅ **100% Coverage**: All 10 hub handlers + all 5 advanced handlers + all 8 resources
- ✅ **Refactoring Protection**: Zero regressions caught during modular extraction

### **Database Drift Elimination (Dec 15, 2025)**
- ✅ **Unified Schema Management**: db push everywhere (development + production)
- ✅ **GitHub Actions Alignment**: Production workflow mirrors development
- ✅ **Schema.prisma as Truth**: Single source of truth for all environments
- ✅ **Zero-Downtime Indices**: Concurrent CREATE INDEX for production safety
- ✅ **Convention Documentation**: CLAUDE.md updated with db push best practices

## [evicted] Previous Achievements (2025-09-19 - OAuth Production Deployment Complete)

### **OAuth 2.0 Enterprise Authentication OPERATIONAL IN PRODUCTION**
- ✅ GitHub OAuth: **FULLY OPERATIONAL** - Client ID: <REDACTED-SECRET> working in production
- ⏳ Microsoft OAuth: Configured in code, pending OAuth app registration
- ⏳ Google OAuth: Configured in code, pending OAuth app registration
- ✅ PKCE security flow **FIXED** - EnterpriseOAuthService.pkceStorage with in-memory Map
- ✅ OAuth redirect URLs **FIXED** - Uses APP_BASE_URL instead of request.url
- ✅ PM2 ecosystem.config.js **UPDATED** - Includes OAuth environment variables
- ✅ Production deployment **VERIFIED** - OAuth buttons live at https://paichart.app/login
- ✅ 4-tier authentication fallback: OAuth → JWT → API key → Session
- ✅ Multi-server JWT architecture with Bearer token extraction
- ✅ Database schema enhanced with oauth_provider/oauth_id fields

### **HTTP Transport Compliance Achieved**
- ✅ Streamable HTTP transport (POST /mcp) for Anthropic Directory
- ✅ SSE transport (GET /mcp) for Claude Desktop compatibility
- ✅ Clean server architecture preventing resource validation loops
- ✅ Origin validation with DNS rebinding protection
- ✅ Session management with Mcp-Session-Id headers
- ✅ 100% MCP 2025-03-26 specification compliance

### **MCP OAuth 2.0 Integration (BREAKTHROUGH ACHIEVEMENT - 2025-09-21)**
- ✅ **Lean OAuth Implementation**: 250 lines of code delivering enterprise-grade authentication
- ✅ **MCP Hub OAuth Support**: OAuth-authenticated users can register, discover, and manage services
- ✅ **Stateless Security Model**: OAuth tokens validated per-request - no session management complexity
- ✅ **Multi-Provider Support**: GitHub, Google, Microsoft OAuth via unified validator pattern
- ✅ **Manifest Configuration**: `/mcp_manifest.json` declares OAuth support for Claude Desktop
- ✅ **Provider-Based Security**: OAuth providers handle replay protection, token expiry, and user verification
- ✅ **Role-Based Hub Access**: OAuth users inherit pAIchart role-based permissions automatically
- ✅ **Browser vs Desktop Compatibility**: Claude.ai uses stateless OAuth, Claude Desktop uses manifest auth
- ✅ **Database Reuse Success**: No schema changes - leveraged existing oauthProvider/oauthProviderId fields
- ✅ **92% Expert Confidence**: Validated by auth-permissions-specialist as superior to complex session-based alternatives

### **Plan 11B: Authentication-Based Tool Access (100% Success) - DIRECTORY SERVICE MODEL**
- ✅ **Security Verification**: All PUBLIC tools confirmed as read-only operations (SELECT queries only)
- ✅ **Directory Service Pattern**: Appropriate public access for service discovery and information browsing
- ✅ **Data Protection**: 8+ sensitive fields automatically filtered from public responses (endpoints, API keys, owner info)
- ✅ **Parameterized Queries**: All database operations use Prisma ORM preventing SQL injection
- ✅ **Tool Categorization**: Clear separation: discovery/analytics (public) vs operations/management (auth-required)

### **ChatGPT OpenAI Connector Integration (COMPLETE - 2025-09-25)**
- ✅ **Search Tool Implementation**: Full-text search across POVs, tasks, phases, stages, executions, templates
- ✅ **Fetch Tool Implementation**: Detailed resource retrieval with metadata and context
- ✅ **Response Format Compliance**: Direct JSON arrays/objects matching OpenAI MCP connector requirements
- ✅ **URL Generation Fixed**: Correct Next.js routes - /pov/{id}, /pov/{povId}/phase/{phaseId}/task/{id}
- ✅ **Database Optimization**: 15+ GIN indices for text search, foreign keys, and query patterns
- ✅ **Performance Boost**: 10-50x search improvement with PostgreSQL full-text indices
- ✅ **Schema Alignment**: Proper table mapping (stages, tasks, agent_executions, agent_templates)
- ✅ **Production Deployment**: Fully operational at https://paichart.app/mcp
- ✅ **Tool Security**: Added to PUBLIC_TOOLS for read-only access in both server files
- ✅ **Rate Limiting**: 100 req/min public access with proper burst limits for directory browsing
- ✅ **Enhanced hub discovery**: `registry(action: 'list')` provides authentication-aware responses and guidance
- ✅ **Error message enhancement**: Multi-method authentication guidance (API Key, OAuth, JWT Bearer, Claude Desktop)
- ✅ **100% test validation**: Comprehensive test suite with 9/9 tests passed covering all functionality

### **Production Service Ecosystem**
- ✅ 4+ active services including production Sentry MCP
- ✅ Service health monitoring and performance metrics
- ✅ JWT token context for secure service ownership
- ✅ Cross-service orchestration with authentication
- ✅ Parameter Normalizer integration for consistent tool behavior

### **Revolutionary Impact Enhanced**
- ✅ First OAuth-enabled conversational AI service registry
- ✅ Enterprise-ready with professional authentication flows
- ✅ Directory-compliant for global enterprise discovery
- ✅ Self-documenting with `registry(action: 'list')` comprehensive disclosure

## [evicted] Learning Notes

The MCP Hub represents a paradigm shift from traditional service registries to conversational AI service ecosystems. Key learnings:

1. **Infrastructure Reuse**: Existing pAIchart models (MCPTool, AgentTemplate) perfectly suited for service registry
2. **Pure MCP Protocol**: Eliminates complexity of REST APIs and custom integrations  
3. **Conversational Management**: Natural language service operations more intuitive than traditional interfaces
4. **Production Viability**: Real services (Sentry MCP) integrate seamlessly
5. **Cross-Platform Success**: HTTP wrapper enables Windows Claude Desktop compatibility

### **Critical Workflow Understanding**
6. **`/prompt` System**: Essential workaround for Claude Desktop MCP prompt limitations - converts prompts to tool responses
7. **Multi-Path Registration**: Services can register via direct tools, guided prompts, or task-based workflows
8. **Self-Referential Architecture**: pAIchart's own tools (perform) auto-register as services in the hub
9. **Agent Template Integration**: MCP Service Registry templates process natural language → structured service configs
10. **Task-Based Workflows**: `/prompt` → `perform(action: 'agent.execute')` → agent execution → service registration (alternative path)

### **Why This Architecture Works**
- **Resilience**: Multiple registration paths ensure system reliability
- **User Choice**: Technical users use tools, business users use prompts
- **Self-Improvement**: System discovers and improves its own capabilities
- **Ecosystem Growth**: Every tool becomes a potential service for others

### **Plan 8 Security Integration**
11. **Tool Boundaries**: `services(action: 'discover')` requires authentication (all tools require auth since Phase 3)
12. **Service Authorization**: `services(action: 'call')` uses checkServiceAccess() for triple validation (ownership/admin/public)
13. **Data Filtering**: Public users see limited service info (no endpoints, owners, or API keys)
14. **Rate Limiting**: Public 100/min, Authenticated 1000/min, Service calls 10/min
15. **Audit Trail**: SERVICE_CALL and UNAUTHORIZED_SERVICE_ACCESS events logged
16. **Philosophy**: Security enables discovery without constraining innovation

### **Self-Documenting Architecture Achievement**
17. **registry(action: 'list') Tool**: Complete hub self-documentation with Gold Standard A grade
18. **Authentication Required**: All tools require authentication (Phase 3, Jan 31, 2026)
19. **Comprehensive Coverage**: Service listing, identity context, nextSteps guidance
20. **services(discover)**: Hub capability browsing for authenticated users
21. **Revolutionary Milestone**: First truly self-documenting AI service registry

### **Hub Pagination Implementation** (Nov 15, 2025)
22. **Pattern Applied**: MetadataEnhancer integrated into services(discover) for result completeness visibility
23. **Implementation**: Hub tools calculate total count, add skip/take pagination, expose via _meta.pagination
24. **Response Enhancement**: Both createPublicDiscoveryResponse and createAuthenticatedDiscoveryResponse include pagination
    - ⚠️ 2026-07-28: `createPublicDiscoveryResponse` was DELETED (zero callers since the Jan 2026 Phase 3
      public-access removal). Accurate as history; only `createAuthenticatedDiscoveryResponse` exists now.
25. **Files Modified**: hub-tools-handler.js (services discover handler), public-discovery-filter.js (response builders)
26. **Completeness Detection**: Services show "X of Y total" preventing confusion when default limit is 20
27. **Evidence**: Integrated into 30-test dual-layer validation suite (test-mcp-pagination-exposure.ts)
28. **Reference**: `/.claude/knowledge/patterns/mcp-metadata-exposure-pattern.md`

### **MCP Tools vs Prompts Execution Paradigm** (Nov 15, 2025)
29. **Critical Distinction**: Hub has both MCP tools (external) AND database prompts (AgentPromptLibrary)
30. **Hub Tools** (`services`, `registry`): External interface using `apiClient` or direct Prisma for Hub-specific data
31. **Database Prompts** (register_guide, workflow_guide, get_started): Rich Handlebars templates stored in AgentPromptLibrary, editable without code changes
32. **Prompt Evolution**: Original wizard prompts were replaced by richer database prompts (Feb 2026 audit). Legacy tool names consolidated Mar 2026.
33. **Pattern Choice**: Building tool for AI clients? Use apiClient + MetadataEnhancer. Building prompt for aggregation? Use direct Prisma.
34. **Reference**: Pattern 4 in mcp-metadata-exposure-pattern.md (explains both paradigms)

### **OAuth Enterprise Authentication**
22. **OAuth 2.0 Providers**: Microsoft, Google, GitHub with PKCE security flow
23. **Parameter Intelligence**: Enterprise UX with contextual hints and smart defaults
26. **Multi-Tier Authentication**: OAuth → JWT → API key → Session fallback system
27. **Transport Compliance**: Dual HTTP transport (SSE + Streamable HTTP) for universal access
28. **Directory Compliance**: 100% Anthropic MCP Directory compliance achieved
29. **Session Consistency**: Clean server architecture preventing resource validation loops

### **MCP OAuth 2.0 Lean Implementation Breakthrough**
30. **Lean vs Complex Strategy**: 250 lines of code implementation vs 2000+ line complex alternatives
31. **Stateless Security Superiority**: OAuth tokens validated per-request - more secure than session storage
32. **Database Reuse Pattern**: Leveraged existing User table structure - zero schema changes required
33. **Unified Validator Architecture**: Single `MCPOAuthValidator` class handles all providers consistently
34. **Manifest-Driven Configuration**: Claude Desktop OAuth support via `/mcp_manifest.json` configuration
35. **Provider-Based Security**: OAuth providers handle security concerns (replay, expiry) - no token storage risks
36. **Role Inheritance Model**: OAuth users automatically receive role-based permissions from existing RBAC
37. **Browser vs Desktop Patterns**: Stateless OAuth for Claude.ai, manifest OAuth for Claude Desktop
38. **Expert Validation Success**: 92% confidence rating from auth-permissions-specialist validates approach

### **Modular Architecture Transformation** (Dec 15, 2025)
39. **Maintainability Threshold**: <400 lines per module achieved (81% reduction in facades)
40. **Facade Pattern Success**: hub-tools-handler.js 2,306 → 611 lines, sdk-native-advanced-tools.js 2,415 → 452 lines
41. **Zero Breaking Changes**: 100% backward compatibility maintained during extraction
42. **Dependency Injection**: All handlers receive prisma, utilities, parent for testability
43. **Test-Driven Refactoring**: 199 dual-layer tests protected all extractions
44. **Handler Organization**: Clear separation: 10 hub handlers (service ecosystem) + 5 advanced handlers (task/agent operations)

### **Real Implementation Achievement** (Dec 15, 2025)
45. **Service Calling Evolution**: Stub → Real MCP SDK client with full transport support
46. **Health Check Transformation**: Simulated → Real HTTP pings with AbortController timeout
47. **Resource Exposure**: 8 MCP resources (mcp://hub/*) for hub introspection
48. **No Simulation Flags**: Complete removal of "simulated: true" patterns
49. **Connection Lifecycle**: Proper connect() → callTool() → close() pattern
50. **Error Handling**: Comprehensive try-catch with service state updates

### **Performance Optimization Success** (Dec 15, 2025)
51. **Database Indices**: 2 composite indices (discovery performance + capability search GIN)
52. **Parallel Queries**: count + findMany in Promise.all pattern
53. **Discovery Caching**: 60s TTL with LRU eviction, invalidation on mutations
54. **Health Caching**: 30s TTL with realtime bypass for critical operations
55. **Expected Gains**: 70-86% faster discovery, 80-90% faster health checks (with cache)
56. **Cache Invalidation**: Automatic on register/update/delete mutations

### **Database Drift Elimination** (Dec 15, 2025)
57. **Schema Management**: Unified db push strategy (development + production)
58. **GitHub Actions Alignment**: Production workflow mirrors development (no migration drift)
59. **Schema.prisma as Truth**: Single source of truth for all environments
60. **Convention Documentation**: CLAUDE.md updated with db push convention
61. **Zero-Downtime Indices**: Concurrent CREATE INDEX for production safety

### **Test Architecture Excellence** (Dec 15, 2025)
62. **Dual-Layer Testing**: Pattern validation (Layer 1) + Behavior verification (Layer 2)
63. **Comprehensive Coverage**: 199 tests across 6 suites
64. **Format Compliance**: All tests follow validation-testing-architecture.md
65. **Test Suites**: initialization, hub-tools, resource-manager, parameter-intelligence, execution-streaming, compliance-monitor
66. **Refactoring Protection**: Tests caught zero regressions during modular extraction

### **Error Helper & Tool Schema Patterns** (Dec 2025, updated Mar 2026)
**Pattern Reference**: `/.claude/knowledge/patterns/mcp-tool-ux-pattern.md`

67. **Error Modules**: 4 modules (basic, advanced, browser, hub) with 9 hub-specific helpers (Mar 2026: +3 new)
68. **Format**: Emoji prefixes (❌🔍💡🔧), fuzzy suggestions via `getScoredSuggestions()`, recovery steps
69. **Tool Schemas**: 100% coverage - all 28 tools have WHEN TO USE, SEE ALSO, EXAMPLES
70. **Hub Tools**: All 9 hub tools follow pattern with comprehensive documentation

### **Bug Class 30: Error Delivery Channel Mismatch** (Mar 2026)
**Registry**: `/.claude/knowledge/domain/mcp/bug-class-registry.md` (Bug Class 30)

116. **Throw vs Return**: `throw new Error()` in tool handlers produces JSON-RPC errors that Claude mobile hides as "Error occurred during tool execution". User-facing errors MUST use `return {content: [...], isError: true}`.
117. **Hub-only scope**: Basic/advanced tools already have outer catch wrappers that convert throws to MCP content. Only hub handlers were affected.
118. **Defense pattern**: Basic/advanced tools wrap at handler boundary: `catch (error) { return {content, isError: true} }`. Hub handlers must return MCP content explicitly.
119. **Fixed sites**: `service-call-handler.js` — `validateToolArguments()`, internal router call, external service call error path
120. **Decision table**: Auth/security/infrastructure → throw (OK). Validation/not-found/user-facing → return MCP content (required).

### **Compliance Policy & Service Call Security** (Jan–Feb 2026)
71. **Two-Layer Whitelist**: Static APPROVED_TOOLS (~40) + Dynamic from registered service capabilities
72. **TRUSTED_INTERNAL_SERVICES**: First-party Docker services that bypass SSRF checks (defined in `service-approval-policy.js`)
73. **Blocked Patterns**: 12+ regex patterns prevent injection, path traversal, admin access
74. **SSRF Protection (BC51)**: `validateUrlSafety()` blocks internal networks (10.x, 192.168.x, 172.16-31.x), localhost, cloud metadata
75. **SSRF Bypass Consistency**: TRUSTED_INTERNAL_SERVICES bypass applied to ALL 4 code paths:
    - `service-update-handler.js` (endpoint updates)
    - `service-call-handler.js` (services call action)
    - `workflow-tools-handler.js` (services workflow actions)
    - `hub-utilities.js` (background health checks)
76. **Dynamic Whitelisting Flow**: service-call-handler.js fetches capabilities.tools → passes to validateServiceCall
77. **Error Message Format**: Violations are objects with type/message/severity → must extract .message before joining

### **Internal vs External Service Registration** (Jan 2026)
78. **Seed Scripts**: For first-party Docker services (admin bypass, no owner assignment)
79. **registry(action: 'register') Tool**: For customer/external services (audited, user ownership, rate limited)
80. **Key Difference**: Seed scripts can use localhost endpoints; `registry(action: 'register')` would fail SSRF check (unless trusted)
81. **Service Categories**: browser-automation, web-scraping, testing, notification, communication

### **Internal Service Infrastructure** (Jan 2026)
81. **InternalServiceRouter**: Routes `internal://` calls directly to pAIchart handlers (no HTTP overhead)
82. **Service Registration** (post 2026-05-23 cleanup): `paichart-project-service`, `paichart-kpi-service`, `paichart-recommendation-engine` registered in MCPTool. Legacy `paichart-pov-service` + `paichart-task-service` actively deleted by `register-internal-services.ts` (commit 792dbc01).
83. **Context Normalization**: Handles both MCP (`context.user.id`) and Hub API (`context.apiUserContext.userId`) patterns
84. **Health Check Bypass**: Internal services always return healthy (same process, no network check)
85. **Zero Latency Benefit**: Eliminates 100-200ms HTTP round-trip for pAIchart's own service calls

### **Shared Orchestration Engine Pattern** (Jan 2026)
86. **Pure JavaScript Core**: `orchestration-engine.js` used by both JS (MCP Hub) and TS (API routes) handlers
87. **Single Source of Truth**: Fix bugs once, both handlers benefit automatically
88. **Two-Step Validation**: Zod schema (types) → Engine.validate() (business logic) - complementary layers
89. **Lazy Zod Loading**: Dynamic import with fallback for JS/TS interop in CommonJS context
90. **100% Feature Parity**: Variable chaining, dependency analysis, circular detection, all execution modes

### **Transport Architecture** (Jan 2026)
91. **WebSocket Removed**: Complete removal of WebSocket transport from MCP service calling (Jan 2026)
92. **HTTP/SSE Only**: `SSEClientTransport` is the only external transport for MCP services
93. **PostgreSQL NOTIFY/LISTEN**: Replaces WebSocket for real-time internal events
94. **Package Cleanup**: `ws` and `@types/ws` removed from dependencies
95. **Endpoint Validation**: `ws://` endpoints rejected with clear error message

### **Workflow Executions & Infrastructure Hardening** (Jan 16, 2026)
96. **Executions API Pattern**: Admin-only CRUD follows `createHandler` pattern with role checks, not `withPOVAccess`
97. **Time Bomb Prevention**: Always check if new record types need cleanup schedulers (Category 2 pattern)
98. **Rate Limit Scope**: Internal calls (127.0.0.1, no proxy headers) should bypass rate limiting - it's for external abuse protection
99. **JSON Nesting Gotcha**: Prisma JSON fields may have nested structures - transform before sending to frontend
100. **nativeEnum vs enum**: Use `z.nativeEnum(PrismaEnum)` to prevent drift between Zod and Prisma enums
101. **Specialist Review Value**: 91% + 82% = 86.5% combined confidence caught CUID validation gap and time bomb

### **Quarterly Security Review - Workflow System** (Jan 18, 2026)
102. **Execution Limits**: MAX_CONCURRENT_EXECUTIONS_PER_USER = 10 prevents resource exhaustion attacks
103. **Prompt Injection Protection**: `detectPromptInjection()` applied to workflow step arguments (nested recursive check)
104. **CUID Validation**: executionId in MCP tools validated with `/^c[a-z0-9]{24}$/` pattern
105. **Security Audit Logging**: Exceeded execution limits logged as security events for abuse detection
106. **System Limits Documentation**: Comprehensive limits reference in `mcp-hub-workflow-orchestration-reference.md`

### **MCP Resources Smoke Test Findings** (Feb 26, 2026)
107. **P0: Hub resource format bug** — All 5 methods in `hub-resources.js` (`HubResourceProvider` class) returned `content` (singular, tool format) instead of `contents` (plural, resource format). MCP spec requires: `tools/call` → `{ content: [{type, text}] }`, `resources/read` → `{ contents: [{uri, mimeType, text}] }`. Mixing causes silent failures — SDK client validates response shape and returns `contents: undefined`. Fixed Feb 26 commit `dbf38f5f`.
108. **P1: Hub resources missing from HTTP transport** — `mcp-server-http-clean.js` `resources/list` handler only called `resourceManager.listResources()` (artifacts/executions) but not `hubResourceProvider.listResources()`. Stdio transport (`mcp-server-v5.js` line 1258) already included both. Fixed in same commit. **Lesson**: When adding new resource providers, verify BOTH transport layers include them.
109. **Transport parity check**: Always verify both `mcp-server-v5.js` (stdio) and `mcp-server-http-clean.js` (HTTP) handle hub resources identically. Quick check: `grep -n "hubResourceProvider" mcp-server-v5.js mcp-server-http-clean.js`
110. **Feature flags registered**: SDK/compliance flags (`sdkCompliance`, `typeCoercion`, `performanceMonitoring`, `contextAwareness`, `workflowIntelligence`, `responseOptimization`) now properly registered in `feature-flags.js` v2.1.0. Previously these caused error-level "Unknown feature" logs at startup.
111. **Smoke test reference**: MCP resources essentials test (12/12 passing) at `/.claude/knowledge/smoke-tests/mcp-resources-essentials-test.md`. Tests hub resource discovery, reading, analytics, and pino log correlation.
112. **Hub analytics verified**: `mcp://hub/analytics` returns live data — 9 services, 266ms avg response time, 88.87% success rate (Feb 26 production).

### **Agentic Tool Loop & Argument Validation** (Mar 2026)
113. **BUG-006 — validateToolArguments()**: Fast-fail validation added to `service-call-handler.ts` before external service calls. Checks required params exist and rejects with descriptive error instead of sending malformed requests. Prevents silent failures where missing args produced confusing downstream errors.
114. **Hub tools in execution engine**: `buildHubToolGuidance()` in `agentExecutionEngine.ts` now injects hub service tool definitions into agent prompts, enabling agents to discover and call registered MCP services during execution.
115. **Agentic loop impact on Hub**: Multi-turn tool calling (P4) means agents can now call multiple hub services in sequence within a single execution — e.g., discover services, then call one, then call another based on the first result. MAX_TOOL_TURNS = 5, timeout scaled to 480s.

### **MCP Hub Hardening Session — Phases 1-5** (May 15-17, 2026)
116. **Phase 3 C1 — phantom-canonical eradication**: `lib/validation/mcp-hub-validation.ts` declared 10 schemas, only 2 wired. Deleted entirely; constraints migrated to L1 dispatch-boundary (`tool-schemas.js`) — name kebab regex, description charset, semver, mcp\|http endpoint refine, services.call 25KB + cross-trust injection regex, workflow.cancel.reason cap. 4 of 6 specialists chose C1 over C2 (architectural-review + mcp-tool-architecture + validation-engine + sec-ops via tiebreaker). 3-commit no-flying-trapeze sequence — both schemas concurrent during transition. Verdict matrix at `cline_docs/reviews/phase-3-verdict-matrix-2026-05-16/`.
117. **sec-ops Finding B — SSRF asymmetry closure**: update path had `validateUrlSafety()` runtime gate at L300; register path didn't. **Fix**: lifted to shared `assertEndpointSafe(endpoint, { existingService, action })` helper at `hub-utilities.js`. 6 hub call sites previously wrapped `validateUrlSafety` inline; register handler is now the 6th caller via the shared helper. Update handler refactored to use it too. **Architectural decision**: no exemption at register (SSRF_EXEMPT_SERVICES is a SEEDED list, not a user-facing self-registration path). Operational consequence: re-registering a Docker MCP service goes through the **seed script**, NOT the MCP `registry.register` tool. Documented in 4 places (follow-up doc + gold standard v2 Step 10 + dev-ops agent config + deployment-discovery prompt).
118. **sec-ops Finding C — args depth/leaf-count caps**: 25KB byte cap on services.call.arguments measures stringify size not memory/iteration cost. 100K flat strings totaling 24KB DoS bypass. **Fix**: `makeArgsShapeRefine({ maxDepth, maxLeaves })` factory at `lib/validation/args-shape.js` (plain JS for cross-runtime bare-Node load). Applied to BOTH `services.call.arguments` AND `services.steps[].arguments` (symmetric coverage per architectural-review). **Calibrated thresholds**: MAX_DEPTH=8 (2.6× p99 from 66-sample production survey), MAX_LEAVES=100 (14× p99; revised DOWN from original 1000 proposal). Quarterly recalibration if p99 leaves exceeds 33.
119. **Phase 4 — workflow.execute schema fragmentation**: 3 schemas (L1 + L3 + engine) linked by prose KEEP-IN-SYNC comment. 4-specialist Option C consensus (85% confidence): keep 3 schemas (each enforces different trust boundary), extract shared constants to `orchestration-params.ts`, contract test for drift. 7 named constants exported + 19 alignment assertions at `scripts/test-workflow-schema-alignment.ts`. Run via `npm run validate:workflow-schema-alignment`.
120. **Phase 1.5 — wrapWithSchema lifts GS14 to registration site**: Phase 1 added safeParse boilerplate to 5 dispatcher handle methods (~3 lines × 5). Phase 1.5 (May 17) extracted to `wrapWithSchema(toolName, handler)` at `dispatch-with-schema.js`; `embedded-server.ts:1648-1664` now wires `wrapWithSchema('toolName', dispatcher.handle.bind(dispatcher))`. Structural enforcement at the registration site — a dev cannot wire a new dispatcher without GS14 firing.
121. **Missing seed scripts shipped**: 4 of 7 SSRF-exempt services had no seed script (weather, eia, eodhd, token-validator — auto-CUID id smoking gun: registered via MCP handler pre-SSRF-gate). New seed scripts use `findFirst` + update/create pattern (robust to existing auto-CUID rows AND fresh canonical-id environments). Ran on production; all 4 services normalized to canonical state (ownerEmail/evaluationResult stripped; permissions normalized to `{ publicAccess: true }`).
122. **F3 fully closed across both code paths**: `maxTotalRetries` silent-drop bug had JS-side fix (commit `d3caed19`) and TS-side parallel at `mcpOrchestrationHandler.ts:201` (commit `fa40009d`). Both paths now thread `params.maxTotalRetries` through to `engine.execute`. Engine actively consumes the field at orchestration-engine.js:258, 267, 389, 466, 568.
123. **Phase 5 boy-scout cleanup (May 17)**: `validateToolInput` converted from `.parse()` to `.safeParse()` (3 sites); `validPovStatuses` hardcoded enum → `Object.values(POVStatus)` from Prisma; `parameter-normalizer.toolSpecificRules` added missing `template`/`services`/`registry` entries; 5 .ts FIELD_LIMITS adoption sites converted. tool-schemas.js .js sites deliberately skipped (bare-Node load constraint — same pattern as inline DANGEROUS_KEYS).

The successful transformation validates the revolutionary approach of repurposing existing infrastructure for new paradigms rather than building from scratch.