import { TaskPriority as PrismaTaskPriority, TaskStatus as PrismaTaskStatus, ExecutionStatus as PrismaExecutionStatus, TaskType as PrismaTaskType } from '@prisma/client';
import { TaskPriority, TaskStatus, Task, TaskDependency, TaskType } from '../types/index';

export function mapPrismaTaskPriority(priority: PrismaTaskPriority): TaskPriority {
  return priority as unknown as TaskPriority; // Safe cast since enums match
}

export function mapPrismaTaskStatus(status: PrismaTaskStatus): TaskStatus {
  return status as unknown as TaskStatus; // Safe cast since enums match
}

export function mapTaskDependencyFromPrisma(dependency: any): TaskDependency {
  return {
    id: dependency.id,
    taskId: dependency.taskId,
    dependsOnId: dependency.dependsOnId,
    // Only include minimal task info to avoid circular references
    dependsOn: dependency.dependsOn ? {
      id: dependency.dependsOn.id,
      title: dependency.dependsOn.title,
      description: null,
      assigneeId: null,
      teamId: null,
      povId: null,
      phaseId: null,
      stageId: dependency.dependsOn.stageId,
      dueDate: null,
      priority: mapPrismaTaskPriority(dependency.dependsOn.priority || 'MEDIUM'),
      status: mapPrismaTaskStatus(dependency.dependsOn.status),
      // Add the type property with a default value if not present
      type: dependency.dependsOn.type || PrismaTaskType.ACTION,
      metadata: {},
      createdAt: dependency.dependsOn.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: dependency.dependsOn.updatedAt?.toISOString() || new Date().toISOString()
    } : undefined,
    createdAt: dependency.createdAt.toISOString()
  };
}

export function mapTaskFromPrisma(task: any): Task {
  // Map dependencies if they exist
  const dependencies = task.dependencies
    ? task.dependencies.map(mapTaskDependencyFromPrisma)
    : undefined;
  
  // Map dependents if they exist
  const dependents = task.dependents
    ? task.dependents.map((dep: any) => ({
        id: dep.id,
        taskId: dep.taskId,
        dependsOnId: dep.dependsOnId,
        // Only include minimal task info to avoid circular references
        task: dep.task ? {
          id: dep.task.id,
          title: dep.task.title,
          description: null,
          assigneeId: null,
          teamId: null,
          povId: null,
          phaseId: null,
          stageId: dep.task.stageId,
          dueDate: null,
          priority: mapPrismaTaskPriority(dep.task.priority || 'MEDIUM'),
          status: mapPrismaTaskStatus(dep.task.status),
          // Add the type property with a default value if not present
          type: dep.task.type || PrismaTaskType.ACTION,
          metadata: {},
          createdAt: dep.task.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: dep.task.updatedAt?.toISOString() || new Date().toISOString()
        } : undefined,
        createdAt: dep.createdAt.toISOString()
      }))
    : undefined;
  
  // Map sub-tasks if they exist
  const subTasks = task.subTasks
    ? task.subTasks.map((subTask: any) => ({
        id: subTask.id,
        title: subTask.title,
        status: mapPrismaTaskStatus(subTask.status),
        stageId: subTask.stageId,
        // Add the type property with a default value if not present
        type: subTask.type || PrismaTaskType.ACTION,
      }))
    : undefined;
  
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    assignee: task.assignee ? {
      id: task.assignee.id,
      name: task.assignee.name,
      email: task.assignee.email
    } : null,
    teamId: task.teamId,
    povId: task.povId,
    phaseId: task.phaseId,
    phase: task.phase ? {
      id: task.phase.id,
      name: task.phase.name,
      type: task.phase.type,
      order: task.phase.order
    } : null,
    stageId: task.stageId,
    stage: task.stage ? {
      id: task.stage.id,
      name: task.stage.name,
      order: task.stage.order
    } : null,
    dueDate: task.dueDate?.toISOString() || null,
    priority: mapPrismaTaskPriority(task.priority),
    status: mapPrismaTaskStatus(task.status),
    // Add the type property with a default value if not present
    type: task.type || PrismaTaskType.ACTION,
    
    // AI-Driven Development Fields
    agentRole: task.agentRole,
    agentTemplateId: task.agentTemplateId, // CRITICAL FIX: Missing field that breaks template loading
    agentTemplate: task.agentTemplate, // Pass the full agent template object
    prompt: task.prompt,
    inputContext: task.inputContext,
    outputArtifacts: task.outputArtifacts,
    executionStatus: task.executionStatus,
    agentLog: task.agentLog,
    maxRetries: task.maxRetries,
    timeout: task.timeout,
    
    // MCP (Model Context Protocol) Unified Storage Fields
    mcpContext: task.mcpContext,
    mcpMetadata: task.mcpMetadata,
    mcpToolId: task.mcpToolId,
    mcpWorkflowId: task.mcpWorkflowId,
    
    // Parent-Child Relationship
    parentTaskId: task.parentTaskId,
    subTasks,
    
    // Dependencies
    dependencies,
    dependents,
    
    // Legacy metadata
    metadata: task.metadata || {},
    
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}
