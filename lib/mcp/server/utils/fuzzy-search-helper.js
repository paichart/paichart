/**
 * Fuzzy Search Helper - Centralized match scoring for MCP tools
 *
 * Implements 4-tier scoring system:
 * - Exact match: 1000 points
 * - Starts with: 500 points
 * - Contains: 100-200 points (length-weighted)
 * - Word-based: 10 points per matched word
 *
 * Used by: project (pov.details, task.context), perform (agent.results), template (details), services (health), registry (update)
 *
 * @module fuzzy-search-helper
 */

/**
 * Calculate match score for fuzzy search
 *
 * @param {string} title - The title to match against
 * @param {string} searchTerm - The search term
 * @returns {number} - Match score (0-1000+)
 */
function calculateMatchScore(title, searchTerm) {
  if (!title || !searchTerm) return 0;

  const titleLower = title.toLowerCase().trim();
  const searchLower = searchTerm.toLowerCase().trim();

  // Tier 1: Exact match (1000 points)
  if (titleLower === searchLower) {
    return 1000;
  }

  // Tier 2: Starts with search term (500 points)
  if (titleLower.startsWith(searchLower)) {
    return 500;
  }

  // Tier 3: Contains full search term (100-200 points, length-weighted)
  if (titleLower.includes(searchLower)) {
    // Longer matches get higher scores
    const lengthRatio = searchLower.length / titleLower.length;
    return 100 + Math.floor(lengthRatio * 100);
  }

  // Tier 4: Word-based matching with coverage weighting
  // Score = matchedWords × (10 + 20 × coverage), where coverage = matched/total.
  // This rewards multi-word searches where most words match (high coverage) while
  // still rejecting single-word false positives:
  //   "meridian health cloud pov" → 3 of 4 matched → 3×(10+15) = 75 (passes 50)
  //   "test"                      → 1 of 1 matched → 1×(10+20) = 30 (rejected at 50)
  //   "meridian health"           → 2 of 2 matched → 2×(10+20) = 60 (passes 50)
  //   "cloud"                     → 1 of 1 matched → 1×(10+20) = 30 (rejected at 50)
  // Changed from flat `matchedWords × 10` on Apr 2026 to prevent rejecting
  // reasonable multi-word shorthand while keeping single-word protection.
  const searchWords = searchLower.split(/\s+/).filter(w => w.length > 0);
  const titleWords = titleLower.split(/\s+/);

  const matchedWords = searchWords.filter(searchWord =>
    titleWords.some(titleWord => titleWord.includes(searchWord))
  );

  if (matchedWords.length === 0) return 0;
  const coverage = matchedWords.length / searchWords.length;
  return matchedWords.length * (10 + Math.floor(20 * coverage));
}

/**
 * Find best match from array of items using fuzzy search
 *
 * @param {Array} items - Array of items to search
 * @param {string} searchTerm - The search term
 * @param {string} titleField - Field name containing the title (default: 'title')
 * @param {Object} options - Optional configuration
 * @param {number} options.threshold - Minimum score threshold (default: 50).
 *   Score 50 requires at least a partial Tier 3 "contains" match or 5+ word
 *   matches. Single-word Tier 4 matches (10 pts) are excluded by default.
 *   Set to 0 explicitly if you intentionally want loose matching.
 *   Changed from 0 → 50 on Apr 2026 after "Pipeline Test Corp" silently
 *   matched "Bear Test POV" via one shared word (10 pts, Tier 4).
 * @param {number} options.ambiguityThreshold - Log warning if top 2 scores within this % (default: 0.1 = 10%)
 * @param {Function} options.logger - Optional logger for ambiguity warnings
 * @returns {Object|null} - Best matching item or null if no match
 */
function findBestMatch(items, searchTerm, titleField = 'title', options = {}) {
  const {
    threshold = 50,
    ambiguityThreshold = 0.1,
    logger = null
  } = options;

  if (!items || items.length === 0 || !searchTerm) {
    return null;
  }

  // Score all items
  const scoredItems = items
    .map(item => ({
      item,
      score: calculateMatchScore(item[titleField], searchTerm)
    }))
    .filter(scored => scored.score > threshold)
    .sort((a, b) => b.score - a.score);

  if (scoredItems.length === 0) {
    return null;
  }

  const bestMatch = scoredItems[0];

  // Check for ambiguity (top 2 scores within 10% of each other)
  if (logger && scoredItems.length > 1) {
    const secondBest = scoredItems[1];
    const scoreDiff = bestMatch.score - secondBest.score;
    const relativeThreshold = bestMatch.score * ambiguityThreshold;

    if (scoreDiff < relativeThreshold) {
      // Defensive: Check if logger.warn exists, fallback to info
      if (typeof logger.warn === 'function') {
        logger.warn(`Ambiguous fuzzy search for "${searchTerm}": Top 2 matches have similar scores`, {
          bestMatch: { title: bestMatch.item[titleField], score: bestMatch.score },
          secondBest: { title: secondBest.item[titleField], score: secondBest.score },
          scoreDiff,
          threshold: relativeThreshold
        });
      } else if (typeof logger.info === 'function') {
        logger.info(`Ambiguous fuzzy search (warn unavailable): "${searchTerm}" - top scores: ${bestMatch.score}, ${secondBest.score}`);
      }
    }
  }

  return bestMatch.item;
}

/**
 * Get top N scored suggestions for helpful error messages
 *
 * Includes full item data (id, status, povId, etc.) alongside title and score,
 * so callers can access item properties without a separate lookup.
 *
 * @param {Array} items - Array of items to search
 * @param {string} searchTerm - The search term
 * @param {string} titleField - Field name containing the title (default: 'title')
 * @param {number} limit - Number of suggestions to return (default: 3)
 * @returns {Array} - Array of {title, score, ...itemData} objects
 */
function getScoredSuggestions(items, searchTerm, titleField = 'title', limit = 3) {
  if (!items || items.length === 0 || !searchTerm) {
    return [];
  }

  return items
    .map(item => ({
      ...item,  // Include full item data (id, status, povId, etc.)
      title: item[titleField],
      score: calculateMatchScore(item[titleField], searchTerm)
    }))
    .filter(scored => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  calculateMatchScore,
  findBestMatch,
  getScoredSuggestions
};
