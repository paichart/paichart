/**
 * Enum Validation Helpers
 *
 * Centralized helpers for Prisma enum validation to prevent drift.
 * All enums auto-sync with Prisma schema definitions using z.nativeEnum().
 *
 * Pattern: z.nativeEnum(PrismaEnum) instead of z.enum(['VALUE1', 'VALUE2'])
 * Benefits:
 * - Compile-time type checking
 * - Auto-sync when Prisma schema changes
 * - Zero enum drift risk
 * - IntelliSense support
 *
 * @see /cline_docs/reviews/schema-validation-audit-2025-11-03/
 * @see /cline_docs/reviews/uuid-to-cuid-validation-fix-2025-11-03/
 */

import { z } from 'zod';
import {
  // Task Enums
  TaskPriority,
  TaskStatus,
  TaskType,

  // Phase/Stage Enums
  PhaseType,
  StageStatus,

  // POV Enums
  POVStatus,
  Priority,

  // Team Enums
  TeamRole,

  // User Enums
  UserRole,
  UserStatus,

  // Agent Enums
  AgentCategory,
  AgentComplexity,
  AgentPriority,
  AgentTemplateStatus,
  ExecutionStatus,
  TemplateType,

  // MCP Enums
  MCPAction,
  MCPAuthType,
  MCPEffort,
  MCPExecutionMode,
  MCPImpact,
  MCPInteractionStatus,
  MCPRecommendationStatus,
  MCPRecommendationType,
  MCPToolStatus,
  MCPWorkflowExecutionStatus,
  MCPWorkflowStatus,

  // Support/Feature Enums
  SupportRequestPriority,
  SupportRequestStatus,
  FeatureRequestStatus,
  FeatureRequestImpact,

  // Workflow Enums
  WorkflowStatus,
  WorkflowStepStatus,
  WorkflowType,

  // Other Enums
  MilestoneStatus,
  KPIType,
  RegionType,
  SalesTheatre,
} from '@prisma/client';

// ==================== Task Enums ====================

/**
 * Task Priority Enum (HIGH, MEDIUM, LOW)
 * Use instead of: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) ❌
 */
export const TaskPrioritySchema = z.nativeEnum(TaskPriority);

/**
 * Task Status Enum (OPEN, IN_PROGRESS, COMPLETED, BLOCKED)
 * Use instead of: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']) ❌
 */
export const TaskStatusSchema = z.nativeEnum(TaskStatus);

/**
 * Task Type Enum
 */
export const TaskTypeSchema = z.nativeEnum(TaskType);

// ==================== Phase/Stage Enums ====================

/**
 * Phase Type Enum
 */
export const PhaseTypeSchema = z.nativeEnum(PhaseType);

/**
 * Stage Status Enum (PENDING, ACTIVE, COMPLETED, BLOCKED)
 * Use instead of: z.enum(['PENDING', 'ACTIVE', 'COMPLETED']) ❌ (missing BLOCKED!)
 */
export const StageStatusSchema = z.nativeEnum(StageStatus);

// ==================== POV Enums ====================

/**
 * POV Status Enum (PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST)
 */
export const POVStatusSchema = z.nativeEnum(POVStatus);

/**
 * Generic Priority Enum
 */
export const PrioritySchema = z.nativeEnum(Priority);

// ==================== Team Enums ====================

/**
 * Team Member Role Enum
 */
export const TeamRoleSchema = z.nativeEnum(TeamRole);

// ==================== User Enums ====================

/**
 * User Role Enum
 */
export const UserRoleSchema = z.nativeEnum(UserRole);

/**
 * User Status Enum
 */
export const UserStatusSchema = z.nativeEnum(UserStatus);

// ==================== Agent Enums ====================

/**
 * Agent Category Enum
 */
export const AgentCategorySchema = z.nativeEnum(AgentCategory);

/**
 * Agent Complexity Enum
 */
export const AgentComplexitySchema = z.nativeEnum(AgentComplexity);

/**
 * Agent Priority Enum
 */
export const AgentPrioritySchema = z.nativeEnum(AgentPriority);

/**
 * Agent Template Status Enum
 */
export const AgentTemplateStatusSchema = z.nativeEnum(AgentTemplateStatus);

/**
 * Template Type Enum (functional role: ARCHITECT, BUILDER, ANALYST, etc.)
 */
export const TemplateTypeSchema = z.nativeEnum(TemplateType);

/**
 * Agent Execution Status Enum
 */
export const ExecutionStatusSchema = z.nativeEnum(ExecutionStatus);

// ==================== MCP Enums ====================

/**
 * MCP Action Enum
 */
export const MCPActionSchema = z.nativeEnum(MCPAction);

/**
 * MCP Auth Type Enum
 */
export const MCPAuthTypeSchema = z.nativeEnum(MCPAuthType);

/**
 * MCP Effort Enum
 */
export const MCPEffortSchema = z.nativeEnum(MCPEffort);

/**
 * MCP Execution Mode Enum (PREDEFINED, AD_HOC)
 * Used for workflow execution mode - predefined vs ad-hoc orchestration
 */
export const MCPExecutionModeSchema = z.nativeEnum(MCPExecutionMode);

/**
 * MCP Impact Enum
 */
export const MCPImpactSchema = z.nativeEnum(MCPImpact);

/**
 * MCP Interaction Status Enum
 */
export const MCPInteractionStatusSchema = z.nativeEnum(MCPInteractionStatus);

/**
 * MCP Recommendation Status Enum
 */
export const MCPRecommendationStatusSchema = z.nativeEnum(MCPRecommendationStatus);

/**
 * MCP Recommendation Type Enum
 */
export const MCPRecommendationTypeSchema = z.nativeEnum(MCPRecommendationType);

/**
 * MCP Tool Status Enum
 */
export const MCPToolStatusSchema = z.nativeEnum(MCPToolStatus);

/**
 * MCP Workflow Execution Status Enum
 */
export const MCPWorkflowExecutionStatusSchema = z.nativeEnum(MCPWorkflowExecutionStatus);

/**
 * MCP Workflow Status Enum
 */
export const MCPWorkflowStatusSchema = z.nativeEnum(MCPWorkflowStatus);

// ==================== Support/Feature Enums ====================

/**
 * Support Request Priority Enum
 */
export const SupportRequestPrioritySchema = z.nativeEnum(SupportRequestPriority);

/**
 * Support Request Status Enum
 */
export const SupportRequestStatusSchema = z.nativeEnum(SupportRequestStatus);

/**
 * Feature Request Status Enum
 */
export const FeatureRequestStatusSchema = z.nativeEnum(FeatureRequestStatus);

/**
 * Feature Request Impact Enum
 */
export const FeatureRequestImpactSchema = z.nativeEnum(FeatureRequestImpact);

// ==================== Workflow Enums ====================

/**
 * Workflow Status Enum
 */
export const WorkflowStatusSchema = z.nativeEnum(WorkflowStatus);

/**
 * Workflow Step Status Enum
 */
export const WorkflowStepStatusSchema = z.nativeEnum(WorkflowStepStatus);

/**
 * Workflow Type Enum
 */
export const WorkflowTypeSchema = z.nativeEnum(WorkflowType);

// ==================== Other Enums ====================

/**
 * Milestone Status Enum
 */
export const MilestoneStatusSchema = z.nativeEnum(MilestoneStatus);

/**
 * KPI Type Enum
 */
export const KPITypeSchema = z.nativeEnum(KPIType);

/**
 * Region Type Enum
 */
export const RegionTypeSchema = z.nativeEnum(RegionType);

/**
 * Sales Theatre Enum
 */
export const SalesTheatreSchema = z.nativeEnum(SalesTheatre);

// ==================== Helper Functions ====================

/**
 * Add default value to enum schema
 * @example withDefault(TaskPrioritySchema, TaskPriority.MEDIUM)
 */
export const withDefault = <T extends z.ZodTypeAny>(
  schema: T,
  defaultValue: z.infer<T>
) => schema.default(defaultValue);

/**
 * Make enum optional
 * @example OptionalEnum(TaskPrioritySchema)
 */
export const OptionalEnum = <T extends z.ZodTypeAny>(schema: T) =>
  schema.optional();

/**
 * Make enum optional and nullable (for forms)
 * @example OptionalNullableEnum(TaskPrioritySchema)
 */
export const OptionalNullableEnum = <T extends z.ZodTypeAny>(schema: T) =>
  schema.optional().nullable().transform(val => val ?? undefined);

/**
 * Create enum schema with custom error message
 * Note: z.nativeEnum already has good error messages, use sparingly
 *
 * @example
 * const schema = z.nativeEnum(TaskPriority, {
 *   errorMap: () => ({ message: 'Please select a valid priority' })
 * });
 */
// Removed: EnumWithMessage - use z.nativeEnum with errorMap directly instead

// ==================== Convenience Export ====================

/**
 * PrismaEnum object for easy access to all enum schemas
 *
 * @example
 * import { PrismaEnum } from '@/lib/validation/enum-validation';
 * priority: PrismaEnum.taskPriority,
 * status: PrismaEnum.taskStatus
 */
export const PrismaEnum = {
  // Task
  taskPriority: TaskPrioritySchema,
  taskStatus: TaskStatusSchema,
  taskType: TaskTypeSchema,

  // Phase/Stage
  phaseType: PhaseTypeSchema,
  stageStatus: StageStatusSchema,

  // POV
  povStatus: POVStatusSchema,
  priority: PrioritySchema,

  // Team
  teamRole: TeamRoleSchema,

  // User
  userRole: UserRoleSchema,
  userStatus: UserStatusSchema,

  // Agent
  agentCategory: AgentCategorySchema,
  agentComplexity: AgentComplexitySchema,
  agentPriority: AgentPrioritySchema,
  agentTemplateStatus: AgentTemplateStatusSchema,
  executionStatus: ExecutionStatusSchema,
  templateType: TemplateTypeSchema,

  // MCP
  mcpAction: MCPActionSchema,
  mcpAuthType: MCPAuthTypeSchema,
  mcpEffort: MCPEffortSchema,
  mcpExecutionMode: MCPExecutionModeSchema,
  mcpImpact: MCPImpactSchema,
  mcpInteractionStatus: MCPInteractionStatusSchema,
  mcpRecommendationStatus: MCPRecommendationStatusSchema,
  mcpRecommendationType: MCPRecommendationTypeSchema,
  mcpToolStatus: MCPToolStatusSchema,
  mcpWorkflowExecutionStatus: MCPWorkflowExecutionStatusSchema,
  mcpWorkflowStatus: MCPWorkflowStatusSchema,

  // Support/Feature
  supportRequestPriority: SupportRequestPrioritySchema,
  supportRequestStatus: SupportRequestStatusSchema,
  featureRequestStatus: FeatureRequestStatusSchema,
  featureRequestImpact: FeatureRequestImpactSchema,

  // Workflow
  workflowStatus: WorkflowStatusSchema,
  workflowStepStatus: WorkflowStepStatusSchema,
  workflowType: WorkflowTypeSchema,

  // Other
  milestoneStatus: MilestoneStatusSchema,
  kpiType: KPITypeSchema,
  regionType: RegionTypeSchema,
  salesTheatre: SalesTheatreSchema,
};

/**
 * Type exports for convenience
 */
export type {
  TaskPriority,
  TaskStatus,
  TaskType,
  PhaseType,
  StageStatus,
  POVStatus,
  Priority,
  TeamRole,
  UserRole,
  UserStatus,
  AgentCategory,
  AgentComplexity,
  AgentPriority,
  AgentTemplateStatus,
  ExecutionStatus,
  TemplateType,
  MCPAction,
  MCPAuthType,
  MCPEffort,
  MCPExecutionMode,
  MCPImpact,
  MCPInteractionStatus,
  MCPRecommendationStatus,
  MCPRecommendationType,
  MCPToolStatus,
  MCPWorkflowExecutionStatus,
  MCPWorkflowStatus,
  SupportRequestPriority,
  SupportRequestStatus,
  FeatureRequestStatus,
  FeatureRequestImpact,
  WorkflowStatus,
  WorkflowStepStatus,
  WorkflowType,
  MilestoneStatus,
  KPIType,
  RegionType,
  SalesTheatre,
} from '@prisma/client';
