/**
 * CUID parameter validation with prefix-strip recovery for fetch-style IDs.
 *
 * Implements the GS12 (Parameter Normalisation at Transport Boundary) rule
 * for ID-format normalisation, with the design choice that ID-prefix mismatches
 * are rejected with corrective hints rather than auto-stripped — see spec doc
 * for the auto-strip-vs-reject rationale (when meaning is ambiguous, reject;
 * when unambiguous, auto-correct).
 *
 * Used by handlers that take CUID parameters to detect:
 *   - Right-type prefix (e.g. `pov-CUID` passed as `povId`) → suggest the bare CUID
 *   - Wrong-type prefix (e.g. `task-CUID` passed as `povId`) → flag the type mismatch;
 *     do NOT auto-correct because the underlying CUID is the wrong resource type
 *   - Genuinely invalid format (e.g. `notacuid123`) → generic validation error
 *
 * Companion: lib/mcp/server/tools/sdk-native-basic-tools.js (handleListTasks
 * was the original site of this validation; refactored to use this helper).
 */

const CUID_PATTERN = /^c[a-z0-9]{24}$/;

const RESOURCE_PREFIXES = {
  'pov-':      'POV',
  'task-':     'task',
  'template-': 'template',
  'service-':  'service',
  'agent-':    'agent',
  'phase-':    'phase',
  'stage-':    'stage'
};

/**
 * Maps parameter name → the resource-prefix it would carry if the caller
 * had pasted a fetch-style ID into this slot. Used for cross-type detection.
 */
const PARAM_EXPECTED_PREFIX = {
  povId:           'pov-',
  pov_id:          'pov-',
  taskId:          'task-',
  task_id:         'task-',
  agentTemplateId: 'template-',
  templateId:      'template-',
  template_id:     'template-',
  phaseId:         'phase-',
  phase_id:        'phase-',
  stageId:         'stage-',
  stage_id:        'stage-',
  serviceId:       'service-',
  service_id:      'service-'
};

/**
 * Validate a CUID parameter. Returns either { isValid: true } or
 * { isValid: false, errorResponse: <MCP envelope> }.
 *
 * @param {string|undefined|null} value - The parameter value to validate
 * @param {string} paramName - The parameter name (for error messages and prefix lookup)
 * @param {string} toolName - The consolidated tool name (e.g. 'project', 'perform')
 * @param {string} [actionName] - Optional sub-action name (e.g. 'task.list')
 * @returns {{isValid: true} | {isValid: false, errorResponse: object}}
 */
function validateCuidParam(value, paramName, toolName, actionName) {
  // Optional parameter — caller decides if presence is required
  if (value === undefined || value === null || value === '') {
    return { isValid: true };
  }

  if (typeof value !== 'string') {
    return {
      isValid: false,
      errorResponse: buildEnvelope(
        toolName,
        actionName,
        `❌ Error in ${displayCall(toolName, actionName)}: ${paramName} must be a string, got ${typeof value}.\n\n` +
        `🔍 Error Type: VALIDATION\n` +
        `💡 Suggestion: pass ${paramName} as a CUID string (25 chars, starts with "c").`,
        'VALIDATION',
        null,
        [`Pass ${paramName} as a string`, 'CUID format: 25 chars, starts with "c", lowercase alphanumeric']
      )
    };
  }

  // Already a valid bare CUID — pass through
  if (CUID_PATTERN.test(value)) {
    return { isValid: true };
  }

  // Detect what kind of malformed input we have
  const detectedPrefix = Object.keys(RESOURCE_PREFIXES).find(p => value.startsWith(p));
  const expectedPrefix = PARAM_EXPECTED_PREFIX[paramName];

  // CASE A: Recognised prefix AND remainder is a valid CUID
  if (detectedPrefix && CUID_PATTERN.test(value.slice(detectedPrefix.length))) {
    const baredCuid = value.slice(detectedPrefix.length);

    // CASE A1: Right-type prefix → strip and suggest
    if (!expectedPrefix || detectedPrefix === expectedPrefix) {
      return {
        isValid: false,
        errorResponse: buildEnvelope(
          toolName,
          actionName,
          `❌ Error in ${displayCall(toolName, actionName)}: ${paramName} "${value}" is not a CUID.\n\n` +
          `🔍 Error Type: VALIDATION\n` +
          `💡 Suggestion: this looks like a fetch-style ID. The matching CUID is "${baredCuid}".\n\n` +
          `🔧 Recovery: ${displayCall(toolName, actionName)}(${paramName}: "${baredCuid}")\n\n` +
          `(fetch returns "<type>-<cuid>" form; project / perform actions require bare CUIDs.)`,
          'VALIDATION',
          { [paramName]: baredCuid },
          [
            `Use bare CUID: ${displayCall(toolName, actionName)}(${paramName}: "${baredCuid}")`,
            'fetch returns prefixed IDs; bare CUIDs are required for project / perform actions'
          ]
        )
      };
    }

    // CASE A2: Wrong-type prefix → flag specifically; do NOT suggest the
    // bare CUID because it's the wrong resource type
    const detectedType = RESOURCE_PREFIXES[detectedPrefix];
    const expectedType = RESOURCE_PREFIXES[expectedPrefix];
    return {
      isValid: false,
      errorResponse: buildEnvelope(
        toolName,
        actionName,
        `❌ Error in ${displayCall(toolName, actionName)}: ${paramName} "${value}" looks like a ${detectedType} ID, not a ${expectedType} ID.\n\n` +
        `🔍 Error Type: VALIDATION\n` +
        `💡 Suggestion: the "${detectedPrefix}" prefix indicates a ${detectedType} resource. ${paramName} requires a ${expectedType} CUID. The bare CUID "${baredCuid}" appears to be a ${detectedType.toLowerCase()} ID; passing it as ${paramName} would look up a ${expectedType.toLowerCase()} with that ID and likely fail.\n\n` +
        `🔧 Recovery:\n` +
        recoveryStepsForType(expectedType, toolName).map(s => `   • ${s}`).join('\n'),
        'VALIDATION',
        null,
        recoveryStepsForType(expectedType, toolName)
      )
    };
  }

  // CASE B: Unrecognised prefix or no prefix and not a CUID → generic
  return {
    isValid: false,
    errorResponse: buildEnvelope(
      toolName,
      actionName,
      `❌ Error in ${displayCall(toolName, actionName)}: ${paramName} "${value}" is not a valid CUID.\n\n` +
      `🔍 Error Type: VALIDATION\n` +
      `💡 Suggestion: ${paramName} must be a 25-character CUID starting with "c" (e.g., "cmgalshus00bcyx39sfdutido").\n\n` +
      `🔧 Recovery:\n` +
      recoveryStepsForType(expectedPrefix ? RESOURCE_PREFIXES[expectedPrefix] : 'resource', toolName).map(s => `   • ${s}`).join('\n'),
      'VALIDATION',
      null,
      recoveryStepsForType(expectedPrefix ? RESOURCE_PREFIXES[expectedPrefix] : 'resource', toolName).concat([
        'CUID format: 25 chars, starts with "c", lowercase alphanumeric'
      ])
    )
  };
}

/**
 * Display the tool/action call form used in error messages.
 */
function displayCall(toolName, actionName) {
  return actionName ? `${toolName}(action: "${actionName}")` : toolName;
}

/**
 * Suggest discovery actions based on the resource type expected.
 */
function recoveryStepsForType(typeName, toolName) {
  const lowerType = typeName.toLowerCase();
  switch (lowerType) {
    case 'pov':
      return [
        'Find your POV: project(action: "pov.list")',
        'Search by POV name: project(action: "pov.details", pov_name: "...")'
      ];
    case 'task':
      return [
        'Find tasks for a POV: project(action: "task.list", povId: "...")',
        'Get task details: project(action: "task.context", taskId: "...")'
      ];
    case 'template':
      return [
        'List agent templates: template(action: "list")',
        'Get template details: template(action: "details", templateId: "...")'
      ];
    case 'service':
      return [
        'Discover services: services(action: "discover")',
        'List your services: registry(action: "list")'
      ];
    case 'phase':
    case 'stage':
      return [
        'Find phase/stage IDs: project(action: "pov.details", povId: "...")'
      ];
    default:
      return ['Use the appropriate list / discovery action to find valid IDs'];
  }
}

/**
 * Build a standard MCP error envelope with both content.text and _meta.
 */
function buildEnvelope(toolName, actionName, text, errorType, suggestedCorrection, nextSteps) {
  return {
    content: [{ type: 'text', text }],
    isError: true,
    _meta: {
      tool: toolName,
      ...(actionName && { action: actionName }),
      timestamp: new Date().toISOString(),
      sdkNative: true,
      errorType,
      // F-SWEEP-6 (2026-07-17): `recoverable: true` dropped — same Protocol-10 call as
      // F-SWEEP-4 (connector). A hardcoded boolean verdict our own gold-standard pattern
      // minted, read by no consumer, pinned by no test. The honest signals are already
      // here: errorType 'VALIDATION' (the fact — input-shaped, correctable by the caller),
      // suggestedCorrection (the exact fix when derivable), and nextSteps (the route).
      // Do not re-add; the pattern doc's example was corrected the same day.
      ...(suggestedCorrection && { suggestedCorrection }),
      nextSteps
    }
  };
}

/**
 * Normalize snake_case CUID alias parameters to their camelCase equivalents,
 * mutating `params` in place. Used by MCP dispatchers that accept both naming
 * forms but want downstream handlers to read only the camelCase form.
 *
 * Why this exists: `validateCuidParam` (above) checks both names independently
 * for format correctness, but doesn't alias-rename. Without normalization, a
 * downstream handler reading only `args.povId` would never see a caller-
 * supplied `pov_id` even though the dispatcher accepted it. The trap surfaced
 * empirically in the workflows bundle (2026-05-17) when a new pre-flight gate
 * was about to false-positive-reject snake_case callers — caught in review by
 * mcp-tool-architecture specialist (C8) before shipping. This helper closes
 * the class across all dispatchers.
 *
 * camelCase wins on collision: if both `povId` and `pov_id` are present,
 * `povId` is preserved as-is. This matches how the rest of the handler stack
 * resolves naming conflicts (caller's explicit camelCase intent takes priority).
 *
 * Closes BUG-REPORT-mcp-handler-snake-case-alias-parity-sweep-2026-05-17.
 *
 * @param {Object} params - The params object to normalize in place
 * @param {string[]} cuidParamNames - The CUID name list the dispatcher accepts
 *   (e.g. ['serviceId', 'service_id', 'povId', 'pov_id']). Both forms must be
 *   present in the list for the snake → camel mapping to fire.
 */
function normalizeCuidAliases(params, cuidParamNames) {
  for (const name of cuidParamNames) {
    if (!name.includes('_')) continue; // Skip already-camelCase names
    const camel = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (params[name] !== undefined && params[camel] === undefined) {
      params[camel] = params[name];
    }
  }
}

module.exports = {
  validateCuidParam,
  normalizeCuidAliases,
  CUID_PATTERN,
  RESOURCE_PREFIXES,
  PARAM_EXPECTED_PREFIX
};
