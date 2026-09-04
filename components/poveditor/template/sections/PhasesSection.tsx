"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/Accordion';
import { AlertCircle, Info, Plus, Trash2 } from 'lucide-react';
import { useEditorContext } from '../../pov/context';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { PhaseType } from '@prisma/client';

interface PhaseTemplate {
  id: string;
  name: string;
  description: string | null;
  type: PhaseType;
  isDefault: boolean;
  workflow: any;
  createdAt: string;
  updatedAt: string;
}

export default function PhasesSection() {
  const { state, updateField } = useEditorContext();
  const selectedTemplateIds = state.data.phaseTemplateIds || [];
  
  const [availableTemplates, setAvailableTemplates] = useState<PhaseTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch available phase templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch('/api/phase-templates');
        if (!response.ok) {
          throw new Error('Failed to fetch phase templates');
        }
        
        const data = await response.json();
        setAvailableTemplates(data);
      } catch {
        setError('Failed to load phase templates. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTemplates();
  }, []);
  
  // Toggle template selection
  const toggleTemplateSelection = (templateId: string) => {
    const isSelected = selectedTemplateIds.includes(templateId);
    let updatedIds: string[];
    
    if (isSelected) {
      // Remove template ID
      updatedIds = selectedTemplateIds.filter(id => id !== templateId);
    } else {
      // Add template ID
      updatedIds = [...selectedTemplateIds, templateId];
    }
    
    updateField(['data', 'phaseTemplateIds'], updatedIds);
  };
  
  // Render loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  // Render empty state
  if (availableTemplates.length === 0) {
    return (
      <div className="text-center p-8 border border-border rounded-lg bg-muted/50">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-foreground">No phase templates available</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Phase templates need to be created by an administrator
        </p>
      </div>
    );
  }
  
  // Group templates by type
  const templatesByType = availableTemplates.reduce((acc, template) => {
    if (!acc[template.type]) {
      acc[template.type] = [];
    }
    acc[template.type].push(template);
    return acc;
  }, {} as Record<PhaseType, PhaseTemplate[]>);
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-foreground">Phase Templates</h2>
        <Badge variant="outline">
          {selectedTemplateIds.length} selected
        </Badge>
      </div>
      
      {selectedTemplateIds.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Select phase templates to include in your POV template. These will be used to create phases when a POV is created from this template.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="space-y-4">
        {Object.entries(templatesByType).map(([type, templates]) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="text-base">{type} Phases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {templates.map(template => (
                  <div 
                    key={template.id} 
                    className="flex items-start space-x-2 p-2 rounded hover:bg-muted/50"
                  >
                    <Checkbox 
                      id={`template-${template.id}`}
                      checked={selectedTemplateIds.includes(template.id)}
                      onCheckedChange={() => toggleTemplateSelection(template.id)}
                    />
                    <div className="flex-1">
                      <label 
                        htmlFor={`template-${template.id}`}
                        className="font-medium cursor-pointer text-foreground"
                      >
                        {template.name}
                      </label>
                      {template.description && (
                        <p className="text-sm text-muted-foreground">
                          {template.description}
                        </p>
                      )}
                      {template.isDefault && (
                        <Badge variant="outline" className="mt-1">Default</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {selectedTemplateIds.length > 0 && (
        <div className="mt-6">
          <h3 className="text-base font-medium text-foreground mb-2">Selected Templates</h3>
          <Accordion type="multiple" className="w-full">
            {selectedTemplateIds.map(id => {
              const template = availableTemplates.find(t => t.id === id);
              if (!template) return null;
              
              return (
                <AccordionItem key={id} value={id}>
                  <AccordionTrigger className="hover:bg-muted/50 px-4 rounded-md">
                    <div className="flex items-center space-x-2 text-left">
                      <Badge variant="outline">{template.type}</Badge>
                      <span className="font-medium text-foreground">{template.name}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {template.description && (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      )}
                      
                      <div className="flex justify-end space-x-2 mt-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleTemplateSelection(id)}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
    </div>
  );
}
