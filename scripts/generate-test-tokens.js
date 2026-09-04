#!/usr/bin/env node

/**
 * Generate JWT tokens for manual testing
 * Usage: node scripts/generate-test-tokens.js
 */

const { signAccessToken } = require('../lib/jwt');
const { UserRole } = require('../lib/types/auth');

async function generateTokens() {
  console.log('Generating test JWT tokens...\n');

  try {
    // Generate admin token
    const adminToken = await signAccessToken({
      userId: 'test-admin-user',
      email: 'admin@test.com',
      role: UserRole.ADMIN,
      name: 'Test Admin'
    });

    // Generate regular user token
    const userToken = await signAccessToken({
      userId: 'test-regular-user',
      email: 'user@test.com',
      role: UserRole.USER,
      name: 'Test User'
    });

    // Generate demo user token
    const demoToken = await signAccessToken({
      userId: 'test-demo-user',
      email: 'demo@test.com',
      role: UserRole.DEMO_USER,
      name: 'Test Demo User'
    });

    console.log('✅ Tokens generated successfully!\n');
    console.log('Copy these export commands:\n');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`export ADMIN_TOKEN='${adminToken}'`);
    console.log('');
    console.log(`export USER_TOKEN='${userToken}'`);
    console.log('');
    console.log(`export DEMO_TOKEN='${demoToken}'`);
    console.log('─────────────────────────────────────────────────────────');
    console.log('\nThen run: ./scripts/test-mcp-security-manual.sh\n');

  } catch (error) {
    console.error('❌ Error generating tokens:', error.message);
    process.exit(1);
  }
}

generateTokens();
