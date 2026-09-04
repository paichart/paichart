'use client';

import React, { useState, useEffect } from 'react';
import {
  Save,
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Server,
  Wrench,
  Code,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  BLOOMBERG_HEADER,
  BLOOMBERG_COLORS,
  BLOOMBERG_TYPOGRAPHY
} from '@/lib/constants/bloomberg-styles';
import { cn } from '@/lib/utils';

// Types
//
// Form-strip Fix A (2026-05-17 boundary-contract C4): `_original` captures the original step JSON at
//   load time. The serializer in handleSave spreads `_original` FIRST and overlays form-state fields, so
//   per-step unknown keys (e.g. `description`, `expectedResult` written by DB-direct seed scripts) survive
//   a GUI edit round-trip.
//
//   Top-level workflow JSONB keys (e.g. `requires`) ARE preserved too, via the `_rawConfig` lane: the list
//   API surfaces the raw config (lib/workflows/handlers.ts) on the workflow object, and handleSave spreads
//   `workflow._rawConfig` first. The new table passes the workflow object through untouched (M3) so both
//   lanes reach this editor — verified live by the 2026-06-30 canary gate.
interface WorkflowStep {
  service: string;
  tool: string;
  arguments?: Record<string, unknown>;

  /** Array of step indices this step depends on. Only for conditional execution mode. */
  dependsOn?: number[];

  /** Custom timeout in milliseconds. Overrides workflow timeout if set. */
  timeout?: number;

  /** Number of retry attempts on retryable errors (0-5, default 0) */
  retries?: number;

  /** Base delay between retries in milliseconds (1000-30000, default 2000). Uses exponential backoff. */
  retryDelay?: number;

  /** Form-strip Fix A (2026-05-17 boundary-contract C4): captures the original step
   *  JSON at load time so unknown keys (e.g., `description`, `expectedResult` written
   *  by DB-direct seed scripts) survive a GUI edit round-trip. Spread FIRST in the
   *  serializer at handleSave so form fields overlay it. */
  _original?: Record<string, unknown>;
}

/**
 * Complete workflow form data including orchestration config
 */
interface WorkflowFormData {
  name: string;
  description: string | null;
  category: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DEPRECATED';
  steps: WorkflowStep[];

  // Orchestration configuration
  executionMode: 'sequential' | 'parallel' | 'conditional';
  failureStrategy: 'stop' | 'continue' | 'rollback';
  timeout: number;  // in milliseconds
}

interface Workflow {
  id?: string;
  name: string;
  description: string | null;
  category: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DEPRECATED';
  steps: WorkflowStep[];

  // Orchestration configuration (from API after extraction)
  executionMode?: 'sequential' | 'parallel' | 'conditional';
  failureStrategy?: 'stop' | 'continue' | 'rollback';
  timeout?: number;  // in milliseconds from API

  /** Top-level form-strip fix (Phase 5 2026-05-17): raw JSONB config from the API.
   *  Spread FIRST in handleSave's `steps: {...}` object so unknown top-level keys
   *  (e.g., `requires` from bug #2) survive GUI edits. The extracted fields above
   *  remain the primary form-state surface; _rawConfig is preservation-only. */
  _rawConfig?: Record<string, unknown>;
}

interface Service {
  id: string;
  name: string;
  status: string;
  capabilities: {
    tools?: string[];
  };
}

interface WorkflowEditorProps {
  workflow?: Workflow;
  onSave: (workflow: {
    name: string;
    description: string | null;
    category: string | null;
    status: 'ACTIVE' | 'PAUSED' | 'DEPRECATED';
    steps: {
      steps: WorkflowStep[];
      executionMode: 'sequential' | 'parallel' | 'conditional';
      failureStrategy: 'stop' | 'continue' | 'rollback';
      timeout: number;
    };
  }) => void;
  onCancel: () => void;
}

const CATEGORIES = [
  'analysis',
  'automation',
  'deployment',
  'documentation',
  'general',
  'intelligence',
  'monitoring',
  'onboarding',
  'reporting',
  'testing',
];

/**
 * WorkflowEditor - Create/Edit workflow with step builder
 *
 * Features:
 * - Basic workflow info (name, description, category)
 * - Step builder with service/tool selection
 * - JSON arguments editor
 * - Step reordering
 */
export function WorkflowEditor({ workflow, onSave, onCancel }: WorkflowEditorProps) {
  const isNew = !workflow?.id;

  // Form state
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [category, setCategory] = useState(workflow?.category || 'general');
  const [status, setStatus] = useState<'ACTIVE' | 'PAUSED' | 'DEPRECATED'>(
    workflow?.status || 'ACTIVE'
  );
  // Form-strip Fix A: wrap each loaded step with its original JSON for round-trip preservation.
  // If the workflow prop comes from parent extraction (Workflow.steps is typed as WorkflowStep[]),
  // _original captures the full step object as-loaded. Any unknown keys present at load time
  // get re-emitted on save via the serializer's spread.
  const [steps, setSteps] = useState<WorkflowStep[]>(
    (workflow?.steps || []).map(step => ({
      ...step,
      _original: { ...step } as Record<string, unknown>
    }))
  );

  // Orchestration configuration (Phase 1)
  const [executionMode, setExecutionMode] = useState<'sequential' | 'parallel' | 'conditional'>(
    workflow?.executionMode || 'sequential'
  );
  const [failureStrategy, setFailureStrategy] = useState<'stop' | 'continue' | 'rollback'>(
    workflow?.failureStrategy || 'stop'
  );
  const [timeout, setTimeout] = useState<number>(
    workflow?.timeout ? Math.round(workflow.timeout / 1000) : 60  // Display in seconds
  );

  // Services state
  const [services, setServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch available services
  useEffect(() => {
    const fetchServices = async () => {
      try {
        // Try MCP Hub services(action: "discover") or fall back to internal endpoint
        const response = await fetch('/api/mcp/services');
        if (response.ok) {
          const data = await response.json();
          // M6: /api/mcp/services returns { data: { services } } — reading data.services left the
          // service/tool autocomplete datalists empty in the Builder.
          setServices(data.data?.services || data.services || []);
        }
      } catch (err) {
        console.error('Failed to fetch services:', err);
      } finally {
        setIsLoadingServices(false);
      }
    };

    fetchServices();
  }, []);

  // Add new step
  const addStep = () => {
    setSteps([...steps, {
      service: '',
      tool: '',
      arguments: {},
      dependsOn: [],
      timeout: undefined
    }]);
  };

  // Remove step
  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  // Update step
  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    setSteps(steps.map((step, i) =>
      i === index ? { ...step, ...updates } : step
    ));
  };

  // Move step up
  const moveStepUp = (index: number) => {
    if (index === 0) return;
    const newSteps = [...steps];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    setSteps(newSteps);
  };

  // Move step down
  const moveStepDown = (index: number) => {
    if (index === steps.length - 1) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
    setSteps(newSteps);
  };

  // Get tools for a service
  const getToolsForService = (serviceName: string): string[] => {
    const service = services.find(s => s.name === serviceName);
    return service?.capabilities?.tools || [];
  };

  // Handle save
  const handleSave = async () => {
    if (!name.trim()) {
      alert('Workflow name is required');
      return;
    }

    if (steps.length === 0) {
      alert('At least one step is required');
      return;
    }

    // Validate steps
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].service || !steps[i].tool) {
        alert(`Step ${i + 1}: Service and tool are required`);
        return;
      }
    }

    // Phase 3.1: Validate circular dependencies in conditional mode
    if (executionMode === 'conditional') {
      for (let i = 0; i < steps.length; i++) {
        const deps = steps[i].dependsOn || [];
        if (deps.some(d => d >= i)) {
          alert(`Step ${i + 1}: Cannot depend on itself or future steps`);
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      // Phase 3.1: CRITICAL - Wrap steps in WorkflowConfigSchema structure
      //
      // Form-strip Fix A (2026-05-17 boundary-contract C4): for each step, spread the
      // `_original` JSON FIRST so unknown keys (e.g., `description`, `expectedResult`
      // written by DB-direct seed scripts) survive the GUI edit round-trip. Then
      // overlay the typed form-state fields. The `_original` key itself is omitted
      // from the saved object via the destructure.
      const serializedSteps = steps.map(step => {
        const { _original, ...formFields } = step;
        return { ...(_original || {}), ...formFields };
      });
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        category: category || null,
        status,
        steps: {  // ← Wrap in config object
          // Top-level form-strip fix (Phase 5 2026-05-17): spread the raw JSONB config
          // FIRST so unknown top-level keys (e.g., `requires` from bug #2) survive the
          // edit round-trip. Form-state fields below overlay the preserved values.
          // Without this, GUI saves silently strip top-level fields the form doesn't model.
          // Closes BUG-REPORT-mcp-workflows-toplevel-formstrip-2026-05-17.
          ...(workflow?._rawConfig || {}),
          steps: serializedSteps,
          executionMode,
          failureStrategy,
          timeout: timeout * 1000  // ← Convert seconds to milliseconds
        }
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background border border-border rounded overflow-hidden">
      {/* Header */}
      <div className={BLOOMBERG_HEADER.container}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-amber-400" />
            <span className={BLOOMBERG_HEADER.title}>
              {isNew ? 'CREATE WORKFLOW' : 'EDIT WORKFLOW'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              className="h-7 gap-1"
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="h-7 gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Basic Info */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono text-muted-foreground">WORKFLOW INFO</h3>

            {/* Name — immutable after creation: it's the unique key workflows are run by
                (services({ action: 'workflow.execute', workflowName })). UpdateWorkflowSchema omits it,
                so an edit to it is silently dropped — disable the field to make that explicit. */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Name {isNew ? '*' : <span className="text-muted-foreground/70">(fixed after creation)</span>}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-workflow-name"
                className="font-mono"
                disabled={!isNew}
                title={isNew ? undefined : 'The name is the unique key this workflow is run by and cannot be changed after creation.'}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">
                    <span className="text-emerald-400">● Active</span>
                  </SelectItem>
                  <SelectItem value="PAUSED">
                    <span className="text-gray-400">○ Paused</span>
                  </SelectItem>
                  <SelectItem value="DEPRECATED">
                    <span className="text-red-400">✗ Deprecated</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Execution Mode - Phase 1.1 */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Execution Mode *
              </label>
              <Select value={executionMode} onValueChange={(v) => setExecutionMode(v as typeof executionMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="parallel">Parallel</SelectItem>
                  <SelectItem value="conditional">Conditional</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {executionMode === 'sequential' && '→ Steps execute one after another'}
                {executionMode === 'parallel' && '⚡ Steps execute simultaneously'}
                {executionMode === 'conditional' && '🔀 Steps execute based on dependsOn configuration'}
              </p>
            </div>

            {/* Failure Strategy - Phase 1.2 */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Failure Strategy *
              </label>
              <Select value={failureStrategy} onValueChange={(v) => setFailureStrategy(v as typeof failureStrategy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stop">
                    <span className="text-red-400">Stop</span>
                  </SelectItem>
                  <SelectItem value="continue">
                    <span className="text-yellow-400">Continue</span>
                  </SelectItem>
                  <SelectItem value="rollback">
                    <span className="text-blue-400">Rollback (coming soon)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {failureStrategy === 'stop' && '🛑 Execution stops immediately on error'}
                {failureStrategy === 'continue' && '⚠️ Best-effort execution, collect all results'}
                {failureStrategy === 'rollback' && '↩️ Not yet implemented — currently behaves like Stop; completed steps are not undone'}
              </p>
            </div>

            {/* Workflow Timeout - Phase 1.3 */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Timeout (seconds) *
              </label>
              {/* max mirrors WORKFLOW_TIMEOUT_BOUNDS.max (orchestration-params.ts) = 600000ms = 600s.
                  Keep in sync manually — that module imports the pino logger, so it isn't client-safe to import. */}
              <Input
                type="number"
                min={1}
                max={600}
                value={timeout}
                onChange={(e) => setTimeout(Number(e.target.value))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Range: 1-600 seconds (1s - 10 minutes). Default: 60s
              </p>
            </div>
          </div>

          {/* Right Column - Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono text-muted-foreground">
                WORKFLOW STEPS ({steps.length}/20)
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={addStep}
                disabled={steps.length >= 20}
                className="h-7 gap-1 text-amber-400"
                title={steps.length >= 20 ? "Maximum 20 steps allowed" : "Add a new step"}
              >
                <Plus className="h-3 w-3" />
                Add Step
              </Button>
            </div>

            {/* Steps List */}
            <div className="space-y-3 max-h-[1000px] overflow-auto">
              {steps.length === 0 ? (
                <div className="text-center p-6 border border-dashed border-border rounded">
                  <p className="text-muted-foreground text-sm">No steps defined</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Click &quot;Add Step&quot; to create workflow steps
                  </p>
                </div>
              ) : (
                steps.map((step, index) => (
                  <div
                    key={index}
                    className="bg-muted/30 rounded p-3 border border-border space-y-3"
                  >
                    {/* Step Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                          Step {index + 1}
                        </span>
                        {/* Phase 2.1: Visual indicators */}
                        {executionMode === 'conditional' && step.dependsOn && step.dependsOn.length > 0 && (
                          <span
                            className="text-xs text-blue-400"
                            title={`Depends on steps: ${step.dependsOn.map(d => d + 1).join(', ')}`}
                          >
                            🔗 {step.dependsOn.length}
                          </span>
                        )}
                        {step.timeout && (
                          <span
                            className="text-xs text-muted-foreground"
                            title={`Custom timeout: ${Math.round(step.timeout / 1000)}s`}
                          >
                            ⏱️ {Math.round(step.timeout / 1000)}s
                          </span>
                        )}
                        {(step.retries ?? 0) > 0 && (
                          <span
                            className="text-xs text-muted-foreground"
                            title={`${step.retries} retries, ${(step.retryDelay || 2000) / 1000}s base delay (exponential backoff)`}
                          >
                            🔄 {step.retries}x
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveStepUp(index)}
                          disabled={index === 0}
                          className="h-6 w-6 p-0"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveStepDown(index)}
                          disabled={index === steps.length - 1}
                          className="h-6 w-6 p-0"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeStep(index)}
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Service Selection */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Server className="h-3 w-3" /> Service
                        </label>
                        {isLoadingServices ? (
                          <div className="h-9 bg-muted/50 rounded flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : (
                          <Input
                            value={step.service}
                            onChange={(e) => updateStep(index, { service: e.target.value })}
                            placeholder="paichart-pov-service"
                            className="font-mono text-sm"
                            list={`services-${index}`}
                          />
                        )}
                        <datalist id={`services-${index}`}>
                          {services.map(s => (
                            <option key={s.id} value={s.name} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Wrench className="h-3 w-3" /> Tool
                        </label>
                        <Input
                          value={step.tool}
                          onChange={(e) => updateStep(index, { tool: e.target.value })}
                          placeholder="project"
                          className="font-mono text-sm"
                          list={`tools-${index}`}
                        />
                        <datalist id={`tools-${index}`}>
                          {getToolsForService(step.service).map(tool => (
                            <option key={tool} value={tool} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    {/* Arguments */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Arguments (JSON)
                      </label>
                      <Textarea
                        value={JSON.stringify(step.arguments || {}, null, 2)}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value || '{}');
                            updateStep(index, { arguments: parsed });
                          } catch {
                            // Invalid JSON, don't update
                          }
                        }}
                        placeholder='{"key": "value"}'
                        rows={3}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Use {`{{step.N.output}}`} for variable chaining
                      </p>
                    </div>

                    {/* Per-Step Timeout - Phase 2.2 */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Timeout (seconds, optional)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={step.timeout ? Math.round(step.timeout / 1000) : ''}
                        onChange={(e) => {
                          const seconds = Number(e.target.value);
                          updateStep(index, {
                            timeout: seconds ? seconds * 1000 : undefined
                          });
                        }}
                        placeholder="Inherits from workflow"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Optional. Defaults to workflow timeout ({timeout}s)
                      </p>
                    </div>

                    {/* Per-Step Retries */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Retries (0-5)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={5}
                          value={step.retries ?? ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateStep(index, {
                              retries: isNaN(val) ? undefined : Math.min(5, Math.max(0, val))
                            });
                          }}
                          placeholder="0"
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Retries on timeout/network errors
                        </p>
                      </div>
                      {(step.retries ?? 0) > 0 && (
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            Retry Delay (seconds)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            step={0.5}
                            value={step.retryDelay ? step.retryDelay / 1000 : ''}
                            onChange={(e) => {
                              const seconds = parseFloat(e.target.value);
                              updateStep(index, {
                                retryDelay: seconds ? Math.max(1, seconds) * 1000 : undefined
                              });
                            }}
                            placeholder="2"
                            className="font-mono text-sm"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Exponential backoff base (1-30s)
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Step Dependencies - Phase 2.1 (only for conditional mode) */}
                    {executionMode === 'conditional' && index > 0 && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Depends On (previous steps)
                        </label>
                        <div className="space-y-1 max-h-24 overflow-auto p-2 bg-muted/20 rounded">
                          {steps.slice(0, index).map((prevStep, prevIndex) => (
                            <label
                              key={prevIndex}
                              className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={step.dependsOn?.includes(prevIndex) || false}
                                onChange={(e) => {
                                  const currentDeps = step.dependsOn || [];
                                  const newDeps = e.target.checked
                                    ? [...currentDeps, prevIndex]
                                    : currentDeps.filter(d => d !== prevIndex);
                                  updateStep(index, {
                                    dependsOn: newDeps.length > 0 ? newDeps : undefined
                                  });
                                }}
                                className="rounded border-border"
                              />
                              <span>
                                Step {prevIndex + 1}: {prevStep.service || 'Unnamed'}
                              </span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {step.dependsOn && step.dependsOn.length > 0
                            ? `Waits for ${step.dependsOn.length} step(s) to complete`
                            : 'No dependencies - runs immediately'}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
