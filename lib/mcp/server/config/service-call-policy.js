/**
 * Service Call Policy for Anthropic Compliance
 * Validates cross-service calls to prevent proxy attacks and ensure content safety
 * Part of Priority 1 compliance implementation
 */

const { checkGitArguments, gitPinFor, namesPinnedRepoUrl, namesPinnedRepoFields, unpinnedFileReadPathRefusal } = require('./git-file-source-pin');
const { validateUrlSafety } = require('../../../utils/url-safety');
const { platformDriftManifest, withManifestSummarised, isPlatformDriftCall, PLATFORM_DRIFT_TOOL, PLATFORM_DRIFT_MANIFEST_MAX_BYTES } = require('./platform-drift-call');

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

  // Cloudflare Service (Code Mode — internal reverse-proxy). 'search' also covered by the generic list above.
  'search', 'execute',

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
    // 2026-11-16 (sec-ops F-NS1 side finding): `data:` alone matched inside every YAML `metadata:` key, so any manifest sent to any
    // service tool was refused while the same manifest as JSON passed — a false refusal, not a control. It now matches the SHAPE of a
    // data URI: `data:` + an optional type/subtype + optional `;params` + the mandatory comma (`data:,x`, `data:text/html,…`,
    // `data:image/png;base64,…`, `data:;base64,…`). Pinned both ways: test-security-invariants PD11 (hash) + PD-DATA.
    // BOUNDED (sec-ops HUB-PLATFORM-ONLY F1): every repetition has a fixed ceiling and `;` is outside the parameter class, so no
    // input backtracks more than a fixed amount (an unbounded `(?:;[^,\s]*)*` froze the hub on ~45 bytes). Whitespace — raw or as a
    // JSON escape (`\n`, `\f`, `\u000b`) — is allowed around the type, as browsers do (F2); a hyphen may appear in the type (mcp-hub
    // review S2). ACCEPTED RESIDUAL (the bounds that make it safe): more than 8 whitespace characters, more than 16 `;` parameters, or
    // one parameter over 200 characters is not matched here; services.call's L1 screen still catches `<script`, `javascript:`, `on…=`
    // and base64 payloads. Pinned: PD-DATA (both directions + the residual) + PD-REDOS (timing).
    pattern: /<script|javascript:|data:(?:\s|\\[nrtfv]|\\u00[01][0-9a-f]){0,8}(?:[a-z][a-z0-9.+-]*\/[a-z0-9.+-]+)?(?:\s|\\[nrtfv]|\\u00[01][0-9a-f]){0,8}(?:;[^,;\s]{0,200}){0,16}(?:\s|\\[nrtfv]|\\u00[01][0-9a-f]){0,8},/i,
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
  'cloudflare-service',  // Cloudflare Code Mode (reverse proxy to mcp.cloudflare.com; static API token; NOT trusted for JWT forwarding)
  'github-service',  // GitHub MCP, read-only held-file source (Caddy proxy injects a read-only fine-grained token; NOT trusted for JWT forwarding)
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
 * Config sources STEP 3 (slice P1; plan v2.1 §7). The key-named never-read files (a password file, key material) — ONE static
 * message for both gates, with none of the five characters BC71 escapes (& < > " ') and no caller text (F-T1).
 */
const NEVER_READ_KEY_FILE_MESSAGE = 'Blocked: a password file or key material (htpasswd, a name ending .key .pem .p12 .pfx .jks .keystore, an SSH identity file) is never read by a file-read call in a run - name configuration files only';
/** Review fix (sec-ops F1): a file-read path the unpinned gate cannot read as a plain path. Static, F-T1-safe. */
const UNJUDGEABLE_FILE_PATH_MESSAGE = 'Blocked: the path of this file-read call cannot be read as a plain path (a malformed or repeated percent-escape, or not text) - name the file by its plain repository path';
/** The route marker the admin "run workflow" web route puts on the context it BUILDS for this gate (service-caller.ts). */
const ADMIN_WORKFLOW_ROUTE = 'admin-workflow-run';
/**
 * Does the key-named class apply at the UNPINNED gate for this call? Yes for an agent run — THE one agent predicate
 * (`isAgentCaller`: the server-set `callingExecutionId`, written only by mcpService from the tool loop's execution id) — and for
 * the admin workflow route, whose context carries no execution id by construction, so it refuses these names for EVERY caller
 * (owner confirmed). No for a chat client calling its own file service. Read from the server-built context ONLY — never arguments.
 */
function keyNamesApplyAtUnpinnedGate(context) {
  if (!context || typeof context !== 'object') return false;
  if (context.route === ADMIN_WORKFLOW_ROUTE) return true;
  return require('../tools/hub/registrant-declaration').isAgentCaller(context) === true;
}

/**
 * Validate a service call for compliance and security
 * @param {string} targetService - Service being called
 * @param {string} tool - Tool being executed
 * @param {object} params - Parameters being passed
 * @param {object} context - Request context
 * @param {string[]} registeredTools - Tools registered with the target service (dynamic whitelist)
 * @param {string} [resolvedServiceName] - the RESOLVED service row's name (id-first resolution means `targetService` may be a
 *   registry id). Keys the Git file-source pin (held-k8s 1c); defaults to `targetService`.
 * @returns {object} Validation result with allowed flag and reasons
 */
function validateServiceCall(targetService, tool, params, context, registeredTools = [], resolvedServiceName = targetService, resolvedRow = null) {
  const violations = [];
  const warnings = [];

  // Config sources STEP 2 (sec-ops F2 / C6) — the ONE narrow exemption in this gate. ONLY when the server-built context carries
  // `platformPurpose === 'platform-drift'` AND the tool is exactly `compare_declared_fields`, the STRING VALUE of the top-level
  // `manifest` argument is left out of the text scans below (a YAML manifest is `metadata:`, `$(VAR)`, `${X}` — every one was
  // refused). `scanParams` carries `{ manifestSha256, manifestLength }` in its place; on EVERY other call it IS `params`. The
  // tool name, every other argument, and `manifest` on any other call are scanned as before; the exemption loosens no pattern (the `data:` alternative was narrowed separately, 2026-11-16). The pin
  // check (step 0) still reads the real `params`. Predicate + names: ./platform-drift-call.js. Pinned: test-security-invariants §PD.
  const driftManifest = platformDriftManifest(context, tool, params);
  const scanParams = withManifestSummarised(context, tool, params);

  // F-T1 (held-terraform step 2, STEP2-TEXT-DRAFT §5 item 6b): every message below reaches the agent through
  // sanitizeForResponse (BC71 — HTML-escapes & < > " ' and caps the JOINED violation text at 200 chars), so the STATIC text
  // carries none of those five characters (L-T1 read `&#039;ref&#039; is outside the file source&#039;s pin`). Caller-supplied
  // values (tool names, matched text, URLs) are still escaped — that is the escape's purpose, never remove it for this.
  // Pinned: test-security-invariants §F-T1.

  // 0. held-k8s 1c (SYNTHESIS v3, sec-ops S3): a Git FILE SOURCE is pinned to its repo, path rules, default branch and no
  // `sha` — the SAME function the held-bytes capture uses, so the two gates cannot disagree. Field name only, never the value.
  // WI-B10 (design §9.1 G): row-aware — the platform pin binds to the ownerless platform row only; any other row's pin is its
  // own declared gitPin. A caller that passes only the name keeps the pre-WI-B10 behaviour (the platform map).
  const gitPin = checkGitArguments(resolvedRow || resolvedServiceName, params);
  // Config-sources push 0 (sec-ops B-3): an UNPINNED call of the Git file-read tool still meets the never-held path predicate — the
  // pin branch above runs it only once a pin resolves. Same refusal names and the same static messages below.
  // Config sources STEP 3 P1 (plan §7): the key-named class (htpasswd, key material) applies at THIS gate only for an agent run or
  // the admin workflow route — `keyNamesApplyAtUnpinnedGate(context)`, read from the server-built context, never from arguments.
  const unpinnedPath = gitPin.ok && !gitPin.pinned ? unpinnedFileReadPathRefusal(tool, params, { keyNames: keyNamesApplyAtUnpinnedGate(context) }) : null;
  if (unpinnedPath && unpinnedPath.unjudgeable) {
    // Review fix (sec-ops F1): the path hides its name (a malformed percent-escape, more encoding rounds than the gate reads, or not
    // a string). Refused only for the callers the key-named class applies to. HIGH, not CRITICAL: a policy refusal of a malformed
    // argument, and an agent retrying it must not trip the CRITICAL-per-hour alert (the precedent of the platform-only compare tool, step 0c).
    violations.push({ type: 'UNJUDGEABLE_FILE_PATH', message: UNJUDGEABLE_FILE_PATH_MESSAGE, severity: 'HIGH' });
  } else if (unpinnedPath && unpinnedPath.keyNamed) {
    violations.push({ type: 'NEVER_READ_KEY_FILE', message: NEVER_READ_KEY_FILE_MESSAGE, severity: 'CRITICAL' });
  } else if (unpinnedPath) {
    // sec-ops PUSH0 S-3: this reaches ANY service exposing the file-read tool (a user's own GitHub MCP in chat too), not only a declared
    // Git file source — so its own type and neutral wording, never "the Git file source" the caller may not have. F-T1-safe text.
    violations.push({
      type: 'NEVER_READ_PATH',
      message: unpinnedPath.deviceInventory
        ? 'Blocked: a device inventory (hosts, groups, defaults) carries device credentials and is never read by a file-read call — name the device configuration files only'
        : 'Blocked: Terraform state, plan, variables and CLI credentials files are never read by a file-read call — current state comes from a read-only Terraform service; name .tf files only',
      severity: 'CRITICAL'
    });
  }
  if (!gitPin.ok && gitPin.keyNamed) {
    // STEP 3 P1: a key-named path on a PINNED source — the class's own type and wording (never the Terraform sentence).
    violations.push({ type: 'NEVER_READ_KEY_FILE', message: NEVER_READ_KEY_FILE_MESSAGE, severity: 'CRITICAL' });
  } else if (!gitPin.ok) {
    const gp = gitPin;
    violations.push({
      type: 'PINNED_ARGUMENT',
      message: gp.deviceInventory
        // held-network S1-H: static text with none of the five characters BC71 escapes (F-T1).
        ? 'Blocked: a device inventory (hosts, groups, defaults) carries device credentials and is never read through the Git file source — name the device configuration files only'
        : gp.pathRefusal
        ? 'Blocked: Terraform state, plan, variables and CLI credentials files are never read through the Git file source — current state comes from the read-only Terraform service; name .tf files only'
        // Config-sources push 0 (sec-ops N-1): no "default branch" — an absent ref is read as main, and a row may pin another branch.
        : `Blocked: ${gp.field} is outside the file source pin (read-only Git file source: the pinned repository, the main branch or the branch the service pins, a relative path, no sha)`,
      severity: 'CRITICAL'
    });
  }

  // 0b. held-terraform step 1, T-2: ONE route to pinned bytes. Any service that is NOT the Git file source and whose arguments
  // name a pinned repository (by URL, or as owner/repo fields) is refused — a second route is unpinned, uncaptured and unheld.
  // Field-free message (the URL is caller-chosen). A TRIPWIRE, not a boundary — see git-file-source-pin.js. Measured 0 such calls
  // in production before this shipped.
  if (!gitPinFor(resolvedServiceName) && (namesPinnedRepoUrl(JSON.stringify(scanParams || {})) || namesPinnedRepoFields(params))) {
    violations.push({
      type: 'PINNED_SOURCE_BYPASS',
      message: 'Blocked: this repository is a pinned Git file source — read its files with services call → github-service → get_file_contents, never through another service',
      severity: 'CRITICAL'
    });
  }

  // 0c. 2026-11-16 (owner decision on register CONFIG-SOURCES-K8S-COMPARE-AGENT-CALL, sec-ops C6): the declared-field compare tool is
  // the PLATFORM's (it computes the Git-vs-live drift fact; an agent reads that fact and transcribes it). A call of it WITHOUT the
  // platform purpose — an agent in a run, a chat client, a workflow step — is refused here, on every route that reaches this gate.
  // Until now only an accident refused it (the `data:` pattern above matched `metadata:`; JSON passed). F-T1-safe static text.
  if (tool === PLATFORM_DRIFT_TOOL && !isPlatformDriftCall(context, tool)) {
    violations.push({
      type: 'PLATFORM_ONLY_TOOL',
      message: `Blocked: ${PLATFORM_DRIFT_TOOL} is called only by the platform, which computes the Git-vs-live drift fact from it — read that fact instead`,
      // HIGH like UNAPPROVED_TOOL (mcp-hub review N1): a policy refusal of a known tool, not an attack signature — and CRITICAL counts
      // toward compliance-monitor's CRITICAL-per-hour alert, which an agent retrying this call would trip.
      severity: 'HIGH'
    });
  }

  // 1. Check if tool is in approved list (static OR dynamic from registered service)
  const isStaticApproved = APPROVED_TOOLS.includes(tool);
  const isDynamicApproved = registeredTools.includes(tool);

  if (!isStaticApproved && !isDynamicApproved) {
    violations.push({
      type: 'UNAPPROVED_TOOL',
      message: `Tool \`${tool}\` is not in the approved tools whitelist and not registered with service \`${targetService}\``,
      severity: 'HIGH'
    });
  }
  
  // 2. Check for blocked patterns in tool name and parameters
  const paramString = JSON.stringify(scanParams || {});
  for (const { pattern, desc, hint } of BLOCKED_PATTERNS_WITH_DESC) {
    const toolMatch = pattern.test(tool);
    const paramMatch = pattern.test(paramString);
    if (toolMatch || paramMatch) {
      // Find what actually matched for helpful error message
      const matchLocation = toolMatch ? `tool name \`${tool}\`` : 'parameters';
      const matchedText = toolMatch
        ? (tool.match(pattern) || [])[0]
        : (paramString.match(pattern) || [])[0];

      violations.push({
        type: 'BLOCKED_PATTERN',
        message: `Blocked: ${desc} detected in ${matchLocation}${matchedText ? ` (\`${matchedText}\`)` : ''}. ${hint}`,
        pattern: pattern.toString(),
        severity: 'CRITICAL'
      });
    }
  }
  
  // 3. Check for blocked URLs in parameters (skip for SSRF-exempt internal services)
  const isSsrfExempt = isSSRFExemptService(targetService);
  const urlsInParams = extractUrls(paramString);
  for (const url of urlsInParams) {
    for (const blockedPattern of BLOCKED_URLS) {
      if (blockedPattern.test(url)) {
        // Allow localhost for trusted internal services
        const isLocalhostPattern = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
        if (isSsrfExempt && isLocalhostPattern) {
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
    if (!(isSsrfExempt && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url))) {
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
  // 4b. The exempt manifest is not in `paramString`, so it has its OWN limit — the compare service's (UTF-8 bytes).
  if (driftManifest !== null && Buffer.byteLength(driftManifest, 'utf8') > PLATFORM_DRIFT_MANIFEST_MAX_BYTES) {
    violations.push({
      type: 'SIZE_LIMIT',
      message: `Manifest exceeds the compare limit (${PLATFORM_DRIFT_MANIFEST_MAX_BYTES} bytes)`,
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
    timestamp: new Date().toISOString(),
    // Config-sources push 0 (sec-ops B-1): on a pinned Git read the arguments the call must FORWARD and ECHO — exactly the object
    // the pin checked (an absent ref became `ref: 'main'`). Null when the call is not a pinned Git read. The handler forwards these.
    gitArguments: gitPin.ok && gitPin.pinned ? gitPin.args : null,
    refDefaulted: !!(gitPin.ok && gitPin.pinned && gitPin.refDefaulted),
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
  LIMITS,
  // Config sources STEP 3 P1 (plan §7)
  NEVER_READ_KEY_FILE_MESSAGE, UNJUDGEABLE_FILE_PATH_MESSAGE, ADMIN_WORKFLOW_ROUTE, keyNamesApplyAtUnpinnedGate,
};