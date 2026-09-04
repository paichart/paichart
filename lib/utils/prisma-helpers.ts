/**
 * DEPRECATED: This file previously contained helper functions for working with agent executions and artifacts
 * using raw SQL queries. These helper functions have been removed as they are no longer needed.
 * 
 * All agent routes now use the Prisma client directly, which provides better type safety, maintainability,
 * and performance. The Prisma client also handles relationships automatically, making it easier to work
 * with related data.
 * 
 * For examples of how to use the Prisma client with agent models, see:
 * - app/api/pov/agent/execute/route.ts
 * - app/api/pov/agent/cancel/[executionId]/route.ts
 * - app/api/pov/agent/status/[executionId]/route.ts
 * - app/api/pov/agent/artifacts/[executionId]/route.ts
 * - app/api/pov/agent/artifacts/[executionId]/[artifactId]/download/route.ts
 * 
 * For more information, see the documentation in cline_docs/unified/prisma-agent-models-solution.md
 */
