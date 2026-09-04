import { PrismaClient, Prisma } from '@prisma/client';
import { setupDevQueryLogger, devQueryLoggerExtension } from './database/dev-query-logger';
import { taskCompletedAtExtension } from './database/task-completed-at-extension';
import { logger } from '@/lib/logger';

// Declare global variable for prisma instance
declare global {
  var prismaClient: PrismaClient | undefined;
}

// Initialize Prisma Client with minimal connection pooling
function createPrismaClient(): PrismaClient {
  // Check if we're running on the server side
  if (typeof (globalThis as any).window === 'undefined') {
    let dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Add connection pooling parameters if not already present
    try {
      const url = new URL(dbUrl);
      const params = new URLSearchParams(url.search);
      
      // OPTIMIZATION: Connection pool parameters
      // pgbouncer hint only when PGBOUNCER_ENABLED is set (disables prepared statements)
      // Previously set unconditionally, losing ~10-15% query performance for a PgBouncer that wasn't running
      // Verified 2026-04-09: PGBOUNCER_ENABLED is intentionally absent from .env.production
      // because the test/UAT box runs PostgreSQL directly without pgbouncer (`systemctl is-active
      // pgbouncer` → inactive). If pgbouncer is added in front of PG later, set this env var to
      // 'true' so prepared statements are disabled (pgbouncer transaction-mode pooling can't
      // share prepared statement state across clients).
      if (process.env.PGBOUNCER_ENABLED === 'true') {
        if (!params.has('pgbouncer')) params.set('pgbouncer', 'true');
        if (!params.has('pool_mode')) params.set('pool_mode', 'transaction');
        if (!params.has('max_client_conn')) params.set('max_client_conn', '100');
      }
      if (!params.has('pool_timeout')) params.set('pool_timeout', '30');
      if (!params.has('connection_limit')) params.set('connection_limit', '25'); // Raised from 15 for 100-user headroom
      // SAFETY: 10s query timeout prevents runaway queries from blocking the pool
      // Uses PostgreSQL 'options' parameter to pass runtime config through pgbouncer
      if (!params.has('options')) params.set('options', '-c statement_timeout=10000');

      // OBSERVABILITY: tag connections with application_name so pg_stat_activity
      // distinguishes paichart-web vs paichart-mcp vs scripts. PM2 sets
      // process.env.name from ecosystem.config.js ('paichart-web' / 'paichart-mcp');
      // scripts can override via PAICHART_APP_NAME; fallback derives from argv.
      // Added 2026-04-08 during Phase 3 post-UAT cleanup (plan v4 improvement #1).
      if (!params.has('application_name')) {
        const appName =
          process.env.PAICHART_APP_NAME ||
          process.env.name ||
          (process.argv[1]
            ? `paichart-${require('path').basename(process.argv[1], '.js').replace(/[^a-zA-Z0-9_-]/g, '-')}`
            : 'paichart-unknown');
        params.set('application_name', appName);
      }
      
      url.search = params.toString();
      dbUrl = url.toString();
    } catch (error) {
      logger.error({ err: error }, 'invalid DATABASE_URL');
      throw new Error('Invalid DATABASE_URL environment variable');
    }

    const client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? [
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
      ] : undefined,
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });

    // Apply extensions: completedAt derivation (chokepoint for Task.completedAt) + dev query logger.
    return client
      .$extends(taskCompletedAtExtension())
      .$extends(devQueryLoggerExtension()) as unknown as PrismaClient;
  }
  
  // Return a mock PrismaClient for client-side rendering
  return {} as PrismaClient;
}

// For development, use a global variable to prevent multiple instances during hot reloading
const prisma = global.prismaClient || (typeof (globalThis as any).window === 'undefined' ? createPrismaClient() : {} as PrismaClient);

if (process.env.NODE_ENV === 'development' && typeof (globalThis as any).window === 'undefined') {
  global.prismaClient = prisma;
}

// Cleanup and error handling
const cleanup = async () => {
  try {
    logger.info('cleaning up database connections');
    await prisma.$disconnect();
  } catch (error) {
    logger.error({ err: error }, 'error during database cleanup');
    process.exit(1);
  }
};


/**
 * Verifies the database connection and connection pooling
 * @returns {Promise<boolean>} True if connection succeeds, false otherwise
 */
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    logger.debug('checking database connection');
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    logger.info('database connection successful');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'database connection failed');
    return false;
  }
}

/**
 * Ensures database connection is established with retry logic.
 * Use this before scheduling any database operations (e.g., setInterval).
 *
 * @param {number} maxRetries - Maximum number of connection attempts (default: 5)
 * @param {number} initialDelayMs - Initial delay between retries in ms (default: 2000, scales with exponential backoff)
 * @returns {Promise<boolean>} True if connection succeeds, false if all retries fail
 *
 * @example
 * // In MCP server startup
 * const connected = await ensureConnected();
 * if (connected) {
 *   setupResourceMaintenanceSchedule();
 * }
 */
async function ensureConnected(maxRetries: number = 5, initialDelayMs: number = 2000): Promise<boolean> {
  const maxDelayMs = initialDelayMs * 8; // Cap at 8x initial (e.g., 16s for 2s base)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      logger.info({ attempt, maxRetries }, 'database connection established');
      return true;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt) {
        logger.error({ err: error, attempt, maxRetries }, 'failed to connect after all retries');
        return false;
      }

      // Exponential backoff with jitter to prevent thundering herd on DB restart
      const exponentialDelay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = exponentialDelay * 0.2 * Math.random(); // ±20% jitter
      const delayMs = Math.round(exponentialDelay + jitter);

      logger.warn({ err: error, attempt, maxRetries, delayMs }, 'database connection attempt failed, retrying with backoff');
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

// Initialize connection only on the server side
if (typeof (globalThis as any).window === 'undefined') {
  // PAICHART_SKIP_DB_CONNECT — opt-out for processes that import this module
  // transitively but never touch the database (2026-07-27).
  //
  // The eager $connect() below calls process.exit(1) on failure, at MODULE
  // SCOPE. That is correct for a server: a web/MCP process that cannot reach
  // its database should die loudly rather than serve errors. It is wrong for a
  // schema-only test: several suites import `tool-schemas.js`, which reaches
  // this module via smart-error-recovery -> enterprise-parameter-intelligence,
  // and are then killed by an async rejection that has nothing to do with their
  // assertions. On a CI runner with no Postgres they exited 1 while every
  // assertion had passed, and whether it happened at all was a RACE — a fast
  // suite could finish first and go green, a slower one could not.
  //
  // Defaults to the existing behaviour: only an explicit 'true' skips it, so no
  // deployed process changes. Set it in tests that need the Zod schemas but no DB.
  if (process.env.PAICHART_SKIP_DB_CONNECT === 'true') {
    logger.debug('skipping eager database connect (PAICHART_SKIP_DB_CONNECT=true)');
  } else {
    prisma.$connect().catch((e: Error) => {
      logger.error({ err: e }, 'failed to connect to database');
      process.exit(1);
    });
  }

  // 🔧 N+1 OPTIMIZATION: Setup development query logger
  setupDevQueryLogger(prisma as any);
}

/**
 * Legacy API compatibility shim — `ensureConnection()` (singular, past-present)
 * is used by `mcp-server-http-clean.js:41,1465` as a cold-start guard on the
 * Microsoft OAuth flow. The .js sibling exports it at prisma.js:105-123 with
 * a zero-arg signature returning Promise<boolean>.
 *
 * Delegates to `ensureConnected()` (plural, past-tense) which is the TS-native
 * API with retry/backoff. Defaults match the .js behavior for cold-start use.
 *
 * Added 2026-04-07 as part of the dual TS/JS drift eradication plan, to
 * resolve the database-manager-specialist's BLOCKER finding before deleting
 * prisma.js. See:
 *   cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/database-manager-review.md
 */
async function ensureConnection(): Promise<boolean> {
  return ensureConnected();
}

export { prisma, PrismaClient, checkDatabaseConnection, ensureConnected, ensureConnection };
