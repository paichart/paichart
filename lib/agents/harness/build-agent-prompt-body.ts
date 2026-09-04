/**
 * Shared agent USER-prompt body builder (§1–§8 + Output Requirements).
 *
 * Extracted VERBATIM from `agentExecutionEngine.ts` `buildAgentPrompt` (B1 Stage 1, 2026-06-09) so the SSE
 * stream route (`app/api/pov/agent/execute/stream/route.ts`, a GUI testing/demo path) emits the SAME rich
 * prompt the engine builds — closing the whole-prompt parity gap where the stream route only rendered
 * §1 + partial §3 + §6 and dropped §2/§4/§5/§7/§8 + the Output Requirements / confidence-score contract.
 *
 * ⚠ SINGLE SOURCE OF TRUTH (B1 Stage 2, 2026-06-09) — REAL-PIPELINE-CRITICAL despite living under
 * `lib/agents/harness/`. BOTH execution paths build the agent user prompt here: the engine's `buildAgentPrompt`
 * (`agentExecutionEngine.ts`) delegates to this function (the reactor-cascade / real-pipeline path), AND the
 * SSE stream route. Editing this file changes EVERY pipeline + stream execution's prompt — including the
 * `Confidence: N/100` rubric the reactor quality-gate parses for retry decisions. There is no longer a second
 * copy to mirror. Byte-equivalence with the engine's former inline body was proven across 33 branches by
 * `scripts/test-build-agent-prompt-parity.ts` before the delegation; content is locked by
 * `scripts/test-build-agent-prompt-body.ts`. The §6 block is shared via `renderPipelineContextSection` (D4).
 *
 * Pure function of (task, config, context). Every section is guarded, so missing relations (e.g. no
 * team/assignee/parentTask on the stream route's lighter task) simply skip — graceful degradation, never a throw.
 *
 * @created 2026-06-09 (B1 Stage 1; became the sole owner in Stage 2)
 */
import { mcpLogger } from '@/lib/logger';
import { renderPipelineContextSection } from './render-pipeline-context';

const logger = mcpLogger.child({ module: 'BuildAgentPromptBody' });

/** Verbatim from agentExecutionEngine.ts categorizeTools (keep in sync until Stage 2 unifies). */
export function categorizeTools(tools: string[]): string[] {
  const categories: Set<string> = new Set();

  // Add defensive checks for malformed tools array
  if (!tools || !Array.isArray(tools)) {
    logger.warn('Invalid tools array provided to categorizeTools');
    return [];
  }

  tools.forEach(tool => {
    // Skip invalid tools with warning
    if (!tool || typeof tool !== 'string') {
      logger.warn({ toolValue: typeof tool }, 'Skipping invalid tool entry');
      return;
    }

    const lowerTool = tool.toLowerCase();

    // POV Management
    if (lowerTool.includes('pov') || lowerTool.includes('list') || lowerTool.includes('get')) {
      categories.add('POV Management & Information Gathering');
    }

    // Command Execution
    if (lowerTool.includes('bash') || lowerTool.includes('shell') || lowerTool.includes('command')) {
      categories.add('Command Execution & Automation');
    }

    // File Operations
    if (lowerTool.includes('read') || lowerTool.includes('write') || lowerTool.includes('edit') || lowerTool.includes('file')) {
      categories.add('File Operations & Code Management');
    }

    // Browser Automation & Web Operations
    if (lowerTool.includes('browser') || lowerTool.includes('navigate') || lowerTool.includes('click') || lowerTool.includes('web') ||
        lowerTool.includes('scraping') || lowerTool.includes('automation') || lowerTool.includes('workflow')) {
      categories.add('Browser Automation & Web Operations');
    }

    // Task/Agent Operations
    if (lowerTool.includes('task') || lowerTool.includes('agent') || lowerTool.includes('execute')) {
      categories.add('Task & Agent Management');
    }

    // Analytics/Intelligence
    if (lowerTool.includes('analyze') || lowerTool.includes('recommend') || lowerTool.includes('analytics')) {
      categories.add('Analytics & AI-Powered Insights');
    }

    // Code Intelligence
    if (lowerTool.includes('grep') || lowerTool.includes('glob') || lowerTool.includes('search')) {
      categories.add('Code Search & Analysis');
    }
  });

  return Array.from(categories);
}

/**
 * Build the agent user-prompt body (§1–§8 + Output Requirements). Verbatim copy of the engine's
 * `buildAgentPrompt` — see the file header re: Stage-1 duplication.
 */
export function buildAgentPromptBody(task: any, config: any, context: any): string {
  const parts = [];

  // §1: DIRECTIVE — what the agent should achieve
  // config.prompt = agent instructions (from task.prompt) — "what to do"
  // task.description = task context — "what this task is about" (§3)
  // These are SEPARATE concerns; directive comes first as the primary instruction
  if (config.prompt) {
    parts.push('## Directive');
    parts.push(config.prompt);
    parts.push('');
  } else {
    // Synthesize directive when none provided (CrewAI "goal" pattern)
    const role = config.agentRole || context.agentTemplate?.defaultRole || task.agentRole;
    const directive = role
      ? `As a ${role}, complete the following task: "${task.title}"`
      : `Complete the following task: "${task.title}"`;
    parts.push('## Directive');
    parts.push(directive);
    parts.push('');
  }

  // §2: EXPECTED OUTPUT — completion contract from agentTemplate.outputSchema
  const outputSchema = context.agentTemplate?.outputSchema;
  if (outputSchema && typeof outputSchema === 'object' && Object.keys(outputSchema).length > 0) {
    parts.push('## Expected Output');
    if (outputSchema.format) parts.push(`**Format:** ${outputSchema.format}`);
    if (outputSchema.sections) {
      const sections = Array.isArray(outputSchema.sections) ? outputSchema.sections : [outputSchema.sections];
      parts.push(`**Required Sections:** ${sections.join(', ')}`);
    }
    if (outputSchema.minLength) parts.push(`**Minimum Length:** ${outputSchema.minLength} words`);
    // Pass through additional schema fields
    const knownKeys = ['format', 'sections', 'minLength'];
    Object.entries(outputSchema).forEach(([key, value]) => {
      if (!knownKeys.includes(key)) {
        parts.push(`**${key}:** ${typeof value === 'string' ? value : JSON.stringify(value)}`);
      }
    });
    parts.push('');
  }

  // §3: TASK CONTEXT — what the task is about
  parts.push('## Task Context');
  parts.push(`**Title:** ${task.title}`);
  if (task.description) {
    parts.push(`**Description:** ${task.description}`);
  }
  parts.push(`**Priority:** ${task.priority || 'MEDIUM'}`);
  parts.push(`**Status:** ${task.status}`);
  parts.push(`**Type:** ${task.type || 'ACTION'}`);
  if (task.dueDate) {
    parts.push(`**Due Date:** ${new Date(task.dueDate).toLocaleDateString()}`);
  }
  parts.push('');

  // §4: TASK SEQUENCE CONTEXT — parent/subtasks
  if (task.parentTask || (task.subTasks && task.subTasks.length > 0)) {
      parts.push('## Task Sequence Context');
      if (task.parentTask) {
          parts.push(`**Parent Task:** ${task.parentTask.title} (Order: ${task.parentTask.order})`);
          if (task.parentTask.description) {
            parts.push(`  *Description:* ${task.parentTask.description}`);
          }
      }
      if (task.subTasks && task.subTasks.length > 0) {
          parts.push('**Sub-Tasks:**');
          task.subTasks.forEach((sub: any) => {
              parts.push(`- **${sub.title}** (Order: ${sub.order}, Status: ${sub.status})`);
              if (sub.description) {
                parts.push(`  *Description:* ${sub.description}`);
              }
          });
      }
      parts.push('');
  }

  // §5: ENVIRONMENT CONTEXT — POV, Phase, Team, Assignee
  if (task.pov) {
    parts.push('## POV Context');
    parts.push(`**POV ID:** ${task.pov.id}`);
    parts.push(`**POV Title:** ${task.pov.title}`);
    if (task.pov.description) {
      parts.push(`**Description:** ${task.pov.description}`);
    }
    if (task.pov.objective) {
      parts.push(`**Objective:** ${task.pov.objective}`);
    }
    // Customer + Solution (2026-06-10): added when the configure-time
    // inputContext snapshot was removed — these two fields were the only
    // content the snapshot carried that §5 lacked. Live data, proper home.
    if (task.pov.customerName) {
      parts.push(`**Customer:** ${task.pov.customerName}`);
    }
    if (task.pov.solution) {
      parts.push(`**Solution:** ${task.pov.solution}`);
    }
    parts.push('');
  }

  if (task.phase) {
    parts.push('## Phase Context');
    parts.push(`**Phase:** ${task.phase.name}`);
    if (task.phase.description) {
      parts.push(`**Description:** ${task.phase.description}`);
    }
    parts.push('');
  }

  if (task.team) {
    parts.push('## Team Context');
    parts.push(`**Team:** ${task.team.name}`);
    parts.push('');
  }

  if (task.assignee) {
    parts.push('## Assignee');
    // strip control chars from name — defense-in-depth vs prompt-injection via a stored name
    parts.push(`**Assigned to:** ${String(task.assignee.name || '').replace(/[\x00-\x1F\x7F]/g, ' ')} (${task.assignee.email})`);
    parts.push('');
  }

  // §6: CHAINED CONTEXT — inputContext from previous tasks (shared renderer, D4 — single owner, no drift)
  parts.push(...renderPipelineContextSection(task.inputContext));

  // §7: AVAILABLE TOOLS — MCP tools
  if (config.mcpTools && config.mcpTools.length > 0) {
    parts.push('## Available MCP Tools for This Task');
    parts.push(`You have been assigned the following MCP tools: ${config.mcpTools.join(', ')}`);
    parts.push('');
    parts.push('### Tool Usage Guidance:');
    parts.push('- Use these tools proactively to gather context, execute actions, and generate insights');
    parts.push('- Match tool usage to your role capabilities and the task requirements');
    parts.push('- Document your tool usage rationale to demonstrate strategic thinking');
    parts.push('- Chain tools together for comprehensive workflows when beneficial');
    parts.push('');
    parts.push('**CRITICAL: When calling MCP tools that require POV context:**');
    parts.push(`- ALWAYS use "povId" (camelCase) as the parameter name`);
    parts.push(`- The POV ID for this task is: "${task.pov?.id || 'not-available'}"`);
    parts.push('- NEVER use "pov_id" (snake_case), "pov_name", or "pov_title"');
    parts.push('- Correct example: {"povId": "' + (task.pov?.id || 'POV_ID_HERE') + '"}');
    parts.push('- Wrong example: {"pov_id": "...", "pov_name": "...", "pov_title": "..."}');

    const toolCategories = categorizeTools(config.mcpTools);
    if (toolCategories.length > 0) {
      parts.push('');
      parts.push('### Detected Tool Categories:');
      toolCategories.forEach(category => {
        parts.push(`- ${category}`);
      });
    }
    parts.push('');
  }

  // §8: WORKFLOW & CONSTRAINTS
  if (config.workflow && Object.keys(config.workflow).length > 0) {
    parts.push('## Workflow Phases');
    Object.entries(config.workflow).forEach(([phase, description]) => {
      parts.push(`**${phase}:** ${description}`);
    });
    parts.push('');
  }

  if (config.successMetrics && config.successMetrics.length > 0) {
    parts.push('## Success Metrics');
    parts.push(`Track these metrics: ${config.successMetrics.join(', ')}`);
    parts.push('');
  }

  if (context.agentTemplate?.constraints) {
    parts.push('## Constraints');
    const constraints = context.agentTemplate.constraints;
    if (Array.isArray(constraints)) {
      constraints.forEach((constraint: any) => parts.push(`• ${constraint}`));
    } else if (typeof constraints === 'object') {
      Object.entries(constraints).forEach(([key, value]) => {
        parts.push(`• **${key}:** ${value}`);
      });
    }
    parts.push('');
  }

  // Final instruction — always present regardless of template
  parts.push('## Output Requirements');
  parts.push('');
  parts.push('### Where your deliverable goes');
  parts.push('Your **deliverable is your final assistant message** — the response text you write at the end of this execution after your last tool call. The platform captures it as `finalResponse` in `result.json`. For leaf tasks (no downstream dependents) this same text becomes the customer-facing `report.md` artifact. For intermediate tasks, downstream specialists read this same text as their chained context. Treat your final assistant message as the **single canonical deliverable** for this task.');
  parts.push('');
  parts.push('### How `task.comment` is used');
  parts.push('`perform(action: "task.comment")` is for **status updates, breadcrumbs, and pointers** — NOT for delivering the work product. Use it for: progress notes during long executions, audit trail entries, links to artifacts you produced, or short coordination signals to downstream specialists. Do NOT split your deliverable across comments — the deliverable belongs in your final assistant message.');
  parts.push('');
  parts.push('### Output requirements');
  parts.push('1. **Deliver in your final assistant message.** Be specific and actionable. Address each requirement from the task description in order. Synthesise tool outputs into conclusions — do not dump raw data.');
  parts.push('2. **Use `task.comment` for status only.** Examples of appropriate comments: "Started analysis, calling tool X", "3 of 5 dependencies fetched successfully", "Posted final deliverable below". Examples of inappropriate comments: pasting analysis content, splitting findings across multiple comments, putting recommendations in comments.');
  parts.push('3. **End your final assistant message with a confidence score** in the form "Confidence: N/100" using this calibration rubric:');
  parts.push('');
  parts.push('   **95-100**: Complete solution. All tool calls succeeded, output verified against requirements, no assumptions made.');
  parts.push('   *Example: "I queried all data sources, cross-referenced results, and the analysis covers every requirement."*');
  parts.push('');
  parts.push('   **80-94**: Solid solution but made 1-2 reasonable assumptions that could not be verified. All critical tool calls succeeded.');
  parts.push('   *Example: "Analysis is complete but I assumed Q3 data follows the same format as Q2 — one endpoint timed out."*');
  parts.push('');
  parts.push('   **60-79**: Core problem addressed but gaps remain. Some tool calls failed or returned unexpected data.');
  parts.push('   *Example: "Risk assessment done but 2 of 5 data sources were unavailable. Covers 60% of the portfolio."*');
  parts.push('');
  parts.push('   **40-59**: Partial progress only. Significant blockers encountered. Output is a starting point, not a deliverable.');
  parts.push('   *Example: "Identified the schema but could not execute the migration — permissions denied. Plan attached for human execution."*');
  parts.push('');
  parts.push('   **Below 40**: Blocked. Could not meaningfully progress. Escalate immediately.');
  parts.push('   *Example: "API credentials are invalid and all alternative approaches failed. Human intervention required."*');
  parts.push('');
  parts.push('   This score is parsed automatically for pipeline orchestration. Be honest — inflated scores cause bad retry decisions.');
  parts.push('');
  parts.push('**Final reminder**: The closing text of your response is your deliverable. Place the confidence score on the LAST line of your final assistant message, after your synthesis and recommendations. Do not place it inside a `task.comment` call.');

  return parts.join('\n');
}
