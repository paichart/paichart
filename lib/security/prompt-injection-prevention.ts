/**
 * Prompt Injection Prevention Library
 *
 * Detects and blocks LLM prompt injection attacks to prevent:
 * - Jailbreak attempts (DAN mode, Evil Confidant, etc.)
 * - Instruction override (ignore previous, disregard, forget)
 * - Role switching (you are now, act as, pretend)
 * - System manipulation (system:, [INST], special tokens)
 * - Context manipulation (end of conversation, new context)
 * - Code injection (script tags, javascript:)
 * - Multi-line injection (newline context breaks)
 *
 * @version 1.0.0
 * @created 2025-10-30
 * @specialist-reviewed sec-ops (88%), validation-engine (90%)
 */

export type InjectionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type InjectionCategory =
  | 'INSTRUCTION_OVERRIDE'
  | 'ROLE_SWITCHING'
  | 'SYSTEM_MANIPULATION'
  | 'JAILBREAK'
  | 'CONTEXT_MANIPULATION'
  | 'CODE_INJECTION'
  | 'SQL_INJECTION'
  | 'MULTILINE_INJECTION'
  | 'DATA_EXFILTRATION'
  | 'PRIVILEGE_ESCALATION';

export interface InjectionPattern {
  pattern: RegExp;
  severity: InjectionSeverity;
  category: InjectionCategory;
  description: string;
}

/**
 * Comprehensive injection pattern library (25+ patterns)
 * Based on known LLM jailbreak and injection techniques
 */
export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
  // INSTRUCTION_OVERRIDE (CRITICAL)
  // Noun group expanded 2026-05-14 (#2 detectPromptInjection coverage audit):
  // added `text|content|input|message|messages` after sec-ops review found
  // "ignore the above text"-style phrasings were slipping through. Kept
  // a required noun on purpose — making the noun optional false-positives
  // legitimate business text like "Please ignore the above note."
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|commands?|text|content|input|messages?)/gi,
    severity: 'CRITICAL',
    category: 'INSTRUCTION_OVERRIDE',
    description: 'Attempts to override previous instructions'
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|commands?|text|content|input|messages?)/gi,
    severity: 'CRITICAL',
    category: 'INSTRUCTION_OVERRIDE',
    description: 'Attempts to disregard previous instructions'
  },
  {
    pattern: /forget\s+(all\s+)?(previous|prior|earlier)\s+(instructions?|context|prompts?)/gi,
    severity: 'CRITICAL',
    category: 'INSTRUCTION_OVERRIDE',
    description: 'Attempts to forget previous context'
  },
  {
    pattern: /override\s+(all\s+)?(previous|prior|system)\s+(instructions?|settings?|rules?)/gi,
    severity: 'CRITICAL',
    category: 'INSTRUCTION_OVERRIDE',
    description: 'Attempts to override system settings'
  },
  // Sentence-initial "ignore (the) X" — 2026-05-14 (#2 audit). Catches the
  // directive phrasings that don't carry a noun: "Ignore the above and...",
  // "Ignore everything above", "Ignore previous.". Required sentence-start
  // anchor (^ or after .?!\n) so embedded phrasings like
  // "Please ignore the above note" don't false-positive.
  {
    pattern: /(?:^|[.?!\n]\s+)ignore\s+(?:the\s+)?(?:above|previous|prior|earlier|everything)\b/gi,
    severity: 'CRITICAL',
    category: 'INSTRUCTION_OVERRIDE',
    description: 'Sentence-initial instruction-override attempt'
  },

  // ROLE_SWITCHING (CRITICAL)
  {
    pattern: /you\s+are\s+now\s+(a|an)\s+/gi,
    severity: 'CRITICAL',
    category: 'ROLE_SWITCHING',
    description: 'Attempts to change LLM role'
  },
  {
    pattern: /act\s+as\s+(a|an|if)\s+/gi,
    severity: 'HIGH',
    category: 'ROLE_SWITCHING',
    description: 'Attempts to change LLM behavior'
  },
  {
    pattern: /pretend\s+(you\s+are|to\s+be)\s+/gi,
    severity: 'HIGH',
    category: 'ROLE_SWITCHING',
    description: 'Attempts to change LLM persona'
  },
  {
    pattern: /roleplay\s+as\s+/gi,
    severity: 'HIGH',
    category: 'ROLE_SWITCHING',
    description: 'Roleplay injection attempt'
  },

  // SYSTEM_MANIPULATION (CRITICAL)
  {
    pattern: /system\s*:/gi,
    severity: 'CRITICAL',
    category: 'SYSTEM_MANIPULATION',
    description: 'System prompt injection attempt'
  },
  {
    pattern: /\[INST\]|\[\/INST\]/gi,
    severity: 'CRITICAL',
    category: 'SYSTEM_MANIPULATION',
    description: 'Llama instruction token injection'
  },
  {
    pattern: /<\|im_start\|>|<\|im_end\|>/gi,
    severity: 'CRITICAL',
    category: 'SYSTEM_MANIPULATION',
    description: 'ChatML token injection'
  },
  {
    pattern: /<\|endoftext\|>|<\|startoftext\|>/gi,
    severity: 'CRITICAL',
    category: 'SYSTEM_MANIPULATION',
    description: 'GPT special token injection'
  },
  {
    pattern: /assistant\s*:|human\s*:|user\s*:/gi,
    severity: 'HIGH',
    category: 'SYSTEM_MANIPULATION',
    description: 'Chat format manipulation'
  },

  // JAILBREAK (CRITICAL)
  {
    pattern: /DAN\s+mode|do\s+anything\s+now/gi,
    severity: 'CRITICAL',
    category: 'JAILBREAK',
    description: 'Known jailbreak technique (DAN mode)'
  },
  {
    pattern: /evil\s+confidant|DUDE\s+mode/gi,
    severity: 'CRITICAL',
    category: 'JAILBREAK',
    description: 'Known jailbreak technique (Evil Confidant)'
  },
  {
    pattern: /developer\s+mode|dev\s+mode/gi,
    severity: 'HIGH',
    category: 'JAILBREAK',
    description: 'Developer mode jailbreak attempt'
  },
  {
    pattern: /sudo\s+mode|admin\s+mode/gi,
    severity: 'CRITICAL',
    category: 'JAILBREAK',
    description: 'Privilege escalation attempt'
  },

  // CONTEXT_MANIPULATION (HIGH)
  {
    pattern: /end\s+of\s+(conversation|chat|context|dialogue)/gi,
    severity: 'HIGH',
    category: 'CONTEXT_MANIPULATION',
    description: 'Context termination attempt'
  },
  {
    pattern: /new\s+(conversation|chat|context|session)\s+(starts?|begins?)/gi,
    severity: 'HIGH',
    category: 'CONTEXT_MANIPULATION',
    description: 'Context reset attempt'
  },
  {
    pattern: /reset\s+(context|conversation|memory)/gi,
    severity: 'HIGH',
    category: 'CONTEXT_MANIPULATION',
    description: 'Memory reset attempt'
  },

  // CODE_INJECTION (HIGH)
  {
    pattern: /<script[\s>]/gi,
    severity: 'HIGH',
    category: 'CODE_INJECTION',
    description: 'JavaScript injection attempt'
  },
  {
    pattern: /javascript\s*:/gi,
    severity: 'HIGH',
    category: 'CODE_INJECTION',
    description: 'JavaScript protocol injection'
  },
  {
    pattern: /on(click|load|error|mouseover)\s*=/gi,
    severity: 'HIGH',
    category: 'CODE_INJECTION',
    description: 'HTML event handler injection'
  },
  // Dangerous HTML tag openers — 2026-05-14 (#2 detectPromptInjection
  // coverage audit). Previously bare <iframe>, <object>, <embed>, <form>,
  // <svg>, <style>, <meta>, <link> all slipped through unless they
  // contained a javascript: URI or an event handler. Each of these tags
  // can host stored XSS without needing those (iframe srcdoc, object
  // data, CSS-based exfil via <style>, <form> spoofing, etc.).
  //
  // Deliberately narrow tag list — does NOT include <a>, <strong>, <em>,
  // <p>, <ul>, etc. so legitimate Markdown-rendered business text and
  // math comparisons ("x < y") aren't false-flagged.
  {
    pattern: /<(iframe|object|embed|form|svg|style|meta|link)\b/gi,
    severity: 'HIGH',
    category: 'CODE_INJECTION',
    description: 'Dangerous HTML tag injection (iframe/object/embed/form/svg/style/meta/link)'
  },

  // SQL_INJECTION (MEDIUM) - Relaxed to only block actual SQL syntax
  // Removed: Business terms like "DROP Program" or "DELETE Legacy" are legitimate
  // Only blocks clear SQL injection attempts with full syntax
  {
    pattern: /;\s*(DROP|DELETE)\s+(TABLE|DATABASE)\s+[\w`'"]+/gi,
    severity: 'MEDIUM',
    category: 'SQL_INJECTION',
    description: 'SQL injection with full syntax detected'
  },

  // MULTILINE_INJECTION (HIGH)
  //
  // 2026-08-23: the `system` arm NARROWED (was the bare word `system`). A bare
  // paragraph-initial "System" false-flags legitimate domain prose — live incident
  // IGP-T1 R5: a clean change package's "System IDs used below…" paragraph was
  // neutralized at the context-chaining boundary, the downstream reviewer saw the
  // marker in its §6 view and blocked a document that carried no marker at rest
  // (view-layer false block; cline_docs/igp-migration-design-2026-08-21/
  // IGP-T1-CAMPAIGN-WRAP-2026-08-23.md). The arm now requires an actual
  // role-marker / prompt-context shape: "system:" or "system prompt|message|
  // instruction(s)|override". The other arms are unchanged — no false-positive
  // evidence against them.
  {
    pattern: /\n\n[\s]*(?:ignore|you\s+are|act\s+as|disregard|system\s*:|system\s+(?:prompt|message|instructions?|override))/gi,
    severity: 'HIGH',
    category: 'MULTILINE_INJECTION',
    description: 'Multi-line context break injection'
  },

  // DATA_EXFILTRATION (CRITICAL)
  {
    pattern: /print\s+(all\s+)?(previous|system|internal)\s+(messages?|data|information)/gi,
    severity: 'CRITICAL',
    category: 'DATA_EXFILTRATION',
    description: 'Data exfiltration attempt'
  },
  {
    pattern: /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions|rules)/gi,
    severity: 'CRITICAL',
    category: 'DATA_EXFILTRATION',
    description: 'System prompt extraction attempt'
  },

  // PRIVILEGE_ESCALATION (CRITICAL)
  {
    pattern: /enable\s+(all\s+)?(admin|root|sudo|superuser)\s+(mode|access|privileges)/gi,
    severity: 'CRITICAL',
    category: 'PRIVILEGE_ESCALATION',
    description: 'Privilege escalation attempt'
  }
];

export interface InjectionDetectionResult {
  isSafe: boolean;
  riskScore: number; // 0-100
  severity: InjectionSeverity;
  detectedPatterns: Array<{
    pattern: string;
    category: InjectionCategory;
    severity: InjectionSeverity;
    match: string;
    position: number;
  }>;
  sanitizedValue?: string;
}

/**
 * Detect prompt injection patterns in text
 *
 * @param text Text to analyze for injection patterns
 * @returns Detection result with risk score and identified patterns
 *
 * @example
 * const result = detectPromptInjection("Ignore previous instructions");
 * if (!result.isSafe) {
 *   console.error(`Injection detected: ${result.severity}`);
 * }
 */
export function detectPromptInjection(text: string): InjectionDetectionResult {
  if (!text || typeof text !== 'string') {
    return {
      isSafe: true,
      riskScore: 0,
      severity: 'LOW',
      detectedPatterns: []
    };
  }

  const detectedPatterns: InjectionDetectionResult['detectedPatterns'] = [];
  let maxSeverity: InjectionSeverity = 'LOW';
  let riskScore = 0;

  // Check against all patterns
  for (const { pattern, severity, category, description } of INJECTION_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern));

    for (const match of matches) {
      detectedPatterns.push({
        pattern: pattern.toString(),
        category,
        severity,
        match: match[0],
        position: match.index || 0
      });

      // Calculate risk score
      switch (severity) {
        case 'CRITICAL':
          riskScore += 40;
          break;
        case 'HIGH':
          riskScore += 25;
          break;
        case 'MEDIUM':
          riskScore += 10;
          break;
        case 'LOW':
          riskScore += 5;
          break;
      }

      // Track max severity
      if (severity === 'CRITICAL') {
        maxSeverity = 'CRITICAL';
      } else if (severity === 'HIGH' && maxSeverity !== 'CRITICAL') {
        maxSeverity = 'HIGH';
      } else if (severity === 'MEDIUM' && !['CRITICAL', 'HIGH'].includes(maxSeverity)) {
        maxSeverity = 'MEDIUM';
      }
    }
  }

  // Cap risk score at 100
  riskScore = Math.min(riskScore, 100);

  return {
    isSafe: detectedPatterns.length === 0,
    riskScore,
    severity: maxSeverity,
    detectedPatterns
  };
}

/**
 * Sanitize variable value for safe template injection
 *
 * @param value Value to sanitize
 * @param options Sanitization options
 * @returns Sanitized string value
 *
 * @example
 * const safe = sanitizeTemplateVariable('<script>alert("XSS")</script>');
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
export function sanitizeTemplateVariable(
  value: any,
  options: {
    maxLength?: number;
    allowHtml?: boolean;
    allowNewlines?: boolean;
    allowSpecialChars?: boolean;
  } = {}
): string {
  const {
    maxLength = 1000,
    allowHtml = false,
    allowNewlines = false,
    allowSpecialChars = true
  } = options;

  // Convert to string
  let sanitized = String(value);

  // Trim whitespace
  sanitized = sanitized.trim();

  // Length limit (DoS prevention)
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // HTML escape (XSS prevention)
  if (!allowHtml) {
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // Newline handling (multi-line injection prevention)
  if (!allowNewlines) {
    sanitized = sanitized.replace(/[\r\n]+/g, ' ');
  }

  // Special character handling
  if (!allowSpecialChars) {
    sanitized = sanitized.replace(/[^\w\s.,!?-]/g, '');
  }

  return sanitized;
}

/**
 * Validate template variables with injection detection
 *
 * @param variables Variables object to validate
 * @param options Validation options
 * @returns Validation result with sanitized variables
 *
 * @example
 * const result = validateTemplateVariables({
 *   userName: 'Alice',
 *   instruction: 'Ignore previous instructions' // ← Will be detected
 * });
 *
 * if (!result.isValid) {
 *   console.error(result.errors); // ['Prompt injection detected in variable "instruction"']
 * }
 */
export function validateTemplateVariables(
  variables: Record<string, any>,
  options: {
    strictMode?: boolean;
    maxVariables?: number;
    maxValueLength?: number;
    requireAllDefined?: boolean;
  } = {}
): {
  isValid: boolean;
  sanitizedVariables: Record<string, string>;
  errors: string[];
  warnings: string[];
} {
  const {
    strictMode = true,
    maxVariables = 50,
    maxValueLength = 1000,
    requireAllDefined = false
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitizedVariables: Record<string, string> = {};

  // Check variable count (DoS prevention)
  const varCount = Object.keys(variables).length;
  if (varCount > maxVariables) {
    errors.push(`Too many variables: ${varCount} (max: ${maxVariables})`);
    return { isValid: false, sanitizedVariables: {}, errors, warnings };
  }

  // Validate each variable
  for (const [key, value] of Object.entries(variables)) {
    // Variable name validation
    if (!/^[a-zA-Z0-9_.]+$/.test(key)) {
      errors.push(`Invalid variable name: "${key}" (alphanumeric, dots, and underscores only)`);
      continue;
    }

    if (key.length > 50) {
      errors.push(`Variable name too long: "${key}" (max 50 chars)`);
      continue;
    }

    // Null/undefined handling
    if (value === null || value === undefined) {
      if (requireAllDefined) {
        errors.push(`Variable "${key}" is required but not provided`);
      } else {
        warnings.push(`Variable "${key}" is null/undefined, using empty string`);
        sanitizedVariables[key] = '';
      }
      continue;
    }

    // Convert value to string and check length
    const strValue = String(value);
    if (strValue.length > maxValueLength) {
      errors.push(`Variable "${key}" value too long: ${strValue.length} chars (max: ${maxValueLength})`);
      continue;
    }

    // Sanitize value
    const sanitized = sanitizeTemplateVariable(value, {
      maxLength: maxValueLength,
      allowHtml: false,
      allowNewlines: !strictMode,
      allowSpecialChars: true
    });

    // Prompt injection detection
    const injectionCheck = detectPromptInjection(sanitized);

    if (!injectionCheck.isSafe) {
      // Critical injections always block
      if (strictMode || injectionCheck.severity === 'CRITICAL') {
        const patterns = injectionCheck.detectedPatterns
          .map(p => `${p.category} ("${p.match}")`)
          .join(', ');

        errors.push(
          `Prompt injection detected in variable "${key}": ${patterns} (risk score: ${injectionCheck.riskScore})`
        );
        continue;
      } else {
        // Non-critical in non-strict mode = warning
        warnings.push(
          `Potential injection in "${key}" (severity: ${injectionCheck.severity}, score: ${injectionCheck.riskScore})`
        );
      }
    }

    sanitizedVariables[key] = sanitized;
  }

  return {
    isValid: errors.length === 0,
    sanitizedVariables,
    errors,
    warnings
  };
}

/**
 * Safe template application with comprehensive validation
 *
 * Applies variables to template with multi-layer security:
 * 1. Variable name validation
 * 2. Variable value sanitization
 * 3. Prompt injection detection
 * 4. Final prompt validation
 *
 * @param template Template string with {{variable}} placeholders
 * @param variables Variables to inject
 * @param options Application options
 * @returns Application result with success status
 *
 * @example
 * const result = applyTemplateSafe(
 *   'Hello {{userName}}, please {{task}}',
 *   { userName: 'Alice', task: 'deploy the app' }
 * );
 *
 * if (result.success) {
 *   console.log(result.result); // 'Hello Alice, please deploy the app'
 * } else {
 *   console.error(result.errors); // Validation errors
 * }
 */
export function applyTemplateSafe(
  template: string,
  variables: Record<string, any>,
  options: {
    strictMode?: boolean;
    validateInjection?: boolean;
    maxValueLength?: number;
  } = {}
): {
  success: boolean;
  result?: string;
  errors: string[];
  warnings: string[];
} {
  const {
    strictMode = true,
    validateInjection = true,
    maxValueLength = 1000
  } = options;

  // Validate template is a string
  if (!template || typeof template !== 'string') {
    return {
      success: false,
      errors: ['Template must be a non-empty string'],
      warnings: []
    };
  }

  // Validate variables
  const validation = validateTemplateVariables(variables, {
    strictMode,
    maxValueLength
  });

  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings
    };
  }

  // Apply variables to template
  let result = template;
  for (const [key, value] of Object.entries(validation.sanitizedVariables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }

  // Final injection check on complete prompt (catches combinations)
  if (validateInjection) {
    const finalCheck = detectPromptInjection(result);

    if (!finalCheck.isSafe) {
      if (finalCheck.severity === 'CRITICAL') {
        return {
          success: false,
          errors: [
            `CRITICAL injection detected in final prompt`,
            ...finalCheck.detectedPatterns.map(p =>
              `  - ${p.category}: "${p.match}" at position ${p.position}`
            )
          ],
          warnings: validation.warnings
        };
      } else if (strictMode && finalCheck.severity === 'HIGH') {
        return {
          success: false,
          errors: [
            `HIGH-risk injection detected in final prompt`,
            ...finalCheck.detectedPatterns.map(p =>
              `  - ${p.category}: "${p.match}"`
            )
          ],
          warnings: validation.warnings
        };
      } else {
        // Medium/Low in non-strict mode = warning only
        validation.warnings.push(
          `Potential injection in final prompt (severity: ${finalCheck.severity})`
        );
      }
    }
  }

  return {
    success: true,
    result,
    errors: [],
    warnings: validation.warnings
  };
}

/**
 * Extract variable placeholders from template
 *
 * @param template Template string
 * @returns Array of variable names found in template
 *
 * @example
 * const vars = extractPlaceholders('Hello {{name}}, your {{item}} is ready');
 * // Returns: ['name', 'item']
 */
export function extractPlaceholders(template: string): string[] {
  if (!template || typeof template !== 'string') {
    return [];
  }

  const matches = template.matchAll(/{{([a-zA-Z0-9_.]+)}}/g);
  const placeholders = Array.from(matches, match => match[1]);

  // Return unique placeholders
  return Array.from(new Set(placeholders));
}

/**
 * Validate template structure
 *
 * Checks:
 * - Template is valid string
 * - All placeholders have valid names
 * - No malformed placeholders
 * - Template size within limits
 *
 * @param template Template string to validate
 * @param requiredVariables Optional list of required variable names
 * @returns Validation result
 */
export function validateTemplateStructure(
  template: string,
  requiredVariables?: string[]
): {
  isValid: boolean;
  placeholders: string[];
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check template is string
  if (!template || typeof template !== 'string') {
    errors.push('Template must be a non-empty string');
    return { isValid: false, placeholders: [], errors, warnings };
  }

  // Check template size (DoS prevention)
  if (template.length > 50000) {
    errors.push(`Template too large: ${template.length} chars (max: 50,000)`);
    return { isValid: false, placeholders: [], errors, warnings };
  }

  // Extract placeholders
  const placeholders = extractPlaceholders(template);

  // Check for malformed placeholders (unclosed, nested, etc.)
  const malformed = template.match(/{{[^}]*$/g);
  if (malformed) {
    errors.push('Malformed placeholder detected (unclosed brackets)');
  }

  const nested = template.match(/{{[^}]*{{/g);
  if (nested) {
    errors.push('Nested placeholders not supported');
  }

  // Check required variables
  if (requiredVariables && requiredVariables.length > 0) {
    const missing = requiredVariables.filter(v => !placeholders.includes(v));
    if (missing.length > 0) {
      warnings.push(`Template missing required variables: ${missing.join(', ')}`);
    }

    const extra = placeholders.filter(p => !requiredVariables.includes(p));
    if (extra.length > 0) {
      warnings.push(`Template has undefined variables: ${extra.join(', ')}`);
    }
  }

  // Check for injection in template itself
  const templateCheck = detectPromptInjection(template);
  if (!templateCheck.isSafe && templateCheck.severity === 'CRITICAL') {
    errors.push('Template contains dangerous patterns (injection in template itself)');
  }

  return {
    isValid: errors.length === 0,
    placeholders,
    errors,
    warnings
  };
}

/**
 * Calculate risk score for a set of variables
 *
 * @param variables Variables to score
 * @returns Overall risk assessment
 */
export function calculateVariableRiskScore(
  variables: Record<string, any>
): {
  overallRisk: InjectionSeverity;
  totalScore: number;
  variableScores: Record<string, { score: number; severity: InjectionSeverity }>;
} {
  const variableScores: Record<string, { score: number; severity: InjectionSeverity }> = {};
  let totalScore = 0;
  let maxSeverity: InjectionSeverity = 'LOW';

  for (const [key, value] of Object.entries(variables)) {
    const check = detectPromptInjection(String(value));
    variableScores[key] = {
      score: check.riskScore,
      severity: check.severity
    };

    totalScore += check.riskScore;

    if (check.severity === 'CRITICAL') maxSeverity = 'CRITICAL';
    else if (check.severity === 'HIGH' && maxSeverity !== 'CRITICAL') maxSeverity = 'HIGH';
    else if (check.severity === 'MEDIUM' && !['CRITICAL', 'HIGH'].includes(maxSeverity)) maxSeverity = 'MEDIUM';
  }

  return {
    overallRisk: maxSeverity,
    totalScore: Math.min(totalScore, 100),
    variableScores
  };
}

/**
 * Security utility: Check if string contains only safe characters
 *
 * @param text Text to check
 * @returns True if text contains only alphanumeric and common punctuation
 */
export function isSafeText(text: string): boolean {
  // Allow: letters, numbers, spaces, and common punctuation
  const safePattern = /^[a-zA-Z0-9\s.,!?'"()\-_@#$%&*+=:;]+$/;
  return safePattern.test(text);
}

/**
 * Security utility: Detect suspicious character sequences
 *
 * @param text Text to analyze
 * @returns Array of suspicious sequences found
 */
export function detectSuspiciousSequences(text: string): string[] {
  const suspicious: string[] = [];

  // Excessive punctuation (possible obfuscation)
  if (/[!?]{3,}/.test(text)) {
    suspicious.push('Excessive punctuation');
  }

  // Unicode manipulation attempts
  if (/[\u200B-\u200D\uFEFF]/.test(text)) {
    suspicious.push('Zero-width characters (potential obfuscation)');
  }

  // Excessive capitalization (shouting, emphasis)
  if (/[A-Z]{10,}/.test(text)) {
    suspicious.push('Excessive capitalization');
  }

  // Base64 encoded data (potential payload)
  if (/[A-Za-z0-9+\/]{50,}={0,2}/.test(text)) {
    suspicious.push('Possible Base64 encoded data');
  }

  return suspicious;
}
