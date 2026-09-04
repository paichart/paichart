import { TokenPayload } from '@/lib/types/auth';
import { handleAgentConfigure } from '@/lib/mcp/tasks/action/handlers/agent/agent-configure-handler';
import { mcpLogger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';

const log = mcpLogger.child({ module: 'AgentConfigurationService' });

/**
 * Clean interface for agent configuration — used by REST API and future Builder.
 * Wraps the battle-tested handleAgentConfigure handler, normalizing parameters
 * from the REST/UI convention to the MCP handler's expected format.
 */
export interface ConfigureAgentParams {
  taskId: string;
  agentRole?: string;
  agentTemplateId?: string;
  agentTemplateName?: string;
  prompt?: string;
  inputContext?: Record<string, any>;
  modelParameters?: Record<string, any>;
  mcpTools?: string[];
  maxRetries?: number;
  timeout?: number;
}

export interface ConfigureAgentResult {
  actionId: string;
  action: string;
  status: string;
  timestamp: string;
  result: {
    task: {
      id: string;
      title: string;
      agentRole: string | null;
      agentTemplateId: string | null;
      prompt: string | null;
      modelParameters: any;
    };
    agentTemplate?: any;
    message: string;
  };
}

/**
 * Configure an agent on a task using the full validation, template merging,
 * tool resolution, and context generation pipeline.
 *
 * This is a thin wrapper over handleAgentConfigure that:
 * 1. Normalizes REST/UI parameter names to the handler's expected format
 * 2. Generates an actionId for tracking
 * 3. Returns a clean typed result
 *
 * The handler itself does: validation, POV access check, template fuzzy lookup,
 * MCP tool discovery, context merging, token management, and atomic DB writes.
 */
export async function configureAgent(
  params: ConfigureAgentParams,
  user: TokenPayload
): Promise<ConfigureAgentResult> {
  const actionId = uuidv4();

  log.info({ taskId: params.taskId, actionId }, 'configureAgent called via service');

  // Pass through to the handler — it handles all validation, merging, and writes
  const result = await handleAgentConfigure(
    {
      taskId: params.taskId,
      agentRole: params.agentRole,
      agentTemplateId: params.agentTemplateId,
      agentTemplateName: params.agentTemplateName,
      prompt: params.prompt,
      inputContext: params.inputContext,
      modelParameters: params.modelParameters,
      mcpTools: params.mcpTools,
      maxRetries: params.maxRetries,
      timeout: params.timeout,
    },
    user,
    actionId
  );

  return result as ConfigureAgentResult;
}
