"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTemplateEditor } from '../context/TemplateEditorContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { PlusCircle, Calendar, ChevronRight, ChevronDown, Check } from 'lucide-react';

// Phase template interface
interface PhaseTemplate {
  id: string;
  name: string;
  description: string;
  type: 'PLANNING' | 'EXECUTION' | 'REVIEW';
}

export default function PhaseTemplateSelectionSection() {
  const { state, actions } = useTemplateEditor();
  
  // Local state for phase template management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phaseTemplates, setPhaseTemplates] = useState<PhaseTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['PLANNING', 'EXECUTION', 'REVIEW']));
  const [isApplyingTemplates, setIsApplyingTemplates] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  
  // In-memory cache for phase template IDs
  const phaseTemplateCache = useRef<Record<string, string[]>>({});
  
  // Reference to track if we've already fetched templates
  const hasAttemptedFetch = useRef(false);
  
  // Get current phase template IDs from template data
  const currentPhaseTemplateIds = useMemo(() => state.data.phaseTemplateIds || [], [state.data.phaseTemplateIds]);
  
  // Fetch phase templates with retry logic - only once per component mount
  useEffect(() => {
    // Skip if we've already attempted to fetch or if we have templates in cache
    if (hasAttemptedFetch.current) {
      return;
    }
    
    // Mark that we've attempted to fetch
    hasAttemptedFetch.current = true;
    
    const fetchPhaseTemplates = async (retryCount = 0, delay = 1000) => {
      try {
        setLoading(true);
        setError(null);
        
        // First check if we have cached data
        const cacheKey = state.data.id || 'current';
        let shouldFetch = true;
        
        // Check in-memory cache first
        if (phaseTemplateCache.current[cacheKey] && phaseTemplateCache.current[cacheKey].length > 0) {
          setPhaseTemplates([]); // We'll set this later if we get data from API
          setSelectedTemplateIds(phaseTemplateCache.current[cacheKey]);
          setLoading(false);
          shouldFetch = false;
        }

        // Then check localStorage
        try {
          const cachedData = localStorage.getItem(`phaseTemplates_${cacheKey}`);
          if (cachedData) {
            const cachedIds = JSON.parse(cachedData);
            if (Array.isArray(cachedIds) && cachedIds.length > 0) {
              phaseTemplateCache.current[cacheKey] = cachedIds;
              setSelectedTemplateIds(cachedIds);
              setLoading(false);
              shouldFetch = false;
            }
          }
        } catch {
          // Could not read cached phase templates from localStorage
        }

        // If we have state.data.phaseTemplateIds, use that
        if (currentPhaseTemplateIds && Array.isArray(currentPhaseTemplateIds)) {
          setSelectedTemplateIds(currentPhaseTemplateIds);
          phaseTemplateCache.current[cacheKey] = currentPhaseTemplateIds;

          try {
            localStorage.setItem(`phaseTemplates_${cacheKey}`, JSON.stringify(currentPhaseTemplateIds));
          } catch {
            // Could not store phase template IDs in localStorage
          }

          setLoading(false);
          shouldFetch = false;
        }
        
        // If we're not showing loading state, we can fetch in the background
        if (!shouldFetch) {
          setLoading(false);
        }
        
        // Fetch from API to get the actual templates (not just IDs)
        const response = await fetch('/api/phase-templates');

        if (!response.ok) {
          // If we get a 429 Too Many Requests, retry with exponential backoff
          if (response.status === 429 && retryCount < 3) {
            const nextDelay = delay * 2;
            const waitTime = delay + Math.random() * 1000; // Add jitter

            if (loading) {
              setError(`Rate limited. Retrying in ${Math.round(waitTime / 1000)} seconds...`);
            }

            setTimeout(() => {
              fetchPhaseTemplates(retryCount + 1, nextDelay);
            }, waitTime);

            return;
          }

          // If we have cached data (i.e., we're not in loading state), don't show an error
          if (loading) {
            throw new Error(`Failed to fetch phase templates: ${response.statusText}`);
          } else {
            return;
          }
        }
        
        const data = await response.json();
        setPhaseTemplates(data);
        setError(null);
        
        // If we have selected template IDs but no templates, initialize from state
        if (selectedTemplateIds.length === 0 && currentPhaseTemplateIds && Array.isArray(currentPhaseTemplateIds)) {
          setSelectedTemplateIds(currentPhaseTemplateIds);
        }
      } catch (err) {
        // Retry on network errors
        if (err instanceof Error && err.message.includes('Failed to fetch') && retryCount < 3) {
          const nextDelay = delay * 2;
          const waitTime = delay + Math.random() * 1000; // Add jitter

          if (loading) {
            setError(`Network error. Retrying in ${Math.round(waitTime / 1000)} seconds...`);
          }

          setTimeout(() => {
            fetchPhaseTemplates(retryCount + 1, nextDelay);
          }, waitTime);

          return;
        }

        if (loading) {
          setError('Failed to load phase templates. Please try again.');
        }
      } finally {
        // Always set loading to false at the end of the operation
        setLoading(false);
      }
    };
    
    fetchPhaseTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount
  
  // Update template state when selected templates change
  useEffect(() => {
    actions.setField(['phaseTemplateIds'], selectedTemplateIds);
  }, [selectedTemplateIds, actions]);
  
  // Check for cached data when component mounts or tab becomes active
  useEffect(() => {
    const cacheKey = state.data.id || 'current';

    // First check in-memory cache
    if (phaseTemplateCache.current[cacheKey]) {
      setSelectedTemplateIds(phaseTemplateCache.current[cacheKey]);
      return;
    }

    // Then check localStorage
    try {
      const cachedData = localStorage.getItem(`phaseTemplates_${cacheKey}`);
      if (cachedData) {
        const cachedIds = JSON.parse(cachedData);
        phaseTemplateCache.current[cacheKey] = cachedIds;
        setSelectedTemplateIds(cachedIds);
      }
    } catch {
      // Could not read cached phase templates from localStorage
    }
  }, [state.data.id, state.ui.activeTab]); // React to tab changes and template ID changes
  
  // Initialize from current template data
  useEffect(() => {
    if (currentPhaseTemplateIds.length > 0 && selectedTemplateIds.length === 0) {
      setSelectedTemplateIds(currentPhaseTemplateIds);
    }
  }, [currentPhaseTemplateIds, selectedTemplateIds.length]);
  
  // Toggle phase template selection
  const toggleTemplateSelection = (templateId: string) => {
    setSelectedTemplateIds(prev => {
      // Create new array with the updated selection
      const newIds = prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId];
      
      // Update in-memory cache
      const cacheKey = state.data.id || 'current';
      phaseTemplateCache.current[cacheKey] = newIds;
      
      // Update localStorage
      try {
        localStorage.setItem(`phaseTemplates_${cacheKey}`, JSON.stringify(newIds));
      } catch {
        // Could not store phase template IDs in localStorage
      }
      
      return newIds;
    });
  };
  
  // Toggle group expansion
  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(groupId)) {
        newExpanded.delete(groupId);
      } else {
        newExpanded.add(groupId);
      }
      return newExpanded;
    });
  };
  
  // Group templates by type
  const groupedTemplates = phaseTemplates.reduce((groups, template) => {
    if (!groups[template.type]) {
      groups[template.type] = [];
    }
    groups[template.type].push(template);
    return groups;
  }, {} as Record<string, PhaseTemplate[]>);
  
  // Get selected templates
  const getSelectedTemplates = () => {
    return phaseTemplates.filter(template => selectedTemplateIds.includes(template.id));
  };
  
  // Get phase type badge color
  const getPhaseTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'PLANNING':
        return 'bg-primary/20 text-primary';
      case 'EXECUTION':
        return 'bg-warning/20 text-warning';
      case 'REVIEW':
        return 'bg-success/20 text-success';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };
  
  // Handle applying selected templates
  const handleApplyTemplates = async () => {
    if (selectedTemplateIds.length === 0) {
      return;
    }
    
    setIsApplyingTemplates(true);
    setApplySuccess(false);
    
    try {
      // The selectedTemplateIds are already updated in the template editor state
      // by the useEffect hook that watches local selectedTemplateIds.
      // This button now primarily serves as a user confirmation step.
      // The phase template IDs will be stored in the POV template schema.

      // Mark template as dirty to indicate changes
      actions.markDirty(['phaseTemplateIds']);

      setApplySuccess(true); // Indicate confirmation of selection
      setTimeout(() => setApplySuccess(false), 3000); // Reset after a delay

    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setIsApplyingTemplates(false);
    }
  };
  
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Phase Templates</CardTitle>
          <CardDescription>
            Select phase templates to include when POVs are created from this template
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-12">
          <Spinner size="lg" />
          <span className="ml-2">Loading phase templates...</span>
        </CardContent>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Phase Templates</CardTitle>
          <CardDescription>
            Select phase templates to include when POVs are created from this template
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button 
            className="mt-4" 
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Phase Templates</CardTitle>
            <CardDescription>
              Select phase templates to include when POVs are created from this template
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="px-2 py-1">
              {selectedTemplateIds.length} Selected
            </Badge>
            {selectedTemplateIds.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleApplyTemplates}
                disabled={isApplyingTemplates}
              >
                {isApplyingTemplates ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Applying...
                  </>
                ) : applySuccess ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Applied
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Apply Templates
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Selected Templates */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Selected Templates</h3>
          
          {selectedTemplateIds.length > 0 ? (
            <div className="space-y-2">
              {getSelectedTemplates().map(template => (
                <div 
                  key={template.id} 
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div>
                    <div className="font-medium flex items-center">
                      {template.name}
                      <Badge className={`ml-2 ${getPhaseTypeBadgeColor(template.type)}`}>
                        {template.type}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {template.description}
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => toggleTemplateSelection(template.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 border rounded-md bg-muted/20">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Templates Selected</h3>
              <p className="text-sm text-muted-foreground">
                Select templates from the list below
              </p>
            </div>
          )}
        </div>
        
        {/* Available Templates */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Available Templates</h3>
          
          {Object.keys(groupedTemplates).length > 0 ? (
            <div className="space-y-4">
              {['PLANNING', 'EXECUTION', 'REVIEW'].map(type => {
                if (!groupedTemplates[type] || groupedTemplates[type].length === 0) {
                  return null;
                }
                
                return (
                  <div key={type} className="border rounded-md overflow-hidden">
                    <div 
                      className="bg-muted/30 p-4 flex items-center justify-between cursor-pointer"
                      onClick={() => toggleGroupExpansion(type)}
                    >
                      <div className="flex items-center">
                        {expandedGroups.has(type) ? (
                          <ChevronDown className="h-4 w-4 mr-2" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mr-2" />
                        )}
                        <h4 className="font-medium">{type} Templates</h4>
                      </div>
                      <Badge variant="outline">
                        {groupedTemplates[type].length}
                      </Badge>
                    </div>
                    
                    {expandedGroups.has(type) && (
                      <div className="p-4 space-y-2">
                        {groupedTemplates[type].map(template => (
                          <div 
                            key={template.id} 
                            className="flex items-center space-x-2 p-2 hover:bg-muted/20 rounded-md"
                          >
                            <Checkbox 
                              id={`template-${template.id}`}
                              checked={selectedTemplateIds.includes(template.id)}
                              onCheckedChange={() => toggleTemplateSelection(template.id)}
                            />
                            <div className="flex-1">
                              <label 
                                htmlFor={`template-${template.id}`}
                                className="font-medium cursor-pointer"
                              >
                                {template.name}
                              </label>
                              <p className="text-sm text-muted-foreground">
                                {template.description}
                              </p>
                            </div>
                            {selectedTemplateIds.includes(template.id) && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 border rounded-md bg-muted/20">
              <h3 className="text-lg font-medium mb-2">No Templates Available</h3>
              <p className="text-sm text-muted-foreground">
                No phase templates found in the system
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
