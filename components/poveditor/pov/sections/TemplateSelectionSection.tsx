"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { 
  Search, 
  FileText, 
  ArrowRight, 
  Grid3X3, 
  List, 
  Star, 
  Clock, 
  User,
  Tag,
  Eye,
  Calendar,
  Filter,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { POVTemplate } from '@/lib/pov/templates/types';

type ViewMode = 'grid' | 'list';
type SortOption = 'name' | 'created' | 'updated' | 'fields' | 'popularity';
type SortDirection = 'asc' | 'desc';

export default function TemplateSelectionSection() {
  const router = useRouter();
  const [templates, setTemplates] = useState<POVTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<POVTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<POVTemplate | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<POVTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/pov-templates');
        if (!response.ok) {
          throw new Error('Failed to fetch templates');
        }
        
        const data = await response.json();
        // Handle wrapped response from API
        const templatesArray = Array.isArray(data) ? data : (data.templates || []);
        setTemplates(templatesArray);
        setFilteredTemplates(templatesArray);
      } catch {
        // Could not fetch templates
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTemplates();
  }, []);
  
  // Load favorites from localStorage
  useEffect(() => {
    const savedFavorites = localStorage.getItem('pov-template-favorites');
    if (savedFavorites) {
      setFavorites(new Set(JSON.parse(savedFavorites)));
    }
  }, []);
  
  // Filter and sort templates
  useEffect(() => {
    let filtered = [...templates];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(template => 
        template.name.toLowerCase().includes(query) || 
        (template.description && template.description.toLowerCase().includes(query)) ||
        ((template as any).tags && (template as any).tags.some((tag: string) => tag.toLowerCase().includes(query)))
      );
    }
    
    // Apply category filter
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'favorites') {
        filtered = filtered.filter(template => favorites.has(template.id));
      } else if (selectedCategory === 'recent') {
        // Filter templates created in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        filtered = filtered.filter(template => 
          (template as any).createdAt && new Date((template as any).createdAt) > thirtyDaysAgo
        );
      } else {
        // Filter by tag
        filtered = filtered.filter(template => 
          (template as any).tags && (template as any).tags.includes(selectedCategory)
        );
      }
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'created':
          aValue = new Date((a as any).createdAt || 0);
          bValue = new Date((b as any).createdAt || 0);
          break;
        case 'updated':
          aValue = new Date((a as any).updatedAt || 0);
          bValue = new Date((b as any).updatedAt || 0);
          break;
        case 'fields':
          aValue = Object.keys(a.fields || {}).length;
          bValue = Object.keys(b.fields || {}).length;
          break;
        case 'popularity':
          aValue = (a as any).usageCount || 0;
          bValue = (b as any).usageCount || 0;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    setFilteredTemplates(filtered);
  }, [searchQuery, templates, selectedCategory, favorites, sortBy, sortDirection]);
  
  // Get unique categories from templates
  const getCategories = () => {
    const categories = new Set<string>();
    // Ensure templates is an array before calling forEach
    if (Array.isArray(templates)) {
      templates.forEach(template => {
        if ((template as any).tags) {
          (template as any).tags.forEach((tag: string) => categories.add(tag));
        }
      });
    }
    return Array.from(categories).sort();
  };
  
  // Handle template selection
  const handleSelectTemplate = async (template: POVTemplate) => {
    setSelectedTemplate(template);
    setShowDialog(false);
    
    // Redirect to the template-based POV creation page with the selected template ID
    router.push(`/pov/from-template?templateId=${template.id}`);
  };
  
  // Handle template preview
  const handlePreviewTemplate = (template: POVTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewTemplate(template);
    setShowPreview(true);
  };
  
  // Toggle favorite
  const toggleFavorite = (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = new Set(favorites);
    if (newFavorites.has(templateId)) {
      newFavorites.delete(templateId);
    } else {
      newFavorites.add(templateId);
    }
    setFavorites(newFavorites);
    localStorage.setItem('pov-template-favorites', JSON.stringify(Array.from(newFavorites)));
  };
  
  // Enhanced template card component
  const TemplateCard = ({ template, compact = false }: { template: POVTemplate, compact?: boolean }) => {
    const isFavorite = favorites.has(template.id);
    const fieldCount = Object.keys(template.fields || {}).length;
    const sectionCount = template.sections?.length || 0;
    const tags = (template as any).tags || [];
    const createdAt = (template as any).createdAt;
    const usageCount = (template as any).usageCount || 0;
    
    if (viewMode === 'list' && !compact) {
      return (
        <Card 
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => handleSelectTemplate(template)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 flex-1">
                <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg truncate">{template.name}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-6 w-6"
                      onClick={(e) => toggleFavorite(template.id, e)}
                    >
                      <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mb-2">
                    {template.description || 'No description provided'}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {fieldCount} fields
                    </span>
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {sectionCount} sections
                    </span>
                    {usageCount > 0 && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {usageCount} uses
                      </span>
                    )}
                    {createdAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {tags.length > 0 && (
                  <div className="flex gap-1">
                    {tags.slice(0, 2).map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {tags.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{tags.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handlePreviewTemplate(template, e)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="default" size="sm">
                  Select <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
    
    return (
      <Card 
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => handleSelectTemplate(template)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center">
              <FileText className="h-5 w-5 mr-2 text-primary" />
              <span className="truncate">{template.name}</span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6"
              onClick={(e) => toggleFavorite(template.id, e)}
            >
              <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {template.description || 'No description provided'}
          </p>
          
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {tags.slice(0, 3).map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          )}
          
          <div className="flex justify-between items-center text-xs text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {fieldCount} fields
            </span>
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {sectionCount} sections
            </span>
            {usageCount > 0 && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {usageCount}
              </span>
            )}
          </div>
          
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => handlePreviewTemplate(template, e)}
            >
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
            <Button variant="default" size="sm" className="text-primary">
              Select <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };
  
  // Template preview component
  const TemplatePreview = ({ template }: { template: POVTemplate }) => {
    const fieldCount = Object.keys(template.fields || {}).length;
    const sectionCount = template.sections?.length || 0;
    const tags = (template as any).tags || [];
    const createdAt = (template as any).createdAt;
    const updatedAt = (template as any).updatedAt;
    
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">{template.name}</h3>
          <p className="text-muted-foreground">{template.description || 'No description provided'}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Fields:</span> {fieldCount}
          </div>
          <div>
            <span className="font-medium">Sections:</span> {sectionCount}
          </div>
          {createdAt && (
            <div>
              <span className="font-medium">Created:</span> {new Date(createdAt).toLocaleDateString()}
            </div>
          )}
          {updatedAt && (
            <div>
              <span className="font-medium">Updated:</span> {new Date(updatedAt).toLocaleDateString()}
            </div>
          )}
        </div>
        
        {tags.length > 0 && (
          <div>
            <span className="font-medium text-sm">Tags:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {template.sections && template.sections.length > 0 && (
          <div>
            <span className="font-medium text-sm">Sections:</span>
            <div className="mt-2 space-y-2">
              {template.sections.map((section, index) => (
                <div key={section.id || index} className="border rounded p-2">
                  <div className="font-medium text-sm">{section.title}</div>
                  {section.description && (
                    <div className="text-xs text-muted-foreground">{section.description}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {section.fields?.length || 0} fields
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setShowPreview(false)}>
            Close
          </Button>
          <Button onClick={() => handleSelectTemplate(template)}>
            Use This Template
          </Button>
        </div>
      </div>
    );
  };
  
  // Loading skeleton
  const TemplateSkeleton = () => (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-6 w-3/4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-5/6 mb-4" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
    </Card>
  );
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Select a Template</h2>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button>Browse All Templates</Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Select a POV Template</DialogTitle>
            </DialogHeader>
            
            {/* Enhanced Search and Filters */}
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates by name, description, or tags..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex gap-4 items-center">
                <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="flex-1">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="favorites">
                      <Star className="h-4 w-4 mr-1" />
                      Favorites
                    </TabsTrigger>
                    <TabsTrigger value="recent">
                      <Clock className="h-4 w-4 mr-1" />
                      Recent
                    </TabsTrigger>
                    <TabsTrigger value="popular">
                      <User className="h-4 w-4 mr-1" />
                      Popular
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                
                <div className="flex gap-2 items-center">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value="name">Name</option>
                    <option value="created">Created</option>
                    <option value="updated">Updated</option>
                    <option value="fields">Fields</option>
                    <option value="popularity">Popularity</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  >
                    {sortDirection === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              {/* Category Tags */}
              {getCategories().length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {getCategories().slice(0, 8).map(category => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(selectedCategory === category ? 'all' : category)}
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {category}
                    </Button>
                  ))}
                  {getCategories().length > 8 && (
                    <Badge variant="secondary" className="text-xs">
                      +{getCategories().length - 8} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
            
            <ScrollArea className="h-[50vh]">
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-1' : 'space-y-2 p-1'}>
                {isLoading ? (
                  Array(6).fill(0).map((_, i) => <TemplateSkeleton key={i} />)
                ) : filteredTemplates.length === 0 ? (
                  <div className={`${viewMode === 'grid' ? 'col-span-full' : ''} text-center py-8 text-muted-foreground`}>
                    {searchQuery || selectedCategory !== 'all' ? (
                      <div>
                        <p>No templates found matching your criteria</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            setSearchQuery('');
                            setSelectedCategory('all');
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    ) : (
                      'No templates available. Create a template first.'
                    )}
                  </div>
                ) : (
                  Array.isArray(filteredTemplates) ? filteredTemplates.map(template => (
                    <TemplateCard key={template.id} template={template} />
                  )) : []
                )}
              </div>
            </ScrollArea>
            
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {filteredTemplates.length} of {templates.length} templates
              </div>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        
        {/* Template Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Template Preview</DialogTitle>
            </DialogHeader>
            {previewTemplate && <TemplatePreview template={previewTemplate} />}
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => <TemplateSkeleton key={i} />)
        ) : templates.length === 0 ? (
          <div className="col-span-3 text-center py-8 text-muted-foreground">
            No templates available. Create a template first.
          </div>
        ) : (
          templates.slice(0, 3).map(template => (
            <TemplateCard key={template.id} template={template} />
          ))
        )}
      </div>
      
      {templates.length > 3 && (
        <div className="text-center">
          <Button 
            variant="outline" 
            onClick={() => setShowDialog(true)}
          >
            View All Templates ({templates.length})
          </Button>
        </div>
      )}
    </div>
  );
}
