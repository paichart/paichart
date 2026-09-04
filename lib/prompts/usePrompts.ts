"use client";

import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/lib/hooks/useToast';
import { Prompt } from './types';

/**
 * Prompt-library data layer (UI-alignment migration 2026-06-30) — the CRUD handlers lifted out of
 * PromptLibraryTerminal so the new table + the promoted PromptEditor share one source. No Run (prompts
 * aren't executed). No _rawConfig lane (variables/examples round-trip whole). Toasts kept verbatim.
 */
export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agent-templates/prompt-library?includeUsage=true', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch prompts');
      const data = await response.json();
      // API returns { data: [...] } — pass the FULL objects through (M3).
      setPrompts(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const clone = useCallback(async (prompt: Prompt) => {
    try {
      const response = await fetch('/api/agent-templates/prompt-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: `${prompt.name}-copy`,
          description: prompt.description,
          category: prompt.category,
          promptText: prompt.promptText,
          variables: prompt.variables || {},
          examples: prompt.examples || {},
          useCase: prompt.useCase,
          complexity: prompt.complexity,
          estimatedTime: prompt.estimatedTime,
          tags: prompt.tags,
          isPublic: prompt.isPublic,
          status: 'DRAFT',
        }),
      });
      if (!response.ok) throw new Error('Failed to clone prompt');
      toast({ title: 'Prompt cloned', description: `Clone created as "${prompt.name}-copy"`, variant: 'success' });
      await refresh();
    } catch (err) {
      toast({ title: 'Failed to clone prompt', description: err instanceof Error ? err.message : 'Please try again', variant: 'destructive' });
    }
  }, [refresh]);

  const remove = useCallback(async (prompt: Prompt): Promise<boolean> => {
    if (!confirm(`Delete prompt "${prompt.name}"? This cannot be undone.`)) return false;
    try {
      const response = await fetch(`/api/agent-templates/prompt-library/${prompt.id}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to delete prompt');
      toast({ title: 'Prompt deleted', description: 'The prompt has been removed from the library', variant: 'success' });
      await refresh();
      return true;
    } catch (err) {
      toast({ title: 'Failed to delete prompt', description: err instanceof Error ? err.message : 'Please try again', variant: 'destructive' });
      return false;
    }
  }, [refresh]);

  const save = useCallback(async (id: string | undefined, promptData: Record<string, unknown>): Promise<boolean> => {
    try {
      const url = id ? `/api/agent-templates/prompt-library/${id}` : '/api/agent-templates/prompt-library';
      const method = id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(promptData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save prompt');
      }
      toast({ title: id ? 'Prompt updated' : 'Prompt created', description: `"${promptData.name}" has been saved`, variant: 'success' });
      await refresh();
      return true;
    } catch (err) {
      toast({ title: 'Failed to save prompt', description: err instanceof Error ? err.message : 'Please try again', variant: 'destructive' });
      return false;
    }
  }, [refresh]);

  return { prompts, isLoading, error, refresh, clone, remove, save };
}
