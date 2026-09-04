/**
 * Input Sanitization Utilities
 * XSS prevention and content validation
 */

const MAX_COMMENT_LENGTH = 2000;

/**
 * Sanitize comment text to prevent XSS attacks
 *
 * Removes:
 * - Script tags
 * - Iframe tags
 * - Javascript: URLs
 * - Inline event handlers (onclick, onload, etc.)
 *
 * @param text - Raw comment text
 * @returns Sanitized comment text
 */
export function sanitizeComment(text: string): string {
  if (!text) return '';

  let sanitized = text.trim();

  // Remove script tags and content
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');

  // Remove iframe tags and content
  sanitized = sanitized.replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove inline event handlers (onclick, onload, onerror, etc.)
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');

  // Remove data: URLs (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');

  // Limit length
  sanitized = sanitized.substring(0, MAX_COMMENT_LENGTH);

  return sanitized;
}

/**
 * Validate comment text meets requirements
 *
 * @param text - Comment text to validate
 * @returns Validation result with error message if invalid
 */
export function validateComment(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Comment cannot be empty' };
  }

  if (text.trim().length > MAX_COMMENT_LENGTH) {
    return { valid: false, error: `Comment too long (${text.trim().length} chars, max ${MAX_COMMENT_LENGTH}). Truncate your text or split across multiple comments using perform(action: "task.comment").` };
  }

  // Check for suspicious patterns after sanitization
  const sanitized = sanitizeComment(text);
  if (sanitized !== text) {
    return { valid: false, error: 'Comment contains potentially unsafe content' };
  }

  return { valid: true };
}

export { MAX_COMMENT_LENGTH };
