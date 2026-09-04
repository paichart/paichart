"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/Command';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Badge } from '@/components/ui/Badge';
import { Loader2, Search, Tag, Clock, Sparkles, Zap, Shield } from 'lucide-react';
import { AgentTemplateService, AgentTemplate } from '@/lib/pov/api/agent-templates-adapter';

interface AgentTemplateSelectorProps {
  onSelectTemplate: (template: AgentTemplate) => void;
}

export const AgentTemplateSelector: React.FC<AgentTemplateSelectorProps> = ({ onSelectTemplate }) => {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<AgentTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get all available tags from templates
  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    templates.forEach(template => {
      template.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [templates]);
  
  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await AgentTemplateService.getTemplates();
        
        if (response.success && response.data) {
          setTemplates(response.data);
          setFilteredTemplates(response.data);
        } else {
          setError(response.error || 'Failed to fetch templates');
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    
    if (open) {
      fetchTemplates();
    }
  }, [open]);
  
  // Filter templates based on search query and selected tags
  useEffect(() => {
    let filtered = templates;
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(template => 
        template.name.toLowerCase().includes(query) || 
        template.description.toLowerCase().includes(query) ||
        template.role.toLowerCase().includes(query)
      );
    }
    
    // Filter by selected tags
    if (selectedTags.length > 0) {
      filtered = filtered.filter(template => 
        selectedTags.every(tag => template.tags?.includes(tag))
      );
    }
    
    setFilteredTemplates(filtered);
  }, [searchQuery, selectedTags, templates]);
  
  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };
  
  // Handle template selection
  const handleSelectTemplate = (template: AgentTemplate) => {
    onSelectTemplate(template);
    setOpen(false);
  };
  
  return (
    <>
      <Button 
        variant="outline" 
        onClick={() => setOpen(true)}
        className="w-full justify-start"
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Use Template
      </Button>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Agent Templates</DialogTitle>
            <DialogDescription>
              Select a template to quickly configure your agent with predefined settings.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-wrap gap-2 my-2">
            {allTags.map(tag => (
              <Badge 
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleTag(tag)}
              >
                <Tag className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
          
          <Command className="rounded-lg border shadow-md">
            <CommandInput 
              placeholder="Search templates..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-9"
            />
            
            {isLoading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="p-6 text-center text-destructive">
                <p>{error}</p>
                <Button 
                  variant="outline" 
                  className="mt-2"
                  onClick={() => setOpen(true)} // Retry
                >
                  Retry
                </Button>
              </div>
            ) : (
              <CommandList>
                <ScrollArea className="h-[300px]">
                  {filteredTemplates.length === 0 ? (
                    <CommandEmpty>No templates found.</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {filteredTemplates.map(template => (
                        <CommandItem
                          key={template.id}
                          onSelect={() => handleSelectTemplate(template)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col w-full">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{template.name}</span>
                              <div className="flex items-center gap-1">
                                {template.isBuiltIn && (
                                  <Badge variant="secondary" className="text-xs">Built-in</Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {template.timeout}s
                                </Badge>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">{template.description}</p>
                            
                            {/* Capabilities */}
                            {template.capabilities && Object.keys(template.capabilities).length > 0 && (
                              <div className="flex items-center gap-1 mt-2">
                                <Zap className="h-3 w-3 text-green-600" />
                                <span className="text-xs text-muted-foreground">Capabilities:</span>
                                <div className="flex flex-wrap gap-1">
                                  {Object.keys(template.capabilities).slice(0, 3).map(capability => (
                                    <Badge key={capability} variant="secondary" className="text-xs bg-green-100 text-green-800">
                                      {capability}
                                    </Badge>
                                  ))}
                                  {Object.keys(template.capabilities).length > 3 && (
                                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                      +{Object.keys(template.capabilities).length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Constraints */}
                            {template.constraints && Object.keys(template.constraints).length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                <Shield className="h-3 w-3 text-orange-600" />
                                <span className="text-xs text-muted-foreground">Constraints:</span>
                                <div className="flex flex-wrap gap-1">
                                  {Object.keys(template.constraints).slice(0, 2).map(constraint => (
                                    <Badge key={constraint} variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                                      {constraint}
                                    </Badge>
                                  ))}
                                  {Object.keys(template.constraints).length > 2 && (
                                    <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                                      +{Object.keys(template.constraints).length - 2} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Tags */}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {template.tags?.map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </ScrollArea>
              </CommandList>
            )}
          </Command>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AgentTemplateSelector;
