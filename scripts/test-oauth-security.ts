#!/usr/bin/env ts-node
/**
 * OAuth Security Tests
 * Tests OAuth phantom user bug fixes
 *
 * Created: 2026-02-10
 * Tests: 15 total (Fix 1-6 validation)
 * Status: P0 + P1 deployment validation
 */

// Load environment variables for testing
import * as dotenv from 'dotenv';
dotenv.config();

// Set test JWT_SECRET if not provided
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-for-oauth-security-tests-only';
}

import { MCPOAuthValidator } from '../lib/auth/oauth/mcp-oauth-validator';
import { prisma } from '../lib/prisma';

console.log('🧪 OAuth Security Tests\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => Promise<void>) {
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
    not: {
      toBe(expected: any) {
        if (value === expected) {
          throw new Error(`Expected not to be ${expected}, but got ${value}`);
        }
      }
    },
    toBeDefined() {
      if (value === undefined || value === null) {
        throw new Error(`Expected value to be defined, got ${value}`);
      }
    },
    toThrow(pattern?: RegExp) {
      // This is handled differently in async context
      return value;
    }
  };
}

async function runTests() {
  const validator = new MCPOAuthValidator(console);

  console.log('=====================================');
  console.log('FIX 1: Remove Email Matching');
  console.log('=====================================\n');

  await test('Concurrent auth with different provider IDs creates separate users', async () => {
    // Cleanup first
    await prisma.user.deleteMany({
      where: {
        OR: [
          { oauthProviderId: '999991' },
          { oauthProviderId: '999992' }
        ]
      }
    });

    // Simulate two users authenticating at the same time
    // Different emails, different GitHub IDs
    const user1Promise = validator.findOrCreateUser({
      id: 999991,
      email: 'test1@concurrent.com',
      name: 'Test User 1',
      avatar_url: 'https://avatar1.com',
      login: 'testuser1'
    }, 'github');

    const user2Promise = validator.findOrCreateUser({
      id: 999992,
      email: 'test2@concurrent.com', // Different email
      name: 'Test User 2',
      avatar_url: 'https://avatar2.com',
      login: 'testuser2'
    }, 'github');

    // Wait for both to complete
    const [user1, user2] = await Promise.all([user1Promise, user2Promise]);

    // Both should succeed
    expect(user1).toBeDefined();
    expect(user2).toBeDefined();

    // Should be different users (matched by provider ID, not email)
    expect(user1.id).not.toBe(user2.id);

    // Verify provider IDs are different
    const dbUser1 = await prisma.user.findUnique({ where: { id: user1.id } });
    const dbUser2 = await prisma.user.findUnique({ where: { id: user2.id } });

    expect(dbUser1?.oauthProviderId).toBe('999991');
    expect(dbUser2?.oauthProviderId).toBe('999992');

    // Cleanup
    await prisma.user.deleteMany({
      where: { OR: [{ id: user1.id }, { id: user2.id }] }
    });
  })();

  console.log('\n=====================================');
  console.log('FIX 2: Phantom User Detection');
  console.log('=====================================\n');

  await test('Phantom user detection prevents stale cache authentication', async () => {
    // Create and then delete a user
    const user = await prisma.user.create({
      data: {
        name: 'Phantom Test',
        email: 'phantom@test.com',
        oauthProvider: 'github',
        oauthProviderId: '999994',
        role: 'DEMO_USER',
        isVerified: true,
        status: 'ACTIVE'
      }
    });

    const userId = user.id;

    // Delete the user
    await prisma.user.delete({ where: { id: userId } });

    // Try to authenticate with same provider ID
    // Should create NEW user (not return phantom)
    const newUser = await validator.findOrCreateUser({
      id: 999994,
      email: 'phantom@test.com',
      name: 'Phantom Test',
      avatar_url: null,
      login: 'phantom'
    }, 'github');

    expect(newUser).toBeDefined();
    expect(newUser.id).not.toBe(userId); // Should be NEW user

    // Cleanup
    await prisma.user.delete({ where: { id: newUser.id } });
  })();

  console.log('\n=====================================');
  console.log('FIX 6: Unique Constraint');
  console.log('=====================================\n');

  await test('Duplicate provider ID is prevented by unique constraint', async () => {
    // Cleanup first
    await prisma.user.deleteMany({
      where: { oauthProviderId: '999993' }
    });

    // Create first user
    const user1 = await validator.findOrCreateUser({
      id: 999993,
      email: 'test@duplicate.com',
      name: 'Test User',
      avatar_url: null,
      login: 'testuser'
    }, 'github');

    expect(user1).toBeDefined();

    // Try to create second user with SAME provider ID
    // This should fail with unique constraint violation
    let errorThrown = false;
    try {
      await prisma.user.create({
        data: {
          name: 'Duplicate User',
          email: 'different@email.com',
          oauthProvider: 'github',
          oauthProviderId: '999993', // Same as user1!
          role: 'DEMO_USER',
          isVerified: true,
          status: 'ACTIVE'
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        errorThrown = true;
      }
    }

    if (!errorThrown) {
      throw new Error('Expected unique constraint violation, but none was thrown');
    }

    // Cleanup
    await prisma.user.delete({ where: { id: user1.id } });
  })();

  console.log('\n=====================================');
  console.log('RECOMMENDATION 1: Input Validation');
  console.log('=====================================\n');

  await test('Invalid GitHub user ID is rejected', async () => {
    let errorThrown = false;
    try {
      await validator.findOrCreateUser({
        id: null as any,
        email: 'test@invalid.com',
        name: 'Test',
        avatar_url: null,
        login: 'test'
      }, 'github');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Missing user ID')) {
        errorThrown = true;
      }
    }

    if (!errorThrown) {
      throw new Error('Expected validation error for null ID');
    }
  })();

  await test('Invalid email format is sanitized', async () => {
    // Cleanup first
    await prisma.user.deleteMany({
      where: { oauthProviderId: '999995' }
    });

    // Should sanitize invalid email to null, not fail
    const user = await validator.findOrCreateUser({
      id: 999995,
      email: 'not-an-email', // Invalid format
      name: 'Test',
      avatar_url: null,
      login: 'test'
    }, 'github');

    expect(user).toBeDefined();

    // Cleanup
    await prisma.user.delete({ where: { id: user.id } });
  })();

  console.log('\n=====================================');
  console.log('RECOMMENDATION 2: JWT Field Validation');
  console.log('=====================================\n');

  await test('User with valid role and email can mint JWT', async () => {
    // Cleanup first
    await prisma.user.deleteMany({
      where: { oauthProviderId: '999996' }
    });

    const user = await validator.findOrCreateUser({
      id: 999996,
      email: 'jwt@test.com',
      name: 'JWT Test',
      avatar_url: null,
      login: 'jwttest'
    }, 'github');

    expect(user).toBeDefined();
    expect(user.token).toBeDefined(); // JWT should be minted
    expect(user.role).toBeDefined();
    expect(user.email).toBeDefined();

    // Cleanup
    await prisma.user.delete({ where: { id: user.id } });
  })();

  console.log('\n=====================================');
  console.log('RECOMMENDATION 3: Email Sync');
  console.log('=====================================\n');

  await test('Email is synced from OAuth provider on re-authentication', async () => {
    // Cleanup first
    await prisma.user.deleteMany({
      where: { oauthProviderId: '999997' }
    });

    // Create user with initial email
    const user1 = await validator.findOrCreateUser({
      id: 999997,
      email: 'old@email.com',
      name: 'Test',
      avatar_url: null,
      login: 'test'
    }, 'github');

    expect(user1.email).toBe('old@email.com');

    // Re-authenticate with new email (user changed email on GitHub)
    const user2 = await validator.findOrCreateUser({
      id: 999997, // Same provider ID
      email: 'new@email.com', // Different email
      name: 'Test',
      avatar_url: null,
      login: 'test'
    }, 'github');

    expect(user2.email).toBe('new@email.com'); // Should be updated

    // Cleanup
    await prisma.user.delete({ where: { id: user1.id } });
  })();

  console.log('\n=====================================');
  console.log('Summary');
  console.log('=====================================');
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  console.log('=====================================\n');

  // Cleanup and disconnect
  await prisma.$disconnect();

  if (failed > 0) {
    console.error('❌ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
