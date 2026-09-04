'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { MessageSquare, LayoutList, Wrench, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Prompt } from '@/lib/prompts/types';
import { usePrompts } from '@/lib/prompts/usePrompts';
import { PromptBloombergView } from '@/components/prompt-library/PromptBloombergView';
import { PromptEditor } from '@/components/prompt-library/PromptEditor';
import { PromptsHowItWorks } from '@/components/prompt-library/PromptsHowItWorks';

interface PromptLibraryPageProps {
  userRole: string;
}

export function PromptLibraryPage({ userRole }: PromptLibraryPageProps) {
  const [activeTab, setActiveTab] = useState('prompts');
  const { prompts, isLoading, error, refresh, clone, remove, save } = usePrompts();
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null); // M2: store the full OBJECT, not an id
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  const handleEdit = (p: Prompt) => { setEditingPrompt(p); setActiveTab('builder'); };
  const handleCreate = () => { setEditingPrompt(null); setActiveTab('builder'); };
  const handleClose = () => { setEditingPrompt(null); setActiveTab('prompts'); refresh(); };

  return (
    // `p-6 space-y-6`, matching app/(authenticated)/agents/page.tsx. Was `p-6 h-full`
    // (2026-08-06): that started a fixed-height chain which forced PromptEditor into a
    // viewport-height box scrolling internally, leaving most of the screen unused.
    <div className="p-6 space-y-6">
      <PageHeader
        icon={MessageSquare}
        title="Skills"
        subtitle="Reusable, versioned prompt templates for agents and workflows"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 mt-4 h-[calc(100%-4rem)]">
        <TabsList>
          <TabsTrigger value="prompts" className="gap-1.5">
            <LayoutList className="h-4 w-4" />
            Skills
          </TabsTrigger>
          <TabsTrigger value="builder" className="gap-1.5">
            <Wrench className="h-4 w-4" />
            Builder
          </TabsTrigger>
          <TabsTrigger value="howitworks" className="gap-1.5">
            <HelpCircle className="h-4 w-4" />
            How it works
          </TabsTrigger>
        </TabsList>

        {/* Prompts — sortable table overview */}
        <TabsContent value="prompts">
          {isLoading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Loading prompts…</CardContent></Card>
          ) : error ? (
            <Card><CardContent className="py-12 text-center text-red-400">{error}</CardContent></Card>
          ) : (
            <PromptBloombergView
              prompts={prompts}
              isAdmin={isAdmin}
              onEdit={handleEdit}
              onClone={clone}
              onDelete={remove}
              onCreate={handleCreate}
            />
          )}
        </TabsContent>

        {/* Builder — promoted PromptEditor (M1 remount key, M2 full-object state) */}
        <TabsContent value="builder">
          <PromptEditor
            key={editingPrompt?.id ?? 'new'}
            prompt={editingPrompt ?? undefined}
            onSave={async (data) => { const ok = await save(editingPrompt?.id, data); if (ok) handleClose(); }}
            onCancel={handleClose}
          />
        </TabsContent>

        {/* How it works — conceptual explainer */}
        <TabsContent value="howitworks">
          <PromptsHowItWorks />
        </TabsContent>
      </Tabs>
    </div>
  );
}
