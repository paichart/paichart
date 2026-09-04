/**
 * GS14 — Schema Enforcement at the Dispatch Boundary
 *
 * Runs `CONSOLIDATED_SCHEMAS[toolName].inputSchema.safeParse(args)` BEFORE the
 * dispatcher routes to a sub-action handler.
 *
 * Why: the embedded MCP transport path (in-process agent execution,
 * mcpService.callEmbeddedTool, embedded bridge) does NOT call
 * validateToolInput. The SDK path (paichart-mcp via stdio) DOES, but only
 * when `featureFlags.smartErrorRecovery` is enabled. Without this helper
 * the schema only ran some of the time. Now it always runs.
 *
 * Pattern mirrors `lib/mcp/tasks/action/tasks-action-router.ts:74-93` (the
 * canonical GS14 reference for `perform`) but returns an error object instead
 * of throwing on validation failure, to match the dispatcher convention
 * (return `{ content, isError }`).
 *
 * IDEMPOTENCY REQUIREMENT — on the SDK path, the schema may run twice:
 * first via `mcp-server-v5.js:1234 validateToolInput()` (when
 * `smartErrorRecovery=true`), then again here. All transforms in
 * `CONSOLIDATED_SCHEMAS[*].inputSchema` MUST be idempotent. Verified
 * 2026-05-16 for project / analytics / template / services / registry
 * (boolean-string coercions, union(string,object) JSON.parse — all safe
 * under double-pass). If you add a new transform, verify second-pass
 * behavior or you will silently corrupt data on the SDK transport.
 *
 * @module dispatch-with-schema
 */

const { CONSOLIDATED_SCHEMAS, TOOL_SCHEMAS } = require('../../config/tool-schemas');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'dispatch-with-schema' }));

/**
 * Validate dispatcher arguments against the tool schema.
 *
 * Phase 1.6 (2026-05-18): extended to look up TOOL_SCHEMAS in addition to
 * CONSOLIDATED_SCHEMAS so standalone tools (search, fetch, list_prompts) get
 * the same dispatch-boundary safeParse as the 5 consolidated dispatchers.
 * Reviewed by mcp-tool-architecture-specialist at 93% confidence — the
 * precedence pattern (`CONSOLIDATED || TOOL_SCHEMAS`) is already used at 4
 * other sites (enterprise-parameter-intelligence.js:163, mcp-server-v5.js
 * tools/list builder, etc.) so this centralizes that pattern rather than
 * adding a new one. On collision (same name in both registries) CONSOLIDATED
 * wins — matches the existing 4-site convention.
 *
 * Failure modes:
 * - Schema rejects args → returns `{ ok: false, errorResponse }` with structured
 *   Zod error details. NEVER throws on user-input validation failure.
 * - Tool not in EITHER schema registry → THROWS. Lookup miss is a configuration
 *   bug (typo in toolName, or new dispatcher/standalone wired without a schema
 *   entry). Per `[[feedback_loud_failures_hot_paths]]` we fail loud at first
 *   call rather than silently degrade to no-validation — that's exactly the
 *   bug class Phase 1 was created to prevent.
 *
 * @param {string} toolName - consolidated ('project'|'analytics'|'template'|
 *   'services'|'registry') OR standalone ('search'|'fetch'|'list_prompts')
 * @param {Object} args - raw arguments from MCP transport
 * @returns {{ ok: true, data: Object } | { ok: false, errorResponse: { content: Array, isError: true } }}
 * @throws {Error} if toolName is not in either CONSOLIDATED_SCHEMAS or TOOL_SCHEMAS
 */
function validateDispatchArgs(toolName, args) {
  // Phase 1.6 — check both registries, CONSOLIDATED first (precedence matches
  // the 4 existing call sites that already do this lookup pattern).
  const toolConfig = CONSOLIDATED_SCHEMAS[toolName] || TOOL_SCHEMAS[toolName];
  if (!toolConfig || !toolConfig.inputSchema) {
    // Lookup miss = configuration drift (typo or new tool wired without a
    // schema entry). Fail loud per `feedback_loud_failures_hot_paths`.
    log.error({ toolName }, 'schema lookup miss — throwing to surface config bug');
    throw new Error(
      `dispatch-with-schema: no schema found for '${toolName}' in either ` +
      `CONSOLIDATED_SCHEMAS or TOOL_SCHEMAS. ` +
      `Add a schema entry in lib/mcp/server/config/tool-schemas.js or fix the toolName.`
    );
  }

  const parsed = toolConfig.inputSchema.safeParse(args);
  if (!parsed.success) {
    const errorDetails = parsed.error.errors
      .map(e => {
        const path = e.path.length > 0 ? `${e.path.join('.')}: ` : '';
        // Surface valid options for enum violations so LLM callers can recover
        // (mirrors the dispatcher's pre-Phase-1 friendly error format).
        const opts = e.code === 'invalid_enum_value' && Array.isArray(e.options)
          ? ` (valid: ${e.options.join(', ')})`
          : '';
        return `${path}${e.message}${opts}`;
      })
      .join('; ');
    log.warn(
      { toolName, action: args && args.action, errors: parsed.error.errors },
      'Dispatcher input validation failed at boundary'
    );
    return {
      ok: false,
      errorResponse: {
        content: [{ type: 'text', text: `❌ ${toolName} validation failed: ${errorDetails}` }],
        isError: true,
      },
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Wrap a dispatcher's handle method with GS14 schema enforcement.
 *
 * Phase 1.5 (2026-05-17) — replaces the 3-line safeParse-and-destructure
 * boilerplate that lived at the top of every dispatcher's handle method with
 * a single registration-site wrapper. Now adding a new consolidated tool
 * requires touching `embedded-server.ts` (the wiring site) AND the schema —
 * a dev cannot wire a new dispatcher without GS14 enforcement firing.
 *
 * Per architectural-review Phase 1 diff review §A2 + §B2: closes the
 * string-key coupling at the dispatcher call site AND the 5x duplicated
 * boilerplate that was a phantom-canonical breeding ground.
 *
 * @param {string} toolName - Canonical consolidated tool name
 * @param {(args: Object, context: Object) => Promise<*>} handler - Dispatcher's
 *   handle method bound to its instance. Receives the VALIDATED args (post
 *   safeParse + transforms applied); does NOT need to re-validate.
 * @returns {(args: Object, context: Object) => Promise<*>} Wrapped handler
 *   that runs `validateDispatchArgs(toolName, args)` first and returns the
 *   error response on failure, or invokes the inner handler on success.
 * @throws {Error} (from validateDispatchArgs) on configuration drift — see
 *   that function's docstring for details.
 *
 * Usage at registration site (`embedded-server.ts`):
 *
 *   const allTools = {
 *     project: wrapWithSchema('project', projectDispatcher.handle.bind(projectDispatcher)),
 *     analytics: wrapWithSchema('analytics', analyticsDispatcher.handle.bind(analyticsDispatcher)),
 *     // ... etc
 *   };
 */
function wrapWithSchema(toolName, handler) {
  return async function wrappedDispatcherHandler(args, context) {
    const validation = validateDispatchArgs(toolName, args);
    if (!validation.ok) return validation.errorResponse;
    return handler(validation.data, context);
  };
}

module.exports = { validateDispatchArgs, wrapWithSchema };
