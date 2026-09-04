/**
 * POV Access Helpers
 *
 * Extract POV context from task/execution/artifact relationships
 * for validatePOVAccess validation
 *
 * Returns full POV object with all fields needed for access validation:
 * - id: POV identifier
 * - ownerId: Owner user ID
 * - metadata: For isDemo check
 * - team.members: For team member check
 *
 * @version 1.0.0
 * @author P1 Security Implementation (Nov 2025)
 * @see /.claude/knowledge/protocols/quarterly-review-protocol.md
 * @see cline_docs/reviews/quarterly-review-2025-11-26/P1-FINAL-APPROVED-PLAN.md
 */

import { prisma } from '@/lib/prisma';

/**
 * POV context type for validatePOVAccess
 * Matches the signature from boundary-contract specialist review
 * team can be null if POV doesn't have a team yet
 */
export interface POVContext {
  id: string;
  ownerId: string;
  metadata: any;
  team: {
    members: Array<{ userId: string }>;
  } | null;
}

/**
 * Get full POV context from taskId
 *
 * Used by agent execution endpoints that receive taskId in request body
 *
 * @param taskId - Task identifier
 * @returns POV context with all fields for validatePOVAccess, or null if not found
 *
 * @example
 * const pov = await getPOVFromTask(taskId);
 * if (!pov) return 404;
 * validatePOVAccess(user, pov, { throwOnDeny: true });
 */
export async function getPOVFromTask(taskId: string): Promise<POVContext | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      stage: {
        select: {
          phase: {
            select: {
              pov: {
                select: {
                  id: true,
                  ownerId: true,
                  metadata: true,
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
          }
        }
      }
    }
  });

  return task?.stage?.phase?.pov || null;
}

/**
 * Get full POV context from executionId
 *
 * Used by agent control endpoints (cancel, status, artifacts)
 *
 * @param executionId - Agent execution identifier
 * @returns POV context with all fields for validatePOVAccess, or null if not found
 *
 * @example
 * const pov = await getPOVFromExecution(executionId);
 * if (!pov) return 404;
 * validatePOVAccess(user, pov, { throwOnDeny: true });
 */
export async function getPOVFromExecution(executionId: string): Promise<POVContext | null> {
  const execution = await prisma.agentExecution.findUnique({
    where: { id: executionId },
    select: {
      id: true,
      task: {
        select: {
          stage: {
            select: {
              phase: {
                select: {
                  pov: {
                    select: {
                      id: true,
                      ownerId: true,
                      metadata: true,
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
              }
            }
          }
        }
      }
    }
  });

  return execution?.task?.stage?.phase?.pov || null;
}

/**
 * Get full POV context from artifactId
 *
 * Used by artifact download/access endpoints
 *
 * @param artifactId - Agent artifact identifier
 * @returns POV context with all fields for validatePOVAccess, or null if not found
 *
 * @example
 * const pov = await getPOVFromArtifact(artifactId);
 * if (!pov) return 404;
 * validatePOVAccess(user, pov, { throwOnDeny: true });
 */
export async function getPOVFromArtifact(artifactId: string): Promise<POVContext | null> {
  const artifact = await prisma.agentArtifact.findUnique({
    where: { id: artifactId },
    select: {
      execution: {
        select: {
          task: {
            select: {
              stage: {
                select: {
                  phase: {
                    select: {
                      pov: {
                        select: {
                          id: true,
                          ownerId: true,
                          metadata: true,
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
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  return artifact?.execution?.task?.stage?.phase?.pov || null;
}
