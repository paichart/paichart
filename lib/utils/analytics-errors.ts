/**
 * Error Sanitization Utilities for Analytics
 *
 * Purpose: Prevent technical information leakage in user-facing error messages
 * Layer: CLIENT-SIDE (browser)
 *
 * Security Best Practices:
 * - Never expose raw error messages (could leak API structure, stack traces)
 * - Never expose database errors (could leak schema information)
 * - Provide helpful, actionable messages to users
 *
 * Recommended by:
 * - boundary-contract-specialist (prevent information leakage)
 * - validation-engine-specialist (security hardening)
 *
 * @version 1.0
 */

/**
 * Sanitize error messages to prevent technical information leakage
 *
 * Converts technical error messages into user-friendly messages that don't
 * expose system internals, API structure, or debugging information.
 *
 * @param error - Error object or unknown error
 * @returns User-friendly error message (sanitized)
 */
export function sanitizeErrorMessage(error: Error | unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Network errors (connection issues)
  if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
    return 'Unable to connect to server. Please check your internet connection.';
  }

  // Authentication/Authorization errors
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
    return 'Your session has expired. Please refresh the page.';
  }

  if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
    return 'You do not have permission to view this data.';
  }

  // Server errors (5xx)
  if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
    return 'Server error occurred. Please try again later.';
  }

  if (errorMessage.includes('502') || errorMessage.includes('Bad Gateway')) {
    return 'Service temporarily unavailable. Please try again in a moment.';
  }

  if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
    return 'Service is currently down for maintenance. Please try again later.';
  }

  // Timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
    return 'Request timed out. The server is taking too long to respond.';
  }

  // Validation errors (Zod schema validation failures)
  if (errorMessage.includes('ZodError') || errorMessage.includes('validation')) {
    return 'Data format error. Please contact support if this persists.';
  }

  // Not found errors
  if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
    return 'The requested data could not be found.';
  }

  // Generic fallback (don't leak details)
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Sanitize recommendation text to prevent XSS if database compromised
 *
 * Removes potentially malicious content from AI-generated recommendation text
 * that comes from the database. Defense-in-depth security measure.
 *
 * @param text - Recommendation description or action item text
 * @returns Sanitized text (safe for rendering)
 */
export function sanitizeRecommendationText(text: string): string {
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '') // Remove iframe tags
    .replace(/<object[^>]*>.*?<\/object>/gi, '') // Remove object tags
    .replace(/<embed[^>]*>.*?<\/embed>/gi, '') // Remove embed tags
    .replace(/<[^>]+>/g, '') // Strip all remaining HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove inline event handlers (onclick, onerror, etc.)
    .slice(0, 1000); // Limit length to prevent display issues
}

/**
 * Sanitize action item text (similar to recommendation but stricter)
 *
 * Action items should be plain text only, no formatting allowed
 *
 * @param text - Action item text
 * @returns Sanitized plain text
 */
export function sanitizeActionItemText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // Strip all HTML
    .replace(/[<>]/g, '') // Remove angle brackets
    .slice(0, 500); // Shorter limit for action items
}
