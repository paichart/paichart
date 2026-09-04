"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Loader2, Sparkles, TrendingUp, Clock, Star } from 'lucide-react';
import { AgentTemplateService, AgentTemplate } from '@/lib/pov/api/agent-templates-adapter';
import { Task } from '../context/types/EntityTypes';

interface AgentTemplateRecommendationsProps {
  task: Task;
  onSelectTemplate: (template: AgentTemplate) => void;
  onRecommendationsChange?: (recommendations: AgentTemplate[]) => void;
  onTemplateMatchChange?: (match: AgentTemplate | null) => void;
}

export const AgentTemplateRecommendations: React.FC<AgentTemplateRecommendationsProps> = ({ 
  task, 
  onSelectTemplate,
  onRecommendationsChange,
  onTemplateMatchChange
}) => {
  const [recommendations, setRecommendations] = useState<AgentTemplate[]>([]);
  const [allTemplates, setAllTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTemplateMatch, setCurrentTemplateMatch] = useState<AgentTemplate | null>(null);

  // Check if current task configuration matches any template
  const findCurrentTemplateMatch = (templates: AgentTemplate[], task: Task): AgentTemplate | null => {
    if (!task.agentRole && !task.prompt) {
      return null; // No configuration to match
    }

    return templates.find(template => {
      // Check role match (normalize for comparison)
      const taskRole = task.agentRole?.toLowerCase().replace(/[_\s-]/g, '');
      const templateRole = template.role.toLowerCase().replace(/[_\s-]/g, '');
      
      // Check if roles match (allowing for variations like "qa_test_engineer" vs "QA Engineer")
      const roleMatch = taskRole === templateRole || 
                       taskRole?.includes(templateRole) || 
                       templateRole?.includes(taskRole || '');

      // Check prompt similarity (basic check for now)
      const promptMatch = task.prompt && template.prompt && 
                         task.prompt.toLowerCase().includes(template.prompt.toLowerCase().substring(0, 50));

      // Consider it a match if role matches strongly or both role and prompt have some similarity
      return roleMatch || (taskRole && templateRole && promptMatch);
    }) || null;
  };

  // Fetch recommendations based on task context
  useEffect(() => {
    const fetchRecommendations = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Get all templates and filter/sort them based on task context
        const response = await AgentTemplateService.getTemplates();
        
        if (response.success && response.data) {
          // Store all templates for dropdown
          setAllTemplates(response.data);
          
          // Check for current template match
          const templateMatch = findCurrentTemplateMatch(response.data, task);
          setCurrentTemplateMatch(templateMatch);
          
          // Notify parent of template match change
          if (onTemplateMatchChange) {
            onTemplateMatchChange(templateMatch);
          }
          
          // Simple recommendation logic based on task type and priority
          const scored = response.data.map(template => ({
            template,
            score: calculateRecommendationScore(template, task)
          }));

          // Sort by score and take top 3
          const topRecommendations = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(item => item.template);

          setRecommendations(topRecommendations);
          
          // Notify parent of recommendations change
          if (onRecommendationsChange) {
            onRecommendationsChange(topRecommendations);
          }
        } else {
          setError(response.error || 'Failed to fetch recommendations');
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    if (task) {
      fetchRecommendations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  // Handle template selection from dropdown
  const handleApplyTemplate = () => {
    if (selectedTemplate) {
      const template = allTemplates.find(t => t.id === selectedTemplate);
      if (template) {
        onSelectTemplate(template);
        setSelectedTemplate(''); // Reset selection
      }
    }
  };

  // Simple scoring algorithm for recommendations
  const calculateRecommendationScore = (template: AgentTemplate, task: Task): number => {
    let score = 0;

    // Base score for built-in templates
    if (template.isBuiltIn) {
      score += 10;
    }

    // Score based on task type matching
    if (task.type) {
      const taskType = task.type.toLowerCase();
      const templateRole = template.role.toLowerCase();
      
      if (taskType.includes('code') || taskType.includes('development')) {
        if (templateRole.includes('developer') || templateRole.includes('code')) {
          score += 20;
        }
      }
      
      if (taskType.includes('test') || taskType.includes('qa')) {
        if (templateRole.includes('qa') || templateRole.includes('test')) {
          score += 20;
        }
      }
      
      if (taskType.includes('document') || taskType.includes('write')) {
        if (templateRole.includes('writer') || templateRole.includes('document')) {
          score += 20;
        }
      }
    }

    // Score based on task priority
    if (task.priority) {
      if (task.priority === 'HIGH') {
        // Prefer templates with shorter timeouts for high priority tasks
        if (template.timeout && template.timeout <= 60) {
          score += 10;
        }
      }
    }

    // Score based on tags matching task context
    if (template.tags) {
      const taskTitle = task.title?.toLowerCase() || '';
      const taskDescription = task.description?.toLowerCase() || '';
      
      template.tags.forEach(tag => {
        if (taskTitle.includes(tag.toLowerCase()) || taskDescription.includes(tag.toLowerCase())) {
          score += 5;
        }
      });
    }

    return score;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recommended Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Finding recommendations...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recommended Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Recommended Templates
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Current Template Status */}
        {(task.agentRole || task.prompt) && (
          <div className="mb-4 p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Current Configuration:</Label>
                {currentTemplateMatch ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      <Star className="h-3 w-3 mr-1" />
                      Matches: {currentTemplateMatch.name}
                    </Badge>
                    {currentTemplateMatch.isBuiltIn && (
                      <Badge variant="secondary" className="text-xs">Built-in</Badge>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      Custom Configuration
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Role: {task.agentRole || 'Not set'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Template Dropdown Selector */}
        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
          <Label className="text-sm font-medium">All Templates:</Label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select template..." />
            </SelectTrigger>
            <SelectContent>
              {allTemplates.map(template => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                  {template.isBuiltIn && (
                    <Badge variant="secondary" className="ml-2 text-xs">Built-in</Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleApplyTemplate} 
            disabled={!selectedTemplate}
            size="sm"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Apply
          </Button>
        </div>

        {/* Smart Recommendations */}
        <div className="space-y-3">
          {recommendations.map((template, index) => (
            <div
              key={template.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{template.name}</span>
                  {index === 0 && (
                    <Badge variant="default" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      Top Pick
                    </Badge>
                  )}
                  {template.isBuiltIn && (
                    <Badge variant="secondary" className="text-xs">Built-in</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{template.description}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {template.timeout}s
                  </Badge>
                  {template.tags?.slice(0, 2).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectTemplate(template)}
                className="ml-4"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Use
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AgentTemplateRecommendations;
