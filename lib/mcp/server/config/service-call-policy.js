/**
 * Service Call Policy for Anthropic Compliance
 * Validates cross-service calls to prevent proxy attacks and ensure content safety
 * Part of Priority 1 compliance implementation
 */

const { validateUrlSafety } = require('../../../utils/url-safety');

// Whitelist of approved tools that can be called via service proxy
const APPROVED_TOOLS = [
  // Weather & Environmental
  'get_weather', 'get_forecast', 'get_climate_data', 'weather_current', 'weather_forecast',
  
  // Data Analysis & Processing
  'analyze_data', 'process_data', 'transform_data', 'validate_data', 'parse_data',
  
  // Text & Content Processing
  'translate_text', 'summarize_text', 'analyze_sentiment', 'extract_keywords', 'classify_text',
  
  // Notification & Communication
  'send_notification', 'send_email', 'create_alert', 'log_event', 'notify',
  
  // Safe System Operations
  'get_status', 'health_check', 'get_info', 'list_items', 'get_metrics', 'ping', 'test_connection',
  
  // Database Operations (read-only)
  'query_database', 'search_records', 'get_record', 'list_records', 'find_data',
  
  // File Operations (safe)
  'read_file', 'list_files', 'get_file_info', 'download_file', 'get_content',
  
  // Common API operations
  'get', 'list', 'search', 'find', 'fetch', 'retrieve', 'check', 'validate', 'test',

  // pAIchart Platform Operations
  'perform', // Task management operations (create, update, assign, complete tasks)

  // Browser Automation Service (internal Docker service)
  'scrape_page', 'fill_form', 'click_element', 'take_screenshot',
  'generate_pdf', 'run_script', 'trace_session',

  // Notification Service (internal Docker service)
  'send', 'broadcast', 'escalate', 'schedule',

  // Weather Service (internal Docker service)
  'current_weather', 'forecast', 'hourly_forecast', 'air_quality',

  // EIA Service (internal Docker service)
  'find_high_potential_energy_storage_areas', 'get_state_electricity_profile_summary',
  'get_generation_mix_by_state', 'get_capacity_utilization_by_state',
  'compare_retail_electricity_prices', 'discover_electricity_route_metadata',

  // EODHD Service (internal Docker service)
  'get_eod_data', 'get_live_quote', 'search_ticker', 'get_fundamentals',

  // Snowflake Service (internal Docker service)
  'run_snowflake_query', 'list_objects', 'describe_object',

  // Purple AI Service (SentinelOne — internal Docker service, read-only)
  'purple_ai', 'powerquery',
  'get_alert', 'list_alerts', 'search_alerts', 'get_alert_notes', 'get_alert_history',
  'list_vulnerabilities', 'search_vulnerabilities',
  'list_inventory_items', 'search_inventory_items',
  'threat_intel_by_ip', 'threat_intel_by_hash', 'threat_intel_by_domain', 'threat_intel_by_url',

  // Google SecOps / Chronicle Service (internal Docker service, read-only curated subset)
  'search_security_events', 'get_security_alerts', 'lookup_entity', 'list_security_rules',
  'get_ioc_matches', 'get_threat_intel', 'search_rule_alerts', 'list_investigations', 'get_investigation',

  // Cloudflare Service (Code Mode — internal reverse-proxy). 'search' also covered by the generic list above.
  'search', 'execute',

  // Trend Vision One Service (internal Docker service, read-only curated subset)
  'workbench_alerts_list', 'workbench_alert_detail_get', 'workbench_observed_attack_techniques_list',
  'endpoint_security_endpoints_list', 'crem_attack_surface_high_risk_users_list', 'crem_attack_surface_public_ips_list',
  'cloud_posture_accounts_list', 'container_security_image_vulnerabilities_list',
  'threatintel_suspicious_objects_list', 'threatintel_feed_indicators_list', 'email_security_domains_list', 'iam_accounts_list',
];

// Patterns that are explicitly blocked for security
// Each pattern has a description for user-friendly error messages
const BLOCKED_PATTERNS_WITH_DESC = [
  {
    pattern: /\b(sudo\s+|rm\s+-rf)\b/i,
    desc: 'dangerous shell command (sudo/rm -rf)',
    hint: 'Remove shell commands from your request'
  },
  {
    pattern: /\b(ssh\s+-|telnet\s+\d|netcat|nc\s+-)/i,
    desc: 'network access tool (ssh/telnet/netcat)',
    hint: 'Network tools are not allowed in service calls'
  },
  {
    pattern: /\b(shell|bash|cmd|powershell)\s*\(/i,
    desc: 'shell execution attempt',
    hint: 'Shell/command execution is not permitted'
  },
  {
    pattern: /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(TABLE|DATABASE)|ALTER\s+TABLE|GRANT\s+\w+\s+TO|TRUNCATE\s+TABLE)\b/i,
    desc: 'SQL injection attempt',
    hint: 'Raw SQL statements are blocked. Use the appropriate API instead'
  },
  {
    pattern: /\b(chmod\s+[0-7]+|chown\s+\w+:|rmdir\s+-)/i,
    desc: 'file permission change attempt',
    hint: 'File system modifications are not allowed'
  },
  {
    pattern: /\b(bypass|disable|skip)\s+(auth|authentication|authorization|login|security)\b/i,
    desc: 'authentication bypass attempt',
    hint: 'Security bypass attempts are blocked'
  },
  {
    pattern: /;\s*(rm|sudo|chmod|wget|curl)\b/i,
    desc: 'shell command chaining with semicolon',
    hint: 'Command chaining is not allowed'
  },
  {
    pattern: /\|\s*(bash|sh|exec)\b/i,
    desc: 'pipe to shell execution',
    hint: 'Piping to shell is not allowed'
  },
  {
    pattern: /\$\([^)]*\)/,
    desc: 'shell command substitution $()',
    hint: 'Command substitution syntax is blocked'
  },
  {
    pattern: /\.\.\//,
    desc: 'path traversal attempt (../)',
    hint: 'Use absolute paths or remove ../ sequences'
  },
  {
    pattern: /<script|javascript:|data:/i,
    desc: 'script injection attempt',
    hint: 'Script tags and javascript: URLs are blocked'
  },
  {
    pattern: /\$\{[^}]+\}/,
    desc: 'environment variable expansion ${}',
    hint: 'Variable expansion syntax is blocked'
  },
  {
    pattern: /\$[A-Z_]{2,}/,
    desc: 'environment variable reference',
    hint: 'Environment variable references like $PATH are blocked'
  },
  {
    pattern: /169\.254\.169\.254/,
    desc: 'cloud metadata endpoint access',
    hint: 'Access to cloud metadata endpoints is blocked'
  },
  {
    pattern: /metadata\.(google|azure|aws)\./i,
    desc: 'cloud provider metadata access',
    hint: 'Cloud metadata services are not accessible'
  },
  {
    pattern: /\/latest\/meta-data/i,
    desc: 'AWS metadata path',
    hint: 'AWS metadata paths are blocked'
  },
  {
    pattern: /\/(wp-admin|administrator|phpmyadmin)\b/i,
    desc: 'admin panel access attempt',
    hint: 'Admin panel URLs are blocked'
  },
  {
    pattern: /\/\.(env|git|ssh|aws)\b/i,
    desc: 'hidden/config file access attempt',
    hint: 'Access to hidden config files (.env, .git) is blocked'
  }
];

// Extract just patterns for backward compatibility
const BLOCKED_PATTERNS = BLOCKED_PATTERNS_WITH_DESC.map(p => p.pattern);

// SSRF-exempt services: first-party Docker services allowed to use localhost endpoints.
// This is a NETWORK-LAYER decision (can we reach this address?), separate from
// trust-level determination in service-approval-policy.js (should we forward JWT tokens?).
// A service can be SSRF-exempt without being TRUSTED for token forwarding (e.g., snowflake
// uses External OAuth and does not need automatic JWT forwarding).
const SSRF_EXEMPT_SERVICES = [
  'browser-automation-service',
  'notification-service',
  'weather-service',
  'eia-service',
  'eodhd-service',
  'snowflake-service',
  'token-validator-service',
  'purple-ai-service',   // SentinelOne Purple AI (read-only; static console token; NOT trusted for JWT forwarding)
  'google-secops-service',  // Google SecOps/Chronicle (read-only; static GCP service-account key; NOT trusted for JWT forwarding)
  'cloudflare-service',  // Cloudflare Code Mode (reverse proxy to mcp.cloudflare.com; static API token; NOT trusted for JWT forwarding)
  'trend-vision-one-service',  // Trend Vision One XDR (read-only; supergateway bridge over the Go binary; static API key; NOT trusted for JWT forwarding)
];

// Backward-compatible alias (used by validateServiceCall inline check)
const TRUSTED_INTERNAL_SERVICES = SSRF_EXEMPT_SERVICES;

/**
 * BC70 FIX: Check if a service is SSRF-exempt (allowed to use localhost endpoints).
 * Matches against both `name` and `id` fields to handle seeded services
 * (title-case name like "Snowflake Service") vs user-registered services
 * (kebab-case id like "snowflake-service").
 *
 * NOTE: This is separate from isTrustedInternalService() in service-approval-policy.js
 * which determines TRUST LEVEL (JWT token forwarding). See that file for trust decisions.
 *
 * @param {string|object} serviceOrName - Service record with {name, id} or a plain string
 * @returns {boolean}
 */
function isSSRFExemptService(serviceOrName) {
  if (typeof serviceOrName === 'string') {
    return SSRF_EXEMPT_SERVICES.includes(serviceOrName);
  }
  return SSRF_EXEMPT_SERVICES.includes(serviceOrName.name) ||
    SSRF_EXEMPT_SERVICES.includes(serviceOrName.id);
}

// URL patterns that should never be called
const BLOCKED_URLS = [
  // Internal/private networks (blocked unless trusted internal service)
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
  /^https?:\/\/192\.168\./i,
  /^https?:\/\/10\./i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./i,

  // Cloud metadata endpoints
  /169\.254\.169\.254/,
  /metadata\.(google|azure|aws)\./i,

  // Specific admin interfaces (exact paths, not partial)
  /\/(wp-admin|phpmyadmin|administrator)\//i,

  // Hidden/sensitive files in URLs
  /\/\.(env|git|ssh|aws|config)\b/i,

  // Debug endpoints (exact, not partial like /debugger-friendly-page)
  /\/(debug|_debug|__debug)\/?$/i,
];

// Content size limits
const LIMITS = {
  MAX_PARAM_SIZE: 100 * 1024, // 100KB max parameter size
  MAX_RESPONSE_SIZE: 1024 * 1024, // 1MB max response size
  MAX_CALL_DEPTH: 3, // Prevent infinite service call chains
};

/**
 * Validate a service call for compliance and security
 * @param {string} targetService - Service being called
 * @param {string} tool - Tool being executed
 * @param {object} params - Parameters being passed
 * @param {object} context - Request context
 * @param {string[]} registeredTools - Tools registered with the target service (dynamic whitelist)
 * @returns {object} Validation result with allowed flag and reasons
 */
function validateServiceCall(targetService, tool, params, context, registeredTools = []) {
  const violations = [];
  const warnings = [];

  // 1. Check if tool is in approved list (static OR dynamic from registered service)
  const isStaticApproved = APPROVED_TOOLS.includes(tool);
  const isDynamicApproved = registeredTools.includes(tool);

  if (!isStaticApproved && !isDynamicApproved) {
    violations.push({
      type: 'UNAPPROVED_TOOL',
      message: `Tool '${tool}' is not in the approved tools whitelist and not registered with service '${targetService}'`,
      severity: 'HIGH'
    });
  }
  
  // 2. Check for blocked patterns in tool name and parameters
  const paramString = JSON.stringify(params || {});
  for (const { pattern, desc, hint } of BLOCKED_PATTERNS_WITH_DESC) {
    const toolMatch = pattern.test(tool);
    const paramMatch = pattern.test(paramString);
    if (toolMatch || paramMatch) {
      // Find what actually matched for helpful error message
      const matchLocation = toolMatch ? `tool name "${tool}"` : 'parameters';
      const matchedText = toolMatch
        ? (tool.match(pattern) || [])[0]
        : (paramString.match(pattern) || [])[0];

      violations.push({
        type: 'BLOCKED_PATTERN',
        message: `Blocked: ${desc} detected in ${matchLocation}${matchedText ? ` ("${matchedText}")` : ''}. ${hint}`,
        pattern: pattern.toString(),
        severity: 'CRITICAL'
      });
    }
  }
  
  // 3. Check for blocked URLs in parameters (skip for SSRF-exempt internal services)
  const isTrustedInternal = isSSRFExemptService(targetService);
  const urlsInParams = extractUrls(paramString);
  for (const url of urlsInParams) {
    for (const blockedPattern of BLOCKED_URLS) {
      if (blockedPattern.test(url)) {
        // Allow localhost for trusted internal services
        const isLocalhostPattern = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
        if (isTrustedInternal && isLocalhostPattern) {
          // Skip - trusted internal service is allowed to use localhost
          continue;
        }
        violations.push({
          type: 'BLOCKED_URL',
          message: `Blocked URL detected in parameters: ${url}`,
          severity: 'CRITICAL'
        });
      }
    }
    // 2026-05-26 SSRF hardening: the BLOCKED_URLS regex above misses IP-encoding
    // bypasses (decimal/hex/octal host, e.g. http://2852039166 == 169.254.169.254).
    // validateUrlSafety normalizes the host to canonical IPv4 then checks
    // RFC1918 / loopback / link-local / metadata ranges by resolved value.
    if (!(isTrustedInternal && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url))) {
      const safety = validateUrlSafety(url);
      if (!safety.safe) {
        violations.push({
          type: 'BLOCKED_URL',
          message: `Blocked URL detected in parameters: ${url} (${safety.reason})`,
          severity: 'CRITICAL'
        });
      }
    }
  }
  
  // 4. Check parameter size limits
  if (paramString.length > LIMITS.MAX_PARAM_SIZE) {
    violations.push({
      type: 'SIZE_LIMIT',
      message: `Parameters exceed maximum size limit (${LIMITS.MAX_PARAM_SIZE} bytes)`,
      severity: 'MEDIUM'
    });
  }
  
  // 5. Check for call depth to prevent chains
  const callDepth = context?.callDepth || 0;
  if (callDepth >= LIMITS.MAX_CALL_DEPTH) {
    violations.push({
      type: 'CALL_DEPTH',
      message: `Service call depth exceeds maximum (${LIMITS.MAX_CALL_DEPTH})`,
      severity: 'HIGH'
    });
  }
  
  // 6. Check for sensitive data in parameters (warning only)
  if (containsSensitiveData(paramString)) {
    warnings.push({
      type: 'SENSITIVE_DATA',
      message: 'Parameters may contain sensitive information',
      severity: 'LOW'
    });
  }
  
  return {
    allowed: violations.length === 0,
    violations,
    warnings,
    riskLevel: calculateRiskLevel(violations, warnings),
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate response content for compliance
 * @param {any} response - Service response
 * @param {object} context - Request context
 * @returns {object} Validation result with filtered response
 */
function validateServiceResponse(response, context) {
  const violations = [];
  const warnings = [];
  let filteredResponse = response;
  
  try {
    const responseString = JSON.stringify(response);
    
    // 1. Check response size
    if (responseString.length > LIMITS.MAX_RESPONSE_SIZE) {
      violations.push({
        type: 'RESPONSE_SIZE',
        message: `Response exceeds maximum size limit (${LIMITS.MAX_RESPONSE_SIZE} bytes)`,
        severity: 'MEDIUM'
      });
    }
    
    // 2. Filter sensitive data from response
    filteredResponse = filterSensitiveDataFromResponse(response);
    
    // 3. Check for potentially harmful content
    if (containsHarmfulContent(responseString)) {
      warnings.push({
        type: 'HARMFUL_CONTENT',
        message: 'Response may contain harmful or inappropriate content',
        severity: 'MEDIUM'
      });
    }
    
  } catch (error) {
    violations.push({
      type: 'PROCESSING_ERROR',
      message: `Error processing response: ${error.message}`,
      severity: 'LOW'
    });
  }
  
  return {
    allowed: violations.length === 0,
    violations,
    warnings,
    filteredResponse,
    timestamp: new Date().toISOString()
  };
}

// Helper functions

function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  return text.match(urlRegex) || [];
}

function containsSensitiveData(text) {
  const sensitivePatterns = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card patterns
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email addresses
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone numbers
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/, // SSN patterns
    /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[a-zA-Z0-9+/]{8,}/i, // API keys/tokens
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(text));
}

function containsHarmfulContent(text) {
  // More specific patterns to avoid false positives on common words
  // "hackathon", "exploit opportunities", "dependency injection" should NOT match
  const harmfulPatterns = [
    // Specific hacking phrases (not "hackathon" or "life hack")
    /\b(hack\s+(into|the\s+system|password|account)|hacking\s+tool)\b/i,
    // Specific exploit phrases (not "exploit opportunities")
    /\b(exploit\s+(vulnerability|bug|flaw|weakness)|zero[- ]day\s+exploit)\b/i,
    // Malware terms are specific enough
    /\b(malware|trojan|rootkit|keylogger|ransomware)\b/i,
    // Specific phishing/scam phrases
    /\b(phishing\s+(attack|email|site)|scam\s+(website|email))\b/i,
    // Credential theft phrases
    /\b(steal\s+(password|credential|token|cookie)|credential\s+theft)\b/i,
  ];

  return harmfulPatterns.some(pattern => pattern.test(text));
}

function filterSensitiveDataFromResponse(response) {
  const wasObject = typeof response !== 'string';
  if (wasObject) {
    response = JSON.stringify(response);
  }

  // Remove common sensitive patterns
  const filtered = response
    .replace(/("(?:api[_-]?key|token|secret|password)"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"')
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD-REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL-REDACTED]');

  // Preserve input type: if input was object, return parsed object
  if (wasObject) {
    try { return JSON.parse(filtered); } catch { return filtered; }
  }
  return filtered;
}

function calculateRiskLevel(violations, warnings) {
  const criticalCount = violations.filter(v => v.severity === 'CRITICAL').length;
  const highCount = violations.filter(v => v.severity === 'HIGH').length;
  const mediumCount = violations.filter(v => v.severity === 'MEDIUM').length;
  
  if (criticalCount > 0) return 'CRITICAL';
  if (highCount > 0) return 'HIGH';
  if (mediumCount > 0) return 'MEDIUM';
  if (warnings.length > 0) return 'LOW';
  return 'SAFE';
}

module.exports = {
  validateServiceCall,
  validateServiceResponse,
  isSSRFExemptService,
  APPROVED_TOOLS,
  BLOCKED_PATTERNS,
  BLOCKED_PATTERNS_WITH_DESC,  // For debugging/logging with descriptions
  BLOCKED_URLS,
  SSRF_EXEMPT_SERVICES,
  TRUSTED_INTERNAL_SERVICES,  // Backward-compatible alias for SSRF_EXEMPT_SERVICES
  LIMITS
};