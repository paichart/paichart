/**
 * OAuth Token Refresh Health Check Endpoint
 * GET /api/auth/oauth/health
 *
 * Query Parameters:
 * - minimal: Return minimal response (status only)
 * - provider: Filter by OAuth provider
 * - userId: Check specific user's token status
 * - warnings-only: Return only warnings
 *
 * Returns service status, token statistics, and recent activity.
 * Reports both Web App OAuth (EnterpriseOAuthService) and MCP OAuth (MCPOAuthTokenManager).
 */

import { NextRequest, NextResponse } from 'next/server';
import { tokenRefreshService } from '@/lib/auth/oauth/token-refresh-service';
import { oauthLogger } from '@/lib/auth/oauth/oauth-logger';
import { oauthService } from '@/lib/auth/oauth/oauth-service';
import { MCPOAuthTokenManager } from '@/lib/auth/oauth/mcp-oauth-token-manager';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { UserRole } from '@/lib/types/auth';
import { authLogger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const minimal = searchParams.get('minimal') === 'true';
    const provider = searchParams.get('provider');
    const userId = searchParams.get('userId');
    const warningsOnly = searchParams.get('warnings-only') === 'true';

    // Get service health from token refresh service
    const serviceHealth = tokenRefreshService.getServiceHealth();

    // Minimal response
    if (minimal) {
      return NextResponse.json({
        status: serviceHealth.running ? 'healthy' : 'stopped',
        timestamp: new Date().toISOString(),
        webAppTokens: serviceHealth.tokensInMemory,
        mcpOAuthTokens: MCPOAuthTokenManager.getTokenCount()
      });
    }

    // Get token storage statistics
    const tokenStorage = (oauthService as any).constructor.tokenStorage as Map<string, any>;
    let tokens = Array.from(tokenStorage.values());

    // Filter by provider if specified
    if (provider) {
      tokens = tokens.filter(t => t.provider === provider);
    }

    // Filter by userId if specified
    if (userId) {
      tokens = tokens.filter(t => t.userId === userId);
    }

    // Calculate token statistics
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    const tokenStats = {
      total: tokens.length,
      expiringWithin10Min: tokens.filter(t => t.expiresAt.getTime() - now < tenMinutes && t.expiresAt.getTime() > now).length,
      expiringWithin1Hour: tokens.filter(t => t.expiresAt.getTime() - now < oneHour && t.expiresAt.getTime() > now).length,
      expired: tokens.filter(t => t.expiresAt.getTime() < now).length,
      byProvider: tokens.reduce((acc: any, t) => {
        acc[t.provider] = (acc[t.provider] || 0) + 1;
        return acc;
      }, {}),
      failedRefreshes: tokens.filter(t => t.refreshAttempts > 0).length
    };

    // Get circuit breaker status
    const circuitBreakers = (oauthService as any).providerCircuitBreakers as Map<string, any>;
    let circuitBreakerStatus = Array.from(circuitBreakers.entries()).map(([p, breaker]) => ({
      provider: p,
      state: breaker.state,
      failures: breaker.failures,
      lastFailure: breaker.lastFailure ? new Date(breaker.lastFailure).toISOString() : null
    }));

    // Filter circuit breakers by provider if specified
    if (provider) {
      circuitBreakerStatus = circuitBreakerStatus.filter(cb => cb.provider === provider);
    }

    // Get recent log statistics (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logStats = oauthLogger.getStats(yesterday);

    // Get recent failures
    const recentFailures = oauthLogger.getFailures(10);

    // Build warnings
    const warnings: string[] = [];
    if (!serviceHealth.running) {
      warnings.push('Token refresh service is not running');
    }
    if (tokenStats.expired > 0) {
      warnings.push(`${tokenStats.expired} expired tokens in storage`);
    }
    if (tokenStats.failedRefreshes > 0) {
      warnings.push(`${tokenStats.failedRefreshes} tokens with failed refresh attempts`);
    }
    if (circuitBreakerStatus.some(cb => cb.state === 'OPEN')) {
      const openCircuits = circuitBreakerStatus.filter(cb => cb.state === 'OPEN').map(cb => cb.provider);
      warnings.push(`Circuit breaker OPEN for: ${openCircuits.join(', ')}`);
    }

    // Warnings-only response
    if (warningsOnly) {
      return NextResponse.json({
        status: warnings.length > 0 ? 'warning' : 'healthy',
        timestamp: new Date().toISOString(),
        warnings
      });
    }

    // Get MCP OAuth token statistics
    const mcpOAuthStats = MCPOAuthTokenManager.getTokenStats();

    // Get MCP OAuth circuit breaker status
    const mcpCircuitBreakers = MCPOAuthTokenManager.getAllCircuitBreakers();

    // Overall health status
    const healthStatus = {
      status: serviceHealth.running ? 'healthy' : 'stopped',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: {
        running: serviceHealth.running,
        lastRun: serviceHealth.lastRun,
        webAppTokens: serviceHealth.tokensInMemory,
        mcpOAuthTokens: mcpOAuthStats.total
      },
      tokens: {
        webApp: tokenStats,
        mcpOAuth: {
          total: mcpOAuthStats.total,
          byProvider: mcpOAuthStats.byProvider,
          expiringWithin10Min: mcpOAuthStats.expiringWithin10Min,
          expiringWithin1Hour: mcpOAuthStats.expiringWithin1Hour,
          expired: mcpOAuthStats.expired
        }
      },
      circuitBreakers: {
        webApp: circuitBreakerStatus,
        mcpOAuth: mcpCircuitBreakers
      },
      logs: {
        last24Hours: logStats,
        recentFailures: recentFailures.map(f => ({
          timestamp: f.timestamp,
          userId: f.userId,
          provider: f.provider,
          errorMessage: f.errorMessage
        }))
      },
      warnings
    };

    return NextResponse.json(healthStatus);

  } catch (error) {
    authLogger.error({ err: error }, 'OAuth health check failed');

    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      uptime: process.uptime()
    }, { status: 500 });
  }
}
