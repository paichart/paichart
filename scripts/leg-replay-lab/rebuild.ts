/**
 * Leg replay lab — REBUILD a persisted execution's exact prompt with the PLATFORM'S OWN builders.
 *
 * Nothing here composes prompt text. Every byte comes from the shipping functions the engine calls
 * (agentExecutionEngine.ts `executeAgent` → `buildAgentPrompt` / `buildSystemPrompt`):
 *   user   = buildAgentPromptBody(task, enhancedConfig, enhancedContext)            (§1–§8 + Output Requirements)
 *   system = buildSystemPromptInjectionBlocks(base, ctx, db, logger)                (rules + protocol + harness + base
 *            where base = resolvePromptPlaceholders(promptTemplate, role, buildContextSummary(task))   + constraints
 *                         + buildHubToolGuidance(...) when the tool list holds `services`               + scope check)
 *   tools  = the engine's mcpFunctions loop over CONSOLIDATED_SCHEMAS (zodToJsonSchema, jsonSchema7) + READ_MORE_FUNCTION_DEF
 *
 * What the lab supplies is only the DATA those functions read, taken from the persisted execution:
 *   - `exec.config` — the config FROZEN at execution create (agent-execution-create.ts): `config.inputContext` is the
 *     authoritative chained context for THIS execution (BC-T6-1), and `config.prompt` is the user §1 Directive. What
 *     `config.prompt` HOLDS depends on the era (see `directiveProvenance`):
 *       · PRE-FIX (TEMPLATE-SENT-TWICE, before fix A 2026-10-07): a task with no prompt of its own froze the RAW
 *         template `promptTemplate` there (the config builders' fallback) — so the frozen copy is also the best record
 *         of the template as it stood at run time, and the lab uses it for the system base too.
 *       · POST-FIX: absent for such a task (§1 synthesizes "As a <role>, complete…"); the system base is the template row.
 *       · OWN PROMPT (either era): the task's own directive — §1 only; the system base is the template row, exactly as
 *         the engine resolves it (agentExecutionEngine buildSystemPrompt), NEVER the task's prompt.
 *   - the task row and its EXECUTION_TASK_CONTEXT_INCLUDE relations, projected to exactly that select;
 *   - the protocol text — the ONE substitutable input (`protocol.text`), fed through an in-memory
 *     `agentPromptLibrary` so the shipping injection code renders it exactly as it renders the DB row.
 *
 * The remaining approximations are listed by `notes` on every rebuild and in BUILD-REPORT.md.
 */
import { createHash } from 'crypto';
import { buildAgentPromptBody } from '../../lib/agents/harness/build-agent-prompt-body';
import { buildSystemPromptInjectionBlocks, type ProtocolInjectionFact, type InjectionBlock } from '../../lib/services/execution-system-prompt';
import { resolvePromptPlaceholders, buildContextSummary } from '../../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { deriveMcpToolNames, buildHubToolGuidance } from '../../lib/services/execution-hub-guidance';
import { resolveAgentRole } from '../../lib/services/execution-terminal-persist';
import { resolveTaskProtocol } from '../../lib/agents/harness/program-protocol';
import { READ_MORE_FUNCTION_DEF } from '../../lib/agents/harness/agentic-tool-loop';
import { RUNTIME_LIMITS } from '../../lib/validation/runtime-limits';
import type { ExecBlock, Snapshot } from './snapshot';
const { CONSOLIDATED_SCHEMAS, TOOL_SCHEMAS } = require('../../lib/mcp/server/config/tool-schemas');
const { zodToJsonSchema } = require('zod-to-json-schema');

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface ProtocolText {
  name: string;
  version: string | null;
  text: string;
  /** Where the text came from — 'prod-row@<ver>', 'file:<path>', 'commit:<sha>', 'candidate:<variant>'. */
  source: string;
}

export interface RebuildOptions {
  /** Replace the template promptTemplate for a guidance candidate. Always the SYSTEM base. §1 follows the node's era:
   *  a PRE-FIX template-fallback node replayed as-run also carries it in §1 (the pre-fix builders would have frozen the
   *  candidate there); a post-fix node, an own-prompt node, or a pre-fix node with `dropTemplateDirective` does not. */
  templatePromptOverride?: string | null;
  /** Replace the chained context (the Reviewer replay passes its patched chainedFrom here). */
  inputContextOverride?: unknown;
  /** Task status at claim. The row now reads COMPLETED; agent-execution-create moves OPEN → IN_PROGRESS at creation. */
  taskStatusAtClaim?: string;
  /** Replay a PRE-FIX template-fallback node AS POST-FIX (TEMPLATE-SENT-TWICE fix A, shipped 2026-10-07): drop the
   *  frozen template copy from the USER body only — §1 then synthesizes "As a <role>, complete…", as production now
   *  does. The SYSTEM prompt is unchanged. A no-op on post-fix and own-prompt nodes (they already replay that way).
   *  Default (false) = AS-RUN fidelity: a pre-fix node replays with the Directive it actually ran under. */
  dropTemplateDirective?: boolean;
}

export interface RebuiltPrompt {
  role: string;
  model: string;
  system: string;
  systemBlocks: InjectionBlock[];
  user: string;
  tools: Array<{ name: string; description: string; parameters: unknown }>;
  toolNames: string[];
  fact: ProtocolInjectionFact;
  maxTokens: number | undefined;
  temperature: number | undefined;
  /** The frozen execution config, handed to the shipping normalizeModelConfig exactly as the engine hands it. */
  llmConfigSource: Record<string, unknown>;
  maxToolTurns: number;
  inputContextSource: 'config.inputContext' | 'task.inputContext' | 'override' | 'none';
  hashes: { system: string; user: string; tools: string; protocol: string | null };
  notes: string[];
}

/**
 * Where the frozen `config.prompt` came from (TEMPLATE-SENT-TWICE). Keyed on the task having NO prompt of its own: the
 * pre-fix builders filled config.prompt from the template exactly then. (An agent.execute overrideConfig.prompt on a
 * prompt-less task is indistinguishable here; it would be classified template-fallback — none in the lab corpus.)
 *   'template-fallback' — pre-fix: config.prompt is the raw template as it stood at run time
 *   'absent'            — post-fix (or never set): §1 synthesizes; the template row is the system base
 *   'own-prompt'        — the task's own directive: §1 only; the template row is the system base
 */
export type DirectiveProvenance = 'template-fallback' | 'absent' | 'own-prompt';
export function directiveProvenance(b: ExecBlock): DirectiveProvenance {
  const cfgPrompt = (b.exec.config ?? {}).prompt;
  if (b.task.prompt) return 'own-prompt';
  return cfgPrompt ? 'template-fallback' : 'absent';
}
/** The template text the run's SYSTEM base was resolved from: the frozen copy for a pre-fix template-fallback node
 *  (the template row may have changed since), else the template row. Guidance candidates are edits of THIS text. */
export function templateTextAsRun(b: ExecBlock): string {
  return directiveProvenance(b) === 'template-fallback' ? String(b.exec.config.prompt) : (b.template?.promptTemplate ?? '');
}

/** Project a snapshot exec block onto the engine's hydrated task shape (EXECUTION_TASK_CONTEXT_INCLUDE). */
export function hydrateTask(b: ExecBlock, status: string): Record<string, any> {
  const t = b.task;
  const pick = (o: any, keys: string[]) => (o ? Object.fromEntries(keys.map((k) => [k, o[k] ?? null])) : null);
  return {
    id: t.id, title: t.title, description: t.description, priority: t.priority, status, type: t.type,
    dueDate: t.due_date ?? null, agentRole: t.agentRole, metadata: t.metadata, inputContext: t.inputContext,
    mcpContext: t.mcpContext, prompt: t.prompt, stageId: t.stage_id, povId: t.pov_id,
    pov: pick(b.pov, ['id', 'title', 'description', 'objective', 'customerName', 'solution', 'status']),
    phase: pick(b.phase, ['id', 'name', 'description', 'type']),
    stage: pick(b.stage, ['id', 'name', 'order']),
    assignee: b.assignee ? { id: b.assignee.id, name: b.assignee.name, email: b.assignee.email } : null,
    team: pick(b.team, ['id', 'name']),
    subTasks: b.subTasks ?? [],
    parentTask: b.parentTask ?? null,
  };
}

function toolDefs(names: string[]): Array<{ name: string; description: string; parameters: unknown }> {
  const out: Array<{ name: string; description: string; parameters: unknown }> = [];
  for (const name of names) {
    const schema = CONSOLIDATED_SCHEMAS[name] || TOOL_SCHEMAS[name];
    if (!schema) continue; // the engine's getToolDefinitions skips an unresolved name the same way
    let params: unknown;
    try { params = zodToJsonSchema(schema.inputSchema, { target: 'jsonSchema7' }); } catch { params = { type: 'object', properties: {}, additionalProperties: true }; }
    out.push({ name, description: schema.description || `MCP tool: ${name}`, parameters: params || { type: 'object', properties: {}, required: [] } });
  }
  if (out.length > 0) out.push(READ_MORE_FUNCTION_DEF as any);
  return out;
}

export async function rebuildPrompt(snap: Snapshot, which: 'author' | 'reviewer', protocol: ProtocolText | null, opts: RebuildOptions = {}): Promise<RebuiltPrompt> {
  const b = which === 'author' ? snap.author : snap.reviewer;
  if (!b) throw new Error(`${which}: not in snapshot`);
  const notes: string[] = [];
  const config = { ...(b.exec.config ?? {}) } as Record<string, any>;
  const template = b.template;
  if (!template) throw new Error(`${which}: no template row`);

  const status = opts.taskStatusAtClaim ?? 'IN_PROGRESS';
  const task = hydrateTask(b, status);
  // The engine reads task.inputContext (written by the chainer the moment the execution was created); the frozen
  // config carries the same authoritative value and, unlike the task row, cannot have been rewritten since.
  let inputContextSource: RebuiltPrompt['inputContextSource'] = 'none';
  if (opts.inputContextOverride !== undefined) { task.inputContext = opts.inputContextOverride; inputContextSource = 'override'; }
  else if (config.inputContext !== undefined) { task.inputContext = config.inputContext; inputContextSource = 'config.inputContext'; }
  else if (task.inputContext != null) { inputContextSource = 'task.inputContext'; notes.push('config.inputContext absent — used the CURRENT task.inputContext, which a later re-run may have rewritten'); }

  const provenance = directiveProvenance(b);
  const promptTemplate: string = opts.templatePromptOverride ?? templateTextAsRun(b);
  if (opts.templatePromptOverride) notes.push('template promptTemplate OVERRIDDEN (guidance candidate) — system base');
  else if (provenance === 'template-fallback') notes.push('pre-fix node: system base = the frozen config.prompt (the template as it stood at run time)');
  else notes.push(`${provenance === 'own-prompt' ? 'own-prompt' : 'post-fix'} node: system base = the CURRENT template row (the run froze no copy of it)`);
  // §1 by era. Only a pre-fix template-fallback node carries template text in the Directive, and only when replayed as-run.
  if (provenance === 'template-fallback') {
    if (opts.dropTemplateDirective) { delete config.prompt; notes.push('replayed AS POST-FIX: template-derived Directive dropped from the user body (§1 synthesized)'); }
    else {
      if (opts.templatePromptOverride) config.prompt = opts.templatePromptOverride;
      notes.push('replayed AS-RUN: §1 Directive = the template copy the pre-fix builders froze (TEMPLATE-SENT-TWICE)');
    }
  } else if (opts.dropTemplateDirective) notes.push(`dropTemplateDirective: no-op on a${provenance === 'own-prompt' ? 'n own-prompt' : ' post-fix'} node`);

  // ── engine lines 588-611: tool names + enhancedConfig (data only; the builder reads mcpTools/workflow/successMetrics) ──
  const mcpConfig = (task.mcpContext as Record<string, any>) || {};
  const mcpToolNames = deriveMcpToolNames(mcpConfig.tools, config.mcpTools);
  const enhancedConfig = {
    ...config, mcpTools: mcpToolNames,
    workflow: mcpConfig.workflow?.phases || config.workflow || {},
    successMetrics: mcpConfig.successMetrics || config.successMetrics || [],
  };
  const resolvedTemplate = {
    id: template.id, name: template.name, defaultRole: template.defaultRole, promptTemplate,
    capabilities: template.capabilities, constraints: template.constraints, metadata: template.metadata,
    templateType: template.templateType, outputSchema: template.outputSchema,
  };
  const enhancedContext = { ...(b.exec.context ?? {}), agentTemplate: resolvedTemplate };
  const user = buildAgentPromptBody(task, enhancedConfig, enhancedContext);

  // ── buildSystemPrompt (engine :1046-1085) ──
  const role = resolveAgentRole(config.agentRole, template.defaultRole, task.agentRole);
  let base = resolvePromptPlaceholders(promptTemplate, role, buildContextSummary(task as any));
  if (mcpToolNames.includes('services')) {
    base += await buildHubToolGuidance(mcpToolNames, { mCPTool: { findMany: async () => snap.mcpTools } }, { warn: () => {} });
    notes.push(`hub guidance built from the CURRENT ACTIVE mcp_tools rows (${snap.mcpTools.length}), not the rows at run time`);
  }
  const rows = new Map<string, { name: string; description: string | null; promptText: string; version: string | null; status: string }>();
  if (protocol) rows.set(protocol.name, { name: protocol.name, description: null, promptText: protocol.text, version: protocol.version, status: 'ACTIVE' });
  const db = {
    agentPromptLibrary: {
      findFirst: async (args: any) => {
        const r = rows.get(args?.where?.name);
        if (!r) return null;
        if (args?.where?.status && args.where.status !== r.status) return null;
        return r;
      },
      findMany: async () => { throw new Error('lab: protocol modes all/composed are not supported for leaf replays (no leaf runs them)'); },
    },
  };
  const warns: string[] = [];
  const { blocks, fact } = await buildSystemPromptInjectionBlocks(base, {
    harnessContext: null, // non-PIPELINE leaf: the engine resolves a harness context only for PIPELINE tasks
    template: { id: template.id, name: template.name },
    templateMetadata: (template.metadata as Record<string, unknown>) ?? null,
    constraints: template.constraints ?? null,
    taskProtocol: resolveTaskProtocol({ title: task.title, metadata: task.metadata }),
  }, db, { info: () => {}, warn: (o, m) => warns.push(`${m} ${JSON.stringify(o)}`) });
  for (const w of warns) notes.push(`injection warn: ${w}`);
  const system = blocks.map((x) => x.text).join('');

  const tools = toolDefs(mcpToolNames);
  const tm = ((template.metadata as any)?.modelParameters) || {};
  const rawTurns = Number(tm.maxToolTurns);
  const maxToolTurns = Math.min(Number.isFinite(rawTurns) && rawTurns > 0 ? rawTurns : RUNTIME_LIMITS.DEFAULT_TOOL_TURNS, RUNTIME_LIMITS.MAX_TOOL_TURNS);
  if (status !== b.task.status) notes.push(`task status rendered as ${status} (row now reads ${b.task.status})`);

  return {
    role, model: config.model ?? b.exec.modelUsed, system, systemBlocks: blocks, user, tools, toolNames: tools.map((t) => t.name), fact,
    maxTokens: config.maxTokens, temperature: config.temperature, llmConfigSource: { ...(b.exec.config ?? {}) }, maxToolTurns, inputContextSource,
    hashes: { system: sha256(system), user: sha256(user), tools: sha256(JSON.stringify(tools)), protocol: protocol ? sha256(protocol.text) : null },
    notes,
  };
}

/** The persisted result.json, parsed (null when absent or unparseable). */
export function parsedResult(b: ExecBlock | null): Record<string, any> | null {
  if (!b?.resultJson) return null;
  try { return JSON.parse(b.resultJson); } catch { return null; }
}

export interface FidelityCheck { name: string; ok: boolean | null; detail: string }

/**
 * Compare a rebuild against what the execution actually ran with, wherever that is recoverable.
 * `ok: null` = not checkable on this execution (stated, never folded into a pass).
 */
export function fidelityChecks(snap: Snapshot, which: 'author' | 'reviewer', r: RebuiltPrompt): FidelityCheck[] {
  const b = which === 'author' ? snap.author : snap.reviewer!;
  const res = parsedResult(b);
  const pi = res?.protocolInjection ?? null;
  const out: FidelityCheck[] = [];
  if (!pi) out.push({ name: 'protocolInjection', ok: null, detail: 'no persisted protocolInjection fact' });
  else {
    const same = (k: string, a: unknown, z: unknown) => out.push({ name: `protocolInjection.${k}`, ok: JSON.stringify(a) === JSON.stringify(z), detail: `persisted ${JSON.stringify(a)} · rebuilt ${JSON.stringify(z)}` });
    same('mode', pi.mode, r.fact.mode);
    same('delta', pi.delta, r.fact.delta);
    same('protocolNames', pi.protocolNames, r.fact.protocolNames);
    same('stampSource', pi.stampSource, r.fact.stampSource);
    same('preambleChars', pi.preambleChars, r.fact.preambleChars);
  }
  out.push({ name: 'agentRole', ok: res?.agentRole ? res.agentRole === r.role : null, detail: `persisted ${res?.agentRole ?? '—'} · rebuilt ${r.role}` });
  out.push({ name: 'toolNames', ok: Array.isArray(res?.mcpToolsProvided) ? JSON.stringify(res!.mcpToolsProvided) === JSON.stringify(r.toolNames) : null,
    detail: `persisted ${JSON.stringify(res?.mcpToolsProvided ?? null)} · rebuilt ${JSON.stringify(r.toolNames)}` });
  out.push({ name: 'model', ok: b.exec.modelUsed ? b.exec.modelUsed === r.model : null, detail: `served ${b.exec.modelUsed ?? '—'} · configured ${r.model}` });
  const cfg = b.exec.config ?? {};
  const tpl = b.template?.promptTemplate ?? null;
  const prov = directiveProvenance(b);
  out.push({ name: 'template.unchangedSinceRun', ok: prov === 'template-fallback' && tpl ? cfg.prompt === tpl : null,
    detail: prov === 'template-fallback'
      ? (cfg.prompt === tpl ? 'frozen config.prompt == current template row' : 'template row CHANGED since the run — the frozen config.prompt is used (historical), constraints/outputSchema/metadata come from the CURRENT row')
      : `${prov} node: the run froze no template copy — the CURRENT template row is the system base (not checkable)` });
  const ic = JSON.stringify(cfg.inputContext ?? null);
  out.push({ name: 'inputContext.taskRowUnchanged', ok: cfg.inputContext !== undefined ? ic === JSON.stringify(b.task.inputContext ?? null) : null,
    detail: cfg.inputContext !== undefined ? (ic === JSON.stringify(b.task.inputContext ?? null) ? 'frozen config.inputContext == current task.inputContext' : 'task.inputContext rewritten since (a later run) — the frozen copy is used') : 'no frozen inputContext' });
  const tl = res?.toolLoop ?? {};
  const singleCall = tl.totalTurns === 0 && !tl.truncationRetryUsed && !tl.correctionTurnUsed && !tl.diagnosticRetryUsed && !(tl.formCheck?.correction?.attempted);
  const persistedIn = (b.exec.inputTokens ?? 0) + (b.exec.cacheCreationTokens ?? 0) + (b.exec.cacheReadTokens ?? 0);
  out.push({ name: 'tokens.firstCallInput', ok: null,
    detail: singleCall ? `persisted single-call input = ${persistedIn} tokens — compared EXACTLY against the replay's first call on a --spend run`
      : `not a single-call execution (turns ${tl.totalTurns ?? '?'}); persisted total input ${persistedIn} spans several calls — no exact token check` });
  return out;
}

/** Whether the persisted execution was ONE LLM call (so its token total is the first call's input, exactly). */
export function persistedSingleCallInput(b: ExecBlock): number | null {
  const tl = parsedResult(b)?.toolLoop ?? {};
  const single = tl.totalTurns === 0 && !tl.truncationRetryUsed && !tl.correctionTurnUsed && !tl.diagnosticRetryUsed && !(tl.formCheck?.correction?.attempted);
  return single ? (b.exec.inputTokens ?? 0) + (b.exec.cacheCreationTokens ?? 0) + (b.exec.cacheReadTokens ?? 0) : null;
}
