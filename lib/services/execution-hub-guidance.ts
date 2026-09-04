/**
 * Shared MCP-Hub tool guidance + tool-name derivation (Axis-6 head convergence, 2026-07-06).
 *
 * ONE implementation of (a) the consolidated tool-name derivation and (b) the "MCP Hub Tool Routing"
 * system-prompt block — called by BOTH execution adapters (`agentExecutionEngine.ts` +
 * `app/api/pov/agent/execute/stream/route.ts`). Before Axis 6 these were duplicated verbatim
 * (CONSOLIDATED_TOOLS / LEGACY_TOOL_MAP) or divergent (engine: structured routing guidance; stream:
 * a flat one-line tool list). Canonical (panel pc/ts/bc GREEN, option (b)): the engine's structured
 * routing guidance is shared; tool ENUMERATION lives in USER-prompt §7 (`build-agent-prompt-body.ts`,
 * both paths), so the system prompt carries ROUTING guidance only — the stream's flat line is retired
 * as a strictly-inferior duplicate of §7.
 */

/** The six consolidated MCP tool names (was duplicated verbatim in both adapters). */
export const CONSOLIDATED_TOOLS = ['project', 'perform', 'analytics', 'template', 'services', 'registry'];

/** Legacy → consolidated tool-name map (was duplicated verbatim in both adapters). */
export const LEGACY_TOOL_MAP: Record<string, string> = {
  'list_povs': 'project', 'get_pov_details': 'project',
  'list_tasks': 'project', 'get_task_context': 'project',
  'execute_task_action': 'perform', 'agent_results': 'perform',
  'get_ai_recommendations': 'analytics', 'analyze_team_performance': 'analytics',
  'list_agent_templates': 'template', 'get_agent_template_details': 'template',
  'call_service': 'services', 'discover_services': 'services', 'execute_workflow': 'services',
  'get_service_health': 'services', 'get_workflow_status': 'services',
  'cancel_workflow': 'services', 'list_workflow_executions': 'services',
  'register_service': 'registry', 'list_my_services': 'registry',
  'update_service': 'registry', 'delete_service': 'registry', 'get_service_tools': 'registry',
};

/**
 * Resolve the effective consolidated tool-name list from `task.mcpContext.tools`.
 * Byte-reproduces the prior inline derivation in BOTH adapters:
 *  - extract names (string | `.name` | `.tool`), drop falsy;
 *  - `fallbackTools` applies ONLY when `mcpContext.tools` was ABSENT (engine's `|| config.mcpTools`;
 *    present-but-empty stays empty — `?? fallback` matches the `||` semantics here since a filtered
 *    array is truthy);
 *  - map legacy → consolidated, dedup;
 *  - default to CONSOLIDATED_TOOLS when the result is empty.
 * (The `.tool` extraction is engine-canonical; on the stream it's a latent edge-fix — common-case
 *  string/`.name` tools derive identically, so §7 stays byte-unchanged.)
 */
export function deriveMcpToolNames(mcpContextTools: unknown, fallbackTools?: string[]): string[] {
  let rawTools: string[] | undefined;
  if (Array.isArray(mcpContextTools)) {
    rawTools = mcpContextTools
      .map((tool: any) => {
        if (typeof tool === 'string') return tool;
        if (tool && typeof tool === 'object') return tool.name || tool.tool || null;
        return null;
      })
      .filter(Boolean) as string[];
  }
  const base = rawTools ?? fallbackTools ?? [];
  const mapped = new Set<string>();
  for (const name of base) mapped.add(LEGACY_TOOL_MAP[name] || name);
  let names = [...mapped];
  if (names.length === 0) names = [...CONSOLIDATED_TOOLS];
  return names;
}

/** Minimal structural deps so the unit test can pass a fake prisma/logger (no @/lib coupling). */
type HubPrisma = {
  mCPTool: { findMany: (args: any) => Promise<Array<{ name: string; capabilities: unknown }>> };
};
type HubLogger = { warn: (...args: any[]) => void };

/**
 * Build the "MCP Hub Tool Routing" system-prompt block: instructs the LLM to route external service
 * calls through the `services` tool (WRONG/RIGHT), then lists the globally-available ACTIVE services
 * + their tools. Callers gate on `mcpTools.includes('services')`. Returns '' only on nothing to add.
 */
export async function buildHubToolGuidance(
  mcpTools: string[],
  prisma: HubPrisma,
  logger: HubLogger,
): Promise<string> {
  // Query MCPTool table for service-to-tool mappings.
  // visibility: global-by-design (transparency model) — enumeration is intentionally public and
  // un-scoped (mirrors services(action:'discover')); call-authorization is enforced SEPARATELY at
  // services(action:'call') via checkServiceAccess. A future PRIVATE / owner-scoped-service feature
  // MUST add scoping HERE so it does not silently inherit global enumeration through this chokepoint.
  let serviceToolMap: Record<string, string[]> = {};
  try {
    const activeServices = await prisma.mCPTool.findMany({
      where: { status: 'ACTIVE' },
      select: { name: true, capabilities: true },
    });

    for (const service of activeServices) {
      const caps = service.capabilities as any;
      if (caps?.tools && Array.isArray(caps.tools)) {
        serviceToolMap[service.name] = caps.tools.map((t: any) => typeof t === 'string' ? t : t.name);
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to query MCPTool table for hub service mappings');
  }

  const gatewayTools = ['services'];
  const hubServiceTools = mcpTools.filter(t => !gatewayTools.includes(t));

  let guidance = '\n\n---\n\n## MCP Hub Tool Routing\n\n';
  guidance += 'IMPORTANT: To use external services, you MUST use the `services` tool.\n';
  guidance += 'Do NOT call service tool names directly. Route ALL external service calls through `services`.\n\n';

  guidance += 'WRONG: get_forecast(location: "Sydney, Australia")\n';
  guidance += 'RIGHT: services(action: "call", targetService: "weather-api", tool: "get_forecast", arguments: {location: "Sydney, Australia"})\n\n';

  // List available services and their tools
  if (Object.keys(serviceToolMap).length > 0) {
    guidance += 'Available services and tools:\n';
    for (const [serviceName, tools] of Object.entries(serviceToolMap)) {
      guidance += `- ${serviceName}: ${tools.join(', ')}\n`;
    }
    guidance += '\n';
  }

  // Short-term BUG-005 fix: location format guidance
  // TODO: Remove once P2 JSON schema descriptions carry format requirements
  if (hubServiceTools.some(t => t.includes('weather') || t.includes('forecast'))) {
    guidance += 'Note: Use comma-separated format for locations (e.g., "Sydney, Australia" not "Sydney Australia").\n';
  }

  return guidance;
}
