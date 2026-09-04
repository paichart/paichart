"use client";

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Save, FileCheck } from 'lucide-react';
import { BasicInfoStep } from './steps/BasicInfoStep';
import { FieldsStep } from './steps/FieldsStep';
import { SectionsStep } from './steps/SectionsStep';
import { ReviewStep } from './steps/ReviewStep';
import { Template } from '../views/types';
import { POVTemplate, FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';
import { cn } from '@/lib/utils';
import { POVTemplateProvider, usePOVTemplateContext } from './context/POVTemplateContext';
import { adaptPOVTemplateToTemplate } from '../adapters/TemplateEditorAdapter';
import { POVTemplateContextSync } from './POVTemplateContextSync';
import { useTemplateView } from '../views/context/TemplateViewContext';

interface POVTemplateBuilderProps {
  initialData?: Template;
  onSave?: (template: Template) => void;
  isReadOnly?: boolean;
  showSaveButton?: boolean;
  hideTabsAndHeader?: boolean; // Add this prop to hide tabs and header
}

/**
 * POVTemplateBuilder component
 * This is a wrapper that provides the POVTemplateContext to the builder UI
 */
export function POVTemplateBuilder({
  initialData,
  onSave,
  isReadOnly = false,
  showSaveButton = true,
  activeTab: externalActiveTab,
  hideTabsAndHeader = false
}: POVTemplateBuilderProps & { activeTab?: string }) {
  // Get the template from the TemplateViewProvider context
  const { template: viewTemplate } = useTemplateView();
  
  // Use the template from the context if available, otherwise use the initialData prop
  const effectiveTemplate = viewTemplate || initialData;
  
  // Debug the template being used
  
  // Extract the POV template from the Template object
  const initialPOVTemplate = effectiveTemplate?.metadata?.originalPOVTemplate as POVTemplate | undefined;
  
  // Handle save from context to Template
  const handleSaveFromContext = (povTemplate: POVTemplate) => {
    if (!onSave) return;
    
    // Convert POVTemplate to Template
    const template = adaptPOVTemplateToTemplate(povTemplate);
    
    // Call the onSave callback with the Template
    onSave(template);
  };
  
  return (
    <POVTemplateProvider
      initialTemplate={initialPOVTemplate}
      onSave={handleSaveFromContext}
      readOnly={isReadOnly}
    >
      <>
        <POVTemplateContextSync />
        <POVTemplateBuilderUI
          showSaveButton={showSaveButton}
          activeTab={externalActiveTab}
          hideTabsAndHeader={hideTabsAndHeader}
        />
      </>
    </POVTemplateProvider>
  );
}

/**
 * POVTemplateBuilderUI component
 * This is the actual UI for the builder, which uses the POVTemplateContext
 */
function POVTemplateBuilderUI({
  showSaveButton = true,
  activeTab: externalActiveTab,
  hideTabsAndHeader = false
}: {
  showSaveButton?: boolean;
  activeTab?: string;
  hideTabsAndHeader?: boolean;
}) {
  // Get template data and methods from context
  const {
    template,
    updateTemplate,
    saveTemplate,
    isReadOnly
  } = usePOVTemplateContext();
  
  // Active tab state - use external tab if provided, otherwise use internal state
  const [internalActiveTab, setInternalActiveTab] = useState('basic-info');
  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = externalActiveTab ? () => {} : setInternalActiveTab;
  
  // Handle save button click
  const handleSave = async () => {
    await saveTemplate();
  };
  
  // Update handlers for each step
  const handleBasicInfoUpdate = (name: string, description: string, tags: string[]) => {
    // Update template with new basic info
    updateTemplate({
      name,
      description,
      metadata: {
        ...template.metadata,
        tags
      }
    });
  };
  
  // No need for separate handler functions since we're using inline functions
  
  // Render the appropriate content based on the active tab
  const renderTabContent = () => {
    // Extract data from the template
    const { name, description, fields, sections } = template;
    const tags = template.metadata?.tags || [];
    
    switch (activeTab) {
      case 'basic-info':
        return (
          <>
            {!hideTabsAndHeader && (
              <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 rounded-md p-3 mb-4 text-sm text-primary-foreground">
                <p className="font-medium mb-1">Basic Information</p>
                <p>Enter basic information about the template, including:</p>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>Template name - A descriptive name for this POV template</li>
                  <li>Description - Explain what this template is used for</li>
                  <li>Tags - Add relevant tags to help categorize this template</li>
                </ul>
              </div>
            )}
            <BasicInfoStep
              name={name}
              description={description}
              tags={tags}
              onUpdate={handleBasicInfoUpdate}
            />
          </>
        );
      
      case 'fields':
        return (
          <>
            {!hideTabsAndHeader && (
              <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 rounded-md p-3 mb-4 text-sm text-primary-foreground">
                <p className="font-medium mb-1">Form Fields</p>
                <p>Define custom fields like &quot;Environment Size&quot; or &quot;Security Stack&quot;. These fields become part of your template schema and will be filled out by users when creating POVs.</p>
                <p className="mt-1">Responses are stored in the database as structured data.</p>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>Text fields - For short text responses</li>
                  <li>Text areas - For longer text responses</li>
                  <li>Select fields - For choosing from predefined options</li>
                  <li>Date fields - For date selection</li>
                  <li>File fields - For file uploads</li>
                </ul>
              </div>
            )}
            <FieldsStep
              fields={fields}
              onUpdate={(updatedFields) => updateTemplate({ fields: updatedFields })}
            />
          </>
        );
      
      case 'sections':
        return (
          <>
            {!hideTabsAndHeader && (
              <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 rounded-md p-3 mb-4 text-sm text-primary-foreground">
                <p className="font-medium mb-1">Sections</p>
                <p>Organize fields into logical sections to structure your POV template.</p>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>Create sections like &quot;General Information&quot;, &quot;Technical Details&quot;, etc.</li>
                  <li>Assign fields to sections to organize the POV creation form</li>
                  <li>Arrange sections in a logical order</li>
                  <li>All fields must be assigned to at least one section</li>
                </ul>
              </div>
            )}
            <SectionsStep
              sections={sections}
              fields={fields}
              onUpdate={(updatedSections) => updateTemplate({ sections: updatedSections })}
            />
            {/* Debug fields being passed to SectionsStep */}
          </>
        );
      
      case 'review':
        return (
          <>
            {!hideTabsAndHeader && (
              <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30 rounded-md p-3 mb-4 text-sm text-primary-foreground">
                <p className="font-medium mb-1">Review Template</p>
                <p>Review your template configuration before saving.</p>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>Check that all required information is complete</li>
                  <li>Verify that fields are organized into appropriate sections</li>
                  <li>Ensure all fields have clear labels and descriptions</li>
                </ul>
              </div>
            )}
            <ReviewStep
              name={name}
              description={description}
              tags={tags}
              fields={fields}
              sections={sections}
            />
          </>
        );
      
      default:
        return null;
    }
  };
  
  return (
    <div className="space-y-6">
      {!hideTabsAndHeader && (
        <div className={cn("flex", showSaveButton ? "justify-between w-full" : "")}>
          <div>
            <h2 className="text-2xl font-bold">POV Template Builder</h2>
            <p className="text-muted-foreground">Create and manage POV templates with fields and sections</p>
          </div>
          
          {showSaveButton && (
            <Button onClick={handleSave} disabled={isReadOnly}>
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          )}
        </div>
      )}
      
      {!hideTabsAndHeader ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="basic-info">Basic Info</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="sections">Sections</TabsTrigger>
            <TabsTrigger value="review" className="flex items-center">
              <FileCheck className="h-4 w-4 mr-2" />
              Review
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic-info" className="pt-4">
            {renderTabContent()}
          </TabsContent>
          
          <TabsContent value="fields" className="pt-4">
            {renderTabContent()}
          </TabsContent>
          
          <TabsContent value="sections" className="pt-4">
            {renderTabContent()}
          </TabsContent>
          
          <TabsContent value="review" className="pt-4">
            {renderTabContent()}
          </TabsContent>
        </Tabs>
      ) : (
        // When tabs are hidden, just render the content directly
        renderTabContent()
      )}
    </div>
  );
}

export default POVTemplateBuilder;