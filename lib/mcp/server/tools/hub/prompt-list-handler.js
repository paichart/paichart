/**
 * MCP Hub Prompt List Handler
 *
 * Handles prompt discovery and listing with authentication-based access control.
 *
 * @module prompt-list-handler
 * @version 1.0.0
 * @extracted Phase 3.5 Task 2G (Dec 15, 2025) from hub-tools-handler.js
 *
 * @description Provides authentication-aware prompt listing:
 *   - Unauthenticated users: Onboarding prompts only
 *   - Authenticated users: Full prompt library with filtering
 *   - Database prompt integration via Prisma
 *   - Built-in prompt registry integration
 */

// Dec 2025 UX Assessment: Import error helpers
const { enhancedOperationError } = require('./error-helpers');
// Phase 1.6 (2026-05-18): TOOL_SCHEMAS no longer imported here — args arrive
// pre-validated via wrapWithSchema at the registration site (mcp-server-v5.js).
// The in-handler safeParse was redundant phantom-canonical drift.
const { extractAuthContext } = require('./hub-shared-middleware');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-prompt-list' }));

/**
 * Prompt List Handler
 *
 * @class PromptListHandler
 * @description Handles prompt listing with authentication-based filtering.
 */
class PromptListHandler {
  /**
   * Creates Prompt List Handler instance
   *
   * @param {Object} prisma - Prisma client for database prompts
   * @param {PromptRegistry} [promptRegistry=null] - Optional prompt registry for built-in prompts
   *
   * @description Initializes handler with database client and optional registry
   *   for combining built-in and database prompts.
   */
  constructor(prisma, promptRegistry = null) {
    this.prisma = prisma;
    this.promptRegistry = promptRegistry;
  }

  /**
   * Handle list_prompts tool call
   *
   * @param {Object} args - Prompt listing arguments
   * @param {string} [args.query] - Search query for prompt filtering
   * @param {string} [args.domain] - Domain filter (POV, tasks, etc.)
   * @param {string} [args.povId] - POV CUID for context-specific prompts
   * @param {boolean} [args.mcpOnly=false] - Include only MCP-specific prompts
   * @param {Object} [context] - User authentication context (optional)
   * @param {Object} [context.user] - Authenticated user object
   *
   * @returns {Promise<Object>} Prompt listing result
   * @returns {Array<Object>} returns.prompts - Available prompts
   * @returns {string} returns.prompts[].name - Prompt name
   * @returns {string} returns.prompts[].description - Prompt description
   * @returns {string} returns.prompts[].usage - Usage instructions
   * @returns {string} returns.prompts[].category - Prompt category
   *
   * @description Provides authentication-based prompt strategy:
   *   - Unauthenticated: Only onboarding prompts (discover platform, request trial, etc.)
   *   - Authenticated: Full prompt library with filtering (query, domain, POV context)
   *
   * @example
   * // Unauthenticated access
   * const onboardingPrompts = await handler.handle({}, {});
   *
   * // Authenticated access with filtering
   * const filtered = await handler.handle(
   *   { query: 'orchestrate', domain: 'POV' },
   *   { user: { id: 'user123' } }
   * );
   */
  async handle(args, context) {
    try {
      // Phase 1.6 (2026-05-18): args arrive already validated via wrapWithSchema
      // at the registration site (mcp-server-v5.js). The prior in-handler
      // safeParse here was a redundant phantom-canonical sibling — its schema
      // lookup (TOOL_SCHEMAS.list_prompts.inputSchema) is the same one
      // validateDispatchArgs now runs at the dispatch boundary.

      // Standardized auth extraction (defense-in-depth with tool-security.js)
      const { userId, role: userRole } = extractAuthContext(context, 'Prompt listing');

      log.info({ query: args.query, domain: args.domain, povId: args.povId, mcpOnly: args.mcpOnly, userId }, 'List prompts called');
      const isAdminRole = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

      const where = {
        status: 'ACTIVE',
      };

      // Non-admin users only see public prompts (prevents confusion with unusable prompts)
      if (!isAdminRole) {
        where.isPublic = true;
      }
      // Admin users see all prompts (no isPublic filter)

      // Only MCP-tagged prompts (default true for MCP context)
      // Only show non-MCP prompts if explicitly requested with mcpOnly=false
      if (args.mcpOnly !== false) {
        where.tags = { has: 'mcp' };
      }

      // Domain filtering
      if (args.domain) {
        where.tags = { hasEvery: ['mcp', `domain:${args.domain}`] };
      }

      // Category filtering with validation
      if (args.category) {
        // Valid AgentCategory enum values from Prisma schema
        const validCategories = [
          'GENERAL', 'DEVELOPMENT', 'TESTING', 'DOCUMENTATION', 'ANALYSIS',
          'AUTOMATION', 'REVIEW', 'DEPLOYMENT', 'MONITORING', 'SECURITY',
          'MCP_SERVICE_REGISTRY', 'MCP_SERVICE_DISCOVERY', 'MCP_SERVICE_INTEGRATION',
          'MCP_SERVICE_QA', 'MCP_ORCHESTRATION'
        ];

        // Map common aliases to valid categories
        const categoryAliases = {
          'WORKFLOW': 'AUTOMATION',
          'ONBOARDING': 'GENERAL',
          'SERVICE': 'MCP_SERVICE_REGISTRY',
          'DISCOVERY': 'MCP_SERVICE_DISCOVERY',
          'ORCHESTRATION': 'MCP_ORCHESTRATION',
          'QA': 'MCP_SERVICE_QA'
        };

        const requestedCategory = args.category.toUpperCase();
        const mappedCategory = categoryAliases[requestedCategory] || requestedCategory;

        if (!validCategories.includes(mappedCategory)) {
          // Return helpful result instead of throwing
          return {
            prompts: [],
            total: 0,
            query: args,
            status: 'INVALID_CATEGORY',
            message: `Invalid category: "${args.category}"`,
            validCategories: validCategories.slice(0, 10),
            suggestions: [
              `Try: category: "AUTOMATION" for workflow prompts`,
              `Try: category: "ANALYSIS" for analytical prompts`,
              `Try: list_prompts() without category to see all prompts`
            ],
            _meta: {
              tool: 'list_prompts',
              timestamp: new Date().toISOString(),
              sdkNative: true
            }
          };
        }

        where.category = mappedCategory;
      }

      // Natural language query processing
      if (args.query) {
        const searchTerms = this.extractSearchTerms(args.query);
        // Match ANY term in name/description/useCase (not exact phrase)
        // Each term generates OR conditions, so "workflow orchestrate" matches either word
        const termConditions = searchTerms.flatMap(term => [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { useCase: { contains: term, mode: 'insensitive' } }
        ]);
        // Also match tags (hasSome already handles array matching)
        termConditions.push({ tags: { hasSome: searchTerms } });
        where.OR = termConditions;
      }

      // POV context processing
      let povContext = null;
      if (args.povId) {
        povContext = await this.getPOVContext(args.povId);
        const povDomain = this.detectPOVDomain(povContext);
        if (povDomain && povDomain !== 'general') {
          where.tags = { hasEvery: ['mcp', `domain:${povDomain}`] };
        }
      }

      const prompts = await this.prisma.agentPromptLibrary.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          promptText: args.includeUsage,
          tags: true,
          usageCount: true,
          rating: true,
          useCase: true,
          variables: true,
          examples: true
        },
        orderBy: [
          { usageCount: 'desc' },
          { rating: 'desc' }
        ],
        // BUG-STANDALONE-011 CSD-2 fix (2026-05-23, Phase 3 validation-engine):
        // aligned with schema cap (100). Handler's 200 cap was dead code —
        // schema validation runs first at the dispatch boundary and rejects
        // anything > 100. BC41 belt-and-braces preserved but matched to the
        // schema-enforced ceiling.
        take: Math.min(Math.max(1, args.limit || 20), 100) // BC41 + CSD-2: cap aligns with schema max(100)
      });

      const formattedPrompts = prompts.map(prompt => ({
        name: prompt.name,
        description: prompt.description,
        usage: `/prompt ${prompt.name}`,
        category: prompt.category,
        domain: this.extractDomainFromTags(prompt.tags),
        usageCount: prompt.usageCount,
        rating: prompt.rating,
        // Truncate useCase to prevent massive response sizes (some have 5000+ chars)
        useCase: prompt.useCase?.length > 200
          ? prompt.useCase.substring(0, 200) + '...'
          : prompt.useCase,
        tags: prompt.tags,
        ...(args.includeUsage && {
          promptPreview: prompt.promptText?.substring(0, 200) + '...',
          variables: prompt.variables,
          examples: prompt.examples
        })
      }));

      // Merge built-in prompts from PromptRegistry (with same filters applied)
      let builtInPrompts = this.promptRegistry?.getBuiltInPrompts(context) || [];

      // Apply query/domain/category filters to built-in prompts (DB prompts already filtered by Prisma)
      if (args.query) {
        const searchTerms = this.extractSearchTerms(args.query);
        builtInPrompts = builtInPrompts.filter(p => {
          const text = `${p.name} ${p.description || ''}`.toLowerCase();
          return searchTerms.some(term => text.includes(term)) ||
            (p.tags && searchTerms.some(term => p.tags.includes(term)));
        });
      }
      if (args.domain) {
        builtInPrompts = builtInPrompts.filter(p =>
          p.tags && p.tags.includes(`domain:${args.domain}`)
        );
      }
      if (args.category) {
        const requestedCategory = args.category.toUpperCase();
        const categoryAliases = { 'WORKFLOW': 'AUTOMATION', 'ONBOARDING': 'GENERAL', 'SERVICE': 'MCP_SERVICE_REGISTRY', 'DISCOVERY': 'MCP_SERVICE_DISCOVERY', 'ORCHESTRATION': 'MCP_ORCHESTRATION', 'QA': 'MCP_SERVICE_QA' };
        const mappedCategory = categoryAliases[requestedCategory] || requestedCategory;
        builtInPrompts = builtInPrompts.filter(p => p.category === mappedCategory);
      }

      // Deduplicate: database prompts take priority over built-in
      const dbNames = new Set(formattedPrompts.map(p => p.name));
      const uniqueBuiltIn = builtInPrompts.filter(p => !dbNames.has(p.name));

      // Combine database + built-in prompts
      const allPrompts = [...formattedPrompts, ...uniqueBuiltIn];

      // BUG-STANDALONE-011 CSD-3 fix (2026-05-23, Phase 3 validation-engine):
      // `total` previously claimed 'Count of matching prompts' (per tool
      // description) but was actually the POST-truncation count. Keep `total`
      // (backward-compat) but document the semantic. Add `returned` as an
      // explicit synonym. When unbounded-count matters (rare in MCP filter-
      // narrow UX), add a separate count(*) query without `take`.
      // Dec 2025 UX Assessment Fix 3: Add _meta for consistency
      return {
        prompts: allPrompts,
        total: allPrompts.length, // post-filter, post-limit (NOT the unbounded match count)
        returned: allPrompts.length,
        query: args,
        povContext: povContext,
        naturalLanguageQuery: args.query,
        suggestions: args.query ? this.generateQuerySuggestions(args.query) : null,
        availableVia: "tool_access",
        timestamp: new Date().toISOString(),
        _meta: {
          tool: 'list_prompts',
          timestamp: new Date().toISOString(),
          sdkNative: true
        },
        nextSteps: allPrompts.length > 0
          ? [
              `Found ${allPrompts.length} prompt${allPrompts.length === 1 ? '' : 's'}`,
              `Execute a prompt: prompt_command(promptName: '${allPrompts[0].name}')`,
              "Prompts help automate common Hub workflows"
            ]
          : [
              "No prompts match your query",
              "Try: list_prompts() to see all available prompts",
              "Or: list_prompts(category: 'WORKFLOW') for workflow templates"
            ]
      };
    } catch (error) {
      log.error({ err: error }, 'List prompts failed');

      // Dec 2025 UX Assessment: Use centralized error helper with 4-emoji format
      throw enhancedOperationError('Prompt listing', error, {
        validParams: [
          'query: Search term (e.g., "orchestrate", "workflow")',
          'domain: "POV", "tasks", "agents", "general"',
          'category: "WORKFLOW", "ANALYSIS", "ONBOARDING"'
        ],
        examples: [
          'list_prompts({ query: "orchestrate" }) → Search for orchestration prompts',
          'list_prompts({ domain: "POV" }) → POV-related prompts',
          'list_prompts({}) → All available prompts'
        ],
        tips: [
          'Authenticate for access to all prompts',
          'Use prompt_command() to execute a found prompt'
        ]
      });
    }
  }

  // Helper methods for natural language processing and POV integration

  extractSearchTerms(query) {
    return query.toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .map(term => term.replace(/[^\w]/g, ''));
  }

  async getPOVContext(povId) {
    try {
      return await this.prisma.pOV.findUnique({
        where: { id: povId },
        select: {
          id: true,
          title: true,
          description: true,
          objective: true,
          metadata: true,
          phases: {
            select: { name: true, type: true }
          }
        }
      });
    } catch (error) {
      log.error({ err: error }, 'Error getting POV context');
      return null;
    }
  }

  detectPOVDomain(povContext) {
    if (!povContext) return 'general';

    const text = `${povContext.title} ${povContext.description} ${povContext.objective}`.toLowerCase();

    const domainKeywords = {
      education: ['course', 'lesson', 'student', 'curriculum', 'education', 'learning', 'teaching'],
      devops: ['infrastructure', 'deployment', 'server', 'network', 'firewall', 'devops', 'configuration'],
      medical: ['patient', 'treatment', 'medical', 'healthcare', 'clinical', 'diagnosis', 'care'],
      finance: ['portfolio', 'investment', 'financial', 'trading', 'analysis', 'market', 'economic'],
      legal: ['contract', 'legal', 'compliance', 'agreement', 'law', 'regulation', 'policy']
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return domain;
      }
    }

    return 'general';
  }

  extractDomainFromTags(tags) {
    const domainTag = tags.find(tag => tag.startsWith('domain:'));
    return domainTag ? domainTag.replace('domain:', '') : 'general';
  }

  generateQuerySuggestions(query) {
    const suggestions = [];
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('firewall') || lowerQuery.includes('security') || lowerQuery.includes('network')) {
      suggestions.push('Try: "devops infrastructure prompts"', 'Try: "security configuration guidance"');
    }
    if (lowerQuery.includes('lesson') || lowerQuery.includes('course') || lowerQuery.includes('student')) {
      suggestions.push('Try: "education planning prompts"', 'Try: "curriculum development guidance"');
    }
    if (lowerQuery.includes('patient') || lowerQuery.includes('treatment') || lowerQuery.includes('medical')) {
      suggestions.push('Try: "medical workflow prompts"', 'Try: "patient care guidance"');
    }
    if (lowerQuery.includes('portfolio') || lowerQuery.includes('investment') || lowerQuery.includes('trading')) {
      suggestions.push('Try: "finance analysis prompts"', 'Try: "investment planning guidance"');
    }

    return suggestions;
  }
}

module.exports = { PromptListHandler };
