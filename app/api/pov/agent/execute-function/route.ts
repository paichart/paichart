import { NextRequest, NextResponse } from 'next/server';
import createHandler from '@/lib/api-handler';
import { UserRole } from '@/lib/types/auth';
import { ExecuteFunctionSchema, getAllowedFunctionsList } from '@/lib/validation/agent/execute-function-validation';
import { executeFunction } from '@/lib/services/agent/function-registry';
import { povLogger } from '@/lib/logger';

/**
 * POST /api/pov/agent/execute-function
 * Execute a whitelisted custom function
 *
 * Security (3-Layer Protection):
 * - Layer 1: Zod schema validation (whitelist enforcement)
 * - Layer 2: Function registry (type-safe execution)
 * - Layer 3: Security logging (attack detection)
 *
 * @version 2.0.0 (Security hardened - Nov 2025)
 */
export const POST = createHandler(
  async (req: NextRequest) => {
    const body = await req.json();

    // LAYER 1: Validation with whitelist enforcement
    const result = ExecuteFunctionSchema.safeParse(body);

    if (!result.success) {
      // SECURITY LOGGING: Log rejected function calls (potential attacks)
      // BC42 FIX: Truncate raw user input before logging to prevent log injection/forgery
      povLogger.error({ requestedFunction: String(body.functionName || '').substring(0, 100).replace(/[\n\r]/g, ''), allowedFunctions: getAllowedFunctionsList() }, 'SECURITY: invalid function call attempt');

      return NextResponse.json(
        {
          error: {
            message: 'Validation failed',
            code: 'INVALID_REQUEST',
            details: result.error.errors
          }
        },
        { status: 400 }
      );
    }

    const { functionName, args, context } = result.data;

    try {
      // LAYER 2: Execute through type-safe function registry
      // (Registry provides defensive check even after validation)
      // Type assertion safe because Layer 1 validation ensures it's an AllowedFunctionName
      const functionResult = await executeFunction(functionName as any, args, context);

      return NextResponse.json({ result: functionResult });
    } catch (error) {
      povLogger.error({ err: error, functionName }, 'error executing function');

      return NextResponse.json(
        {
          error: {
            message: 'Agent function execution failed',
            code: 'EXECUTION_ERROR'
          }
        },
        { status: 500 }
      );
    }
  },
  { requireAuth: true, allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] }
);

// NOTE: Function implementations moved to lib/services/agent/function-registry.ts
// This provides better separation of concerns and type safety
