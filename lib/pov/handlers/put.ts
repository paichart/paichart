import { NextRequest } from "next/server"
import { ApiError, InvalidTransitionError } from "@/lib/errors"
import { povService } from "@/lib/pov/services/pov"
import { PoVUpdateInput } from "@/lib/pov/types/core" // Assuming this is not Phase from @prisma/client
import { Phase as PhasePayloadItem } from '@/lib/types/phase'; // Added import
import { prisma } from "@/lib/prisma"
import { z } from 'zod';
import { FIELD_LIMITS } from '@/lib/validation/field-limits';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { sanitizePovMetadata } from '@/lib/pov/sanitize-metadata';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { validateTaskStatusTransition } from '@/lib/tasks/services/status-transitions';
import { povListCache } from '@/app/api/pov/pov-cache';
import { taskListCache } from '@/lib/tasks/handlers/get';
import { StageStatus, POVStatus, Priority, SalesTheatre, TeamRole, TaskStatus, TaskPriority } from '@prisma/client';
import { FormField } from '@/lib/validation/form-field-patterns';
import { PrismaEnum } from '@/lib/validation/enum-validation';
import { UpdatePOVSchemaComprehensive } from '@/lib/validation/pov';
import { povLogger } from '@/lib/logger';
import { logStageFieldChange, TaskActivityAction } from '@/lib/pov/services/stageActivityService';
import { applyTeamUpdate } from '@/lib/pov/services/team';
import { enforceProtocolStampImmutable, dropPlatformRunKeys, stripAuditFacts } from '@/lib/tasks/services/protected-task-metadata';

// Helper function to ensure phases are created from templates
export async function ensurePhasesFromTemplates(povId: string, phaseTemplateIds: string[]) {
  povLogger.info({ povId, templateCount: phaseTemplateIds.length }, 'ensuring phases from templates');
  
  // Check if phases already exist for this POV
  const existingPhases = await prisma.phase.findMany({
    where: { povId },
    include: {
      template: true,
      stages: {
        include: {
          tasks: true
        }
      }
    },
    take: 50
  });
  
  // Get the template IDs of existing phases
  const existingTemplateIds = existingPhases
    .filter(phase => phase.templateId)
    .map(phase => phase.templateId!);
  
  // Find template IDs that don't have corresponding phases
  const missingTemplateIds = phaseTemplateIds.filter(
    id => !existingTemplateIds.includes(id)
  );

  // Check if any existing phases have no stages or tasks
  const phasesWithoutStages = existingPhases.filter(phase =>
    phase.stages.length === 0 && existingTemplateIds.includes(phase.templateId!)
  );

  povLogger.debug({ povId, existingCount: existingTemplateIds.length, missingCount: missingTemplateIds.length, emptyPhaseCount: phasesWithoutStages.length }, 'phase template sync status');
  
  // If there are phases without stages, delete them so they can be recreated
  if (phasesWithoutStages.length > 0) {
    povLogger.info({ povId, count: phasesWithoutStages.length }, 'deleting phases without stages for recreation');

    for (const phase of phasesWithoutStages) {
      
      try {
        await prisma.phase.delete({
          where: { id: phase.id }
        });
        
        // Add the template ID to the missing template IDs list so it will be recreated
        if (!missingTemplateIds.includes(phase.templateId!)) {
          missingTemplateIds.push(phase.templateId!);
        }
      } catch (error) {
        povLogger.error({ err: error, phaseId: phase.id }, 'failed to delete empty phase');
      }
    }
  }
  
  if (missingTemplateIds.length === 0) {
    povLogger.debug({ povId }, 'no missing templates, all phases exist with stages and tasks');
    return;
  }
  
  // Import the phaseTemplateService
  const { phaseTemplateService } = await import('@/lib/pov/services/phaseTemplate');
  
  // Create phases for missing templates
  for (const templateId of missingTemplateIds) {
    try {
      // ✅ Q1 2026 Performance: Parallelize independent lookups (50% faster)
      const [template, pov] = await Promise.all([
        prisma.phaseTemplate.findUnique({ where: { id: templateId } }),
        prisma.pOV.findUnique({ where: { id: povId } })
      ]);

      if (!template) {
        povLogger.error({ templateId }, 'phase template not found');
        continue;
      }

      if (!pov) {
        povLogger.error({ povId }, 'POV not found during phase template sync');
        continue;
      }
      
      // Get POV start and end dates
      const povStartDateObj = new Date(pov.startDate);
      const povEndDateObj = new Date(pov.endDate);

      // Calculate phaseStartDate: POV start date + 1 day
      const phaseStartDate = new Date(povStartDateObj);
      phaseStartDate.setDate(povStartDateObj.getDate() + 1);

      // Check if phase can even start if POV ends too soon or startDate is invalid
      if (isNaN(phaseStartDate.getTime()) || phaseStartDate > povEndDateObj) {
        povLogger.warn({ templateId, templateName: template.name, povEnd: povEndDateObj.toISOString(), phaseStart: phaseStartDate.toISOString() }, 'phase cannot be created: POV timeline too short or invalid start date');
        continue; // Skip creating this phase
      }

      // Calculate phaseEndDate: phaseStartDate + 14 days, capped by povEndDateObj
      const defaultPhaseDurationMs = 14 * 24 * 60 * 60 * 1000;
      let phaseEndDate = new Date(phaseStartDate.getTime() + defaultPhaseDurationMs);

      if (phaseEndDate > povEndDateObj) {
        phaseEndDate = new Date(povEndDateObj); // Cap at POV end date
      }

      // Ensure phaseEndDate is not before phaseStartDate.
      if (phaseEndDate < phaseStartDate) {
         phaseEndDate = new Date(phaseStartDate);
         phaseEndDate.setHours(23, 59, 59, 999); 
         
         if (phaseEndDate > povEndDateObj) {
            phaseEndDate = new Date(povEndDateObj);
         }
         
         if (phaseStartDate > phaseEndDate) {
            povLogger.error({ templateId, templateName: template.name, phaseStart: phaseStartDate.toISOString(), phaseEnd: phaseEndDate.toISOString() }, 'phase has invalid date range after adjustments, skipping');
            continue;
         }
         povLogger.warn({ templateId, templateName: template.name, phaseStart: phaseStartDate.toISOString(), phaseEnd: phaseEndDate.toISOString() }, 'phase duration less than 1 day due to POV end date constraints');
      }
      
      povLogger.debug({ povId: pov.id, templateId: template.id, templateName: template.name, phaseStart: phaseStartDate.toISOString(), phaseEnd: phaseEndDate.toISOString() }, 'creating phase from template');
      
      // Template workflow logged only on error
      
      // Create the phase from the template
      const newPhase = await phaseTemplateService.createPhaseFromTemplate({
        povId,
        templateId,
        name: template.name,
        description: template.description || '',
        startDate: phaseStartDate,
        endDate: phaseEndDate,
        type: template.type
      });
      
      // Verify that stages and tasks were created
      if (newPhase) {
        // ✅ Q1 2026 Performance: Parallelize independent count queries (40-50% faster)
        const [stagesCount, tasksCount] = await Promise.all([
          prisma.stage.count({ where: { phaseId: newPhase.id } }),
          prisma.task.count({ where: { phaseId: newPhase.id } })
        ]);

        povLogger.info({ phaseId: newPhase.id, stagesCount, tasksCount }, 'created phase from template');

        // If no stages were created, try to create them manually
        if (stagesCount === 0) {
          povLogger.warn({ phaseId: newPhase.id, templateId }, 'no stages created for phase, attempting manual creation');
          
          // Fetch the template again to ensure we have the latest data
          const freshTemplate = await prisma.phaseTemplate.findUnique({
            where: { id: templateId }
          });
          
          if (!freshTemplate) {
            povLogger.error({ templateId }, 'template not found during manual stage creation');
            continue;
          }
          
          // Fresh template workflow logged only on error
          
          // Try to create stages from the template workflow
          try {
            const workflow = typeof freshTemplate.workflow === 'string' 
              ? JSON.parse(freshTemplate.workflow) 
              : freshTemplate.workflow;
            
            if (workflow.stages && Array.isArray(workflow.stages)) {
              povLogger.debug({ stageCount: workflow.stages.length, templateId }, 'found stages in template workflow');
              
              // Import the phaseService
              const { phaseService } = await import('@/lib/pov/services/phase');
              
              // Create stages and tasks
              for (let stageIndex = 0; stageIndex < workflow.stages.length; stageIndex++) {
                const stageData = workflow.stages[stageIndex];
                
                try {
                  // Create the stage
                  const stage = await phaseService.createStage(newPhase.id, {
                    name: stageData.name,
                    description: stageData.description || '',
                    order: stageIndex,
                    status: 'PENDING',
                    metadata: stageData.metadata,
                  });
                  
                  povLogger.debug({ stageId: stage.id }, 'created stage from template workflow');
                  
                  // Create tasks for the stage
                  if (stageData.tasks && Array.isArray(stageData.tasks)) {
                    povLogger.debug({ taskCount: stageData.tasks.length, stageName: stageData.name }, 'creating tasks for stage');
                    
                    for (let taskIndex = 0; taskIndex < stageData.tasks.length; taskIndex++) {
                      const taskData = stageData.tasks[taskIndex];
                      
                      try {
                        // Create a fallback name if the task name is missing
                        const taskTitle = taskData.title || taskData.name || `Task ${taskIndex + 1}`;
                        
                        // Log a warning if the title is missing
                        if (!taskData.title && !taskData.name) {
                          povLogger.warn({ taskIndex: taskIndex + 1, stageName: stageData.name, fallbackTitle: taskTitle }, 'task missing title field, using fallback');
                        } else if (!taskData.title && taskData.name) {
                          povLogger.warn({ taskIndex: taskIndex + 1, stageName: stageData.name }, 'task using deprecated name field instead of title');
                        }
                        
                        const task = await phaseService.createTask(stage.id, {
                          title: taskTitle, // Use the fallback title if original is missing
                          description: taskData.description || `Task ${taskIndex + 1} in ${stageData.name} stage`,
                          priority: taskData.priority || "MEDIUM",
                          metadata: {
                            ...taskData.metadata,
                            type: taskData.type || "task",
                            dependencies: taskData.dependencies || [],
                          },
                        });
                        
                        povLogger.debug({ taskId: task.id }, 'created task from template');
                      } catch (taskError) {
                        povLogger.error({ err: taskError, taskTitle: taskData.title || taskData.name || 'unnamed' }, 'failed to create task from template');
                      }
                    }
                  }
                } catch (stageError) {
                  povLogger.error({ err: stageError, stageName: stageData.name }, 'failed to create stage from template');
                }
              }
            }
          } catch (workflowError) {
            povLogger.error({ err: workflowError, templateId }, 'failed to parse or process template workflow');
          }
        }
      } else {
        povLogger.error({ templateId, povId }, 'failed to create phase from template');
      }
      
    } catch (error) {
      povLogger.error({ err: error, templateId, povId }, 'error creating phase from template');
    }
  }
}

// Centralized validation schema (see lib/validation/pov.ts). Alias kept
// for readability at the call site; safe to inline if/when refactored.
const UpdatePOVSchema = UpdatePOVSchemaComprehensive;
/* DEAD CODE REMOVED 2026-05-14:
   A 95-line "/* UpdatePOVSchemaInline = z.object({...}) *\/" block sat
   here as documentation of the schema before it was extracted to
   lib/validation/pov.ts. On 2026-05-13, three fix attempts (5a8ae62b,
   2543ef1b) edited fields INSIDE this comment, achieving nothing.
   Removed to prevent future fooling.
   See: lib/validation/pov.ts UpdatePOVSchemaComprehensive (line 14 import). */

export async function updatePoVHandler(
  request: NextRequest,
  { params, user, pov: providedPov }: { params: { povId: string }, user?: any, pov?: any }
) {
  try {
    const { povId } = params
    povLogger.info({ povId }, 'updating POV');

    // ✅ If user and pov provided by withPOVAccess, auth already done
    let authUser = user;
    let existingPov = providedPov;

    // ✅ Fallback: manual auth (for backward compatibility)
    if (!authUser || !existingPov) {
      authUser = await getAuthUser(request);
      if (!authUser) {
        return Response.json({
          error: 'Unauthorized'
        }, { status: 401 });
      }

      // Fetch POV to validate access
      existingPov = await prisma.pOV.findUnique({
        where: { id: povId },
        select: {
          id: true,
          ownerId: true,
          status: true, // BC43 FIX: Need current status for transition validation
          metadata: true,
          team: {
            select: {
              members: {
                select: {
                  userId: true,
                  user: { select: { id: true } }
                }
              }
            }
          }
        }
      });

      if (!existingPov) {
        return Response.json({
          error: 'POV not found'
        }, { status: 404 });
      }

      const hasAccess = validatePOVAccess(authUser, existingPov, { requireWrite: true });  // 2026-05-26 demo-write fix
      if (!hasAccess) {
        return Response.json({
          error: 'Forbidden - No access to this POV'
        }, { status: 403 });
      }
    } else {
      povLogger.debug({ povId }, 'using pre-validated auth context');
    }

    const requestData = await request.json()

    // ✅ 3. Validation
    // 2026-05-14 P1: migrated from .parse() (throws into try/catch) to
    // .safeParse() — matches the convention used by 119 other callers in
    // the codebase, removes the only .parse() anti-pattern still in handler
    // paths (api-efficiency audit #6, 2026-05-14).
    const validation = UpdatePOVSchema.safeParse(requestData);
    if (!validation.success) {
      // 2026-08-16 error-surface fix. A live 400 read only:
      //   "stages: Array must contain at most 50 element(s)"
      // — which never says how many were SENT. The operator could not tell whether
      // they had just added something or the POV had been over the limit for weeks,
      // and there was NO server-side trace at all (checked pm2 logs and journald,
      // both empty), so it could only be diagnosed from a pasted browser payload.
      //
      // Two fixes: attach the actual count to array-cap failures, and log the
      // rejection. Protocol 10 — both are FACTS. Deliberately NOT emitting a
      // remediation ("delete old stages"): for that incident the correct action was
      // to RAISE the cap, so a confident instruction would have been wrong.
      const details = validation.error.errors.map(e => {
        const field = e.path.join('.');
        // Resolve the offending value from the raw payload to report its real size.
        const actual = e.path.reduce<any>(
          (acc, k) => (acc === null || acc === undefined ? acc : acc[k as any]),
          requestData
        );
        if (e.code === 'too_big' && Array.isArray(actual)) {
          return {
            field,
            message: `${e.message} — this request sent ${actual.length}.`,
            received: actual.length,
            limit: typeof e.maximum === 'number' ? e.maximum : Number(e.maximum),
          };
        }
        return { field, message: e.message };
      });

      povLogger.warn(
        {
          povId,
          userId: user?.id,
          issues: details.map(d => ({
            field: d.field,
            received: (d as any).received,
            limit: (d as any).limit,
          })),
        },
        'POV update rejected by schema validation'
      );

      return Response.json({ error: 'Validation failed', details }, { status: 400 });
    }
    const validated = validation.data;

    // 2026-05-14 BC76 site #7 — ERADICATED. Schema at
    // lib/validation/pov.ts:184-235 now declares every field the nested
    // loops read; reads below swap from raw `requestData.X` to
    // `validated.X`. See cline_docs/reviews/partial-bc76-put-handler-2026-05-14/
    // for the 4-specialist review + Phase 0 production validation that
    // drove the atomic scope.

    // BC43 FIX: Validate status transition if status is being changed
    if (validated.status && existingPov?.status && validated.status !== existingPov.status) {
      const { statusService } = await import('@/lib/pov/services/status');
      const transitionResult = await statusService.validateTransition(povId, validated.status as any);
      if (!transitionResult.valid) {
        return Response.json({
          error: 'Invalid status transition',
          details: transitionResult.errors
        }, { status: 400 });
      }
    }

    // Extract teamMembers from the validated data.
    // The remaining `as any` lives at the Prisma boundary only — Zod's
    // inferred type widens jsonb / nested unions in ways Prisma.POVUpdateInput
    // doesn't accept directly. Documented narrowing, not validation bypass.
    const { teamMembers, ...povData } = validated as any;

    // Log counts only (no PII/data exposure)
    const taskCount = validated.tasks?.length || 0;
    const stageCount = validated.stages?.length || 0;
    const teamCount = teamMembers?.length || 0;
    povLogger.info({ povId, taskCount, stageCount, teamCount }, 'processing POV update payload');

    // Handle country and region IDs correctly for Prisma
    if (povData.countryId && !povData.country) {
      povData.country = {
        connect: { id: povData.countryId }
      };
      delete povData.countryId;
    }

    if (povData.regionId && !povData.region) {
      povData.region = {
        connect: { id: povData.regionId }
      };
      delete povData.regionId;
    }
    
  // Handle nested objects correctly for Prisma
  const nestedObjects = [
    'owner', 'team', 'phases', 'milestones', 'kpis', 'launch', 
    'syncHistory', 'workflows', 'tasks', 'stages'
    // We need to filter out tasks and stages from the POV update data
    // They will be processed separately in the transaction
  ];
  
  // Create a clean data object for Prisma
  const cleanPovData: any = {};
  
  povLogger.debug({ povId, status: povData.status }, 'status from request payload');

  // Define a list of known fields that are not direct scalar properties of POV
  // or are handled separately (like team members via teamMembers array, or relations via connect objects).
  const nonScalarOrHandledFields = [
    'countryId', 'regionId', // Handled by connect objects
    'projectManager', 'salesEngineers', 'technicalTeam', // Derived from teamMembers or for client state
    'teamMembers', // Destructured and handled separately
    'team', // This is a relation, handled by teamId or connect if needed, but povData.team is an array of user objects in the log
    'phases', 'milestones', 'kpis', 'launch', 'syncHistory', 'workflows', 'tasks', 'stages', // These are relations
    'fields', 'sections', // Likely for POV Templates or custom UI, not direct POV model fields
    'phaseTemplateIds', // Handled via metadata or separate relation
    'id', // 'id' is used in 'where' for update, not in 'data'
    'teamName', // Not a direct POV scalar field
    'replaceTeamMembers', // Custom flag for team members handling
    // F5 (2026-07-25): CONTROL FLAG, not a column. Declaring deleteMissing on the schema (required
    // — an undeclared field is stripped and could never reach the handler) made it flow into this
    // spread and reach prisma.pOV.update(), which rejected it: "Unknown argument `deleteMissing`".
    // Found by live probe: the default path was unaffected (the flag is simply absent), so ONLY the
    // opt-in branch 500'd — the failure direction was safe, but the escape hatch was broken.
    // Same class as replaceTeamMembers directly above: any request-level flag added here must also
    // be excluded here. Pinned by test-completion-core-boundary.
    'deleteMissing',
    'deletedPhaseIds', // Bug Class 81 #5 (2026-08-19): explicit phase-deletion list — same control-flag class as deleteMissing
    'ownerId', // BC29 MASS ASSIGNMENT FIX: Prevent ownership reassignment via .passthrough()
    'owner', // Relation — must not be set via direct update
    'teamId', // Relation — must not be reassigned via direct update
    'createdAt', 'updatedAt', // Timestamps — managed by Prisma
  ];

  // Copy scalar properties
  Object.keys(povData).forEach(key => {
    // Skip if key is in nestedObjects (relations handled by Prisma's nested writes if applicable, or ignored if not)
    // Skip if key is in nonScalarOrHandledFields
    // Skip if key is 'country' or 'region' (as these are the connect objects themselves)
    if (nestedObjects.includes(key) || nonScalarOrHandledFields.includes(key) || key === 'country' || key === 'region') {
      return;
    }
    
    // Include the field if it's a direct scalar property
    cleanPovData[key] = povData[key];
  });

  povLogger.debug({ povId, fields: Object.keys(cleanPovData), status: cleanPovData.status }, 'clean POV data prepared for update');

  // Add the country and region connect objects if they exist
  if (povData.country) {
    cleanPovData.country = povData.country;
  }
  
  if (povData.region) {
    cleanPovData.region = povData.region;
  }
  
  // 2026-05-27 (pentest MA-1): reserved metadata keys (isDemo gates demo-pool
  // visibility) must be admin/system-controlled — never settable by a non-admin via
  // metadata mass-assignment. For non-admins, force reserved keys to the POV's
  // existing value (read fresh, since the withPOVAccess-provided pov may omit metadata).
  if (cleanPovData.metadata !== undefined) {
    const isAdmin = authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN';
    if (!isAdmin) {
      const current = await prisma.pOV.findUnique({ where: { id: povId }, select: { metadata: true } });
      cleanPovData.metadata = sanitizePovMetadata(cleanPovData.metadata, {
        isAdmin,
        existing: current?.metadata as Record<string, unknown> | null | undefined,
      });
    }
  }

  povLogger.debug({ povId, hasPhases: !!cleanPovData.phases, hasStages: !!cleanPovData.stages, hasTasks: !!cleanPovData.tasks }, 'clean POV data relation check');

    // Phase 2 stage_activities (2026-04-26): captured per-stage diffs for
    // post-tx fire-and-forget logging. Hoisted above the tx so post-tx code
    // can iterate after commit. Mutation-via-push is safe across the closure
    // boundary (TS narrowing only fights against let-reassignment).
    const stageUpdateDiffs: Array<{
      stageId: string;
      before: { name: string | null; description: string | null; status: string; order: number };
      after: { name: string | null; description: string | null; status: string; order: number };
    }> = [];

    // Use a transaction to ensure atomic operations
    const pov = await prisma.$transaction(async (tx) => {
      // Update the POV with the clean data
      const updatedPov = await povService.update(povId, cleanPovData);
      
      if (!updatedPov) {
        throw new Error(`Failed to update POV with ID: ${povId}`);
      }
      
      // Use the POV ID for phase sync operations
      const povIdForPhaseSync = updatedPov.id;
      
      // Process tasks if they are included in the request
      if (validated.tasks && Array.isArray(validated.tasks)) {
        povLogger.debug({ povId, taskCount: validated.tasks.length }, 'processing tasks in transaction');
        
        // 🔧 FIX: Delete tasks that are no longer in the request (were deleted in UI)
        const requestTaskIds = validated.tasks
          .map((task: any) => task.id)
          .filter((id: any) => id && !id.startsWith('temp-')); // Only real IDs, not temp ones

        // Find tasks in the database for this POV that are not in the request
        // (status + type: read for the P1-C2 nested-write guards below)
        const existingTasks = await tx.task.findMany({
          where: { povId: povIdForPhaseSync },
          select: { id: true, title: true, status: true, type: true, metadata: true },
          take: 500
        });
        const existingTaskById = new Map(existingTasks.map(t => [t.id, t]));

        // F5 (2026-07-25): delete-by-omission is now OPT-IN. Previously ANY caller sending a
        // partial task array silently destroyed every task it omitted — no confirmation, no
        // soft-delete. Default-false is safe for existing callers because the POV editor deletes
        // tasks with an explicit DELETE /api/tasks/{id} (PhasesSection.handleDeleteTask) and only
        // then drops them from local state; omission was never its deletion mechanism.
        const deleteMissing = validated.deleteMissing === true;
        const tasksToDelete = deleteMissing
          ? existingTasks.filter(dbTask => !requestTaskIds.includes(dbTask.id))
          : [];

        if (!deleteMissing) {
          const wouldHaveDeleted = existingTasks.filter(dbTask => !requestTaskIds.includes(dbTask.id));
          if (wouldHaveDeleted.length > 0) {
            // A FACT, not a verdict (Protocol 10): we state what we did NOT do and why, so a
            // caller that genuinely wanted the old behaviour can find the flag. Logged rather
            // than returned, because omitting tasks is legitimate for a partial update.
            povLogger.info(
              { povId, omittedTaskCount: wouldHaveDeleted.length },
              'POV save omitted existing tasks; they were PRESERVED (pass deleteMissing:true to delete them)'
            );
          }
        }

        if (tasksToDelete.length > 0) {
          povLogger.info({ povId, count: tasksToDelete.length, deleteMissing: true }, 'deleting tasks absent from the request (deleteMissing opt-in)');

          for (const taskToDelete of tasksToDelete) {
            await tx.task.delete({ where: { id: taskToDelete.id } });
          }
        }
        
        // Update or create tasks
        for (const task of validated.tasks) {
          if (task.id && !task.id.startsWith('temp-')) {
            // Prepare task metadata with modelParameters
            const taskMetadata = task.metadata || {};
            
            // FIXED: Handle modelParameters properly (including null for clearing)
            if (task.modelParameters !== undefined) {
              if (task.modelParameters === null) {
                // Remove modelParameters from metadata when null
                delete taskMetadata.modelParameters;
              } else {
                taskMetadata.modelParameters = task.modelParameters;
              }
            }

            // FIXED: Handle mcpConfiguration clearing properly
            if (task.metadata && task.metadata.hasOwnProperty('mcpConfiguration')) {
              if (task.metadata.mcpConfiguration === undefined || task.metadata.mcpConfiguration === null) {
                // Remove mcpConfiguration from metadata
                delete taskMetadata.mcpConfiguration;
              } else {
                taskMetadata.mcpConfiguration = task.metadata.mcpConfiguration;
              }
            }
            
            // Completion-path unification P1-C2 (path 9 + SYNTHESIS §1.9):
            // - the audit fact completedWithDependencyOverride is guard-written only — strip
            //   a forged inbound copy;
            // - terminal status via nested POV save is PERMANENTLY rejected (complete tasks
            //   via the task routes / MCP task.complete — this bulk-save surface fires no
            //   guards' cascade and is the wrong place for a terminal transition);
            // - non-terminal status changes go through the state machine.
            stripAuditFacts(taskMetadata);
            const existingRow = existingTaskById.get(task.id);
            // WS2 Phase A (2026-08-17, D3.2 + F5 exception): platform stamp keys — an equal echo
            // (this surface round-trips whole task entities) is dropped silently; a DIFFERING
            // value is STRIPPED WITH WARN here rather than 400 (Steve-approved: bulk-save callers
            // cannot omit fields they never set; same PROTOCOL_STAMP_IMMUTABLE code as the 400s
            // so the greps stay unified).
            enforceProtocolStampImmutable(
              taskMetadata,
              (existingRow?.metadata as Record<string, unknown> | null) ?? null,
              task.id,
              { surface: 'pov-bulk-save', onViolation: 'strip-warn', warn: (f, m) => povLogger.warn(f, m) }
            );
            // Platform-run-keys panel 2026-08-19: THE live exposure site — the POV wholesale
            // save round-trips every task's form-load-time metadata snapshot (denormalizer),
            // so any run key that changed mid-run would be silently reverted here (verified:
            // a stale pipelineStageId kills the retrigger reactor's lookup). Drop-always;
            // warn only on structural differ (the routine echo is silent).
            dropPlatformRunKeys(
              taskMetadata,
              (existingRow?.metadata as Record<string, unknown> | null) ?? null,
              task.id,
              { surface: 'pov-bulk-save', warn: (f, m) => povLogger.warn(f, m) }
            );
            if (existingRow && task.status && task.status !== existingRow.status) {
              if (task.status === 'COMPLETED') {
                throw new Error(
                  `Task "${existingRow.title}" cannot be completed via the POV save. ` +
                  `Complete tasks individually (task view / MCP task.complete) so completion ` +
                  `guards and dependency cascades apply.`
                );
              }
              validateTaskStatusTransition(existingRow.status, task.status);
            }

            // FIXED: Properly handle null values for agent fields
            const updateData: any = {
              title: task.title,
              description: task.description,
              // F2 (2026-07-25): omit an UNCHANGED status. The POV editor's save round-trips the
              // WHOLE task entity, so every save re-sent each task's current status — and
              // taskCompletedAtExtension stamps completedAt=now on any payload containing
              // status:'COMPLETED' (it runs at the write and cannot see the prior status). One
              // POV save therefore moved completedAt forward on EVERY completed task in the POV,
              // erasing the real completion times the column exists to hold. Only the
              // known-unchanged case is dropped; if the pre-image is missing we keep the old
              // behaviour rather than guess. Terminal transitions are rejected above regardless.
              ...(existingRow && task.status === existingRow.status ? {} : { status: task.status }),
              priority: task.priority,
              type: task.type,
              dueDate: task.dueDate,
              order: task.order,
              // WS2 Phase A (2026-08-17): MERGE over the stored row, never wholesale replace —
              // this was the mass-erasure surface (one POV save from a client that does not
              // round-trip metadata silently de-programmed every task in the POV). Omission now
              // means "don't touch"; the stamp guard above already removed/verified the
              // platform keys from the incoming copy.
              metadata: { ...((existingRow?.metadata as Record<string, unknown> | null) ?? {}), ...taskMetadata },
              // Don't update phaseId or stageId to avoid moving tasks between phases/stages
            };

            // CRITICAL FIX: Explicitly handle null values for agent fields
            // When task.agentRole is null, we want to clear it in the database
            updateData.agentRole = task.agentRole === null ? null : task.agentRole;
            updateData.prompt = task.prompt === null ? null : task.prompt;
            updateData.inputContext = task.inputContext === null ? null : task.inputContext;
            updateData.maxRetries = task.maxRetries === null ? null : task.maxRetries;
            updateData.timeout = task.timeout === null ? null : task.timeout;
            // P1-C2 (§1.9): executionStatus is ENGINE-owned (F16/F20 terminal-family fact; the
            // reactor predicates read it) — client-supplied values are NEVER persisted here.
            // This restores the engine's single-writer invariant.
            // F-artifacts (2026-07-25): agentLog and outputArtifacts are ENGINE-owned and are NOT
            // persisted from client input. outputArtifacts is EVIDENCE on the deliverable path —
            // resourceManager registers MCP artifact RESOURCES from it when agent_artifacts is
            // empty, and agent-results reads it as LLM output — with no provenance marker
            // separating engine-written from client-written entries, so a forged entry is
            // indistinguishable after the fact (a fabricated FACT, Protocol 10). agentLog is
            // narrative provenance. Neither has a GUI editing affordance; the POV editor merely
            // round-trips them in its whole-entity save.
            //
            // OMITTED, never written-as-null — writing null is what the BC76 read-swap regression
            // did to 164 rows, and 272 prod rows carry outputArtifacts. Same shape as the §1.9
            // executionStatus strip: the schema still ACCEPTS the fields (so the editor's save
            // still parses), the handler simply declines to persist them.
            // FIXED: Add missing agentTemplateId field
            updateData.agentTemplateId = task.agentTemplateId === null ? null : task.agentTemplateId;

            // Update existing task with all agent-related fields
            await tx.task.update({
              where: { id: task.id },
              data: updateData
            });
          } else if (task.id && task.id.startsWith('temp-') && task.phaseId && task.stageId) {
            // Create new task for temporary ID
            const taskMetadata = task.metadata || {};
            if (task.modelParameters) {
              taskMetadata.modelParameters = task.modelParameters;
            }

            // FIXED: Handle mcpConfiguration clearing properly for new tasks
            if (task.metadata && task.metadata.hasOwnProperty('mcpConfiguration')) {
              if (task.metadata.mcpConfiguration === undefined || task.metadata.mcpConfiguration === null) {
                delete taskMetadata.mcpConfiguration;
              } else {
                taskMetadata.mcpConfiguration = task.metadata.mcpConfiguration;
              }
            }

            // P1-C2: audit-fact strip + born-COMPLETED PIPELINE reject (anti-fabrication —
            // creation is invisible to a transition guard; D1: other types accepted).
            stripAuditFacts(taskMetadata);
            // WS2 Phase A: a task must not be BORN with a forged protocol stamp (create-forgery
            // channel, panel B1b/B-3) — the platform stamps at first execution.
            enforceProtocolStampImmutable(taskMetadata, null, task.id ?? '(new)', {
              surface: 'pov-bulk-create', onViolation: 'strip-warn', warn: (f, m) => povLogger.warn(f, m),
            });
            // Platform-run-keys panel 2026-08-19: birth-forgery closure — a task must not be
            // BORN with qualityGate/pipelineStageId/etc (existing=null ⇒ any present run key
            // differs ⇒ one warn, then dropped).
            dropPlatformRunKeys(taskMetadata, null, task.id ?? '(new)', {
              surface: 'pov-bulk-create', warn: (f, m) => povLogger.warn(f, m),
            });
            if (task.type === 'PIPELINE' && task.status === 'COMPLETED') {
              throw new Error('PIPELINE tasks cannot be created already COMPLETED (anti-fabrication invariant).');
            }

            const newTask = await tx.task.create({
              data: {
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                type: task.type,
                dueDate: task.dueDate,
                order: task.order,
                povId: povIdForPhaseSync, // CRITICAL: Field leakage fix - set from URL param
                phaseId: task.phaseId,
                stageId: task.stageId,
                // Agent-related fields
                agentRole: task.agentRole,
                prompt: task.prompt,
                inputContext: task.inputContext,
                maxRetries: task.maxRetries,
                timeout: task.timeout,
                // P1-C2 (§1.9): executionStatus is engine-owned — never client-persisted
                // F-artifacts (2026-07-25): engine-owned — never client-persisted, not even at
                // creation. A task cannot legitimately be BORN with agent output.
                // FIXED: Add missing agentTemplateId field for new tasks
                agentTemplateId: task.agentTemplateId,
                // Store modelParameters in metadata
                metadata: taskMetadata,
                // Set assignee if provided
                assigneeId: task.assigneeId,
              }
            });
          } else if (!task.id && task.phaseId && task.stageId) {
            // Create new task without any ID
            const taskMetadata = task.metadata || {};
            if (task.modelParameters) {
              taskMetadata.modelParameters = task.modelParameters;
            }

            // FIXED: Handle mcpConfiguration clearing properly for new tasks without ID
            if (task.metadata && task.metadata.hasOwnProperty('mcpConfiguration')) {
              if (task.metadata.mcpConfiguration === undefined || task.metadata.mcpConfiguration === null) {
                delete taskMetadata.mcpConfiguration;
              } else {
                taskMetadata.mcpConfiguration = task.metadata.mcpConfiguration;
              }
            }

            // P1-C2: audit-fact strip + born-COMPLETED PIPELINE reject (see branch above).
            stripAuditFacts(taskMetadata);
            // WS2 Phase A: a task must not be BORN with a forged protocol stamp (create-forgery
            // channel, panel B1b/B-3) — the platform stamps at first execution.
            enforceProtocolStampImmutable(taskMetadata, null, task.id ?? '(new)', {
              surface: 'pov-bulk-create', onViolation: 'strip-warn', warn: (f, m) => povLogger.warn(f, m),
            });
            // Platform-run-keys panel 2026-08-19: birth-forgery closure — a task must not be
            // BORN with qualityGate/pipelineStageId/etc (existing=null ⇒ any present run key
            // differs ⇒ one warn, then dropped).
            dropPlatformRunKeys(taskMetadata, null, task.id ?? '(new)', {
              surface: 'pov-bulk-create', warn: (f, m) => povLogger.warn(f, m),
            });
            if (task.type === 'PIPELINE' && task.status === 'COMPLETED') {
              throw new Error('PIPELINE tasks cannot be created already COMPLETED (anti-fabrication invariant).');
            }

            const newTask = await tx.task.create({
              data: {
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                type: task.type,
                dueDate: task.dueDate,
                order: task.order,
                povId: povIdForPhaseSync, // CRITICAL: Field leakage fix - set from URL param
                phaseId: task.phaseId,
                stageId: task.stageId,
                // Agent-related fields
                agentRole: task.agentRole,
                prompt: task.prompt,
                inputContext: task.inputContext,
                maxRetries: task.maxRetries,
                timeout: task.timeout,
                // P1-C2 (§1.9): executionStatus is engine-owned — never client-persisted
                // F-artifacts (2026-07-25): engine-owned — never client-persisted, not even at
                // creation. A task cannot legitimately be BORN with agent output.
                // FIXED: Add missing agentTemplateId field for new tasks without ID
                agentTemplateId: task.agentTemplateId,
                // Store modelParameters in metadata
                metadata: taskMetadata,
                // Set assignee if provided
                assigneeId: task.assigneeId,
              }
            });
          }
        }
      }
      
      // Process stages if they are included in the request
      if (validated.stages && Array.isArray(validated.stages)) {
        povLogger.debug({ povId, stageCount: validated.stages.length }, 'processing stages in transaction');
        
        // 🔧 FIX: Delete stages that are no longer in the request (were deleted in UI)
        const requestStageIds = validated.stages
          .map((stage: any) => stage.id)
          .filter((id: any) => id && !id.startsWith('temp-')); // Only real IDs, not temp ones
        
        // F5-parity for STAGES (2026-08-19, delete-by-omission class — the registry's
        // "lossy client projection" entry): stage delete-by-omission is now OPT-IN via the
        // same deleteMissing flag F5 added for tasks. Previously ANY wholesale save deleted
        // every stage absent from the payload — including stages the HARNESS created after
        // page load (a GUI save during a program run deleted the run's stages, orphaning its
        // pipeline tasks via Task.stageId onDelete:SetNull and breaking stage-sibling
        // reactors). Default-false is safe: the POV editor deletes stages via the explicit
        // DELETE /api/pov/{povId}/phase/{phaseId}/stage endpoint (PhasesSection.tsx
        // handleDeleteStage) — omission was never its deletion mechanism — and MCP
        // pov.update does not send stages at all. The old else-branch ("no stages in
        // request → delete ALL stages") is subsumed: requestStageIds=[] under
        // deleteMissing:true deletes all, under default preserves all.
        const deleteMissingStages = validated.deleteMissing === true;
        const existingStages = await tx.stage.findMany({
          where: {
            phase: { povId: povIdForPhaseSync }
          },
          select: { id: true, name: true },
          take: 200
        });
        const stagesToDelete = deleteMissingStages
          ? existingStages.filter(dbStage => !requestStageIds.includes(dbStage.id))
          : [];

        if (!deleteMissingStages) {
          const wouldHaveDeleted = existingStages.filter(dbStage => !requestStageIds.includes(dbStage.id));
          if (wouldHaveDeleted.length > 0) {
            // A FACT, not a verdict (Protocol 10) — same shape as the F5 task log.
            povLogger.info(
              { povId, omittedStageCount: wouldHaveDeleted.length },
              'POV save omitted existing stages; they were PRESERVED (pass deleteMissing:true to delete them)'
            );
          }
        }

        if (stagesToDelete.length > 0) {
          povLogger.info({ povId, count: stagesToDelete.length, deleteMissing: true }, 'deleting stages absent from the request (deleteMissing opt-in)');
          for (const stageToDelete of stagesToDelete) {
            await tx.stage.delete({ where: { id: stageToDelete.id } });
          }
        }
        
        // Track max order per phase for calculating next order (1000 increment pattern)
        const phaseMaxOrder: Record<string, number> = {};
        const getNextOrder = async (phaseId: string): Promise<number> => {
          if (phaseMaxOrder[phaseId] === undefined) {
            // Get max order from existing stages in this phase
            const maxStage = await tx.stage.findFirst({
              where: { phaseId },
              orderBy: { order: 'desc' },
              select: { order: true }
            });
            phaseMaxOrder[phaseId] = maxStage?.order ?? 0;
          }
          phaseMaxOrder[phaseId] += 1000;
          return phaseMaxOrder[phaseId];
        };

        // Update or create stages
        for (const stage of validated.stages) {
          if (stage.id && !stage.id.startsWith('temp-')) {
            // Capture pre-update state for stage_activities forensic record.
            const beforeStage = await tx.stage.findUnique({
              where: { id: stage.id },
              select: { name: true, description: true, status: true, order: true },
            });

            // Update existing stage with real ID
            await tx.stage.update({
              where: { id: stage.id },
              data: {
                name: stage.name,
                description: stage.description,
                status: stage.status,
                order: stage.order,
                // Don't update phaseId to avoid moving stages between phases
              }
            });
            povLogger.debug({ stageId: stage.id }, 'updated stage in transaction');

            if (beforeStage) {
              stageUpdateDiffs.push({
                stageId: stage.id,
                before: beforeStage,
                after: {
                  name: stage.name ?? beforeStage.name,
                  description: stage.description ?? beforeStage.description,
                  status: stage.status ?? beforeStage.status,
                  order: stage.order ?? beforeStage.order,
                },
              });
            }
          } else if (stage.id && stage.id.startsWith('temp-') && stage.phaseId) {
            // FIXED: Create new stage for temporary ID
            const newStage = await tx.stage.create({
              data: {
                name: stage.name,
                description: stage.description,
                status: stage.status || 'PENDING',
                order: stage.order || await getNextOrder(stage.phaseId),  // Use 1000 increment pattern
                phaseId: stage.phaseId
              }
            });
            povLogger.debug({ newStageId: newStage.id, tempId: stage.id, phaseId: stage.phaseId }, 'created stage from temp ID');
          } else if (!stage.id && stage.phaseId) {
            // New stage (no ID from client): Create it
            const newStage = await tx.stage.create({
              data: {
                name: stage.name,
                description: stage.description,
                status: stage.status || 'PENDING',
                order: stage.order || await getNextOrder(stage.phaseId),  // Use 1000 increment pattern
                phaseId: stage.phaseId
              }
            });
            povLogger.debug({ newStageId: newStage.id, phaseId: stage.phaseId }, 'created new stage');
          }
        }
      }
      
      // Process phases: sync with payload (update existing, delete missing, create new)
      // Get current phase IDs from DB for this POV
      const existingDbPhases = await tx.phase.findMany({
        where: { povId: povIdForPhaseSync },
        select: { id: true },
        take: 50
      });
      const existingDbPhaseIds = existingDbPhases.map(p => p.id);

      // Cast validated.phases to use the imported type
      const phasesFromPayload = validated.phases as PhasePayloadItem[] | undefined | null;

      let payloadPhaseIds: string[] = [];
      if (phasesFromPayload && Array.isArray(phasesFromPayload)) {
        payloadPhaseIds = phasesFromPayload.map((p: PhasePayloadItem) => p.id).filter((id): id is string => !!id);
        
        povLogger.debug({ povId, payloadPhaseCount: phasesFromPayload.length }, 'synchronizing phases from payload');

        // Bug Class 81 site #5 fix (2026-08-19): phases are deleted ONLY from the explicit
        // deletedPhaseIds list — never inferred from payload omission. The old omission-diff
        // treated the client's page-load snapshot as the source of truth, deleting any phase
        // created concurrently (Stage.phase onDelete:Cascade took its stages too). The GUI now
        // tracks removals in ui.deletedPhaseIds (reducer chokepoint) and sends them here.
        // Membership-verified against THIS POV's phases so a stray id cannot delete cross-POV.
        const requestedPhaseDeletes = (validated.deletedPhaseIds ?? []).filter(
          (id: string) => existingDbPhaseIds.includes(id)
        );
        const omittedPhases = existingDbPhaseIds.filter(dbId =>
          !phasesFromPayload.some((p: PhasePayloadItem) => p.id === dbId) &&
          !requestedPhaseDeletes.includes(dbId)
        );
        if (omittedPhases.length > 0) {
          // A FACT, not a verdict (Protocol 10) — same shape as the F5 task/stage logs.
          povLogger.info(
            { povId, omittedPhaseCount: omittedPhases.length },
            'POV save omitted existing phases; they were PRESERVED (send deletedPhaseIds to delete them)'
          );
        }
        if (requestedPhaseDeletes.length > 0) {
          povLogger.info({ povId, count: requestedPhaseDeletes.length }, 'deleting explicitly-requested phases (deletedPhaseIds)');
          for (const phaseId of requestedPhaseDeletes) {
            // Stage.phase is onDelete:Cascade — stages go with the phase; tasks SetNull.
            await tx.phase.delete({ where: { id: phaseId } });
          }
        }

        // Update or Create phases from payload
        for (const phaseData of phasesFromPayload) { // Use typed iteration variable
          const phaseUpdateData: any = {
            name: phaseData.name,
            description: phaseData.description,
            type: phaseData.type,
            order: phaseData.order,
            povId: povIdForPhaseSync, // Ensure association
            // templateId: phaseData.templateId, // Manage templateId if necessary
            // details: phaseData.details, // Manage details if necessary
          };
          if (phaseData.startDate) phaseUpdateData.startDate = new Date(phaseData.startDate);
          if (phaseData.endDate) phaseUpdateData.endDate = new Date(phaseData.endDate);

          if (phaseData.id && existingDbPhaseIds.includes(phaseData.id)) { 
            // Existing phase: Update it
            await tx.phase.update({
              where: { id: phaseData.id },
              data: phaseUpdateData
            });
            povLogger.debug({ phaseId: phaseData.id }, 'updated phase');
          } else if (!phaseData.id) { 
            // New phase (no ID from client): Create it
            const newPhase = await tx.phase.create({
              data: phaseUpdateData
            });
            povLogger.debug({ newPhaseId: newPhase.id, povId }, 'created new phase');
          }
        }
      } else if (validated.phases === undefined || validated.phases === null) {
        // If 'phases' array is not provided in payload at all, make no changes to existing phases.
        povLogger.debug({ povId }, 'no phases array in payload, existing phases unchanged');
      } else if (validated.phases.length === 0 && existingDbPhaseIds.length > 0) {
        // Bug Class 81 site #5 fix (2026-08-19): an empty phases array NO LONGER means
        // delete-all. Deletion is explicit via deletedPhaseIds only — an empty array from a
        // stale/wiped client state must not destroy every phase (cascading their stages).
        const requestedEmptyCaseDeletes = (validated.deletedPhaseIds ?? []).filter(
          (id: string) => existingDbPhaseIds.includes(id)
        );
        const preservedCount = existingDbPhaseIds.length - requestedEmptyCaseDeletes.length;
        if (preservedCount > 0) {
          povLogger.info(
            { povId: povIdForPhaseSync, preservedCount },
            'empty phases array in payload; existing phases PRESERVED (send deletedPhaseIds to delete them)'
          );
        }
        for (const phaseId of requestedEmptyCaseDeletes) {
          await tx.phase.delete({ where: { id: phaseId } });
        }
      }
      
      // Sync Team Selection dropdowns with TeamMember roles
      // 2026-05-15 (Option B plan File 0): team-management orchestration
      // extracted to lib/pov/services/team.ts:applyTeamUpdate for shared use
      // with the planned MCP pov.update handler. Behavior preserved verbatim
      // (BC65 atomic upsert, replace-or-add semantics, on-demand team creation,
      // TECHNICAL→TECHNICAL_TEAM normalization). One source of truth for the
      // 3-12 sub-writes inside this $transaction.
      const teamResult = await applyTeamUpdate(
        povId,
        {
          projectManager: validated.projectManager,
          salesEngineers: validated.salesEngineers,
          technicalTeam: validated.technicalTeam,
          teamMembers,
          replaceTeamMembers: validated.replaceTeamMembers,
        },
        tx,
      );
      // Sync local POV state (helper may have created a new team).
      if (teamResult.teamId !== updatedPov.teamId) {
        updatedPov.teamId = teamResult.teamId;
      }

      return updatedPov;
    });

    // Members SET via this edit gain POV/task visibility — flush their caches.
    // (The route-level invalidate covers owner + actor + pre-update/removed members;
    // this adds the newly-added members, who weren't in the pre-update team.)
    if (teamMembers?.length) {
      for (const m of teamMembers as Array<{ userId?: string }>) {
        if (m?.userId) {
          povListCache.invalidatePattern(`pov:list:${m.userId}`);
          taskListCache.invalidatePattern(`tasks:${m.userId}`);
        }
      }
    }

    // Phase 2 stage_activities (2026-04-26): post-tx fire-and-forget
    // forensic logging for each stage update captured in the loop above.
    // Per-field diff is emitted only when a value actually changed — keeps
    // activity rows lean for the common name/description-only edits.
    for (const diff of stageUpdateDiffs) {
      const fields: Array<{ name: keyof typeof diff.before; action: typeof TaskActivityAction[keyof typeof TaskActivityAction] }> = [
        { name: 'name', action: TaskActivityAction.UPDATED },
        { name: 'description', action: TaskActivityAction.UPDATED },
        { name: 'status', action: TaskActivityAction.STATUS_CHANGED },
        { name: 'order', action: TaskActivityAction.UPDATED },
      ];
      for (const f of fields) {
        if (diff.before[f.name] !== diff.after[f.name]) {
          logStageFieldChange(
            diff.stageId,
            authUser.userId,
            {
              name: f.name,
              oldValue: diff.before[f.name],
              newValue: diff.after[f.name],
              action: f.action,
            },
            { source: 'API' }
          );
        }
      }
    }

    // The 'pov' variable now holds the result from the transaction,
    // which includes the fully updated POV from povService.update.
    if (!pov) {
      // This case should ideally be handled if updatedPov within the transaction could be null
      // and the transaction itself could return null, though povService.update throws if not found.
      throw new Error(`Failed to get updated POV data from transaction for ID: ${povId}`);
    }
    
    // Tasks and stages are now processed within the transaction
    
    // Check for phase template IDs in the request data
    // Legitimate dual-source exception (per architectural-review 2026-05-14):
    // metadata is `safeRecord()` — declared but permissively typed. This
    // sub-path is request metadata routing, not a validated stored field.
    if (requestData.metadata?.phaseTemplates && Array.isArray(requestData.metadata.phaseTemplates)) {
      povLogger.info({ povId, templateCount: requestData.metadata.phaseTemplates.length }, 'found phase template IDs in metadata');
      
      // Ensure phases are created from templates
      await ensurePhasesFromTemplates(povId, requestData.metadata.phaseTemplates);
    }
    
    // Also check the direct phaseTemplateIds property
    if (validated.phaseTemplateIds && Array.isArray(validated.phaseTemplateIds)) {
      povLogger.info({ povId, templateCount: validated.phaseTemplateIds.length }, 'found phase template IDs in request data');
      
      // Ensure phases are created from templates
      await ensurePhasesFromTemplates(povId, validated.phaseTemplateIds);
    }
    
    // Check if there are phaseTemplateIds in the state data
    // Legitimate dual-source exception: legacy alternate-key form, deeply
    // nested under an undeclared `data` wrapper. Backward compat for older
    // clients; do not promote to declared schema without confirming
    // deprecation timeline.
    if (requestData.data?.phaseTemplateIds && Array.isArray(requestData.data.phaseTemplateIds)) {
      povLogger.info({ povId, templateCount: requestData.data.phaseTemplateIds.length }, 'found phase template IDs in state data');
      
      // Ensure phases are created from templates
      await ensurePhasesFromTemplates(povId, requestData.data.phaseTemplateIds);
    }
    
    // Ensure the response is properly serialized
    const serializedPov = JSON.parse(JSON.stringify(pov));
    const serializedPovString = JSON.stringify(serializedPov);

    // Validate response is not empty
    if (serializedPovString === "{}") {
      povLogger.error({ povId }, 'serialized POV is an empty object after update');
    }
    
    // Fetch the complete POV with phases to return
    const completePov = await prisma.pOV.findUnique({
      where: { id: povId },
      include: {
        phases: {
          include: {
            template: true,
            stages: {
              include: {
                tasks: {
                  include: {
                    assignee: true
                  }
                }
              },
              orderBy: {
                order: 'asc'
              }
            },
            tasks: {
              include: {
                assignee: true
              }
            }
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
    
    // Change G (2026-06-22 review): audit committed POV status transitions. The new backward
    // edges (STALLED→IN_PROGRESS, VALIDATION→IN_PROGRESS) enable thrash; this is the trail.
    if (validated.status && existingPov?.status && validated.status !== existingPov.status) {
      const { trackActivity } = await import('@/lib/auth/audit');
      await trackActivity(authUser.userId, 'POV_STATUS_CHANGE', `${existingPov.status}->${validated.status}`, {
        resourceId: povId,
        source: 'web_ui',
        success: true,
        oldStatus: existingPov.status,
        newStatus: validated.status,
      });
    }

    if (!completePov) {
      povLogger.error({ povId }, 'failed to fetch complete POV after update');
      return Response.json(pov);
    }
    
    // Serialize the complete POV
    const serializedCompletePov = JSON.parse(JSON.stringify(completePov));
    const serializedCompletePovString = JSON.stringify(serializedCompletePov);
    
    // Explicitly set Content-Length, though Response.json should do this.
    return new Response(serializedCompletePovString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(serializedCompletePovString, 'utf-8').toString()
      }
    });
  } catch (error) {
    povLogger.error({ err: error, povId: params?.povId }, 'error updating POV');

    // 2.14 (completion-path P2): nested-write guard rejections are client errors (facts the
    // GUI can render), not server faults — confirmed live by probe P1.6's 500.
    // F4 (2026-07-25): the transition arm is now typed. The other two remain message-matched —
    // they are ad-hoc guards thrown inline by this handler, not shared typed errors; typing them
    // is a separate change.
    if (error instanceof InvalidTransitionError || (error instanceof Error && (
      error.message.includes('cannot be completed via the POV save') ||
      error.message.includes('cannot be created already COMPLETED')
    ))) {
      return Response.json(
        { error: 'POV save rejected', details: error.message, code: 'NESTED_TASK_GUARD' },
        { status: 409 }
      );
    }

    // Return a more detailed error response
    return Response.json(
      {
        error: 'Failed to update POV',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function updatePhaseHandler(
  request: NextRequest,
  { params }: { params: { povId: string; phaseId: string } }
) {
  const { phaseId } = params
  const data = await request.json()

  const phase = await povService.updatePhase(phaseId, data)
  return Response.json(phase)
}

// reorderPhasesHandler deleted 2026-05-14 alongside its orphaned route.
// The route at app/api/pov/[povId]/phase/reorder/route.ts had a
// double-body-read bug + zero frontend callers; the LIVE phase-reorder
// endpoint is at app/api/pov/[povId]/phases/route.ts which uses
// phaseService.reorderPhases. povService.reorderPhases also removed
// (sole caller was this handler).
