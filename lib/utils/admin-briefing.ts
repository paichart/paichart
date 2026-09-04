/**
 * Admin Briefing Generator
 * Phase 6 of Admin Intelligence Implementation
 *
 * Transforms metrics into narrative "storytelling" for admins.
 * Addresses Reed Hastings insight: "interpret the world"
 *
 * Template-based approach (no AI required).
 * Can be upgraded to AI-generated in Phase 11.
 */

export interface PortfolioHealthSummary {
  healthScore: number;
  totalPOVs: number;
  activePOVs: number;
  atRiskPOVs: number;
  overdueTasks: number;
  avgCompletionRate: number;
}

export interface AtRiskPOV {
  id: string;
  title: string;
  overdueTaskCount: number;
  completionRate: number;
}

export interface SystemHealthSummary {
  overallHealth: number;
  agentSuccessRate: number;
  errorRate: number;
  activeExecutions: number;
}

export interface QueueHealth {
  pendingExecutions: number;
  runningExecutions: number;
  stuckExecutions: number;
}

export interface ToolHealth {
  toolName: string;
  errorRate: number;
  totalExecutions: number;
}

export interface InfrastructureStatus {
  systemHealth: {
    score: number;
    status: string;
  };
  servers: {
    connected: number;
    total: number;
  };
}

export interface BriefingData {
  portfolioHealth?: {
    summary: PortfolioHealthSummary;
    atRiskPOVs: AtRiskPOV[];
  };
  systemHealth?: {
    summary: SystemHealthSummary;
    queueHealth: QueueHealth;
    toolHealth: ToolHealth[];
  };
  infrastructure?: InfrastructureStatus;
}

export interface AdminBriefing {
  summary: string;
  highlights: string[];
  focus: string;
  sentiment: 'positive' | 'attention' | 'critical';
  generatedAt: Date;
}

/**
 * Generate a narrative briefing from admin dashboard data
 */
export function generateAdminBriefing(data: BriefingData): AdminBriefing {
  const highlights: string[] = [];
  let sentiment: 'positive' | 'attention' | 'critical' = 'positive';
  let focusItem: string | null = null;

  // Portfolio health interpretation
  if (data.portfolioHealth) {
    const health = data.portfolioHealth.summary.healthScore;
    const atRisk = data.portfolioHealth.atRiskPOVs;

    if (health >= 80) {
      highlights.push(`Portfolio is healthy at ${health}%.`);
    } else if (health >= 60) {
      highlights.push(`Portfolio health needs attention (${health}%).`);
      if (sentiment === 'positive') sentiment = 'attention';
    } else {
      highlights.push(`Portfolio health is critical (${health}%).`);
      sentiment = 'critical';
    }

    if (atRisk.length > 0) {
      const topPOVs = atRisk.slice(0, 2);
      const names = topPOVs.map(p => p.title).join(' and ');
      highlights.push(`${atRisk.length} POV${atRisk.length > 1 ? 's' : ''} at risk: ${names}.`);

      if (!focusItem) {
        focusItem = `Review ${topPOVs[0].title} blockers`;
      }
      if (sentiment === 'positive') sentiment = 'attention';
    }

    if (data.portfolioHealth.summary.overdueTasks > 0) {
      highlights.push(`${data.portfolioHealth.summary.overdueTasks} overdue tasks across portfolio.`);
    }
  }

  // Execution performance interpretation
  if (data.systemHealth) {
    const successRate = data.systemHealth.summary.agentSuccessRate;
    const stuckCount = data.systemHealth.queueHealth.stuckExecutions;

    if (successRate >= 90) {
      highlights.push(`Execution engine performing well (${successRate}% success).`);
    } else if (successRate >= 70) {
      highlights.push(`Execution engine at ${successRate}% success rate.`);
      if (sentiment === 'positive') sentiment = 'attention';
    } else {
      highlights.push(`Execution engine struggling (${successRate}% success).`);
      sentiment = 'critical';
      if (!focusItem) {
        focusItem = 'Investigate execution failures';
      }
    }

    // Stuck executions
    if (stuckCount > 0) {
      highlights.push(`${stuckCount} stuck execution${stuckCount > 1 ? 's' : ''} detected.`);
      if (sentiment === 'positive') sentiment = 'attention';
      if (stuckCount > 2) sentiment = 'critical';
      if (!focusItem) {
        focusItem = 'Clear stuck executions';
      }
    }

    // Problematic tools
    const badTools = data.systemHealth.toolHealth.filter(t => t.errorRate > 30);
    if (badTools.length > 0) {
      const worstTool = badTools[0];
      highlights.push(`${worstTool.toolName} showing elevated errors (${worstTool.errorRate}%).`);
      if (sentiment === 'positive') sentiment = 'attention';
      if (!focusItem) {
        focusItem = `Investigate ${worstTool.toolName} errors`;
      }
    }
  }

  // Infrastructure interpretation
  if (data.infrastructure) {
    const infra = data.infrastructure;
    if (infra.servers.connected < infra.servers.total) {
      highlights.push(`${infra.servers.total - infra.servers.connected} MCP server(s) disconnected.`);
      sentiment = 'critical';
      if (!focusItem) {
        focusItem = 'Restore MCP server connectivity';
      }
    }
  }

  // Build summary paragraph
  const summary = highlights.slice(0, 4).join(' ');

  // Default focus if everything is fine
  if (!focusItem) {
    focusItem = 'All systems nominal';
  }

  return {
    summary,
    highlights,
    focus: focusItem,
    sentiment,
    generatedAt: new Date()
  };
}

/**
 * Get sentiment-based styling configuration
 * Uses global CSS variables for consistent theming across light/dark/dusk modes
 */
export function getBriefingSentimentConfig(sentiment: AdminBriefing['sentiment']) {
  switch (sentiment) {
    case 'positive':
      return {
        borderColor: 'border-l-success',
        bgColor: 'bg-success/10',
        iconColor: 'text-success',
        badgeVariant: 'success' as const,
      };
    case 'attention':
      return {
        borderColor: 'border-l-warning',
        bgColor: 'bg-warning/10',
        iconColor: 'text-warning',
        badgeVariant: 'warning' as const,
      };
    case 'critical':
      return {
        borderColor: 'border-l-destructive',
        bgColor: 'bg-destructive/10',
        iconColor: 'text-destructive',
        badgeVariant: 'destructive' as const,
      };
  }
}
