/**
 * MCP Prompt Registry
 * Provides interactive prompts for guided parameter discovery and workflow assistance
 * Integrates with AgentPromptLibrary database model for dynamic prompt management
 */

const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'prompt-registry' }));

// We'll get prisma instance from the server when needed
let prisma = null;

// Import prompt registry events for real-time updates
// Phase 2.P0.5 (2026-04-08): switched from `await import('./prompt-registry-events.js')`
// to synchronous `require('./prompt-registry-events')` (extensionless). ts-node CJS
// hooks (registered in mcp-server-v5.js) cover extensionless requires but NOT dynamic
// ESM imports, so the old pattern would break once Phase 2 deletes the .js sibling.
// Extensionless require resolves to .js today and will fall through to .ts after
// deletion. Keeps the try/catch for graceful degradation if the module truly is
// missing (e.g., in a misconfigured dev environment).
let getPromptRegistryEventEmitter = null;
let initializePromptRegistryEvents = null;
try {
  const eventModule = require('../../../events/prompt-registry-events');
  getPromptRegistryEventEmitter = eventModule.getPromptRegistryEventEmitter;
  initializePromptRegistryEvents = eventModule.initializePromptRegistryEvents;
} catch (error) {
  log.warn('Event system not available', { err: error });
}

// Retained for API compatibility with existing callers that `await initializeEventEmitter()`.
// No-op now that the require happens at module load.
async function initializeEventEmitter() {
  return getPromptRegistryEventEmitter;
}

// Set prisma instance
function setPrismaInstance(prismaInstance) {
  prisma = prismaInstance;
}

class PromptRegistry {
  constructor() {
    this.prompts = new Map();
    this.dbPrompts = new Map(); // Cache for database prompts

    // Map size limits (time-bomb-detection-pattern.md - Category 1: Unbounded Caches)
    this.MAX_DB_PROMPTS = 500;          // Max cached database prompts
    this.MAX_ACCESS_METRICS = 500;      // Max access metric entries
    this.MAX_USERS_PER_METRIC = 100;    // Max unique users tracked per metric
    this.mapEvictionStats = { dbPrompts: 0, accessMetrics: 0 };

    this.initializeBuiltInPrompts(); // RESTORED FOR STABILITY
  }

  /**
   * Bounded database prompt registration with LRU eviction
   * (time-bomb-detection-pattern.md - Category 1: Unbounded Caches)
   */
  setDbPrompt(name, promptData) {
    if (this.dbPrompts.size >= this.MAX_DB_PROMPTS && !this.dbPrompts.has(name)) {
      const oldestKey = this.dbPrompts.keys().next().value;
      if (oldestKey) {
        this.dbPrompts.delete(oldestKey);
        this.mapEvictionStats.dbPrompts++;
        log.warn('LRU evicted oldest db prompt', { evictedKey: oldestKey });
      }
    }
    this.dbPrompts.set(name, promptData);
  }

  /**
   * Shutdown the prompt registry
   * (time-bomb-detection-pattern.md - Category 3: Proper shutdown handler)
   */
  shutdown() {
    log.info('Shutting down...');
    this.prompts.clear();
    this.dbPrompts.clear();
    if (this.accessMetrics) {
      this.accessMetrics.clear();
    }
    log.info('Shutdown complete - all caches cleared');
  }

  /**
   * Get registry statistics for monitoring
   * (time-bomb-detection-pattern.md - Expose stats for monitoring)
   */
  getRegistryStats() {
    return {
      prompts: {
        builtIn: this.prompts.size,
        database: this.dbPrompts.size,
        maxDatabase: this.MAX_DB_PROMPTS
      },
      accessMetrics: {
        count: this.accessMetrics ? this.accessMetrics.size : 0,
        max: this.MAX_ACCESS_METRICS,
        maxUsersPerMetric: this.MAX_USERS_PER_METRIC
      },
      evictions: this.mapEvictionStats
    };
  }

  async initialize() {
    // Database-first chameleon platform strategy with atomic guarantees
    log.info('Initializing chameleon platform prompts with race condition prevention');

    // Step 1: Validate database readiness (prevent session timing issues)
    await this.validateDatabaseConnection();

    // Step 2: Load database prompts atomically (dynamic, domain-specific)
    await this.loadDatabasePrompts();

    // Step 3: Load built-in prompts (fallback for missing functionality)
    this.initializeBuiltInPrompts();

    // Step 4: Set up real-time event listeners for auto-reload
    await this.setupEventListeners();

    log.info({ dbPromptCount: this.dbPrompts.size, builtInCount: this.prompts.size }, 'Chameleon platform ready with atomic guarantees');
  }

  async validateDatabaseConnection() {
    if (!prisma) {
      log.warn('Prisma not available, skipping database validation');
      return false;
    }

    try {
      // Test database connectivity before proceeding
      await prisma.$queryRaw`SELECT 1 as db_ready`;
      log.info('Database connection validated and ready');
      return true;
    } catch (error) {
      log.warn('Database connection validation failed', { err: error });
      log.warn('Will proceed with built-in prompts only');
      return false;
    }
  }

  async loadDatabasePrompts() {
    log.info('loadDatabasePrompts() called with atomic transaction protection');

    if (!prisma) {
      log.error('Prisma not initialized, skipping database prompts');
      return;
    }

    try {
      // Atomic database prompt loading with connection validation
      const result = await prisma.$transaction(async (tx) => {
        // 1. Verify database connectivity (prevents race conditions)
        await tx.$queryRaw`SELECT 1 as connection_test`;
        log.info('Database connection validated');

        // 2. Load MCP prompts atomically
        // Note: This loads ALL prompts, filtering happens in listPrompts() based on user role
        log.info('Querying database for MCP prompts with atomic guarantee');

        const PROMPT_LOAD_CAP = 200;
        const dbPrompts = await tx.agentPromptLibrary.findMany({
          where: {
            status: 'ACTIVE',
            // Load all prompts (public and private) - role filtering happens at query time
            tags: {
              has: 'mcp'
            }
          },
          orderBy: {
            usageCount: 'desc'
          },
          take: PROMPT_LOAD_CAP
        });

        // Loud-on-truncation: a silent cap would drop the lowest-usage ACTIVE mcp prompts from the
        // registry with no signal. If we ever hit the cap, warn so we raise it / add pagination.
        if (dbPrompts.length === PROMPT_LOAD_CAP) {
          log.warn({ cap: PROMPT_LOAD_CAP }, 'MCP prompt load hit the take cap — additional ACTIVE mcp-tagged prompts are being EXCLUDED from the registry. Raise PROMPT_LOAD_CAP or add pagination.');
        }
        log.info({ count: dbPrompts.length }, 'Found MCP prompts in atomic transaction');
        return dbPrompts;
        
      }, {
        timeout: 10000, // 10 second timeout to prevent hanging
        isolationLevel: 'ReadCommitted'
      });

      // 3. Cache prompts in registry (outside transaction for performance)
      for (const prompt of result) {
        this.setDbPrompt(prompt.name, prompt);
        log.info({ promptName: prompt.name }, 'Registered prompt');
      }

      log.info({ count: result.length }, 'Successfully loaded MCP prompts with atomic guarantees');
      
      // 4. Emit event for real-time registry synchronization
      try {
        await initializeEventEmitter();
        if (getPromptRegistryEventEmitter) {
          const eventEmitter = getPromptRegistryEventEmitter();
          
          // Emit bulk load event
          await eventEmitter.emit('registry-loaded', {
            promptCount: result.length,
            loadTime: new Date().toISOString(),
            loadMethod: 'atomic-transaction'
          });
          
          log.info('Registry load event emitted for real-time sync');
        }
      } catch (eventError) {
        log.warn('Failed to emit registry event, continuing', { err: eventError });
        // Don't fail prompt loading if event emission fails
      }
      
    } catch (error) {
      log.warn('Atomic prompt loading failed', { err: error });
      log.warn('Falling back to built-in prompts only');
      
      // Graceful degradation - don't fail completely
      this.dbPrompts.clear();
    }
  }

  /**
   * Set up real-time event listeners for prompt registry updates
   */
  async setupEventListeners() {
    try {
      await initializeEventEmitter();
      if (!getPromptRegistryEventEmitter) {
        log.warn('Event emitter not available, skipping real-time updates');
        return;
      }

      // FIX: Explicitly initialize the event emitter connection
      // This ensures DATABASE_URL is available (fixes SCRAM authentication error)
      if (initializePromptRegistryEvents) {
        const connected = await initializePromptRegistryEvents();
        if (!connected) {
          log.warn('Event emitter failed to connect, real-time updates disabled');
          log.warn('Prompts will still work, but require manual restart for updates');
          return;
        }
        log.info('Event emitter connected successfully - real-time updates enabled');
      }

      const eventEmitter = getPromptRegistryEventEmitter();

      // Listen for prompt created events
      eventEmitter.on('prompt-created', async (event) => {
        log.info({ promptName: event.promptName }, 'Prompt created event received');
        await this.reloadSinglePrompt(event.promptId);
      });

      // Listen for prompt updated events
      eventEmitter.on('prompt-updated', async (event) => {
        log.info({ promptName: event.promptName }, 'Prompt updated event received');
        await this.reloadSinglePrompt(event.promptId);
      });

      // Listen for prompt deleted events
      eventEmitter.on('prompt-deleted', (event) => {
        log.info({ promptName: event.promptName }, 'Prompt deleted event received');
        this.dbPrompts.delete(event.promptName);
      });

      log.info('Real-time event listeners active - listening for prompt updates');
    } catch (error) {
      log.warn('Failed to setup event listeners', { err: error });
    }
  }

  /**
   * Reload a single prompt from database
   */
  async reloadSinglePrompt(promptId) {
    try {
      // Re-fetch by id ONLY (no status/isPublic filter) so we can detect when a prompt has LEFT the
      // MCP-eligible set (deprecated / made private / un-mcp-tagged) and pull it from the cache LIVE.
      // Previously the where-clause required status:'ACTIVE', so a just-deprecated prompt returned null
      // here and was left stale in the MCP cache until a process restart (2026-06-30 deprecate-propagation fix).
      const prompt = await prisma.agentPromptLibrary.findUnique({
        where: { id: promptId },
      });

      if (prompt && prompt.status === 'ACTIVE' && prompt.isPublic && prompt.tags?.includes('mcp')) {
        this.setDbPrompt(prompt.name, prompt);
        log.info({ promptName: prompt.name }, 'Reloaded prompt');
      } else if (prompt) {
        // No longer MCP-eligible (deprecated / private / un-mcp-tagged) — pull from cache so the change is live
        this.dbPrompts.delete(prompt.name);
        log.info({ promptName: prompt.name, status: prompt.status }, 'Removed now-ineligible prompt from MCP cache');
      }
    } catch (error) {
      log.warn('Failed to reload prompt', { err: error });
    }
  }

  initializeBuiltInPrompts() {
    // ========== TASK AUDIT PROMPTS ==========
    // Audit All Tasks - Complete POV task audit with pagination demonstration
    this.registerPrompt({
      name: 'audit_all_tasks',
      description: 'Lists all OPEN, IN_PROGRESS, and BLOCKED tasks across active/pending POVs (IN_PROGRESS, STALLED, VALIDATION), grouped by POV with totals and completeness indicators',
      arguments: [
        {
          name: 'status',
          description: 'Comma-separated task statuses (default: OPEN,IN_PROGRESS,BLOCKED)',
          required: false
        },
        {
          name: 'povStatus',
          description: 'Comma-separated POV statuses to audit (default: IN_PROGRESS,STALLED,VALIDATION). Valid: PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST',
          required: false
        },
        {
          name: 'includeCompleted',
          description: 'Include completed tasks (default: false)',
          required: false
        },
        {
          name: 'maxPerPOV',
          description: 'Max tasks per POV before paging (default: 200)',
          required: false
        },
        {
          name: 'showAssignees',
          description: 'Show assignee info (default: true)',
          required: false
        },
        {
          name: 'showPhaseInfo',
          description: 'Show phase/stage info (default: true)',
          required: false
        }
      ],
      content: this.createAuditAllTasksPrompt.bind(this)
    });

  }

  registerPrompt(prompt) {
    this.prompts.set(prompt.name, prompt);
  }

  async getPrompt(name, context = null) {
    // Track prompt access for metrics
    this.trackPromptAccess(name, context);
    
    // Authentication-based prompt strategy
    const isAuthenticated = !!(context?.user?.id);
    
    // UNAUTHENTICATED USER PATH
    if (!isAuthenticated) {
      return {
        name: 'authentication_required',
        description: 'Authentication required to access this prompt',
        arguments: [],
        content: (args) => {
          return `# Authentication Required\n\n` +
            `This prompt (**${name}**) requires authentication to access.\n\n` +
            `Please authenticate using one of these methods:\n` +
            `- OAuth: Microsoft, Google, or GitHub\n` +
            `- API Key: Provide your pAIchart API key\n` +
            `- Session: Log in via the web interface\n\n` +
            `Once authenticated, you'll have access to all platform features.`;
        }
      };
    }
    
    // AUTHENTICATED USER PATH
    // Database-first strategy for authenticated users
    if (this.dbPrompts.has(name)) {
      const dbPrompt = this.dbPrompts.get(name);

      // BUG-STANDALONE-004 fix (2026-05-23, Phase 3 sec-ops H1):
      // Gate cache-hit by isPublic for non-admins. loadDatabasePrompts()
      // caches ALL prompts including isPublic:false protocol prompts
      // (pipeline-orchestrator-protocol, artifact-synthesis-protocol — see
      // seed comment "never invoked via user-facing /prompt commands").
      // Without this gate, the cache-hit path bypassed the isPublic check
      // at loadDatabasePromptOnDemand:400, exposing internal protocol
      // content via /prompt {name} and prompts/get.
      const isAdmin = context?.user?.role === 'ADMIN' || context?.user?.role === 'SUPER_ADMIN';
      if (dbPrompt.isPublic === false && !isAdmin) {
        log.info(
          { promptName: name, securityEvent: true, userId: context?.user?.id },
          'Blocked non-admin access to isPublic:false prompt via cache-hit'
        );
        // Fall through to built-in fallback as if cache miss
        return this.prompts.get(name);
      }

      return {
        name: dbPrompt.name,
        description: dbPrompt.description,
        arguments: dbPrompt.variables ? Object.keys(dbPrompt.variables).map(key => ({
          name: key,
          description: dbPrompt.variables[key].description,
          required: dbPrompt.variables[key].required || false
        })) : [],
        content: async (args, context) => this.renderDatabasePrompt(dbPrompt, args, context)
      };
    }
    
    // Try loading from database on-demand for authenticated users
    const databasePrompt = await this.loadDatabasePromptOnDemand(name);
    if (databasePrompt) {
      return databasePrompt;
    }
    
    // Fallback to built-in prompts for authenticated users
    return this.prompts.get(name);
  }

  async loadDatabasePromptOnDemand(name) {
    if (!prisma) {
      return null;
    }

    try {
      const dbPrompt = await prisma.agentPromptLibrary.findFirst({
        where: {
          name: name,
          status: 'ACTIVE',
          isPublic: true,
          tags: { has: 'mcp' }
        }
      });

      if (!dbPrompt) {
        return null;
      }

      // Convert to executable format and cache
      const executablePrompt = {
        name: dbPrompt.name,
        description: dbPrompt.description,
        arguments: dbPrompt.variables ? Object.keys(dbPrompt.variables).map(key => ({
          name: key,
          description: dbPrompt.variables[key].description,
          required: dbPrompt.variables[key].required || false
        })) : [],
        content: async (args, context) => this.renderDatabasePrompt(dbPrompt, args, context)
      };

      // Cache for future use (uses bounded setDbPrompt helper)
      this.setDbPrompt(name, dbPrompt);

      return executablePrompt;
    } catch (error) {
      log.warn('Error loading database prompt on-demand', { err: error });
      return null;
    }
  }

  async renderDatabasePrompt(prompt, args = {}, context = null) {
    // Simple Handlebars-style variable substitution
    // Admin-only prompts are trusted (validation removed Nov 25, 2025)
    let content = prompt.promptText;

    // Process variables
    if (prompt.variables) {
      for (const [key, config] of Object.entries(prompt.variables)) {
        const value = args?.[key];
        const hasValue = value !== undefined && value !== null && value !== '';

        // Handle {{#if variable}}...{{else}}...{{/if}} blocks (with else clause)
        const ifElsePattern = new RegExp(`{{#if ${key}}}([\\s\\S]*?){{else}}([\\s\\S]*?){{/if}}`, 'g');
        content = content.replace(ifElsePattern, (match, truePart, falsePart) => {
          return hasValue ? truePart : falsePart;
        });

        // Handle {{#if variable}}...{{/if}} blocks (no else clause)
        const ifPattern = new RegExp(`{{#if ${key}}}([\\s\\S]*?){{/if}}`, 'g');
        content = content.replace(ifPattern, hasValue ? '$1' : '');

        // Handle {{variable}} substitutions (use provided value or default)
        const varPattern = new RegExp(`{{${key}}}`, 'g');
        const displayValue = hasValue ? String(value) : (config.default !== undefined && config.default !== null ? String(config.default) : '');
        content = content.replace(varPattern, displayValue);
      }
    }

    // Track usage
    await this.trackPromptUsage(prompt.id);

    return content;
  }

  async trackPromptUsage(promptId) {
    try {
      await prisma.agentPromptLibrary.update({
        where: { id: promptId },
        data: {
          usageCount: { increment: 1 },
          updatedAt: new Date()
        }
      });
    } catch (error) {
      log.debug('Failed to track usage', { err: error });
    }
  }

  listPrompts(context = null) {
    const isAuthenticated = !!(context?.user?.id);
    const isAdmin = context?.user?.role === 'ADMIN' || context?.user?.role === 'SUPER_ADMIN';

    if (!isAuthenticated) {
      // Unauthenticated users see no prompts - authentication required
      return [];
    }

    // Authenticated users see database prompts filtered by role (Dec 9, 2025)
    const databasePrompts = Array.from(this.dbPrompts.values())
      .filter(prompt => {
        // Check if prompt requires admin role
        const requiresAdmin = prompt.tags?.includes('admin');

        // Filter: Admins see all, regular users don't see admin prompts
        if (requiresAdmin && !isAdmin) {
          log.info({ promptName: prompt.name, securityEvent: true }, 'Filtering admin prompt from non-admin user');
          return false;
        }

        // BUG-STANDALONE-004 fix (2026-05-23, Phase 3 sec-ops H1):
        // Also filter isPublic:false prompts for non-admins. Previously
        // only the 'admin'-tag filter ran, leaving isPublic:false protocol
        // prompts (pipeline-orchestrator-protocol, artifact-synthesis-protocol)
        // visible + invocable. Aligns listPrompts with getPrompt cache-hit
        // gating (line 367-385) + on-demand isPublic:true filter (line 400).
        if (prompt.isPublic === false && !isAdmin) {
          log.info({ promptName: prompt.name, securityEvent: true }, 'Filtering isPublic:false prompt from non-admin user');
          return false;
        }

        return true;
      })
      .map(prompt => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.variables ? Object.keys(prompt.variables).map(key => ({
          name: key,
          description: prompt.variables[key].description,
          required: prompt.variables[key].required || false
        })) : [],
        source: 'database',
      category: prompt.category,
      rating: prompt.rating,
      usageCount: prompt.usageCount
    }));
    
    // For authenticated users, include non-duplicate built-in prompts
    const builtInPrompts = Array.from(this.prompts.values())
      .filter(prompt => !this.dbPrompts.has(prompt.name))
      .map(prompt => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
        source: 'built-in'
      }));
    
    return [...databasePrompts, ...builtInPrompts];
  }

  /**
   * Audit All Tasks Prompt
   * Lists all OPEN and IN_PROGRESS tasks across every visible POV
   * Demonstrates pagination exposure via returned/total counts
   */
  async createAuditAllTasksPrompt(args = {}, userContext = {}) {
    // Import type coercion helper for cross-platform compatibility
    const { coercePromptArguments } = require('../utils/type-coercion-helper');

    // 1. Parse arguments with defaults and type coercion
    const rawArgs = {
      status: args.status || 'OPEN,IN_PROGRESS,BLOCKED',
      povStatus: args.povStatus || 'IN_PROGRESS,STALLED,VALIDATION',
      includeCompleted: args.includeCompleted || false,
      maxPerPOV: args.maxPerPOV || 200,
      showAssignees: args.showAssignees !== undefined ? args.showAssignees : true,
      showPhaseInfo: args.showPhaseInfo !== undefined ? args.showPhaseInfo : true
    };

    // Type coercion for cross-platform compatibility (ChatGPT, Claude Desktop, Gemini)
    const coercedArgs = coercePromptArguments(rawArgs);
    const {
      status,
      povStatus,
      includeCompleted: includeCompletedBool,
      maxPerPOV: maxPerPOVInt,
      showAssignees: showAssigneesBool,
      showPhaseInfo: showPhaseInfoBool
    } = coercedArgs;

    // 2. Parse status lists
    const statusList = status.split(',').map(s => s.trim().toUpperCase());
    if (includeCompletedBool && !statusList.includes('COMPLETED')) {
      statusList.push('COMPLETED');
    }

    const povStatusList = povStatus.split(',').map(s => s.trim().toUpperCase());

    // Phase 1: Verbose instruction - Phrasing 3 (Meta-Instruction Format)
    let prompt = `<instruction role="system">
You are a detailed information assistant. Your task is to present the complete audit data below to the user. Do not summarize, abbreviate, or create an overview. Display every POV section, every task entry, and every detail exactly as shown.
</instruction>

`;

    prompt += `# 🔍 Task Audit Across All POVs\n\n`;
    prompt += `Filtering by task status: **${statusList.join(', ')}**\n`;
    prompt += `Filtering by POV status: **${povStatusList.join(', ')}**\n\n`;

    // 3. Initialize counters
    let globalCountByStatus = {};
    let totalTasksReturned = 0;
    let totalTasksAvailable = 0;
    let incompletePOVs = [];

    try {
      // 4. Get all visible POVs (respecting user access via ownership/membership)
      // SECURITY: CRITICAL FIX - Matches GET /api/pov pattern exactly
      // Pattern: validatePOVAccess (used in 27 files) - ownership/membership with ADMIN override
      const whereClause = {};

      // Build status filter (will be added to AND array for non-admins)
      const statusFilter = {
        status: povStatusList.length === 1 ? povStatusList[0] : { in: povStatusList }
      };

      // Add user access control (consistent with GET /api/pov and validatePOVAccess)
      if (userContext?.user) {
        const user = userContext.user;

        // ADMIN/SUPER_ADMIN: See all POVs (status filter only, no access restriction)
        if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
          log.info({ role: 'ADMIN', securityEvent: true }, 'audit_all_tasks - showing all POVs');
          Object.assign(whereClause, statusFilter);
        }
        // DEMO_USER: Owned + Team + Demo POVs
        else if (user.role === 'DEMO_USER') {
          const userAccessQuery = {
            OR: [
              { ownerId: user.id },
              {
                team: {
                  members: {
                    some: { userId: user.id }
                  }
                }
              },
              {
                metadata: {
                  path: ['isDemo'],
                  equals: true
                }
              }
            ]
          };

          // CRITICAL: AND both access control AND status filter
          whereClause.AND = [userAccessQuery, statusFilter];
          log.info({ role: 'DEMO_USER', securityEvent: true }, 'audit_all_tasks - filtering to owned + team + demo POVs');
        }
        // Regular USER: Owned + Team POVs only
        else {
          const userAccessQuery = {
            OR: [
              { ownerId: user.id },
              {
                team: {
                  members: {
                    some: { userId: user.id }
                  }
                }
              }
            ]
          };

          // CRITICAL: AND both access control AND status filter
          whereClause.AND = [userAccessQuery, statusFilter];
          log.info({ role: 'USER', securityEvent: true }, 'audit_all_tasks - filtering to owned + team POVs');
        }
      } else {
        // No user context - just apply status filter
        Object.assign(whereClause, statusFilter);
      }

      // Add tenant isolation if available (defense-in-depth)
      if (userContext?.user?.tenantId) {
        const tenantFilter = { tenantId: userContext.user.tenantId };
        if (!whereClause.AND) {
          Object.assign(whereClause, tenantFilter);
        } else {
          whereClause.AND.push(tenantFilter);
        }
      }

      // OPTIMIZATION: Use _count to batch task counts (Pattern 7: N+1 Prevention)
      // Reduces queries from 1 + 2N to 1 + N (21 → 11 queries for 10 POVs)
      // Reference: /.claude/knowledge/patterns/api-efficiency-patterns.md (Pattern 7)
      const povs = await prisma.pOV.findMany({
        where: whereClause,
        select: {
          id: true,
          title: true,
          customerName: true,
          status: true,
          _count: {
            select: {
              tasks: {
                where: { status: { in: statusList } }
              }
            }
          }
        },
        take: 10, // Limit POVs to prevent excessive queries
        orderBy: { createdAt: 'desc' }
      });

      if (povs.length === 0) {
        prompt += `⚠️ No POVs found. You may not have access to any active POVs, or there are no POVs with status IN_PROGRESS.\n\n`;
        prompt += `**Try:**\n`;
        prompt += `• Use \`project(action: "pov.list")\` to see all available POVs\n`;
        prompt += `• Check if you have the right permissions\n`;
        return prompt;
      }

      prompt += `📊 Found ${povs.length} POV(s) to audit:\n\n`;

      // 5. Iterate through each POV
      for (const pov of povs) {
        prompt += `---\n\n`;
        prompt += `## POV: ${pov.title}`;
        if (pov.customerName) {
          prompt += ` - ${pov.customerName}`;
        }
        prompt += ` (${pov.status})\n`;
        prompt += `**ID**: \`${pov.id}\`\n\n`;

        // 6. Get tasks for this POV with pagination awareness
        const tasks = await prisma.task.findMany({
          where: {
            povId: pov.id,
            status: { in: statusList }
          },
          include: {
            assignee: { select: { name: true, email: true } },
            phase: { select: { name: true } },
            stage: { select: { name: true } }
          },
          take: maxPerPOVInt,
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'desc' }
          ]
        });

        // 7. Get total from batched _count (N+1 Prevention - Pattern 7)
        // Total already fetched in POV query above (line 1025-1031)
        const totalTasksForPOV = pov._count.tasks;

        // 8. Format tasks
        if (tasks.length === 0) {
          prompt += `_No tasks found with status: ${statusList.join(', ')}_\n\n`;
        } else {
          tasks.forEach(task => {
            prompt += `• **${task.title}**`;
            prompt += ` | ${task.status}`;
            prompt += ` | ${task.priority || 'MEDIUM'}`;

            if (showAssigneesBool && task.assignee) {
              // strip control chars — defense-in-depth vs prompt-injection via a stored name
              prompt += ` | Assignee: ${String(task.assignee.name || '').replace(/[\x00-\x1F\x7F]/g, ' ')}`;
            }

            if (showPhaseInfoBool) {
              if (task.phase) {
                prompt += ` | ${task.phase.name}`;
              }
              if (task.stage) {
                prompt += ` → ${task.stage.name}`;
              }
            }

            // Add task ID and optionally phase/stage IDs
            prompt += ` | Task ID: ${task.id}`;
            if (showPhaseInfoBool && task.phaseId) {
              prompt += ` | Phase ID: ${task.phaseId}`;
            }
            if (showPhaseInfoBool && task.stageId) {
              prompt += ` | Stage ID: ${task.stageId}`;
            }
            prompt += `\n`;

            // Count by status for summary
            globalCountByStatus[task.status] = (globalCountByStatus[task.status] || 0) + 1;
          });

          // 9. Show pagination hint if incomplete (completeness detection)
          const hasMore = tasks.length < totalTasksForPOV;
          prompt += `\n`;

          if (hasMore) {
            prompt += `📄 **Returned ${tasks.length} of ${totalTasksForPOV} tasks** - ⚠️ More results available\n`;
            prompt += `   Use \`project(action: "task.list", povId: "${pov.id}", page: 2)\` to see additional tasks\n`;
            incompletePOVs.push({ name: pov.title, returned: tasks.length, total: totalTasksForPOV });
          } else {
            prompt += `✅ **Complete: ${tasks.length} of ${totalTasksForPOV} tasks**\n`;
          }
          prompt += `\n`;

          totalTasksReturned += tasks.length;
          totalTasksAvailable += totalTasksForPOV;
        }
      }

      // 10. Global summary
      prompt += `---\n\n`;
      prompt += `## Global Summary\n\n`;

      const statusCounts = Object.entries(globalCountByStatus)
        .map(([status, count]) => `${status} (${count})`)
        .join(', ');

      prompt += `**Total tasks:** ${totalTasksReturned} returned of ${totalTasksAvailable} available`;
      if (totalTasksReturned < totalTasksAvailable) {
        prompt += ` ⚠️\n`;
      } else {
        prompt += ` ✅\n`;
      }

      if (statusCounts) {
        prompt += `**By status:** ${statusCounts}\n`;
      }
      prompt += `**POVs scanned:** ${povs.length}\n\n`;

      // 11. Completeness indicators
      if (incompletePOVs.length > 0) {
        prompt += `⚠️ **Incomplete Results**: ${incompletePOVs.length} POV(s) have more tasks than displayed:\n`;
        incompletePOVs.forEach(pov => {
          prompt += `   • ${pov.name}: ${pov.returned}/${pov.total} tasks shown\n`;
        });
        prompt += `\n`;
        prompt += `**To see all tasks:** Use \`project(action: "task.list")\` with specific \`povId\` and pagination\n\n`;
      } else {
        prompt += `✅ **Complete Results**: All matching tasks displayed.\n\n`;
      }

      // 12. Next steps
      prompt += `## Next Steps\n\n`;
      prompt += `**Current Defaults:**\n`;
      prompt += `• Task status: OPEN, IN_PROGRESS, BLOCKED (actionable work)\n`;
      prompt += `• POV status: IN_PROGRESS, STALLED, VALIDATION (active/pending projects)\n\n`;

      prompt += `**Filter & Navigate:**\n`;
      prompt += `• **Specific POV tasks**: Use \`project(action: "task.list")\` with \`povId\` or \`pov_name\` parameter\n`;
      prompt += `• **Include completed tasks**: Re-run with \`includeCompleted=true\`\n`;
      prompt += `• **Only open tasks**: Use \`status="OPEN"\` to exclude in-progress and blocked\n`;
      prompt += `• **Completed POVs**: Use \`povStatus="WON,LOST"\` for won/lost projects\n`;
      prompt += `• **Pipeline POVs**: Use \`povStatus="PROJECTED"\` for forecasted projects\n`;
      prompt += `• **Active POVs only**: Use \`povStatus="IN_PROGRESS"\` to exclude stalled/validation\n`;
      prompt += `• **View POV details**: Use \`project(action: "pov.details")\` with POV ID or name\n\n`;

      prompt += `**Modify Display:**\n`;
      prompt += `• **Hide assignees**: Use \`showAssignees=false\`\n`;
      prompt += `• **Hide phase info**: Use \`showPhaseInfo=false\`\n`;
      prompt += `• **Increase per-POV limit**: Use \`maxPerPOV=500\` (default: 200)\n`;

    } catch (error) {
      log.error('audit_all_tasks error', { err: error });
      prompt += `\n⚠️ **Error**: Unable to fetch tasks. Please try again or contact support.\n`;
      prompt += `Error details: ${error.message}\n`;
    }

    return prompt;
  }


  /**
   * Track prompt access for metrics
   * (time-bomb-detection-pattern.md - Category 1: Bounded with LRU eviction)
   */
  trackPromptAccess(promptName, context = null) {
    try {
      const isAuthenticated = !!(context?.user?.id);
      const userId = context?.user?.id || 'anonymous';
      const timestamp = new Date().toISOString();

      // Simple in-memory tracking (could be enhanced with database storage)
      if (!this.accessMetrics) {
        this.accessMetrics = new Map();
      }

      const key = `${promptName}:${isAuthenticated ? 'auth' : 'unauth'}`;

      // LRU eviction if at capacity and this is a new key
      if (this.accessMetrics.size >= this.MAX_ACCESS_METRICS && !this.accessMetrics.has(key)) {
        const oldestKey = this.accessMetrics.keys().next().value;
        if (oldestKey) {
          this.accessMetrics.delete(oldestKey);
          this.mapEvictionStats.accessMetrics++;
          log.warn('LRU evicted oldest access metric', { evictedKey: oldestKey });
        }
      }

      const current = this.accessMetrics.get(key) || { count: 0, lastAccess: null, users: new Set() };

      current.count++;
      current.lastAccess = timestamp;

      // Cap users Set size to prevent unbounded growth
      if (current.users.size < this.MAX_USERS_PER_METRIC) {
        current.users.add(userId);
      }

      this.accessMetrics.set(key, current);

      // Log metrics periodically (every 100 accesses to reduce noise)
      const totalAccesses = Array.from(this.accessMetrics.values()).reduce((sum, m) => sum + m.count, 0);
      if (totalAccesses % 100 === 0) {
        this.logMetrics();
      }
    } catch (error) {
      log.debug('Failed to track access', { err: error });
    }
  }
  
  /**
   * Log prompt access metrics
   */
  logMetrics() {
    if (!this.accessMetrics || this.accessMetrics.size === 0) {
      return;
    }
    
    // Group by authentication status
    const authAccess = [];
    const unauthAccess = [];
    
    for (const [key, metrics] of this.accessMetrics.entries()) {
      const [promptName, authStatus] = key.split(':');
      const entry = {
        prompt: promptName,
        count: metrics.count,
        uniqueUsers: metrics.users.size,
        lastAccess: metrics.lastAccess
      };
      
      if (authStatus === 'auth') {
        authAccess.push(entry);
      } else {
        unauthAccess.push(entry);
      }
    }
    
    // Sort by access count
    authAccess.sort((a, b) => b.count - a.count);
    unauthAccess.sort((a, b) => b.count - a.count);
    
    log.info({
      authenticated: authAccess.slice(0, 5),
      unauthenticated: unauthAccess.slice(0, 5),
      totalMetrics: this.accessMetrics.size
    }, 'Prompt access statistics');
  }
  
  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    if (!this.accessMetrics) {
      return { authenticated: [], unauthenticated: [], total: 0 };
    }
    
    const authenticated = [];
    const unauthenticated = [];
    let total = 0;
    
    for (const [key, metrics] of this.accessMetrics.entries()) {
      const [promptName, authStatus] = key.split(':');
      total += metrics.count;
      
      const entry = {
        prompt: promptName,
        count: metrics.count,
        uniqueUsers: metrics.users.size,
        lastAccess: metrics.lastAccess
      };
      
      if (authStatus === 'auth') {
        authenticated.push(entry);
      } else {
        unauthenticated.push(entry);
      }
    }
    
    return { authenticated, unauthenticated, total };
  }

  /**
   * Get built-in prompts for MCP list_prompts integration
   * Filters by authentication status to avoid duplication
   */
  getBuiltInPrompts(context) {
    const isAuthenticated = !!(context?.user?.id);
    if (!isAuthenticated) return [];

    const prompts = [];
    for (const [name, prompt] of this.prompts.entries()) {
      prompts.push({
        name: prompt.name,
        description: prompt.description,
        usage: `/prompt ${prompt.name}`,
        category: 'WORKFLOW',
        source: 'built-in',
        tags: ['mcp', 'workflow'],
        arguments: prompt.arguments || []
      });
    }

    return prompts;
  }
}

module.exports = { PromptRegistry, setPrismaInstance };