import React from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Task, TaskStatus, TaskPriority } from '@/lib/types';
import { TaskCard } from './TaskCard';

interface TaskListProps {
  tasks: Task[];
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: TaskPriority) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onDelete?: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
  onComment?: (taskId: string, content: string) => void;
  isLoading?: boolean;
}

export function TaskList({
  tasks,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onDelete,
  onEdit,
  onComment,
  isLoading,
}: TaskListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="text-center p-6">
        <p className="text-muted-foreground">
          No tasks found
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
          onAssigneeChange={onAssigneeChange}
          onDelete={onDelete}
          onEdit={onEdit}
          onComment={onComment}
        />
      ))}
    </div>
  );
}
