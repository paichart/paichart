'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Server,
  Wrench,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  Plus,
  Zap,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  BLOOMBERG_HEADER,
  BLOOMBERG_LIST,
  BLOOMBERG_COLORS,
  BLOOMBERG_TYPOGRAPHY
} from '@/lib/constants/bloomberg-styles';
import { cn } from '@/lib/utils';

// Types
interface Service {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  category: string;
  ownerEmail?: string | null;  // Owner email from configuration
  capabilities: {
    tools?: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    } | string>;
    categories?: string[];
  };
  healthMetrics?: {
    successRate?: number;
    responseTime?: number;
  };
}

// Helper: Check if service has any of the specified categories
const hasCategory = (service: Service, ...categories: string[]): boolean => {
  const serviceCategories = service.capabilities?.categories || [];
  return categories.some(cat =>
    serviceCategories.some(sc => sc.toLowerCase().includes(cat.toLowerCase()))
  );
};

// Helper: Check if service has a specific tool
const hasTool = (service: Service, toolName: string): boolean => {
  const tools = service.capabilities?.tools || [];
  return tools.some(t => {
    const name = typeof t === 'string' ? t : t.name;
    return name.toLowerCase() === toolName.toLowerCase();
  });
};

interface Recommendation {
  id: string;
  type: 'service-combo' | 'template' | 'tool-chain' | 'parameter-hint' | 'automation' | 'workflow-improvement';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  services: string[];
  suggestedSteps?: Array<{
    service: string;
    tool: string;
    arguments?: Record<string, unknown>;
  }>;
}

/**
 * RecommendationEngine - Discover services, tools, and workflow suggestions
 *
 * Features:
 * - Browse available MCP Hub services
 * - View tool details and parameters
 * - AI-generated workflow recommendations
 * - Quick "Use this" to create workflows
 */
interface RecommendationEngineProps {
  userRole: string;
}

export function RecommendationEngine({ userRole }: RecommendationEngineProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [expandedRecommendations, setExpandedRecommendations] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [generatingForService, setGeneratingForService] = useState<string | null>(null);

  // Generate recommendations based on available services
  const generateRecommendations = useCallback((serviceList: Service[]) => {
    const recs: Recommendation[] = [];
    // Safety check: ensure serviceList is an array
    const safeList = Array.isArray(serviceList) ? serviceList : [];
    const activeServices = safeList.filter(s => s.status === 'ACTIVE');

    // Category-based service discovery (smarter than name matching)
    // Find services by capability categories, not by hardcoded names
    const projectService = activeServices.find(s =>
      hasTool(s, 'project') || hasTool(s, 'perform')
    );
    const monitoringServices = activeServices.filter(s =>
      hasCategory(s, 'monitoring', 'error-tracking', 'observability') ||
      hasTool(s, 'list_issues') || hasTool(s, 'get_issue')
    );
    const notificationServices = activeServices.filter(s =>
      hasCategory(s, 'notifications', 'messaging', 'communication')
    );
    const automationServices = activeServices.filter(s =>
      hasCategory(s, 'browser-automation', 'automation', 'web-scraping')
    );

    // POV + Task combo (uses tool detection)
    if (projectService) {
      recs.push({
        id: 'combo-pov-task',
        type: 'service-combo',
        title: 'POV to Task Automation',
        description: 'Automatically create tasks based on POV status changes',
        impact: 'high',
        services: [projectService.name],
        suggestedSteps: [
          { service: projectService.name, tool: 'project', arguments: { action: 'pov.list', status: 'IN_PROGRESS' } },
          { service: projectService.name, tool: 'project', arguments: { action: 'task.list', povId: '{{step.0.output.data[0].id}}' } }
        ]
      });
    }

    // Monitoring Service + Task combo (generic - works with any monitoring service)
    monitoringServices.forEach(monitoringService => {
      if (projectService) {
        recs.push({
          id: `combo-monitoring-task-${monitoringService.id}`,
          type: 'service-combo',
          title: `${monitoringService.name} to Task`,
          description: `Convert ${monitoringService.name} issues into actionable tasks automatically`,
          impact: 'high',
          services: [monitoringService.name, projectService.name],
          suggestedSteps: [
            { service: monitoringService.name, tool: 'list_issues', arguments: { status: 'unresolved' } },
            { service: projectService.name, tool: 'perform', arguments: { action: 'task.create', title: '{{step.0.output.data[0].title}}', description: `Auto-created from ${monitoringService.name}` } }
          ]
        });
      }
    });

    // Template recommendations
    recs.push({
      id: 'template-testing',
      type: 'template',
      title: 'Testing Workflow Template',
      description: 'Standard testing workflow pattern for POV validation',
      impact: 'medium',
      services: ['paichart-project-service'],
      suggestedSteps: [
        { service: 'paichart-project-service', tool: 'project', arguments: { action: 'task.list', status: 'IN_PROGRESS', limit: 5 } },
        { service: 'paichart-project-service', tool: 'perform', arguments: { action: 'task.complete', taskId: '{{step.0.output.data[0].id}}', completionNotes: 'Completed via workflow automation' } }
      ]
    });

    recs.push({
      id: 'template-analysis',
      type: 'template',
      title: 'POV Status Report Template',
      description: 'List active POVs and get detailed information for reporting',
      impact: 'medium',
      services: ['paichart-project-service'],
      suggestedSteps: [
        { service: 'paichart-project-service', tool: 'project', arguments: { action: 'pov.list', status: 'IN_PROGRESS', limit: 10 } },
        { service: 'paichart-project-service', tool: 'project', arguments: { action: 'pov.details', povId: '{{step.0.output.data[0].id}}' } }
      ]
    });

    // Browser automation + notification combo (uses category arrays)
    const browserService = automationServices.find(s => hasTool(s, 'take_screenshot'));
    const notificationService = notificationServices[0]; // First notification service

    if (browserService && notificationService) {
      recs.push({
        id: 'combo-screenshot-notify',
        type: 'service-combo',
        title: 'Dashboard Screenshot Report',
        description: 'Capture dashboard screenshot and send email notification',
        impact: 'high',
        services: [browserService.name, notificationService.name],
        suggestedSteps: [
          { service: browserService.name, tool: 'take_screenshot', arguments: { url: 'https://paichart.app/dashboard', fullPage: true } },
          { service: notificationService.name, tool: 'send', arguments: { channel: 'email', recipients: [{ id: 'team', address: 'team@company.com' }], message: { subject: 'Dashboard Screenshot Report', body: 'Dashboard screenshot captured successfully. See attachment.', priority: 'normal' } } }
        ]
      });
    }

    // Blocked task escalation template (uses category-discovered notification service)
    if (projectService && notificationService) {
      recs.push({
        id: 'combo-blocked-escalate',
        type: 'service-combo',
        title: 'Blocked Task Escalation',
        description: 'Find blocked tasks and send escalation notifications',
        impact: 'high',
        services: [projectService.name, notificationService.name],
        suggestedSteps: [
          { service: projectService.name, tool: 'project', arguments: { action: 'task.list', status: 'BLOCKED', limit: 20 } },
          { service: notificationService.name, tool: 'escalate', arguments: { escalationPath: [{ channel: 'email', recipients: [{ id: 'owner', address: 'owner@company.com' }], delayMinutes: 0 }, { channel: 'slack', recipients: [{ id: 'team', address: '#project-alerts' }], delayMinutes: 30 }], message: { subject: 'Blocked Tasks Alert', body: 'Found blocked tasks requiring attention.', priority: 'high' }, maxEscalations: 3 } }
        ]
      });
    }

    return recs;
  }, []);

  // Fetch services and generate recommendations
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch services from MCP Hub or internal endpoint
      const servicesResponse = await fetch('/api/mcp/services');
      if (servicesResponse.ok) {
        const data = await servicesResponse.json();
        setServices(data.data?.services || []);

        // Generate hardcoded recommendations
        const hardcodedRecs = generateRecommendations(data.data?.services || []);

        // Fetch auto-generated recommendations from database
        const autoGenResponse = await fetch('/api/mcp/service-recommendations?limit=50', {
          credentials: 'include' // Required for authentication cookies
        });

        if (autoGenResponse.ok) {
          const autoGenData = await autoGenResponse.json();
          const autoGenRecs = autoGenData.data || [];

          // Merge: hardcoded first (curated quality), then auto-generated
          // Deduplicate by title to avoid duplicates
          const allRecs = [...hardcodedRecs];
          const existingTitles = new Set(hardcodedRecs.map(r => r.title));

          for (const rec of autoGenRecs) {
            if (!existingTitles.has(rec.title)) {
              allRecs.push(rec);
              existingTitles.add(rec.title);
            }
          }

          setRecommendations(allRecs);
        } else {
          // Fallback: use only hardcoded if DB fetch fails
          setRecommendations(hardcodedRecs);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setIsLoading(false);
    }
  }, [generateRecommendations]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle service expansion
  const toggleService = (serviceId: string) => {
    setExpandedServices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serviceId)) {
        newSet.delete(serviceId);
      } else {
        newSet.add(serviceId);
      }
      return newSet;
    });
  };

  const toggleRecommendation = (recId: string) => {
    setExpandedRecommendations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recId)) {
        newSet.delete(recId);
      } else {
        newSet.add(recId);
      }
      return newSet;
    });
  };

  // Generate recommendations for a service (admin-only)
  const handleGenerateRecommendations = async (serviceId: string, serviceName: string) => {
    if (!userRole || (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN')) {
      alert('Admin access required to generate recommendations');
      return;
    }

    setGeneratingForService(serviceId);

    try {
      const response = await fetch('/api/mcp/service-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ serviceId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate recommendations');
      }

      const result = await response.json();
      alert(`${result.message}\n\nRefreshing recommendations...`);

      // Refresh recommendations to show new ones
      await fetchData();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to generate recommendations'}`);
    } finally {
      setGeneratingForService(null);
    }
  };

  // Create workflow from recommendation
  const handleUseRecommendation = async (rec: Recommendation) => {
    if (!rec.suggestedSteps || rec.suggestedSteps.length === 0) {
      alert('This recommendation does not have predefined steps. Please create a workflow manually.');
      return;
    }

    const workflowName = prompt('Enter workflow name:', rec.title.toLowerCase().replace(/\s+/g, '-'));
    if (!workflowName) return;

    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workflowName,
          description: rec.description,
          category: 'automation',
          steps: {
            steps: rec.suggestedSteps,
            executionMode: 'sequential',
            failureStrategy: 'stop',
            timeout: 60000
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[Create Workflow] Full error response:', errorData);

        // Show detailed validation errors
        const errorMsg = errorData.error?.details
          ? `Validation failed:\n${JSON.stringify(errorData.error.details, null, 2)}`
          : errorData.error?.message || errorData.error || 'Failed to create workflow';

        throw new Error(errorMsg);
      }

      alert(`Workflow "${workflowName}" created successfully!`);
    } catch (err) {
      console.error('[Create Workflow] Error:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to create workflow'}`);
    }
  };

  // Filter services by search (with safety checks)
  const filteredServices = (Array.isArray(services) ? services : []).filter(s =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (s.category?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  // Render status indicator
  const renderStatus = (status: string) => {
    const config: Record<string, { icon: typeof CheckCircle2; color: string }> = {
      ACTIVE: { icon: CheckCircle2, color: 'text-emerald-400' },
      INACTIVE: { icon: XCircle, color: 'text-gray-400' },
      MAINTENANCE: { icon: AlertCircle, color: 'text-yellow-400' }
    };
    const { icon: Icon, color } = config[status] || config.INACTIVE;
    return <Icon className={cn('h-4 w-4', color)} />;
  };

  // Render impact badge
  const renderImpact = (impact: string) => {
    const colors: Record<string, string> = {
      high: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      low: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    };
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded border', colors[impact] || colors.low)}>
        {impact.toUpperCase()}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Loading services...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4 h-full">
      {/* Recommendations — now on the RIGHT (order-2) */}
      <div className="col-span-5 order-2 bg-background border border-border rounded overflow-hidden flex flex-col">
        <div className={BLOOMBERG_HEADER.container}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className={BLOOMBERG_HEADER.title}>RECOMMENDATIONS</span>
              <span className="text-muted-foreground text-xs">
                ({recommendations.length})
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchData}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto divide-y divide-border">
          {recommendations.map((rec) => {
            const isExpanded = expandedRecommendations.has(rec.id);
            const hasSteps = rec.suggestedSteps && rec.suggestedSteps.length > 0;

            return (
              <div key={rec.id} className="p-3 hover:bg-accent transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {hasSteps && (
                        <button
                          onClick={() => toggleRecommendation(rec.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </button>
                      )}
                      <span className="font-mono text-sm">{rec.title}</span>
                      {renderImpact(rec.impact)}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {rec.description}
                    </p>
                    {rec.services.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {rec.services.map(s => (
                          <span
                            key={s}
                            className="text-xs px-2 py-0.5 bg-muted rounded font-mono"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Workflow Steps (Expanded) */}
                    {hasSteps && isExpanded && (
                      <div className="mt-3 space-y-2 border-l-2 border-amber-400/30 pl-3">
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          Workflow Steps:
                        </div>
                        {rec.suggestedSteps!.map((step, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-amber-400">
                                Step {idx + 1}:
                              </span>
                              <span className="text-xs font-mono text-muted-foreground">
                                {step.service}
                              </span>
                              <span className="text-xs text-muted-foreground">→</span>
                              <span className="text-xs font-mono">{step.tool}</span>
                            </div>
                            {step.arguments && Object.keys(step.arguments).length > 0 && (
                              <div className="ml-4 text-xs font-mono text-muted-foreground bg-muted/50 rounded p-2">
                                {JSON.stringify(step.arguments, null, 2)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {hasSteps && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUseRecommendation(rec)}
                      className="h-7 gap-1 text-amber-400 hover:text-amber-300 flex-shrink-0"
                    >
                      <Plus className="h-3 w-3" />
                      Use
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Available Services — now on the LEFT (order-1) */}
      <div className="col-span-7 order-1 bg-background border border-border rounded overflow-hidden flex flex-col">
        <div className={BLOOMBERG_HEADER.container}>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-amber-400" />
            <span className={BLOOMBERG_HEADER.title}>AVAILABLE SERVICES</span>
            <span className="text-muted-foreground text-xs">
              ({filteredServices.length})
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="p-4 text-center text-red-400 text-xs">{error}</div>
          ) : filteredServices.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">
              No services found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredServices.map((service) => (
                <div key={service.id} className="bg-background">
                  {/* Service Header */}
                  <button
                    onClick={() => toggleService(service.id)}
                    className="w-full p-3 flex items-center justify-between hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {renderStatus(service.status)}
                      <div className="text-left">
                        <div className="font-mono text-sm">{service.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {service.category} | {service.capabilities?.tools?.length || 0} tools
                        </div>
                        {service.ownerEmail && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Owner: {service.ownerEmail}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {service.healthMetrics?.successRate != null && (
                        <span className={cn(
                          'text-xs font-mono',
                          service.healthMetrics.successRate >= 90 ? 'text-emerald-400' :
                          service.healthMetrics.successRate >= 70 ? 'text-yellow-400' : 'text-red-400'
                        )}>
                          {service.healthMetrics.successRate.toFixed(0)}%
                        </span>
                      )}
                      {expandedServices.has(service.id) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Service Tools */}
                  {expandedServices.has(service.id) && (
                    <div className="border-t border-border bg-muted/30 p-3">
                      {service.description && (
                        <p className="text-xs text-muted-foreground mb-3">
                          {service.description}
                        </p>
                      )}
                      <h4 className="text-xs text-muted-foreground font-mono mb-2">
                        TOOLS ({service.capabilities?.tools?.length || 0})
                      </h4>
                      <div className="space-y-2">
                        {(service.capabilities?.tools || []).map((tool, index) => {
                          const toolName = typeof tool === 'string' ? tool : tool.name;
                          const toolDesc = typeof tool === 'string' ? null : tool.description;
                          return (
                            <div
                              key={index}
                              className="flex items-start gap-2 p-2 bg-background rounded border border-border"
                            >
                              <Wrench className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <div className="font-mono text-sm">{toolName}</div>
                                {toolDesc && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {toolDesc}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {(!service.capabilities?.tools || service.capabilities.tools.length === 0) && (
                          <p className="text-xs text-muted-foreground">No tools registered</p>
                        )}
                      </div>

                      {/* Generate Recommendations Button (Admin Only) */}
                      {(userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateRecommendations(service.id, service.name)}
                            disabled={generatingForService === service.id}
                            className="w-full gap-2 text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
                          >
                            {generatingForService === service.id ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Zap className="h-3 w-3" />
                                Generate Recommendations
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
