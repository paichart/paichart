/**
 * Safe Regex Construction — BC15 Defense
 *
 * Prevents ReDoS (Regular Expression Denial of Service) by validating
 * user-controllable regex patterns before instantiation.
 *
 * Created: 2026-02-26
 * Bug Class: BC15 (ReDoS via User-Controlled Regex)
 */

import { logger } from '@/lib/logger';

const safeRegexLogger = logger.child({ module: 'SafeRegex' });

/** Maximum allowed pattern length to prevent memory/CPU abuse */
const MAX_PATTERN_LENGTH = 500;

/**
 * Dangerous patterns that can cause catastrophic backtracking:
 * - Nested quantifiers: (a+)+ , (a*)*
 * - Overlapping alternations with quantifiers: (a|a)+
 * - Backreferences with quantifiers: (a)\1+
 */
const DANGEROUS_PATTERNS = [
  /\([^)]*[+*][^)]*\)[+*]/, // Nested quantifiers: (a+)+ or (a*)*
  /\([^)]*\|[^)]*\)[+*]{/,  // Alternation with counted quantifier: (a|b){100}
];

/**
 * Attempt to construct a RegExp safely from a user-controlled string.
 *
 * Returns null if the pattern is invalid, too long, or contains
 * known catastrophic-backtracking structures.
 *
 * @param pattern - The regex pattern string (from DB, user input, etc.)
 * @param flags - Optional regex flags (default: none)
 * @param context - Label for logging (e.g., 'threat indicator', 'field validation')
 * @returns A compiled RegExp, or null if unsafe/invalid
 */
export function safeRegex(
  pattern: string,
  flags: string = '',
  context: string = 'unknown'
): RegExp | null {
  // Length guard
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) {
    safeRegexLogger.warn(
      { patternLength: pattern?.length, maxLength: MAX_PATTERN_LENGTH, context },
      'Regex pattern rejected — exceeds max length'
    );
    return null;
  }

  // Catastrophic backtracking guard
  for (const dangerous of DANGEROUS_PATTERNS) {
    if (dangerous.test(pattern)) {
      safeRegexLogger.warn(
        { pattern: pattern.substring(0, 100), context },
        'Regex pattern rejected — contains dangerous backtracking structure'
      );
      return null;
    }
  }

  // Compilation guard — invalid regex syntax throws
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    safeRegexLogger.warn(
      { err, pattern: pattern.substring(0, 100), context },
      'Regex pattern rejected — invalid syntax'
    );
    return null;
  }
}
