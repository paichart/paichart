#!/usr/bin/env npx tsx
/**
 * Create Super Admin User Script for Production
 * Non-interactive version with predefined values
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { UserRole } from '../lib/types/auth';

async function createSuperAdmin() {
  console.log('\n🛡️  CREATING SUPER ADMIN FOR PRODUCTION');
  console.log('=====================================\n');

  const email = 'system@paichart.com';
  const name = 'System Manager';
  // Generate a secure random password
  const tempPassword = 'TempPass2025!@#' + Math.random().toString(36).slice(-6);

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      if (existingUser.role === UserRole.SUPER_ADMIN) {
        console.log('✅ Super Admin already exists with correct role');
        console.log(`Email: ${email}`);
        return;
      } else {
        // Upgrade to super admin
        const updated = await prisma.user.update({
          where: { email },
          data: { role: UserRole.SUPER_ADMIN }
        });
        console.log('✅ Existing user upgraded to Super Admin');
        console.log(`Email: ${email}`);
        return;
      }
    }

    // Create super admin
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    console.log('✅ Super Admin created successfully!');
    console.log('=====================================');
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.name}`);
    console.log(`Role: ${user.role}`);
    console.log('\n🔑 TEMPORARY PASSWORD:');
    console.log(`Password: ${tempPassword}`);
    console.log('\n⚠️  IMPORTANT:');
    console.log('1. Save this password - it will not be shown again');
    console.log('2. Change this password immediately after first login');
    console.log('3. This account has FULL system privileges');

  } catch (error) {
    console.error('\n❌ Error creating super admin:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createSuperAdmin().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});