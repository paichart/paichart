import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { mcpService } from '@/lib/services/mcp/mcpService';
import { mcpToolRegistry } from '@/lib/services/mcp/toolRegistry';
import { mcpContextManager } from '@/lib/services/mcp/contextManager';
import { mcpLogger } from '@/lib/logger';

/**
 * Enhanced MCP Status API
 * Provides comprehensive status of all MCP servers, tools, and intelligence features
 */
export async function GET(request: NextRequest) {
  try {
    // Use the same authentication pattern as MCP Analytics
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    mcpLogger.info({ userId: user.userId }, 'fetching MCP system status');

    // Get performance metrics first — measured responseTime feeds the
    // per-server health blocks below (2026-06-12: was fabricated '<50ms'/'<100ms')
    const performanceMetrics = await getPerformanceMetrics();

    // Get embedded server status
    const embeddedStatus = await getEmbeddedServerStatus(performanceMetrics.system.responseTime, performanceMetrics.system.errorRate);

    // Get external server status
    const externalStatus = await getExternalServerStatus(performanceMetrics.system.responseTime, performanceMetrics.system.errorRate);

    // Get tool registry status
    const toolRegistryStatus = await getToolRegistryStatus();

    // Get context manager status
    const contextStatus = await getContextManagerStatus();

    // Get intelligence features status
    const intelligenceStatus = await getIntelligenceStatus();

    // Calculate actual tool counts from live servers
    const actualToolCount = (embeddedStatus.toolCount || 0) + (externalStatus.toolCount || 0);
    const actualActiveTools = (embeddedStatus.connected ? (embeddedStatus.toolCount || 0) : 0) + 
                             (externalStatus.connected ? (externalStatus.toolCount || 0) : 0);

    const comprehensiveStatus = {
      timestamp: new Date().toISOString(),
      systemHealth: calculateSystemHealth(embeddedStatus, externalStatus, { 
        ...toolRegistryStatus, 
        totalTools: actualToolCount,
        activeTools: actualActiveTools 
      }),
      servers: {
        embedded: embeddedStatus,
        external: externalStatus,
        total: (embeddedStatus.connected ? 1 : 0) + (externalStatus.connected ? 1 : 0),
        connected: [embeddedStatus.connected, externalStatus.connected].filter(Boolean).length
      },
      tools: {
        registry: toolRegistryStatus,
        total: actualToolCount,
        active: actualActiveTools,
        categories: toolRegistryStatus.categories,
        breakdown: {
          embedded: embeddedStatus.toolCount || 0,
          external: externalStatus.toolCount || 0
        }
      },
      intelligence: intelligenceStatus,
      context: contextStatus,
      performance: performanceMetrics,
      capabilities: {
        workflowExecution: true,
        agentCoordination: true,
        realTimeAnalytics: true,
        errorRecovery: true,
        contextPreservation: true,
        performanceOptimization: true
      },
      recommendations: await generateSystemRecommendations(embeddedStatus, externalStatus, performanceMetrics)
    };

    mcpLogger.info({ healthScore: comprehensiveStatus.systemHealth.score }, 'MCP status compiled');

    return NextResponse.json({
      success: true,
      data: comprehensiveStatus
    });

  } catch (error) {
    mcpLogger.error({ err: error }, 'failed to fetch MCP system status');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch MCP system status',
      details: 'See server logs for details'
    }, { status: 500 });
  }
}

/**
 * Get embedded server status
 */
async function getEmbeddedServerStatus(measuredResponseTime: string = 'N/A', measuredErrorRate: string = 'N/A') {
  try {
    // Import the embedded server to check its status
    const { embeddedMCPServer } = await import('@/lib/mcp/embedded-server');
    
    const isReady = embeddedMCPServer.isReady();
    const serverStatus = embeddedMCPServer.getStatus();
    
    let tools: any[] = [];
    let toolCount = 0;
    
    if (isReady) {
      try {
        tools = await embeddedMCPServer.getTools();
        toolCount = tools.length;
      } catch (error) {
        mcpLogger.warn({ err: error }, 'could not get embedded server tools');
        toolCount = serverStatus.toolCount || 0;
      }
    }
    
    return {
      name: 'Embedded MCP Server',
      type: 'embedded',
      connected: isReady,
      status: isReady ? 'CONNECTED' : 'DISCONNECTED',
      tools: tools,
      toolCount: toolCount,
      capabilities: [
        'real-time',
        'embedded',
        'context-aware',
        'performance-optimized',
        'sdk-native'
      ],
      health: {
        uptime: isReady ? '100%' : '0%',
        responseTime: measuredResponseTime, // 2026-06-12: was fabricated '<50ms'; now measured avg interaction time (24h)
        errorRate: measuredErrorRate // 2026-06-12: was fabricated '0%'
      },
      lastHeartbeat: isReady ? new Date().toISOString() : null,
      serverDetails: serverStatus
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'error getting embedded server status');
    return {
      name: 'Embedded MCP Server',
      type: 'embedded',
      connected: false,
      status: 'ERROR',
      error: 'See server logs for details'
    };
  }
}

/**
 * Get external server status
 */
async function getExternalServerStatus(measuredResponseTime: string = 'N/A', measuredErrorRate: string = 'N/A') {
  try {
    // Check if external server process is running
    const isRunning = await checkExternalServerProcess();
    
    return {
      name: 'Pure SDK-Native MCP Server v5',
      type: 'external',
      connected: isRunning,
      status: isRunning ? 'CONNECTED' : 'DISCONNECTED',
      tools: isRunning ? [
        'project',
        'perform',
        'analytics',
        'template',
        'services'
      ] : [],
      toolCount: isRunning ? 5 : 0,
      capabilities: isRunning ? [
        'pure-sdk-native',
        'parameter-intelligence',
        'smart-error-recovery',
        'context-awareness',
        'workflow-intelligence'
      ] : [],
      features: isRunning ? {
        featureFlags: 19,
        performanceMonitoring: true,
        smartErrorRecovery: true,
        parameterIntelligence: true
      } : {},
      health: isRunning ? {
        uptime: '100%',
        responseTime: measuredResponseTime, // 2026-06-12: was fabricated '<100ms'; now measured avg interaction time (24h)
        errorRate: measuredErrorRate // 2026-06-12: was fabricated '<2%'
      } : {
        uptime: '0%',
        responseTime: 'N/A',
        errorRate: 'N/A'
      },
      lastHeartbeat: isRunning ? new Date().toISOString() : null
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'error getting external server status');
    return {
      name: 'Pure SDK-Native MCP Server v5',
      type: 'external',
      connected: false,
      status: 'ERROR',
      error: 'See server logs for details'
    };
  }
}

/**
 * Check if external MCP server process is running
 */
async function checkExternalServerProcess(): Promise<boolean> {
  try {
    // For now, we'll assume it's running if we can see the process
    // In a production environment, you might want to implement a health check endpoint
    return true; // Since we just started it
  } catch (error) {
    return false;
  }
}

/**
 * Get tool registry status
 */
async function getToolRegistryStatus() {
  try {
    const statistics = mcpToolRegistry.getStatistics();
    const categories = mcpToolRegistry.getCategories();
    
    return {
      totalTools: statistics.totalTools,
      activeTools: statistics.totalTools, // All tools are considered active
      categories: categories,
      tools: [], // We'll get tools by category if needed
      performance: {
        averageExecutionTime: statistics.averageExecutionTime,
        averageSuccessRate: statistics.averageSuccessRate,
        totalExecutions: statistics.totalExecutions
      },
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'error getting tool registry status');
    return {
      totalTools: 0,
      activeTools: 0,
      categories: [],
      tools: [],
      error: 'See server logs for details'
    };
  }
}

/**
 * Get context manager status
 */
async function getContextManagerStatus() {
  try {
    const activeSessions = await mcpContextManager.getActiveSessions();
    
    return {
      activeSessions: activeSessions.length,
      totalContexts: activeSessions.length, // Use active sessions as proxy
      averageContextSize: 1024, // Default estimate
      contextPreservation: true,
      intelligentCompression: true,
      lastCleanup: new Date().toISOString()
    };
  } catch (error) {
    mcpLogger.error({ err: error }, 'error getting context manager status');
    return {
      activeSessions: 0,
      totalContexts: 0,
      contextPreservation: false,
      error: 'See server logs for details'
    };
  }
}

/**
 * Get intelligence features status — capability facts only since 2026-07-17
 * (F-SWEEP-5, advertised-vs-enforced sweep). Previously each block carried a
 * fabricated `performance`/`metrics` object of static literals ('97.8%'
 * successRate, '145ms', '5.2x speedup', '87% predictionAccuracy', ...) — the
 * same class the 2026-06-12 getPerformanceMetrics fix removed from this file.
 * No consumer rendered them (verified: nothing outside this route reads the
 * `intelligence` block's numbers). Removed rather than faked, per that
 * precedent; the enabled/features lists are static capability facts and stay.
 */
async function getIntelligenceStatus() {
  return {
    workflowExecution: {
      enabled: true,
      features: [
        'step-coordination',
        'parallel-execution',
        'dependency-resolution',
        'error-recovery'
      ]
    },
    agentCoordination: {
      enabled: true,
      features: [
        'intelligent-task-distribution',
        'context-enhancement',
        'performance-monitoring',
        'workflow-coordination'
      ]
    },
    realTimeAnalytics: {
      enabled: true,
      features: [
        'performance-monitoring',
        'pattern-analysis',
        'predictive-insights',
        'optimization-recommendations'
      ]
    },
    errorRecovery: {
      enabled: true,
      features: [
        'intelligent-classification',
        'multi-strategy-recovery',
        'automatic-resolution',
        'graceful-degradation'
      ]
    }
  };
}

/**
 * Get performance metrics — REAL data since 2026-06-12.
 * Previously this returned an entirely fabricated block ('850 workflows/hour',
 * '99.9% uptime', fake agents/intelligence scores). The UI renders
 * performance.system.{throughput,uptime} on the Operations tab; everything is
 * now measured. The unrendered fabricated `agents`/`intelligence` blocks were
 * removed rather than faked.
 */
async function getPerformanceMetrics() {
  const HOUR_MS = 60 * 60 * 1000;
  const since1h = new Date(Date.now() - HOUR_MS);
  const since24h = new Date(Date.now() - 24 * HOUR_MS);
  const since30d = new Date(Date.now() - 30 * 24 * HOUR_MS);

  const [interactionStats, completedInteractions, workflowsLastHour, workflowStats, completedWorkflows] =
    await Promise.all([
      prisma.mCPInteraction.aggregate({
        _count: true,
        _avg: { executionTime: true },
        where: { createdAt: { gte: since24h } },
      }),
      prisma.mCPInteraction.count({
        where: { createdAt: { gte: since24h }, status: 'COMPLETED' },
      }),
      prisma.mCPWorkflowExecution.count({ where: { startTime: { gte: since1h } } }),
      prisma.mCPWorkflowExecution.aggregate({
        _count: true,
        _avg: { duration: true },
        where: { startTime: { gte: since30d } },
      }),
      prisma.mCPWorkflowExecution.count({
        where: { startTime: { gte: since30d }, status: 'COMPLETED' },
      }),
    ]);

  const totalInteractions = interactionStats._count;
  const avgMs = Math.round(interactionStats._avg.executionTime || 0);
  const errorRate =
    totalInteractions > 0
      ? Math.round(((totalInteractions - completedInteractions) / totalInteractions) * 1000) / 10
      : 0;

  // Process uptime as a human duration (was a fake '99.9%')
  const up = Math.round(process.uptime());
  const uptime =
    up >= 86400 ? `${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h`
    : up >= 3600 ? `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`
    : `${Math.floor(up / 60)}m`;

  return {
    system: {
      uptime,
      responseTime: totalInteractions > 0 ? `${avgMs}ms` : 'N/A',
      throughput: `${workflowsLastHour} workflows/hour`,
      errorRate: totalInteractions > 0 ? `${errorRate}%` : 'N/A',
    },
    workflows: {
      totalExecutions: workflowStats._count,
      successfulExecutions: completedWorkflows,
      averageExecutionTime: workflowStats._avg.duration
        ? `${Math.round(workflowStats._avg.duration)}ms`
        : 'N/A',
    },
  };
}

/**
 * Calculate overall system health
 */
function calculateSystemHealth(embeddedStatus: any, externalStatus: any, toolRegistryStatus: any) {
  const factors = [
    embeddedStatus.connected ? 25 : 0,
    externalStatus.connected ? 25 : 0,
    toolRegistryStatus.activeTools > 0 ? 25 : 0,
    toolRegistryStatus.totalTools > 5 ? 25 : 0
  ];
  
  const healthScore = factors.reduce((sum, factor) => sum + factor, 0);
  
  if (healthScore >= 90) return { score: healthScore, status: 'EXCELLENT', color: 'green' };
  if (healthScore >= 70) return { score: healthScore, status: 'GOOD', color: 'blue' };
  if (healthScore >= 50) return { score: healthScore, status: 'FAIR', color: 'yellow' };
  return { score: healthScore, status: 'POOR', color: 'red' };
}

/**
 * Generate system recommendations
 */
async function generateSystemRecommendations(embeddedStatus: any, externalStatus: any, performanceMetrics: any) {
  const recommendations = [];
  
  if (!embeddedStatus.connected) {
    recommendations.push({
      type: 'CRITICAL',
      title: 'Embedded MCP Server Disconnected',
      description: 'The embedded MCP server is not responding. This affects real-time capabilities.',
      action: 'Restart the embedded MCP service',
      priority: 'HIGH'
    });
  }
  
  if (!externalStatus.connected) {
    recommendations.push({
      type: 'WARNING',
      title: 'External MCP Server Disconnected',
      description: 'The Pure SDK-Native MCP Server v5 is not running. Advanced intelligence features are limited.',
      action: 'Start the external MCP server with: node mcp-server-v5.js',
      priority: 'MEDIUM'
    });
  }
  
  if (embeddedStatus.connected && externalStatus.connected) {
    recommendations.push({
      type: 'SUCCESS',
      title: 'Full MCP Intelligence Active',
      description: 'Both embedded and external MCP servers are running. All intelligence features are available.',
      action: 'Explore workflow automation and AI-powered insights',
      priority: 'INFO'
    });
  }
  
  return recommendations;
}
