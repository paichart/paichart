import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { checkPermission } from '@/lib/auth/permissions';
import { ResourceType, ResourceAction } from '@/lib/types/auth';
import { templateService } from '@/lib/pov/templates/service';
import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { povCreationLimiter } from '@/lib/middleware/rate-limit';
import { CreatePOVSchemaInline as CreatePOVSchema } from '@/lib/validation/pov';
import { generateCacheKey } from '@/lib/utils/lru-cache';
import { povListCache } from './pov-cache';
import { parsePaginationParams, paginationResponse } from '@/lib/utils/pagination';
import { povLogger } from '@/lib/logger';
import { buildPOVAccessFilterWithRole } from '@/lib/pov/auth/pov-access-filter';
import { findBlockedTeamMemberIds } from '@/lib/utils/team-member-guard';
import { POVStatus, Priority, TaskStatus } from '@prisma/client';

// Jan Marshal's Simple & Reliable Approach
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// ✅ Q1 2026 Performance: POV list cache (50-95% faster, 70-80% hit rate).
// Moved to ./pov-cache.ts 2026-06-12 — route files may only export HTTP
// methods (fixes pre-existing .next/types TS2344 on `povListCache` export).

/**
 * GET /api/pov
 * Jan Marshal's Simple & Reliable POV API
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters - keep it simple
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = searchParams.get('limit');
    const priority = searchParams.get('priority');
    const ownerId = searchParams.get('ownerId');
    const owner_name = searchParams.get('owner_name');
    const customer_name = searchParams.get('customer_name');
    const pov_title = searchParams.get('pov_title');
    const pov_name = searchParams.get('pov_name'); // Alias for pov_title
    
    // ✅ NEW: Geographic Parameters - Jan Marshal's Simple Approach
    const country_name = searchParams.get('country_name');
    const region_name = searchParams.get('region_name');
    const theatre_name = searchParams.get('theatre_name');

    // Simple query building
    const query: any = {};
    
    // Add status filter if provided
    // 2026-05-27 (pentest M-2): validate the enum BEFORE it reaches the Prisma
    // filter — an out-of-range value throws in Prisma → generic 500. Reject 400.
    if (status) {
      if (!(Object.values(POVStatus) as string[]).includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Expected one of: ${Object.values(POVStatus).join(', ')}` },
          { status: 400 }
        );
      }
      query.status = status;
    }

    // Add priority filter if provided
    if (priority) {
      if (!(Object.values(Priority) as string[]).includes(priority)) {
        return NextResponse.json(
          { error: `Invalid priority. Expected one of: ${Object.values(Priority).join(', ')}` },
          { status: 400 }
        );
      }
      query.priority = priority;
    }
    
    // Add owner filter if provided
    if (ownerId) {
      query.ownerId = ownerId;
    }
    
    // Handle pov_title/pov_name filtering - Jan Marshal's simple approach
    const titleFilter = pov_title || pov_name; // pov_name is alias for pov_title
    if (titleFilter) {
      povLogger.debug({ titleFilter }, 'pov filter: title');
      query.title = { contains: titleFilter, mode: 'insensitive' };
    }

    // Handle customer_name filtering - direct field search
    if (customer_name) {
      povLogger.debug({ customer_name }, 'pov filter: customer');
      query.customerName = { contains: customer_name, mode: 'insensitive' };
    }

    // ============================================================================
    // Parallel query optimization (Dec 2025 - 3 independent lookups → ~67% faster)
    // Run all name-to-ID lookups in parallel when multiple filters provided
    // ============================================================================

    const needsOwnerLookup = owner_name && !ownerId;
    const needsCountryLookup = !!country_name;
    const needsRegionLookup = !!region_name;

    if (needsOwnerLookup || needsCountryLookup || needsRegionLookup) {
      povLogger.debug({ owner_name, country_name, region_name }, 'pov parallel lookups');

      const [matchingUsers, matchingCountries, matchingRegions] = await Promise.all([
        // Owner lookup (if needed)
        needsOwnerLookup ? prisma.user.findMany({
          where: {
            OR: [
              { name: { contains: owner_name!, mode: 'insensitive' } },
              { email: { contains: owner_name!, mode: 'insensitive' } }
            ]
          },
          select: { id: true, name: true, email: true }
        }) : Promise.resolve(null),
        // Country lookup (if needed)
        needsCountryLookup ? prisma.country.findMany({
          where: { name: { contains: country_name!, mode: 'insensitive' } },
          select: { id: true, name: true }
        }) : Promise.resolve(null),
        // Region lookup (if needed)
        needsRegionLookup ? prisma.region.findMany({
          where: { name: { contains: region_name!, mode: 'insensitive' } },
          select: { id: true, name: true }
        }) : Promise.resolve(null)
      ]);

      // Apply owner filter results
      if (needsOwnerLookup && matchingUsers) {
        if (matchingUsers.length > 0) {
          query.ownerId = { in: matchingUsers.map(u => u.id) };
        } else {
          query.ownerId = 'no-match';
        }
      }

      // Apply country filter results
      if (needsCountryLookup && matchingCountries) {
        if (matchingCountries.length > 0) {
          query.countryId = { in: matchingCountries.map(c => c.id) };
        } else {
          query.countryId = 'no-match';
        }
      }

      // Apply region filter results
      if (needsRegionLookup && matchingRegions) {
        if (matchingRegions.length > 0) {
          query.regionId = { in: matchingRegions.map(r => r.id) };
        } else {
          query.regionId = 'no-match';
        }
      }
    }
    
    // Handle theatre_name filtering - direct enum field search
    if (theatre_name) {
      povLogger.debug({ theatre_name }, 'pov filter: theatre');
      
      // Map common theatre names to enum values
      const theatreMap: { [key: string]: string } = {
        'apj': 'APJ',
        'asia': 'APJ',
        'asia pacific': 'APJ',
        'emea': 'EMEA',
        'europe': 'EMEA',
        'middle east': 'EMEA',
        'africa': 'EMEA',
        'north america': 'NORTH_AMERICA',
        'na': 'NORTH_AMERICA',
        'usa': 'NORTH_AMERICA',
        'canada': 'NORTH_AMERICA',
        'lac': 'LAC',
        'latin america': 'LAC',
        'south america': 'LAC'
      };
      
      const normalizedTheatre = theatre_name.toLowerCase();
      const mappedTheatre = theatreMap[normalizedTheatre] || theatre_name.toUpperCase();
      
      // Validate against actual enum values
      const validTheatres = ['NORTH_AMERICA', 'LAC', 'EMEA', 'APJ'];
      if (validTheatres.includes(mappedTheatre)) {
        query.salesTheatre = mappedTheatre;
      } else {
        // Use a condition that will never match instead of invalid enum value
        query.salesTheatre = { not: { in: validTheatres } };
      }
    }
    
    // User access control - centralized helper
    const { filter: userAccessQuery, isAdmin } = buildPOVAccessFilterWithRole(user);
    if (!isAdmin) {
      if (user.role === 'DEMO_USER') {
        povLogger.debug({ userId: user.userId }, 'DEMO_USER access filter applied');
      }
      // Combine access filter with any existing query filters using AND
      if (Object.keys(query).length > 0) {
        query.AND = [userAccessQuery, { ...query }];
        // Remove the individual filters since they're now in AND
        if (status) delete query.status;
        if (priority) delete query.priority;
        if (ownerId) delete query.ownerId;
        if (customer_name) delete query.customerName;
        if (titleFilter) delete query.title;
        if (country_name) delete query.countryId;
        if (region_name) delete query.regionId;
        if (theatre_name) delete query.salesTheatre;
      } else {
        // If no other filters, just use user access control
        Object.assign(query, userAccessQuery);
      }
    }

    // ✅ Q1 2026 Performance: Check cache AFTER role-based filtering (prevents permission bypass)
    // Cache key includes role + filters to ensure permission isolation
    const cacheKey = generateCacheKey('pov:list', user.userId, {
      ...Object.fromEntries(searchParams),
      role: user.role // CRITICAL: Include role in cache key for permission isolation
    });
    const cached = povListCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Pagination
    const { limit: limitNum, offset } = parsePaginationParams(searchParams);

    // ✅ Week-4 expand pattern (2026-06-12): minimal by default.
    // List consumers (POVListView, Bloomberg/Timeline, POVExportButton,
    // POVSelector, SelectPovDialog) read scalars + owner + country/region
    // names only. team (30% of payload) and phases (6%) had ZERO list
    // consumers — all team.members consumers are on the /api/pov/[povId]
    // detail path. ?expand=true returns the full legacy shape (escape hatch
    // for external REST consumers). MCP is unaffected (pov.list goes through
    // lib/pov/services/pov.ts, a separate execution path).
    // Cache safety: cacheKey spreads all searchParams, so expand partitions it.
    const expand = searchParams.get('expand') === 'true';

    // Fetch POVs + total count in parallel
    const [povs, totalCount] = await Promise.all([
      prisma.pOV.findMany({
        where: query,
        take: limitNum,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: expand ? {
          // Full legacy shape (pre-2026-06-12 default)
          phases: {
            select: {
              id: true,
              name: true,
              type: true
            }
          },
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          team: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true
                    }
                  }
                }
              }
            }
          },
          region: true,
          country: true
        } : {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          // POVExportButton exports country/region names — keep, narrowed
          // from full objects (9% of payload) to {id, name}
          country: { select: { id: true, name: true } },
          region: { select: { id: true, name: true } }
        }
      }),
      prisma.pOV.count({ where: query })
    ]);

    // ✅ 2026-06-12: Server-side progress (% tasks COMPLETED — same definition
    // as lib/pov/utils/progressCalculation.ts calculateTaskCompletion).
    // POVBloombergView consumed pov.progress which never existed → bars stuck
    // at 0%. One batched groupBy for the page (≤limit POVs), hits the
    // [povId, status] index.
    const povIds = povs.map(p => p.id);
    const taskCounts = povIds.length > 0 ? await prisma.task.groupBy({
      by: ['povId', 'status'],
      where: { povId: { in: povIds } },
      _count: true
    }) : [];
    const taskTotals = new Map<string, number>();
    const taskCompleted = new Map<string, number>();
    for (const tc of taskCounts) {
      if (!tc.povId) continue; // povId is nullable in the Task model typing
      taskTotals.set(tc.povId, (taskTotals.get(tc.povId) ?? 0) + tc._count);
      if (tc.status === TaskStatus.COMPLETED) taskCompleted.set(tc.povId, tc._count);
    }
    const povsWithProgress = povs.map(p => {
      const total = taskTotals.get(p.id) ?? 0;
      const done = taskCompleted.get(p.id) ?? 0;
      return { ...p, progress: total > 0 ? Math.round((done / total) * 100) : 0 };
    });

    // ✅ Q1 2026 Performance: Cache result for future requests
    const result = paginationResponse(povsWithProgress, totalCount, limitNum, offset);
    povListCache.set(cacheKey, result);

    return NextResponse.json(result);

  } catch (error) {
    povLogger.error({ err: error }, 'pov list error');
    
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to get POVs' },
      { status: 500 }
    );
  }
}

// ✅ Schema extracted to lib/validation/pov.ts (Pilot #1 Step 1)
// Now centralized and reusable across POV domain

/**
 * POST /api/pov
 * Create a new POV - supports template-based creation
 */
export async function POST(request: NextRequest) {
  try {
    // ✅ PHASE 2: Rate limiting check (50 POVs per day)
    const rateLimitResponse = povCreationLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse; // Rate limit exceeded
    }

    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Capability gate: who may create POVs is governed by the RolePermission table
    // (role-level — a new POV has no instance to scope). Mirrors the MCP gate.
    const canCreate = await checkPermission(
      { id: user.userId, role: user.role },
      { id: null, type: ResourceType.PoV },
      ResourceAction.CREATE
    );
    if (!canCreate) {
      return NextResponse.json({ error: 'You do not have permission to create POVs' }, { status: 403 });
    }

    const data = await request.json();

    // ✅ SECURITY: Filter privileged fields BEFORE validation (defense-in-depth)
    // Source of truth: user.userId (prevents privilege escalation)
    const { ownerId: _, teamId: __, ...filteredData } = data;

    // ✅ STEP 4: Validation with .safeParse() on FILTERED data (correct pattern)
    const validation = CreatePOVSchema.safeParse(filteredData);

    if (!validation.success) {
      // ✅ STEP 5: Security logging (monitor validation failures)
      povLogger.warn({ userId: user.userId }, 'pov creation validation failed');

      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    const validated = validation.data;

    // Use validated, filtered data
    const validatedData = validated;

    // Check if this is a template-based creation
    if (validatedData.templateId) {
      // Template-based creation
      if (!validatedData.formData || typeof validatedData.formData !== 'object') {
        return NextResponse.json(
          { error: 'Form data is required for template-based creation' },
          { status: 400 }
        );
      }
      
      try {
        // Validate geographical data before proceeding
        if (!validatedData.formData.countryId) {
          return NextResponse.json(
            { error: 'Country ID is required for POV creation' },
            { status: 400 }
          );
        }

        // Verify that the country ID exists in the database
        const countryExists = await prisma.country.findUnique({
          where: { id: validatedData.formData.countryId }
        });

        if (!countryExists) {
          return NextResponse.json(
            { error: `Country with ID ${validatedData.formData.countryId} does not exist` },
            { status: 400 }
          );
        }

        // Verify region ID if provided
        if (validatedData.formData.regionId) {
          const regionExists = await prisma.region.findUnique({
            where: { id: validatedData.formData.regionId }
          });

          if (!regionExists) {
            return NextResponse.json(
              { error: `Region with ID ${validatedData.formData.regionId} does not exist` },
              { status: 400 }
            );
          }
        }

        // ✅ SECURITY: Use validated data, owner is ALWAYS the authenticated user
        const pov = await templateService.createPOVFromTemplate(
          validatedData.templateId,
          validatedData.formData,
          user.userId  // Owner source of truth (prevents privilege escalation)
        );

        // Check if the POV template has phase templates
        if (data.templateId) {
          const template = await templateService.getTemplate(data.templateId);

          // Check if the template has phase templates
          if (template && template.metadata && template.metadata.phaseTemplates && template.metadata.phaseTemplates.length > 0) {
            // If phaseTemplateIds weren't provided but the template has them, use those
            if (!data.phaseTemplateIds || !Array.isArray(data.phaseTemplateIds) || data.phaseTemplateIds.length === 0) {
              data.phaseTemplateIds = [...template.metadata.phaseTemplates];
            }
          }
        }

        // If phase template IDs are provided, create phases from templates
        if (data.phaseTemplateIds && Array.isArray(data.phaseTemplateIds) && data.phaseTemplateIds.length > 0) {
          povLogger.debug({ povId: pov.id, templateCount: data.phaseTemplateIds.length }, 'creating phases from templates');

          try {
            // Fetch the phase templates
            const phaseTemplatePromises = data.phaseTemplateIds.map(async (templateId: string) => {
              // Ensure we have a full URL with protocol and host
              const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
              const url = new URL(`/api/phase-templates/${templateId.trim()}`, baseUrl);

              try {
                
                // Get the cookies from the request to include in the fetch
                const cookies = request.cookies.getAll();
                const cookieHeader = cookies.map((c: { name: string, value: string }) => `${c.name}=${c.value}`).join('; ');
                
                // Make the fetch request with the cookies
                const response = await fetch(url.toString(), {
                  headers: {
                    Cookie: cookieHeader,
                    'Content-Type': 'application/json'
                  }
                });
                
                if (!response.ok) {
                  await response.body?.cancel(); // BC20 FIX
                  povLogger.warn({ templateId, status: response.status }, 'failed to fetch phase template');
                  return null;
                }
                
                const data = await response.json();
                return data;
              } catch (fetchError) {
                povLogger.error({ err: fetchError, templateId }, 'error fetching template');
                return null;
              }
            });
            
            const phaseTemplates = (await Promise.all(phaseTemplatePromises)).filter(Boolean);
            
            // Create phases from templates
            for (const template of phaseTemplates) {
              try {
                try {
                  
                  // Check if the phase already exists
                  const existingPhase = await prisma.phase.findFirst({
                    where: {
                      povId: pov.id,
                      templateId: template.id
                    }
                  });
                  
                  if (!existingPhase) {
                    // Import the phaseTemplateService
                    const { phaseTemplateService } = await import('@/lib/pov/services/phaseTemplate');
                    
                    try {
                      const newPhase = await phaseTemplateService.createPhaseFromTemplate({
                        povId: pov.id,
                        templateId: template.id,
                        name: template.name,
                        description: template.description || '',
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                        type: template.type || 'PLANNING'
                      });
                      
                    } catch (createPhaseError) {
                      povLogger.error({ err: createPhaseError, templateId: template.id }, 'error creating phase from template');
                      throw createPhaseError;
                    }
                  }
                } catch (createError) {
                  povLogger.error({ err: createError, templateId: template.id }, 'error creating phase');
                  throw createError;
                }
              } catch (phaseError) {
                povLogger.error({ err: phaseError, templateId: template.id }, 'phase template creation failed');
              }
            }
          } catch (templatesError) {
            povLogger.error({ err: templatesError }, 'error processing phase templates');
          }
        }
        
        // Fetch the complete POV with phases to return
        const completePov = await prisma.pOV.findUnique({
          where: { id: pov.id },
          include: {
            phases: true,
            team: {
              include: {
                members: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    }
                  }
                }
              }
            },
            country: true,
            region: true,
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });
        
        return NextResponse.json(completePov || pov);
      } catch (err: any) {
        povLogger.error({ err, code: err.code }, 'error creating POV from template');

        if (err instanceof ApiError) {
          return NextResponse.json(
            { error: err.message, details: err.details },
            { status: err.statusCode }
          );
        }
        
        // Provide more specific error message based on the error type
        let errorMessage = 'Failed to create POV from template';
        if (err.code === 'P2025') {
          errorMessage = 'Record not found. The country or region ID may be invalid.';
        } else if (err.code === 'P2002') {
          errorMessage = 'Unique constraint violation. A POV with similar unique fields already exists.';
        } else if (err.code === 'P2003') {
          errorMessage = 'Foreign key constraint failed. One of the referenced records does not exist.';
        }
        
        return NextResponse.json(
          { error: errorMessage, details: err.message },
          { status: 500 }
        );
      }
    } else {
      // Direct POV creation
      //
      // SECURITY (2026-05-14, sec-ops review): use VALIDATED data, not raw
      // filtered body. The prior `filteredData as any` here discarded the
      // safeParse output and let injection content reach Prisma on the 6
      // text fields that weren't declared at the schema's top level.
      // See lib/validation/pov.ts § "Direct POV creation" — every field
      // read below must be declared in CreatePOVSchemaInline, or Zod's
      // default unknown-key strip will silently drop it from validatedData.
      const safeData = validatedData as any;

      // Validate required fields
      if (!safeData.title || !safeData.description || !safeData.status || !safeData.priority || !safeData.startDate || !safeData.endDate) {
        return NextResponse.json(
          { error: 'Missing required fields for POV creation' },
          { status: 400 }
        );
      }

      // Validate country ID
      if (!safeData.countryId) {
        return NextResponse.json(
          { error: 'Country ID is required' },
          { status: 400 }
        );
      }

      // Create POV with transaction to ensure atomic operations
      try {
        // Check if we need to create a team
        const hasTeamMembers = safeData.teamMembers && Array.isArray(safeData.teamMembers) && safeData.teamMembers.length > 0;

        povLogger.debug({ memberCount: safeData.teamMembers?.length || 0 }, 'creating POV with team');

        // Use transaction to ensure all operations succeed or fail together
        const result = await prisma.$transaction(async (tx) => {
          // Create POV first (using validated, filtered data)
          const pov = await tx.pOV.create({
            data: {
              title: safeData.title,
              description: safeData.description,
              objective: safeData.objective,
              status: safeData.status,
              priority: safeData.priority,
              startDate: new Date(safeData.startDate),
              endDate: new Date(safeData.endDate),
              customerName: safeData.customerName,
              customerContact: safeData.customerContact,
              partnerName: safeData.partnerName,
              partnerContact: safeData.partnerContact,
              solution: safeData.solution,
              competitors: safeData.competitors || [],
              opportunityName: safeData.opportunityName,
              revenue: safeData.revenue ? parseFloat(safeData.revenue.toString()) : undefined,
              forecastDate: safeData.forecastDate ? new Date(safeData.forecastDate) : undefined,
              estimatedBudget: safeData.estimatedBudget || safeData.budget ? parseFloat((safeData.estimatedBudget || safeData.budget).toString()) : undefined,
              salesTheatre: safeData.salesTheatre || 'NORTH_AMERICA',
              country: {
                connect: { id: safeData.countryId }
              },
              region: safeData.regionId ? {
                connect: { id: safeData.regionId }
              } : undefined,
              // ✅ SECURITY: Owner is ALWAYS the authenticated user (not from request body)
              owner: {
                connect: { id: user.userId }
              }
            }
          });

          // Now create team if needed
          if (hasTeamMembers) {
            // Create a team
            const team = await tx.team.create({
              data: {
                name: `${safeData.title} Team`
              }
            });

            // 2026-05-27: demo + super-admin/system accounts must never become team members (write-side guard)
            const blockedTeamIds = await findBlockedTeamMemberIds(tx, safeData.teamMembers.map((m: any) => m.userId));
            // Create team members one by one to ensure all are created
            for (const member of safeData.teamMembers) {
              if (blockedTeamIds.has(member.userId)) continue; // skip blocked (demo/system) users
              // Ensure the role is a valid TeamRole enum value
              let role = member.role;
              if (role === 'TECHNICAL') {
                role = 'TECHNICAL_TEAM';
              }
              
              await tx.teamMember.create({
                data: {
                  teamId: team.id,
                  userId: member.userId,
                  role
                }
              });
            }
            
            // Update the POV with the team ID
            await tx.pOV.update({
              where: { id: pov.id },
              data: {
                teamId: team.id
              }
            });
            
            // Return POV ID and team ID for fetching later
            return { povId: pov.id, hasTeam: true };
          } else {
            // Return just the POV ID
            return { povId: pov.id, hasTeam: false };
          }
        });
        
        // Fetch the complete POV with all relations after transaction completes
        const completePov = await prisma.pOV.findUnique({
          where: { id: result.povId },
          include: {
            team: result.hasTeam ? {
              include: {
                members: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true
                      }
                    }
                  }
                }
              }
            } : undefined,
            country: true,
            region: true,
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        // ✅ Q1 2026 Performance: Invalidate cache after POV creation
        povListCache.invalidatePattern(`pov:list:${user.userId}`);

        return NextResponse.json(completePov);
      } catch (err: any) {
        povLogger.error({ err, code: err.code }, 'direct POV creation error');

        return NextResponse.json(
          { error: 'Failed to create POV' },
          { status: 500 }
        );
      }
    }
  } catch (error: any) {
    povLogger.error({ err: error, code: error.code }, 'pov creation error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create POV' },
      { status: 500 }
    );
  }
}
