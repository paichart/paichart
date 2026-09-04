/**
 * Orchestration Engine - Shared Core
 *
 * Pure JavaScript implementation of workflow orchestration logic.
 * Used by both:
 * - mcpOrchestrationHandler.ts (TypeScript, Next.js API routes)
 * - workflow-tools-handler.js (JavaScript, MCP server)
 *
 * This module provides ONLY the execution logic with NO external dependencies.
 * Callers provide their own service calling functions via dependency injection.
 *
 * @see /.claude/knowledge/patterns/facade-extraction-pattern.md
 * @see implementation-plan-v4.2-focused.md
 */

const { mcpLogger, createAdapter } = require('../../../js-logger');
const log = createAdapter(mcpLogger.child({ component: 'orchestration-engine' }));

// Wave B H2 fix (2026-05-23, Hub sec-ops Phase 3): cross-step prototype-pollution
// defense. The L1 dispatch boundary deep-strips services.workflow.execute.steps[]
// .arguments — but step.N's output is returned from an attacker-controlled
// downstream service. When step.N+1 references {{step.N.output.evil}}, the
// resolved value bypasses L1 entirely. Deep-stripping after variable resolution
// closes this gap.
//
// INLINED helper (not imported) — this engine file is documented as having NO
// external dependencies per facade-extraction-pattern. KEEP IN SYNC with
// lib/utils/sanitize-keys.ts deepStripDangerousKeys + deepStripArray.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_STRIP_DEPTH = 20;
function deepStripDangerousKeys(obj, _depth = 0) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (_depth > MAX_STRIP_DEPTH) return obj;
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const val = obj[key];
    if (val != null && typeof val === 'object') {
      if (Array.isArray(val)) {
        clean[key] = deepStripArray(val, _depth + 1);
      } else {
        clean[key] = deepStripDangerousKeys(val, _depth + 1);
      }
    } else {
      clean[key] = val;
    }
  }
  return clean;
}
function deepStripArray(arr, _depth) {
  if (_depth > MAX_STRIP_DEPTH) return arr;
  return arr.map((el) => {
    if (el == null || typeof el !== 'object') return el;
    if (Array.isArray(el)) return deepStripArray(el, _depth + 1);
    return deepStripDangerousKeys(el, _depth + 1);
  });
}

/**
 * Configuration for the orchestration engine
 * @typedef {Object} EngineConfig
 * @property {number} maxConcurrent - Max parallel service calls (default: 5)
 * @property {number} defaultTimeout - Default step timeout in ms (default: 30000)
 */

/**
 * Result from a single service call
 * @typedef {Object} StepResult
 * @property {boolean} success - Whether the step succeeded
 * @property {*} data - Result data from the service
 * @property {string} [error] - Error message if failed
 * @property {string} [errorType] - Error classification (timeout, network, service_error, etc.)
 * @property {boolean} [retryable] - Whether this error type is retryable
 * @property {number} [attempts] - Number of retry attempts made
 * @property {number} executionTime - Execution time in ms
 * @property {string} service - Service name
 * @property {string} tool - Tool name
 * @property {number} stepIndex - Step index in workflow
 */

/**
 * Workflow step definition
 * @typedef {Object} WorkflowStep
 * @property {string} service - Service name
 * @property {string} tool - Tool name
 * @property {Object} arguments - Tool arguments
 * @property {number[]} [dependsOn] - Indices of steps this depends on
 * @property {number} [timeout] - Step-specific timeout
 */

/**
 * Orchestration parameters
 * @typedef {Object} OrchestrationParams
 * @property {WorkflowStep[]} steps - Workflow steps
 * @property {'sequential'|'parallel'|'conditional'} executionMode - Execution mode
 * @property {'stop'|'continue'|'rollback'} failureStrategy - What to do on failure
 * @property {number} timeout - Global timeout in ms
 */

/**
 * Orchestration Engine
 *
 * Stateless execution engine that orchestrates multi-service workflows.
 * All state is managed externally by the caller.
 */
class OrchestrationEngine {
  /**
   * @param {EngineConfig} [config]
   */
  constructor(config = {}) {
    this.maxConcurrent = config.maxConcurrent || 5;
    this.defaultTimeout = config.defaultTimeout || 30000;
  }

  // ============================================
  // Variable Resolution
  // ============================================

  /**
   * Resolve variable references in step arguments
   *
   * Supports:
   * - {{step.N.output}} - Entire output of step N
   * - {{step.N.output.field}} - Specific field from step N output
   * - {{step.N.output.array[0].field}} - Array access with nested field
   * - {{step.N.data}} - Alias for output
   *
   * @param {Object} args - Arguments with potential variable references
   * @param {Object} stepOutputs - Map of step index to output data
   * @returns {Object} Resolved arguments
   */
  resolveVariables(args, stepOutputs, totalSteps) {
    if (!args || typeof args !== 'object') return args;
    if (Array.isArray(args)) {
      return args.map(item => this.resolveVariables(item, stepOutputs, totalSteps));
    }

    const resolved = {};
    for (const [key, value] of Object.entries(args)) {
      // Wave B H2 defense-in-depth: drop dangerous keys at the boundary too
      // (the resolved value is also deep-stripped below).
      if (DANGEROUS_KEYS.has(key)) continue;
      if (typeof value === 'string' && value.includes('{{step.')) {
        const resolvedValue = this.resolveVariableString(value, stepOutputs, totalSteps);
        // Wave B H2 fix: step output may come from an attacker-controlled
        // downstream service. Deep-strip when the resolved value is an
        // object/array — primitives pass through unchanged.
        if (resolvedValue && typeof resolvedValue === 'object') {
          if (Array.isArray(resolvedValue)) {
            resolved[key] = deepStripArray(resolvedValue, 0);
          } else {
            resolved[key] = deepStripDangerousKeys(resolvedValue, 0);
          }
        } else {
          resolved[key] = resolvedValue;
        }
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveVariables(value, stepOutputs, totalSteps);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /**
   * Check if resolved arguments contain variable errors
   * @param {Object} args - Resolved arguments
   * @returns {{hasError: boolean, message?: string}}
   */
  checkForVariableErrors(args) {
    if (!args || typeof args !== 'object') return { hasError: false };

    for (const [key, value] of Object.entries(args)) {
      // Check for error marker object
      if (value && typeof value === 'object' && value.__variableError) {
        return { hasError: true, message: value.message };
      }
      // Check for error string in embedded variables
      if (typeof value === 'string' && value.includes('[ERROR: step.')) {
        const match = value.match(/\[ERROR: (step\.\d+ does not exist)\]/);
        return { hasError: true, message: `Variable reference error: ${match ? match[1] : 'invalid step reference'}` };
      }
      // Recursively check nested objects
      if (value && typeof value === 'object' && !value.__variableError) {
        const nested = this.checkForVariableErrors(value);
        if (nested.hasError) return nested;
      }
    }
    return { hasError: false };
  }

  /**
   * Resolve a single variable reference string
   * @param {string} str - String potentially containing {{step.N.path}}
   * @param {Object} stepOutputs - Map of step index to output
   * @param {number} [totalSteps] - Total number of steps in workflow (for validation)
   * @returns {*} Resolved value
   */
  resolveVariableString(str, stepOutputs, totalSteps) {
    // Pattern: {{step.N.path.to.value}} or {{step.N.output.field[0].nested}}
    const pattern = /\{\{step\.(\d+)\.([^}]+)\}\}/g;

    // If entire string is a single variable, return the actual value (not stringified)
    const fullMatch = str.match(/^\{\{step\.(\d+)\.([^}]+)\}\}$/);
    if (fullMatch) {
      const stepIndex = parseInt(fullMatch[1], 10);
      const path = fullMatch[2];
      const stepResult = stepOutputs[stepIndex];

      // Improved error handling: detect invalid step references
      if (!stepResult) {
        const availableSteps = Object.keys(stepOutputs).map(k => `step.${k}`).join(', ');
        const totalInfo = totalSteps !== undefined ? ` (workflow has ${totalSteps} steps)` : '';
        log.warn(`[Variable Resolution] step.${stepIndex} does not exist${totalInfo}. Available: ${availableSteps || 'none'}`);
        // Return a clear error marker instead of the unresolved string
        // This prevents confusing downstream errors like "POV not found"
        return { __variableError: true, message: `Variable reference error: step.${stepIndex} does not exist${totalInfo}` };
      }

      // Normalize: step.N.output.x or step.N.data.x strip the prefix, then navigate from result.data
      const normalizedPath = path.replace(/^(output|data)(?:\.|$)/, '');
      const data = stepResult.data || stepResult.output || stepResult;

      log.debug(`[Variable Resolution] path="${path}" → normalized="${normalizedPath}" dataKeys=${Object.keys(data || {})}`);

      if (!normalizedPath) return data;
      const resolved = this.navigatePath(data, normalizedPath);
      log.debug(`[Variable Resolution] navigatePath("${normalizedPath}") → ${resolved === undefined ? 'undefined' : typeof resolved}`);
      return resolved;
    }

    // For strings with embedded variables, replace and stringify
    return str.replace(pattern, (match, stepIndex, path) => {
      const idx = parseInt(stepIndex, 10);
      const stepResult = stepOutputs[idx];
      if (!stepResult) {
        log.warn(`[Variable Resolution] Embedded variable step.${idx} does not exist`);
        return `[ERROR: step.${idx} does not exist]`;
      }

      const normalizedPath = path.replace(/^(output|data)(?:\.|$)/, '');
      const data = stepResult.data || stepResult.output || stepResult;

      if (!normalizedPath) {
        return typeof data === 'object' ? JSON.stringify(data) : String(data);
      }

      const value = this.navigatePath(data, normalizedPath);
      if (value === undefined) return match;
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }

  /**
   * Navigate a dot-notation path with array access
   * E.g., "povs[0].id" navigates to obj.povs[0].id
   *
   * @param {*} obj - Object to navigate
   * @param {string} path - Dot-notation path
   * @returns {*} Value at path or undefined
   */
  navigatePath(obj, path) {
    if (!path) return obj;

    // Dangerous property names that could leak prototypes or internals
    const DANGEROUS_PARTS = new Set([
      '__proto__', 'prototype', 'constructor',
      '__defineGetter__', '__defineSetter__',
      '__lookupGetter__', '__lookupSetter__',
    ]);

    // Split by . and [] to handle both object and array access
    const parts = path.split(/\.|\[|\]/).filter(Boolean);
    let current = obj;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      if (DANGEROUS_PARTS.has(part)) return undefined;
      current = current[part];
    }

    return current;
  }

  // ============================================
  // Retry Logic
  // ============================================

  /**
   * Execute a step with retry support
   *
   * Retries only when:
   * - Step has retries > 0
   * - Result has retryable === true (strict opt-in)
   * - Global deadline has enough time for delay + estimated execution
   * - Total retry budget not exhausted
   *
   * Uses exponential backoff: retryDelay * 2^attempt
   *
   * @param {WorkflowStep} step - Step to execute
   * @param {Function} callService - Service caller function
   * @param {Object} context - Execution context
   * @param {Object} retryState - Shared retry budget state
   * @param {number} retryState.totalRetries - Total retries used so far
   * @param {number} retryState.maxTotalRetries - Maximum total retries allowed
   * @returns {Promise<StepResult>} Final step result (with attempts count)
   */
  async executeWithRetry(step, callService, context, retryState = {}) {
    const maxRetries = step.retries || 0;
    const baseDelay = step.retryDelay || 2000;
    const globalDeadline = context?._globalDeadline;
    const maxTotalRetries = retryState.maxTotalRetries || 10;

    let lastResult = await callService(step, context);
    let attempt = 0;

    while (
      attempt < maxRetries &&
      !lastResult.success &&
      lastResult.retryable === true &&
      (retryState.totalRetries || 0) < maxTotalRetries
    ) {
      attempt++;
      const delay = baseDelay * Math.pow(2, attempt - 1);

      // Check global deadline with execution time buffer
      const estimatedStepTime = step.timeout || 30000;
      if (globalDeadline && (Date.now() + delay + estimatedStepTime) >= globalDeadline) {
        log.info({
          step: step.service + '/' + step.tool,
          attempt,
          reason: 'global_timeout_approaching'
        }, 'Skipping retry - insufficient time for delay + execution');
        break;
      }

      log.info({
        step: step.service + '/' + step.tool,
        attempt,
        maxRetries,
        delay,
        errorType: lastResult.errorType
      }, 'Retrying step after error');

      await new Promise(resolve => setTimeout(resolve, delay));
      lastResult = await callService(step, context);

      // Track global retry budget
      retryState.totalRetries = (retryState.totalRetries || 0) + 1;
    }

    // Add attempts count to result
    lastResult.attempts = attempt + 1;
    return lastResult;
  }

  // ============================================
  // Dependency Analysis
  // ============================================

  /**
   * Analyze step dependencies to determine execution order
   *
   * @param {WorkflowStep[]} steps - All workflow steps
   * @returns {{independent: WorkflowStep[], dependent: Array<{step: WorkflowStep, originalIndex: number}>}}
   */
  analyzeDependencies(steps) {
    const independent = [];
    const dependent = [];

    steps.forEach((step, index) => {
      if (!step.dependsOn || step.dependsOn.length === 0) {
        independent.push({ step, originalIndex: index });
      } else {
        dependent.push({ step, originalIndex: index });
      }
    });

    // Sort dependent steps by their dependencies (topological-ish)
    dependent.sort((a, b) => {
      const aMaxDep = Math.max(...(a.step.dependsOn || [0]));
      const bMaxDep = Math.max(...(b.step.dependsOn || [0]));
      return aMaxDep - bMaxDep;
    });

    return { independent, dependent };
  }

  /**
   * Detect circular dependencies in workflow steps
   *
   * @param {WorkflowStep[]} steps - Workflow steps
   * @returns {boolean} True if circular dependency exists
   */
  detectCircularDependencies(steps) {
    const visited = new Set();
    const recStack = new Set();

    const hasCycle = (index) => {
      if (recStack.has(index)) return true;
      if (visited.has(index)) return false;

      visited.add(index);
      recStack.add(index);

      const step = steps[index];
      if (step?.dependsOn) {
        for (const dep of step.dependsOn) {
          if (dep >= 0 && dep < steps.length && hasCycle(dep)) {
            return true;
          }
        }
      }

      recStack.delete(index);
      return false;
    };

    for (let i = 0; i < steps.length; i++) {
      if (hasCycle(i)) return true;
    }

    return false;
  }

  // ============================================
  // Execution Modes
  // ============================================

  /**
   * Execute workflow steps sequentially with variable chaining
   *
   * @param {OrchestrationParams} params - Orchestration parameters
   * @param {Function} callService - Async function(step, context) => StepResult
   * @param {Object} context - Execution context passed to callService
   * @param {Function} [onStepComplete] - Optional callback after each step
   * @returns {Promise<{results: StepResult[], error?: string, failedStep?: number}>}
   */
  async executeSequential(params, callService, context, onStepComplete) {
    const results = [];
    const stepOutputs = {};
    const totalSteps = params.steps.length;
    const retryState = { totalRetries: 0, maxTotalRetries: params.maxTotalRetries || 10 };

    for (let i = 0; i < params.steps.length; i++) {
      const step = params.steps[i];

      // Resolve variables from previous steps
      const resolvedArgs = this.resolveVariables(step.arguments || {}, stepOutputs, totalSteps);

      // Check for variable resolution errors before executing
      const varError = this.checkForVariableErrors(resolvedArgs);
      if (varError.hasError) {
        const errorResult = {
          success: false,
          error: varError.message,
          errorType: 'variable_error',
          retryable: false,
          service: step.service,
          tool: step.tool,
          stepIndex: i,
          executionTime: 0
        };
        results.push(errorResult);

        if (params.failureStrategy !== 'continue') {
          // 'stop' and 'rollback' both halt on first failure
          return { results, error: varError.message, failedStep: i };
        }
        // 'continue' keeps going
        stepOutputs[i] = errorResult;
        if (onStepComplete) await onStepComplete(errorResult, i);
        continue;
      }

      const resolvedStep = { ...step, arguments: resolvedArgs };

      // Execute step (with retry support)
      const result = await this.executeWithRetry(resolvedStep, callService, context, retryState);
      result.stepIndex = i;

      // Store output for variable resolution
      stepOutputs[i] = result;
      results.push(result);

      // Callback for tracking
      if (onStepComplete) {
        await onStepComplete(result, i);
      }

      // Handle failure
      if (!result.success) {
        if (params.failureStrategy !== 'continue') {
          // 'stop' and 'rollback' both halt on first failure
          return { results, error: result.error, failedStep: i };
        }
        // 'continue' keeps going
      }
    }

    return { results };
  }

  /**
   * Execute steps in parallel with dependency handling
   *
   * Independent steps run in parallel batches.
   * Dependent steps run after their dependencies complete.
   *
   * @param {OrchestrationParams} params - Orchestration parameters
   * @param {Function} callService - Async function(step, context) => StepResult
   * @param {Object} context - Execution context
   * @param {Function} [onStepComplete] - Optional callback
   * @returns {Promise<{results: StepResult[], error?: string}>}
   */
  async executeParallel(params, callService, context, onStepComplete) {
    const { independent, dependent } = this.analyzeDependencies(params.steps);
    const results = new Array(params.steps.length);
    const stepOutputs = {};
    const retryState = { totalRetries: 0, maxTotalRetries: params.maxTotalRetries || 10 };

    // Execute independent steps in batches
    let hasFailed = false;
    for (let i = 0; i < independent.length; i += this.maxConcurrent) {
      const batch = independent.slice(i, i + this.maxConcurrent);
      const batchPromises = batch.map(async ({ step, originalIndex }) => {
        const result = await this.executeWithRetry(step, callService, context, retryState);
        result.stepIndex = originalIndex;
        return { result, originalIndex };
      });

      const batchResults = await Promise.all(batchPromises);

      for (const { result, originalIndex } of batchResults) {
        results[originalIndex] = result;
        stepOutputs[originalIndex] = result;
        if (onStepComplete) {
          await onStepComplete(result, originalIndex);
        }
        if (!result.success) hasFailed = true;
      }

      // Check failure strategy after each batch completes
      if (hasFailed && params.failureStrategy !== 'continue') {
        const failedResult = batchResults.find(br => !br.result.success);
        return {
          results: results.filter(Boolean),
          error: failedResult?.result.error,
          failedStep: failedResult?.originalIndex
        };
      }
    }

    // Execute dependent steps sequentially (respecting dependencies)
    for (const { step, originalIndex } of dependent) {
      // Resolve variables from completed steps
      const resolvedArgs = this.resolveVariables(step.arguments || {}, stepOutputs, params.steps.length);

      // Check for variable resolution errors
      const varError = this.checkForVariableErrors(resolvedArgs);
      if (varError.hasError) {
        const errorResult = {
          success: false,
          error: varError.message,
          errorType: 'variable_error',
          retryable: false,
          service: step.service,
          tool: step.tool,
          stepIndex: originalIndex,
          executionTime: 0
        };
        results[originalIndex] = errorResult;
        stepOutputs[originalIndex] = errorResult;
        if (onStepComplete) await onStepComplete(errorResult, originalIndex);

        if (params.failureStrategy !== 'continue') {
          return { results: results.filter(Boolean), error: varError.message, failedStep: originalIndex };
        }
        continue;
      }

      const resolvedStep = { ...step, arguments: resolvedArgs };

      const result = await this.executeWithRetry(resolvedStep, callService, context, retryState);
      result.stepIndex = originalIndex;

      results[originalIndex] = result;
      stepOutputs[originalIndex] = result;

      if (onStepComplete) {
        await onStepComplete(result, originalIndex);
      }

      if (!result.success && params.failureStrategy !== 'continue') {
        return { results: results.filter(Boolean), error: result.error, failedStep: originalIndex };
      }
    }

    // Filter out any undefined entries and return
    return { results: results.filter(Boolean) };
  }

  /**
   * Execute conditional workflow
   *
   * Step 0 = condition check
   * Step 1 = "then" branch (executed if step 0 succeeds)
   * Step 2 = "else" branch (executed if step 0 fails)
   *
   * @param {OrchestrationParams} params - Orchestration parameters
   * @param {Function} callService - Async function(step, context) => StepResult
   * @param {Object} context - Execution context
   * @param {Function} [onStepComplete] - Optional callback
   * @returns {Promise<{results: StepResult[], branch: 'then'|'else'|null}>}
   */
  async executeConditional(params, callService, context, onStepComplete) {
    if (params.steps.length === 0) {
      return { results: [], branch: null };
    }

    const stepOutputs = {};
    const retryState = { totalRetries: 0, maxTotalRetries: params.maxTotalRetries || 10 };

    // Execute condition step
    const conditionResult = await this.executeWithRetry(params.steps[0], callService, context, retryState);
    conditionResult.stepIndex = 0;
    stepOutputs[0] = conditionResult;

    const results = [conditionResult];

    if (onStepComplete) {
      await onStepComplete(conditionResult, 0);
    }

    // Determine branch
    const conditionPassed = conditionResult.success && conditionResult.data;
    let branch = null;

    if (conditionPassed && params.steps.length > 1) {
      // Execute "then" branch (step 1)
      branch = 'then';
      const resolvedArgs = this.resolveVariables(
        params.steps[1].arguments || {},
        stepOutputs,
        params.steps.length
      );

      // Check for variable resolution errors
      const varError = this.checkForVariableErrors(resolvedArgs);
      if (varError.hasError) {
        const errorResult = {
          success: false,
          error: varError.message,
          errorType: 'variable_error',
          retryable: false,
          service: params.steps[1].service,
          tool: params.steps[1].tool,
          stepIndex: 1,
          executionTime: 0
        };
        results.push(errorResult);
        if (onStepComplete) await onStepComplete(errorResult, 1);
        return { results, branch };
      }

      const thenResult = await this.executeWithRetry(
        { ...params.steps[1], arguments: resolvedArgs },
        callService, context, retryState
      );
      thenResult.stepIndex = 1;
      results.push(thenResult);

      if (onStepComplete) {
        await onStepComplete(thenResult, 1);
      }
    } else if (!conditionPassed && params.steps.length > 2) {
      // Execute "else" branch (step 2)
      branch = 'else';
      const elseResult = await this.executeWithRetry(params.steps[2], callService, context, retryState);
      elseResult.stepIndex = 2;
      results.push(elseResult);

      if (onStepComplete) {
        await onStepComplete(elseResult, 2);
      }
    }

    return { results, branch };
  }

  // ============================================
  // Main Execution Entry Point
  // ============================================

  /**
   * Execute a workflow based on its execution mode
   *
   * @param {OrchestrationParams} params - Orchestration parameters
   * @param {Function} callService - Async function(step, context) => StepResult
   * @param {Object} context - Execution context
   * @param {Object} [options] - Additional options
   * @param {Function} [options.onStepComplete] - Callback after each step
   * @returns {Promise<{success: boolean, results: StepResult[], error?: string, failedStep?: number, branch?: string}>}
   *
   * Post-BUG-HUB-001 invariant (2026-05-22): when `success === false`, `error`
   * is ALWAYS a non-empty string — either the inner executor's outer error, or
   * an aggregated message synthesised from the first failed step. When
   * `success === true`, `error` is undefined. Callers persisting `error` to
   * MCPWorkflowExecution.error can rely on this contract.
   */
  async execute(params, callService, context, options = {}) {
    // Validate
    if (!params.steps || params.steps.length === 0) {
      return { success: false, results: [], error: 'No steps provided' };
    }

    if (params.steps.length > 20) {
      return { success: false, results: [], error: 'Maximum 20 steps per workflow' };
    }

    // Check for circular dependencies
    if (this.detectCircularDependencies(params.steps)) {
      return { success: false, results: [], error: 'Circular dependency detected' };
    }

    const { onStepComplete } = options;
    let result;

    switch (params.executionMode) {
      case 'parallel':
        result = await this.executeParallel(params, callService, context, onStepComplete);
        break;
      case 'conditional':
        result = await this.executeConditional(params, callService, context, onStepComplete);
        break;
      default: // 'sequential'
        result = await this.executeSequential(params, callService, context, onStepComplete);
    }

    const allSucceeded = result.results.every(r => r.success);

    // BUG-HUB-001 fix (2026-05-22): aggregate first-failed-step diagnostic when
    // inner executor didn't propagate one. Covers two paths the inner executors
    // don't aggregate:
    //   1. failureStrategy: 'continue' — sequential/parallel loop completes
    //      despite step failures; result.error left undefined, but per-step
    //      errors live in result.results[i].error
    //   2. executionMode: 'conditional' — return shape is { results, branch }
    //      with no error field, even when a branch step fails
    //
    // Per Round 1 workflow-orchestration-specialist findings I1+I2: use
    // result.results[i].stepIndex (the workflow-definition index, populated by
    // each executor at lines 474/531/616/626) rather than results array
    // position — required for conditional ELSE-branch failures (array index
    // would be 1 but workflow-definition index is 2).
    //
    // Per Round 1 mcp-hub-specialist I2: leading text MUST be the underlying
    // error message, not the step context. lib/mcp/server/utils/execution-
    // analytics.js:984-995 categorizeError() does substring matching on the
    // leading characters; service/tool names in the leading position would
    // cause category drift (e.g., a service named "token-validator" would
    // shift category to 'validation' regardless of actual error).
    //
    // Post-aggregation invariant: when success === false, error is ALWAYS a
    // non-empty string. When success === true, error is undefined.
    let aggregatedError = result.error;
    let aggregatedFailedStep = result.failedStep;
    if (!allSucceeded && !aggregatedError) {
      const firstFailedArrayIndex = result.results.findIndex(r => !r.success);
      if (firstFailedArrayIndex !== -1) {
        const failedStep = result.results[firstFailedArrayIndex];
        const stepCount = result.results.filter(r => !r.success).length;
        // Workflow-definition step index (preferred), falls back to array position.
        const stepIdx = failedStep.stepIndex ?? firstFailedArrayIndex;
        const ctx = `(step ${stepIdx}: ${failedStep.service || '?'}.${failedStep.tool || '?'})`;
        const stepErr = failedStep.error || 'no error message';
        aggregatedError = stepCount > 1
          ? `${stepErr} ${ctx} (+ ${stepCount - 1} more step failure${stepCount > 2 ? 's' : ''})`
          : `${stepErr} ${ctx}`;
        if (aggregatedFailedStep == null) {
          aggregatedFailedStep = stepIdx;
        }
      }
    }

    return {
      success: allSucceeded && !result.error,
      results: result.results,
      error: aggregatedError,
      failedStep: aggregatedFailedStep,
      branch: result.branch
    };
  }

  // ============================================
  // Validation Helpers
  // ============================================

  /**
   * Validate orchestration parameters
   *
   * Engine-side invariants Zod cannot express (per Phase 4 commission,
   * 2026-05-16 — workflow-orchestration-specialist surfaced these as the
   * "schemas don't cover" gap; all enforced here):
   *
   *   (1) Variable chaining — `{{step.N.output.field}}` references. Resolved
   *       at runtime in `resolveVariables()` / `resolveVariableString()`;
   *       behavior split by failure mode (verified 2026-05-17, investigation
   *       closed):
   *
   *         MISSING STEP (`{{step.99.X}}` when step 99 doesn't exist) — LOUD.
   *           Returns `{ __variableError: true, message: ... }` marker.
   *           `checkForVariableErrors()` is called at the 3 execution paths
   *           (sequential L398, parallel L506, conditional L595) BEFORE the
   *           service call. Step fails with `errorType: 'variable_error'`;
   *           `failureStrategy` controls cascade.
   *
   *         MISSING FIELD (`{{step.0.bogusField}}` when step 0 exists but
   *           has no `bogusField`) — silent undefined. Correct graceful
   *           behavior for partial-output cases; caller handles like any
   *           undefined value.
   *
   *       NOT enforced at validate-time because step output shape isn't
   *       known until execution. Validate-time enforcement is not
   *       implementable (output shapes are runtime-dependent).
   *
   *   (2) dependsOn DAG — enforced below via per-step dep < i check + range
   *       check + `detectCircularDependencies()`. Forward-only DAG by index.
   *       Zod accepts any `number[]`; runtime enforces shape.
   *
   *   (3) Conditional mode contract — `executionMode: 'conditional'` ASSUMES
   *       1-3 steps with positional meaning (condition / then / else).
   *       Enforced below since Phase 4 — was previously permissive.
   *
   *   (4) Retry budget interaction — `sum(step.retries) <= maxTotalRetries`.
   *       Enforced below since Phase 4 — engine previously just bailed at
   *       runtime when the global budget exhausted, masking caller intent.
   *
   *   (5) Internal service routing — paichart-* services bypass the
   *       trust-level token gate (intentional; first-party Docker services
   *       run with INTERNAL trust). Enforced in `service-call-policy.js`
   *       `SSRF_EXEMPT_SERVICES` allowlist; documented here for visibility.
   *       Not validated at validate-time — runtime routing decision.
   *
   *   (6) Step output shapes — pAIchart services follow `{success, data, ...}`
   *       convention for variable resolution to work nicely. NOT enforced.
   *       Customer services can return any MCP-valid envelope. Variable
   *       resolution falls back to undefined for non-conforming payloads
   *       (intentional). Codifying per-service contracts in hub Zod would
   *       require N-schemas-for-N-customer-services, wrong scaling model.
   *
   * @param {OrchestrationParams} params
   * @returns {{isValid: boolean, errors: string[], warnings: string[]}}
   */
  validate(params) {
    const errors = [];
    const warnings = [];

    if (!params.steps || !Array.isArray(params.steps)) {
      errors.push('steps must be an array');
    } else {
      if (params.steps.length === 0) {
        errors.push('steps array must not be empty');
      }
      if (params.steps.length > 20) {
        errors.push('Maximum 20 steps per workflow');
      }

      // Validate each step
      params.steps.forEach((step, i) => {
        if (!step.service) errors.push(`Step ${i}: service is required`);
        if (!step.tool) errors.push(`Step ${i}: tool is required`);

        // Invariant #2 — Validate dependsOn references (DAG shape).
        if (step.dependsOn) {
          for (const dep of step.dependsOn) {
            if (dep >= i) {
              errors.push(`Step ${i}: cannot depend on step ${dep} (must be earlier)`);
            }
            if (dep < 0 || dep >= params.steps.length) {
              errors.push(`Step ${i}: invalid dependency index ${dep}`);
            }
          }
        }
      });

      // Invariant #2 (continued) — Check for circular dependencies.
      if (this.detectCircularDependencies(params.steps)) {
        errors.push('Circular dependency detected in workflow steps');
      }

      // Invariant #3 — Conditional mode contract (Phase 4 addition).
      // The conditional executor at `executeConditional` interprets steps
      // positionally: steps[0] = condition predicate, steps[1] = then branch,
      // steps[2] = else branch (optional). Reject payloads that can't be
      // interpreted this way to avoid silent malformation.
      if (params.executionMode === 'conditional') {
        const n = params.steps.length;
        if (n < 1 || n > 3) {
          errors.push(`Conditional mode requires 1-3 steps (condition + then + optional else); got ${n}`);
        }
      }

      // Invariant #4 — Retry budget interaction (Phase 4 addition).
      // Per-step `retries` accumulates against the workflow-level
      // `maxTotalRetries` budget. If the sum of per-step retries exceeds
      // the global budget, the workflow can never complete the worst-case
      // retry path — reject the payload at validate time rather than
      // mid-execution. Defaults: step retries=0, maxTotalRetries=10.
      const totalRetries = params.steps.reduce((acc, s) => acc + (s.retries || 0), 0);
      const budget = params.maxTotalRetries != null ? params.maxTotalRetries : 10;
      if (totalRetries > budget) {
        errors.push(
          `Sum of step retries (${totalRetries}) exceeds maxTotalRetries budget (${budget}). ` +
          `Reduce per-step retries or raise maxTotalRetries.`
        );
      }

      // Warnings
      const services = [...new Set(params.steps.map(s => s.service))];
      if (services.length > 5) {
        warnings.push('Orchestrating more than 5 services may impact performance');
      }
    }

    // Validate execution mode
    const validModes = ['sequential', 'parallel', 'conditional'];
    if (params.executionMode && !validModes.includes(params.executionMode)) {
      errors.push(`Invalid executionMode: ${params.executionMode}`);
    }

    // Validate failure strategy
    const validStrategies = ['stop', 'continue', 'rollback'];
    if (params.failureStrategy && !validStrategies.includes(params.failureStrategy)) {
      errors.push(`Invalid failureStrategy: ${params.failureStrategy}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Export singleton factory and class
const defaultEngine = new OrchestrationEngine();

module.exports = {
  OrchestrationEngine,

  // Convenience exports for direct use
  resolveVariables: (args, outputs, totalSteps) => defaultEngine.resolveVariables(args, outputs, totalSteps),
  checkForVariableErrors: (args) => defaultEngine.checkForVariableErrors(args),
  analyzeDependencies: (steps) => defaultEngine.analyzeDependencies(steps),
  detectCircularDependencies: (steps) => defaultEngine.detectCircularDependencies(steps),
  validate: (params) => defaultEngine.validate(params),
  execute: (params, callService, context, options) =>
    defaultEngine.execute(params, callService, context, options),

  // Factory for custom configuration
  createEngine: (config) => new OrchestrationEngine(config)
};
