/**
 * ChatGPT Connector Handler
 *
 * Implements OpenAI MCP connector specification for ChatGPT integration with pAIchart.
 * Provides search and fetch tools with PostgreSQL full-text search optimization.
 *
 * @class ChatGPTConnectorHandler
 * @version 1.0.0
 * @description Core features:
 *   - Search across POVs, tasks, executions, and agent templates
 *   - Direct JSON response format per OpenAI MCP specification
 *   - Parallel searches with Promise.all optimization
 *   - Resource fetch with robust ID parsing and validation
 *   - Transaction isolation for consistency
 *   - Global Prisma singleton for connection pooling
 *
 * @performance Optimized with:
 *   - Parallel Promise.all searches (4 concurrent queries)
 *   - Connection pool reuse via global Prisma singleton
 *   - Transaction isolation (ReadCommitted, 10s timeout)
 *
 *   NOTE (Phase 3 chatgpt-connector specialist finding + production audit, 2026-05-23):
 *   The migration `20250925_add_text_search_indices` created 6 GIN tsvector
 *   indices but the search query at lines ~567/1159/1301 uses Prisma
 *   `{ contains: word, mode: 'insensitive' }` = ILIKE, which CANNOT use
 *   GIN tsvector indices (only @@/to_tsquery can).
 *
 *   Production audit (2026-05-23 ssh + psql) confirmed all 6 indices had
 *   idx_scan=0 lifetime — NOTHING used them (not MCP search, not web UI).
 *   Per [[feedback_defend_vs_delete_dead_code]] all 6 were DROPPED at this
 *   session's commit. Search performance unchanged (seq scan over <400
 *   rows is sub-2ms anyway).
 *
 *   If ts_rank migration becomes valuable (DB grows ~10x), fresh indices
 *   should be created with measured field weights + appropriate stopwords —
 *   NOT a revert of 20250925.
 *
 *   Self-correction note: previous version of this comment falsely claimed
 *   the indices "still serve the web UI's full-text search path" — same
 *   phantom-canonical anti-pattern as the original "10-50x" claim. Lesson
 *   reinforced: don't assert behavior without verifying.
 *
 * @security
 *   - POV access control: search/fetch scoped to user's owned/team-member POVs (F9 fix, Feb 2026)
 *   - Admin bypass: ADMIN/SUPER_ADMIN users see all resources
 *   - ID validation with regex patterns (pov-*, task-*, execution-*, template-*)
 *   - Content size limits (50KB max per fetch)
 *   - Transaction isolation for consistency
 *   - Fetch access check: validates POV access before returning resource details
 */

// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma: globalPrisma } = require('../../../prisma');
const { stderr, createAdapter } = require('../mcp-logger');
// 2026-05-17 (Finding: chatgpt-connector fail-open + DEMO_USER gap):
//   - extractAuthContext: canonical hub-convention auth check, throws on missing
//     user with the standard 4-method auth message. All 10 other hub handlers
//     use this same primitive (sibling consistency per mcp-hub-specialist review).
//   - buildPOVAccessFilterWithRole: canonical POV-access filter helper used by 9+
//     endpoints, specialist-reviewed (auth-permissions 95%, api-efficiency 94%,
//     architectural-review 95%). Handles ADMIN/SUPER_ADMIN (no filter), USER
//     (owner + team), DEMO_USER (owner + team + isDemo metadata).
// Replaces 5 inline `if (userId && !isAdmin)` reimplementations that fail-open
// on missing userId and miss the DEMO_USER case.
const { extractAuthContext } = require('./hub/hub-shared-middleware');
const { buildPOVAccessFilter, buildPOVAccessFilterWithRole } = require('../../../pov/auth/pov-access-filter');
const { capText } = require('./cap-text');
const { markValidationProvenance } = require('./validation-provenance');
// round 3 Probe B (2026-05-26): per-user throttle on full-text search (the MCP path was unthrottled).
const { apiRateLimiter } = require('../../../utils/rate-limiter');
// BUG-BASIC-XSS-1 Phase 2.3: JSON.stringify does NOT escape <,>,& — confirmed
// by boundary-contract specialist. GAP-1 fix: sanitize user-supplied strings
// BEFORE they reach JSON.stringify. ChatGPT connector is the biggest bypass
// path (search + fetch — every ChatGPT integration call).
const { sanitizeForResponse } = require('./response-sanitizer');
const log = createAdapter(stderr.mcpLogger.child({ component: 'chatgpt-connector' }));
// const { createQueryTimer } = require('../../../utils/performance'); // TODO: Add performance monitoring when available

class ChatGPTConnectorHandler {
  /**
   * Creates ChatGPT Connector Handler
   *
   * @param {Object} [prisma=null] - Prisma client (uses global singleton if not provided)
   *
   * @description Dependency injection pattern - accepts Prisma client or falls back to
   *   global singleton. Never creates new Prisma instances to prevent connection pool exhaustion.
   */
  constructor(prisma = null) {
    // DI pattern: Use injected prisma or fall back to global singleton (never create new)
    this.prisma = prisma || globalPrisma;
  }

  /**
   * Handle search tool - Search across POVs, tasks, executions, templates
   *
   * @param {Object} args - Search arguments
   * @param {string} args.query - Search query string (case-insensitive)
   * @param {Object} [context] - User authentication context (optional)
   *
   * @returns {Promise<Object>} MCP response with search results
   * @returns {Array<Object>} returns.content - Response content array
   * @returns {string} returns.content[0].type - Content type ("text")
   * @returns {string} returns.content[0].text - JSON string with {results: [...]} wrapper
   * @returns {boolean} [returns.isError] - Error flag (only present on error)
   *
   * @description Searches across 4 resource types in parallel via Prisma ILIKE.
   *   (Doc previously claimed GIN tsvector usage — corrected 2026-05-23 per Phase 3 audit;
   *   see file header NOTE for the tsquery migration plan tracked in #224.)
   *   Returns direct JSON format per OpenAI MCP specification: {results: [...]}.
   *
   *   Search Coverage:
   *   - POVs: title, description, objective (20 results max)
   *   - Tasks: title, description (25 results max)
   *   - Agent Executions: via task title (15 results max)
   *   - Agent Templates: name, description (10 results max)
   *
   *   Result Format: {id: "type-id", title, url, metadata: {...}}
   *
   * @performance
   *   - Prisma ILIKE (mode: 'insensitive') across multiple text fields
   *     (NOT GIN tsvector — see file header NOTE + #224)
   *   - Parallel searches: 4 queries via Promise.all (not sequential)
   *   - Transaction isolation: ReadCommitted (5s maxWait, 10s timeout)
   *
   * @example
   * const results = await handler.handleSearch(
   *   { query: "authentication" },
   *   { user: { id: "user123" } }
   * );
   * // Returns: {results: [{id: "pov-123", title: "Auth POV", ...}, ...]}
   */
  async handleSearch(args, context) {
    const timer = typeof createQueryTimer !== 'undefined' ? createQueryTimer('chatgpt_search') : null;

    try {
      const { query } = args;

      // Dec 2025 UX Assessment: Add guidance for empty queries (Fix 7)
      if (!query || query.trim() === '') {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              results: [],
              message: "Empty search query - please provide search terms",
              examples: [
                "search('CyberDefense') - Find CyberDefense resources",
                "search('validation') - Find validation tasks",
                "search('QA testing') - Find testing templates"
              ],
              _meta: {
                tool: 'search',
                emptyReason: 'no_query',
                nextSteps: [
                  "Provide search keywords",
                  "Use project(action: 'pov.list') for structured POV browsing",
                  "Use project(action: 'task.list') for task filtering by status"
                ]
              }
            })
          }]
        };
      }

      // 2026-05-17: canonical hub-convention auth gate. Throws on missing user
      // with the standard 4-method auth message (sibling to all 10 other hub
      // handlers). Replaces the prior warn-and-proceed which fail-opened when
      // userId was undefined (cross-tenant leak via the test endpoint and any
      // other caller that didn't propagate user context).
      const { userId, role: userRole } = extractAuthContext(context, 'Search');
      const user = { userId, role: userRole };

      // round 3 Probe B: per-user rate limit on full-text search (MCP path was unthrottled).
      const searchAllowed = await apiRateLimiter.checkLimit(`search:${userId}`);
      if (!searchAllowed) {
        const resetTime = apiRateLimiter.getResetTime(`search:${userId}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({ results: [], _meta: { error: 'rate_limited', message: `Search rate limit exceeded (100/min per user). Retry after ${resetTime.toISOString()}` } }) }]
        };
      }

      // Use transaction for consistency (Phase-Stage Specialist recommendation)
      const results = await this.prisma.$transaction(async (tx) => {
        // Search across multiple models in parallel
        const [povs, tasks, executions, templates] = await Promise.all([
          this.searchPOVs(query, tx, user),
          this.searchTasks(query, tx, user),
          this.searchExecutions(query, tx, user),
          this.searchAgentTemplates(query, tx)  // Templates are shared - no POV scoping
        ]);

        // Format results for ChatGPT
        return this.formatSearchResults(povs, tasks, executions, templates);
      }, {
        isolationLevel: 'ReadCommitted',
        maxWait: 5000,
        timeout: 10000
      });

      // BUG-BASIC-XSS-1 Phase 2.3: sanitize args.query before echo. Also
      // sanitize result titles (DB-sourced, may carry historical pollution).
      // results[*].id is CUID — safe.
      const safeQuery = sanitizeForResponse(args.query);
      const safeResults = results.map(r => ({
        ...r,
        title: r.title != null ? sanitizeForResponse(r.title) : r.title,
        // Defensive on text fields too (snippet/text may be DB content)
        ...(r.text != null ? { text: sanitizeForResponse(r.text) } : {}),
      }));

      // IMPORTANT: Return results wrapped in {results: [...]} per OpenAI MCP spec
      // ChatGPT expects search results in this wrapped format for consistency
      // Dec 2025 UX Assessment: Added _meta with nextSteps for workflow guidance
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            results: safeResults,
            _meta: {
              tool: 'search',
              query: safeQuery,
              resultCount: safeResults.length,
              timestamp: new Date().toISOString(),
              nextSteps: safeResults.length > 0
                ? [
                    `Found ${safeResults.length} results for "${safeQuery}"`,
                    `Fetch details: fetch("${safeResults[0]?.id || 'resource-id'}")`,
                    `Refine search: search("more specific query")`
                  ]
                : [
                    `No results found for "${safeQuery}"`,
                    `Try broader search terms`,
                    `Use project(action: 'pov.list') or project(action: 'task.list') to browse available resources`
                  ]
            }
          })
        }]
      };
    } catch (error) {
      log.error('Search error', { err: error });
      // Dec 2025 UX Assessment: Return error object with recovery (Fix 3)
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            results: [],
            error: "Search failed",
            message: "Unable to complete search. Please try again.",
            _meta: {
              tool: 'search',
              // Protocol 10 / F-SWEEP-4 (2026-07-17): `recoverable` was a hardcoded
              // VERDICT (unearned, never true-vs-false measured) and our own invention —
              // not an OpenAI search/fetch contract field, read by no consumer, pinned by
              // no test. Dropped from all six error paths. The FACT `errorType` classifies
              // the failure; `nextSteps` carries the recovery ROUTE. (2026-05-29 lens:
              // ship facts, decline the verdict.)
              errorType: 'SEARCH_FAILURE',
              nextSteps: [
                "Retry the search with simpler terms",
                "Use project(action: 'pov.list') as an alternative",
                "Use project(action: 'task.list') to browse by status"
              ]
            }
          })
        }],
        isError: true
      };
    } finally {
      if (timer) timer.end();
    }
  }

  /**
   * Handle fetch tool - Fetch detailed resource by ID
   *
   * @param {Object} args - Fetch arguments
   * @param {string} args.id - Resource ID with format: type-id (e.g., "pov-clxy123")
   * @param {Object} [context] - User authentication context (optional)
   *
   * @returns {Promise<Object>} MCP response with resource details
   * @returns {Array<Object>} returns.content - Response content array
   * @returns {string} returns.content[0].type - Content type ("text")
   * @returns {string} returns.content[0].text - JSON string with direct resource object
   * @returns {boolean} [returns.isError] - Error flag (only present on error)
   *
   * @description Fetches comprehensive resource details by ID with robust validation.
   *   Returns direct object format per OpenAI MCP specification (not wrapped).
   *
   *   Supported ID Formats:
   *   - POV: "pov-{cuid}" → Full POV with phases, stages, task samples
   *   - Task: "task-{cuid}" → Task with execution history and artifacts
   *   - Execution: "execution-{cuid}" → Execution with logs and artifacts
   *   - Template: "template-{cuid}" → Agent template with usage stats
   *
   *   Response Structure: {id, title, text, url, metadata: {...}}
   *
   * @security
   *   - ID validation: Regex pattern /^(pov|task|execution|template)-(.+)$/
   *   - Content size limits: 50KB max per resource (truncated if exceeded)
   *   - Authentication-aware (context optional for public resources)
   *
   * @throws {Error} Returns isError=true for:
   *   - Missing ID
   *   - Invalid ID format
   *   - Resource not found
   *   - Fetch failures
   *
   * @example
   * const resource = await handler.handleFetch(
   *   { id: "pov-clxy123" },
   *   { user: { id: "user123" } }
   * );
   * // Returns: {id: "clxy123", title: "Auth POV", text: "...", url: "...", metadata: {...}}
   */
  async handleFetch(args, context) {
    const timer = typeof createQueryTimer !== 'undefined' ? createQueryTimer('chatgpt_fetch') : null;

    try {
      const { id } = args;

      // Dec 2025 UX Assessment: Add recovery guidance (Fix 5)
      if (!id) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Missing resource ID",
              message: "Please provide a resource ID to fetch",
              expectedFormat: "type-id (e.g., pov-123, task-456, template-789)",
              validTypes: ["pov", "task", "execution", "template", "artifact"],
              _meta: {
                tool: 'fetch',
                errorType: 'MISSING_ID',
                nextSteps: [
                  "Use search() to find resource IDs",
                  "Use project(action: 'pov.list') to see available POV IDs",
                  "Use project(action: 'task.list') to see task IDs"
                ]
              }
            })
          }],
          isError: true
        };
      }

      // Robust ID parsing with validation (MCP Protocol Debug recommendation)
      // BUG-STANDALONE-011 PR-5 fix (2026-05-23, Phase 3 validation-engine):
      // tightened the greedy `(.+)` to CUID-shape `[a-z0-9]{20,32}`. The
      // greedy form matched `pov-cmXXX-extra-suffix` with id=cmXXX-extra-suffix
      // and returned 'Resource not found' instead of 'Invalid format'. Now
      // surfaces format error early so callers know to recopy from search.
      const match = id.match(/^(pov|task|execution|template|artifact)-([a-z0-9]{20,32})$/);
      // Dec 2025 UX Assessment: Add recovery guidance (Fix 5)
      if (!match) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Invalid ID format",
              // BUG-BASIC-XSS-1 Phase 2.3: `id` is the rejected user input — XSS vector.
              message: `Invalid resource ID format: ${sanitizeForResponse(id)}`,
              expectedFormat: "type-id (e.g., pov-123, task-456, artifact-789)",
              validTypes: ["pov", "task", "execution", "template", "artifact"],
              received: sanitizeForResponse(id),
              _meta: {
                tool: 'fetch',
                errorType: 'INVALID_FORMAT',
                nextSteps: [
                  "Check that ID includes type prefix (pov-, task-, etc.)",
                  "Use search() to find the correct resource ID",
                  "Copy ID directly from search results"
                ]
              }
            })
          }],
          isError: true
        };
      }

      const [, type, resourceId] = match;

      // 2026-05-17: canonical hub-convention auth gate. Throws on missing user
      // (replaces the prior `if (userId && !isAdmin && ...)` that fail-opened on
      // missing userId — fetch would have returned the resource without an
      // access check). Templates remain bypass-eligible after extraction.
      const { userId, role: userRole } = extractAuthContext(context, 'Fetch');
      const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

      if (!isAdmin && type !== 'template') {
        const hasAccess = await this.checkResourceAccess(type, resourceId, { userId, role: userRole });
        if (!hasAccess) {
          // Return "not found" to avoid revealing resource existence
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "Resource not found",
                // BUG-BASIC-XSS-1 Phase 2.3: id + resourceId are user input.
                // type is enum-validated upstream — safe.
                id: sanitizeForResponse(id),
                resourceType: type,
                message: `No ${type} found with ID: ${sanitizeForResponse(resourceId)}`,
                _meta: {
                  tool: 'fetch',
                  errorType: 'NOT_FOUND',
                  nextSteps: [
                    `Use search("${sanitizeForResponse(resourceId.substring(0, 8))}...") to find resources you have access to`,
                    type === 'pov' ? `Use project(action: 'pov.list') to see your POVs` : null,
                    type === 'task' ? `Use project(action: 'task.list') to see your tasks` : null
                  ].filter(Boolean)
                }
              })
            }],
            isError: true
          };
        }
      }

      const document = await this.fetchResourceByType(type, resourceId);

      // Handle not found with fuzzy suggestions (Dec 2025 UX Assessment)
      if (!document) {
        const suggestions = await this.getFuzzySuggestions(type, resourceId, { userId, role: userRole }, 5);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Resource not found",
              // BUG-BASIC-XSS-1 Phase 2.3: id + resourceId + suggestion.title (DB) sanitized.
              id: sanitizeForResponse(id),
              resourceType: type,
              message: `No ${type} found with ID: ${sanitizeForResponse(resourceId)}`,
              suggestions: suggestions.length > 0
                ? suggestions.map(s => ({
                    ...s,
                    title: s.title != null ? sanitizeForResponse(s.title) : s.title
                  }))
                : undefined,
              hint: suggestions.length > 0
                ? `Did you mean one of these? ${suggestions.map(s => sanitizeForResponse(s.title)).join(', ')}`
                : `Try search("${sanitizeForResponse(resourceId)}") to find similar resources`,
              _meta: {
                tool: 'fetch',
                errorType: 'NOT_FOUND',
                resourceType: type,
                nextSteps: [
                  `Use search("${sanitizeForResponse(resourceId.substring(0, 8))}...") to find similar resources`,
                  type === 'pov' ? `Use project(action: 'pov.list') to see available POVs` : null,
                  type === 'task' ? `Use project(action: 'task.list') to see available tasks` : null,
                  'Check that the resource ID is correct'
                ].filter(Boolean)
              }
            })
          }],
          isError: true
        };
      }

      // Centralized resource-content cap (single chokepoint — boundary-contract).
      // Compute the truncation FACT here, on the raw compiled text, for EVERY type,
      // so the signal shape can't drift across the per-type compile* methods.
      let truncation = null;
      if (typeof document.text === 'string') {
        const capped = this._capContent(document.text, this._capForType(type));
        document.text = capped.text;
        truncation = capped.truncation;
      }

      // BUG-BASIC-XSS-1 Phase 2.3: document fields are DB-sourced (Title,
      // description) — historical pollution defense via output-side sanitize.
      // Only sanitize the human-readable text fields, not the structured
      // metadata or IDs.
      const safeDocument = {
        ...document,
        ...(document.title != null ? { title: sanitizeForResponse(document.title) } : {}),
        ...(document.text != null ? { text: sanitizeForResponse(document.text) } : {}),
      };

      // Add nextSteps to document metadata (Dec 2025 UX Assessment).
      // Protocol 10: `truncation` is the FACT (returnedChars/totalChars); `nextSteps`
      // carries the recovery ROUTE per resource type. resourceType/id live as _meta
      // siblings already — do NOT nest them into `truncation` (boundary-contract A2).
      const nextSteps = this.getNextStepsForResource(type, document);
      const enrichedDocument = {
        ...safeDocument,
        _meta: {
          tool: 'fetch',
          resourceType: type,
          timestamp: new Date().toISOString(),
          nextSteps,
          ...(truncation ? { truncation } : {})
        }
      };

      // IMPORTANT: Return DIRECT object for ChatGPT (NOT wrapped like search)
      // fetch returns single resource: {id, title, text, url, metadata}
      // This is different from search which returns: {results: [...]}
      return {
        content: [{
          type: "text",
          text: JSON.stringify(enrichedDocument)  // Direct object format with _meta
        }]
      };
    } catch (error) {
      log.error('Fetch error', { err: error });
      // Dec 2025 UX Assessment: Add recovery guidance (Fix 5)
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Fetch failed",
            // BUG-BASIC-XSS-1 Phase 2.3: error.message may wrap user input.
            message: sanitizeForResponse(error.message),
            _meta: {
              tool: 'fetch',
              errorType: 'FETCH_FAILURE',
              nextSteps: [
                "Retry the fetch at most once — if it fails again, report the failure rather than retrying further",
                "Use search() to verify the resource exists",
                "Check that you have access to this resource"
              ]
            }
          })
        }],
        isError: true
      };
    } finally {
      if (timer) timer.end();
    }
  }

  /**
   * Search POVs with word-based matching and access control
   *
   * @param {string} query - Search query
   * @param {Object} tx - Prisma transaction (unused due to contains bug workaround)
   * @param {Object} user - Authenticated user
   * @param {string} user.userId - User ID
   * @param {string} user.role - User role (USER, DEMO_USER, ADMIN, SUPER_ADMIN)
   */
  async searchPOVs(query, tx, user) {
    // F9 fix: Word-based search - each word must match at least one field
    const conditions = this.buildWordConditions(query, ['title', 'description', 'objective']);

    // 2026-05-17: canonical POV-access filter (handles ADMIN/SUPER_ADMIN/USER/DEMO_USER).
    // Replaces prior inline filter that fail-opened on missing userId and missed
    // the DEMO_USER isDemo metadata case.
    const { filter, isAdmin } = buildPOVAccessFilterWithRole(user);
    if (!isAdmin) {
      conditions.push(filter);
    }

    // WORKAROUND: Use non-transaction query due to Prisma transaction bug with `contains`
    // Bug: `contains` filter throws "Unknown argument" error in transaction context
    // This affects Prisma 6.12.0 - 6.16.3 with PostgreSQL
    const povs = await this.prisma.pOV.findMany({
      where: conditions.length > 0 ? { AND: conditions } : {},
      include: {
        phases: {
          include: {
            stages: true
          }
        },
        country: true,
        owner: true,
        region: true,
        team: true
      },
      take: 20,
      orderBy: { updatedAt: 'desc' }
    });

    return povs;
  }

  /**
   * Search tasks with word-based matching and POV access control
   *
   * @param {string} query - Search query
   * @param {Object} tx - Prisma transaction (unused due to contains bug workaround)
   * @param {Object} accessCtx - Access control context
   */
  async searchTasks(query, tx, user) {
    // F9 fix: Word-based search - each word must match at least one field
    const conditions = this.buildWordConditions(query, ['title', 'description']);

    // 2026-05-17: canonical POV-access filter, applied via task.pov relation.
    const { filter, isAdmin } = buildPOVAccessFilterWithRole(user);
    if (!isAdmin) {
      conditions.push({ pov: filter });
    }

    // WORKAROUND: Use non-transaction query due to Prisma transaction bug with `contains`
    const tasks = await this.prisma.task.findMany({
      where: conditions.length > 0 ? { AND: conditions } : {},
      include: {
        pov: true,
        phase: true,
        stage: true,
        assignee: true
      },
      take: 25,
      orderBy: { updatedAt: 'desc' }
    });

    return tasks;
  }

  /**
   * Search agent executions with word-based matching and POV access control
   *
   * @param {string} query - Search query
   * @param {Object} tx - Prisma transaction (unused due to contains bug workaround)
   * @param {Object} accessCtx - Access control context
   */
  async searchExecutions(query, tx, user) {
    // F9 fix: Word-based search on task title (nested field)
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    const conditions = words.map(word => ({
      task: { title: { contains: word, mode: 'insensitive' } }
    }));

    // 2026-05-17: canonical POV-access filter, applied via task.pov relation.
    const { filter, isAdmin } = buildPOVAccessFilterWithRole(user);
    if (!isAdmin) {
      conditions.push({ task: { pov: filter } });
    }

    // NOTE: AgentExecution.logs is String[] (array), cannot use `contains`
    // AgentExecution has NO `output` field, searching by task title only
    const executions = await this.prisma.agentExecution.findMany({
      where: conditions.length > 0 ? { AND: conditions } : {},
      include: {
        task: {
          include: {
            pov: true
          }
        },
        // NOTE: AgentArtifact schema only has: id, executionId, name, type, content, createdAt
        artifacts: {
          select: {
            id: true,
            name: true,
            type: true,
            createdAt: true
            // NOTE: AgentArtifact has no 'size' or 'contentType' fields in schema
            // Only: id, executionId, name, type, content, createdAt
          },
          take: 5
        }
      },
      take: 15,
      orderBy: { createdAt: 'desc' }
    });

    return executions;
  }

  /**
   * Search agent templates with word-based matching
   * NOTE: Templates are shared resources - no POV access control needed
   */
  async searchAgentTemplates(query, tx) {
    // F9 fix: Word-based search on template name and description
    const conditions = this.buildWordConditions(query, ['name', 'description']);

    // NOTE: category is an ENUM (AgentCategory), cannot use `contains` on enums
    const templates = await this.prisma.agentTemplate.findMany({
      where: conditions.length > 0 ? { AND: conditions } : {},
      take: 10,
      orderBy: { updatedAt: 'desc' }
    });

    return templates;
  }

  /**
   * Format search results with enhanced workflow context (Phase-Stage Specialist)
   */
  formatSearchResults(povs, tasks, executions, templates) {
    const results = [];

    // BUG-STANDALONE-007 fix (2026-05-23, Phase 3 sec-ops M2):
    // sanitize user-controlled metadata fields. Phase 2.3 BC71 sweep wrapped
    // top-level title/text but missed nested metadata.customer/phase/stage/
    // assignee/pov which come from user-controlled DB fields (pov.customerName,
    // phase.name, stage.name, etc.). Defense-in-depth — today no HTML render
    // path in ChatGPT/Claude Desktop, but future MCP clients with markdown→
    // HTML pipelines change that. Per Phase 2.10 'fix-now-prevent-100%-future-
    // exposure' principle.

    // Format POVs with workflow context
    povs.forEach(p => {
      results.push({
        id: `pov-${p.id}`,
        title: p.title,
        url: this.generateCanonicalURL('pov', p.id),
        metadata: {
          type: 'pov',
          status: p.status,
          customer: p.customerName != null ? sanitizeForResponse(p.customerName) : p.customerName,
          phaseCount: p.phases?.length || 0,
          // NOTE: Phase model has NO status field - using stages for progress tracking
          activeStages: p.phases?.reduce((sum, ph) => sum + (ph.stages?.filter(s => s.status === 'ACTIVE').length || 0), 0) || 0,
          completedStages: p.phases?.reduce((sum, ph) => sum + (ph.stages?.filter(s => s.status === 'COMPLETED').length || 0), 0) || 0,
          totalStages: p.phases?.reduce((sum, ph) => sum + (ph.stages?.length || 0), 0) || 0,
          // Can't track phase completion - Phase has no status field
          phaseCount: p.phases?.length || 0
        }
      });
    });

    // Format Tasks with workflow context
    tasks.forEach(t => {
      results.push({
        id: `task-${t.id}`,
        title: t.title,
        url: this.generateCanonicalURL('task', t.id, {
          povId: t.povId,
          phaseId: t.phaseId
        }),
        metadata: {
          type: 'task',
          status: t.status,
          priority: t.priority,
          phase: t.phase?.name != null ? sanitizeForResponse(t.phase.name) : t.phase?.name,
          stage: t.stage?.name != null ? sanitizeForResponse(t.stage.name) : t.stage?.name,
          stageStatus: t.stage?.status,
          stageOrder: t.stage?.order,
          isBlocked: t.stage?.status === 'BLOCKED',
          assignee: t.assignee?.name != null ? sanitizeForResponse(t.assignee.name) : t.assignee?.name,
          pov: t.pov?.title != null ? sanitizeForResponse(t.pov.title) : t.pov?.title
        }
      });
    });

    // Format Executions
    executions.forEach(e => {
      results.push({
        id: `execution-${e.id}`,
        title: `Execution: ${e.task?.title || 'Unknown Task'}`,
        url: this.generateCanonicalURL('execution', e.id),
        metadata: {
          type: 'execution',
          status: e.status,
          taskId: e.taskId,
          artifactCount: e.artifacts?.length || 0,
          createdAt: e.createdAt
        }
      });
    });

    // Format Templates
    templates.forEach(t => {
      results.push({
        id: `template-${t.id}`,
        title: t.name,
        url: this.generateCanonicalURL('template', t.id),
        metadata: {
          type: 'template',
          category: t.category,
          status: t.status
        }
      });
    });

    return results;
  }

  /**
   * Fetch resource by type and ID
   */
  async fetchResourceByType(type, resourceId) {
    switch(type) {
      case 'pov':
        return await this.fetchPOVDetails(resourceId);
      case 'task':
        return await this.fetchTaskDetails(resourceId);
      case 'execution':
        return await this.fetchExecutionDetails(resourceId);
      case 'template':
        return await this.fetchTemplateDetails(resourceId);
      case 'artifact':
        return await this.fetchArtifactDetails(resourceId);
      default:
        return null;
    }
  }

  /**
   * Fetch artifact content by ID.
   * Returns the full artifact content so Claude Desktop can read agent reports
   * via fetch(id: "artifact-{id}") without needing verbose agent.results.
   */
  async fetchArtifactDetails(id) {
    const artifact = await this.prisma.agentArtifact.findUnique({
      where: { id },
      include: {
        execution: {
          select: {
            id: true,
            taskId: true,
            status: true,
            startTime: true,
            endTime: true,
          }
        }
      }
    });

    if (!artifact) return null;

    // Mark the sections a human COMPARES AGAINST at apply time. Read-path only — the stored artifact
    // stays verbatim, because report.md is chained downstream and byte-pinned. See
    // validation-provenance.js for why the persist path would have been the wrong layer.
    // Marked BEFORE the central cap so the banner survives truncation of a 500KB package.
    const marked = markValidationProvenance(artifact.content, artifact.name);

    return {
      id,
      title: artifact.name,
      // BUG-STANDALONE-009 fix: agent artifacts can be 100-500KB markdown
      // reports. Apply the 50KB cap so claim matches reality.
      text: marked.text,  // raw + provenance banner; resource cap + truncation fact applied centrally in handleFetch
      url: `mcp://artifacts/${id}`,
      metadata: {
        name: artifact.name,
        type: artifact.type,
        size: artifact.content?.length || 0,
        // Protocol 10 FACT: which sections are agent-authored and unverified. Absent when the
        // document carries no comparison-target section — absence is not a claim of verification.
        ...(marked.provenance ? { validationProvenance: marked.provenance } : {}),
        createdAt: artifact.createdAt,
        executionId: artifact.executionId,
        taskId: artifact.execution?.taskId,
        executionStatus: artifact.execution?.status,
      }
    };
  }

  /**
   * Fetch POV with full details
   */
  async fetchPOVDetails(id) {
    const pov = await this.prisma.pOV.findUnique({
      where: { id },
      include: {
        owner: true,
        phases: {
          include: {
            stages: {
              include: {
                tasks: {
                  take: 5  // Sample of tasks
                }
              }
            }
          }
        }
      }
    });

    if (!pov) return null;

    return {
      id: id,
      title: pov.title,
      text: this.compilePOVContent(pov),
      url: this.generateCanonicalURL('pov', id),
      metadata: {
        description: pov.description,
        objective: pov.objective,
        status: pov.status,
        customer: pov.customerName,
        owner: pov.owner?.name,
        createdAt: pov.createdAt,
        updatedAt: pov.updatedAt,
        phaseCount: pov.phases?.length || 0,
        totalTasks: pov.phases?.reduce((sum, p) =>
          sum + p.stages?.reduce((stageSum, s) =>
            stageSum + (s.tasks?.length || 0), 0), 0) || 0
      }
    };
  }

  /**
   * Fetch task with execution history (Task Services Specialist recommendations)
   */
  async fetchTaskDetails(id) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        pov: true,
        phase: true,
        stage: true,
        assignee: true,
        team: true,
        dependencies: true
      }
    });

    if (!task) return null;

    // Get recent executions with artifacts
    const executions = await this.prisma.agentExecution.findMany({
      where: { taskId: id },
      include: {
        artifacts: {
          select: {
            id: true,
            name: true,      // Correct field name (not fileName)
            type: true,      // Correct field name (not contentType)
            createdAt: true
            // NOTE: Schema has no 'size' field - removed size filter
          },
          orderBy: { createdAt: 'desc' },
          take: 10  // Max 10 artifacts per execution
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 3  // Only 3 most recent executions
    });

    return {
      id: id,
      // NOTE: Task schema only has 'title' field, no 'name' field
      title: task.title,
      text: this.compileTaskContent(task, executions),
      url: this.generateCanonicalURL('task', id, {
        povId: task.povId,
        phaseId: task.phaseId
      }),
      metadata: {
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee?.name,
        team: task.team?.name,
        context: {
          pov: task.pov?.title,
          phase: task.phase?.name,
          // NOTE: Phase has NO status field in schema
          stage: task.stage?.name,
          stageStatus: task.stage?.status,
          stageOrder: task.stage?.order,
          isBlocked: task.stage?.status === 'BLOCKED',
          nextStage: task.stage?.order ? `Stage ${task.stage.order + 1}` : null,
          dependencies: task.dependencies?.length || 0,
          executionCount: executions.length,
          latestExecution: executions[0] ? {
            status: executions[0].status,
            artifactCount: executions[0].artifacts?.length || 0
          } : null
        }
      }
    };
  }

  /**
   * Fetch execution details
   */
  async fetchExecutionDetails(id) {
    const execution = await this.prisma.agentExecution.findUnique({
      where: { id },
      include: {
        task: {
          include: {
            pov: true
          }
        },
        artifacts: {
          select: {
            id: true,
            name: true,      // Correct field (not fileName)
            type: true,      // Correct field (not contentType)
            createdAt: true
            // NOTE: Schema has no 'size' field
          }
        }
      }
    });

    if (!execution) return null;

    return {
      id: id,
      title: `Execution for ${execution.task?.title || 'Task'}`,
      text: this.compileExecutionContent(execution),
      url: this.generateCanonicalURL('execution', id),
      metadata: {
        status: execution.status,
        taskId: execution.taskId,
        taskTitle: execution.task?.title,
        povTitle: execution.task?.pov?.title,
        startTime: execution.startTime,
        endTime: execution.endTime,
        duration: execution.endTime && execution.startTime
          ? new Date(execution.endTime) - new Date(execution.startTime)
          : null,
        artifactCount: execution.artifacts?.length || 0,
        logs: execution.logs?.slice(-5)  // Last 5 log entries
      }
    };
  }

  /**
   * Fetch template details
   */
  async fetchTemplateDetails(id) {
    const template = await this.prisma.agentTemplate.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            executions: true  // Use relation name, not model name
          }
        }
      }
    });

    if (!template) return null;

    return {
      id: id,
      title: template.name,
      text: this.compileTemplateContent(template),
      url: this.generateCanonicalURL('template', id),
      metadata: {
        description: template.description,
        category: template.category,
        templateType: template.templateType,
        protocol: template.metadata?.protocol ?? null,
        status: template.status,
        // NOTE: AgentTemplate schema has NO model, temperature, maxTokens fields
        // These would be in execution config if needed
        defaultRole: template.defaultRole,
        version: template.version,
        executionCount: template._count?.executions || 0,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt
      }
    };
  }

  /**
   * Compile POV content for fetch response
   */
  /**
   * Content cap for the connector fetch surface.
   * History: BUG-STANDALONE-009 (2026-05-23) made the cap a shared helper after
   * compilePOV/Execution/Template + fetchArtifactDetails were UNBOUNDED. Q2 (2026-06-08)
   * then CENTRALIZED capping into handleFetch (single chokepoint) — the compile*
   * methods now return raw text; handleFetch applies _capContent + emits the
   * `_meta.truncation` fact for every resource type, so the signal can't drift.
   * Per Protocol 10: this helper emits the FACT only; recovery routing lives in
   * getNextStepsForResource() → `_meta.nextSteps` (no tool name in the marker).
   */
  // Per-resource-type content cap (CHARACTERS — String.length is UTF-16 code units,
  // NOT bytes). Interim values until the range read (R12) lands.
  _capForType(type) {
    // Artifacts are bodies a user often wants whole; compiled summaries rarely
    // approach the cap. Raising the artifact ceiling reduces truncation that has
    // no good connector recovery path (mcp-artifacts).
    return type === 'artifact' ? 100000 : 50000;
  }

  /**
   * Cap content for the connector fetch surface. Returns the (possibly truncated)
   * text PLUS a structured truncation FACT — never a recovery verdict. Per Protocol 10
   * the recovery ROUTE lives in getNextStepsForResource() → `_meta.nextSteps`, NOT in
   * this marker (no tool name here). Unit is characters.
   * @returns {{ text: string, truncation: {truncated:boolean, returnedChars:number, totalChars:number}|null }}
   */
  _capContent(text, maxSize = 50000) {
    // Delegates to the shared capText helper (2026-06-09) — single source of truth shared with the
    // agent.results verbose ceiling so the truncation signal can't drift across tools.
    return capText(text, maxSize);
  }

  compilePOVContent(pov) {
    const sections = [];

    sections.push(`POV: ${pov.title}`);
    sections.push(`Description: ${pov.description || 'N/A'}`);
    sections.push(`Objective: ${pov.objective || 'N/A'}`);
    sections.push(`Status: ${pov.status}`);
    // NOTE: POV has customerName field (String), not customer relation
    sections.push(`Customer: ${pov.customerName || 'N/A'}`);
    sections.push(`Owner: ${pov.owner?.name || 'N/A'}`);

    if (pov.phases && pov.phases.length > 0) {
      sections.push('\n--- Phases ---');
      pov.phases.forEach(phase => {
        // NOTE: Phase has NO status field
        sections.push(`\nPhase: ${phase.name} (${phase.type})`);
        if (phase.stages && phase.stages.length > 0) {
          sections.push(`  Stages: ${phase.stages.length}`);
          const taskCount = phase.stages.reduce((sum, s) => sum + (s.tasks?.length || 0), 0);
          sections.push(`  Total Tasks: ${taskCount}`);
        }
      });
    }

    // Raw content; the resource cap + truncation fact are applied centrally in handleFetch.
    return sections.join('\n');
  }

  /**
   * Compile task content with execution details (MCP Artifacts Specialist recommendations)
   */
  compileTaskContent(task, executions) {
    const sections = [];

    // Task details (schema only has 'title', no 'name' field)
    sections.push(`Task: ${task.title}`);
    sections.push(`Description: ${task.description || 'N/A'}`);
    sections.push(`Status: ${task.status}`);
    sections.push(`Priority: ${task.priority || 'N/A'}`);
    sections.push(`Assignee: ${task.assignee?.name || 'Unassigned'}`);
    sections.push(`Team: ${task.team?.name || 'N/A'}`);

    // Context
    sections.push(`\nContext:`);
    sections.push(`  POV: ${task.pov?.title || 'N/A'}`);
    // NOTE: Phase has NO status field - showing type instead
    sections.push(`  Phase: ${task.phase?.name || 'N/A'} (${task.phase?.type || 'N/A'})`);
    sections.push(`  Stage: ${task.stage?.name || 'N/A'} (${task.stage?.status || 'N/A'})`);

    // Execution history with artifact details
    if (executions.length > 0) {
      sections.push('\n--- Recent Executions ---');
      executions.forEach(exec => {
        sections.push(`\nExecution ${exec.id}:`);
        sections.push(`  Status: ${exec.status}`);
        sections.push(`  Created: ${exec.createdAt}`);

        // Enhanced artifact information
        if (exec.artifacts?.length > 0) {
          sections.push(`  Artifacts (${exec.artifacts.length}):`);
          exec.artifacts.forEach(artifact => {
            // Use correct field names: name, type (not fileName, contentType)
            sections.push(`    - ${artifact.name} (${artifact.type})`);

            // Indicate availability of content by type
            if (artifact.type === 'application/json') {
              sections.push(`      [JSON data available - use fetch for full content]`);
            } else if (artifact.type === 'text/markdown') {
              sections.push(`      [Report available - use fetch for full content]`);
            }
          });
        }

        if (exec.logs?.length > 0) {
          sections.push(`  Last log: ${exec.logs[exec.logs.length - 1]}`);
        }
      });
    }

    // Raw content; the resource cap + truncation fact are applied centrally in handleFetch.
    return sections.join('\n');
  }

  /**
   * Compile execution content
   */
  compileExecutionContent(execution) {
    const sections = [];

    sections.push(`Execution ID: ${execution.id}`);
    sections.push(`Status: ${execution.status}`);
    sections.push(`Task: ${execution.task?.title || 'Unknown'}`);
    sections.push(`POV: ${execution.task?.pov?.title || 'N/A'}`);

    if (execution.startTime) {
      sections.push(`Started: ${execution.startTime}`);
    }
    if (execution.endTime) {
      sections.push(`Ended: ${execution.endTime}`);
    }

    if (execution.logs && execution.logs.length > 0) {
      sections.push('\n--- Execution Logs ---');
      execution.logs.slice(-10).forEach(log => {
        sections.push(log);
      });
    }

    if (execution.artifacts && execution.artifacts.length > 0) {
      sections.push('\n--- Artifacts ---');
      execution.artifacts.forEach(artifact => {
        // Use correct field names: name, type (not fileName, contentType, size)
        sections.push(`- ${artifact.name} (${artifact.type})`);
      });
    }

    // NOTE: AgentExecution has no 'output' field in schema
    // Output would be in artifacts if needed

    // Raw content; the resource cap + truncation fact are applied centrally in handleFetch.
    return sections.join('\n');
  }

  /**
   * Compile template content
   */
  compileTemplateContent(template) {
    const sections = [];

    sections.push(`Template: ${template.name}`);
    sections.push(`Category: ${template.category}`);
    sections.push(`Template Type: ${template.templateType ?? 'N/A'}`);
    sections.push(`Protocol: ${template.metadata?.protocol ?? 'None (vanilla)'}`);
    sections.push(`Status: ${template.status}`);
    sections.push(`Description: ${template.description || 'N/A'}`);

    sections.push('\n--- Configuration ---');
    // NOTE: AgentTemplate has NO model, temperature, maxTokens fields
    sections.push(`Default Role: ${template.defaultRole || 'N/A'}`);
    sections.push(`Version: ${template.version || '1.0.0'}`);
    sections.push(`Priority: ${template.priority || 'MEDIUM'}`);
    sections.push(`Max Retries: ${template.maxRetries || 3}`);
    sections.push(`Timeout: ${template.timeout || 300}s`);

    if (template.promptTemplate) {
      sections.push('\n--- Prompt Template ---');
      sections.push(template.promptTemplate.substring(0, 1000));
      if (template.promptTemplate.length > 1000) {
        // FIELD-scoped cap (distinct from the resource cap) — characters unit,
        // honest; does NOT emit _meta.truncation (it's one field inside a possibly
        // under-cap document; a resource-level signal here would be false).
        sections.push(`... [field truncated to 1000 of ${template.promptTemplate.length} characters]`);
      }
    }

    sections.push(`\n--- Usage ---`);
    sections.push(`Total Executions: ${template._count?.executions || 0}`);

    // Raw content; the resource cap + truncation fact are applied centrally in handleFetch.
    return sections.join('\n');
  }

  /**
   * Build word-based search conditions for Prisma queries
   * Splits query into words; each word must match at least one of the specified fields.
   * For "QA testing", both "QA" and "testing" must appear (in any order, any field).
   *
   * @param {string} query - Search query string
   * @param {string[]} fields - Field names to search across (e.g., ['title', 'description'])
   * @returns {Array<Object>} Array of Prisma AND conditions (each word → OR across fields)
   *
   * @example
   * buildWordConditions('QA testing', ['title', 'description'])
   * // Returns: [
   * //   { OR: [{ title: { contains: 'QA', ... }}, { description: { contains: 'QA', ... }}] },
   * //   { OR: [{ title: { contains: 'testing', ... }}, { description: { contains: 'testing', ... }}] }
   * // ]
   */
  buildWordConditions(query, fields) {
    const words = query.trim().split(/\s+/)
      .map(w => w.replace(/['"]/g, ''))  // Strip quotes (users expect phrase matching, not literal quotes)
      .filter(w => w.length > 0);
    if (words.length === 0) return [];

    return words.map(word => ({
      OR: fields.map(field => ({
        [field]: { contains: word, mode: 'insensitive' }
      }))
    }));
  }

  /**
   * Check if a user has access to a resource (via POV ownership or team membership)
   * Returns false for resources the user cannot access, preventing information leakage.
   *
   * @param {string} type - Resource type (pov, task, execution, template)
   * @param {string} resourceId - Resource CUID
   * @param {Object} user - Authenticated user
   * @param {string} user.userId - User ID
   * @param {string} user.role - User role (USER, DEMO_USER, ADMIN, SUPER_ADMIN)
   * @returns {Promise<boolean>} True if user has access
   */
  async checkResourceAccess(type, resourceId, user) {
    // 2026-05-17: canonical POV-access filter — same primitive the search helpers
    // use. Handles DEMO_USER's isDemo metadata case which the prior inline filter
    // missed. Signature changed from `userId` to `user = { userId, role }` to
    // give the helper the role it needs for DEMO_USER routing.
    const povAccessFilter = buildPOVAccessFilter(user);

    try {
      switch(type) {
        case 'pov':
          return !!(await this.prisma.pOV.findFirst({
            where: { id: resourceId, ...povAccessFilter },
            select: { id: true }
          }));
        case 'task':
          return !!(await this.prisma.task.findFirst({
            where: { id: resourceId, pov: povAccessFilter },
            select: { id: true }
          }));
        case 'execution':
          return !!(await this.prisma.agentExecution.findFirst({
            where: { id: resourceId, task: { pov: povAccessFilter } },
            select: { id: true }
          }));
        case 'template':
          return true; // Templates are shared resources
        case 'artifact':
          return !!(await this.prisma.agentArtifact.findFirst({
            where: { id: resourceId, execution: { task: { pov: povAccessFilter } } },
            select: { id: true }
          }));
        default:
          return false;
      }
    } catch (error) {
      log.error('Access check failed', { type, resourceId, userId: user?.userId, err: error });
      return false; // Deny on error
    }
  }

  /**
   * Generate context-aware nextSteps based on resource type
   * Dec 2025 UX Assessment: Provides workflow guidance after fetch
   *
   * @param {string} type - Resource type (pov, task, execution, template)
   * @param {Object} document - The fetched resource document
   * @returns {Array<string>} Array of suggested next actions
   *
   * @example
   * const nextSteps = this.getNextStepsForResource('pov', povDocument);
   * // Returns: ["Retrieved POV: ...", "List tasks: project(action: 'task.list', ...)", ...]
   */
  getNextStepsForResource(type, document) {
    // BUG-BASIC-XSS-1 Phase 2.3: document.title is DB-sourced — historical
    // pollution defense. type is enum-validated upstream.
    const safeLabel = sanitizeForResponse(document.title || document.id);
    const baseSteps = [
      `Retrieved ${type}: "${safeLabel}"`,
    ];

    switch(type) {
      case 'pov':
        return [
          ...baseSteps,
          `List tasks: project(action: 'task.list', povId: '${document.id}')`,
          `Get full details: project(action: 'pov.details', povId: '${document.id}')`,
          `Create task: perform(action: 'task.create', parameters: { povId: '${document.id}', title: '...' })`
        ];
      case 'task':
        return [
          ...baseSteps,
          `Get context: project(action: 'task.context', taskId: '${document.id}')`,
          `Update status: perform(action: 'task.update', parameters: { taskId: '${document.id}', status: '...' })`,
          `Run agent: perform(action: 'agent.execute', parameters: { taskId: '${document.id}' })`
        ];
      case 'execution':
        return [
          ...baseSteps,
          `Get artifacts: perform(action: 'agent.results', taskId: '${document.metadata?.taskId || '...'}')`,
          `View task: fetch("task-${document.metadata?.taskId || '...'}")`
        ];
      case 'template':
        return [
          ...baseSteps,
          `Assign to task: perform(action: 'agent.assign', parameters: { taskId: '...', agentTemplateId: '${document.id}' })`,
          `List all templates: template(action: 'list')`
        ];
      case 'artifact':
        // Honest dead-end (Protocol 10 / R4): a large artifact body is NOT retrievable
        // through this connector. agent.results is itself capped and bounces back to
        // fetch; the artifact download API needs auth a connector can't send; there is
        // no standalone artifact web page. So name NO recovery tool — state the fact.
        return [
          ...baseSteps,
          `If the body shows a truncation marker, the complete artifact exceeds this connector's single-fetch limit and is not retrievable in full through the connector.`
        ];
      default:
        return [
          ...baseSteps,
          // search() finds RELATED resources — it does not return this resource's full body.
          `Find related resources: search("${document.title?.split(' ')[0] || ''}")`
        ];
    }
  }

  /**
   * Get fuzzy suggestions for not-found resources
   * Dec 2025 UX Assessment: Helps users find similar resources on not-found errors
   *
   * @param {string} type - Resource type (pov, task, template)
   * @param {string} searchTerm - Original search term/ID
   * @param {number} limit - Max suggestions to return (default: 5)
   * @returns {Promise<Array>} Similar resources with id, title, type
   *
   * @example
   * const suggestions = await this.getFuzzySuggestions('pov', 'BlackEy', 3);
   * // Returns: [{id: 'xyz', title: 'BlackEye POV', type: 'pov'}, ...]
   */
  async getFuzzySuggestions(type, searchTerm, user, limit = 5) {
    try {
      // Extract meaningful search portion (first 8 chars or partial word)
      const searchPortion = searchTerm.length > 8
        ? searchTerm.substring(0, 8)
        : searchTerm;

      const modelConfig = {
        pov: { model: this.prisma.pOV, field: 'title' },
        task: { model: this.prisma.task, field: 'title' },
        template: { model: this.prisma.agentTemplate, field: 'name' }
      };

      const config = modelConfig[type];
      if (!config) return [];

      // SECURITY (2026-05-26 pentest Gap #1): scope suggestions to the caller's
      // accessible POVs, mirroring searchPOVs/searchTasks. Without this, the
      // not-found fuzzy fallback leaked cross-tenant POV/task titles + IDs to ANY
      // caller (incl. public DEMO_USER). Templates stay global — consistent with
      // search (templates are bypass-eligible). buildPOVAccessFilterWithRole
      // throws on a malformed user → caught below → returns [] (fail-closed).
      const conditions = [
        { [config.field]: { contains: searchPortion, mode: 'insensitive' } }
      ];
      if (type !== 'template') {
        const { filter, isAdmin } = buildPOVAccessFilterWithRole(user);
        if (!isAdmin) {
          conditions.push(type === 'pov' ? filter : { pov: filter });
        }
      }

      const results = await config.model.findMany({
        where: { AND: conditions },
        select: {
          id: true,
          [config.field]: true
        },
        take: limit
      });

      return results.map(r => ({
        id: r.id,
        title: r[config.field],
        type: type
      }));
    } catch (error) {
      log.warn('Fuzzy suggestion error', { err: error });
      return [];
    }
  }

  /**
   * Generate canonical URLs for resources
   * Updated to match actual Next.js route structure
   */
  generateCanonicalURL(type, id, context = {}) {
    const baseUrl = 'https://paichart.app';

    switch(type) {
      case 'pov':
        // POV route exists at the top level (will redirect to authenticated)
        return `${baseUrl}/pov/${id}`;

      case 'task':
        // Tasks need full nested path: /pov/[povId]/phase/[phaseId]/task/[taskId]
        if (context.povId && context.phaseId) {
          return `${baseUrl}/pov/${context.povId}/phase/${context.phaseId}/task/${id}`;
        }
        // Fallback to simple URL if context missing (will need redirect page)
        return `${baseUrl}/task/${id}`;

      case 'execution':
        // No dedicated execution view page, use API endpoint for now
        // TODO: Consider creating execution view page
        return `${baseUrl}/api/agent-executions/${id}`;

      case 'template':
        // Templates are in admin section
        return `${baseUrl}/admin/templates/agent/${id}`;

      default:
        return `${baseUrl}/resource/${id}`;
    }
  }
}

module.exports = ChatGPTConnectorHandler;