import { NextRequest, NextResponse } from 'next/server';
import {
  ApiError,
  AuthError,
  DatabaseError,
  ValidationError,
  isApiError,
  isAuthError,
  isDatabaseError,
  isValidationError,
} from '../lib/errors';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import type { ApiResponse } from '../lib/types';

/**
 * Error handler middleware
 */
export async function errorHandler(
  error: unknown,
  req: NextRequest
): Promise<NextResponse> {
  // Log error
  logger.error({ err: error }, 'request error');

  // Format error response
  let response: ApiResponse;

  if (isAuthError(error)) {
    response = formatAuthError(error);
  } else if (isValidationError(error)) {
    response = formatValidationError(error);
  } else if (isDatabaseError(error)) {
    response = formatDatabaseError(error);
  } else if (isApiError(error)) {
    response = formatApiError(error);
  } else {
    response = formatUnknownError(error);
  }

  // Return error response
  return NextResponse.json(response, {
    status: getStatusCode(response),
  });
}

/**
 * Format auth error
 */
function formatAuthError(error: AuthError): ApiResponse {
  return {
    data: null,
    error: {
      message: error.message,
      code: error.code,
    },
  };
}

/**
 * Format validation error
 */
function formatValidationError(error: ValidationError): ApiResponse {
  return {
    data: null,
    error: {
      message: error.message,
      code: error.code,
    },
  };
}

/**
 * Format database error
 */
function formatDatabaseError(error: DatabaseError): ApiResponse {
  return {
    data: null,
    error: {
      message: error.message,
      code: error.code,
    },
  };
}

/**
 * Format API error
 */
function formatApiError(error: ApiError): ApiResponse {
  return {
    data: null,
    error: {
      message: error.message,
      code: error.code,
    },
  };
}

/**
 * Format unknown error
 */
function formatUnknownError(error: unknown): ApiResponse {
  return {
    data: null,
    error: {
      message: process.env.NODE_ENV === 'development' ? String(error) : 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
  };
}

/**
 * Get status code from error response
 */
function getStatusCode(response: ApiResponse): number {
  if (!response.error) return 200;

  switch (response.error.code) {
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'VALIDATION_ERROR':
      return 400;
    case 'DATABASE_ERROR':
      return 500;
    case 'API_ERROR':
      return 500;
    default:
      return 500;
  }
}
