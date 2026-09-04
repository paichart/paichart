"use client";

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { 
  Globe, 
  FileText, 
  Layers, 
  Users, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft,
  AlertCircle,
  Tag,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { EnhancedPromptEditor } from '@/components/poveditor/pov/components/EnhancedPromptEditor';

interface DomainPromptWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (promptData: CreatePromptData) => void;
  domains?: string[];
  categories?: string[];
  povContext?: {
    id: string;
    title: string;
    domain?: string;
  };
}

interface CreatePromptData {
  name: string;
  description: string;
  category: string;
  promptText: string;
  useCase: string;
  tags: string[];
  variables: any;
  examples: any;
  isPublic: boolean;
  status: string;
}

// Internal wizard state includes domain (used to generate tags, not sent to API)
interface WizardPromptData extends Partial<CreatePromptData> {
  domain?: string;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  validation: (data: WizardPromptData) => boolean;
}

export function DomainPromptWizard({ 
  open, 
  onOpenChange, 
  onComplete,
  domains = ['general', 'devops', 'education', 'medical', 'finance', 'legal'],
  categories = ['GENERAL', 'DEVELOPMENT', 'TESTING', 'DOCUMENTATION', 'ANALYSIS', 'AUTOMATION'],
  povContext
}: DomainPromptWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [promptData, setPromptData] = useState<WizardPromptData>({
    tags: ['mcp'],
    isPublic: true,
    status: 'ACTIVE',
    variables: {},
    examples: {}
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wizardSteps: WizardStep[] = [
    {
      id: 'domain',
      title: 'Domain Selection',
      description: 'Choose the domain category for your prompt',
      icon: <Globe className="h-5 w-5" />,
      validation: (data) => !!data.domain
    },
    {
      id: 'basic',
      title: 'Basic Information',
      description: 'Provide name, description, and category',
      icon: <FileText className="h-5 w-5" />,
      validation: (data) => !!(data.name && data.description && data.category)
    },
    {
      id: 'prompt',
      title: 'Prompt Configuration',
      description: 'Write the prompt content and use case',
      icon: <MessageSquare className="h-5 w-5" />,
      validation: (data) => !!(data.promptText && data.useCase)
    },
    {
      id: 'pov',
      title: 'POV Integration',
      description: 'Optional POV context integration',
      icon: <Layers className="h-5 w-5" />,
      validation: () => true // Optional step
    },
    {
      id: 'examples',
      title: 'Usage Examples',
      description: 'Add examples and variables (optional)',
      icon: <Sparkles className="h-5 w-5" />,
      validation: () => true // Optional step
    },
    {
      id: 'access',
      title: 'Access Control',
      description: 'Configure access and visibility',
      icon: <Users className="h-5 w-5" />,
      validation: () => true // Optional step
    }
  ];

  const updatePromptData = useCallback((updates: Partial<WizardPromptData>) => {
    setPromptData(prev => ({ ...prev, ...updates }));
  }, []);

  const canProceed = () => {
    return wizardSteps[currentStep].validation(promptData);
  };

  const handleNext = () => {
    if (canProceed() && currentStep < wizardSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (!canProceed()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Add domain tag if not already present (ensure lowercase for validation)
      const domainTag = `domain:${(promptData.domain || '').toLowerCase()}`;
      const updatedTags = [...new Set([...(promptData.tags || []), domainTag])].map(tag => tag.toLowerCase());

      // Remove domain field - it's not in the schema, only stored as tag
      const finalData = {
        name: promptData.name!,
        description: promptData.description!,
        category: promptData.category!,
        // domain field removed - stored in tags instead
        promptText: promptData.promptText || 'Placeholder prompt text (minimum 10 chars)',
        useCase: promptData.useCase!,
        tags: updatedTags,
        variables: promptData.variables || {},
        examples: promptData.examples || {},
        isPublic: promptData.isPublic ?? true,
        status: promptData.status || 'ACTIVE'
      };

      // Call onComplete but DON'T close wizard yet
      // Parent will close on success, keep open on error
      onComplete(finalData);

      // Don't close or reset here - let parent handle success/error
      // On success: parent calls onOpenChange(false)
      // On error: parent shows error, wizard stays open with data intact
    } catch {
      setError('Failed to prepare prompt data. Please check your inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (wizardSteps[currentStep].id) {
      case 'domain':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Domain Category</label>
              <Select value={promptData.domain} onValueChange={(value) => updatePromptData({ domain: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a domain category" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map((domain) => (
                    <SelectItem key={domain} value={domain}>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        {domain.charAt(0).toUpperCase() + domain.slice(1)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {promptData.domain && (
              <Alert>
                <Globe className="h-4 w-4" />
                <AlertDescription>
                  Domain <strong>{promptData.domain}</strong> selected. This will help users discover your prompt through domain-specific searches.
                </AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Prompt Name *</label>
              <Input
                value={promptData.name || ''}
                onChange={(e) => updatePromptData({ name: e.target.value })}
                placeholder="e.g., Firewall Configuration Assistant"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Description *</label>
              <Textarea
                value={promptData.description || ''}
                onChange={(e) => updatePromptData({ description: e.target.value })}
                placeholder="Brief description of what this prompt does..."
                rows={3}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Category *</label>
              <Select value={promptData.category} onValueChange={(value) => updatePromptData({ category: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'prompt':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Use Case *</label>
              <Textarea
                value={promptData.useCase || ''}
                onChange={(e) => updatePromptData({ useCase: e.target.value.slice(0, 2000) })}
                placeholder="Describe when and how this prompt should be used, what inputs are needed, and expected outcomes..."
                rows={4}
                maxLength={2000}
              />
              <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                <span>First 200 chars shown in MCP list views</span>
                <span className={(promptData.useCase?.length || 0) > 1500 ? 'text-yellow-500' : ''}>
                  {(promptData.useCase?.length || 0)}/2000
                </span>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Prompt Content *</label>
              <EnhancedPromptEditor
                value={promptData.promptText || ''}
                onChange={(value) => updatePromptData({ promptText: value })}
                placeholder="Enter the prompt instructions..."
                mcpTagging={true}
                selectedTags={promptData.tags || []}
                onTagsChange={(tags) => updatePromptData({ tags })}
                availableTags={['workflow', 'configuration', 'analysis', 'automation', 'troubleshooting']}
              />
            </div>
          </div>
        );

      case 'pov':
        return (
          <div className="space-y-4">
            {povContext ? (
              <Alert>
                <Layers className="h-4 w-4" />
                <AlertDescription>
                  This prompt will be associated with POV: <strong>{povContext.title}</strong>
                  {povContext.domain && ` (${povContext.domain} domain)`}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No POV context provided. This prompt will be available globally across all POVs.
                </AlertDescription>
              </Alert>
            )}
            
            <p className="text-sm text-muted-foreground">
              POV integration allows prompts to be suggested automatically based on the current POV context. 
              This step is optional and can be configured later.
            </p>
          </div>
        );

      case 'examples':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Variables (JSON)</label>
              <Textarea
                value={typeof promptData.variables === 'string' ? promptData.variables : JSON.stringify(promptData.variables || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    updatePromptData({ variables: parsed });
                  } catch {
                    updatePromptData({ variables: e.target.value });
                  }
                }}
                placeholder='{"variable1": "description", "variable2": "description"}'
                rows={4}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Examples (JSON)</label>
              <Textarea
                value={typeof promptData.examples === 'string' ? promptData.examples : JSON.stringify(promptData.examples || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    updatePromptData({ examples: parsed });
                  } catch {
                    updatePromptData({ examples: e.target.value });
                  }
                }}
                placeholder='{"example1": "input/output pair", "example2": "input/output pair"}'
                rows={4}
              />
            </div>
          </div>
        );

      case 'access':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Public Access</label>
                <p className="text-xs text-muted-foreground">Allow all users to discover and use this prompt</p>
              </div>
              <Button
                variant={promptData.isPublic ? 'default' : 'outline'}
                size="sm"
                onClick={() => updatePromptData({ isPublic: !promptData.isPublic })}
              >
                {promptData.isPublic ? 'Public' : 'Private'}
              </Button>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={promptData.status} onValueChange={(value) => updatePromptData({ status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Final Tags</label>
              <div className="flex flex-wrap gap-2">
                {promptData.tags?.map((tag) => (
                  <Badge key={tag} variant={tag === 'mcp' ? 'default' : 'secondary'}>
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Create Domain-Specific Prompt
          </DialogTitle>
          <DialogDescription>
            Step-by-step wizard to create a new prompt for the MCP system
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-6">
          {wizardSteps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                index <= currentStep 
                  ? 'bg-primary border-primary text-primary-foreground' 
                  : 'border-muted-foreground/30'
              }`}>
                {index < currentStep ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  step.icon
                )}
              </div>
              {index < wizardSteps.length - 1 && (
                <div className={`w-12 h-0.5 mx-2 ${
                  index < currentStep ? 'bg-primary' : 'bg-muted-foreground/30'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Current Step */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {wizardSteps[currentStep].icon}
              {wizardSteps[currentStep].title}
            </CardTitle>
            <CardDescription>
              {wizardSteps[currentStep].description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            
            {currentStep === wizardSteps.length - 1 ? (
              <Button 
                onClick={handleComplete}
                disabled={!canProceed() || isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Prompt'}
              </Button>
            ) : (
              <Button 
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DomainPromptWizard;