/**
 * Content Filter Policy for MCP Service Interactions
 * Anthropic MCP Compliance - Content Safety
 */

// Prohibited content categories
const PROHIBITED_CONTENT = {
  HARMFUL_INSTRUCTIONS: [
    /how\s+to\s+(make|build|create).*(bomb|explosive|weapon)/i,
    /suicide\s+(method|instruction|guide)/i,
    /self[\-\s]harm\s+(guide|instruction)/i,
    /drug\s+(manufacturing|synthesis|production)/i
  ],
  
  PERSONAL_INFO: [
    /\b\d{3}[\-\.\s]?\d{2}[\-\.\s]?\d{4}\b/, // SSN pattern
    /\b\d{4}[\-\s]?\d{4}[\-\s]?\d{4}[\-\s]?\d{4}\b/, // Credit card
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g // Email (context-dependent)
  ],
  
  MALICIOUS_CODE: [
    /<script[^>]*>.*<\/script>/gi,
    /javascript:/i,
    /vbscript:/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
    /system\s*\(/i,
    /shell_exec/i,
    /passthru/i,
    /`[^`]*`/g // Backtick execution
  ],
  
  HATE_SPEECH: [
    // Note: This would be enhanced with ML-based detection in production
    /\b(hate|kill|destroy)\s+(all\s+)?(jews|muslims|christians|blacks|whites|gays|trans)/i
  ]
};

// Warning content (logged but not blocked)
const WARNING_CONTENT = {
  SENSITIVE_TOPICS: [
    /medical\s+(diagnosis|treatment|prescription)/i,
    /legal\s+(advice|opinion|recommendation)/i,
    /financial\s+(advice|investment|trading)/i,
    /tax\s+(advice|evasion|avoidance)/i
  ],
  
  PRIVACY_CONCERNS: [
    /personal\s+(information|data|details)/i,
    /private\s+(key|password|credentials)/i,
    /confidential/i
  ]
};

// Response filtering for outbound content
const RESPONSE_FILTERS = {
  // Remove potential API keys
  API_KEYS: /\b[A-Za-z0-9]{20,}\b/g,
  
  // Remove potential tokens
  TOKENS: /\b(sk-|pk-|rk-)[A-Za-z0-9]{30,}\b/g,
  
  // Remove file paths that might be sensitive
  SENSITIVE_PATHS: /\/(?:home|root|etc|var\/log|usr\/local)\/[^\s]*/g
};

/**
 * Filter content for policy violations
 */
function filterContent(content, context = {}) {
  if (!content || typeof content !== 'string') {
    return { allowed: true, filtered: content };
  }
  
  const violations = [];
  const warnings = [];
  let filtered = content;
  
  // Check prohibited content
  for (const [category, patterns] of Object.entries(PROHIBITED_CONTENT)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        violations.push(`${category}: Matched pattern ${pattern.source}`);
      }
    }
  }
  
  // Check warning content
  for (const [category, patterns] of Object.entries(WARNING_CONTENT)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        warnings.push(`${category}: Matched pattern ${pattern.source}`);
      }
    }
  }
  
  // Apply response filters if this is outbound content
  if (context.direction === 'outbound') {
    for (const [filterName, pattern] of Object.entries(RESPONSE_FILTERS)) {
      if (pattern.test(filtered)) {
        filtered = filtered.replace(pattern, '[REDACTED]');
        warnings.push(`${filterName}: Sensitive data redacted`);
      }
    }
  }
  
  return {
    allowed: violations.length === 0,
    violations,
    warnings,
    filtered,
    originalLength: content.length,
    filteredLength: filtered.length,
    riskLevel: violations.length > 0 ? 'HIGH' : warnings.length > 0 ? 'MEDIUM' : 'LOW'
  };
}

/**
 * Content policy for service interactions
 */
function validateServiceInteraction(request, response, context) {
  const results = {
    request: filterContent(JSON.stringify(request), { ...context, direction: 'inbound' }),
    response: filterContent(JSON.stringify(response), { ...context, direction: 'outbound' })
  };
  
  const overallAllowed = results.request.allowed && results.response.allowed;
  const allViolations = [...results.request.violations, ...results.response.violations];
  const allWarnings = [...results.request.warnings, ...results.response.warnings];
  
  return {
    allowed: overallAllowed,
    violations: allViolations,
    warnings: allWarnings,
    request: results.request,
    response: results.response,
    riskLevel: allViolations.length > 0 ? 'HIGH' : allWarnings.length > 0 ? 'MEDIUM' : 'LOW'
  };
}

module.exports = {
  PROHIBITED_CONTENT,
  WARNING_CONTENT,
  RESPONSE_FILTERS,
  filterContent,
  validateServiceInteraction
};