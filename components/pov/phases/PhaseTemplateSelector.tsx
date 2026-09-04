"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Search, Check, ArrowRight } from 'lucide-react';
import { TemplatePreview } from '@/components/admin/templates/TemplatePreview';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

interface PhaseTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  isDefault: boolean;
  stages: any[];
}

interface PhaseTemplateSelectorProps {
  povId: string;
  onTemplateSelect?: (template: PhaseTemplate) => void;
  redirectAfterSelect?: boolean;
}

/**
 * PhaseTemplateSelector Component
 * 
 * Allows users to select a phase template when creating a new phase
 */
export function PhaseTemplateSelector({ 
  povId, 
  onTemplateSelect,
  redirectAfterSelect = true
}: PhaseTemplateSelectorProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState<PhaseTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<PhaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<PhaseTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'compact' | 'detailed'>('detailed');
  
  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/phase-templates');
        
        if (!response.ok) {
          throw new Error('Failed to fetch phase templates');
        }
        
        const data = await response.json();
        setTemplates(data);
        setFilteredTemplates(data);
      } catch {
        setError('Failed to load templates. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTemplates();
  }, []);
  
  // Filter templates based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTemplates(templates);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = templates.filter(template => 
      template.name.toLowerCase().includes(query) || 
      template.description.toLowerCase().includes(query) ||
      template.type.toLowerCase().includes(query)
    );
    
    setFilteredTemplates(filtered);
  }, [searchQuery, templates]);
  
  // Handle template selection
  const handleSelectTemplate = (template: PhaseTemplate) => {
    setSelectedTemplate(template);
    
    if (onTemplateSelect) {
      onTemplateSelect(template);
    }
    
    if (redirectAfterSelect) {
      // Redirect to the new phase page with the template ID
      router.push(`/pov/${povId}/phase/new?templateId=${template.id}`);
    }
  };
  
  // Handle template preview
  const handlePreviewTemplate = (template: PhaseTemplate) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 text-red-800 rounded-md">
        <p>{error}</p>
        <Button 
          variant="outline" 
          className="mt-2"
          onClick={() => window.location.reload()}
        >
          Try Again
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search templates..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      
      {filteredTemplates.length === 0 ? (
        <div className="text-center p-8 border rounded-lg bg-muted">
          <p className="text-muted-foreground">No templates found matching your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(template => (
            <Card 
              key={template.id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleSelectTemplate(template)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex justify-between items-center">
                  <span>{template.name}</span>
                  {template.isDefault && (
                    <Badge variant="success">Default</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{template.description}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="outline">{template.type}</Badge>
                  <Badge variant="outline">{template.stages?.length || 0} stages</Badge>
                </div>
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewTemplate(template);
                    }}
                  >
                    Preview
                  </Button>
                  <Button size="sm">
                    Select <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>

          <div className="mb-4 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedTemplate?.name}
            </div>
            <div className="flex space-x-2">
              <Button
                variant={previewMode === 'compact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewMode('compact')}
              >
                Compact
              </Button>
              <Button
                variant={previewMode === 'detailed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewMode('detailed')}
              >
                Detailed
              </Button>
            </div>
          </div>
          
          {selectedTemplate && (
            <TemplatePreview
              template={selectedTemplate}
              compact={previewMode === 'compact'}
            />
          )}
          
          <div className="mt-4 flex justify-end">
            <Button onClick={() => handleSelectTemplate(selectedTemplate!)}>
              Use This Template <Check className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}