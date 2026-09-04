/**
 * Fuzzy Search Helper Tests
 * Comprehensive test suite for match scoring algorithm
 *
 * Test Coverage:
 * - Unit tests for calculateMatchScore (6 tests)
 * - Unit tests for findBestMatch (6 tests)
 * - Unit tests for getScoredSuggestions (6 tests)
 * - Regression test for "Tech Distributors" bug (6 tests)
 *
 * Total: 24 tests
 */

const { calculateMatchScore, findBestMatch, getScoredSuggestions } = require('../../lib/mcp/server/utils/fuzzy-search-helper');

describe('Fuzzy Search Helper', () => {
  describe('calculateMatchScore', () => {
    test('exact match returns 1000', () => {
      expect(calculateMatchScore('Tech Distributors', 'Tech Distributors')).toBe(1000);
      expect(calculateMatchScore('tech distributors', 'Tech Distributors')).toBe(1000); // Case insensitive
    });

    test('starts-with match returns 500', () => {
      expect(calculateMatchScore('Tech Distributors Demo', 'Tech Distributors')).toBe(500);
      expect(calculateMatchScore('BlackEye Red Team', 'BlackEye')).toBe(500);
    });

    test('contains match returns 100-200', () => {
      const score = calculateMatchScore('BlackEye Red Team Project', 'Red Team');
      expect(score).toBeGreaterThanOrEqual(100);
      expect(score).toBeLessThan(500);
    });

    test('word-based match returns 10× matched words', () => {
      // "Tech" and "Demo" both match = 20 points
      const score = calculateMatchScore('Tech Distributors Demo', 'Demo Tech');
      expect(score).toBeGreaterThanOrEqual(20);
      expect(score).toBeLessThan(100);
    });

    test('case insensitive matching', () => {
      expect(calculateMatchScore('Tech Distributors', 'tech distributors')).toBe(1000);
      expect(calculateMatchScore('TECH DISTRIBUTORS', 'tech distributors')).toBe(1000);
      expect(calculateMatchScore('Tech Distributors', 'TECH')).toBe(500);
    });

    test('no match returns 0', () => {
      expect(calculateMatchScore('Tech Distributors', 'Nonexistent')).toBe(0);
      expect(calculateMatchScore('Tech Distributors', 'xyz abc')).toBe(0);
    });
  });

  describe('findBestMatch', () => {
    const mockPOVs = [
      { id: '1', title: 'Tech Distributors - Curated AI Platform (Demo)' },
      { id: '2', title: 'pAIchart Use Cases - Tour' },
      { id: '3', title: 'BlackEye Red Team Project' }
    ];

    test('returns exact match', () => {
      const result = findBestMatch(mockPOVs, 'Tech Distributors - Curated AI Platform (Demo)');
      expect(result).toBeTruthy();
      expect(result.id).toBe('1');
    });

    test('returns best partial match', () => {
      const result = findBestMatch(mockPOVs, 'Tech Distributors');
      expect(result).toBeTruthy();
      expect(result.id).toBe('1'); // Best match, not first match
    });

    test('returns null when no match', () => {
      const result = findBestMatch(mockPOVs, 'Nonexistent POV');
      expect(result).toBeNull();
    });

    test('case insensitive search', () => {
      const result = findBestMatch(mockPOVs, 'tech distributors');
      expect(result).toBeTruthy();
      expect(result.id).toBe('1');
    });

    test('logs warning for ambiguous matches', () => {
      const mockLogger = { warn: jest.fn() };
      const ambiguousPOVs = [
        { id: '1', title: 'Tech Demo 1' },
        { id: '2', title: 'Tech Demo 2' }
      ];

      findBestMatch(ambiguousPOVs, 'Tech', 'title', { logger: mockLogger });

      // Should log ambiguity warning when top 2 scores are similar
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('handles empty array', () => {
      const result = findBestMatch([], 'search term');
      expect(result).toBeNull();
    });
  });

  describe('getScoredSuggestions', () => {
    const mockPOVs = [
      { id: '1', title: 'Tech Distributors Demo' },
      { id: '2', title: 'Tech Platform' },
      { id: '3', title: 'Demo Project' },
      { id: '4', title: 'BlackEye Red Team' }
    ];

    test('returns top 3 matches by default', () => {
      const suggestions = getScoredSuggestions(mockPOVs, 'Tech');
      expect(suggestions.length).toBeLessThanOrEqual(3);
      expect(suggestions[0].title).toBe('Tech Distributors Demo'); // Best match first
    });

    test('returns custom limit', () => {
      const suggestions = getScoredSuggestions(mockPOVs, 'Tech', 'title', 2);
      expect(suggestions.length).toBe(2);
    });

    test('sorted by score descending', () => {
      const suggestions = getScoredSuggestions(mockPOVs, 'Tech');
      for (let i = 0; i < suggestions.length - 1; i++) {
        expect(suggestions[i].score).toBeGreaterThanOrEqual(suggestions[i + 1].score);
      }
    });

    test('includes score in results', () => {
      const suggestions = getScoredSuggestions(mockPOVs, 'Tech');
      expect(suggestions[0]).toHaveProperty('score');
      expect(suggestions[0]).toHaveProperty('title');
      expect(typeof suggestions[0].score).toBe('number');
    });

    test('returns empty array when no matches', () => {
      const suggestions = getScoredSuggestions(mockPOVs, 'Nonexistent');
      expect(suggestions).toEqual([]);
    });

    test('handles empty array', () => {
      const suggestions = getScoredSuggestions([], 'search');
      expect(suggestions).toEqual([]);
    });
  });

  describe('Regression Test: Tech Distributors Bug', () => {
    test('returns correct POV for "Tech Distributors" search (exact match)', () => {
      const mockPOVs = [
        { id: 'pov1', title: 'pAIchart Use Cases - Tour' },
        { id: 'pov2', title: 'Tech Distributors - Curated AI Platform (Demo)' }
      ];

      const result = findBestMatch(mockPOVs, 'Tech Distributors - Curated AI Platform (Demo)');

      // BEFORE FIX: Would return pov1 (first partial match)
      // AFTER FIX: Should return pov2 (exact match)
      expect(result).toBeTruthy();
      expect(result.id).toBe('pov2');
      expect(result.title).toBe('Tech Distributors - Curated AI Platform (Demo)');
    });

    test('returns correct POV for "Tech Distributors" search (partial match)', () => {
      const mockPOVs = [
        { id: 'pov1', title: 'pAIchart Use Cases - Tour' },
        { id: 'pov2', title: 'Tech Distributors - Curated AI Platform (Demo)' },
        { id: 'pov3', title: 'Demo Tech Example' }
      ];

      const result = findBestMatch(mockPOVs, 'Tech Distributors');

      // Should return pov2 (best match with highest score)
      expect(result).toBeTruthy();
      expect(result.id).toBe('pov2');
    });

    test('service name search works correctly', () => {
      const mockServices = [
        { id: 'svc1', name: 'sentry-mcp' },
        { id: 'svc2', name: 'sentry-monitoring-service' }
      ];

      const result = findBestMatch(mockServices, 'sentry', 'name');

      // Should return svc1 (starts with 'sentry', higher score)
      expect(result).toBeTruthy();
      expect(result.id).toBe('svc1');
    });

    test('task name search works correctly', () => {
      const mockTasks = [
        { id: 'task1', title: 'Setup' },
        { id: 'task2', title: 'Setup Email Integration for Customer Notifications' }
      ];

      const result = findBestMatch(mockTasks, 'Setup Email');

      // Should return task2 (best match for 'Setup Email')
      expect(result).toBeTruthy();
      expect(result.id).toBe('task2');
    });

    test('agent template name search works correctly', () => {
      const mockTemplates = [
        { id: 'tmpl1', name: 'Developer' },
        { id: 'tmpl2', name: 'Senior Developer' }
      ];

      const result = findBestMatch(mockTemplates, 'Senior Developer', 'name');

      // Should return tmpl2 (exact match)
      expect(result).toBeTruthy();
      expect(result.id).toBe('tmpl2');
    });

    test('handles multi-word searches correctly', () => {
      const mockPOVs = [
        { id: 'pov1', title: 'Simple Project' },
        { id: 'pov2', title: 'Complex AI Platform Demo' }
      ];

      const result = findBestMatch(mockPOVs, 'AI Platform');

      // Should return pov2 (contains both words)
      expect(result).toBeTruthy();
      expect(result.id).toBe('pov2');
    });
  });
});
