"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { PovEditorProvider, useEditorContext, TaskSelectionProvider } from '@/components/poveditor/pov/context';
import { SelectedTaskProvider } from '@/components/poveditor/pov/context/SelectedTaskContext';
import { useStatePersistence } from '@/components/poveditor/pov/hooks';
import { tabsRegistry } from './registry/TabsRegistry';
import TemplateWizard from './TemplateWizard';

// Save button component
const EditorSaveButton = () => {
  const { saveData, isSaving, hasErrors, state } = useEditorContext();
  const router = useRouter();
  
  // Determine if save should be disabled
  const isDisabled = isSaving || hasErrors || !state.meta.isDirty;
  
  // Handle save with redirection for new POVs
  const handleSave = async () => {
    try {
      const result = await saveData();
      
      // If this is a new POV (no povId in state) and we got a result with an ID, redirect to edit page
      if (!state.data.id && result && result.id) {
        router.push(`/pov/edit/${result.id}`);
      }
    } catch {
      // Error saving POV - handled by mutation
    }
  };
  
  return (
    <Button
      onClick={handleSave}
      disabled={isDisabled}
      className="ml-auto"
    >
      {isSaving ? 'Saving...' : 'Save'}
    </Button>
  );
};

// Editor header with title and save button
const EditorHeader = ({ title }: { title: string }) => {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <EditorSaveButton />
    </div>
  );
};

// Main editor tabs component
const EditorTabs = ({ mode }: { mode: string }) => {
  const { state, setActiveTab } = useEditorContext();
  const [tabs, setTabs] = useState(() => tabsRegistry.getAll());
  
  // Subscribe to tabs registry changes
  useEffect(() => {
    const unsubscribe = tabsRegistry.subscribe((newTabs) => {
      setTabs(newTabs);
    });

    return unsubscribe;
  }, []);
  
  // Update tabs registry with current mode and state
  useEffect(() => {
    tabsRegistry.setMode(mode);
    tabsRegistry.setEditorState(state);
    
    // In project mode, automatically set the first phase tab as active when it becomes available
    // BUT only on initial load, not when user has intentionally selected a different tab
    if (mode === 'project' && state.entities?.phases) {
      const phases = state.entities.phases;
      const phaseIds = Object.keys(phases);
      const hasPhases = phaseIds.length > 0;
      const currentActiveTab = state.ui?.activeTab;

      // If we have phases, check if we need to set the first phase tab as active
      if (hasPhases) {
        // Sort phases by their order field to get the correct first phase
        const sortedPhases = phaseIds
          .map(phaseId => ({ phaseId, phase: phases[phaseId] }))
          .sort((a, b) => {
            const orderA = a.phase?.order ?? 999;
            const orderB = b.phase?.order ?? 999;
            return orderA - orderB;
          });
        
        const firstPhaseId = sortedPhases[0].phaseId;
        const firstPhaseTabId = `phase-${firstPhaseId}`;

        // Only auto-select if there's no active tab at all, or if it's a tab that's not available in project mode
        // Do NOT override intentional user selections like 'tasks' or 'agents'
        const shouldSetFirstPhase = !currentActiveTab ||
                                   currentActiveTab === 'phase-templates' ||
                                   currentActiveTab === 'basic-info'; // basic-info not available in project mode

        if (shouldSetFirstPhase) {
          setActiveTab(firstPhaseTabId);
        }
      }
    }
  }, [mode, state, setActiveTab, tabs.length]);
  
  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  // Determine the default tab based on mode and available tabs
  const getDefaultTab = () => {
    if (mode === 'project') {
      // In project mode, prefer the first phase tab if available
      const phaseTab = tabs.find(tab => tab.id.startsWith('phase-'));
      if (phaseTab) {
        return phaseTab.id;
      }
      // Fallback to tasks tab if no phase tabs yet
      return 'tasks';
    }
    return tabs[0]?.id || 'basic-info';
  };
  
  return (
    <Tabs 
      defaultValue={getDefaultTab()} 
      value={state.ui.activeTab}
      onValueChange={handleTabChange}
      className="w-full"
    >
      <TabsList className={`mb-8 flex flex-wrap gap-1 md:gap-2 ${tabs.length > 6 ? 'text-sm' : ''}`}>
        {tabs.map(tab => (
          <TabsTrigger key={tab.id} value={tab.id} className={tabs.length <= 4 ? 'px-6' : ''}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      
      {tabs.map(tab => (
        <TabsContent key={tab.id} value={tab.id}>
          <tab.component {...(tab.componentProps || {})} />
        </TabsContent>
      ))}
    </Tabs>
  );
};

// Loading state component
const EditorLoading = () => {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-[250px]" />
      <Skeleton className="h-12 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
};

// Error state component
const EditorError = ({ message }: { message: string }) => {
  return (
    <Alert variant="destructive">
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        {message}
      </AlertDescription>
    </Alert>
  );
};

// Main editor content component
const EditorContent = ({ mode }: { mode: string }) => {
  const { isLoading, state, hasErrors } = useEditorContext();
  const [error, setError] = useState<string | null>(null);
  
  // Use state persistence hook to persist state across tab navigation
  const povId = state.data.id || 'new';
  useStatePersistence(povId);
  
  // Note: error state handling would be expanded for specific error cases
  
  if (isLoading) {
    return <EditorLoading />;
  }
  
  if (error) {
    return <EditorError message={error} />;
  }
  
  // Get all validation errors
  const validationErrors = state.ui.validationErrors;
  const hasValidationErrors = Object.keys(validationErrors).length > 0;
  
  return (
    <SelectedTaskProvider>
      <div className="space-y-8">
        <EditorHeader title={state.data.title || 'Create New POV'} />
        
        {/* Display validation errors at the top level */}
        {hasValidationErrors && (
          <Alert variant="destructive">
            <AlertTitle>Validation Errors</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {Object.entries(validationErrors).map(([key, errors]) => (
                  <li key={key}>
                    {key.replace('data.', '')}: {errors[0]}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        
        <EditorTabs mode={mode} />
      </div>
    </SelectedTaskProvider>
  );
};

// Main POV editor component
export default function PovEditor({ 
  povId, 
  templateId,
  mode = 'create' 
}: { 
  povId?: string, 
  templateId?: string,
  mode?: 'create' | 'edit' | 'view' | 'template-based' | 'staging' | 'project'
}) {
  const router = useRouter();
  
  return (
    <PovEditorProvider povId={povId} mode={mode} templateId={templateId}>
      <TaskSelectionProvider>
        <div className="container mx-auto py-8">
          <EditorContent mode={mode} />
        </div>
      </TaskSelectionProvider>
    </PovEditorProvider>
  );
}
