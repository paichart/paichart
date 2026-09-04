import { prisma } from '@/lib/prisma';
import { povLogger } from '@/lib/logger';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  ActivityDetails,
  ActivityMetadata,
  TaskActivityAction,
  TaskActivityActionType,
} from '@/lib/types/activity';
import {
  validateActivityDetails,
  validateActivityMetadata,
} from '@/lib/validation/activity-validation';

// Stage Activity Service — sister of taskActivityService.ts
//
// Mirrors the fire-and-forget rich-details pattern documented in
// /cline_docs/reviews/task-activity-rich-details-2025-12-31/. Stage updates
// were previously only captured in the generic Activity audit table (via
// logPhaseStageOperation) which makes per-stage history queries scan a
// large shared table by metadata. The dedicated stage_activities table
// gives us indexed-by-stageId forensic queries — primarily motivated by
// harness clobber-detection investigations where we need to trace every
// write to a single stage's metadata in chronological order.
//
// We deliberately reuse `TaskActivityAction` and `ActivityDetails` from
// lib/types/activity rather than defining stage-specific enums. The action
// vocabulary (UPDATED, STATUS_CHANGED, CREATED, etc.) applies cleanly to
// stages too, and the details shape (fieldName / oldValue / newValue) is
// identical. Fewer types = less drift.
//
// Created: 2026-04-26 (Phase 2 of stage_activities rollout)

interface StageActivityLogInput {
  stageId: string;
  userId: string;
  action: TaskActivityActionType;
  details?: ActivityDetails;
  metadata?: ActivityMetadata;
}

export function logStageActivityWithDetails(
  data: StageActivityLogInput,
  prismaClient: PrismaClient = prisma
): void {
  const validatedDetails = data.details
    ? validateActivityDetails(data.details)
    : undefined;
  const validatedMetadata = data.metadata
    ? validateActivityMetadata(data.metadata)
    : undefined;

  if (data.details && !validatedDetails) {
    povLogger.warn(
      { stageId: data.stageId, action: data.action },
      'invalid stage activity details, writing without details'
    );
  }
  if (data.metadata && !validatedMetadata) {
    povLogger.warn(
      { stageId: data.stageId, action: data.action },
      'invalid stage activity metadata, writing without metadata'
    );
  }

  prismaClient.stageActivity.create({
    data: {
      stageId: data.stageId,
      userId: data.userId,
      action: data.action,
      details: validatedDetails as Prisma.InputJsonValue | undefined,
      metadata: validatedMetadata as Prisma.InputJsonValue | undefined,
      timestamp: new Date(),
    },
  }).then(() => {
    povLogger.debug(
      { stageId: data.stageId, action: data.action, hasDetails: !!validatedDetails },
      'stage activity logged'
    );
  }).catch((error) => {
    povLogger.error(
      { err: error, stageId: data.stageId, action: data.action },
      'failed to log stage activity'
    );
  });
}

export function logStageFieldChange(
  stageId: string,
  userId: string,
  field: {
    name: string;
    oldValue: unknown;
    newValue: unknown;
    action: TaskActivityActionType;
  },
  metadata?: ActivityMetadata,
  prismaClient: PrismaClient = prisma
): void {
  logStageActivityWithDetails(
    {
      stageId,
      userId,
      action: field.action,
      details: {
        fieldName: field.name,
        oldValue: field.oldValue,
        newValue: field.newValue,
      },
      metadata,
    },
    prismaClient
  );
}

export { TaskActivityAction } from '@/lib/types/activity';
export type { ActivityDetails, ActivityMetadata } from '@/lib/types/activity';
