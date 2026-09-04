"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TemplateEditorProvider } from './context/TemplateEditorProvider';
import { useTemplateData, useTemplateTypeOperations } from './context/TemplateEditorContext';
import { templateTabRegistry } from './tabs';
import { TemplateTab } from './tabs/types';
import { TemplateType } from './context/types/TemplateEditorState';

/**
 * Template Editor Props
 */
interface TemplateEditorProps {
  templateId?: string;
  initialTemplateType?: TemplateType;
  onSave?: (templateData: any) => Promise<boolean>;
  onValidate?: (templateData: any) => Promise<{ isValid: boolean; errors: Record<string, string[]> }>;
}

/**
 * Tab Navigation Component
 */
function TabNavigation({ 
  tabs, 
  selectedIndex, 
  onChange 
}: { 
  tabs: TemplateTab[]; 
  selectedIndex: number; 
  onChange: (index: number) => void;
}) {
  const templateData = useTemplateData();

  return (
    <div className="flex space-x-1 rounded-xl bg-muted p-1">
      {tabs.map((tab, index) => {
        // Get the icon component - use FileText as default
        const IconComponent = FileText; // TODO: Map tab.icon to proper Lucide icon
        
        // Validate tab
        const validation = templateTabRegistry.validateTab(tab.id, templateData);
        const hasErrors = !validation.isValid;
        const isSelected = index === selectedIndex;
        
        return (
          <button
            key={tab.id}
            onClick={() => onChange(index)}
            className={`w-full rounded-lg py-2.5 px-3 text-sm font-medium leading-5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-75 ${
              isSelected
                ? 'bg-background text-foreground shadow border border-border'
                : hasErrors
                ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <div className="flex items-center space-x-2">
              <IconComponent className="h-4 w-4" />
              <span>{tab.label}</span>
              {hasErrors && (
                <div className="h-2 w-2 rounded-full bg-destructive" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tab Content Component
 */
function TabContent({ 
  tabs, 
  selectedIndex 
}: { 
  tabs: TemplateTab[]; 
  selectedIndex: number;
}) {
  const selectedTab = tabs[selectedIndex];
  
  if (!selectedTab) {
    return (
      <div className="mt-6 rounded-xl bg-card p-6 shadow-sm border border-border">
        <div className="text-center text-muted-foreground">
          No tab selected
        </div>
      </div>
    );
  }

  const Component = selectedTab.component;
  
  return (
    <div className="mt-6">
      <div className="rounded-xl bg-card p-6 shadow-sm border border-border">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-card-foreground">{selectedTab.label}</h2>
          <p className="text-sm text-muted-foreground">{selectedTab.description}</p>
        </div>
        
        <Component />
      </div>
    </div>
  );
}

/**
 * Template Editor Content Component
 */
function TemplateEditorContent() {
  const { templateType } = useTemplateTypeOperations();
  const templateData = useTemplateData();
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  // Get available tabs for current template type
  const availableTabs = useMemo(() => {
    return templateTabRegistry.getTabs(templateType);
  }, [templateType]);

  // Get enabled tabs based on current data
  const enabledTabs = useMemo(() => {
    return templateTabRegistry.getEnabledTabs(templateType, templateData);
  }, [templateType, templateData]);

  // Reset selected tab when template type changes
  useEffect(() => {
    setSelectedTabIndex(0);
  }, [templateType]);

  // Ensure selected tab index is valid
  useEffect(() => {
    if (selectedTabIndex >= enabledTabs.length) {
      setSelectedTabIndex(Math.max(0, enabledTabs.length - 1));
    }
  }, [enabledTabs.length, selectedTabIndex]);

  if (enabledTabs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h3 className="text-lg font-medium text-foreground">No tabs available</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Please select a template type to begin editing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex mb-6" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-1 md:space-x-3">
          <li className="inline-flex items-center">
            <span className="text-sm font-medium text-muted-foreground">Template Editor</span>
          </li>
          <li>
            <div className="flex items-center">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="ml-1 text-sm font-medium text-foreground capitalize">
                {templateType} Template
              </span>
            </div>
          </li>
          {enabledTabs[selectedTabIndex] && (
            <li>
              <div className="flex items-center">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="ml-1 text-sm font-medium text-primary">
                  {enabledTabs[selectedTabIndex].label}
                </span>
              </div>
            </li>
          )}
        </ol>
      </nav>

      {/* Tab Interface */}
      <div>
        <TabNavigation 
          tabs={enabledTabs} 
          selectedIndex={selectedTabIndex}
          onChange={setSelectedTabIndex}
        />
        <TabContent 
          tabs={enabledTabs} 
          selectedIndex={selectedTabIndex}
        />
      </div>
    </div>
  );
}

/**
 * Main Template Editor Component
 */
export default function TemplateEditor({
  templateId,
  initialTemplateType = 'pov',
  onSave,
  onValidate
}: TemplateEditorProps) {
  return (
    <TemplateEditorProvider
      templateId={templateId}
      initialTemplateType={initialTemplateType}
      onSave={onSave}
      onValidate={onValidate}
    >
      <div className="min-h-screen bg-background py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <TemplateEditorContent />
        </div>
      </div>
    </TemplateEditorProvider>
  );
}
