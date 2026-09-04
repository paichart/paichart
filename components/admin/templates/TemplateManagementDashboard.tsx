"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TabNavigation } from './TabNavigation';
import { POVTemplatesTab } from './POVTemplatesTab';
import { PhaseTemplatesTab } from './PhaseTemplatesTab';
import { AgentTemplatesTab } from './AgentTemplatesTab';
import { PromptLibraryTab } from './PromptLibraryTab';
import { TemplateAnalytics } from './TemplateAnalytics';
import { TemplateImportExportModal } from './TemplateImportExportModal';
import { Plus, FileText, Layers, Upload, Download, Settings, Activity, Network } from 'lucide-react';
import { TemplateProvider, useTemplateContext } from './context/TemplateContext';
import { ToastContainer } from './Toast';
import { useRouter } from 'next/navigation';

function TemplateManagementDashboardContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'pov' | 'phase'>('phase');
  
  // Get context values
  const { 
    deepLinkParams, 
    updateDeepLinkParams, 
    toasts, 
    dismissToast,
    showToast,
    fetchPhaseTemplates,
    fetchPOVTemplates
  } = useTemplateContext();
  
  // Parse URL parameters and set active tab
  const parseUrlAndSetTab = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    
    // Set active tab based on URL parameter if it exists and is valid
    if (tabParam) {
      const validTabs = ['overview', 'pov-templates', 'phase-templates', 'agent-templates', 'prompt-library', 'analytics', 'settings'];
      if (validTabs.includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }
    
    // If template type is specified in deep link params, set the appropriate tab
    if (deepLinkParams.templateType === 'pov') {
      setActiveTab('pov-templates');
    } else if (deepLinkParams.templateType === 'phase') {
      setActiveTab('phase-templates');
    }
  }, [deepLinkParams]);
  
  // Initialize tab from URL parameters
  useEffect(() => {
    parseUrlAndSetTab();
    
    // Add event listener for browser back/forward buttons
    window.addEventListener('popstate', parseUrlAndSetTab);
    
    // Clean up event listener
    return () => {
      window.removeEventListener('popstate', parseUrlAndSetTab);
    };
  }, [deepLinkParams, parseUrlAndSetTab]);

  // Clear deep link parameters from URL after initial load
  // Use a ref to track if we've already cleared the URL params
  const urlParamsClearedRef = React.useRef(false);
  
  useEffect(() => {
    // Only clear URL params once to prevent unnecessary history updates
    if (deepLinkParams && Object.keys(deepLinkParams).length > 0 && !urlParamsClearedRef.current) {
      const url = new URL(window.location.href);
      url.searchParams.delete('templateId');
      url.searchParams.delete('action');
      url.searchParams.delete('templateType');
      window.history.replaceState({}, '', url);
      
      // Mark as cleared to prevent future runs
      urlParamsClearedRef.current = true;
    }
  }, [deepLinkParams]); // Depend on deepLinkParams to ensure it runs after context is updated
  
  // Handle template refresh after import
  const handleImportComplete = () => {
    // Refresh the templates data with force refresh
    if (activeTab === 'pov-templates') {
      fetchPOVTemplates(true);
    } else if (activeTab === 'phase-templates') {
      fetchPhaseTemplates(true);
    }
    
    // Close the modal
    setImportModalOpen(false);
    
    // Show success toast
    showToast('Templates imported successfully', 'success');
  };
  
  // Handle tab change with URL update
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    
    // Update URL without full page reload
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    
    window.history.pushState({ tab }, '', url);
  };
  
  // Navigate to relationships page
  const navigateToRelationships = () => {
    router.push('/admin/templates/relationships');
  };
  
  // Mock data for analytics
  const templateUsage = [
    { templateId: '1', templateName: 'Standard POV', usageCount: 15 },
    { templateId: '2', templateName: 'Enterprise POV', usageCount: 8 },
    { templateId: '3', templateName: 'Quick Start POV', usageCount: 12 },
    { templateId: '4', templateName: 'Healthcare POV', usageCount: 5 },
  ];
  
  const templateCreation = [
    { month: 'Jan', povCount: 2, phaseCount: 3 },
    { month: 'Feb', povCount: 4, phaseCount: 6 },
    { month: 'Mar', povCount: 3, phaseCount: 5 },
    { month: 'Apr', povCount: 5, phaseCount: 8 },
  ];
  
  const templateStatus = [
    { status: 'published', count: 12 },
    { status: 'draft', count: 5 },
    { status: 'deprecated', count: 2 },
  ];
  
  const phaseTemplateUsage = [
    { templateId: '1', templateName: 'Discovery Phase', usageCount: 18 },
    { templateId: '2', templateName: 'Implementation Phase', usageCount: 14 },
    { templateId: '3', templateName: 'Evaluation Phase', usageCount: 10 },
    { templateId: '4', templateName: 'Handover Phase', usageCount: 7 },
  ];
  
  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">POV Templates</CardTitle>
                  <CardDescription>Manage POV templates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold mb-2">24</div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>12 Published</span>
                    <span>5 Draft</span>
                    <span>7 Archived</span>
                  </div>
                  <div className="text-xs text-blue-500 mt-4 text-center">
                    Use the &quot;POV Templates&quot; tab above to manage templates
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Phase Templates</CardTitle>
                  <CardDescription>Manage phase templates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold mb-2">18</div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>10 Published</span>
                    <span>6 Draft</span>
                    <span>2 Archived</span>
                  </div>
                  <div className="text-xs text-blue-500 mt-4 text-center">
                    Use the &quot;Phase Templates&quot; tab above to manage phases
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Template Usage</CardTitle>
                  <CardDescription>Template usage statistics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold mb-2">156</div>
                  <div className="text-sm text-muted-foreground mb-4">
                    POVs created from templates
                  </div>
                  <div className="text-xs text-blue-500 mt-4 text-center">
                    Use the &quot;Analytics&quot; tab above to view statistics
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-2 mr-2"></div>
                      <div className="flex-1">
                        <p className="font-medium">Enterprise POV Template published</p>
                        <p className="text-sm text-muted-foreground">2 hours ago by Admin</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 mr-2"></div>
                      <div className="flex-1">
                        <p className="font-medium">Discovery Phase Template updated</p>
                        <p className="text-sm text-muted-foreground">Yesterday by Admin</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 mr-2"></div>
                      <div className="flex-1">
                        <p className="font-medium">Healthcare POV Template created</p>
                        <p className="text-sm text-muted-foreground">2 days ago by Admin</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="w-2 h-2 rounded-full bg-red-500 mt-2 mr-2"></div>
                      <div className="flex-1">
                        <p className="font-medium">Legacy POV Template deprecated</p>
                        <p className="text-sm text-muted-foreground">3 days ago by Admin</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      variant="outline" 
                      className="h-auto py-4 flex flex-col items-center justify-center"
                      onClick={() => {
                        // Update deep link parameters for new POV template
                        updateDeepLinkParams({
                          action: 'new',
                          templateType: 'pov'
                        });
                        // Change to POV templates tab
                        handleTabChange('pov-templates');
                      }}
                    >
                      <Plus className="h-5 w-5 mb-1" />
                      <span>New POV Template</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-auto py-4 flex flex-col items-center justify-center"
                      onClick={() => {
                        // Update deep link parameters for new Phase template
                        updateDeepLinkParams({
                          action: 'new',
                          templateType: 'phase'
                        });
                        // Change to Phase templates tab
                        handleTabChange('phase-templates');
                      }}
                    >
                      <Layers className="h-5 w-5 mb-1" />
                      <span>New Phase Template</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-auto py-4 flex flex-col items-center justify-center"
                      onClick={() => {
                        setModalType('phase');
                        setImportModalOpen(true);
                      }}
                    >
                      <Upload className="h-5 w-5 mb-1" />
                      <span>Import Templates</span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="h-auto py-4 flex flex-col items-center justify-center"
                      onClick={navigateToRelationships}
                    >
                      <Network className="h-5 w-5 mb-1" />
                      <span>Manage Relationships</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
        
      case 'pov-templates':
        return <POVTemplatesTab />;
        
      case 'phase-templates':
        return <PhaseTemplatesTab />;
        
      case 'agent-templates':
        return <AgentTemplatesTab />;
        
      case 'prompt-library':
        return <PromptLibraryTab />;
        
      case 'analytics':
        return (
          <TemplateAnalytics 
            templateUsage={templateUsage}
            templateCreation={templateCreation}
            templateStatus={templateStatus}
            phaseTemplateUsage={phaseTemplateUsage}
          />
        );
        
      case 'settings':
        return (
          <div className="text-center p-8 border rounded-lg bg-gray-50">
            <Settings className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">Template settings will be implemented in the next phase.</p>
            <Button 
              className="mt-4"
              onClick={() => handleTabChange('overview')}
            >
              Return to Overview
            </Button>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Template Management</h1>
      
      <TabNavigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          // Ensure we're not in a loop by checking if the tab is already active
          if (tab !== activeTab) {
            handleTabChange(tab);
          }
        }}
      >
        {renderTabContent()}
      </TabNavigation>
      
      {/* Import Modal */}
      <TemplateImportExportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        mode="import"
        type={modalType}
        onImportComplete={handleImportComplete}
      />
      
      {/* Export Modal */}
      <TemplateImportExportModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        mode="export"
        type={modalType}
      />
      
      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// Wrap the dashboard with the TemplateProvider
export function TemplateManagementDashboard() {
  return (
    <TemplateProvider>
      <TemplateManagementDashboardContent />
    </TemplateProvider>
  );
}

export default TemplateManagementDashboard;
