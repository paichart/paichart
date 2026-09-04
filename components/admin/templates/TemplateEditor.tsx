import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  TemplateViewProvider,
  ViewModeController,
  ViewModeRenderer,
  Template,
  ViewMode,
  ViewModeDefinition,
  DefaultView,
  TreeView,
  GraphView,
  SplitView,
  CarouselView,
  SmartFoldingView
} from './views';
import { useTemplateView } from './views/context/TemplateViewContext';
import {
  LayoutGrid,
  GitFork,
  Columns,
  SlidersHorizontal,
  FolderTree,
  Layers,
  Network
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Save } from 'lucide-react';
import { POVTemplate } from '@/lib/pov/templates/types';
import {
  adaptPOVTemplateToTemplate,
  adaptTemplateToPOVTemplate,
  determineTemplateType
} from './adapters/TemplateEditorAdapter';
import { ImportExport } from './ImportExport';
import { TemplateRelationshipManagerWrapper } from './relationships/TemplateRelationshipManagerWrapper';
import { POVTemplateBuilder } from './pov-builder/POVTemplateBuilder';

// Define view modes
const viewModes: ViewModeDefinition[] = [
  {
    id: ViewMode.DEFAULT,
    name: 'Default',
    description: 'Standard editor view with stages and tasks',
    icon: <LayoutGrid className="h-4 w-4" />,
    component: DefaultView,
    bestFor: ['General editing', 'Simple templates']
  },
  {
    id: ViewMode.TREE,
    name: 'Tree View',
    description: 'Hierarchical tree view with collapsible sections',
    icon: <FolderTree className="h-4 w-4" />,
    component: TreeView,
    bestFor: ['Complex templates', 'Navigation', 'Structure overview']
  },
  {
    id: ViewMode.GRAPH,
    name: 'Graph View',
    description: 'Visual graph-based editor with zoom levels',
    icon: <GitFork className="h-4 w-4" />,
    component: GraphView,
    bestFor: ['Dependency visualization', 'Spatial organization']
  },
  {
    id: ViewMode.SPLIT,
    name: 'Split View',
    description: 'Multi-panel view with synchronized navigation',
    icon: <Columns className="h-4 w-4" />,
    component: SplitView,
    bestFor: ['Detailed editing', 'Working on multiple tasks']
  },
  {
    id: ViewMode.CAROUSEL,
    name: 'Carousel',
    description: 'Carousel-style stage navigator',
    icon: <SlidersHorizontal className="h-4 w-4" />,
    component: CarouselView,
    bestFor: ['Sequential editing', 'Presentation', 'Focus on one stage']
  },
  {
    id: ViewMode.SMART_FOLDING,
    name: 'Smart Folding',
    description: 'AI-assisted smart folding with contextual suggestions',
    icon: <Layers className="h-4 w-4" />,
    component: SmartFoldingView,
    bestFor: ['Complex templates', 'Content discovery', 'Relationship exploration']
  }
  // Unified view will be implemented later
];

export type TemplateType = 'phase' | 'pov';

interface TemplateEditorProps {
  initialTemplate?: Template | POVTemplate;
  onSave?: (template: Template | POVTemplate) => void;
  readOnly?: boolean;
  initialViewMode?: ViewMode;
  isSaving?: boolean;
  templateType?: TemplateType;
}

/**
 * Template editor component with multiple view modes
 */
export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  initialTemplate,
  onSave,
  readOnly = false,
  initialViewMode = ViewMode.DEFAULT,
  isSaving = false,
  templateType: explicitTemplateType
}) => {
  // Determine the template type if not explicitly provided
  const detectedTemplateType = initialTemplate
    ? determineTemplateType(initialTemplate)
    : 'phase';
  
  // Use the explicit type if provided, otherwise use the detected type
  const templateType = explicitTemplateType || detectedTemplateType;
  
  // State to track if the template has been saved and has an ID
  const [savedTemplateId, setSavedTemplateId] = useState<string | undefined>(initialTemplate?.id);
  // For POV templates, default to 'basic-info', otherwise 'editor'
  const [activeTab, setActiveTab] = useState(templateType === 'pov' ? 'basic-info' : 'editor');
  
  // Update savedTemplateId whenever initialTemplate changes
  useEffect(() => {
    if (initialTemplate?.id) {
      setSavedTemplateId(initialTemplate.id);
    }
  }, [initialTemplate]);
  
  // Adapt the template if needed
  const adaptedTemplate = useMemo(() => {
    if (!initialTemplate) return undefined;
    
    // If it's a POV template, adapt it to the Template interface
    if (templateType === 'pov') {
      // Ensure the template has metadata with phaseTemplates initialized
      const povTemplate = initialTemplate as POVTemplate;
      if (!povTemplate.metadata) {
        povTemplate.metadata = { phaseTemplates: [] };
      } else if (!povTemplate.metadata.phaseTemplates) {
        povTemplate.metadata.phaseTemplates = [];
      }

      return adaptPOVTemplateToTemplate(povTemplate);
    }
    
    // Otherwise, it's already a Template
    return initialTemplate as Template;
  }, [initialTemplate, templateType]);
  
  
  // Create a wrapper for the onSave callback
  const handleSave = useCallback((template: Template) => {
    if (!onSave) return;
    
    // Generate a temporary ID if none exists
    // This ensures we have an ID to use for savedTemplateId
    const tempId = template.id || `temp-${Date.now()}`;
    if (!template.id) {
      template.id = tempId;
    }
    
    // If it's a POV template, adapt it back to the POVTemplate interface
    if (templateType === 'pov') {
      // Ensure metadata and phaseTemplates are initialized
      if (!template.metadata) {
        template.metadata = { phaseTemplates: [] };
      } else if (!template.metadata.phaseTemplates) {
        template.metadata.phaseTemplates = [];
      }

      const povTemplate = adaptTemplateToPOVTemplate(template);
      
      // Ensure the POV template has metadata with phaseTemplates initialized
      if (!povTemplate.metadata) {
        povTemplate.metadata = { phaseTemplates: [] };
      } else if (!povTemplate.metadata.phaseTemplates) {
        povTemplate.metadata.phaseTemplates = [];
      }

      // Call the onSave callback
      onSave(povTemplate);
      
      // Force update savedTemplateId regardless of current value
      // This ensures Phase Templates tab knows the template is saved
      setSavedTemplateId(tempId);
    } else {
      // Otherwise, it's already a Template
      onSave(template);
      
      // Force update savedTemplateId regardless of current value
      setSavedTemplateId(tempId);
    }
  }, [onSave, templateType]);
  
  // Handle downloading the ETL implementation plan
  const handleDownloadETLPlan = useCallback(() => {
    // Create a link to download the ETL implementation plan
    const link = document.createElement('a');
    link.href = '/api/docs/template-etl-plan';
    link.download = 'templateEtlImplementationPlan.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Handle import
  const handleImport = useCallback((importedTemplate: Template | POVTemplate) => {
    if (!onSave) return;
    
    // If the imported template is of a different type than the current template type,
    // we need to adapt it
    const importedType = determineTemplateType(importedTemplate);
    
    if (importedType !== templateType) {
      if (templateType === 'pov' && importedType === 'phase') {
        // Convert Phase template to POV template
        const povTemplate = adaptTemplateToPOVTemplate(importedTemplate as Template);
        onSave(povTemplate);
      } else if (templateType === 'phase' && importedType === 'pov') {
        // Convert POV template to Phase template
        const phaseTemplate = adaptPOVTemplateToTemplate(importedTemplate as POVTemplate);
        onSave(phaseTemplate);
      }
    } else {
      // Same type, no need to adapt
      onSave(importedTemplate);
    }
  }, [onSave, templateType]);

  // Determine the appropriate editor title based on template type
  const editorTitle = templateType === 'pov' ? 'POV Template Editor' : 'Phase Template Editor';

  // Determine the appropriate view modes based on template type
  // For now, we'll use the same view modes for both template types
  // In the future, we might want to customize this based on template type
  const activeViewModes = viewModes;

  // Always use DEFAULT view mode for POV templates
  const effectiveViewMode = templateType === 'pov' ? ViewMode.DEFAULT : initialViewMode;

  // Add debugging for adaptedTemplate
  useEffect(() => {
    if (adaptedTemplate) {
    }
  }, [adaptedTemplate]);
  
  return (
    <TemplateViewProvider
      initialTemplate={adaptedTemplate}
      onSave={handleSave}
      viewModes={activeViewModes}
      initialViewMode={effectiveViewMode}
      readOnly={readOnly}
    >
      <div className="space-y-4">
        {/* Add a TemplateContextSynchronizer component */}
        <TemplateContextSynchronizer />
        
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">{editorTitle}</h2>
          <SaveButtonWrapper isSaving={isSaving} />
        </div>

        {/* Only show view mode controller for Phase templates */}
        {templateType !== 'pov' && <ViewModeController onDownloadETLPlan={handleDownloadETLPlan} />}
        
        {templateType === 'pov' ? (
          <div className="mb-4">
            {/* Create a custom tab structure for POV templates */}
            <Tabs
              defaultValue="basic-info"
              className="mb-4"
              value={activeTab}
              onValueChange={setActiveTab}
            >
              <TabsList className="mb-4">
                <TabsTrigger value="basic-info">Basic Info</TabsTrigger>
                <TabsTrigger value="phase-templates">
                  <Network className="h-4 w-4 mr-2" />
                  Phase Templates
                </TabsTrigger>
                <TabsTrigger value="fields">Fields</TabsTrigger>
                <TabsTrigger value="sections">Sections</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
              </TabsList>
              
              {/* Basic Info, Fields, Sections, and Review tabs use POVTemplateBuilder */}
              <TabsContent value="basic-info" className="border rounded-lg p-4 bg-card text-card-foreground">
                <POVTemplateBuilder
                  initialData={adaptedTemplate}
                  onSave={handleSave}
                  isReadOnly={readOnly}
                  showSaveButton={false}
                  activeTab="basic-info"
                  hideTabsAndHeader={true}
                />
              </TabsContent>
              
              <TabsContent value="fields" className="border rounded-lg p-4 bg-card text-card-foreground">
                <POVTemplateBuilder
                  initialData={adaptedTemplate}
                  onSave={handleSave}
                  isReadOnly={readOnly}
                  showSaveButton={false}
                  activeTab="fields"
                  hideTabsAndHeader={true}
                />
              </TabsContent>
              
              <TabsContent value="sections" className="border rounded-lg p-4 bg-card text-card-foreground">
                <POVTemplateBuilder
                  initialData={adaptedTemplate}
                  onSave={handleSave}
                  isReadOnly={readOnly}
                  showSaveButton={false}
                  activeTab="sections"
                  hideTabsAndHeader={true}
                />
              </TabsContent>
              
              <TabsContent value="review" className="border rounded-lg p-4 bg-card text-card-foreground">
                <POVTemplateBuilder
                  initialData={adaptedTemplate}
                  onSave={handleSave}
                  isReadOnly={readOnly}
                  showSaveButton={false}
                  activeTab="review"
                  hideTabsAndHeader={true}
                />
              </TabsContent>
              
              {/* Phase Templates Tab */}
              <TabsContent value="phase-templates" className="border rounded-lg p-4 bg-card text-card-foreground">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Phase Templates</h3>
                  
                  {/* Use either savedTemplateId or initialTemplate.id if available */}
                  {(savedTemplateId || initialTemplate?.id) ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">
                        Manage which Phase templates are associated with this POV template.
                        These associations determine which phases will be available when creating POVs from this template.
                      </p>
                      <div key={`template-relationship-${savedTemplateId || initialTemplate?.id}-${activeTab === 'phase-templates'}`}>
                        <TemplateRelationshipManagerWrapper
                          povTemplateId={savedTemplateId || initialTemplate?.id}
                          readOnly={readOnly}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="border rounded-md p-6 bg-muted text-muted-foreground text-center">
                      <Network className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h4 className="text-lg font-medium mb-2">Save Template First</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        You need to save the template before you can manage phase relationships.
                      </p>
                      <Button
                        onClick={() => setActiveTab('basic-info')}
                        variant="outline"
                        className="mx-auto"
                      >
                        Return to Basic Info
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="border rounded-lg p-4 bg-card text-card-foreground mb-4">
            <ViewModeRenderer />
          </div>
        )}
        
        {/* Import/Export field removed as requested */}
      </div>
    </TemplateViewProvider>
  );
};

/**
 * Save button component
 */
interface SaveButtonProps {
  isSaving?: boolean;
  onSaveClick?: () => void;
  isNewTemplate?: boolean;
}

const SaveButton: React.FC<SaveButtonProps> = ({
  isSaving = false,
  onSaveClick,
  isNewTemplate = false
}) => {
  const [isInternalSaving, setIsInternalSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const effectiveSaving = isSaving || isInternalSaving;
  
  // Get the current active tab from the TemplateEditor
  const tabsElement = document.querySelector('[role="tablist"]');
  const activeTab = tabsElement?.querySelector('[data-state="active"]')?.getAttribute('value');
  
  // Reset success state when active tab changes
  useEffect(() => {
    if (showSuccess) {
      setShowSuccess(false);
    }
  }, [activeTab, showSuccess]);
  
  const handleSave = useCallback(async () => {
    setIsInternalSaving(true);
    
    try {
      // Call the parent's save handler if provided
      if (onSaveClick) {
        await onSaveClick();
        
        // Show success feedback briefly
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      } else {
        // Simulate saving if no handler provided
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch {
      // Error saving template - handled by UI state
    } finally {
      setIsInternalSaving(false);
    }
  }, [onSaveClick]);
  
  // Determine button text based on context
  const getButtonText = () => {
    if (effectiveSaving) return 'Saving...';
    if (showSuccess) return 'Saved!';
    if (isNewTemplate) return 'Create Template';
    return 'Save Changes';
  };
  
  return (
    <Button
      onClick={handleSave}
      disabled={effectiveSaving}
      variant={showSuccess ? "outline" : "default"}
      className={`min-w-[140px] transition-all duration-200 ${
        showSuccess ? "bg-success/20 text-success border-success hover:bg-success/30" : ""
      }`}
    >
      {showSuccess ? (
        <span className="flex items-center">
          <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {getButtonText()}
        </span>
      ) : (
        <span className="flex items-center">
          <Save className="h-4 w-4 mr-2" />
          {getButtonText()}
        </span>
      )}
    </Button>
  );
};

/**
 * ImportExportWrapper component
 *
 * Wraps the ImportExport component and gets the template from the context
 */
interface ImportExportWrapperProps {
  onImport: (template: Template | POVTemplate) => void;
  templateType?: TemplateType;
}

const ImportExportWrapper: React.FC<ImportExportWrapperProps> = ({ onImport, templateType = 'phase' }) => {
  const { template } = useTemplateView();
  
  return (
    <ImportExport
      template={template}
      templateType={templateType}
      onImport={onImport}
    />
  );
};

/**
 * TemplateContextSynchronizer component
 *
 * This component synchronizes the template state between the TemplateViewProvider context
 * and the POVTemplateContext. It ensures that fields added in one tab are available in other tabs.
 */
const TemplateContextSynchronizer: React.FC = () => {
  const { template, updateTemplate } = useTemplateView();
  
  // Debug the current template in the TemplateViewProvider context
  useEffect(() => {
    if (template) {
    }
  }, [template]);
  
  // This component doesn't render anything
  return null;
};

/**
 * SaveButtonWrapper component
 *
 * Wraps the SaveButton component and connects it to the TemplateViewProvider
 */
interface SaveButtonWrapperProps {
  isSaving?: boolean;
}

const SaveButtonWrapper: React.FC<SaveButtonWrapperProps> = ({ isSaving = false }) => {
  const { saveTemplate, template } = useTemplateView();
  
  // Determine if this is a new template (no ID)
  const isNewTemplate = !template?.id;
  
  const handleSave = useCallback(async () => {
    if (saveTemplate) {
      const result = await saveTemplate();
      return result;
    }
  }, [saveTemplate]);
  
  return (
    <SaveButton
      isSaving={isSaving}
      onSaveClick={handleSave}
      isNewTemplate={isNewTemplate}
    />
  );
};
