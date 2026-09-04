"use client";

import React, { useState, useEffect } from 'react';
import sanitizeHtml from 'sanitize-html';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { 
  FileText, 
  Eye, 
  Edit3, 
  Copy, 
  RotateCcw, 
  AlertCircle,
  Maximize2,
  Minimize2,
  Type,
  Hash,
  Tag,
  Globe,
  Layers
} from 'lucide-react';

interface EnhancedPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  showToolbar?: boolean;
  showTemplates?: boolean;
  title?: string;
  // MCP-specific features
  mcpTagging?: boolean;
  domainSelection?: string[];
  povIntegration?: boolean;
  selectedDomain?: string;
  onDomainChange?: (domain: string) => void;
  availableTags?: string[];
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  // POV context
  povContext?: {
    id: string;
    title: string;
    domain?: string;
  };
}

export const EnhancedPromptEditor: React.FC<EnhancedPromptEditorProps> = ({
  value,
  onChange,
  placeholder = "Enter instructions for the agent...",
  className,
  readOnly = false,
  showToolbar = true,
  showTemplates = true,
  title,
  // MCP-specific props
  mcpTagging = false,
  domainSelection = [],
  povIntegration = false,
  selectedDomain,
  onDomainChange,
  availableTags = [],
  selectedTags = [],
  onTagsChange,
  povContext
}) => {
  const [activeTab, setActiveTab] = useState('editor');
  const [isExpanded, setIsExpanded] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [newTag, setNewTag] = useState('');

  // Update counts when value changes
  useEffect(() => {
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    const chars = value.length;
    setWordCount(words);
    setCharCount(chars);
  }, [value]);

  // MCP-specific helper functions
  const addTag = (tag: string) => {
    if (tag && !selectedTags.includes(tag) && onTagsChange) {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const removeTag = (tagToRemove: string) => {
    if (onTagsChange) {
      onTagsChange(selectedTags.filter(tag => tag !== tagToRemove));
    }
  };

  const handleAddNewTag = () => {
    if (newTag.trim()) {
      addTag(newTag.trim());
      setNewTag('');
    }
  };

  const toggleMcpTag = () => {
    if (selectedTags.includes('mcp')) {
      removeTag('mcp');
    } else {
      addTag('mcp');
    }
  };

  const defaultDomains = [
    'general', 'devops', 'education', 'medical', 'finance', 'legal'
  ];

  // Render markdown preview (simplified)
  const renderMarkdownPreview = (text: string) => {
    if (!text.trim()) {
      return <p className="text-muted-foreground italic">No content to preview</p>;
    }

    // Simple markdown rendering for preview
    const lines = text.split('\n');
    const rendered = lines.map((line, index) => {
      // Headers
      if (line.startsWith('# ')) {
        return <h1 key={index} className="text-2xl font-bold mb-2">{line.substring(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={index} className="text-xl font-semibold mb-2">{line.substring(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-lg font-medium mb-2">{line.substring(4)}</h3>;
      }
      
      // Lists
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={index} className="ml-4 list-disc">{line.substring(2)}</li>;
      }
      if (/^\d+\.\s/.test(line)) {
        return <li key={index} className="ml-4 list-decimal">{line.replace(/^\d+\.\s/, '')}</li>;
      }
      
      // Bold and italic (simple)
      let processedLine = line;
      processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      processedLine = processedLine.replace(/\*(.*?)\*/g, '<em>$1</em>');
      processedLine = processedLine.replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded">$1</code>');

      // Empty lines
      if (line.trim() === '') {
        return <br key={index} />;
      }

      // Sanitize to prevent XSS - only allow safe formatting tags
      const sanitizedLine = sanitizeHtml(processedLine, {
        allowedTags: ['strong', 'em', 'code'],
        allowedAttributes: {
          'code': ['class']
        }
      });

      // Regular paragraphs
      return (
        <p key={index} className="mb-2" dangerouslySetInnerHTML={{ __html: sanitizedLine }} />
      );
    });

    return <div className="prose prose-sm max-w-none">{rendered}</div>;
  };

  // Insert markdown formatting
  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = document.getElementById('prompt-editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    
    const newText = value.substring(0, start) + before + selectedText + after + value.substring(end);
    onChange(newText);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  // Quick insert templates
  const insertTemplate = (template: string) => {
    const currentValue = value.trim();
    const newValue = currentValue ? `${currentValue}\n\n${template}` : template;
    onChange(newValue);
  };

  const templates = [
    {
      name: 'Task Structure',
      content: `## Objective
[Describe the main goal]

## Requirements
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

## Deliverables
- [Deliverable 1]
- [Deliverable 2]

## Success Criteria
- [Criteria 1]
- [Criteria 2]`
    },
    {
      name: 'Analysis Framework',
      content: `## Analysis Approach
1. **Data Collection**: [Describe data sources]
2. **Analysis Method**: [Describe methodology]
3. **Validation**: [Describe validation approach]

## Key Questions
- [Question 1]
- [Question 2]
- [Question 3]

## Expected Outcomes
- [Outcome 1]
- [Outcome 2]`
    },
    {
      name: 'Step-by-Step Process',
      content: `## Process Steps

### Step 1: [Title]
[Description of step 1]

### Step 2: [Title]
[Description of step 2]

### Step 3: [Title]
[Description of step 3]

## Quality Checks
- [ ] [Check 1]
- [ ] [Check 2]
- [ ] [Check 3]`
    }
  ];

  return (
    <div className={className}>
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="editor" className="flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                Editor
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>

            {/* Editor Tab */}
            <TabsContent value="editor" className="space-y-4">
              {/* MCP Configuration Section */}
              {(mcpTagging || domainSelection.length > 0 || povIntegration) && !readOnly && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      MCP Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* POV Integration */}
                    {povIntegration && povContext && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Layers className="h-4 w-4" />
                          POV Context
                        </div>
                        <div className="p-3 border rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{povContext.title}</Badge>
                            {povContext.domain && (
                              <Badge variant="secondary">
                                <Globe className="h-3 w-3 mr-1" />
                                {povContext.domain}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            This prompt will be associated with the selected POV context.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Domain Selection */}
                    {domainSelection.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Globe className="h-4 w-4" />
                          Domain Category
                        </div>
                        <Select value={selectedDomain} onValueChange={onDomainChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select domain category" />
                          </SelectTrigger>
                          <SelectContent>
                            {(domainSelection.length > 0 ? domainSelection : defaultDomains).map((domain) => (
                              <SelectItem key={domain} value={domain}>
                                {domain.charAt(0).toUpperCase() + domain.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* MCP Tagging */}
                    {mcpTagging && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Tag className="h-4 w-4" />
                            MCP Tags
                          </div>
                          <Button
                            variant={selectedTags.includes('mcp') ? 'default' : 'outline'}
                            size="sm"
                            onClick={toggleMcpTag}
                          >
                            <Tag className="h-3 w-3 mr-1" />
                            MCP Enabled
                          </Button>
                        </div>

                        {/* Current Tags */}
                        {selectedTags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {selectedTags.map((tag) => (
                              <Badge
                                key={tag}
                                variant={tag === 'mcp' ? 'default' : 'secondary'}
                                className="cursor-pointer"
                                onClick={() => removeTag(tag)}
                              >
                                {tag}
                                <button className="ml-1 hover:text-destructive">×</button>
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Add New Tag */}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add custom tag..."
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNewTag();
                              }
                            }}
                            className="flex-1"
                          />
                          <Button variant="outline" size="sm" onClick={handleAddNewTag}>
                            Add
                          </Button>
                        </div>

                        {/* Suggested Tags */}
                        {availableTags.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-xs text-muted-foreground">Suggested tags:</span>
                            <div className="flex flex-wrap gap-1">
                              {availableTags
                                .filter(tag => !selectedTags.includes(tag))
                                .slice(0, 8)
                                .map((tag) => (
                                <Button
                                  key={tag}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addTag(tag)}
                                  className="h-auto py-1 px-2 text-xs"
                                >
                                  {tag}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {/* Formatting Toolbar - Only show if not read-only and showToolbar is true */}
              {!readOnly && showToolbar && (
                <div className="flex flex-wrap gap-2 p-2 border rounded-lg bg-muted/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('**', '**')}
                    title="Bold"
                  >
                    <strong>B</strong>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('*', '*')}
                    title="Italic"
                  >
                    <em>I</em>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('`', '`')}
                    title="Code"
                  >
                    <code>{'</>'}</code>
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('# ', '')}
                    title="Header 1"
                  >
                    H1
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('## ', '')}
                    title="Header 2"
                  >
                    H2
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('### ', '')}
                    title="Header 3"
                  >
                    H3
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('- ', '')}
                    title="Bullet List"
                  >
                    •
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('1. ', '')}
                    title="Numbered List"
                  >
                    1.
                  </Button>
                </div>
              )}

              {/* Template Quick Insert - Only show if not read-only and showTemplates is true */}
              {!readOnly && showTemplates && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Quick Templates</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange('')}
                      disabled={!value.trim()}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((template, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => insertTemplate(template.content)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        {template.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}


              {/* Main Editor */}
              <div className="space-y-2">
                <Textarea
                  id="prompt-editor"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={placeholder}
                  rows={isExpanded ? 20 : 12}
                  className="font-mono text-sm resize-none"
                  readOnly={readOnly}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{readOnly ? 'Read-only view' : 'Supports Markdown formatting'}</span>
                  <div className="flex items-center gap-4">
                    <span>{wordCount} words</span>
                    <span>{charCount} characters</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Preview Tab */}
            <TabsContent value="preview" className="space-y-4">
              <div className="border rounded-lg p-4 min-h-[300px] bg-background">
                {renderMarkdownPreview(value)}
              </div>
              
              {value.trim() && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    This is a simplified preview. The actual agent will receive the raw markdown text 
                    and may interpret it differently based on the model&apos;s capabilities.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>

          {/* Help Text */}
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {readOnly ? (
                <>
                  <strong>System Prompt Preview:</strong> This is the {charCount > 0 ? `${charCount}-character` : ''} system prompt that will be used to configure the agent&apos;s behavior and context.
                  Use the Preview tab to see the formatted version or copy the content to use elsewhere.
                </>
              ) : (
                <>
                  <strong>Prompt Guidelines:</strong> Be specific and clear about the task requirements. 
                  Use structured formatting to organize complex instructions. Include examples when helpful.
                  The agent will use this prompt as the primary instruction for task execution.
                </>
              )}
            </AlertDescription>
          </Alert>
        </div>
    </div>
  );
};

export default EnhancedPromptEditor;
