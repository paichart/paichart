import { prisma } from '@/lib/prisma';
import { ResourceAction, ResourceType } from '../types/auth';
import { authLogger } from '@/lib/logger';

/**
 * Standard sources for activity tracking
 * Enables filtering and debugging by origin
 */
export type ActivitySource =
  | 'web_ui'        // Browser/frontend actions
  | 'api'           // Direct API calls
  | 'mcp_hub'       // MCP Hub orchestration
  | 'mcp_server'    // MCP server operations
  | 'webhook'       // External webhook triggers
  | 'cron'          // Scheduled jobs
  | 'system'        // Internal system operations
  | 'admin'         // Admin panel actions
  | string;         // Allow custom sources

export interface AuditLogMetadata {
  resourceId?: string;
  resourceType?: ResourceType;
  action?: ResourceAction;
  details?: string;
  success: boolean;
  error?: string;
  ip?: string;
  userAgent?: string;
  source?: ActivitySource;  // Origin of the activity
  [key: string]: any;
}

export async function trackActivity(
  userId: string,
  type: string,
  action: string,
  metadata: Partial<AuditLogMetadata> = {}
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId,
        type,
        action,
        metadata: {
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  } catch (error) {
    authLogger.error({ err: error }, 'audit log write failed');
  }
}

export async function logPermissionCheck(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  action: ResourceAction,
  success: boolean,
  metadata: Partial<AuditLogMetadata> = {}
): Promise<void> {
  try {
    // Skip audit logging if userId is missing (e.g., during MCP server initialization)
    if (!userId) {
      authLogger.warn({ resourceType, resourceId, action, success }, 'skipping permission check log - no userId');
      return;
    }
    
    await prisma.activity.create({
      data: {
        userId,
        type: 'PERMISSION_CHECK',
        action: success ? 'GRANTED' : 'DENIED',
        metadata: {
          resourceType,
          resourceId,
          action,
          success,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  } catch (error) {
    // Log to console but don't throw - audit logging should not block operations
    authLogger.error({ err: error }, 'audit log write failed');
  }
}

export async function logRoleChange(
  userId: string,
  targetUserId: string,
  oldRole: string,
  newRole: string,
  metadata: Partial<AuditLogMetadata> = {}
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'ROLE_CHANGE',
        action: 'UPDATE',
        metadata: {
          targetUserId,
          oldRole,
          newRole,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  } catch (error) {
    authLogger.error({ err: error }, 'audit log write failed');
  }
}

export async function logTeamMembershipChange(
  userId: string,
  targetUserId: string,
  teamId: string,
  action: 'ADD' | 'REMOVE',
  metadata: Partial<AuditLogMetadata> = {}
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'TEAM_MEMBERSHIP',
        action,
        metadata: {
          targetUserId,
          teamId,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  } catch (error) {
    authLogger.error({ err: error }, 'audit log write failed');
  }
}

export async function logPermissionChange(
  userId: string,
  resourceType: ResourceType,
  action: ResourceAction,
  oldValue: boolean,
  newValue: boolean,
  metadata: Partial<AuditLogMetadata> = {}
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'PERMISSION_CHANGE',
        action: 'UPDATE',
        metadata: {
          resourceType,
          action,
          oldValue,
          newValue,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  } catch (error) {
    authLogger.error({ err: error }, 'audit log write failed');
  }
}

export async function getAuditLogs(
  filters: {
    userId?: string;
    type?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    resourceType?: ResourceType;
    resourceId?: string;
  },
  pagination: {
    page: number;
    limit: number;
  }
): Promise<{
  activities: any[];
  pagination: {
    total: number;
    pages: number;
    current: number;
    limit: number;
  };
  filters: {
    types: string[];
    actions: string[];
  };
}> {
  const where: any = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.type) where.type = filters.type;
  if (filters.action) where.action = filters.action;

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  if (filters.resourceType || filters.resourceId) {
    where.metadata = {
      path: ['resourceType'],
      equals: filters.resourceType,
    };
  }

  // Get audit logs with pagination
  const [total, activities] = await Promise.all([
    prisma.activity.count({ where }),
    prisma.activity.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
  ]);

  // Get distinct types and actions
  const [distinctTypes, distinctActions] = await Promise.all([
    prisma.activity.findMany({
      select: {
        type: true,
      },
      distinct: ['type'],
      take: 100,
    }),
    prisma.activity.findMany({
      select: {
        action: true,
      },
      distinct: ['action'],
      take: 100,
    }),
  ]);

  return {
    activities,
    pagination: {
      total,
      pages: Math.ceil(total / pagination.limit),
      current: pagination.page,
      limit: pagination.limit,
    },
    filters: {
      types: distinctTypes.map((t: { type: string }) => t.type),
      actions: distinctActions.map((a: { action: string }) => a.action),
    },
  };
}

/**
 * Log phase/stage operations (Week 4 enhancement)
 */
export async function logPhaseStageOperation(
  userId: string,
  action: string,
  resourceType: 'phase' | 'stage',
  resourceId: string,
  metadata: Partial<AuditLogMetadata> = {}
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'PHASE_STAGE_OPERATION',
        action,
        metadata: {
          resourceType,
          resourceId,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      },
    });
  } catch (error) {
    authLogger.error({ err: error }, 'audit log write failed');
  }
}

/**
 * Calculate severity for delete operations
 */
export function calculateDeleteSeverity(affectedCount: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (affectedCount >= 100) return 'CRITICAL';
  if (affectedCount >= 50) return 'HIGH';
  if (affectedCount >= 10) return 'MEDIUM';
  return 'LOW';
}

/**
 * Log agent template application (Week 5 Task 1.6)
 */
export async function logTemplateApplication(
  userId: string,
  templateId: string,
  metadata: {
    taskId: string;
    variableCount: number;
    variableNames: string[]; // Names only, not values (privacy)
    injectionDetected?: boolean;
    riskScore?: number;
    severity?: string;
    success: boolean;
    errors?: string[];
    warnings?: string[];
  }
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'AGENT_TEMPLATE_APPLICATION',
        action: metadata.success ? 'APPLY_SUCCESS' : 'APPLY_BLOCKED',
        metadata: {
          templateId,
          taskId: metadata.taskId,
          variableCount: metadata.variableCount,
          variableNames: metadata.variableNames,
          injectionDetected: metadata.injectionDetected || false,
          riskScore: metadata.riskScore || 0,
          severity: metadata.severity || 'LOW',
          success: metadata.success,
          errors: metadata.errors,
          warnings: metadata.warnings,
          timestamp: new Date().toISOString()
        }
      }
    });

    // Log to console for immediate visibility
    if (metadata.injectionDetected) {
      authLogger.warn({ userId, templateId, taskId: metadata.taskId, riskScore: metadata.riskScore, errorCount: metadata.errors?.length }, 'injection attempt blocked');
    }
  } catch (error) {
    authLogger.error({ err: error }, 'audit log write failed');
  }
}

/**
 * Log security violation (prompt injection attempt) (Week 5 Task 1.6)
 */
export async function logSecurityViolation(
  userId: string,
  metadata: {
    action: string;
    templateId?: string;
    taskId?: string;
    reason: string;
    errors: string[];
    variableNames?: string[]; // Names only, not values
    riskScore?: number;
    detectedPatterns?: string[];
  }
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'SECURITY_VIOLATION',
        action: metadata.action,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          severity: 'CRITICAL'
        }
      }
    });

    // Alert on critical security violations
    authLogger.error({ userId, templateId: metadata.templateId, taskId: metadata.taskId, riskScore: metadata.riskScore, patternCount: metadata.detectedPatterns?.length }, 'prompt injection attempt detected');

    // TODO: Send to security monitoring service (Datadog, PagerDuty)
  } catch (error) {
    authLogger.error({ err: error }, 'audit log write failed');
  }
}

/**
 * Log agent template mutation (CREATE/UPDATE/DELETE) (Week 5 Task 1.6)
 */
export async function logTemplateMutation(
  userId: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  templateId: string,
  metadata: Partial<AuditLogMetadata> = {}
): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId,
        type: 'AGENT_TEMPLATE_MUTATION',
        action,
        metadata: {
          templateId,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      }
    });
  } catch (error) {
    authLogger.error({ err: error }, 'audit log write failed');
  }
}
