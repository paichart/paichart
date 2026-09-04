import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { config } from '../../../../lib/config';
import { isValidEmail } from '../../../../lib/utils';
import { generateVerificationEmail, sendEmail } from '../../../../lib/email';
import { UserRole } from '@prisma/client';
import { TrialConfiguration, MCPToolConfiguration, MCPToolPermissions } from '../../../../lib/types/oauth';
import * as crypto from 'crypto';
import { z } from 'zod';
import { registrationLimiter } from '@/lib/middleware/rate-limit';
import { defaultUserRole, registrationAllowed, mailProviderConfigured } from '@/lib/auth/registration-policy';
import { authLogger } from '@/lib/logger';

// Comprehensive User Registration validation schema
const RegisterUserSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .toLowerCase()
    .refine((email) => {
      // Block disposable email domains (common spam sources)
      const disposableDomains = [
        'tempmail.com', 'throwaway.email', '10minutemail.com',
        'guerrillamail.com', 'mailinator.com'
      ];
      const domain = email.split('@')[1];
      return !disposableDomains.includes(domain);
    }, {
      message: 'Disposable email addresses are not allowed'
    }),
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters'),

  // Trial registration (optional)
  trial: z.string()
    .uuid('Invalid trial code format')
    .optional(),

  // OAuth registration (optional)
  oauthData: z.object({
    provider: z.enum(['github', 'microsoft', 'google'], {
      errorMap: () => ({ message: 'Invalid OAuth provider' })
    }),
    providerUserId: z.string()
      .min(1, 'Provider user ID is required')
      .max(255, 'Provider user ID too long')
  }).optional()
}).refine((data) => {
  // If trial is provided, OAuth should not be (separate flows)
  if (data.trial && data.oauthData) {
    return false;
  }
  return true;
}, {
  message: 'Cannot use trial and OAuth in same registration'
});

export async function POST(request: Request) {
  try {
    // ✅ PHASE 2: Rate limiting check (5 attempts per hour)
    const rateLimitResponse = registrationLimiter(request as any);
    if (rateLimitResponse) {
      return rateLimitResponse; // Rate limit exceeded
    }

    // ✅ Enhanced validation with Zod
    const data = await request.json();

    // ✅ P1 FIX: Use safeParse instead of try/catch with .parse()
    const result = RegisterUserSchema.safeParse(data);

    if (!result.success) {
      return NextResponse.json({
        validationErrors: result.error.errors.reduce((acc, err) => {
          const field = err.path[0] as string;
          if (!acc[field]) acc[field] = [];
          acc[field].push(err.message);
          return acc;
        }, {} as Record<string, string[]>)
      }, { status: 400 });
    }

    const validated = result.data;

    const { email, name, trial, oauthData } = validated;

    // Self-host policy (D7-B). Both checks sit BEFORE the existing-user lookup so a disabled or
    // mail-less install never deletes a pending row or inserts one it cannot verify.
    if (!registrationAllowed()) {
      return NextResponse.json({ error: 'Registration is disabled on this server. Ask an administrator to create your account.' }, { status: 403 });
    }
    if (!oauthData && !mailProviderConfigured()) {
      return NextResponse.json(
        { error: 'Email registration is unavailable: this server has no mail provider configured, so the verification email that lets you set a password cannot be sent. Ask an administrator to create your account.' },
        { status: 503 }
      );
    }

    // Check if user already exists (generic error to prevent account enumeration)
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        isVerified: true,
      },
    });

    if (existingUser) {
      if (existingUser.isVerified) {
        // ✅ SECURITY: Use generic message to prevent account enumeration
        return NextResponse.json(
          { error: 'Registration failed. Please contact support if you need assistance.' },
          { status: 400 }
        );
      } else {
        // If user exists but not verified, delete the old record
        await prisma.user.delete({
          where: { id: existingUser.id },
        });
      }
    }

    // Handle OAuth registration (users coming from OAuth flow)
    let isOAuthRegistration = false;
    let oauthProvider = null;
    let oauthProviderId = null;

    if (oauthData) {
      isOAuthRegistration = true;
      oauthProvider = oauthData.provider;
      oauthProviderId = oauthData.providerUserId;
    }

    // Handle trial registration (users coming from trial request)
    let trialRequest = null;
    if (trial) {
      // Find trial request by trial code
      trialRequest = await prisma.mCPTool.findFirst({
        where: {
          AND: [
            {
              configuration: {
                path: ['trialId'],
                equals: trial
              }
            },
            {
              configuration: {
                path: ['type'],
                equals: 'company_trial'
              }
            }
          ]
        }
      });
      
      if (trialRequest) {
        const config = trialRequest.configuration as unknown as unknown as TrialConfiguration;
        if (config?.contactEmail?.toLowerCase() !== email) { // BC49 FIX: case-insensitive email comparison
          return NextResponse.json(
            { error: 'Trial code email mismatch' },
            { status: 400 }
          );
        }
      }
    }

    // Generate verification token (skip for OAuth users)
    const verificationToken: string | null = isOAuthRegistration ? null : crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry: Date | null = isOAuthRegistration ? null : new Date(Date.now() + config.auth.verificationTokenExpiry * 60 * 1000);

    // BC50 FIX: Wrap user creation + trial linkage in transaction to prevent orphan records
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          name,
          verificationToken,
          isVerified: isOAuthRegistration, // OAuth users are pre-verified
          verifiedAt: isOAuthRegistration ? new Date() : null,
          // OAuth users don't need passwords, regular users get temp password
          password: isOAuthRegistration ? null : crypto.randomBytes(32).toString('hex'),
          role: defaultUserRole() as UserRole, // DEFAULT_USER_ROLE (unset → DEMO_USER, the SaaS default)
          oauthProvider,
          oauthProviderId,
          lastLoginAt: isOAuthRegistration ? new Date() : null
        },
        select: {
          id: true,
          email: true,
          name: true,
          isVerified: true,
          oauthProvider: true
        },
      });

      // Link trial request to user if applicable
      if (trialRequest) {
        await tx.mCPTool.update({
          where: { id: trialRequest.id },
          data: {
            configuration: {
              ...(trialRequest.configuration as unknown as TrialConfiguration || {}),
              userId: newUser.id,
              status: 'ACTIVE_TRIAL',
              activatedAt: new Date().toISOString()
            },
            permissions: {
              ...(trialRequest.permissions as MCPToolPermissions || {}),
              owner: newUser.id
            }
          }
        });

        authLogger.info({ userId: newUser.id, trialId: trial }, 'trial linked to user');
      }

      return newUser;
    });

    // Send verification email (only for non-OAuth users)
    if (!isOAuthRegistration && verificationToken) {
      const { html, text } = generateVerificationEmail(verificationToken, user.name);
      await sendEmail({
        to: user.email,
        subject: 'Verify your email address',
        html,
        text,
      });

      return NextResponse.json({ 
        message: 'Verification email sent',
        email: user.email,
        requiresVerification: true
      }, { status: 201 });
    } else {
      // OAuth users are immediately verified and ready
      return NextResponse.json({ 
        message: 'OAuth registration completed',
        email: user.email,
        provider: oauthProvider || 'unknown',
        isVerified: true,
        trial: trialRequest ? {
          trialId: trial,
          status: 'ACTIVE_TRIAL',
          companyName: (trialRequest.configuration as unknown as TrialConfiguration)?.companyName
        } : null
      }, { status: 201 });
    }
  } catch (error) {
    authLogger.error({ err: error }, 'registration error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
