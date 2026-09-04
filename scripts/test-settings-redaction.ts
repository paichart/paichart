#!/usr/bin/env ts-node
/**
 * P1.4 Settings Redaction Security Tests
 *
 * Validates that user settings JSONB never leaks plaintext credentials
 * back to clients via API responses, AND that PUT round-trips from a
 * redacted GET don't blank the stored values.
 *
 * Audit closure: cline_docs/reviews/saas-readiness-auth-2026-05-19/sec-ops-review.md
 * Gap B (plaintext credential storage) + HIGH-10 from
 * cline_docs/reviews/post-hardening-audit-2026-05-17/BUG-REPORT-user-credential-storage-comprehensive-2026-05-17.md
 *
 * Stub DATABASE_URL before any import that transitively touches lib/prisma.ts
 * (per feedback_ci_database_url_transitive — CI runners don't have it set).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';

import { redactSensitiveSettings } from '../lib/settings/prisma/mappers';
import { mergeSettingsPreservingSecrets } from '../lib/settings/services/settings';

console.log('🧪 P1.4 Settings Redaction Security Tests\n');

let passed = 0;
let failed = 0;

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

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertContains(haystack: string, needle: string, shouldContain: boolean, msg: string) {
  const found = haystack.includes(needle);
  if (found !== shouldContain) {
    throw new Error(`${msg}: expected ${shouldContain ? 'to find' : 'NOT to find'} "${needle}" in response`);
  }
}


// ── key preserve / replace / delete semantics (2026-08-06) ───────────────────────────────
// The three states the merge must distinguish. Getting these wrong is either a silent
// credential wipe (empty treated as delete) or an undeletable key (no clear signal).

test('empty incoming key PRESERVES the stored key (no silent wipe)', () => {
  const out = mergeSettingsPreservingSecrets(
    { llm: { provider: 'anthropic_sdk', anthropicApiKey: 'sk-ant-stored' } },
    { llm: { provider: 'anthropic_sdk', anthropicApiKey: '' } },
  ) as any;
  assertEqual(out.llm.anthropicApiKey, 'sk-ant-stored', 'blank field must not delete');
});

test('a new incoming key REPLACES the stored key', () => {
  const out = mergeSettingsPreservingSecrets(
    { llm: { anthropicApiKey: 'sk-ant-old' } },
    { llm: { anthropicApiKey: 'sk-ant-new' } },
  ) as any;
  assertEqual(out.llm.anthropicApiKey, 'sk-ant-new', 'typed key wins');
});

test('clearAnthropicApiKey DELETES the stored key', () => {
  const out = mergeSettingsPreservingSecrets(
    { llm: { anthropicApiKey: 'sk-ant-stored' } },
    { llm: { anthropicApiKey: '', clearAnthropicApiKey: true } },
  ) as any;
  assertEqual(out.llm.anthropicApiKey, undefined, 'explicit clear removes the key');
});

test('the transient clear signal is never persisted', () => {
  const out = mergeSettingsPreservingSecrets(
    { llm: { anthropicApiKey: 'sk-ant-stored' } },
    { llm: { clearAnthropicApiKey: true } },
  ) as any;
  assertEqual(out.llm.clearAnthropicApiKey, undefined, 'clear flag stripped before storage');
});

test('clear wins over a simultaneously-typed key (button sets both)', () => {
  const out = mergeSettingsPreservingSecrets(
    { llm: { anthropicApiKey: 'sk-ant-stored' } },
    { llm: { anthropicApiKey: 'sk-ant-typed', clearAnthropicApiKey: true } },
  ) as any;
  assertEqual(out.llm.anthropicApiKey, undefined, 'explicit clear is unambiguous');
});

console.log('=====================================');
console.log('Layer 1: redactSensitiveSettings');
console.log('=====================================\n');

test('strips plaintext anthropicApiKey from llm', () => {
  const input = {
    timezone: 'Australia/Sydney',
    llm: { provider: 'anthropic', anthropicApiKey: 'sk-ant-real-key-12345', geminiApiKey: 'AIzaReal_67890', useSystemProvider: false },
  };
  const out = redactSensitiveSettings(input) as any;
  assertEqual(out.llm.anthropicApiKey, undefined, 'anthropicApiKey should be undefined');
  assertEqual(out.llm.geminiApiKey, undefined, 'geminiApiKey should be undefined');
});

test('adds configured boolean flags when keys are present', () => {
  const input = { llm: { anthropicApiKey: 'sk-ant-x', geminiApiKey: 'AIza-x' } };
  const out = redactSensitiveSettings(input) as any;
  assertEqual(out.llm.anthropicApiKeyConfigured, true, 'anthropicApiKeyConfigured should be true');
  assertEqual(out.llm.geminiApiKeyConfigured, undefined, 'geminiApiKeyConfigured no longer emitted (provider removed 2026-08-05)');
});

test('sets configured booleans to false when keys are absent/empty', () => {
  const input = { llm: { provider: 'system', anthropicApiKey: '', geminiApiKey: undefined } };
  const out = redactSensitiveSettings(input) as any;
  assertEqual(out.llm.anthropicApiKeyConfigured, false, 'empty key → configured false');
});

test('preserves non-sensitive llm fields verbatim', () => {
  const input = { llm: { provider: 'anthropic', useSystemProvider: true, anthropicApiKey: 'sk-ant-real' } };
  const out = redactSensitiveSettings(input) as any;
  assertEqual(out.llm.provider, 'anthropic', 'provider preserved');
  assertEqual(out.llm.useSystemProvider, true, 'useSystemProvider preserved');
});

test('strips apiKey.token and replaces with hasKey boolean', () => {
  const input = { apiKey: { token: 'jwt-token-real-secret', createdAt: '2026-01-01', expiresAt: '2027-01-01' } };
  const out = redactSensitiveSettings(input) as any;
  assertEqual(out.apiKey.token, undefined, 'apiKey.token should be undefined');
  assertEqual(out.apiKey.hasKey, true, 'hasKey should be true');
  assertEqual(out.apiKey.createdAt, '2026-01-01', 'createdAt preserved');
  assertEqual(out.apiKey.expiresAt, '2027-01-01', 'expiresAt preserved');
});

test('strips token from each apiKeyHistory entry', () => {
  const input = {
    apiKey: {
      token: 'current-secret',
      apiKeyHistory: [
        { token: 'old-secret-1', createdAt: '2025-01-01', revokedAt: '2025-06-01' },
        { token: 'old-secret-2', createdAt: '2025-06-01' },
      ],
    },
  };
  const out = redactSensitiveSettings(input) as any;
  assertEqual(out.apiKey.apiKeyHistory[0].token, undefined, 'history[0].token stripped');
  assertEqual(out.apiKey.apiKeyHistory[1].token, undefined, 'history[1].token stripped');
  assertEqual(out.apiKey.apiKeyHistory[0].createdAt, '2025-01-01', 'history[0] non-secrets preserved');
});

test('returns input unchanged when not an object', () => {
  assertEqual(redactSensitiveSettings(null), null, 'null passthrough');
  assertEqual(redactSensitiveSettings(undefined), undefined, 'undefined passthrough');
  assertEqual(redactSensitiveSettings('string'), 'string', 'string passthrough');
});

test('contract: serialized JSON never contains plaintext key fingerprints', () => {
  const input = {
    llm: { anthropicApiKey: 'sk-ant-api03-aaaa', geminiApiKey: 'AIzaSyBbbb' },
    apiKey: { token: 'eyJhbGc-jwt-fake', apiKeyHistory: [{ token: 'eyJold' }] },
  };
  const json = JSON.stringify(redactSensitiveSettings(input));
  assertContains(json, 'sk-ant', false, 'no Anthropic key prefix in response');
  assertContains(json, 'AIza', false, 'no Gemini key prefix in response');
  assertContains(json, 'eyJhbGc', false, 'no current JWT in response');
  assertContains(json, 'eyJold', false, 'no historical JWT in response');
});

console.log('\n=====================================');
console.log('P1.4 Settings Redaction Summary:');
console.log('=====================================\n');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total:  ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
}

console.log('\n✅ All tests passed!');
process.exit(0);
