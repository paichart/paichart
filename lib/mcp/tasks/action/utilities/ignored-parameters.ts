/**
 * ignoredParameters — which caller-sent parameters an action did NOT apply (2026-09-25).
 *
 * WHY: 13 of the 14 perform actions validate with a NON-strict object schema, which strips unknown
 * keys silently while the call reports success. Nothing recorded them: the router logs failures only,
 * and the outer dispatcher's parameter dump is debug-level. Measured cost: 23 harness APPROVAL gates
 * named for a person landed on the POV owner, and no log line anywhere showed the dropped key.
 *
 * WHAT: a FACT (Protocol 10), never a verdict — the key names the caller sent that no layer consumed.
 * No "did you mean", no severity. Returned on the success result and logged at info
 * ('perform: parameters not applied') so a soak can decide per-action .strict() on evidence
 * (advisory Order-of-changes step 6 — gated on this measurement).
 *
 * MEASURED ONLY WHERE THE RAW KEYS ARE VISIBLE. The router computes it only when the caller opts in
 * (routeOpts.reportIgnoredParameters — the perform Tier-1 site). The REST route runs
 * validateMCPActionRequest BEFORE the router, so unknown keys are already gone there; computing it
 * would stamp a false [] (the F9 stamped-false-fact class). Unmeasured ⇒ the field is ABSENT, not [].
 *
 * VOCABULARY LIMIT: where the tool layer RENAMES a key and deletes the source (assignee_name→assignee,
 * agent_template_name→agentTemplateName, task_title→taskTitle, due_date→dueDate, stage_id/phase_id/task_id),
 * the caller's spelling no longer exists here, so an unapplied one is reported under the renamed key.
 * Kept-source copies (LAYER_COPY_ALIASES) ARE reported in the caller's vocabulary.
 *
 * Review: cline_docs/reviews/perform-template-param-2026-09-25/mcp-tool-architecture-advisory.md (B.1)
 */

/**
 * Copies the perform TOOL layer (tool-schemas.js transform) makes while KEEPING the source key.
 * [source, target]: if the target is in the action's schema the source was applied through it; if not,
 * the target is the layer's copy and only the caller's own key (the source) is reported.
 */
export const LAYER_COPY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['agent_template_id', 'agentTemplateId'],
  ['templateId', 'agentTemplateId'],
  ['role', 'agentRole'],
];

/**
 * Keys an action's L3 schema does not declare but a layer OUTSIDE it consumes after routing
 * (lib/mcp/server/tools/advanced/task-action-handler.js reads them off finalParameters).
 * Per-action: the same key on another action IS ignored and IS reported.
 */
export const POST_ROUTING_CONSUMERS: Readonly<Record<string, readonly string[]>> = {
  'agent.execute': ['waitForCompletion'], // outer poll gate
  'agent.results': ['verbose'],           // outer size-cap bypass
};

export function computeIgnoredParameters(
  action: string,
  raw: Record<string, unknown>,
  shapeKeys: readonly string[],
): string[] {
  const shape = new Set(shapeKeys);
  const consumed = new Set(POST_ROUTING_CONSUMERS[action] ?? []);
  const unknown = new Set(
    Object.keys(raw).filter(k => raw[k] !== undefined && !shape.has(k) && !consumed.has(k))
  );
  for (const [src, tgt] of LAYER_COPY_ALIASES) {
    if (!unknown.has(src) || raw[tgt] !== raw[src]) continue; // different values ⇒ both genuinely sent
    if (shape.has(tgt)) unknown.delete(src);                 // applied through its alias
    else unknown.delete(tgt);                                 // report the caller's key, not the copy
  }
  return [...unknown].sort();
}
