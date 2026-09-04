import { NextRequest } from "next/server"
import { ApiError, ErrorCode } from "@/lib/errors"
import { createHandler } from "@/lib/api-handler"
import { prisma } from "@/lib/prisma"
import { UserRole, ResourceType, ResourceAction } from "@/lib/types/auth"
import { z } from "zod"
import { logger } from '@/lib/logger'
import { logPermissionChange } from "@/lib/auth/audit"
import { permissionCache } from "@/lib/auth/cache"

const updatePermissionSchema = z.object({
  role: z.nativeEnum(UserRole),
  resource: z.nativeEnum(ResourceType),
  action: z.nativeEnum(ResourceAction),
  value: z.boolean(),
})

type UpdatePermissionRequest = z.infer<typeof updatePermissionSchema>

export const GET = createHandler(
  async (req: NextRequest, context, user) => {
    // Check if user exists and has admin access
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        "Access denied. Only administrators can view system permissions."
      )
    }

    // Get all permissions from database
    const permissions = await prisma.rolePermission.findMany({ take: 1000 }); // BC62 FIX: Bound query

    return { data: { permissions, currentUserRole: user.role } }
  },
  {
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
    rateLimit: 'admin' as const,
  }
)

export const PUT = createHandler(
  async (req: NextRequest, context, user) => {
    // Validate request
    const body = (await req.json()) as UpdatePermissionRequest
    const result = updatePermissionSchema.safeParse(body)
    if (!result.success) {
      throw new ApiError(
        ErrorCode.BAD_REQUEST,
        "Invalid request format. Please ensure all required fields are provided and have valid values."
      )
    }

    // Check if user exists and has admin access
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        "Access denied. Only administrators can manage system permissions."
      )
    }

    // Read from validated data — 2026-05-14 bug-class cleanup (no security
    // impact here; schema is enum-only with no transforms or refines, so
    // body destructuring was functionally equivalent. Switch is consistency
    // with the rest of the codebase post-stage-routes / POV-create fix.)
    const { role, resource, action, value } = result.data

    // Only SUPER_ADMIN can modify ADMIN permissions
    if (role === UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        "Only super admins can modify admin permissions. Please contact a super admin to make changes to admin permissions."
      )
    }

    // Log the permission update attempt
    logger.info({ userRole: user.role, targetRole: role, resource, action, value }, 'Permission update');

    // Look up previous value to record proper diff in audit log
    const previous = await prisma.rolePermission.findUnique({
      where: {
        role_resourceType_action: { role, resourceType: resource, action },
      },
      select: { enabled: true },
    });
    const oldValue = previous?.enabled ?? false;

    // Update role permission in the database
    const updatedPermission = await prisma.rolePermission.upsert({
      where: {
        role_resourceType_action: {
          role,
          resourceType: resource,
          action,
        },
      },
      update: {
        enabled: value,
      },
      create: {
        role,
        resourceType: resource,
        action,
        enabled: value,
      },
    })

    // P2.4 (2026-05-24): SOC 2 CC6.1 evidence — permission grant/revoke audit (CRITICAL)
    void logPermissionChange(user!.userId, resource, action, oldValue, value, {
      targetRole: role,
      success: true,
      source: 'admin',
    });

    // Flush the permission cache so the role change takes effect immediately
    // (the cache is keyed per-user with a 5-min TTL; a role grant affects ALL
    // users of that role, so a targeted per-user invalidation isn't possible —
    // clear all. Role changes are rare admin actions, so the cost is negligible).
    permissionCache.clear();

    return { data: updatedPermission }
  },
  {
    requireAuth: true,
    allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
    rateLimit: 'admin' as const,
  }
)
