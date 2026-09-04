import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { TaskAttachmentSchema } from '@/lib/validation/task-validation';
import { validateFileUpload } from '@/lib/validation/file-validation';
import { getTaskWithPOV } from '@/lib/tasks/helpers/pov-access';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { createErrorResponse, createSuccessResponse } from '@/lib/api/error-handler';
import { prisma } from '@/lib/prisma';
import { trackActivity } from '@/lib/auth/audit';
import { taskLogger } from '@/lib/logger';

// POST /api/tasks/[taskId]/attachments - Upload attachment
export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // ✅ 1. Authentication
    const user = await getAuthUser(req);
    if (!user) {
      return createErrorResponse('UNAUTHORIZED', 'Authentication required');
    }

    // ✅ 2. POV Access Validation
    const task = await getTaskWithPOV(params.taskId);

    if (!task || !task.pov) {
      return createErrorResponse('NOT_FOUND', 'Task not found');
    }

    try {
      validatePOVAccess(user, task.pov, { throwOnDeny: true, requireWrite: true });  // 2026-05-26 demo-write fix
    } catch (error: any) {
      return createErrorResponse('FORBIDDEN', 'Access denied');
    }

    // BC38 FIX: Reject oversized attachment payloads before parsing (100MB limit)
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 100 * 1024 * 1024) {
      return createErrorResponse('BAD_REQUEST', 'Attachment payload too large (max 100MB)');
    }

    // ✅ 3. Parse multipart form data with safeParse (P1 fix - proper error handling)
    const data = await req.json();
    const result = TaskAttachmentSchema.safeParse(data);

    if (!result.success) {
      return NextResponse.json({
        error: {
          message: 'Validation failed',
          code: 'INVALID_REQUEST',
          details: result.error.errors
        },
      }, { status: 400 });
    }

    const validated = result.data;

    // ✅ 4. File Security Validation (Week 3 P0 Fix #2)
    // Note: This assumes file buffer is provided in data.fileBuffer
    // In real implementation, parse multipart/form-data
    if (data.fileBuffer) {
      const fileValidation = await validateFileUpload(
        {
          name: validated.filename,
          size: validated.fileSize,
          buffer: Buffer.from(data.fileBuffer, 'base64')
        },
        task.povId!
      );

      if (!fileValidation.isValid) {
        return createErrorResponse(
          'BAD_REQUEST',
          'File validation failed: ' + (fileValidation.errors?.join(', ') || 'Invalid file')
        );
      }

      // Use sanitized filename
      validated.filename = fileValidation.sanitizedName!;
    }

    // ✅ 5. Create attachment record (simplified - actual file storage needed)
    const attachment = await prisma.attachment.create({
      data: {
        taskId: params.taskId,
        filename: validated.filename,
        fileType: validated.fileType,
        fileSize: validated.fileSize,
        storageUrl: validated.storageUrl
      }
    });

    // ✅ Audit logging
    await trackActivity(
      user.userId,
      'TASK',
      'UPLOAD_ATTACHMENT',
      {
        taskId: params.taskId,
        attachmentId: attachment.id,
        fileName: validated.filename,
        fileSize: validated.fileSize,
        success: true
      }
    );

    taskLogger.info({ taskId: params.taskId, attachmentId: attachment.id, fileName: validated.filename, fileSize: validated.fileSize }, 'Task attachment uploaded');

    return createSuccessResponse(attachment, 'Attachment uploaded successfully');
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'POST /api/tasks/[taskId]/attachments' }, 'Failed to upload attachment');
    return createErrorResponse('INTERNAL_ERROR', 'Failed to upload attachment');
  }
}
