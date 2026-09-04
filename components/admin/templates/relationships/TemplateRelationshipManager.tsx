"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTemplateContext } from '../context/TemplateContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';

interface TemplateRelationship {
  povTemplateId: string;
  phaseTemplateId: string;
}

interface TemplateRelationshipManagerProps {
  povTemplateId?: string;
  readOnly?: boolean;
}

/**
 * TemplateRelationshipManager - Manages relationships between templates
 *
 * This component allows users to assign phase templates to POV templates.
 */
export function TemplateRelationshipManager({ povTemplateId, readOnly = false }: TemplateRelationshipManagerProps) {
  const { phaseTemplates, povTemplates, loadingPhaseTemplates, loadingPOVTemplates, showToast } = useTemplateContext();
  
  // Store relationships as phase template IDs associated with the selected POV template
  const [phaseTemplateIds, setPhaseTemplateIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Client-side cache for phase template IDs
  // This helps maintain state even when API calls fail
  const phaseTemplateCache = useRef<Record<string, string[]>>({});
  
  // Selected template state - use the provided povTemplateId if available
  const [selectedPOVTemplate, setSelectedPOVTemplate] = useState<string | null>(povTemplateId || null);
  
  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newPhaseTemplateId, setNewPhaseTemplateId] = useState<string>('');
  
  // Fetch phase templates for a POV template - improved version that always gets fresh data
  const fetchPhaseTemplates = useCallback(async (povId: string) => {
    if (!povId) return;
    
    try {
      setLoading(true);
      setError(null);

      // First try to fetch the full template to check both locations for phase templates
      let phaseTemplateIds: string[] = [];
      let fetchedFromAPI = false;

      try {
        // Fetch the full template first to check both locations
        const templateResponse = await fetch(`/api/pov-templates/${povId}`);

        if (templateResponse.ok) {
          const template = await templateResponse.json();

          // Check top-level metadata first
          if (template.metadata && Array.isArray(template.metadata.phaseTemplates)) {
            phaseTemplateIds = [...template.metadata.phaseTemplates];
            fetchedFromAPI = true;
          }

          // Check schema.metadata if no phase templates found yet
          if (phaseTemplateIds.length === 0 && template.schema) {
            const schema = typeof template.schema === 'string'
              ? JSON.parse(template.schema)
              : template.schema;

            if (schema.metadata && Array.isArray(schema.metadata.phaseTemplates)) {
              phaseTemplateIds = [...schema.metadata.phaseTemplates];
              fetchedFromAPI = true;
            }
          }
        }
      } catch {
        // Error fetching full template - will try dedicated endpoint
      }

      // If we couldn't get phase templates from the full template, try the dedicated endpoint
      if (!fetchedFromAPI) {
        try {
          // Fetch phase templates from the dedicated API endpoint
          const response = await fetch(`/api/pov-templates/${povId}/phase-templates`);

          if (response.ok) {
            const phaseTemplates = await response.json();

            // Extract phase template IDs
            phaseTemplateIds = phaseTemplates.map((template: any) => template.id);
            fetchedFromAPI = true;
          } else {
            const errorData = await response.json();

            // If we couldn't fetch from API, try to use cached data as fallback
            if (phaseTemplateCache.current[povId]) {
              phaseTemplateIds = phaseTemplateCache.current[povId];
            } else {
              // Try localStorage as a last resort
              try {
                const localStorageCache = localStorage.getItem(`phaseTemplates_${povId}`);
                if (localStorageCache) {
                  const localStorageIds = JSON.parse(localStorageCache);
                  phaseTemplateIds = localStorageIds;
                }
              } catch {
                // Could not read from localStorage
              }

              if (phaseTemplateIds.length === 0) {
                throw new Error(errorData.error || 'Failed to fetch phase templates');
              }
            }
          }
        } catch (apiError) {
          // If we couldn't fetch from API, try to use cached data as fallback
          if (phaseTemplateCache.current[povId]) {
            phaseTemplateIds = phaseTemplateCache.current[povId];
          } else {
            // Try localStorage as a last resort
            try {
              const localStorageCache = localStorage.getItem(`phaseTemplates_${povId}`);
              if (localStorageCache) {
                const localStorageIds = JSON.parse(localStorageCache);
                phaseTemplateIds = localStorageIds;
              }
            } catch {
              // Could not read from localStorage
            }

            if (phaseTemplateIds.length === 0) {
              throw apiError;
            }
          }
        }
      }

      // Update state with the phase template IDs we found
      setPhaseTemplateIds(phaseTemplateIds);
      
      // Update the in-memory cache
      phaseTemplateCache.current[povId] = phaseTemplateIds;
      
    } catch {
      setError('Failed to load phase templates');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Save phase templates for a POV template with enhanced browser fix functionality
  const savePhaseTemplates = async () => {
    if (!selectedPOVTemplate) return;
    
    try {
      setSaving(true);
      setError(null);
      
      // Get the current state of phaseTemplateIds to ensure we're using the latest value
      const currentPhaseTemplateIds = [...phaseTemplateIds];

      // Update the cache immediately to ensure we have the latest data even if the API call fails
      phaseTemplateCache.current[selectedPOVTemplate] = currentPhaseTemplateIds;
      
      // Save phase templates to the API
      const response = await fetch(`/api/pov-templates/${selectedPOVTemplate}/phase-templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phaseTemplateIds: currentPhaseTemplateIds }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Try to parse as JSON if possible
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || 'Failed to save phase templates');
        } catch {
          // Not JSON, use the text
          throw new Error(errorText || 'Failed to save phase templates');
        }
      }
      
      const result = await response.json();

      // Also store in localStorage for persistence across sessions
      try {
        localStorage.setItem(`phaseTemplates_${selectedPOVTemplate}`, JSON.stringify(currentPhaseTemplateIds));
      } catch {
        // localStorage not available
      }
      
      // Refresh the phase templates to ensure we have the latest data
      fetchPhaseTemplates(selectedPOVTemplate);
      
      showToast('Phase templates saved successfully', 'success');
    } catch {
      showToast('Failed to save phase templates', 'error');
      
      // Even if the API call fails, we still have the cached data
      showToast('Your changes are cached locally and will be available when you return to this tab', 'info');
    } finally {
      setSaving(false);
    }
  };
  
  // Add phase template
  const addPhaseTemplate = async () => {
    if (!selectedPOVTemplate || !newPhaseTemplateId) {
      return;
    }
    
    // Check if phase template already exists
    if (phaseTemplateIds.includes(newPhaseTemplateId)) {
      showToast('This phase template is already associated with this POV template', 'error');
      return;
    }

    // Add new phase template ID
    const updatedIds = [...phaseTemplateIds, newPhaseTemplateId];
    setPhaseTemplateIds(updatedIds);
    
    // Close dialog
    setShowAddDialog(false);
    setNewPhaseTemplateId('');
    
    showToast('Phase template added', 'success');
    
    // Wait for state update to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Save the changes with the updated IDs directly
    try {
      setSaving(true);
      setError(null);
      
      // Update the cache immediately to ensure we have the latest data
      phaseTemplateCache.current[selectedPOVTemplate] = updatedIds;
      
      // Also update localStorage for persistence across sessions
      try {
        localStorage.setItem(`phaseTemplates_${selectedPOVTemplate}`, JSON.stringify(updatedIds));
      } catch {
        // localStorage not available
      }
      
      // Save phase templates to the API using the updatedIds directly
      const response = await fetch(`/api/pov-templates/${selectedPOVTemplate}/phase-templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phaseTemplateIds: updatedIds }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();

        // Try to parse as JSON if possible
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || 'Failed to save phase templates');
        } catch {
          // Not JSON, use the text
          throw new Error(errorText || 'Failed to save phase templates');
        }
      }

      // Refresh the phase templates to ensure we have the latest data
      fetchPhaseTemplates(selectedPOVTemplate);

    } catch {
      showToast('Failed to save phase templates', 'error');
      
      // Even if the API call fails, we still have the cached data
      showToast('Your changes are cached locally and will be available when you return to this tab', 'info');
    } finally {
      setSaving(false);
    }
  };
  
  // Remove phase template with enhanced browser fix functionality
  const removePhaseTemplate = (phaseTemplateId: string) => {
    // Update the state
    const updatedIds = phaseTemplateIds.filter(id => id !== phaseTemplateId);
    setPhaseTemplateIds(updatedIds);
    
    // Update the cache immediately
    if (selectedPOVTemplate) {
      phaseTemplateCache.current[selectedPOVTemplate] = updatedIds;
      
      // Also update localStorage
      try {
        localStorage.setItem(`phaseTemplates_${selectedPOVTemplate}`, JSON.stringify(updatedIds));
      } catch {
        // localStorage not available
      }
    }
    
    showToast('Phase template removed', 'info');
  };
  
  // Get POV template by ID
  const getPOVTemplate = (id: string) => {
    return povTemplates.find(template => template.id === id);
  };
  
  // Get Phase template by ID
  const getPhaseTemplate = (id: string) => {
    return phaseTemplates.find(template => template.id === id);
  };
  
  // Get phase templates for the selected POV template
  const getPhaseTemplatesForPOV = () => {
    return phaseTemplateIds.map(id => getPhaseTemplate(id)).filter(Boolean);
  };
  
  // Fetch phase templates when the selected POV template changes or when the component mounts
  useEffect(() => {
    if (selectedPOVTemplate) {
      fetchPhaseTemplates(selectedPOVTemplate);
    }
  }, [selectedPOVTemplate, fetchPhaseTemplates]);
  
  // Re-fetch phase templates when the tab becomes active
  useEffect(() => {
    // Check if this component is in the active tab
    const isActive = document.querySelector('[role="tabpanel"][data-state="active"] [class*="TemplateRelationshipManager"]');

    if (isActive && selectedPOVTemplate) {
      // First check if we have cached data in localStorage
      try {
        const localStorageCache = localStorage.getItem(`phaseTemplates_${selectedPOVTemplate}`);
        if (localStorageCache) {
          const localStorageIds = JSON.parse(localStorageCache);

          // Update the in-memory cache and state immediately for a faster response
          phaseTemplateCache.current[selectedPOVTemplate] = localStorageIds;
          setPhaseTemplateIds(localStorageIds);
        }
      } catch {
        // localStorage not available
      }

      // Then fetch from the API to ensure we have the latest data
      fetchPhaseTemplates(selectedPOVTemplate);
    }
  }, [selectedPOVTemplate, fetchPhaseTemplates]);
  
  if (loading && !phaseTemplateIds.length) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {povTemplateId ? 'Phase Templates' : 'Template Relationships'}
        </CardTitle>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => selectedPOVTemplate && fetchPhaseTemplates(selectedPOVTemplate)} 
            disabled={loading || !selectedPOVTemplate}
            title="Refresh phase templates from API"
          >
            {loading ? <Spinner size="sm" className="mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          {!readOnly && (
            <Button onClick={savePhaseTemplates} disabled={saving}>
              {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-4">
            {error}
          </div>
        )}
        
        {/* POV Template selector - only show if no povTemplateId is provided */}
        {!povTemplateId && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select POV Template</label>
            <Select
              value={selectedPOVTemplate || ''}
              onValueChange={setSelectedPOVTemplate}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a POV template" />
              </SelectTrigger>
              <SelectContent>
                {povTemplates.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        {/* Relationships list */}
        {selectedPOVTemplate ? (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">
                Phase Templates for {getPOVTemplate(selectedPOVTemplate)?.name}
              </h3>
              {!readOnly && (
                <Button
                  size="sm"
                  onClick={() => setShowAddDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Phase Template
                </Button>
              )}
            </div>
            
            {getPhaseTemplatesForPOV().length === 0 ? (
              <div className="text-center p-8 border rounded-md">
                <p className="text-gray-500">No phase templates assigned to this POV template</p>
                {!readOnly && (
                  <Button
                    className="mt-4"
                    onClick={() => setShowAddDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Phase Template
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {getPhaseTemplatesForPOV().map(phaseTemplate => {
                  if (!phaseTemplate) return null;
                  
                  return (
                    <div
                      key={phaseTemplate.id}
                      className="flex justify-between items-center p-4 border rounded-md"
                    >
                      <div>
                        <h4 className="font-medium">{phaseTemplate.name}</h4>
                        <p className="text-sm text-gray-500">{phaseTemplate.description}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline">
                          {phaseTemplate.type}
                        </Badge>
                        {!readOnly && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-500"
                            onClick={() => removePhaseTemplate(phaseTemplate.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-8 border rounded-md">
            <p className="text-gray-500">Select a POV template to manage its relationships</p>
          </div>
        )}
        
        {/* Add relationship dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Phase Template</DialogTitle>
              <DialogDescription>
                Select a phase template to add to {getPOVTemplate(selectedPOVTemplate || '')?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <Select
                value={newPhaseTemplateId}
                onValueChange={setNewPhaseTemplateId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a phase template" />
                </SelectTrigger>
                <SelectContent>
                  {phaseTemplates
                    .filter(template => {
                      // Filter out phase templates that are already assigned to this POV template
                      return !phaseTemplateIds.includes(template.id);
                    })
                    .map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={addPhaseTemplate} disabled={!newPhaseTemplateId}>
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
