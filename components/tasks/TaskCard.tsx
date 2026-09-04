import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { Task, TaskPriority, TaskStatus } from '@/lib/types';
import { Clock, Flag, User, MessageSquare, Pencil, Trash2 } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onPriorityChange?: (taskId: string, priority: TaskPriority) => void;
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void;
  onDelete?: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
  onComment?: (taskId: string, comment: string) => void;
  isLoading?: boolean;
  isDragging?: boolean;
}

const priorityColors: Record<TaskPriority, { bg: string; text: string }> = {
  LOW: { bg: 'bg-green-500', text: 'text-white' },
  MEDIUM: { bg: 'bg-orange-500', text: 'text-white' },
  HIGH: { bg: 'bg-red-500', text: 'text-white' },
};

const statusColors: Record<TaskStatus, { bg: string, text: string }> = {
  OPEN: { bg: 'bg-muted-foreground', text: 'text-white' },
  IN_PROGRESS: { bg: 'bg-blue-500', text: 'text-white' },
  COMPLETED: { bg: 'bg-green-500', text: 'text-white' },
  BLOCKED: { bg: 'bg-red-500', text: 'text-white' },
};

export function TaskCard({
  task,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onDelete,
  onEdit,
  onComment,
  isLoading,
  isDragging,
}: TaskCardProps) {
  if (isLoading) {
    return (
      <Card className="mb-4 p-4 cursor-pointer hover:shadow-md transition-all">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </Card>
    );
  }

  const handleStatusClick = () => {
    if (!onStatusChange) return;

    const statuses: TaskStatus[] = [
      TaskStatus.OPEN,
      TaskStatus.IN_PROGRESS,
      TaskStatus.COMPLETED,
      TaskStatus.BLOCKED,
    ];
    const currentIndex = statuses.indexOf(task.status);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];
    onStatusChange(task.id, nextStatus);
  };

  const handlePriorityClick = () => {
    if (!onPriorityChange) return;

    const priorities: TaskPriority[] = [
      TaskPriority.LOW,
      TaskPriority.MEDIUM,
      TaskPriority.HIGH,
    ];
    const currentIndex = priorities.indexOf(task.priority);
    const nextPriority = priorities[(currentIndex + 1) % priorities.length];
    onPriorityChange(task.id, nextPriority);
  };

  return (
    <Card className={cn(
      "mb-4 p-4 cursor-pointer hover:shadow-md transition-all",
      isDragging && "opacity-50 scale-102"
    )}>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">
          {task.title}
        </h3>

        <p className="text-sm text-muted-foreground">
          {task.description}
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className={cn(
              "cursor-pointer flex items-center gap-1",
              statusColors[task.status].bg,
              statusColors[task.status].text
            )}
            onClick={handleStatusClick}
          >
            <Clock className="h-3 w-3" />
            {task.status}
          </Badge>

          <Badge
            variant="secondary"
            className={cn(
              "cursor-pointer flex items-center gap-1",
              priorityColors[task.priority].bg,
              priorityColors[task.priority].text
            )}
            onClick={handlePriorityClick}
          >
            <Flag className="h-3 w-3" />
            {task.priority}
          </Badge>

          <Badge
            variant="outline"
            className="cursor-pointer flex items-center gap-1"
            onClick={() => onAssigneeChange?.(task.id, task.assigneeId)}
          >
            <User className="h-3 w-3" />
            {task.assignee ? task.assignee.name : 'Unassigned'}
          </Badge>

          <Badge
            variant="outline"
            className="cursor-pointer flex items-center gap-1"
            onClick={() => onComment?.(task.id, '')}
          >
            <MessageSquare className="h-3 w-3" />
            Comments
          </Badge>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit?.(task.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete?.(task.id)}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
