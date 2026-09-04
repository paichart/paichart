import { NextRequest, NextResponse } from 'next/server';
// Kept imports for potential future re-enablement
// import { prisma } from '@/lib/prisma';
// import { z } from 'zod';
// import crypto from 'crypto';
// import { config } from '@/lib/config';
// import { sendEmail, generatePasswordResetEmail } from '@/lib/email';
// import { passwordResetRequestLimiter } from '@/lib/middleware/rate-limit';
import { authLogger } from '@/lib/logger';

/**
 * Password Reset Request Endpoint - DISABLED
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
 * 3. Re-enable rate limiting (passwordResetRequestLimiter)
 * 4. Add UI links back to login page
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
 * const requestSchema = z.object({
 *   email: z.string().email(),
 * });
 *
 * export async function POST(request: NextRequest) {
 *   try {
 *     // Rate limiting check (3 requests per hour)
 *     const rateLimitResponse = passwordResetRequestLimiter(request);
 *     if (rateLimitResponse) {
 *       return rateLimitResponse;
 *     }
 *
 *     const body = await request.json();
 *     const { email } = requestSchema.parse(body);
 *
 *     const user = await prisma.user.findUnique({
 *       where: { email },
 *     });
 *
 *     if (!user) {
 *       return NextResponse.json({
 *         message: 'If an account exists with this email, a password reset link will be sent.'
 *       });
 *     }
 *
 *     const resetToken = crypto.randomBytes(32).toString('hex');
 *     const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
 *     const resetTokenExpiry = new Date(Date.now() + config.auth.passwordResetTokenExpiry * 60 * 1000);
 *
 *     await prisma.user.update({
 *       where: { id: user.id },
 *       data: { resetTokenHash, resetTokenExpiry },
 *     });
 *
 *     const { html, text } = generatePasswordResetEmail(resetToken, user.name);
 *     await sendEmail({
 *       to: user.email,
 *       subject: 'Reset Your Password',
 *       html, text,
 *     });
 *
 *     return NextResponse.json({
 *       message: 'If an account exists with this email, a password reset link will be sent.'
 *     });
 *   } catch (error) {
 *     authLogger.error({ err: error }, 'Password reset request failed');
 *     return NextResponse.json({ error: 'Failed to process password reset request' }, { status: 500 });
 *   }
 * }
 */
