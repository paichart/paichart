import { NextRequest, NextResponse } from 'next/server';
// Kept imports for potential future re-enablement
// import { prisma } from '@/lib/prisma';
// import { z } from 'zod';
// import crypto from 'crypto';
// import bcrypt from 'bcryptjs';
// import { config } from '@/lib/config';
// import { passwordResetLimiter } from '@/lib/middleware/rate-limit';
import { authLogger } from '@/lib/logger';

/**
 * Password Reset Execution Endpoint - DISABLED
 *
 * Disabled on: 2025-11-16
 * Reason: OAuth-only authentication policy
 *
 * This endpoint has been disabled because pAIchart uses OAuth (GitHub, Microsoft, Google)
 * as the primary authentication method. Password-based authentication is no longer supported
 * for standard users.
 *
 * To re-enable:
 * 1. Uncomment imports above
 * 2. Replace POST handler with implementation below (see git history)
 * 3. Re-enable rate limiting (passwordResetLimiter)
 * 4. Re-enable password reset request endpoint
 * 5. Add UI links back to login page
 *
 * Security Note: Route kept with 404 instead of deletion to:
 * - Maintain git history
 * - Make re-enablement easier if policy changes
 * - Provide clear error message to API consumers
 */

export async function POST(_request: NextRequest) {
  // Route disabled - OAuth-only authentication policy
  return NextResponse.json(
    {
      error: 'Password reset is not available. Please use OAuth login (GitHub, Microsoft, or Google).',
      hint: 'Visit /login to sign in with OAuth'
    },
    { status: 404 }
  );
}

/* ORIGINAL IMPLEMENTATION (preserved for re-enablement)
 *
 * const resetSchema = z.object({
 *   token: z.string(),
 *   password: z.string()
 *     .min(config.auth.passwordMinLength, `Password must be at least ${config.auth.passwordMinLength} characters`)
 *     .max(config.auth.passwordMaxLength, `Password must be at most ${config.auth.passwordMaxLength} characters`)
 *     .regex(config.auth.passwordPattern, 'Password must contain...')
 * });
 *
 * export async function POST(request: NextRequest) {
 *   try {
 *     const rateLimitResponse = passwordResetLimiter(request);
 *     if (rateLimitResponse) return rateLimitResponse;
 *
 *     const body = await request.json();
 *     const { token, password } = resetSchema.parse(body);
 *
 *     const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
 *
 *     const user = await prisma.user.findFirst({
 *       where: {
 *         resetTokenHash,
 *         resetTokenExpiry: { gt: new Date() },
 *       },
 *     });
 *
 *     if (!user) {
 *       return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
 *     }
 *
 *     const hashedPassword = await bcrypt.hash(password, config.security.saltRounds);
 *
 *     await prisma.user.update({
 *       where: { id: user.id },
 *       data: {
 *         password: hashedPassword,
 *         resetTokenHash: null,
 *         resetTokenExpiry: null,
 *       },
 *     });
 *
 *     await prisma.activity.create({
 *       data: {
 *         userId: user.id,
 *         action: 'PASSWORD_RESET',
 *         type: 'AUTH',
 *         metadata: { timestamp: new Date().toISOString() },
 *       },
 *     });
 *
 *     return NextResponse.json({ message: 'Password has been reset successfully' });
 *   } catch (error) {
 *     authLogger.error({ err: error }, 'Password reset execution failed');
 *     return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
 *   }
 * }
 */
