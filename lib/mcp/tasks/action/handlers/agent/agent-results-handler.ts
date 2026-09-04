/**
 * Agent Results Handler
 *
 * Handles agent.results action - retrieves detailed execution results with artifacts.
 *
 * Features:
 * - Query by taskId or executionId
 * - Includes full artifact content (if requested)
 * - Performance metrics and elicitation prompts
 * - Enhanced result formatting for Claude Desktop
 * - LLM response integration
 * - POV access validation (including DEMO_USER)
 *
 * @created 2025-12-18 (Phase 2.3, Step 4)
 * @extraction Facade extraction pattern (Dec 15-17, 2025)
 */

import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import type { TokenPayload } from '@/lib/types/auth';
import { mcpLogger } from '@/lib/logger';
import { pickResultJsonSummary } from '@/lib/services/execution-artifacts';
import type { Prisma } from '@prisma/client';

const log = mcpLogger.child({ module: 'AgentResultsHandler' });

/**
 * The ONE projection this surface reads (2026-07-25, error-surface panel).
 *
 * Formerly `let executions: any[]` — the same type erasure as agent-status-handler, and
 * it was hiding FOUR reads of columns that have never existed on `agent_executions`:
 * `progress`, `output`, `metrics` and `error`. Each rendered as a silent no-op (an
 * always-0 number, or a branch that could never be taken), so the surface advertised
 * data it structurally could not return. Removed with this select — a fifth phantom is
 * now a compile error.
 *
 * Unlike agent.status this surface ALREADY loads artifact `content` (that is its job),
 * so hoisting the failure code out of error.json here costs zero extra queries.
 */
const RESULTS_EXECUTION_SELECT = {
  id: true,
  status: true,
  startTime: true,
  endTime: true,
  errorCode: true,
  task: { select: { id: true, title: true, description: true, status: true, priority: true } },
  agentTemplate: { select: { id: true, name: true, category: true, description: true } },
  artifacts: { select: { id: true, name: true, type: true, content: true, createdAt: true } },
} satisfies Prisma.AgentExecutionSelect;

type ResultsExecution = Prisma.AgentExecutionGetPayload<{ select: typeof RESULTS_EXECUTION_SELECT }>;

export async function handleAgentResults(parameters: any, user: TokenPayload, actionId: string) {
  // `includeMetrics` was accepted here until 2026-07-26 and did nothing: it gated a read of
  // `exec.metrics`, a column that has never existed (Bug Class 80). It was in NO tool schema —
  // only internal callers passed it — so removing it changes no client-visible contract. Deleted
  // at the callers too, so the next reader doesn't re-add a consumer for it.
  const { taskId, executionId, includeOutput = true, includeAll = false, limit = 5 } = parameters;


  if (!taskId && !executionId) {
    throw new Error('Either taskId or executionId is required for agent results');
  }

  // SECURITY: Validate POV access before retrieving agent results
  // We need to resolve the taskId first if executionId is provided
  let resolvedTaskId = taskId;

  if (executionId && !taskId) {
    const exec = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      select: { taskId: true }
    });
    if (!exec) {
      throw new Error('Execution not found');
    }
    resolvedTaskId = exec.taskId;
  }

  // Now validate POV access using the resolved taskId
  if (resolvedTaskId) {
    const task = await prisma.task.findUnique({
      where: { id: resolvedTaskId },
      select: {
        id: true,
        pov: {
          select: {
            id: true,
            ownerId: true,
            metadata: true,
            team: {
              select: {
                members: {
                  select: { userId: true }
                }
              }
            }
          }
        }
      }
    });

    if (!task || !task.pov) {
      throw new Error('Task not found');
    }

    // 🔒 SECURITY: Validate POV access for ALL roles (not just DEMO_USER)
    // Previous code only checked DEMO_USER — regular users could read any POV's results.
    // Uses shared validatePOVAccess which handles: owner, team member, demo, admin.
    validatePOVAccess(user, task.pov, {
      throwOnDeny: true,
      logContext: 'Agent Results'
    });
  }

  let executions: ResultsExecution[] = [];

  if (executionId) {
    // Get specific execution with full details including artifacts
    const execution = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      select: RESULTS_EXECUTION_SELECT
    });

    if (execution) {
      executions = [execution];
    }
  } else if (taskId) {
    // Get executions with more flexible status filtering
    const statusFilter = includeAll ? {} : {
      status: { in: ['SUCCESS', 'FAILED'] }  // SUCCESS is the correct enum value, not COMPLETED
    };


    executions = await prisma.agentExecution.findMany({
      where: {
        taskId,
        ...statusFilter
      },
      select: RESULTS_EXECUTION_SELECT,
      orderBy: { startTime: 'desc' },
      take: limit
    });

  }

  if (executions.length === 0) {
    // Debug: Let's check what executions exist for this task
    const allExecutions = await prisma.agentExecution.findMany({
      where: { taskId },
      select: { id: true, status: true, createdAt: true, taskId: true },
      orderBy: { createdAt: 'desc' },
      take: 5
    });


    return {
      actionId,
      action: 'agent.results',
      status: 'completed',
      result: {
        executions: [],
        message: includeAll ? 'No agent executions found' : 'No successful or failed agent executions found',
        debug: {
          taskId,
          executionId,
          includeAll,
          searchedStatuses: includeAll ? 'all' : ['SUCCESS', 'FAILED'],
          actualExecutions: allExecutions.map(e => ({
            id: e.id,
            status: e.status,
            statusLength: e.status.length,
            statusChars: e.status.split('').map(c => c.charCodeAt(0)),
            createdAt: e.createdAt
          }))
        }
      }
    };
  }

  const formattedResults = executions.map(exec => {
    // Extract structured metadata from result.json for top-level observability.
    // The field set is the SHARED whitelist colocated with the builder (RESULT_JSON_SUMMARY_KEYS in
    // execution-artifacts.ts) — emitter and extractor cannot drift; new signals are added THERE.
    let resultSummary: Record<string, unknown> = {};
    if (exec.artifacts) {
      // PIPELINE executions persist their resultJson as pipeline-index.json (same builder output,
      // execution-terminal-persist) — both names carry the summary fields (derivationContainment
      // exists ONLY there). Matching result.json alone made hoisting a guaranteed miss for
      // pipeline executions (wave-2 finding E1, 2026-07-18).
      const resultArtifact = exec.artifacts.find(
        (a: any) => a.name === 'result.json' || a.name === 'pipeline-index.json'
      );
      if (resultArtifact?.content) {
        try {
          resultSummary = pickResultJsonSummary(JSON.parse(resultArtifact.content));
        } catch { /* not valid JSON — skip */ }
      }
    }

    // 2026-07-25: hoist the failure code to a top-level field. error.json is ALREADY in
    // memory here (this surface selects artifact content), so this costs zero extra
    // queries — the reason the panel put the hoist on this surface and the column read on
    // the hot-polling one. Parsed independently of `includeOutput`, mirroring resultSummary
    // above: the code is a top-level fact, not part of the verbose artifact payload.
    // Read from the artifact rather than the column so executions that failed BEFORE the
    // column existed still report their code (the column is forward-only).
    let errorCategory: string | null = null;
    if (exec.artifacts) {
      const errorArtifact = exec.artifacts.find((a) => a.name === 'error.json');
      if (errorArtifact?.content) {
        try {
          const parsed = JSON.parse(errorArtifact.content);
          errorCategory = typeof parsed?.errorCategory === 'string' ? parsed.errorCategory : null;
        } catch { /* not valid JSON — skip */ }
      }
    }

    const result: any = {
      id: exec.id,
      status: exec.status,
      startTime: exec.startTime,
      endTime: exec.endTime,
      duration: exec.endTime && exec.startTime ?
        Math.round((new Date(exec.endTime).getTime() - new Date(exec.startTime).getTime()) / 1000) :
        null,
      ...resultSummary,
      task: exec.task,
      agentTemplate: exec.agentTemplate,
      // The branchable failure code, hoisted out of error.json. `null` means "no code
      // recorded" — never a placeholder (Protocol 10). Replaces `progress: exec.progress || 0`,
      // which read a column that never existed and therefore reported 0 for every execution,
      // including completed ones.
      errorCategory,
      artifacts: exec.artifacts ? exec.artifacts.map((artifact) => {
        // Basic artifact info always included
        const formattedArtifact: any = {
          id: artifact.id,
          name: artifact.name,
          type: artifact.type,
          size: artifact.content?.length || 0,
          createdAt: artifact.createdAt,
          resourceUri: `mcp://artifacts/${artifact.id}`
        };

        // Include full content when requested
        if (includeOutput && artifact.content) {
          formattedArtifact.content = artifact.content;

          // Add artifact viewer hint for Claude Desktop
          if (artifact.type.includes('json')) {
            try {
              formattedArtifact.parsedContent = JSON.parse(artifact.content);
              formattedArtifact.viewerHint = 'json';
            } catch {
              formattedArtifact.viewerHint = 'text';
            }
          } else if (artifact.type.includes('markdown')) {
            formattedArtifact.viewerHint = 'markdown';
          } else if (artifact.type.includes('html')) {
            formattedArtifact.viewerHint = 'html';
          } else if (artifact.type.includes('csv')) {
            formattedArtifact.viewerHint = 'csv';
          } else {
            formattedArtifact.viewerHint = 'text';
          }
        }

        return formattedArtifact;
      }) : []
    };

    // 2026-07-25 — DELETED, all dead, all surfaced by removing the `any` above:
    //
    //   `exec.output`   → no such column on agent_executions. Never fired.
    //   `exec.metrics`  → no such column, so the `includeMetrics` parameter that gated it never
    //                     did anything. Parameter removed 2026-07-26 at the handler AND every
    //                     caller; it was in no tool schema, so nothing client-visible changed.
    //                     (Do not confuse it with registry(action:'list', includeMetrics) —
    //                     a different tool, genuinely consumed by user-services-handler.)
    //   `exec.error`    → no such column (same phantom as agent.status's, now replaced by
    //                     the real `errorCategory` hoist above).
    //   `exec.task.outputArtifacts` → a REAL Task column, but never in this handler's task
    //                     projection, so the whole llmResponses/mainResponse block was
    //                     unreachable by construction. Deleting it is not a behaviour
    //                     change; ADDING the field to the select would be, so that is a
    //                     deliberate non-change. Recoverable from git if ever wanted.

    return result;
  });

  // Import the response formatter to use enhanced artifact formatting
  const { responseFormatter } = await import('@/lib/mcp/server/utils/formatters');

  // Create formatted artifact displays for Claude Desktop
  const artifactDisplays: any[] = [];

  // Create a mock result object that matches the formatter's expected structure
  const mockResult = {
    action: 'agent.results',
    status: 'completed',
    actionId,
    timestamp: new Date().toISOString(),
    result: {
      executions: formattedResults,
      summary: {
        total: executions.length,
        withArtifacts: formattedResults.filter(r => r.artifacts.length > 0).length,
        completed: executions.filter(e => e.status === 'SUCCESS').length,
        failed: executions.filter(e => e.status === 'FAILED').length,
        running: executions.filter(e => e.status === 'RUNNING').length
      },
      message: `Retrieved results for ${executions.length} agent execution(s)`,
      // Add artifact displays that Claude Desktop can render
      artifactDisplays: artifactDisplays
    }
  };

  // Create enhanced artifact presentation for Claude Desktop
  let enhancedResult = `Retrieved results for ${executions.length} agent execution(s)\n\n`;

  formattedResults.forEach((exec, index) => {
    enhancedResult += `📋 EXECUTION ${index + 1}:\n`;
    enhancedResult += `• ID: ${exec.id}\n`;
    enhancedResult += `• Status: ${exec.status}\n`;
    enhancedResult += `• Duration: ${exec.duration ? `${exec.duration}s` : 'N/A'}\n`;
    enhancedResult += `• Task: ${exec.task.title}\n\n`;

    if (exec.artifacts && exec.artifacts.length > 0) {
      enhancedResult += `📎 ARTIFACTS (${exec.artifacts.length}):\n\n`;

      exec.artifacts.forEach((artifact: any, idx: number) => {
        enhancedResult += `${idx + 1}. ${artifact.name} (${artifact.type})\n`;
        enhancedResult += `   📄 File Details:\n`;
        enhancedResult += `   • Name: ${artifact.name}\n`;
        enhancedResult += `   • Type: ${artifact.type}\n`;
        enhancedResult += `   • Size: ${artifact.content?.length || 0} characters\n`;
        enhancedResult += `   • Generated: ${new Date().toISOString()}\n\n`;

        enhancedResult += `   💾 COPYABLE OBJECT:\n`;
        const copyableObject = {
          name: artifact.name,
          type: artifact.type,
          ...(includeOutput ? { content: artifact.content } : { contentPreview: artifact.content?.substring(0, 200) + '...' }),
          size: artifact.content?.length || 0,
          generated: new Date().toISOString()
        };
        enhancedResult += `   ${JSON.stringify(copyableObject, null, 2)}\n\n`;

        // Human-facing DISPLAY PREVIEW — deliberately distinct from the Tier-1 LLM-view cap
        // (agentic-tool-loop.ts truncateForLlm); do NOT merge (harvest-truncation-safety.md §1).
        const preview = artifact.content && artifact.content.length > 300
          ? artifact.content.substring(0, 300) + '...[truncated]'
          : artifact.content;
        enhancedResult += `   📝 CONTENT PREVIEW:\n   ${preview}\n\n`;
      });

      enhancedResult += `💡 DOWNLOAD INSTRUCTIONS:\n`;
      enhancedResult += `• Copy the COPYABLE OBJECT sections above\n`;
      enhancedResult += `• Parse the JSON to extract content\n`;
      enhancedResult += `• Save content to files with the specified names and types\n\n`;
    }
  });

  enhancedResult += `📈 SUMMARY:\n`;
  enhancedResult += `• Total Executions: ${executions.length}\n`;
  enhancedResult += `• Completed: ${executions.filter(e => e.status === 'SUCCESS').length}\n`;
  enhancedResult += `• Failed: ${executions.filter(e => e.status === 'FAILED').length}\n`;
  enhancedResult += `• With Artifacts: ${formattedResults.filter(r => r.artifacts.length > 0).length}\n`;

  // Generate intelligent elicitation prompts using Phase 5 features
  let elicitationPrompts: any[] = [];

  try {
    // Apr 2026: import ElicitationPromptsGenerator directly instead of going
    // through SDKNativeAdvancedTools. The latter transitively pulls in
    // task-action-handler.js → router-bridge.js → tasks-action-router.ts via
    // webpack's runtime when this handler is webpack-bundled into the
    // /api/mcp/tasks/action route, which produces a "TypeError: s is not a
    // constructor" on the first request to the route after each process
    // restart. The generator class is standalone (only imports prisma) so it
    // bundles cleanly. See TODO-RATE-LIMIT-FIX.md for context.
    const { ElicitationPromptsGenerator } = await import('@/lib/mcp/server/tools/advanced/analytics/elicitation-prompts-generator');
    const promptsGenerator = new ElicitationPromptsGenerator(log);

    // Generate all types of elicitation prompts
    const performancePrompts = await promptsGenerator.generatePerformanceElicitationPrompts(executions);
    const categoryPrompts = await promptsGenerator.generateCategoryComparativePrompts(executions);
    const contextPrompts = await promptsGenerator.generateDatabaseContextSuggestions(executions);

    // Artifact-aware prompts (Apr 2026): inspect each execution's result.json
    // for confidence score and artifact size, emit prompts that point at
    // bounded-confidence investigation, escalation diagnostics, or large-
    // deliverable summarisation. Designed primarily for the harness UX.
    const artifactPrompts = await promptsGenerator.generateArtifactElicitationPrompts(executions);

    // Combine and prioritize prompts
    const allPrompts: any[] = [
      ...performancePrompts,
      ...categoryPrompts,
      ...artifactPrompts,
      ...contextPrompts,
    ];
    elicitationPrompts = allPrompts.sort((a: any, b: any) => {
      const priorityOrder: { [key: string]: number } = { high: 3, medium: 2, low: 1 };
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    }).slice(0, 8); // Limit to top 8 suggestions

  } catch (error) {
    log.error({ err: error }, 'failed to generate elicitation prompts');
    // Continue without elicitation prompts if generation fails
  }


  return {
    actionId,
    action: 'agent.results',
    status: 'completed',
    result: {
      message: enhancedResult,
      executions: formattedResults,
      summary: {
        total: executions.length,
        withArtifacts: formattedResults.filter(r => r.artifacts.length > 0).length,
        completed: executions.filter(e => e.status === 'SUCCESS').length,
        failed: executions.filter(e => e.status === 'FAILED').length,
        running: executions.filter(e => e.status === 'RUNNING').length
      },
      elicitationPrompts: elicitationPrompts,
      templateAnalysis: executions.length > 0 ? {
        template: executions[0].agentTemplate,
        insights: elicitationPrompts.filter(p => p.type.includes('template')).map(p => p.text)
      } : null,
      performanceComparison: elicitationPrompts.length > 0 ? {
        overallScore: Math.round(
          (formattedResults.filter(r => r.status === 'SUCCESS').length / executions.length) * 100
        ),
        recommendations: elicitationPrompts.filter(p => p.priority === 'high').map(p => p.text)
      } : null,
      resourceLinks: formattedResults.flatMap(exec =>
        (exec.artifacts || []).map((artifact: any) => ({
          name: artifact.name,
          type: artifact.type,
          uri: `mcp://artifacts/${artifact.id}`,
          description: `Generated artifact: ${artifact.name} (${artifact.type}) - Available as MCP resource`
        }))
      ).slice(0, 5)
    }
  };
}
