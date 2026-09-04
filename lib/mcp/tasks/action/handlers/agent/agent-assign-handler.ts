/**
 * Agent Assignment Handler
 *
 * Handles assignment of agent templates to tasks via MCP protocol.
 *
 * @class AgentAssignHandler
 * @description Assigns agent templates to tasks with intelligent template lookup and POV access validation.
 *   Supports template lookup by ID or name with fuzzy matching.
 *
 *   Key Features:
 *   - Template lookup by ID or name (exact → partial → error)
 *   - POV access validation via validatePOVAccess
 *   - Activity logging for audit trail
 *   - Returns task with agent template information
 *
 * @param {Object} parameters - Agent assignment parameters
 * @param {string} parameters.taskId - Task ID to assign agent to (REQUIRED)
 * @param {string} [parameters.agentTemplateId] - Agent template ID (optional if name provided)
 * @param {string} [parameters.agentTemplateName] - Agent template name for fuzzy lookup
 * @param {string} [parameters.agent_template_name] - Template name alias (Claude Desktop bug workaround)
 * @param {TokenPayload} user - Authenticated user token payload
 * @param {string} user.userId - User ID from JWT token
 * @param {string} actionId - Unique action ID for tracking and logging
 *
 * @returns {Promise<Object>} Agent assignment result
 * @returns {string} returns.actionId - Action tracking ID
 * @returns {string} returns.action - Action type (agent.assign)
 * @returns {string} returns.status - Completion status (completed)
 * @returns {Object} returns.result - Assignment result
 * @returns {Object} returns.result.task - Updated task object
 * @returns {string} returns.result.task.id - Task ID
 * @returns {string} returns.result.task.title - Task title
 * @returns {string} returns.result.task.agentTemplateId - Assigned agent template ID
 * @returns {Object} returns.result.agentTemplate - Agent template information
 * @returns {string} returns.result.agentTemplate.id - Template ID
 * @returns {string} returns.result.agentTemplate.name - Template name
 * @returns {string} returns.result.agentTemplate.category - Template category
 * @returns {string} returns.result.message - Success message
 *
 * @throws {Error} If taskId parameter is missing
 * @throws {Error} If neither agentTemplateId nor agentTemplateName provided
 * @throws {Error} If task not found
 * @throws {Error} If POV access validation fails
 * @throws {Error} If agent template not found (by ID or name)
 *
 * @example
 * // Assign agent template by ID
 * const result = await handleAgentAssign({
 *   taskId: 'task123',
 *   agentTemplateId: 'template456'
 * }, user, 'action-789');
 *
 * @example
 * // Assign agent template by name (fuzzy matching)
 * const result = await handleAgentAssign({
 *   taskId: 'task123',
 *   agentTemplateName: 'Senior Developer'
 * }, user, 'action-101');
 *
 * @performance Optimized with parallel queries (Dec 2025 Phase 3)
 *   - Template lookups: 2 queries → 1 Promise.all (50% faster)
 *
 * @security
 *   - POV access validation via validatePOVAccess
 *   - Activity logging for audit trail
 *
 * @version 1.0.0
 * @since 2025-12-18
 * @module handlers/agent/agent-assign-handler
 */

import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { logFieldChange, TaskActivityAction } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';
const { findBestMatch, getScoredSuggestions } = require('@/lib/mcp/server/utils/fuzzy-search-helper');

const log = mcpLogger.child({ module: 'AgentAssignHandler' });

export async function handleAgentAssign(parameters: any, user: TokenPayload, actionId: string) {
  const { taskId, agentTemplateId, agentTemplateName, agent_template_name } = parameters;

  if (!taskId) {
    throw new Error('Task ID is required for agent assignment');
  }

  // 🔒 SECURITY: Validate POV access before assigning agent
  // Also fetch task.type so we can auto-promote ACTION → PIPELINE when the
  // assigned template is the Pipeline Harness (see harness-type-promotion
  // block below)
  const taskForAuth = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      type: true,
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

  if (!taskForAuth?.pov) {
    throw new Error(
      `Task not found: "${taskId}"\n\n` +
      `The task may not exist or you don't have access.\n\n` +
      `💡 Find tasks:\n` +
      `• project(action: "task.list", pov_name: "Your POV") - See all tasks in a POV\n` +
      `• project(action: "task.list", assignee_name: "Your Name") - See your assigned tasks\n` +
      `• search("task keywords") - Search across all tasks\n\n` +
      `Or verify the task ID is correct.`
    );
  }

  validatePOVAccess(user, taskForAuth.pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
    logContext: 'Agent Assign'
  });

  // Handle agent template lookup (same logic as in handleAgentConfigure)
  let finalAgentTemplateId = agentTemplateId;
  let agentTemplate = null;

  const templateName = agentTemplateName || agent_template_name;
  let ambiguousAlternatives: string[] = [];
  if (templateName && !finalAgentTemplateId) {
    const trimmed = templateName.trim();
    if (!trimmed) {
      throw new Error('Agent template name cannot be empty or whitespace');
    }

    log.info({ templateName: trimmed }, 'looking up agent template by name');

    // ============================================================================
    // FUZZY MATCH LOOKUP (Mar 2026 - consistent with template.details behavior)
    // Uses centralized findBestMatch for word-based fuzzy matching
    // ============================================================================

    const allTemplates = await prisma.agentTemplate.findMany({
      select: { id: true, name: true, category: true, defaultRole: true },
      // Candidate set for findBestMatch below — take must exceed the live template
      // count or a name match silently truncates (fetch-to-search bug class, 2026-06-19).
      // 200 = headroom over the current ~26; revisit if templates ever approach it.
      take: 200
    });

    agentTemplate = findBestMatch(allTemplates, trimmed, 'name', {
      logger: log,
      ambiguityThreshold: 0.1
    });

    if (agentTemplate) {
      finalAgentTemplateId = agentTemplate.id;
      if (agentTemplate.name.toLowerCase() !== trimmed.toLowerCase()) {
        log.info({ searched: trimmed, matched: agentTemplate.name }, 'fuzzy matched template name');

        // Check for close alternatives to surface to user
        const scored = getScoredSuggestions(allTemplates, trimmed, 'name', 5);
        if (scored.length > 1) {
          const bestScore = scored[0].score;
          const closeMatches = scored
            .slice(1)
            .filter((s: { score: number }) => bestScore - s.score < bestScore * 0.1)
            .map((s: { name: string }) => s.name);
          if (closeMatches.length > 0) {
            ambiguousAlternatives = closeMatches;
          }
        }
      }
    } else {
      const availableNames = allTemplates.map(t => t.name);
      throw new Error(`Agent template not found: "${trimmed}". Available templates: ${availableNames.join(', ')}`);
    }
  }

  if (!finalAgentTemplateId) {
    throw new Error('Either agentTemplateId or agentTemplateName is required for agent assignment');
  }

  // Ensure we have the template's defaultRole even when assigned by ID
  // (agentTemplate is only set above when looked up by name; ID-only path leaves it null)
  if (!agentTemplate && finalAgentTemplateId) {
    agentTemplate = await prisma.agentTemplate.findUnique({
      where: { id: finalAgentTemplateId },
      select: { id: true, name: true, category: true, defaultRole: true }
    });
  }

  // Auto-promote task.type ACTION → PIPELINE when the Pipeline Harness is
  // assigned (2026-04-28). The artifact policy in agentArtifactPolicy.ts keys
  // on task.type === 'PIPELINE' to produce pipeline-index.json on the harness
  // root and skip report.md (so the leaf specialist's report.md is the
  // canonical customer deliverable). Without this promotion, a harness on a
  // default-typed (ACTION) task misclassifies as a leaf and produces
  // report.md + result.json on the harness — competing with the leaf and
  // producing meta-prose instead of pipeline-index.json. Empirically observed
  // 5 times on prod before this fix (2026-04-27 trial run cmogk5o2k).
  //
  // Promotion rules:
  // - Fires only when defaultRole === 'pipeline_harness_orchestrator'
  // - Skips if task.type is already PIPELINE (idempotent)
  // - Logs but does not overwrite if task.type is something exotic (DECISION/
  //   APPROVAL/MILESTONE/DOCUMENT/MCP_SERVICE) — those are deliberate user
  //   choices, not the ACTION default
  const isHarnessAssign = agentTemplate?.defaultRole === 'pipeline_harness_orchestrator';
  let shouldPromoteToPipeline = false;
  if (isHarnessAssign) {
    if (taskForAuth.type === 'PIPELINE') {
      // Already correct — no-op
    } else if (taskForAuth.type === 'ACTION') {
      shouldPromoteToPipeline = true;
      log.info(
        { taskId, fromType: taskForAuth.type, toType: 'PIPELINE', templateName: agentTemplate?.name },
        'Auto-promoting task.type ACTION → PIPELINE because Pipeline Harness was assigned'
      );
    } else {
      log.warn(
        { taskId, currentType: taskForAuth.type, templateName: agentTemplate?.name },
        'Pipeline Harness assigned to non-ACTION non-PIPELINE task type — leaving type as-is. Artifact policy may not classify correctly. Investigate task creation intent.'
      );
    }
  }

  // Update task with agent template — also copy defaultRole so agent is
  // ready to run without requiring a separate agent.configure call (BUG-003 FIX)
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      agentTemplateId: finalAgentTemplateId,
      ...(agentTemplate?.defaultRole ? { agentRole: agentTemplate.defaultRole } : {}),
      ...(shouldPromoteToPipeline ? { type: 'PIPELINE' } : {}),
      updatedAt: new Date()
    },
    include: {
      agentTemplate: {
        select: { id: true, name: true, category: true, defaultRole: true }
      }
    }
  });

  // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
  const mcpMetadata: ActivityMetadata = { source: 'MCP' };
  logFieldChange(task.id, user.userId, {
    name: 'agentTemplateId',
    oldValue: null,
    newValue: {
      templateId: finalAgentTemplateId,
      templateName: task.agentTemplate?.name,
    },
    action: TaskActivityAction.UPDATED,
  }, mcpMetadata);

  // Fire-and-forget: if the task now has a template AND is dep-free AND open,
  // queue its initial execution. The Pipeline Harness pattern creates tasks
  // first and attaches templates afterward via agent.assign — so the
  // maybeQueueIfDepFree call in task.create would have skipped (no template
  // at create time). Firing from agent.assign too closes that gap.
  //
  // Idempotent inside the reactor (skipped if any execution already exists),
  // so safe to fire on every assign even for tasks that already had templates.
  //
  // 2026-04-18 (L1, Concern A): skip for HARNESS tasks. The task-ready reactor
  // was designed for specialist children; harnesses should only execute via
  // explicit agent.execute or the dep-completion retrigger reactor. Auto-queuing
  // on assign races with explicit agent.execute and creates duplicate PENDING
  // executions. See:
  // cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md §L1
  // @see lib/services/taskReadyReactorService.ts
  if (task.type !== 'PIPELINE') {
    const { maybeQueueIfDepFree } = await import('@/lib/services/taskReadyReactorService');
    maybeQueueIfDepFree(task.id).catch(() => {});
  } else {
    log.info({ taskId: task.id, taskType: task.type }, 'Skipped maybeQueueIfDepFree for harness task (expected)');
  }

  return {
    actionId,
    action: 'agent.assign',
    status: 'completed',
    result: {
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        agentTemplate: task.agentTemplate
      },
      message: `Agent template "${task.agentTemplate?.name}" assigned successfully to task via MCP`,
      ...(ambiguousAlternatives.length > 0 && {
        note: `"${templateName}" also closely matches: ${ambiguousAlternatives.join(', ')}`
      }),
      nextSteps: [
        "✅ Agent template attached to task",
        `Template: ${task.agentTemplate?.name}`,
        "💡 Tip: The agent scopes its output to the task description. A specific, requirement-style description produces better results than a vague one.",
        "▶️ Auto-start: a standalone task that is OPEN with no incomplete dependencies STARTS RUNNING NOW — check `agent.status`. A pipeline task, or one with unmet dependencies, does NOT auto-start.",
        `To run it yourself (or re-run), or if it did not auto-start: perform(action: 'agent.execute', parameters: { taskId: '${task.id}' })`,
        "To attach a template WITHOUT auto-running, use `agent.configure` (attach + customize, then agent.execute) instead of agent.assign."
      ],
      workflow: {
        current: "agent_assigned",
        autoRuns: "if the task is open, dependency-free, and not a pipeline",
        next: "agent_status_then_results",
        ifNotAutoStarted: "agent_execute"
      }
    }
  };
}
