import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { templateService } from '@/lib/services/template-service';
import { templateStorage } from '@/lib/pov/phase-templates/storage';
import { PhaseTemplate, Stage, Task } from '@/lib/pov/phase-templates/types';
import { PhaseTemplateSchema } from '@/lib/validation/phase-template-validation';
import { logger } from '@/lib/logger';
 
 /**
  * GET /api/phase-templates
  * Retrieves all phase templates, optionally filtered by type or default status.
  */
 export async function GET(request: NextRequest) {
   try {
     // Get the authenticated user
     const user = await getAuthUser(request);
     if (!user) {
       return NextResponse.json(
         { error: 'Unauthorized' },
         { status: 401 }
       );
     }
 
     // Get query parameters
     const { searchParams } = new URL(request.url);
     const typeFilter = searchParams.get('type');
     const isDefaultFilter = searchParams.get('isDefault'); // Keep as string to check for presence
 
     // Fetch all phase templates using the unified service
     // The service handles normalization
     let templates = await templateStorage.getAllTemplates();
 
     // Apply filtering based on query parameters
     if (typeFilter) {
       templates = templates.filter(template => template.type === typeFilter);
     }
     if (isDefaultFilter !== null) { // Check if the parameter is present
       const isDefaultBoolean = isDefaultFilter === 'true';
       templates = templates.filter(template => template.isDefault === isDefaultBoolean);
     }
 
     // Sort templates (optional, but good for consistency)
     templates.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()); // Assuming updatedAt exists or add it to type
 
     // Resolve dependency IDs to names for each template
     const templatesWithResolvedIds = await Promise.all(
       templates.map(template => templateService.resolveIdsToNames(template))
     );
 
     return NextResponse.json(templatesWithResolvedIds);
   } catch (error) {
     logger.error({ err: error }, 'Error fetching phase templates');
     return NextResponse.json(
       { error: 'Failed to fetch phase templates' },
       { status: 500 }
     );
   }
 }

// NOTE: PhaseTemplateSchema moved to lib/validation/phase-template-validation.ts
// This provides centralized validation with injection detection and .safeParse()

 /**
  * POST /api/phase-templates
  * Creates a new phase template
  */
 export async function POST(request: NextRequest) {
   try {
     // Get the authenticated user
     const user = await getAuthUser(request);
     if (!user) {
       return NextResponse.json(
         { error: 'Unauthorized' },
         { status: 401 }
       );
     }
 
     const data = await request.json();

     // ✅ SECURITY: Centralized validation with .safeParse() and injection detection
     const result = PhaseTemplateSchema.safeParse(data);

     if (!result.success) {
       // SECURITY LOGGING: Log validation failures (potential injection attempts)
       // BC42 FIX: Truncate raw user input before logging to prevent log injection
       logger.error({ userId: user.userId, templateName: typeof data.name === 'string' ? data.name.substring(0, 100).replace(/[\n\r]/g, '') : '[invalid]' }, 'SECURITY: Phase template validation failed');

       return NextResponse.json({
         error: 'Validation failed',
         details: result.error.errors.map(e => ({
           field: e.path.join('.'),
           message: e.message
         }))
       }, { status: 400 });
     }

     const validated = result.data;

     // Standardize task properties in stages using validated data
     const standardizedStages = validated.stages.map((stage: any) => ({
       ...stage,
       tasks: stage.tasks?.map((task: any) => ({
         ...task,
         id: task.id || task.key || `task-${Math.random().toString(36).substr(2, 9)}`,
         title: task.title || task.name || '',
         dependencies: (task.dependencies || []).filter((dep: any) => dep !== undefined)
       })) || []
     }));

     // Prepare the workflow JSON (assuming Prisma expects this structure)
     const workflow = {
       stages: standardizedStages
     };

     // Create the template in the database using validated data
     const template = await prisma.phaseTemplate.create({
       data: {
         name: validated.name,
         description: validated.description,
         type: validated.type,
         isDefault: validated.isDefault,
         workflow: workflow as any // Prisma expects JSON, cast as any for now
       }
     });
 
     // Instead of using normalization, standardize the template directly
     const standardizedTemplate = {
       id: template.id,
       name: template.name,
       description: template.description,
       type: template.type,
       isDefault: template.isDefault,
       stages: workflow.stages,
       createdAt: template.createdAt,
       updatedAt: template.updatedAt
     };
 
     return NextResponse.json(standardizedTemplate);
   } catch (error) {
     logger.error({ err: error }, 'Error creating phase template');
     return NextResponse.json(
       { error: 'Failed to create phase template' },
       { status: 500 }
     );
   }
 }
