/**
 * Recommendation Action Mapper
 *
 * Maps MCPRecommendation `actions[]` to executable operations.
 * Three execution paths:
 *   1. `perform` — Direct task/POV actions via TasksActionRouter (14 actions)
 *   2. `workflow` — Multi-step orchestration via OrchestrationEngine
 *   3. `service_call` — Single external service call via ServiceCallHandler
 *
 * Risk assessment determines whether actions execute immediately or queue for approval.
 *
 * @see TODO-autonomous-management-agent.md Phase 1.1
 */

import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: 'RecommendationActionMapper' });

// --- Types ---

export interface WorkflowStep {
  service: string;
  tool: string;
  arguments?: Record<string, unknown>;
}

export type ExecutionType = 'perform' | 'workflow' | 'service_call';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MappedAction {
  type: ExecutionType;
  /** For 'perform': direct task/POV action */
  performAction?: { action: string; parameters: Record<string, unknown> };
  /** For 'workflow': multi-step orchestration */
  workflowSteps?: WorkflowStep[];
  /** For 'service_call': single external service call */
  serviceCall?: { service: string; tool: string; arguments: Record<string, unknown> };
  /** Risk assessment */
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  /** Human-readable description of what this action does */
  description: string;
}

export interface ActionMapperResult {
  actions: MappedAction[];
  overallRisk: RiskLevel;
  requiresApproval: boolean;
  summary: string;
}

// --- Internal service name → perform action mapping ---

const PERFORM_ACTION_TOOLS: Record<string, string> = {
  'execute_task_action': 'perform',
};

/**
 * Tools that map to direct perform actions based on their arguments.action field.
 *
 * MUST stay in sync with `ALLOWED_MCP_ACTIONS` in `lib/validation/mcp-action-validation.ts`.
 * Missing entries here cause the recommendation-implementation path to silently
 * fall through to `service_call` (which is a no-op stub at
 * `app/api/mcp/recommendations/[id]/implement/route.ts:70-89`) — the worst kind
 * of failure: the recommendation appears successful but mutates nothing.
 * See BC75 §Task-Action Handler Sibling Drift for the full audit (10 sites).
 */
const PERFORM_ACTIONS = new Set([
  'pov.create', 'pov.update', 'task.create', 'task.update', 'task.assign',
  'task.complete', 'task.comment', 'stage.create',
  'agent.configure', 'agent.assign', 'agent.execute',
  'agent.status', 'agent.results', 'analytics.generate',
]);

/**
 * Actions that are HIGH risk (create new top-level entities, change ownership,
 * or replace team membership). HIGH-risk actions require approval before
 * execution at `implement/route.ts:213`.
 *
 * pov.update is HIGH because it can change `status` (workflow state transition),
 * replace `projectManager` (ownership change), and replace the entire
 * `teamMembers` array via `replaceTeamMembers: true`. That's strictly a superset
 * of pov.create's risk surface, and the tool surface marks it ADMIN-ONLY at
 * `lib/mcp/server/config/tool-schemas.js`.
 */
const HIGH_RISK_ACTIONS = new Set(['pov.create', 'pov.update', 'agent.execute']);

/** Actions that are MEDIUM risk (modify existing data) */
const MEDIUM_RISK_ACTIONS = new Set([
  'task.create', 'task.assign', 'task.complete', 'task.update', 'stage.create',
  'agent.configure', 'agent.assign',
]);

// LOW risk: task.comment, agent.status, agent.results, analytics.generate

// --- Core mapper ---

/**
 * Map a recommendation's actions[] to executable operations with risk assessment.
 *
 * @param actions - The WorkflowStep[] from MCPRecommendation.actions (Json field)
 * @param recommendationTitle - For logging/description
 * @returns Mapped actions with risk levels and execution types
 */
export function mapRecommendationToActions(
  actions: WorkflowStep[],
  recommendationTitle: string
): ActionMapperResult {
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return {
      actions: [],
      overallRisk: 'LOW',
      requiresApproval: false,
      summary: 'No actions to execute',
    };
  }

  // Single-step actions route differently than multi-step workflows
  if (actions.length === 1) {
    const step = actions[0];
    const mapped = mapSingleStep(step, recommendationTitle);
    return {
      actions: [mapped],
      overallRisk: mapped.riskLevel,
      requiresApproval: mapped.requiresApproval,
      summary: mapped.description,
    };
  }

  // Multi-step: check if ALL steps are perform actions (rare) or if it's a workflow
  const allPerform = actions.every(s => isPerformAction(s));
  if (allPerform) {
    // Map each step individually as perform actions
    const mapped = actions.map(s => mapSingleStep(s, recommendationTitle));
    const overallRisk = getHighestRisk(mapped.map(m => m.riskLevel));
    return {
      actions: mapped,
      overallRisk,
      requiresApproval: overallRisk === 'HIGH',
      summary: `${mapped.length} perform actions for: ${recommendationTitle}`,
    };
  }

  // Multi-step workflow — run through orchestration engine
  const risk = assessWorkflowRisk(actions);
  return {
    actions: [{
      type: 'workflow',
      workflowSteps: actions,
      riskLevel: risk,
      requiresApproval: risk === 'HIGH',
      description: `${actions.length}-step workflow: ${recommendationTitle}`,
    }],
    overallRisk: risk,
    requiresApproval: risk === 'HIGH',
    summary: `${actions.length}-step workflow for: ${recommendationTitle}`,
  };
}

// --- Helpers ---

function isPerformAction(step: WorkflowStep): boolean {
  // Check if this step is a direct perform action
  // Pattern 1: tool is "execute_task_action" with arguments.action
  if (step.tool === 'execute_task_action' && step.arguments?.action) {
    return PERFORM_ACTIONS.has(step.arguments.action as string);
  }
  // Pattern 2: pAIchart internal service with a task action tool name
  if (step.service?.toLowerCase().includes('paichart') && step.arguments?.action) {
    return PERFORM_ACTIONS.has(step.arguments.action as string);
  }
  return false;
}

function mapSingleStep(step: WorkflowStep & { description?: string }, title: string): MappedAction {
  // Use per-action description if available (set by buildWorkflowStep), fall back to title
  const stepDescription = (step as any).description;

  // Check for perform action
  if (isPerformAction(step)) {
    const action = step.arguments?.action as string;
    const params = { ...step.arguments };
    delete params.action; // action is the routing key, not a parameter
    return {
      type: 'perform',
      performAction: { action, parameters: params },
      riskLevel: getActionRisk(action),
      requiresApproval: HIGH_RISK_ACTIONS.has(action),
      description: stepDescription || `${action}: ${title}`,
    };
  }

  // Single external service call
  const risk = getServiceCallRisk(step);
  return {
    type: 'service_call',
    serviceCall: {
      service: step.service,
      tool: step.tool,
      arguments: step.arguments || {},
    },
    riskLevel: risk,
    requiresApproval: risk === 'HIGH',
    description: stepDescription || `Call ${step.service}.${step.tool}: ${title}`,
  };
}

function getActionRisk(action: string): RiskLevel {
  if (HIGH_RISK_ACTIONS.has(action)) return 'HIGH';
  if (MEDIUM_RISK_ACTIONS.has(action)) return 'MEDIUM';
  return 'LOW';
}

function getServiceCallRisk(step: WorkflowStep): RiskLevel {
  // Notification sends are MEDIUM (visible to users)
  if (step.service?.toLowerCase().includes('notification')) return 'MEDIUM';
  // Tool listing/discovery is LOW (read-only)
  if (step.tool === 'TOOL_LIST' || step.tool === 'TOOL_GET') return 'LOW';
  // Tool calls that mutate state are MEDIUM
  if (step.tool === 'TOOL_CALL') return 'MEDIUM';
  // Default: MEDIUM for external calls
  return 'MEDIUM';
}

function assessWorkflowRisk(steps: WorkflowStep[]): RiskLevel {
  let highest: RiskLevel = 'LOW';
  for (const step of steps) {
    const stepRisk = isPerformAction(step)
      ? getActionRisk(step.arguments?.action as string)
      : getServiceCallRisk(step);
    highest = getHighestRisk([highest, stepRisk]);
  }
  // Multi-step workflows are at least MEDIUM risk
  if (highest === 'LOW' && steps.length > 1) highest = 'MEDIUM';
  return highest;
}

function getHighestRisk(risks: RiskLevel[]): RiskLevel {
  if (risks.includes('HIGH')) return 'HIGH';
  if (risks.includes('MEDIUM')) return 'MEDIUM';
  return 'LOW';
}
