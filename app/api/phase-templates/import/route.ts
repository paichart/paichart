import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { templateService } from '@/lib/services/template-service';
import { PhaseTemplate } from '@/lib/pov/phase-templates/types';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { ImportPhaseTemplatesSchema } from '@/lib/validation/phase-template-validation';
import { logger } from '@/lib/logger';
 
 export async function POST(request: NextRequest) {
   try {
     // SECURITY FIX: Add authentication to prevent unauthorized template imports
     const user = await getAuthUser(request);
     if (!user) {
       return NextResponse.json(
         { success: false, error: 'Unauthorized access to template import' },
         { status: 401 }
       );
     }

     const body = await request.json();

     // ✅ SECURITY: Centralized validation with .safeParse() and injection detection
     const result = ImportPhaseTemplatesSchema.safeParse(body);

     if (!result.success) {
       // SECURITY LOGGING: Log validation failures (potential injection attempts)
       logger.error({ userId: user.userId, templateCount: body.templates?.length || 0, errors: result.error.errors }, 'SECURITY: Phase template import validation failed');

       return NextResponse.json({
         error: 'Validation failed',
         details: result.error.errors.map(e => ({
           field: e.path.join('.'),
           message: e.message
         }))
       }, { status: 400 });
     }

     const { templates, options } = result.data;
     const validateOnly = options.validateOnly;

     // Validation results
     const validationResults = {
       valid: [] as PhaseTemplate[],
       invalid: [] as { template: any; errors: string[] }[],
     };

     // Process each template (already validated by schema)
     for (const rawTemplate of templates) {
       try {
         // Use the template service to process (normalize and validate) the raw template data
         let normalizedTemplate = templateService.processRawTemplateForImport(rawTemplate, 'phase') as PhaseTemplate;

         // Process and validate dependencies
         const { processedTemplate, errors: dependencyErrors } = templateService.processDependenciesForImport(normalizedTemplate);
         normalizedTemplate = processedTemplate; // Use the template with processed dependencies

         if (dependencyErrors.length > 0) {
           validationResults.invalid.push({
             template: rawTemplate, // Use rawTemplate for invalid details
             errors: dependencyErrors
           });
           continue; // Skip to the next template if dependency errors exist
         }

         // Check if template with same name already exists (if no ID provided)
         if (!normalizedTemplate.id) {
           const existing = await prisma.phaseTemplate.findFirst({
             where: { name: normalizedTemplate.name }
           });

           if (existing) {
             if (!options.overwrite) {
               validationResults.invalid.push({
                 template: rawTemplate, // Use rawTemplate for invalid details
                 errors: [`Template with name "${normalizedTemplate.name}" already exists and overwrite is not enabled`]
               });
               continue;
             } else {
               // If overwrite is enabled, set the ID to the existing template's ID
               normalizedTemplate.id = existing.id;
               logger.info({ templateId: existing.id, templateName: normalizedTemplate.name }, 'Overwriting existing template');
             }
           }
         } else {
            // If ID is provided, check if it exists if createMissing is not enabled
            const existing = await prisma.phaseTemplate.findUnique({
                where: { id: normalizedTemplate.id }
            });
            if (!existing && !options.createMissing) {
                 validationResults.invalid.push({
                    template: rawTemplate, // Use rawTemplate for invalid details
                    errors: [`Template with ID "${normalizedTemplate.id}" not found and createMissing is not enabled`]
                 });
                 continue;
            }
         }

         // If validation passes (handled by processRawTemplateForImport) and not in validate-only mode, create or update the template
         if (!validateOnly) {
           // Prepare data for Prisma - ensure workflow JSON structure
           const prismaData = {
             name: normalizedTemplate.name,
             description: normalizedTemplate.description,
             type: normalizedTemplate.type,
             isDefault: normalizedTemplate.isDefault,
             workflow: { stages: normalizedTemplate.stages } as any // Prisma expects JSON
           };

           if (normalizedTemplate.id) {
             // Update existing template
             await prisma.phaseTemplate.update({
               where: { id: normalizedTemplate.id },
               data: prismaData
             });
           } else {
             // Create new template
             await prisma.phaseTemplate.create({
               data: prismaData
             });
           }
         }

         // If we got here, the template is valid and processed (or validation skipped in validateOnly mode)
         // Add the normalized template to the valid results
         validationResults.valid.push(normalizedTemplate);

       } catch (error) {
         // Catch errors thrown by processRawTemplateForImport or Prisma operations
         logger.error({ err: error }, 'Error processing template during import');
         validationResults.invalid.push({
           template: rawTemplate, // Use rawTemplate for invalid details
           errors: [(error as Error).message || 'Unknown error during processing']
         });
       }
     }
     
     // Return validation results
     return NextResponse.json({
       success: validationResults.invalid.length === 0,
       validateOnly,
       results: {
         valid: validationResults.valid.length,
         invalid: validationResults.invalid.length,
         invalidDetails: validationResults.invalid
       }
     });
   } catch (error) {
     logger.error({ err: error }, 'Error importing phase templates');
     return NextResponse.json(
       { error: 'Failed to import phase templates' },
       { status: 500 }
     );
   }
 }
