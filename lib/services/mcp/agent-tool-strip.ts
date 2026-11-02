/**
 * agent-tool-strip — the actions (and their parameters) an AGENT must never be offered, and the ONE function that removes
 * them from a tool definition. PURE: no I/O, no module state.
 *
 * Moved verbatim out of `serverManager.ts` (PLATFORM-HELD-BYTES G3 entry, HUB-P2-2, 2026-10-16) so the leg replay lab's
 * `toolDefs()` can apply the same strip production applies at `getToolDefinitions` — without loading the server manager,
 * whose constructor starts a health-check interval. `serverManager.ts` re-exports all three names.
 */
/**
 * PLATFORM-HELD-BYTES Stage B V-7: actions an AGENT must never be offered. `getToolDefinitions` is the one choke point both agent
 * build sites use (the engine and the GUI stream route), so the action is removed HERE — from the action enum AND from the
 * description text. On a CLONE: `getToolDefinition` returns the shared registry / static object, which agent-configure,
 * /api/mcp/status and /api/mcp/tasks/context also read, so an in-place edit would rewrite their view (hub N-c). The handler
 * refuses the action on the agent path anyway (`transport: 'embedded'`); this keeps it out of the model's sight.
 */
export const AGENT_FORBIDDEN_ACTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({ project: Object.freeze(['held.get']) });
/** The parameters only a forbidden action takes — stripped with it, so an agent's tool bytes equal the pre-held.get schema
 *  (push-2 code review HUB-P2-1 / ARCH-P2-2: otherwise EVERY agent in every role gets a changed `project` definition). */
export const AGENT_FORBIDDEN_PARAMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  project: Object.freeze(['refId', 'executionId', 'handle', 'kind']),
  // WI-B10 (2026-10-23, mcp-hub SF-6): an agent never writes a held-file declaration (C-4) — it registers with descriptorUrl
  // and the PLATFORM fetches the declaration. The registration handler refuses `heldFiles` on the agent path anyway
  // (callingExecutionId / transport 'embedded'); this keeps the parameter out of the model's sight.
  // INTERNAL-FIT IF-3: an agent never writes a POV grant (the update handler refuses it, GRANT_AGENT_REFUSED). A DOTTED name
  // strips a nested property — here inside `updates` (object or union) — so every agent's `registry` bytes stay unchanged.
  registry: Object.freeze(['heldFiles', 'updates.heldGrantPovIds']),
});

export function stripAgentForbiddenActions(tool: any): any {
  const forbidden = (tool && typeof tool === 'object' ? AGENT_FORBIDDEN_ACTIONS[tool.name] : undefined) ?? [];
  // WI-B10 (mcp-hub SF-6): a tool may carry forbidden PARAMS without a forbidden action (registry.heldFiles) — the early
  // return used to key on actions only, which made a param-only entry a silent no-op. Untouched tools keep their reference.
  const forbiddenParams = (tool && typeof tool === 'object' ? AGENT_FORBIDDEN_PARAMS[tool.name] : undefined) ?? [];
  if (!forbidden.length && !forbiddenParams.length) return tool;
  const clone = structuredClone(tool);
  for (const schemaKey of ['inputSchema', 'input_schema', 'parameters']) {
    const action = clone?.[schemaKey]?.properties?.action;
    if (action && Array.isArray(action.enum)) action.enum = action.enum.filter((a: unknown) => !forbidden.includes(String(a)));
    const props = clone?.[schemaKey]?.properties;
    for (const p of forbiddenParams) {
      if (p.includes('.')) {
        const [parent, child] = p.split('.', 2);
        const node = props && typeof props === 'object' ? props[parent] : undefined;
        const branches = node && typeof node === 'object' ? [node, ...(Array.isArray(node.anyOf) ? node.anyOf : []), ...(Array.isArray(node.oneOf) ? node.oneOf : [])] : [];
        for (const b of branches) {
          if (b && typeof b === 'object' && b.properties && typeof b.properties === 'object') delete b.properties[child];
          if (b && Array.isArray(b.required)) b.required = b.required.filter((r: unknown) => r !== child);
        }
        continue;
      }
      if (props && typeof props === 'object') delete props[p];
      const req = clone?.[schemaKey]?.required;
      if (Array.isArray(req)) clone[schemaKey].required = req.filter((r: unknown) => r !== p);
    }
  }
  if (forbidden.length && typeof clone.description === 'string') {
    clone.description = clone.description.split('\n').filter((l: string) => !forbidden.some((a) => l.includes(a))).join('\n');
  }
  return clone;
}
