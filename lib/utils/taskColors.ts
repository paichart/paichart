import { TaskStatus, TaskPriority, TaskType, ExecutionStatus } from '@prisma/client';

// Task-specific color system that extends the shared POV color scheme
export const getTaskStatusColor = (status: TaskStatus) => {
  switch (status) {
    case 'OPEN':
      return {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        border: 'border-blue-500',
        badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
      };
    case 'IN_PROGRESS':
      return {
        bg: 'bg-green-500',
        text: 'text-green-500',
        border: 'border-green-500',
        badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
      };
    case 'COMPLETED':
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-500',
        border: 'border-emerald-500',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
      };
    case 'BLOCKED':
      return {
        bg: 'bg-red-500',
        text: 'text-red-500',
        border: 'border-red-500',
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
      };
    default:
      return {
        bg: 'bg-gray-500',
        text: 'text-gray-500',
        border: 'border-gray-500',
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
      };
  }
};

export const getTaskPriorityColor = (priority: TaskPriority) => {
  switch (priority) {
    case 'HIGH':
      return {
        bg: 'bg-red-500',
        text: 'text-red-500',
        border: 'border-red-500',
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
      };
    case 'MEDIUM':
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-500',
        border: 'border-amber-500',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
      };
    case 'LOW':
      return {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        border: 'border-blue-500',
        badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
      };
    default:
      return {
        bg: 'bg-gray-500',
        text: 'text-gray-500',
        border: 'border-gray-500',
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
      };
  }
};

export const getTaskTypeColor = (type: TaskType) => {
  switch (type) {
    case 'ACTION':
      return {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        border: 'border-blue-500',
        badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
      };
    case 'DECISION':
      return {
        bg: 'bg-purple-500',
        text: 'text-purple-500',
        border: 'border-purple-500',
        badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
      };
    case 'MILESTONE':
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-500',
        border: 'border-amber-500',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
      };
    case 'APPROVAL':
      return {
        bg: 'bg-green-500',
        text: 'text-green-500',
        border: 'border-green-500',
        badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
      };
    case 'DOCUMENT':
      return {
        bg: 'bg-indigo-500',
        text: 'text-indigo-500',
        border: 'border-indigo-500',
        badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300'
      };
    case 'MCP_SERVICE':
      return {
        bg: 'bg-violet-500',
        text: 'text-violet-500',
        border: 'border-violet-500',
        badgeClass: 'bg-violet-100 text-violet-800 dark:bg-violet-900/20 dark:text-violet-300'
      };
    case 'PIPELINE':
      return {
        bg: 'bg-orange-500',
        text: 'text-orange-500',
        border: 'border-orange-500',
        badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300'
      };
    default:
      return {
        bg: 'bg-gray-500',
        text: 'text-gray-500',
        border: 'border-gray-500',
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
      };
  }
};

export const getExecutionStatusColor = (status: ExecutionStatus) => {
  switch (status) {
    case 'PENDING':
      return {
        bg: 'bg-gray-500',
        text: 'text-gray-500',
        border: 'border-gray-500',
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
      };
    case 'READY':
      return {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        border: 'border-blue-500',
        badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
      };
    case 'RUNNING':
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-500',
        border: 'border-amber-500',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
      };
    case 'PENDING_REVIEW':
      return {
        bg: 'bg-purple-500',
        text: 'text-purple-500',
        border: 'border-purple-500',
        badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
      };
    case 'REVIEW_APPROVED':
      return {
        bg: 'bg-green-500',
        text: 'text-green-500',
        border: 'border-green-500',
        badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
      };
    case 'REVIEW_REJECTED':
      return {
        bg: 'bg-red-500',
        text: 'text-red-500',
        border: 'border-red-500',
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
      };
    case 'SUCCESS':
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-500',
        border: 'border-emerald-500',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
      };
    case 'FAILED':
      return {
        bg: 'bg-red-500',
        text: 'text-red-500',
        border: 'border-red-500',
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
      };
    default:
      return {
        bg: 'bg-gray-500',
        text: 'text-gray-500',
        border: 'border-gray-500',
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
      };
  }
};

// Format functions
export const formatTaskStatus = (status: TaskStatus) => {
  return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export const formatTaskPriority = (priority: TaskPriority) => {
  return priority.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export const formatTaskType = (type: TaskType) => {
  return type.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export const formatExecutionStatus = (status: ExecutionStatus) => {
  return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};
