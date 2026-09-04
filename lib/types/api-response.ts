/**
 * Unified API Response Types
 *
 * Provides consistent error and success response formats across all API endpoints.
 * Addresses validation-engine-specialist concern about 4 different error formats.
 *
 * @see /cline_docs/reviews/server-validation-security-2025-10-29/validation-engine-review.md
 */

export interface APIErrorResponse {
  success: false;
  error: {
    code: string;        // Machine-readable error code
    message: string;     // Human-readable error message
    fields?: Array<{     // Field-specific errors (validation)
      field: string;
      message: string;
    }>;
    details?: string;    // Additional details (development only)
  };
}

export interface APISuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export type APIResponse<T> = APISuccessResponse<T> | APIErrorResponse;

/**
 * Standard Error Codes
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Resource
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Business Logic
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  OPERATION_FAILED: 'OPERATION_FAILED'
} as const;

/**
 * Helper function to create standardized error responses
 *
 * ✅ PHASE 2: Enhancement #4 - Error details only shown in development
 */
export function createErrorResponse(
  code: keyof typeof ErrorCodes,
  message: string,
  fields?: Array<{ field: string; message: string }>,
  details?: string
): APIErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(fields && { fields }),
      // ✅ PHASE 2: Only include details in development (Error Sanitization)
      ...(process.env.NODE_ENV === 'development' && details && { details })
    }
  };
}

/**
 * Helper function to create standardized success responses
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string
): APISuccessResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message })
  };
}
