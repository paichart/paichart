"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Bot, LayoutTemplate, HelpCircle, Wrench } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { AgentTemplateBloombergView } from '@/components/agents/AgentTemplateBloombergView';
import { AgentBuilder, AGENT_BUILDER_ACTIONS_SLOT_ID } from '@/components/agents/AgentBuilder';
import { AgentsHowItWorks } from '@/components/agents/AgentsHowItWorks';
import { AgentTemplateService, AgentTemplate } from '@/lib/pov/api/agent-templates-adapter';
import { toast } from '@/lib/hooks/useToast';

export default function AgentsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'templates'; // default to the Templates list (an explicit ?tab=builder still opens the Builder)
  const taskId = searchParams.get('taskId') || undefined;
  const templateIdParam = searchParams.get('templateId') || undefined;
  const povId = searchParams.get('povId') || undefined;

  const [activeTab, setActiveTab] = useState(initialTab);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>(templateIdParam);

  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  // Fetch user role
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (json) {
          setUserRole(json.data?.user?.role || json.role || null);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch templates
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AgentTemplateService.getTemplates();
      if (res.success && res.data) {
        setTemplates(res.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Edit template — switch to Builder tab in Template Mode
  const handleEdit = useCallback((template: AgentTemplate) => {
    setEditingTemplateId(template.id);
    setActiveTab('builder');
  }, []);

  const handleDuplicate = useCallback(async (template: AgentTemplate) => {
    const copyName = `${template.name} (Copy)`;
    const res = await AgentTemplateService.createTemplate({
      name: copyName,
      description: template.description,
      role: template.role,
      prompt: template.prompt,
      modelParameters: template.modelParameters,
      tags: template.tags,
      // 2026-04-18: preserve classification fields on duplicate.
      // Previously these dropped silently and every duplicate became
      // GENERALIST + GENERAL + no protocol regardless of source.
      category: template.category,
      templateType: template.templateType,
      protocol: template.protocol,
    });
    if (res.success) {
      toast({ title: 'Template duplicated', description: `Created "${copyName}" — edit it from the list.` });
      loadTemplates();
    } else {
      toast({ title: 'Duplicate failed', description: (res as { error?: string }).error || 'Unknown error.', variant: 'destructive' });
    }
  }, [loadTemplates]);

  const handleDelete = useCallback(async (template: AgentTemplate) => {
    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) return;
    const res = await AgentTemplateService.deleteTemplate(template.id);
    if (res.success) {
      loadTemplates();
    }
  }, [loadTemplates]);

  // Create new template — switch to Builder in Template Mode (no templateId)
  const handleCreate = useCallback(() => {
    setEditingTemplateId(undefined);
    setActiveTab('builder');
  }, []);

  // Close builder — go back to templates tab
  const handleBuilderClose = useCallback(() => {
    setEditingTemplateId(undefined);
    setActiveTab('templates');
    loadTemplates(); // Refresh in case something was saved
  }, [loadTemplates]);

  // Determine Builder mode from URL params or edit state
  const builderTaskId = taskId;
  const builderTemplateId = editingTemplateId;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <PageHeader icon={Bot} title="Agents" subtitle="Configure, manage, and execute AI agents" />

      {/* Tab Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Tab row: triggers left, primary actions right (2026-08-06).
            AgentBuilder's action buttons used to sit at the BOTTOM of a tall form, below the
            fold even on a full screen. They now portal into the slot below so they are always
            visible without scrolling. The slot is rendered unconditionally and stays empty
            unless the Builder tab is mounted — Radix unmounts inactive TabsContent, so the
            portal target simply has no children on the other tabs. */}
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="templates" className="gap-1.5">
              <LayoutTemplate className="h-4 w-4" />
              Templates
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
          {/* Portal target — filled by AgentBuilder. The id comes from the shared constant so a
              typo cannot silently drop the buttons back to the bottom of the form with no error. */}
          <div id={AGENT_BUILDER_ACTIONS_SLOT_ID} className="flex items-center gap-2" />
        </div>

        {/* Builder Tab */}
        <TabsContent value="builder">
          <AgentBuilder
            taskId={builderTaskId}
            templateId={builderTemplateId}
            povId={povId}
            onClose={handleBuilderClose}
          />
        </TabsContent>

        {/* Templates Tab - Bloomberg View */}
        <TabsContent value="templates">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Loading templates...
              </CardContent>
            </Card>
          ) : (
            <AgentTemplateBloombergView
              templates={templates}
              isAdmin={isAdmin}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onCreate={handleCreate}
              onRefresh={loadTemplates}
            />
          )}
        </TabsContent>

        {/* How it works — conceptual explainer (role / agent / protocol model) */}
        <TabsContent value="howitworks">
          <AgentsHowItWorks />
        </TabsContent>
      </Tabs>
    </div>
  );
}
