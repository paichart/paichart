/**
 * Input Validation Framework
 * Comprehensive input sanitization and validation for enterprise security
 * 
 * Applies systematic security hardening using proven methodology from Plans 1-7
 * Eliminates input-based attack vectors across all API endpoints
 * 
 * @version 1.0.0
 * @author Validation-Engine Specialist
 */

import { z } from 'zod';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { FIELD_LIMITS } from './field-limits';

// Common validation patterns
export const ValidationPatterns = {
  // Secure ID patterns (prevent injection)
  SECURE_ID: /^[a-zA-Z0-9_-]{1,50}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  
  // Safe text patterns (allows common punctuation for descriptions/prompts)
  SAFE_TEXT: /^[a-zA-Z0-9\s\-_.!?():;,'"]+$/,
  SAFE_NAME: /^[a-zA-Z0-9\s\-_.]{1,100}$/,
  // Comment text - allows @mentions and full punctuation for human notes
  COMMENT_TEXT: /^[a-zA-Z0-9\s\-_.!?()@,:;'"#$%&*+=[\]{}|\\/<>]+$/,
  
  // Email and user input
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  
  // Prevent common injection patterns
  // BC15 FIX: Replaced negative-lookahead regexes (O(n²) ReDoS) with simple positive-match patterns.
  // Usage: test with pattern then NEGATE the result (containsScriptInjection / containsSqlInjection).
  _SCRIPT_INJECTION_MATCH: /<script|javascript:|vbscript:|on\w+\s*=/i,
  _SQL_INJECTION_MATCH: /union\s+select|drop\s+table|insert\s+into|delete\s+from/i,
  // Legacy: kept for backward compatibility with any external consumers that reference them.
  // These are safe on bounded strings (<= 500 chars from .max()) but unsafe on unbounded input.
  NO_SCRIPT_INJECTION: /^(?!.*(<script|javascript:|vbscript:|on\w+\s*=)).*$/i,
  NO_SQL_INJECTION: /^(?!.*(union\s+select|drop\s+table|insert\s+into|delete\s+from)).*$/i,
  NO_PATH_TRAVERSAL: /^(?!.*(\.\.|\/\.\.|\\\.\.)).*$/
};

// Pre-defined validation schemas for common data types
export const ValidationSchemas = {
  // User input validation
  USER_ID: z.string().regex(ValidationPatterns.SECURE_ID, 'Invalid user ID format'),
  SESSION_ID: z.string().regex(ValidationPatterns.UUID, 'Invalid session ID format'),
  
  // Text input validation
  SAFE_TEXT: z.string()
    .min(1, 'Text cannot be empty')
    .max(FIELD_LIMITS.SHORT_TEXT, 'Text too long')
    .regex(ValidationPatterns.SAFE_TEXT, 'Text contains invalid characters')
    .refine((val) => !ValidationPatterns._SCRIPT_INJECTION_MATCH.test(val), 'Script injection detected')
    .refine((val) => !ValidationPatterns._SQL_INJECTION_MATCH.test(val), 'SQL injection pattern detected'),

  SAFE_NAME: z.string()
    .min(1, 'Name cannot be empty')
    .max(FIELD_LIMITS.LABEL, 'Name too long')
    .regex(ValidationPatterns.SAFE_NAME, 'Name contains invalid characters'),

  // Comment text validation (allows @mentions, quotes, commas, colons)
  COMMENT_TEXT: z.string()
    .min(1, 'Comment cannot be empty')
    .max(FIELD_LIMITS.METADATA, 'Comment too long')
    .regex(ValidationPatterns.COMMENT_TEXT, 'Comment contains invalid characters')
    .refine((val) => !ValidationPatterns._SCRIPT_INJECTION_MATCH.test(val), 'Script injection detected')
    .refine((val) => !ValidationPatterns._SQL_INJECTION_MATCH.test(val), 'SQL injection pattern detected'),

  // Email validation
  EMAIL: z.string().email('Invalid email format').regex(ValidationPatterns.EMAIL, 'Email format not allowed'),

  // File and path validation
  SAFE_PATH: z.string()
    .regex(ValidationPatterns.NO_PATH_TRAVERSAL, 'Path traversal detected')
    .max(200, 'Path too long'),  // 200 = filesystem path soft cap; not a string-content size, kept literal
    
  // POV and task data
  POV_ID: z.string().regex(ValidationPatterns.SECURE_ID, 'Invalid POV ID'),
  TASK_ID: z.string().regex(ValidationPatterns.SECURE_ID, 'Invalid task ID'),
  PHASE_ID: z.string().regex(ValidationPatterns.SECURE_ID, 'Invalid phase ID'),
  STAGE_ID: z.string().regex(ValidationPatterns.SECURE_ID, 'Invalid stage ID'),
  
  // Pagination and limits
  PAGINATION_LIMIT: z.number().min(1).max(1000, 'Limit too high - potential DoS'),
  PAGINATION_OFFSET: z.number().min(0).max(100000, 'Offset too high'),

  // Priority and status enums - Use Prisma enums to prevent drift
  TASK_PRIORITY: z.nativeEnum(TaskPriority),
  TASK_STATUS: z.nativeEnum(TaskStatus),

  // #215 Phase 3 sweep follow-up (2026-05-23): SAFE_JSON deleted as DEAD CODE.
  // Zero consumers across lib/, app/, scripts/ — only references were its own
  // declaration plus 2 bug-registry rows flagging it as HIGH severity.
  // Hardening dead code defends a feature no one uses while inviting future
  // adoption of under-hardened code. Per [[feedback_defend_vs_delete_dead_code]].
  // If JSON validation IS needed, build it with size cap BEFORE strip (per
  // [[feedback_zod_refine_before_transform]]) rather than reviving the
  // un-capped shape.
};

// 2026-05-14 P3 cleanup: ValidationResult / ValidationOptions /
// InputValidationFramework class / getInputValidationFramework() /
// APIValidationSchemas / default export — ALL deleted. Sole consumer
// was lib/middleware/validation-middleware.ts which itself had zero
// adopters. Kept here as a NOTE so future audits know the framework
// shape used to live in this file. The active exports are now just
// ValidationPatterns and ValidationSchemas (above).
//
// What was removed:
//   • Generic ValidationResult<T> + ValidationOptions interfaces
//   • InputValidationFramework class (validateRequestBody, security
//     checks, violation counter — all unused infrastructure)
//   • APIValidationSchemas object with CREATE_POV / CREATE_TASK /
//     UPDATE_USER / CREATE_AGENT_TEMPLATE / CREATE_PROMPT /
//     SEARCH_PARAMS / LOGIN_REQUEST / UPDATE_SETTINGS schemas —
//     these duplicated the route-specific schemas in lib/validation/*.ts
//     that are actually wired into routes.
//   • Singleton + default export

