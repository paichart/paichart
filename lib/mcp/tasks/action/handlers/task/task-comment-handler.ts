/**
 * Task Comment Handler
 *
 * Handles task comment creation via MCP.
 * Supports task lookup by title + POV context.
 * Validates POV access and sanitizes comment text.
 *
 * @class TaskCommentHandler
 * @description Task comment creation handler with intelligent task lookup and text sanitization.
 *   Supports task lookup by ID or title+POV context.
 *
 *   Key Features:
 *   - Task lookup by ID or title+POV context (fuzzy matching)
 *   - POV access validation via validatePOVAccess
 *   - Comment text sanitization (trim, prevent empty comments)
 *   - Activity logging with comment preview
 *   - Returns created comment with user information
 *
 * @param {Object} parameters - Task comment parameters
 * @param {string} [parameters.taskId] - Task ID for direct lookup
 * @param {string} [parameters.taskTitle] - Task title for fuzzy lookup (requires POV context)
 * @param {string} parameters.comment - Comment text to add (REQUIRED)
 * @param {string} [parameters.povId] - POV ID for task title lookup context
 * @param {string} [parameters.povTitle] - POV title for task title lookup context (partial match)
 * @param {TokenPayload} user - Authenticated user token payload
 * @param {string} user.userId - User ID from JWT token
 * @param {string} actionId - Unique action ID for tracking and logging
 *
 * @returns {Promise<Object>} Task comment result
 * @returns {string} returns.actionId - Action tracking ID
 * @returns {string} returns.action - Action type (task.comment)
 * @returns {string} returns.status - Completion status (completed)
 * @returns {Object} returns.result - Comment creation result
 * @returns {Object} returns.result.comment - Created comment object
 * @returns {string} returns.result.comment.id - Comment ID
 * @returns {string} returns.result.comment.text - Comment text
 * @returns {Date} returns.result.comment.createdAt - Creation timestamp
 * @returns {Object} returns.result.comment.author - Comment author information
 * @returns {string} returns.result.comment.author.id - Author user ID
 * @returns {string} returns.result.comment.author.name - Author name
 * @returns {string} returns.result.comment.author.email - Author email
 * @returns {string} returns.result.message - Success message with comment preview
 *
 * @throws {Error} If neither taskId nor taskTitle provided
 * @throws {Error} If comment text is missing or empty
 * @throws {Error} If task not found via ID or title lookup
 * @throws {Error} If multiple tasks found with same title (requires POV context)
 * @throws {Error} If POV access validation fails
 *
 * @example
 * // Add comment by task ID
 * const result = await handleTaskComment({
 *   taskId: 'task123',
 *   comment: 'Deployment completed successfully. All tests passing.'
 * }, user, 'action-456');
 *
 * @example
 * // Add comment by task title with POV context
 * const result = await handleTaskComment({
 *   taskTitle: 'Setup Infrastructure',
 *   povId: 'cm123abc',
 *   comment: 'Terraform configs reviewed and approved.'
 * }, user, 'action-789');
 *
 * @example
 * // Add comment with POV title fuzzy matching
 * const result = await handleTaskComment({
 *   taskTitle: 'Deploy to Production',
 *   povTitle: 'BlackEye',
 *   comment: 'Deployment scheduled for tonight at 2am EST.'
 * }, user, 'action-101');
 *
 * @security
 *   - POV access validation via validatePOVAccess
 *   - Comment text sanitization (trim whitespace)
 *   - Activity logging for audit trail
 *
 * @version 1.0.0
 * @since 2025-12-18
 * @extracted 2025-12-18 from app/api/mcp/tasks/action/route.ts (lines 1601-1781)
 */

import { TokenPayload } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { logCommentAdded } from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';
import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: 'TaskCommentHandler' });

export async function handleTaskComment(
  parameters: any,
  user: TokenPayload,
  actionId: string
) {
  const { taskId, comment, taskTitle, povId, povTitle } = parameters;

  // If no taskId provided, try to find task by title + POV context
  let finalTaskId = taskId;

  if (!finalTaskId && taskTitle) {
    log.info({ taskTitle }, 'looking up task by title');

    // Build search criteria
    const searchCriteria: any = {
      title: { equals: taskTitle, mode: 'insensitive' }
    };

    // Add POV context if provided
    if (povId) {
      searchCriteria.povId = povId;
    } else if (povTitle) {
      searchCriteria.pov = {
        title: { contains: povTitle, mode: 'insensitive' }
      };
    }

    // Find matching tasks
    const matchingTasks = await prisma.task.findMany({
      where: searchCriteria,
      include: {
        pov: { select: { id: true, title: true } },
        phase: { select: { id: true, name: true } }
      },
      take: 20
    });

    if (matchingTasks.length === 0) {
      throw new Error(`No tasks found with title "${taskTitle}"${povId ? ` in POV ${povId}` : povTitle ? ` in POV containing "${povTitle}"` : ''}`);
    } else if (matchingTasks.length === 1) {
      finalTaskId = matchingTasks[0].id;
      log.info({ taskTitle, povTitle: matchingTasks[0].pov?.title }, 'found unique task');
    } else {
      // Multiple matches - provide helpful error
      const povList = matchingTasks.map(t => `"${t.pov?.title}" (ID: ${t.id})`).join(', ');
      throw new Error(`Multiple tasks found with title "${taskTitle}". Please specify POV context. Found in POVs: ${povList}`);
    }
  }

  if (!finalTaskId) {
    throw new Error('Either taskId or taskTitle (with POV context) is required for adding comments');
  }

  if (!comment || !comment.trim()) {
    throw new Error('Comment text is required');
  }

  // 🔒 SECURITY: Sanitize comment to prevent XSS attacks
  const { sanitizeComment, validateComment } = require('@/lib/utils/sanitization');
  const validation = validateComment(comment);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const sanitizedComment = sanitizeComment(comment);

  // Verify task exists and get full context for authorization
  const task = await prisma.task.findUnique({
    where: { id: finalTaskId },
    select: {
      id: true,
      title: true,
      status: true,
      povId: true,
      assigneeId: true,
      pov: {
        select: {
          id: true,
          ownerId: true,
          metadata: true,  // Added for DEMO_USER validation
          team: {
            select: {
              members: {
                select: { userId: true }
              }
            }
          }
        }
      }
    }
  });

  if (!task) {
    throw new Error(`Task not found: ${finalTaskId}`);
  }

  // 🔒 SECURITY: Validate POV access (includes DEMO_USER + isDemo support)
  if (!task.pov) {
    throw new Error('Task POV not found');
  }

  validatePOVAccess(user, task.pov, {
    throwOnDeny: true,
    requireWrite: true,  // 2026-05-26: isDemo read-only (demo-write fix)
    logContext: 'Task Comment'
  });

  // Create comment (atomic operation)
  const newComment = await prisma.comment.create({
    data: {
      taskId: finalTaskId,
      userId: user.userId,
      text: sanitizedComment
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, status: true } }
    }
  });

  // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
  // Fire-and-forget pattern - logs comment with full text in details
  const mcpMetadata: ActivityMetadata = { source: 'MCP' };
  logCommentAdded(
    finalTaskId,
    user.userId,
    sanitizedComment,
    mcpMetadata
  );

  log.info({ commentId: newComment.id }, 'rich activity logged for comment');

  // 📬 NOTIFICATION: Create notification for relevant users (outside transaction)
  const { createNotification } = require('@/lib/notifications/services/delivery');
  const { NotificationType } = require('@/lib/notifications/types');

  try {
    // Notify task assignee (if different from commenter)
    if (task.assigneeId && task.assigneeId !== user.userId) {
      await createNotification({
        type: NotificationType.INFO,
        title: 'New Comment on Task',
        message: `${user.name || 'Team member'} commented on "${task.title}": "${sanitizedComment.substring(0, 50)}${sanitizedComment.length > 50 ? '...' : ''}"`,
        userId: task.assigneeId,
        actionUrl: `/pov/edit/${task.povId}?mode=project`
      });
    }

    // Notify POV owner (if different from commenter and assignee)
    if (task.pov?.ownerId && task.pov.ownerId !== user.userId && task.pov.ownerId !== task.assigneeId) {
      await createNotification({
        type: NotificationType.INFO,
        title: 'New Comment on Task',
        message: `${user.name || 'Team member'} commented on "${task.title}": "${sanitizedComment.substring(0, 50)}${sanitizedComment.length > 50 ? '...' : ''}"`,
        userId: task.pov.ownerId,
        actionUrl: `/pov/edit/${task.povId}?mode=project`
      });
    }
  } catch (notificationError) {
    // 🔧 NON-CRITICAL: Notification failures shouldn't block comment creation
    log.error({ err: notificationError }, 'notification failed (non-critical)');
  }

  return {
    actionId,
    action: 'task.comment',
    status: 'completed',
    result: {
      comment: newComment,
      task: {
        id: task.id,
        title: task.title,
        status: task.status
      },
      message: `Comment added successfully to task "${task.title}" via MCP`,
      // Include POV ID for potential cache invalidation on client side
      povId: task.povId
    }
  };
}
