import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { getTaskWithPOV } from '@/lib/tasks/helpers/pov-access';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { createErrorResponse, createSuccessResponse } from '@/lib/api/error-handler';
import { prisma } from '@/lib/prisma';
import { trackActivity } from '@/lib/auth/audit';
import { taskLogger } from '@/lib/logger';

// DELETE /api/tasks/[taskId]/attachments/[attachmentId] - Remove attachment
export async function DELETE(
  req: NextRequest,
  { params }: { params: { taskId: string; attachmentId: string } }
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

    // ✅ 3. Verify attachment exists and belongs to this task
    const attachment = await prisma.attachment.findUnique({
      where: { id: params.attachmentId }
    });

    if (!attachment) {
      return createErrorResponse('NOT_FOUND', 'Attachment not found');
    }

    if (attachment.taskId !== params.taskId) {
      return createErrorResponse('BAD_REQUEST', 'Attachment does not belong to this task');
    }

    // ✅ 4. Delete attachment from database
    await prisma.attachment.delete({
      where: { id: params.attachmentId }
    });

    // ✅ 5. Delete actual file from storage
    // NOTE: File upload not yet implemented (see upload POST handler line 76)
    // When file storage is implemented, add cleanup here:
    //
    // if (attachment.storageUrl) {
    //   if (attachment.storageUrl.startsWith('s3://')) {
    //     // S3 cleanup
    //     await s3Client.deleteObject({
    //       Bucket: process.env.S3_BUCKET,
    //       Key: attachment.storageUrl.replace('s3://', '')
    //     });
    //   } else if (attachment.storageUrl.startsWith('/uploads/')) {
    //     // Local filesystem cleanup
    //     const filePath = path.join(process.cwd(), 'public', attachment.storageUrl);
    //     await fs.unlink(filePath).catch(err =>
    //       console.warn('[Attachment] File already deleted:', err)
    //     );
    //   }
    //   console.log(`[Attachment] File deleted: ${attachment.storageUrl}`);
    // }

    // ✅ Audit logging
    await trackActivity(
      user.userId,
      'TASK',
      'DELETE_ATTACHMENT',
      {
        taskId: params.taskId,
        attachmentId: params.attachmentId,
        fileName: attachment.filename,
        success: true
      }
    );

    taskLogger.info({ taskId: params.taskId, attachmentId: params.attachmentId, fileName: attachment.filename }, 'Task attachment deleted');

    return createSuccessResponse(null, 'Attachment deleted successfully');
  } catch (error) {
    taskLogger.error({ err: error, endpoint: 'DELETE /api/tasks/[taskId]/attachments/[attachmentId]' }, 'Failed to delete attachment');
    return createErrorResponse('INTERNAL_ERROR', 'Failed to delete attachment');
  }
}
