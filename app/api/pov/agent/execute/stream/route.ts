import { NextRequest } from 'next/server';
import createHandler from '@/lib/api-handler';
import { prisma } from '@/lib/prisma';
import { UserRole, TokenPayload } from '@/lib/types/auth';
import { AgentExecutionRequest } from '@/lib/pov/api/agent-service';
import { ExecutionStatus } from '@/components/poveditor/pov/context/types/EntityTypes';
import { llmService } from '@/lib/services/llm/llm-service';
import { resolveHarnessMode } from '@/lib/services/harnessModeResolver';
import { AgentExecuteSchema } from '@/lib/validation/agent-template-validation';
import { RUNTIME_LIMITS } from '@/lib/validation/runtime-limits';
import { getPOVFromTask } from '@/lib/utils/pov-helpers';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { agentExecutionLimiter } from '@/lib/middleware/rate-limit';
import { mcpLogger } from '@/lib/logger';
import { applySystemPromptInjectionsWithFact } from '@/lib/services/execution-system-prompt';
import { resolveTaskProtocol } from '@/lib/agents/harness/program-protocol';
import { EXECUTION_TASK_CONTEXT_INCLUDE, EXECUTION_TEMPLATE_SELECT } from '@/lib/services/execution-hydration';
import { persistTerminalFailure, resolveAgentRole } from '@/lib/services/execution-terminal-persist';
import { runExecutionCore } from '@/lib/services/execution-core';
import { deriveMcpToolNames, buildHubToolGuidance } from '@/lib/services/execution-hub-guidance';
import { buildAgentPromptBody } from '@/lib/agents/harness/build-agent-prompt-body';
import { normalizeModelConfig, READ_MORE_FUNCTION_DEF } from '@/lib/agents/harness/agentic-tool-loop';
import type { AccumulatedUsage } from '@/lib/agents/harness/agentic-tool-loop';
import { resolvePromptPlaceholders, buildContextSummary } from '@/lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { createAgentExecution, stripReservedContextKeys } from '@/lib/services/agent-execution-create';
import { AuthError, NoTemplateAssignedError, DuplicateActiveExecutionError } from '@/lib/errors';

/**
 * POST /api/pov/agent/execute/stream
 * Execute an agent for a task with streaming response
 *
 * SECURITY: POV access validation (P1 Fix - Nov 2025)
 * - Was vulnerability: Cross-POV streaming execution
 * - Now: Validates POV ownership before streaming
 * Risk: HIGH → LOW
 */
export const POST = createHandler(
  async (req: NextRequest, context: { params: Record<string, string> }, user?: TokenPayload) => {
    // ✅ Rate limiting: 10 executions per minute
    const rateLimitResponse = agentExecutionLimiter(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Parse request body
    const rawBody = await req.json();

    // SECURITY: Validate request with prompt injection detection (parity with non-streaming route)
    const validation = AgentExecuteSchema.safeParse(rawBody);
    if (!validation.success) {
      mcpLogger.warn({ errors: validation.error.errors, severity: 'HIGH' }, 'agent execute stream validation failed');

      return new Response(
        JSON.stringify({
          error: {
            message: 'Validation failed',
            code: 'INVALID_REQUEST',
            details: validation.error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        }),
        { status: 400 }
      );
    }

    const body = validation.data as AgentExecutionRequest;

    // Validate request
    if (!body.taskId) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Task ID is required',
            code: 'INVALID_REQUEST',
          },
        }),
        { status: 400 }
      );
    }

    if (!body.agentConfig) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Agent configuration is required',
            code: 'INVALID_REQUEST',
          },
        }),
        { status: 400 }
      );
    }

    if (!body.agentConfig.role) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Agent role is required',
            code: 'INVALID_REQUEST',
          },
        }),
        { status: 400 }
      );
    }

    // ✅ P1 FIX: Get POV context and validate access BEFORE streaming
    const pov = await getPOVFromTask(body.taskId);

    if (!pov) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        }),
        { status: 404 }
      );
    }

    // ✅ P1 FIX: Validate POV access
    try {
      validatePOVAccess(user!, pov, {
        throwOnDeny: true,
        requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
        logContext: 'Agent Execute Stream'
      });
    } catch (error) {
      mcpLogger.error({ userId: user?.userId, taskId: body.taskId, povId: pov.id }, 'SECURITY: cross-POV streaming execution denied');

      return new Response(
        JSON.stringify({
          error: {
            message: 'POV access denied',
            code: 'FORBIDDEN',
          },
        }),
        { status: 403 }
      );
    }

    // ✅ Security checks passed - fetch full task for execution
    const task = await prisma.task.findUnique({
      where: {
        id: body.taskId,
      },
      include: {
        // Canonical hydration shapes (Phase 5b-i): the engine's task-relation
        // superset — §4/§5 of the GUI prompt now render (team/assignee/subTasks/
        // parentTask; ≈ +200-500 input tokens/turn, Steve-gated 2026-07-05) — and
        // the 11-field template UNION select (was the untyped full row).
        // The nested stage.phase.pov OVERRIDES the canonical stage select (full
        // superset): buildContextSummary + the promptTask shim read that path.
        // Position invariant (AE-I1): this fetch stays at the route edge, BEFORE
        // the execution row is created — a transient hydration failure must stay
        // an HTTP 5xx with zero rows, never a burnt FAILED execution.
        ...EXECUTION_TASK_CONTEXT_INCLUDE,
        stage: {
          include: {
            phase: {
              include: {
                pov: true,
              },
            },
          },
        },
        agentTemplate: { select: EXECUTION_TEMPLATE_SELECT },
      },
    });
    
    if (!task) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Task not found',
            code: 'NOT_FOUND',
          },
        }),
        { status: 404 }
      );
    }

    // Auto-assign Pipeline Harness template for PIPELINE-type tasks missing
    // agent configuration. Mirrors the MCP handler
    // (lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts:123-142)
    // so GUI executions of PIPELINE tasks route to the harness (which decomposes
    // the objective into sibling tasks) rather than the generic agent loop.
    const hasCustomConfig = !!task.agentRole && !!task.prompt;
    if (!task.agentTemplateId && !hasCustomConfig && task.type === 'PIPELINE') {
      const pipelineTemplate = await prisma.agentTemplate.findFirst({
        where: { name: 'Pipeline Harness', status: 'ACTIVE' },
      });
      if (pipelineTemplate) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            agentTemplateId: pipelineTemplate.id,
            agentRole: pipelineTemplate.defaultRole,
            updatedAt: new Date(),
          },
        });
        // Reflect the assignment on the in-memory task so downstream prompt
        // assembly (system prompt, protocol injection) uses the harness template.
        (task as any).agentTemplateId = pipelineTemplate.id;
        (task as any).agentRole = pipelineTemplate.defaultRole;
        (task as any).agentTemplate = pipelineTemplate;
        mcpLogger.info(
          { taskId: task.id, templateId: pipelineTemplate.id },
          'Auto-assigned Pipeline Harness template for PIPELINE task (stream route)'
        );
      }
    }

    // BC67 FIX: Atomic CAS guard — prevent duplicate concurrent executions
    // NOTE: SQL `NULL NOT IN (...)` evaluates to UNKNOWN, so explicitly include NULL via OR
    // Also transitions OPEN → IN_PROGRESS (required for valid COMPLETED transition later)
    const claimed = await prisma.task.updateMany({
      where: {
        id: body.taskId,
        OR: [
          { executionStatus: null },
          { executionStatus: { notIn: ['RUNNING', 'PENDING'] } },
        ],
      },
      data: {
        executionStatus: 'RUNNING',
        status: task.status === 'OPEN' ? 'IN_PROGRESS' : undefined,
        updatedAt: new Date()
      }
    });

    if (claimed.count === 0) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Agent is already executing for this task',
            code: 'ALREADY_RUNNING',
          },
        }),
        { status: 409 }
      );
    }

    // Create agent execution via canonical wrapper (task #85). Previously
    // this route passed `body.context || {}` straight through — accepting
    // arbitrary client-supplied shape, including (historically) no
    // triggeredBy at all. Now we construct a typed triggeredBy from the
    // JWT-authenticated user and pass body.context as contextExtras
    // (wrapper will merge + overlay validated triggeredBy on top).
    //
    // 2026-04-18 L3: throws DuplicateActiveExecutionError if the partial
    // UNIQUE index rejects a concurrent duplicate. Since the stream hasn't
    // started yet at this point (writer is defined below at line 246),
    // respond with a structured pre-stream 409 Response. Boundary-contract
    // CRITICAL #2 + #3: use `{error:{message,code,...}}` shape matching the
    // createHandler convention — GUI + REST clients share error-rendering logic.
    let execution;
    let chainedInputContext: Record<string, unknown> | null = null;
    try {
      ({ execution, chainedInputContext } = await createAgentExecution({
        taskId: body.taskId,
        status: 'RUNNING',
        config: body.agentConfig as any,
        triggeredBy: {
          id: user!.userId,
          source: 'api-pov-stream',
        },
        // Trust boundary: body.context is client-supplied (free-form) and is the
        // ONLY raw-client-context ingress. Strip server-reserved control-flow keys
        // (triggeredBy / reactorGeneration / cascade*) so a client can't inject a
        // value a downstream decision reads. See client-context-trust-boundary-2026-06-14.md.
        contextExtras: stripReservedContextKeys(body.context as Record<string, any> | undefined),
        logs: ['Agent execution started with streaming'],
      }));
    } catch (err) {
      if (err instanceof DuplicateActiveExecutionError) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                `Agent is already executing for this task. ` +
                `Existing execution: ${err.existingExecutionId ?? 'unknown'}. ` +
                `Wait for it to complete, or cancel it before re-executing.`,
              code: 'DUPLICATE_ACTIVE_EXECUTION',
              existingExecutionId: err.existingExecutionId,
              taskId: err.taskId,
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }

    // A2: chaining ran inside createAgentExecution and wrote task.inputContext to
    // the DB. Adopt the returned (already-capped) merged context into the in-memory
    // task snapshot so the §6 Pipeline Context render below sees it WITHOUT a second
    // DB read that could race replication lag. See IMPLEMENTATION-PLAN-v2.md (Change 5).
    if (chainedInputContext) {
      task.inputContext = chainedInputContext as typeof task.inputContext;
    }

    // Create a TransformStream to process the response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    let writerClosed = false;
    
    // Define initial execution data (will be written inside the IIFE)
    const initialData = {
      type: 'execution_started',
      executionId: execution.id,
      status: 'RUNNING' as ExecutionStatus,
      startTime: new Date().toISOString(),
      taskId: task.id,
      taskTitle: task.title,
    };
    
    // Process the agent execution in the background
    // SSE keepalive: a long LLM synthesis can send NO data for >60s; nginx's default proxy_read_timeout (60s)
    // then closes the socket → ResponseAborted → the execution is marked FAILED and the GUI shows a "network
    // error" even though the agent is still working. A periodic SSE comment keeps data flowing so no proxy
    // read-timeout can trip. Cleared in the finally. (2026-06-09.)
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    // token-usage-persistence: hoisted so the FAILED catch (:1590) can persist partial spend —
    // totalUsage is block-scoped inside the try. Ref keeps tracking the diagnostic-retry mutation.
    let capturedUsage: AccumulatedUsage | undefined;
    let capturedModel: string | null = null;

    // BC57 / convergence 0.5a (C-3): safe-write helper hoisted ABOVE the try so BOTH the
    // success path and the catch can use it. Once a terminal tx commits, SSE writes are
    // past the point of no return — a client-disconnect throw here must be absorbed, never
    // routed to the catch (which would flip a committed SUCCESS row to FAILED).
    // 2026-08-21 sweep: ALL in-try SSE writes now route through safeWrite — a client
    // disconnect must stop the streaming, never the work (exec cmt14lwlq00a4yxttzptbmr69
    // lost a completed 7030-token deliverable to a raw write throwing ResponseAborted).
    // This includes the PRE-LOOP sites: a disconnect is not reliably user action (network
    // drop / CDN close / tab lifecycle — see the 2026-08-21 follow-up doc), so aborting
    // pre-work on a transient blip would cancel a run the user just requested. The run
    // always proceeds and persists; spend is the user's own BYOK key.
    // Swallow scope: payloads are built AT THE CALL SITE (string arg), so construction
    // errors still propagate to the catch and fail the run loudly — safeWrite absorbs
    // stream-transport failures only. Keep it that way: never widen it to stringify
    // internally, never wrap observer bodies in try/catch.
    let clientGone = false;
    const safeWrite = async (data: string): Promise<boolean> => {
      if (clientGone) return false; // latch: a dead TransformStream writer never recovers
      try {
        await writer.write(encoder.encode(data));
        return true;
      } catch {
        clientGone = true;
        return false; // Client disconnected, skip remaining writes
      }
    };

    (async () => {
      try {
        // Send initial execution data
        await safeWrite(`data: ${JSON.stringify(initialData)}\n\n`);

        // Start the SSE heartbeat now that the stream is open (`:` prefix = SSE comment, ignored by EventSource).
        heartbeat = setInterval(() => {
          if (!writerClosed && !clientGone) {
            writer.write(encoder.encode(': heartbeat\n\n')).catch(() => { /* writer closing/closed — ignore */ });
          }
        }, 15000);

        // Add log (DB write deferred — SSE provides real-time feedback)
        const logs = ['Agent execution started with streaming', 'Processing task...', 'Initializing LLM service with user settings...'];

        // Send log update via SSE (no DB write yet — batched for efficiency)
        await safeWrite(`data: ${JSON.stringify({
          type: 'log_update',
          logs,
        })}\n\n`);
        
        // Resolve user LLM settings (per-request, no singleton mutation).
        // 0.5e (convergence review, agent-exec I-2): fail fast with the typed
        // USER_CONFIG_REQUIRED code, engine-canonical (agentExecutionEngine.ts BYOK
        // guard). The provider hard-rejects keyless requests anyway (task #85 — no
        // env-var fallback), so proceeding "on default config" only burned template
        // + MCP-discovery work and surfaced a generic provider error without the
        // errorCategory the GUI's "configure your API key" banner keys on.
        let userLLMSettings: { provider?: any; apiKey?: string; model?: string } = {};
        if (!user?.userId) {
          throw new AuthError(
            `No triggering user identified for this execution. Execution cannot proceed without attribution.`,
            'USER_CONFIG_REQUIRED',
            { taskId: task.id, executionId: execution.id }
          );
        }
        try {
          mcpLogger.debug({ userId: user.userId }, 'resolving LLM settings for user');
          userLLMSettings = await llmService.resolveUserSettings(user.userId);
          logs.push('LLM service settings resolved for user');
        } catch (error) {
          mcpLogger.error({ err: error }, 'error resolving LLM settings for user');
          logs.push('Warning: failed to resolve LLM settings for user');
        }
        if (!userLLMSettings.apiKey) {
          throw new AuthError(
            `No API key configured for your account. Visit /settings/llm to add a personal key.`,
            'USER_CONFIG_REQUIRED',
            { userId: user.userId, taskId: task.id, executionId: execution.id }
          );
        }
        
        // Checkpoint 1: persist logs after init (crash recovery)
        await updateExecutionLogs(execution.id, logs);

        // Send log update
        await safeWrite(`data: ${JSON.stringify({
          type: 'log_update',
          logs,
        })}\n\n`);

        // MCP tool names — shared derivation (Axis 6): task.mcpContext.tools → consolidated names
        // (legacy-mapped, deduped, CONSOLIDATED_TOOLS default). Feeds §7 (buildAgentPromptBody) + the
        // hub-routing gate below. The flat "you have access to X tools" system-prompt line is RETIRED —
        // §7 already enumerates the tools, richer (panel option (b), pc/ts/bc 2026-07-06).
        const mcpToolNames = deriveMcpToolNames((task.mcpContext as any)?.tools);

        // Prepare the prompts based on task configuration and agent template
        let systemPrompt = '';
        let userPrompt = '';

        // FIXED: Honor pre-resolved systemPrompt from agent.configure handler when present
        const storedSystemPrompt = task.metadata && typeof task.metadata === 'object' && task.metadata !== null
          ? (task.metadata as any).modelParameters?.systemPrompt
          : null;

        // Axis 4 (2026-07-06): the ONE role value the system-prompt HEAD is built from —
        // engine-canonical resolveAgentRole (config > template.defaultRole > task > 'AI Assistant').
        // Uses RAW body.agentConfig?.role (identical to the result.json/persist chain at :647). Consumed by
        // both role-bearing branches below (template :446, bare-role fallback :462) AND reused at :647,
        // so the role the LLM is TOLD === the role stamped in the deliverable === the engine
        // (agentExecutionEngine.ts:618), across all three branches. The USER-prompt role (promptConfig below)
        // is ALSO config-first now (axis 4c, 2026-07-06 — raw body.agentConfig?.role → the shared
        // buildAgentPromptBody's own canonical chain), so all four role slots agree.
        // See cline_docs/reviews/execution-path-convergence-2026-07-04/axis-4-decision.md.
        const resolvedAgentRole = resolveAgentRole(
          body.agentConfig?.role,
          (task as any).agentTemplate?.defaultRole,
          (task as any).agentRole,
        );

        // 2026-04-18 (Concern B, stream-route parity): enforce template-ownership
        // invariant BEFORE the three-branch prompt resolution below. The ad-hoc
        // `"You are an AI assistant acting as a ${agentRole}."` fallback at the
        // else branch is a latent bypass equivalent to the engine's Priority 3
        // (Universal Template + ROLE_GUIDANCE_LIBRARY) — different dead code,
        // same semantic issue. Close both to preserve dual-execution-path parity.
        //
        // Parity with engine (intentional divergence): this guard is LOOSER than
        // agentExecutionEngine.ts:~540 — we accept a user-configured `storedSystemPrompt`
        // as valid execution context (Priority 2), which the engine path does not.
        // Rationale: this is the interactive GUI path; users here may have
        // configured custom prompts intentionally. The engine is the reactor
        // path — no user present to configure — so it requires a FK template.
        // See: .claude/knowledge/patterns/dual-execution-path-parity-pattern.md
        // And plan §6.5 at cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md
        if (!storedSystemPrompt && !task.agentTemplate) {
          throw new NoTemplateAssignedError(execution.id, task.id);
        }

        if (storedSystemPrompt && (task.metadata as any).modelParameters?.useSystemPrompt !== false) {
          // Use pre-resolved system prompt (from agent.configure handler or GUI)
          systemPrompt = storedSystemPrompt;
        } else if (task.agentTemplate) {
          // Use agent template's prompt template with shared placeholder resolution
          // @see agent-prompt-assembly-pattern.md
          const template = task.agentTemplate;
          const templateRole = resolvedAgentRole; // Axis 4: engine-canonical (was `template.defaultRole || 'AI Assistant'` — dropped config + task)
          const contextualInfo = buildContextSummary(task);
          const resolvedTemplate = resolvePromptPlaceholders(
            template.promptTemplate || '',
            templateRole,
            contextualInfo
          );

          systemPrompt = resolvedTemplate;

          // Axis 5: the old inline `Your capabilities include:` / `Your constraints are:` block was
          // DEAD (array-only guards vs object-shaped template data — never fired for real templates).
          // Constraints now render object-aware in the shared applySystemPromptInjections tail (durable,
          // system-authority; also in §8). Capabilities are dropped (descriptive, not guardrails).
        } else {
          // Fallback (reachable: storedSystemPrompt present but useSystemPrompt===false, no template).
          // Axis 4 option (c): keep the bare-role graceful-degrade (settled Concern-B looseness), but
          // converge the role VALUE to the engine-canonical chain (was `task.agentRole || body.agentConfig.role`
          // — task-first, contradicting :446/:647). config now wins over task, matching the deliverable.
          systemPrompt = `You are an AI assistant acting as a ${resolvedAgentRole}.`;
        }

        // Hub tool ROUTING guidance (Axis 6): the shared block — same as the engine — appended when
        // the `services` gateway tool is present. Tool ENUMERATION lives in §7 (user prompt); this is
        // routing guidance only (WRONG/RIGHT + available services). Replaces the retired flat tool line.
        if (mcpToolNames.includes('services')) {
          systemPrompt += await buildHubToolGuidance(mcpToolNames, prisma, mcpLogger);
        }

        // Shared injection tail (convergence Phase 5a) — ONE implementation with the
        // engine: harness-context block, protocol injection (loadProtocols/named, now
        // with the engine-canonical cap-hit + not-found warns and the metadata-null
        // tripwire — log-only gains), P10 scope self-check. resolveHarnessMode stays
        // HERE (harnessContext also feeds result.json below). The resolution head
        // above stays stream-policy (stored-prompt gate → template → role-fallback;
        // see phase-5-prompt-construction-signoff.md 2a/2b — do not converge axes here).
        // Golden-byte gate: test:system-prompt-injections.
        const harnessContext = task?.type === 'PIPELINE' && task?.id
          ? await resolveHarnessMode(task.id)
          : null;

        // WS1 Phase C: `task` here is the ROUTE-EDGE snapshot (:143, pre-createAgentExecution —
        // the AE-I1 position invariant), fetched BEFORE the stamp write. resolveTaskProtocol
        // makes that safe by construction: a pre-stamp snapshot has no metadata.protocol key, so
        // the resolver re-runs the same pure title function the stamp writer ran and CONVERGES
        // with the DB (the panel's F1 fix — do not "optimize" this to a raw metadata read).
        const injectionResult = await applySystemPromptInjectionsWithFact(systemPrompt, {
          harnessContext,
          template: task.agentTemplate ? { id: task.agentTemplate.id, name: task.agentTemplate.name } : null,
          templateMetadata: task.agentTemplate?.metadata as Record<string, any> | null,
          constraints: (task.agentTemplate as any)?.constraints ?? null,
          taskProtocol: resolveTaskProtocol({ title: task.title, metadata: task.metadata }),
        }, prisma, mcpLogger.child({ executionId: execution.id, taskId: task.id, templateId: task.agentTemplate?.id }));
        systemPrompt = injectionResult.prompt;
        const protocolInjection = injectionResult.protocolInjection;

        // USER PROMPT (B1 Stage 1, 2026-06-09): build the FULL §1–§8 + Output Requirements prompt via the
        // shared buildAgentPromptBody — the SAME builder the engine uses (verbatim copy) — instead of the prior
        // thin §1 + partial-§3 + §6 inline assembly. The engine (real-pipeline path) is deliberately UNTOUCHED
        // (Stage 1); this closes the stream-route whole-prompt parity gap so the GUI/demo execution faithfully
        // previews a real run (incl. §2 expected-output, §5 environment, §7 tools+povId, the deliverable
        // contract + confidence-score rubric). Directive priority (task.prompt → agentConfig.prompt → synthesize)
        // and §6 are preserved; the old `!userPrompt.includes(description)` dedup is dropped (engine has none —
        // §1 directive and §3 description are separate concerns).
        //
        // Shaping (5b-i): the canonical include now loads §4/§5 relations directly
        // (team/assignee/subTasks/parentTask render — the enrichment this commit
        // ships). POV/phase keep the nested stage.phase precedence (full-row
        // superset the access gate guarantees) with the direct canonical relations
        // as fallback. workflow/successMetrics still skip (not on GUI AgentConfig).
        const promptTask = { ...task, pov: task.stage?.phase?.pov ?? task.pov, phase: task.stage?.phase ?? task.phase };
        const promptConfig = {
          prompt: task.prompt || body.agentConfig.prompt,
          // Axis 4c (2026-07-06): pass RAW body.agentConfig?.role — buildAgentPromptBody resolves the canonical
          // chain (config > template.defaultRole > task) itself, matching the engine (raw config.agentRole via
          // enhancedConfig) + the stream's own system-prompt (:429) & result.json (:660) roles. Was the task-first
          // pre-collapse `task.agentRole || body.agentConfig.role`, which subverted the builder's own chain. The
          // role is request-guarded present (:95), so config always wins → all four role slots agree.
          agentRole: body.agentConfig?.role,
          mcpTools: mcpToolNames,
          // workflow / successMetrics: not carried on the GUI AgentConfig → §8 those subsections skip gracefully.
        };
        userPrompt = buildAgentPromptBody(promptTask, promptConfig, { agentTemplate: task.agentTemplate });

        // Model parameters — read the FROZEN execution config (I-10 snapshot-at-create,
        // convergence Phase 5b-iii). createAgentExecution resolved the precedence chain
        // (task.metadata.modelParameters → body.agentConfig.parameters → template) ONCE
        // at the create chokepoint and froze it into execution.config — this route's
        // live re-compute (the 506ddd91 wiring-site class: the chain existed in three
        // places and this one got missed) is retired. Same read the engine has always
        // done; normalizeModelConfig tolerates the config's non-model keys (role/prompt
        // — engine precedent).
        const modelParameters = (execution.config as Record<string, any> | null) ?? {};

        // Log execution start + provider/model configuration (parity with engine path)
        mcpLogger.info({
          executionId: execution.id, taskId: task.id,
          provider: modelParameters.provider || 'default', model: modelParameters.model || 'default',
          toolCount: mcpToolNames.length,
        }, 'Streaming agent execution started');

        // Log the provider configuration being used
        const providerInfo = modelParameters.provider ?
          `Using task-specified provider: ${modelParameters.provider}` :
          `Using default provider from settings`;
        const modelInfo = modelParameters.model ?
          `with model: ${modelParameters.model}` :
          `with default model`;

        logs.push(`${providerInfo} ${modelInfo}`);

        // Prepare MCP tools as functions for the LLM if available
        let mcpFunctions: Array<{ name: string; description: string; parameters: any }> | undefined = undefined;
        if (mcpToolNames.length > 0) {
          const { mcpServerManager } = await import('@/lib/services/mcp/serverManager');
          const toolDefinitions = await mcpServerManager.getToolDefinitions(mcpToolNames);
          if (toolDefinitions.length > 0) {
            mcpFunctions = toolDefinitions.map(({ tool }) => ({
              name: tool.name,
              description: tool.description || `MCP tool: ${tool.name}`,
              parameters: tool.inputSchema || { type: 'object', properties: {}, required: [] }
            }));
            // read_more pager (injected, not a registered tool — see engine site + loop module).
            // Symmetric with agentExecutionEngine.ts so BOTH adapters offer read_more identically.
            mcpFunctions.push(READ_MORE_FUNCTION_DEF);
            logs.push(`MCP tools loaded: ${mcpFunctions.map(f => f.name).join(', ')}`);
          }
        }

        logs.push('Generating content with LLM...');

        // Send log update via SSE
        await safeWrite(`data: ${JSON.stringify({
          type: 'log_update',
          logs,
        })}\n\n`);

        // Agentic tool loop constants — configurable via template metadata.
        // Mirror the engine's behavior in agentExecutionEngine.ts:755-758 so
        // the GUI streaming path honors the same budget as the engine path.
        // Pipeline Harness template sets maxToolTurns: 100; previously this
        // route hardcoded 10, starving every harness run at 10-11 tool calls.
        const streamTemplateMeta = (task.agentTemplate?.metadata as any) || {};
        const streamTemplateModelParams = streamTemplateMeta.modelParameters || {};
        // R-1 (2026-06-17): clamp to the shared ceiling (the `|| 30` is the
        // default, not the max) — same clamp as agentExecutionEngine.ts:755.
        // Finding B (2026-06-18): Number()+isFinite guard so a non-numeric template
        // metadata value can't become NaN (→ 0-turn loop / instant timeout). Kept
        // byte-identical to the engine clamp (test-dual-path-timeout-parity).
        const rawToolTurns = Number(streamTemplateModelParams.maxToolTurns);
        const requestedToolTurns = Number.isFinite(rawToolTurns) && rawToolTurns > 0 ? rawToolTurns : RUNTIME_LIMITS.DEFAULT_TOOL_TURNS;
        const MAX_TOOL_TURNS = Math.min(requestedToolTurns, RUNTIME_LIMITS.MAX_TOOL_TURNS);
        const TIMEOUT_BASE_MS = RUNTIME_LIMITS.EXECUTION_TIMEOUT_BASE_MS;
        // D-A (2026-06-10): 60_000 → 30_000 to match the engine. Both paths
        // started at 60s; commit 98232961 halved the ENGINE's per-turn budget
        // when MAX_TOOL_TURNS went 10→30 but never mirrored here, leaving the
        // GUI at 1980s total vs the engine's 1080s. The engine has run
        // production pipelines at 30s/turn since then — converging down.
        const TIMEOUT_PER_TURN_MS = RUNTIME_LIMITS.EXECUTION_TIMEOUT_PER_TURN_MS;
        const executionTimeoutMs = TIMEOUT_BASE_MS + (MAX_TOOL_TURNS * TIMEOUT_PER_TURN_MS);

        // B1 (tool-loop extraction Phase 1): normalize ONCE; all 4 generateText
        // sites below build from this. Do NOT read modelParameters.* for LLM
        // options past this line. S2: never log normalizedLlmConfig (raw apiKey).
        // Note: this also fixes D-E — the initial call previously lacked the
        // ANTHROPIC_SDK provider fallback its 3 sibling sites had.
        const normalizedLlmConfig = normalizeModelConfig(modelParameters, userLLMSettings, systemPrompt);

        // P9 (task #90 MVP) RETIRED 2026-07-17 — mirror of the engine-path retirement:
        // ~60 firings ever, zero true positives (see agentExecutionEngine.ts for the
        // full rationale). P10's [TEMPLATE_MISMATCH] self-report escape hatch remains.
        // Phase 6b: the full happy-path spine (agentic loop + post-loop pipeline +
        // SUCCESS persist) runs in lib/services/execution-core.ts. ALL stream-side
        // effects (SSE events + logs[] entries) wire in via AWAITED observers,
        // preserving the former wire ordering. The core owns the abort timer.

        // Prompt snapshot (Monitoring live-only add-on, 2026-06-10): the
        // RUNTIME-ASSEMBLED prompts — template + hub guidance + protocol
        // injection (system) and §1-§8 (user) — are not persisted anywhere
        // (documented gap, 2026-04-16). This event makes "what did the LLM
        // actually see" visible for THIS run in the Monitoring tab. LIVE-ONLY
        // + stream-only by design: not persisted, no engine mirror (SSE is
        // presentation-layer). No secrets here — prompts never contain apiKey.
        await safeWrite(`data: ${JSON.stringify({
          type: 'prompt_snapshot',
          systemPrompt,
          userPrompt,
          systemPromptLength: systemPrompt.length,
          userPromptLength: userPrompt.length,
        })}\n\n`);

        // Locals populated inside onInitialResponse: the 4 SSE-driving vars (live progress)
        // + the shared `extensions` ref the core reads POST-loop for result.json (Phase 6b).
        // A call-site literal would freeze the pre-loop nulls (data loss) — hence a mutable ref.
        let functionCall: any = null;
        let webSearchResults: any = null;
        let citations: any = null;
        let searchQueries: any = null;
        const extensions: Record<string, unknown> = {};

        // I-9 role chain, engine-canonical (config > template.defaultRole > task.agentRole
        // > 'AI Assistant'). Threads BOTH result.json and persist agentRole via the single
        // input.agentRole (cannot diverge). Axis 4 (2026-07-06): this is now the SAME hoisted
        // `resolvedAgentRole` the system-prompt HEAD is built from (:419) — result.json role ===
        // system-prompt role by construction. ⚠ arg-source is the LIVE body — frozen-config
        // convergence (I-10) is a deferred post-swap cleanup.
        const resolvedAgentRoleForArtifact = resolvedAgentRole;
        await runExecutionCore({
          executionId: execution.id,
          execution: { id: execution.id, createdAt: execution.createdAt ?? null, startTime: execution.startTime ?? null, context: (execution as any).context },
          task: { id: task.id, type: (task as any).type, metadata: task.metadata, povId: task.povId, title: task.title, createdAt: task.createdAt, inputContext: task.inputContext },
          config: modelParameters,
          userId: user?.userId ?? '',
          prompt: userPrompt,
          normalizedLlmConfig,
          mcpFunctions,
          agentRole: resolvedAgentRoleForArtifact,
          resolvedTemplate: (task as any).agentTemplate ? { id: (task as any).agentTemplate.id, name: (task as any).agentTemplate.name } : null,
          harnessContext,
          protocolInjection,
          maxToolTurns: MAX_TOOL_TURNS,
          executionTimeoutMs,
          startTime: execution.startTime ?? execution.createdAt ?? new Date(),
          buildSuccessLogs: () => { logs.push('Agent execution completed successfully'); return logs; },
          extensions,
          // Flip 2 (2026-07-06, Increment 3): GUI-triggered SUCCESS now prunes-on-complete like the engine —
          // the shared status-aware selector caps SUCCESS/FAILED at 10/10 in-tx (execution-retention.ts). The
          // daily RM sweep settles to 4/4. Safe on the base of Increment 1 (BC-#2 exactly-once rollup) +
          // Increment 2 (status-aware selector). Both transitional core params are now converged (engine == stream).
          prune: true,
          // Flip 1 (2026-07-06): GUI-triggered SUCCESS now fires the post-commit reactors, same as the
          // engine — pipeline-retrigger (last-sibling → SYNTHESIZE) + ready-dependent queueing. A GUI run
          // is now a cascade ENTRY POINT (self-propagating through the authored DAG, each task queued once;
          // bounded by MAX_HARNESS_REACTOR_GENERATIONS). Steve-accepted billing delta (temporal, not
          // volumetric — runs the executions the user would have clicked anyway). prune stays false (Flip 2,
          // separately gated). Panel: pipeline-harness/agent-execution/task-dependency GREEN. See
          // cline_docs/reviews/execution-path-convergence-2026-07-04/flip-1-panel-synthesis.md.
          fireReactors: true,
          logger: mcpLogger,
        }, {
          // ⚠ Observer property order = EMISSION order (loop → stopReason → storing →
          // diagnosticRetry → completed), NOT interface-declaration order.
          // test:sse-event-sequence harvests by SOURCE position; a naive interface-order
          // layout breaks the 30-site golden at idx17.
          loop: {
          onInitialResponse: async (response, llmDurationMs) => {
            const initialTokens = (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0);
            logs.push(`Initial LLM call: ${(llmDurationMs / 1000).toFixed(1)}s (${initialTokens.toLocaleString()} tokens)`);

            // Phase 2 (C-1): observers no longer accumulate into the deliverable var —
            // the loop owns it (loopResult.assembledText = last-turn). These SSE chunks
            // remain the LIVE progress view (all turns); the SAVED deliverable is set
            // from assembledText after the loop.
            functionCall = response.functionCall || null;
            webSearchResults = response.webSearchResults || null;
            citations = response.citations || null;
            searchQueries = response.searchQueries || null;
            // Phase 6b: populate the shared extensions ref for result.json (read POST-loop by
            // the core). Preserve the `?? undefined` omission coercion — the builder emits a
            // field only when !== undefined (execution-artifacts.ts:456-459).
            extensions.functionCall = response.functionCall ?? undefined;
            extensions.webSearchResults = response.webSearchResults ?? undefined;
            extensions.citations = response.citations ?? undefined;
            extensions.searchQueries = response.searchQueries ?? undefined;

            // Stream initial text to client
            if (response.text) {
              await safeWrite(`data: ${JSON.stringify({
                type: 'text_chunk',
                text: response.text,
                isComplete: response.stopReason !== 'tool_use',
              })}\n\n`);
            }
            if (webSearchResults && webSearchResults.length > 0) {
              await safeWrite(`data: ${JSON.stringify({
                type: 'web_search_results',
                webSearchResults,
              })}\n\n`);
              logs.push(`Web search results: ${webSearchResults.length} results`);
            }
            if (citations && citations.length > 0) {
              await safeWrite(`data: ${JSON.stringify({
                type: 'citations',
                citations,
              })}\n\n`);
            }
            if (searchQueries && searchQueries.length > 0) {
              await safeWrite(`data: ${JSON.stringify({
                type: 'search_queries',
                searchQueries,
              })}\n\n`);
            }
          },
          onTurnStart: async (turn, functionCalls) => {
            logs.push(`Tool loop turn ${turn}: ${functionCalls.length} tool call(s)`);
            // Send function call events for each tool call in this turn
            for (const toolCall of functionCalls) {
              await safeWrite(`data: ${JSON.stringify({
                type: 'function_call',
                functionCall: { name: toolCall.name, arguments: toolCall.arguments },
              })}\n\n`);
            }
            await safeWrite(`data: ${JSON.stringify({
              type: 'log_update',
              logs,
            })}\n\n`);
          },
          onToolResult: async (record, fullContent) => {
            logs.push(record.success
              ? `Tool ${record.tool}: success (${record.durationMs}ms)`
              : `Tool ${record.tool}: failed - ${record.error}`);

            // Structured tool-result card (Monitoring-tab Medium, 2026-06-10).
            // Replaces the former markdown-in-text_chunk emission so the live
            // response panel carries PROSE ONLY (live Deliverable Contract —
            // mirrors d652a630 which did the same for persisted artifacts;
            // forensics live in `result.json.toolCalls`). The GUI renders
            // these as collapsed per-turn activity cards.
            // STREAM-ONLY by design — SSE is presentation-layer; the engine
            // path has no SSE surface (documented intentional divergence in
            // dual-execution-path-parity-pattern.md).
            await safeWrite(`data: ${JSON.stringify({
              type: 'tool_result_card',
              turn: record.turn,
              tool: record.tool,
              server: record.server,
              success: record.success,
              durationMs: record.durationMs,
              preview: fullContent.length > 2000
                ? fullContent.slice(0, 2000) + '...'
                : fullContent,
              ...(record.success ? {} : { error: record.error }),
            })}\n\n`);
          },
          onTurnToolsComplete: async () => {
            // Flush tool-outcome log entries to the GUI before the (potentially
            // long) continuation LLM call.
            await safeWrite(`data: ${JSON.stringify({
              type: 'log_update',
              logs,
            })}\n\n`);
          },
          onTurnComplete: async (turn, info) => {
            const turnTokens = (info.response.usage?.inputTokens || 0) + (info.response.usage?.outputTokens || 0);
            logs.push(`Turn ${turn} LLM: ${(info.llmDurationMs / 1000).toFixed(1)}s (${turnTokens.toLocaleString()} tokens)`);

            // Stream continuation text to client (LIVE progress — all turns). Phase 2:
            // no longer accumulated into the deliverable; the saved deliverable is the
            // last turn only (loopResult.assembledText), set after the loop.
            if (info.response.text) {
              await safeWrite(`data: ${JSON.stringify({
                type: 'text_chunk',
                text: '\n\n' + info.response.text,
                isComplete: info.response.stopReason !== 'tool_use',
              })}\n\n`);
            }
          },
          onCorrectionStart: async (failedCount) => {
            // GUI signal: tell the user we're reconciling before re-streaming
            await safeWrite(`data: ${JSON.stringify({
              type: 'log_update',
              logs: [`Reconciling response against tool-call outcomes (${failedCount} failures)...`],
            })}\n\n`);
          },
          onCorrectionComplete: async (correctedResponse) => {
            // Stream the corrected text to the GUI as a fresh chunk (LIVE progress).
            // Phase 2: no local-mirror sync needed — the loop replaces currentResponse
            // with the corrected response, so loopResult.assembledText already reflects it.
            await safeWrite(`data: ${JSON.stringify({
              type: 'text_chunk',
              text: '\n\n' + correctedResponse.text,
              isComplete: true,
            })}\n\n`);
          },
          },
          onUsageCaptured: (usage, model) => { capturedUsage = usage; capturedModel = model; },
          onStopReasonFinalized: async (appendedNote) => {
            // Stream the stop-reason appended note as a live SSE chunk (fires only when truthy).
            await safeWrite(`data: ${JSON.stringify({
              type: 'text_chunk',
              text: appendedNote,
              isComplete: true,
            })}\n\n`);
          },
          onStoringResults: async () => {
            // Pre-artifact storing signal (fires before the terminal tx). The two log lines
            // feed the accumulated `logs` array persisted via buildSuccessLogs (subtlety #2).
            logs.push('Content generated successfully');
            logs.push('Generating artifacts...');
            // 2026-08-21: safeWrite, NOT writer.write. This fires immediately before the
            // terminal tx, i.e. when the agent's work is already COMPLETE. A raw write here
            // throws ResponseAborted if the client has navigated away, which reaches the outer
            // catch and persists FAILED over finished work — exec cmt14lwlq00a4yxttzptbmr69
            // lost a 7030-token end_turn deliverable exactly this way. The progress
            // notification is not worth the result: if nobody is listening, commit anyway.
            // Return value intentionally ignored — writerClosed is managed by the post-commit
            // tail, and a failed notification must not alter control flow here.
            // See cline_docs/follow-ups/stream-disconnect-discards-completed-work-2026-08-21.md
            await safeWrite(`data: ${JSON.stringify({
              type: 'log_update',
              logs,
            })}\n\n`);
          },
          diagnosticRetry: {
            onDiagnosticRetryStart: async (priorConfidence) => {
              // GUI signal: tell the user we're running a diagnostic reflection pass
              await safeWrite(`data: ${JSON.stringify({
                type: 'log_update',
                logs: [`Diagnostic retry: reflecting on ${priorConfidence}/100 response for structural gaps...`],
              })}\n\n`);
            },
            onDiagnosticRetryComplete: async (retryText) => {
              // Stream the retry text to the GUI as a fresh chunk (mirror of correction-turn pattern)
              await safeWrite(`data: ${JSON.stringify({
                type: 'text_chunk',
                text: '\n\n' + retryText,
                isComplete: true,
              })}\n\n`);
            },
          },
          onExecutionCompleted: async ({ createdArtifacts, endTime }) => {
            // 0.5a (C-3): the SUCCESS tx has committed — point of no return. safeWrite absorbs
            // a client disconnect so it can never reach the catch and overwrite SUCCESS with FAILED.
            await safeWrite(`data: ${JSON.stringify({
              type: 'execution_update',
              status: 'SUCCESS',
              endTime: endTime.toISOString(),
            })}\n\n`);

            for (const artifact of createdArtifacts) {
              await safeWrite(`data: ${JSON.stringify({
                type: 'artifact_created',
                artifact: {
                  id: artifact.id,
                  name: artifact.name,
                  type: artifact.type,
                  createdAt: artifact.createdAt.toISOString(),
                },
              })}\n\n`);
            }

            // Send final log update
            await safeWrite(`data: ${JSON.stringify({
              type: 'log_update',
              logs,
            })}\n\n`);

            // End the stream
            await safeWrite('data: [DONE]\n\n');
            writerClosed = true;
            try { await writer.close(); } catch { /* client already disconnected */ }
          },
        });
      } catch (error) {
        mcpLogger.error({ err: error }, 'error executing agent with streaming');

        // 2026-04-18 (Concern B, §6.6): extract the actual error message + code
        // instead of hardcoding 'Agent execution failed' four places below.
        // NoTemplateAssignedError (from the §6.5 pre-branch guard) and any other
        // typed errors now propagate to the GUI's `sseUtils.processSSEStream`
        // consumer (lib/pov/api/agent-service.ts:701-705) which expects the
        // shape `{type: 'error', error: {message, code?}}`. This restores
        // dual-execution-path parity with the engine's outer catch at
        // agentExecutionEngine.ts:1631.
        // 2026-08-21: guard on the MESSAGE being empty, not on the type. ResponseAborted
        // (thrown by Next's request adapter when the client disconnects) IS an Error whose
        // `message` is '' — so the old `instanceof Error ? error.message : fallback` took the
        // truthy branch and wrote an EMPTY error string. exec cmt14lwlq00a4yxttzptbmr69 was
        // undiagnosable from the DB for exactly this reason; `error.name` alone would have
        // said "ResponseAborted" and made it immediate.
        const rawErrMessage = error instanceof Error ? error.message : '';
        const errMessage = rawErrMessage
          || (error instanceof Error && error.name ? error.name : 'Agent execution failed');
        const errCode = (error as { code?: string } | null)?.code;

        // safeWrite is hoisted above the try (0.5a) — shared with the success path.

        // Terminal FAILURE persist — the shared core (Phase 4b). Keeps the 4a CAS:
        // FAILED is written ONLY while the row is still non-terminal, so a throw
        // after the SUCCESS tx commits can never clobber the committed SUCCESS.
        // Stream adapter config: reactors OFF (transitional; Flip 1 Steve-gated).
        // error.json now carries source:'stream' + executionTimeMs via the shared
        // buildErrorJson union (I-3 — zero in-tree readers by name).
        const errorEndTime = new Date();
        const errorLogs = [
          'Agent execution started with streaming',
          'Processing task...',
          'Error occurred during execution',
          errMessage,
        ];
        const failResult = await persistTerminalFailure(prisma, {
          executionId: execution.id,
          taskId: task.id,
          taskTitle: task.title,
          errorMessage: errMessage,
          errorCode: errCode,
          source: 'stream',
          logs: errorLogs,
          endTime: errorEndTime,
          executionCreatedAt: execution.createdAt ?? null,
          executionStartTime: execution.startTime ?? null,
          usage: capturedUsage,
          servingModel: capturedModel,
          // Flip 1 (2026-07-06): GUI-triggered FAILURE now fires the pipeline retrigger (retrigger ONLY —
          // never ready-dependents; core-policy asymmetry at execution-terminal-persist.ts:713-727), so a
          // failed GUI pipeline child lets the harness re-enter SYNTHESIZE-to-escalate instead of leaving it
          // stuck IN_PROGRESS (leaving this false was an active bug). Does not touch the failure CAS. No-op
          // unless the failed child was the last non-terminal sibling.
          fireReactors: true,
          logger: mcpLogger,
        });

        if (failResult.persisted) {
        // BC57 FIX: SSE events after commit — use safeWrite to handle disconnected clients
        // Shape `{type: 'error', error: {message, code?}}` matches GUI sseUtils consumer
        // at lib/pov/api/agent-service.ts:701-705 (boundary-contract §B1).
        if (!await safeWrite(`data: ${JSON.stringify({
          type: 'error',
          error: { message: errMessage, code: errCode },
        })}\n\n`)) { writerClosed = true; } else
        if (!await safeWrite(`data: ${JSON.stringify({
          type: 'log_update',
          logs: errorLogs,
        })}\n\n`)) { writerClosed = true; } else
        if (!await safeWrite(`data: ${JSON.stringify({
          type: 'execution_update',
          status: 'FAILED',
          endTime: errorEndTime.toISOString(),
        })}\n\n`)) { writerClosed = true; } else
        if (!await safeWrite(`data: ${JSON.stringify({
          type: 'artifact_created',
          artifact: {
            id: failResult.errorArtifactId!,
            name: 'error.json',
            type: 'application/json',
            createdAt: errorEndTime.toISOString(),
          },
        })}\n\n`)) { writerClosed = true; } else
        // End the stream
        if (await safeWrite('data: [DONE]\n\n')) {
          writerClosed = true;
        }
        } else {
          // CAS miss: the row already holds a committed terminal state (a
          // post-commit throw after SUCCESS) — emitting the FAILED tail would
          // contradict the DB. Log the fact and let `finally` close the stream.
          mcpLogger.warn({ executionId: execution.id }, 'failure SSE tail skipped — execution already terminal (CAS miss)');
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (!writerClosed) {
          try { await writer.close(); } catch { /* already closed */ }
        }
      }
    })().catch(error => {
      mcpLogger.error({ err: error }, 'unhandled error in streaming execution');
    });
    
    // Return the readable stream
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Added for Nginx environments, good practice
      },
    });
  },
  { requireAuth: true, allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] }
);

/**
 * Update execution logs
 * @param executionId Execution ID
 * @param logs Logs to update
 */
async function updateExecutionLogs(executionId: string, logs: string[]): Promise<void> {
  await prisma.agentExecution.update({
    where: {
      id: executionId,
    },
    data: {
      logs,
    },
  });
}
