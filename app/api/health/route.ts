import { NextRequest, NextResponse } from 'next/server';

// A GET route that never reads the request is STATICALLY CACHED by Next.js 14 —
// observed 2026-07-23: probes were served a day-old cached body (x-nextjs-cache: HIT,
// frozen uptime/timestamp), so the 200/503 semantics below never reached the monitor.
// force-dynamic makes every probe execute the handler for real.
export const dynamic = 'force-dynamic';

// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
import { prisma } from '@/lib/prisma';
import { errorCounter, type ErrorRateSummary } from '@/lib/monitoring/error-counter';
import { logger } from '@/lib/logger';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  database: {
    connected: boolean;
  };
  errorRates: ErrorRateSummary;
  errorTotalLastHour: number;
}

async function checkDatabaseConnection() {
  try {
    // Use $queryRaw to test connection - no manual $connect/$disconnect needed
    // The global singleton manages its own connection pool lifecycle
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/health' }, 'Database connection check failed');
    return false;
  }
}

export async function GET(request: NextRequest) {
  const dbConnected = await checkDatabaseConnection();
  const healthStatus: HealthStatus = {
    status: dbConnected ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    database: {
      connected: dbConnected,
    },
    errorRates: errorCounter.getSummary(),
    errorTotalLastHour: errorCounter.getTotalLastHour(),
  };

  // HTTP status MUST reflect health so an external probe registers degradation, not just
  // a dead host: 503 when the DB is unreachable, 200 only when genuinely serving. A probe
  // that always sees 200 (the prior behavior) would have read "healthy" through a DB outage.
  return new NextResponse(JSON.stringify(healthStatus), {
    status: dbConnected ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// For detailed globals health check, use /api/admin/globals/health (admin-only)
