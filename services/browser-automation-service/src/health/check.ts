/**
 * Health Check Module
 *
 * Provides health status for the Browser Automation Service.
 */

import { BrowserPoolManager } from '../browser/pool-manager.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  pool: {
    size: number;
    available: number;
    inUse: number;
    maxSize: number;
  };
  checks: {
    browserPool: boolean;
    memory: boolean;
    playwright: boolean;
  };
}

const startTime = Date.now();

export async function checkHealth(): Promise<HealthStatus> {
  const poolManager = BrowserPoolManager.getInstance();
  const poolStats = poolManager.getStats();

  // Check if pool is operational
  const browserPoolOk = poolStats.poolSize >= 0 && poolStats.poolSize <= poolStats.maxPoolSize;

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const memoryOk = memoryUsage.heapUsed < 1.5 * 1024 * 1024 * 1024; // 1.5GB threshold

  // Playwright check (assumed ok if pool is working)
  const playwrightOk = browserPoolOk;

  // Determine overall status
  let status: HealthStatus['status'] = 'healthy';
  if (!browserPoolOk || !playwrightOk) {
    status = 'unhealthy';
  } else if (!memoryOk || poolStats.inUse >= poolStats.maxPoolSize) {
    status = 'degraded';
  }

  return {
    status,
    version: '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    pool: {
      size: poolStats.poolSize,
      available: poolStats.available,
      inUse: poolStats.inUse,
      maxSize: poolStats.maxPoolSize
    },
    checks: {
      browserPool: browserPoolOk,
      memory: memoryOk,
      playwright: playwrightOk
    }
  };
}

export default checkHealth;
