import { z } from 'zod';
import { TeamRole } from '@prisma/client';
import { FormField } from './form-field-patterns';

/**
 * Centralized Team Management Validation Schemas
 * Week 6: POV Team Management
 *
 * Following discovered pattern: 47 schemas across 11 centralized files
 * Pattern source: validation-discovery.md
 *
 * Used by:
 * - Backend: POST/PUT/DELETE team member endpoints
 * - Frontend: TeamSection.tsx form validation
 */

/**
 * Add Team Member Schema
 * Endpoint: POST /api/pov/[povId]/team/members
 *
 * Validates new team member addition with userId and optional role
 */
export const AddTeamMemberSchema = z.object({
  userId: z
    .string({ required_error: 'Please select a user' })
    .cuid('Please select a valid user'),
  // Use FormField pattern to accept null from forms
  role: FormField.optional(
    z.nativeEnum(TeamRole, { required_error: 'Please select a role' })
      .default(TeamRole.MEMBER)
  ),
});

export type AddTeamMemberFormData = z.infer<typeof AddTeamMemberSchema>;

/**
 * Update Team Member Role Schema
 * Endpoint: PUT /api/pov/[povId]/team/members/[memberId]
 *
 * Validates role updates for existing team members
 */
export const UpdateTeamMemberRoleSchema = z.object({
  role: z.nativeEnum(TeamRole, {
    required_error: 'Role is required',
    invalid_type_error: 'Invalid role selected',
  }),
}).strict();

export type UpdateTeamMemberRoleFormData = z.infer<typeof UpdateTeamMemberRoleSchema>;

/**
 * Batch Add Team Members Schema
 * Endpoint: POST /api/pov/[povId]/team/members/batch
 *
 * Validates bulk addition of team members (max 20 at once)
 * Uses atomic transaction (all-or-nothing)
 */
export const BatchAddTeamMembersSchema = z.object({
  members: z
    .array(
      z.object({
        userId: z.string().cuid('Invalid user ID'),
        // Use FormField pattern to accept null from forms
        role: FormField.optional(z.nativeEnum(TeamRole).default(TeamRole.MEMBER)),
      })
    )
    .min(1, 'Please select at least one member')
    .max(20, 'Maximum 20 members can be added at once'),
});

export type BatchAddTeamMembersFormData = z.infer<typeof BatchAddTeamMembersSchema>;

/**
 * Helper: Map backend validation errors to form fields
 * Used with React Hook Form setError function
 *
 * @param errors - Backend error fields array
 * @param setError - React Hook Form setError function
 */
export function mapBackendErrorsToFields(
  errors: Array<{ field: string; message: string }>,
  setError: any
) {
  errors.forEach(({ field, message }) => {
    setError(field, {
      type: 'server',
      message,
    });
  });
}
