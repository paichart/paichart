#!/usr/bin/env tsx
/**
 * API Schema Validation Script
 *
 * Validates actual API responses against Zod schemas to prevent schema drift.
 *
 * Usage (local — .env is auto-loaded for PAICHART_API_KEY / TEST_POV_ID):
 *   npm run dev &       # Start server
 *   npm run validate:schemas
 *
 * Usage (against production — 2026-06-11, token guidance corrected 2026-06-12):
 *   BASE_URL=https://paichart.app PAICHART_API_KEY=<RS256 token> npm run validate:schemas
 *   # The token MUST be RS256 first-party (the /api verifier is RS256-only since
 *   # 2026-05-28) AND belong to a user with ACCESS TO TEST_POV_ID — the two
 *   # analytics tests are povId-gated (validatePOVAccess; 404-not-403 IDOR
 *   # masking). PAICHART_MONITOR_TOKEN does NOT work for those (monitor user
 *   # has no POV memberships → 404 'POV not found'). Mint a short-lived admin
 *   # token instead:
 *   #   npx tsx scripts/mint-monitor-token.ts --email <admin email> --ttl-days 1
 *   # (Verified 2026-06-12: 3/3 PASS on prod against the unified URLs.)
 *   # TEST_POV_ID defaults to a prod POV; override for other environments.
 *
 * Exit codes:
 *   0 = All schemas valid
 *   1 = Schema validation failed
 *
 * @version 1.1 — BASE_URL override + dotenv auto-load (2026-06-11)
 * @created 2025-10-29
 */

// Load .env so local runs pick up PAICHART_API_KEY / TEST_POV_ID without
// exporting them manually. dotenv never overrides vars already set in the
// shell, so explicit `BASE_URL=... PAICHART_API_KEY=...` invocations win.
import 'dotenv/config';

import { z } from 'zod';
import {
  PerformanceResponseSchema,
  InsightsResponseSchema,
  AgentExecutionsResponseSchema
} from '../lib/validation/analytics-response';

// Unified analytics endpoint nests each metric under its key:
// old wrapper: { data: <performance> }  →  unified: { data: { performance: <performance> } }
// (Deprecated wrappers removed at sunset 2026-06-12; see analytics-api-migration-guide.md)
const UnifiedPerformanceResponseSchema = z.object({
  data: z.object({ performance: PerformanceResponseSchema.shape.data })
});
const UnifiedInsightsResponseSchema = z.object({
  data: z.object({ insights: InsightsResponseSchema.shape.data })
});

// Target server — defaults to local dev; set BASE_URL to run against prod.
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

interface ValidationResult {
  api: string;
  endpoint: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  error?: string;
  duration?: number;
}

/**
 * Get authentication headers from environment
 */
function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.PAICHART_API_KEY;

  if (!apiKey) {
    console.warn(`  ${colors.yellow}⚠️  No PAICHART_API_KEY in environment - tests may be skipped${colors.reset}`);
    return {};
  }

  // Check if API key is JWT format (starts with 'eyJ')
  if (apiKey.startsWith('eyJ')) {
    return { 'Authorization': `Bearer ${apiKey}` };
  } else {
    return { 'X-API-Key': apiKey };
  }
}

/**
 * Validate a single API endpoint against its schema
 */
async function validateEndpoint(
  name: string,
  endpoint: string,
  schema: any
): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    console.log(`  Testing ${name}...`);

    const response = await fetch(endpoint, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      // If endpoint returns error, that's OK (might need auth or valid data)
      // We're testing schema, not auth/data
      if (response.status === 401 || response.status === 403) {
        console.log(`    ${colors.yellow}⚠️  Skipped (auth required)${colors.reset}`);
        return {
          api: name,
          endpoint,
          status: 'SKIP',
          error: `Auth required (${response.status})`
        };
      }

      // For other errors, try to parse response anyway (might have error schema)
      const data = await response.json().catch(() => null);
      if (data) {
        schema.parse(data);
        console.log(`    ${colors.green}✅ PASS${colors.reset} (${Date.now() - startTime}ms)`);
        return { api: name, endpoint, status: 'PASS', duration: Date.now() - startTime };
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    schema.parse(data);  // Validate against schema

    const duration = Date.now() - startTime;
    console.log(`    ${colors.green}✅ PASS${colors.reset} (${duration}ms)`);

    return {
      api: name,
      endpoint,
      status: 'PASS',
      duration
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`    ${colors.red}❌ FAIL${colors.reset} (${duration}ms)`);
    console.error(`    ${colors.red}Error: ${error.message}${colors.reset}`);

    return {
      api: name,
      endpoint,
      status: 'FAIL',
      error: error.message,
      duration
    };
  }
}

/**
 * Main validation function
 */
async function validateAllSchemas() {
  console.log(`\n${colors.bold}${colors.blue}🧪 API Schema Validation${colors.reset}\n`);
  console.log(`Testing against: ${BASE_URL}`);

  // Show auth status
  const apiKey = process.env.PAICHART_API_KEY;
  if (apiKey) {
    const authType = apiKey.startsWith('eyJ') ? 'JWT Bearer' : 'X-API-Key';
    console.log(`Authentication: ${colors.green}✅ ${authType}${colors.reset}`);
  } else {
    console.log(`Authentication: ${colors.yellow}⚠️  None (may skip auth-required endpoints)${colors.reset}`);
  }
  console.log('');

  const results: ValidationResult[] = [];

  // Get a test POV ID from database or use a known one
  // For production: Use a real POV ID (cmh2l5q56000kyxviw13ytx06 = Tech Distributors)
  const testPovId = process.env.TEST_POV_ID || 'cmh2l5q56000kyxviw13ytx06';

  // ==========================================
  // Analytics API Tests
  // ==========================================

  console.log(`${colors.bold}Analytics APIs:${colors.reset}`);

  results.push(await validateEndpoint(
    'Performance Analytics (unified)',
    `${BASE_URL}/api/analytics?domain=tasks&metrics=performance&povId=${testPovId}&timeRange=30d`,
    UnifiedPerformanceResponseSchema
  ));

  results.push(await validateEndpoint(
    'Insights Analytics (unified)',
    `${BASE_URL}/api/analytics?domain=tasks&metrics=insights&povId=${testPovId}&timeRange=30d`,
    UnifiedInsightsResponseSchema
  ));

  results.push(await validateEndpoint(
    'Agent Executions',
    `${BASE_URL}/api/agent-executions?dateRange=7d`,
    AgentExecutionsResponseSchema
  ));

  // ==========================================
  // TODO: Add more API validations
  // ==========================================

  // Workload API
  // results.push(await validateEndpoint(
  //   'Workload Analytics',
  //   `${BASE_URL}/api/tasks/analytics/workload?povId=${testPovId}`,
  //   WorkloadResponseSchema  // TODO: Create schema
  // ));

  // POV List API
  // results.push(await validateEndpoint(
  //   'POV List',
  //   `${BASE_URL}/api/pov`,
  //   POVListResponseSchema  // TODO: Create schema
  // ));

  // Task List API
  // results.push(await validateEndpoint(
  //   'Task List',
  //   `${BASE_URL}/api/tasks?povId=${testPovId}`,
  //   TaskListResponseSchema  // TODO: Create schema
  // ));

  // ==========================================
  // Report Results
  // ==========================================

  console.log(`\n${colors.bold}Results Summary:${colors.reset}\n`);

  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  const skipped = results.filter(r => r.status === 'SKIP');

  console.log(`  ${colors.green}✅ Passed: ${passed.length}${colors.reset}`);
  console.log(`  ${colors.red}❌ Failed: ${failed.length}${colors.reset}`);
  console.log(`  ${colors.yellow}⚠️  Skipped: ${skipped.length}${colors.reset}`);
  console.log(`  📊 Total: ${results.length}\n`);

  if (failed.length > 0) {
    console.error(`${colors.bold}${colors.red}Schema Validation Failed!${colors.reset}\n`);
    console.error(`${colors.red}Failed APIs:${colors.reset}`);
    failed.forEach(f => {
      console.error(`  • ${f.api}: ${f.error}`);
    });
    console.error('');
    process.exit(1);
  }

  if (passed.length === 0 && skipped.length === results.length) {
    console.warn(`${colors.yellow}⚠️  All tests skipped (auth required)${colors.reset}`);
    console.warn(`${colors.yellow}Set PAICHART_API_KEY environment variable to run validation${colors.reset}\n`);
    console.log(`${colors.blue}ℹ️  This is OK for production (auth is working correctly)${colors.reset}\n`);
    process.exit(0);  // Exit 0 - auth required is expected, not a failure
  }

  console.log(`${colors.green}${colors.bold}✅ All schemas valid!${colors.reset}\n`);

  // Show timing stats
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const avgDuration = Math.round(totalDuration / results.length);
  console.log(`⏱️  Average response time: ${avgDuration}ms`);
  console.log(`⏱️  Total validation time: ${totalDuration}ms\n`);

  process.exit(0);
}

// ==========================================
// Run validation
// ==========================================

console.log(`${colors.blue}Starting API schema validation...${colors.reset}`);
console.log(`${colors.yellow}Note: Server must be reachable at ${BASE_URL}${colors.reset}\n`);

validateAllSchemas().catch(error => {
  console.error(`${colors.red}${colors.bold}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
