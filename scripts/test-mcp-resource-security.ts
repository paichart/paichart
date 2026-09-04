#!/usr/bin/env ts-node
/**
 * MCP Resource Security Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation - Checks code for security patterns
 * Layer 2: Schema Behavior - Tests validation schemas and key consistency
 *
 * Created: 2026-02-26 (P0-P2 Resource Manager Security Fixes)
 * Tests: 20 pattern + 22 behavior = 42 total
 *
 * Covers:
 * - Authentication patterns on resource endpoints
 * - POV access validation patterns
 * - Audit logging patterns
 * - Resource validation schemas (ListResources, ReadResource, POVContext)
 * - Resource key format consistency (dash-prefix, not colon)
 * - TTL cache expiration in SimpleResourceManager
 * - HTTP server resources/read handler existence
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ListResourcesQuerySchema,
  ReadResourceQuerySchema,
  POVContextSchema,
  ResourceResponseSchema,
} from '../lib/validation/mcp-resources-validation';

console.log('🧪 MCP Resource Security Tests (Dual-Layer)\n');

let passed = 0;
let failed = 0;
let layer1Passed = 0;
let layer2Passed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`\u2705 ${description}`);
    passed++;
  } catch (error) {
    console.error(`\u274C ${description}`);
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
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof value !== 'number' || value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy value, got ${value}`);
      }
    },
    toBeFalsy() {
      if (value) {
        throw new Error(`Expected falsy value, got ${value}`);
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected string to contain "${substring}", got "${typeof value === 'string' ? value.substring(0, 100) : value}"`);
      }
    },
    notToContain(substring: string) {
      if (typeof value === 'string' && value.includes(substring)) {
        throw new Error(`Expected string NOT to contain "${substring}"`);
      }
    }
  };
}

// ========================================
// Load source files for pattern analysis
// ========================================

const resourceIdRoutePath = path.join(process.cwd(), 'app/api/mcp/resources/[resourceId]/route.ts');
const resourceIdRoute = fs.readFileSync(resourceIdRoutePath, 'utf-8');

const uriRoutePath = path.join(process.cwd(), 'app/api/mcp/resources/[...uri]/route.ts');
const uriRoute = fs.readFileSync(uriRoutePath, 'utf-8');

const listRoutePath = path.join(process.cwd(), 'app/api/mcp/resources/route.ts');
const listRoute = fs.readFileSync(listRoutePath, 'utf-8');

const simpleRMPath = path.join(process.cwd(), 'lib/mcp/simple-resource-manager.js');
const simpleRM = fs.readFileSync(simpleRMPath, 'utf-8');

const resourceManagerTSPath = path.join(process.cwd(), 'lib/services/mcp/resourceManager.ts');
const resourceManagerTS = fs.readFileSync(resourceManagerTSPath, 'utf-8');

const httpServerPath = path.join(process.cwd(), 'mcp-server-http-clean.js');
const httpServer = fs.readFileSync(httpServerPath, 'utf-8');

// Wave 7 Phase 7.2 (2026-05-21): processMCPRequest body moved from
// mcp-server-http-clean.js to lib/mcp/server/mcp-core.ts (MCPCoreManager.
// processRequest). resources/read URI parsing further split to
// lib/mcp/server/mcp-resource-uri.ts. Pattern assertions below grep the
// COMBINED dispatch surface so they keep passing through the refactor.
const mcpCorePath = path.join(process.cwd(), 'lib/mcp/server/mcp-core.ts');
const mcpCore = fs.readFileSync(mcpCorePath, 'utf-8');
const resourceUriPath = path.join(process.cwd(), 'lib/mcp/server/mcp-resource-uri.ts');
const resourceUri = fs.readFileSync(resourceUriPath, 'utf-8');
// Combined source for resource-handler pattern assertions.
const mcpDispatchSurface = httpServer + '\n' + mcpCore + '\n' + resourceUri;

const sharedUtilsPath = path.join(process.cwd(), 'lib/mcp/resource-manager-shared.js');
const sharedUtils = fs.readFileSync(sharedUtilsPath, 'utf-8');

const validationPath = path.join(process.cwd(), 'lib/validation/mcp-resources-validation.ts');
const validationFile = fs.readFileSync(validationPath, 'utf-8');

// ========================================
// LAYER 1: Pattern Validation (20 tests)
// ========================================

console.log('=====================================');
console.log('LAYER 1: Code Pattern Validation');
console.log('=====================================\n');

// --- P0 #1: HTTP server resources/read handler ---

test('Pattern: HTTP server has resources/read case handler', () => {
  // Wave 7 Phase 7.2: dispatch switch moved to lib/mcp/server/mcp-core.ts
  expect(mcpDispatchSurface).toContain("case 'resources/read':");
  layer1Passed++;
});

test('Pattern: HTTP resources/read validates missing URI param', () => {
  // Wave 7 Phase 7.2: moved to lib/mcp/server/mcp-core.ts:processRequest
  expect(mcpDispatchSurface).toContain("Missing required parameter: uri");
  layer1Passed++;
});

test('Pattern: HTTP resources/read handles hub resources', () => {
  // Wave 7 Phase 7.2: moved to lib/mcp/server/mcp-core.ts:processRequest
  expect(mcpDispatchSurface).toContain("readUri.startsWith('mcp://hub/')");
  layer1Passed++;
});

test('Pattern: HTTP resources/read constructs dash-prefixed keys', () => {
  // Wave 7 Phase 7.2: URI parsing extracted to lib/mcp/server/mcp-resource-uri.ts
  // (parseResourceUri pure helper). Renamed readResourceId → resourceId.
  expect(mcpDispatchSurface).toContain("`artifact-${resourceId}`");
  expect(mcpDispatchSurface).toContain("`execution-${resourceId}`");
  layer1Passed++;
});

test('Pattern: HTTP resources/read has POV access validation', () => {
  // Wave 7 Phase 7.2: moved to lib/mcp/server/mcp-core.ts:processRequest
  expect(mcpDispatchSurface).toContain('readResource.metadata?.povContext');
  expect(mcpDispatchSurface).toContain('Access denied: insufficient POV permissions');
  layer1Passed++;
});

// --- P0 #2: [resourceId]/route.ts security ---

test('Pattern: [resourceId] route imports getAuthUser', () => {
  expect(resourceIdRoute).toContain("import { getAuthUser }");
  layer1Passed++;
});

test('Pattern: [resourceId] route imports validatePOVAccess', () => {
  expect(resourceIdRoute).toContain("import { validatePOVAccess }");
  layer1Passed++;
});

test('Pattern: [resourceId] route imports trackActivity for audit', () => {
  expect(resourceIdRoute).toContain("import { trackActivity }");
  layer1Passed++;
});

test('Pattern: [resourceId] route calls getAuthUser(request)', () => {
  expect(resourceIdRoute).toContain("await getAuthUser(request)");
  layer1Passed++;
});

test('Pattern: [resourceId] route returns UNAUTHORIZED for unauthenticated', () => {
  expect(resourceIdRoute).toContain("'UNAUTHORIZED'");
  layer1Passed++;
});

test('Pattern: [resourceId] route validates POV with cached context', () => {
  expect(resourceIdRoute).toContain("cachedPOVContext");
  expect(resourceIdRoute).toContain("validatePOVAccess(user,");
  layer1Passed++;
});

test('Pattern: [resourceId] route blocks non-admin without POV context', () => {
  expect(resourceIdRoute).toContain("UserRole.ADMIN");
  expect(resourceIdRoute).toContain("'FORBIDDEN'");
  layer1Passed++;
});

// --- P1 #3: HTTP resources/list POV filtering ---

test('Pattern: HTTP resources/list filters by POV for non-admin users', () => {
  // Wave 7 Phase 7.2: moved to lib/mcp/server/mcp-core.ts:processRequest
  expect(mcpDispatchSurface).toContain("povCtx.ownerId === userId");
  expect(mcpDispatchSurface).toContain("povCtx.teamMemberIds");
  expect(mcpDispatchSurface).toContain("povCtx.isDemo === true");
  layer1Passed++;
});

test('Pattern: HTTP resources/list allows admin to see everything', () => {
  // Wave 7 Phase 7.2: moved to lib/mcp/server/mcp-core.ts:processRequest.
  // Variable name `user` was renamed to `usr` (TS-narrowed local) per
  // C-CROSS-1 inline guard pattern. Match either name to keep test
  // forwards-compatible.
  const adminCheckOld = "user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'";
  const adminCheckNew = "usr.role === 'ADMIN' || usr.role === 'SUPER_ADMIN'";
  expect(
    mcpDispatchSurface.includes(adminCheckOld) || mcpDispatchSurface.includes(adminCheckNew)
  ).toBe(true);
  layer1Passed++;
});

// --- P1 #4: No $disconnect on shared Prisma ---

test('Pattern: SimpleResourceManager.close() does NOT call $disconnect in code', () => {
  // The close method should NOT have executable $disconnect — comments are fine
  const closeMethod = simpleRM.match(/async close\(\)\s*\{[\s\S]*?\n\s*\}/);
  expect(closeMethod).toBeTruthy();
  if (closeMethod) {
    // Strip single-line comments to test only executable code
    const codeOnly = closeMethod[0].replace(/\/\/.*$/gm, '');
    expect(codeOnly).notToContain('$disconnect');
  }
  layer1Passed++;
});

// --- P2 #5: Key format consistency ---

test('Pattern: MCPResourceManager (TS) uses dash-prefixed execution keys', () => {
  // After shared extraction: uses buildResourceKey('execution', ...) or RESOURCE_KEY_PREFIX.EXECUTION
  expect(resourceManagerTS).toContain("buildResourceKey('execution'");
  expect(resourceManagerTS).notToContain('`execution:${');
  layer1Passed++;
});

test('Pattern: MCPResourceManager (TS) uses dash-prefixed artifact keys', () => {
  // After shared extraction: uses buildResourceKey('artifact', ...) or RESOURCE_KEY_PREFIX.ARTIFACT
  expect(resourceManagerTS).toContain("buildResourceKey('artifact'");
  // Only the description string "Generated artifact: " should contain "artifact:"
  const artifactColonKeys = resourceManagerTS.match(/`artifact:\$\{/g);
  expect(artifactColonKeys).toBeFalsy();
  layer1Passed++;
});

test('Pattern: SimpleResourceManager (JS) uses dash-prefixed keys via shared constants', () => {
  // After shared extraction: uses RESOURCE_KEY_PREFIX.ARTIFACT / .EXECUTION instead of hardcoded strings
  expect(simpleRM).toContain('startsWith(RESOURCE_KEY_PREFIX.ARTIFACT)');
  expect(simpleRM).toContain('startsWith(RESOURCE_KEY_PREFIX.EXECUTION)');
  layer1Passed++;
});

// --- P2 #6: TTL cache expiration ---

test('Pattern: SimpleResourceManager has TTL expiration', () => {
  expect(simpleRM).toContain('CACHE_TTL_MS');
  expect(simpleRM).toContain('_expiresAt');
  expect(simpleRM).toContain('_cleanupExpired');
  layer1Passed++;
});

// --- Validation schemas exist ---

test('Pattern: Validation file has POVContextSchema', () => {
  expect(validationFile).toContain('POVContextSchema');
  expect(validationFile).toContain('ownerId');
  expect(validationFile).toContain('teamMemberIds');
  layer1Passed++;
});


// ========================================
// LAYER 2: Schema Behavior Validation (22 tests)
// ========================================

console.log('\n=====================================');
console.log('LAYER 2: Schema Behavior Validation');
console.log('=====================================\n');

// --- ListResourcesQuerySchema ---

test('Behavior: ListResourcesQuerySchema accepts valid query params', () => {
  const result = ListResourcesQuerySchema.safeParse({
    serverName: 'paichart',
    type: 'file',
    limit: '50',
    sortBy: 'name',
    sortOrder: 'asc'
  });
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: ListResourcesQuerySchema accepts empty object', () => {
  const result = ListResourcesQuerySchema.safeParse({});
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: ListResourcesQuerySchema accepts null serverName (form pattern)', () => {
  const result = ListResourcesQuerySchema.safeParse({ serverName: null });
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: ListResourcesQuerySchema rejects invalid resource type', () => {
  const result = ListResourcesQuerySchema.safeParse({ type: 'INVALID_TYPE' });
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: ListResourcesQuerySchema rejects limit > 200', () => {
  const result = ListResourcesQuerySchema.safeParse({ limit: '500' });
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: ListResourcesQuerySchema rejects extra unknown fields', () => {
  // .strict() should reject unknown fields
  const result = ListResourcesQuerySchema.safeParse({ unknownField: 'hack' });
  expect(result.success).toBe(false);
  layer2Passed++;
});

test('Behavior: ListResourcesQuerySchema validates CUID for povId', () => {
  // Valid CUID
  const valid = ListResourcesQuerySchema.safeParse({ povId: 'clxy1234567890abcdef12345' });
  expect(valid.success).toBe(true);
  // Invalid UUID
  const invalid = ListResourcesQuerySchema.safeParse({ povId: '550e8400-e29b-41d4-a716-446655440000' });
  expect(invalid.success).toBe(false);
  layer2Passed++;
});

// --- ReadResourceQuerySchema ---

test('Behavior: ReadResourceQuerySchema accepts valid params', () => {
  const result = ReadResourceQuerySchema.safeParse({
    serverName: 'paichart',
    includeContent: 'true'
  });
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: ReadResourceQuerySchema accepts empty object', () => {
  const result = ReadResourceQuerySchema.safeParse({});
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: ReadResourceQuerySchema validates CUID for povId', () => {
  const valid = ReadResourceQuerySchema.safeParse({ povId: 'clxy1234567890abcdef12345' });
  expect(valid.success).toBe(true);
  const invalid = ReadResourceQuerySchema.safeParse({ povId: 'not-a-cuid' });
  expect(invalid.success).toBe(false);
  layer2Passed++;
});

test('Behavior: ReadResourceQuerySchema rejects extra unknown fields', () => {
  const result = ReadResourceQuerySchema.safeParse({ injection: '<script>alert(1)</script>' });
  expect(result.success).toBe(false);
  layer2Passed++;
});

// --- POVContextSchema ---

test('Behavior: POVContextSchema accepts valid POV context', () => {
  const result = POVContextSchema.safeParse({
    id: 'clxy1234567890abcdef12345',
    ownerId: 'user123',
    teamMemberIds: ['user456', 'user789'],
    isDemo: false,
  });
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: POVContextSchema accepts null (form pattern)', () => {
  const result = POVContextSchema.safeParse(null);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: POVContextSchema accepts undefined', () => {
  const result = POVContextSchema.safeParse(undefined);
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: POVContextSchema validates CUID for id field', () => {
  const invalid = POVContextSchema.safeParse({
    id: 'not-a-cuid-format',
    ownerId: 'user123',
  });
  expect(invalid.success).toBe(false);
  layer2Passed++;
});

// --- ResourceResponseSchema ---

test('Behavior: ResourceResponseSchema accepts valid resource', () => {
  const result = ResourceResponseSchema.safeParse({
    uri: 'mcp://artifacts/abc123',
    name: 'Test Artifact',
    description: 'A test artifact',
    mimeType: 'application/json',
  });
  expect(result.success).toBe(true);
  layer2Passed++;
});

test('Behavior: ResourceResponseSchema requires uri and name', () => {
  const missingUri = ResourceResponseSchema.safeParse({ name: 'test' });
  expect(missingUri.success).toBe(false);
  const missingName = ResourceResponseSchema.safeParse({ uri: 'mcp://test' });
  expect(missingName.success).toBe(false);
  layer2Passed++;
});

test('Behavior: ResourceResponseSchema accepts metadata with povContext', () => {
  const result = ResourceResponseSchema.safeParse({
    uri: 'mcp://artifacts/abc',
    name: 'Test',
    metadata: {
      povId: 'clxy1234567890abcdef12345',
      povContext: {
        id: 'clxy1234567890abcdef12345',
        ownerId: 'user1',
        teamMemberIds: ['user2'],
        isDemo: false,
      }
    }
  });
  expect(result.success).toBe(true);
  layer2Passed++;
});

// --- Key format consistency (behavior) ---

test('Behavior: TS resource manager startsWith checks use dash prefix via shared constants', () => {
  // Verify no colon-prefixed startsWith in TS resource manager
  const colonStartsWith = resourceManagerTS.match(/startsWith\('(execution|artifact):/g);
  expect(colonStartsWith).toBeFalsy();
  // After shared extraction: uses RESOURCE_KEY_PREFIX.EXECUTION / .ARTIFACT
  expect(resourceManagerTS).toContain('startsWith(RESOURCE_KEY_PREFIX.EXECUTION)');
  expect(resourceManagerTS).toContain('startsWith(RESOURCE_KEY_PREFIX.ARTIFACT)');
  layer2Passed++;
});

test('Behavior: JS resource manager startsWith checks use dash prefix via shared constants', () => {
  const colonStartsWith = simpleRM.match(/startsWith\('(execution|artifact):/g);
  expect(colonStartsWith).toBeFalsy();
  // After shared extraction: uses RESOURCE_KEY_PREFIX.ARTIFACT / .EXECUTION
  expect(simpleRM).toContain('startsWith(RESOURCE_KEY_PREFIX.ARTIFACT)');
  expect(simpleRM).toContain('startsWith(RESOURCE_KEY_PREFIX.EXECUTION)');
  layer2Passed++;
});

// --- TTL behavior ---

test('Behavior: SimpleResourceManager TTL is 10 minutes (from shared constants)', () => {
  // After shared extraction: TTL is defined in resource-manager-shared.js CACHE_DEFAULTS
  expect(simpleRM).toContain('CACHE_DEFAULTS.TTL_MS');
  // Verify the actual value in the shared module
  const ttlMatch = sharedUtils.match(/TTL_MS:\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
  expect(ttlMatch).toBeTruthy();
  if (ttlMatch) {
    const ttlMs = parseInt(ttlMatch[1]) * parseInt(ttlMatch[2]) * parseInt(ttlMatch[3]);
    expect(ttlMs).toBe(600000); // 10 * 60 * 1000 = 600000ms = 10 min
  }
  layer2Passed++;
});

test('Behavior: SimpleResourceManager sets _expiresAt on register', () => {
  expect(simpleRM).toContain('_expiresAt: Date.now() + this.CACHE_TTL_MS');
  layer2Passed++;
});


// ========================================
// Summary
// ========================================

console.log('\n=====================================');
console.log('MCP Resource Security Summary:');
console.log('=====================================');
console.log(`\n\uD83D\uDCCA Layer 1 (Pattern): ${layer1Passed}/20`);
console.log(`\uD83D\uDCCA Layer 2 (Behavior): ${layer2Passed}/22`);
console.log(`\n\u2705 Total Passed: ${passed}`);
console.log(`\u274C Total Failed: ${failed}`);
console.log(`\uD83D\uDCCA Total Tests:  ${passed + failed}`);
console.log('=====================================\n');

if (failed > 0) {
  console.error('\u274C Some tests failed!\n');
  process.exit(1);
} else {
  console.log('\u2705 All tests passed!\n');
  process.exit(0);
}
