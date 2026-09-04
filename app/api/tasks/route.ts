import { createHandler } from '@/lib/api-handler';
import { getTasksHandler } from '@/lib/tasks/handlers/get';
import { createTaskHandler } from '@/lib/tasks/handlers/post';
import { Task } from '@/lib/types/task';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// Wrapper to match the expected type signature
const getTasksWrapper: ApiHandler<Task[]> = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }
  const result = await getTasksHandler(req, context, user);
  if ('error' in result) {
    return result;
  }
  // Cast to API layer Task type to resolve type incompatibility between service and API layers
  return { data: result.data as Task[] };
};

// Wrapper to match the expected type signature
const createTaskWrapper: ApiHandler<Task> = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }
  const result = await createTaskHandler(req, context, user);
  if ('error' in result) {
    return result;
  }
  // Cast to API layer Task type to resolve type incompatibility between service and API layers
  return { data: result.data as Task };
};

export const GET = createHandler(getTasksWrapper, { requireAuth: true, rateLimit: 'write' as const });
export const POST = createHandler(createTaskWrapper, { requireAuth: true, rateLimit: 'write' as const });
