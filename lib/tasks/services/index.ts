// Optimized Task Services - Phase 1 Performance Improvements
// Tasks 9-10: Activity Service and Search Service Optimization

export { TaskService } from './task';
// Legacy activity logging (simple action string)
export { createTaskActivity, getTaskActivityHistory, getActivitySummary } from './taskActivityService';

// Rich activity logging (structured details) - Phase 2.2, 2025-12-31
// Updated: 2026-01-05 (added logWorkflowExecution for MCPServiceOrchestrationHandler)
export {
  logActivityWithDetails,
  logTaskAssignment,
  logTaskUnassignment,
  logAgentExecution,
  logAttachmentAdded,
  logAttachmentRemoved,
  logCommentAdded,
  logFieldChange,
  logStageChange,
  logPhaseChange,
  logTaskCreated,
  logTaskCompleted,
  logTaskReopened,
  logWorkflowExecution,
  TaskActivityAction,
  type TaskActivityActionType,
  type ActivityDetails,
  type ActivityMetadata,
} from './taskActivityService';
export { searchAndFilterTasks, quickTaskSearch, getSearchSuggestions } from './taskSearchService';

// Performance monitoring
export { setupDevQueryLogger, createQueryTimer, logOptimizationResult } from '@/lib/database/dev-query-logger';