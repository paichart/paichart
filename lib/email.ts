import { config } from './config';
import { logger } from '@/lib/logger';

const emailLogger = logger.child({ module: 'Email' });

// Brevo API configuration for transactional emails (bypasses SMTP blocking)
const brevoConfig = {
  apiKey: process.env.BREVO_API_KEY,
  apiUrl: 'https://api.brevo.com/v3/smtp/email',
  fromEmail: process.env.BREVO_FROM_EMAIL || 'support@paichart.com',
  fromName: process.env.BREVO_FROM_NAME || 'pAIchart Support'
};

interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions) {
  try {
    emailLogger.info({ subject }, 'Sending email via Brevo API');

    // Use Brevo transactional email API (HTTPS - bypasses Digital Ocean SMTP blocking)
    const headers: Record<string, string> = {
      'accept': 'application/json',
      'content-type': 'application/json'
    };

    if (brevoConfig.apiKey) {
      headers['api-key'] = brevoConfig.apiKey;
    }

    const response = await fetch(brevoConfig.apiUrl, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        sender: {
          name: brevoConfig.fromName,
          email: brevoConfig.fromEmail
        },
        to: [{
          email: to,
          name: "User"
        }],
        subject: subject,
        htmlContent: html || `<html><body><pre>${text}</pre></body></html>`,
        textContent: text,
        disableUrlTracking: true  // Disable Brevo link tracking for direct reset URLs
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    emailLogger.info({ messageId: result.messageId }, 'Email sent successfully via Brevo API');
    return { success: true, messageId: result.messageId };
  } catch (error) {
    emailLogger.error({ err: error }, 'Failed to send email via Brevo API');
    throw error;
  }
}

export function generateVerificationEmail(verificationToken: string, userName: string) {
  const verifyUrl = `${config.app.url}/verify?token=${verificationToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Verify Your Email</h2>
      <p>Hello ${userName},</p>
      <p>Thank you for registering. Please click the button below to verify your email address:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" 
           style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Verify Email
        </a>
      </div>
      <p>If you didn't create an account, you can safely ignore this email.</p>
      <p>This link will expire in ${config.auth.verificationTokenExpiry} minutes.</p>
      <p>Best regards,<br>${config.app.name} Team</p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eaeaea;" />
      <p style="color: #666; font-size: 12px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        ${verifyUrl}
      </p>
    </div>
  `;

  const text = `
    Verify Your Email
    
    Hello ${userName},
    
    Thank you for registering. Please click the link below to verify your email address:
    
    ${verifyUrl}
    
    If you didn't create an account, you can safely ignore this email.
    
    This link will expire in ${config.auth.verificationTokenExpiry} minutes.
    
    Best regards,
    ${config.app.name} Team
  `;

  return { html, text };
}

export function generatePasswordResetEmail(resetToken: string, userName: string) {
  const resetUrl = `${config.app.url}/auth/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reset Your Password</h2>
      <p>Hello ${userName},</p>
      <p>You recently requested to reset your password. Click the button below to proceed:</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}"
           style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 500;">
          Reset Password
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        Or copy and paste this link into your browser:
      </p>
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; margin: 10px 0; word-break: break-all;">
        <code style="font-family: monospace; font-size: 13px; color: #4b5563;">${resetUrl}</code>
      </div>

      <p>If you didn't request this password reset, you can safely ignore this email.</p>
      <p style="color: #6b7280; font-size: 14px;">This link will expire in ${config.auth.passwordResetTokenExpiry} minutes for your security.</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />

      <p>Best regards,<br>
      <strong>${config.app.name} Team</strong></p>
    </div>
  `;

  const text = `
    Reset Your Password

    Hello ${userName},

    You recently requested to reset your password. Click the link below to proceed:

    ${resetUrl}

    If you didn't request this password reset, you can safely ignore this email.

    This link will expire in ${config.auth.passwordResetTokenExpiry} minutes for your security.

    Best regards,
    ${config.app.name} Team
  `;

  return { html, text };
}
