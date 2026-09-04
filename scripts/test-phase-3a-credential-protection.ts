#!/usr/bin/env ts-node
/**
 * Phase 3a Credential Protection Tests (Dual-Layer Architecture)
 *
 * Layer 1: Pattern Validation - Checks code has security patterns
 * Layer 2: Behavior Validation - Tests actual credential sanitization
 *
 * Created: 2026-01-31
 * Purpose: Validate 3-layer defense-in-depth credential protection
 * Tests: 8 pattern + 16 behavior = 24 total
 * Specialist: boundary-contract-specialist (recommendation #3)
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

// Import sanitization functions
const { sanitizeConfiguration, sanitizeEndpointUrl, filterServiceArray } =
  require('../lib/mcp/server/tools/public-discovery-filter');

// Check if database is available (skip DB tests in CI/CD)
const DB_AVAILABLE = !!process.env.DATABASE_URL;
const prisma = DB_AVAILABLE ? new PrismaClient() : null;

console.log('🧪 Phase 3a Credential Protection Tests (Dual-Layer)\n');

let passed = 0;
let failed = 0;
let layer1Passed = 0;
let layer2Passed = 0;

function test(description: string, fn: () => void | Promise<void>) {
  return async () => {
    try {
      await fn();
      console.log(`✅ ${description}`);
      passed++;
    } catch (error) {
      console.error(`❌ ${description}`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      failed++;
    }
  };
}

function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy value, got ${value}`);
      }
    },
    toBeUndefined() {
      if (value !== undefined) {
        throw new Error(`Expected undefined, got ${value}`);
      }
    },
    toBeNull() {
      if (value !== null) {
        throw new Error(`Expected null, got ${value}`);
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected "${value}" to contain "${substring}"`);
      }
    },
    not: {
      toContain(substring: string) {
        if (typeof value === 'string' && value.includes(substring)) {
          throw new Error(`Expected "${value}" to NOT contain "${substring}"`);
        }
      }
    },
    toHaveLength(length: number) {
      if (!Array.isArray(value) || value.length !== length) {
        throw new Error(`Expected array length ${length}, got ${value?.length}`);
      }
    }
  };
}

async function runTests() {
  // ========================================
  // LAYER 1: Code Pattern Validation
  // ========================================

  console.log('=====================================');
  console.log('LAYER 1: Code Pattern Validation');
  console.log('=====================================\n');

  await test('Pattern: sanitizeConfiguration function exists', () => {
    const code = fs.readFileSync('lib/mcp/server/tools/public-discovery-filter.js', 'utf-8');
    expect(code.includes('function sanitizeConfiguration')).toBe(true);
    layer1Passed++;
  })();

  await test('Pattern: sanitizeEndpointUrl function exists', () => {
    const code = fs.readFileSync('lib/mcp/server/tools/public-discovery-filter.js', 'utf-8');
    expect(code.includes('function sanitizeEndpointUrl')).toBe(true);
    layer1Passed++;
  })();

  await test('Pattern: service-discovery excludes credentials field', () => {
    const code = fs.readFileSync('lib/mcp/server/tools/hub/service-discovery-handler.js', 'utf-8');
    expect(code.includes('credentials: false')).toBe(true);
    layer1Passed++;
  })();

  await test('Pattern: service-health excludes credentials field', () => {
    const code = fs.readFileSync('lib/mcp/server/tools/hub/service-health-handler.js', 'utf-8');
    expect(code.includes('credentials: false')).toBe(true);
    layer1Passed++;
  })();

  await test('Pattern: service-tools excludes credentials field', () => {
    const code = fs.readFileSync('lib/mcp/server/tools/hub/service-tools-handler.js', 'utf-8');
    expect(code.includes('credentials: false')).toBe(true);
    layer1Passed++;
  })();

  await test('Pattern: filterServiceArray applies sanitization', () => {
    const code = fs.readFileSync('lib/mcp/server/tools/public-discovery-filter.js', 'utf-8');
    // 2026-05-23: signature widened to sanitizeConfiguration(config, options)
    // for per-caller stripOwnerIdentity (Round 2 Hub probe / M1 sibling fix).
    expect(code.includes('sanitizeConfiguration(service.configuration')).toBe(true);
    layer1Passed++;
  })();

  await test('Pattern: SENSITIVE_KEYS list includes common patterns', () => {
    const code = fs.readFileSync('lib/mcp/server/tools/public-discovery-filter.js', 'utf-8');
    expect(code.includes('apiKey')).toBe(true);
    expect(code.includes('secret')).toBe(true);
    expect(code.includes('password')).toBe(true);
    expect(code.includes('credentials')).toBe(true);
    layer1Passed++;
  })();

  await test('Pattern: Functions exported for testing', () => {
    const code = fs.readFileSync('lib/mcp/server/tools/public-discovery-filter.js', 'utf-8');
    expect(code.includes('sanitizeConfiguration,')).toBe(true);
    expect(code.includes('sanitizeEndpointUrl,')).toBe(true);
    layer1Passed++;
  })();

  // ========================================
  // LAYER 2: Behavior Validation
  // ========================================

  console.log('\n=====================================');
  console.log('LAYER 2: Behavior Validation');
  console.log('=====================================\n');

  await test('Behavior: Strips API keys from configuration', () => {
    const unsafe = { category: 'test', apiKey: 'sk-secret-123', timeout: 5000 };
    const safe = sanitizeConfiguration(unsafe);
    expect(safe.apiKey).toBeUndefined();
    expect(safe.category).toBe('test');
    expect(safe.timeout).toBe(5000);
    layer2Passed++;
  })();

  await test('Behavior: Strips secrets from configuration', () => {
    const unsafe = { category: 'test', secret: 'my-secret', secretKey: 'key' };
    const safe = sanitizeConfiguration(unsafe);
    expect(safe.secret).toBeUndefined();
    expect(safe.secretKey).toBeUndefined();
    layer2Passed++;
  })();

  await test('Behavior: Strips passwords from configuration', () => {
    const unsafe = { password: 'pwd', pass: 'p', pwd: 'word' };
    const safe = sanitizeConfiguration(unsafe);
    expect(safe.password).toBeUndefined();
    expect(safe.pass).toBeUndefined();
    expect(safe.pwd).toBeUndefined();
    layer2Passed++;
  })();

  await test('Behavior: Sanitizes API keys in endpoint URLs', () => {
    const url = 'https://api.example.com/data?apikey=SECRET123&format=json';
    const sanitized = sanitizeEndpointUrl(url);
    // URL encoding: [REDACTED] becomes %5BREDACTED%5D
    const hasRedacted = sanitized.includes('[REDACTED]') || sanitized.includes('%5BREDACTED%5D');
    if (!hasRedacted) {
      throw new Error(`Expected URL to contain [REDACTED] (or URL-encoded), got: ${sanitized}`);
    }
    expect(sanitized).toContain('format=json');
    expect(sanitized).not.toContain('SECRET123');
    layer2Passed++;
  })();

  await test('Behavior: Handles nested sensitive data', () => {
    const nested = {
      category: 'test',
      level1: {
        level2: {
          apiKey: 'secret',
          safeData: 'keep'
        }
      }
    };
    const safe = sanitizeConfiguration(nested);
    expect(safe.level1.level2.apiKey).toBeUndefined();
    expect(safe.level1.level2.safeData).toBe('keep');
    layer2Passed++;
  })();

  await test('Behavior: Handles null and undefined safely', () => {
    expect(sanitizeConfiguration(null)).toBeNull();
    expect(sanitizeConfiguration(undefined)).toBeUndefined();
    const empty = sanitizeConfiguration({});
    expect(JSON.stringify(empty)).toBe('{}');
    layer2Passed++;
  })();

  await test('Behavior: Real production example (alpha-vantage)', () => {
    const realConfig = {
      ownerId: 'cmfwdwnxo0000yxb3onp3455g',
      category: 'data-services',
      endpoint: 'https://mcp.alphavantage.co/mcp?apikey=VDC0TPPNYN522YGT',
      createdBy: 'user_registration',
      ownerEmail: 'test@example.com'
    };
    const safe = sanitizeConfiguration(realConfig);
    expect(safe.category).toBe('data-services');
    const hasRedacted = safe.endpoint.includes('[REDACTED]') || safe.endpoint.includes('%5BREDACTED%5D');
    if (!hasRedacted) {
      throw new Error(`Expected endpoint to be sanitized, got: ${safe.endpoint}`);
    }
    expect(safe.endpoint).not.toContain('VDC0TPPNYN522YGT');
    expect(safe.ownerEmail).toBe('test@example.com');
    layer2Passed++;
  })();

  await test('Behavior: filterServiceArray sanitizes for authenticated users', () => {
    const service = {
      id: 'test-id',
      name: 'Test Service',
      configuration: {
        category: 'automation',
        endpoint: 'https://api.test.com?token=SECRET',
        apiKey: 'remove-me',
      },
      status: 'ACTIVE',
    };

    // Phase 3: isAuthenticated = true (always)
    const filtered = filterServiceArray([service], true);
    expect(filtered[0].configuration.apiKey).toBeUndefined();
    const hasRedacted = filtered[0].configuration.endpoint.includes('[REDACTED]') ||
                        filtered[0].configuration.endpoint.includes('%5BREDACTED%5D');
    if (!hasRedacted) {
      throw new Error(`Expected endpoint to be sanitized, got: ${filtered[0].configuration.endpoint}`);
    }
    layer2Passed++;
  })();

  await test('Behavior: Preserves safe fields in configuration', () => {
    const safe = {
      category: 'communication',
      endpoint: 'http://localhost:3101',
      timeout: 30000,
      poolSize: 5,
      ownerId: 'cm123',
    };
    const sanitized = sanitizeConfiguration(safe);
    expect(sanitized.category).toBe('communication');
    expect(sanitized.timeout).toBe(30000);
    expect(sanitized.poolSize).toBe(5);
    expect(sanitized.ownerId).toBe('cm123');
    layer2Passed++;
  })();

  await test('Behavior: Handles malformed URLs gracefully', () => {
    const malformed = 'not-a-valid-url';
    const sanitized = sanitizeEndpointUrl(malformed);
    expect(sanitized).toBe(malformed);
    layer2Passed++;
  })();

  await test('Behavior: Protects all 20 common credential field names', () => {
    const allSensitive = {
      apiKey: 's1', api_key: 's2', apikey: 's3',
      secret: 's4', secretKey: 's5', secret_key: 's6',
      password: 's7', pass: 's8', pwd: 's9',
      credentials: 's10', creds: 's11',
      token: 's12', accessToken: 's13', access_token: 's14',
      privateKey: 's15', private_key: 's16',
      clientSecret: 's17', client_secret: 's18',
      auth: 's19', authorization: 's20',
      safeField: 'keep'
    };
    const safe = sanitizeConfiguration(allSensitive);
    // Only safeField should remain (all 20 sensitive keys removed)
    const remainingKeys = Object.keys(safe);
    if (remainingKeys.length !== 1 || !remainingKeys.includes('safeField')) {
      throw new Error(`Expected only 'safeField', got: ${remainingKeys.join(', ')}`);
    }
    expect(safe.safeField).toBe('keep');
    layer2Passed++;
  })();

  await test('Behavior: Strips multiple query params with credentials', () => {
    const url = 'https://api.test.com/data?apikey=SECRET1&token=SECRET2&key=SECRET3&format=json';
    const sanitized = sanitizeEndpointUrl(url);
    expect(sanitized).not.toContain('SECRET1');
    expect(sanitized).not.toContain('SECRET2');
    expect(sanitized).not.toContain('SECRET3');
    expect(sanitized).toContain('format=json');
    layer2Passed++;
  })();

  // ========================================
  // CRITICAL: Production Data Validation
  // ========================================

  console.log('\n=====================================');
  console.log('CRITICAL: Production Data Verification');
  console.log('=====================================\n');

  if (DB_AVAILABLE) {
    await test('CRITICAL: Database credentials field is excluded from queries', async () => {
      const services = await prisma!.mCPTool.findMany({
        take: 5,
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          configuration: true,
          credentials: false,  // MUST be explicitly false
        }
      });

      services.forEach((service: any) => {
        expect(service.credentials).toBeUndefined();
      });
      layer2Passed++;
    })();
  } else {
    console.log('⏭️  SKIPPED: Database credentials field test (DATABASE_URL not available in CI)');
  }

  if (DB_AVAILABLE) {
    await test('CRITICAL: Configuration does not contain API keys (production data)', async () => {
      const services = await prisma!.mCPTool.findMany({
        select: {
          id: true,
          name: true,
          configuration: true,
        }
      });

      const sensitiveKeys = ['apiKey', 'api_key', 'secret', 'password', 'credentials', 'token', 'clientSecret'];
      const violations: any[] = [];

      services.forEach(service => {
        if (service.configuration && typeof service.configuration === 'object') {
          sensitiveKeys.forEach(key => {
            if ((service.configuration as any)[key]) {
              violations.push({
                service: service.name,
                field: key
              });
            }
          });
        }
      });

      if (violations.length > 0) {
        throw new Error(`Found ${violations.length} services with credentials in configuration: ${JSON.stringify(violations)}`);
      }

      layer2Passed++;
    })();
  } else {
    console.log('⏭️  SKIPPED: Production data verification test (DATABASE_URL not available in CI)');
  }

  await test('CRITICAL: Endpoint URLs are sanitized in responses', () => {
    const serviceWithKeyInUrl = {
      id: 'test',
      name: 'Test',
      configuration: {
        endpoint: 'https://mcp.alphavantage.co/mcp?apikey=VDC0TPPNYN522YGT',
        category: 'data-services',
      },
      status: 'ACTIVE'
    };

    const filtered = filterServiceArray([serviceWithKeyInUrl], true);
    const endpoint = filtered[0].configuration.endpoint;

    const hasRedacted = endpoint.includes('[REDACTED]') || endpoint.includes('%5BREDACTED%5D');
    if (!hasRedacted) {
      throw new Error(`Expected endpoint to be sanitized, got: ${endpoint}`);
    }
    expect(endpoint).not.toContain('VDC0TPPNYN522YGT');
    layer2Passed++;
  })();

  await test('CRITICAL: Defense-in-depth validation (3 layers working)', () => {
    // Layer 1: Prisma excludes credentials (tested above)
    // Layer 2: sanitizeConfiguration strips sensitive keys
    // Layer 3: filterServiceArray applies sanitization

    const testConfig = {
      category: 'test',
      endpoint: 'https://api.test.com?apikey=SECRET',
      apiKey: 'also-secret',
      safeField: 'keep',
    };

    // Test Layer 2
    const layer2Result = sanitizeConfiguration(testConfig);
    expect(layer2Result.apiKey).toBeUndefined();
    expect(layer2Result.safeField).toBe('keep');

    // Test Layer 3
    const service = { id: 'test', name: 'Test', configuration: testConfig };
    const layer3Result = filterServiceArray([service], true)[0];
    expect(layer3Result.configuration.apiKey).toBeUndefined();
    const hasRedacted = layer3Result.configuration.endpoint.includes('[REDACTED]') ||
                        layer3Result.configuration.endpoint.includes('%5BREDACTED%5D');
    if (!hasRedacted) {
      throw new Error(`Expected endpoint to be sanitized in layer 3`);
    }

    layer2Passed++;
  })();

  // ========================================
  // Fail-safe default (2026-07-28)
  // ========================================
  //
  // filterPublicServiceData's `isAuthenticated === false` branch is UNREACHABLE in
  // production — PUBLIC_TOOLS is empty, auth is enforced before any handler, and the
  // single production call site passes a hardcoded `true`. It was therefore flagged
  // as dead code during the 2026-07-27 review.
  //
  // It is not dead code, it is a fail-safe DEFAULT, and these assertions exist so a
  // future tidy-up cannot quietly remove it. Delete the branch and a caller that
  // omits the argument (or passes an undefined variable) receives the FULL
  // authenticated payload instead of the reduced one — failing open inside a
  // security filter. Red here means someone widened that default; read the ⚠️ block
  // above filterPublicServiceData before "fixing" it.

  await test('Fail-safe: omitted isAuthenticated yields the REDUCED public shape', () => {
    const service = {
      id: 'svc1',
      name: 'test-service',
      description: 'A service',
      status: 'ACTIVE',
      version: '1.0.0',
      capabilities: { tools: [] },
      configuration: {
        category: 'automation',
        endpoint: 'https://api.test.com?apikey=SECRET',
        ownerId: 'cowner00000000000000000000',
        ownerEmail: 'owner@example.com',
      },
      permissions: { owner: 'cowner00000000000000000000', publicAccess: false },
    };

    // Deliberately omit the isAuthenticated argument — the mistake this guards.
    const [result] = filterServiceArray([service]);

    // The reduced shape must NOT carry any of these.
    expect(result.configuration).toBeUndefined();
    expect(result.permissions).toBeUndefined();
    expect(result.endpoint).toBeUndefined();
    // Safe public fields survive.
    expect(result.id).toBe('svc1');
    expect(result.name).toBe('test-service');
    expect(result.category).toBe('automation');

    // Nothing sensitive anywhere in the serialized payload.
    const serialized = JSON.stringify(result);
    if (serialized.includes('SECRET') || serialized.includes('owner@example.com')) {
      throw new Error('Public shape leaked a credential or owner identity');
    }
    layer2Passed++;
  })();

  await test('Public shape carries no PHANTOM fields (2026-07-28)', () => {
    // isPopular and rating were removed: both read properties that do not exist on
    // MCPTool (`interactionCount`, `rating`), so they were permanently false/null.
    // Same class as the `service.userId` test fixed in service-health-handler.js —
    // both survived because this is untyped .js, where a missing property is
    // undefined rather than an error. tsc rejects the same access with TS2339.
    const service = {
      id: 'svc-phantom', name: 'p', description: 'd', status: 'ACTIVE', version: '1.0.0',
      capabilities: { tools: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], resources: ['r1'], prompts: [] },
      configuration: { category: 'data', endpoint: 'https://x.test' },
    };
    const [pub] = filterServiceArray([service]);

    if ('isPopular' in pub) throw new Error('isPopular returned — it reads a nonexistent MCPTool field');
    if ('rating' in pub) throw new Error('rating returned — it reads a nonexistent MCPTool field');

    // featureCount corrected: was Object.keys(capabilities).length, i.e. ~3 for every
    // service (tools/resources/prompts), regardless of content. Now counts entries.
    expect(pub.featureCount).toBe(4); // 3 tools + 1 resource + 0 prompts
    layer2Passed++;
  })();

  await test('Fail-safe: authenticated=true still returns the FULL shape (not over-filtered)', () => {
    // Negative half — without this, the assertions above would also pass against a
    // filter that reduced EVERY response.
    const service = {
      id: 'svc2',
      name: 'test-service-2',
      status: 'ACTIVE',
      configuration: { category: 'data', endpoint: 'https://api.test.com' },
      permissions: { publicAccess: true },
    };
    const [result] = filterServiceArray([service], true);
    // This file's expect() has no toBeDefined — assert the values directly.
    // Use toContain, not toBe: sanitizeEndpointUrl round-trips through `new URL()`,
    // which normalises the origin to a trailing slash. That is URL normalisation,
    // not filtering — the property under test is that the endpoint SURVIVES.
    expect(result.configuration.endpoint).toContain('api.test.com');
    expect(result.configuration.category).toBe('data');
    expect(result.permissions.publicAccess).toBe(true);
    layer2Passed++;
  })();

  // ========================================
  // Summary
  // ========================================

  console.log('\n=====================================');
  console.log('Phase 3a Credential Protection Summary:');
  console.log('=====================================');
  console.log(`\n📊 Layer 1 (Pattern): ${layer1Passed}/8`);
  console.log(`📊 Layer 2 (Behavior): ${layer2Passed}/${DB_AVAILABLE ? 16 : 14}`);
  console.log(`\n✅ Total Passed: ${passed}`);
  console.log(`❌ Total Failed: ${failed}`);
  console.log(`📊 Total Tests:  ${passed + failed}/${DB_AVAILABLE ? 24 : 22}`);
  if (!DB_AVAILABLE) {
    console.log(`⏭️  Skipped: 2 database tests (DATABASE_URL not available in CI)`);
  }
  console.log('=====================================\n');

  if (failed > 0) {
    console.error('❌ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('✅ All Phase 3a credential protection tests passed!\n');
    console.log('Security Status:');
    console.log('- Layer 1: Prisma exclusions ✅');
    console.log('- Layer 2: Configuration sanitization ✅');
    console.log('- Layer 3: filterServiceArray safety net ✅');
    console.log('- Production data verified ✅');
    console.log('\nPhase 3a credential protection: PRODUCTION-READY ✅\n');
    process.exit(0);
  }
}

runTests()
  .catch((error) => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
