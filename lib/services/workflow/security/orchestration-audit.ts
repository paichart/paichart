/**
 * Orchestration Audit - Activity logging for orchestration workflows
 *
 * Provides audit trail for orchestration actions using the existing
 * activity tracking system.
 *
 * @see /cline_docs/reviews/workflow-extension-2026-01-04/implementation-plan-focused.md
 */

import { trackActivity } from '@/lib/auth/audit';
import { OrchestrationContext } from '../types/orchestration-context';

/**
 * Audit orchestration actions
 *
 * Logs orchestration events to the activity tracking system for
 * compliance, debugging, and analytics purposes.
 *
 * @param context - Orchestration execution context
 * @param action - Action being performed (start, complete, step, failed)
 * @param details - Additional details to include in the audit log
 */
export async function auditOrchestration(
  context: OrchestrationContext,
  action: 'start' | 'complete' | 'step' | 'failed',
  details: Record<string, unknown>
): Promise<void> {
  // Use positional arguments (not object) - matches actual API signature
  // trackActivity(userId, type, action, metadata)
  await trackActivity(
    context.user.id,                              // userId (positional)
    'WORKFLOW_ORCHESTRATION',                     // type (positional)
    `orchestration.${action}`,                    // action (positional)
    {                                             // metadata (object)
      success: true,  // Required by AuditLogMetadata
      source: 'mcp_hub',  // Origin tracking - identifies MCP Hub workflows
      workflowResourceType: 'orchestration',  // Custom field for workflow type
      resourceId: context.execution.workflowId,
      povId: context.pov?.id,
      requestId: context.execution.requestId,
      ...details,
    }
  );
}

/**
 * Audit a security-relevant orchestration event
 *
 * Use for access denials, policy violations, or other security events.
 *
 * @param context - Orchestration execution context
 * @param event - Security event type
 * @param details - Event details
 */
export async function auditSecurityEvent(
  context: OrchestrationContext,
  event: 'access_denied' | 'policy_violation' | 'unauthorized_service',
  details: Record<string, unknown>
): Promise<void> {
  await trackActivity(
    context.user.id,
    'SECURITY_EVENT',
    `orchestration.security.${event}`,
    {
      success: false,  // Required by AuditLogMetadata (security events are failures)
      source: 'mcp_hub',  // Origin tracking - identifies MCP Hub security events
      workflowResourceType: 'orchestration',  // Custom field for workflow type
      resourceId: context.execution.workflowId,
      povId: context.pov?.id,
      requestId: context.execution.requestId,
      severity: 'high',
      ...details,
    }
  );
}
