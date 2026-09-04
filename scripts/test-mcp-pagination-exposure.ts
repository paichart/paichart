#!/usr/bin/env ts-node
/**
 * MCP Pagination Exposure Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation - Checks code uses MetadataEnhancer
 * Layer 2: Schema Behavior - Tests metadata extraction and formatting
 *
 * Created: 2025-11-15 (MCP Exposure Fix - Day 1)
 * Updated: 2026-01-05 (Removed browser automation - moved to Docker service)
 * Tests: 28 pattern + 18 behavior = 46 total
 * Tools Covered: project (task.list), project (pov.list), template (list), services (discover)
 * Utilities: MetadataEnhancer, type-coercion-helper
 */

import { MetadataEnhancer } from '../lib/mcp/server/utils/metadata-enhancer';
import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 MCP Pagination Exposure Tests (Dual-Layer)\n');

let passed = 0;
let failed = 0;
let layer1Passed = 0;
let layer2Passed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    failed++;
  }
}

function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof value !== 'number' || value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected "${value}" to contain "${substring}"`);
      }
    },
    toMatch(pattern: RegExp) {
      if (typeof value !== 'string' || !pattern.test(value)) {
        throw new Error(`Expected "${value}" to match pattern ${pattern}`);
      }
    }
  };
}

// ========================================
// LAYER 1: Pattern Validation
// ========================================

console.log('=====================================');
console.log('LAYER 1: Code Pattern Validation');
console.log('=====================================\n');

// Test 1: MetadataEnhancer exists
test('Pattern: MetadataEnhancer helper exists', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/metadata-enhancer.js');
  const exists = fs.existsSync(helperPath);
  expect(exists).toBe(true);
  layer1Passed++;
});

// Test 2: MetadataEnhancer imported in sdk-native-basic-tools
test('Pattern: sdk-native-basic-tools imports MetadataEnhancer', () => {
  const toolsPath = path.join(__dirname, '../lib/mcp/server/tools/sdk-native-basic-tools.js');
  const content = fs.readFileSync(toolsPath, 'utf-8');
  expect(content).toContain('MetadataEnhancer');
  expect(content).toContain("require('../utils/metadata-enhancer')");
  layer1Passed++;
});

// Test 3: project (task.list) uses createEnhancedMeta
test('Pattern: project (task.list) handler uses createEnhancedMeta', () => {
  const toolsPath = path.join(__dirname, '../lib/mcp/server/tools/sdk-native-basic-tools.js');
  const content = fs.readFileSync(toolsPath, 'utf-8');
  expect(content).toContain('MetadataEnhancer.createEnhancedMeta');
  expect(content).toContain('tool: \'project\'');
  layer1Passed++;
});

// Test 4: project (task.list) passes metadata to formatter
test('Pattern: project (task.list) passes metadata to formatTaskList', () => {
  const toolsPath = path.join(__dirname, '../lib/mcp/server/tools/sdk-native-basic-tools.js');
  const content = fs.readFileSync(toolsPath, 'utf-8');
  expect(content).toMatch(/formatTaskList\([^,]+,[^,]+,\s*enhancedMeta/);
  layer1Passed++;
});

// Test 5: formatTaskList accepts metadata parameter
test('Pattern: formatTaskList accepts metadata parameter', () => {
  const formatterPath = path.join(__dirname, '../lib/mcp/server/utils/formatters.js');
  const content = fs.readFileSync(formatterPath, 'utf-8');
  expect(content).toMatch(/formatTaskList\s*\([^,]+,[^,]+,\s*metadata/);
  layer1Passed++;
});

// Test 6: formatTaskList shows completeness header
test('Pattern: formatTaskList has completeness header logic', () => {
  const formatterPath = path.join(__dirname, '../lib/mcp/server/utils/formatters.js');
  const content = fs.readFileSync(formatterPath, 'utf-8');
  expect(content).toContain('metadata?.pagination');
  expect(content).toContain('Found ${pagination.returned} of ${pagination.total}');
  layer1Passed++;
});

// Test 7: formatTaskList shows "more results" hint
test('Pattern: formatTaskList has "more results" hint', () => {
  const formatterPath = path.join(__dirname, '../lib/mcp/server/utils/formatters.js');
  const content = fs.readFileSync(formatterPath, 'utf-8');
  expect(content).toContain('hasMore');
  expect(content).toContain('More results available');
  layer1Passed++;
});

// Test 8: formatTaskList shows performance footer
test('Pattern: formatTaskList has performance footer logic', () => {
  const formatterPath = path.join(__dirname, '../lib/mcp/server/utils/formatters.js');
  const content = fs.readFileSync(formatterPath, 'utf-8');
  expect(content).toContain('metadata?.performance');
  expect(content).toContain('queryTimeMs');
  layer1Passed++;
});

// Test 9: MetadataEnhancer has extractPagination
test('Pattern: MetadataEnhancer has extractPagination method', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/metadata-enhancer.js');
  const content = fs.readFileSync(helperPath, 'utf-8');
  expect(content).toContain('static extractPagination');
  expect(content).toContain('hasMore');
  expect(content).toContain('totalPages');
  layer1Passed++;
});

// Test 10: MetadataEnhancer has extractPerformance
test('Pattern: MetadataEnhancer has extractPerformance method', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/metadata-enhancer.js');
  const content = fs.readFileSync(helperPath, 'utf-8');
  expect(content).toContain('static extractPerformance');
  expect(content).toContain('queryTimeMs');
  expect(content).toContain('optimized');
  layer1Passed++;
});

// Test 11: MetadataEnhancer has createEnhancedMeta
test('Pattern: MetadataEnhancer has createEnhancedMeta method', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/metadata-enhancer.js');
  const content = fs.readFileSync(helperPath, 'utf-8');
  expect(content).toContain('static createEnhancedMeta');
  expect(content).toContain('this.extractPagination');
  expect(content).toContain('this.extractPerformance');
  layer1Passed++;
});

// Test 12: MetadataEnhancer has helper methods
test('Pattern: MetadataEnhancer has completeness helpers', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/metadata-enhancer.js');
  const content = fs.readFileSync(helperPath, 'utf-8');
  expect(content).toContain('getCompletenessSummary');
  expect(content).toContain('getNextPageHint');
  expect(content).toContain('getPerformanceSummary');
  layer1Passed++;
});

// Test 13: Hub tools import MetadataEnhancer
test('Pattern: hub-tools-handler imports MetadataEnhancer', () => {
  const hubPath = path.join(__dirname, '../lib/mcp/server/tools/hub-tools-handler.js');
  const content = fs.readFileSync(hubPath, 'utf-8');
  expect(content).toContain('MetadataEnhancer');
  expect(content).toContain("require('../utils/metadata-enhancer')");
  layer1Passed++;
});

// Test 14: services (discover) uses MetadataEnhancer (in extracted handler after Option 2)
test('Pattern: services (discover) uses MetadataEnhancer', () => {
  // After Option 2 extraction, check the service-discovery-handler instead
  const discoveryPath = path.join(__dirname, '../lib/mcp/server/tools/hub/service-discovery-handler.js');
  const content = fs.readFileSync(discoveryPath, 'utf-8');
  expect(content).toContain('MetadataEnhancer.extractPagination');
  expect(content).toContain('paginationMetadata');
  layer1Passed++;
});

// Tests 15-16: Browser automation tools - REMOVED
// Browser automation moved to browser-automation-service Docker container
// See: services/browser-automation-service/

// Test 17: project (pov.list) uses createEnhancedMeta (Sprint 1)
test('Pattern: project (pov.list) handler uses createEnhancedMeta', () => {
  const toolsPath = path.join(__dirname, '../lib/mcp/server/tools/sdk-native-basic-tools.js');
  const content = fs.readFileSync(toolsPath, 'utf-8');
  expect(content).toContain('MetadataEnhancer.createEnhancedMeta');
  expect(content).toContain('tool: \'project\'');
  layer1Passed++;
});

// Test 18: project (pov.list) passes metadata to formatter (Sprint 1)
test('Pattern: project (pov.list) passes metadata to formatPOVList', () => {
  const toolsPath = path.join(__dirname, '../lib/mcp/server/tools/sdk-native-basic-tools.js');
  const content = fs.readFileSync(toolsPath, 'utf-8');
  expect(content).toMatch(/formatPOVList\([^,]+,\s*enhancedMeta/);
  layer1Passed++;
});

// Test 19: formatPOVList accepts metadata parameter (Sprint 1)
test('Pattern: formatPOVList accepts metadata parameter', () => {
  const formatterPath = path.join(__dirname, '../lib/mcp/server/utils/formatters.js');
  const content = fs.readFileSync(formatterPath, 'utf-8');
  expect(content).toMatch(/formatPOVList\s*\([^,]+,\s*metadata/);
  layer1Passed++;
});

// Test 20: formatPOVList shows completeness header (Sprint 1)
test('Pattern: formatPOVList has completeness header logic', () => {
  const formatterPath = path.join(__dirname, '../lib/mcp/server/utils/formatters.js');
  const content = fs.readFileSync(formatterPath, 'utf-8');
  expect(content).toContain('metadata?.pagination');
  expect(content).toContain('Found ${pagination.returned} of ${pagination.total} total POVs');
  layer1Passed++;
});

// Test 21: template (list) uses createEnhancedMeta (Sprint 1)
test('Pattern: template (list) handler uses createEnhancedMeta', () => {
  const toolsPath = path.join(__dirname, '../lib/mcp/server/tools/sdk-native-basic-tools.js');
  const content = fs.readFileSync(toolsPath, 'utf-8');
  expect(content).toContain('MetadataEnhancer.createEnhancedMeta');
  expect(content).toContain('tool: \'template\'');
  layer1Passed++;
});

// Test 22: template (list) passes metadata to formatter (Sprint 1)
test('Pattern: template (list) passes metadata to formatAgentTemplateList', () => {
  const toolsPath = path.join(__dirname, '../lib/mcp/server/tools/sdk-native-basic-tools.js');
  const content = fs.readFileSync(toolsPath, 'utf-8');
  expect(content).toMatch(/formatAgentTemplateList\([^,]+,\s*enhancedMeta/);
  layer1Passed++;
});

// Test 23: formatAgentTemplateList accepts metadata parameter (Sprint 1)
test('Pattern: formatAgentTemplateList accepts metadata parameter', () => {
  const formatterPath = path.join(__dirname, '../lib/mcp/server/utils/formatters.js');
  const content = fs.readFileSync(formatterPath, 'utf-8');
  expect(content).toMatch(/formatAgentTemplateList\s*\([^,]+,\s*metadata/);
  layer1Passed++;
});

// Test 24: formatAgentTemplateList shows completeness header (Sprint 1)
test('Pattern: formatAgentTemplateList has completeness header logic', () => {
  const formatterPath = path.join(__dirname, '../lib/mcp/server/utils/formatters.js');
  const content = fs.readFileSync(formatterPath, 'utf-8');
  expect(content).toContain('Found ${pagination.returned} of ${pagination.total} total agent templates');
  layer1Passed++;
});

// Test 25: Type coercion helper exists (Sprint 1 improvement)
test('Pattern: type-coercion-helper utility exists', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/type-coercion-helper.js');
  const exists = fs.existsSync(helperPath);
  expect(exists).toBe(true);
  layer1Passed++;
});

// Test 26: Type coercion helper has core functions (Sprint 1)
test('Pattern: type-coercion-helper has coerceToNumber', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/type-coercion-helper.js');
  const content = fs.readFileSync(helperPath, 'utf-8');
  expect(content).toContain('function coerceToNumber');
  expect(content).toContain('parseInt(value, 10)');
  layer1Passed++;
});

// Test 27: Type coercion helper has coerceToBoolean (Sprint 1)
test('Pattern: type-coercion-helper has coerceToBoolean', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/type-coercion-helper.js');
  const content = fs.readFileSync(helperPath, 'utf-8');
  expect(content).toContain('function coerceToBoolean');
  expect(content).toContain("value === 'false'");
  layer1Passed++;
});

// Test 28: Type coercion helper has coercePromptArguments (Sprint 1)
test('Pattern: type-coercion-helper has coercePromptArguments', () => {
  const helperPath = path.join(__dirname, '../lib/mcp/server/utils/type-coercion-helper.js');
  const content = fs.readFileSync(helperPath, 'utf-8');
  expect(content).toContain('function coercePromptArguments');
  expect(content).toContain('maxPerPOV');
  expect(content).toContain('showAssignees');
  layer1Passed++;
});

// Test 29: audit_all_tasks uses type coercion helper (Sprint 1)
test('Pattern: audit_all_tasks uses type-coercion-helper', () => {
  const promptPath = path.join(__dirname, '../lib/mcp/server/prompts/prompt-registry.js');
  const content = fs.readFileSync(promptPath, 'utf-8');
  expect(content).toContain('type-coercion-helper');
  expect(content).toContain('coercePromptArguments');
  layer1Passed++;
});

// Test 30: audit_all_tasks has pagination education (Sprint 1)
// Note: project (task.list)_guided is now a database prompt; audit_all_tasks is the code-based prompt with pagination
test('Pattern: audit_all_tasks educates about pagination', () => {
  const promptPath = path.join(__dirname, '../lib/mcp/server/prompts/prompt-registry.js');
  const content = fs.readFileSync(promptPath, 'utf-8');
  expect(content).toContain('Returned ${tasks.length} of ${totalTasksForPOV} tasks');
  expect(content).toContain('More results available');
  expect(content).toContain('to see additional tasks');
  layer1Passed++;
});

// ========================================
// LAYER 2: Behavior Validation
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Behavior Validation');
console.log('=====================================\n');

// Mock API response (matches real API structure)
const mockApiResponse = {
  data: Array(100).fill({ id: 'task-1', title: 'Test Task' }),
  total: 534,
  page: 1,
  pageSize: 100,
  pagination: {
    hasMore: true,
    totalPages: 6,
    currentPage: 1,
    nextPage: 2,
    prevPage: null
  },
  _performance: {
    queryTimeMs: 45,
    optimized: true,
    queriesUsed: 7
  }
};

// Test 1: extractPagination extracts total
test('Behavior: extractPagination extracts total correctly', () => {
  const pagination = MetadataEnhancer.extractPagination(mockApiResponse) as any;
  expect(pagination.total).toBe(534);
  layer2Passed++;
});

// Test 2: extractPagination extracts returned count
test('Behavior: extractPagination calculates returned count', () => {
  const pagination = MetadataEnhancer.extractPagination(mockApiResponse) as any;
  expect(pagination.returned).toBe(100);
  layer2Passed++;
});

// Test 3: extractPagination extracts hasMore
test('Behavior: extractPagination extracts hasMore flag', () => {
  const pagination = MetadataEnhancer.extractPagination(mockApiResponse) as any;
  expect(pagination.hasMore).toBe(true);
  layer2Passed++;
});

// Test 4: extractPagination extracts page numbers
test('Behavior: extractPagination extracts page numbers', () => {
  const pagination = MetadataEnhancer.extractPagination(mockApiResponse) as any;
  expect(pagination.currentPage).toBe(1);
  expect(pagination.totalPages).toBe(6);
  expect(pagination.nextPage).toBe(2);
  layer2Passed++;
});

// Test 5: extractPagination handles null pagination
test('Behavior: extractPagination handles response without pagination', () => {
  const simpleResponse = { data: [1, 2, 3] };
  const pagination = MetadataEnhancer.extractPagination(simpleResponse) as any;
  expect(pagination.total).toBe(3);
  expect(pagination.hasMore).toBe(false);
  layer2Passed++;
});

// Test 6: extractPerformance extracts queryTimeMs
test('Behavior: extractPerformance extracts queryTimeMs', () => {
  const performance = MetadataEnhancer.extractPerformance(mockApiResponse) as any;
  expect(performance?.queryTimeMs).toBe(45);
  layer2Passed++;
});

// Test 7: extractPerformance extracts optimized flag
test('Behavior: extractPerformance extracts optimized flag', () => {
  const performance = MetadataEnhancer.extractPerformance(mockApiResponse) as any;
  expect(performance?.optimized).toBe(true);
  layer2Passed++;
});

// Test 8: extractPerformance extracts queriesUsed
test('Behavior: extractPerformance extracts queriesUsed', () => {
  const performance = MetadataEnhancer.extractPerformance(mockApiResponse) as any;
  expect(performance?.queriesUsed).toBe(7);
  layer2Passed++;
});

// Test 9: extractPerformance returns null when no performance data
test('Behavior: extractPerformance returns null without _performance', () => {
  const simpleResponse = { data: [1, 2, 3] };
  const performance = MetadataEnhancer.extractPerformance(simpleResponse);
  expect(performance).toBe(null);
  layer2Passed++;
});

// Test 10: createEnhancedMeta includes pagination
test('Behavior: createEnhancedMeta includes pagination metadata', () => {
  const meta = MetadataEnhancer.createEnhancedMeta({
    tool: 'project',
    apiResponse: mockApiResponse,
    filters: { status: 'OPEN' },
    additionalMeta: {}
  }) as any;
  expect(meta.pagination.total).toBe(534);
  expect(meta.pagination.hasMore).toBe(true);
  layer2Passed++;
});

// Test 11: createEnhancedMeta includes performance
test('Behavior: createEnhancedMeta includes performance metadata', () => {
  const meta = MetadataEnhancer.createEnhancedMeta({
    tool: 'project',
    apiResponse: mockApiResponse,
    filters: {},
    additionalMeta: {}
  }) as any;
  expect(meta.performance?.queryTimeMs).toBe(45);
  expect(meta.performance?.optimized).toBe(true);
  layer2Passed++;
});

// Test 12: createEnhancedMeta includes standard fields
test('Behavior: createEnhancedMeta includes standard MCP fields', () => {
  const meta = MetadataEnhancer.createEnhancedMeta({
    tool: 'project',
    apiResponse: mockApiResponse,
    filters: { limit: 100 },
    additionalMeta: {}
  }) as any;
  expect(meta.tool).toBe('project');
  expect(meta.sdkNative).toBe(true);
  expect(meta.itemCount).toBe(100);
  layer2Passed++;
});

// Test 13: getCompletenessSummary generates correct summary
test('Behavior: getCompletenessSummary generates correct text', () => {
  const pagination = MetadataEnhancer.extractPagination(mockApiResponse) as any;
  const summary = MetadataEnhancer.getCompletenessSummary(pagination) as any;
  expect(summary).toContain('100 of 534 total');
  expect(summary).toContain('page 1 of 6');
  expect(summary).toContain('More results available');
  layer2Passed++;
});

// Test 14: getNextPageHint generates hint when hasMore=true
// BUG-TEMPLATE-001 fix (2026-05-23, 56b16673): hint changed from
// 'use page=2 to continue' to 'increase limit (max 200) or add filters
// to narrow'. The old `page=N` hint advertised an unimplemented param
// (no MCP tool schema or handler accepts page/offset — filter-narrow
// by design, see [[feedback_mcp_filter_narrow_not_page_walk]]).
// Pinning assertion updated to match the corrected hint.
test('Behavior: getNextPageHint generates hint for partial results', () => {
  const pagination = MetadataEnhancer.extractPagination(mockApiResponse) as any;
  const hint = MetadataEnhancer.getNextPageHint(pagination, 'project') as any;
  expect(hint).toContain('More results available');
  expect(hint).toContain('increase limit');
  // Regression guard: must NOT regress to misleading 'page=N' hint.
  // Inline expect helper doesn't support .not chaining — assert manually.
  if (hint.includes('page=')) {
    throw new Error(`Hint regressed to old page= shape: "${hint}"`);
  }
  layer2Passed++;
});

// Test 15: Type coercion - coerceToNumber handles strings (Sprint 1)
test('Behavior: coerceToNumber converts string to number', () => {
  const { coerceToNumber } = require('../lib/mcp/server/utils/type-coercion-helper');
  expect(coerceToNumber('200', 100)).toBe(200);
  expect(coerceToNumber(200, 100)).toBe(200);
  expect(coerceToNumber('invalid', 100)).toBe(100);
  expect(coerceToNumber(null, 100)).toBe(100);
  layer2Passed++;
});

// Test 16: Type coercion - coerceToBoolean handles string 'false' (Sprint 1)
test('Behavior: coerceToBoolean handles string false correctly', () => {
  const { coerceToBoolean } = require('../lib/mcp/server/utils/type-coercion-helper');
  expect(coerceToBoolean('false', true)).toBe(false);
  expect(coerceToBoolean('true', false)).toBe(true);
  expect(coerceToBoolean(false, true)).toBe(false);
  expect(coerceToBoolean(true, false)).toBe(true);
  layer2Passed++;
});

// Test 17: Type coercion - coercePromptArguments handles common params (Sprint 1)
test('Behavior: coercePromptArguments handles numeric and boolean params', () => {
  const { coercePromptArguments } = require('../lib/mcp/server/utils/type-coercion-helper');
  const result = coercePromptArguments({
    maxPerPOV: '500',
    showAssignees: 'false',
    includeCompleted: 'true',
    limit: '100'
  });
  expect(result.maxPerPOV).toBe(500);
  expect(result.showAssignees).toBe(false);
  expect(result.includeCompleted).toBe(true);
  expect(result.limit).toBe(100);
  layer2Passed++;
});

// Test 18: Type coercion - coerceToEnum handles case-insensitive matching (Sprint 1)
test('Behavior: coerceToEnum handles case-insensitive enum values', () => {
  const { coerceToEnum } = require('../lib/mcp/server/utils/type-coercion-helper');
  expect(coerceToEnum('high', ['HIGH', 'MEDIUM', 'LOW'], 'MEDIUM')).toBe('HIGH');
  expect(coerceToEnum('HIGH', ['HIGH', 'MEDIUM', 'LOW'], 'MEDIUM')).toBe('HIGH');
  expect(coerceToEnum('invalid', ['HIGH', 'MEDIUM', 'LOW'], 'MEDIUM')).toBe('MEDIUM');
  layer2Passed++;
});

// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('MCP Pagination Exposure Summary:');
console.log('=====================================');
console.log(`\n📊 Layer 1 (Pattern): ${layer1Passed}/28`);
console.log(`📊 Layer 2 (Behavior): ${layer2Passed}/18`);
console.log(`\n✅ Total Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
console.log(`📊 Total Tests:  ${passed + failed}`);
console.log('📦 Tools Covered: project, template, services');
console.log('📦 Utilities: MetadataEnhancer, type-coercion-helper');
console.log('=====================================\n');

if (failed > 0) {
  console.error('❌ Some tests failed!\n');
  console.error('🔧 Check that all Day 1 fixes are in place:');
  console.error('   1. MetadataEnhancer helper created');
  console.error('   2. sdk-native-basic-tools updated');
  console.error('   3. formatters.js updated\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  console.log('🎉 MCP Pagination Exposure Fix validated!');
  console.log('📝 Next steps:');
  console.log('   1. Test with real MCP server');
  console.log('   2. Verify _meta.pagination in responses');
  console.log('   3. Verify formatted text shows completeness\n');
  process.exit(0);
}
