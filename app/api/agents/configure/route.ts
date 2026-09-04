import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { configureAgent, ConfigureAgentParams } from '@/lib/agents/services/agent-configuration-service';
import { MCPParameterSchemas } from '@/lib/validation/mcp-action-validation';
import { mcpLogger } from '@/lib/logger';

const log = mcpLogger.child({ module: 'AgentsConfigureAPI' });

// SECURITY (2026-05-14 sec-ops P0 finding F-01): the REST endpoint reuses
// the same Zod schema as the MCP `agent.configure` handler. The schema
// applies detectPromptInjection refines to every text field
// (agentRole/prompt/agentLog) that flows into the LLM execution context
// via lib/services/agentExecutionEngine.ts:2075,2192.
// Before this fix, the route did only a `as ConfigureAgentParams` TS cast
// + `body.taskId` truthy check — every refine was bypassed.
const AgentConfigureSchema = MCPParameterSchemas['agent.configure'];

/**
 * POST /api/agents/configure
 *
 * REST endpoint for the agent configuration service.
 * Routes through the same validation, template merging, tool resolution,
 * and context generation as the MCP agent.configure handler.
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const validation = AgentConfigureSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // Read validated data — refines (incl. detectPromptInjection on
    // prompt/agentRole) and transforms (alias normalization via
    // normalizeAliases) have run.
    const validated = validation.data as ConfigureAgentParams;

    const result = await configureAgent(validated, {
      userId: authUser.userId,
      email: authUser.email,
      role: authUser.role,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    log.error({ err: error }, 'agent configuration failed');

    const status = error.message?.includes('not found') ? 404
      : error.message?.includes('access') ? 403
      : 400;

    return NextResponse.json(
      { success: false, error: error.message },
      { status }
    );
  }
}
