import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { ProfileUpdateSchema } from '@/lib/validation/user-validation';
import { authLogger } from '@/lib/logger';
import { createExpiredTokenCookies } from '@/lib/cookies';

export async function PUT(request: NextRequest) {
  try {
    // Get authenticated user
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ✅ SECURITY: Validate with Zod schema (XSS on name, email format, password lengths, cross-field rule)
    const body = await request.json();
    const validation = ProfileUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }
    const { name, email, currentPassword, newPassword } = validation.data;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        password: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // If changing password, verify current password (schema ensures currentPassword present when newPassword is set)
    if (newPassword) {
      const isValidPassword = await bcrypt.compare(currentPassword!, user.password!);
      if (!isValidPassword) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        );
      }
    }

    // Update user
    const updateData: any = { name };

    // BC39 FIX: Explicitly reject email changes for non-admin users (was silently ignored)
    if (email) {
      if (authUser.role !== 'ADMIN' && authUser.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { error: 'Email changes require admin privileges' },
          { status: 403 }
        );
      }
      // Check if email is already in use by another user
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true }
      });

      if (existingUser && existingUser.id !== authUser.userId) {
        return NextResponse.json(
          { error: 'Email is already in use' },
          { status: 400 }
        );
      }

      updateData.email = email;
    }
    if (newPassword) {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData
    });

    // BC52 FIX: Invalidate all refresh tokens when password changes (force re-login on all devices)
    // W11c/IM-2: this deleteMany is INTENTIONALLY unscoped (no provider filter) — post MCP
    // refresh-token persistence it now ALSO revokes the user's MCP refresh tokens, which is
    // correct (a password change should drop every session, incl. MCP). This is the MCP
    // revocation surface for credential changes. Protocol-11 drift-sweep marker for `provider`.
    if (newPassword) {
      await prisma.refreshToken.deleteMany({
        where: { userId: user.id }
      });
      authLogger.info({ userId: user.id }, 'all refresh tokens invalidated after password change');

      // Clear cookies on this response so the user must re-login
      const response = NextResponse.json({ message: 'Profile updated successfully. Please log in again.' });
      const expiredCookies = createExpiredTokenCookies();
      expiredCookies.forEach(cookie => response.cookies.set(cookie));
      return response;
    }

    return NextResponse.json({
      message: 'Profile updated successfully'
    });
  } catch (error) {
    authLogger.error({ err: error }, 'Profile update failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
