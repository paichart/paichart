"use client";

import { createPortal } from 'react-dom';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import {
  Bot, Save, Play, Star, AlertCircle, CheckCircle, Loader2, X
} from 'lucide-react';
import { AgentBuilderForm, BuilderFormState, getDefaultFormState } from './AgentBuilderForm';
import { AgentBuilderPreview } from './AgentBuilderPreview';
import { AgentTemplate, AgentTemplateService } from '@/lib/pov/api/agent-templates-adapter';
import { LLMProvider } from '@/lib/services/llm/types';
import { TemplateType, AgentCategory } from '@prisma/client';

/**
 * DOM id of the slot in app/(authenticated)/agents/page.tsx's tab row that this component
 * portals its action buttons into (2026-08-06). The buttons previously sat at the bottom of a
 * tall form and were below the fold even full-screen.
 *
 * A portal rather than lifting state: the buttons' enabled/saving/label logic all derives from
 * this component's internal formState, so lifting it would mean either hoisting the whole form
 * or maintaining a parallel snapshot in the page — both more coupling and more to desync. The
 * portal moves only the DOM destination; every handler and guard stays exactly where it was.
 */
export const AGENT_BUILDER_ACTIONS_SLOT_ID = 'agents-tab-actions';

export interface AgentBuilderProps {
  taskId?: string;
  templateId?: string;
  povId?: string;
  embedded?: boolean;
  onClose?: () => void;
}

interface TaskInfo {
  id: string;
  title: string;
  description?: string;
  status?: string;
  agentRole?: string;
  agentTemplateId?: string;
  prompt?: string;
  metadata?: any;
  mcpContext?: any;
}

export function AgentBuilder({ taskId, templateId, povId, embedded, onClose }: AgentBuilderProps) {
  const isTemplateMode = !taskId;

  // Resolved in an effect, not at render: on the first render of this component the slot node
  // exists (the page renders it above TabsContent), but reading the DOM during render would be
  // unsafe. Falls back to inline rendering if the slot is ever absent — see the action block.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setActionsSlot(document.getElementById(AGENT_BUILDER_ACTIONS_SLOT_ID));
  }, []);

  const [formState, setFormState] = useState<BuilderFormState>(getDefaultFormState());
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [taskInfo, setTaskInfo] = useState<TaskInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  // Track changes
  const handleFormChange = useCallback((newState: BuilderFormState) => {
    setFormState(newState);
    setDirty(true);
    setSaveResult(null);
  }, []);

  // Load templates
  useEffect(() => {
    AgentTemplateService.getTemplates().then(res => {
      if (res.success && res.data) setTemplates(res.data);
    }).catch(() => {});
  }, []);

  // Load task info (Task Mode) — fetch only. Form state is derived separately
  // (below) so it can fold in the linked template once `templates` has loaded.
  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    fetch(`/api/tasks/${taskId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const task = data?.data || data;
        if (task) setTaskInfo(task);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  // Derive Task-Mode form state from the task OVERLAID ON its linked template.
  // Mirrors the engine + POV-editor resolution (task override > template > default)
  // so the Builder shows what actually runs. The old code read ONLY
  // task.metadata.modelParameters and fell straight to a hardcoded
  // 'claude-haiku-4-5' — for a template-inheriting task that displayed Haiku even
  // though the engine ran the template's model (e.g. Sonnet), and "Apply Config"
  // would then PIN that wrong default into task.metadata. Depends on `templates`,
  // and waits for it when the task is template-linked, so the fallback resolves
  // before first paint (no Haiku→template-model flash).
  useEffect(() => {
    if (!taskId || !taskInfo) return;
    const task = taskInfo as any;
    if (task.agentTemplateId && templates.length === 0) return; // wait for templates
    const mp = task.metadata?.modelParameters || {};
    const linkedTemplate = templates.find(t => t.id === task.agentTemplateId);
    const tmp: any = linkedTemplate?.modelParameters || {};
    // mcpContext.tools is stored as objects ({name, ...}) by the configure
    // handler; legacy/manual writes may be plain strings. Normalize to names.
    const mcpTools: string[] = (task.mcpContext?.tools || [])
      .map((t: any) => (typeof t === 'string' ? t : t?.name))
      .filter(Boolean);
    setFormState({
      role: task.agentRole || mp.role || '',
      prompt: task.prompt || '',
      templateId: task.agentTemplateId || '',
      templateName: '',
      description: '',
      // Inherit the linked template's functional role (same gap as model);
      // GENERALIST only as the genuine fallback when no template is linked.
      templateType: linkedTemplate?.templateType ?? TemplateType.GENERALIST,
      category: AgentCategory.GENERAL,
      protocol: '',
      provider: mp.provider || tmp.provider || LLMProvider.ANTHROPIC_SDK,
      model: mp.model || tmp.model || 'claude-haiku-4-5',
      temperature: mp.temperature ?? tmp.temperature ?? 0.3,
      maxTokens: mp.maxTokens ?? tmp.maxTokens ?? 8192,
      stopSequences: mp.stopSequences || tmp.stopSequences || [],
      webSearch: mp.webSearch ?? tmp.webSearch,
      cacheControl: mp.cacheControl ?? tmp.cacheControl,
      thinkingBudgetTokens: mp.thinkingBudgetTokens ?? tmp.thinkingBudgetTokens,
      mcpTools,
      inputContext: task.inputContext,
    });
  }, [taskId, taskInfo, templates]);

  // Load template (Template Mode, editing existing)
  useEffect(() => {
    if (!templateId || taskId) {
      if (!taskId) setLoading(false);
      return;
    }

    AgentTemplateService.getTemplate(templateId).then(res => {
      if (res.success && res.data) {
        const t = res.data;
        setFormState({
          role: t.role,
          prompt: t.prompt,
          templateId: t.id,
          templateName: t.name,
          description: t.description || '',
          // Null-coalesce: templateType column is nullable in Prisma; legacy
          // rows may return null. Form state must have a valid enum value,
          // never null or empty string.
          templateType: t.templateType ?? TemplateType.GENERALIST,
          category: t.category ?? AgentCategory.GENERAL,
          protocol: t.protocol ?? '',
          provider: t.modelParameters?.provider || LLMProvider.ANTHROPIC_SDK,
          model: t.modelParameters?.model || 'claude-haiku-4-5',
          temperature: t.modelParameters?.temperature ?? 0.3,
          maxTokens: t.modelParameters?.maxTokens ?? 8192,
          stopSequences: t.modelParameters?.stopSequences || [],
          webSearch: t.modelParameters?.webSearch,
          cacheControl: t.modelParameters?.cacheControl,
          thinkingBudgetTokens: t.modelParameters?.thinkingBudgetTokens,
          mcpTools: t.mcpTools ?? [],
          inputContext: t.inputContext,
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [templateId, taskId]);

  // Apply Configuration (Task Mode) — uses configuration service
  const handleApplyConfig = useCallback(async () => {
    if (!taskId) return;
    setSaving(true);
    setSaveResult(null);

    try {
      const res = await fetch('/api/agents/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          agentRole: formState.role,
          agentTemplateId: formState.templateId || undefined,
          prompt: formState.prompt || undefined,
          modelParameters: {
            provider: formState.provider,
            model: formState.model,
            temperature: formState.temperature,
            maxTokens: formState.maxTokens,

            stopSequences: formState.stopSequences.length ? formState.stopSequences : undefined,
            webSearch: formState.webSearch,
            cacheControl: formState.cacheControl,
            thinkingBudgetTokens: formState.thinkingBudgetTokens,
          },
          mcpTools: formState.mcpTools.length ? formState.mcpTools : undefined,
          // Send undefined (omit), never null — the schema's inputContext is safePassthrough().optional()
          // which rejects null ("Expected object, received null"). A task with no input context has
          // inputContext === null, which 400'd the whole configure (blocking both the save and the
          // return-to-task nav). 2026-06-19.
          inputContext: formState.inputContext || undefined,
        }),
      });

      if (res.ok) {
        setSaveResult({ type: 'success', message: 'Configuration applied — returning to task…' });
        setDirty(false);
        // Return to the POV task's agent configuration tab on success (2026-06-19). The full-page
        // navigation also forces a FRESH read of the just-saved task.metadata.modelParameters —
        // without it the builder/POV tab serve the stale React Query cache and the change looks unsaved.
        if (povId) {
          window.location.href = `/pov/edit/${povId}?mode=project&selectedTaskId=${taskId}&tab=agents&agentTab=configuration`;
          return;
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveResult({ type: 'error', message: err.error || 'Failed to apply configuration' });
      }
    } catch {
      setSaveResult({ type: 'error', message: 'Network error — could not reach server' });
    } finally {
      setSaving(false);
    }
  }, [taskId, povId, formState]);

  // Save Template (Template Mode)
  const handleSaveTemplate = useCallback(async () => {
    if (!formState.templateName) {
      setSaveResult({ type: 'error', message: 'Template name is required' });
      return;
    }
    if (!formState.role) {
      setSaveResult({ type: 'error', message: 'Agent role is required' });
      return;
    }

    setSaving(true);
    setSaveResult(null);

    try {
      const payload = {
        name: formState.templateName,
        description: formState.description,
        role: formState.role,
        prompt: formState.prompt,
        category: formState.category,
        templateType: formState.templateType,
        protocol: formState.protocol || undefined,
        modelParameters: {
          provider: formState.provider,
          model: formState.model,
          temperature: formState.temperature,
          maxTokens: formState.maxTokens,
          stopSequences: formState.stopSequences,
          useSystemPrompt: true,
          systemPrompt: formState.prompt || '',
          webSearch: formState.webSearch,
          cacheControl: formState.cacheControl,
          thinkingBudgetTokens: formState.thinkingBudgetTokens,
        },
        // Template-level tool selection — persisted as
        // metadata.mcpToolConfiguration.selectedTools; tasks using this
        // template inherit these (merged with task-level mcpTools at
        // configure time). Empty = default-all.
        mcpTools: formState.mcpTools.length ? formState.mcpTools : undefined,
        tags: [],
      };

      let res;
      if (templateId) {
        res = await AgentTemplateService.updateTemplate({ id: templateId, ...payload });
      } else {
        res = await AgentTemplateService.createTemplate(payload);
      }

      if (res.success) {
        setSaveResult({ type: 'success', message: templateId ? 'Template updated' : 'Template created' });
        setDirty(false);
      } else {
        setSaveResult({ type: 'error', message: res.error || 'Failed to save template' });
      }
    } catch {
      setSaveResult({ type: 'error', message: 'Network error — could not reach server' });
    } finally {
      setSaving(false);
    }
  }, [formState, templateId]);

  // Save as Template (Task Mode — extract current config into a new template)
  const handleSaveAsTemplate = useCallback(async () => {
    const name = prompt('Template name:');
    if (!name) return;

    setSaving(true);
    try {
      const res = await AgentTemplateService.createTemplate({
        name,
        description: '',
        role: formState.role,
        prompt: formState.prompt,
        category: formState.category,
        templateType: formState.templateType,
        protocol: formState.protocol || undefined,
        modelParameters: {
          provider: formState.provider,
          model: formState.model,
          temperature: formState.temperature,
          maxTokens: formState.maxTokens,
          stopSequences: formState.stopSequences,
          useSystemPrompt: true,
          systemPrompt: formState.prompt || '',
          webSearch: formState.webSearch,
          cacheControl: formState.cacheControl,
          thinkingBudgetTokens: formState.thinkingBudgetTokens,
        },
        tags: [],
      });

      if (res.success) {
        setSaveResult({ type: 'success', message: `Template "${name}" created` });
      } else {
        setSaveResult({ type: 'error', message: res.error || 'Failed to create template' });
      }
    } catch {
      setSaveResult({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  }, [formState]);

  // Execute Agent (Task Mode) — navigate to POV editor monitoring tab
  const handleExecute = useCallback(() => {
    if (!taskId || !povId) return;
    window.location.href = `/pov/edit/${povId}?mode=project&selectedTaskId=${taskId}&tab=agents&agentTab=monitoring`;
  }, [taskId, povId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Extracted so the SAME element can be portalled into the tab row or, if that slot is
  // absent, rendered inline. Identical markup and identical disabled/saving guards either way.
  const actionButtons = (
    <>
      {isTemplateMode ? (
        <Button onClick={handleSaveTemplate} disabled={saving || !formState.templateName || !formState.role}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          {templateId ? 'Update Template' : 'Save Template'}
        </Button>
      ) : (
        <>
          <Button onClick={handleApplyConfig} disabled={saving || !formState.role}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Apply Configuration
          </Button>
          {povId && (
            <Button variant="secondary" onClick={handleExecute} disabled={!formState.role}>
              <Play className="h-4 w-4 mr-1.5" />
              Execute Agent
            </Button>
          )}
        </>
      )}
    </>
  );

  return (
    <Card className={embedded ? 'border-0 shadow-none' : ''}>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {isTemplateMode ? 'Agent Template Editor' : 'Agent Builder'}
            </h2>
            {isTemplateMode ? (
              <Badge variant="outline" className="text-xs">Template Mode</Badge>
            ) : (
              <Badge variant="default" className="text-xs">Task Mode</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isTemplateMode && (
              <Button variant="ghost" size="sm" onClick={handleSaveAsTemplate} disabled={saving || !formState.role}>
                <Star className="h-3.5 w-3.5 mr-1" />
                Save as Template
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Task context banner (Task Mode) */}
        {taskInfo && (
          <div className="flex items-center gap-3 mt-2 p-2 bg-muted/50 rounded text-sm">
            <span className="font-medium">{taskInfo.title}</span>
            {taskInfo.status && <Badge variant="outline" className="text-xs">{taskInfo.status}</Badge>}
            {dirty && <Badge variant="secondary" className="text-xs ml-auto">Unsaved changes</Badge>}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Save result feedback */}
        {saveResult && (
          <Alert className={`mb-4 ${saveResult.type === 'error' ? 'border-red-200' : 'border-green-200'}`}>
            {saveResult.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            <AlertDescription className="text-sm">{saveResult.message}</AlertDescription>
          </Alert>
        )}

        {/* Two-column layout: Form | Preview — left column drives height */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
          {/* Left: Form (drives row height) */}
          <div className="space-y-4">
            <AgentBuilderForm
              state={formState}
              onChange={handleFormChange}
              templates={templates}
              isTemplateMode={isTemplateMode}
            />
          </div>

          {/* Right: Preview (constrained to left column height, scrolls if longer) */}
          <div className="lg:border-l lg:pl-6 lg:max-h-0 lg:min-h-full lg:overflow-auto">
            <AgentBuilderPreview
              state={formState}
              taskId={taskId}
              taskTitle={taskInfo?.title}
              isTemplateMode={isTemplateMode}
              taskInfo={taskInfo}
              templates={templates}
              povId={povId}
            />
          </div>
        </div>

        {/* Action buttons render into the tab row via portal (see
            AGENT_BUILDER_ACTIONS_SLOT_ID). `Reset` was removed 2026-08-06: it wiped the whole
            form to defaults on a single click with no confirmation, and it applied to BOTH
            modes — including a half-filled task configuration. Navigating away achieves the
            same thing without a mis-click destroying work. */}
        {actionsSlot
          ? createPortal(actionButtons, actionsSlot)
          : (
            // Fallback for a mount site outside the agents page. CURRENTLY UNEXERCISED — as of
            // 2026-08-06 AgentBuilder has exactly one caller, and its `embedded` prop is
            // likewise never passed. Kept anyway because the failure it prevents is silent:
            // without it the buttons would simply not render, with no error to notice. Three
            // lines to turn "the save button vanished" into "the save button moved".
            <div className="flex items-center gap-3 pt-6 mt-6 border-t">{actionButtons}</div>
          )}
      </CardContent>
    </Card>
  );
}
