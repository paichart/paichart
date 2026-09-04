/**
 * MCP Metadata Enhancer
 *
 * Enhances MCP response metadata with API pagination & performance information.
 * Centralizes metadata pass-through logic for consistency across all MCP tools.
 *
 * Purpose: Expose existing API sophistication through MCP layer without backend changes
 *
 * @version 1.0.0
 * @created 2025-11-15
 */

class MetadataEnhancer {
  /**
   * Extracts pagination metadata from API response
   *
   * @param {Object} apiResponse - Full API response with data, pagination, _performance
   * @returns {Object|null} Pagination metadata object or null if no pagination available
   *
   * @example
   * const apiResponse = {
   *   data: [...],
   *   total: 534,
   *   pagination: { hasMore: true, currentPage: 1, totalPages: 6 }
   * };
   * const paginationMeta = MetadataEnhancer.extractPagination(apiResponse);
   * // Returns: { total: 534, returned: 100, hasMore: true, ... }
   */
  static extractPagination(apiResponse) {
    if (!apiResponse) return null;

    // Handle nested API response structures:
    // 1. { data: { templates: [...], pagination: {...} } }  (agent-templates)
    // 2. { data: [...], pagination: {...} }  (tasks, POVs)
    // 3. { data: [...] }  (simple arrays)
    // 4. Direct array responses
    const data = apiResponse.data || apiResponse;

    // Find the actual array of items - check for named arrays first
    let dataArray;
    if (Array.isArray(data)) {
      dataArray = data;
    } else if (data.templates && Array.isArray(data.templates)) {
      dataArray = data.templates;
    } else if (data.items && Array.isArray(data.items)) {
      dataArray = data.items;
    } else if (data.tasks && Array.isArray(data.tasks)) {
      dataArray = data.tasks;
    } else if (data.povs && Array.isArray(data.povs)) {
      dataArray = data.povs;
    } else {
      dataArray = [];
    }

    // Find pagination metadata - check both top-level and nested
    const pagination = apiResponse.pagination || data.pagination || null;
    const total = apiResponse.total || data.total || pagination?.total || null;

    // If no pagination metadata exists, return minimal info based on array length
    if (!pagination && !total) {
      return {
        total: dataArray.length,
        returned: dataArray.length,
        hasMore: false,
        currentPage: 1,
        totalPages: 1,
        nextPage: null,
        prevPage: null,
        pageSize: null
      };
    }

    // Extract pagination info from API response
    return {
      total: total || dataArray.length,
      returned: dataArray.length,
      hasMore: pagination?.hasMore || false,
      currentPage: pagination?.currentPage || apiResponse.page || 1,
      totalPages: pagination?.totalPages || Math.ceil((total || 1) / (pagination?.limit || dataArray.length || 1)),
      nextPage: pagination?.nextPage || (pagination?.hasMore ? (pagination?.currentPage || 1) + 1 : null),
      prevPage: pagination?.prevPage || null,
      pageSize: pagination?.limit || pagination?.pageSize || null
    };
  }

  /**
   * Extracts performance metadata from API response
   *
   * @param {Object} apiResponse - Full API response
   * @returns {Object|null} Performance metadata object or null if not available
   *
   * @example
   * const apiResponse = {
   *   _performance: { queryTimeMs: 45, optimized: true, queriesUsed: 7 }
   * };
   * const perfMeta = MetadataEnhancer.extractPerformance(apiResponse);
   * // Returns: { queryTimeMs: 45, optimized: true, queriesUsed: 7 }
   */
  static extractPerformance(apiResponse) {
    if (!apiResponse?._performance) return null;

    return {
      queryTimeMs: apiResponse._performance.queryTimeMs || null,
      optimized: apiResponse._performance.optimized || false,
      queriesUsed: apiResponse._performance.queriesUsed || null
    };
  }

  /**
   * Creates enhanced _meta field for MCP responses
   * Combines tool info, API metadata, and custom metadata into a single object
   *
   * @param {Object} options - Configuration options
   * @param {string} options.tool - Tool name (e.g., 'project')
   * @param {Object} options.apiResponse - Full API response
   * @param {Object} options.filters - Query parameters used (optional)
   * @param {Object} options.additionalMeta - Any additional metadata (optional)
   * @returns {Object} Complete _meta object for MCP response
   *
   * @example
   * const meta = MetadataEnhancer.createEnhancedMeta({
   *   tool: 'project',
   *   apiResponse: taskData,
   *   filters: { status: 'OPEN', povId: 'pov-123' }
   * });
   * // Returns enhanced _meta with pagination, performance, etc.
   */
  static createEnhancedMeta({
    tool,
    apiResponse,
    filters = {},
    additionalMeta = {}
  }) {
    const pagination = this.extractPagination(apiResponse);
    const performance = this.extractPerformance(apiResponse);

    // Calculate item count from pagination (more reliable) or array length
    const itemCount = pagination?.returned ||
      apiResponse.data?.length ||
      (Array.isArray(apiResponse) ? apiResponse.length : 0);

    return {
      // Standard MCP metadata
      tool,
      timestamp: new Date().toISOString(),
      sdkNative: true,

      // Item count (backward compatible) - now uses pagination if available
      itemCount,

      // Query filters used
      filters,

      // NEW: Pagination metadata from API
      pagination,

      // NEW: Performance metadata from API
      performance,

      // Any additional custom metadata
      ...additionalMeta
    };
  }

  /**
   * Creates a completeness summary string from pagination metadata
   * Useful for logging and formatted text responses
   *
   * @param {Object} pagination - Pagination metadata object
   * @returns {string} Human-readable completeness summary
   *
   * @example
   * const summary = MetadataEnhancer.getCompletenessSummary({
   *   total: 534, returned: 100, hasMore: true, currentPage: 1, totalPages: 6
   * });
   * // Returns: "100 of 534 total (page 1 of 6) - More results available"
   */
  static getCompletenessSummary(pagination) {
    if (!pagination || !pagination.total) {
      return 'All available results';
    }

    let summary = `${pagination.returned} of ${pagination.total} total`;

    if (pagination.totalPages > 1) {
      summary += ` (page ${pagination.currentPage} of ${pagination.totalPages})`;
    }

    if (pagination.hasMore) {
      summary += ' - More results available';
    } else {
      summary += ' - Complete';
    }

    return summary;
  }

  /**
   * Determines if API response contains partial results
   *
   * @param {Object} pagination - Pagination metadata object
   * @returns {boolean} True if results are partial (more available)
   *
   * @example
   * const isPartial = MetadataEnhancer.isPartialResults({ hasMore: true });
   * // Returns: true
   */
  static isPartialResults(pagination) {
    if (!pagination) return false;
    return pagination.hasMore === true || pagination.returned < pagination.total;
  }

  /**
   * Creates a "next page" hint for users when results are partial
   *
   * @param {Object} pagination - Pagination metadata object
   * @param {string} toolName - Name of the tool being called
   * @returns {string|null} Next page hint or null if no more pages
   *
   * @example
   * const hint = MetadataEnhancer.getNextPageHint({ hasMore: true, returned: 5, total: 22 }, 'template');
   * // Returns: "📄 More results available (5 of 22) — increase limit (max 200) or add filters to narrow"
   *
   * BUG-TEMPLATE-001 fix (2026-05-23): hint previously suggested `use page=N`
   * but NO tool in tool-schemas.js has a `page` param and NO handler reads
   * `args.page`. User following the hint either gets ignored (passthrough
   * tools) or rejected (strict tools), and may enter an infinite loop
   * re-requesting the same page-1 results. Phantom-canonical at the
   * metadata-layer: hint promised behavior that never existed.
   *
   * Replaced with `limit`-based hint that matches the actually-implemented
   * pagination mechanism. When per-page navigation lands, switch hint back.
   */
  static getNextPageHint(pagination, toolName) {
    if (!pagination || !pagination.hasMore) {
      return null;
    }

    const returned = pagination.returned ?? 0;
    const total = pagination.total ?? 'many';
    return `📄 More results available (${returned} of ${total}) — increase limit (max 200) or add filters to narrow`;
  }

  /**
   * Creates a performance summary string
   *
   * @param {Object} performance - Performance metadata object
   * @returns {string|null} Performance summary or null if not available
   *
   * @example
   * const summary = MetadataEnhancer.getPerformanceSummary({
   *   queryTimeMs: 45, optimized: true, queriesUsed: 7
   * });
   * // Returns: "⚡ Query completed in 45ms (optimized, 7 queries)"
   */
  static getPerformanceSummary(performance) {
    if (!performance || !performance.queryTimeMs) {
      return null;
    }

    let summary = `⚡ Query completed in ${performance.queryTimeMs}ms`;

    if (performance.optimized) {
      summary += ' (optimized';
      if (performance.queriesUsed) {
        summary += `, ${performance.queriesUsed} queries`;
      }
      summary += ')';
    }

    return summary;
  }
}

module.exports = { MetadataEnhancer };
