/**
 * Task Action Handler
 * Handles perform tool for executing various task operations
 *
 * Extracted from sdk-native-advanced-tools.js (Phase 3.5 Task 2C - Dec 2025)
 *
 * @module TaskActionHandler
 */

const { performanceMonitor } = require('../../monitoring/performance-monitor');
const { featureFlags } = require('../../config/feature-flags');
const { smartErrorRecovery } = require('../../utils/smart-error-recovery');
const { apiClient } = require('../../utils/api-client');
const { capText } = require('../cap-text');
const { responseFormatter } = require('../../utils/formatters');
const { ContextEnricher } = require('../../middleware/context-enricher');
const { writeOperationLimiter, povCreationLimiter } = require('../../../../utils/rate-limiter');  // Phase 3: DoS prevention
const { validateCuidParam } = require('../../../../utils/cuid-validation');
const { buildTokenPayload } = require('../../utils/build-token-payload');
const { stderr: _bridgeStderr } = require('../../mcp-logger');
// BUG-BASIC-XSS-1 Phase 2.6 (GAP-2): one inline throw with parseError.message
// echo (user-supplied JSON parameters string).
const { sanitizeForResponse } = require('../response-sanitizer');
const _bridgeLog = _bridgeStderr.mcpLogger.child({ module: 'TaskActionHandler' });

// Direct router bridge — loads only in ts-node processes (paichart-web / embedded server).
// In paichart-mcp (standalone), this require fails and routeAction stays null.
// Three-tier fallback handles this: direct → authenticated HTTP → fail-closed.
//
// LOUD LOAD STATUS (A1, 2026-04-07): emit a one-line startup log per outcome so
// operators can determine which tier is active in production from logs alone.
// EXPECTED outcomes per process:
//   paichart-web    → 'direct' (Tier 1) — bridge loaded, in-process Prisma path
//   paichart-mcp    → 'http-fallback' (Tier 2) — no ts-node, HTTP fallback intended
// If paichart-web reports 'http-fallback', that is the regression tracked in
// .claude/knowledge/domain/harness/TODO-RATE-LIMIT-FIX.md and needs investigation.
let routeAction;
try {
  const bridge = require('../../../tasks/action/router-bridge');
  routeAction = bridge.routeAction;
  _bridgeLog.info(
    { tier: 'direct' },
    'Router bridge loaded — Tier 1 (direct in-process) active'
  );
} catch (e) {
  // WARN not ERROR: in paichart-mcp this branch is expected and intentional.
  // ERROR would cry wolf in half of production. WARN is greppable.
  _bridgeLog.warn(
    {
      err: e,
      code: e.code,
      tier: 'http-fallback',
      expectedIn: 'paichart-mcp',
      unexpectedIn: 'paichart-web',
    },
    'Router bridge failed to load — falling back to authenticated HTTP. ' +
      'EXPECTED in paichart-mcp. In paichart-web, FIRST check for a ' +
      '"Router bridge loaded — Tier 1" line from the SAME pid: webpack bundles ' +
      'duplicate copies of this module per route context, and a failing ' +
      'duplicate (e.g. the /api/mcp/status RSC bundle) alongside a boot-time ' +
      'Tier-1 success is benign (verified 2026-06-12, pid 2807752: success at ' +
      'boot +0.5s, duplicate-copy failure at +11s). Only INVESTIGATE if NO ' +
      'Tier-1 success exists for the pid (see TODO-RATE-LIMIT-FIX.md addendum).'
  );
}

// Dec 2025 UX Assessment: Import error helpers for consistent error handling
const { invalidActionError, missingPOVContextError } = require('./error-helpers');
const { leanFactsLine, appendFactsLine } = require('./lean-card-facts');

/**
 * Task Action Handler
 * Executes various task actions with smart error handling and resource context
 */
class TaskActionHandler {
  /**
   * Create Task Action Handler
   * @param {Object} parent - Parent SDKNativeAdvancedTools instance
   */
  constructor(parent) {
    this.parent = parent;
    this.logger = parent.logger;
  }

  /**
   * Handle perform tool - Executes actions on tasks
   *
   * @param {Object} args - Tool arguments
   * @param {string} args.taskId - Task CUID to act upon
   * @param {string} args.action - Action to execute (update_status, assign, add_dependency, etc.)
   * @param {Object} [args.parameters] - Action-specific parameters
   * @param {Object} context - User authentication context
   *
   * @returns {Promise<Object>} MCP response with action result
   * @returns {Array<Object>} returns.content - Response content with action confirmation
   * @returns {boolean} returns.isError - Whether action failed
   *
   * @description Executes various task actions via API client. Enriches results with
   *   resource context when available. Supports smart error recovery.
   */
  async handle(args, context) {
    const timingId = performanceMonitor.startTiming('sdk_native_perform');

    try {
      this.logger.debug('Executing SDK-native perform');

      // P0-2 FIX: Enrich context at the start of method
      const enrichedContext = ContextEnricher.enrichContext(context);
      const userContext = ContextEnricher.getUserContext(enrichedContext);

      // Phase 3: Rate limiting (DoS prevention)
      // sec-ops-specialist recommendation: Prevent action flooding attacks
      const userId = enrichedContext?.user?.id || enrichedContext?.user?.userId || 'anonymous';

      // General action rate limit: 300 operations per minute, per user
      // NOTE: Most embedded calls never reach this check — they go through
      // lib/api-handler.ts via apiClient.post first because router-bridge.js
      // currently fails to load in compiled JS production (see TODO-RATE-LIMIT-FIX.md).
      const actionRateLimitKey = `perform:${userId}`;
      const actionAllowed = await writeOperationLimiter.checkLimit(actionRateLimitKey);
      if (!actionAllowed) {
        const resetTime = writeOperationLimiter.getResetTime(actionRateLimitKey);
        throw new Error(
          `⏱️ Rate Limit Exceeded: Too many task actions. ` +
          `Limit: 300 operations per minute per user. ` +
          `Try again after: ${resetTime.toISOString()}. ` +
          `This protects system stability.`
        );
      }

      // Jan Marshal's Simple & Reliable Approach - Direct parameter usage
      // No complex normalization needed - direct parameter extraction
      let processedArgs = { ...args };
      if (typeof processedArgs.parameters === 'string') {
        try {
          this.logger.debug('Parameters received as string, attempting to parse JSON');
          processedArgs.parameters = JSON.parse(processedArgs.parameters);
          this.logger.debug('Successfully parsed parameters from string');
        } catch (parseError) {
          this.logger.error('Failed to parse parameters string:', parseError.message);
          throw new Error(`Invalid JSON in parameters string: ${sanitizeForResponse(parseError.message)}`);
        }
      }

      // Step 3: Validate parameters
      const { action, parameters, ...restArgs } = processedArgs;

      // Dec 2025 UX Assessment: Use invalidActionError helper for missing/invalid actions
      if (!action) {
        throw invalidActionError(null);
      }

      // Validate action is in the list of valid actions.
      //
      // WARNING (BC75 phantom-canonical risk): this list MUST stay in sync with
      // ALLOWED_MCP_ACTIONS at lib/validation/mcp-action-validation.ts:188-203.
      // Two sources of truth — adding an action there but not here causes the
      // exact rejection seen during the 2026-05-15 pov.update deploy smoke
      // (TypeScript validation accepted; JS handler rejected upstream). See
      // BC75 §Task-Action Handler Sibling Drift in the bug-class registry.
      const validActions = [
        'pov.create', 'pov.update', 'task.create', 'task.update', 'task.assign', 'task.complete', 'task.comment',
        'stage.create', 'agent.configure', 'agent.assign', 'agent.execute', 'agent.status', 'agent.results',
        'analytics.generate'
      ];
      if (!validActions.includes(action)) {
        throw invalidActionError(action);
      }

      this.logger.debug(`Executing action: ${action}`);

      // Phase 3: POV creation daily limit (50/day - matches web API)
      // Aligns with: app/api/pov/route.ts:320 (povCreationLimiter)
      if (action === 'pov.create') {
        const povRateLimitKey = `pov.create:${userId}`;
        const povAllowed = await povCreationLimiter.checkLimit(povRateLimitKey);
        if (!povAllowed) {
          const resetTime = povCreationLimiter.getResetTime(povRateLimitKey);
          const remaining = povCreationLimiter.getRemainingRequests(povRateLimitKey);
          throw new Error(
            `⏱️ Daily POV Creation Limit Reached: You can create up to 50 POVs per day. ` +
            `Remaining today: ${remaining}. ` +
            `Limit resets: ${resetTime.toISOString()}. ` +
            `This prevents abuse and ensures system stability.`
          );
        }
      }

      // Step 4: Prepare final parameters for API call
      // Handle both nested parameters and flat parameters from Claude Desktop
      let finalParameters = parameters || {};

      // If no nested parameters, check if parameters are provided directly in args
      if (Object.keys(finalParameters).length === 0 && Object.keys(restArgs).length > 0) {
        // Extract all args except 'action' as parameters
        finalParameters = { ...restArgs };
        this.logger.debug('Using flat parameters from args:', finalParameters);
      }

      // BUG-005 FIX: If parameters object was non-empty but missing taskId,
      // check restArgs (top-level args) for taskId and merge it in.
      // Scenario: { action, taskId, parameters: { prompt } } - taskId lands in restArgs
      // not in finalParameters because the non-empty parameters guard above skips merge.
      if (!finalParameters.taskId && !finalParameters.task_id) {
        if (restArgs.taskId) {
          finalParameters.taskId = restArgs.taskId;
          this.logger.debug('BUG-005: Merged top-level taskId into finalParameters');
        } else if (restArgs.task_id) {
          finalParameters.taskId = restArgs.task_id;
          this.logger.debug('BUG-005: Merged top-level task_id into finalParameters as taskId');
        }
      }

      // Handle parameter mapping for common Claude Desktop issues
      if (finalParameters.task_id && !finalParameters.taskId) {
        finalParameters.taskId = finalParameters.task_id;
        delete finalParameters.task_id;
        this.logger.debug('Mapped task_id to taskId');
      }

      // BUG-002 FIX: Map assignee_name → assignee for API compatibility
      if (finalParameters.assignee_name && !finalParameters.assignee && !finalParameters.assigneeId) {
        finalParameters.assignee = finalParameters.assignee_name;
        delete finalParameters.assignee_name;
        this.logger.debug('Mapped assignee_name to assignee');
      }

      if (finalParameters.assignee && !finalParameters.assigneeId) {
        // Keep assignee as is - the API handles name lookup
        this.logger.debug('Using assignee name for lookup');
      }

      if (finalParameters.due_date && !finalParameters.dueDate) {
        finalParameters.dueDate = finalParameters.due_date;
        delete finalParameters.due_date;
        this.logger.debug('Mapped due_date to dueDate');
      }

      // BUG-004 FIX: Map task_title/taskTitle → title for task.create
      if (!finalParameters.title) {
        if (finalParameters.task_title) {
          finalParameters.title = finalParameters.task_title;
          delete finalParameters.task_title;
          this.logger.debug('Mapped task_title to title');
        } else if (finalParameters.taskTitle) {
          finalParameters.title = finalParameters.taskTitle;
          delete finalParameters.taskTitle;
          this.logger.debug('Mapped taskTitle to title');
        }
      }

      this.logger.debug('Final parameters for API:', finalParameters);

      // GS12 — validate every CUID parameter present in finalParameters at the
      // dispatch boundary, before any API call. Single point of validation
      // covers all 13 perform actions. Catches:
      //   - fetch-style "<type>-<cuid>" prefixes (right-type → suggest stripped form)
      //   - cross-type prefixes (wrong-type → flag the type mismatch)
      //   - genuinely malformed CUIDs (generic VALIDATION error)
      const CUID_PARAM_NAMES = [
        'povId', 'pov_id',
        'taskId', 'task_id',
        'agentTemplateId', 'templateId', 'template_id',
        'phaseId', 'phase_id',
        'stageId', 'stage_id',
        'assigneeId',
        'serviceId', 'service_id'
      ];
      for (const paramName of CUID_PARAM_NAMES) {
        const value = finalParameters[paramName];
        if (value === undefined || value === null || value === '') continue;
        const check = validateCuidParam(value, paramName, 'perform', action);
        if (!check.isValid) {
          performanceMonitor.endTiming(timingId);
          return check.errorResponse;
        }
      }

      // BUG-001 FIX: Validate taskId for actions that require it
      const actionsRequiringTaskId = [
        'task.update', 'task.assign', 'task.complete', 'task.comment',
        'agent.configure', 'agent.assign', 'agent.execute', 'agent.status', 'agent.results'
      ];
      if (actionsRequiringTaskId.includes(action)) {
        const taskId = finalParameters.taskId || finalParameters.task_id;
        if (!taskId) {
          throw new Error(
            `❌ ACTION "${action}" REQUIRES taskId\n\n` +
            `🔍 Error Type: VALIDATION\n\n` +
            `💡 The taskId parameter is REQUIRED for ${action}.\n\n` +
            `🔧 Get task ID:\n` +
            `  1. project(action: 'task.list', pov_name: 'MyPOV') - Find tasks\n` +
            `  2. Copy taskId from response\n\n` +
            `🔧 Example:\n` +
            `  perform({\n` +
            `    action: '${action}',\n` +
            `    taskId: 'cm3abc...',  // <- Required\n` +
            `    ${action === 'task.update' ? "status: 'IN_PROGRESS'" : action === 'task.comment' ? "comment: 'My comment'" : "..."}\n` +
            `  })`
          );
        }
      }

      // Dec 2025 UX Assessment: Validate POV context for actions that require it
      const actionsRequiringPOV = ['task.create', 'stage.create'];
      if (actionsRequiringPOV.includes(action)) {
        const povId = finalParameters.povId || finalParameters.pov_id;
        if (!povId) {
          throw missingPOVContextError(action);
        }
      }

      // Enhanced API call with resource context integration
      // Spread finalParameters FIRST at the top level so the API route's "Claude Desktop
      // bug workaround" (Jan Marshal's fix) can extract them. Named fields after the spread
      // take priority, preventing collisions if finalParameters contains 'action' or
      // 'parameters' keys. Previously this was an explicit per-action allowlist which
      // silently dropped new parameters (e.g., dependencyIds stripped until Apr 2026).
      const apiPayload = {
        ...finalParameters,
        action: action,
        parameters: finalParameters,
        includeResourceContext: true,
        includeExecutionHistory: true
      };

      let data;
      let tokenPayload;  // Hoisted for polling loop access (Phase 4)
      const actionId = `mcp-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (routeAction) {
        // TIER 1 — DIRECT PATH: In-process call, no HTTP, no admin fallback possible
        // Only available in ts-node processes (paichart-web / embedded server)
        tokenPayload = buildTokenPayload(enrichedContext);
        // retry-band keep-best (2026-07-04): thread the calling execution id (set by
        // mcpService.callEmbeddedTool for agent-loop calls) so agent.execute can record
        // retry provenance. Absent for client (Desktop/ChatGPT) calls — human re-runs
        // stay unmarked by construction (Adj #3).
        const result = await routeAction(action, finalParameters, tokenPayload, actionId,
          context && context.callingExecutionId ? { callingExecutionId: context.callingExecutionId } : undefined);
        // Wrap result to match apiClient.post response shape — downstream code accesses data.data
        // (e.g., data.data?.result?.execution?.id at line 275). The API route returns { data: result }
        // and apiClient.post returns that response body, so the direct path must match. (R2)
        data = { data: result };
      // U2 Phase D site #11 (2026-05-19): KEEP Tier 2 per sec-ops Option a —
      // standalone paichart-mcp process can't load ts-node bridge, so HTTP fallback
      // is still required. The 2026-04-01 TODO is OBSOLETE: ts-node IS now loaded in
      // mcp-server-http-clean.js (since a7db9a35, 2026-04-08), so Tier 1 IS available
      // for the standalone process. But Tier 2 is kept as defence-in-depth.
      } else if (userContext?.userId) {
        // TIER 2 — AUTHENTICATED HTTP: api-client.js now mints per-call with
        // INTERNAL_API_AUDIENCE; admin fallback path eliminated.
        // Condition switched from .token to .userId — token field dropped post-Phase-D.
        this.logger.debug({ action }, 'Using authenticated HTTP path (per-call mint)');
        data = await apiClient.post('/api/mcp/tasks/action', apiPayload, { userContext });
      } else {
        // TIER 3 — FAIL CLOSED: No direct path AND no authenticated user
        this.logger.error({ action }, 'SECURITY: No direct path and no authenticated user — blocking');
        throw new Error('Authentication required: No direct handler and no authenticated user available');
      }

      this.logger.info(`Successfully executed action: ${action}`);

      // ── agent.execute: Poll for completion and return full results ──
      // MCP tool calls have no timeout (Claude Desktop waits patiently),
      // so we poll internally (each HTTP call < 1s) and return the complete
      // results in one shot — no manual polling needed by the user.
      if (action === 'agent.execute') {
        const executionId = data.data?.result?.execution?.id;
        const pollTaskId = finalParameters.taskId;

        // Prompt-return gates (2026-07-14) — two cases skip the completion poll:
        //  (a) IN-AGENT-LOOP calls (context.callingExecutionId present): the pipeline
        //      protocols instruct the caller to exit and be re-triggered when the child
        //      completes, so blocking here burns up to 19 min of the PARENT execution's
        //      wall-clock (its own tool-turn timeout) waiting for a result it must not
        //      consume in-turn.
        //  (b) parameters.waitForCompletion === false: explicit opt-out for interactive
        //      clients whose OWN tool timeout is shorter than the run — without it a
        //      successful launch surfaces as a spurious "operation timed out" error.
        // Default for human clients is unchanged: poll-to-completion, full results in
        // one shot (the Claude Desktop UX this block exists for). The dispatched
        // response already carries executionId + agent.status/agent.results nextSteps,
        // so the prompt-return path needs no extra shaping.
        const inAgentLoop = !!(context && context.callingExecutionId);
        const promptReturn = inAgentLoop || finalParameters.waitForCompletion === false;

        if (executionId && promptReturn) {
          this.logger.info(
            { executionId, inAgentLoop, waitForCompletion: finalParameters.waitForCompletion },
            'agent.execute prompt-return — skipping completion poll'
          );
        } else if (executionId) {
          // Poll window must outlive the engine's execution timeout, which is scaled:
          // TIMEOUT_BASE_MS (180s) + MAX_TOOL_TURNS (default 30) × TIMEOUT_PER_TURN_MS (30s)
          // = 1080s (agentExecutionEngine.ts ~754-757). The old 300s window returned
          // "still running" for long multi-turn runs (prod-observed: 455s/9-turn Sonnet,
          // Mar 2026). If a CLIENT times out before this window, the execution continues
          // server-side and agent.results still works — longer window is never worse.
          const maxWaitMs = 1_140_000; // 19 min = engine worst case 1080s + 60s buffer
          const pollIntervalMs = 5_000; // check every 5 seconds
          const startTime = Date.now();
          let finalStatus = null;

          this.logger.info(`Polling execution ${executionId} for completion (max ${maxWaitMs / 1000}s)`);

          while (Date.now() - startTime < maxWaitMs) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

            try {
              let statusData;
              if (routeAction && tokenPayload) {
                // Tier 1: Direct call with polling skip
                const result = await routeAction('agent.status', { executionId }, tokenPayload,
                  `${actionId}-status-${Date.now()}`, { skipLogging: true });
                statusData = { data: result };
              } else {
                // Tier 2: Authenticated HTTP (standalone MCP server)
                statusData = await apiClient.post('/api/mcp/tasks/action', {
                  action: 'agent.status',
                  parameters: { executionId }
                }, { userContext });
              }

              const executions = statusData.data?.result?.executions || [];
              const latestExec = executions[0];
              const elapsed = Math.round((Date.now() - startTime) / 1000);

              if (latestExec) {
                this.logger.debug(`Poll: execution ${executionId} status=${latestExec.status} (${elapsed}s elapsed)`);

                if (latestExec.status === 'SUCCESS' || latestExec.status === 'FAILED') {
                  finalStatus = latestExec.status;
                  break;
                }
              }
            } catch (pollError) {
              this.logger.warn(`Poll error (will retry): ${pollError.message}`);
              // Continue polling — transient errors are expected
            }
          }

          if (finalStatus) {
            // Fetch full results with artifacts
            try {
              let resultsData;
              if (routeAction && tokenPayload) {
                // Tier 1: Direct call with polling skip
                const result = await routeAction('agent.results', {
                  executionId, includeOutput: true, limit: 1
                }, tokenPayload, `${actionId}-results-${Date.now()}`, { skipLogging: true });
                resultsData = { data: result };
              } else {
                // Tier 2: Authenticated HTTP (standalone MCP server)
                resultsData = await apiClient.post('/api/mcp/tasks/action', {
                  action: 'agent.results',
                  parameters: { executionId, includeOutput: true, limit: 1 }
                }, { userContext });
              }

              const elapsed = Math.round((Date.now() - startTime) / 1000);
              this.logger.info(`Execution ${executionId} completed: ${finalStatus} in ${elapsed}s — returning full results`);

              // Replace the initial "dispatched" response with full results
              data = resultsData;
            } catch (resultsError) {
              this.logger.warn(`Failed to fetch results after completion: ${resultsError.message}`);
              // Fall through to return the original dispatched response
            }
          } else {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            this.logger.warn(`Execution ${executionId} still running after ${elapsed}s — returning status`);
            // Append a timeout note to the response so Claude Desktop knows
            if (data.data?.result) {
              data.data.result.message =
                `Agent execution is still running after ${elapsed} seconds. ` +
                `Check results later with: perform(action: 'agent.results', taskId: '${pollTaskId}'). ` +
                `Tip: pass parameters: { taskId, waitForCompletion: false } on future agent.execute calls ` +
                `to return immediately and poll yourself.`;
            }
          }
        }
      }

      // Step 5: Enhanced response formatting with resource context
      let enhancedResult = data.data;

      // Add resource context if available
      if (enhancedResult && typeof enhancedResult === 'object') {
        try {
          enhancedResult = await this.parent.enhanceActionResultWithResourceContext(
            enhancedResult,
            action,
            finalParameters
          );
        } catch (enhancementError) {
          this.logger.debug('Failed to enhance action result with resource context:', enhancementError.message);
          // Continue with original result if enhancement fails
        }
      }

      let formattedText = responseFormatter.formatActionResult(enhancedResult);

      performanceMonitor.endTiming(timingId);

      // SIZE CAP GUARD — agent.results response can be 300k+ chars (full LLM transcripts +
      // artifact content). Claude Desktop and other MCP clients fail silently on large responses.
      // Replace with a lean summary that includes artifact mcp:// URIs for fetch-on-demand.
      // Pass verbose=true to bypass and get full inline output.
      const MAX_AGENT_RESULTS_CHARS = 3000;
      const VERBOSE_MAX_CHARS = 100000;  // V1 (2026-06-09): hard ceiling even for verbose=true (matches the
                                         // connector artifact cap) — verbose was previously UNBOUNDED here too.
      let agentResultsTruncation = null; // V1 truncation fact threaded to _meta below
      if (action === 'agent.results' && formattedText.length > MAX_AGENT_RESULTS_CHARS) {
        const isVerbose = finalParameters.verbose === true || finalParameters.verbose === 'true';
        if (!isVerbose) {
          // API response wraps data under .result — check both depths
          const resultData = enhancedResult?.result || enhancedResult || {};
          const executions = resultData.executions || [];
          const nestedArtifacts = executions.flatMap(e => e.artifacts || []);
          const topArtifacts = resultData.artifacts || [];
          const artifacts = nestedArtifacts.length > 0 ? nestedArtifacts : topArtifacts;
          const exec = executions[0] || resultData.executions?.[0];
          const lines = [];

          if (exec) {
            const statusEmoji = exec.status === 'SUCCESS' ? '✅' : exec.status === 'FAILED' ? '❌' : '⏳';
            let durationSec = 'unknown';
            if (exec.executionTime) {
              durationSec = `${Math.round(exec.executionTime / 1000)}s`;
            } else if (exec.endTime && exec.startTime) {
              durationSec = `${Math.round((new Date(exec.endTime) - new Date(exec.startTime)) / 1000)}s`;
            }
            lines.push(`${statusEmoji} **${exec.status}** — ${(exec.id || '').slice(-8)} (${durationSec})`);
            if (exec.agentTemplate?.name) lines.push(`Template: ${exec.agentTemplate.name}`);
            // Facts line (run-8 GAP-1): the hoisted RESULT_JSON_SUMMARY_KEYS fields sit
            // on `exec` (TS handler spreads them) — shared single source (dedup 2026-07-18).
            const factsLine = leanFactsLine(exec);
            if (factsLine) lines.push(factsLine);
          } else {
            lines.push(`✅ Execution completed`);
          }
          lines.push('');

          if (artifacts.length > 0) {
            lines.push(`**Artifacts (${artifacts.length}):**`);
            artifacts.forEach(a => {
              const size = a.content?.length ? ` (${a.content.length.toLocaleString()} chars)` : '';
              lines.push(`  • ${a.name || a.type}${size} → \`fetch(id: "artifact-${a.id}")\``);
            });
            lines.push('');
          }

          const reportArtifact = artifacts.find(a => a.name?.endsWith('.md') || a.type === 'report');
          const previewSource = (reportArtifact?.content || exec?.output || '').toString();
          if (previewSource) {
            const preview = previewSource.replace(/```[\s\S]*?```/g, '[code]').trim().slice(0, 400);
            lines.push('**Output preview:**');
            lines.push(preview + (previewSource.length > 400 ? '…' : ''));
            lines.push('');
          }

          if (artifacts.length > 0) {
            const primary = reportArtifact || artifacts[0];
            lines.push(`📖 **Read full report:** \`fetch(id: "artifact-${primary.id}")\``);
            lines.push('');
          }

          // Render top elicitation prompts in the lean summary too — these are
          // the actionable hints from ElicitationPromptsGenerator and they
          // should survive the SIZE CAP path, otherwise users only see them
          // when they pass verbose=true. Cap at top 3 to keep the summary
          // lean. The TS handler at lib/mcp/tasks/action/handlers/agent/
          // agent-results-handler.ts already sorts by priority.
          const lprompts = resultData.elicitationPrompts || [];
          if (lprompts.length > 0) {
            lines.push('💭 **Suggested next steps:**');
            lprompts.slice(0, 3).forEach((p, idx) => {
              lines.push(`${idx + 1}. ${p.text}`);
            });
            lines.push('');
          }

          const taskIdForHint = finalParameters.taskId || finalParameters.task_id || '';
          lines.push(`💡 Full inline: \`perform(action: "agent.results", taskId: "${taskIdForHint}", verbose: true)\``);

          formattedText = lines.join('\n');
          this.logger.debug(`agent.results SIZE CAP: replaced ${enhancedResult ? 'large' : 'unknown'} response with lean summary (${formattedText.length} chars)`);
        } else {
          // V1: verbose returns full inline output, but BOUNDED — capText hard-caps at VERBOSE_MAX_CHARS and
          // emits an honest {returnedChars,totalChars} fact (shared with the connector / STDIO handler).
          const capped = capText(formattedText, VERBOSE_MAX_CHARS);
          formattedText = capped.text;
          agentResultsTruncation = capped.truncation;
        }
      }

      // A5 (2026-08-03, boundary-contract F6): the containment fact must reach the gate on EVERY
      // agent.results path. The lean summary above runs only when the response exceeds 3,000 chars
      // AND verbose is off — so a small response, or any verbose:true call, previously returned no
      // **Facts:** line at all, while pov-program SYNTHESIZE Step 2 tells the gate to read the fact
      // off exactly that line. Node C retrieves per leg with format:"detailed", so this is its read
      // path. No-op when the lean summary already embedded the line.
      if (action === 'agent.results') {
        const rd = enhancedResult?.result || enhancedResult || {};
        formattedText = appendFactsLine(formattedText, (rd.executions || [])[0]);
      }

      // Dec 2025 UX Assessment: Add action-specific nextSteps for workflow guidance
      const resultId = enhancedResult?.id || enhancedResult?.taskId || finalParameters.taskId;
      const actionNextSteps = {
        'task.create': [
          `Task created successfully`,
          `View task: project(action: 'task.context', taskId: '${resultId}')`,
          `Assign agent: perform(action: 'agent.assign', taskId: '${resultId}', agentTemplateId: '...')`,
          `List all tasks: project(action: 'task.list', povId: '${finalParameters.povId}')`
        ],
        'task.update': [
          `Task updated successfully`,
          `View updated task: project(action: 'task.context', taskId: '${resultId}')`
        ],
        'task.complete': [
          `Task marked complete`,
          `View completion: project(action: 'task.context', taskId: '${resultId}')`,
          `List remaining tasks: project(action: 'task.list', status: 'OPEN')`
        ],
        'agent.assign': [
          `Agent assigned to task`,
          `Execute agent: perform(action: 'agent.execute', taskId: '${resultId}')`,
          `Or configure first: perform(action: 'agent.configure', taskId: '${resultId}', ...)`
        ],
        'agent.execute': [
          `Agent execution completed — results returned inline`,
          `View full artifacts: perform(action: 'agent.results', taskId: '${resultId}')`,
          `View task: project(action: 'task.context', taskId: '${resultId}')`
        ],
        'agent.status': [
          `Agent status retrieved`,
          enhancedResult?.status === 'COMPLETED'
            ? `Get results: perform(action: 'agent.results', taskId: '${resultId}')`
            : `Check again: perform(action: 'agent.status', taskId: '${resultId}')`
        ],
        'agent.results': [
          `Agent results retrieved`,
          `View task context: project(action: 'task.context', taskId: '${resultId}')`
        ],
        'stage.create': [
          `Stage created successfully`,
          `Create task in stage: perform(action: 'task.create', stageId: '${resultId}', ...)`
        ]
      };

      const nextSteps = actionNextSteps[action] || [
        `Action "${action}" completed successfully`,
        `View task: project(action: 'task.context', taskId: '${resultId}')`
      ];

      return {
        content: [{ type: "text", text: formattedText }],
        isError: false,
        _meta: {
          tool: 'perform',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          action: action,
          parametersProvided: !!parameters,
          resourceContext: true,
          executionHistory: true,
          performanceMetrics: true,
          truncation: agentResultsTruncation,  // V1: verbose ceiling fact (null unless verbose hit the cap)
          nextSteps: nextSteps,
          enhancement: {
            version: '2.0',
            features: ['resource_context', 'execution_history', 'performance_metrics']
          }
        }
      };

    } catch (error) {
      performanceMonitor.recordError('sdk_native_perform', error);
      this.logger.error('perform failed:', error.message);

      // Apply smart error recovery if enabled
      if (featureFlags.isEnabled('smartErrorRecovery')) {
        const recovery = await smartErrorRecovery.analyzeValidationError(error, 'perform', args);
        if (recovery.canRecover) {
          const errorMessage = this.parent.createEnhancedErrorMessage(error, recovery, 'perform');
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
            _meta: {
              tool: 'perform',
              timestamp: new Date().toISOString(),
              sdkNative: true,
              errorRecovery: recovery
            }
          };
        }
      }

      // Enhanced error message parsing for better debugging
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Handle case where error is an object but not an Error instance
        try {
          // Check for common error object patterns
          if (error.message) {
            errorMessage = error.message;
          } else if (error.error) {
            errorMessage = typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
          } else if (error.response && error.response.data) {
            errorMessage = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
          } else {
            errorMessage = JSON.stringify(error, null, 2);
          }
        } catch (stringifyError) {
          errorMessage = error.toString();
        }
      }

      // Additional parsing for API errors
      if (errorMessage.includes('API request failed:')) {
        // Extract the actual API error
        const parts = errorMessage.split(' - ');
        if (parts.length > 1) {
          errorMessage = parts[parts.length - 1];

          // Try to parse JSON error if it looks like JSON
          if (errorMessage.startsWith('{') || errorMessage.startsWith('[')) {
            try {
              const parsed = JSON.parse(errorMessage);
              if (parsed.message) {
                errorMessage = parsed.message;
              } else if (parsed.error) {
                if (typeof parsed.error === 'string') {
                  errorMessage = parsed.error;
                } else if (parsed.error.message) {
                  errorMessage = parsed.error.message;
                } else {
                  errorMessage = JSON.stringify(parsed.error);
                }
              }
            } catch (parseError) {
              // Keep original error message if parsing fails
            }
          }
        }
      }

      // ITEM 3g.2 (2026-04-25): extract typed-error code if present.
      // AppError subclasses set .code; generic Error doesn't. Surface to
      // client _meta so MCP clients can discriminate (DUPLICATE_ACTIVE_EXECUTION,
      // PIPELINE_STAGE_MISMATCH, etc.) without parsing message strings.
      // Pattern reference: lib/services/agentExecutionEngine.ts:316 (errorCategory)
      // See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
      const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;

      return {
        content: [{ type: "text", text: `❌ Error in perform: ${errorMessage}` }],
        isError: true,
        _meta: {
          tool: 'perform',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          originalError: error instanceof Error ? error.message : String(error),
          ...(errorCode ? { errorCode } : {}),
        }
      };
    }
  }
}

module.exports = { TaskActionHandler };
