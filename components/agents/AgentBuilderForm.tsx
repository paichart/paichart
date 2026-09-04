"use client";

import React from 'react';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Separator } from '@/components/ui/Separator';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Checkbox } from '@/components/ui/Checkbox';
import { HelpCircle } from 'lucide-react';
import { AgentCategory, TemplateType } from '@prisma/client';
import { LLMProvider, DEFAULT_MAX_TOKENS, anthropicModels, toModelOptions } from '@/lib/services/llm/types';
import { supportsThinkingBudget } from '@/lib/services/llm/model-capabilities';
import { AgentTemplate } from '@/lib/pov/api/agent-templates-adapter';

// TODO: if a second caller appears, promote to components/ui/FieldHelpPopover.tsx
// with a `rows` prop. Keep local until then (YAGNI).
// See: cline_docs/reviews/template-audit-2026-04-16/confidence-assessment.md §E5
function AxisInfoPopover({ highlight }: { highlight: 'role' | 'templateType' | 'category' }) {
  const rows = [
    { key: 'role', axis: 'role', question: 'What persona does the agent claim?', reader: 'The LLM itself (via prompt interpolation)', example: 'qa_test_engineer' },
    { key: 'templateType', axis: 'templateType', question: 'What kind of work does this template do?', reader: 'Harness scope matcher (runtime, P9)', example: 'REVIEWER' },
    { key: 'category', axis: 'category', question: 'What domain is this template for?', reader: 'Recommendations engine, API filters (runtime)', example: 'TESTING' },
  ];
  const orthogonalExamples = [
    { name: 'Solution Architect', type: 'ARCHITECT', domain: 'DEVELOPMENT', note: '' },
    { name: 'Senior Software Developer', type: 'BUILDER', domain: 'DEVELOPMENT', note: 'same domain, different type' },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1.5 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Learn about ${highlight}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[560px] text-xs p-3" align="start">
        <div className="space-y-3">
          <div>
            <div className="font-semibold text-sm mb-1">Template Classification — 3 Independent Axes</div>
            <p className="text-muted-foreground">
              Every template is classified along three axes that answer different questions and are read by different consumers:
            </p>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-1.5 font-semibold">Axis</th>
                <th className="text-left p-1.5 font-semibold">Question answered</th>
                <th className="text-left p-1.5 font-semibold">Who reads it</th>
                <th className="text-left p-1.5 font-semibold">Example</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className={r.key === highlight ? 'bg-accent/50' : ''}>
                  <td className="p-1.5 font-mono text-[11px]">{r.axis}</td>
                  <td className="p-1.5">{r.question}</td>
                  <td className="p-1.5 text-muted-foreground">{r.reader}</td>
                  <td className="p-1.5 font-mono text-[11px]">{r.example}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t pt-2">
            <div className="font-semibold mb-1">The axes are independent — example:</div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-1 font-medium">Template</th>
                  <th className="text-left p-1 font-medium">templateType</th>
                  <th className="text-left p-1 font-medium">category</th>
                  <th className="text-left p-1 font-medium text-muted-foreground">note</th>
                </tr>
              </thead>
              <tbody>
                {orthogonalExamples.map(ex => (
                  <tr key={ex.name}>
                    <td className="p-1">{ex.name}</td>
                    <td className="p-1 font-mono text-[11px]">{ex.type}</td>
                    <td className="p-1 font-mono text-[11px]">{ex.domain}</td>
                    <td className="p-1 text-muted-foreground italic text-[11px]">{ex.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted-foreground mt-2 text-[11px]">
              Both in DEVELOPMENT, different kinds of work. Architects design; Builders write code.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Info popover for the Protocol field.
// Scope is narrower than AxisInfoPopover — protocol is opt-in per-template, not
// one of the three classification axes (role/templateType/category).
function ProtocolInfoPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1.5 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Learn about the Protocol field"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] text-xs p-3" align="start">
        <div className="space-y-2">
          <div className="font-semibold text-sm">Protocol (optional)</div>
          <p className="text-muted-foreground">
            Mirrors a prompt-library entry name (e.g., <code className="font-mono">artifact-synthesis-protocol</code>).
            When set, the execution engine injects that protocol into the agent&apos;s
            system prompt at runtime — giving coordinated specialists shared vocabulary,
            output-shape contracts, and decision rules that span tasks.
          </p>
          <div className="border-t pt-2">
            <div className="font-semibold mb-1">Use a protocol when:</div>
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
              <li>the same template runs multiple phases with different behavior</li>
              <li>output must follow a specific shape the next specialist parses</li>
              <li>decision rules span multiple tasks (e.g. Phase 4 triggers Phase 5)</li>
              <li>shared quality constraints apply across all participating tasks</li>
            </ul>
          </div>
          <p className="text-muted-foreground pt-1">
            Leave as <strong>None (vanilla)</strong> for standalone agents — ~95% of templates.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Descriptive labels for templateType dropdown (verb cues aligned with P9 scope matcher)
// Finalized by prompt-construction-specialist 2026-04-17 (E4 spot-check).
const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  [TemplateType.ARCHITECT]: 'ARCHITECT — Evaluates options, designs solutions',
  [TemplateType.BUILDER]: 'BUILDER — Writes code, implements, refactors, fixes',
  [TemplateType.ANALYST]: 'ANALYST — Analyzes data, measures value, derives insights',
  [TemplateType.REVIEWER]: 'REVIEWER — Tests, audits, validates quality and security',
  [TemplateType.OPERATOR]: 'OPERATOR — Deploys, coordinates, monitors, schedules',
  [TemplateType.DOCUMENTER]: 'DOCUMENTER — Writes, edits, and integrates documentation deliverables',
  [TemplateType.ORCHESTRATOR]: 'ORCHESTRATOR — Composes multi-step workflows across services',
  [TemplateType.ACQUIRER]: 'ACQUIRER — Gathers and normalizes raw events from external sources for downstream synthesis',
  [TemplateType.GENERALIST]: 'GENERALIST — Fallback, multi-purpose',
};
// Render order: GENERALIST last per agent-execution-specialist guidance.
const TEMPLATE_TYPE_ORDER: TemplateType[] = [
  TemplateType.ARCHITECT,
  TemplateType.BUILDER,
  TemplateType.ANALYST,
  TemplateType.REVIEWER,
  TemplateType.OPERATOR,
  TemplateType.DOCUMENTER,
  TemplateType.ORCHESTRATOR,
  TemplateType.ACQUIRER,
  TemplateType.GENERALIST,
];

export interface BuilderFormState {
  role: string;
  prompt: string;
  templateId: string;
  templateName: string;
  description: string;
  templateType: TemplateType;
  category: AgentCategory;
  // 2026-04-17: child-side protocol name (from agent_prompt_library WHERE 'protocol' = ANY(tags))
  // Empty string means "no protocol / vanilla." See pipeline-harness-specialist §2a/2b.
  protocol: string;
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  webSearch?: {
    maxUses?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  cacheControl?: { type: 'ephemeral' } | false | null; // false = explicit opt-out; null/absent = default (ON)
  thinkingBudgetTokens?: number;
  mcpTools: string[];
  inputContext?: Record<string, any>;
}

export function getDefaultFormState(): BuilderFormState {
  return {
    role: '',
    prompt: '',
    templateId: '',
    templateName: '',
    description: '',
    // Use explicit enum values (never ''); Zod .nativeEnum().default() rejects empty strings.
    templateType: TemplateType.GENERALIST,
    category: AgentCategory.GENERAL,
    // Empty string = no protocol (vanilla). The dropdown's "None" option sets this.
    protocol: '',
    provider: LLMProvider.ANTHROPIC_SDK,
    model: 'claude-haiku-4-5',
    temperature: 0.3,
    maxTokens: DEFAULT_MAX_TOKENS,
    stopSequences: [],
    webSearch: undefined,
    cacheControl: null,
    thinkingBudgetTokens: undefined,
    mcpTools: [],
    inputContext: undefined,
  };
}

interface AgentBuilderFormProps {
  state: BuilderFormState;
  onChange: (state: BuilderFormState) => void;
  templates: AgentTemplate[];
  isTemplateMode: boolean;
}

/**
 * The 6 consolidated MCP tools an agent execution can be granted (2026-06-10).
 * Granularity is the consolidated tool, not individual actions — `perform`'s
 * 13 actions travel as a bundle. Selection is ERGONOMICS (smaller tool schema
 * = better LLM accuracy), not security: authz is enforced server-side per-user
 * on every call regardless. Mirrors CONSOLIDATED_TOOLS in both execution paths.
 */
export const SELECTABLE_TOOLS: { name: string; description: string }[] = [
  { name: 'project', description: 'Read POVs, tasks, phases, context' },
  { name: 'perform', description: 'Act: create/update/complete tasks, run agents' },
  { name: 'analytics', description: 'Recommendations + team performance' },
  { name: 'template', description: 'Agent template list/details' },
  { name: 'services', description: 'Call external MCP services + workflows' },
  { name: 'registry', description: 'Register/manage external services' },
];

// Derived from the model registry (single source of truth) — no hardcoded list to drift on a model bump.
const defaultModels: Record<string, { id: string; name: string }[]> = {
  [LLMProvider.ANTHROPIC_SDK]: toModelOptions(anthropicModels),
};

// Derived from the capability map (single source of truth) — see supportsThinkingBudget.
// Was: model.includes('claude-sonnet-4')||includes('claude-opus-4'), which drifted (hid the
// control for Sonnet 5 and would mis-gate every future model).
const supportsThinking = (model: string) => supportsThinkingBudget(model);

export function AgentBuilderForm({ state, onChange, templates, isTemplateMode }: AgentBuilderFormProps) {
  const [stopInput, setStopInput] = React.useState('');

  const update = (patch: Partial<BuilderFormState>) => {
    onChange({ ...state, ...patch });
  };

  const models = defaultModels[state.provider] || [];

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === 'none') {
      update({ templateId: '', templateName: '' });
      return;
    }
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    // Pre-fill form from template
    // Null-coalesce (??) — templateType column is nullable in Prisma; legacy
    // rows loaded from the DB may have null. `||` would also replace empty
    // strings, which isn't what we want here.
    update({
      templateId: template.id,
      templateName: template.name,
      role: template.role,
      prompt: template.prompt || '',
      templateType: template.templateType ?? TemplateType.GENERALIST,
      category: template.category ?? AgentCategory.GENERAL,
      protocol: template.protocol ?? '',
      provider: template.modelParameters?.provider || LLMProvider.ANTHROPIC_SDK,
      model: template.modelParameters?.model || 'claude-haiku-4-5',
      temperature: template.modelParameters?.temperature ?? 0.3,
      maxTokens: template.modelParameters?.maxTokens ?? DEFAULT_MAX_TOKENS,
      stopSequences: template.modelParameters?.stopSequences || [],
      webSearch: template.modelParameters?.webSearch,
      cacheControl: template.modelParameters?.cacheControl,
      thinkingBudgetTokens: template.modelParameters?.thinkingBudgetTokens,
    });
  };

  // 2026-04-17: fetch available protocols from prompt library on mount.
  // Filters client-side for tags.includes('protocol'); we over-fetch slightly
  // (~30 prompts total) but avoid extending the API with a tag filter param.
  const [protocols, setProtocols] = React.useState<Array<{ name: string; description?: string }>>([]);
  const [protocolsLoading, setProtocolsLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/agent-templates/prompt-library');
        if (!res.ok) return;
        const payload = await res.json();
        const rows: Array<{ name: string; description?: string; tags?: string[]; status?: string }> =
          payload?.data?.prompts ?? payload?.prompts ?? payload?.data ?? [];
        const protocolRows = rows
          // ACTIVE-only (WS1 Phase C, ts F4): admins receive ALL statuses from this API, and a
          // DRAFT row offered here is one click from a template binding that throws
          // NAMED_PROTOCOL_NOT_FOUND on every execution (the named branch loads ACTIVE only) —
          // permanent leaf breakage until the row activates. Rows without a status field
          // (non-admin responses are pre-filtered to ACTIVE) pass through.
          .filter((p) => Array.isArray(p.tags) && p.tags.includes('protocol') && (p.status === undefined || p.status === 'ACTIVE'))
          .map((p) => ({ name: p.name, description: p.description }));
        if (alive) setProtocols(protocolRows);
      } catch {
        // Non-fatal — dropdown will just show "None" + no options
      } finally {
        if (alive) setProtocolsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-5">
      {/* Template Name (Template Mode only) */}
      {isTemplateMode && (
        <div className="space-y-2">
          <Label className="font-medium">Template Name *</Label>
          <Input
            value={state.templateName}
            onChange={e => update({ templateName: e.target.value })}
            placeholder="e.g., QA Test Engineer"
          />
        </div>
      )}

      {/* Description (Template Mode only) */}
      {isTemplateMode && (
        <div className="space-y-2">
          <Label className="font-medium">Description</Label>
          <Textarea
            value={state.description}
            onChange={e => update({ description: e.target.value })}
            placeholder="Brief description of this agent's purpose and specialization"
            rows={2}
            className="resize-none"
          />
        </div>
      )}

      {/* Template Selector (Task Mode only) */}
      {!isTemplateMode && templates.length > 0 && (
        <div className="space-y-2">
          <Label className="font-medium">Base Template</Label>
          <Select value={state.templateId || 'none'} onValueChange={handleTemplateSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No template</SelectItem>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Role + Protocol (side-by-side) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="font-medium flex items-center">
            Agent Role *
            <AxisInfoPopover highlight="role" />
          </Label>
          <Input
            value={state.role}
            onChange={e => update({ role: e.target.value })}
            placeholder="e.g., qa_test_engineer, senior_software_developer"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-medium flex items-center">
            Protocol
            <ProtocolInfoPopover />
          </Label>
          <Select
            value={state.protocol || '__none__'}
            onValueChange={(v) => update({ protocol: v === '__none__' ? '' : v })}
            disabled={protocolsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={protocolsLoading ? 'Loading…' : 'None (vanilla)'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None (vanilla)</SelectItem>
              {protocols.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.protocol && (
            <p className="text-xs text-muted-foreground">
              Protocol will be injected into the agent&apos;s system prompt at runtime.
            </p>
          )}
        </div>
      </div>

      {/* Template Classification: templateType + category (side-by-side) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="font-medium">Template Type *</Label>
          <Select
            value={state.templateType}
            onValueChange={v => {
              // Guard: Zod .nativeEnum().default() rejects empty strings.
              // If the Select somehow emits '', fall back to GENERALIST default.
              update({ templateType: (v || TemplateType.GENERALIST) as TemplateType });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_TYPE_ORDER.map(t => (
                <SelectItem key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.templateType === TemplateType.GENERALIST && (
            <p className="text-xs text-muted-foreground">
              Use only when no specialized type fits. GENERALIST agents skip the type-vs-task safety check, so pick a specialized type when you can.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label className="font-medium">Category *</Label>
          <Select
            value={state.category}
            onValueChange={v => {
              update({ category: (v || AgentCategory.GENERAL) as AgentCategory });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(AgentCategory).map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label className="font-medium">
          {isTemplateMode ? 'System Prompt' : 'Task Instructions (User Prompt)'}
        </Label>
        <p className="text-xs text-muted-foreground">
          {isTemplateMode
            ? "Defines the agent's persona, role context, and behavioral instructions."
            : 'Task-specific directives. When a template is applied, the system prompt is auto-generated.'}
        </p>
        <Textarea
          value={state.prompt}
          onChange={e => update({ prompt: e.target.value })}
          placeholder={isTemplateMode
            ? 'Define the agent persona and behavioral instructions...'
            : 'Enter task-specific instructions for the agent...'}
          rows={4}
          className="text-sm"
        />
      </div>

      {/* Tool Selection (both modes, 2026-06-10). Task mode → task.mcpContext;
          template mode → metadata.mcpToolConfiguration.selectedTools (tasks
          using the template inherit these; task-level selections merge in at
          configure time). Semantics: EMPTY selection state = "default: all
          tools" (server-side default; future-proof — a 7th consolidated tool
          is auto-included). An explicit subset is stored only when the user
          unchecks something. */}
      <Separator />
      <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Tools
              <span className="ml-2 normal-case font-normal tracking-normal">
                {state.mcpTools.length === 0
                  ? '(all — default)'
                  : `(${state.mcpTools.length} of ${SELECTABLE_TOOLS.length} selected)`}
              </span>
            </Label>
            <p className="text-xs text-muted-foreground">
              {isTemplateMode
                ? 'Which MCP tools agents using this template may call — tasks inherit these (task-level selections merge in). Fewer tools = better tool-call accuracy.'
                : 'Which MCP tools this agent may call. Fewer tools = less prompt overhead and better tool-call accuracy. Access control is enforced server-side regardless.'}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {SELECTABLE_TOOLS.map((tool) => {
                const effectiveSelected =
                  state.mcpTools.length === 0 || state.mcpTools.includes(tool.name);
                return (
                  <label
                    key={tool.name}
                    className="flex items-start gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={effectiveSelected}
                      onCheckedChange={(checked) => {
                        // Materialize the implicit "all" before editing
                        const current = state.mcpTools.length === 0
                          ? SELECTABLE_TOOLS.map((t) => t.name)
                          : [...state.mcpTools];
                        const next = checked
                          ? [...new Set([...current, tool.name])]
                          : current.filter((n) => n !== tool.name);
                        // Full selection collapses back to [] = default-all
                        update({
                          mcpTools: next.length === SELECTABLE_TOOLS.length ? [] : next,
                        });
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-mono">{tool.name}</span>
                      <span className="block text-xs text-muted-foreground">{tool.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {state.mcpTools.length > 0 && !state.mcpTools.includes('perform') && (
              <p className="text-xs text-amber-500">
                Without <span className="font-mono">perform</span> the agent cannot update or
                complete tasks — read/analyze only.
              </p>
            )}
          </div>

      <Separator />

      {/* Model Settings */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Model Settings</Label>

        <div className="grid grid-cols-2 gap-3">
          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-xs">Provider</Label>
            <Select value={state.provider} onValueChange={v => update({ provider: v as LLMProvider })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LLMProvider.ANTHROPIC_SDK}>Anthropic Claude</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label className="text-xs">Model</Label>
            <Select value={state.model} onValueChange={v => update({ model: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Temperature */}
          <div className="space-y-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label className="text-xs cursor-help">Temperature</Label>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Lower = more deterministic, higher = more creative. Range 0-1.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Input
              type="number" step="0.1" min="0" max="1"
              value={state.temperature}
              onChange={e => update({ temperature: parseFloat(e.target.value) || 0.3 })}
              className="h-9 text-sm"
            />
          </div>

          {/* Max Tokens */}
          <div className="space-y-1.5">
            <Label className="text-xs">Max Tokens</Label>
            <Input
              type="number" min="100" max="500000"
              value={state.maxTokens}
              onChange={e => update({ maxTokens: parseInt(e.target.value) || DEFAULT_MAX_TOKENS })}
              className="h-9 text-sm"
            />
          </div>
        </div>

        {/* Stop Sequences */}
        <div className="space-y-1.5">
          <Label className="text-xs">Stop Sequences</Label>
          <div className="flex gap-2">
            <Input
              value={stopInput}
              onChange={e => setStopInput(e.target.value)}
              placeholder="Add stop sequence"
              className="h-9 text-sm flex-1"
              onKeyDown={e => {
                if (e.key === 'Enter' && stopInput) {
                  e.preventDefault();
                  if (!state.stopSequences.includes(stopInput)) {
                    update({ stopSequences: [...state.stopSequences, stopInput] });
                  }
                  setStopInput('');
                }
              }}
            />
          </div>
          {state.stopSequences.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {state.stopSequences.map(seq => (
                <Badge key={seq} variant="secondary" className="text-xs cursor-pointer"
                  onClick={() => update({ stopSequences: state.stopSequences.filter(s => s !== seq) })}
                >
                  {seq} x
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Features (Anthropic-specific) */}
      {state.provider === LLMProvider.ANTHROPIC_SDK && (
        <>
          <Separator />
          <div className="space-y-4">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Features</Label>

            {/* Web Search */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Web Search</Label>
                <p className="text-xs text-muted-foreground">Allow agent to search the web</p>
              </div>
              <Switch
                checked={!!state.webSearch}
                onCheckedChange={checked => update({
                  webSearch: checked ? { maxUses: 3 } : undefined
                })}
              />
            </div>

            {/* Prompt Caching */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Prompt Caching</Label>
                <p className="text-xs text-muted-foreground">Reduce latency and cost for repeated prompts</p>
              </div>
              {/* Default-ON (Finding G, 2026-07-08): off writes FALSE (explicit opt-out), never null. */}
              <Switch
                checked={state.cacheControl !== false}
                onCheckedChange={checked => update({
                  cacheControl: checked ? { type: 'ephemeral' } : false
                })}
              />
            </div>

            {/* Extended Thinking — on/off opt-in. Current models treat this as a boolean signal
                (adaptive on Opus/Sonnet, always-on for Fable); the numeric budget isn't used, so we
                don't expose a number field that would imply otherwise. */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Extended Thinking</Label>
                  <p className="text-xs text-muted-foreground">
                    Let the model reason before responding — an on/off opt-in (the budget is model-managed)
                  </p>
                </div>
                <Switch
                  checked={!!state.thinkingBudgetTokens && state.thinkingBudgetTokens > 0}
                  disabled={!supportsThinking(state.model)}
                  onCheckedChange={checked => update({
                    thinkingBudgetTokens: checked ? 5000 : undefined
                  })}
                />
              </div>
              {!supportsThinking(state.model) && (
                <p className="text-xs text-muted-foreground">
                  Extended thinking isn&apos;t supported on the selected model.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
