import { prisma } from '@/lib/prisma';

export async function createTaskActivity(data: {
  userId: string;
  taskId: string;
  title: string;
  assigneeId: string | null;
}) {
  return prisma.activity.create({
    data: {
      userId: data.userId,
      action: 'TASK_CREATED',
      type: 'TASK',
      metadata: {
        taskId: data.taskId,
        title: data.title,
        assigneeId: data.assigneeId,
      },
    },
  });
}
