/**
 * Agent Template Tab Types
 * 
 * Shared types and interfaces for agent-specific template tabs.
 */

/**
 * Base props for all agent template tabs
 */
export interface AgentTabProps {
  // Common props that all agent tabs might need
  templateId?: string;
  isReadOnly?: boolean;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
}

/**
 * Workflow integration configuration types
 */
export interface WorkflowIntegrationConfig {
  participationMode: 'coordinator' | 'executor' | 'reviewer' | 'hybrid';
  coordinationPatterns: ('sequential' | 'parallel' | 'hierarchical')[];
  contextInheritance: {
    conversationHistory: 'full' | 'summary' | 'none';
    toolExecutions: 'full' | 'results_only' | 'none';
    privateData: 'preserve' | 'filter' | 'exclude';
    customData: Record<string, 'inherit' | 'transform' | 'exclude'>;
  };
  handoffTriggers: {
    onSuccess: 'immediate' | 'delayed' | 'conditional';
    onFailure: 'retry' | 'escalate' | 'alternative_agent';
    onTimeout: 'extend' | 'handoff' | 'abort';
    conditions?: Record<string, any>;
  };
  stepCoordination: {
    dependencies: string[];
    timeout: number;
    retryPolicy: {
      maxRetries: number;
      backoffMs: number;
      retryableErrors: string[];
    };
  };
  performanceThresholds: {
    maxExecutionTime: number;
    minSuccessRate: number;
    maxTokenUsage: number;
  };
}

/**
 * MCP tool configuration types
 */
export interface MCPToolConfig {
  selectedTools: {
    toolId: string;
    serverName: string;
    toolName: string;
    configuration: Record<string, any>;
    priority: number;
  }[];
  toolUsagePatterns: {
    primary: string[];
    secondary: string[];
    restricted: string[];
  };
  toolCoordination: {
    parallelExecution: boolean;
    toolDependencies: Record<string, string[]>;
    conflictResolution: 'priority' | 'user_choice' | 'automatic';
  };
}

/**
 * Token management configuration types
 */
export interface TokenManagementConfig {
  budgetLimits: {
    maxPerRequest: number;
    maxPerHour?: number;
    maxPerDay?: number;
    alertThreshold: number;
  };
  optimization: {
    enableDynamicAllocation: boolean;
    enablePromptCompression: boolean;
    enableCaching: boolean;
    complexityMultiplier: number;
    adaptiveScaling: boolean;
  };
  costTracking: {
    enableCostAlerts: boolean;
    dailyBudget: number;
    monthlyBudget: number;
    costPerToken: number;
  };
  performanceSettings: {
    priorityMode: 'speed' | 'quality' | 'balanced' | 'cost';
    qualityThreshold: number;
    speedThreshold: number;
    enablePerformanceOptimization: boolean;
  };
}

/**
 * Security configuration types
 */
export interface SecurityConfig {
  requiredPermissions: string[];
  dataAccessLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  auditLevel: 'basic' | 'detailed' | 'comprehensive';
  complianceRequirements: string[];
}

/**
 * Testing configuration types
 */
export interface TestingConfig {
  validationRules: {
    inputValidation: Record<string, any>;
    outputValidation: Record<string, any>;
    performanceValidation: Record<string, any>;
  };
  simulationSettings: {
    enableWorkflowSimulation: boolean;
    sampleDataSets: Record<string, any>[];
    performanceBaselines: Record<string, number>;
  };
}

/**
 * Complete agent template metadata structure
 */
export interface AgentTemplateMetadata {
  workflowIntegration?: WorkflowIntegrationConfig;
  mcpToolConfiguration?: MCPToolConfig;
  tokenManagement?: TokenManagementConfig;
  securityConfiguration?: SecurityConfig;
  testingConfiguration?: TestingConfig;
}
