#!/usr/bin/env npx tsx
/**
 * Create Super Admin User Script
 * Creates a new super admin user with the highest privileges
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { UserRole } from '../lib/types/auth';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
};

const hideInput = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    stdin.on('data', (char) => {
      const charStr = char.toString();
      if (charStr === '\n' || charStr === '\r' || charStr === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\n');
        resolve(password);
      } else if (charStr === '\u0003') {
        process.exit();
      } else if (charStr === '\u007f') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.write('\b \b');
        }
      } else {
        password += charStr;
        stdout.write('*');
      }
    });
  });
};

async function createSuperAdmin() {
  console.log('\n🛡️  SUPER ADMIN CREATION WIZARD');
  console.log('================================\n');
  console.log('This will create a new super admin user with maximum privileges.\n');

  try {
    // Get user details
    const email = await question('Email address: ');
    const name = await question('Full name: ');
    const password = await hideInput('Password (min 8 chars): ');
    const confirmPassword = await hideInput('Confirm password: ');

    // Validate inputs
    if (!email.includes('@')) {
      throw new Error('Invalid email address');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new Error(`User with email ${email} already exists`);
    }

    // Create super admin
    const hashedPassword = await bcrypt.hash(password, 10);

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

    console.log('\n✅ Super Admin created successfully!');
    console.log('====================================');
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.name}`);
    console.log(`Role: ${user.role}`);
    console.log('\n🔒 Security Notes:');
    console.log('- This account has FULL system privileges');
    console.log('- Can perform ALL actions without restrictions');
    console.log('- Use with extreme caution');
    console.log('- Consider using regular admin accounts for daily tasks');

  } catch (error) {
    console.error('\n❌ Error creating super admin:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// Run the script
createSuperAdmin().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});