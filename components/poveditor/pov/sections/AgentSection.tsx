"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { Bot, User, Star, ExternalLink, Play, ChevronDown, Save, Cpu, Globe, Brain, Wrench } from 'lucide-react';
import { useEditorContext } from '../context';
import { useSelectedTask } from '../hooks/useSelectedTask';
import { AgentMonitoringView } from '../components/AgentMonitoringView';
import { ArtifactViewer } from '../components/ArtifactViewer';
import { AgentExecutionExplainer } from '@/components/agents/AgentExecutionExplainer';
import { Task } from '../context/types/EntityTypes';
import { AgentTemplateService, AgentTemplate } from '@/lib/pov/api/agent-templates-adapter';

export default function AgentSection() {
  const { state, updateField, updateEntity } = useEditorContext();
  const { selectedTaskId: hookSelectedTaskId } = useSelectedTask();
  const [activeTab, setActiveTab] = useState('configuration');
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [promptDraft, setPromptDraft] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const selectedTaskId = state.ui?.selectedTaskId || hookSelectedTaskId;
  const selectedTask = selectedTaskId
    ? state.entities.tasks[selectedTaskId] as Task | undefined
    : undefined;
  const isProjectMode = state.ui?.mode === 'project';
  const povId = state.data?.id;

  // Fetch templates on mount
  useEffect(() => {
    AgentTemplateService.getTemplates().then(res => {
      if (res.success && res.data) setTemplates(res.data);
    }).catch(() => {});
  }, []);

  // Sync prompt draft with task
  useEffect(() => {
    setPromptDraft(selectedTask?.prompt || '');
    setSelectedTemplateId(selectedTask?.agentTemplateId || '');
  }, [selectedTask?.id, selectedTask?.prompt, selectedTask?.agentTemplateId]);

  // Find linked template (must be before model params extraction).
  // Note: `agentTemplateId` is null for tasks with no agent assigned (correct); for assigned tasks it
  // is present end-to-end — verified 2026-07-03 against the live /api/pov/[id] response (the field is a
  // key, null only when unassigned) + the select (pov.ts get() task batch) + the normalizer copies.
  // (The earlier "field is dropped" TODO was a stale mis-read of an unassigned task's correct null.)
  const linkedTemplate = templates.find(t => t.id === selectedTask?.agentTemplateId);

  // #2 (2026-07-14): warn when a NON-harness template is selected for a PIPELINE
  // task. A PIPELINE task auto-assigns the Pipeline Harness on execute; applying
  // any other template overrides that and silently runs a SINGLE agent instead of
  // decomposing the pipeline (the Data-Analyst-on-PIPELINE footgun). Keyed on role,
  // not name, so a renamed template still matches.
  const pendingTemplate = templates.find(t => t.id === selectedTemplateId);
  const pipelineTemplateMismatch =
    selectedTask?.type === 'PIPELINE' &&
    !!pendingTemplate &&
    pendingTemplate.role !== 'pipeline_harness_orchestrator';

  // Extract model parameters from task metadata, falling back to linked template
  const taskModelParams = selectedTask?.metadata && typeof selectedTask.metadata === 'object'
    ? (selectedTask.metadata as any).modelParameters || {}
    : {};
  const templateModelParams: any = linkedTemplate?.modelParameters || {};
  const modelParams = taskModelParams;
  // Effective values: task overrides > template defaults > 'default'
  const effectiveModel = taskModelParams.model || templateModelParams.model;
  const effectiveTemp = taskModelParams.temperature ?? templateModelParams.temperature;
  const effectiveMaxTokens = taskModelParams.maxTokens || templateModelParams.maxTokens;

  // mcpContext.tools is stored as objects ({name, ...}) by the configure
  // handler; legacy/manual writes may be plain strings. Normalize to names —
  // raw objects render as "[object Object]" (same shape class as the
  // AgentBuilder load fix, 24744319).
  const mcpTools: string[] = (
    selectedTask?.mcpContext && typeof selectedTask.mcpContext === 'object'
      ? ((selectedTask.mcpContext as any).tools || [])
      : []
  )
    .map((t: any) => (typeof t === 'string' ? t : t?.name))
    .filter(Boolean);

  // Helper functions
  const phases = Object.values(state.entities.phases);
  const teamMembers = Object.values(state.entities.team);

  const getPhaseName = (phaseId?: string) => {
    if (!phaseId) return '';
    const phase = phases.find(p => p.id === phaseId);
    return phase ? phase.name : '';
  };

  const getAssigneeName = (task?: Task) => {
    if (!task) return '';
    if (task.assignee) return task.assignee.name;
    if (task.assigneeId) {
      const a = teamMembers.find(m => m.id === task.assigneeId);
      return a ? a.name : '';
    }
    return '';
  };

  // PIPELINE tasks are auto-assigned the Pipeline Harness template at execution
  // time (no manual agent.assign needed), so they count as "configured" even
  // without agentRole or prompt set. This ensures the GUI shows the Execute
  // button for PIPELINE tasks created via MCP or the harness guide.
  const isConfigured = !!(selectedTask?.agentRole || selectedTask?.prompt || selectedTask?.type === 'PIPELINE');

  // Apply template to task
  const handleApplyTemplate = useCallback(async () => {
    if (!selectedTask || !selectedTemplateId) return;
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    setApplyingTemplate(true);
    try {
      // maxToolTurns is a TEMPLATE-controlled orchestration key: the configure
      // endpoint rejects it on any per-task write path (model-parameters.ts
      // rejectTemplateControlledKeys, D-1 2026-06-18). Forwarding a template's
      // full modelParameters therefore 400s for any template that sets it
      // (Pipeline Harness=100, IaC State Harvester=60). Strip it here; every
      // other model param passes through unchanged.
      const applyModelParameters = { ...(template.modelParameters || {}) };
      delete (applyModelParameters as any).maxToolTurns;

      // Use /api/agents/configure — the TARGETED write (fresh in-tx read, writes only
      // modelParameters/mcpStorage*) is the correct pattern for platform-adjacent metadata.
      // (The old premise here — "UpdateTaskSchema does NOT accept metadata" — has been false
      // since BC76 (task-validation.ts:238 passes metadata through); the conclusion stands for
      // a better reason: wholesale metadata via the funnel is the STALE-CLOBBER surface the
      // platform-run-keys guard now drops keys on. Corrected 2026-08-19, panel R11.)
      const response = await fetch('/api/agents/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask.id,
          agentRole: template.role,
          agentTemplateId: template.id,
          modelParameters: applyModelParameters,
          maxRetries: template.maxRetries,
          timeout: template.timeout,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.data?.result?.task;
        updateEntity('tasks', selectedTask.id, {
          ...selectedTask,
          agentRole: result?.agentRole ?? template.role,
          agentTemplateId: result?.agentTemplateId ?? template.id,
          prompt: result?.prompt ?? selectedTask.prompt,
        });
      }
    } catch {
      // Template application failed silently
    } finally {
      setApplyingTemplate(false);
    }
  }, [selectedTask, selectedTemplateId, templates, updateEntity]);

  // Save prompt quick edit
  const handleSavePrompt = useCallback(async () => {
    if (!selectedTask || promptDraft === selectedTask.prompt) return;

    setSaving(true);
    try {
      // Use /api/agents/configure — the task update endpoint (UpdateTaskSchema)
      // does NOT accept the prompt field (silently strips it)
      const response = await fetch('/api/agents/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask.id,
          agentRole: selectedTask.agentRole || undefined,
          prompt: promptDraft || undefined,
        }),
      });

      if (response.ok) {
        updateEntity('tasks', selectedTask.id, {
          ...selectedTask,
          prompt: promptDraft || undefined,
        });
      }
    } catch {
      // Save failed silently
    } finally {
      setSaving(false);
    }
  }, [selectedTask, promptDraft, updateEntity]);

  // Configuration summary content
  const ConfigurationContent = ({ task }: { task: Task }) => (
    <div className="space-y-4 pt-4">
      {/* Template Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Template</Label>
        <div className="flex gap-2">
          <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No template</SelectItem>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.role})
                  {t.role === 'pipeline_harness_orchestrator' ? ' — auto-assigned to Pipeline tasks' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleApplyTemplate}
            disabled={!selectedTemplateId || selectedTemplateId === 'none' || applyingTemplate}
          >
            {applyingTemplate ? 'Applying...' : 'Apply'}
          </Button>
        </div>
        {pipelineTemplateMismatch && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            ⚠️ This is a <strong>PIPELINE</strong> task — executing it auto-assigns the <strong>Pipeline Harness</strong> orchestrator. Applying a different template overrides that and runs a single agent instead of decomposing the pipeline.
          </div>
        )}
      </div>

      {/* Quick Prompt Edit */}
      <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="flex w-full justify-between px-0">
            <span className="text-sm font-medium">Task Instructions (User Prompt)</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${promptOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          <Textarea
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            placeholder="Task-specific directives for the agent..."
            rows={4}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSavePrompt}
              disabled={saving || promptDraft === (task.prompt || '')}
            >
              <Save className="h-3 w-3 mr-1" />
              {saving ? 'Saving...' : 'Save Prompt'}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Configuration Summary Card */}
      {isConfigured ? (
        <Card className="bg-muted/30">
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium">{task.agentRole || 'Not set'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Model:</span>
                <span className="font-medium">{effectiveModel || 'default'}</span>
                {!taskModelParams.model && effectiveModel && (
                  <span className="text-xs text-muted-foreground">(from template)</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground ml-5">Temp:</span>
                <span className="font-medium">{effectiveTemp ?? 'default'}</span>
                {taskModelParams.temperature == null && effectiveTemp != null && (
                  <span className="text-xs text-muted-foreground">(from template)</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground ml-5">Max Tokens:</span>
                <span className="font-medium">{effectiveMaxTokens || 'default'}</span>
                {!taskModelParams.maxTokens && effectiveMaxTokens && (
                  <span className="text-xs text-muted-foreground">(from template)</span>
                )}
              </div>
              {mcpTools.length > 0 && (
                <div className="flex items-center gap-1.5 col-span-2">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Tools:</span>
                  <span className="font-medium">{mcpTools.join(', ')} ({mcpTools.length})</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 col-span-2 flex-wrap">
                {modelParams.webSearch && (
                  <Badge variant="outline" className="text-xs">
                    <Globe className="h-3 w-3 mr-1" />
                    Web Search
                  </Badge>
                )}
                {modelParams.thinkingBudgetTokens && (
                  <Badge variant="outline" className="text-xs">
                    <Brain className="h-3 w-3 mr-1" />
                    Thinking ({modelParams.thinkingBudgetTokens})
                  </Badge>
                )}
                {modelParams.cacheControl !== false && (
                  <Badge variant="outline" className="text-xs">
                    {modelParams.cacheControl ? 'Caching' : 'Caching (default)'}
                  </Badge>
                )}
              </div>
              {task.prompt && (
                <div className="col-span-2 mt-1">
                  <span className="text-muted-foreground text-xs">Prompt: </span>
                  <span className="text-xs">{task.prompt.length > 120 ? task.prompt.slice(0, 120) + '...' : task.prompt}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-6 text-center">
            <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No agent configured. Select a template above or open the Builder.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const params = new URLSearchParams();
            if (selectedTask?.id) params.set('taskId', selectedTask.id);
            if (povId) params.set('povId', povId);
            window.location.href = `/agents?${params.toString()}`;
          }}
          disabled={!selectedTask}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Open in Builder
        </Button>
        {isConfigured && (
          <Button
            size="sm"
            onClick={() => setActiveTab('monitoring')}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Execute Agent
          </Button>
        )}
        <AgentExecutionExplainer />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Selected Task Context (Project Mode) */}
      {selectedTask && isProjectMode && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-2">{selectedTask.title}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Agent Role:</span>
                    <div className="mt-1">
                      {selectedTask.agentRole ? (
                        <Badge className="bg-primary/20 text-primary">
                          {selectedTask.agentRole}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Not configured</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Template:</span>
                    <div className="mt-1">
                      {linkedTemplate ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <Star className="h-3 w-3 mr-1" />
                          {linkedTemplate.name}
                        </Badge>
                      ) : isConfigured ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          Custom
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Assignee:</span>
                    <div className="mt-1 flex items-center">
                      {(selectedTask.assigneeId || selectedTask.assignee) ? (
                        <>
                          <User className="h-3 w-3 mr-1" />
                          <span>{getAssigneeName(selectedTask)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phase:</span>
                    <div className="mt-1">
                      <span className="font-medium">{getPhaseName(selectedTask.phaseId)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Empty State for Project Mode */}
      {!selectedTask && isProjectMode && (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Task Selected</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Select a task from one of the phase tabs to configure its agent capabilities.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Main Agent Tabs */}
      {(!isProjectMode || selectedTask) && (
        <Card>
          <CardContent className="pt-6">
            {!selectedTask && !isProjectMode ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Task Selected</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Select a task in the Phases tab to configure its agent capabilities.
                </p>
              </div>
            ) : selectedTask ? (
              <Tabs defaultValue="configuration" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="configuration">Configuration</TabsTrigger>
                  <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
                  <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
                </TabsList>

                <TabsContent value="configuration">
                  <ConfigurationContent task={selectedTask} />
                </TabsContent>

                <TabsContent value="monitoring" className="min-h-[800px]">
                  <AgentMonitoringView task={selectedTask} />
                </TabsContent>

                <TabsContent value="artifacts" className="min-h-[800px]">
                  <ArtifactViewer task={selectedTask} />
                </TabsContent>
              </Tabs>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
