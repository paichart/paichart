import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import bcrypt from 'bcryptjs';
import { config } from '../../../../../lib/config';
import { authLogger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { password } = await request.json();
    const { token } = params;

    // Validate password
    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    if (
      password.length < config.auth.passwordMinLength ||
      password.length > config.auth.passwordMaxLength
    ) {
      return NextResponse.json(
        {
          error: `Password must be between ${config.auth.passwordMinLength} and ${config.auth.passwordMaxLength} characters`
        },
        { status: 400 }
      );
    }

    // Find user by verification token and verify
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: {
          verificationToken: token,
          isVerified: false,
        },
      });

      if (!user) {
        return null;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, config.security.saltRounds);

      // Update user
      return tx.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          isVerified: true,
          verifiedAt: new Date(),
          verificationToken: null,
        },
      });
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: 'Email verified and password set successfully'
    });
  } catch (error) {
    authLogger.error({ err: error }, 'Email verification failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
