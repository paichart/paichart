/**
 * Shared prompt-library types (UI-alignment migration 2026-06-30).
 * Single Prompt shape for the page + table + editor. Unlike workflows there is NO `_rawConfig`/form-strip
 * lane — `variables`/`examples` are edited as raw JSON in the editor and round-trip whole — but the M2/M3
 * runtime discipline still applies: keep full objects, pass the same reference to the editor.
 */
export interface Prompt {
  id: string;
  name: string;
  description: string | null;
  category: string;
  promptText: string;
  variables: Record<string, unknown> | null;
  examples: Record<string, unknown> | null;
  useCase: string;
  complexity: string;
  estimatedTime: number | null;
  rating: number | null;
  usageCount: number;
  successRate: number | null;
  version: string;
  status: string;
  isPublic: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}
