"use client";

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { Button } from '@/components/ui/Button';
import { HelpCircle } from 'lucide-react';
import { BuilderFormState, SELECTABLE_TOOLS } from './AgentBuilderForm';
import { AgentExecutionExplainer } from './AgentExecutionExplainer';
import { buildAgentPromptBody } from '@/lib/agents/harness/build-agent-prompt-body';
import { buildContextSummary } from '@/lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { renderConstraintsBlock, SCOPE_SELF_CHECK } from '@/lib/services/execution-system-prompt';

interface AgentBuilderPreviewProps {
  state: BuilderFormState;
  taskId?: string;
  taskTitle?: string;
  isTemplateMode: boolean;
  /** Full task object from the builder's task fetch (task mode). */
  taskInfo?: any;
  /** POV id from the builder URL — lets the preview render the real povId in
   *  §5/§7 even though the task fetch doesn't include the POV relation. */
  povId?: string;
  /** Loaded templates — used to resolve the assigned template's system prompt. */
  templates?: Array<{ id: string; name: string; role: string; prompt: string; constraints?: any }>;
}

/**
 * Preview the effective system prompt as the execution engine will see it.
 * Template mode: the template's prompt with ${agentRole} placeholders resolved.
 */
function assembleSystemPrompt(state: BuilderFormState): string {
  if (state.prompt) {
    // Resolve ${agentRole} placeholder for preview (matches resolvePromptPlaceholders behavior)
    const role = state.role || 'assistant';
    return state.prompt
      .replace(/\$\{agentRole\}/g, role)
      .replace(/\$\{formattedRole\}/g, role);
  }
  return 'No system prompt configured — execution will stop with an error until one is added.';
}

/** The ONLY system-prompt layers the preview genuinely cannot render — they need live DB/pipeline data.
 *  The ${contextualInformation} block, ## Constraints, and ## Scope Self-Check are now rendered inline (below)
 *  via the SAME functions the engine uses (buildContextSummary / renderConstraintsBlock / SCOPE_SELF_CHECK),
 *  so they no longer belong on this "can't-preview" list. */
const RUNTIME_SYSTEM_LAYERS =
  '── Also inserted at run time (needs live data — cannot preview) ──\n' +
  '+ Orchestration protocols (prepended) — if the template metadata sets loadProtocols / protocol\n' +
  '+ Harness context block (prepended) — PIPELINE / harness tasks only\n' +
  '+ Hub tool-routing guidance (inserted before ## Constraints) — only if the `services` tool is granted';

/** The builder's task fetch lacks the POV relation; stub the id (from the URL) so the context block + §5
 *  show the REAL id instead of "not-available". Business fields (customer/objective/solution) genuinely
 *  load at run time. Shared by the system-prompt context block AND the user-prompt builder so they agree. */
function makeTaskForPreview(taskInfo: any, povId?: string): any {
  return taskInfo?.pov || !povId
    ? taskInfo
    : { ...taskInfo, pov: { id: povId, title: '(full POV context loads at run time)' } };
}

/**
 * Task mode (2026-06-10): render the REAL user prompt via the SAME shared
 * builder the execution engine calls (lib/agents/harness/build-agent-prompt-body)
 * — it cannot drift from production. Run-time-only data (dependency outputs)
 * is annotated rather than faked.
 */
function buildRealUserPrompt(
  state: BuilderFormState,
  taskInfo: any,
  template?: { role: string; constraints?: any },
  povId?: string
): string {
  const resolvedTools = state.mcpTools.length
    ? state.mcpTools
    : SELECTABLE_TOOLS.map((t) => t.name);
  const taskForPreview = makeTaskForPreview(taskInfo, povId);
  try {
    return buildAgentPromptBody(
      taskForPreview,
      {
        prompt: state.prompt || undefined,
        agentRole: state.role || taskInfo?.agentRole || 'custom',
        mcpTools: resolvedTools,
      },
      template ? { agentTemplate: { defaultRole: template.role, constraints: template.constraints } } : {}
    );
  } catch {
    return '(preview unavailable — see Monitoring → Prompts (this run) for the exact prompt)';
  }
}

export function AgentBuilderPreview({ state, taskId, taskTitle, isTemplateMode, taskInfo, templates, povId }: AgentBuilderPreviewProps) {
  const systemPrompt = assembleSystemPrompt(state);

  // Task mode: resolve the assigned template (form selection first, then the
  // task's stored assignment) for the REAL effective system prompt.
  const assignedTemplate = !isTemplateMode
    ? (templates || []).find(
        (t) => t.id === (state.templateId || taskInfo?.agentTemplateId)
      )
    : undefined;
  // Task shape for the context block — SAME stub the user-prompt builder uses (they must agree).
  const taskForPreview = !isTemplateMode ? makeTaskForPreview(taskInfo, povId) : null;
  const effectiveSystemPrompt = assignedTemplate
    ? (() => {
        const role = state.role || assignedTemplate.role || 'assistant';
        // HEAD: the template with ${agentRole}/${formattedRole} resolved AND the REAL ${contextualInformation}
        // filled by buildContextSummary — the SAME builder the engine calls, so this matches production
        // (POV business lines stub to "loads at run time" only because the builder's task fetch omits the POV relation).
        const head = assignedTemplate.prompt
          .replace(/\$\{agentRole\}/g, role)
          .replace(/\$\{formattedRole\}/g, role)
          .replace(/\$\{contextualInformation\}/g,
            taskForPreview ? buildContextSummary(taskForPreview) : 'Context will be provided during task execution.');
        // Pure tail layers in run-time order (## Constraints via renderConstraintsBlock, then ## Scope Self-Check) —
        // the identical functions applySystemPromptInjections appends. The DB-only layers (protocols/harness/hub)
        // prepend/insert at run time and are listed in RUNTIME_SYSTEM_LAYERS below.
        return head + renderConstraintsBlock(assignedTemplate.constraints) + SCOPE_SELF_CHECK;
      })()
    : null;

  if (isTemplateMode) {
    return (
      <div className="font-mono text-xs space-y-3 text-muted-foreground">
        <div className="text-amber-400 font-bold text-sm mb-3">TEMPLATE CONFIGURATION</div>

        <PreviewBlock label="Template">
          <span className="text-foreground">{state.templateName || '(unnamed)'}</span>
        </PreviewBlock>

        <PreviewBlock label="Role">
          <span className="text-foreground">{state.role || '(not set)'}</span>
        </PreviewBlock>

        <PreviewBlock label="Model">
          <span className="text-foreground">{state.model}</span>
          <span className="ml-2">temp={state.temperature}</span>
          <span className="ml-2">maxTok={state.maxTokens}</span>
        </PreviewBlock>

        <FeatureBadges state={state} />

        <Separator className="opacity-30" />

        <div className="text-muted-foreground mb-1">{'// Template System Prompt:'}</div>
        <pre className="whitespace-pre-wrap text-foreground bg-muted/30 rounded p-2">
          {systemPrompt}
        </pre>
        <div className="text-amber-400/80 mt-1 text-[11px]">
          + at run time the engine adds your task/POV context, an always-on scope self-check, and any
          protocol — assign this template to a task to preview the full effective prompt.
        </div>
      </div>
    );
  }

  // Task Mode preview — shows agent.configure command
  return (
    <div className="font-mono text-xs space-y-3 text-muted-foreground">
      <div className="flex items-center justify-between mb-3">
        <div className="text-amber-400 font-bold text-sm">EFFECTIVE CONFIGURATION</div>
        <AgentExecutionExplainer
          trigger={
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-muted-foreground">
              <HelpCircle className="h-3.5 w-3.5 mr-1" />
              how is this built?
            </Button>
          }
        />
      </div>

      <div className="text-green-400">agent.configure({"{"}</div>
      <div className="pl-4 space-y-1">
        <PreviewLine label="taskId" value={`"${taskId || '...'}"` } />
        <PreviewLine label="role" value={`"${state.role || 'assistant'}"`} />
        {state.templateId && (
          <PreviewLine label="agentTemplateId" value={`"${state.templateId}"`} />
        )}
        <div className="text-muted-foreground">modelParameters: {"{"}</div>
        <div className="pl-4 space-y-0.5">
          <PreviewLine label="provider" value={`"${state.provider}"`} />
          <PreviewLine label="model" value={`"${state.model}"`} />
          <PreviewLine label="temperature" value={String(state.temperature)} />
          <PreviewLine label="maxTokens" value={String(state.maxTokens)} />
          {state.webSearch && <PreviewLine label="webSearch" value={`{ maxUses: ${state.webSearch.maxUses || 3} }`} />}
          {state.thinkingBudgetTokens && <PreviewLine label="thinkingBudgetTokens" value={String(state.thinkingBudgetTokens)} />}
          {state.cacheControl && <PreviewLine label="cacheControl" value='{ type: "ephemeral" }' />}
          {state.cacheControl === false && <PreviewLine label="cacheControl" value="false  // caching opted out" />}
        </div>
        <div className="text-muted-foreground">{"}"},</div>
        {state.mcpTools.length > 0 && (
          <PreviewLine label="mcpTools" value={`[${state.mcpTools.map(t => `"${t}"`).join(', ')}]`} />
        )}
        {state.stopSequences.length > 0 && (
          <PreviewLine label="stopSequences" value={`[${state.stopSequences.map(s => `"${s}"`).join(', ')}]`} />
        )}
      </div>
      <div className="text-green-400">{"}"});</div>
      <div className="text-amber-400/80 text-[11px]">
        maxTokens &amp; thinking are clamped to the model&apos;s ceiling at run time; temperature is dropped on
        models that don&apos;t accept it (Opus / Fable).
      </div>

      <Separator className="opacity-30" />

      {/* REAL effective system prompt (2026-06-10): the assigned template's
          prompt — what the engine actually starts from — plus an honest list
          of the layers added at run time. */}
      <div className="text-muted-foreground mb-1">
        {'// Effective System Prompt'}
        {assignedTemplate ? ` (from template "${assignedTemplate.name}"):` : ':'}
      </div>
      <pre className="whitespace-pre-wrap text-foreground bg-muted/30 rounded p-2 max-h-64 overflow-y-auto">
        {effectiveSystemPrompt ||
          'No template assigned — execution will stop with a clear error until one is applied.'}
      </pre>
      <pre className="whitespace-pre-wrap text-amber-400/80 bg-muted/20 rounded p-2">
        {RUNTIME_SYSTEM_LAYERS}
      </pre>

      {/* REAL user prompt via the engine's own builder — cannot drift. */}
      {taskInfo && (
        <>
          <div className="text-muted-foreground mb-1">{'// Effective User Prompt (the work order, rebuilt each run):'}</div>
          <pre className="whitespace-pre-wrap text-foreground bg-muted/30 rounded p-2 max-h-72 overflow-y-auto">
            {buildRealUserPrompt(state, taskInfo, assignedTemplate, povId)}
          </pre>
          <div className="text-amber-400/80">
            + outputs of earlier tasks this one depends on (resolved at run time)
          </div>
        </>
      )}

      <div className="text-muted-foreground pt-1">
        {'// Exact prompts for any run: Monitoring tab → Prompts (this run) — live-only, copy to keep.'}
      </div>

      <FeatureBadges state={state} />
    </div>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-blue-400">{label}</span>
      <span className="text-muted-foreground">: </span>
      <span className="text-foreground">{value},</span>
    </div>
  );
}

function PreviewBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-blue-400">{label}: </span>
      {children}
    </div>
  );
}

function FeatureBadges({ state }: { state: BuilderFormState }) {
  const features = [];
  if (state.webSearch) features.push('Web Search');
  if (state.thinkingBudgetTokens) features.push(`Thinking (${state.thinkingBudgetTokens})`);
  if (state.cacheControl) features.push('Caching');
  else if (state.cacheControl !== false) features.push('Caching (default)');
  if (state.mcpTools.length > 0) features.push(`${state.mcpTools.length} Tools`);

  if (features.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {features.map(f => (
        <Badge key={f} variant="outline" className="text-[10px] font-mono">
          {f}
        </Badge>
      ))}
    </div>
  );
}
