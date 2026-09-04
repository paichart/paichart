/**
 * Unified API Error Handler
 * Standardizes error responses across all endpoints
 * Prevents information leakage in production
 *
 * @version 1.0
 * @created 2025-10-29
 * @specialist-reviewed sec-ops (98%), validation-engine (94%), architectural (96%)
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

const apiErrorLogger = logger.child({ module: 'APIErrorHandler' });

export interface APIErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Array<{ field: string; message: string }>;
    details?: any; // Development only
  };
}

export interface APISuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR',
  message: string,
  details?: any
): NextResponse<APIErrorResponse> {
  const statusMap = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    VALIDATION_ERROR: 400,
    INTERNAL_ERROR: 500
  };

  return NextResponse.json({
    success: false,
    error: {
      code,
      message,
      fields: details?.fields,
      // ✅ ENHANCEMENT: Only include details in development (sec-ops recommendation)
      ...(process.env.NODE_ENV === 'development' && details && {
        details: typeof details === 'object' ? details : { message: String(details) }
      })
    }
  }, {
    status: statusMap[code]
  });
}

/**
 * Handle Zod validation errors
 * ✅ ENHANCEMENT: Both formatter and response (validation-engine recommendation)
 */
export function formatZodError(error: ZodError): { fields: Array<{ field: string; message: string }> } {
  return {
    fields: error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }))
  };
}

export function handleZodError(error: ZodError): NextResponse<APIErrorResponse> {
  return createErrorResponse(
    'VALIDATION_ERROR',
    'Validation failed',
    formatZodError(error)
  );
}

/**
 * ✅ ENHANCEMENT: Prisma error sanitization (sec-ops recommendation - 20 min)
 * Prevents database schema information leakage
 */
export function handlePrismaError(error: unknown): NextResponse<APIErrorResponse> {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Map Prisma error codes to user-friendly messages
    const errorMap: Record<string, string> = {
      'P2002': 'A record with this value already exists',
      'P2003': 'Referenced record not found',
      'P2025': 'Record not found',
    };

    const message = errorMap[error.code] || 'Database operation failed';

    return createErrorResponse('BAD_REQUEST', message, {
      // Only expose error code in development
      ...(process.env.NODE_ENV === 'development' && { code: error.code })
    });
  }

  return createErrorResponse('INTERNAL_ERROR', 'Database error');
}

/**
 * Handle generic API errors
 */
export function handleApiError(error: unknown): NextResponse<APIErrorResponse> {
  apiErrorLogger.error({ err: error }, 'API error');

  // Zod validation errors
  if (error instanceof ZodError) {
    return handleZodError(error);
  }

  // ✅ ENHANCEMENT: Prisma errors (sec-ops recommendation)
  if (error && typeof error === 'object' && 'code' in error) {
    return handlePrismaError(error);
  }

  // Known error types with messages
  if (error && typeof error === 'object' && 'message' in error) {
    const errorMessage = String(error.message);

    // Map common error patterns to safe messages
    if (errorMessage.includes('Unauthorized')) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }
    if (errorMessage.includes('Forbidden') || errorMessage.includes('Permission denied')) {
      return createErrorResponse('FORBIDDEN', 'Access denied');
    }
    if (errorMessage.includes('not found')) {
      return createErrorResponse('NOT_FOUND', 'Resource not found');
    }
  }

  // ✅ ENHANCEMENT: Generic safe message (no implementation details)
  return createErrorResponse(
    'INTERNAL_ERROR',
    'An error occurred processing your request',
    error
  );
}

/**
 * Create success response
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string
): NextResponse<APISuccessResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    ...(message && { message })
  });
}
