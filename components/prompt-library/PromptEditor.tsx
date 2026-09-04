'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Save,
  X,
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
} from '@/lib/constants/bloomberg-styles';

interface Prompt {
  id?: string;
  name: string;
  description: string | null;
  category: string;
  promptText: string;
  variables: Record<string, any> | null;
  examples: Record<string, any> | null;
  useCase: string;
  complexity: string;
  estimatedTime: number | null;
  status: string;
  isPublic: boolean;
  tags: string[];
}

interface PromptEditorProps {
  prompt?: Prompt;
  onSave: (data: Record<string, any>) => void;
  onCancel: () => void;
}

const CATEGORIES = [
  'GENERAL', 'DEVELOPMENT', 'TESTING', 'DOCUMENTATION', 'ANALYSIS',
  'AUTOMATION', 'REVIEW', 'DEPLOYMENT', 'MONITORING', 'SECURITY'
];

const COMPLEXITIES = ['LOW', 'MEDIUM', 'HIGH', 'EXPERT'];

const STATUSES = [
  { value: 'ACTIVE', label: 'Active', color: 'text-emerald-400' },
  { value: 'DRAFT', label: 'Draft', color: 'text-gray-400' },
  { value: 'DEPRECATED', label: 'Deprecated', color: 'text-red-400' },
  { value: 'INACTIVE', label: 'Inactive', color: 'text-gray-500' },
];

/**
 * PromptEditor - Two-column edit/create form
 *
 * Mirrors WorkflowEditor pattern: replaces the terminal view entirely.
 * Left column: metadata fields. Right column: content fields.
 */
export function PromptEditor({ prompt, onSave, onCancel }: PromptEditorProps) {
  const isNew = !prompt?.id;

  // Form state
  const [name, setName] = useState(prompt?.name || '');
  const [description, setDescription] = useState(prompt?.description || '');
  const [category, setCategory] = useState(prompt?.category || 'GENERAL');
  const [status, setStatus] = useState(prompt?.status || 'ACTIVE');
  const [complexity, setComplexity] = useState(prompt?.complexity || 'MEDIUM');
  const [useCase, setUseCase] = useState(prompt?.useCase || '');
  const [promptText, setPromptText] = useState(prompt?.promptText || '');

  // AUTO-GROW the prompt textarea (2026-08-06). A <textarea> has no intrinsic content sizing,
  // so any fixed height leaves an inner scrollbar on a prompt longer than that height — and
  // these run to several pages. Nesting a textarea scrollbar inside the page scrollbar is the
  // thing that made the editor feel cramped; a bigger fixed number only moves it. Measuring
  // scrollHeight lets the box fit the whole prompt and the PAGE do the scrolling.
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const autoGrowPrompt = useCallback(() => {
    const el = promptRef.current;
    if (!el) return;
    // Reset first: scrollHeight never reports LESS than the current height, so without this
    // the box can only ever grow — deleting half a prompt would leave the empty space behind.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  // Depends on promptText so it fires on edit AND on the async load of an existing prompt
  // (the initial value arrives after first paint when editing, not at mount).
  useEffect(() => { autoGrowPrompt(); }, [promptText, autoGrowPrompt]);
  const [tagsInput, setTagsInput] = useState((prompt?.tags || (isNew ? ['mcp'] : [])).join(', '));
  const [isPublic, setIsPublic] = useState(prompt?.isPublic ?? true);
  const [estimatedTime, setEstimatedTime] = useState<string>(
    prompt?.estimatedTime ? String(prompt.estimatedTime) : isNew ? '180' : ''
  );
  const [variablesJson, setVariablesJson] = useState(
    JSON.stringify(prompt?.variables || {}, null, 2)
  );
  const [examplesJson, setExamplesJson] = useState(
    JSON.stringify(prompt?.examples || {}, null, 2)
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Prompt name is required');
      return;
    }
    if (!promptText.trim()) {
      alert('Prompt text is required');
      return;
    }
    if (!useCase.trim()) {
      alert('Use case is required');
      return;
    }

    // Parse JSON fields
    let variables = {};
    let examples = {};
    try {
      variables = JSON.parse(variablesJson || '{}');
    } catch {
      alert('Invalid JSON in Variables field');
      return;
    }
    try {
      examples = JSON.parse(examplesJson || '{}');
    } catch {
      alert('Invalid JSON in Examples field');
      return;
    }

    // Parse tags
    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        category,
        status,
        complexity,
        useCase: useCase.trim(),
        promptText: promptText.trim(),
        variables,
        examples,
        tags,
        isPublic,
        estimatedTime: estimatedTime ? parseInt(estimatedTime, 10) : null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    // Height is CONTENT-DRIVEN, mirroring AgentBuilder (a plain <Card>): the page scrolls,
    // not a box inside it. Previously `h-full ... overflow-hidden` + an inner
    // `flex-1 overflow-auto` made this a viewport-height pane with its own scrollbar, so a
    // long prompt was cramped into a fraction of the screen while the rest sat empty.
    <div className="flex flex-col bg-background border border-border rounded">
      {/* Header */}
      <div className={BLOOMBERG_HEADER.container}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-amber-400" />
            <span className={BLOOMBERG_HEADER.title}>
              {isNew ? 'CREATE PROMPT' : 'EDIT PROMPT'}
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
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Metadata + Use Case + Variables + Examples */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-mono text-muted-foreground">PROMPT INFO</h3>

            {/* Row 1: Name (50%), Category (25%), Status (25%) */}
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sales Engineering Support"
                  className="font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category *</label>
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
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className={s.color}>{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this prompt do?"
                rows={3}
              />
            </div>

            {/* Row 2: Tags (50%), Complexity (25%), Est Time (25%) */}
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Tags (comma-separated)
                </label>
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="mcp, domain:devops, automation"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Complexity</label>
                <Select value={complexity} onValueChange={setComplexity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLEXITIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Est Time (sec)</label>
                <Input
                  type="number"
                  min={0}
                  value={estimatedTime}
                  onChange={(e) => setEstimatedTime(e.target.value)}
                  placeholder="300"
                  className="font-mono"
                />
              </div>
            </div>

            {/* Public */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded border-border"
                id="isPublic"
              />
              <label htmlFor="isPublic" className="text-xs text-muted-foreground cursor-pointer">
                Public prompt (visible to non-admins)
              </label>
            </div>

            {/* Use Case */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Use Case *</label>
              <Textarea
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                placeholder="When and how should this prompt be used?"
                rows={6}
              />
            </div>

            {/* Examples JSON */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Examples (JSON)</label>
              <Textarea
                value={examplesJson}
                onChange={(e) => setExamplesJson(e.target.value)}
                placeholder='{"example_1": {"input": "...", "output": "..."}}'
                rows={8}
                className="font-mono text-xs"
              />
            </div>

            {/* Variables JSON. `flex-1` used to make this fill the remaining space of a
                fixed-height column; with content-driven height (2026-08-06) it would fall back
                to the Textarea default of 80px, which is cramped for JSON. Explicit floor
                instead — flex-1 is kept so it still grows if the column ever gets taller. */}
            <div className="flex-1 flex flex-col">
              <label className="text-xs text-muted-foreground mb-1 block">Variables (JSON)</label>
              <Textarea
                value={variablesJson}
                onChange={(e) => setVariablesJson(e.target.value)}
                placeholder='{"variable_name": {"type": "string", "required": true, "description": "..."}}'
                className="font-mono text-xs flex-1 min-h-[12rem]"
              />
            </div>
          </div>

          {/* Right Column - Prompt Text */}
          <div className="flex flex-col">
            <h3 className="text-xs font-mono text-muted-foreground mb-2">PROMPT TEXT *</h3>
            {/* overflow-hidden: the element is always exactly as tall as its content, so its own
                scrollbar would never be usable — suppressing it is what removes the
                nested-scrollbar feel. resize-none for the same reason: a manual drag would be
                overwritten by the next keystroke. min-h is a floor for a short/empty prompt; it
                is no longer the ceiling it used to be (was 50rem). */}
            <Textarea
              ref={promptRef}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Enter the full prompt text. {{variable_name}} placeholders resolve on the /prompt menu — protocol skills inject raw."
              className="font-mono text-xs min-h-[24rem] overflow-hidden resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {'{{variable}}'} resolves on the /prompt menu; protocol skills inject raw (see How it works)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
