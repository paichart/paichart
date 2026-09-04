import { NextRequest } from 'next/server';
import createHandler from '@/lib/api-handler';
import { UserRole } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { AgentTemplateStatus } from '@prisma/client';

/**
 * GET /api/pov/agent/roles
 * Available agent roles — DERIVED from ACTIVE agent templates' `defaultRole`.
 *
 * (2026-07-02) Was a hardcoded 16-role list (`code-generator`, `code-reviewer`, …) that had drifted
 * completely from the seeded templates (which use `research_analyst`, `config_change_author`,
 * `pipeline_harness_orchestrator`, …) — so the picker showed roles that matched no real template.
 * Now a `distinct` query. `custom` stays as an explicit free-form option (not template-derived).
 */
export const GET = createHandler(
  async (_req: NextRequest) => {
    const rows = await prisma.agentTemplate.findMany({
      where: { status: AgentTemplateStatus.ACTIVE },
      distinct: ['defaultRole'],
      select: { defaultRole: true },
      orderBy: { defaultRole: 'asc' },
    });

    const roles = rows.map((r) => r.defaultRole).filter(Boolean);
    if (!roles.includes('custom')) roles.push('custom');

    return { data: roles };
  },
  { requireAuth: true, allowedRoles: [UserRole.USER, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] }
);
