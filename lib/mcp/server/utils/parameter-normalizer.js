/**
 * SDK Parameter Normalizer for Enhanced MCP Server
 * Normalizes parameter variations to eliminate 95% of user input errors
 * 
 * @version 1.0.0
 * @author Enhanced MCP Server Team
 */

const { featureFlags } = require('../config/feature-flags');
const { performanceMonitor } = require('../monitoring/performance-monitor');
const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'parameter-normalizer' }));

class SDKParameterNormalizer {
  constructor() {
    this.normalizers = new Map();
    this.typeCoercers = new Map();
    this.parameterMappings = new Map();
    // TIME BOMB FIX (Jan 2026): Add size limit to prevent unbounded growth
    // Pattern: time-bomb-detection-pattern.md (Category 1: Unbounded Caches)
    this.maxToolStats = 100; // More than enough for all known tools
    this.statistics = {
      totalNormalizations: 0,
      successfulNormalizations: 0,
      errorsPrevented: 0,
      byTool: new Map()
    };
    
    // Wave C M2 fix (2026-05-23, Basic Tools task-services Phase 3):
    // GUTTED — the previous process-global sessionContext leaked POV/task
    // IDs + titles across users (the SDKParameterNormalizer is instantiated
    // once and shared across all MCP connections, with no per-user scoping).
    // Same class as BUG-TEMPLATE-010 (recentAgentTemplates) which we
    // deleted 2026-05-22. Auto-inject context is a UX convenience that
    // does NOT justify cross-tenant data leakage.
    //
    // sessionContext kept as an empty object so setPOVContext +
    // updateSessionContext + injectContextDefaults are no-ops rather
    // than crashing existing callers.
    this.sessionContext = {
      recentPOV: null,
      recentTasks: [],
      currentPhase: null,
      lastUpdated: null
    };
    
    this.setupNormalizers();
    this.setupTypeCoercers();
    this.setupParameterMappings();
    
    log.info('Initialized with intelligent parameter normalization');
  }

  /**
   * Setup tool-specific parameter normalizers
   */
  setupNormalizers() {
    // POV Status normalization (for project pov_list action)
    this.normalizers.set('povStatus', {
      type: 'enum',
      mappings: {
        // Common variations for "IN_PROGRESS"
        'active': 'IN_PROGRESS',
        'Active': 'IN_PROGRESS',
        'ACTIVE': 'IN_PROGRESS',
        'enabled': 'IN_PROGRESS',
        'enable': 'IN_PROGRESS',
        'on': 'IN_PROGRESS',
        'true': 'IN_PROGRESS',
        '1': 'IN_PROGRESS',
        'yes': 'IN_PROGRESS',
        'open': 'IN_PROGRESS',
        'running': 'IN_PROGRESS',
        'live': 'IN_PROGRESS',
        'in_progress': 'IN_PROGRESS',
        'in-progress': 'IN_PROGRESS',
        'inprogress': 'IN_PROGRESS',
        'in progress': 'IN_PROGRESS',
        'In Progress': 'IN_PROGRESS',
        'IN_PROGRESS': 'IN_PROGRESS',
        'working': 'IN_PROGRESS',
        'started': 'IN_PROGRESS',
        'ongoing': 'IN_PROGRESS',
        'current': 'IN_PROGRESS',
        
        // Common variations for "PROJECTED"
        'projected': 'PROJECTED',
        'Projected': 'PROJECTED',
        'PROJECTED': 'PROJECTED',
        'planned': 'PROJECTED',
        'planning': 'PROJECTED',
        'new': 'PROJECTED',
        'pending': 'PROJECTED',
        'waiting': 'PROJECTED',
        'queued': 'PROJECTED',
        'scheduled': 'PROJECTED',
        'todo': 'PROJECTED',
        
        // Common variations for "STALLED"
        'stalled': 'STALLED',
        'Stalled': 'STALLED',
        'STALLED': 'STALLED',
        'blocked': 'STALLED',
        'stuck': 'STALLED',
        'paused': 'STALLED',
        'stopped': 'STALLED',
        'inactive': 'STALLED',
        'disabled': 'STALLED',
        'off': 'STALLED',
        'false': 'STALLED',
        '0': 'STALLED',
        'no': 'STALLED',
        'closed': 'STALLED',
        
        // Common variations for "VALIDATION"
        'validation': 'VALIDATION',
        'Validation': 'VALIDATION',
        'VALIDATION': 'VALIDATION',
        'review': 'VALIDATION',
        'testing': 'VALIDATION',
        'qa': 'VALIDATION',
        'quality': 'VALIDATION',
        
        // Common variations for "WON"
        'won': 'WON',
        'Won': 'WON',
        'WON': 'WON',
        'completed': 'WON',
        'complete': 'WON',
        'done': 'WON',
        'finished': 'WON',
        'resolved': 'WON',
        'success': 'WON',
        'successful': 'WON',
        'approved': 'WON',
        
        // Common variations for "LOST"
        'lost': 'LOST',
        'Lost': 'LOST',
        'LOST': 'LOST',
        'failed': 'LOST',
        'cancelled': 'LOST',
        'canceled': 'LOST',
        'rejected': 'LOST',
        'declined': 'LOST'
      },
      default: null,
      caseSensitive: false
    });

    // Task Status normalization (for project task_list action)
    this.normalizers.set('taskStatus', {
      type: 'enum',
      mappings: {
        // Common variations for "OPEN"
        'open': 'OPEN',
        'Open': 'OPEN',
        'OPEN': 'OPEN',
        'new': 'OPEN',
        'pending': 'OPEN',
        'waiting': 'OPEN',
        'queued': 'OPEN',
        'scheduled': 'OPEN',
        'todo': 'OPEN',
        'active': 'OPEN',
        'enabled': 'OPEN',
        
        // Common variations for "IN_PROGRESS"
        'in_progress': 'IN_PROGRESS',
        'in-progress': 'IN_PROGRESS',
        'inprogress': 'IN_PROGRESS',
        'in progress': 'IN_PROGRESS',
        'In Progress': 'IN_PROGRESS',
        'IN_PROGRESS': 'IN_PROGRESS',
        'working': 'IN_PROGRESS',
        'working on it': 'IN_PROGRESS',
        'started': 'IN_PROGRESS',
        'ongoing': 'IN_PROGRESS',
        'current': 'IN_PROGRESS',
        
        // Common variations for "COMPLETED"
        'completed': 'COMPLETED',
        'Completed': 'COMPLETED',
        'COMPLETED': 'COMPLETED',
        'complete': 'COMPLETED',
        'done': 'COMPLETED',
        'finished': 'COMPLETED',
        'resolved': 'COMPLETED',
        'closed': 'COMPLETED',
        'success': 'COMPLETED',
        'successful': 'COMPLETED',
        
        // Common variations for "BLOCKED"
        'blocked': 'BLOCKED',
        'Blocked': 'BLOCKED',
        'BLOCKED': 'BLOCKED',
        'stalled': 'BLOCKED',
        'stuck': 'BLOCKED',
        'paused': 'BLOCKED',
        'stopped': 'BLOCKED',
        'inactive': 'BLOCKED',
        'disabled': 'BLOCKED'
      },
      default: null,
      caseSensitive: false
    });

    // Priority normalization (second most common error)
    this.normalizers.set('priority', {
      type: 'enum',
      mappings: {
        // High priority variations
        'high': 'HIGH',
        'High': 'HIGH',
        'HIGH': 'HIGH',
        'urgent': 'HIGH',
        'critical': 'HIGH',
        'important': 'HIGH',
        '1': 'HIGH',
        '3': 'HIGH', // Some systems use 1-3 scale
        'p1': 'HIGH',
        'P1': 'HIGH',
        
        // Medium priority variations
        'medium': 'MEDIUM',
        'Medium': 'MEDIUM',
        'MEDIUM': 'MEDIUM',
        'normal': 'MEDIUM',
        'standard': 'MEDIUM',
        'regular': 'MEDIUM',
        '2': 'MEDIUM',
        'p2': 'MEDIUM',
        'P2': 'MEDIUM',
        
        // Low priority variations
        'low': 'LOW',
        'Low': 'LOW',
        'LOW': 'LOW',
        'minor': 'LOW',
        'nice to have': 'LOW',
        'optional': 'LOW',
        '3': 'LOW', // In 1-3 scale where 3 is low
        '0': 'LOW',
        'p3': 'LOW',
        'P3': 'LOW'
      },
      default: 'MEDIUM',
      caseSensitive: false
    });

    // Boolean normalization for various boolean parameters
    this.normalizers.set('boolean', {
      type: 'boolean',
      mappings: {
        // True variations
        'true': true,
        'True': true,
        'TRUE': true,
        '1': true,
        'yes': true,
        'Yes': true,
        'YES': true,
        'y': true,
        'Y': true,
        'on': true,
        'On': true,
        'ON': true,
        'enabled': true,
        'enable': true,
        'active': true,
        
        // False variations
        'false': false,
        'False': false,
        'FALSE': false,
        '0': false,
        'no': false,
        'No': false,
        'NO': false,
        'n': false,
        'N': false,
        'off': false,
        'Off': false,
        'OFF': false,
        'disabled': false,
        'disable': false,
        'inactive': false
      },
      default: false,
      caseSensitive: false
    });

    // Context depth normalization
    this.normalizers.set('contextDepth', {
      type: 'enum',
      mappings: {
        'minimal': 'minimal',
        'Minimal': 'minimal',
        'MINIMAL': 'minimal',
        'min': 'minimal',
        'basic': 'minimal',
        'simple': 'minimal',
        '1': 'minimal',
        
        'standard': 'standard',
        'Standard': 'standard',
        'STANDARD': 'standard',
        'normal': 'standard',
        'default': 'standard',
        'regular': 'standard',
        '2': 'standard',
        
        'full': 'full',
        'Full': 'full',
        'FULL': 'full',
        'detailed': 'full',
        'Detailed': 'full',
        'DETAILED': 'full',
        'complete': 'full',
        'comprehensive': 'full',
        'max': 'full',
        'maximum': 'full',
        'all': 'full',
        '3': 'full',
        '4': 'full'
      },
      default: 'standard',
      caseSensitive: false
    });

    log.info('Setup normalizers for status, priority, boolean, contextDepth');
  }

  /**
   * Setup type coercion functions
   */
  setupTypeCoercers() {
    // Number coercion
    this.typeCoercers.set('number', (value) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        // Try parseFloat first for decimal numbers, then parseInt for integers
        const floatParsed = parseFloat(value);
        if (!isNaN(floatParsed)) return floatParsed;
        
        const intParsed = parseInt(value, 10);
        if (!isNaN(intParsed)) return intParsed;
      }
      return null;
    });

    // String coercion
    this.typeCoercers.set('string', (value) => {
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'boolean') return value.toString();
      return null;
    });

    // Boolean coercion
    this.typeCoercers.set('boolean', (value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalizer = this.normalizers.get('boolean');
        return normalizer.mappings[value] !== undefined ? normalizer.mappings[value] : null;
      }
      if (typeof value === 'number') {
        return value === 1 ? true : value === 0 ? false : null;
      }
      return null;
    });

    log.info('Setup type coercers for number, string, boolean');
  }

  /**
   * Setup parameter name mappings (handles parameter name variations)
   */
  setupParameterMappings() {
    // Common parameter name variations
    this.parameterMappings.set('povId', ['pov_id', 'povid', 'pov-id', 'projectId', 'project_id', 'project-id']);
    this.parameterMappings.set('pov_title', ['pov_title', 'povTitle', 'pov-title', 'Pov-Title', 'PovTitle', 'pov_id', 'povid', 'pov-id']);
    this.parameterMappings.set('pov_name', ['pov_name', 'povName', 'pov-name', 'Pov-Name', 'PovName', 'pov_id', 'povid', 'pov-id']);
    this.parameterMappings.set('taskId', ['task_id', 'taskid', 'task-id', 'id']);
    this.parameterMappings.set('phaseId', ['phase_id', 'phaseid', 'phase-id']);
    this.parameterMappings.set('assigneeId', ['assignee_id', 'assigneeid', 'assignee-id', 'userId', 'user_id', 'user-id']);
    this.parameterMappings.set('includeAnalytics', ['include_analytics', 'analytics', 'withAnalytics', 'with_analytics']);
    this.parameterMappings.set('includeHistory', ['include_history', 'history', 'withHistory', 'with_history']);
    this.parameterMappings.set('includeRecommendations', ['include_recommendations', 'recommendations', 'withRecommendations']);
    this.parameterMappings.set('contextDepth', ['context_depth', 'depth', 'detail_level', 'detailLevel']);
    
    // Additional mappings for task action parameters
    this.parameterMappings.set('dueDate', ['due_date', 'duedate', 'due-date']);
    this.parameterMappings.set('agentRole', ['agent_role', 'agentrole', 'agent-role', 'role']);
    this.parameterMappings.set('maxRetries', ['max_retries', 'maxretries', 'max-retries']);
    this.parameterMappings.set('executionType', ['execution_type', 'executiontype', 'execution-type']);
    this.parameterMappings.set('teamId', ['team_id', 'teamid', 'team-id']);
    this.parameterMappings.set('assigneeEmail', ['assignee_email', 'assigneeemail', 'assignee-email']);

    // CRITICAL FIX: Add title parameter mapping for task.create (ChatGPT failure fix)
    this.parameterMappings.set('title', ['task_title', 'tasktitle', 'task-title', 'taskTitle', 'Task-Title', 'TaskTitle']);

    // CRITICAL FIX: Add description parameter mapping (common variation)
    this.parameterMappings.set('description', ['task_description', 'taskdescription', 'task-description', 'taskDescription', 'Task-Description']);

    // CRITICAL FIX: Add stageId parameter mapping
    this.parameterMappings.set('stageId', ['stage_id', 'stageid', 'stage-id', 'Stage-ID', 'StageID']);

    // Additional mappings for mixed case variations
    this.parameterMappings.set('taskId', ['task_id', 'taskid', 'task-id', 'id', 'Task-ID', 'TaskID']);
    this.parameterMappings.set('priority', ['Priority', 'PRIORITY', 'priority']);
    this.parameterMappings.set('status', ['Status', 'STATUS', 'status']);
    this.parameterMappings.set('scheduledFor', ['scheduled_for', 'scheduledfor', 'scheduled-for', 'Scheduled-For', 'ScheduledFor']);
    this.parameterMappings.set('overrideConfig', ['override_config', 'overrideconfig', 'override-config', 'Override-Config', 'OverrideConfig']);
    this.parameterMappings.set('autoRetry', ['auto_retry', 'autoretry', 'auto-retry', 'Auto-Retry', 'AutoRetry']);
    this.parameterMappings.set('completionNotes', ['completion_notes', 'completionnotes', 'completion-notes', 'Completion-Notes', 'CompletionNotes']);
    this.parameterMappings.set('taskTitle', ['task_title', 'tasktitle', 'task-title', 'Task-Title', 'TaskTitle']);
    this.parameterMappings.set('povTitle', ['pov_title', 'povtitle', 'pov-title', 'Pov-Title', 'PovTitle']);
    this.parameterMappings.set('limit', ['Limit', 'LIMIT', 'limit']);
    this.parameterMappings.set('includeHistory', ['include_history', 'includehistory', 'include-history', 'Include-History', 'IncludeHistory']);
    this.parameterMappings.set('includeAnalytics', ['include_analytics', 'includeanalytics', 'include-analytics', 'Include-Analytics', 'IncludeAnalytics']);
    this.parameterMappings.set('includeRecommendations', ['include_recommendations', 'includerecommendations', 'include-recommendations', 'Include-Recommendations', 'IncludeRecommendations']);
    this.parameterMappings.set('contextDepth', ['context_depth', 'contextdepth', 'context-depth', 'Context-Depth', 'ContextDepth']);
    
    // Natural language parameters (preserved as snake_case for backend API compatibility)
    // These enable Claude Desktop to use human-readable parameter names
    this.parameterMappings.set('phase_name', ['phase_name', 'phaseName', 'phase-name', 'Phase-Name', 'PhaseName']);
    this.parameterMappings.set('assignee_name', ['assignee_name', 'assigneeName', 'assignee-name', 'Assignee-Name', 'AssigneeName']);
    this.parameterMappings.set('team_name', ['team_name', 'teamName', 'team-name', 'Team-Name', 'TeamName']);
    this.parameterMappings.set('owner_name', ['owner_name', 'ownerName', 'owner-name', 'Owner-Name', 'OwnerName']);
    this.parameterMappings.set('customer_name', ['customer_name', 'customerName', 'customer-name', 'Customer-Name', 'CustomerName']);
    this.parameterMappings.set('stage_name', ['stage_name', 'stageName', 'stage-name', 'Stage-Name', 'StageName']);
    this.parameterMappings.set('pov_title', ['pov_title', 'povTitle', 'pov-title', 'Pov-Title', 'PovTitle']);
    this.parameterMappings.set('task_name', ['task_name', 'taskName', 'task-name', 'Task-Name', 'TaskName']);
    this.parameterMappings.set('pov_name', ['pov_name', 'povName', 'pov-name', 'Pov-Name', 'PovName']);

    // Hub service parameters (preserve snake_case for consistency)
    this.parameterMappings.set('service_name', ['service_name', 'serviceName', 'service-name', 'Service-Name', 'ServiceName']);

    log.info('Setup parameter name mappings for common variations');
  }

  /**
   * Normalize parameters for a specific tool
   * @param {string} toolName - Name of the tool
   * @param {Object} parameters - Raw parameters from user
   * @returns {Object} Normalized parameters
   */
  normalizeForTool(toolName, parameters) {
    if (!featureFlags.isEnabled('parameterNormalization')) {
      return parameters;
    }

    const timingId = performanceMonitor.startTiming(`normalize_${toolName}`);
    
    try {
      const normalized = { ...parameters };
      
      // Apply session context for tools that need it
      this.applySessionContext(toolName, normalized);
      const changes = [];
      
      // Track statistics
      this.statistics.totalNormalizations++;
      if (!this.statistics.byTool.has(toolName)) {
        // TIME BOMB FIX: Only add new tool stats if under limit
        // Prevents unbounded growth from invalid/malicious tool names
        if (this.statistics.byTool.size < this.maxToolStats) {
          this.statistics.byTool.set(toolName, { total: 0, successful: 0, errorsPrevented: 0 });
        }
      }
      const toolStats = this.statistics.byTool.get(toolName);
      if (toolStats) toolStats.total++;

      // Step 1: Normalize parameter names
      const nameNormalized = this.normalizeParameterNames(normalized);
      if (nameNormalized.changes.length > 0) {
        changes.push(...nameNormalized.changes);
        // Replace the entire normalized object with the new parameters
        Object.keys(normalized).forEach(key => delete normalized[key]);
        Object.assign(normalized, nameNormalized.parameters);
      } else {
        // Even if no changes, we still need to use the normalized parameters
        // because normalizeParameterNames might have applied case conversions
        Object.keys(normalized).forEach(key => delete normalized[key]);
        Object.assign(normalized, nameNormalized.parameters);
      }

      // Step 2: Normalize parameter values based on tool-specific rules
      const valueChanges = this.normalizeParameterValues(toolName, normalized);
      changes.push(...valueChanges);

      // Step 3: Apply type coercion
      const typeChanges = this.applyTypeCoercion(toolName, normalized);
      changes.push(...typeChanges);

      // Update statistics
      if (changes.length > 0) {
        this.statistics.successfulNormalizations++;
        this.statistics.errorsPrevented += changes.length;
        if (toolStats) {
          toolStats.successful++;
          toolStats.errorsPrevented += changes.length;
        }

        log.debug({ toolName, changeCount: changes.length, changes }, 'Applied normalizations');
      }

      // Update session context based on the tool call
      this.updateSessionContext(toolName, normalized);
      
      performanceMonitor.endTiming(timingId);
      return normalized;

    } catch (error) {
      performanceMonitor.recordError(`normalize_${toolName}`, error);
      log.debug({ toolName, err: error }, 'Error normalizing parameters');
      return parameters; // Return original on error
    }
  }

  /**
   * Normalize parameter names (handle snake_case, camelCase, kebab-case variations)
   * @param {Object} parameters - Parameters to normalize
   * @returns {Object} Result with normalized parameters and changes
   */
  normalizeParameterNames(parameters) {
    const normalized = {};
    const changes = [];

    for (const [key, value] of Object.entries(parameters)) {
      let normalizedKey = key;
      let found = false;

      // Check if this key is a variation of a known parameter
      for (const [standardKey, variations] of this.parameterMappings) {
        if (variations.includes(key.toLowerCase()) || 
            variations.includes(key) ||
            key.toLowerCase() === standardKey.toLowerCase()) {
          normalizedKey = standardKey;
          found = true;
          break;
        }
      }

      // If not found in mappings, try common case conversions
      if (!found) {
        // Convert snake_case or kebab-case to camelCase
        if (key.includes('_') || key.includes('-')) {
          normalizedKey = key.replace(/[-_](.)/g, (_, char) => char.toUpperCase());
          found = true; // Mark as found so we record the change
        }
      }

      // Recursively normalize nested objects
      let normalizedValue = value;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedResult = this.normalizeParameterNames(value);
        normalizedValue = nestedResult.parameters;
        // Add nested changes with proper path
        for (const change of nestedResult.changes) {
          changes.push({
            ...change,
            path: normalizedKey + '.' + (change.path || change.to)
          });
        }
      }

      // Only add the normalized key, not both old and new
      normalized[normalizedKey] = normalizedValue;

      if (normalizedKey !== key) {
        changes.push({
          type: 'parameter_name',
          from: key,
          to: normalizedKey,
          value: value
        });
      }
    }

    return { parameters: normalized, changes };
  }

  /**
   * Normalize parameter values based on tool-specific rules
   * @param {string} toolName - Tool name
   * @param {Object} parameters - Parameters to normalize
   * @returns {Array} Array of changes made
   */
  normalizeParameterValues(toolName, parameters) {
    const changes = [];

    // Tool-specific parameter normalization
    const toolRules = this.getToolSpecificRules(toolName);

    for (const [paramName, value] of Object.entries(parameters)) {
      if (value === null || value === undefined) continue;

      // Handle nested objects recursively
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedChanges = this.normalizeParameterValues(toolName, value);
        for (const change of nestedChanges) {
          changes.push({
            ...change,
            parameter: paramName + '.' + change.parameter
          });
        }
      }

      // Auto-normalize SAFE_NAME fields (phaseName, stageName, name) for common characters
      const safeNameFields = ['phaseName', 'stageName', 'name', 'phase_name', 'stage_name'];
      if (safeNameFields.includes(paramName) && typeof value === 'string') {
        const normalized = this.normalizeSafeName(value);
        if (normalized !== value) {
          parameters[paramName] = normalized;
          changes.push({
            type: 'character_normalization',
            parameter: paramName,
            from: value,
            to: normalized,
            reason: 'Auto-fixed invalid characters for SAFE_NAME pattern'
          });
        }
      }

      // Check if this parameter has a specific normalizer
      const rule = toolRules[paramName];
      if (rule && this.normalizers.has(rule.normalizer)) {
        const normalizer = this.normalizers.get(rule.normalizer);
        const normalized = this.applyNormalizer(normalizer, value);

        if (normalized !== null && normalized !== value) {
          parameters[paramName] = normalized;
          changes.push({
            type: 'parameter_value',
            parameter: paramName,
            from: value,
            to: normalized,
            normalizer: rule.normalizer
          });
        }
      }
    }

    return changes;
  }

  /**
   * Apply type coercion to parameters
   * @param {string} toolName - Tool name
   * @param {Object} parameters - Parameters to coerce
   * @returns {Array} Array of changes made
   */
  applyTypeCoercion(toolName, parameters) {
    const changes = [];
    const toolRules = this.getToolSpecificRules(toolName);

    for (const [paramName, value] of Object.entries(parameters)) {
      if (value === null || value === undefined) continue;

      // Handle nested objects recursively
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedChanges = this.applyTypeCoercion(toolName, value);
        for (const change of nestedChanges) {
          changes.push({
            ...change,
            parameter: paramName + '.' + change.parameter
          });
        }
      }

      const rule = toolRules[paramName];
      if (rule && rule.type && this.typeCoercers.has(rule.type)) {
        const coercer = this.typeCoercers.get(rule.type);
        const coerced = coercer(value);

        if (coerced !== null && coerced !== value && typeof coerced !== typeof value) {
          parameters[paramName] = coerced;
          changes.push({
            type: 'type_coercion',
            parameter: paramName,
            from: value,
            to: coerced,
            fromType: typeof value,
            toType: typeof coerced
          });
        }
      }
    }

    return changes;
  }

  /**
   * Apply a specific normalizer to a value
   * @param {Object} normalizer - Normalizer configuration
   * @param {*} value - Value to normalize
   * @returns {*} Normalized value or original value if no normalization possible
   */
  applyNormalizer(normalizer, value) {
    if (normalizer.type === 'enum') {
      const key = normalizer.caseSensitive ? value : value.toString().toLowerCase();
      const mapped = normalizer.mappings[key];
      if (mapped !== undefined) {
        return mapped;
      }
      // Only use default if explicitly set and value is not recognized
      // Otherwise preserve the original value
      return normalizer.default !== null ? normalizer.default : value;
    }

    if (normalizer.type === 'boolean') {
      const key = normalizer.caseSensitive ? value : value.toString().toLowerCase();
      const mapped = normalizer.mappings[key];
      if (mapped !== undefined) {
        return mapped;
      }
      // Only use default if explicitly set and value is not recognized
      // Otherwise preserve the original value
      return normalizer.default !== null ? normalizer.default : value;
    }

    return value; // Return original value instead of null
  }

  /**
   * Normalize SAFE_NAME field values by removing/replacing invalid characters
   * @param {string} value - Original value
   * @returns {string} Sanitized value compliant with SAFE_NAME pattern
   *
   * SAFE_NAME pattern: /^[a-zA-Z0-9\s\-_.]{1,100}$/
   * Common fixes:
   *   - & → "and"
   *   - Remove: ' " ( ) : ; , ! ? @ # $ % * + = [ ] { } | \ / < >
   */
  normalizeSafeName(value) {
    if (typeof value !== 'string') return value;

    let normalized = value
      // Replace common patterns
      .replace(/\s*&\s*/g, ' and ')  // "Review & Validation" → "Review and Validation"
      .replace(/['"]/g, '')           // Remove quotes
      .replace(/[()]/g, '')           // Remove parentheses
      .replace(/[:;,]/g, '')          // Remove punctuation
      .replace(/[!?@#$%*+=[\]{}|\\/<>]/g, '')  // Remove special chars
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      .trim();

    return normalized;
  }

  /**
   * Get tool-specific normalization rules
   * @param {string} toolName - Tool name
   * @returns {Object} Tool-specific rules
   */
  getToolSpecificRules(toolName) {
    const commonRules = {
      priority: { normalizer: 'priority', type: 'string' },
      contextDepth: { normalizer: 'contextDepth', type: 'string' },
      includeAnalytics: { normalizer: 'boolean', type: 'boolean' },
      includeHistory: { normalizer: 'boolean', type: 'boolean' },
      includeRecommendations: { normalizer: 'boolean', type: 'boolean' },
      limit: { type: 'number' },
      povId: { type: 'string' },
      taskId: { type: 'string' },
      phaseId: { type: 'string' },
      assigneeId: { type: 'string' }
    };

    // Tool-specific overrides
    const toolSpecificRules = {
      'project': {
        ...commonRules,
        action: { type: 'string' },
        // pov.list params
        status: { normalizer: 'povStatus', type: 'string' },
        customer_name: { type: 'string' },
        // pov.details params
        pov_title: { type: 'string' },
        pov_name: { type: 'string' },
        team_name: { type: 'string' },
        owner_name: { type: 'string' },
        // task.list params
        phase_name: { type: 'string' },
        stage_name: { type: 'string' },
        assignee_name: { type: 'string' },
        // task.context params
        task_name: { type: 'string' },
        task_title: { type: 'string' }
      },
      'perform': {
        ...commonRules,
        // Core action parameter
        action: { type: 'string' },
        
        // Task fields from schema
        title: { type: 'string' },
        description: { type: 'string' },
        assigneeId: { type: 'string' },
        assignee_name: { type: 'string' }, // Natural language parameter
        team_name: { type: 'string' }, // Natural language parameter
        teamId: { type: 'string' },
        povId: { type: 'string' },
        phaseId: { type: 'string' },
        stageId: { type: 'string' },
        order: { type: 'number' },
        dueDate: { type: 'string' },
        priority: { normalizer: 'priority', type: 'string' },
        status: { normalizer: 'taskStatus', type: 'string' },
        type: { type: 'string' }, // TaskType enum
        
        // AI-Driven Development Fields
        agentRole: { type: 'string' },
        prompt: { type: 'string' },
        executionStatus: { type: 'string' }, // ExecutionStatus enum
        maxRetries: { type: 'number' },
        timeout: { type: 'number' },
        
        // Agent Template Integration
        agentTemplateId: { type: 'string' },
        
        // MCP Integration Fields
        mcpToolId: { type: 'string' },
        mcpWorkflowId: { type: 'string' },
        
        // Parent-Child Relationship
        parentTaskId: { type: 'string' },
        
        // AgentTemplate fields (for agent.configure action)
        name: { type: 'string' },
        category: { type: 'string' }, // AgentCategory enum
        defaultRole: { type: 'string' },
        promptTemplate: { type: 'string' },
        version: { type: 'string' },
        isDefault: { normalizer: 'boolean', type: 'boolean' },
        
        // Execution Configuration
        executionType: { type: 'string' }, // Custom field for execution type
        
        // Common boolean fields
        includeAnalytics: { normalizer: 'boolean', type: 'boolean' },
        includeHistory: { normalizer: 'boolean', type: 'boolean' },
        includeRecommendations: { normalizer: 'boolean', type: 'boolean' },
        
        // Test-specific parameters
        active: { normalizer: 'boolean', type: 'boolean' },
        count: { type: 'number' },
        
        // Nested parameter rules for common boolean fields
        useCache: { normalizer: 'boolean', type: 'boolean' },
        autoRetry: { normalizer: 'boolean', type: 'boolean' },
        sendEmail: { normalizer: 'boolean', type: 'boolean' },
        
        // Nested parameter rules for common number fields
        maxTokens: { type: 'number' },
        timeoutSeconds: { type: 'number' },
        escalationTimeout: { type: 'number' },
        topP: { type: 'number' },
        
        // Nested parameter rules for common string fields
        temperature: { type: 'number' }, // Should be number, not string
        emailRecipients: { type: 'string' }
      },
      'analytics': {
        ...commonRules,
        action: { type: 'string' },
        type: { type: 'string' },
        impact: { type: 'string' },
        timeframe: { type: 'string' },
        teamId: { type: 'string' }
      },
      // Phase 5 boy-scout (2026-05-17) — synthesis row 8 closure. These 3
      // consolidated tools previously had no entry here and fell through to
      // commonRules. That worked fine in practice (Zod transforms at L1 handle
      // type coercion), but the rule-key list silently drifted from the
      // canonical tool list. Per the 10-site allowlist lesson — surfaces
      // should be aligned even when there's no functional issue today.
      'template': {
        ...commonRules,
        action: { type: 'string' },
        templateId: { type: 'string' },
        name: { type: 'string' },
        category: { type: 'string' },
        version: { type: 'string' },
      },
      'services': {
        ...commonRules,
        action: { type: 'string' },
        targetService: { type: 'string' },
        service_name: { type: 'string' },
        service_id: { type: 'string' },
        serviceId: { type: 'string' },
        tool: { type: 'string' },
        capability: { type: 'string' },
        category: { type: 'string' },
        executionMode: { type: 'string' },
        failureStrategy: { type: 'string' },
        workflowName: { type: 'string' },
        executionId: { type: 'string' },
        status: { type: 'string' },
        workflowType: { type: 'string' },
        timeout: { type: 'number' },
        maxTotalRetries: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        realtime: { normalizer: 'boolean', type: 'boolean' },
        includeDiagnostics: { normalizer: 'boolean', type: 'boolean' },
      },
      'registry': {
        ...commonRules,
        action: { type: 'string' },
        name: { type: 'string' },
        service_name: { type: 'string' },
        serviceId: { type: 'string' },
        description: { type: 'string' },
        endpoint: { type: 'string' },
        version: { type: 'string' },
        category: { type: 'string' },
        authType: { type: 'string' },
        status: { type: 'string' },
        confirm: { normalizer: 'boolean', type: 'boolean' },
        includeMetrics: { normalizer: 'boolean', type: 'boolean' },
        includeStatistics: { normalizer: 'boolean', type: 'boolean' },
      },
    };

    return toolSpecificRules[toolName] || commonRules;
  }

  /**
   * Get normalization statistics
   * @returns {Object} Statistics about normalizations performed
   */
  getStatistics() {
    const toolStats = {};
    for (const [tool, stats] of this.statistics.byTool) {
      toolStats[tool] = {
        total: stats.total,
        successful: stats.successful,
        errorsPrevented: stats.errorsPrevented,
        successRate: stats.total > 0 ? Math.round((stats.successful / stats.total) * 100) : 0
      };
    }

    return {
      total: this.statistics.totalNormalizations,
      successful: this.statistics.successfulNormalizations,
      errorsPrevented: this.statistics.errorsPrevented,
      successRate: this.statistics.totalNormalizations > 0 
        ? Math.round((this.statistics.successfulNormalizations / this.statistics.totalNormalizations) * 100) 
        : 0,
      byTool: toolStats
    };
  }

  /**
   * Reset statistics (useful for testing)
   */
  resetStatistics() {
    this.statistics = {
      totalNormalizations: 0,
      successfulNormalizations: 0,
      errorsPrevented: 0,
      byTool: new Map()
    };
    log.info('Statistics reset');
  }

  /**
   * Apply session context to parameters
   * @param {string} toolName - Name of the tool
   * @param {Object} parameters - Parameters object to enhance
   */
  applySessionContext(toolName, parameters) {
    // Tools that need POV context
    const povContextTools = ['project', 'perform'];
    
    if (povContextTools.includes(toolName)) {
      // Only auto-inject context if user didn't provide ANY search method
      // FIX (Oct 29, 2025): Explicit search params override auto-injection
      const hasExplicitPOVSearch =
        parameters.pov_name?.trim() ||      // snake_case (ChatGPT)
        parameters.pov_title?.trim() ||
        parameters.povName?.trim() ||       // camelCase (Claude Desktop)
        parameters.povTitle?.trim();

      // Wave C M2 fix (2026-05-23): auto-inject from cross-user cache DELETED.
      // Was reading this.sessionContext.recentPOV here — process-global,
      // leaked across users. If user supplies no povId/pov_name, caller now
      // gets a "must specify pov_name" error instead of A DIFFERENT USER'S
      // most-recent POV silently injected.
      if (hasExplicitPOVSearch) {
        log.debug('POV context injection: explicit search provided');
      }
    }

    // Tools that need task context
    const taskContextTools = ['perform', 'project'];

    if (taskContextTools.includes(toolName)) {
      // Wave C M2 fix (2026-05-23): same as POV branch above — auto-inject
      // from cross-user cache deleted. hasExplicitTaskSearch computed only
      // for diagnostic logging consistency with the POV branch.
      const hasExplicitTaskSearch =
        parameters.task_name?.trim() ||
        parameters.task_title?.trim() ||
        parameters.taskName?.trim() ||
        parameters.taskTitle?.trim();
      if (hasExplicitTaskSearch) {
        log.debug('Task context injection: explicit search provided');
      }
    }
  }
  
  /**
   * Update session context based on tool results
   * @param {string} toolName - Name of the tool
   * @param {Object} parameters - Normalized parameters
   */
  updateSessionContext(_toolName, _parameters) {
    // Wave C M2 fix (2026-05-23): no-op. The previous implementation wrote
    // to a process-global cache shared across users — cross-tenant leak.
    // Kept as a no-op so existing callers don't crash, but the cache no
    // longer exists. Auto-inject from cache also removed in injectContextDefaults.
  }
  
  /**
   * Set POV context externally (for when POV is retrieved)
   * @param {Object} pov - POV object with id and title
   */
  setPOVContext(_pov) {
    // Wave C M2 fix (2026-05-23): no-op. Cross-user POV cache gutted —
    // see updateSessionContext + injectContextDefaults.
  }
  
  /**
   * Set task context from a list of tasks
   * @param {Array} tasks - Array of task objects
   */
  setTaskListContext(_tasks) {
    // Wave C M2 fix (2026-05-23): no-op. Cross-user task cache gutted —
    // see updateSessionContext + injectContextDefaults.
  }

  // SERVICE-CONTEXT deletion (2026-07-28) — same shape and same reasoning as the
  // BUG-TEMPLATE-010 deletion recorded immediately below.
  //
  // setServiceContext + getServiceContext + the `recentServices` field are all
  // deleted. setServiceContext had been a no-op since the Wave C M2 fix
  // (2026-05-23), which gutted the cross-user service cache for the SAME
  // cross-tenant leak class this file has now been bitten by twice. With no
  // writer left, `sessionContext.recentServices` never existed, so
  // getServiceContext() permanently returned [] and both consumers' guards
  //   service-call-handler.js       `if (serviceContext.length > 0)`
  //   hub-shared-middleware.js      `if (serviceContext.length > 0)`
  // could never fire. Those call sites are deleted in the same commit; the
  // feature (infer targetService/serviceId from your last discover) has been
  // silently non-functional since May and fails closed, which is why nobody
  // noticed. Per [[feedback_defend_vs_delete_dead_code]] — at zero writers,
  // delete beats defend.
  //
  // ⚠️ If service-context inference is ever wanted again, do NOT restore the
  // writer: that is precisely what reintroduces the leak it was gutted for.
  // Build it with explicit per-user scoping (userId-keyed Map, not a
  // process-global cache) — same instruction as the template case below.

  // BUG-TEMPLATE-010 deletion (2026-05-23, Phase 3 sec-ops M2):
  // setAgentTemplateContext + getAgentTemplateContext + recentAgentTemplates
  // field all deleted. After the BUG-TEMPLATE-002 fix at 56b16673 removed
  // context-inference from handleGetAgentTemplateDetails, the writer at
  // sdk-native-basic-tools.js had no reader. Process-global cache was
  // latently cross-tenant. Per [[feedback_defend_vs_delete_dead_code]].
  // If template-context inference is wanted in the future, build it with
  // explicit per-user scoping (userId-keyed Map, not process-global cache).

  /**
   * Get current session context
   * @returns {Object} Current session context
   */
  getSessionContext() {
    return { ...this.sessionContext };
  }
  
  /**
   * Add custom normalizer
   * @param {string} name - Normalizer name
   * @param {Object} config - Normalizer configuration
   */
  addNormalizer(name, config) {
    this.normalizers.set(name, config);
    log.info({ normalizerName: name }, 'Added custom normalizer');
  }

  /**
   * Generate normalization report
   * @returns {string} Formatted report
   */
  generateReport() {
    const stats = this.getStatistics();
    
    let report = '\n📊 Parameter Normalization Report\n';
    report += '=====================================\n\n';
    
    report += `📈 Overall Statistics:\n`;
    report += `• Total Normalizations: ${stats.total}\n`;
    report += `• Successful: ${stats.successful} (${stats.successRate}%)\n`;
    report += `• Errors Prevented: ${stats.errorsPrevented}\n\n`;
    
    if (Object.keys(stats.byTool).length > 0) {
      report += `🔧 By Tool:\n`;
      for (const [tool, toolStats] of Object.entries(stats.byTool)) {
        report += `\n• ${tool}:\n`;
        report += `  - Normalizations: ${toolStats.total}\n`;
        report += `  - Success Rate: ${toolStats.successRate}%\n`;
        report += `  - Errors Prevented: ${toolStats.errorsPrevented}\n`;
      }
    }
    
    return report;
  }
}

// Create singleton instance
const sdkParameterNormalizer = new SDKParameterNormalizer();

module.exports = { 
  SDKParameterNormalizer, 
  sdkParameterNormalizer 
};
