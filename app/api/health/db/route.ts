import { NextResponse } from 'next/server';

// Prevent Next.js 14 static caching of this no-request-read GET (see /api/health/route.ts,
// 2026-07-23): without this, monitors read a stale cached "connected" through a DB outage.
export const dynamic = 'force-dynamic';

// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

async function checkDatabaseConnection() {
  try {
    // Use $queryRaw to test connection - no manual $connect/$disconnect needed
    // The global singleton manages its own connection pool lifecycle
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/health/db' }, 'Database connection check failed');
    return false;
  }
}

export async function GET() {
  try {
    // Check database connection
    const isConnected = await checkDatabaseConnection();
    
    if (!isConnected) {
      return NextResponse.json(
        { status: 'error', message: 'Database connection failed' },
        { status: 500 }
      );
    }

    // 2026-05-26: do NOT expose userCount — this endpoint is unauthenticated and
    // userCount is a business metric (info disclosure). checkDatabaseConnection()
    // already ran SELECT 1, so the connection is verified without leaking a count.
    return NextResponse.json({
      status: 'ok',
      database: {
        connected: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/health/db' }, 'Database health check failed');
    return NextResponse.json(
      {
        status: 'error',
        message: 'Health check failed',
        error: 'Database unavailable',
      },
      { status: 500 }
    );
  }
}
