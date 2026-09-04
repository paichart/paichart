/**
 * Execute Function Validation Schema
 *
 * Security: Whitelist-based function validation
 * - Only allowed functions can be executed
 * - Type-safe enum validation at compile and runtime
 * - Clear error messages for rejected functions
 *
 * @version 1.0.0
 * @author Security Team (Quarterly Review Nov 2025)
 */

import { z } from 'zod';
import { ValidCUID } from '../id-validation';

/**
 * SECURITY WHITELIST - Only these functions are allowed
 *
 * To add a new function:
 * 1. Add function name to this array
 * 2. Implement handler in function-registry.ts
 * 3. TypeScript will enforce implementation
 */
export const ALLOWED_FUNCTIONS = [
  // POV data operations
  'get_pov_data',
  'update_pov_data',

  // Template operations
  'get_template_data',

  // Search operations
  'search_povs'
] as const;

/**
 * Type-safe function name from whitelist
 */
export type AllowedFunctionName = typeof ALLOWED_FUNCTIONS[number];

/**
 * Execute function request validation schema
 *
 * Enforces:
 * - Valid CUID for povId
 * - Function name from whitelist only
 * - Type-safe arguments and context
 */
export const ExecuteFunctionSchema = z.object({
  povId: ValidCUID.optional(), // Optional for backward compatibility
  functionName: z.enum(ALLOWED_FUNCTIONS, {
    errorMap: () => ({
      message: `Function must be one of: ${ALLOWED_FUNCTIONS.join(', ')}`
    })
  }),
  args: z.record(z.unknown()).optional().default({}),
  context: z.record(z.unknown()).optional().default({})
});

/**
 * Type-safe execute function input
 */
export type ExecuteFunctionInput = z.infer<typeof ExecuteFunctionSchema>;

/**
 * Helper: Check if a function name is in the whitelist
 * Useful for logging and debugging
 */
export function isAllowedFunction(functionName: string): functionName is AllowedFunctionName {
  return (ALLOWED_FUNCTIONS as readonly string[]).includes(functionName);
}

/**
 * Helper: Get list of allowed functions for error messages
 */
export function getAllowedFunctionsList(): readonly string[] {
  return ALLOWED_FUNCTIONS;
}
