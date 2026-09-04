/**
 * Admin User Management Validation Schemas
 * Centralized validation for Week 1 endpoints
 *
 * @version 1.0
 * @created 2025-10-30
 * @specialist-reviewed validation-engine (72%), sec-ops (78%)
 */

import { z } from 'zod';
import { UserRole as PrismaUserRole } from '@prisma/client';
import { UserRole, UserStatus } from '@/lib/types/auth';
import { FormField } from './form-field-patterns';
import { FIELD_LIMITS } from './field-limits';

// ✅ ENHANCEMENT: 12-char minimum (OWASP 2023), special chars required
export const CreateUserSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .transform(e => e.toLowerCase()) // BC49 FIX: normalize email to lowercase
    .refine((email) => {
      // ✅ ENHANCEMENT: Block disposable email domains
      const disposableDomains = [
        'tempmail.com', '10minutemail.com', 'guerrillamail.com',
        'mailinator.com', 'throwaway.email'
      ];
      const domain = email.split('@')[1]?.toLowerCase();
      return !disposableDomains.includes(domain);
    }, { message: 'Disposable email addresses not allowed' }),

  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name too long'),

  // Use app UserRole enum (not Prisma) for type compatibility
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: 'Invalid role' })
  }),

  // ✅ ENHANCEMENT: 12 chars (not 8), special char required.
  // OPTIONAL (2026-06-04): platform is OAuth-only for humans — admin-created users are
  // pre-provisioned by email and link on first OAuth login, so the create dialog collects
  // no password. When a password IS supplied the full strength chain runs; when omitted
  // Zod skips it (`.optional()` below). Service accounts are likewise passwordless.
  password: z.string()
    .min(12, 'Password must be at least 12 characters') // OWASP 2023
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain special character')
    .refine((pwd) => {
      // ✅ ENHANCEMENT: Block common passwords
      const commonPasswords = [
        'password123', 'admin123', 'qwerty123',
        'welcome123', 'p@ssw0rd123'
      ];
      return !commonPasswords.some(common =>
        pwd.toLowerCase().includes(common.toLowerCase())
      );
    }, { message: 'Password is too common' })
    .optional(),

  organizationDomain: z.string()
    .max(255)
    .optional(),

  // status + customRoleId: the create handler HONORS these (status defaults ACTIVE when omitted; customRoleId
  // is SUPER_ADMIN-gated), mirroring the update path for create/edit parity (lib/admin/handlers/user.ts,
  // 2026-06-30). Optional here; .strict() below rejects any field outside this set (BC78).
  status: z.nativeEnum(UserStatus, {
    errorMap: () => ({ message: 'Invalid status' })
  }).optional(),

  customRoleId: FormField.optionalCUID('customRoleId')
}).strict();

// ✅ ENHANCEMENT: Pagination schema (api-efficiency recommendation)
export const ListUsersSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  // Use Prisma enum to prevent drift (UserRole) + accepts null from forms
  role: FormField.optional(z.nativeEnum(UserRole)),
  // Use FormField pattern to accept null from forms
  search: FormField.optionalString(FIELD_LIMITS.LABEL)
});

// ✅ ENHANCEMENT: Simplified (use existing ApiKeyService, not database)
export const GenerateAPIKeySchema = z.object({
  name: z.string()
    .min(1, 'Key name is required')
    .max(100, 'Key name too long'),
  expiresIn: z.number()
    .int()
    .min(1, 'Minimum 1 day')
    .max(365, 'Maximum 365 days')
    .optional()
    .default(90) // 90 days default
});

// ✅ P1-2 FIX: Update User Schema (replaces manual validation)
export const UpdateUserSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .optional(),

  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .transform(e => e.toLowerCase()) // BC49 FIX: normalize email to lowercase
    .refine((email) => {
      // Block disposable email domains
      const disposableDomains = [
        'tempmail.com', '10minutemail.com', 'guerrillamail.com',
        'mailinator.com', 'throwaway.email'
      ];
      const domain = email.split('@')[1]?.toLowerCase();
      return !disposableDomains.includes(domain);
    }, { message: 'Disposable email addresses not allowed' })
    .optional(),

  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: 'Invalid role' })
  }).optional(),

  status: z.nativeEnum(UserStatus, {
    errorMap: () => ({ message: 'Invalid status' })
  }).optional(),

  customRoleId: FormField.optionalCUID('customRoleId'),

  organizationDomain: z.string()
    .max(255)
    .optional()
}).strict().refine((data) => {
  // At least one field must be provided
  return Object.values(data).some(val => val !== undefined);
}, { message: 'At least one field must be provided for update' });
